/**
 * Design Matrix System (审美优选版 / Curated Aesthetic Edition)
 *
 * 七维设计矩阵，通过排列组合产生百万级变化，确保每次生成的封面风格明显不同。
 *
 * 维度：
 *   A. 字体风格 (20)
 *   B. 文字布局 (15)
 *   C. 文字效果 (15)
 *   D. 色彩方案 (20)
 *   E. 装饰元素 (20)
 *   F. 构图方式 (10)
 *   G. 情绪氛围 (10)
 *
 * ─── 总库机制（weight 现在只表示「在库 / 禁用」，不再有高低排序）──────────────────
 * 核心理念：凡是创作者喜欢、收进总库的审美，彼此一律平等——没有谁更优先。生成时在
 * 库内「平等随机」抽取，最大化多样性。weight 字段现在只当作开关：
 *   weight > 0  在库（创作者喜欢的审美，平等参与抽样；具体数值大小已不影响概率）
 *   weight = 0  禁用（创作者明确不要的廉价感：像素体/蜡笔体/漫画体/胶带，不进库）
 * 注：保留各项的 weight 数值仅为历史可读性，weightedPick/weightedShuffle 已改为均匀随机。
 *
 * ─── 审美定位（详见 references/aesthetic-profile.md）─────────────────────────────
 * 目标 = 「明亮、阳光、有活力的真实照片 × 高级感的大字排版」（出片感 + 编辑级排版），
 * 校准来源是创作者亲挑的 127 张封面 + 80 款剪映高级感标题预设。
 *   提权：黑体/极粗/书法毛笔/白色描边大写、手写花体点缀、明黄活力（招牌色）、
 *         海洋蓝/森林绿/日落暖橙、拼贴/多宫格/序号编号、活力动感/清新文艺/温暖治愈。
 *   降权：黑金奢华/赛博霓虹/粉嫩、金属质感、神秘暗黑/奢华/未来科技 等暗黑高冷基调。
 *   禁用(weight=0)：像素体 A9 / 蜡笔体 A17 / 漫画体 A20 / 胶带 C15。
 * 这是产品的核心审美资产，必须随 Skill 一起沉淀与维护。
 *
 * 理论组合数（仅计入 weight>0 选项）依然在百万级。
 */

// ─────────────────────────────────────────────────────────────────────────────
// A. 字体风格 (20 options)
// ─────────────────────────────────────────────────────────────────────────────
export const fontStyles = [
  { id: "A1", name: "书法体", weight: 3, desc: "wild explosive Chinese calligraphy, splashing ink strokes, extremely heavy brush weight, raw aggressive energy" },
  { id: "A2", name: "行楷", weight: 3, desc: "flowing semi-cursive Chinese Xingkai calligraphy, elegant brush rhythm, balanced between formal and expressive" },
  { id: "A3", name: "宋体", weight: 2, desc: "traditional Chinese Song/Ming serif typeface, horizontal thin and vertical thick strokes, classical printing elegance" },
  { id: "A4", name: "黑体", weight: 3, desc: "ultra-heavy industrial Chinese gothic sans-serif (Heiti), maximum font weight, geometric solid block-like characters" },
  { id: "A5", name: "圆体", weight: 2, desc: "rounded bubbly Chinese Yuanti font, soft puffy edges, playful and approachable warmth" },
  { id: "A6", name: "手写体", weight: 3, desc: "casual handwritten Chinese characters, natural imperfect pen/pencil strokes, warm human touch" },
  { id: "A7", name: "衬线英文", weight: 3, desc: "cinematic English serif with dramatic thick-thin contrast, elegant movie title card feel, Didot or Bodoni style" },
  { id: "A8", name: "无衬线英文", weight: 3, desc: "bold condensed English sans-serif, strong geometric presence, Futura or Helvetica Neue Black style" },
  { id: "A9", name: "像素体", weight: 0, desc: "pixel art / 8-bit retro game style font, blocky square pixels, nostalgic digital aesthetic" },
  { id: "A10", name: "哥特体", weight: 2, desc: "gothic blackletter typeface, ornate medieval strokes, dark dramatic presence" },
  { id: "A11", name: "艺术装饰体", weight: 2, desc: "Art Deco display typeface, geometric glamour, 1920s luxury with gold accents" },
  { id: "A12", name: "极细体", weight: 3, desc: "ultra-thin elegant Chinese or English hairline font, refined minimal strokes, quiet with generous whitespace" },
  { id: "A13", name: "极粗体", weight: 3, desc: "ultra-black compressed Chinese font, maximum weight fills frame, powerful and impactful" },
  { id: "A14", name: "霓虹体", weight: 1, desc: "neon tube glow font style, luminous colored outlines with soft glow halo, nightlife energy" },
  { id: "A15", name: "毛笔飞白", weight: 3, desc: "dry brush Chinese calligraphy with flying white (feibai) texture, broken ink strokes revealing paper beneath" },
  { id: "A16", name: "钢笔手写", weight: 3, desc: "fountain pen handwritten style with elegant ink flow; includes elegant English cursive/script titles in the 'Mini Vlog / Daily Vlog' vibe — flowing calligraphic English, often white, floating over a photo collage" },
  { id: "A17", name: "蜡笔质感", weight: 0, desc: "crayon/pastel texture font, rough waxy strokes, childlike creative energy" },
  { id: "A18", name: "印章体", weight: 1, desc: "Chinese seal script (Zhuanshu) style, red stamp aesthetic, ancient authority" },
  { id: "A19", name: "打字机体", weight: 1, desc: "typewriter monospace font, uneven ink density, vintage mechanical nostalgia" },
  { id: "A20", name: "漫画体", weight: 0, desc: "comic/manga speech bubble font, dynamic varied weight, energetic pop culture feel" },
];

