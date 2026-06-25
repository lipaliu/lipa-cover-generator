# 封面之王 King of Cover — 产品规划与开发任务书

> 本文件是完整的产品规划文档，供 Codex 执行开发、Manus 做架构审查。
> 最后更新：2026-06-25

---

## 一、产品定位

**一句话**：AI 驱动的小红书/抖音封面生成 SaaS，用户上传图+填标题，一键出专业封面。

**商业模式**：订阅 + 积分制，赚 OpenAI Image2 API 调用差价（成本 ¥0.22/张，售价 ¥0.75-1.5/张，毛利 70-80%）。

**目标用户**：
- 个人博主（小白，不会设计）
- 成长期博主（有粉丝，想提升封面质量）
- MCN/运营团队（批量出图）
- 设计师/自由职业（接单提效）

**产品形态**：PWA 网站（可添加到手机桌面，体验类似 APP）。

---

## 二、技术架构

```
前端：Vite + React + TypeScript + TailwindCSS v4（PWA）
后端：Express + MySQL + Redis
生图引擎：OpenAI GPT-Image-2（唯一线上引擎）
登录：手机号+验证码（Phase 1）→ 微信登录（Phase 2）
支付：微信支付 JSAPI/Native（需商户号）
部署：腾讯云轻量应用服务器（香港节点免备案，或国内备案后用）
```

### 数据库设计（MySQL）

```sql
-- 用户表
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  phone VARCHAR(20) UNIQUE,          -- 手机号
  wechat_openid VARCHAR(64) UNIQUE,  -- 微信 openid（Phase 2）
  nickname VARCHAR(100),
  avatar_url TEXT,
  role ENUM('user', 'admin') DEFAULT 'user',  -- admin 免费使用
  credits INT DEFAULT 0,             -- 当前积分余额
  subscription_plan VARCHAR(20),     -- 'free' | 'creator' | 'team'
  subscription_expires_at DATETIME,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
);

-- 积分流水表
CREATE TABLE credit_transactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  amount INT NOT NULL,               -- 正数=充入，负数=消耗
  type ENUM('recharge', 'subscription_grant', 'generate', 'refund', 'admin_grant'),
  description VARCHAR(200),
  reference_id VARCHAR(100),         -- 关联订单号或生成记录 ID
  balance_after INT NOT NULL,        -- 操作后余额
  created_at DATETIME DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

-- 订单表（充值/订阅）
CREATE TABLE orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  order_no VARCHAR(64) UNIQUE,       -- 业务订单号
  type ENUM('recharge', 'subscription'),
  plan VARCHAR(20),                  -- 积分包名 或 订阅套餐名
  amount_cents INT NOT NULL,         -- 支付金额（分）
  credits_granted INT DEFAULT 0,     -- 本次发放积分
  status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  payment_channel VARCHAR(20),       -- 'wechat'
  payment_transaction_id VARCHAR(100),
  paid_at DATETIME,
  created_at DATETIME DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_order_no (order_no)
);

-- 生成记录表
CREATE TABLE generations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(200),
  subtitle VARCHAR(200),
  keywords TEXT,
  source_mode ENUM('base', 'elements', 'describe'),
  image_count INT,                   -- 本次生成张数
  credits_consumed INT,              -- 消耗积分
  engine VARCHAR(20) DEFAULT 'image2',
  status ENUM('pending', 'processing', 'done', 'failed'),
  results JSON,                      -- 生成结果（图片 URL 数组）
  matrix_combinations JSON,          -- 使用的设计矩阵组合
  created_at DATETIME DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);
```

---

## 三、定价体系

### 积分消耗规则

| 单次生成张数 | 消耗积分 | 折合单价 | UI 标签 |
|:---:|:---:|:---:|:---:|
| 1 张 | 3 积分 | ¥1.5/张 | — |
| 2 张 | 5 积分 | ¥1.25/张 | — |
| 4 张 | 8 积分 | ¥1.0/张 | — |
| 10 张 | 15 积分 | ¥0.75/张 | **最划算** |

> 1 积分 ≈ ¥0.5（按充值包换算）

### 充值包

