/**
 * Express middleware for authentication and credits checking.
 */

import { verifyToken, getUserById, sanitizeUser } from "./auth.js";
import { isDbAvailable } from "./db.js";

/**
 * Auth middleware - extracts user from JWT token.
 * Sets req.user if valid token, otherwise req.user = null.
 * Does NOT block the request (use requireAuth for that).
 */
export function optionalAuth(req, res, next) {
  req.user = null;

  if (!isDbAvailable()) {
    // No DB mode - skip auth entirely
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return next();
  }

  // Attach decoded token info; full user loaded on demand
  req.tokenPayload = decoded;
  getUserById(decoded.userId)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(() => next());
}

/**
 * Require authentication - returns 401 if not logged in.
 */
export function requireAuth(req, res, next) {
  if (!isDbAvailable()) {
    // No DB mode - allow all (local dev)
    return next();
  }

  if (!req.user) {
    return res.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
  }
  next();
}

/**
 * Check credits before generation.
 * Expects req.body.imageCount or req.body.count to determine cost.
 * Sets req.creditsCost on success.
 */
export function requireCredits(req, res, next) {
  if (!isDbAvailable()) {
    // No DB mode - skip credits check
    req.creditsCost = 0;
    return next();
  }

  if (!req.user) {
    return res.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
  }

  // Admin users don't consume credits
  if (req.user.role === "admin") {
    req.creditsCost = 0;
    return next();
  }

  const count = Number(req.body.imageCount || req.body.count || 1);
  const cost = getCreditsCost(count);
  req.creditsCost = cost;

  if (req.user.credits < cost) {
    return res.status(402).json({
      error: "积分不足",
      code: "INSUFFICIENT_CREDITS",
      required: cost,
      current: req.user.credits,
    });
  }

  next();
}

/**
 * Calculate credits cost based on image count (阶梯计费).
 *
 * 1 张   = 3 积分
 * 2 张   = 5 积分
 * 3-4 张 = 8 积分
 * 5-7 张 = 12 积分
 * 8-10 张 = 15 积分
 */
// 积分单位：1 张封面 = 300 积分（数字够大气；1 积分 = ¥0.01）
// 阶梯：张数越多每张越便宜（10 张 1500 分 = 每张 150 分，等于半价）
function tierCost(count) {
  if (count <= 0) return 0;
  if (count === 1) return 300;
  if (count === 2) return 500;
  if (count <= 4) return 800;
  if (count <= 7) return 1200;
  return 1500;
}

export function getCreditsCost(imageCount) {
  const count = Math.max(1, Math.floor(Number(imageCount) || 1));
  // 1-10 张按阶梯；超过 10 张（多比例场景）按每满 10 张叠加一个 1500 分梯度 + 余数阶梯。
  const fullTens = Math.floor(count / 10);
  const remainder = count % 10;
  return fullTens * 1500 + tierCost(remainder);
}
