import AppKit
import AVFoundation
import ScreenCaptureKit

final class ActionItem: NSMenuItem {
    private var handler: (() -> Void)?

    init(_ title: String, key: String = "", checked: Bool = false, enabled: Bool = true, handler: @escaping () -> Void) {
        super.init(title: title, action: #selector(fire), keyEquivalent: key)
        self.handler = handler
        target = self
        keyEquivalentModifierMask = [.control, .option]
        state = checked ? .on : .off
        isEnabled = enabled
    }

    required init(coder: NSCoder) { fatalError() }
    @objc private func fire() { handler?() }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    enum Phase { case idle, starting, recording, stopping }

    private var statusItem: NSStatusItem!
    private let menu = NSMenu()
    private let camera = CameraCapture()
    private var bubble: BubbleWindow?
    private let recorder = Recorder()
    private let zoneSelector = ZoneSelector()
    private let zoneBorder = ZoneBorderWindow()
    private let countdown = Countdown()
    private let viewfinder = Viewfinder()
    private let preview = LivePreviewPanel()
    private var guide: GuidePanel!
    private var statusTimer: Timer?
    private var phase = Phase.idle
    private var target: TargetSpec = .display(CGMainDisplayID())
    private var userChoseTarget = false
    private let settings = Settings.shared
    private let director = Director.shared

    // MARK: Launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        menu.delegate = self
        menu.autoenablesItems = false
        statusItem.menu = menu
        updateStatusButton()

        recorder.camera = camera
        recorder.onStreamError = { [weak self] err in
            DispatchQueue.main.async {
                guard let self, self.phase == .recording else { return }
                Toast.shared.show("Capture interrompue : \(err.localizedDescription)")
                self.stopRecording()
            }
        }

        bubble = BubbleWindow(session: camera.session)
        camera.onConfigured = { [weak self] in self?.bubble?.refreshMirroring() }
        camera.configure(deviceID: settings.cameraID)
        director.onFrame = { [weak self] st, region in
            self?.bubble?.update(cam: st.cam, region: region)
            self?.viewfinder.update(st, region: region, enabled: Settings.shared.viewfinder)
        }
        recorder.onPreview = { [weak self] surface in self?.preview.display(surface) }
        preview.onVisibilityChange = { [weak self] on in self?.recorder.setPreviewEnabled(on) }
        preview.onUserClose = { [weak self] in self?.settings.previewOpen = false }
        guide = GuidePanel(entries: guideEntries())
        applyTarget(target)
        director.start()

        registerHotkeys()
        if CommandLine.arguments.contains("--open-panels") {
            guide.show()
            togglePreview()
        }

        if !CGPreflightScreenCaptureAccess() {
            CGRequestScreenCaptureAccess()
        }
        Toast.shared.show("SmartDemo est prêt — ⌃⌥G pour le guide, ⌃⌥R pour enregistrer")
    }

    // MARK: Hotkeys

    private func registerHotkeys() {
        let hk = HotkeyCenter.shared
        hk.register(key: "r") { [weak self] in self?.toggleRecording() }
        hk.register(key: "g") { [weak self] in self?.guide.toggle() }
        hk.register(key: "e") { [weak self] in self?.togglePreview() }
        hk.register(key: "p") { [weak self] in self?.togglePause() }
        hk.register(key: "z") { [weak self] in self?.toggleZoom() }
        hk.register(key: "x") { [weak self] in self?.cycleZoomLevel() }
        hk.register(key: "a") { [weak self] in self?.toggleAutoZoom() }
        hk.register(key: "m") { [weak self] in self?.toggleBigCursor() }
        hk.register(key: "l") { [weak self] in self?.toggleSpotlight() }
        hk.register(key: "h") { [weak self] in self?.toggleHalo() }
        hk.register(key: "w") { [weak self] in self?.toggleCamera() }
        hk.register(key: "v") { [weak self] in self?.togglePresenter() }
        hk.register(key: "s") { [weak self] in self?.cycleCamSize() }
        hk.register(key: "o") { [weak self] in self?.cycleCamShape() }
        hk.register(key: "1") { [weak self] in self?.moveCamera(.topLeft) }
        hk.register(key: "2") { [weak self] in self?.moveCamera(.topRight) }
        hk.register(key: "3") { [weak self] in self?.moveCamera(.bottomLeft) }
        hk.register(key: "4") { [weak self] in self?.moveCamera(.bottomRight) }
    }

