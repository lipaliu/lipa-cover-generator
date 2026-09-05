/** Minimal WeChat Pay API v3 client for Native (desktop QR) payments. */

import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const API_ORIGIN = "https://api.mch.weixin.qq.com";

function secretValue(value, pathValue = "") {
  if (value) {
    const normalized = String(value).replace(/\\n/gu, "\n");
    if (normalized.includes("-----BEGIN")) return normalized;
    try {
      const decoded = Buffer.from(normalized, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) return decoded;
    } catch { /* use literal value below */ }
    return normalized;
  }
  return pathValue && existsSync(pathValue) ? readFileSync(pathValue, "utf8") : "";
}

function config() {
  return {
    mchid: String(process.env.WECHAT_PAY_MERCHANT_ID || "").trim(),
    serialNo: String(process.env.WECHAT_PAY_SERIAL_NO || "").trim(),
    appid: String(process.env.WECHAT_PAY_APP_ID || "").trim(),
    apiV3Key: String(process.env.WECHAT_PAY_API_V3_KEY || ""),
    notifyUrl: String(process.env.WECHAT_PAY_NOTIFY_URL || "").trim(),
    privateKey: secretValue(process.env.WECHAT_PAY_PRIVATE_KEY, process.env.WECHAT_PAY_PRIVATE_KEY_PATH),
    publicKeyId: String(process.env.WECHAT_PAY_PUBLIC_KEY_ID || "").trim(),
    publicKey: secretValue(process.env.WECHAT_PAY_PUBLIC_KEY, process.env.WECHAT_PAY_PUBLIC_KEY_PATH),
    platformCertSerial: String(process.env.WECHAT_PAY_PLATFORM_CERT_SERIAL_NO || "").trim(),
    platformCert: secretValue(process.env.WECHAT_PAY_PLATFORM_CERT, process.env.WECHAT_PAY_PLATFORM_CERT_PATH),
  };
}

export function paymentReadiness() {
  const cfg = config();
  const required = {
    WECHAT_PAY_MERCHANT_ID: cfg.mchid,
    WECHAT_PAY_SERIAL_NO: cfg.serialNo,
    WECHAT_PAY_APP_ID: cfg.appid,
    WECHAT_PAY_API_V3_KEY: cfg.apiV3Key,
    WECHAT_PAY_NOTIFY_URL: cfg.notifyUrl,
    WECHAT_PAY_PRIVATE_KEY: cfg.privateKey,
    WECHAT_PAY_PUBLIC_KEY_ID: cfg.publicKeyId,
    WECHAT_PAY_PUBLIC_KEY: cfg.publicKey,
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  return { ready: missing.length === 0, missing };
}

function verificationKey(serial, cfg) {
  if (serial === cfg.publicKeyId && cfg.publicKey) return cfg.publicKey;
  if (serial === cfg.platformCertSerial && cfg.platformCert) return cfg.platformCert;
  return "";
}

export function verifyWeChatSignature(headers, rawBody) {
  const cfg = config();
  const timestamp = String(headers["wechatpay-timestamp"] || "");
  const nonce = String(headers["wechatpay-nonce"] || "");
  const signature = String(headers["wechatpay-signature"] || "");
  const serial = String(headers["wechatpay-serial"] || "");
  if (!timestamp || !nonce || !signature || !serial) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = verificationKey(serial, cfg);
  if (!key) return false;
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  return crypto.verify("RSA-SHA256", Buffer.from(message), key, Buffer.from(signature, "base64"));
}

function authorization(method, canonicalUrl, body, cfg) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");
  const message = `${method}\n${canonicalUrl}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(message), cfg.privateKey).toString("base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${cfg.serialNo}",signature="${signature}"`;
}

async function request(method, canonicalUrl, payload = null) {
  const cfg = config();
  const ready = paymentReadiness();
  if (!ready.ready) throw new Error(`微信支付尚未配置完整：${ready.missing.join(", ")}`);
  const body = payload ? JSON.stringify(payload) : "";
  const response = await fetch(`${API_ORIGIN}${canonicalUrl}`, {
    method,
    headers: {
      Authorization: authorization(method, canonicalUrl, body, cfg),
      Accept: "application/json",
      "Content-Type": "application/json",
      "Wechatpay-Serial": cfg.publicKeyId,
    },
    ...(body ? { body } : {}),
  });
  const raw = await response.text();
  if (!verifyWeChatSignature(Object.fromEntries(response.headers.entries()), raw)) {
    throw new Error("微信支付应答验签失败");
  }
  const data = raw ? JSON.parse(raw) : {};
  if (!response.ok) throw new Error(data.message || data.detail?.message || `微信支付返回 ${response.status}`);
  return data;
}

export async function createNativePayment({ orderNo, description, amountFen }) {
  const cfg = config();
  return request("POST", "/v3/pay/transactions/native", {
    appid: cfg.appid,
    mchid: cfg.mchid,
    description: String(description || "BAKABAKA 积分充值").slice(0, 127),
    out_trade_no: orderNo,
    notify_url: cfg.notifyUrl,
    time_expire: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    amount: { total: Number(amountFen), currency: "CNY" },
  });
}

export async function queryNativePayment(orderNo) {
  const cfg = config();
  return request(
    "GET",
    `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(cfg.mchid)}`,
  );
}

export function decryptPaymentNotification(resource) {
  const cfg = config();
  const key = Buffer.from(cfg.apiV3Key, "utf8");
  if (key.length !== 32) throw new Error("WECHAT_PAY_API_V3_KEY 必须是 32 个字节");
  const ciphertext = Buffer.from(String(resource?.ciphertext || ""), "base64");
  if (ciphertext.length < 17) throw new Error("微信支付回调密文无效");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(String(resource.nonce || ""), "utf8"));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(String(resource.associated_data || ""), "utf8"));
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
}

export function validatePaidTransaction(transaction) {
  const cfg = config();
  return transaction?.trade_state === "SUCCESS" &&
    transaction?.mchid === cfg.mchid &&
    transaction?.appid === cfg.appid &&
    transaction?.amount?.currency === "CNY";
}
