import AppKit
import AVFoundation
import QuartzCore

private func makeOverlayPanel(_ frame: NSRect, level: NSWindow.Level = .statusBar) -> NSPanel {
    let p = NSPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    p.isOpaque = false
    p.backgroundColor = .clear
    p.hasShadow = false
    p.level = level
    p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
    p.isReleasedWhenClosed = false
    p.sharingType = .none // never captured
    p.hidesOnDeactivate = false
    return p
}

// MARK: - Camera bubble (live preview on screen, draggable, magnetic corners)

final class BubbleWindow {
    let panel: NSPanel
    private let view: BubbleView
    private let shadowLayer = CALayer()
    private let clip = CALayer()
    let preview: AVCaptureVideoPreviewLayer
    private let margin: CGFloat = 24
    private var lastFrame = NSRect.zero

    init(session: AVCaptureSession) {
        panel = makeOverlayPanel(NSRect(x: 0, y: 0, width: 100, height: 100))
        view = BubbleView(frame: panel.contentLayoutRect)
        view.wantsLayer = true
        preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        shadowLayer.shadowColor = NSColor.black.cgColor
        shadowLayer.shadowOpacity = 0.4
        shadowLayer.shadowRadius = 12
        shadowLayer.shadowOffset = CGSize(width: 0, height: -4)
        clip.masksToBounds = true
        clip.borderColor = NSColor.white.withAlphaComponent(0.25).cgColor
        clip.borderWidth = 1
        clip.addSublayer(preview)
        view.layer?.addSublayer(shadowLayer)
        view.layer?.addSublayer(clip)
        panel.contentView = view
        panel.ignoresMouseEvents = false
    }

    func refreshMirroring() {
        if let c = preview.connection, c.isVideoMirroringSupported {
            c.automaticallyAdjustsVideoMirroring = false
            c.isVideoMirrored = true
        }
    }

    func update(cam: CamFrame, region: CGRect) {
        guard cam.a > 0.01, cam.w > 0.002 else {
            if panel.isVisible { panel.orderOut(nil) }
            return
        }
        let s = region.height
        let w = cam.w * s, h = cam.h * s
        let left = region.minX + cam.x * s - w / 2
        let top = region.minY + cam.y * s - h / 2
        let inner = Geo.toCocoa(CGRect(x: left, y: top, width: w, height: h))
        let frame = inner.insetBy(dx: -margin, dy: -margin)

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if frame != lastFrame {
            panel.setFrame(frame, display: false)
            lastFrame = frame
        }
        let rect = CGRect(x: margin, y: margin, width: w, height: h)
        let radius = min(cam.r * s, min(w, h) / 2)
        clip.frame = rect
        clip.cornerRadius = radius
        preview.frame = clip.bounds
        shadowLayer.frame = rect
        shadowLayer.shadowPath = CGPath(roundedRect: CGRect(origin: .zero, size: rect.size), cornerWidth: radius, cornerHeight: radius, transform: nil)
        panel.alphaValue = cam.a
        CATransaction.commit()
        if !panel.isVisible { panel.orderFrontRegardless() }
    }
}

final class BubbleView: NSView {
    private var offset = CGPoint.zero
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseDown(with event: NSEvent) {
        guard let w = window else { return }
        let m = NSEvent.mouseLocation
        offset = CGPoint(x: m.x - w.frame.midX, y: m.y - w.frame.midY)
        NSCursor.closedHand.push()
    }

    override func mouseDragged(with event: NSEvent) {
        let m = NSEvent.mouseLocation
        Director.shared.dragCamera(toCocoaCenter: CGPoint(x: m.x - offset.x, y: m.y - offset.y))
    }

    override func mouseUp(with event: NSEvent) {
        NSCursor.pop()
        Director.shared.endDrag()
    }

    override func resetCursorRects() { addCursorRect(bounds, cursor: .openHand) }
}

// MARK: - Zone selection

final class ZoneSelector {
    private var windows: [NSWindow] = []
    private var completion: ((CGRect?, CGDirectDisplayID) -> Void)?

