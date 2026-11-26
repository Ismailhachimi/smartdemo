// Draws SmartDemo's app icon (1024×1024 PNG). Usage: swift scripts/make-icon.swift <out.png>
//
// Same mark as the web app (web/apps/web/app/icon.svg): two opposite viewfinder corners framing
// a record dot, on a violet tile. Laid out on the macOS icon grid (824 px body, centered).
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
func gradient(_ colors: [CGColor], _ locs: [CGFloat]) -> CGGradient {
    CGGradient(colorsSpace: cs, colors: colors as CFArray, locations: locs)!
}

// Work top-down like the SVG: y grows downwards.
ctx.translateBy(x: 0, y: S)
ctx.scaleBy(x: 1, y: -1)

let body = CGRect(x: 100, y: 100, width: 824, height: 824)
let k = body.width / 32 // SVG units → pixels
func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: body.minX + x * k, y: body.minY + y * k) }
let bodyPath = CGPath(roundedRect: body, cornerWidth: 186, cornerHeight: 186, transform: nil)

// Drop shadow (falls downwards on screen).
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: 14), blur: 34, color: rgb(0x000000, 0.32))
ctx.addPath(bodyPath)
ctx.setFillColor(rgb(0x4A31E8))
ctx.fillPath()
ctx.restoreGState()

// Tile: violet, lighter top-left to deeper bottom-right.
ctx.saveGState()
ctx.addPath(bodyPath)
ctx.clip()
ctx.drawLinearGradient(gradient([rgb(0x6A4DFF), rgb(0x3B1FD6)], [0, 1]),
                       start: CGPoint(x: body.minX, y: body.minY), end: CGPoint(x: body.maxX, y: body.maxY), options: [])
// Soft light from the top.
ctx.drawLinearGradient(gradient([rgb(0xFFFFFF, 0.22), rgb(0xFFFFFF, 0)], [0, 1]),
                       start: CGPoint(x: 0, y: body.minY), end: CGPoint(x: 0, y: body.minY + body.height * 0.55), options: [])
ctx.restoreGState()

// Hairline edge.
ctx.addPath(CGPath(roundedRect: body.insetBy(dx: 2, dy: 2), cornerWidth: 184, cornerHeight: 184, transform: nil))
ctx.setStrokeColor(rgb(0xFFFFFF, 0.14))
ctx.setLineWidth(4)
ctx.strokePath()

// Viewfinder corners: top-left and bottom-right.
func corner(from a: CGPoint, via c: CGPoint, to b: CGPoint) {
    ctx.move(to: a)
    ctx.addArc(tangent1End: c, tangent2End: b, radius: 2.5 * k)
    ctx.addLine(to: b)
}
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: 6), blur: 18, color: rgb(0x1A0E6B, 0.35))
corner(from: p(8.5, 14.5), via: p(8.5, 8.5), to: p(14.5, 8.5))
corner(from: p(23.5, 17.5), via: p(23.5, 23.5), to: p(17.5, 23.5))
ctx.setStrokeColor(rgb(0xFFFFFF))
ctx.setLineWidth(2.8 * k)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)
ctx.strokePath()
ctx.restoreGState()

// Record dot, with a glow and a small highlight.
let dot = p(16, 16)
let r = 3.3 * k
ctx.saveGState()
ctx.setShadow(offset: .zero, blur: 40, color: rgb(0xFF4D58, 0.65))
ctx.addEllipse(in: CGRect(x: dot.x - r, y: dot.y - r, width: 2 * r, height: 2 * r))
ctx.setFillColor(rgb(0xFF4D58))
ctx.fillPath()
ctx.restoreGState()
ctx.saveGState()
ctx.addEllipse(in: CGRect(x: dot.x - r, y: dot.y - r, width: 2 * r, height: 2 * r))
ctx.clip()
ctx.drawRadialGradient(gradient([rgb(0xFFFFFF, 0.35), rgb(0xFFFFFF, 0)], [0, 1]),
                       startCenter: CGPoint(x: dot.x - r * 0.35, y: dot.y - r * 0.4), startRadius: 0,
                       endCenter: CGPoint(x: dot.x - r * 0.35, y: dot.y - r * 0.4), endRadius: r * 0.9, options: [])
ctx.restoreGState()

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon.png"
let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("✅ \(out)")
