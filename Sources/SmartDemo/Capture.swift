import AppKit
import AVFoundation
import CoreImage
import ScreenCaptureKit

// MARK: - What to record

enum TargetSpec: Equatable {
    case display(CGDirectDisplayID)
    case window(CGWindowID, String)
    case app(pid_t, String)
    case area(CGDirectDisplayID, CGRect)

    var label: String {
        switch self {
        case .display(let id):
            return "Écran entier" + (NSScreen.screens.count > 1 ? " (\(Geo.screen(for: id)?.localizedName ?? "écran"))" : "")
        case .window(_, let name): return "Fenêtre : \(name)"
        case .app(_, let name): return "App : \(name)"
        case .area(_, let r): return "Zone \(Int(r.width))×\(Int(r.height))"
        }
    }
}

struct WindowInfo {
    let id: CGWindowID
    let pid: pid_t
    let owner: String
    let title: String
    let bounds: CGRect
    var label: String {
        let t = title.isEmpty ? owner : "\(owner) — \(title)"
        return t.count > 70 ? String(t.prefix(67)) + "…" : t
    }
}

enum WindowLister {
    static func windows() -> [WindowInfo] {
        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
        let me = getpid()
        return list.compactMap { info in
            guard (info[kCGWindowLayer as String] as? Int) == 0,
                  let pid = info[kCGWindowOwnerPID as String] as? pid_t, pid != me,
                  let id = info[kCGWindowNumber as String] as? CGWindowID,
                  let bd = info[kCGWindowBounds as String] as? NSDictionary,
                  let b = CGRect(dictionaryRepresentation: bd as CFDictionary),
                  b.width > 120, b.height > 80 else { return nil }
            let owner = info[kCGWindowOwnerName as String] as? String ?? "?"
            let title = info[kCGWindowName as String] as? String ?? ""
            return WindowInfo(id: id, pid: pid, owner: owner, title: title, bounds: b)
        }
    }

    static func bounds(of id: CGWindowID) -> CGRect? {
        guard let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]],
              let bd = list.first?[kCGWindowBounds as String] as? NSDictionary else { return nil }
        return CGRect(dictionaryRepresentation: bd as CFDictionary)
    }

    static func display(forPID pid: pid_t) -> CGDirectDisplayID {
        let wins = windows().filter { $0.pid == pid }.sorted { $0.bounds.width * $0.bounds.height > $1.bounds.width * $1.bounds.height }
        guard let w = wins.first else { return CGMainDisplayID() }
        return Geo.display(containing: CGPoint(x: w.bounds.midX, y: w.bounds.midY))
    }

    static func apps() -> [NSRunningApplication] {
        NSWorkspace.shared.runningApplications
            .filter { $0.activationPolicy == .regular && $0.processIdentifier != getpid() }
            .sorted { ($0.localizedName ?? "") < ($1.localizedName ?? "") }
    }
}

struct StreamSetup {
    let filter: SCContentFilter
    let config: SCStreamConfiguration
    let region: CGRect          // global top-left points
    let pixelSize: CGSize       // capture size in pixels
    let regionUpdater: (() -> CGRect?)?
    let activatePID: pid_t?
}

enum TargetResolver {
    /// Synchronous best guess of the region (for the camera preview before recording).
    static func region(for spec: TargetSpec) -> CGRect {
        switch spec {
        case .display(let id): return CGDisplayBounds(id)
        case .window(let id, _): return WindowLister.bounds(of: id) ?? CGDisplayBounds(CGMainDisplayID())
        case .app(let pid, _): return CGDisplayBounds(WindowLister.display(forPID: pid))
        case .area(_, let r): return r
        }
    }

    static func updater(for spec: TargetSpec) -> (() -> CGRect?)? {
        if case .window(let id, _) = spec { return { WindowLister.bounds(of: id) } }
        return nil
    }

