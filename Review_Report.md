# 封面之王 (King of Cover) 代码审查报告

**审查对象**：Codex 提交的代码库（commit `68bffdd` 及近期提交）
**参考文档**：
1. `封面之王KingofCover—产品规划与开发任务书.md`
2. `Codex交接文档—剩余开发任务.md`

## 一、整体审查结论

Codex 已完成了 Phase 1 的核心逻辑（用户系统、积分基础扣费、水印、PWA 基础配置），项目结构清晰，前后端 API 联调基本通畅。然而，在**积分计费规则**、**PWA 缓存资源**、**未完成任务的状态**等方面，代码实现与产品规划文档存在一些**不一致**或**遗漏**。

## 二、发现的问题与不一致之处

### 1. 积分消耗规则实现错误（严重）

**产品规划文档规定**的积分消耗规则如下：
- 1 张 = 3 积分
- 2 张 = 5 积分
- 4 张 = 8 积分
- 10 张 = 15 积分
- （交接文档补充：3-4 张 = 8 积分，5-7 张 = 12 积分，8-10 张 = 15 积分）

**代码实际实现**：
在 `server/middleware.js` 和 `src/lib/api.ts` 中的 `getCreditsCost` 函数实现为：
```javascript
export function getCreditsCost(imageCount) {
  const costMap = { 1: 3, 2: 5, 4: 8, 10: 15 };
  if (costMap[imageCount] !== undefined) return costMap[imageCount];
  return Math.ceil(imageCount * 1.5);
}
```
**问题说明**：
该实现仅精确匹配了 1、2、4、10 这四个数字。如果用户选择生成 3 张，按公式 `Math.ceil(3 * 1.5)` 扣除 5 积分（文档要求是 8 积分）；选择 5 张扣除 8 积分（文档要求 12 积分）。这与交接文档中的阶梯计费逻辑完全不符，会导致计费漏洞。

### 2. PWA 缓存资源未完全更新（中等）

**产品规划/交接文档**：
已更新品牌名为"封面之王"，并提供了新的 PWA 图标 `icon-192.png` 和 `icon-512.png`。

**代码实际实现**：
在 `public/sw.js` 中，Service Worker 的预缓存列表 `ASSETS` 依然包含旧的图标：
```javascript
const ASSETS = ["/", "/manifest.json", "/icons/lipa-icon.png", "/samples/base-hiker.png"];
```
**问题说明**：
虽然 `manifest.json` 已经更新了图标路径，但 Service Worker 依然在缓存旧的 `lipa-icon.png`，且没有缓存新的 `icon-192.png` 和 `icon-512.png`，这可能导致离线状态下图标加载失败。同时，离线友好提示页并未实现。

### 3. 剩余任务均未实质性开始

对照《Codex 交接文档—剩余开发任务》，审查发现这些任务**完全没有实现**，符合"剩余任务"的定义，但需要明确其现状：

*   **任务 1：iOS PWA 安装引导 Banner**
    *   **现状**：前端 `src/App.tsx` 底部未挂载 `InstallBanner` 组件，该组件文件不存在。
*   **任务 2：微信支付接入**
    *   **现状**：`RechargeModal.tsx` 中仅有 UI 占位，点击充值仅弹出 `alert("支付功能开发中，敬请期待")`。后端没有 `server/routes/payment.js`。
*   **任务 3：订阅套餐系统**
    *   **现状**：未实现。
*   **任务 4：管理后台**
    *   **现状**：未实现。
*   **任务 5：生成历史云端同步**
    *   **现状**：`src/lib/history.ts` 依然纯依赖 IndexedDB 本地存储，`App.tsx` 生成后只调用了本地保存，未请求任何 `/api/history` 接口。
*   **任务 6：部署配置**
    *   **现状**：未找到 Dockerfile、Nginx 配置或 `deploy.sh` 脚本。

### 4. 数据库 Schema 字段命名轻微不一致

**产品规划文档**中订单表 `orders` 提及的字段：
`payment_channel`, `payment_transaction_id`, `plan`

**交接文档**中提及的确认字段：
`pay_method`, `pay_trade_no`

**代码实际实现 (`sql/schema.sql`)**：
使用的是 `payment_channel` 和 `payment_transaction_id`。
**建议**：以 `schema.sql` 为准，后续开发微信支付时注意不要被交接文档中的旧字段名误导。

## 三、修改建议

1.  **修复积分计费规则**：
    统一修改 `server/middleware.js` 和 `src/lib/api.ts` 中的 `getCreditsCost` 函数，严格按照阶梯区间计费：
    ```javascript
    export function getCreditsCost(count) {
      if (count === 1) return 3;
      if (count === 2) return 5;
      if (count <= 4) return 8;
      if (count <= 7) return 12;
      return 15; // 8-10 张
    }
    ```
2.  **更新 Service Worker 缓存列表**：
    修改 `public/sw.js`，移除旧图标，加入新图标：
    ```javascript
    const ASSETS = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png", "/samples/base-hiker.png"];
    ```
3.  **按交接文档推进剩余任务**：Codex 接下来应按照交接文档的优先级，优先开发无外部依赖的 iOS 引导 Banner 和历史云端同步功能。
