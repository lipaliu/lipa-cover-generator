import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { decryptPaymentNotification, verifyWeChatSignature } from "../server/wechat-pay.js";
import { getCreditsCost } from "../server/middleware.js";

test("commercial credit tiers use the same large-unit pricing as the server", () => {
  assert.equal(getCreditsCost(1), 300);
  assert.equal(getCreditsCost(5), 1200);
  assert.equal(getCreditsCost(10), 1500);
  assert.equal(getCreditsCost(12), 2000);
});

test("decrypts a WeChat Pay AES-256-GCM notification resource", () => {
  const key = "12345678901234567890123456789012";
  const nonce = "123456789012";
  const associatedData = "transaction";
  const expected = { out_trade_no: "BKTEST123", trade_state: "SUCCESS", amount: { total: 4500 } };
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(expected)), cipher.final(), cipher.getAuthTag()]);
  process.env.WECHAT_PAY_API_V3_KEY = key;
  const actual = decryptPaymentNotification({
    nonce,
    associated_data: associatedData,
    ciphertext: ciphertext.toString("base64"),
  });
  assert.deepEqual(actual, expected);
});

test("verifies callback signatures and rejects WeChat signature probes", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.WECHAT_PAY_PUBLIC_KEY_ID = "PUB_KEY_ID_TEST";
  process.env.WECHAT_PAY_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = "callback-nonce";
  const body = JSON.stringify({ id: "notice-1" });
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), privateKey).toString("base64");
  const headers = {
    "wechatpay-timestamp": timestamp,
    "wechatpay-nonce": nonce,
    "wechatpay-signature": signature,
    "wechatpay-serial": "PUB_KEY_ID_TEST",
  };
  assert.equal(verifyWeChatSignature(headers, body), true);
  assert.equal(verifyWeChatSignature({ ...headers, "wechatpay-signature": `WECHATPAY/SIGNTEST/${signature}` }, body), false);
});
