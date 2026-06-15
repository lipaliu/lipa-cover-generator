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

func drawText(_ text: String, in rect: CGRect, color textColor: NSColor) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 122, weight: .black),
    .foregroundColor: textColor,
    .paragraphStyle: paragraph,
    .kern: -4,
  ]
  let attributed = NSAttributedString(string: text, attributes: attributes)
  let textSize = attributed.size()
  let target = CGRect(
    x: rect.midX - textSize.width / 2,
    y: rect.midY - textSize.height / 2 - 7,
    width: textSize.width,
    height: textSize.height
  )
  attributed.draw(in: target)
}

image.lockFocus()
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()

let outer = CGRect(x: 24, y: 24, width: 464, height: 464)
let outerPath = rounded(outer, 112)
let shadow = NSShadow()
shadow.shadowColor = color("#5C4A66", 0.26)
shadow.shadowBlurRadius = 34
shadow.shadowOffset = NSSize(width: 0, height: -18)
NSGraphicsContext.saveGraphicsState()
shadow.set()
NSGradient(colors: [color("#FFF9FD"), color("#ECF7FF"), color("#F8FFF3")])?.draw(in: outerPath, angle: 125)
NSGraphicsContext.restoreGraphicsState()

let glowPath = rounded(outer.insetBy(dx: 18, dy: 18), 92)
NSGradient(colors: [color("#FFFFFF", 0.92), color("#FFFFFF", 0.12)])?.draw(in: glowPath, angle: 90)

let panel = outer.insetBy(dx: 54, dy: 54)
let panelPath = rounded(panel, 72)
color("#FFFFFF", 0.68).setFill()
panelPath.fill()
color("#FFFFFF", 0.86).setStroke()
panelPath.lineWidth = 4
panelPath.stroke()

let tileSize: CGFloat = 160
let gap: CGFloat = 24
let startX = panel.minX + 24
let startY = panel.minY + 24
let tiles = [
  ("L", CGRect(x: startX, y: startY + tileSize + gap, width: tileSize, height: tileSize), color("#16151A")),
  ("I", CGRect(x: startX + tileSize + gap, y: startY + tileSize + gap, width: tileSize, height: tileSize), color("#FF4FA3")),
  ("P", CGRect(x: startX, y: startY, width: tileSize, height: tileSize), color("#526AFF")),
  ("A", CGRect(x: startX + tileSize + gap, y: startY, width: tileSize, height: tileSize), color("#23CFA7")),
]

for (_, rect, textColor) in tiles {
  let path = rounded(rect, 42)
  color("#FFFFFF", 0.54).setFill()
  path.fill()
  textColor.withAlphaComponent(0.11).setStroke()
  path.lineWidth = 3
  path.stroke()
}

for (letter, rect, textColor) in tiles {
  drawText(letter, in: rect, color: textColor)
}

let shine = rounded(CGRect(x: 58, y: 310, width: 396, height: 132), 58)
NSGradient(colors: [color("#FFFFFF", 0.5), color("#FFFFFF", 0.02)])?.draw(in: shine, angle: 90)

image.unlockFocus()

guard
  let tiff = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiff),
  let png = bitmap.representation(using: .png, properties: [:])
else {
  fatalError("Unable to render PNG")
}

try png.write(to: URL(fileURLWithPath: outputPath))