    static func resolve(_ spec: TargetSpec, content: SCShareableContent, fps: Int) throws -> StreamSetup {
        let me = ProcessInfo.processInfo.processIdentifier
        let own = content.applications.filter { $0.processID == me }
        func scDisplay(_ id: CGDirectDisplayID) throws -> SCDisplay {
            if let d = content.displays.first(where: { $0.displayID == id }) { return d }
            if let d = content.displays.first { return d }
            throw SmartDemoError("Aucun écran disponible pour l'enregistrement.")
        }

        let filter: SCContentFilter
        var region: CGRect
        var sourceRect: CGRect?
        var updater: (() -> CGRect?)?
        var activate: pid_t?

        switch spec {
        case .display(let id):
            let d = try scDisplay(id)
            filter = SCContentFilter(display: d, excludingApplications: own, exceptingWindows: [])
            region = CGDisplayBounds(d.displayID)
        case .area(let id, let r):
            let d = try scDisplay(id)
            filter = SCContentFilter(display: d, excludingApplications: own, exceptingWindows: [])
            let db = CGDisplayBounds(d.displayID)
            region = r.intersection(db)
            sourceRect = region.offsetBy(dx: -db.minX, dy: -db.minY)
        case .window(let wid, _):
            guard let w = content.windows.first(where: { $0.windowID == wid }) else {
                throw SmartDemoError("Cette fenêtre n'est plus disponible. Choisis-en une autre.")
            }
            filter = SCContentFilter(desktopIndependentWindow: w)
            region = w.frame
            updater = { WindowLister.bounds(of: wid) }
            activate = w.owningApplication?.processID
        case .app(let pid, _):
            guard let app = content.applications.first(where: { $0.processID == pid }) else {
                throw SmartDemoError("Cette application n'a plus de fenêtre à enregistrer.")
            }
            let d = try scDisplay(WindowLister.display(forPID: pid))
            filter = SCContentFilter(display: d, including: [app], exceptingWindows: [])
            region = CGDisplayBounds(d.displayID)
            activate = pid
        }

        let scale = CGFloat(max(1, filter.pointPixelScale))
        var px = CGSize(width: region.width * scale, height: region.height * scale)
        let cap: CGFloat = 3840
        if max(px.width, px.height) > cap {
            let k = cap / max(px.width, px.height)
            px = CGSize(width: px.width * k, height: px.height * k)
        }
        px = CGSize(width: even(px.width), height: even(px.height))

        let config = SCStreamConfiguration()
        config.width = Int(px.width)
        config.height = Int(px.height)
        config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(max(fps, 30)))
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.colorSpaceName = CGColorSpace.sRGB
        config.showsCursor = false // we draw our own animated cursor
        config.queueDepth = 6
        config.scalesToFit = true
        config.preservesAspectRatio = true
        config.captureResolution = .best
        if let sr = sourceRect { config.sourceRect = sr }

        return StreamSetup(filter: filter, config: config, region: region, pixelSize: px,
                           regionUpdater: updater, activatePID: activate)
    }
}

// MARK: - Screen capture

final class ScreenCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private let queue = DispatchQueue(label: "smartdemo.screen", qos: .userInteractive)
    private let lock = NSLock()
    private var latest: CVPixelBuffer?
    var onStop: ((Error) -> Void)?

    func start(filter: SCContentFilter, config: SCStreamConfiguration) async throws {
        let s = SCStream(filter: filter, configuration: config, delegate: self)
        try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        try await s.startCapture()
        stream = s
    }

    func stop() async {
        if let s = stream { try? await s.stopCapture() }
        stream = nil
        lock.withLock { latest = nil }
    }

    func latestFrame() -> CVPixelBuffer? {
        lock.lock(); defer { lock.unlock() }
        return latest
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sb.isValid,
              let arr = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = arr.first?[.status] as? Int,
              SCFrameStatus(rawValue: raw) == .complete,
              let pb = sb.imageBuffer else { return }
        lock.lock(); latest = pb; lock.unlock()
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        onStop?(error)
    }
}

// MARK: - Devices

enum Devices {
    static func cameras() -> [AVCaptureDevice] {
        AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera, .external, .continuityCamera],
                                         mediaType: .video, position: .unspecified).devices
    }

    static func microphones() -> [AVCaptureDevice] {
        AVCaptureDevice.DiscoverySession(deviceTypes: [.microphone, .external],
                                         mediaType: .audio, position: .unspecified).devices
    }
}