| 包名 | 积分 | 价格 | 单价 | UI 标签 |
|------|:---:|:---:|:---:|:---:|
| 尝鲜包 | 20 积分 | ¥9.9 | ¥0.50/积分 | — |
| 热门包 | 60 积分 | ¥25 | ¥0.42/积分 | **热门** |
| 超值包 | 150 积分 | ¥49 | ¥0.33/积分 | **超值** |

### 订阅套餐

| 套餐 | 月付 | 年付 | 每月发放积分 | 额外权益 |
|------|:---:|:---:|:---:|------|
| 创作者版 | ¥49/月 | ¥349/年（送500积分） | 200 积分 | 无水印、可选风格、历史30天 |
| 团队版 | ¥199/月 | ¥1499/年 | 1000 积分 | 多人协作(5人)、API接口、永久历史、优先队列 |

### 免费版限制

- 注册送 15 积分（够生成 1 次十张 或 5 次单张）
- 生成图片带水印（右下角半透明 logo）
- 只能用"AI 自动推荐风格"，不能手动选设计方向
- 不能下载原图（只能下载 70% 质量压缩版）
- 历史记录仅本地保存（不同步云端）

### admin 账号

- role = 'admin' 的用户不消耗积分，不受任何限制
- 用于你自己和内部测试

---

## 四、用户流程

### 当前流程（已实现）

```
Step 1: 上传素材 + 选模型 + 选比例+张数
Step 2: 填写文案（标题/副标题/关键词）
Step 3: 风格偏好（高级设置）
Step 4: 生成 → 展示结果
```

### 目标流程（待实现）

```
Step 0: [新增] 登录/注册（首次使用）
Step 1: 上传素材 + 选比例+张数
Step 2: [新增] AI 智能分析面板
         → 色彩提取（潘通色卡式展示 5-7 个主色）
         → 构图分析（主体位置、留白区域可视化）
         → 推荐 3-5 个设计方向（moodboard 卡片预览）
         → 推荐配色方案（互补色、类似色、三角配色）
         → 用户可选方向 / 调整 / 或跳过
Step 3: 填写文案
Step 4: 确认摘要 + 积分消耗提示 → 生成
Step 5: 结果展示（无水印/有水印取决于套餐）→ 下载
```

### 关键 UX 细节

- 未登录用户可以走到 Step 2 看到分析结果（钩子），点"生成"时弹出登录
- 积分不足时弹出充值弹窗，不跳转页面
- 生成过程中 SSE 流式推送进度，逐张展示
- 10 张选项旁边显示"最划算"标签，用颜色/大小引导
- PWA：manifest.json + service worker + 添加到桌面引导

---

## 五、开发任务分期

### Phase 1：MVP 可用版（优先级最高）

> 目标：能注册、能生成、能扣积分、能看到效果

#### 任务 P1-1：用户系统

**新增文件**：
- `server/auth.js` — 登录/注册/JWT 鉴权逻辑
- `server/middleware.js` — 鉴权中间件、积分检查中间件
- `server/sms.js` — 短信验证码（腾讯云 SMS）

**改动文件**：
- `server/index.js` — 添加 auth 路由、保护 `/api/generate`
- `src/App.tsx` — 添加登录弹窗组件

**API 设计**：
```
POST /api/auth/send-code     { phone }                    → { ok }
POST /api/auth/login         { phone, code }              → { token, user }
GET  /api/auth/me            [Header: Authorization]      → { user }
POST /api/auth/logout        [Header: Authorization]      → { ok }
```

**逻辑**：
- 手机号+验证码登录（验证码 5 分钟有效，存 Redis）
- 新手机号自动注册，发放 15 积分
- JWT token 有效期 7 天，存 localStorage
- admin 角色硬编码几个手机号（你自己的）

---

#### 任务 P1-2：积分系统

**新增文件**：
- `server/credits.js` — 积分查询、消耗、充入逻辑

**改动文件**：
- `server/index.js` — `/api/generate` 前检查余额，生成后扣费

**API 设计**：
```
GET  /api/credits/balance    → { credits, plan, expires_at }
GET  /api/credits/history    → { transactions: [...] }
```

**逻辑**：
- 生成前：检查余额 >= 所需积分，不足则返回 402
- 生成后：扣除积分，写入流水表
- admin 用户跳过积分检查
- 积分消耗规则：1张=3分，2张=5分，4张=8分，10张=15分