    // MARK: Live actions

    private var isRecording: Bool { phase == .recording }

    /// Effects that only exist in the video: refuse them (with a hint) outside a recording.
    private func requireRecording() -> Bool {
        if isRecording { return true }
        Toast.shared.show("⏺ Disponible pendant l'enregistrement — ⌃⌥R pour démarrer")
        return false
    }

    private func togglePreview() {
        guard requireRecording() else { return }
        if preview.isOpen {
            preview.hide()
            settings.previewOpen = false
        } else {
            preview.show()
            settings.previewOpen = true
            updateStatusButton()
        }
    }

    private func toggleViewfinder() {
        settings.viewfinder.toggle()
        Toast.shared.show(settings.viewfinder ? "Viseur de zoom affiché" : "Viseur de zoom masqué")
    }

    private func guideEntries() -> [GuideEntry] {
        let d = director
        let rec: () -> Bool = { [weak self] in self?.phase == .recording }
        func row(_ k: String, _ t: String, _ on: (() -> Bool)? = nil, recOnly: Bool = false, _ a: @escaping () -> Void) -> GuideEntry {
            .row(GuideRow(keys: k, title: t, isOn: on, isEnabled: recOnly ? rec : nil, action: a))
        }
        return [
            .header("Enregistrement"),
            row("⌃⌥R", "Démarrer / arrêter", { [weak self] in self?.phase == .recording }) { [weak self] in self?.toggleRecording() },
            row("⌃⌥P", "Pause / reprise", { [weak self] in self?.recorder.isPaused ?? false }, recOnly: true) { [weak self] in self?.togglePause() },
            row("⌃⌥E", "Aperçu en direct", { [weak self] in self?.preview.isOpen ?? false }, recOnly: true) { [weak self] in self?.togglePreview() },
            .header("Zoom"),
            row("⌃⌥Z", "Zoom qui suit la souris", { d.zoomManual }, recOnly: true) { [weak self] in self?.toggleZoom() },
            row("⌃⌥A", "Auto-zoom à chaque clic", { d.autoZoom }, recOnly: true) { [weak self] in self?.toggleAutoZoom() },
            row("⌃⌥X", "Niveau de zoom (×1.5 → ×3)") { [weak self] in self?.cycleZoomLevel() },
            row("—", "Viseur jaune à l'écran", { Settings.shared.viewfinder }) { [weak self] in self?.toggleViewfinder() },
            .header("Souris"),
            row("⌃⌥M", "Grand curseur", { d.bigCursor }, recOnly: true) { [weak self] in self?.toggleBigCursor() },
            row("⌃⌥H", "Halo autour du curseur", { d.halo }) { [weak self] in self?.toggleHalo() },
            row("⌃⌥L", "Projecteur sur la souris", { d.spotlightOn }, recOnly: true) { [weak self] in self?.toggleSpotlight() },
            .header("Caméra"),
            row("⌃⌥W", "Afficher / masquer", { d.camVisible && d.cameraEnabled }) { [weak self] in self?.toggleCamera() },
            row("⌃⌥V", "Mode présentateur (grand, centré)", { d.presenter }) { [weak self] in self?.togglePresenter() },
            row("⌃⌥S", "Taille suivante") { [weak self] in self?.cycleCamSize() },
            row("⌃⌥O", "Forme suivante") { [weak self] in self?.cycleCamShape() },
            row("⌃⌥1", "Coin haut gauche", { d.camCorner == .topLeft && !d.presenter }) { [weak self] in self?.moveCamera(.topLeft) },
            row("⌃⌥2", "Coin haut droite", { d.camCorner == .topRight && !d.presenter }) { [weak self] in self?.moveCamera(.topRight) },
            row("⌃⌥3", "Coin bas gauche", { d.camCorner == .bottomLeft && !d.presenter }) { [weak self] in self?.moveCamera(.bottomLeft) },
            row("⌃⌥4", "Coin bas droite", { d.camCorner == .bottomRight && !d.presenter }) { [weak self] in self?.moveCamera(.bottomRight) },
            .note("Clique une ligne pour la déclencher · point vert = actif · grisé = seulement pendant l'enregistrement · ce panneau n'apparaît jamais dans la vidéo. Tu peux aussi glisser la bulle caméra à la souris."),
        ]
    }

