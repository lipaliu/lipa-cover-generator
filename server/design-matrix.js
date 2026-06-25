/**
 * Design Matrix System
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
 * 理论组合数：20 × 15 × 15 × 20 × 20 × 10 × 10 = 9,000,000
 */

// ─────────────────────────────────────────────────────────────────────────────
// A. 字体风格 (20 options)
// ─────────────────────────────────────────────────────────────────────────────
export const fontStyles = [
  { id: "A1", name: "书法体", desc: "wild explosive Chinese calligraphy, splashing ink strokes, extremely heavy brush weight, raw aggressive energy" },
  { id: "A2", name: "行楷", desc: "flowing semi-cursive Chinese Xingkai calligraphy, elegant brush rhythm, balanced between formal and expressive" },
  { id: "A3", name: "宋体", desc: "traditional Chinese Song/Ming serif typeface, horizontal thin and vertical thick strokes, classical printing elegance" },
  { id: "A4", name: "黑体", desc: "ultra-heavy industrial Chinese gothic sans-serif (Heiti), maximum font weight, geometric solid block-like characters" },
  { id: "A5", name: "圆体", desc: "rounded bubbly Chinese Yuanti font, soft puffy edges, playful and approachable warmth" },
  { id: "A6", name: "手写体", desc: "casual handwritten Chinese characters, natural imperfect pen/pencil strokes, warm human touch" },
  { id: "A7", name: "衬线英文", desc: "cinematic English serif with dramatic thick-thin contrast, elegant movie title card feel, Didot or Bodoni style" },
  { id: "A8", name: "无衬线英文", desc: "bold condensed English sans-serif, strong geometric presence, Futura or Helvetica Neue Black style" },
  { id: "A9", name: "像素体", desc: "pixel art / 8-bit retro game style font, blocky square pixels, nostalgic digital aesthetic" },
  { id: "A10", name: "哥特体", desc: "gothic blackletter typeface, ornate medieval strokes, dark dramatic presence" },
  { id: "A11", name: "艺术装饰体", desc: "Art Deco display typeface, geometric glamour, 1920s luxury with gold accents" },
  { id: "A12", name: "极细体", desc: "ultra-thin elegant Chinese or English hairline font, refined minimal strokes, quiet with generous whitespace" },
  { id: "A13", name: "极粗体", desc: "ultra-black compressed Chinese font, maximum weight fills frame, powerful and impactful" },
  { id: "A14", name: "霓虹体", desc: "neon tube glow font style, luminous colored outlines with soft glow halo, nightlife energy" },
  { id: "A15", name: "毛笔飞白", desc: "dry brush Chinese calligraphy with flying white (feibai) texture, broken ink strokes revealing paper beneath" },
  { id: "A16", name: "钢笔手写", desc: "fountain pen handwritten style, elegant ink flow with slight pressure variation, personal letter feel" },
  { id: "A17", name: "蜡笔质感", desc: "crayon/pastel texture font, rough waxy strokes, childlike creative energy" },
  { id: "A18", name: "印章体", desc: "Chinese seal script (Zhuanshu) style, red stamp aesthetic, ancient authority" },
  { id: "A19", name: "打字机体", desc: "typewriter monospace font, uneven ink density, vintage mechanical nostalgia" },
  { id: "A20", name: "漫画体", desc: "comic/manga speech bubble font, dynamic varied weight, energetic pop culture feel" },
];

