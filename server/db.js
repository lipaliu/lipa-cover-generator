/**
 * Database connection module.
 *
 * Uses mysql2 with promise API.
 * Falls back gracefully when MySQL is not configured (for local dev without DB).
 */

import mysql from "mysql2/promise";

let pool = null;

/**
 * Get or create the MySQL connection pool.
 * Returns null if MySQL is not configured.
 */
export function getPool() {
  if (pool) return pool;

  const host = process.env.MYSQL_HOST;
  const database = process.env.MYSQL_DATABASE;

  if (!host || !database) {
    console.warn("[DB] MySQL not configured. Running in no-DB mode (auth/credits disabled).");
    return null;
  }

  pool = mysql.createPool({
    host,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
  });

  console.log(`[DB] MySQL pool created → ${host}:${process.env.MYSQL_PORT || 3306}/${database}`);
  return pool;
}

/**
 * Execute a query. Returns [rows, fields].
 * Throws if DB is not configured.
 */
export async function query(sql, params = []) {
  const p = getPool();
  if (!p) throw new Error("Database not configured.");
  return p.execute(sql, params);
}

/**
 * Check if database is available.
 */
export function isDbAvailable() {
  return getPool() !== null;
}

/**
 * 启动时自动建表（幂等）。读取 server/schema.sql 逐条执行，省去手动跑 SQL。
 */
export async function ensureSchema() {
  const p = getPool();
  if (!p) return false;
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const sql = readFileSync(join(here, "schema.sql"), "utf8");
    const statements = sql
      .split(/;\s*[\r\n]/u)
      .map((s) => s.replace(/^\s*--.*$/gmu, "").trim())
      .filter(Boolean);
    for (const statement of statements) {
      await p.query(statement);
    }
    console.log(`[DB] Schema ready (${statements.length} statements).`);
    return true;
  } catch (error) {
    console.error("[DB] ensureSchema failed:", error.message);
    return false;
  }
}

/**
 * Graceful shutdown.
 */
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
