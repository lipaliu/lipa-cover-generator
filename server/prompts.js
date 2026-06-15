export const skillPrompt = String.raw`
# Xiaohongshu / Douyin Cover Skill

Cover design = Font Style x Color Strategy x Layout x Decoration x Text Treatment.
Each generation must choose one or more items from the five dimensions. Do not repeat
font and layout too often. Every cover must differ clearly in typography, color, and layout.

Absolute rules:
- Never generate artificial people or fake faces.
- Never create a blank background first and then add text.
- Preserve the user photo as the base image.
- Do not ignore the base image colors. Color strategy must follow photo analysis.
- The main title must be huge, integrated into the photo, and readable.

Dimension A: Font Style
A1 Wild calligraphy: wild explosive Chinese calligraphy, splashing ink strokes, extremely heavy brush weight, raw aggressive energy.
A2 Ultra-heavy gothic sans: ultra-heavy industrial gothic Chinese sans-serif, maximum font weight, geometric, solid block-like characters.
A3 Casual handwriting: casual handwritten Chinese characters, natural imperfect pen/pencil strokes, warm human touch.
A4 Pixel retro: pixel art / 8-bit retro game style Chinese font, blocky square pixels, nostalgic digital aesthetic.
A5 Rounded cartoon: rounded bubbly Chinese cartoon font, soft puffy edges, playful and approachable.
A6 Cinematic serif: cinematic Chinese serif with dramatic thick-thin stroke contrast, elegant movie title card.
A7 Magazine headline: bold condensed Chinese magazine headline font, strong vertical stress, editorial and fashionable.
A8 Marker graffiti: thick marker/highlighter handwritten Chinese text, uneven ink bleeding edges, street attitude.
A9 Variety 3D: 3D extruded Chinese text, colorful multi-layer outline, bright shadow, top highlight.
A10 Thin literary: thin elegant Chinese serif or ultra-light sans, refined minimal strokes, quiet with whitespace.
A11 Hollow outline: hollow outlined Chinese characters with thick colored stroke border, transparent or contrasting fill.
A12 Mixed typography: combine two or three font styles for hierarchy, e.g. bold title plus handwritten accent.

Dimension B: Color Strategy
Mandatory color logic:
IF base image is dark -> use bright high-saturation title colors: yellow, white, neon green, electric blue, orange, neon pink.
IF base image is bright -> use heavy dark title colors: black, navy, dark red, forest green, deep purple.
IF base image is high saturation -> use complementary colors from the opposite hue.
IF base image is low saturation -> use vivid high-saturation colors.

Available color combinations:
B1 Bright yellow + white: #FFDE00 / #FFFFFF, good for dark images.
B2 Pure white + light gray: #FFFFFF / #E0E0E0, good for dark or neutral images.
B3 Ice blue + white: #00D4FF / #FFFFFF, good for warm images.
B4 Neon green + white: #39FF14 or #00E676 / #FFFFFF, good for dark or purple images.
B5 Coral pink + white: #FF6B6B / #FFFFFF, good for cool or green images.
B6 Deep black + gray: #1A1A1A / #4A4A4A, good for bright images.
B7 Warm orange + white: #FF6B35 / #FFFFFF, good for cool or blue images.
B8 Mint + deep green: #4ECDC4 / #1B4332, good for warm bright images.
B9 Gradient duotone: blue-to-purple or orange-to-pink / white, good for neutral images.
B10 Clashing outline: one fill color and a contrasting stroke color, good for complex backgrounds.
B11 Deep blue + gold: #0A2463 / #D4AF37, good for bright images.
B12 Brick red + ivory: #C0392B / #FFF8E7, good for neutral/cool images.
Subtitle must be visually lower priority than the title.

Dimension C: Layout
C1 Top horizontal: main title occupies top third, subtitle below. For subjects in middle/lower area.
C2 Bottom press text: title at bottom with dark gradient overlay. For subjects near the top.
C3 Center dominance: title fills central frame, can overlap subject.
C4 Left aligned stair: left-aligned lines with increasing indents. For subject on right.
C5 Right aligned stair: right-aligned lines with decreasing indents. For subject on left.
C6 Diagonal split: main title on top-left and bottom-right or reverse. For centered subject.
C7 Vertical typography: title arranged top to bottom. For strong vertical space.
C8 Around subject: text wraps around clear subject silhouette.
C9 Section color blocks: split image into areas, text in color block region.
C10 Magazine multi-layer: big title, small title, labels, English accents.
C11 Scattered: varied size and angle words placed around frame.
C12 Framed: text inside square/circle/bracket frame.
C13 Waterfall: title descends top to bottom, size gradually smaller.
C14 Full-bleed: enormous text fills frame, subject emerges through gaps.

Layout selection logic:
Subject right -> C4 or C7 left side.
Subject left -> C5 or C7 right side.
Subject center -> C1, C2, C6, or C14.
Subject lower -> C1 or C14.
Subject upper -> C2.
Full body subject -> C8 or C11.
Small / distant subject -> C3 or C14.
Information-heavy content -> C9 or C10.

Dimension D: Decoration
D1 Rounded color block behind text.
D2 Gradient dark overlay on top/bottom/side.
D3 Small English decorative accent line.
D4 Hand-drawn arrows, circles, underlines.
D5 Quotation marks or book-title marks.
D6 Numbered badges such as 01, 02, 03.
D7 Thick outline plus drop shadow.
D8 Tape or sticker effect on text blocks.
D9 Checkmark or cross marks for comparison/review.
D10 REC dot / camera frame / vlog badge.
D11 Frosted glass blur block behind text.
D12 Geometric color blocks.
D13 No decoration, clean text only.

Dimension E: Text Treatment
E1 Enlarge keywords 2-3x.
E2 Change keyword color.
E3 Add color block highlight to keywords.
E4 Tilt text 3-8 degrees.
E5 Overlap characters or lines.
E6 Partial occlusion by subject/object.
E7 Text bleeds beyond frame edges.
E8 Mixed sizes in one line.
E9 Chinese-English mix.
E10 Vertical-horizontal mix.
E11 Semantic two-line split.
E12 Oversized question/exclamation punctuation.

Tone matching:
Emotion / pain / comeback -> A1/A8/A9, C3/C14/C6, D7/D13.
Knowledge / tutorial -> A2/A7/A12, C1/C4/C9, D1/D6.
Vlog / daily / travel -> A3/A5/A10, C11/C8/C13, D4/D10/D3.
Beauty / product review -> A5/A2/A11, C1/C10/C12, D1/D9/D8.
Career / business / interview -> A6/A7/A2, C2/C10/C4, D2/D5/D3.
Female growth / self -> A3/A6/A10, C5/C7/C13, D5/D3/D13.

Prompt template each generated plan must use:
Edit the provided image to create a finished Xiaohongshu/Douyin video cover.

PHOTO ANALYSIS:
- Dominant color: [analysis]
- Brightness: [dark/medium/bright]
- Subject position: [left/right/center/top/bottom]
- Available space for text: [empty space]

DESIGN COMBINATION:
- Font style: [Dimension A English description]
- Color scheme: [Dimension B with exact colors]
- Layout: [Dimension C description]
- Decoration: [Dimension D description]
- Text treatment: [Dimension E description]

TEXT CONTENT:
LINE 1 (Main title): "[main title]"
- Font: [detailed font style]
- Color: [exact hex] with [outline/shadow detail]
- Size: MASSIVE - each character about 20-25% of frame width
- Position: [specific layout position]
- Treatment: [text treatment]

LINE 2 (Subtitle): "[subtitle]"
- Font: [subtitle style]
- Color: [subtitle hex]
- Size: 1/3 to 1/4 of main title
- Position: [relative to title]

DECORATION: [specific decorations]

RULES:
- This is a non-sexual social media cover design task. If the source image shows a mouth, tongue, teeth, lips, skin, or body close-up, treat it strictly as health education, oral care, medical wellness, beauty care, or lifestyle content.
- Never add erotic, seductive, fetish, romantic, nude, or sexualized elements.
- Text must feel integrated into the photo, not floating.
- Main title huge, occupying about 15-30% of the frame.
- Size contrast between title and subtitle at least 3:1.
- Preserve original photo exactly.
- Only add text overlay and specified decorations.
- Default output is Xiaohongshu 1024x1536.
`;

