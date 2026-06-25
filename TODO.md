# Lipa Cover Generator — 后续开发规划

> 本文件是给下一个 Manus session 的完整上下文。读完此文件 + 看一遍 `src/App.tsx`、`src/styles.css`、`server/index.js`、`server/prompts.js` 即可继续开发。

---

## 当前状态（已完成）

### UI 重构
- [x] 深色设计师美学主题（参考 design.com 风格）
- [x] 引导式 4 步流程：素材 → 文案 → 风格 → 生成
- [x] Step 1 三种素材输入模式：上传底图 / 素材元素（多图） / 文字描述
- [x] 比例多选器：16:9、4:3、1:1、3:4、9:16，每种 1-10 张
- [x] 杂志感 mockup 空状态（VOGUE/COVER/ELLE）
- [x] 侧滑面板：历史记录 + 高级设置
- [x] 字体：Playfair Display + Inter
- [x] 已推送到 GitHub main 分支

### 技术栈
- 前端：Vite + React + TypeScript + TailwindCSS v4
- 后端：Express + OpenAI SDK + SSE 流式响应
- 引擎：OpenAI GPT-Image-2 / 通义万相 / 即梦 / CogView / 文心一格

---

## 待开发任务

### 任务 1：设计矩阵系统（最高优先级）

**目标**：让每次生成的 10 张封面真正"完全不一样"，排列组合出百万级变化。

**需要创建文件**：`server/design-matrix.js`

矩阵维度设计：

```
A. 字体风格（20+选项）
   - 书法体、行楷、宋体、黑体、圆体、手写体、衬线英文、无衬线英文
   - 像素体、哥特体、艺术装饰体、极细体、极粗体、霓虹体
   - 毛笔飞白、钢笔手写、蜡笔质感、印章体、打字机体、漫画体

B. 文字布局（15+选项）
   - 居中霸屏、左上对齐、右下角落、斜切45度、竖排从右到左
   - 环绕主体、分散四角、底部横条、顶部横幅、中间腰封
   - 左右分栏、上下分割、对角线布局、圆形环绕、网格分布

C. 文字效果（15+选项）
   - 纯色填充、描边镂空、渐变填充、阴影立体、霓虹发光
   - 模糊底衬、色块遮罩、半透明叠加、金属质感、玻璃折射
   - 手写涂鸦、贴纸效果、印章盖章、撕纸边缘、胶带粘贴

D. 色彩方案（20+选项）
   - 黑白极简、黑金奢华、白金高级、莫兰迪灰调、赛博朋克霓虹
   - 大地色系、海洋蓝调、日落暖橙、森林绿意、薰衣草紫
   - 对比撞色、同色渐变、三色配色、单色+点缀、复古胶片色

E. 装饰元素（20+选项）
   - 无装饰纯净、几何线条框、色块遮罩条、圆形光斑、三角切割
   - 杂志切割拼贴、胶带贴纸、邮票边框、撕纸效果、网格底纹
   - 渐变光晕、星星散点、波浪线条、箭头指引、数字编号

F. 构图方式（10+选项）
   - 全屏铺满、上文下图、下文上图、左图右文、右图左文
   - 中心聚焦、留白呼吸、九宫格、黄金分割、对称镜像

G. 情绪氛围（10+选项）
   - 高级冷淡、温暖治愈、活力动感、神秘暗黑、清新文艺
   - 复古怀旧、未来科技、自然有机、奢华精致、幽默趣味
```

**改动文件**：`server/prompts.js`

- `planCovers()` 函数改为：从矩阵中为每张封面随机选取不同维度组合
- 确保同一批次内每张封面的组合不重复
- 组合信息写入 `CoverPlan.combination` 字段（如 "A3+B7+C2+D15+E8+F4+G1"）
- 用户如果填了关键词，用关键词约束某些维度（如"书法风"则锁定 A 维度为书法体）

**验收标准**：生成 10 张封面，肉眼看每张风格明显不同。

---

### 任务 2：分层输出（PSD 导出）

**目标**：输出带图层的 PSD 文件，客户可以自己改文字。

**实现路径**：

1. **安装依赖**：`npm install ag-psd`（Node.js PSD 读写库）

2. **改后端生成逻辑**（`server/index.js`）：
   - 让 AI 生成时 prompt 改为"只生成底图画面，不要在图上写任何文字"
   - 文字排版由后端程序化生成（用 node-canvas 或 sharp）
   - 最终输出两个文件：合并 PNG + 分层 PSD

3. **PSD 图层结构**：
   ```
   Layer 0: 底图（用户上传的或 AI 生成的）
   Layer 1: 主标题文字
   Layer 2: 副标题文字
   Layer 3: 装饰元素（色块/线条等）
   ```