// ─────────────────────────────────────────────────────────────────────────────
// B. 文字布局 (15 options)
// ─────────────────────────────────────────────────────────────────────────────
export const textLayouts = [
  { id: "B1", name: "居中霸屏", desc: "center-dominant huge layout, title fills central frame occupying 60%+ of width, maximum visual impact" },
  { id: "B2", name: "左上对齐", desc: "top-left aligned layout, title starts from upper-left corner, clean editorial hierarchy" },
  { id: "B3", name: "右下角落", desc: "bottom-right corner layout, title anchored to lower-right, creates diagonal reading flow" },
  { id: "B4", name: "斜切45度", desc: "diagonal 45-degree tilt layout, text runs corner to corner, dynamic energy and movement" },
  { id: "B5", name: "竖排从右到左", desc: "vertical typography arranged right to left, traditional Chinese reading direction, strong vertical rhythm" },
  { id: "B6", name: "环绕主体", desc: "text wraps around the main subject silhouette, following contours, integrated with image" },
  { id: "B7", name: "分散四角", desc: "scattered four-corner layout, text elements placed in each corner, frame-defining composition" },
  { id: "B8", name: "底部横条", desc: "bottom horizontal band layout, title in lower strip with gradient overlay, cinematic subtitle style" },
  { id: "B9", name: "顶部横幅", desc: "top horizontal banner layout, title occupies upper third, newspaper headline style" },
  { id: "B10", name: "中间腰封", desc: "center horizontal band (obi) layout, title in middle strip across image, book cover obi style" },
  { id: "B11", name: "左右分栏", desc: "left-right column split, title on one side and subtitle on other, magazine spread feel" },
  { id: "B12", name: "上下分割", desc: "top-bottom split layout, title above dividing line and image below, or reversed" },
  { id: "B13", name: "对角线布局", desc: "diagonal split layout, text on upper-left and lower-right triangles, geometric tension" },
  { id: "B14", name: "圆形环绕", desc: "circular text arrangement, words follow a circular path, badge or stamp composition" },
  { id: "B15", name: "网格分布", desc: "grid-based layout, text placed in grid cells, structured and systematic design" },
];

// ─────────────────────────────────────────────────────────────────────────────
// C. 文字效果 (15 options)
// ─────────────────────────────────────────────────────────────────────────────
export const textEffects = [
  { id: "C1", name: "纯色填充", desc: "solid color fill, clean flat text with no additional effects, maximum readability" },
  { id: "C2", name: "描边镂空", desc: "hollow outlined text with thick colored stroke border, transparent or contrasting fill inside" },
  { id: "C3", name: "渐变填充", desc: "gradient color fill within text, smooth color transition from top to bottom or left to right" },
  { id: "C4", name: "阴影立体", desc: "3D drop shadow effect, text appears elevated with deep shadow, dimensional depth" },
  { id: "C5", name: "霓虹发光", desc: "neon glow effect, luminous text with soft colored halo and light bleeding, electric nightlife" },
  { id: "C6", name: "模糊底衬", desc: "frosted glass blur block behind text, semi-transparent blurred background panel for readability" },
  { id: "C7", name: "色块遮罩", desc: "solid color block mask behind text, opaque rectangular or shaped background, high contrast" },
  { id: "C8", name: "半透明叠加", desc: "semi-transparent text overlay, text blends with background at reduced opacity, subtle and layered" },
  { id: "C9", name: "金属质感", desc: "metallic texture fill, chrome/gold/silver reflective surface on text, luxury premium feel" },
  { id: "C10", name: "玻璃折射", desc: "glass refraction effect, text distorts background like looking through glass, modern tech aesthetic" },
  { id: "C11", name: "手写涂鸦", desc: "hand-drawn doodle style, text appears scribbled with marker, casual and authentic" },
  { id: "C12", name: "贴纸效果", desc: "sticker/label effect, text on peeling sticker with white border and slight shadow" },
  { id: "C13", name: "印章盖章", desc: "rubber stamp effect, text appears stamped with uneven ink distribution, official and bold" },
  { id: "C14", name: "撕纸边缘", desc: "torn paper edge effect, text on ripped paper piece revealing layer beneath, collage feel" },
  { id: "C15", name: "胶带粘贴", desc: "masking tape effect, text written on semi-transparent tape strips, DIY scrapbook aesthetic" },
];