---

#### 任务 P1-3：水印系统

**新增文件**：
- `server/watermark.js` — 给图片添加水印

**逻辑**：
- 免费用户生成的图片，在返回前添加半透明水印
- 水印内容："封面之王 kingofcover.com"
- 付费用户（有有效订阅）返回无水印原图
- 使用 sharp 库处理图片

---

#### 任务 P1-4：前端登录 UI

**改动文件**：
- `src/App.tsx` — 添加登录状态管理
- 新增 `src/components/LoginModal.tsx`
- 新增 `src/components/CreditsBadge.tsx`（顶部显示余额）
- 新增 `src/components/RechargeModal.tsx`（积分不足时弹出）

**逻辑**：
- 顶部导航栏显示：头像 + 积分余额
- 未登录点"生成"→ 弹出登录弹窗
- 积分不足点"生成"→ 弹出充值弹窗
- 登录后记住状态（localStorage token）

---

#### 任务 P1-5：PWA 配置

**新增/改动文件**：
- `public/manifest.json` — PWA manifest
- `public/sw.js` — Service Worker（缓存静态资源）
- `index.html` — 添加 manifest link
- `public/icons/` — 各尺寸图标（192x192, 512x512）

**效果**：
- iOS Safari 弹出"添加到主屏幕"提示
- 添加后全屏打开，无地址栏，有启动画面
- 离线时显示友好提示页

---

### Phase 2：能收钱

> 目标：接入微信支付，用户可以自助充值

#### 任务 P2-1：微信支付接入

**前置条件**：
- 微信支付商户号（需营业执照）
- 已完成商户号与公众号/小程序绑定

**新增文件**：
- `server/payment.js` — 微信支付下单、回调、退款
- `server/routes/payment.js` — 支付相关路由

**API 设计**：
```
POST /api/payment/create-order   { plan, type }    → { order_no, pay_params }
POST /api/payment/notify         [微信回调]         → 处理支付结果
GET  /api/payment/orders         → { orders: [...] }
```

**逻辑**：
- 用户选择充值包/订阅 → 创建订单 → 调起微信支付
- 微信回调确认支付成功 → 发放积分/激活订阅
- 订阅到期自动降级为免费版（不自动续费，除非用户主动）

---

#### 任务 P2-2：充值/订阅 UI

**新增文件**：
- `src/components/PricingModal.tsx` — 套餐选择+支付弹窗
- `src/components/SubscriptionBadge.tsx` — 显示当前套餐状态

**逻辑**：
- 充值弹窗展示积分包和订阅套餐
- 手机端：微信内直接 JSAPI 支付；浏览器内跳转微信支付
- PC 端：显示支付二维码（Native 支付）
- 支付成功后实时刷新余额

---

#### 任务 P2-3：订阅管理

**逻辑**：
- 每月 1 号自动发放订阅积分（定时任务）
- 订阅到期前 3 天推送提醒（如果有微信通知能力）
- 用户可在个人中心查看订阅状态、到期时间、续费

---

### Phase 3：体验升级

> 目标：让产品更专业、更有粘性

#### 任务 P3-1：AI 智能分析面板（设计顾问）

**新增文件**：
- `server/analyze.js` — 图片色彩/构图深度分析
- `src/components/AnalysisPanel.tsx` — 分析结果展示 UI

**功能**：
- 上传图片后自动分析：
  - 提取 5-7 个主色（潘通色卡式展示，带色号）
  - 分析构图（主体位置、留白区域高亮标注）
  - 判断图片情绪/风格
- 基于分析推荐：
  - 3 种配色方案（互补色、类似色、撞色）
  - 3-5 个设计方向卡片（带缩略预览描述）
- 用户可以：
  - 选择一个方向 → 在该方向内生成变体
  - 手动调整配色 → 锁定色彩维度
  - 跳过分析 → 直接用 AI 自动推荐（免费版只能这样）

**注意**：分析步骤调用 GPT-4o Vision，成本约 $0.01/次，不额外收费（包含在生成费用中）。

---

#### 任务 P3-2：设计矩阵优化 — 风格套餐系统

**改动文件**：
- `server/design-matrix.js` — 添加搭配规则和预设套餐