4. **前端改动**（`src/App.tsx`）：
   - 下载按钮改为下拉菜单：下载 PNG / 下载 PSD
   - 新增 API endpoint：`POST /api/export-psd`

5. **新增 API**（`server/index.js`）：
   ```javascript
   app.post("/api/export-psd", async (req, res) => {
     // 接收 imageUrl + title + subtitle + style params
     // 用 ag-psd 生成分层 PSD
     // 返回 PSD 文件下载
   });
   ```

---

### 任务 3：多比例后端适配

**目标**：前端已支持多比例选择，但后端目前只支持单一尺寸（1024×1536）。

**改动文件**：`server/index.js`

1. 接收前端传来的 `ratios` 数组：`[{ ratio: "3:4", count: 4 }, { ratio: "16:9", count: 2 }]`
2. 根据比例映射到实际像素尺寸：
   ```
   16:9 → 1792×1024
   4:3  → 1365×1024
   1:1  → 1024×1024
   3:4  → 1024×1365
   9:16 → 1024×1792
   ```
3. 每个引擎适配器（OpenAI/万相/即梦等）的 `size` 参数动态设置
4. `planCovers()` 时把比例信息传入，让 AI 根据不同比例设计不同构图

**改动文件**：`server/prompts.js`
- `buildPlanUserPrompt()` 加入比例信息
- prompt 中说明"横版适合左右分割构图，竖版适合上下分割或全屏覆盖"

---

### 任务 4：素材元素模式后端支持

**目标**：支持"多张素材图融合"模式。

**改动**：
1. `server/index.js` 的 `/api/generate` 接收 `sourceMode` 和 `elementImages` 字段
2. 当 `sourceMode === "elements"` 时：
   - 将多张素材图拼接为一张参考图（或分别传给 AI）
   - prompt 改为"将这些素材元素融合/拼贴为一张封面"
3. 当 `sourceMode === "describe"` 时：
   - 不传 image，改用纯文生图模式
   - prompt 用 `imageDescription` 作为画面描述

---

### 任务 5：文字描述模式（文生图）后端支持

**目标**：用户不上传图片，纯文字描述生成底图。

**改动**：
1. `server/index.js` 检测 `sourceMode === "describe"`
2. 跳过 `analyzeImage()` 步骤
3. 直接用 `imageDescription` + `title` + `keywords` 构建生图 prompt
4. 调用引擎的文生图 API（而非图生图/图编辑 API）
5. OpenAI 的 `images.generate()` 而非 `images.edit()`

---

### 任务 6：UI 细节优化

- [ ] Step 3 摘要卡片中显示所选比例的可视化缩略图
- [ ] 比例选择器在移动端改为横向滚动
- [ ] 生成结果按比例分组展示（横版一行、竖版一行、方形一行）
- [ ] 添加"风格锁定"开关：用户可以选择"统一风格"或"多样化"
- [ ] 添加生成进度的预估时间
- [ ] 历史记录支持按比例筛选

---

## 技术注意事项

1. **后端 API 兼容性**：目前 `/api/generate` 要求 `image` 和 `title` 必填。改为 `sourceMode === "describe"` 时 `image` 可选。
2. **TypeScript 类型**：`src/lib/types.ts` 中的 `GenerateCount` 类型是 `1 | 2 | 4 | 10`，如果要支持任意数量（比如多比例总和超过 10），需要改为 `number`。
3. **引擎限制**：不是所有引擎都支持所有尺寸，需要在 `resolveEngine()` 中做兼容处理。
4. **Vite 配置**：已添加 `allowedHosts: true`，开发时可以用任意域名访问。

---

## 文件结构速查

```
src/App.tsx          — 前端主组件（引导式步骤流程）
src/styles.css       — 全部样式（深色主题 + 组件样式）
src/lib/types.ts     — TypeScript 类型定义
src/lib/history.ts   — IndexedDB 本地历史存储
src/lib/image.ts     — 图片工具函数
server/index.js      — Express 后端（API + 引擎适配器）
server/prompts.js    — AI prompt 模板（planning + generation）
vite.config.mjs      — Vite 配置
index.html           — 入口 HTML（已引入 Google Fonts）
```

---

## 开发顺序建议

1. **先做任务 1（设计矩阵）** — 效果最明显，解决"生成结果雷同"的核心问题
2. **再做任务 3（多比例后端）** — 前端已做好，后端补上就能用
3. **然后做任务 4+5（素材元素 + 文生图）** — 让三种模式都能真正跑通
4. **最后做任务 2（PSD 导出）** — 锦上添花，需要额外库
5. **任务 6 随时穿插做** — UI 细节可以边做边改
