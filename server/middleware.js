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
 * Calculate credits cost based on image count.
 *
 * 1 张 = 3 积分
 * 2 张 = 5 积分
 * 4 张 = 8 积分
 * 10 张 = 15 积分
 * 其他 = 按 1.5 积分/张 向上取整
 */
export function getCreditsCost(imageCount) {
  const costMap = { 1: 3, 2: 5, 4: 8, 10: 15 };
  if (costMap[imageCount] !== undefined) return costMap[imageCount];
  return Math.ceil(imageCount * 1.5);
}