**目标**：解决纯随机组合导致的"逻辑矛盾"和"死板感"问题。

**方案**：
```javascript
// 预设 30-50 个经过验证的"风格套餐"
// 每个套餐是 7 维的固定搭配，确保审美协调
export const stylePresets = [
  {
    id: "ink-zen",
    name: "水墨禅意",
    tags: ["中国风", "文艺", "安静"],
    combination: { a: "A1", b: "B5", c: "C1", d: "D1", e: "E1", f: "F7", g: "G1" },
  },
  {
    id: "cyber-pop",
    name: "赛博流行",
    tags: ["科技", "潮流", "年轻"],
    combination: { a: "A14", b: "B1", c: "C5", d: "D5", e: "E19", f: "F1", g: "G7" },
  },
  // ... 更多套餐
];

// 搭配亲和力规则（哪些维度之间天然搭配）
export const affinityRules = [
  { if: { a: ["A1", "A2", "A15", "A18"] }, prefer: { d: ["D1", "D6", "D4"], g: ["G1", "G5"] } },
  { if: { a: ["A9", "A14"] }, prefer: { d: ["D5", "D18"], g: ["G7", "G3"] } },
  // ...
];
```

生成逻辑改为：
1. 先从预设套餐中选取（保证审美质量）
2. 在套餐基础上做微调（保证多样性）
3. 如果用户指定了方向，从对应 tag 的套餐中选取

---

#### 任务 P3-3：微信登录

**前置条件**：微信开放平台企业认证（¥300/年）

**逻辑**：
- PC 端：微信扫码登录
- 手机微信内：静默授权获取 openid
- 绑定已有手机号账号（如果手机号已注册）

---

#### 任务 P3-4：生成历史云端同步

**改动**：
- 生成结果存入 `generations` 表
- 图片上传到腾讯云 COS（对象存储）
- 前端从云端加载历史记录
- 免费版：不同步（仅本地 IndexedDB）
- 付费版：云端保存 30 天 / 永久

---

#### 任务 P3-5：管理后台

**新增**：简单的 admin 页面（可以用现有前端框架）

**功能**：
- 用户列表（搜索、查看详情、手动充积分）
- 收入统计（日/周/月收入、订阅数、充值数）
- 生成统计（日均生成次数、API 成本）
- 手动封禁用户

---

### Phase 4：增长

#### 任务 P4-1：邀请返利

- 每个用户有邀请码
- 新用户通过邀请码注册 → 双方各得 10 积分
- 邀请排行榜

#### 任务 P4-2：模板市场

- 把好的设计方向/风格套餐做成"模板"
- 用户可以收藏模板、一键复用
- 后期可以让用户上传自己的模板（UGC）

#### 任务 P4-3：批量生成模式（团队版）

- 一次上传多张底图
- 统一标题/风格，批量出图
- 适合 MCN 批量生产封面

---

## 六、部署方案

### 推荐配置

```
腾讯云轻量应用服务器（香港节点）
- 规格：2核 2G 内存 50G SSD
- 价格：~34元/月
- 系统：Ubuntu 22.04

配套服务：
- 腾讯云 MySQL（或服务器本地装 MySQL）
- 腾讯云 Redis（或服务器本地装 Redis）
- 腾讯云 COS（存生成的图片）
- 腾讯云 SMS（发验证码）
- 域名 + SSL 证书（Let's Encrypt 免费）
```

### 部署流程

```bash
# 1. 服务器初始化
sudo apt update && sudo apt install -y nginx nodejs npm mysql-server redis-server
npm install -g pm2

# 2. 克隆项目
git clone https://github.com/lipaliu/lipa-cover-generator.git
cd lipa-cover-generator

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入：
# OPENAI_API_KEY=sk-xxx
# MYSQL_URL=mysql://user:pass@localhost:3306/kingofcover
# REDIS_URL=redis://localhost:6379
# SMS_SECRET_ID=xxx
# SMS_SECRET_KEY=xxx
# WECHAT_PAY_MERCHANT_ID=xxx
# JWT_SECRET=随机字符串

# 4. 构建并启动
npm install
npm run build
pm2 start server/index.js --name kingofcover -- --serve-dist

# 5. Nginx 反代
# /etc/nginx/sites-available/kingofcover
server {
    listen 443 ssl;
    server_name kingofcover.com;
    ssl_certificate /etc/letsencrypt/live/kingofcover.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kingofcover.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 300s;  # SSE 长连接需要
    }
}
```