// MARK: - Camera

final class CameraCapture: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let session = AVCaptureSession()
    private let output = AVCaptureVideoDataOutput()
    private let queue = DispatchQueue(label: "smartdemo.camera", qos: .userInitiated)
    private let sessionQueue = DispatchQueue(label: "smartdemo.camera.session")
    private let lock = NSLock()
    private var latest: CIImage?
    private(set) var deviceName: String?
    var onConfigured: (() -> Void)?

    func configure(deviceID: String?) {
        sessionQueue.async { [self] in
            session.beginConfiguration()
            session.inputs.forEach { session.removeInput($0) }
            let device = deviceID.flatMap { AVCaptureDevice(uniqueID: $0) }
                ?? AVCaptureDevice.systemPreferredCamera
                ?? AVCaptureDevice.default(for: .video)
            if let device, let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) {
                session.addInput(input)
                deviceName = device.localizedName
            }
            if session.outputs.isEmpty {
                output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
                output.alwaysDiscardsLateVideoFrames = true
                output.setSampleBufferDelegate(self, queue: queue)
                if session.canAddOutput(output) { session.addOutput(output) }
            }
            if session.canSetSessionPreset(.hd1920x1080) {
                session.sessionPreset = .hd1920x1080
            } else {
                session.sessionPreset = .high
            }
            session.commitConfiguration()
            DispatchQueue.main.async { self.onConfigured?() }
        }
    }

    func setRunning(_ run: Bool) {
        sessionQueue.async { [self] in
            if run, !session.isRunning {
                session.startRunning()
            } else if !run, session.isRunning {
                session.stopRunning()
                lock.lock(); latest = nil; lock.unlock()
            }
        }
    }

    func latestImage() -> CIImage? {
        lock.lock(); defer { lock.unlock() }
        return latest
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sb: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pb = sb.imageBuffer else { return }
        let img = CIImage(cvPixelBuffer: pb)
        lock.lock(); latest = img; lock.unlock()
    }
}

// MARK: - Microphone

final class MicCapture: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let session = AVCaptureSession()
    private let output = AVCaptureAudioDataOutput()
    private let queue = DispatchQueue(label: "smartdemo.mic", qos: .userInteractive)
    private let sessionQueue = DispatchQueue(label: "smartdemo.mic.session")
    var onSample: ((CMSampleBuffer) -> Void)?

    func start(deviceID: String?) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            sessionQueue.async { [self] in
                do {
                    session.beginConfiguration()
                    session.inputs.forEach { session.removeInput($0) }
                    guard let dev = deviceID.flatMap({ AVCaptureDevice(uniqueID: $0) }) ?? AVCaptureDevice.default(for: .audio) else {
                        session.commitConfiguration()
                        throw SmartDemoError("Aucun micro trouvé.")
                    }
                    let input = try AVCaptureDeviceInput(device: dev)
                    if session.canAddInput(input) { session.addInput(input) }
                    if session.outputs.isEmpty {
                        output.audioSettings = [
                            AVFormatIDKey: kAudioFormatLinearPCM,
                            AVSampleRateKey: 48000,
                            AVNumberOfChannelsKey: 1,
                            AVLinearPCMBitDepthKey: 32,
                            AVLinearPCMIsFloatKey: true,
                            AVLinearPCMIsNonInterleaved: false,
                            AVLinearPCMIsBigEndianKey: false,
                        ]
                        output.setSampleBufferDelegate(self, queue: queue)
                        if session.canAddOutput(output) { session.addOutput(output) }
                    }
                    session.commitConfiguration()
                    session.startRunning()
                    cont.resume()
                } catch {
                    cont.resume(throwing: error)
                }
            }
        }
    }

    func stop() {
        sessionQueue.sync { if session.isRunning { session.stopRunning() } }
        queue.sync {}
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sb: CMSampleBuffer, from connection: AVCaptureConnection) {
        onSample?(sb)
    }
}
