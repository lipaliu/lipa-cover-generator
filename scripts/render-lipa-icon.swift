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
  paragraph.alignment = .left
  let font = NSFont.systemFont(ofSize: fontSize, weight: .bold)
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

let outer = CGRect(x: 26, y: 26, width: 460, height: 460)
let outerPath = rounded(outer, 54)
let shadow = NSShadow()
shadow.shadowColor = color("#6F5D91", 0.28)
shadow.shadowBlurRadius = 24
shadow.shadowOffset = NSSize(width: 0, height: -10)
NSGraphicsContext.saveGraphicsState()
shadow.set()
color("#B9A6DD").setFill()
outerPath.fill()
NSGraphicsContext.restoreGraphicsState()

drawCenteredText("Lipa", in: CGRect(x: 72, y: 252, width: 368, height: 96), fontSize: 96, color: color("#FFFFFF"), kern: -6)
drawCenteredText("Cover", in: CGRect(x: 72, y: 160, width: 368, height: 82), fontSize: 70, color: color("#FFFFFF"), kern: -4)

image.unlockFocus()

guard
  let tiff = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiff),
  let png = bitmap.representation(using: .png, properties: [:])
else {
  fatalError("Unable to render PNG")
}

try png.write(to: URL(fileURLWithPath: outputPath))
