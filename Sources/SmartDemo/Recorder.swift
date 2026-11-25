import AVFoundation
import CoreImage
import ScreenCaptureKit

/// Owns the capture stream + AVAssetWriter. A fixed-rate render loop composes each frame
/// (so zoom/camera animations stay fluid even when the screen itself is static).
final class Recorder {
    private let screen = ScreenCapture()
    let mic = MicCapture()
    weak var camera: CameraCapture?

    private var writer: AVAssetWriter?
    private var vInput: AVAssetWriterInput?
    private var aInput: AVAssetWriterInput?
    private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var compositor: Compositor?
    private var timer: DispatchSourceTimer?
    private let renderQueue = DispatchQueue(label: "smartdemo.render", qos: .userInteractive)

    private let lock = NSLock()
    private var recording = false
    private var paused = false
    private var firstPTS: CMTime?
    private var lastVideoPTS = CMTime.negativeInfinity
    private var pauseOffset = CMTime.zero
    private var pauseStart: CMTime?
    private var audioClockOffset: CMTime?
    private var url: URL?
    private var fps = 60

    var onStreamError: ((Error) -> Void)?

    // Live preview: a downscaled copy of every other frame, delivered on the main thread.
    var onPreview: ((IOSurfaceRef) -> Void)?
    private var previewOn = false
    private var previewBuffers: [CVPixelBuffer] = []
    private var previewSize = CGSize.zero
    private var outputSize = CGSize.zero
    private var frameCount = 0

    func setPreviewEnabled(_ on: Bool) { lock.withLock { previewOn = on } }

    var isPaused: Bool { lock.lock(); defer { lock.unlock() }; return paused }

    private static func hostNow() -> CMTime { CMClockGetTime(CMClockGetHostTimeClock()) }

