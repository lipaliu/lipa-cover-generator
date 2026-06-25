/**
 * Auth routes: send-code, login, me, logout.
 */

import { Router } from "express";
import { generateCode, storeCode, verifyCode, findOrCreateUser, generateToken, sanitizeUser } from "../auth.js";
import { sendSmsCode } from "../sms.js";
import { isDbAvailable } from "../db.js";

const router = Router();

/**
 * POST /api/auth/send-code
 * Body: { phone: "13800138000" }
 */
router.post("/send-code", async (req, res) => {
  if (!isDbAvailable()) {
    return res.status(503).json({ error: "用户系统未启用（数据库未配置）" });
  }

  try {
    const { phone } = req.body || {};
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: "请输入正确的手机号" });
    }

    const code = generateCode();
    await storeCode(phone, code);
    await sendSmsCode(phone, code);

    res.json({ ok: true, message: "验证码已发送" });
  } catch (err) {
    console.error("[Auth] send-code error:", err);
    res.status(500).json({ error: "发送验证码失败，请稍后重试" });
  }
});

/**
 * POST /api/auth/login
 * Body: { phone: "13800138000", code: "123456" }
 */
router.post("/login", async (req, res) => {
  if (!isDbAvailable()) {
    return res.status(503).json({ error: "用户系统未启用（数据库未配置）" });
  }

  try {
    const { phone, code } = req.body || {};
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: "请输入正确的手机号" });
    }
    if (!code || code.length < 4) {
      return res.status(400).json({ error: "请输入验证码" });
    }

    const valid = await verifyCode(phone, code);
    if (!valid) {
      return res.status(401).json({ error: "验证码错误或已过期" });
    }

    const user = await findOrCreateUser(phone);
    const token = generateToken(user);

    res.json({
      ok: true,
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("[Auth] login error:", err);
    res.status(500).json({ error: "登录失败，请稍后重试" });
  }
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 */
router.get("/me", (req, res) => {
  if (!isDbAvailable()) {
    return res.json({ user: null, dbAvailable: false });
  }

  if (!req.user) {
    return res.status(401).json({ error: "未登录", code: "AUTH_REQUIRED" });
  }

  res.json({ user: sanitizeUser(req.user) });
});

/**
 * POST /api/auth/logout
 * (Stateless JWT - just acknowledge; client removes token)
 */
router.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

export default router;
