import AppKit
import QuartzCore

// MARK: - Zoom viewfinder (corner brackets on your real screen around what the zoom shows)

final class Viewfinder {
    private let panel: NSPanel
    private let view = ViewfinderView()
    private var lastFrame = NSRect.zero

    init() {
        panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .statusBar
        panel.ignoresMouseEvents = true
        panel.sharingType = .none
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.contentView = view
    }

    func update(_ s: RenderState, region: CGRect, enabled: Bool) {
        guard enabled, let vp = zoomViewport(s, styled: Settings.shared.styled) else {
            if panel.isVisible { panel.orderOut(nil) }
            return
        }
        let r = CGRect(x: region.minX + vp.minX * region.width, y: region.minY + vp.minY * region.height,
                       width: vp.width * region.width, height: vp.height * region.height)
        let f = Geo.toCocoa(r).insetBy(dx: -3, dy: -3).integral
        if f != lastFrame {
            panel.setFrame(f, display: true)
            lastFrame = f
        }
        panel.alphaValue = clamp((s.zoom - 1.01) / 0.25, 0, 1)
        let label = "×" + (s.zoom.rounded() == s.zoom ? String(Int(s.zoom)) : String(format: "%.1f", s.zoom))
        if view.label != label { view.label = label; view.needsDisplay = true }
        if !panel.isVisible { panel.orderFrontRegardless() }
    }
}

private final class ViewfinderView: NSView {
    var label = ""
    override func draw(_ dirtyRect: NSRect) {
        let b = bounds.insetBy(dx: 2, dy: 2)
        let len = min(28, min(b.width, b.height) / 4)
        let path = NSBezierPath()
        path.lineWidth = 3
        path.lineCapStyle = .round
        // four corner brackets
        for (x, y, dx, dy) in [(b.minX, b.minY, 1.0, 1.0), (b.maxX, b.minY, -1.0, 1.0),
                               (b.minX, b.maxY, 1.0, -1.0), (b.maxX, b.maxY, -1.0, -1.0)] {
            path.move(to: NSPoint(x: x + dx * len, y: y))
            path.line(to: NSPoint(x: x, y: y))
            path.line(to: NSPoint(x: x, y: y + dy * len))
        }
        NSColor.black.withAlphaComponent(0.35).setStroke()
        let shadow = path.copy() as! NSBezierPath
        shadow.lineWidth = 6
        shadow.stroke()
        NSColor.systemYellow.setStroke()
        path.stroke()
        // thin full outline
        let outline = NSBezierPath(rect: b)
        outline.lineWidth = 1
        NSColor.systemYellow.withAlphaComponent(0.45).setStroke()
        outline.stroke()
        // zoom badge
        let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 12, weight: .bold), .foregroundColor: NSColor.black]
        let sz = (label as NSString).size(withAttributes: attrs)
        let badge = NSRect(x: b.minX + 8, y: b.maxY - sz.height - 12, width: sz.width + 12, height: sz.height + 4)
        NSColor.systemYellow.setFill()
        NSBezierPath(roundedRect: badge, xRadius: 4, yRadius: 4).fill()
        (label as NSString).draw(at: NSPoint(x: badge.minX + 6, y: badge.minY + 2), withAttributes: attrs)
    }
}

// MARK: - Live preview ("écran de retour")

final class LivePreviewPanel: NSObject, NSWindowDelegate {
    let panel: NSPanel
    private let view = PreviewView()
    private var positioned = false
    var onVisibilityChange: ((Bool) -> Void)?
    var onUserClose: (() -> Void)?

