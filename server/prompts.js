import { generateCombinations, combinationToLabel, combinationToDesignDirective } from "./design-matrix.js";

export const skillPrompt = String.raw`
# Xiaohongshu / Douyin Cover Skill

Cover design = Font Style x Text Layout x Text Effect x Color Scheme x Decoration x Composition x Mood.
Each generation MUST use a completely different combination from the 7-dimension design matrix.
Every cover must differ clearly and dramatically in typography, color, layout, and overall feel.

AESTHETIC CURATION (the product's core asset — see references/aesthetic-profile.md):
- TARGET LOOK: bright, sunny, energetic REAL photos x high-end big-type layout ("出片感 + editorial typography"). The brand sells taste, not gimmicks. Travel / cycling / sport / vlog / photography lifestyle.
- PRIORITIZE: heavy Heiti / ultra-black / brush calligraphy & dry-brush / cinematic & hairline serif / bold condensed sans in thick WHITE outline; handwritten script as an accent layer;
  white, BRIGHT-YELLOW (signature accent), ocean-blue, forest-green, sunset-orange, mono+pop-accent palettes;
  solid fill / thick outline / color-block / sticker white-edge cut-out / torn-paper collage text effects;
  magazine collage / multi-grid / numbered badges (01, VOL.01) / color strips / tasteful hand-drawn doodles & sparkles;
  energetic-dynamic / fresh-literary / warm-healing / natural-organic moods (premium-cool only for the quiet editorial subset).
- HOUSE STYLE (reproduce often — distilled from the curated covers + 80 caption presets):
  (1) one HUGE main title (Heiti / ultra-black / brush) at 60%+ of frame width;
  (2) a small English / pinyin secondary line beside or under it (e.g. "DAO YU SEN LIN", "Daily Vlog", "cycling with lemon");
  (3) tiny editorial marks: 01 / VOL.01 / NO.01, (R) (TM) (C)2025, #topic, Co.,Ltd.;
  (4) thick white stroke or white-edge cut-out so the type pops off a busy photo;
  (5) optionally one handwritten-script line contrasting the hard bold title.
- AVOID (look cheap or childish, never use unless the user explicitly asks):
  pixel font (A9), crayon font (A17), comic font (A20), tape strips (C15);
  overall dark / luxury-gold / cyberpunk-neon / girly-pink color grading; mysterious-dark and gold-opulence moods.
- Keep the original photo bright and un-regraded; only add typography and light decorations.

Absolute rules:
- Never generate artificial people or fake faces.
- Never create a blank background first and then add text.
- Preserve the user photo as the base image.
- Do not ignore the base image colors. Color strategy must follow photo analysis.
- The main title must be huge, integrated into the photo, and readable.
- Each cover in a batch MUST look completely different from every other cover.

Dimension A: Font Style (20 options)
A1 Wild calligraphy: wild explosive Chinese calligraphy, splashing ink strokes, extremely heavy brush weight, raw aggressive energy.
A2 Xingkai semi-cursive: flowing semi-cursive Chinese Xingkai calligraphy, elegant brush rhythm, balanced between formal and expressive.
A3 Song serif: traditional Chinese Song/Ming serif typeface, horizontal thin and vertical thick strokes, classical printing elegance.
A4 Heavy gothic sans: ultra-heavy industrial Chinese gothic sans-serif (Heiti), maximum font weight, geometric solid block-like characters.
A5 Rounded cartoon: rounded bubbly Chinese Yuanti font, soft puffy edges, playful and approachable.
A6 Casual handwriting: casual handwritten Chinese characters, natural imperfect pen/pencil strokes, warm human touch.
A7 Cinematic serif: cinematic English serif with dramatic thick-thin contrast, elegant movie title card feel.
A8 Bold condensed sans: bold condensed English sans-serif, strong geometric presence, Futura or Helvetica Black style.
A9 Pixel retro: pixel art / 8-bit retro game style font, blocky square pixels, nostalgic digital aesthetic.
A10 Gothic blackletter: gothic blackletter typeface, ornate medieval strokes, dark dramatic presence.
A11 Art Deco: Art Deco display typeface, geometric glamour, 1920s luxury with gold accents.
A12 Ultra-thin hairline: ultra-thin elegant hairline font, refined minimal strokes, quiet with generous whitespace.
A13 Ultra-black compressed: ultra-black compressed Chinese font, maximum weight fills frame, powerful and impactful.
A14 Neon tube: neon tube glow font style, luminous colored outlines with soft glow halo, nightlife energy.
A15 Dry brush feibai: dry brush Chinese calligraphy with flying white (feibai) texture, broken ink strokes.
A16 Fountain pen: fountain pen handwritten style, elegant ink flow with slight pressure variation.
A17 Crayon texture: crayon/pastel texture font, rough waxy strokes, childlike creative energy.
A18 Seal script: Chinese seal script (Zhuanshu) style, red stamp aesthetic, ancient authority.
A19 Typewriter: typewriter monospace font, uneven ink density, vintage mechanical nostalgia.
A20 Comic manga: comic/manga speech bubble font, dynamic varied weight, energetic pop culture feel.

Dimension B: Text Layout (15 options)
B1 Center dominant: center-dominant huge layout, title fills central frame occupying 60%+ of width.
B2 Top-left aligned: top-left aligned layout, title starts from upper-left corner.
B3 Bottom-right corner: bottom-right corner layout, title anchored to lower-right.
B4 Diagonal 45°: diagonal 45-degree tilt layout, text runs corner to corner.
B5 Vertical right-to-left: vertical typography arranged right to left, traditional Chinese reading direction.
B6 Wrap around subject: text wraps around the main subject silhouette.
B7 Scattered four corners: text elements placed in each corner.
B8 Bottom band: bottom horizontal band layout with gradient overlay.
B9 Top banner: top horizontal banner layout, newspaper headline style.
B10 Center obi band: center horizontal band (obi) layout, book cover obi style.
B11 Left-right columns: left-right column split, magazine spread feel.
B12 Top-bottom split: top-bottom split layout with dividing line.
B13 Diagonal split: diagonal split layout, text on triangular sections.
B14 Circular arrangement: circular text arrangement, badge or stamp composition.
B15 Grid distribution: grid-based layout, text placed in grid cells.

Dimension C: Text Effect (15 options)
C1 Solid fill: solid color fill, clean flat text, maximum readability.
C2 Hollow outline: hollow outlined text with thick colored stroke border.
C3 Gradient fill: gradient color fill within text.
C4 3D shadow: 3D drop shadow effect, text appears elevated.
C5 Neon glow: neon glow effect, luminous text with soft colored halo.
C6 Frosted blur: frosted glass blur block behind text.
C7 Color block mask: solid color block mask behind text.
C8 Semi-transparent: semi-transparent text overlay.
C9 Metallic: metallic texture fill, chrome/gold/silver reflective surface.
C10 Glass refraction: glass refraction effect, modern tech aesthetic.
C11 Hand-drawn doodle: hand-drawn doodle style text.
C12 Sticker label: sticker/label effect with white border.
C13 Stamp: rubber stamp effect, uneven ink distribution.
C14 Torn paper: torn paper edge effect, collage feel.
C15 Tape strips: masking tape effect, DIY scrapbook aesthetic.

Dimension D: Color Scheme (20 options)
D1 Black-white minimal: #000000 / #FFFFFF pure contrast.
D2 Black-gold luxury: #1A1A1A + #D4AF37 gold, premium opulence.
D3 White-platinum: #FFFFFF + #C0C0C0 silver, clean sophistication.
D4 Morandi muted: desaturated dusty tones, quiet elegance.
D5 Cyberpunk neon: #FF00FF + #00FFFF + #39FF14 on dark.
D6 Earth tones: ochre + brown + olive, natural organic warmth.
D7 Ocean blue: navy + azure + light blue, calm depth.
D8 Sunset orange: coral + amber + red accent, golden hour energy.
D9 Forest green: deep green + mid green + mint, natural vitality.
D10 Lavender purple: deep purple + lavender + light purple, dreamy.
D11 Complementary clash: bold opposite hues, maximum energy.
D12 Monochromatic gradient: single hue from dark to light.
D13 Triadic: three evenly spaced hues, vibrant and balanced.
D14 Mono + accent: mostly neutral with one pop color.
D15 Vintage film: faded warm tones, nostalgic analog.
D16 Bright yellow: #FFDE00 primary, optimistic and bold.
D17 Coral pink: #FF6B6B coral + blush + white, feminine.
D18 Ice blue tech: #00D4FF cyan + ice + deep blue, digital.
D19 Caramel coffee: espresso + caramel + cream, warm and cozy.
D20 Sakura pink: cherry blossom + snow + branch brown, gentle spring.

Dimension E: Decoration (20 options)
E1 None: no decoration, clean text only.
E2 Geometric frame: thin rectangular or angular border.
E3 Color strip: color block strip behind text.
E4 Bokeh circles: soft blurred circles, dreamy atmosphere.
E5 Triangle cuts: sharp angular shapes, modern and edgy.
E6 Magazine collage: torn paper pieces and layered clippings.
E7 Washi tape: colorful tape strips and stickers, playful DIY.
E8 Stamp border: postage stamp perforated border.
E9 Torn paper: ripped edges showing layer beneath.
E10 Grid texture: subtle graph paper or dot grid.
E11 Gradient halo: soft radial gradient behind text.
E12 Sparkles: scattered stars and sparkles, magical.
E13 Wavy lines: organic curved lines, fluid and dynamic.
E14 Arrows: arrow pointers guiding visual flow.
E15 Numbered badges: 01 02 03 sequential markers.
E16 Hand-drawn doodles: arrows circles underlines stars.
E17 Floral botanical: leaves vines flowers as accent.
E18 Noise grain: film grain or paper texture overlay.
E19 Light rays: radiating lines, dramatic emphasis.
E20 Speech bubbles: comic-style text containers.

Dimension F: Composition (10 options)
F1 Full-bleed: fills entire frame edge to edge.
F2 Text-top image-bottom: upper typography, lower visual.
F3 Image-top text-bottom: visual dominates upper, text below.
F4 Image-left text-right: magazine spread feel.
F5 Image-right text-left: balanced layout.
F6 Center focus: all key elements converge to center.
F7 Whitespace breathing: minimal elements, elegant restraint.
F8 Rule of thirds: elements at grid intersections.
F9 Golden ratio: phi spiral placement, harmonious.
F10 Symmetrical mirror: balanced symmetry, formal and stable.

Dimension G: Mood (10 options)
G1 Premium cool: minimal and aloof, high-fashion editorial.
G2 Warm healing: soft golden light, comforting atmosphere.
G3 Energetic dynamic: bold colors and angles, youthful excitement.
G4 Mysterious dark: deep shadows, intriguing and dramatic.
G5 Fresh literary: light airy, artistic and poetic.
G6 Retro nostalgic: vintage color grading, warm memory.
G7 Futuristic tech: sleek digital, cutting-edge.
G8 Natural organic: earthy textures, grounded and authentic.
G9 Luxurious refined: rich materials gold accents, premium.
G10 Humorous playful: unexpected elements, lighthearted.

Prompt template each generated plan must use:
Edit the provided image to create a finished Xiaohongshu/Douyin video cover.

PHOTO ANALYSIS:
- Dominant color: [analysis]
- Brightness: [dark/medium/bright]
- Subject position: [left/right/center/top/bottom]
- Available space for text: [empty space]

DESIGN MATRIX COMBINATION: [combination key like A3+B7+C2+D15+E8+F4+G1]
- Font style: [Dimension A full description]
- Text layout: [Dimension B full description]
- Text effect: [Dimension C full description]
- Color scheme: [Dimension D with exact hex colors]
- Decoration: [Dimension E full description]
- Composition: [Dimension F full description]
- Mood: [Dimension G full description]

TEXT CONTENT:
LINE 1 (Main title): "[main title]"
- Font: [detailed font style matching dimension A]
- Color: [exact hex from dimension D] with [effect from dimension C]
- Size: MASSIVE - each character about 20-25% of frame width
- Position: [specific position from dimension B]

LINE 2 (Subtitle): "[subtitle]"
- Font: [subtitle style]
- Color: [subtitle hex]
- Size: 1/3 to 1/4 of main title
- Position: [relative to title per layout]

DECORATION: [specific decorations from dimension E]
COMPOSITION: [composition approach from dimension F]
MOOD: [overall atmosphere from dimension G]

RULES:
- This is a non-sexual social media cover design task. If the source image shows a mouth, tongue, teeth, lips, skin, or body close-up, treat it strictly as health education, oral care, medical wellness, beauty care, or lifestyle content.
- Never add erotic, seductive, fetish, romantic, nude, or sexualized elements.
- Text must feel integrated into the photo, not floating.
- Main title huge, occupying about 15-30% of the frame.
- Size contrast between title and subtitle at least 3:1.
- Preserve original photo exactly.
- Only add text overlay and specified decorations.
- Default output is Xiaohongshu 1024x1536.
- STRICTLY follow all 7 dimensions of the assigned combination.
`;

