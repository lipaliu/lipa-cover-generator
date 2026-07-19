/**
 * 开通/充值：积分包与会员套餐的统一入账入口。
 *
 * 现在由管理员在后台手动开通（支付渠道 manual）；
 * 以后接微信/支付宝，支付回调里调同一个 fulfillOrder 即可，无需改动业务逻辑。
 */

import { query } from "./db.js";
import { addCredits } from "./credits.js";
import { findProduct } from "./pricing.js";

/**
 * 给用户开通一个套餐（积分包或会员），并记录订单。
 * @returns {Promise<{ok:boolean, error?:string, order?:object, user?:object}>}
 */
export async function fulfillOrder({
  userId,
  productId,
  channel = "manual",
  tradeNo = "",
  operator = "",
}) {
  const product = findProduct(productId);
  if (!product) return { ok: false, error: "套餐不存在" };

  const [users] = await query("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
  if (users.length === 0) return { ok: false, error: "用户不存在" };
  const user = users[0];

  const isSubscription = Boolean(product.plan);
  let expiresAt = null;

  if (isSubscription) {
    // 未过期则续期（在原到期日上加），已过期则从今天算起
    const now = new Date();
    const current = user.subscription_expires_at ? new Date(user.subscription_expires_at) : null;
    const base = current && current > now ? current : now;
    expiresAt = new Date(base);
    expiresAt.setMonth(expiresAt.getMonth() + product.months);

    await query(
      "UPDATE users SET subscription_plan = ?, subscription_expires_at = ? WHERE id = ?",
      [product.plan, expiresAt, userId],
    );
  }

  // 到账积分（积分包与会员赠送共用）
  if (product.credits > 0) {
    await addCredits(
      userId,
      product.credits,
      isSubscription ? "subscription_grant" : "recharge",
      `${product.name}（${isSubscription ? "会员赠送" : "积分包"}）`,
      tradeNo || `manual-${Date.now()}`,
    );
  }

  await query(
    `INSERT INTO orders (user_id, product_id, product_name, amount_fen, credits, plan, months, status, channel, trade_no, operator)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?)`,
    [
      userId,
      product.id,
      product.name,
      product.amountFen,
      product.credits || 0,
      product.plan || null,
      product.months || 0,
      channel,
      tradeNo,
      operator,
    ],
  );

  const [after] = await query(
    "SELECT id, phone, role, credits, subscription_plan, subscription_expires_at FROM users WHERE id = ?",
    [userId],
  );

  return {
    ok: true,
    order: { productId: product.id, name: product.name, amountFen: product.amountFen, credits: product.credits || 0, plan: product.plan || null, expiresAt },
    user: after[0],
  };
}

/** 管理员直接增减积分（补偿/纠错用） */
export async function adminAdjustCredits(userId, amount, reason, operator) {
  const value = Math.trunc(Number(amount) || 0);
  if (!value) return { ok: false, error: "数量不能为 0" };
  await addCredits(userId, value, "admin_adjust", reason || `管理员调整（${operator}）`, `adm-${Date.now()}`);
  const [rows] = await query("SELECT id, phone, credits FROM users WHERE id = ?", [userId]);
  return { ok: true, user: rows[0] };
}

/** 按手机号查用户（后台开通时用） */
export async function findUserByPhone(phone) {
  const [rows] = await query(
    "SELECT id, phone, role, credits, subscription_plan, subscription_expires_at, created_at FROM users WHERE phone = ? LIMIT 1",
    [String(phone || "").trim()],
  );
  return rows[0] || null;
}

/** 最近订单（后台展示） */
export async function recentOrders(limit = 50) {
  const [rows] = await query(
    `SELECT o.*, u.phone FROM orders o JOIN users u ON u.id = o.user_id
     ORDER BY o.created_at DESC LIMIT ?`,
    [Number(limit) || 50],
  );
  return rows;
}

/** 用户列表（后台展示） */
export async function listUsers(limit = 100) {
  const [rows] = await query(
    `SELECT id, phone, role, credits, subscription_plan, subscription_expires_at, created_at
     FROM users ORDER BY created_at DESC LIMIT ?`,
    [Number(limit) || 100],
  );
  return rows;
}
