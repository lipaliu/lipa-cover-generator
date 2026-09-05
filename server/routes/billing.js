import { Router } from "express";
import QRCode from "qrcode";
import { isDbAvailable } from "../db.js";
import { createPendingOrder, fulfillPaidOrder, getOrderForUser, listPublicProducts } from "../billing.js";
import { requireAuth } from "../middleware.js";
import { legalReadiness } from "../legal.js";
import {
  createNativePayment,
  decryptPaymentNotification,
  paymentReadiness,
  queryNativePayment,
  validatePaidTransaction,
  verifyWeChatSignature,
} from "../wechat-pay.js";

const router = Router();

router.get("/products", requireAuth, async (req, res) => {
  if (!isDbAvailable() || !req.user) return res.status(503).json({ error: "用户系统尚未启用" });
  try {
    const products = await listPublicProducts(req.user.id);
    return res.json({ ...products, paymentReady: paymentReadiness().ready && legalReadiness().ready });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/orders", requireAuth, async (req, res) => {
  if (!isDbAvailable()) return res.status(503).json({ error: "用户系统尚未启用" });
  if (!legalReadiness().ready) return res.status(503).json({ error: "经营主体信息尚未配置完整" });
  if (!paymentReadiness().ready) return res.status(503).json({ error: "微信支付正在配置中，请稍后再试" });
  try {
    const created = await createPendingOrder(req.user.id, String(req.body?.productId || ""));
    if (!created.ok) return res.status(400).json({ error: created.error });
    const payment = await createNativePayment({
      orderNo: created.order.orderNo,
      description: `BAKABAKA ${created.order.name}`,
      amountFen: created.order.amountFen,
    });
    const qrDataUrl = await QRCode.toDataURL(payment.code_url, { width: 280, margin: 1, errorCorrectionLevel: "M" });
    return res.status(201).json({ order: created.order, qrDataUrl, expiresInSeconds: 900 });
  } catch (error) {
    console.error("[Billing] create order failed:", error);
    return res.status(502).json({ error: error.message || "创建支付订单失败" });
  }
});

router.get("/orders/:orderNo", requireAuth, async (req, res) => {
  try {
    let order = await getOrderForUser(String(req.params.orderNo || ""), req.user.id);
    if (!order) return res.status(404).json({ error: "订单不存在" });
    if (order.status === "pending" && paymentReadiness().ready) {
      try {
        const transaction = await queryNativePayment(order.order_no);
        if (validatePaidTransaction(transaction)) {
          await fulfillPaidOrder({
            orderNo: transaction.out_trade_no,
            tradeNo: transaction.transaction_id,
            amountFen: transaction.amount?.total,
          });
          order = await getOrderForUser(order.order_no, req.user.id);
        }
      } catch (error) {
        // NOTPAY and transient provider errors do not turn a healthy pending order into a failure.
        if (!/NOTPAY|订单未支付/iu.test(String(error?.message || ""))) {
          console.warn("[Billing] query order failed:", error?.message || error);
        }
      }
    }
    return res.json({ order });
  } catch (error) {
    return res.status(500).json({ error: error.message || "查询订单失败" });
  }
});

router.post("/wechat/notify", async (req, res) => {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    if (!verifyWeChatSignature(req.headers, rawBody)) {
      return res.status(401).json({ code: "SIGN_ERROR", message: "签名验证失败" });
    }
    const transaction = decryptPaymentNotification(req.body?.resource);
    if (!validatePaidTransaction(transaction)) {
      return res.status(400).json({ code: "INVALID_TRANSACTION", message: "交易状态或商户信息不一致" });
    }
    const result = await fulfillPaidOrder({
      orderNo: transaction.out_trade_no,
      tradeNo: transaction.transaction_id,
      amountFen: transaction.amount?.total,
    });
    if (!result.ok) return res.status(400).json({ code: "FULFILL_FAILED", message: result.error });
    return res.status(200).json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    console.error("[Billing] notify failed:", error);
    return res.status(500).json({ code: "FAIL", message: "处理失败" });
  }
});

export default router;
