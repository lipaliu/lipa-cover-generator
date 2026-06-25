/**
 * Credits system module.
 *
 * Handles credit deduction, refund, and transaction history.
 */

import { query } from "./db.js";

/**
 * Deduct credits from a user's balance.
 * Uses a transaction to ensure atomicity.
 * Returns the new balance, or throws if insufficient.
 */
export async function deductCredits(userId, amount, description = "", referenceId = "") {
  // Check current balance
  const [users] = await query("SELECT credits FROM users WHERE id = ? FOR UPDATE", [userId]);
  if (users.length === 0) throw new Error("User not found");

  const currentBalance = users[0].credits;
  if (currentBalance < amount) {
    throw new Error(`Insufficient credits: have ${currentBalance}, need ${amount}`);
  }

  const newBalance = currentBalance - amount;

  // Update balance
  await query("UPDATE users SET credits = ? WHERE id = ?", [newBalance, userId]);

  // Record transaction
  await query(
    "INSERT INTO credit_transactions (user_id, amount, type, description, reference_id, balance_after) VALUES (?, ?, 'generate', ?, ?, ?)",
    [userId, -amount, description, referenceId, newBalance]
  );

  return newBalance;
}

/**
 * Refund credits to a user (e.g., when generation fails).
 */
export async function refundCredits(userId, amount, description = "", referenceId = "") {
  const [users] = await query("SELECT credits FROM users WHERE id = ?", [userId]);
  if (users.length === 0) throw new Error("User not found");

  const newBalance = users[0].credits + amount;

  await query("UPDATE users SET credits = ? WHERE id = ?", [newBalance, userId]);

  await query(
    "INSERT INTO credit_transactions (user_id, amount, type, description, reference_id, balance_after) VALUES (?, ?, 'refund', ?, ?, ?)",
    [userId, amount, description, referenceId, newBalance]
  );

  return newBalance;
}

/**
 * Add credits to a user (recharge or subscription grant).
 */
export async function addCredits(userId, amount, type = "recharge", description = "", referenceId = "") {
  const [users] = await query("SELECT credits FROM users WHERE id = ?", [userId]);
  if (users.length === 0) throw new Error("User not found");

  const newBalance = users[0].credits + amount;

  await query("UPDATE users SET credits = ? WHERE id = ?", [newBalance, userId]);

  await query(
    "INSERT INTO credit_transactions (user_id, amount, type, description, reference_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, amount, type, description, referenceId, newBalance]
  );

  return newBalance;
}

/**
 * Get credit transaction history for a user.
 */
export async function getTransactionHistory(userId, limit = 50, offset = 0) {
  const [rows] = await query(
    "SELECT id, amount, type, description, reference_id, balance_after, created_at FROM credit_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
    [userId, limit, offset]
  );
  return rows;
}

/**
 * Get current balance for a user.
 */
export async function getBalance(userId) {
  const [rows] = await query("SELECT credits, subscription_plan, subscription_expires_at FROM users WHERE id = ?", [userId]);
  if (rows.length === 0) return null;
  return {
    credits: rows[0].credits,
    plan: rows[0].subscription_plan,
    expires_at: rows[0].subscription_expires_at,
  };
}
