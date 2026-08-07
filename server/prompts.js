import { generateCombinations, combinationToLabel, combinationToDesignDirective, comboFromKey, dimensionOption } from "./design-matrix.js";

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
  const inspirationPool = matrixCombinations
    ? matrixCombinations.map((combo, i) => `Option ${i + 1}: ${combinationToDesignDirective(combo)}`).join("\n\n")
    : "";

  return `
You are the ART DIRECTOR. Design exactly ${count} DISTINCT, magazine-grade Xiaohongshu/Douyin covers for this photo and title.

STEP 1 — READ THE TITLE'S MEANING FIRST (content-driven, never random):
Infer the topic, emotion and audience from the main title, then choose fonts, colors, layout, decorations, sizing and 花字 treatments that genuinely FIT it. Examples of intent (adapt, don't copy):
- gossip / 猎奇 / 反差 / 八卦 -> bold high-contrast tabloid energy (heavy black or brush title, red/black/yellow, torn-paper, stamps), NOT soft girly pastels.
- 干货 / 教程 / 知识 -> clean editorial, heiti, numbered badges, color strips.
- 治愈 / 旅行 / vlog -> bright airy, handwriting accents, sunlit palettes.
- 财经 / 商业 / 高端 -> refined black-gold or mono, serif, restrained.
Each of the ${count} covers must differ clearly in font + color + layout + mood.

STEP 2 — PLACEMENT (critical): Use subject_position + empty_space from the analysis. Put the big title in the CLEAREST EMPTY area (top band, bottom band, or side away from the subject). NEVER cover the person's face or crowd their head. If a layout would overlap the face, move the text into open space.

STEP 3 — MAKE IT LOOK DESIGNED (not just text dumped on a photo): every cover needs a HUGE main title with a real 花字 treatment (thick outline / 3D / color-block / torn-paper / metallic per the Skill), a small English or pinyin accent line, tasteful decorations (01 / VOL.01 badges, ®/™/marks, strips, doodles when they fit), and a clear size hierarchy (title : subtitle at least 3:1).

Photo analysis JSON:
${JSON.stringify(analysis, null, 2)}

Main title: ${title}
Subtitle: ${subtitle || "(none)"}
Keywords / content cues: ${keywords || "(none)"}
Creator visual preferences:
${stylePreferences ? JSON.stringify(stylePreferences, null, 2) : "(none)"}

${inspirationPool ? `Design-matrix vocabulary (an INSPIRATION pool for variety — adapt freely to fit the title; you are NOT forced to copy these):\n\n${inspirationPool}` : ""}

Return JSON only:
{
  "plans": [
    {
      "combination": "A1+B1+C3+D7+E8+F4+G1",
      "label": "书法 / 海洋蓝 / 顶部横幅",
      "description": "短中文说明：为什么这个风格配这个标题",
      "prompt": "Detailed English image-edit prompt: ALL 7 dimensions, exact text content, 花字/decoration details, size hierarchy, and explicit text placement in negative space away from the face."
    }
  ]
}

Rules:
- Array length exactly ${count}; all clearly distinct.
- combination = a valid matrix key like "A3+B7+C2+D15+E8+F4+G1" reflecting YOUR chosen style.
- label: three short terms (font / color / layout).
- Style MUST suit the title's meaning (content-driven) AND stay on-brand per the AESTHETIC CURATION (bright premium editorial; avoid cheap/girly palettes unless the topic truly calls for them).
- Every prompt preserves the uploaded photo and the person's face exactly; only add typography + decorations; place text in clear empty space, never over the face.
- If the topic is tongue/mouth/teeth/oral/body/health, state it is non-sexual clinical/wellness content.
- If Creator visual preferences include imagePalette / preferredTextColor / preferredAccentColor, use them unless they hurt readability or clash with the mood the title needs.
`;
}

