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
import { query, isDbAvailable } from "./db.js";
import { SIGNUP_BONUS_CREDITS } from "./pricing.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me-in-production";
const JWT_EXPIRES_IN = "7d";
const CODE_EXPIRY_MINUTES = 5;

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
export async function storeCode(phone, code) {
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
  await query(
    "INSERT INTO verification_codes (phone, code, expires_at) VALUES (?, ?, ?)",
    [phone, code, expiresAt]
  );
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

  const [rows] = await query(
    "SELECT id FROM verification_codes WHERE phone = ? AND code = ? AND expires_at > NOW() AND used = 0 ORDER BY id DESC LIMIT 1",
    [phone, code]
  );

  if (rows.length === 0) return false;

  // Mark as used
  await query("UPDATE verification_codes SET used = 1 WHERE id = ?", [rows[0].id]);
  return true;
}

/**
 * Find user by phone, or create a new one.
 * Returns user object.
 */
export async function findOrCreateUser(phone) {
  const [existing] = await query("SELECT * FROM users WHERE phone = ? LIMIT 1", [phone]);

  if (existing.length > 0) {
    return existing[0];
  }

  // New user - auto register
  const adminPhones = getAdminPhones();
  const role = adminPhones.includes(phone) ? "admin" : "user";
  const credits = role === "admin" ? 999999 : SIGNUP_BONUS_CREDITS;

  const [result] = await query(
    "INSERT INTO users (phone, role, credits, subscription_plan) VALUES (?, ?, ?, 'free')",
    [phone, role, credits]
  );

  const userId = result.insertId;

  // Record signup bonus in credit transactions
  if (credits > 0 && role !== "admin") {
    await query(
      "INSERT INTO credit_transactions (user_id, amount, type, description, balance_after) VALUES (?, ?, 'signup_bonus', '注册赠送积分', ?)",
      [userId, SIGNUP_BONUS_CREDITS, SIGNUP_BONUS_CREDITS]
    );
  }

  const [newUser] = await query("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
  return newUser[0];
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
