-- 封面之王 King of Cover — 数据库 Schema
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS kingofcover DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kingofcover;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  phone VARCHAR(20) UNIQUE,
  wechat_openid VARCHAR(64) UNIQUE DEFAULT NULL,
  nickname VARCHAR(100) DEFAULT '',
  avatar_url TEXT,
  role ENUM('user', 'admin') DEFAULT 'user',
  credits INT DEFAULT 0,
  subscription_plan VARCHAR(20) DEFAULT 'free',
  subscription_expires_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_phone (phone),
  INDEX idx_wechat_openid (wechat_openid)
) ENGINE=InnoDB;

-- 积分流水表
CREATE TABLE IF NOT EXISTS credit_transactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  amount INT NOT NULL,
  type ENUM('recharge', 'subscription_grant', 'generate', 'refund', 'admin_grant', 'signup_bonus'),
  description VARCHAR(200) DEFAULT '',
  reference_id VARCHAR(100) DEFAULT '',
  balance_after INT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  order_no VARCHAR(64) UNIQUE,
  type ENUM('recharge', 'subscription'),
  plan VARCHAR(50),
  amount_cents INT NOT NULL,
  credits_granted INT DEFAULT 0,
  status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  payment_channel VARCHAR(20) DEFAULT 'wechat',
  payment_transaction_id VARCHAR(100) DEFAULT '',
  paid_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_order_no (order_no),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- 生成记录表
CREATE TABLE IF NOT EXISTS generations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(200) DEFAULT '',
  subtitle VARCHAR(200) DEFAULT '',
  keywords TEXT,
  source_mode ENUM('base', 'elements', 'describe') DEFAULT 'base',
  image_count INT DEFAULT 1,
  credits_consumed INT DEFAULT 0,
  engine VARCHAR(20) DEFAULT 'image2',
  status ENUM('pending', 'processing', 'done', 'failed') DEFAULT 'pending',
  results JSON,
  matrix_combinations JSON,
  created_at DATETIME DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- 验证码表（也可以用 Redis，这里提供 MySQL 备选）
CREATE TABLE IF NOT EXISTS verification_codes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(10) NOT NULL,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT NOW(),
  INDEX idx_phone_code (phone, code),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB;
