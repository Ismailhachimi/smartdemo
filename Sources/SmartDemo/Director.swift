import AppKit
import CoreImage
import QuartzCore

/// The "director" runs on the main thread at 120 Hz. It reads the mouse, applies the
/// user's live toggles (zoom, big cursor, camera layout…) and animates everything with
/// springs. The render thread just takes a snapshot each frame.
final class Director {
    static let shared = Director()

    // Region being recorded / previewed, in global top-left points.
    private(set) var region: CGRect = CGDisplayBounds(CGMainDisplayID())
    private var regionUpdater: (() -> CGRect?)?
    private var lastRegionUpdate = 0.0
    var aspect: Double { region.height > 0 ? Double(region.width / region.height) : 16.0 / 9.0 }

    // Live toggles
    var zoomManual = false
    var autoZoom = false
    var zoomLevel = Settings.shared.zoomLevel
    var bigCursor = false
    var spotlightOn = false
    var halo = Settings.shared.halo
    var cameraEnabled = Settings.shared.cameraEnabled
    var camVisible = false
    var camCorner = Corner(rawValue: Settings.shared.camCorner) ?? .bottomLeft
    var camSize = Settings.shared.camSize
    var camShape = CamShape(rawValue: Settings.shared.camShape) ?? .circle
    var presenter = false
    private var dragCenter: CGPoint?

    /// Called every tick with the camera frame + region, used by the on-screen bubble.
    var onFrame: ((RenderState, CGRect) -> Void)?

    // Springs
    private var zS = Spring(1, stiffness: 26, dampingRatio: 1)
    private var zX = Spring(0.5, stiffness: 32, dampingRatio: 1)
    private var zY = Spring(0.5, stiffness: 32, dampingRatio: 1)
    private var cX = Spring(0.5, stiffness: 1500, dampingRatio: 1)
    private var cY = Spring(0.5, stiffness: 1500, dampingRatio: 1)
    private var cScale = Spring(1, stiffness: 260, dampingRatio: 0.55)
    private var spot = Spring(0, stiffness: 90, dampingRatio: 1)
    private var camX = Spring(0, stiffness: 150, dampingRatio: 0.78)
    private var camY = Spring(0, stiffness: 150, dampingRatio: 0.78)
    private var camW = Spring(0, stiffness: 150, dampingRatio: 0.78)
    private var camH = Spring(0, stiffness: 150, dampingRatio: 0.78)
    private var camR = Spring(0, stiffness: 150, dampingRatio: 0.9)
    private var camA = Spring(0, stiffness: 140, dampingRatio: 1)
    private var dim = Spring(0, stiffness: 90, dampingRatio: 1)
    private var camInitialized = false

    private var ripples: [Ripple] = []
    private var wasPressed = false
    private var zoomEngaged = false
    private var autoZoomUntil = 0.0
    private var cursorInitialized = false

    // Cursor sprite
    private var cursorImage: CIImage?
    private var cursorPointSize = CGSize(width: 24, height: 24)
    private var cursorHotspot = CGPoint.zero
    private var lastCursorFetch = 0.0
    private var lastCursorImage: NSImage?

    private var timer: Timer?
    private var lastTime = CACurrentMediaTime()

    private let lock = NSLock()
    private var current = RenderState()

    // MARK: API

