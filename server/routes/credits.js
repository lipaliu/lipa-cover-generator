/**
 * Credits routes: balance, history.
 */

import { Router } from "express";
import { getBalance, getTransactionHistory } from "../credits.js";
import { isDbAvailable } from "../db.js";

const router = Router();

/**
 * GET /api/credits/balance
 * Returns current credits balance and subscription info.
 */
router.get("/balance", async (req, res) => {
  if (!isDbAvailable()) {
    return res.json({ credits: Infinity, plan: "admin", expires_at: null });
  }

  if (!req.user) {
    return res.status(401).json({ error: "未登录", code: "AUTH_REQUIRED" });
  }

  try {
    const balance = await getBalance(req.user.id);
    res.json(balance);
  } catch (err) {
    console.error("[Credits] balance error:", err);
    res.status(500).json({ error: "获取余额失败" });
  }
});

/**
 * GET /api/credits/history
 * Returns credit transaction history.
 * Query: ?limit=50&offset=0
 */
router.get("/history", async (req, res) => {
  if (!isDbAvailable()) {
    return res.json({ transactions: [] });
  }

  if (!req.user) {
    return res.status(401).json({ error: "未登录", code: "AUTH_REQUIRED" });
  }

  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const transactions = await getTransactionHistory(req.user.id, limit, offset);
    res.json({ transactions });
  } catch (err) {
    console.error("[Credits] history error:", err);
    res.status(500).json({ error: "获取记录失败" });
  }
});

export default router;
