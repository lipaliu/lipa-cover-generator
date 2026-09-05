/**
 * Authentication module.
 *
 * - Phone + SMS verification code login
 * - JWT token generation and verification
 * - Auto-register on first login
 * - Admin role assignment based on ADMIN_PHONES env
 */

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { query, isDbAvailable, withTransaction } from "./db.js";
import { SIGNUP_BONUS_CREDITS } from "./pricing.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me-in-production";
const JWT_EXPIRES_IN = "7d";
const CODE_EXPIRY_MINUTES = 5;

export function authReadiness() {
  const configured = JWT_SECRET !== "dev-secret-change-me-in-production" && Buffer.byteLength(JWT_SECRET) >= 32;
  return { ready: process.env.NODE_ENV !== "production" || configured };
}

function getAdminPhones() {
  return (process.env.ADMIN_PHONES || "").split(",").map((p) => p.trim()).filter(Boolean);
}

/**
 * Generate a 6-digit verification code.
 */
export function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Store verification code in database.
 */
export async function storeCode(phone, code, requestIp = "") {
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
  await query(
    "INSERT INTO verification_codes (phone, code, request_ip, expires_at) VALUES (?, ?, ?, ?)",
    [phone, code, requestIp, expiresAt]
  );
}

export async function assertCodeRequestAllowed(phone, requestIp = "") {
  const [phoneRows] = await query(
    `SELECT
       SUM(created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)) AS last_minute,
       SUM(created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)) AS last_hour
     FROM verification_codes WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [phone],
  );
  if (Number(phoneRows[0]?.last_minute || 0) >= 1) {
    const error = new Error("验证码发送太频繁，请 60 秒后再试");
    error.status = 429;
    throw error;
  }
  if (Number(phoneRows[0]?.last_hour || 0) >= 5) {
    const error = new Error("该手机号发送次数过多，请一小时后再试");
    error.status = 429;
    throw error;
  }
  if (requestIp) {
    const [ipRows] = await query(
      "SELECT COUNT(*) AS count FROM verification_codes WHERE request_ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
      [requestIp],
    );
    if (Number(ipRows[0]?.count || 0) >= 20) {
      const error = new Error("当前网络发送次数过多，请稍后再试");
      error.status = 429;
      throw error;
    }
  }
}

/**
 * Verify a code for a phone number.
 * Returns true if valid, false otherwise.
 */
export async function verifyCode(phone, code) {
  // In development mode, accept "000000" as universal code
  if (process.env.NODE_ENV !== "production" && code === "000000") {
    return true;
  }

  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      "SELECT id FROM verification_codes WHERE phone = ? AND code = ? AND expires_at > NOW() AND used = 0 ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [phone, code],
    );
    if (rows.length === 0) return false;
    const [result] = await connection.execute("UPDATE verification_codes SET used = 1 WHERE id = ? AND used = 0", [rows[0].id]);
    return result.affectedRows === 1;
  });
}

/**
 * Find user by phone, or create a new one.
 * Returns user object.
 */
export async function findOrCreateUser(phone) {
  try {
    return await withTransaction(async (connection) => {
      const [existing] = await connection.execute("SELECT * FROM users WHERE phone = ? LIMIT 1 FOR UPDATE", [phone]);
      if (existing.length > 0) return existing[0];

      const role = getAdminPhones().includes(phone) ? "admin" : "user";
      const credits = role === "admin" ? 999999 : SIGNUP_BONUS_CREDITS;
      const [result] = await connection.execute(
        "INSERT INTO users (phone, role, credits, subscription_plan) VALUES (?, ?, ?, 'free')",
        [phone, role, credits],
      );
      const userId = result.insertId;
      if (credits > 0 && role !== "admin") {
        await connection.execute(
          "INSERT INTO credit_transactions (user_id, amount, type, description, balance_after) VALUES (?, ?, 'signup_bonus', '注册赠送积分', ?)",
          [userId, SIGNUP_BONUS_CREDITS, SIGNUP_BONUS_CREDITS],
        );
      }
      const [newUser] = await connection.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
      return newUser[0];
    });
  } catch (error) {
    // Two first-login requests may race. The unique phone index selects the winner;
    // the loser simply loads that account and must not receive a second signup bonus.
    if (Number(error?.errno) === 1062) {
      const [rows] = await query("SELECT * FROM users WHERE phone = ? LIMIT 1", [phone]);
      if (rows[0]) return rows[0];
    }
    throw error;
  }
}

export async function recordTermsAcceptance(userId) {
  await query("UPDATE users SET terms_accepted_at = NOW(), terms_version = ? WHERE id = ?", [
    process.env.LEGAL_TERMS_VERSION || "2026-09-05",
    userId,
  ]);
}

/**
 * Generate JWT token for a user.
 */
export function generateToken(user) {
  return jwt.sign(
    { userId: user.id, phone: user.phone, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify and decode a JWT token.
 * Returns decoded payload or null.
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Get user by ID.
 */
export async function getUserById(userId) {
  const [rows] = await query("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0] || null;
}

/**
 * Sanitize user object for API response (remove sensitive fields).
 */
export function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    phone: user.phone ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : "",
    nickname: user.nickname || "",
    avatar_url: user.avatar_url || "",
    role: user.role,
    credits: user.credits,
    subscription_plan: user.subscription_plan,
    subscription_expires_at: user.subscription_expires_at,
    created_at: user.created_at,
  };
}