    private func toggleZoom() {
        guard requireRecording() else { return }
        director.zoomManual.toggle()
        Toast.shared.show(director.zoomManual ? "🔍 Zoom ×\(fmt(director.zoomLevel)) — suit la souris" : "Zoom désactivé")
    }

    private func cycleZoomLevel() {
        let z = director.cycleZoomLevel()
        Toast.shared.show("Niveau de zoom ×\(fmt(z))")
    }

    private func toggleAutoZoom() {
        guard requireRecording() else { return }
        director.autoZoom.toggle()
        Toast.shared.show(director.autoZoom ? "✨ Auto-zoom sur les clics activé" : "Auto-zoom désactivé")
    }

    private func toggleBigCursor() {
        guard requireRecording() else { return }
        director.bigCursor.toggle()
        Toast.shared.show(director.bigCursor ? "🖱 Grand curseur" : "Curseur normal")
    }

    private func toggleSpotlight() {
        guard requireRecording() else { return }
        director.spotlightOn.toggle()
        Toast.shared.show(director.spotlightOn ? "🔦 Projecteur activé" : "Projecteur désactivé")
    }

    private func toggleHalo() {
        director.halo.toggle()
        settings.halo = director.halo
        Toast.shared.show(director.halo ? "Halo du curseur activé" : "Halo du curseur désactivé")
    }

    private func toggleCamera() {
        if !settings.cameraEnabled {
            settings.cameraEnabled = true
            director.cameraEnabled = true
            director.camVisible = true
        } else {
            director.camVisible.toggle()
        }
        if director.camVisible { requestCameraAccessIfNeeded() }
        updateCameraRunning()
        Toast.shared.show(director.camVisible ? "📷 Caméra affichée" : "Caméra masquée")
    }

    private func togglePresenter() {
        if !director.camVisible || !settings.cameraEnabled {
            settings.cameraEnabled = true
            director.cameraEnabled = true
            director.camVisible = true
            requestCameraAccessIfNeeded()
            updateCameraRunning()
        }
        director.presenter.toggle()
        Toast.shared.show(director.presenter ? "🎤 Mode présentateur" : "Retour à la bulle")
    }

    private func cycleCamSize() {
        director.presenter = false
        director.camSize = (director.camSize + 1) % 3
        settings.camSize = director.camSize
        Toast.shared.show("Taille caméra : " + ["Petite", "Moyenne", "Grande"][director.camSize])
    }

    private func cycleCamShape() {
        director.presenter = false
        let next = CamShape(rawValue: (director.camShape.rawValue + 1) % CamShape.allCases.count) ?? .circle
        director.camShape = next
        settings.camShape = next.rawValue
        Toast.shared.show("Forme : \(next.label)")
    }

    private func moveCamera(_ c: Corner) {
        director.presenter = false
        director.camCorner = c
        settings.camCorner = c.rawValue
    }

    private func fmt(_ z: Double) -> String { z == z.rounded() ? String(Int(z)) : String(format: "%.1f", z) }

    // MARK: Camera

