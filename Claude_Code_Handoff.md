# 封面之王 (King of Cover) - Claude Code 交接文档

> 本文档由 Manus 生成，用于向 Claude Code 交接《封面之王》项目的后续开发任务。
> **当前状态**：Phase 1 核心功能（用户系统、生图核心逻辑、积分扣费、PWA基础）已完成并经过 Manus 优化。

## 一、Manus 刚刚完成的优化（无需再做）

**1. 视觉效果优化：横版高概念环境延展（outpaint）**
- **痛点**：竖版原图生成 16:9 或 4:3 时，原代码仅贴色块或老实补全居家环境，显得廉价。
- **修复**：重写了 `buildImage2Prompt`，所有宽版/横版强制要求 gpt-image-2 执行 outpainting。并且**禁止补全写实居家环境**，改为激进替换为**电影感/杂志感/超现实高概念场景**（如霓虹赛博、暗调影棚、城市夜景大片等），仅保留人物原样。

**2. 比例选项重构与 B站安全框**
- 前端比例选项改为平台语义命名（小红书封面 3:4、竖版长图 9:16、B站封面、横版 16:9、横版 4:3）。
- 新增 `bilibili-safe` 比例：出图 16:9，但在 prompt 中强制要求**核心文字与人物收拢在 4:3 中央安全区内**，左右边缘仅留背景，防止裁切。

**3. 生成速度大幅优化（核心瓶颈已解决）**
   - **问题**：之前生成时卡在“正在分析底图”非常慢，且串行排队。
   - **解决**：`server/index.js` 中的串行逻辑已重构。现在“分析底图”和“GPT 方案规划”在后台并行执行；同时生图并发上限提升至 4（最高支持 8），实现“啪啪啪”快速并发调度。
   - **实测数据**：使用官方 `gpt-image-2` 实测 30 张（3种比例各10张）并发生成，分析+规划仅耗时 ~9 秒，随后并发触发所有生图请求。
**4. 多比例独立计数限制**
   - 修复了前端合计只能选 10 张的限制。现在**每个比例各自独立允许选 1-10 张**。
**5. 积分阶梯计费修复**
   - 修正了 `getCreditsCost` 函数。现在积分按**真实总张数**扣减（1-10 张按阶梯，超过 10 张按每满 10 张叠加 15 分计算），防止批量白嫖。
**6. OpenAI baseURL 修复**
   - 显式在 `server/index.js` 为 OpenAI 客户端指定 `baseURL`（默认 `https://api.openai.com/v1`），避免被部署环境的全局代理变量覆盖。

## 二、部署与 Admin 账号配置（重要）

*注：已向用户交付《Mac本地一键启动手册.md》，用户已可在本地免积分跑通流程。Claude Code 接手后需协助用户完成最终的线上部署。*

**绝对不要将 OpenAI API Key 写入代码或提交到 GitHub。**
在项目根目录创建 `.env.local` 文件，配置如下：

```env
# ─── 核心配置 ───
OPENAI_API_KEY=sk-proj-... # 填入真实的 Key
OPENAI_API_BASE_URL=https://api.openai.com/v1

# ─── Admin 手机号（免积分、免水印） ───
# 填入手机号，多个号码用逗号分隔
ADMIN_PHONES=13800138000,13900139000

# ─── 并发与超时（根据 Key 的速率限制调整） ───
GENERATION_CONCURRENCY=4
OPENAI_REQUEST_TIMEOUT_MS=120000
IMAGE_JOB_TIMEOUT_MS=180000
```
*注：使用 `ADMIN_PHONES` 里的手机号登录（开发模式验证码固定为 `000000`），系统会自动将其设为 admin 角色。*

---

## 三、Claude Code 需要继续完成的剩余任务

请接手的 AI 按照以下优先级，继续完成项目剩余的 Phase 2 & Phase 3 任务：

### 优先级 1：iOS PWA 安装引导 Banner
**目标**：在首次移动端 Safari 访问时，显示底部 banner 引导用户"添加到主屏幕"。
- **实现建议**：
  - 新增 `src/components/InstallBanner.tsx`。
  - 检测条件：`window.navigator.standalone === false` 且 UA 包含 Safari，且 localStorage 无忽略标记。

### 优先级 2：生成历史云端同步
**目标**：当前历史仅存在本地 IndexedDB，需要同步到数据库。
- **后端**：新增 `server/routes/history.js`，提供 GET 和 DELETE 接口，读写现有的 `generations` 表。
- **前端**：修改 `src/lib/history.ts`，登录后优先从 API 获取历史，并自动将本地 IndexedDB 历史同步到云端。

### 优先级 3：微信支付接入（Phase 2 核心）
**目标**：用户可以通过微信支付购买积分包。
- **后端**：新增 `server/routes/payment.js`，实现创建订单和微信支付回调验签加积分。
- **前端**：修改 `src/components/RechargeModal.tsx`，真实调用后端接口，显示支付二维码（PC）或跳转微信支付（手机）。

### 优先级 4：订阅套餐系统
**目标**：实现月度/年度会员体系。
- **后端**：新增 `server/routes/subscription.js`。需要写定时任务（如 node-cron），每月给活跃订阅用户发放积分。
- **前端**：新增 `SubscriptionModal.tsx` 展示套餐对比卡片并对接支付。

### 优先级 5：管理后台（简易版）
**目标**：管理员查看数据和手动充值。
- **后端**：新增 `server/routes/admin.js`（需校验 `role=admin`），提供统计数据、用户列表、手动加积分接口。
- **前端**：新增 `/admin` 路由，仅 admin 可见。

### 优先级 6：生产环境部署配置
**目标**：准备上线所需的文件。
- 编写 `Dockerfile` 和 `docker-compose.yml`（包含 Node.js 后端、React 前端构建产物、MySQL 和 Redis）。
- 编写 `nginx/koc.conf`（需支持 WebSocket/SSE 长连接超时设置）。
