import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins
import Metal

/// Builds each output frame on the GPU with Core Image:
/// screen → spotlight → cursor FX → (styled frame) → zoom → presenter dim → camera.
final class Compositor {
    let size: CGSize
    let regionPoints: CGSize
    let styled: Bool
    let ctx: CIContext
    private let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
    private let contentRect: CGRect
    private var background: CIImage?

    static let palettes: [(String, CIColor, CIColor)] = [
        ("Indigo → Ciel", CIColor(red: 0.31, green: 0.27, blue: 0.90), CIColor(red: 0.05, green: 0.65, blue: 0.91)),
        ("Coucher de soleil", CIColor(red: 0.98, green: 0.45, blue: 0.09), CIColor(red: 0.86, green: 0.15, blue: 0.47)),
        ("Graphite", CIColor(red: 0.16, green: 0.18, blue: 0.22), CIColor(red: 0.04, green: 0.05, blue: 0.08)),
        ("Menthe", CIColor(red: 0.06, green: 0.73, blue: 0.51), CIColor(red: 0.05, green: 0.40, blue: 0.70)),
        ("Lavande", CIColor(red: 0.75, green: 0.60, blue: 0.98), CIColor(red: 0.40, green: 0.30, blue: 0.85)),
    ]

    init(size: CGSize, regionPoints: CGSize, styled: Bool, backgroundIndex: Int) {
        self.size = size
        self.regionPoints = regionPoints
        self.styled = styled
        if let dev = MTLCreateSystemDefaultDevice() {
            ctx = CIContext(mtlDevice: dev, options: [.cacheIntermediates: false, .name: "SmartDemo"])
        } else {
            ctx = CIContext(options: [.cacheIntermediates: false])
        }
        if styled {
            let f: CGFloat = 0.88
            contentRect = CGRect(x: size.width * (1 - f) / 2, y: size.height * (1 - f) / 2,
                                 width: size.width * f, height: size.height * f)
        } else {
            contentRect = CGRect(origin: .zero, size: size)
        }
        if styled { background = makeBackground(backgroundIndex) }
    }

    func render(_ image: CIImage, to pb: CVPixelBuffer) {
        ctx.render(image, to: pb, bounds: CGRect(origin: .zero, size: size), colorSpace: srgb)
    }

    func renderPreview(_ image: CIImage, to pb: CVPixelBuffer, size p: CGSize) {
        let k = p.width / size.width
        ctx.render(image.transformed(by: CGAffineTransform(scaleX: k, y: k)), to: pb,
                   bounds: CGRect(origin: .zero, size: p), colorSpace: srgb)
    }

