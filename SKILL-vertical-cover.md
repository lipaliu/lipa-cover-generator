---
name: xhs-cover
description: "Generate high-conversion Xiaohongshu/Douyin video cover images with professional Chinese typography overlay on user-provided photos. Uses a multi-dimensional free-combination system: Font Style × Color Strategy × Layout × Decoration × Text Treatment — producing virtually unlimited unique cover designs. Use when: user provides a background photo + text content and wants a finished short-video cover."
---

# 小红书/抖音封面生成 Skill（多维组合版）

## 核心理念

封面设计 = **字体** × **色彩** × **排版** × **装饰** × **文字处理** 的自由组合。不是固定的几种模板，而是5个维度各选一种，排列组合出无限可能。

## 默认工作流

1. 用户提供底图 + 文字内容
2. 分析底图（色调、明度、人物位置、留白区域）
3. 从5个维度各选取最适合的选项，组合出**8-10种**不同方案
4. 一次性输出**8-10张**风格各异的封面（最少6张，最多12张）
5. **每张封面必须在字体、色彩、排版上有明显差异**（不能只换颜色）

## 绝对禁止

- 禁止生成AI假人/假脸
- 禁止先生成空白背景再叠文字
- 禁止4张封面风格雷同（必须跨维度差异化）
- 禁止忽略底图色彩直接用固定颜色

---

## 维度A：字体风格（12种）

| ID | 字体名 | Prompt描述 | 气质 |
|---|---|---|---|
| A1 | 狂野书法 | wild explosive calligraphy, splashing ink strokes, extremely heavy brush | 霸气、情绪、逆袭 |
| A2 | 超粗黑体 | ultra-heavy industrial gothic sans-serif, maximum weight, rounded corners | 干货、权威、冲击 |
| A3 | 手写随性 | casual handwritten style, natural imperfect strokes, pen/pencil texture | 亲切、日常、真实 |
| A4 | 像素复古 | pixel/8-bit retro game font, blocky characters, nostalgic digital feel | 趣味、年轻、潮流 |
| A5 | 圆润卡通 | rounded bubbly cartoon font, soft edges, playful and cute | 可爱、活泼、轻松 |
| A6 | 电影衬线 | cinematic serif with dramatic thick-thin contrast, elegant title card | 高级、质感、故事 |
| A7 | 杂志标题 | bold condensed magazine headline font, strong vertical stress | 时尚、专业、都市 |
| A8 | 马克笔涂鸦 | thick marker/highlighter handwritten, bold strokes with ink bleeding | 个性、街头、态度 |
| A9 | 综艺立体 | 3D extruded text with colorful outline, shadow, and highlight layers | 热闹、综艺、吸睛 |
| A10 | 纤细文艺 | thin elegant serif or light-weight sans, refined and minimal | 文艺、安静、留白 |
| A11 | 描边空心 | hollow outlined text with thick colored stroke, no fill or contrasting fill | 设计感、现代、潮 |
| A12 | 混合字体 | mix 2-3 font styles in one composition (e.g. bold title + handwritten accent) | 层次、丰富、专业 |

## 维度B：色彩策略（基于底图分析）

### Step 0：底图色彩分析（每次必做）

观察底图判断：主色调、明度（亮/暗/中）、饱和度（高/中/低）、色温（暖/冷/中）

### 色彩选择逻辑

```
IF 底图偏暗 → 主标题用高亮高饱和色（明黄/亮白/荧光绿/电光蓝/亮橙/荧光粉）
IF 底图偏亮 → 主标题用深色重色（纯黑/深蓝/暗红/墨绿/深紫）
IF 底图高饱和 → 主标题用补色（色环180°对面）
IF 底图低饱和 → 主标题用任意高饱和鲜艳色
```

### 可用色彩组合

| ID | 组合名 | 主标题色 | 副标题/辅助色 | 适用底图 |
|---|---|---|---|---|
| B1 | 明黄+白 | #FFDE00 | #FFFFFF | 暗调底图 |
| B2 | 纯白+浅灰 | #FFFFFF | #E0E0E0 | 暗调/中性底图 |
| B3 | 冰蓝+白 | #00D4FF | #FFFFFF | 暖调底图（补色） |
| B4 | 荧光绿+白 | #39FF14 / #00E676 | #FFFFFF | 暗调/紫调底图 |
| B5 | 珊瑚粉+白 | #FF6B6B | #FFFFFF | 冷调/绿调底图 |
| B6 | 深黑+灰 | #1A1A1A | #4A4A4A | 亮调底图 |
| B7 | 暖橙+白 | #FF6B35 | #FFFFFF | 冷调/蓝调底图 |
| B8 | 薄荷绿+深绿 | #4ECDC4 | #1B4332 | 暖调亮底图 |
| B9 | 渐变双色 | 渐变（如蓝→紫/橙→粉） | #FFFFFF | 中性底图 |
| B10 | 描边撞色 | 字体一色+描边另一色 | 对比色 | 复杂背景 |
| B11 | 深蓝+金 | #0A2463 | #D4AF37 | 亮调底图 |
| B12 | 砖红+米白 | #C0392B | #FFF8E7 | 中性/冷调底图 |

