/**
 * Database connection module.
 *
 * Uses mysql2 with promise API.
 * Falls back gracefully when MySQL is not configured (for local dev without DB).
 */

import mysql from "mysql2/promise";

let pool = null;
let warnedNoDb = false;

/**
 * Get or create the MySQL connection pool.
 * Returns null if MySQL is not configured.
 */
export function getPool() {
  if (pool) return pool;

  const host = process.env.MYSQL_HOST;
  const database = process.env.MYSQL_DATABASE;

  if (!host || !database) {
    if (!warnedNoDb) {
      warnedNoDb = true;
      console.warn("[DB] MySQL not configured. Running in no-DB mode (auth/credits disabled).");
    }
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
    ...(process.env.MYSQL_SSL === "1"
      ? {
          ssl: {
            rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "0",
            ...(process.env.MYSQL_SSL_CA ? { ca: process.env.MYSQL_SSL_CA.replace(/\\n/gu, "\n") } : {}),
          },
        }
      : {}),
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

/** Run a callback on one connection inside a real database transaction. */
export async function withTransaction(callback) {
  const p = getPool();
  if (!p) throw new Error("Database not configured.");
  const connection = await p.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
    // Existing installations need these additive migrations because CREATE TABLE IF NOT EXISTS
    // does not update a table that is already present.
    const migrations = [
      "ALTER TABLE verification_codes ADD COLUMN request_ip VARCHAR(64) NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME NULL",
      "ALTER TABLE users ADD COLUMN terms_version VARCHAR(20) NOT NULL DEFAULT ''",
      "ALTER TABLE orders ADD COLUMN order_no VARCHAR(32) NULL",
      "ALTER TABLE orders ADD COLUMN paid_at DATETIME NULL",
      "ALTER TABLE orders ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
      "CREATE UNIQUE INDEX uq_orders_order_no ON orders (order_no)",
    ];
    for (const migration of migrations) {
      try {
        await p.query(migration);
      } catch (error) {
        // Duplicate column/index means this migration has already been applied.
        if (![1060, 1061].includes(Number(error?.errno))) throw error;
      }
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