// ─────────────────────────────────────────────────────────────────────────────
// B. 文字布局 (15 options)
// ─────────────────────────────────────────────────────────────────────────────
export const textLayouts = [
  { id: "B1", name: "居中霸屏", weight: 3, desc: "center-dominant huge layout, title fills central frame occupying 60%+ of width, maximum visual impact" },
  { id: "B2", name: "左上对齐", weight: 3, desc: "top-left aligned layout, title starts from upper-left corner, clean editorial hierarchy" },
  { id: "B3", name: "右下角落", weight: 2, desc: "bottom-right corner layout, title anchored to lower-right, creates diagonal reading flow" },
  { id: "B4", name: "斜切45度", weight: 2, desc: "diagonal 45-degree tilt layout, text runs corner to corner, dynamic energy and movement" },
  { id: "B5", name: "竖排从右到左", weight: 2, desc: "vertical typography arranged right to left, traditional Chinese reading direction, strong vertical rhythm" },
  { id: "B6", name: "环绕主体", weight: 3, desc: "text wraps around the main subject silhouette, following contours, integrated with image" },
  { id: "B7", name: "分散四角", weight: 3, desc: "scattered four-corner layout, text elements placed in each corner, frame-defining composition" },
  { id: "B8", name: "底部横条", weight: 3, desc: "bottom horizontal band layout, title in lower strip with gradient overlay, cinematic subtitle style" },
  { id: "B9", name: "顶部横幅", weight: 3, desc: "top horizontal banner layout, title occupies upper third, newspaper headline style" },
  { id: "B10", name: "中间腰封", weight: 3, desc: "center horizontal band (obi) layout, title in middle strip across image, book cover obi style" },
  { id: "B11", name: "左右分栏", weight: 2, desc: "left-right column split, title on one side and subtitle on other, magazine spread feel" },
  { id: "B12", name: "上下分割", weight: 3, desc: "top-bottom split layout, title above dividing line and image below, or reversed" },
  { id: "B13", name: "对角线布局", weight: 2, desc: "diagonal split layout, text on upper-left and lower-right triangles, geometric tension" },
  { id: "B14", name: "圆形环绕", weight: 2, desc: "circular text arrangement, words follow a circular path, badge or stamp composition" },
  { id: "B15", name: "网格分布", weight: 3, desc: "grid-based layout, text placed in grid cells, structured and systematic design" },
];