**规则**：副标题永远与主标题拉开层级（色相/明度/饱和度至少差一级）

## 维度C：排版布局（14种）

| ID | 布局名 | 描述 | 适用场景 |
|---|---|---|---|
| C1 | 顶部横排 | 主标题占顶部1/3，副标题紧随其下 | 人物在中下方 |
| C2 | 底部压字 | 主标题在底部，配深色渐变蒙版 | 人物在上方 |
| C3 | 居中霸屏 | 主标题铺满画面中心，可叠人物 | 文字为核心 |
| C4 | 左对齐阶梯 | 每行左对齐，逐行右移缩进 | 人物偏右 |
| C5 | 右对齐阶梯 | 每行右对齐，逐行左移缩进 | 人物偏左 |
| C6 | 对角分布 | 主标题左上/右下（或反之） | 人物居中 |
| C7 | 竖排文字 | 主标题从上到下竖排 | 纵向空间大 |
| C8 | 环绕主体 | 文字环绕人物排列 | 主体轮廓清晰 |
| C9 | 分区色块 | 画面分上下/左右区，文字在色块区内 | 信息量大 |
| C10 | 杂志多层 | 大标题+小标题+标签+英文多层信息 | 专业/知识类 |
| C11 | 散落式 | 文字大小角度各异散落画面各处 | 活泼/创意类 |
| C12 | 框架式 | 文字在方框/圆框/括号内 | 强调/引用感 |
| C13 | 瀑布流 | 文字从上到下逐渐变小 | 故事/递进感 |
| C14 | 满铺式 | 超大文字铺满整个画面，人物从文字间透出 | 强冲击力 |

## 维度D：装饰元素（可叠加多个）

| ID | 装饰名 | Prompt描述 | 效果 |
|---|---|---|---|
| D1 | 色块底框 | rounded rectangle color block behind text | 信息分区 |
| D2 | 渐变蒙版 | gradient dark overlay on top/bottom/side | 文字可读性 |
| D3 | 英文装饰 | small English text as decorative accent line | 设计感 |
| D4 | 手绘标注 | hand-drawn arrows, circles, underlines | 亲切感 |
| D5 | 引号/书名号 | 「」or《》or "" decorative quotation marks | 强调引用 |
| D6 | 序号标签 | numbered badges (01, 02, 03) | 系列感 |
| D7 | 描边阴影 | thick outline + drop shadow on text | 立体感 |
| D8 | 胶带/贴纸 | tape/sticker effect on text blocks | 手账风 |
| D9 | 打勾打叉 | checkmark ✓ or cross ✗ marks | 对比/评测 |
| D10 | REC/录制标记 | REC dot, camera frame, vlog badge | Vlog感 |
| D11 | 毛玻璃底 | frosted glass blur block behind text | 现代科技感 |
| D12 | 几何色块 | diagonal/triangular/circular color shapes | 设计感 |
| D13 | 无装饰 | clean, no extra decoration, text only | 极简高级 |

## 维度E：文字处理技巧（可叠加多个）

| ID | 技巧名 | 描述 | 效果 |
|---|---|---|---|
| E1 | 关键词放大 | 句中某几个字比其他字大2-3倍 | 视觉锤 |
| E2 | 关键词变色 | 句中关键词用不同颜色 | 重点突出 |
| E3 | 关键词色块 | 关键词加底色块高亮 | 标记感 |
| E4 | 文字倾斜 | 整体或局部倾斜3-8度 | 动感 |
| E5 | 文字重叠 | 字与字/行与行部分重叠 | 紧凑冲击 |
| E6 | 文字遮挡 | 被人物/物体部分遮挡 | 空间层次 |
| E7 | 文字出血 | 超出画面边缘被裁切 | 张力 |
| E8 | 大小混排 | 同一行内字号不同 | 节奏感 |
| E9 | 中英混排 | 中文主体+英文装饰点缀 | 国际感 |
| E10 | 竖横混排 | 部分竖排部分横排 | 设计感 |
| E11 | 双行拆分 | 标题按语义拆成两行 | 呼吸感 |
| E12 | 问号/感叹强调 | 标点符号特别大或特殊处理 | 情绪感 |