---

## 七、文件结构规划（最终）

```
lipa-cover-generator/
├── src/                          # 前端
│   ├── App.tsx                   # 主组件
│   ├── components/
│   │   ├── LoginModal.tsx        # 登录弹窗
│   │   ├── CreditsBadge.tsx      # 积分余额显示
│   │   ├── RechargeModal.tsx     # 充值弹窗
│   │   ├── PricingModal.tsx      # 套餐选择
│   │   ├── AnalysisPanel.tsx     # AI 分析面板
│   │   └── WatermarkNotice.tsx   # 水印提示
│   ├── lib/
│   │   ├── types.ts
│   │   ├── api.ts                # API 请求封装
│   │   ├── auth.ts               # 登录状态管理
│   │   ├── history.ts
│   │   └── image.ts
│   └── styles.css
├── server/                       # 后端
│   ├── index.js                  # Express 主入口 + 路由
│   ├── prompts.js                # AI prompt 模板
│   ├── design-matrix.js          # 设计矩阵系统
│   ├── auth.js                   # 登录/注册/JWT
│   ├── credits.js                # 积分系统
│   ├── payment.js                # 微信支付
│   ├── watermark.js              # 水印处理
│   ├── analyze.js                # 图片深度分析
│   ├── sms.js                    # 短信验证码
│   ├── middleware.js             # 鉴权/积分检查中间件
│   └── db.js                     # 数据库连接
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service Worker
│   └── icons/                    # PWA 图标
├── sql/
│   └── schema.sql                # 数据库建表语句
├── .env.example                  # 环境变量模板
├── package.json
├── vite.config.mjs
├── TODO.md                       # 原始任务（保留参考）
└── ROADMAP.md                    # 本文件
```

---

## 八、开发顺序（给 Codex 的执行指令）

```
优先级从高到低：

1. P1-1 用户系统（手机号登录）
2. P1-2 积分系统（余额检查+扣费）
3. P1-4 前端登录 UI（弹窗+余额显示）
4. P1-3 水印系统
5. P1-5 PWA 配置
6. P2-1 微信支付接入
7. P2-2 充值/订阅 UI
8. P3-1 AI 分析面板
9. P3-2 设计矩阵优化（风格套餐）
10. P3-4 历史云端同步
11. P3-5 管理后台
```

---

## 九、注意事项

1. **不要动现有的生成逻辑**：`server/index.js` 中的 `/api/generate`、`planCovers()`、`generateImage2Cover()` 等已经能正常工作，只需要在前面加中间件（鉴权+积分检查）。

2. **SeeDance 相关代码保留但不部署**：线上只用 Image2，SeeDance 的代码留着供本地开发使用。前端的引擎选择器在线上版本隐藏或只显示 Image2。

3. **环境变量管理**：所有密钥通过 `.env.local` 管理，`.env.example` 只放变量名不放值。

4. **图片存储**：生成的图片目前是 base64 data URL 直接返回前端。Phase 3 需要改为上传到 COS 并返回 URL（用于云端历史记录）。

5. **并发控制**：同一用户同时只能有一个生成任务在跑（防止刷积分 bug）。用 Redis 锁实现。

6. **错误处理**：OpenAI API 调用失败时，不扣积分（或退还积分）。在 credit_transactions 中记录 refund。

7. **前端已有的 PWA 基础**：`index.html` 已有 `apple-mobile-web-app-capable` meta 标签，只需补充 manifest.json 和 service worker。

---

## 十、前置准备清单（需要你手动完成）

- [ ] 注册腾讯云账号，购买轻量应用服务器（香港）
- [ ] 注册域名（如 kingofcover.com 或 coverking.cn）
- [ ] 办理个体工商户营业执照（微信支付必需）
- [ ] 申请微信支付商户号
- [ ] 开通腾讯云 SMS 短信服务
- [ ] 开通腾讯云 COS 对象存储
- [ ] （可选）微信开放平台企业认证（微信登录用，¥300/年）
