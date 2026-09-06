/** Payment orders and idempotent credit fulfillment. */

import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { addCredits, changeCreditsInTransaction } from "./credits.js";
import { discountForPlan, findProduct, publicCreditModel } from "./pricing.js";

function makeOrderNo() {
  const stamp = new Date().toISOString().replace(/\D/gu, "").slice(2, 14);
  return `BK${stamp}${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

function isActiveSubscription(user) {
  return user.subscription_plan !== "free" &&
    user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date();
}

export async function listPublicProducts(userId = null) {
  let user = null;
  if (userId) {
    const [rows] = await query(
      "SELECT subscription_plan, subscription_expires_at FROM users WHERE id = ? LIMIT 1",
      [userId],
    );
    user = rows[0] || null;
  }
  const { CREDIT_PACKS, SUBSCRIPTIONS } = await import("./pricing.js");
  const discount = user && isActiveSubscription(user) ? discountForPlan(user.subscription_plan) : 1;
  const serialize = (product) => ({
    ...product,
    amountFen: product.plan ? product.amountFen : Math.round(product.amountFen * discount),
    originalAmountFen: product.amountFen,
  });
  return {
    packs: CREDIT_PACKS.map(serialize),
    subscriptions: SUBSCRIPTIONS.map(serialize),
    discount,
    creditModel: publicCreditModel(),
  };
}

export async function createPendingOrder(userId, productId) {
  const product = findProduct(productId);
  if (!product) return { ok: false, error: "套餐不存在" };
  const [users] = await query(
    "SELECT id, subscription_plan, subscription_expires_at FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  const user = users[0];
  if (!user) return { ok: false, error: "用户不存在" };
  const discount = !product.plan && isActiveSubscription(user) ? discountForPlan(user.subscription_plan) : 1;
  const amountFen = Math.round(product.amountFen * discount);
  const orderNo = makeOrderNo();
  await query(
    `INSERT INTO orders
      (order_no, user_id, product_id, product_name, amount_fen, credits, plan, months, status, channel, trade_no, operator)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'wechat', '', '')`,
    [orderNo, userId, product.id, product.name, amountFen, product.credits || 0, product.plan || null, product.months || 0],
  );
  return { ok: true, order: { orderNo, productId: product.id, name: product.name, amountFen, credits: product.credits || 0 } };
}

export async function getOrderForUser(orderNo, userId) {
  const [rows] = await query(
    `SELECT order_no, product_id, product_name, amount_fen, credits, plan, months, status, channel, trade_no, paid_at, created_at
     FROM orders WHERE order_no = ? AND user_id = ? LIMIT 1`,
    [orderNo, userId],
  );
  return rows[0] || null;
}

/** Fulfill an existing WeChat order exactly once. Safe under duplicate callbacks. */
export async function fulfillPaidOrder({ orderNo, tradeNo, amountFen }) {
  return withTransaction(async (connection) => {
    const [orders] = await connection.execute("SELECT * FROM orders WHERE order_no = ? FOR UPDATE", [orderNo]);
    const order = orders[0];
    if (!order) return { ok: false, error: "订单不存在" };
    if (Number(order.amount_fen) !== Number(amountFen)) return { ok: false, error: "支付金额不一致" };
    if (order.status === "paid") return { ok: true, alreadyPaid: true, order };
    if (order.status !== "pending") return { ok: false, error: "订单状态不可支付" };
    if (tradeNo) {
      const [duplicates] = await connection.execute(
        "SELECT id FROM orders WHERE trade_no = ? AND status = 'paid' AND order_no <> ? LIMIT 1 FOR UPDATE",
        [String(tradeNo), orderNo],
      );
      if (duplicates.length > 0) return { ok: false, error: "支付交易号已被其他订单使用" };
    }

    const [users] = await connection.execute("SELECT * FROM users WHERE id = ? FOR UPDATE", [order.user_id]);
    const user = users[0];
    if (!user) return { ok: false, error: "用户不存在" };

    let expiresAt = user.subscription_expires_at;
    if (order.plan) {
      const now = new Date();
      const current = expiresAt ? new Date(expiresAt) : null;
      const base = current && current > now ? current : now;
      expiresAt = new Date(base);
      expiresAt.setMonth(expiresAt.getMonth() + Number(order.months || 0));
      await connection.execute(
        "UPDATE users SET subscription_plan = ?, subscription_expires_at = ? WHERE id = ?",
        [order.plan, expiresAt, order.user_id],
      );
    }
    if (Number(order.credits) > 0) {
      await changeCreditsInTransaction(
        connection,
        order.user_id,
        Number(order.credits),
        order.plan ? "subscription_grant" : "recharge",
        `${order.product_name}（${order.plan ? "会员赠送" : "积分包"}）`,
        order.order_no,
      );
    }
    await connection.execute(
      "UPDATE orders SET status = 'paid', trade_no = ?, paid_at = NOW() WHERE id = ?",
      [String(tradeNo || ""), order.id],
    );
    return { ok: true, order: { ...order, status: "paid", trade_no: tradeNo, paid_at: new Date(), expiresAt } };
  });
}

/** Manual admin fulfillment remains available for support/offline payments. */
export async function fulfillOrder({ userId, productId, channel = "manual", tradeNo = "", operator = "" }) {
  const product = findProduct(productId);
  if (!product) return { ok: false, error: "套餐不存在" };
  const orderNo = makeOrderNo();
  await query(
    `INSERT INTO orders
      (order_no, user_id, product_id, product_name, amount_fen, credits, plan, months, status, channel, trade_no, operator)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, '', ?)`,
    [orderNo, userId, product.id, product.name, product.amountFen, product.credits || 0, product.plan || null, product.months || 0, channel, operator],
  );
  const result = await fulfillPaidOrder({ orderNo, tradeNo: tradeNo || `manual-${orderNo}`, amountFen: product.amountFen });
  if (!result.ok) return result;
  const [after] = await query(
    "SELECT id, phone, role, credits, subscription_plan, subscription_expires_at FROM users WHERE id = ?",
    [userId],
  );
  return { ...result, user: after[0] };
}

export async function adminAdjustCredits(userId, amount, reason, operator) {
  const value = Math.trunc(Number(amount) || 0);
  if (!value) return { ok: false, error: "数量不能为 0" };
  await addCredits(userId, value, "admin_adjust", reason || `管理员调整（${operator}）`, `adm-${Date.now()}`);
  const [rows] = await query("SELECT id, phone, credits FROM users WHERE id = ?", [userId]);
  return { ok: true, user: rows[0] };
}

export async function findUserByPhone(phone) {
  const [rows] = await query(
    "SELECT id, phone, role, credits, subscription_plan, subscription_expires_at, created_at FROM users WHERE phone = ? LIMIT 1",
    [String(phone || "").trim()],
  );
  return rows[0] || null;
}

export async function recentOrders(limit = 50) {
  const [rows] = await query(
    `SELECT o.*, u.phone FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT ?`,
    [Number(limit) || 50],
  );
  return rows;
}

export async function listUsers(limit = 100) {
  const [rows] = await query(
    `SELECT id, phone, role, credits, subscription_plan, subscription_expires_at, created_at
     FROM users ORDER BY created_at DESC LIMIT ?`,
    [Number(limit) || 100],
  );
  return rows;
}