// ─────────────────────────────────────────────────────────────────────────────
// C. 文字效果 (15 options)
// ─────────────────────────────────────────────────────────────────────────────
export const textEffects = [
  { id: "C1", name: "纯色填充", weight: 3, desc: "solid color fill, clean flat text with no additional effects, maximum readability" },
  { id: "C2", name: "描边镂空", weight: 3, desc: "hollow outlined text with thick colored stroke border, transparent or contrasting fill inside" },
  { id: "C3", name: "渐变填充", weight: 2, desc: "gradient color fill within text, smooth color transition from top to bottom or left to right" },
  { id: "C4", name: "阴影立体", weight: 2, desc: "3D drop shadow effect, text appears elevated with deep shadow, dimensional depth" },
  { id: "C5", name: "霓虹发光", weight: 1, desc: "neon glow effect, luminous text with soft colored halo and light bleeding, electric nightlife" },
  { id: "C6", name: "模糊底衬", weight: 2, desc: "frosted glass blur block behind text, semi-transparent blurred background panel for readability" },
  { id: "C7", name: "色块遮罩", weight: 3, desc: "solid color block mask behind text, opaque rectangular or shaped background, high contrast" },
  { id: "C8", name: "半透明叠加", weight: 1, desc: "semi-transparent text overlay, text blends with background at reduced opacity, subtle and layered" },
  { id: "C9", name: "金属质感", weight: 1, desc: "metallic texture fill, chrome/gold/silver reflective surface on text, luxury premium feel" },
  { id: "C10", name: "玻璃折射", weight: 1, desc: "glass refraction effect, text distorts background like looking through glass, modern tech aesthetic" },
  { id: "C11", name: "手写涂鸦", weight: 2, desc: "hand-drawn doodle style, text appears scribbled with marker, casual and authentic" },
  { id: "C12", name: "贴纸效果", weight: 3, desc: "sticker/label effect, text on peeling sticker with white border and slight shadow" },
  { id: "C13", name: "印章盖章", weight: 1, desc: "rubber stamp effect, text appears stamped with uneven ink distribution, official and bold" },
  { id: "C14", name: "撕纸边缘", weight: 3, desc: "torn paper edge effect, text on ripped paper piece revealing layer beneath, collage feel" },
  { id: "C15", name: "胶带粘贴", weight: 0, desc: "masking tape effect, text written on semi-transparent tape strips, DIY scrapbook aesthetic" },
  { id: "C16", name: "关键词换色", weight: 3, desc: "inline keyword color-swap: within one title sentence, 1-2 key words switch to a contrasting accent color (bright yellow / green / magenta / red) while the rest stays white or black; loose letter-spacing across the line, editorial emphasis — signature of culture-review covers" },
];

// ─────────────────────────────────────────────────────────────────────────────
// D. 色彩方案 (20 options)
// ─────────────────────────────────────────────────────────────────────────────
export const colorSchemes = [
  { id: "D1", name: "黑白极简", weight: 3, desc: "black and white minimalist, #000000 title on white or #FFFFFF on dark, pure contrast" },
  { id: "D2", name: "黑金奢华", weight: 1, desc: "black and gold luxury, #1A1A1A background with #D4AF37 gold accents, premium opulence" },
  { id: "D3", name: "白金高级", weight: 2, desc: "white and platinum, #FFFFFF with #C0C0C0 silver/platinum accents, clean sophistication" },
  { id: "D4", name: "莫兰迪灰调", weight: 2, desc: "Morandi muted palette, desaturated dusty tones like #A8998C #B5C4B1 #C4A882, quiet elegance" },
  { id: "D5", name: "赛博朋克霓虹", weight: 1, desc: "cyberpunk neon, electric #FF00FF magenta + #00FFFF cyan + #39FF14 green on dark, futuristic" },
  { id: "D6", name: "大地色系", weight: 2, desc: "earth tones, warm #8B6914 ochre + #654321 brown + #2E4A1E olive, natural organic warmth" },
  { id: "D7", name: "海洋蓝调", weight: 3, desc: "ocean blue palette, #003366 navy + #0077B6 azure + #90E0EF light blue, calm depth" },
  { id: "D8", name: "日落暖橙", weight: 3, desc: "sunset warm orange, #FF6B35 coral + #FFB347 amber + #FF1744 red accent, golden hour energy" },
  { id: "D9", name: "森林绿意", weight: 3, desc: "forest green, #1B4332 deep green + #40916C mid green + #95D5B2 mint, natural vitality" },
  { id: "D10", name: "薰衣草紫", weight: 1, desc: "lavender purple, #7B2D8B deep purple + #B388FF lavender + #E1BEE7 light purple, dreamy" },
  { id: "D11", name: "对比撞色", weight: 3, desc: "complementary clash, bold opposite hues like #FF6B6B red + #4ECDC4 teal, maximum energy" },
  { id: "D12", name: "同色渐变", weight: 2, desc: "monochromatic gradient, single hue from dark to light, cohesive and harmonious depth" },
  { id: "D13", name: "三色配色", weight: 2, desc: "triadic color scheme, three evenly spaced hues on color wheel, vibrant and balanced" },
  { id: "D14", name: "单色+点缀", weight: 3, desc: "monochrome plus accent, mostly neutral with one pop color highlight, focused attention" },
  { id: "D15", name: "复古胶片色", weight: 2, desc: "vintage film color, faded warm tones #E8D5B7 + #C9956B + muted greens, nostalgic analog" },
  { id: "D16", name: "明黄活力", weight: 3, desc: "bright yellow energy, #FFDE00 primary + #FFF176 light + #F57F17 deep, optimistic and bold" },
  { id: "D17", name: "珊瑚粉嫩", weight: 1, desc: "coral pink, #FF6B6B coral + #FFB4B4 blush + #FFFFFF white, feminine and fresh" },
  { id: "D18", name: "冰蓝科技", weight: 2, desc: "ice blue tech, #00D4FF cyan + #E3F2FD ice + #0D47A1 deep blue, digital and clean" },
  { id: "D19", name: "焦糖咖啡", weight: 2, desc: "caramel coffee, #6F4E37 espresso + #C68642 caramel + #F5DEB3 cream, warm and cozy" },
  { id: "D20", name: "樱花粉白", weight: 1, desc: "sakura pink white, #FFB7C5 cherry blossom + #FFF0F5 snow + #8B4513 branch brown, gentle spring" },
];

