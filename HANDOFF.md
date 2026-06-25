# Codex 交接文档 — 剩余开发任务

> 本文件描述 Manus 已完成的工作和 Codex 需要继续完成的任务。
> 最后更新：2026-06-25

---

## 已完成的工作（全部已推送到 main）

### Bug 修复
- [x] 修复 `gpt-image-2` 的 `images.edit` 不支持 `input_fidelity` 参数导致 400 错误

### 后端 — 全部已写好，语法验证通过
- [x] `server/db.js` — MySQL 连接池，无 DB 时优雅降级
- [x] `server/auth.js` — 手机号+验证码登录，JWT，自动注册，admin 角色
- [x] `server/credits.js` — 积分扣费/退还/充值/流水查询
- [x] `server/sms.js` — 腾讯云 SMS（dev 模式用 "000000" 万能验证码）
- [x] `server/watermark.js` — sharp 添加水印（免费用户）
- [x] `server/middleware.js` — optionalAuth / requireAuth / requireCredits
- [x] `server/routes/auth.js` — POST /api/auth/send-code, POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout
- [x] `server/routes/credits.js` — GET /api/credits/balance, GET /api/credits/history
- [x] `server/index.js` — 已集成中间件、路由挂载、积分扣费、水印逻辑
- [x] `sql/schema.sql` — 完整建表语句
- [x] `.env.example` — 所有环境变量模板

### 前端组件 — 已写好并集成到 App.tsx
- [x] `src/lib/api.ts` — Auth/Credits API 客户端 + token 管理
- [x] `src/components/LoginModal.tsx` — 登录弹窗
- [x] `src/components/CreditsBadge.tsx` — 积分余额显示
- [x] `src/components/RechargeModal.tsx` — 充值弹窗（UI 占位，支付功能待接入）
- [x] `src/components/auth-styles.css` — 所有组件样式
- [x] `src/App.tsx` — 完整集成：auth 状态、CreditsBadge 在 header、生成前登录检查、token header、401/402 处理、生成后刷新余额、Step 3 积分预览

### 功能改进
- [x] 线上环境自动隐藏 SeeDance 引擎选项（仅 dev 模式可见）
- [x] Step 3 确认摘要显示积分消耗预览（管理员显示"免费"）

### PWA
- [x] `public/manifest.json` — 已更新品牌名"封面之王"
- [x] `public/sw.js` — 已更新缓存版本
- [x] `public/icons/icon-192.png` — 新品牌图标（金色皇冠+图片框）
- [x] `public/icons/icon-512.png` — 新品牌图标

---

## Codex 需要完成的剩余任务

### 任务 1：iOS PWA 安装引导 Banner

在首次移动端 Safari 访问时，显示底部 banner 引导用户"添加到主屏幕"。

**实现要点**：
```tsx
// src/components/InstallBanner.tsx
// 检测条件：
// 1. window.navigator.standalone === false（未安装）
// 2. UA 包含 Safari 且不包含 Chrome（排除 Chrome on iOS）
// 3. localStorage 没有 "koc-install-dismissed" 标记

// UI：底部固定 banner
// - 文案："添加到主屏幕，获得 APP 般体验"
// - 带关闭按钮，关闭后 localStorage 记住不再显示
// - 带一个简单的动画箭头指向 Safari 分享按钮位置
```

在 `App.tsx` 中导入并放在 `</main>` 前面。

---

### 任务 2：微信支付接入（Phase 2 核心）

**前置条件**：需要微信支付商户号和 API 密钥。

**后端**：
```
新增 server/routes/payment.js：
- POST /api/payment/create-order — 创建充值订单（生成微信支付二维码）
- POST /api/payment/notify — 微信支付回调通知（验签+加积分）
- GET /api/payment/check/:orderId — 前端轮询订单状态

使用微信支付 JSAPI/Native 支付：
- PC 端：Native 支付（扫码）
- 手机端：JSAPI 支付（微信内）或 H5 支付（浏览器）

npm 依赖：wechatpay-node-v3 或直接用 axios 调微信支付 API v3
```

**前端**：
```
修改 src/components/RechargeModal.tsx：
- 选择充值包后调 /api/payment/create-order
- 显示支付二维码（PC）或跳转微信支付（手机）
- 轮询 /api/payment/check/:orderId 等待支付完成
- 支付成功后刷新余额并关闭弹窗
```

**数据库**：
```sql
-- sql/schema.sql 中已有 orders 表，确认字段：
-- id, user_id, type(recharge/subscribe), amount_cents, credits, 
-- pay_method, pay_trade_no, status(pending/paid/failed), created_at, paid_at
```

---

### 任务 3：订阅套餐系统