export function buildPlanUserPrompt({ analysis, title, subtitle, keywords, count, stylePreferences }) {
  return `
Create exactly ${count} distinct cover design plans for this image and text.

Photo analysis JSON:
${JSON.stringify(analysis, null, 2)}

Main title: ${title}
Subtitle: ${subtitle || "(none)"}
Keywords / content cues: ${keywords || "(none)"}
Creator visual preferences:
${stylePreferences ? JSON.stringify(stylePreferences, null, 2) : "(none)"}

Return JSON only:
{
  "plans": [
    {
      "combination": "A1+B1+C3+D7+E4",
      "label": "书法 / 明黄 / 霸屏",
      "description": "短中文说明",
      "prompt": "Detailed English prompt following the template exactly"
    }
  ]
}

Rules:
- The array length must be exactly ${count}.
- Do not repeat the same A font style unless count exceeds available variety.
- Do not repeat the same C layout unless count exceeds available variety.
- Make each label short and scannable: three terms separated by " / ".
- Prompts must preserve the uploaded photo and only add typography/decorations.
- If the topic is tongue coating, mouth, teeth, oral care, body care, or health education, prompts must explicitly state that the image is non-sexual clinical/wellness content.
- If Creator visual preferences include tone colors or font direction, use them as hard guidance unless they conflict with readability.
`;
}