// ─────────────────────────────────────────────────────────────────────────────
// E. 装饰元素 (20 options)
// ─────────────────────────────────────────────────────────────────────────────
export const decorations = [
  { id: "E1", name: "无装饰纯净", weight: 3, desc: "no decoration, clean text only, pure typography without any additional elements" },
  { id: "E2", name: "几何线条框", weight: 2, desc: "geometric line frame, thin rectangular or angular border around text area" },
  { id: "E3", name: "色块遮罩条", weight: 3, desc: "color block strip behind text, horizontal or vertical colored band for contrast" },
  { id: "E4", name: "圆形光斑", weight: 2, desc: "circular bokeh light spots, soft blurred circles scattered around text, dreamy atmosphere" },
  { id: "E5", name: "三角切割", weight: 2, desc: "triangular geometric cuts, sharp angular shapes dividing space, modern and edgy" },
  { id: "E6", name: "杂志切割拼贴", weight: 3, desc: "magazine cut-out collage, torn paper pieces and layered clippings, editorial mixed media" },
  { id: "E7", name: "胶带贴纸", weight: 2, desc: "washi tape, pixel-art stickers and cute sticker labels, playful DIY accents" },
  { id: "E8", name: "邮票边框", weight: 2, desc: "postage stamp perforated border, dotted edge frame, vintage mail aesthetic" },
  { id: "E9", name: "撕纸效果", weight: 3, desc: "torn paper reveal effect, ripped edges showing layer beneath, textured and raw" },
  { id: "E10", name: "网格底纹", weight: 2, desc: "grid pattern background texture, subtle graph paper or dot grid, structured and clean" },
  { id: "E11", name: "渐变光晕", weight: 2, desc: "gradient halo/glow, soft radial gradient behind text, ethereal and highlighted" },
  { id: "E12", name: "星星散点", weight: 3, desc: "scattered stars and sparkles, small star shapes dotted around text, magical and festive" },
  { id: "E13", name: "波浪线条", weight: 2, desc: "wavy flowing lines, organic curved lines as decorative elements, fluid and dynamic" },
  { id: "E14", name: "箭头指引", weight: 2, desc: "arrow pointers and direction indicators, guiding visual flow, informative and dynamic" },
  { id: "E15", name: "数字编号", weight: 3, desc: "numbered badges like 01 02 03, sequential markers, organized and editorial" },
  { id: "E16", name: "手绘涂鸦", weight: 2, desc: "hand-drawn doodle decorations, arrows circles underlines stars, casual and personal" },
  { id: "E17", name: "花卉植物", weight: 1, desc: "floral and botanical elements, leaves vines flowers as frame or accent, natural beauty" },
  { id: "E18", name: "噪点纹理", weight: 2, desc: "noise grain texture overlay, film grain or paper texture, vintage tactile quality" },
  { id: "E19", name: "光线射线", weight: 2, desc: "light rays and sunburst, radiating lines from center or corner, dramatic emphasis" },
  { id: "E20", name: "气泡对话框", weight: 1, desc: "speech bubble and dialog box, comic-style text containers, conversational and fun" },
  { id: "E21", name: "角落定位点", weight: 3, desc: "small solid color dots pinned near the four corners of the frame (blue / green / yellow / magenta), like print registration marks, quiet editorial framing device" },
  { id: "E22", name: "海报环绕拼贴", weight: 3, desc: "mini movie posters / album covers / book covers floating around the main subject like an orbit of references, evidence-collage for review and recommendation content" },
  { id: "E23", name: "引号书名号装饰", weight: 3, desc: "oversized CJK quote marks 「」 and title marks 《》 used as graphic design elements, often in a different accent color than the surrounding text" },
];