// ─────────────────────────────────────────────────────────────────────────────
// D. 色彩方案 (20 options)
// ─────────────────────────────────────────────────────────────────────────────
export const colorSchemes = [
  { id: "D1", name: "黑白极简", desc: "black and white minimalist, #000000 title on white or #FFFFFF on dark, pure contrast" },
  { id: "D2", name: "黑金奢华", desc: "black and gold luxury, #1A1A1A background with #D4AF37 gold accents, premium opulence" },
  { id: "D3", name: "白金高级", desc: "white and platinum, #FFFFFF with #C0C0C0 silver/platinum accents, clean sophistication" },
  { id: "D4", name: "莫兰迪灰调", desc: "Morandi muted palette, desaturated dusty tones like #A8998C #B5C4B1 #C4A882, quiet elegance" },
  { id: "D5", name: "赛博朋克霓虹", desc: "cyberpunk neon, electric #FF00FF magenta + #00FFFF cyan + #39FF14 green on dark, futuristic" },
  { id: "D6", name: "大地色系", desc: "earth tones, warm #8B6914 ochre + #654321 brown + #2E4A1E olive, natural organic warmth" },
  { id: "D7", name: "海洋蓝调", desc: "ocean blue palette, #003366 navy + #0077B6 azure + #90E0EF light blue, calm depth" },
  { id: "D8", name: "日落暖橙", desc: "sunset warm orange, #FF6B35 coral + #FFB347 amber + #FF1744 red accent, golden hour energy" },
  { id: "D9", name: "森林绿意", desc: "forest green, #1B4332 deep green + #40916C mid green + #95D5B2 mint, natural vitality" },
  { id: "D10", name: "薰衣草紫", desc: "lavender purple, #7B2D8B deep purple + #B388FF lavender + #E1BEE7 light purple, dreamy" },
  { id: "D11", name: "对比撞色", desc: "complementary clash, bold opposite hues like #FF6B6B red + #4ECDC4 teal, maximum energy" },
  { id: "D12", name: "同色渐变", desc: "monochromatic gradient, single hue from dark to light, cohesive and harmonious depth" },
  { id: "D13", name: "三色配色", desc: "triadic color scheme, three evenly spaced hues on color wheel, vibrant and balanced" },
  { id: "D14", name: "单色+点缀", desc: "monochrome plus accent, mostly neutral with one pop color highlight, focused attention" },
  { id: "D15", name: "复古胶片色", desc: "vintage film color, faded warm tones #E8D5B7 + #C9956B + muted greens, nostalgic analog" },
  { id: "D16", name: "明黄活力", desc: "bright yellow energy, #FFDE00 primary + #FFF176 light + #F57F17 deep, optimistic and bold" },
  { id: "D17", name: "珊瑚粉嫩", desc: "coral pink, #FF6B6B coral + #FFB4B4 blush + #FFFFFF white, feminine and fresh" },
  { id: "D18", name: "冰蓝科技", desc: "ice blue tech, #00D4FF cyan + #E3F2FD ice + #0D47A1 deep blue, digital and clean" },
  { id: "D19", name: "焦糖咖啡", desc: "caramel coffee, #6F4E37 espresso + #C68642 caramel + #F5DEB3 cream, warm and cozy" },
  { id: "D20", name: "樱花粉白", desc: "sakura pink white, #FFB7C5 cherry blossom + #FFF0F5 snow + #8B4513 branch brown, gentle spring" },
];

// ─────────────────────────────────────────────────────────────────────────────
// E. 装饰元素 (20 options)
// ─────────────────────────────────────────────────────────────────────────────
export const decorations = [
  { id: "E1", name: "无装饰纯净", desc: "no decoration, clean text only, pure typography without any additional elements" },
  { id: "E2", name: "几何线条框", desc: "geometric line frame, thin rectangular or angular border around text area" },
  { id: "E3", name: "色块遮罩条", desc: "color block strip behind text, horizontal or vertical colored band for contrast" },
  { id: "E4", name: "圆形光斑", desc: "circular bokeh light spots, soft blurred circles scattered around text, dreamy atmosphere" },
  { id: "E5", name: "三角切割", desc: "triangular geometric cuts, sharp angular shapes dividing space, modern and edgy" },
  { id: "E6", name: "杂志切割拼贴", desc: "magazine cut-out collage, torn paper pieces and layered clippings, editorial mixed media" },
  { id: "E7", name: "胶带贴纸", desc: "washi tape and sticker decorations, colorful tape strips and cute stickers, playful DIY" },
  { id: "E8", name: "邮票边框", desc: "postage stamp perforated border, dotted edge frame, vintage mail aesthetic" },
  { id: "E9", name: "撕纸效果", desc: "torn paper reveal effect, ripped edges showing layer beneath, textured and raw" },
  { id: "E10", name: "网格底纹", desc: "grid pattern background texture, subtle graph paper or dot grid, structured and clean" },
  { id: "E11", name: "渐变光晕", desc: "gradient halo/glow, soft radial gradient behind text, ethereal and highlighted" },
  { id: "E12", name: "星星散点", desc: "scattered stars and sparkles, small star shapes dotted around text, magical and festive" },
  { id: "E13", name: "波浪线条", desc: "wavy flowing lines, organic curved lines as decorative elements, fluid and dynamic" },
  { id: "E14", name: "箭头指引", desc: "arrow pointers and direction indicators, guiding visual flow, informative and dynamic" },
  { id: "E15", name: "数字编号", desc: "numbered badges like 01 02 03, sequential markers, organized and editorial" },
  { id: "E16", name: "手绘涂鸦", desc: "hand-drawn doodle decorations, arrows circles underlines stars, casual and personal" },
  { id: "E17", name: "花卉植物", desc: "floral and botanical elements, leaves vines flowers as frame or accent, natural beauty" },
  { id: "E18", name: "噪点纹理", desc: "noise grain texture overlay, film grain or paper texture, vintage tactile quality" },
  { id: "E19", name: "光线射线", desc: "light rays and sunburst, radiating lines from center or corner, dramatic emphasis" },
  { id: "E20", name: "气泡对话框", desc: "speech bubble and dialog box, comic-style text containers, conversational and fun" },
];

