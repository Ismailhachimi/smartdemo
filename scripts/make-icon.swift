// Draws SmartDemo's app icon (1024×1024 PNG). Usage: swift scripts/make-icon.swift <out.png>
import AppKit
import CoreGraphics

let S: CGFloat = 1024
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8, bytesPerRow: 0,
                    space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!

func rgb(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255, alpha: a)
}
func linear(_ colors: [CGColor], _ locs: [CGFloat], from: CGPoint, to: CGPoint) {
    let g = CGGradient(colorsSpace: cs, colors: colors as CFArray, locations: locs)!
    ctx.drawLinearGradient(g, start: from, end: to, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
}
func radial(_ colors: [CGColor], _ locs: [CGFloat], c: CGPoint, r: CGFloat) {
    let g = CGGradient(colorsSpace: cs, colors: colors as CFArray, locations: locs)!
    ctx.drawRadialGradient(g, startCenter: c, startRadius: 0, endCenter: c, endRadius: r, options: [])
}

// Body (macOS icon grid: 824 px squircle centered)
let body = CGRect(x: 100, y: 100, width: 824, height: 824)
let bodyPath = CGPath(roundedRect: body, cornerWidth: 186, cornerHeight: 186, transform: nil)

ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -14), blur: 30, color: rgb(0x000000, 0.35))
ctx.addPath(bodyPath); ctx.setFillColor(rgb(0x1A1240)); ctx.fillPath()
ctx.restoreGState()

ctx.saveGState()
ctx.addPath(bodyPath); ctx.clip()
linear([rgb(0x6A52FF), rgb(0x3A23C9), rgb(0x150E3A)], [0, 0.5, 1], from: CGPoint(x: 260, y: 924), to: CGPoint(x: 760, y: 100))
radial([rgb(0xFF4D8D, 0.55), rgb(0xFF4D8D, 0)], [0, 1], c: CGPoint(x: 860, y: 160), r: 520)
radial([rgb(0x38BDF8, 0.35), rgb(0x38BDF8, 0)], [0, 1], c: CGPoint(x: 140, y: 900), r: 460)
// top gloss
linear([rgb(0xFFFFFF, 0.16), rgb(0xFFFFFF, 0)], [0, 1], from: CGPoint(x: 512, y: 924), to: CGPoint(x: 512, y: 560))
ctx.restoreGState()
// inner hairline
ctx.addPath(CGPath(roundedRect: body.insetBy(dx: 2, dy: 2), cornerWidth: 184, cornerHeight: 184, transform: nil))
ctx.setStrokeColor(rgb(0xFFFFFF, 0.18)); ctx.setLineWidth(3); ctx.strokePath()

let c = CGPoint(x: 512, y: 512)
func circle(_ r: CGFloat) -> CGRect { CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r) }

// Lens barrel
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -18), blur: 40, color: rgb(0x000000, 0.45))
ctx.addEllipse(in: circle(238)); ctx.setFillColor(rgb(0x0E0A24)); ctx.fillPath()
ctx.restoreGState()
ctx.saveGState()
ctx.addEllipse(in: circle(238)); ctx.addEllipse(in: circle(206)); ctx.clip(using: .evenOdd)
linear([rgb(0xF4F1FF), rgb(0x9C92D9), rgb(0x4B3F96)], [0, 0.5, 1], from: CGPoint(x: 340, y: 760), to: CGPoint(x: 690, y: 270))
ctx.restoreGState()
// Glass
ctx.saveGState()
ctx.addEllipse(in: circle(206)); ctx.clip()
radial([rgb(0x2B2170), rgb(0x0B0820)], [0, 1], c: CGPoint(x: 470, y: 560), r: 230)
ctx.restoreGState()
// inner ring
ctx.addEllipse(in: circle(150)); ctx.setStrokeColor(rgb(0x7C6BFF, 0.35)); ctx.setLineWidth(6); ctx.strokePath()

// Record dot with glow
ctx.saveGState()
ctx.setShadow(offset: .zero, blur: 60, color: rgb(0xFF2D55, 0.9))
ctx.addEllipse(in: circle(84)); ctx.setFillColor(rgb(0xFF2D55)); ctx.fillPath()
ctx.restoreGState()
ctx.saveGState()
ctx.addEllipse(in: circle(84)); ctx.clip()
radial([rgb(0xFF8FA6), rgb(0xFF2D55), rgb(0xC2133A)], [0, 0.55, 1], c: CGPoint(x: 488, y: 540), r: 110)
ctx.restoreGState()

// Specular highlights on glass
ctx.saveGState()
ctx.addEllipse(in: circle(206)); ctx.clip()
ctx.translateBy(x: 420, y: 615); ctx.rotate(by: .pi / 5)
ctx.addEllipse(in: CGRect(x: -70, y: -28, width: 140, height: 56)); ctx.setFillColor(rgb(0xFFFFFF, 0.22)); ctx.fillPath()
ctx.restoreGState()
ctx.addEllipse(in: CGRect(x: 600, y: 410, width: 26, height: 26)); ctx.setFillColor(rgb(0xFFFFFF, 0.25)); ctx.fillPath()

// Viewfinder brackets (zoom framing)
let half: CGFloat = 296, arm: CGFloat = 96
ctx.setLineCap(.round); ctx.setLineJoin(.round)
for (sx, sy) in [(-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)] as [(CGFloat, CGFloat)] {
    let corner = CGPoint(x: c.x + sx * half, y: c.y + sy * half)
    let p = CGMutablePath()
    p.move(to: CGPoint(x: corner.x - sx * arm, y: corner.y))
    p.addLine(to: corner)
    p.addLine(to: CGPoint(x: corner.x, y: corner.y - sy * arm))
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -4), blur: 18, color: rgb(0xFFC21A, 0.55))
    ctx.addPath(p); ctx.setStrokeColor(rgb(0xFFD23F)); ctx.setLineWidth(30); ctx.strokePath()
    ctx.restoreGState()
}

let img = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: img)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
print("wrote", CommandLine.arguments[1])