    override init() {
        panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 420, height: 273),
                        styleMask: [.titled, .closable, .resizable, .utilityWindow, .hudWindow, .nonactivatingPanel],
                        backing: .buffered, defer: false)
        super.init()
        panel.title = "Aperçu en direct — ⌃⌥E"
        panel.level = .floating
        panel.sharingType = .none
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.contentView = view
        panel.contentMinSize = NSSize(width: 240, height: 135)
        panel.delegate = self
        setAspect(CGSize(width: 16, height: 10))
    }

    var isOpen: Bool { panel.isVisible }

    func setAspect(_ s: CGSize) {
        guard s.width > 0, s.height > 0 else { return }
        panel.contentAspectRatio = s
        var f = panel.frame
        let content = panel.contentRect(forFrameRect: f)
        let h = content.width * s.height / s.width
        f.size.height += h - content.height
        panel.setFrame(f, display: true)
    }

    func show() {
        // Open on the screen you're looking at (the one with the mouse), bottom-right.
        // Keep your own placement if the panel is already on that screen.
        let screen = Geo.screenWithMouse()
        if !positioned || !screen.frame.intersects(panel.frame) {
            positioned = true
            let vf = screen.visibleFrame
            let size = panel.frame.size
            panel.setFrameOrigin(NSPoint(x: vf.maxX - size.width - 20, y: vf.minY + 20))
        }
        panel.orderFrontRegardless()
        onVisibilityChange?(true)
    }

    func hide() {
        panel.orderOut(nil)
        onVisibilityChange?(false)
    }

    func windowWillClose(_ notification: Notification) {
        onVisibilityChange?(false)
        onUserClose?()
    }

    func display(_ surface: IOSurfaceRef) {
        guard panel.isVisible else { return }
        view.show(surface)
    }

    func clear() { view.show(nil) }

    func setStatus(_ text: String, recording: Bool) { view.setStatus(text, recording: recording) }
}

private final class PreviewView: NSView {
    private let imageLayer = CALayer()
    private let status = NSTextField(labelWithString: "")
    private let placeholder = NSTextField(wrappingLabelWithString: "L'aperçu s'affiche ici pendant l'enregistrement.\nCe que tu vois = ce qui est filmé.")

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        imageLayer.contentsGravity = .resizeAspect
        layer?.addSublayer(imageLayer)
        placeholder.alignment = .center
        placeholder.textColor = .secondaryLabelColor
        placeholder.font = .systemFont(ofSize: 12)
        addSubview(placeholder)
        status.font = .monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
        status.textColor = .white
        status.wantsLayer = true
        status.drawsBackground = true
        status.backgroundColor = NSColor.black.withAlphaComponent(0.55)
        addSubview(status)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layout() {
        super.layout()
        CATransaction.begin(); CATransaction.setDisableActions(true)
        imageLayer.frame = bounds
        CATransaction.commit()
        placeholder.frame = bounds.insetBy(dx: 16, dy: bounds.height / 2 - 20)
        status.sizeToFit()
        status.frame.origin = NSPoint(x: 8, y: bounds.height - status.frame.height - 8)
    }

    func show(_ surface: IOSurfaceRef?) {
        CATransaction.begin(); CATransaction.setDisableActions(true)
        imageLayer.contents = surface
        CATransaction.commit()
        placeholder.isHidden = surface != nil
    }

    func setStatus(_ text: String, recording: Bool) {
        status.stringValue = text.isEmpty ? "" : " \(text) "
        status.isHidden = text.isEmpty
        status.textColor = recording ? .white : .secondaryLabelColor
        status.backgroundColor = recording ? NSColor.systemRed.withAlphaComponent(0.75) : NSColor.black.withAlphaComponent(0.55)
        needsLayout = true
    }
}

// MARK: - Guide (clickable cheat sheet with live on/off states)

struct GuideRow {
    let keys: String
    let title: String
    let isOn: (() -> Bool)?
    var isEnabled: (() -> Bool)? = nil
    let action: () -> Void
}

enum GuideEntry {
    case header(String)
    case row(GuideRow)
    case note(String)
}

final class GuidePanel {
    private let panel: NSPanel
    private var rows: [GuideRowView] = []
    private var timer: Timer?