// ─────────────────────────────────────────────────────────────────────────────
// F. 构图方式 (10 options)
// ─────────────────────────────────────────────────────────────────────────────
export const compositions = [
  { id: "F1", name: "全屏铺满", desc: "full-bleed composition, text and elements fill entire frame edge to edge, immersive and bold" },
  { id: "F2", name: "上文下图", desc: "text-top image-bottom composition, upper portion for typography and lower for visual, clear separation" },
  { id: "F3", name: "下文上图", desc: "image-top text-bottom composition, visual dominates upper area with text anchored below" },
  { id: "F4", name: "左图右文", desc: "image-left text-right composition, visual on left side with typography on right, magazine spread" },
  { id: "F5", name: "右图左文", desc: "image-right text-left composition, visual on right side with typography on left, balanced layout" },
  { id: "F6", name: "中心聚焦", desc: "center-focused composition, all key elements converge to center, strong focal point" },
  { id: "F7", name: "留白呼吸", desc: "generous whitespace composition, minimal elements with breathing room, elegant restraint" },
  { id: "F8", name: "九宫格", desc: "rule-of-thirds grid composition, elements placed at grid intersections, balanced and natural" },
  { id: "F9", name: "黄金分割", desc: "golden ratio composition, elements follow phi spiral placement, harmonious proportions" },
  { id: "F10", name: "对称镜像", desc: "symmetrical mirror composition, balanced left-right or top-bottom symmetry, formal and stable" },
];

