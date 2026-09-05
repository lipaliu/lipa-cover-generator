# BAKABAKA 商业上线清单

代码已经包含手机号注册、注册送积分、原子扣分/失败返还、套餐定价、微信 Native 扫码支付、支付回调、主动查单补偿、自动到账和订单留痕。

## 1. Render 环境变量

先填密钥，确认后再打开公开开关。私钥一律使用 Render Secret，不写进 Git。

### 公开模式

- `VITE_LOCAL_MODE=0`
- `PUBLIC_SIGNUP_MODE=1`
- `LOCAL_FREE_MODE=0`
- `JWT_SECRET`：至少 32 字节随机字符串
- `ADMIN_PHONES`：管理员手机号，多个用英文逗号分隔

### MySQL 8

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_SSL=1`（云数据库通常需要）
- `MYSQL_SSL_CA`（数据库供应商要求 CA 时填写）

服务启动会自动创建/升级 `users`、`verification_codes`、`credit_transactions`、`orders` 表。

### 腾讯云短信

- `TENCENT_SMS_SECRET_ID`
- `TENCENT_SMS_SECRET_KEY`
- `TENCENT_SMS_SDK_APP_ID`
- `TENCENT_SMS_SIGN_NAME`
- `TENCENT_SMS_TEMPLATE_ID`

短信模板需要两个参数：6 位验证码、有效分钟数。

### 微信支付 API v3（Native 支付）

- `WECHAT_PAY_MERCHANT_ID`：商户号
- `WECHAT_PAY_APP_ID`：与商户号绑定的 AppID
- `WECHAT_PAY_SERIAL_NO`：商户 API 证书序列号
- `WECHAT_PAY_PRIVATE_KEY`：商户 API 证书私钥 PEM；可将换行写成 `\n`
- `WECHAT_PAY_API_V3_KEY`：32 字节 APIv3 密钥
- `WECHAT_PAY_PUBLIC_KEY_ID`：`PUB_KEY_ID_...`
- `WECHAT_PAY_PUBLIC_KEY`：微信支付公钥 PEM
- `WECHAT_PAY_NOTIFY_URL=https://bakabaka.onrender.com/api/billing/wechat/notify`

如果商户号仍在从平台证书切换到微信支付公钥的灰度期，还需临时配置：

- `WECHAT_PAY_PLATFORM_CERT_SERIAL_NO`
- `WECHAT_PAY_PLATFORM_CERT`

### 对外经营信息

- `LEGAL_ENTITY_NAME`：营业执照主体全称
- `LEGAL_UNIFIED_SOCIAL_CREDIT_CODE`：统一社会信用代码
- `LEGAL_ADDRESS`：登记/经营地址
- `LEGAL_CONTACT`：公开售后联系方式
- `LEGAL_TERMS_VERSION=2026-09-05`

这些信息会出现在 `/legal/terms`、`/legal/privacy`、`/legal/refund`。公开注册和支付会在主体信息缺失时保持关闭。

## 2. 上线验收

1. 用新手机号收验证码并首次登录，余额应为 1200。
2. 下单最低价体验包，核对二维码展示的商户与金额。
3. 支付 1 笔，订单只入账 1 次；重复回调不重复加分。
4. 生成 1 张，预扣 300；失败则返还。
5. 余额不足时自动打开充值页。
6. `/admin` 仍需旧管理员口令，公开访客不能进入。
7. 下载微信支付账单与本地 `orders` 表完成首笔对账。

## 3. 当前套餐

- 体验包：1500 积分 / ¥45
- 基础包：7000 积分 / ¥198
- 专业包：19000 积分 / ¥498
- 工作室包：43000 积分 / ¥998
- 月卡会员：4000 积分 / ¥68 / 1 个月
- 年卡会员：50000 积分 / ¥688 / 12 个月

套餐与金额唯一来源是 `server/pricing.js`；前端不再单独写死价格。
