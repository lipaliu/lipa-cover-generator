# Codex 交接文档 — 剩余开发任务

> 本文件描述 Manus 已完成的工作和 Codex 需要继续完成的任务。
> 日期：2026-06-25

---

## 已完成的工作

### Bug 修复
- [x] 修复 `gpt-image-2` 的 `images.edit` 不支持 `input_fidelity` 参数导致 400 错误（server/index.js 第 423-429 行）

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

### 前端组件 — 已写好，但尚未集成到 App.tsx
- [x] `src/lib/api.ts` — Auth/Credits API 客户端 + token 管理
- [x] `src/components/LoginModal.tsx` — 登录弹窗
- [x] `src/components/CreditsBadge.tsx` — 积分余额显示
- [x] `src/components/RechargeModal.tsx` — 充值弹窗（UI 占位，支付功能待接入）
- [x] `src/components/auth-styles.css` — 所有组件样式

### PWA
- [x] `public/manifest.json` — 已更新品牌名
- [x] `public/sw.js` — 已更新缓存版本

---

## Codex 需要完成的任务

### 任务 1（最重要）：将前端组件集成到 App.tsx

**目标**：让登录、积分显示、充值弹窗在实际 UI 中工作。

**具体步骤**：

1. 在 `src/App.tsx` 顶部导入：
```tsx
import { LoginModal } from "./components/LoginModal";
import { CreditsBadge } from "./components/CreditsBadge";
import { RechargeModal } from "./components/RechargeModal";
import { fetchMe, logout as apiLogout, getToken, getCreditsCost, type UserInfo } from "./lib/api";
import "./components/auth-styles.css";
```

2. 在 App 组件内添加状态：
```tsx
const [user, setUser] = useState<UserInfo | null>(null);
const [showLogin, setShowLogin] = useState(false);
const [showRecharge, setShowRecharge] = useState(false);
const [rechargeInfo, setRechargeInfo] = useState({ required: 0, current: 0 });
```

3. 添加 useEffect 在组件挂载时检查登录状态：
```tsx
useEffect(() => {
  if (getToken()) {
    fetchMe().then(({ user }) => { if (user) setUser(user); });
  }
}, []);
```

4. 在页面顶部导航栏（header）中添加 CreditsBadge：
```tsx
<CreditsBadge
  user={user}
  onLoginClick={() => setShowLogin(true)}
  onLogout={() => { apiLogout(); setUser(null); }}
/>
```

5. 在 JSX 末尾添加弹窗组件：
```tsx
<LoginModal open={showLogin} onClose={() => setShowLogin(false)} onLogin={setUser} />
<RechargeModal
  open={showRecharge}
  onClose={() => setShowRecharge(false)}
  currentCredits={rechargeInfo.current}
  requiredCredits={rechargeInfo.required}
/>
```

6. 修改生成按钮的 onClick 逻辑，在调用 `/api/generate` 前：
```tsx
// 检查是否登录
if (!user && getToken() === null) {
  setShowLogin(true);
  return;
}
```

7. 在 fetch `/api/generate` 的请求头中添加 token：
```tsx
headers: {
  "Content-Type": "application/json",
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
},
```

8. 处理 401 和 402 响应：
```tsx
if (response.status === 401) {
  setShowLogin(true);
  return;
}
if (response.status === 402) {
  const data = await response.json();
  setRechargeInfo({ required: data.required, current: data.current });
  setShowRecharge(true);
  return;
}
```

---

### 任务 2：生成后刷新积分余额

在每次生成完成后（SSE 收到 status=done 事件时），重新获取用户余额：
```tsx
import { fetchBalance } from "./lib/api";

// 在 done 事件处理中：
if (user) {
  fetchBalance().then((b) => setUser((prev) => prev ? { ...prev, credits: b.credits } : prev));
}
```

---

### 任务 3：线上部署时隐藏 SeeDance 引擎选项

在 `engineOptions` 数组中，根据环境变量或条件判断是否显示 SeeDance：
```tsx
const engineOptions = [
  { id: "image2", title: "Image2", vendor: "OpenAI", description: "GPT-Image-2，风格更灵活" },
  // 只在本地开发时显示 SeeDance
  ...(import.meta.env.DEV ? [{ id: "seedance", title: "SeeDance", vendor: "即梦", description: "复用本机即梦账号积分" }] : []),
];
```

---

### 任务 4：积分消耗预览

在 Step 4（确认生成）的摘要区域，显示本次将消耗多少积分：
```tsx
const totalImages = ratioGroups.reduce((sum, r) => sum + r.count, 0);
const creditsCost = getCreditsCost(totalImages);

// 在确认摘要中显示：
<span className="summary-label">消耗积分</span>
<span className="summary-value">{user?.role === "admin" ? "0（管理员免费）" : creditsCost}</span>
```

---

### 任务 5（可选）：PWA 图标生成

当前 `public/icons/` 目录下需要：
- `icon-192.png` (192x192)
- `icon-512.png` (512x512)

可以用现有的 `lipa-icon.png` 缩放生成，或设计新的"封面之王"品牌图标。

---

### 任务 6（可选）：添加 iOS PWA 安装引导

在首次访问时（移动端 Safari），显示一个底部 banner 引导用户"添加到主屏幕"：
- 检测 `window.navigator.standalone === false` 且 UA 包含 Safari
- 显示引导 banner（带关闭按钮，关闭后 localStorage 记住不再显示）

---

## 注意事项

1. **后端已经做了优雅降级**：如果 `MYSQL_HOST` 未配置，所有 auth/credits 逻辑自动跳过，`/api/generate` 正常工作（和以前一样不需要登录）。所以本地开发不配数据库也不会报错。

2. **dev 模式万能验证码**：`NODE_ENV !== "production"` 时，验证码输入 `000000` 即可登录任何手机号。

3. **admin 手机号**：在 `.env.local` 中设置 `ADMIN_PHONES=13800000000,13900000000`，这些手机号注册后自动成为 admin（不消耗积分、无水印）。

4. **不要修改已有的生成逻辑**：`planCovers()`、`generateImage2Cover()`、`generateByEngine()` 等函数已经正常工作，只需要在外层加中间件。

5. **样式文件**：`auth-styles.css` 使用了和现有项目一致的暗色主题变量（#1a1a2e 背景、#6366f1 主色）。如果项目有 CSS 变量系统，可以替换为变量引用。

---

## 完整参考：ROADMAP.md

详细的产品规划、定价体系、后续 Phase 2-4 的任务描述请参考 `ROADMAP.md`。