    func compose(screen: CVPixelBuffer?, camera: CIImage?, s: RenderState) -> CIImage {
        let W = size.width, H = size.height
        let full = CGRect(origin: .zero, size: size)
        let cr = contentRect
        let local = CGRect(origin: .zero, size: cr.size)

        // 1. Screen content, scaled to the content rect.
        var content: CIImage
        if let screen {
            let img = CIImage(cvPixelBuffer: screen)
            let sx = cr.width / max(img.extent.width, 1)
            let sy = cr.height / max(img.extent.height, 1)
            content = img.transformed(by: CGAffineTransform(translationX: -img.extent.minX, y: -img.extent.minY)
                .concatenating(CGAffineTransform(scaleX: sx, y: sy)))
        } else {
            content = CIImage(color: .black)
        }
        content = content.cropped(to: local)

        let ppp = cr.width / max(regionPoints.width, 1) // pixels per screen point
        let p = CGPoint(x: s.cursorX * cr.width, y: (1 - s.cursorY) * cr.height)

        // 2. Spotlight around the cursor.
        if s.spotlight > 0.01 {
            let R = 170 * ppp
            let g = CIFilter.radialGradient()
            g.center = p
            g.radius0 = Float(R)
            g.radius1 = Float(R * 1.35)
            g.color0 = CIColor(red: 0, green: 0, blue: 0, alpha: 0)
            g.color1 = CIColor(red: 0, green: 0, blue: 0, alpha: 0.62 * s.spotlight)
            if let out = g.outputImage { content = out.cropped(to: local).composited(over: content) }
        }

        // 3. Cursor effects.
        if s.cursorVisible {
            if s.halo {
                let R = 28 * ppp * s.cursorScale
                let g = CIFilter.radialGradient()
                g.center = p
                g.radius0 = Float(R * 0.45)
                g.radius1 = Float(R)
                g.color0 = CIColor(red: 1, green: 0.84, blue: 0.2, alpha: 0.40)
                g.color1 = CIColor(red: 1, green: 0.84, blue: 0.2, alpha: 0)
                if let out = g.outputImage {
                    content = out.cropped(to: CGRect(x: p.x - R, y: p.y - R, width: 2 * R, height: 2 * R)).composited(over: content)
                }
            }
            for r in s.ripples {
                let t = min(r.age / 0.55, 1)
                let e = 1 - pow(1 - t, 3)
                let rad = (8 + 26 * e) * ppp * max(1, s.cursorScale * 0.8)
                let c = CGPoint(x: r.x * cr.width, y: (1 - r.y) * cr.height)
                let rect = CGRect(x: c.x - rad, y: c.y - rad, width: 2 * rad, height: 2 * rad)
                let alpha = 0.75 * (1 - t)
                let color = CIColor(red: 0.30, green: 0.56, blue: 1.0, alpha: alpha)
                let fill = roundedRect(rect, rad, CIColor(red: 0.30, green: 0.56, blue: 1.0, alpha: alpha * 0.22))
                let stroke = CIFilter.roundedRectangleStrokeGenerator()
                stroke.extent = rect
                stroke.radius = Float(rad)
                stroke.width = Float(2.5 * ppp)
                stroke.color = color
                content = fill.composited(over: content)
                if let out = stroke.outputImage { content = out.composited(over: content) }
            }
            if let ci = s.cursorImage, ci.extent.width > 0 {
                let k = ppp * s.cursorScale
                let sx = k * s.cursorPointSize.width / ci.extent.width
                let sy = k * s.cursorPointSize.height / ci.extent.height
                let hx = s.cursorHotspot.x * k
                let hy = (s.cursorPointSize.height - s.cursorHotspot.y) * k
                let t = CGAffineTransform(translationX: -ci.extent.minX, y: -ci.extent.minY)
                    .concatenating(CGAffineTransform(scaleX: sx, y: sy))
                    .concatenating(CGAffineTransform(translationX: p.x - hx, y: p.y - hy))
                content = ci.transformed(by: t, highQualityDownsample: true).composited(over: content)
            }
            content = content.cropped(to: local)
        }

        // 4. Styled frame (gradient background, rounded screen, shadow).
        var canvas: CIImage
        if styled, let bg = background {
            let moved = content.transformed(by: CGAffineTransform(translationX: cr.minX, y: cr.minY))
            let mask = roundedRect(cr, 0.016 * H, .white)
            let clip = CIFilter.sourceInCompositing()
            clip.inputImage = moved
            clip.backgroundImage = mask
            canvas = (clip.outputImage ?? moved).composited(over: bg)
        } else {
            canvas = content
        }

        // 5. Zoom.
        if s.zoom > 1.001 {
            let z = s.zoom
            let cx = cr.minX + s.zoomX * cr.width
            let cy = cr.minY + (1 - s.zoomY) * cr.height
            let vw = W / z, vh = H / z
            let ox = clamp(cx - vw / 2, 0, W - vw)
            let oy = clamp(cy - vh / 2, 0, H - vh)
            let t = CGAffineTransform(a: z, b: 0, c: 0, d: z, tx: -ox * z, ty: -oy * z)
            canvas = canvas.clampedToExtent().transformed(by: t).cropped(to: full)
        }
        canvas = canvas.cropped(to: full)

        // 6. Presenter mode: blur + darken the background.
        if s.presenterDim > 0.01 {
            let down: CGFloat = 0.25
            let blurred = canvas
                .transformed(by: CGAffineTransform(scaleX: down, y: down))
                .clampedToExtent()
                .applyingGaussianBlur(sigma: 9)
                .transformed(by: CGAffineTransform(scaleX: 1 / down, y: 1 / down))
                .cropped(to: full)
            let dark = CIImage(color: CIColor(red: 0, green: 0, blue: 0, alpha: 0.35)).cropped(to: full).composited(over: blurred)
            canvas = withAlpha(dark, s.presenterDim).composited(over: canvas)
        }

        // 7. Camera bubble.
        if s.cam.a > 0.01, s.cam.w > 0.001, s.cam.h > 0.001, let cam = camera {
            let w = s.cam.w * H, h = s.cam.h * H
            let rect = CGRect(x: s.cam.x * H - w / 2, y: H - s.cam.y * H - h / 2, width: w, height: h)
            let radius = min(s.cam.r * H, min(w, h) / 2)
            let e = cam.extent
            let scale = max(w / e.width, h / e.height)
            let t = CGAffineTransform(translationX: -e.midX, y: -e.midY)
                .concatenating(CGAffineTransform(scaleX: -scale, y: scale)) // mirrored, selfie style
                .concatenating(CGAffineTransform(translationX: rect.midX, y: rect.midY))
            let placed = cam.transformed(by: t, highQualityDownsample: true).cropped(to: rect)
            let clip = CIFilter.sourceInCompositing()
            clip.inputImage = placed
            clip.backgroundImage = roundedRect(rect, radius, .white)
            var layer = clip.outputImage ?? placed
            if s.cam.a < 0.999 { layer = withAlpha(layer, s.cam.a) }

            let shadow = roundedRect(rect.offsetBy(dx: 0, dy: -0.006 * H), radius,
                                     CIColor(red: 0, green: 0, blue: 0, alpha: 0.38 * s.cam.a))
                .applyingGaussianBlur(sigma: 0.012 * H)
            let ring = CIFilter.roundedRectangleStrokeGenerator()
            ring.extent = rect
            ring.radius = Float(radius)
            ring.width = Float(max(1, 0.0022 * H))
            ring.color = CIColor(red: 1, green: 1, blue: 1, alpha: 0.22 * s.cam.a)

            canvas = shadow.composited(over: canvas)
            canvas = layer.composited(over: canvas)
            if let r = ring.outputImage { canvas = r.composited(over: canvas) }
        }

        return canvas.cropped(to: full).composited(over: CIImage(color: .black).cropped(to: full))
    }

