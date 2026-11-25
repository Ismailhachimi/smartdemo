import AppKit
import CoreImage

// MARK: - Settings (persisted)

final class Settings {
    static let shared = Settings()
    private let d = UserDefaults.standard

    private init() {
        d.register(defaults: [
            "fps": 60,
            "maxDim": 2560,
            "styled": false,
            "bgIndex": 0,
            "halo": false,
            "cameraEnabled": true,
            "micEnabled": true,
            "countdown": true,
            "zoomLevel": 2.0,
            "camCorner": Corner.bottomLeft.rawValue,
            "camSize": 1,
            "camShape": CamShape.circle.rawValue,
            "revealAfter": true,
            "viewfinder": true,
            "previewOpen": false,
        ])
    }

    var fps: Int { get { d.integer(forKey: "fps") } set { d.set(newValue, forKey: "fps") } }
    var maxDim: Int { get { d.integer(forKey: "maxDim") } set { d.set(newValue, forKey: "maxDim") } }
    var styled: Bool { get { d.bool(forKey: "styled") } set { d.set(newValue, forKey: "styled") } }
    var bgIndex: Int { get { d.integer(forKey: "bgIndex") } set { d.set(newValue, forKey: "bgIndex") } }
    var halo: Bool { get { d.bool(forKey: "halo") } set { d.set(newValue, forKey: "halo") } }
    var cameraEnabled: Bool { get { d.bool(forKey: "cameraEnabled") } set { d.set(newValue, forKey: "cameraEnabled") } }
    var micEnabled: Bool { get { d.bool(forKey: "micEnabled") } set { d.set(newValue, forKey: "micEnabled") } }
    var countdown: Bool { get { d.bool(forKey: "countdown") } set { d.set(newValue, forKey: "countdown") } }
    var revealAfter: Bool { get { d.bool(forKey: "revealAfter") } set { d.set(newValue, forKey: "revealAfter") } }
    var previewOpen: Bool { get { d.bool(forKey: "previewOpen") } set { d.set(newValue, forKey: "previewOpen") } }
    var viewfinder: Bool { get { d.bool(forKey: "viewfinder") } set { d.set(newValue, forKey: "viewfinder") } }
    var zoomLevel: Double { get { d.double(forKey: "zoomLevel") } set { d.set(newValue, forKey: "zoomLevel") } }
    var camCorner: Int { get { d.integer(forKey: "camCorner") } set { d.set(newValue, forKey: "camCorner") } }
    var camSize: Int { get { d.integer(forKey: "camSize") } set { d.set(newValue, forKey: "camSize") } }
    var camShape: Int { get { d.integer(forKey: "camShape") } set { d.set(newValue, forKey: "camShape") } }
    var cameraID: String? { get { d.string(forKey: "cameraID") } set { d.set(newValue, forKey: "cameraID") } }
    var micID: String? { get { d.string(forKey: "micID") } set { d.set(newValue, forKey: "micID") } }
}

// MARK: - Spring physics

struct Spring {
    var value: Double
    var target: Double
    var velocity: Double = 0
    var stiffness: Double
    var dampingRatio: Double

    init(_ v: Double, stiffness: Double = 170, dampingRatio: Double = 1) {
        value = v; target = v; self.stiffness = stiffness; self.dampingRatio = dampingRatio
    }

    mutating func step(_ dt: Double) {
        let c = 2 * dampingRatio * stiffness.squareRoot()
        var remaining = dt
        let h = 1.0 / 480.0
        while remaining > 0 {
            let s = min(h, remaining)
            let a = stiffness * (target - value) - c * velocity
            velocity += a * s
            value += velocity * s
            remaining -= s
        }
    }

    mutating func snap(_ v: Double) { value = v; target = v; velocity = 0 }
}

// MARK: - Shared types

enum Corner: Int, CaseIterable {
    case topLeft, topRight, bottomLeft, bottomRight
    var label: String {
        switch self {
        case .topLeft: return "Haut gauche"
        case .topRight: return "Haut droite"
        case .bottomLeft: return "Bas gauche"
        case .bottomRight: return "Bas droite"
        }
    }
}

enum CamShape: Int, CaseIterable {
    case circle, roundedSquare, rectangle
    var label: String {
        switch self {
        case .circle: return "Rond"
        case .roundedSquare: return "Carré arrondi"
        case .rectangle: return "Rectangle 16:9"
        }
    }
}