    init(entries: [GuideEntry]) {
        panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 340, height: 600),
                        styleMask: [.titled, .closable, .utilityWindow, .hudWindow, .nonactivatingPanel],
                        backing: .buffered, defer: false)
        panel.title = "Guide SmartDemo — ⌃⌥G"
        panel.level = .floating
        panel.sharingType = .none
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 2
        stack.edgeInsets = NSEdgeInsets(top: 10, left: 12, bottom: 12, right: 12)
        for e in entries {
            switch e {
            case .header(let t):
                let l = NSTextField(labelWithString: t.uppercased())
                l.font = .systemFont(ofSize: 10, weight: .bold)
                l.textColor = .secondaryLabelColor
                stack.addArrangedSubview(spacer(6))
                stack.addArrangedSubview(l)
            case .row(let r):
                let v = GuideRowView(r)
                rows.append(v)
                stack.addArrangedSubview(v)
                v.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -24).isActive = true
            case .note(let t):
                let l = NSTextField(wrappingLabelWithString: t)
                l.font = .systemFont(ofSize: 11)
                l.textColor = .secondaryLabelColor
                stack.addArrangedSubview(spacer(8))
                stack.addArrangedSubview(l)
                l.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -24).isActive = true
            }
        }
        stack.translatesAutoresizingMaskIntoConstraints = false
        let container = NSView()
        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            stack.topAnchor.constraint(equalTo: container.topAnchor),
            stack.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            stack.widthAnchor.constraint(equalToConstant: 340),
        ])
        panel.contentView = container
        panel.setContentSize(container.fittingSize)
    }

    private func spacer(_ h: CGFloat) -> NSView {
        let v = NSView()
        v.heightAnchor.constraint(equalToConstant: h).isActive = true
        return v
    }

    var isOpen: Bool { panel.isVisible }

    func toggle() { isOpen ? hide() : show() }

    func show() {
        if panel.frame.origin == .zero || !NSScreen.screens.contains(where: { $0.frame.intersects(panel.frame) }) {
            let vf = Geo.screenWithMouse().visibleFrame
            panel.setFrameOrigin(NSPoint(x: vf.minX + 20, y: vf.maxY - panel.frame.height - 20))
        }
        refresh()
        panel.orderFrontRegardless()
        timer?.invalidate()
        let t = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in self?.refresh() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func hide() {
        panel.orderOut(nil)
        timer?.invalidate()
        timer = nil
    }

    private func refresh() {
        guard panel.isVisible else { timer?.invalidate(); timer = nil; return }
        rows.forEach { $0.refresh() }
    }
}

private final class GuideRowView: NSView {
    private let row: GuideRow
    private let dot = NSView()
    private var hover = false { didSet { needsDisplay = true } }

    init(_ row: GuideRow) {
        self.row = row
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        heightAnchor.constraint(equalToConstant: 26).isActive = true

        let keys = NSTextField(labelWithString: row.keys)
        keys.font = .monospacedSystemFont(ofSize: 11, weight: .semibold)
        keys.textColor = .white
        keys.alignment = .center
        keys.wantsLayer = true
        keys.drawsBackground = true
        keys.backgroundColor = NSColor.white.withAlphaComponent(0.14)
        keys.layer?.cornerRadius = 4

        let title = NSTextField(labelWithString: row.title)
        title.font = .systemFont(ofSize: 12.5)
        title.textColor = .labelColor
        title.lineBreakMode = .byTruncatingTail

        dot.wantsLayer = true
        dot.layer?.cornerRadius = 4
        dot.isHidden = row.isOn == nil

        for v in [keys, title, dot] { v.translatesAutoresizingMaskIntoConstraints = false; addSubview(v) }
        NSLayoutConstraint.activate([
            keys.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 4),
            keys.centerYAnchor.constraint(equalTo: centerYAnchor),
            keys.widthAnchor.constraint(equalToConstant: 58),
            title.leadingAnchor.constraint(equalTo: keys.trailingAnchor, constant: 10),
            title.centerYAnchor.constraint(equalTo: centerYAnchor),
            title.trailingAnchor.constraint(lessThanOrEqualTo: dot.leadingAnchor, constant: -8),
            dot.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6),
            dot.centerYAnchor.constraint(equalTo: centerYAnchor),
            dot.widthAnchor.constraint(equalToConstant: 8),
            dot.heightAnchor.constraint(equalToConstant: 8),
        ])
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
        toolTip = "Clique pour déclencher"
        refresh()
    }

    required init?(coder: NSCoder) { fatalError() }

    func refresh() {
        alphaValue = (row.isEnabled?() ?? true) ? 1 : 0.38
        guard let isOn = row.isOn else { return }
        dot.layer?.backgroundColor = (isOn() ? NSColor.systemGreen : NSColor.white.withAlphaComponent(0.18)).cgColor
    }

    override func draw(_ dirtyRect: NSRect) {
        if hover {
            NSColor.white.withAlphaComponent(0.08).setFill()
            NSBezierPath(roundedRect: bounds, xRadius: 5, yRadius: 5).fill()
        }
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseEntered(with event: NSEvent) { hover = true }
    override func mouseExited(with event: NSEvent) { hover = false }
    override func mouseDown(with event: NSEvent) {}
    override func mouseUp(with event: NSEvent) {
        if bounds.contains(convert(event.locationInWindow, from: nil)) {
            row.action()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in self?.refresh() }
        }
    }
}
