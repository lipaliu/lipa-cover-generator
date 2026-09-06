import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { decryptPaymentNotification, verifyWeChatSignature } from "../server/wechat-pay.js";
import { getCreditsCost } from "../server/middleware.js";
import { estimateOpenAIImageCost } from "../server/provider-usage.js";
import { CREDIT_MODEL, SIGNUP_BONUS_CREDITS } from "../server/pricing.js";

test("commercial credits are linear by engine", () => {
  assert.equal(CREDIT_MODEL.titleGeneration, 20);
  assert.equal(SIGNUP_BONUS_CREDITS, 2500);
  assert.equal(getCreditsCost(1), 600);
  assert.equal(getCreditsCost(5), 3000);
  assert.equal(getCreditsCost(10, { engine: "seedream" }), 2000);
  assert.equal(getCreditsCost(3, { slotEngines: ["image2", "seedream", "seedance"] }), 1100);
});

test("Image2 charges for additional high-fidelity references", () => {
  assert.equal(getCreditsCost(1, { engine: "image2", sourceImageCount: 1 }), 600);
  assert.equal(getCreditsCost(1, { engine: "image2", sourceImageCount: 3 }), 840);
  assert.equal(getCreditsCost(2, {
    slotEngines: ["image2", "seedream"],
    sourceImageCount: 3,
  }), 1040);
});

test("OpenAI cost ledger uses API-returned token usage", () => {
  process.env.USD_CNY_RATE = "7.3";
  const result = estimateOpenAIImageCost({
    usage: {
      input_tokens_details: { text_tokens: 100, image_tokens: 1000 },
      output_tokens: 1500,
    },
  });
  assert.equal(result.costBasis, "api_usage");
  assert.equal(result.estimatedCostMicrouan, 390550);
});

test("OpenAI auto quality falls back to a conservative high-quality estimate", () => {
  process.env.USD_CNY_RATE = "7.3";
  const result = estimateOpenAIImageCost({}, {
    requestedQuality: "auto",
    requestedSize: "1152x1536",
    inputImageCount: 1,
  });
  assert.equal(result.costBasis, "estimate_auto_as_high");
  assert.equal(result.estimatedCostMicrouan, 1584100);
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