    func start() {
        let t = Timer(timeInterval: 1.0 / 120.0, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func setRegion(_ r: CGRect, updater: (() -> CGRect?)? = nil) {
        region = r
        regionUpdater = updater
    }

    func snapshot() -> RenderState {
        lock.lock(); defer { lock.unlock() }
        return current
    }

    func resetLiveEffects() {
        zoomManual = false
        autoZoom = false
        autoZoomUntil = 0
        presenter = false
        spotlightOn = false
        bigCursor = false
    }

    func cycleZoomLevel() -> Double {
        let levels = [1.5, 2.0, 2.5, 3.0]
        let idx = levels.firstIndex { $0 > zoomLevel + 0.01 } ?? 0
        zoomLevel = levels[idx]
        Settings.shared.zoomLevel = zoomLevel
        return zoomLevel
    }

    // Bubble dragging (Cocoa global coordinates of the bubble center)
    func dragCamera(toCocoaCenter p: CGPoint) {
        let r = region
        guard r.height > 0, !presenter else { return }
        let gy = Geo.primaryHeight - p.y
        dragCenter = CGPoint(x: (p.x - r.minX) / r.height, y: (gy - r.minY) / r.height)
    }

    func endDrag() {
        guard let c = dragCenter else { return }
        dragCenter = nil
        let left = Double(c.x) < aspect / 2
        let top = c.y < 0.5
        camCorner = top ? (left ? .topLeft : .topRight) : (left ? .bottomLeft : .bottomRight)
        Settings.shared.camCorner = camCorner.rawValue
    }

    // MARK: Tick

    private func tick() {
        let now = CACurrentMediaTime()
        let dt = clamp(now - lastTime, 0.001, 0.05)
        lastTime = now

        if let up = regionUpdater, now - lastRegionUpdate > 0.25 {
            lastRegionUpdate = now
            if let r = up(), r.width > 10 { region = r }
        }
        let r = region
        guard r.width > 0, r.height > 0 else { return }

        // Mouse
        let m = NSEvent.mouseLocation
        let gx = Double(m.x), gy = Double(Geo.primaryHeight - m.y)
        let nx = (gx - Double(r.minX)) / Double(r.width)
        let ny = (gy - Double(r.minY)) / Double(r.height)
        let inside = nx >= -0.01 && nx <= 1.01 && ny >= -0.01 && ny <= 1.01
        let pressed = (NSEvent.pressedMouseButtons & 0b11) != 0
        if pressed && !wasPressed && inside { handleClick(nx, ny, now) }
        wasPressed = pressed

        if !cursorInitialized || abs(nx - cX.value) > 0.3 || abs(ny - cY.value) > 0.3 {
            cX.snap(nx); cY.snap(ny); cursorInitialized = true
        }
        cX.target = nx; cY.target = ny
        cScale.target = (bigCursor ? 2.2 : 1.0) * (pressed ? 0.82 : 1.0)

        if now - lastCursorFetch > 0.1 {
            lastCursorFetch = now
            fetchCursor()
        }

        // Zoom
        let autoActive = autoZoom && now < autoZoomUntil
        let want = zoomManual || autoActive
        let zt = want ? zoomLevel : 1.0
        zS.target = zt
        if want {
            let half = 0.5 / zt
            let cnx = clamp(nx, 0, 1), cny = clamp(ny, 0, 1)
            if !zoomEngaged {
                zX.target = cnx; zY.target = cny; zoomEngaged = true
            }
            let dz = half * 0.55
            if cnx > zX.target + dz { zX.target = cnx - dz } else if cnx < zX.target - dz { zX.target = cnx + dz }
            if cny > zY.target + dz { zY.target = cny - dz } else if cny < zY.target - dz { zY.target = cny + dz }
            zX.target = clamp(zX.target, half, 1 - half)
            zY.target = clamp(zY.target, half, 1 - half)
        } else {
            zoomEngaged = false
        }

        spot.target = spotlightOn ? 1 : 0

        // Camera layout
        updateCameraTargets()
        if let d = dragCenter { camX.snap(Double(d.x)); camY.snap(Double(d.y)) }

        // Step everything
        zS.step(dt); zX.step(dt); zY.step(dt)
        cX.step(dt); cY.step(dt); cScale.step(dt); spot.step(dt)
        camX.step(dt); camY.step(dt); camW.step(dt); camH.step(dt); camR.step(dt); camA.step(dt)
        dim.step(dt)

        for i in ripples.indices { ripples[i].age += dt }
        ripples.removeAll { $0.age > 0.6 }

        let cam = CamFrame(x: camX.value, y: camY.value, w: max(0, camW.value), h: max(0, camH.value),
                           r: max(0, camR.value), a: clamp(camA.value, 0, 1))

        var st = RenderState()
        st.cursorVisible = inside
        st.cursorX = cX.value; st.cursorY = cY.value
        st.cursorScale = max(0.3, cScale.value)
        st.cursorImage = cursorImage
        st.cursorPointSize = cursorPointSize
        st.cursorHotspot = cursorHotspot
        st.halo = halo
        st.ripples = ripples
        st.spotlight = clamp(spot.value, 0, 1)
        st.zoom = max(1, zS.value)
        st.zoomX = zX.value; st.zoomY = zY.value
        st.cam = cam
        st.presenterDim = clamp(dim.value, 0, 1)

        lock.lock(); current = st; lock.unlock()
        onFrame?(st, r)
    }

    private func handleClick(_ nx: Double, _ ny: Double, _ now: Double) {
        ripples.append(Ripple(x: nx, y: ny, age: 0))
        if autoZoom {
            if now >= autoZoomUntil && !zoomManual {
                let half = 0.5 / zoomLevel
                zX.target = clamp(nx, half, 1 - half)
                zY.target = clamp(ny, half, 1 - half)
                zoomEngaged = true
            }
            autoZoomUntil = now + 3.2
        }
    }

    private func updateCameraTargets() {
        let A = aspect
        let margin = 0.035
        let base = [0.16, 0.24, 0.34][clamp(camSize, 0, 2)]
        var w: Double, h: Double, rad: Double, cx: Double, cy: Double

        if presenter {
            h = 0.80
            w = h * 16 / 9
            if w > A * 0.9 { w = A * 0.9; h = w * 9 / 16 }
            cx = A / 2; cy = 0.5; rad = 0.03
        } else {
            switch camShape {
            case .circle: w = base; h = base; rad = base / 2
            case .roundedSquare: w = base; h = base; rad = base * 0.22
            case .rectangle: h = base * 0.85; w = h * 16 / 9; rad = h * 0.12
            }
            let left = camCorner == .topLeft || camCorner == .bottomLeft
            let top = camCorner == .topLeft || camCorner == .topRight
            cx = left ? margin + w / 2 : A - margin - w / 2
            cy = top ? margin + h / 2 : 1 - margin - h / 2
        }

        let visible = camVisible && cameraEnabled
        var alpha = 1.0
        if !visible { w *= 0.35; h *= 0.35; rad *= 0.35; alpha = 0 }

        if !camInitialized {
            camX.snap(cx); camY.snap(cy); camW.snap(w * 0.35); camH.snap(h * 0.35); camR.snap(rad * 0.35); camA.snap(0)
            camInitialized = true
        }
        camX.target = cx; camY.target = cy; camW.target = w; camH.target = h; camR.target = rad; camA.target = alpha
        dim.target = (presenter && visible) ? 1 : 0
    }

    private func fetchCursor() {
        let cursor = NSCursor.currentSystem ?? NSCursor.arrow
        let img = cursor.image
        let size = img.size
        guard size.width > 0, size.height > 0 else { return }
        if cursor.hotSpot == cursorHotspot && size == cursorPointSize && cursorImage != nil && lastCursorImage === img { return }
        guard let cg = cursorCGImage(img) else { return }
        lastCursorImage = img
        cursorImage = CIImage(cgImage: cg)
        cursorPointSize = size
        cursorHotspot = cursor.hotSpot
    }
}
