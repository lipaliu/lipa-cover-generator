-- BAKABAKA 会员体系数据库表结构（MySQL 8）
-- 用法：在数据库里执行一次即可（服务启动时也会自动建表，见 db.js ensureSchema）。

CREATE TABLE IF NOT EXISTS users (
  id                     BIGINT AUTO_INCREMENT PRIMARY KEY,
  phone                  VARCHAR(20)  NOT NULL UNIQUE,
  role                   VARCHAR(20)  NOT NULL DEFAULT 'user',      -- user | admin
  credits                INT          NOT NULL DEFAULT 0,
  subscription_plan      VARCHAR(20)  NOT NULL DEFAULT 'free',      -- free | monthly | yearly
  subscription_expires_at DATETIME    NULL,
  terms_accepted_at      DATETIME     NULL,
  terms_version          VARCHAR(20)  NOT NULL DEFAULT '',
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS verification_codes (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  phone         VARCHAR(20) NOT NULL,
  code          VARCHAR(10) NOT NULL,
  request_ip    VARCHAR(64) NOT NULL DEFAULT '',
  used          TINYINT(1) NOT NULL DEFAULT 0,
  expires_at    DATETIME NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code_lookup (phone, code, expires_at, used),
  INDEX idx_code_phone_time (phone, created_at),
  INDEX idx_code_ip_time (request_ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS credit_transactions (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT       NOT NULL,
  amount        INT          NOT NULL,                              -- 正=加分，负=扣分
  type          VARCHAR(30)  NOT NULL,                              -- signup_bonus | generate | refund | recharge | subscription_grant | admin_adjust
  description   VARCHAR(255) NOT NULL DEFAULT '',
  reference_id  VARCHAR(64)  NOT NULL DEFAULT '',
  balance_after INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_time (user_id, created_at),
  CONSTRAINT fk_ct_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 订单：支付接入前用于「后台手动开通」留痕；接支付后写入交易号即可复用
CREATE TABLE IF NOT EXISTS orders (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_no      VARCHAR(32)  NULL,                                  -- 商户订单号；历史手工订单可为空
  user_id       BIGINT       NOT NULL,
  product_id    VARCHAR(40)  NOT NULL,                              -- 套餐 id，见 server/pricing.js
  product_name  VARCHAR(80)  NOT NULL DEFAULT '',
  amount_fen    INT          NOT NULL DEFAULT 0,                    -- 金额（分）
  credits       INT          NOT NULL DEFAULT 0,                    -- 到账积分
  plan          VARCHAR(20)  NULL,                                  -- 订阅套餐则记 monthly/yearly
  months        INT          NOT NULL DEFAULT 0,                    -- 订阅时长（月）
  status        VARCHAR(20)  NOT NULL DEFAULT 'paid',               -- pending | paid | refunded
  channel       VARCHAR(20)  NOT NULL DEFAULT 'manual',             -- manual | wechat | alipay
  trade_no      VARCHAR(64)  NOT NULL DEFAULT '',                   -- 第三方交易号（接支付后填）
  operator      VARCHAR(40)  NOT NULL DEFAULT '',                   -- 手动开通的管理员
  paid_at       DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_time (user_id, created_at),
  UNIQUE KEY uq_orders_order_no (order_no),
  INDEX idx_trade (trade_no),
  CONSTRAINT fk_od_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 模型成本流水：记录 OpenAI 返回的真实 token（有 usage 时）及供应商成本估算。
CREATE TABLE IF NOT EXISTS provider_usage (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id                  BIGINT       NULL,
  provider                 VARCHAR(30)  NOT NULL,
  model                    VARCHAR(80)  NOT NULL,
  operation                VARCHAR(30)  NOT NULL DEFAULT 'generate',
  size                     VARCHAR(30)  NOT NULL DEFAULT '',
  quality                  VARCHAR(20)  NOT NULL DEFAULT '',
  input_image_count        INT          NOT NULL DEFAULT 0,
  input_text_tokens        INT          NOT NULL DEFAULT 0,
  input_image_tokens       INT          NOT NULL DEFAULT 0,
  output_tokens            INT          NOT NULL DEFAULT 0,
  estimated_cost_microuan  BIGINT       NOT NULL DEFAULT 0,
  cost_basis               VARCHAR(40)  NOT NULL DEFAULT '',
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_provider_time (provider, created_at),
  INDEX idx_usage_user_time (user_id, created_at),
  CONSTRAINT fk_pu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