// ─────────────────────────────────────────────────────────────────────────────
// G. 情绪氛围 (10 options)
// ─────────────────────────────────────────────────────────────────────────────
export const moods = [
  { id: "G1", name: "高级冷淡", desc: "premium cool detachment mood, minimal and aloof, high-fashion editorial restraint" },
  { id: "G2", name: "温暖治愈", desc: "warm healing mood, soft golden light, comforting and nurturing atmosphere" },
  { id: "G3", name: "活力动感", desc: "energetic dynamic mood, bold colors and angles, youthful movement and excitement" },
  { id: "G4", name: "神秘暗黑", desc: "mysterious dark mood, deep shadows and moody lighting, intriguing and dramatic" },
  { id: "G5", name: "清新文艺", desc: "fresh literary mood, light airy colors, artistic and poetic sensibility" },
  { id: "G6", name: "复古怀旧", desc: "retro nostalgic mood, vintage color grading and textures, warm memory of past eras" },
  { id: "G7", name: "未来科技", desc: "futuristic tech mood, sleek digital elements, cutting-edge and innovative atmosphere" },
  { id: "G8", name: "自然有机", desc: "natural organic mood, earthy textures and botanical elements, grounded and authentic" },
  { id: "G9", name: "奢华精致", desc: "luxurious refined mood, rich materials gold accents, premium and exclusive feel" },
  { id: "G10", name: "幽默趣味", desc: "humorous playful mood, unexpected elements and fun details, lighthearted and engaging" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 关键词到维度的映射表（用户关键词约束特定维度）
// ─────────────────────────────────────────────────────────────────────────────
const keywordConstraints = [
  // A 维度约束
  { keywords: ["书法", "毛笔", "calligraphy", "ink"], dimension: "A", options: ["A1", "A2", "A15"] },
  { keywords: ["手写", "handwritten", "手绘"], dimension: "A", options: ["A6", "A16", "A17"] },
  { keywords: ["复古", "retro", "vintage", "怀旧"], dimension: "A", options: ["A19", "A11", "A3"] },
  { keywords: ["可爱", "卡通", "cute", "cartoon"], dimension: "A", options: ["A5", "A20", "A17"] },
  { keywords: ["高级", "premium", "luxury", "奢华"], dimension: "A", options: ["A7", "A11", "A12"] },
  { keywords: ["科技", "tech", "digital", "数码"], dimension: "A", options: ["A8", "A9", "A14"] },
  { keywords: ["杂志", "magazine", "editorial"], dimension: "A", options: ["A7", "A8", "A4"] },
  { keywords: ["中国风", "国潮", "chinese"], dimension: "A", options: ["A1", "A2", "A18", "A15"] },

  // D 维度约束
  { keywords: ["黑金", "gold", "奢华"], dimension: "D", options: ["D2", "D9"] },
  { keywords: ["清新", "fresh", "小清新"], dimension: "D", options: ["D4", "D9", "D20"] },
  { keywords: ["暗黑", "dark", "gothic"], dimension: "D", options: ["D1", "D5", "D2"] },
  { keywords: ["温暖", "warm", "暖色"], dimension: "D", options: ["D8", "D19", "D6"] },
  { keywords: ["冷色", "cool", "蓝色"], dimension: "D", options: ["D7", "D18", "D3"] },
  { keywords: ["粉色", "pink", "少女"], dimension: "D", options: ["D17", "D20", "D10"] },

  // G 维度约束
  { keywords: ["高级", "premium", "冷淡"], dimension: "G", options: ["G1", "G9"] },
  { keywords: ["温暖", "治愈", "healing"], dimension: "G", options: ["G2", "G8"] },
  { keywords: ["活力", "动感", "energy"], dimension: "G", options: ["G3", "G10"] },
  { keywords: ["暗黑", "神秘", "mystery"], dimension: "G", options: ["G4"] },
  { keywords: ["文艺", "清新", "literary"], dimension: "G", options: ["G5", "G8"] },
  { keywords: ["复古", "retro", "vintage"], dimension: "G", options: ["G6"] },
  { keywords: ["科技", "未来", "future"], dimension: "G", options: ["G7"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// 核心函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从数组中随机选取一个元素
 */
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Fisher-Yates 洗牌
 */
function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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

/**
 * 为一批封面生成不重复的设计矩阵组合
 *
 * @param {number} count - 需要生成的封面数量
 * @param {string} keywords - 用户关键词（用于约束维度）
 * @returns {Array<Object>} 组合数组，每个元素包含各维度的选择
 */
export function generateCombinations(count, keywords = "") {
  const constraints = resolveConstraints(keywords);
  const combinations = [];
  const usedCombinationKeys = new Set();

  // 为了确保多样性，对关键维度（A字体、B布局、D色彩）做去重
  // 在 count <= 维度选项数时，确保不重复
  const usedA = new Set();
  const usedB = new Set();
  const usedD = new Set();

  // 预洗牌各维度，优先从洗牌后的顺序中选取以最大化多样性
  const shuffledA = shuffle(constraints.A
    ? fontStyles.filter((s) => constraints.A.includes(s.id))
    : fontStyles);
  const shuffledB = shuffle(constraints.B
    ? textLayouts.filter((s) => constraints.B.includes(s.id))
    : textLayouts);
  const shuffledC = shuffle(constraints.C
    ? textEffects.filter((s) => constraints.C.includes(s.id))
    : textEffects);
  const shuffledD = shuffle(constraints.D
    ? colorSchemes.filter((s) => constraints.D.includes(s.id))
    : colorSchemes);
  const shuffledE = shuffle(constraints.E
    ? decorations.filter((s) => constraints.E.includes(s.id))
    : decorations);
  const shuffledF = shuffle(constraints.F
    ? compositions.filter((s) => constraints.F.includes(s.id))
    : compositions);
  const shuffledG = shuffle(constraints.G
    ? moods.filter((s) => constraints.G.includes(s.id))
    : moods);

  let aIndex = 0;
  let bIndex = 0;
  let dIndex = 0;

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let combination = null;

    while (attempts < 100) {
      // 对 A、B、D 维度尽量不重复
      const a = shuffledA[aIndex % shuffledA.length];
      const b = shuffledB[bIndex % shuffledB.length];
      const d = shuffledD[dIndex % shuffledD.length];

      // C、E、F、G 随机选取
      const c = randomPick(shuffledC);
      const e = randomPick(shuffledE);
      const f = randomPick(shuffledF);
      const g = randomPick(shuffledG);

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
      const c = shuffledC[i % shuffledC.length];
      const d = shuffledD[i % shuffledD.length];
      const e = shuffledE[i % shuffledE.length];
      const f = shuffledF[i % shuffledF.length];
      const g = shuffledG[i % shuffledG.length];
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
