import AppKit
import CoreImage

/// `SmartDemo --selftest <dir>`: renders a few frames through the compositor with synthetic
/// screen/camera input, to check every effect without needing capture permissions.
enum SelfTest {
    static func run(outDir: String) {
        _ = NSApplication.shared
        let size = CGSize(width: 2560, height: 1664)
        let region = CGSize(width: 1512, height: 982)
        var pb: CVPixelBuffer?
        CVPixelBufferCreate(nil, 3024, 1964, kCVPixelFormatType_32BGRA,
                            [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pb)
        let ctx = CIContext()
        // Fake "screen": checkerboard + text-ish stripes
        let checker = CIFilter(name: "CICheckerboardGenerator", parameters: [
            "inputWidth": 120, "inputColor0": CIColor(red: 0.95, green: 0.95, blue: 0.97),
            "inputColor1": CIColor(red: 0.85, green: 0.88, blue: 0.95), "inputCenter": CIVector(x: 0, y: 0)])!.outputImage!
        ctx.render(checker.cropped(to: CGRect(x: 0, y: 0, width: 3024, height: 1964)), to: pb!)
        // Fake camera: warm radial gradient
        let cam = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: 960, y: 540), "inputRadius0": 50, "inputRadius1": 700,
            "inputColor0": CIColor(red: 1, green: 0.8, blue: 0.6), "inputColor1": CIColor(red: 0.3, green: 0.2, blue: 0.5)])!
            .outputImage!.cropped(to: CGRect(x: 0, y: 0, width: 1920, height: 1080))
        let cursorCG = cursorCGImage(NSCursor.arrow.image)
        print("cursor image:", cursorCG.map { "\($0.width)x\($0.height)" } ?? "nil")
        let cursor: CIImage? = cursorCG.map { CIImage(cgImage: $0) }

        func base() -> RenderState {
            var s = RenderState()
            s.cursorVisible = true; s.cursorX = 0.6; s.cursorY = 0.4
            s.cursorImage = cursor; s.cursorPointSize = NSCursor.arrow.image.size; s.cursorHotspot = NSCursor.arrow.hotSpot
            let A = size.width / size.height
            s.cam = CamFrame(x: 0.035 + 0.12, y: 1 - 0.035 - 0.12, w: 0.24, h: 0.24, r: 0.12, a: 1)
            _ = A
            return s
        }
        var cases: [(String, RenderState, Bool)] = []
        cases.append(("1-plain", base(), false))
        var z = base(); z.zoom = 2; z.zoomX = 0.6; z.zoomY = 0.4; z.ripples = [Ripple(x: 0.6, y: 0.4, age: 0.15)]; z.cursorScale = 2.2; z.halo = true
        cases.append(("2-zoom-bigcursor-ripple-halo", z, false))
        var p = base(); p.presenterDim = 1
        let A = Double(size.width / size.height)
        var h = 0.8, w = h * 16 / 9; if w > A * 0.9 { w = A * 0.9; h = w * 9 / 16 }
        p.cam = CamFrame(x: A / 2, y: 0.5, w: w, h: h, r: 0.03, a: 1)
        cases.append(("3-presenter", p, false))
        var sp = base(); sp.spotlight = 1; sp.cam = CamFrame(x: A - 0.035 - 0.2, y: 0.035 + 0.11, w: 0.4, h: 0.22, r: 0.03, a: 1)
        cases.append(("4-spotlight-rect-cam-styled", sp, true))

        try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
        for (name, st, styled) in cases {
            let comp = Compositor(size: size, regionPoints: region, styled: styled, backgroundIndex: 0)
            let t0 = CACurrentMediaTime()
            var out: CVPixelBuffer?
            CVPixelBufferCreate(nil, Int(size.width), Int(size.height), kCVPixelFormatType_32BGRA,
                                [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &out)
            let img = comp.compose(screen: pb, camera: cam, s: st)
            for _ in 0..<30 { comp.render(img, to: out!) }
            let ms = (CACurrentMediaTime() - t0) / 30 * 1000
            let cg = comp.ctx.createCGImage(CIImage(cvPixelBuffer: out!), from: CGRect(origin: .zero, size: size))!
            let rep = NSBitmapImageRep(cgImage: cg)
            try? rep.representation(using: .jpeg, properties: [.compressionFactor: 0.8])?
                .write(to: URL(fileURLWithPath: outDir).appendingPathComponent("\(name).jpg"))
            print(String(format: "%@: %.2f ms/frame", name, ms))
        }
    }
}