export function buildPlanUserPrompt({ analysis, title, subtitle, keywords, count, stylePreferences, matrixCombinations }) {
  const combinationDirectives = matrixCombinations
    ? matrixCombinations.map((combo, i) => `Cover ${i + 1}: ${combinationToDesignDirective(combo)}`).join("\n\n")
    : "";

  return `
Create exactly ${count} distinct cover design plans for this image and text.
Each cover MUST use a completely different design matrix combination.

Photo analysis JSON:
${JSON.stringify(analysis, null, 2)}

Main title: ${title}
Subtitle: ${subtitle || "(none)"}
Keywords / content cues: ${keywords || "(none)"}
Creator visual preferences:
${stylePreferences ? JSON.stringify(stylePreferences, null, 2) : "(none)"}

${combinationDirectives ? `MANDATORY DESIGN MATRIX ASSIGNMENTS (you MUST follow these exactly):\n\n${combinationDirectives}` : ""}

Return JSON only:
{
  "plans": [
    {
      "combination": "A1+B1+C3+D7+E8+F4+G1",
      "label": "书法 / 海洋蓝 / 居中霸屏",
      "description": "短中文说明",
      "prompt": "Detailed English prompt following the template exactly, incorporating ALL 7 dimensions"
    }
  ]
}

Rules:
- The array length must be exactly ${count}.
- Each plan MUST use the assigned combination from the design matrix above.
- The combination field must be the exact key (e.g. "A3+B7+C2+D15+E8+F4+G1").
- Make each label short and scannable: three terms from the combination (font / color / layout).
- Prompts must preserve the uploaded photo and only add typography/decorations.
- Prompts must explicitly describe ALL 7 dimensions in detail.
- If the topic is tongue coating, mouth, teeth, oral care, body care, or health education, prompts must explicitly state that the image is non-sexual clinical/wellness content.
- If Creator visual preferences include imagePalette, preferredTextColor, or preferredAccentColor, use those colors as hard guidance unless they conflict with readability.
`;
}

