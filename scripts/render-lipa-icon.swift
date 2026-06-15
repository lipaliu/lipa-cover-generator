import AppKit

let outputPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "public/icons/lipa-icon.png"
let size: CGFloat = 512
let image = NSImage(size: NSSize(width: size, height: size))

func color(_ hex: String, _ alpha: CGFloat = 1) -> NSColor {
  let value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
  let scanner = Scanner(string: value)
  var number: UInt64 = 0
  scanner.scanHexInt64(&number)
  return NSColor(
    calibratedRed: CGFloat((number >> 16) & 0xff) / 255,
    green: CGFloat((number >> 8) & 0xff) / 255,
    blue: CGFloat(number & 0xff) / 255,
    alpha: alpha
  )
}

func rounded(_ rect: CGRect, _ radius: CGFloat) -> NSBezierPath {
  NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
}

func drawCenteredText(_ text: String, in rect: CGRect, fontSize: CGFloat, color textColor: NSColor, kern: CGFloat = 0) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  let font = NSFont(name: "Georgia-Bold", size: fontSize) ?? NSFont.systemFont(ofSize: fontSize, weight: .black)
  let attributes: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: textColor,
    .paragraphStyle: paragraph,
    .kern: kern,
  ]
  let attributed = NSAttributedString(string: text, attributes: attributes)
  let textSize = attributed.size()
  let target = CGRect(
    x: rect.midX - textSize.width / 2,
    y: rect.midY - textSize.height / 2,
    width: textSize.width,
    height: textSize.height
  )
  attributed.draw(in: target)
}

image.lockFocus()
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()

let outer = CGRect(x: 22, y: 22, width: 468, height: 468)
let outerPath = rounded(outer, 108)
let shadow = NSShadow()
shadow.shadowColor = color("#281125", 0.34)
shadow.shadowBlurRadius = 38
shadow.shadowOffset = NSSize(width: 0, height: -18)
NSGraphicsContext.saveGraphicsState()
shadow.set()
NSGradient(colors: [color("#281125"), color("#5E3D84"), color("#A68AC5")])?.draw(in: outerPath, angle: 135)
NSGraphicsContext.restoreGraphicsState()

let inset = outer.insetBy(dx: 26, dy: 26)
let insetPath = rounded(inset, 86)
color("#FFFFFF", 0.08).setFill()
insetPath.fill()
color("#FFFFFF", 0.22).setStroke()
insetPath.lineWidth = 3
insetPath.stroke()

let shine = rounded(CGRect(x: 56, y: 320, width: 400, height: 122), 54)
NSGradient(colors: [color("#FFFFFF", 0.28), color("#FFFFFF", 0.02)])?.draw(in: shine, angle: 90)

drawCenteredText("LIPA", in: CGRect(x: 72, y: 238, width: 368, height: 116), fontSize: 108, color: color("#FFFFFF"), kern: 2)
drawCenteredText("COVER", in: CGRect(x: 72, y: 150, width: 368, height: 82), fontSize: 48, color: color("#D8F2DA"), kern: 5)

let footerPath = rounded(CGRect(x: 142, y: 98, width: 228, height: 26), 13)
color("#D8F2DA", 0.18).setFill()
footerPath.fill()

image.unlockFocus()

guard
  let tiff = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiff),
  let png = bitmap.representation(using: .png, properties: [:])
else {
  fatalError("Unable to render PNG")
}

try png.write(to: URL(fileURLWithPath: outputPath))