    func begin(_ completion: @escaping (CGRect?, CGDirectDisplayID) -> Void) {
        self.completion = completion
        NSApp.activate(ignoringOtherApps: true)
        for screen in NSScreen.screens {
            let w = KeyWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
            w.setFrame(screen.frame, display: false)
            w.isOpaque = false
            w.backgroundColor = .clear
            w.level = .screenSaver
            w.ignoresMouseEvents = false
            w.isReleasedWhenClosed = false
            w.sharingType = .none
            w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            let v = ZoneView(frame: NSRect(origin: .zero, size: screen.frame.size))
            v.onDone = { [weak self, weak w] rect in
                guard let self, let w else { return }
                if let rect {
                    let global = Geo.toTopLeft(w.convertToScreen(rect))
                    self.finish(global.integral, Geo.displayID(of: screen))
                } else {
                    self.finish(nil, Geo.displayID(of: screen))
                }
            }
            w.contentView = v
            w.makeKeyAndOrderFront(nil)
            windows.append(w)
        }
        let mouseScreen = Geo.screenWithMouse()
        if let w = windows.first(where: { $0.screen == mouseScreen }) {
            w.makeKeyAndOrderFront(nil)
            w.makeFirstResponder(w.contentView)
        }
    }

    private func finish(_ rect: CGRect?, _ display: CGDirectDisplayID) {
        windows.forEach { $0.orderOut(nil) }
        windows.removeAll()
        let c = completion
        completion = nil
        c?(rect, display)
    }
}

private final class KeyWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

private final class ZoneView: NSView {
    var onDone: ((NSRect?) -> Void)?
    private var start: NSPoint?
    private var current: NSPoint?

    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .crosshair) }

    private var selection: NSRect? {
        guard let s = start, let c = current else { return nil }
        return NSRect(x: min(s.x, c.x), y: min(s.y, c.y), width: abs(c.x - s.x), height: abs(c.y - s.y))
    }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.black.withAlphaComponent(0.35).setFill()
        bounds.fill()
        if let r = selection {
            NSColor.clear.setFill()
            r.fill(using: .copy)
            let path = NSBezierPath(rect: r)
            path.lineWidth = 2
            path.setLineDash([6, 4], count: 2, phase: 0)
            NSColor.white.setStroke()
            path.stroke()
            let label = "\(Int(r.width)) × \(Int(r.height))" as NSString
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .semibold),
                .foregroundColor: NSColor.white,
            ]
            let sz = label.size(withAttributes: attrs)
            let bg = NSRect(x: r.minX, y: r.maxY + 6, width: sz.width + 12, height: sz.height + 6)
            NSColor.black.withAlphaComponent(0.7).setFill()
            NSBezierPath(roundedRect: bg, xRadius: 5, yRadius: 5).fill()
            label.draw(at: NSPoint(x: bg.minX + 6, y: bg.minY + 3), withAttributes: attrs)
        } else {
            let hint = "Glisse pour sélectionner une zone — Échap pour annuler" as NSString
            let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 16, weight: .medium), .foregroundColor: NSColor.white]
            let sz = hint.size(withAttributes: attrs)
            hint.draw(at: NSPoint(x: bounds.midX - sz.width / 2, y: bounds.midY - sz.height / 2), withAttributes: attrs)
        }
    }

    override func mouseDown(with event: NSEvent) {
        start = convert(event.locationInWindow, from: nil)
        current = start
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        current = convert(event.locationInWindow, from: nil)
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        current = convert(event.locationInWindow, from: nil)
        if let r = selection, r.width >= 80, r.height >= 60 {
            onDone?(r)
        } else {
            start = nil; current = nil; needsDisplay = true
        }
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { onDone?(nil) } // Esc
    }
}

// MARK: - Zone border (visible to you, never recorded)

final class ZoneBorderWindow {
    private let panel: NSPanel
    private let view = BorderView()

    init() {
        panel = makeOverlayPanel(.zero, level: .statusBar)
        panel.ignoresMouseEvents = true
        panel.contentView = view
    }