// ─────────────────────────────────────────────────────────────────────────────
// F. 构图方式 (10 options)
// ─────────────────────────────────────────────────────────────────────────────
export const compositions = [
  { id: "F1", name: "全屏铺满", weight: 3, desc: "full-bleed composition, text and elements fill entire frame edge to edge, immersive and bold" },
  { id: "F2", name: "上文下图", weight: 3, desc: "text-top image-bottom composition, upper portion for typography and lower for visual, clear separation" },
  { id: "F3", name: "下文上图", weight: 3, desc: "image-top text-bottom composition, visual dominates upper area with text anchored below" },
  { id: "F4", name: "左图右文", weight: 2, desc: "image-left text-right composition, visual on left side with typography on right, magazine spread" },
  { id: "F5", name: "右图左文", weight: 2, desc: "image-right text-left composition, visual on right side with typography on left, balanced layout" },
  { id: "F6", name: "中心聚焦", weight: 3, desc: "center-focused composition, all key elements converge to center, strong focal point" },
  { id: "F7", name: "留白呼吸", weight: 3, desc: "generous whitespace composition, minimal elements with breathing room, elegant restraint" },
  { id: "F8", name: "九宫格", weight: 3, desc: "rule-of-thirds grid composition, elements placed at grid intersections, balanced and natural" },
  { id: "F9", name: "黄金分割", weight: 3, desc: "golden ratio composition, elements follow phi spiral placement, harmonious proportions" },
  { id: "F10", name: "对称镜像", weight: 2, desc: "symmetrical mirror composition, balanced left-right or top-bottom symmetry, formal and stable" },
];

