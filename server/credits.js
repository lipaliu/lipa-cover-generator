/**
 * Credits system module.
 *
 * Handles credit deduction, refund, and transaction history.
 */

import { query, withTransaction } from "./db.js";

async function changeCredits(connection, userId, amount, type, description, referenceId) {
  const [users] = await connection.execute("SELECT credits FROM users WHERE id = ? FOR UPDATE", [userId]);
  if (users.length === 0) throw new Error("User not found");
  const currentBalance = Number(users[0].credits);
  const newBalance = currentBalance + amount;
  if (newBalance < 0) {
    const error = new Error(`Insufficient credits: have ${currentBalance}, need ${Math.abs(amount)}`);
    error.code = "INSUFFICIENT_CREDITS";
    error.current = currentBalance;
    throw error;
  }
  await connection.execute("UPDATE users SET credits = ? WHERE id = ?", [newBalance, userId]);
  await connection.execute(
    "INSERT INTO credit_transactions (user_id, amount, type, description, reference_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, amount, type, description, referenceId, newBalance],
  );
  return newBalance;
}

export async function changeCreditsInTransaction(connection, userId, amount, type, description = "", referenceId = "") {
  return changeCredits(connection, userId, Math.trunc(Number(amount)), type, description, referenceId);
}

/**
 * Deduct credits from a user's balance.
 * Uses a transaction to ensure atomicity.
 * Returns the new balance, or throws if insufficient.
 */
export async function deductCredits(userId, amount, description = "", referenceId = "") {
  const value = Math.max(0, Math.trunc(Number(amount)));
  return withTransaction((connection) => changeCredits(connection, userId, -value, "generate", description, referenceId));
}

/**
 * Refund credits to a user (e.g., when generation fails).
 */
export async function refundCredits(userId, amount, description = "", referenceId = "") {
  const value = Math.max(0, Math.trunc(Number(amount)));
  return withTransaction((connection) => changeCredits(connection, userId, value, "refund", description, referenceId));
}

/**
 * Add credits to a user (recharge or subscription grant).
 */
export async function addCredits(userId, amount, type = "recharge", description = "", referenceId = "") {
  const value = Math.trunc(Number(amount));
  return withTransaction((connection) => changeCredits(connection, userId, value, type, description, referenceId));
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