export function fallbackPlans({ analysis, title, subtitle, count, keywords, ratio = "" }) {
  // 使用设计矩阵生成多样化的 fallback 方案（竖版启用安全矩阵过滤器）
  const combinations = generateCombinations(count, keywords, ratio);
  const isVertical = ["3:4", "9:16", "1:1"].includes(ratio);

  return combinations.map((combo, index) => {
    const label = combinationToLabel(combo);
    const directive = combinationToDesignDirective(combo);

    // 竖版追加像素级保护指令
    const verticalPixelRule = isVertical
      ? `\n- PIXEL PRESERVATION (CRITICAL): The ONLY pixels you may change are those directly under the text characters and minimal decorations. ALL other pixels MUST remain byte-for-byte identical to the source photo. Do NOT apply any color grading, filters, overlays, lighting changes, vignettes, grain, or atmosphere effects to the background.`
      : "";

    return {
      id: index + 1,
      combination: combo.key,
      label,
      description: label,
      prompt: `Edit the provided image to create a finished Xiaohongshu/Douyin video cover.

PHOTO ANALYSIS:
- Dominant color: ${analysis.dominant_color || "unknown"}
- Brightness: ${analysis.brightness || "medium"}
- Subject position: ${analysis.subject_position || "center"}
- Available space for text: ${analysis.empty_space || "use the clearest negative space"}

${directive}

TEXT CONTENT:
LINE 1 (Main title): "${title}"
- Font: ${combo.a.desc}
- Color: use colors from ${combo.d.name} scheme with ${combo.c.name} effect
- Size: MASSIVE - each character about 20-25% of frame width
- Position: ${combo.b.desc}

LINE 2 (Subtitle): "${subtitle || ""}"
- Font: complementary to main title
- Color: secondary color from ${combo.d.name} scheme
- Size: 1/3 to 1/4 of main title
- Position: relative to title per ${combo.b.name} layout

DECORATION: ${combo.e.desc}
COMPOSITION: ${combo.f.desc}
MOOD: ${combo.g.desc}

EDITORIAL HOUSE STYLE (the brand signature — apply tastefully, do not clutter):
- Bright, premium "出片" editorial feel. Keep the photo bright and natural; do NOT regrade it into dark, luxury-gold, or neon.
- Add a small English or pinyin accent line near the title (romanized title or a short thematic English phrase) for an international editorial touch.
- When it fits the style, add ONE tiny refined editorial mark: a number badge (01 / VOL.01), a (R)/(TM)/(C)2025, or a #topic tag — small, never cluttered.
- Give the main title a thick white stroke or clean white-edge cut-out when the photo is busy, so the type pops and stays readable.
- Main title is HUGE (60%+ of width); every secondary line stays clearly smaller (size contrast at least 3:1).

RULES:
- This is non-sexual health, wellness, beauty, or lifestyle cover design. If the uploaded photo contains a mouth, tongue, lips, teeth, skin, or body close-up, treat it as clinical/educational content only.
- Never add erotic, seductive, fetish, nude, romantic, or sexualized elements.
- Text must feel integrated into the photo, not floating.
- Main title huge and readable.
- Preserve original photo exactly.
- Only add typography and decorations.${verticalPixelRule}
- STRICTLY follow all 7 dimensions of the assigned design matrix combination.`,
    };
  });
}