// ─────────────────────────────────────────────────────────────────────────────
// G. 情绪氛围 (10 options)
// ─────────────────────────────────────────────────────────────────────────────
export const moods = [
  { id: "G1", name: "高级冷淡", weight: 2, desc: "premium cool detachment mood, minimal and aloof, high-fashion editorial restraint" },
  { id: "G2", name: "温暖治愈", weight: 3, desc: "warm healing mood, soft golden light, comforting and nurturing atmosphere" },
  { id: "G3", name: "活力动感", weight: 3, desc: "energetic dynamic mood, bold colors and angles, youthful movement and excitement" },
  { id: "G4", name: "神秘暗黑", weight: 1, desc: "mysterious dark mood, deep shadows and moody lighting, intriguing and dramatic" },
  { id: "G5", name: "清新文艺", weight: 3, desc: "fresh literary mood, light airy colors, artistic and poetic sensibility" },
  { id: "G6", name: "复古怀旧", weight: 2, desc: "retro nostalgic mood, vintage color grading and textures, warm memory of past eras" },
  { id: "G7", name: "未来科技", weight: 1, desc: "futuristic tech mood, sleek digital elements, cutting-edge and innovative atmosphere" },
  { id: "G8", name: "自然有机", weight: 3, desc: "natural organic mood, earthy textures and botanical elements, grounded and authentic" },
  { id: "G9", name: "奢华精致", weight: 1, desc: "luxurious refined mood, rich materials gold accents, premium and exclusive feel" },
  { id: "G10", name: "幽默趣味", weight: 2, desc: "humorous playful mood, unexpected elements and fun details, lighthearted and engaging" },
  { id: "G11", name: "电影节海报", weight: 3, desc: "film-festival poster / big-brand minimalist mood: quiet luxury editorial restraint, cinematic stills or dim study backdrop, elegant thin-weight serif/hairline typography with generous letter-spacing, only 1-2 sharp accent colors, understated but high-end — like an arthouse festival poster or a designer brand campaign" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 关键词到维度的映射表（用户关键词约束特定维度）
// ─────────────────────────────────────────────────────────────────────────────
const keywordConstraints = [
  // A 维度约束
  { keywords: ["书法", "毛笔", "calligraphy", "ink"], dimension: "A", options: ["A1", "A2", "A15"] },
  { keywords: ["手写", "handwritten", "手绘"], dimension: "A", options: ["A6", "A16"] },
  { keywords: ["复古", "retro", "vintage", "怀旧"], dimension: "A", options: ["A19", "A11", "A3"] },
  { keywords: ["可爱", "卡通", "cute", "cartoon"], dimension: "A", options: ["A5", "A16"] },
  { keywords: ["高级", "premium", "luxury", "奢华"], dimension: "A", options: ["A7", "A11", "A12"] },
  { keywords: ["科技", "tech", "digital", "数码"], dimension: "A", options: ["A8", "A14", "A4"] },
  { keywords: ["杂志", "magazine", "editorial"], dimension: "A", options: ["A7", "A8", "A4"] },
  { keywords: ["中国风", "国潮", "chinese"], dimension: "A", options: ["A1", "A2", "A18", "A15"] },
  { keywords: ["vlog", "旅行", "travel", "骑行", "cycling", "运动", "户外"], dimension: "A", options: ["A4", "A8", "A6", "A13"] },

  // D 维度约束
  { keywords: ["黑金", "gold", "奢华"], dimension: "D", options: ["D2", "D9"] },
  { keywords: ["清新", "fresh", "小清新"], dimension: "D", options: ["D4", "D9"] },
  { keywords: ["暗黑", "dark", "gothic"], dimension: "D", options: ["D1", "D5", "D2"] },
  { keywords: ["温暖", "warm", "暖色"], dimension: "D", options: ["D8", "D19", "D6"] },
  { keywords: ["冷色", "cool", "蓝色"], dimension: "D", options: ["D7", "D18", "D3"] },
  { keywords: ["粉色", "pink", "少女"], dimension: "D", options: ["D17", "D20", "D10"] },
  { keywords: ["明黄", "黄色", "yellow", "活力"], dimension: "D", options: ["D16", "D14", "D1"] },

  // E 维度约束
  { keywords: ["拼贴", "collage", "杂志", "magazine", "多图", "九宫格"], dimension: "E", options: ["E6", "E9", "E15"] },
  { keywords: ["影评", "观影", "电影", "film", "movie", "cinema", "书评", "读书", "文学", "播客", "podcast", "歌单", "音乐"], dimension: "E", options: ["E21", "E22", "E23", "E15"] },

  // C 维度约束
  { keywords: ["影评", "观影", "电影", "书评", "文学", "文化", "评论"], dimension: "C", options: ["C16", "C1", "C7"] },

  // G 维度约束
  { keywords: ["高级", "premium", "冷淡"], dimension: "G", options: ["G1", "G9"] },
  { keywords: ["温暖", "治愈", "healing"], dimension: "G", options: ["G2", "G8"] },
  { keywords: ["活力", "动感", "energy"], dimension: "G", options: ["G3", "G10"] },
  { keywords: ["暗黑", "神秘", "mystery"], dimension: "G", options: ["G4"] },
  { keywords: ["文艺", "清新", "literary"], dimension: "G", options: ["G5", "G8"] },
  { keywords: ["复古", "retro", "vintage"], dimension: "G", options: ["G6"] },
  { keywords: ["科技", "未来", "future"], dimension: "G", options: ["G7"] },
  { keywords: ["影评", "观影", "电影", "书评", "文学", "文化", "评论", "播客", "大牌", "极简", "电影节", "海报"], dimension: "G", options: ["G11", "G1", "G5"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// 核心函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 加权随机选取一个元素（按 weight 字段，weight<=0 不参与抽样）
 * 若所有选项 weight<=0（极端情况），回退为均匀随机。
 */
function weightedPick(arr) {
  // 总库内一律平等（无权重高低）：只把禁用项（weight<=0，如像素/蜡笔/漫画/胶带）排除在库外，
  // 其余都是创作者喜欢的审美，平等随机抽取。
  const pool = arr.filter((x) => (x.weight ?? 2) > 0);
  const candidates = pool.length > 0 ? pool : arr;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * 加权洗牌：按 weight 进行不放回的加权抽样排序（Efraimidis-Spirakis 算法）。
 * weight 越高越靠前的概率越大；weight<=0 的项被排除。
 * 用于 A/B/D 等需要"尽量不重复但仍偏好高级项"的维度。
 */
function weightedShuffle(arr) {
  // 总库内平等洗牌（无权重偏好），只排除禁用项（weight<=0）。Fisher-Yates 均匀随机。
  const pool = arr.filter((x) => (x.weight ?? 2) > 0);
  const candidates = [...(pool.length > 0 ? pool : arr)];
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates;
}

/**
 * 根据用户关键词找出被约束的维度选项
 * @param {string} keywords - 用户输入的关键词
 * @returns {Object} 维度约束映射 { A: ["A1", "A2"], D: ["D2"], ... }
 */
function resolveConstraints(keywords) {
  if (!keywords) return {};
  const lower = keywords.toLowerCase();
  const constraints = {};

  for (const rule of keywordConstraints) {
    const matched = rule.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (matched) {
      if (!constraints[rule.dimension]) {
        constraints[rule.dimension] = new Set();
      }
      for (const opt of rule.options) {
        constraints[rule.dimension].add(opt);
      }
    }
  }

  // Convert Sets to Arrays
  const result = {};
  for (const [dim, optSet] of Object.entries(constraints)) {
    result[dim] = [...optSet];
  }
  return result;
}

/**
 * 获取维度的所有选项数组
 */
function getDimensionOptions(dimension) {
  switch (dimension) {
    case "A": return fontStyles;
    case "B": return textLayouts;
    case "C": return textEffects;
    case "D": return colorSchemes;
    case "E": return decorations;
    case "F": return compositions;
    case "G": return moods;
    default: return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 竖版安全矩阵过滤器
// 竖版（3:4 / 9:16 / 1:1）必须保留原图不调色，因此禁止会诱发整体调色的维度选项。
// ─────────────────────────────────────────────────────────────────────────────
const VERTICAL_RATIOS = new Set(["3:4", "9:16", "1:1"]);

// 竖版 G 维度白名单：允许不会诱发整体调色的氛围。
// G3 活力动感 / G10 幽默趣味 是创作者审美的主基调（明亮出片感），即使竖版也应保留；
// 照片本身的"不调色"由 prompt 里的像素保护指令负责，而非靠屏蔽情绪维度。
const VERTICAL_MOOD_WHITELIST = new Set(["G1", "G2", "G3", "G5", "G8", "G10"]);

// 竖版 D 维度黑名单：会诱发整体调色的配色方案
const VERTICAL_COLOR_BLACKLIST = new Set(["D5", "D2"]);

// 竖版 E 维度黑名单：会诱发重度视觉干扰的装饰
const VERTICAL_DECO_BLACKLIST = new Set(["E8", "E18", "E19"]);

/**
 * 应用竖版安全过滤：从候选池中移除会诱发调色的选项
 */
function applyVerticalSafetyFilter(list, dimension) {
  if (dimension === "G") {
    return list.filter((x) => VERTICAL_MOOD_WHITELIST.has(x.id));
  }
  if (dimension === "D") {
    return list.filter((x) => !VERTICAL_COLOR_BLACKLIST.has(x.id));
  }
  if (dimension === "E") {
    return list.filter((x) => !VERTICAL_DECO_BLACKLIST.has(x.id));
  }
  return list;
}

/**
 * 为一批封面生成不重复的设计矩阵组合（审美加权版）
 *
 * - A / B / D 维度：使用加权洗牌，尽量不重复且偏好高级项
 * - C / E / F / G 维度：使用加权随机，偏好高级项
 * - weight=0 的选项（如像素体 A9 / 蜡笔体 A17 / 漫画体 A20 / 胶带 C15 E7 /
 *   手绘涂鸦 E16）默认不会出现，除非被用户关键词显式约束选中。
 * - 竖版（3:4 / 9:16 / 1:1）启用安全矩阵过滤器：禁止会诱发调色的 G/D/E 选项。
 *
 * @param {number} count - 需要生成的封面数量
 * @param {string} keywords - 用户关键词（用于约束维度）
 * @param {string} [ratio] - 目标比例（可选），竖版时启用安全过滤
 * @returns {Array<Object>} 组合数组，每个元素包含各维度的选择
 */
// locked: 用户在界面上锁定的维度，如 { A: "A4", D: "D8" }——锁定维度只用该选项，其余维度照常随机。
export function generateCombinations(count, keywords = "", ratio = "", locked = {}) {
  const constraints = resolveConstraints(keywords);
  const isVertical = VERTICAL_RATIOS.has(ratio);
  const combinations = [];
  const usedCombinationKeys = new Set();

  // 关键维度用加权洗牌（兼顾多样性与审美偏好）
  // 注意：若用户关键词约束了某维度，则在约束子集内进行加权洗牌/随机
  const filterByConstraint = (list, dim) =>
    constraints[dim] ? list.filter((s) => constraints[dim].includes(s.id)) : list;

  // 竖版安全过滤（在关键词约束之后再过滤，确保安全规则优先级最高）
  const safeFilter = (list, dim) => {
    const constrained = filterByConstraint(list, dim);
    return isVertical ? applyVerticalSafetyFilter(constrained, dim) : constrained;
  };

  const lockedA = locked?.A ? fontStyles.find((s) => s.id === locked.A) : null;
  const lockedD = locked?.D ? colorSchemes.find((s) => s.id === locked.D) : null;
  const shuffledA = lockedA ? [lockedA] : weightedShuffle(filterByConstraint(fontStyles, "A"));
  const shuffledB = weightedShuffle(filterByConstraint(textLayouts, "B"));
  const shuffledD = lockedD ? [lockedD] : weightedShuffle(safeFilter(colorSchemes, "D"));

  // C / E / F / G 维度的候选池（受约束时取子集），加权随机选取
  const poolC = filterByConstraint(textEffects, "C");
  const poolE = safeFilter(decorations, "E");
  const poolF = filterByConstraint(compositions, "F");
  const poolG = safeFilter(moods, "G");

  let aIndex = 0;
  let bIndex = 0;
  let dIndex = 0;

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let combination = null;

    while (attempts < 100) {
      // 对 A、B、D 维度尽量不重复（按加权洗牌后的顺序循环取）
      const a = shuffledA[aIndex % shuffledA.length];
      const b = shuffledB[bIndex % shuffledB.length];
      const d = shuffledD[dIndex % shuffledD.length];

      // C、E、F、G 加权随机选取（偏好高级项）
      const c = weightedPick(poolC);
      const e = weightedPick(poolE);
      const f = weightedPick(poolF);
      const g = weightedPick(poolG);

      const key = `${a.id}+${b.id}+${c.id}+${d.id}+${e.id}+${f.id}+${g.id}`;

      if (!usedCombinationKeys.has(key)) {
        usedCombinationKeys.add(key);
        combination = { a, b, c, d, e, f, g, key };
        aIndex++;
        bIndex++;
        dIndex++;
        break;
      }

      // 如果冲突，尝试其他随机组合
      aIndex++;
      bIndex++;
      dIndex++;
      attempts++;
    }

    // 如果 100 次尝试后仍有冲突（几乎不可能），强制使用当前组合
    if (!combination) {
      const a = shuffledA[i % shuffledA.length];
      const b = shuffledB[i % shuffledB.length];
      const c = weightedPick(poolC);
      const d = shuffledD[i % shuffledD.length];
      const e = weightedPick(poolE);
      const f = weightedPick(poolF);
      const g = weightedPick(poolG);
      const key = `${a.id}+${b.id}+${c.id}+${d.id}+${e.id}+${f.id}+${g.id}`;
      combination = { a, b, c, d, e, f, g, key };
    }

    combinations.push(combination);
  }

  return combinations;
}

/**
 * 将组合转换为人类可读的标签
 */
export function combinationToLabel(combo) {
  return `${combo.a.name} / ${combo.d.name} / ${combo.b.name}`;
}

/**
 * 将组合转换为详细的英文设计指令（用于注入 prompt）
 */
export function combinationToDesignDirective(combo) {
  return `DESIGN MATRIX COMBINATION: ${combo.key}

FONT STYLE [${combo.a.id}]: ${combo.a.desc}
TEXT LAYOUT [${combo.b.id}]: ${combo.b.desc}
TEXT EFFECT [${combo.c.id}]: ${combo.c.desc}
COLOR SCHEME [${combo.d.id}]: ${combo.d.desc}
DECORATION [${combo.e.id}]: ${combo.e.desc}
COMPOSITION [${combo.f.id}]: ${combo.f.desc}
MOOD [${combo.g.id}]: ${combo.g.desc}

You MUST follow ALL seven dimensions above precisely. Each dimension is mandatory and must be clearly reflected in the final cover design.`;
}