    private func requestCameraAccessIfNeeded() {
        if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async { if granted { self.camera.configure(deviceID: self.settings.cameraID); self.updateCameraRunning() } }
            }
        }
    }

    private func updateCameraRunning() {
        let shouldRun = settings.cameraEnabled && (director.camVisible || phase == .recording || phase == .starting)
        if shouldRun {
            camera.setRunning(true)
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                guard let self else { return }
                let still = self.settings.cameraEnabled && (self.director.camVisible || self.phase != .idle)
                if !still { self.camera.setRunning(false) }
            }
        }
    }

    // MARK: Target

    private func chooseTarget(_ t: TargetSpec) {
        userChoseTarget = true
        applyTarget(t)
        Toast.shared.show("Source : \(t.label)")
    }

    private func applyTarget(_ t: TargetSpec) {
        target = t
        director.setRegion(TargetResolver.region(for: t), updater: TargetResolver.updater(for: t))
        if case .area(_, let r) = t {
            zoneBorder.show(r, recording: phase == .recording)
        } else {
            zoneBorder.hide()
        }
    }

    private func pickZone() {
        zoneSelector.begin { [weak self] rect, display in
            guard let self, let rect else { return }
            self.userChoseTarget = true
            self.applyTarget(.area(display, rect))
            Toast.shared.show("Zone sélectionnée — ⌃⌥R pour enregistrer")
        }
    }

    // MARK: Recording

    private func toggleRecording() {
        switch phase {
        case .idle: startRecording()
        case .recording: stopRecording()
        default: break
        }
    }

    private func togglePause() {
        guard requireRecording() else { return }
        let p = recorder.togglePause()
        Toast.shared.show(p ? "⏸ Pause" : "⏺ Reprise")
        updateStatusButton()
    }

    private func outputSize(for px: CGSize) -> CGSize {
        let cap = CGFloat(settings.maxDim)
        let k = min(1, cap / max(px.width, px.height))
        return CGSize(width: even(px.width * k), height: even(px.height * k))
    }

    private func newFileURL() -> URL {
        let dir = FileManager.default.urls(for: .moviesDirectory, in: .userDomainMask)[0].appendingPathComponent("SmartDemo", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd 'à' HH.mm.ss"
        return dir.appendingPathComponent("SmartDemo \(f.string(from: Date())).mp4")
    }

    private func startRecording() {
        guard phase == .idle else { return }
        guard CGPreflightScreenCaptureAccess() else {
            CGRequestScreenCaptureAccess()
            alert("Autorise l'enregistrement de l'écran",
                  "Ouvre Réglages Système → Confidentialité et sécurité → Enregistrement de l'écran, active SmartDemo, puis relance l'app.")
            return
        }
        if !userChoseTarget {
            // No explicit source: record the screen you're working on.
            applyTarget(.display(Geo.displayID(of: Geo.screenWithMouse())))
        }
        phase = .starting
        updateStatusButton()

        Task { @MainActor in
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
                let setup = try TargetResolver.resolve(target, content: content, fps: settings.fps)
                director.setRegion(setup.region, updater: setup.regionUpdater)

                if settings.cameraEnabled {
                    if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
                        _ = await AVCaptureDevice.requestAccess(for: .video)
                        camera.configure(deviceID: settings.cameraID)
                    }
                    director.camVisible = true
                    updateCameraRunning()
                }
                var micID: String? = nil
                if settings.micEnabled {
                    var ok = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
                    if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
                        ok = await AVCaptureDevice.requestAccess(for: .audio)
                    }
                    if ok { micID = settings.micID ?? "" }
                }

                if let pid = setup.activatePID {
                    NSRunningApplication(processIdentifier: pid)?.activate()
                }
                let url = newFileURL()
                let outSize = outputSize(for: setup.pixelSize)
                preview.setAspect(outSize)
                if settings.previewOpen { preview.show() }
                recorder.setPreviewEnabled(preview.isOpen)
                try await recorder.prepare(setup: setup, outputSize: outSize, fps: settings.fps,
                                           styled: settings.styled, bgIndex: settings.bgIndex, url: url, micDeviceID: micID)
                if case .area(_, let r) = target { zoneBorder.show(r, recording: true) }
                if settings.countdown { await countdown.run(over: setup.region) }
                recorder.begin()
                phase = .recording
                updateStatusButton()
                startStatusTimer()
            } catch {
                _ = await recorder.stop(discard: true)
                phase = .idle
                updateStatusButton()
                updateCameraRunning()
                alert("Impossible de démarrer l'enregistrement", error.localizedDescription)
            }
        }
    }

    private func stopRecording(discard: Bool = false) {
        guard phase == .recording else { return }
        phase = .stopping
        statusTimer?.invalidate()
        updateStatusButton()
        Task { @MainActor in
            let url = await recorder.stop(discard: discard)
            preview.hide()
            preview.clear()
            phase = .idle
            director.resetLiveEffects()
            director.camVisible = false
            updateCameraRunning()
            applyTarget(target)
            updateStatusButton()
            if let url {
                Toast.shared.show("✅ Vidéo enregistrée dans Films/SmartDemo")
                if settings.revealAfter { NSWorkspace.shared.activateFileViewerSelecting([url]) }
            } else if discard {
                Toast.shared.show("Enregistrement supprimé")
            }
        }
    }

    // MARK: Status item

    private func startStatusTimer() {
        statusTimer?.invalidate()
        let t = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in self?.updateStatusButton() }
        RunLoop.main.add(t, forMode: .common)
        statusTimer = t
    }

    private func updateStatusButton() {
        guard let button = statusItem?.button else { return }
        switch phase {
        case .recording:
            let secs = Int(recorder.elapsed())
            let paused = recorder.isPaused
            button.image = NSImage(systemSymbolName: paused ? "pause.circle.fill" : "record.circle.fill", accessibilityDescription: "SmartDemo")
            button.contentTintColor = paused ? .systemOrange : .systemRed
            button.title = String(format: " %02d:%02d", secs / 60, secs % 60)
            button.font = NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .medium)
            var parts = [String(format: "%@ %02d:%02d", paused ? "⏸ PAUSE" : "● REC", secs / 60, secs % 60)]
            if director.zoomManual || director.autoZoom { parts.append(director.zoomManual ? "Zoom ×\(fmt(director.zoomLevel))" : "Auto-zoom") }
            if director.presenter { parts.append("Présentateur") }
            preview.setStatus(parts.joined(separator: "  ·  "), recording: !paused)
        case .starting, .stopping:
            button.image = NSImage(systemSymbolName: "hourglass", accessibilityDescription: "SmartDemo")
            button.contentTintColor = nil
            button.title = ""
        case .idle:
            preview.setStatus("", recording: false)
            button.image = NSImage(systemSymbolName: "record.circle", accessibilityDescription: "SmartDemo")
            button.contentTintColor = nil
            button.title = ""
        }
        button.imagePosition = .imageLeading
    }

    // MARK: Menu

    func menuNeedsUpdate(_ menu: NSMenu) { rebuildMenu() }

    private func header(_ title: String) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        i.isEnabled = false
        return i
    }

    private func submenu(_ title: String, _ items: [NSMenuItem], enabled: Bool = true) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        let m = NSMenu()
        m.autoenablesItems = false
        items.forEach { m.addItem($0) }
        i.submenu = m
        i.isEnabled = enabled
        return i
    }

    private func rebuildMenu() {
        menu.removeAllItems()
        let idle = phase == .idle

        switch phase {
        case .idle:
            menu.addItem(ActionItem("⏺  Démarrer l'enregistrement", key: "r") { [weak self] in self?.startRecording() })
        case .recording:
            menu.addItem(ActionItem("⏹  Arrêter et enregistrer", key: "r") { [weak self] in self?.stopRecording() })
            menu.addItem(ActionItem(recorder.isPaused ? "▶︎  Reprendre" : "⏸  Pause", key: "p") { [weak self] in self?.togglePause() })
            menu.addItem(ActionItem("🗑  Annuler (supprimer la vidéo)") { [weak self] in self?.stopRecording(discard: true) })
        case .starting, .stopping:
            menu.addItem(header("Préparation…"))
        }
        menu.addItem(.separator())

        // Source
        menu.addItem(header("Source : \(target.label)"))
        let screens = NSScreen.screens
        if screens.count == 1 {
            let id = Geo.displayID(of: screens[0])
            menu.addItem(ActionItem("Écran entier", checked: target == .display(id), enabled: idle) { [weak self] in self?.chooseTarget(.display(id)) })
        } else {
            let items = screens.map { s -> NSMenuItem in
                let id = Geo.displayID(of: s)
                return ActionItem(s.localizedName, checked: target == .display(id)) { [weak self] in self?.chooseTarget(.display(id)) }
            }
            menu.addItem(submenu("Écran entier", items, enabled: idle))
        }
        let wins = WindowLister.windows().prefix(40).map { w -> NSMenuItem in
            let spec = TargetSpec.window(w.id, w.owner)
            return ActionItem(w.label, checked: target == spec) { [weak self] in self?.chooseTarget(spec) }
        }
        menu.addItem(submenu("Fenêtre", wins.isEmpty ? [header("Aucune fenêtre")] : Array(wins), enabled: idle))
        let apps = WindowLister.apps().map { a -> NSMenuItem in
            let spec = TargetSpec.app(a.processIdentifier, a.localizedName ?? "App")
            let item = ActionItem(a.localizedName ?? "App", checked: target == spec) { [weak self] in self?.chooseTarget(spec) }
            if let icon = a.icon { icon.size = NSSize(width: 16, height: 16); item.image = icon }
            return item
        }
        menu.addItem(submenu("Application", apps, enabled: idle))
        menu.addItem(ActionItem("Zone personnalisée…", enabled: idle) { [weak self] in self?.pickZone() })
        menu.addItem(.separator())

        // Camera
        var camItems: [NSMenuItem] = [
            ActionItem("Caméra activée", checked: settings.cameraEnabled) { [weak self] in
                guard let self else { return }
                self.settings.cameraEnabled.toggle()
                self.director.cameraEnabled = self.settings.cameraEnabled
                if !self.settings.cameraEnabled { self.director.camVisible = false }
                self.updateCameraRunning()
            },
            ActionItem("Afficher / masquer la bulle", key: "w", checked: director.camVisible) { [weak self] in self?.toggleCamera() },
            ActionItem("Mode présentateur (plein centre)", key: "v", checked: director.presenter) { [weak self] in self?.togglePresenter() },
            .separator(),
        ]
        for (i, c) in Corner.allCases.enumerated() {
            camItems.append(ActionItem(c.label, key: "\(i + 1)", checked: director.camCorner == c && !director.presenter) { [weak self] in self?.moveCamera(c) })
        }
        camItems.append(.separator())
        for shape in CamShape.allCases {
            camItems.append(ActionItem(shape.label, checked: director.camShape == shape) { [weak self] in
                self?.director.camShape = shape; self?.settings.camShape = shape.rawValue
            })
        }
        camItems.append(ActionItem("Changer de forme", key: "o") { [weak self] in self?.cycleCamShape() })
        camItems.append(.separator())
        for (i, name) in ["Petite", "Moyenne", "Grande"].enumerated() {
            camItems.append(ActionItem("Taille : \(name)", checked: director.camSize == i) { [weak self] in
                self?.director.camSize = i; self?.settings.camSize = i
            })
        }
        camItems.append(ActionItem("Changer de taille", key: "s") { [weak self] in self?.cycleCamSize() })
        camItems.append(.separator())
        camItems.append(header("Appareil"))
        for dev in Devices.cameras() {
            let selected = (settings.cameraID ?? AVCaptureDevice.systemPreferredCamera?.uniqueID) == dev.uniqueID
            camItems.append(ActionItem(dev.localizedName, checked: selected) { [weak self] in
                self?.settings.cameraID = dev.uniqueID
                self?.camera.configure(deviceID: dev.uniqueID)
            })
        }
        menu.addItem(submenu("Caméra", camItems))

        // Mic
        var micItems: [NSMenuItem] = [
            ActionItem("Micro activé", checked: settings.micEnabled, enabled: idle) { [weak self] in self?.settings.micEnabled.toggle() },
            .separator(),
            ActionItem("Micro par défaut du système", checked: settings.micID == nil, enabled: idle) { [weak self] in self?.settings.micID = nil },
        ]
        for dev in Devices.microphones() {
            micItems.append(ActionItem(dev.localizedName, checked: settings.micID == dev.uniqueID, enabled: idle) { [weak self] in
                self?.settings.micID = dev.uniqueID
            })
        }
        menu.addItem(submenu("Micro", micItems))

        // Effects
        var fx: [NSMenuItem] = [
            ActionItem("Zoom qui suit la souris", key: "z", checked: director.zoomManual, enabled: isRecording) { [weak self] in self?.toggleZoom() },
            ActionItem("Auto-zoom sur les clics", key: "a", checked: director.autoZoom, enabled: isRecording) { [weak self] in self?.toggleAutoZoom() },
            ActionItem("Niveau de zoom suivant (×\(fmt(director.zoomLevel)))", key: "x") { [weak self] in self?.cycleZoomLevel() },
            .separator(),
            ActionItem("Grand curseur", key: "m", checked: director.bigCursor, enabled: isRecording) { [weak self] in self?.toggleBigCursor() },
            ActionItem("Halo autour du curseur", key: "h", checked: director.halo) { [weak self] in self?.toggleHalo() },
            ActionItem("Projecteur (assombrit autour)", key: "l", checked: director.spotlightOn, enabled: isRecording) { [weak self] in self?.toggleSpotlight() },
            .separator(),
            ActionItem("Fond stylé (marges + dégradé)", checked: settings.styled, enabled: idle) { [weak self] in self?.settings.styled.toggle() },
        ]
        for (i, p) in Compositor.palettes.enumerated() {
            fx.append(ActionItem("   Fond : \(p.0)", checked: settings.bgIndex == i, enabled: idle && settings.styled) { [weak self] in
                self?.settings.bgIndex = i
            })
        }
        menu.addItem(submenu("Effets", fx))

        // Quality
        let q: [NSMenuItem] = [
            ActionItem("1080p", checked: settings.maxDim == 1920, enabled: idle) { [weak self] in self?.settings.maxDim = 1920 },
            ActionItem("1440p (recommandé)", checked: settings.maxDim == 2560, enabled: idle) { [weak self] in self?.settings.maxDim = 2560 },
            ActionItem("4K / natif", checked: settings.maxDim == 3840, enabled: idle) { [weak self] in self?.settings.maxDim = 3840 },
            .separator(),
            ActionItem("30 images/s", checked: settings.fps == 30, enabled: idle) { [weak self] in self?.settings.fps = 30 },
            ActionItem("60 images/s", checked: settings.fps == 60, enabled: idle) { [weak self] in self?.settings.fps = 60 },
            .separator(),
            ActionItem("Compte à rebours 3-2-1", checked: settings.countdown) { [weak self] in self?.settings.countdown.toggle() },
            ActionItem("Montrer la vidéo dans le Finder à la fin", checked: settings.revealAfter) { [weak self] in self?.settings.revealAfter.toggle() },
        ]
        menu.addItem(submenu("Réglages", q))
        menu.addItem(.separator())
        menu.addItem(ActionItem("Guide des raccourcis", key: "g", checked: guide.isOpen) { [weak self] in self?.guide.toggle() })
        menu.addItem(ActionItem("Aperçu en direct", key: "e", checked: preview.isOpen, enabled: isRecording) { [weak self] in self?.togglePreview() })
        menu.addItem(ActionItem("Viseur de zoom à l'écran", checked: settings.viewfinder) { [weak self] in self?.toggleViewfinder() })
        menu.addItem(ActionItem("Ouvrir le dossier des vidéos") {
            let dir = FileManager.default.urls(for: .moviesDirectory, in: .userDomainMask)[0].appendingPathComponent("SmartDemo")
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            NSWorkspace.shared.open(dir)
        })
        let quit = ActionItem("Quitter SmartDemo") { NSApp.terminate(nil) }
        quit.keyEquivalentModifierMask = [.command]
        quit.keyEquivalent = "q"
        menu.addItem(quit)
    }

    private func alert(_ title: String, _ text: String) {
        NSApp.activate(ignoringOtherApps: true)
        let a = NSAlert()
        a.messageText = title
        a.informativeText = text
        a.runModal()
    }
}

if let i = CommandLine.arguments.firstIndex(of: "--selftest") {
    SelfTest.run(outDir: CommandLine.arguments.count > i + 1 ? CommandLine.arguments[i + 1] : "selftest")
    exit(0)
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
