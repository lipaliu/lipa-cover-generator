# 封面之王 (King of Cover) - Claude Code 交接文档

> 本文档由 Manus 生成，用于向 Claude Code 交接《封面之王》项目的后续开发任务。
> **当前状态**：Phase 1 核心功能（用户系统、生图核心逻辑、积分扣费、PWA基础）已完成并经过 Manus 优化。

## 一、Manus 刚刚完成的优化（无需再做）

1. **生成速度大幅优化（核心瓶颈已解决）**
   - **问题**：之前生成时卡在“正在分析底图”非常慢。
   - **解决**：Manus 已将 `server/index.js` 中的串行逻辑重构。现在“分析底图”和“GPT 方案规划”在后台并行执行；若网络调用慢，会瞬间使用本地设计矩阵兜底，确保生图接口**零延迟**触发。
   - **并发提升**：默认并发从 2 提升至 4（最高支持 8），实现“啪啪啪”快速出图。
2. **积分阶梯计费修复**
   - 修正了 `getCreditsCost` 函数，严格按照 `1张=3分, 2张=5分, 3-4张=8分, 5-7张=12分, 8-10张=15分` 扣费，前后端已统一。
3. **PWA 缓存修复**
   - 移除了 `sw.js` 中失效的旧图标，更新为最新的 `icon-192.png` 和 `icon-512.png`，并将缓存升级至 `v4`。

## 二、如何配置本地 Admin 账号（不扣积分）

在项目根目录的 `.env.local` 文件中，找到或添加 `ADMIN_PHONES` 变量：

```env
# 填入你自己的手机号，多个号码用逗号分隔
ADMIN_PHONES=13800138000,13900139000
```

**效果**：
- 使用该手机号获取验证码登录（开发模式下验证码固定为 `000000`）。
- 登录后，系统会自动将该账号设为 `admin` 角色。
- **Admin 账号生成图片完全不扣除积分，也不受水印限制。**

---

## 三、Claude Code 需要继续完成的剩余任务

以下任务尚未实现，请按照优先级依次开发：

### 优先级 1：iOS PWA 安装引导 Banner
**目标**：在首次移动端 Safari 访问时，显示底部 banner 引导用户"添加到主屏幕"。
- **实现建议**：
  - 新增 `src/components/InstallBanner.tsx`。
  - 检测条件：`window.navigator.standalone === false` 且 UA 包含 Safari（排除 Chrome on iOS），且 localStorage 无忽略标记。
  - 挂载到 `App.tsx` 的 `</main>` 前面。

### 优先级 2：生成历史云端同步
**目标**：当前历史仅存在本地 IndexedDB，需要同步到数据库。
- **后端**：新增 `server/routes/history.js`，提供 GET（分页获取）和 DELETE 接口，读写现有的 `generations` 表。
- **前端**：修改 `src/lib/history.ts`，如果用户已登录，优先从 API 获取历史；登录后自动将本地 IndexedDB 历史同步到云端。

### 优先级 3：微信支付接入（Phase 2 核心）
**目标**：用户可以通过微信支付购买积分包。
- **后端**：新增 `server/routes/payment.js`，实现 `create-order`（创建订单）和 `notify`（微信支付回调验签+加积分）。
- **前端**：修改 `src/components/RechargeModal.tsx`，真实调用后端接口，显示支付二维码（PC）或跳转微信支付（手机），并轮询订单状态。

### 优先级 4：订阅套餐系统
**目标**：实现月度/年度会员体系。
- **后端**：新增 `server/routes/subscription.js`。需要写一个定时任务（如 node-cron），每月 1 号给活跃订阅用户发放积分。
- **前端**：新增 `SubscriptionModal.tsx` 展示套餐对比卡片并对接支付。

### 优先级 5：管理后台（简易版）
**目标**：管理员查看数据和手动充值。
- **后端**：新增 `server/routes/admin.js`（需校验 `role=admin`），提供统计数据、用户列表、手动加积分接口。
- **前端**：新增 `/admin` 路由或抽屉面板，仅 admin 可见。

### 优先级 6：生产环境部署配置
**目标**：准备上线所需的文件。
- 编写 `Dockerfile`（Node.js 22 环境，暴露 8787 端口）。
- 编写 `nginx/koc.conf`（需支持 WebSocket/SSE 长连接超时设置）。
- 编写 `scripts/deploy.sh` 一键部署脚本。