export function fallbackPlans({ analysis, title, subtitle, count }) {
  const combos = [
    ["A1+B1+C3+D7+E4", "书法 / 明黄 / 霸屏", "wild explosive Chinese calligraphy, bright yellow #FFDE00 title with black outline, center-dominant huge layout, thick shadow, slight tilt"],
    ["A3+B2+C11+D3+E9", "手写 / 白字 / 自然风", "casual handwritten Chinese text, pure white title, scattered natural layout, small English accent line, Chinese-English mix"],
    ["A7+B6+C10+D5+E2", "杂志 / 深色 / 多层", "bold condensed magazine headline typography, deep black title with muted gray subtitle, magazine multi-layer layout, quotation marks, keyword color change"],
    ["A11+B10+C6+D12+E1", "空心 / 撞色 / 对角", "hollow outlined Chinese characters, clashing outline colors, diagonal split layout, geometric color blocks, enlarged keywords"],
    ["A6+B11+C2+D2+E11", "电影 / 蓝金 / 底部", "cinematic Chinese serif, deep blue and gold, bottom title with gradient dark overlay, two-line semantic split"],
    ["A9+B9+C14+D7+E7", "综艺 / 渐变 / 满铺", "3D extruded Chinese text, gradient duotone, full-bleed enormous text, thick outline and shadow, text bleeding beyond frame"],
    ["A2+B3+C1+D1+E1", "黑体 / 冰蓝 / 顶部", "ultra-heavy gothic Chinese sans, ice blue title, top horizontal title, rounded color block, enlarged keywords"],
    ["A8+B7+C4+D4+E8", "马克笔 / 暖橙 / 阶梯", "thick marker handwritten Chinese text, warm orange title, left-aligned stair layout, hand-drawn annotations, mixed sizes"],
    ["A10+B12+C7+D13+E10", "纤细 / 砖红 / 竖排", "thin elegant Chinese serif, brick red and ivory palette, vertical typography, clean no decoration, vertical-horizontal mix"],
    ["A5+B4+C12+D8+E3", "卡通 / 荧光 / 框架", "rounded bubbly Chinese cartoon font, neon green title, framed text, sticker effect, keyword color block"],
  ];

  return combos.slice(0, count).map(([combination, label, style], index) => ({
    combination,
    label,
    description: label,
    prompt: `Edit the provided image to create a finished Xiaohongshu/Douyin video cover.

PHOTO ANALYSIS:
- Dominant color: ${analysis.dominant_color || "unknown"}
- Brightness: ${analysis.brightness || "medium"}
- Subject position: ${analysis.subject_position || "center"}
- Available space for text: ${analysis.empty_space || "use the clearest negative space"}

DESIGN COMBINATION:
- ${style}

TEXT CONTENT:
LINE 1 (Main title): "${title}"
LINE 2 (Subtitle): "${subtitle || ""}"

RULES:
- This is non-sexual health, wellness, beauty, or lifestyle cover design. If the uploaded photo contains a mouth, tongue, lips, teeth, skin, or body close-up, treat it as clinical/educational content only.
- Never add erotic, seductive, fetish, nude, romantic, or sexualized elements.
- Text must feel integrated into the photo, not floating.
- Main title huge and readable.
- Preserve original photo exactly.
- Only add typography and decorations.
- Use vertical 1024x1536 Xiaohongshu composition.`,
    id: index + 1,
  }));
}