/// Camera frame in "output-height units": y in [0,1], x in [0, aspect]. Center based, top-left origin.
struct CamFrame: Equatable {
    var x = 0.0, y = 0.0, w = 0.0, h = 0.0, r = 0.0, a = 0.0
}

struct Ripple { var x: Double; var y: Double; var age: Double }

/// Everything the compositor needs for one frame. Cursor / zoom coordinates are normalized
/// to the captured region (0…1, top-left origin).
struct RenderState {
    var cursorVisible = false
    var cursorX = 0.5, cursorY = 0.5
    var cursorScale = 1.0
    var cursorImage: CIImage?
    var cursorPointSize = CGSize(width: 24, height: 24)
    var cursorHotspot = CGPoint.zero
    var halo = false
    var ripples: [Ripple] = []
    var spotlight = 0.0
    var zoom = 1.0
    var zoomX = 0.5, zoomY = 0.5
    var cam = CamFrame()
    var presenterDim = 0.0
}

struct SmartDemoError: LocalizedError {
    let message: String
    init(_ m: String) { message = m }
    var errorDescription: String? { message }
}

// MARK: - Geometry helpers (CG global = top-left origin, Cocoa = bottom-left origin)

enum Geo {
    static var primaryHeight: CGFloat { NSScreen.screens.first?.frame.height ?? 0 }

    static func toCocoa(_ r: CGRect) -> NSRect {
        NSRect(x: r.minX, y: primaryHeight - r.maxY, width: r.width, height: r.height)
    }

    static func toTopLeft(_ r: NSRect) -> CGRect {
        CGRect(x: r.minX, y: primaryHeight - r.maxY, width: r.width, height: r.height)
    }

    static func displayID(of screen: NSScreen) -> CGDirectDisplayID {
        (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? CGMainDisplayID()
    }

    static func screen(for id: CGDirectDisplayID) -> NSScreen? {
        NSScreen.screens.first { displayID(of: $0) == id }
    }

    static func screenWithMouse() -> NSScreen {
        let m = NSEvent.mouseLocation
        return NSScreen.screens.first { NSMouseInRect(m, $0.frame, false) } ?? NSScreen.main ?? NSScreen.screens[0]
    }

    static func display(containing p: CGPoint) -> CGDirectDisplayID {
        var id: CGDirectDisplayID = 0
        var count: UInt32 = 0
        CGGetDisplaysWithPoint(p, 1, &id, &count)
        return count > 0 ? id : CGMainDisplayID()
    }
}

func even(_ v: CGFloat) -> Int { max(2, Int(v / 2) * 2) }
func clamp<T: Comparable>(_ v: T, _ lo: T, _ hi: T) -> T { min(max(v, lo), hi) }

/// Best-quality CGImage for a cursor image (cursors carry up to 10× bitmap reps).
func cursorCGImage(_ img: NSImage) -> CGImage? {
    let reps = img.representations.compactMap { $0 as? NSBitmapImageRep }.sorted { $0.pixelsWide > $1.pixelsWide }
    if let best = reps.first(where: { $0.pixelsWide <= Int(img.size.width * 6) }) ?? reps.last, let cg = best.cgImage {
        return cg
    }
    let scale: CGFloat = 4
    let w = Int(img.size.width * scale), h = Int(img.size.height * scale)
    guard w > 0, h > 0, let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
    img.draw(in: NSRect(x: 0, y: 0, width: w, height: h))
    NSGraphicsContext.restoreGraphicsState()
    return ctx.makeImage()
}

/// Part of the captured region (normalized 0…1, top-left) currently visible in the zoomed video.
/// Mirrors the compositor's math, including the styled-frame padding.
func zoomViewport(_ s: RenderState, styled: Bool) -> CGRect? {
    guard s.zoom > 1.01 else { return nil }
    let f = styled ? 0.88 : 1.0
    let o = (1 - f) / 2
    let half = 0.5 / s.zoom
    let cx = clamp(o + f * s.zoomX, half, 1 - half)
    let cy = clamp(o + f * s.zoomY, half, 1 - half)
    func c(_ v: Double) -> Double { clamp((v - o) / f, 0, 1) }
    let x0 = c(cx - half), x1 = c(cx + half), y0 = c(cy - half), y1 = c(cy + half)
    return CGRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0)
}