    // MARK: Helpers

    private func roundedRect(_ r: CGRect, _ radius: CGFloat, _ color: CIColor) -> CIImage {
        let f = CIFilter.roundedRectangleGenerator()
        f.extent = r
        f.radius = Float(max(0, min(radius, min(r.width, r.height) / 2)))
        f.color = color
        return f.outputImage ?? CIImage.empty()
    }

    private func withAlpha(_ img: CIImage, _ a: Double) -> CIImage {
        img.applyingFilter("CIColorMatrix", parameters: ["inputAVector": CIVector(x: 0, y: 0, z: 0, w: CGFloat(a))])
    }

    private func makeBackground(_ index: Int) -> CIImage {
        let full = CGRect(origin: .zero, size: size)
        let pal = Compositor.palettes[((index % Compositor.palettes.count) + Compositor.palettes.count) % Compositor.palettes.count]
        let g = CIFilter.linearGradient()
        g.point0 = CGPoint(x: 0, y: size.height)
        g.point1 = CGPoint(x: size.width, y: 0)
        g.color0 = pal.1
        g.color1 = pal.2
        var bg = (g.outputImage ?? CIImage(color: .black)).cropped(to: full)
        let shadow = roundedRect(contentRect.offsetBy(dx: 0, dy: -0.01 * size.height), 0.016 * size.height,
                                 CIColor(red: 0, green: 0, blue: 0, alpha: 0.45))
            .applyingGaussianBlur(sigma: 0.025 * size.height)
        bg = shadow.composited(over: bg).cropped(to: full)
        if let cg = ctx.createCGImage(bg, from: full, format: .RGBA8, colorSpace: srgb) {
            return CIImage(cgImage: cg)
        }
        return bg
    }
}