---

## 组合生成流程

### 1. 分析底图
- 主色调、明度、饱和度、色温
- 人物/主体位置（偏左/偏右/居中/上方/下方）
- 留白区域在哪里
- 背景复杂度

### 2. 为8-10张封面分配不同组合

确保每张封面在**字体(A)**和**排版(C)**上尽量不重复，色彩(B)和装饰(D)尽量不同。8-10张封面应覆盖尽可能多的维度选项：

```
封面1: A1书法 + B1明黄 + C3居中霸屏 + D7描边阴影 + E4倾斜+E5重叠
封面2: A2超粗黑体 + B3冰蓝 + C1顶部横排 + D1色块底框 + E1关键词放大
封面3: A5圆润卡通 + B4荧光绿 + C11散落式 + D4手绘标注 + E9中英混排
封面4: A6电影衬线 + B2纯白 + C2底部压字 + D2渐变蒙版 + E11双行拆分
封面5: A9综艺立体 + B9渐变 + C14满铺 + D7描边阴影 + E7出血+E5重叠
封面6: A8马克笔 + B7暖橙 + C4左对齐阶梯 + D4手绘标注 + E8大小混排
封面7: A7杂志标题 + B6深黑 + C10杂志多层 + D5引号+D3英文 + E2关键词变色
封面8: A11描边空心 + B10撞色 + C6对角 + D12几何色块 + E1关键词放大
封面9: A3手写 + B2纯白 + C7竖排 + D3英文+D10 REC + E10竖横混排
封面10: A4像素 + B4荧光绿 + C9分区色块 + D6序号 + E3关键词色块
```

### 3. 构建Prompt

```
Edit the provided image to create a finished Xiaohongshu/Douyin video cover.

PHOTO ANALYSIS:
- Dominant color: [色调]
- Brightness: [亮/暗/中]
- Subject position: [人物位置]
- Available space for text: [留白区域]

DESIGN COMBINATION:
- Font style: [维度A选择] 
- Color scheme: [维度B选择，含具体色值]
- Layout: [维度C选择]
- Decoration: [维度D选择]
- Text treatment: [维度E选择]

TEXT CONTENT:
LINE 1 (Main title): "[主标题]"
- Font: [A维度的prompt描述]
- Color: [具体色值] with [描边/阴影细节]
- Size: MASSIVE - each character about 20-25% of frame width
- Position: [C维度决定的位置]
- Treatment: [E维度的处理方式]

LINE 2 (Subtitle): "[副标题]"
- Font: [副标题字体]
- Color: [副标题色值]
- Size: 1/3 to 1/4 of main title
- Position: [相对主标题的位置]

DECORATION: [D维度的装饰描述]

RULES:
- Text must feel INTEGRATED into the photo, not floating
- Main title HUGE (30%+ of frame width)
- Size contrast between title and subtitle at least 3:1
- Preserve original photo exactly
- ONLY add text overlay and specified decorations
```

## 质量自检

1. 主标题够大吗？（占画面30%+宽度）
2. 颜色与底图形成足够对比吗？（不是固定色）
3. 封面之间差异够大吗？（字体+排版尽量不重复）
4. 文字与画面融合吗？（不像PS随便贴的）
5. 排版有设计感吗？（不是千篇一律居中）
6. 装饰元素合理吗？（加分而非干扰）

## 内容调性匹配建议

| 内容类型 | 推荐字体 | 推荐排版 | 推荐装饰 |
|---|---|---|---|
| 情绪/逆袭/痛点 | A1书法/A8马克笔/A9综艺 | C3居中/C14满铺/C6对角 | D7描边阴影/D13无装饰 |
| 知识/干货/教程 | A2超粗黑体/A7杂志/A12混合 | C1顶部/C4左对齐/C9分区 | D1色块底框/D6序号 |
| Vlog/日常/旅行 | A3手写/A5卡通/A10纤细 | C11散落/C8环绕/C13瀑布 | D4手绘标注/D10 REC标记/D3英文 |
| 美妆/好物/测评 | A5卡通/A2黑体/A11描边 | C1顶部/C10杂志/C12框架 | D1色块/D9打勾打叉/D8贴纸 |
| 职场/商业/采访 | A6衬线/A7杂志/A2黑体 | C2底部/C10杂志/C4左对齐 | D2渐变蒙版/D5引号/D3英文 |
| 女性成长/自我 | A3手写/A6衬线/A10纤细 | C5右对齐/C7竖排/C13瀑布 | D5引号/D3英文/D13无装饰 |