    func show(_ rect: CGRect, recording: Bool) {
        let f = Geo.toCocoa(rect).insetBy(dx: -4, dy: -4)
        panel.setFrame(f, display: true)
        view.recording = recording
        view.needsDisplay = true
        panel.orderFrontRegardless()
    }

    func hide() { panel.orderOut(nil) }
}

private final class BorderView: NSView {
    var recording = false
    override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 2, dy: 2), xRadius: 4, yRadius: 4)
        path.lineWidth = 2
        path.setLineDash([8, 5], count: 2, phase: 0)
        (recording ? NSColor.systemRed : NSColor.systemBlue).setStroke()
        path.stroke()
    }
}

// MARK: - Countdown

final class Countdown {
    private let panel: NSPanel
    private let label = NSTextField(labelWithString: "3")

    init() {
        panel = makeOverlayPanel(NSRect(x: 0, y: 0, width: 180, height: 180), level: .screenSaver)
        panel.ignoresMouseEvents = true
        let v = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: 180, height: 180))
        v.material = .hudWindow
        v.blendingMode = .behindWindow
        v.state = .active
        v.wantsLayer = true
        v.layer?.cornerRadius = 90
        v.layer?.masksToBounds = true
        label.font = NSFont.systemFont(ofSize: 96, weight: .bold)
        label.textColor = .white
        label.alignment = .center
        label.frame = NSRect(x: 0, y: 28, width: 180, height: 120)
        v.addSubview(label)
        panel.contentView = v
    }

    @MainActor func run(over region: CGRect) async {
        let c = Geo.toCocoa(region)
        panel.setFrame(NSRect(x: c.midX - 90, y: c.midY - 90, width: 180, height: 180), display: true)
        panel.alphaValue = 1
        panel.orderFrontRegardless()
        for n in [3, 2, 1] {
            label.stringValue = "\(n)"
            if let layer = panel.contentView?.layer {
                let a = CABasicAnimation(keyPath: "transform.scale")
                a.fromValue = 1.25; a.toValue = 1.0; a.duration = 0.35
                a.timingFunction = CAMediaTimingFunction(name: .easeOut)
                layer.add(a, forKey: "pop")
            }
            try? await Task.sleep(nanoseconds: 750_000_000)
        }
        panel.orderOut(nil)
    }
}

// MARK: - Toast (feedback when a shortcut fires — never recorded)

final class Toast {
    static let shared = Toast()
    private let panel: NSPanel
    private let label = NSTextField(labelWithString: "")
    private let box = NSVisualEffectView()
    private var hideWork: DispatchWorkItem?

    private init() {
        panel = makeOverlayPanel(NSRect(x: 0, y: 0, width: 200, height: 40), level: .screenSaver)
        panel.ignoresMouseEvents = true
        box.material = .hudWindow
        box.blendingMode = .behindWindow
        box.state = .active
        box.wantsLayer = true
        box.layer?.cornerRadius = 12
        box.layer?.masksToBounds = true
        label.font = NSFont.systemFont(ofSize: 15, weight: .semibold)
        label.textColor = .white
        label.alignment = .center
        box.addSubview(label)
        panel.contentView = box
    }

    func show(_ text: String) {
        label.stringValue = text
        label.sizeToFit()
        let w = label.frame.width + 36, h: CGFloat = 40
        let screen = Geo.screenWithMouse().visibleFrame
        panel.setFrame(NSRect(x: screen.midX - w / 2, y: screen.minY + 60, width: w, height: h), display: true)
        box.frame = NSRect(x: 0, y: 0, width: w, height: h)
        label.frame = NSRect(x: 18, y: (h - label.frame.height) / 2, width: label.frame.width, height: label.frame.height)
        panel.alphaValue = 1
        panel.orderFrontRegardless()
        hideWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            NSAnimationContext.runAnimationGroup({ ctx in
                ctx.duration = 0.3
                self?.panel.animator().alphaValue = 0
            }, completionHandler: { [weak self] in
                if self?.panel.alphaValue == 0 { self?.panel.orderOut(nil) }
            })
        }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2, execute: work)
    }
}