// 单个组合 → 完整方案（fallbackPlans 与 单张换某一项重建 共用）
// smartScene：独立开关（"读懂标题去配场景"），任何风格都可搭；小Lin 只是视觉样式。
export function planFromCombo(combo, { analysis, title, subtitle, ratio = "", textColor = "", id = 1, smartScene = false }) {
  const isVertical = ["3:4", "9:16", "1:1"].includes(ratio);
  const label = combinationToLabel(combo);
  const directive = combinationToDesignDirective(combo);

  // ① 智能场景（独立开关）：抠图主体 + 按标题含义合成戏剧化匹配场景。开了它才"读懂标题"、放开像素保护。
  const sceneDirective = smartScene
    ? `
=== SMART SCENE — build a topic-matched scene (for THIS cover you SHOULD read what the title MEANS; this OVERRIDES the "don't interpret the title" and pixel-preservation rules below) ===
- CUT OUT THE SUBJECT: cleanly cut the person out of the uploaded photo, REMOVE their original background entirely, keep their face and pose exactly. Place them as a foreground figure — usually lower-center or to one side, roughly waist-up, slightly overlapping the bottom edge.
- TOPIC-MATCHED SCENE: behind and around the cut-out subject, composite 2–5 REAL photographic props / figures / scenes that directly match the title's subject, so subject + background read as ONE coherent, dramatic, complementary scene. Mapping examples: finance/economy → stacks of cash, rising/falling candlestick charts, gold & silver bars, bank facade, city skyline; a specific country → its national flag + relevant leaders/citizens; trade war / negotiation → the two sides' flags + representative figures facing off; tech / AI → chips, server racks, robots, glowing circuits, company logos; Olympics / sport → torch, doves, stadium, medals, football; drug prices → pills + price tags; pension → a crowd of elderly faces; a brand → its logo & products.
- Because the subject is cut out and re-composited, you MAY replace the original background.
`
    : "";

  // ② 小Lin 视觉样式（G12）：只管"长什么样"——方正粗黑大标题 + 关键词描金 + 顶部英文（不强制配场景）。
  const isLin = combo.g.id === "G12";
  const linDirective = isLin
    ? `
=== VISUAL STYLE "小Lin" (news-explainer look) ===
- TITLE: HUGE, SQUARE, ultra-bold blocky Chinese (Heiti / condensed black), top ~40% of the frame, instantly readable at a glance — being square, solid, clean and legible matters far more than the exact typeface. Thick WHITE or BLACK stroke + subtle drop shadow so it pops.
- KEYWORD COLOR-SWAP: make 1–2 KEY words of the title bright metallic GOLD / YELLOW while the rest stays white; add a bright ?! / ？ / ！！ mark or 「」 quotes for drama when it fits.
- ENGLISH ACCENT: a small bold English translation of the title (serif or condensed) across the very TOP edge.
- Optional: one small rounded yellow tag for a sub-phrase (完整版 / 为什么？/ 期数 (1)(2)(下)).
- Punchy, dramatic, premium news-explainer energy; professionally composed, never cluttered.
`
    : "";

  // 竖版追加像素级保护指令
  const verticalPixelRule = isVertical
    ? `\n- PIXEL PRESERVATION (CRITICAL): The ONLY pixels you may change are those directly under the text characters and minimal decorations. ALL other pixels MUST remain byte-for-byte identical to the source photo. Do NOT apply any color grading, filters, overlays, lighting changes, vignettes, grain, or atmosphere effects to the background.`
    : "";

  return {
    id,
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
${sceneDirective}${linDirective}
TEXT CONTENT:
LINE 1 (Main title): "${title}"
- Font: ${combo.a.desc}
- Color: ${textColor
        ? `EXACTLY ${textColor} — USER-LOCKED HARD REQUIREMENT for the main title text fill; add stroke/shadow/underlay from the ${combo.d.name} scheme only as needed for readability; do NOT change the title fill color`
        : `use colors from ${combo.d.name} scheme with ${combo.c.name} effect`}
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
- PLACEMENT: put text in the clearest EMPTY space (top band / bottom band / side away from the subject). NEVER cover the person's face or crowd the head; if the layout would overlap the face, shift the text into open space.
${smartScene
        ? `- For THIS cover you SHOULD interpret the title's topic to build the matching background scene (see the SMART SCENE section above). The subject is CUT OUT and re-composited, so you may replace the original background — the pixel-preservation rule does NOT apply.`
        : `- The title is just TEXT to typeset, NOT a design brief. Do NOT read into or react to what the words MEAN — titles are often clickbait and are an unreliable guide to design. The visual style and EVERY decoration come ONLY from the assigned aesthetic combination, and would be exactly the same regardless of the title's topic.
- Preserve original photo exactly.`}
- Only add typography and decorations.${smartScene ? "" : verticalPixelRule}
- STRICTLY follow all 7 dimensions of the assigned design matrix combination.`,
  };
}

export function fallbackPlans({ analysis, title, subtitle, count, keywords, ratio = "", styleLock = {}, textColor = "", textColors = [], smartScene = false }) {
  // 设计矩阵生成多样化组合（竖版安全过滤；styleLock 锁定用户在界面选定的维度）
  const combinations = generateCombinations(count, keywords, ratio, styleLock);
  // 字色多选：选了多个就每张随机取一个；只选一个 = 全部用它；没选 = 交给配色方案（textColor 兼容旧的单值）。
  const colorPool = Array.isArray(textColors) && textColors.length ? textColors : textColor ? [textColor] : [];
  const pickColor = () => (colorPool.length ? colorPool[Math.floor(Math.random() * colorPool.length)] : "");
  return combinations.map((combo, index) => planFromCombo(combo, { analysis, title, subtitle, ratio, textColor: pickColor(), id: index + 1, smartScene }));
}

// 按组合键重建单个方案，可替换其中一个维度（单张「换字体/换风格/换配色/换字色」用）。
export function rebuildPlanFromKey({ combinationKey, swap, swaps, analysis, title, subtitle, ratio = "", textColor = "", smartScene = false }) {
  const combo = comboFromKey(combinationKey);
  if (!combo) return null;
  // 一次换多个维度：swaps 数组 [{dimension, optionId}, ...]（字体+配色+构图…一起改）；兼容旧的单个 swap。
  const list = Array.isArray(swaps) ? [...swaps] : [];
  if (swap?.dimension && swap?.optionId) list.push(swap);
  let changed = false;
  for (const s of list) {
    if (!s?.dimension || !s?.optionId) continue;
    const opt = dimensionOption(s.dimension, s.optionId);
    if (!opt) continue;
    combo[String(s.dimension).toLowerCase()] = opt;
    changed = true;
  }
  if (changed) combo.key = ["a", "b", "c", "d", "e", "f", "g"].map((k) => combo[k].id).join("+");
  return planFromCombo(combo, { analysis, title, subtitle, ratio, textColor, id: 1, smartScene });
}