    func prepare(setup: StreamSetup, outputSize: CGSize, fps: Int, styled: Bool, bgIndex: Int,
                 url: URL, micDeviceID: String?) async throws {
        self.fps = fps
        self.url = url
        lock.withLock {
            firstPTS = nil; lastVideoPTS = .negativeInfinity; pauseOffset = .zero; pauseStart = nil
            audioClockOffset = nil; paused = false; recording = false
        }

        self.outputSize = outputSize
        let pw = min(CGFloat(960), outputSize.width)
        previewSize = CGSize(width: even(pw), height: even(pw * outputSize.height / outputSize.width))
        previewBuffers = (0..<3).compactMap { _ in
            var pb: CVPixelBuffer?
            CVPixelBufferCreate(nil, Int(previewSize.width), Int(previewSize.height), kCVPixelFormatType_32BGRA,
                                [kCVPixelBufferIOSurfacePropertiesKey: [:], kCVPixelBufferMetalCompatibilityKey: true] as CFDictionary, &pb)
            return pb
        }
        compositor = Compositor(size: outputSize, regionPoints: setup.region.size, styled: styled, backgroundIndex: bgIndex)

        try? FileManager.default.removeItem(at: url)
        let w = try AVAssetWriter(outputURL: url, fileType: .mp4)
        w.shouldOptimizeForNetworkUse = true

        let W = Int(outputSize.width), H = Int(outputSize.height)
        let bitrate = Int(Double(W * H * fps) * 0.13)
        let vSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: W,
            AVVideoHeightKey: H,
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: bitrate,
                AVVideoExpectedSourceFrameRateKey: fps,
                AVVideoMaxKeyFrameIntervalKey: fps * 2,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            ],
        ]
        let vi = AVAssetWriterInput(mediaType: .video, outputSettings: vSettings)
        vi.expectsMediaDataInRealTime = true
        let ad = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vi, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: W,
            kCVPixelBufferHeightKey as String: H,
            kCVPixelBufferMetalCompatibilityKey as String: true,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        ])
        guard w.canAdd(vi) else { throw SmartDemoError("Impossible de configurer l'encodeur vidéo.") }
        w.add(vi)

        var ai: AVAssetWriterInput?
        if let micDeviceID = micDeviceID {
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 128_000,
            ])
            a.expectsMediaDataInRealTime = true
            if w.canAdd(a) { w.add(a); ai = a }
            mic.onSample = { [weak self] sb in self?.appendAudio(sb) }
            try await mic.start(deviceID: micDeviceID.isEmpty ? nil : micDeviceID)
        }

        writer = w; vInput = vi; aInput = ai; adaptor = ad

        screen.onStop = { [weak self] err in self?.onStreamError?(err) }
        try await screen.start(filter: setup.filter, config: setup.config)
    }

    /// Starts writing (call after the countdown).
    func begin() {
        guard let writer, writer.startWriting() else { return }
        lock.lock(); recording = true; lock.unlock()
        let t = DispatchSource.makeTimerSource(flags: .strict, queue: renderQueue)
        t.schedule(deadline: .now(), repeating: 1.0 / Double(fps), leeway: .milliseconds(1))
        t.setEventHandler { [weak self] in self?.renderFrame() }
        t.resume()
        timer = t
    }

    func togglePause() -> Bool {
        lock.lock(); defer { lock.unlock() }
        let now = Recorder.hostNow()
        if paused {
            if let ps = pauseStart { pauseOffset = CMTimeAdd(pauseOffset, CMTimeSubtract(now, ps)) }
            pauseStart = nil
            paused = false
        } else {
            pauseStart = now
            paused = true
        }
        return paused
    }

    func elapsed() -> TimeInterval {
        lock.lock(); defer { lock.unlock() }
        guard let first = firstPTS else { return 0 }
        let end = paused ? (pauseStart ?? Recorder.hostNow()) : Recorder.hostNow()
        return max(0, CMTimeSubtract(CMTimeSubtract(end, pauseOffset), first).seconds)
    }

    /// Stops and returns the finished file URL (nil if nothing was recorded).
    func stop(discard: Bool = false) async -> URL? {
        lock.withLock { recording = false }
        timer?.cancel(); timer = nil
        renderQueue.sync {}
        mic.stop()
        mic.onSample = nil
        await screen.stop()

        defer { writer = nil; vInput = nil; aInput = nil; adaptor = nil; compositor = nil }
        guard let writer else { return nil }
        let started = lock.withLock { firstPTS != nil }
        if !started || discard || writer.status != .writing {
            if writer.status == .writing { writer.cancelWriting() }
            if let url { try? FileManager.default.removeItem(at: url) }
            return nil
        }
        vInput?.markAsFinished()
        aInput?.markAsFinished()
        await writer.finishWriting()
        return writer.status == .completed ? url : nil
    }

    // MARK: Render loop

    private func renderFrame() {
        lock.lock()
        let isRec = recording, isPaused = paused, offset = pauseOffset
        lock.unlock()
        guard isRec, !isPaused, let writer, writer.status == .writing,
              let vInput, let adaptor, let compositor else { return }

        let pts = CMTimeSubtract(Recorder.hostNow(), offset)
        lock.lock()
        if firstPTS == nil {
            writer.startSession(atSourceTime: pts)
            firstPTS = pts
        }
        lock.unlock()

        guard CMTimeCompare(pts, lastVideoPTS) > 0, vInput.isReadyForMoreMediaData,
              let pool = adaptor.pixelBufferPool else { return }
        var pbOut: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pbOut)
        guard let pb = pbOut else { return }

        autoreleasepool {
            let state = Director.shared.snapshot()
            let cam = state.cam.a > 0.01 ? camera?.latestImage() : nil
            let img = compositor.compose(screen: screen.latestFrame(), camera: cam, s: state)
            compositor.render(img, to: pb)
            frameCount += 1
            let wantPreview = lock.withLock { previewOn }
            if wantPreview, frameCount % 2 == 0, previewBuffers.count == 3, let handler = onPreview {
                let ppb = previewBuffers[(frameCount / 2) % 3]
                compositor.renderPreview(img, to: ppb, size: previewSize)
                if let surface = CVPixelBufferGetIOSurface(ppb)?.takeUnretainedValue() {
                    DispatchQueue.main.async { handler(surface) }
                }
            }
        }
        if adaptor.append(pb, withPresentationTime: pts) { lastVideoPTS = pts }
    }

    // MARK: Audio

    private func appendAudio(_ sb: CMSampleBuffer) {
        lock.lock(); defer { lock.unlock() }
        guard recording, !paused, let first = firstPTS, let aInput, let writer, writer.status == .writing else { return }
        let raw = sb.presentationTimeStamp
        if audioClockOffset == nil {
            let diff = CMTimeSubtract(Recorder.hostNow(), raw)
            audioClockOffset = abs(diff.seconds) > 0.5 ? diff : .zero
        }
        let delta = CMTimeSubtract(audioClockOffset ?? .zero, pauseOffset)
        let pts = CMTimeAdd(raw, delta)
        guard CMTimeCompare(pts, first) >= 0, aInput.isReadyForMoreMediaData else { return }
        guard let shifted = Recorder.shift(sb, by: delta) else { return }
        aInput.append(shifted)
    }

    private static func shift(_ sb: CMSampleBuffer, by delta: CMTime) -> CMSampleBuffer? {
        if CMTimeCompare(delta, .zero) == 0 { return sb }
        var count: CMItemCount = 0
        CMSampleBufferGetSampleTimingInfoArray(sb, entryCount: 0, arrayToFill: nil, entriesNeededOut: &count)
        guard count > 0 else { return nil }
        var infos = [CMSampleTimingInfo](repeating: CMSampleTimingInfo(), count: count)
        CMSampleBufferGetSampleTimingInfoArray(sb, entryCount: count, arrayToFill: &infos, entriesNeededOut: &count)
        for i in infos.indices {
            infos[i].presentationTimeStamp = CMTimeAdd(infos[i].presentationTimeStamp, delta)
            if infos[i].decodeTimeStamp.isValid {
                infos[i].decodeTimeStamp = CMTimeAdd(infos[i].decodeTimeStamp, delta)
            }
        }
        var out: CMSampleBuffer?
        CMSampleBufferCreateCopyWithNewTiming(allocator: nil, sampleBuffer: sb, sampleTimingEntryCount: count,
                                              sampleTimingArray: &infos, sampleBufferOut: &out)
        return out
    }
}