**后端**：
```
新增 server/routes/subscription.js：
- GET /api/subscription/plans — 获取套餐列表
- POST /api/subscription/create — 创建订阅订单
- GET /api/subscription/current — 获取当前订阅状态

套餐逻辑：
- 月度会员 ¥49/月 → 每月发 200 积分
- 年付 ¥349 → 每月发 200 积分 + 额外送 500 积分
- 需要定时任务每月 1 号给活跃订阅用户发积分
```

**前端**：
```
新增 src/components/SubscriptionModal.tsx：
- 展示套餐对比卡片
- 选择后跳转支付流程
```

---

### 任务 4：管理后台（简易版）

**后端**：
```
新增 server/routes/admin.js（requireAuth + role=admin 检查）：
- GET /api/admin/stats — 总用户数、今日新增、总收入、今日生成次数
- GET /api/admin/users — 用户列表（分页）
- POST /api/admin/users/:id/credits — 手动给用户加积分
- GET /api/admin/orders — 订单列表（分页）
```

**前端**：
```
新增 src/pages/Admin.tsx（或 src/components/AdminPanel.tsx）：
- 仅 admin 角色可见
- 简单的数据统计卡片 + 用户列表 + 手动充值功能
- 可以做成 /admin 路由或者 overlay panel
```

---

### 任务 5：生成历史云端同步

当前历史保存在 localStorage，需要同步到数据库。

**后端**：
```
新增 server/routes/history.js：
- GET /api/history — 获取用户生成历史（分页）
- DELETE /api/history/:batchId — 删除某批次

数据库已有 generation_log 表，可以直接用。
```

**前端**：
```
修改 src/lib/history.ts：
- 如果用户已登录，优先从 API 获取历史
- 未登录时继续用 localStorage
- 登录后自动将 localStorage 历史同步到云端
```

---

### 任务 6：部署配置

**创建以下文件**：

```dockerfile
# Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 8787
CMD ["node", "server/index.js", "--serve-dist"]
```

```nginx
# nginx/koc.conf
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;  # SSE 长连接
    }
}
```

```bash
# scripts/deploy.sh
#!/bin/bash
# 一键部署脚本（在腾讯云轻量服务器上运行）
set -e

echo "=== 封面之王 部署脚本 ==="

# 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2
sudo npm install -g pm2

# 安装 Nginx
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 克隆项目
cd /opt
git clone https://github.com/lipaliu/lipa-cover-generator.git koc
cd koc

# 安装依赖
npm ci --production

# 构建前端
npm run build

# 配置环境变量（需要手动编辑）
cp .env.example .env.local
echo "⚠️  请编辑 /opt/koc/.env.local 填入真实配置"

# 启动 PM2
pm2 start server/index.js --name koc -- --serve-dist
pm2 save
pm2 startup

# 配置 Nginx
sudo cp nginx/koc.conf /etc/nginx/sites-available/koc
sudo ln -sf /etc/nginx/sites-available/koc /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

echo "=== 部署完成 ==="
echo "下一步："
echo "1. 编辑 /opt/koc/.env.local"
echo "2. 配置域名 DNS 指向此服务器"
echo "3. sudo certbot --nginx -d your-domain.com"
echo "4. pm2 restart koc"
```

---

## 开发顺序建议

```
任务 1（iOS 引导）→ 任务 5（历史同步）→ 任务 6（部署配置）
→ 任务 2（微信支付）→ 任务 3（订阅）→ 任务 4（管理后台）
```

前三个不依赖外部服务，可以立即开发。后三个需要微信商户号等前置条件。

---

## 注意事项

1. **后端已经做了优雅降级**：如果 `MYSQL_HOST` 未配置，所有 auth/credits 逻辑自动跳过，`/api/generate` 正常工作（和以前一样不需要登录）。所以本地开发不配数据库也不会报错。

2. **dev 模式万能验证码**：`NODE_ENV !== "production"` 时，验证码输入 `000000` 即可登录任何手机号。

3. **admin 手机号**：在 `.env.local` 中设置 `ADMIN_PHONES=13800000000,13900000000`，这些手机号注册后自动成为 admin（不消耗积分、无水印）。

4. **不要修改已有的生成逻辑**：`planCovers()`、`generateImage2Cover()`、`generateByEngine()` 等函数已经正常工作，只需要在外层加中间件。

5. **样式文件**：`auth-styles.css` 使用了和现有项目一致的暗色主题变量（#1a1a2e 背景、#6366f1 主色）。

6. **积分消耗规则**（在 `src/lib/api.ts` 的 `getCreditsCost` 函数中）：
   - 1 张 = 3 积分
   - 2 张 = 5 积分
   - 3-4 张 = 8 积分
   - 5-7 张 = 12 积分
   - 8-10 张 = 15 积分

---

## 完整参考

- `ROADMAP.md` — 产品规划、定价体系、完整 Phase 1-4 描述
- `sql/schema.sql` — 数据库建表语句
- `.env.example` — 所有环境变量说明
