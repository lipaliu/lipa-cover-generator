import express from "express";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { fetch as undiciFetch, FormData as UndiciFormData, ProxyAgent, Agent, setGlobalDispatcher } from "undici";
import { buildPlanUserPrompt, fallbackPlans, skillPrompt } from "./prompts.js";
import { generateCombinations, combinationToLabel } from "./design-matrix.js";
import { getPool } from "./db.js";
import { optionalAuth, requireAuth, requireCredits, getCreditsCost } from "./middleware.js";
import { deductCredits, refundCredits } from "./credits.js";
import { shouldApplyWatermark, addWatermark } from "./watermark.js";
import authRoutes from "./routes/auth.js";
import creditsRoutes from "./routes/credits.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execFileAsync = promisify(execFile);
const app = express();
const port = Number(process.env.PORT || 8787);
const exportDir = join(__dirname, "..", "exports");
const serveDist = process.argv.includes("--serve-dist");
const engineLabels = {
  image2: "Image2（OpenAI GPT-Image-2）",
  seedance: "SeeDance（即梦）",
  seedream: "Seedream（火山·豆包）",
};
const engineAliases = {
  auto: "image2",
  openai: "image2",
  image2: "image2",
  "gpt-image-2": "image2",
  gptimage2: "image2",
  jimeng: "seedance",
  dreamina: "seedance",
  seedance: "seedance",
  seedream: "seedream",
  ark: "seedream",
  doubao: "seedream",
  "doubao-seedream": "seedream",
  volcengine: "seedream",
};
// bilibili-safe：B站封面，按 16:9 出图，但核心元素须落在 16:9 与 4:3 的公共安全区内。
const supportedRatios = new Set(["16:9", "4:3", "1:1", "3:4", "9:16", "bilibili-safe"]);
const fallbackAnalysis = {
  dominant_color: "#1A1A2E",
  brightness: "medium",
  saturation: "medium",
  temperature: "neutral",
  subject_position: "center",
  empty_space: "upper area and side margins",
  background_complexity: "medium",
};

function envNumber(keys, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    const value = Number(process.env[key]);
    if (Number.isFinite(value)) {
      return Math.max(min, Math.min(max, Math.floor(value)));
    }
  }
  return fallback;
}

function timeoutSeconds(ms) {
  return Math.max(1, Math.round(ms / 1000));
}

function textRequestTimeoutMs() {
  return envNumber(["OPENAI_TEXT_TIMEOUT_MS", "OPENAI_REQUEST_TIMEOUT_MS"], 25000, {
    min: 8000,
    max: 180000,
  });
}

function imageFetchTimeoutMs() {
  return envNumber("IMAGE_FETCH_TIMEOUT_MS", 45000, {
    min: 10000,
    max: 180000,
  });
}

function imageJobTimeoutMs(engine) {
  const prefix = engine === "seedance" ? "SEEDANCE" : engine === "seedream" ? "SEEDREAM" : "IMAGE2";
  const fallback = engine === "seedance" ? 150000 : 180000;
  return envNumber([`${prefix}_JOB_TIMEOUT_MS`, "IMAGE_JOB_TIMEOUT_MS"], fallback, {
    min: 30000,
    max: 600000,
  });
}

function generationConcurrency(engine, totalCount) {
  const prefix = engine === "seedance" ? "SEEDANCE" : engine === "seedream" ? "SEEDREAM" : "IMAGE2";
  const fallback = engine === "seedance" ? 1 : engine === "seedream" ? 2 : 4;
  const limit = envNumber([`${prefix}_CONCURRENCY`, "GENERATION_CONCURRENCY"], fallback, {
    min: 1,
    max: 8,
  });
  return Math.max(1, Math.min(totalCount, limit));
}

function requestOptions(timeoutMs) {
  return { timeout: timeoutMs, maxRetries: 0 };
}

// 判断是否为「可重试」的瞬时错误：连接/网络层 + 429 + 5xx 才重试；
// 4xx（内容策略、鉴权、参数错误）是确定性失败，重试也没用，直接抛。
function isRetryableError(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true;
  if (typeof status === "number") return status >= 500;
  // 没有 HTTP 状态码 = 连接/网络层错误（OpenAI SDK 的笼统 "Connection error." 即属此类）
  const name = `${error?.name || ""} ${error?.constructor?.name || ""}`;
  if (/APIConnection|Connection/iu.test(name)) return true;
  const msg = `${error?.message || ""} ${error?.cause?.code || ""} ${error?.cause?.message || ""}`;
  return /connection error|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|socket hang up|terminated|UND_ERR|fetch failed|network|aborted/iu.test(
    msg,
  );
}

// 对连接抖动自动重试（指数退避 + 抖动）。代理 / 长耗时生图偶发断连时挽救成功率。
async function withConnectionRetry(fn, { retries = 3, baseDelayMs = 1200, label = "请求" } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > retries || !isRetryableError(error)) throw error;
      const delay = Math.round(baseDelayMs * attempt * (1 + Math.random() * 0.4));
      console.warn(
        `[retry] ${label} 第 ${attempt}/${retries} 次连接失败：${error?.message || error}；${delay}ms 后重试`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// 统一创建 OpenAI 客户端（生成 / 单张重生共用）。配了代理则走 undici 代理 dispatcher。
function createOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1",
    timeout: envNumber("OPENAI_REQUEST_TIMEOUT_MS", 120000, { min: 15000, max: 600000 }),
    maxRetries: 0,
    ...(proxyDispatcher ? { fetch: undiciFetch, fetchOptions: { dispatcher: proxyDispatcher } } : {}),
  });
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutSeconds(timeoutMs)} seconds.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBufferWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Image fetch failed with HTTP ${response.status}.`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Image fetch timed out after ${timeoutSeconds(timeoutMs)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const envPath = join(__dirname, "..", filename);
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/u);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (!process.env[key]) {
        process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/gu, "");
      }
    }
  }
}

loadLocalEnv();

// 本地开发常通过 Clash/V2Ray 等代理访问 OpenAI。这类代理多会做 TLS 拦截，
// 其根证书装在系统钥匙串里、而不在 Node 内置证书库中，导致 Node 校验失败
// （UNABLE_TO_GET_ISSUER_CERT_LOCALLY → "Connection error."）。因此对“走代理”
// 的连接放宽证书校验。生产环境通常不配代理 → proxyDispatcher 为 null → 走默认安全直连。
// 注意：仅 setGlobalDispatcher 不足以让 openai SDK 走代理，必须把 dispatcher 显式
// 传进 OpenAI 客户端（fetch + fetchOptions.dispatcher），见下方 OpenAI 客户端创建处。
let proxyDispatcher = null;
function configureProxy() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    "";

  if (!proxyUrl) return;
  proxyDispatcher = new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: false } });
  setGlobalDispatcher(proxyDispatcher);
  // 用 undici 的 fetch 走代理时，multipart 文件上传（images.edit 传底图）要求 body 用
  // undici 的 FormData，否则报 "does not support file uploads with the current global
  // FormData class"。仅本地配代理时覆盖全局 FormData；生产无代理 → 不覆盖、走默认。
  globalThis.FormData = UndiciFormData;
}

configureProxy();

// 火山方舟（Seedream）专用网络通道：火山是国内服务，必须“直连”（不走 Clash 代理）。
// 本机 Node 内置证书库不认火山证书，用导出的系统证书包补信任（仅本地，路径来自 ARK_CA_CERTS）。
// 生产（无代理、域名证书可信）默认即可，arkDispatcher 可为 null。
let arkDispatcher = null;
function configureArk() {
  const caPath = process.env.ARK_CA_CERTS;
  const ca = caPath && existsSync(caPath) ? readFileSync(caPath, "utf8") : null;
  // 本地配了代理时：必须给 ark 一个“直连且不经代理”的 dispatcher，否则会被全局代理拦截。
  if (proxyDispatcher || ca) {
    arkDispatcher = new Agent(ca ? { connect: { ca } } : {});
  }
}
configureArk();

app.use(express.json({ limit: "100mb" })); // 元素拼接多图上传，给足余量（前端已先压缩，正常远用不到）
app.use(express.urlencoded({ extended: false })); // 登录页表单提交用

// 健康检查（云平台探活用，不经访问口令，必须放在口令中间件之前）。
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// ─── 账户体系 ───
// ACCESS_USER/ACCESS_PASSWORD = 管理员账户（无限额度，可看 /admin 后台）。
// ACCESS_ACCOUNTS = 追加的体验账户，格式「用户名:密码:额度」，逗号或空格分隔，
// 例：ACCESS_ACCOUNTS="guest:baka2026:2,team1:hello88:5"。额度=最多可成功生成的张数。
const ACCESS_USER = process.env.ACCESS_USER || "";
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";
const accessAccounts = new Map(); // 小写用户名 -> { password, role: "admin"|"trial", quota }。登录名不分大小写。
if (ACCESS_PASSWORD) {
  accessAccounts.set((ACCESS_USER || "admin").toLowerCase(), { password: ACCESS_PASSWORD, role: "admin", quota: Infinity });
}
for (const entry of String(process.env.ACCESS_ACCOUNTS || "").split(/[\s,]+/u).filter(Boolean)) {
  const [user, password, quotaRaw] = entry.split(":");
  const key = String(user || "").toLowerCase();
  if (!key || !password || accessAccounts.has(key)) continue;
  const isAdmin = quotaRaw === "admin";
  accessAccounts.set(key, {
    password,
    role: isAdmin ? "admin" : "trial",
    quota: isAdmin ? Infinity : Math.max(1, Number(quotaRaw) || 2),
  });
}

// ─── 用量与生成记录（管理员在 /admin 可见）───
// 存在 data/usage.json。注意：Render 免费档磁盘是临时的，每次重新部署会清零。
const dataDir = join(__dirname, "..", "data");
const usageFile = join(dataDir, "usage.json");
let usageStore = {};
try {
  usageStore = JSON.parse(readFileSync(usageFile, "utf8"));
} catch {
  usageStore = {};
}
let usageSaveTimer = null;
function scheduleUsageSave() {
  clearTimeout(usageSaveTimer);
  usageSaveTimer = setTimeout(async () => {
    try {
      await mkdir(dataDir, { recursive: true });
      await writeFile(usageFile, JSON.stringify(usageStore));
    } catch (error) {
      console.warn("[Usage] 保存失败:", error?.message || error);
    }
  }, 500);
}
function usageOf(user) {
  return usageStore[user]?.used || 0;
}
async function recordGeneration(user, { engine, ratio, title, imageUrl }) {
  const entry = (usageStore[user] ||= { used: 0, records: [] });
  entry.used += 1;
  let thumb = "";
  try {
    const match = /^data:image\/\w+;base64,(.+)$/u.exec(String(imageUrl || ""));
    if (match) {
      const buffer = await sharp(Buffer.from(match[1], "base64")).resize({ width: 256 }).jpeg({ quality: 70 }).toBuffer();
      thumb = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    }
  } catch { /* 缩略图失败不影响计数 */ }
  entry.records.unshift({ time: new Date().toISOString(), engine, ratio, title: String(title || "").slice(0, 60), thumb });
  entry.records = entry.records.slice(0, 100);
  scheduleUsageSave();
}

if (accessAccounts.size > 0) {
  const accessSecret = createHash("sha256")
    .update([...accessAccounts.entries()].map(([u, a]) => `${u}:${a.password}`).join("|"))
    .digest("hex");
  const signUser = (user) => createHash("sha256").update(`${accessSecret}|${user}`).digest("hex").slice(0, 40);
  const ACCESS_COOKIE = "baka_access";

  const loginPage = (showError) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>登录 · BAKABAKA 巴卡巴卡</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, system-ui, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
    background:
      radial-gradient(52% 46% at 14% 8%, rgba(167, 139, 250, 0.55) 0%, transparent 60%),
      radial-gradient(50% 44% at 86% 6%, rgba(129, 140, 248, 0.5) 0%, transparent 60%),
      radial-gradient(56% 50% at 88% 88%, rgba(147, 197, 253, 0.5) 0%, transparent 60%),
      radial-gradient(50% 46% at 10% 90%, rgba(196, 181, 253, 0.45) 0%, transparent 60%),
      linear-gradient(155deg, #cabcf7 0%, #b3bcf4 45%, #a9c6f0 100%);
    color: #241a3d; padding: 20px;
  }
  .card {
    width: min(420px, 92vw); padding: 40px 36px 34px; border-radius: 30px; text-align: center;
    background: linear-gradient(160deg, rgba(255,255,255,0.55), rgba(255,255,255,0.3));
    border: 1px solid rgba(255,255,255,0.7);
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.9), 0 24px 70px rgba(80,50,160,0.28);
    -webkit-backdrop-filter: blur(26px) saturate(150%); backdrop-filter: blur(26px) saturate(150%);
  }
  .logo { width: min(230px, 70%); height: auto; margin: 0 auto 6px; display: block;
    filter: drop-shadow(0 6px 22px rgba(120, 100, 220, 0.35)); }
  .slogan { font-size: 13px; color: rgba(36,26,61,0.6); margin-bottom: 26px; letter-spacing: 0.02em; }
  .field { margin-bottom: 14px; text-align: left; }
  .field label { display: block; font-size: 12px; font-weight: 600; color: rgba(36,26,61,0.65); margin: 0 0 6px 4px; }
  .field input {
    width: 100%; padding: 13px 16px; font-size: 15px; color: #241a3d; border-radius: 16px;
    background: linear-gradient(160deg, rgba(255,255,255,0.6), rgba(255,255,255,0.35));
    border: 1px solid rgba(255,255,255,0.75);
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.8);
    outline: none; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  }
  .field input:focus { border-color: rgba(139, 112, 240, 0.65); box-shadow: inset 0 1px 1px rgba(255,255,255,0.8), 0 0 0 3px rgba(139,112,240,0.18); }
  .err { font-size: 13px; color: #d63384; margin: 2px 0 12px; ${showError ? "" : "display:none;"} }
  button {
    width: 100%; padding: 14px; margin-top: 6px; font-size: 16px; font-weight: 700; color: #fff;
    border: 1px solid rgba(255,255,255,0.6); border-radius: 999px; cursor: pointer;
    background: linear-gradient(165deg, rgba(167,139,250,0.95), rgba(124,105,246,0.92));
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.55), 0 12px 30px rgba(110,90,230,0.4);
    text-shadow: 0 1px 2px rgba(60,40,140,0.3);
    transition: filter .2s ease, transform .2s ease;
    font-family: inherit;
  }
  button:hover { filter: brightness(1.06); transform: translateY(-1px); }
  .foot { margin-top: 22px; font-size: 11px; color: rgba(36,26,61,0.45); }
</style>
</head>
<body>
  <form class="card" method="POST" action="/access-login">
    <img class="logo" src="/logo.png" alt="巴卡巴卡 BAKABAKA" />
    <p class="slogan">自媒体封面之王 · King of Cover</p>
    <div class="field">
      <label>用户名</label>
      <input name="user" type="text" autocomplete="username" autofocus />
    </div>
    <div class="field">
      <label>密码</label>
      <input name="password" type="password" autocomplete="current-password" />
    </div>
    <p class="err">用户名或密码不对，再试一次</p>
    <button type="submit">进入 BAKABAKA</button>
    <p class="foot">Copyright © 畅导吃枸杞</p>
  </form>
</body>
</html>`;

  // 用户名+密码 → 账户对象（不匹配返回 null）。用户名不分大小写；密码区分。
  const resolveAccount = (user, password) => {
    const key = String(user || "").trim().toLowerCase();
    const account = accessAccounts.get(key);
    return account && account.password === String(password) ? { user: key, ...account } : null;
  };

  app.use((req, res, next) => {
    // 登录页要显示 logo，放行
    if (req.path === "/logo.png" || req.path === "/favicon.ico") return next();
    // 已带有效 Cookie（值 = 用户名.签名）
    const cookies = String(req.headers.cookie || "").split(/;\s*/u);
    for (const c of cookies) {
      if (!c.startsWith(`${ACCESS_COOKIE}=`)) continue;
      const value = c.slice(ACCESS_COOKIE.length + 1);
      const dot = value.lastIndexOf(".");
      if (dot <= 0) continue;
      const user = decodeURIComponent(value.slice(0, dot));
      if (value.slice(dot + 1) === signUser(user) && accessAccounts.has(user)) {
        req.accessAccount = { user, ...accessAccounts.get(user) };
        return next();
      }
    }
    // Basic 头兼容（curl/脚本）
    const header = req.headers.authorization || "";
    if (header.startsWith("Basic ")) {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      const account = resolveAccount(decoded.slice(0, idx), decoded.slice(idx + 1));
      if (account) {
        req.accessAccount = account;
        return next();
      }
    }
    // 登录表单提交
    if (req.method === "POST" && req.path === "/access-login") {
      const { user = "", password = "" } = req.body || {};
      const account = resolveAccount(user, password);
      if (account) {
        res.setHeader(
          "Set-Cookie",
          `${ACCESS_COOKIE}=${encodeURIComponent(account.user)}.${signUser(account.user)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`,
        );
        return res.redirect("/");
      }
      return res.status(401).type("html").send(loginPage(true));
    }
    // API 请求返回 JSON，页面请求给登录页
    if (req.path.startsWith("/api/")) return res.status(401).json({ error: "需要登录" });
    return res.status(401).type("html").send(loginPage(false));
  });

  // ─── 管理后台：只有管理员能看。各账户用量 + 生成记录（缩略图）───
  const escapeHtml = (s) => String(s).replace(/[&<>"']/gu, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  app.get("/admin", (req, res) => {
    if (!req.accessAccount || req.accessAccount.role !== "admin") {
      return res.status(403).send("仅管理员可访问 /admin");
    }
    const rows = [...accessAccounts.entries()].map(([user, a]) => {
      const used = usageOf(user);
      const quota = a.quota === Infinity ? "∞" : a.quota;
      const last = usageStore[user]?.records?.[0]?.time;
      return `<tr><td>${escapeHtml(user)}</td><td>${a.role === "admin" ? "管理员" : "体验"}</td><td>${used} / ${quota}</td><td>${last ? escapeHtml(new Date(last).toLocaleString("zh-CN", { hour12: false })) : "—"}</td></tr>`;
    }).join("");
    const cards = Object.entries(usageStore)
      .flatMap(([user, entry]) => (entry.records || []).map((r) => ({ user, ...r })))
      .sort((a, b) => (a.time < b.time ? 1 : -1))
      .slice(0, 120)
      .map((r) => `<figure class="shot">${r.thumb ? `<img src="${r.thumb}" alt="" />` : `<div class="noimg">无图</div>`}<figcaption><b>${escapeHtml(r.user)}</b> · ${escapeHtml(r.engine || "")} · ${escapeHtml(r.ratio || "")}<br/>${escapeHtml(r.title || "（无标题）")}<br/><small>${escapeHtml(new Date(r.time).toLocaleString("zh-CN", { hour12: false }))}</small></figcaption></figure>`)
      .join("");
    res.type("html").send(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>管理后台 · BAKABAKA</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, "SF Pro Text", "PingFang SC", sans-serif; color: #241a3d; padding: 32px 4vw 60px;
    min-height: 100vh;
    background: radial-gradient(52% 46% at 14% 8%, rgba(167,139,250,.5) 0%, transparent 60%),
      radial-gradient(50% 44% at 86% 6%, rgba(129,140,248,.45) 0%, transparent 60%),
      radial-gradient(56% 50% at 88% 88%, rgba(147,197,253,.45) 0%, transparent 60%),
      linear-gradient(155deg, #cabcf7 0%, #b3bcf4 45%, #a9c6f0 100%); }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { font-size: 13px; color: rgba(36,26,61,.6); margin-bottom: 24px; }
  .glass { background: linear-gradient(160deg, rgba(255,255,255,.55), rgba(255,255,255,.3)); border: 1px solid rgba(255,255,255,.7);
    box-shadow: inset 0 1px 1px rgba(255,255,255,.9), 0 18px 50px rgba(80,50,160,.22); border-radius: 24px;
    -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); padding: 22px 24px; margin-bottom: 26px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,.5); }
  th { font-size: 12px; color: rgba(36,26,61,.55); font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
  .shot { background: rgba(255,255,255,.4); border: 1px solid rgba(255,255,255,.65); border-radius: 16px; overflow: hidden; }
  .shot img { width: 100%; display: block; }
  .noimg { width: 100%; aspect-ratio: 3/4; display: flex; align-items: center; justify-content: center; color: rgba(36,26,61,.4); font-size: 12px; }
  figcaption { padding: 8px 10px; font-size: 11.5px; line-height: 1.5; color: rgba(36,26,61,.75); }
  .empty { color: rgba(36,26,61,.5); font-size: 14px; }
</style></head>
<body>
  <h1>巴卡巴卡 · 管理后台</h1>
  <p class="sub">各账户用量与生成记录（记录保存在服务器，重新部署会清零）· <a href="/">返回生成器</a></p>
  <div class="glass">
    <table><thead><tr><th>账户</th><th>类型</th><th>已生成 / 额度</th><th>最近生成</th></tr></thead><tbody>${rows}</tbody></table>
  </div>
  <div class="glass">
    ${cards ? `<div class="grid">${cards}</div>` : `<p class="empty">还没有生成记录。</p>`}
  </div>
</body></html>`);
  });

  console.log(`[Access] 登录保护已启用：${accessAccounts.size} 个账户（管理员 + 体验），玻璃登录页 + 30 天 Cookie。`);
}

// Initialize database connection (non-blocking, graceful if not configured)
getPool();

// Apply optional auth to all routes (sets req.user if token valid)
app.use(optionalAuth);

// Mount auth and credits routes
app.use("/api/auth", authRoutes);
app.use("/api/credits", creditsRoutes);

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function splitDataUrl(dataUrl) {
  const match = /^data:(?<mime>[\w/+.-]+);base64,(?<data>.+)$/u.exec(dataUrl || "");
  if (!match?.groups) {
    throw new Error("Invalid image data URL.");
  }
  return {
    mimeType: match.groups.mime,
    base64: match.groups.data,
  };
}

function sanitizeExportFilename(filename) {
  const safeName = String(filename || "lipa-cover.png")
    .replace(/[^a-z0-9._-]/giu, "_")
    .replace(/^_+|_+$/gu, "");
  return safeName.endsWith(".png") ? safeName : `${safeName || "lipa-cover"}.png`;
}

async function imageUrlToBuffer(imageUrl) {
  if (String(imageUrl).startsWith("data:")) {
    const { base64 } = splitDataUrl(imageUrl);
    return Buffer.from(base64, "base64");
  }

  if (String(imageUrl).startsWith("/")) {
    const relativePath = String(imageUrl).replace(/^\/+/u, "");
    const candidates = [
      join(__dirname, "..", "dist", relativePath),
      join(__dirname, "..", "public", relativePath),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return readFile(candidate);
    }
  }

  return fetchBufferWithTimeout(imageUrl, imageFetchTimeoutMs());
}

function normalizeCount(value) {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count)) return 4;
  return Math.max(1, Math.min(10, count));
}

function normalizeEngine(value) {
  const key = String(value || "image2").toLowerCase().replace(/\s+/gu, "");
  return engineAliases[key] || "image2";
}

function resolveEngine(engine) {
  return normalizeEngine(engine);
}

function assertEngineAvailable(engine) {
  if (engine === "image2") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY. Add it to .env.local, then restart the server.");
    }
    return;
  }

  if (engine === "seedance") {
    return;
  }

  if (engine === "seedream") {
    if (!process.env.ARK_API_KEY) {
      throw new Error("缺少 ARK_API_KEY。请在 .env.local 配置火山方舟 API Key 后重启服务。");
    }
    return;
  }

  const label = engineLabels[engine] || engine;
  throw new Error(`${label} 还没有完成后端 adapter。当前只支持 Image2 / SeeDance / Seedream。`);
}

function isLocalFreeMode(req) {
  if (process.env.LOCAL_FREE_MODE === "0") return false;
  if (process.env.LOCAL_FREE_MODE === "1") return true;
  const host = String(req.headers.host || "").split(":")[0];
  return ["localhost", "127.0.0.1", "::1"].includes(host);
}

function normalizeSourceMode(value) {
  if (value === "elements" || value === "describe") return value;
  return "base";
}

// 总张数安全上限（防止滥用 / 资源耗尽）：5 种比例 × 10 张 = 50。
const MAX_TOTAL_COUNT = envNumber("MAX_TOTAL_COUNT", 50, { min: 1, max: 200 });

// 每个比例各自独立 1-10 张，互不占用名额；总数为各比例之和，受 MAX_TOTAL_COUNT 封顶。
function normalizeRatios(ratios) {
  const requestedRatios = Array.isArray(ratios) ? ratios : [];
  const normalized = [];
  let total = 0;

  for (const item of requestedRatios) {
    const ratio = String(item?.ratio || "").trim();
    if (!supportedRatios.has(ratio) || total >= MAX_TOTAL_COUNT) continue;
    let take = normalizeCount(item?.count);
    take = Math.min(take, MAX_TOTAL_COUNT - total);
    if (take > 0) {
      normalized.push({ ratio, count: take });
      total += take;
    }
  }

  return normalized.length > 0 ? normalized : [{ ratio: "3:4", count: 4 }];
}

function expandRatioJobs(ratios, plans) {
  const jobs = [];
  let planIndex = 0;
  for (const item of ratios) {
    for (let i = 0; i < item.count; i += 1) {
      const plan = plans[planIndex];
      if (!plan) break;
      jobs.push({ ratio: item.ratio, plan });
      planIndex += 1;
    }
  }
  return jobs;
}

function image2SizeForRatio(ratio) {
  const sizes = {
    "16:9": "1536x864",
    "4:3": "1536x1152",
    "1:1": "1024x1024",
    "3:4": "1152x1536",
    "9:16": "864x1536",
    "bilibili-safe": "1536x864", // B站安全框：16:9 出图
  };
  return sizes[ratio] || "1152x1536";
}

// Seedream 要求输出 >= 约 369 万像素（2K 起步），按比例给合规尺寸。
function seedreamSizeForRatio(ratio) {
  const sizes = {
    "16:9": "2880x1620",
    "4:3": "2304x1728",
    "1:1": "2048x2048",
    "3:4": "1728x2304",
    "9:16": "1620x2880",
    "bilibili-safe": "2880x1620", // B站：16:9 输出
  };
  return sizes[ratio] || "1728x2304";
}

function getSourceImages({ sourceMode, image, elementImages }) {
  if (sourceMode === "elements") {
    return Array.isArray(elementImages) ? elementImages.filter(Boolean).slice(0, 10) : [];
  }
  if (sourceMode === "base" && image) return [image];
  return [];
}

function validateGenerateInput({ sourceMode, image, elementImages, imageDescription, title }) {
  if (!title) throw new Error("Title is required.");
  if (sourceMode === "base" && !image) throw new Error("请先上传底图。");
  if (sourceMode === "elements" && (!Array.isArray(elementImages) || elementImages.length === 0)) {
    throw new Error("请至少上传一张素材。");
  }
  if (sourceMode === "describe" && !String(imageDescription || "").trim()) {
    throw new Error("请先填写画面描述。");
  }
}

function parseJsonObject(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    return fallback;
  }
}

async function analyzeImage(openai, image, { title, subtitle, keywords }) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a professional image color and composition analyst. Return compact JSON only with dominant_color, brightness, saturation, temperature, subject_position, empty_space, background_complexity.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this image for a Xiaohongshu/Douyin cover. Title: ${title}. Subtitle: ${subtitle || ""}. Keywords: ${keywords || ""}`,
          },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
  }, requestOptions(textRequestTimeoutMs()));

  return parseJsonObject(completion.choices?.[0]?.message?.content, fallbackAnalysis);
}

async function planCovers(openai, { analysis, title, subtitle, keywords, count, stylePreferences }) {
  // 从设计矩阵生成不重复的组合
  const matrixCombinations = generateCombinations(count, keywords);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature: 0.85,
    messages: [
      {
        role: "system",
        content: `You are an expert Chinese social cover art director. Use this complete skill rule set:\n\n${skillPrompt}`,
      },
      {
        role: "user",
        content: buildPlanUserPrompt({ analysis, title, subtitle, keywords, count, stylePreferences, matrixCombinations }),
      },
    ],
  }, requestOptions(textRequestTimeoutMs()));

  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content, { plans: [] });
  const fallback = fallbackPlans({ analysis, title, subtitle, count, keywords });
  const planned = Array.isArray(parsed.plans) ? parsed.plans.filter(Boolean) : [];
  const filledPlans = [...planned];

  for (const fallbackPlan of fallback) {
    if (filledPlans.length >= count) break;
    const duplicate = filledPlans.some(
      (plan) => String(plan.combination || "") === String(fallbackPlan.combination || ""),
    );
    if (!duplicate) filledPlans.push(fallbackPlan);
  }

  while (filledPlans.length < count) {
    filledPlans.push(fallback[filledPlans.length % fallback.length]);
  }

  return filledPlans.slice(0, count).map((plan, index) => {
    const backup = fallback[index % fallback.length];
    return {
      id: index + 1,
      combination: String(plan.combination || backup.combination || `方案${index + 1}`),
      label: String(plan.label || plan.description || backup.label || `方案 ${index + 1}`),
      description: String(plan.description || plan.label || backup.description || ""),
      prompt: String(plan.prompt || backup.prompt || ""),
    };
  });
}

function buildSourceInstruction({ sourceMode, imageDescription }) {
  if (sourceMode === "describe") {
    return `Source mode: text-only generation. Create the cover scene from this description: ${imageDescription}.`;
  }
  if (sourceMode === "elements") {
    return "Source mode: multiple material references. Combine the uploaded elements into one coherent social cover; keep recognizable product, people, material, color, and texture features when useful.";
  }
  return "Source mode: base image editing. Preserve the uploaded base image as the visual foundation and add typography/decorations on top.";
}

// 根据目标比例生成构图/画面延展指令。
function buildLayoutInstruction(ratio, sourceMode) {
  const isBilibiliSafe = ratio === "bilibili-safe";
  const isWide = ratio === "16:9" || ratio === "4:3" || isBilibiliSafe;
  const isVertical = ratio === "3:4" || ratio === "9:16" || ratio === "1:1";
  const canOutpaint = sourceMode === "base" || sourceMode === "elements";
  const lines = [];

  // 竖构图（含方形）：原图本身就是竖/方构图，无需扩图。严格遵循 Skill 排版叠字，
  // 保留原图与原始环境，绝不做高概念/电影感背景替换（高概念仅用于横版扩图区域）。
  if (isVertical) {
    lines.push(
      "NATIVE VERTICAL CANVAS (CRITICAL):",
      "- The source photo is already vertical and fits this canvas. Do NOT outpaint, do NOT extend, and do NOT replace or rebuild the background.",
      "- Preserve the ORIGINAL photo and its real environment exactly as shot. Keep the person and the real scene unchanged.",
      "- Your ONLY job is to add the designed Chinese typography and decorations strictly following the assigned design-matrix style (the Skill style). This is an overlay/typography task, not a scene re-creation.",
      "- ABSOLUTELY FORBIDDEN: cinematic high-concept scene replacement, neon cyberpunk backdrops, studio relighting, surreal dreamscapes, or any dramatic background swap. Keep it true to the original photo.",
    );
  }

  if (isWide && canOutpaint) {
    lines.push(
      "WIDE CANVAS / TOPIC-RELEVANT BACKGROUND EXTENSION (CRITICAL):",
      "- The source photo is vertical and does not fill this wider canvas. Extend and rebuild the left and right areas so the final image fully fills the wide frame as ONE cohesive photo.",
      "- The extended background MUST fit the cover's TITLE, TOPIC and MOOD. First understand what this cover is about from the title and keywords, then build a setting/scene that genuinely matches that subject and tone.",
      "- Keep it relevant and natural to the topic. Do NOT default to unrelated neon cyberpunk, hard-light photo studios, or random sci-fi / dramatic scenes \u2014 only go darker or more cinematic if the TOPIC itself calls for it.",
      "- Default to the brand's bright, premium, editorial look; match the lighting and color of the extension to the original photo so the whole frame reads as one continuous shot.",
      "- CRITICAL: preserve the PERSON exactly \u2014 same face, identity, hairstyle, clothing, pose and proportions \u2014 relight only as needed to blend naturally. Do not stretch, distort, duplicate or AI-fake the person.",
      "- The result must look like one cohesive, intentional, professionally composited wide image \u2014 NEVER a vertical photo with flat color bars, blurred padding, gradient blocks, mirrored copies, or pasted side panels.",
      "- Absolutely FORBIDDEN: solid color blocks, plain colored side panels, simple gaussian-blur fill, or low-effort duplicated scenery to complete the ratio.",
    );
  }

  if (isBilibiliSafe) {
    lines.push(
      "BILIBILI DUAL-RATIO SAFE ZONE (CRITICAL):",
      "- Output a 16:9 image, but Bilibili may also crop it to 4:3.",
      "- Keep ALL core content (main title text, subtitle, the person's face and key subject, logos) strictly within the CENTER SAFE ZONE: the central region shared by 16:9 and 4:3 (i.e. leave roughly the left ~12.5% and right ~12.5% width as outer margin).",
      "- The left/right outer margins must contain ONLY extended background environment (sky, window, wall, ambient scenery) so that cropping to 4:3 never cuts off any text or the subject.",
      "- Do not place any text or important subject element inside those outer side margins.",
    );
  }

  return lines.length ? `\n${lines.join("\n")}\n` : "";
}

// 作者灵感 → 场景指令：只控制「画面/底图怎么合成」，不碰花字排版。留空则返回空串（默认玩法）。
function buildSceneInstruction(inspiration) {
  const idea = String(inspiration || "").trim();
  if (!idea) return "";
  return `
SCENE / COMPOSITION (author's intent — controls the PHOTO/scene ONLY, not the typography):
- Using the uploaded photo(s), create this scene: ${idea}
- Photorealistically merge the subjects/people/objects from the uploaded image(s) into that scene, with consistent lighting, perspective and scale; keep faces and identities recognizable and unchanged.
- The bold Chinese typography / 花字 / decorations specified below are laid on top afterwards as usual, and are independent of this scene description.`;
}

function buildImage2Prompt(plan, context) {
  const ratioLabel = context.ratio === "bilibili-safe" ? "16:9 (Bilibili safe-zone)" : context.ratio;
  return `${buildSourceInstruction(context)}
Target aspect ratio: ${ratioLabel}.
${buildLayoutInstruction(context.ratio, context.sourceMode)}${buildSceneInstruction(context.inspiration)}
${plan.prompt}

CONTENT SAFETY CONTEXT:
- This is a non-sexual Chinese social media cover editing task.
- If the uploaded photo contains a tongue, mouth, lips, teeth, skin, or body close-up, treat it strictly as clinical health education, oral care, beauty care, wellness, or lifestyle content.
- Do not add erotic, seductive, fetish, nude, romantic, or sexualized elements.
- Only add bold Chinese typography/decorations for an educational, lifestyle, or commercial cover.`;
}

function friendlyProviderError(error, engine) {
  const raw = [error?.message, error?.response?.data?.error?.message, error?.stdout, error?.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();

  if (/safety system|safety_violations|sexual|request was rejected/iu.test(raw)) {
    if (engine === "image2") {
      return "Image2 的安全系统拒绝了这张底图，常见于舌苔/口腔近景被误判为 sexual。建议这类健康科普图切换「SeeDance」或换更临床、干净的底图重试。";
    }
    return "生成平台的安全系统拒绝了这张底图。建议换更中性、临床感更强的底图，或切换其他引擎重试。";
  }

  if (/insufficient_quota|quota|billing|credits?|余额|额度/iu.test(raw)) {
    return `${engineLabels[engine] || "当前引擎"} 额度不足或付款方式不可用，请检查平台余额/账单设置。`;
  }

  if (/invalid_api_key|incorrect api key|unauthorized|401/iu.test(raw)) {
    return `${engineLabels[engine] || "当前引擎"} 的 API Key 无效或未授权，请检查 .env.local 后重启服务。`;
  }

  if (/timed out|timeout|aborted|deadline/iu.test(raw)) {
    return `${engineLabels[engine] || "当前引擎"} 单张生成超时，已跳过这张，其他图片会继续生成。`;
  }

  if (/fetch failed|connect timeout|timeout|econnreset|unable to get local issuer certificate/iu.test(raw)) {
    return `${engineLabels[engine] || "当前引擎"} 网络连接失败，请检查代理/VPN 或稍后重试。`;
  }

  return raw.length > 320 ? `${raw.slice(0, 320)}...` : raw || "生成失败。";
}

async function imageDataUrlToFile(imageDataUrl, filename) {
  const { base64, mimeType } = splitDataUrl(imageDataUrl);
  return toFile(Buffer.from(base64, "base64"), filename, {
    type: mimeType || "image/png",
  });
}

async function imageResponseToDataUrl(response) {
  const item = response.data?.[0];
  if (item?.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }

  if (item?.url) {
    const buffer = await fetchBufferWithTimeout(item.url, imageFetchTimeoutMs());
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }

  throw new Error("Image API returned no image data.");
}

async function generateImage2Cover(openai, { sourceMode, sourceImages, imageDescription, inspiration, plan, ratio }) {
  const prompt = buildImage2Prompt(plan, { sourceMode, imageDescription, ratio, inspiration });
  const size = image2SizeForRatio(ratio);
  // 生图 = 一次直接调用 Image2，给足时间（Image2 要多久就多久），不提前截断、不重试，避免额外耗时。
  const timeoutMs = envNumber("IMAGE2_REQUEST_TIMEOUT_MS", 300000, { min: 60000, max: 600000 });
  const quality = process.env.IMAGE2_QUALITY || "auto";

  if (sourceImages.length === 0) {
    const response = await openai.images.generate({
      model: "gpt-image-2",
      prompt,
      size,
      quality,
      moderation: "auto",
    }, requestOptions(timeoutMs));
    return imageResponseToDataUrl(response);
  }

  const imageFiles = await Promise.all(
    sourceImages.map((sourceImage, index) => imageDataUrlToFile(sourceImage, `source-${index + 1}.png`)),
  );
  const response = await openai.images.edit({
    model: "gpt-image-2",
    image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
    prompt,
    size,
    quality,
  }, requestOptions(timeoutMs));
  return imageResponseToDataUrl(response);
}

function imageExtensionForMime(mimeType) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  return ".png";
}

function mimeTypeForFile(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function buildDreaminaEnv() {
  const cliPath = process.env.SEEDANCE_CLI_PATH || process.env.DREAMINA_CLI_PATH || "";
  const cliDir = cliPath ? dirname(cliPath) : "";
  const pathParts = [cliDir, join(homedir(), ".local/bin"), process.env.PATH || ""].filter(Boolean);
  return {
    ...process.env,
    HOME: process.env.SEEDANCE_HOME || process.env.DREAMINA_HOME || process.env.HOME || homedir(),
    PATH: pathParts.join(":"),
  };
}

function dreaminaExecutable() {
  return process.env.SEEDANCE_CLI_PATH || process.env.DREAMINA_CLI_PATH || "dreamina";
}

function normalizeCliError(error) {
  const output = [error?.stdout, error?.stderr, error?.message].filter(Boolean).join("\n").trim();
  if (error?.code === "ENOENT" || /executable file not found|command not found|spawn dreamina ENOENT/iu.test(output)) {
    return new Error(
      "未找到 SeeDance/即梦 CLI。请先运行官方安装命令，或在 .env.local 配置 SEEDANCE_CLI_PATH=/完整路径/dreamina，然后重启服务。",
    );
  }

  if (/未检测到有效登录态|请先执行 dreamina login|login/iu.test(output)) {
    return new Error("SeeDance/即梦 CLI 未登录。请先在终端运行 dreamina login，完成授权后重启或重新生成。");
  }

  return new Error(output || "SeeDance/即梦 CLI 调用失败。");
}

async function runDreamina(args, { timeout = 120000 } = {}) {
  try {
    const result = await execFileAsync(dreaminaExecutable(), args, {
      env: buildDreaminaEnv(),
      maxBuffer: 32 * 1024 * 1024,
      timeout,
    });
    return [result.stdout, result.stderr].filter(Boolean).join("\n");
  } catch (error) {
    throw normalizeCliError(error);
  }
}

async function writeTempImages(dataUrls, directory) {
  const filePaths = [];
  for (let index = 0; index < dataUrls.length; index += 1) {
    const { base64, mimeType } = splitDataUrl(dataUrls[index]);
    const filePath = join(directory, `source-${index + 1}${imageExtensionForMime(mimeType)}`);
    await writeFile(filePath, Buffer.from(base64, "base64"));
    filePaths.push(filePath);
  }
  return filePaths;
}

async function localImageToDataUrl(filePath) {
  const buffer = await readFile(filePath);
  return `data:${mimeTypeForFile(filePath)};base64,${buffer.toString("base64")}`;
}

async function findDownloadedImage(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findDownloadedImage(filePath);
      if (nested) return nested;
      continue;
    }
    if (/\.(png|jpe?g|webp)$/iu.test(entry.name)) {
      return filePath;
    }
  }
  return "";
}

function extractSubmitId(text) {
  const jsonMatch = /"submit_id"\s*:\s*"([^"]+)"/iu.exec(text);
  if (jsonMatch?.[1]) return jsonMatch[1];

  const plainMatch = /submit_id\s*[:=]\s*([a-z0-9_-]+)/iu.exec(text);
  return plainMatch?.[1] || "";
}

function extractImageReferenceFromText(text) {
  let parsed = null;
  try {
    parsed = parseJsonObject(text, null);
  } catch {
    parsed = null;
  }
  const jsonPath = parsed?.result_json?.images?.find((image) => image?.path)?.path;
  if (jsonPath) return jsonPath;

  const dataUrlMatch = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/iu.exec(text);
  if (dataUrlMatch?.[0]) return dataUrlMatch[0];

  const urlMatches = text.match(/https?:\/\/[^\s"']+/giu) || [];
  const imageUrl = urlMatches.find((url) => /\.(png|jpe?g|webp)(\?|$)/iu.test(url)) || urlMatches[0];
  if (imageUrl) return imageUrl.replace(/[),，。]+$/u, "");

  const localPathMatch = /((?:\/|[A-Za-z]:\\)[^\s"']+\.(?:png|jpe?g|webp))/iu.exec(text);
  return localPathMatch?.[1] || "";
}

function compactDreaminaPrompt(prompt) {
  // 放宽上限，保留完整的排版/花字/装饰指令（之前 2600 会把设计细节截断，导致出图太素）。
  return String(prompt || "")
    .replace(/\s+/gu, " ")
    .slice(0, 6000);
}

async function dreaminaOutputToDataUrl(output, downloadDir) {
  const downloaded = await findDownloadedImage(downloadDir);
  if (downloaded) return localImageToDataUrl(downloaded);

  const reference = extractImageReferenceFromText(output);
  if (!reference) return "";
  if (reference.startsWith("/")) return localImageToDataUrl(reference);
  return "";
}

async function queryDreaminaResult(submitId, downloadDir, pollSeconds) {
  const startedAt = Date.now();
  let lastOutput = "";

  do {
    lastOutput = await runDreamina(["query_result", "--submit_id", submitId, "--download_dir", downloadDir], {
      timeout: 45000,
    });
    const imageDataUrl = await dreaminaOutputToDataUrl(lastOutput, downloadDir);
    if (imageDataUrl) return imageDataUrl;

    if (/gen_status["'\s:=-]+fail|fail_reason/iu.test(lastOutput)) {
      throw new Error(lastOutput.slice(0, 1000));
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (Date.now() - startedAt < pollSeconds * 1000);

  throw new Error(`SeeDance/即梦任务已提交但仍在生成中，submit_id=${submitId}。稍后可用 dreamina query_result 查询。`);
}

function buildSeedancePrompt(plan, context) {
  const ratioLabel = context.ratio === "bilibili-safe" ? "16:9 (Bilibili safe-zone)" : context.ratio;
  return compactDreaminaPrompt(`${buildSourceInstruction(context)}
Target aspect ratio: ${ratioLabel}.
${buildLayoutInstruction(context.ratio, context.sourceMode)}${buildSceneInstruction(context.inspiration)}
${plan.prompt}`);
}

async function generateSeedanceCover({ sourceMode, sourceImages, imageDescription, inspiration, plan, ratio }) {
  const tempDir = await mkdtemp(join(tmpdir(), "lipa-dreamina-"));
  const downloadDir = join(tempDir, "downloads");
  await mkdir(downloadDir, { recursive: true });

  try {
    const pollSeconds = Math.max(
      10,
      Math.min(180, Number(process.env.SEEDANCE_POLL_SECONDS || process.env.DREAMINA_POLL_SECONDS || 75)),
    );
    const prompt = buildSeedancePrompt(plan, { sourceMode, imageDescription, ratio, inspiration });
    const args = [sourceImages.length > 0 ? "image2image" : "text2image"];

    if (sourceImages.length > 0) {
      const inputPaths = await writeTempImages(sourceImages, tempDir);
      for (const inputPath of inputPaths) {
        args.push("--images", inputPath);
      }
    }

    // dreamina 不认识 "bilibili-safe"，它是 16:9 输出 + 4:3 安全区，故映射为 16:9。
    const dreaminaRatio =
      ratio === "bilibili-safe"
        ? "16:9"
        : ratio || process.env.SEEDANCE_RATIO || process.env.DREAMINA_RATIO || "3:4";

    args.push(
      "--prompt",
      prompt,
      "--ratio",
      dreaminaRatio,
      "--resolution_type",
      process.env.SEEDANCE_RESOLUTION_TYPE || process.env.DREAMINA_RESOLUTION_TYPE || "2k",
      "--poll",
      String(Math.min(60, pollSeconds)),
    );

    const modelVersion = process.env.SEEDANCE_MODEL_VERSION || process.env.DREAMINA_MODEL_VERSION;
    if (modelVersion) {
      args.push("--model_version", modelVersion);
    }

    const submitOutput = await runDreamina(args, { timeout: (pollSeconds + 45) * 1000 });
    const immediateImage = await dreaminaOutputToDataUrl(submitOutput, downloadDir);
    if (immediateImage) return immediateImage;

    const submitId = extractSubmitId(submitOutput);
    if (!submitId) {
      throw new Error(`SeeDance/即梦没有返回 submit_id 或图片结果：${submitOutput.slice(0, 1000)}`);
    }

    return queryDreaminaResult(submitId, downloadDir, pollSeconds);
  } finally {
    if (process.env.KEEP_SEEDANCE_TEMP !== "1" && process.env.KEEP_DREAMINA_TEMP !== "1") {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function generateSeedreamCover({ sourceMode, sourceImages, inspiration, plan, ratio }) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 ARK_API_KEY。请在 .env.local 配置火山方舟 API Key 后重启服务。");
  }
  const model = process.env.ARK_MODEL || "doubao-seedream-5-0-260128";
  const baseUrl = process.env.ARK_API_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
  // 用完整设计提示词（与 Image2 同款，不截断）——保证花字/排版/装饰指令完整传达。
  const prompt = buildImage2Prompt(plan, { sourceMode, ratio, inspiration });
  const body = {
    model,
    prompt,
    size: seedreamSizeForRatio(ratio),
    response_format: "url",
    watermark: false,
  };
  // 图生图：把底图作为输入（base64 data URL）。当前取首图，多参考图后续可扩展。
  if (sourceImages.length > 0) {
    body.image = sourceImages[0];
  }
  const fetchOpts = arkDispatcher ? { dispatcher: arkDispatcher } : {};
  const response = await undiciFetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...fetchOpts,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.error) {
    throw new Error(json?.error?.message || `Seedream API 返回 ${response.status}`);
  }
  const item = json?.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (!item?.url) throw new Error("Seedream 未返回图片。");
  const imgResp = await undiciFetch(item.url, fetchOpts);
  if (!imgResp.ok) throw new Error(`下载 Seedream 结果失败 HTTP ${imgResp.status}`);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function generateByEngine({ openai, engine, sourceMode, sourceImages, imageDescription, inspiration, plan, ratio }) {
  const timeoutMs = imageJobTimeoutMs(engine);
  if (engine === "image2") {
    if (!openai) throw new Error("OpenAI client is not configured.");
    return withTimeout(
      generateImage2Cover(openai, { sourceMode, sourceImages, imageDescription, inspiration, plan, ratio }),
      timeoutMs,
      `${engineLabels[engine]} 单张生成`,
    );
  }
  if (engine === "seedance") {
    return withTimeout(
      generateSeedanceCover({ sourceMode, sourceImages, imageDescription, inspiration, plan, ratio }),
      timeoutMs,
      `${engineLabels[engine]} 单张生成`,
    );
  }
  if (engine === "seedream") {
    return withTimeout(
      generateSeedreamCover({ sourceMode, sourceImages, inspiration, plan, ratio }),
      timeoutMs,
      `${engineLabels[engine]} 单张生成`,
    );
  }
  throw new Error(`${engineLabels[engine] || engine} is not implemented.`);
}

app.post("/api/export-cover", async (req, res) => {
  try {
    const { imageUrl, filename } = req.body || {};
    if (!imageUrl) throw new Error("Image URL is required.");

    const safeName = sanitizeExportFilename(filename);
    const buffer = await imageUrlToBuffer(imageUrl);
    await mkdir(exportDir, { recursive: true });
    const filePath = join(exportDir, safeName);
    await writeFile(filePath, buffer);
    res.json({
      ok: true,
      filename: safeName,
      path: filePath,
      downloadUrl: `/api/download/${encodeURIComponent(safeName)}`,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Export failed.",
    });
  }
});

app.get("/api/download/:filename", (req, res) => {
  const safeName = sanitizeExportFilename(req.params.filename);
  const filePath = join(exportDir, safeName);
  if (!existsSync(filePath)) {
    res.status(404).send("File not found.");
    return;
  }

  res.download(filePath, safeName, (error) => {
    if (error && !res.headersSent) {
      res.status(500).send("Download failed.");
    }
  });
});

// 单张重生：某一张失败或不满意时，单独重生（可换引擎）。复用整条生成逻辑，普通 JSON 返回，不计费。
app.post("/api/regenerate", async (req, res) => {
  const requestedEngineRaw = req.body?.engine || "image2";
  try {
    const {
      plan,
      ratio = "3:4",
      sourceMode: requestedSourceMode = "base",
      image,
      elementImages = [],
      imageDescription = "",
      inspiration = "",
    } = req.body || {};
    if (!plan || typeof plan !== "object" || plan.id == null) {
      return res.status(400).json({ error: "缺少方案数据（plan），无法重生这张封面。" });
    }
    const sourceMode = normalizeSourceMode(requestedSourceMode);
    const engine = resolveEngine(normalizeEngine(requestedEngineRaw));
    assertEngineAvailable(engine);
    // 体验账户：单张重生 / 换模型 / 加比例 同样计入额度
    if (req.accessAccount && req.accessAccount.role !== "admin") {
      const remaining = req.accessAccount.quota - usageOf(req.accessAccount.user);
      if (remaining <= 0) {
        return res.json({ error: "体验额度已用完（每个体验账户限量），想继续用请联系管理员。" });
      }
    }
    const sourceImages = getSourceImages({ sourceMode, image, elementImages });
    const openai = createOpenAIClient();
    const imageUrl = await generateByEngine({
      openai,
      engine,
      sourceMode,
      sourceImages,
      imageDescription,
      inspiration,
      plan,
      ratio,
    });
    if (req.accessAccount) {
      recordGeneration(req.accessAccount.user, { engine, ratio, title: plan.label, imageUrl }).catch(() => {});
    }
    return res.json({
      id: plan.id,
      combination: plan.combination,
      label: plan.label,
      description: plan.description,
      image_url: imageUrl,
      engine,
      ratio,
    });
  } catch (error) {
    const engine = resolveEngine(normalizeEngine(requestedEngineRaw));
    console.warn(`[regenerate] 单张重生失败（${engine}）：${error?.message || error}`);
    return res.json({ error: friendlyProviderError(error, engine) });
  }
});

app.post("/api/generate", async (req, res) => {
  // ─── Credits check (before starting SSE) ───
  const { isDbAvailable } = await import("./db.js");
  const localFreeMode = isLocalFreeMode(req);
  if (isDbAvailable() && !localFreeMode) {
    if (!req.user) {
      return res.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
    }
    const requestedCount = Number(req.body?.ratios?.reduce?.((s, r) => s + (r.count || 0), 0) || req.body?.count || 4);
    const creditsCost = getCreditsCost(Math.max(1, requestedCount));
    if (req.user.role !== "admin" && req.user.credits < creditsCost) {
      return res.status(402).json({
        error: "积分不足",
        code: "INSUFFICIENT_CREDITS",
        required: creditsCost,
        current: req.user.credits,
      });
    }
    req.creditsCost = req.user.role === "admin" ? 0 : creditsCost;
  } else {
    req.creditsCost = 0;
  }

  const startedAt = Date.now();
  const {
    image,
    title,
    subtitle = "",
    keywords = "",
    engine: requestedEngine = "image2",
    count: requestedCount,
    sourceMode: requestedSourceMode = "base",
    imageDescription = "",
    inspiration = "",
    elementImages = [],
    ratios: requestedRatios = [],
    stylePreferences = null,
    slotEngines: requestedSlotEngines = [],
  } = req.body || {};
  const sourceMode = normalizeSourceMode(requestedSourceMode);
  const engine = resolveEngine(normalizeEngine(requestedEngine));
  // 每个比例独立计数，总数为各比例之和（不再受单个 count 限制）。
  let ratioGroups = normalizeRatios(requestedRatios);
  // 兼容：若未传 ratios 但传了 count，退回单一默认比例。
  if (!Array.isArray(requestedRatios) || requestedRatios.length === 0) {
    ratioGroups = [{ ratio: "3:4", count: normalizeCount(requestedCount) }];
  }
  // 固定生成顺序：先 3:4 → 16:9 → 4:3，其余排后面（方案/编号/生成先后都跟着此序）。
  const RATIO_ORDER = ["3:4", "9:16", "16:9", "bilibili-safe", "4:3", "1:1"];
  const ratioRank = (r) => { const i = RATIO_ORDER.indexOf(r); return i < 0 ? 99 : i; };
  ratioGroups = [...ratioGroups].sort((a, b) => ratioRank(a.ratio) - ratioRank(b.ratio));
  const totalCount = ratioGroups.reduce((sum, item) => sum + item.count, 0);

  // 体验账户额度检查（须在开 SSE 流之前，才能返回明确的拒绝信息）。
  if (req.accessAccount && req.accessAccount.role !== "admin") {
    const remaining = req.accessAccount.quota - usageOf(req.accessAccount.user);
    if (remaining <= 0) {
      return res.status(403).json({ error: "体验额度已用完（每个体验账户限量），想继续用请联系管理员。" });
    }
    if (totalCount > remaining) {
      return res.status(403).json({ error: `体验额度只剩 ${remaining} 张，请把生成数量调到 ${remaining} 张以内。` });
    }
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // 禁止反向代理缓冲 SSE（云/隧道下进度才能实时推送）
  res.flushHeaders?.();
  // 立刻塞一段填充注释，突破 Cloudflare/反代的缓冲阈值；再加心跳，让长间隔里也持续有数据流出，
  // 否则经隧道时早期进度会被缓冲、前端看着“卡在分析底图”。
  res.write(`:${" ".repeat(2048)}\n\n`);
  const sseHeartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* ignore */ }
  }, 15000);
  res.on("close", () => clearInterval(sseHeartbeat));

  try {
    // 引擎可用性在下方按“实际用到的引擎集合”逐一校验（支持逐张混合引擎）。
    validateGenerateInput({ sourceMode, image, elementImages, imageDescription, title });
    const sourceImages = getSourceImages({ sourceMode, image, elementImages });
    const analysisImage = sourceImages[0] || "";
    const planKeywords = [keywords, imageDescription ? `画面描述：${imageDescription}` : ""].filter(Boolean).join("\n");

    const openai = createOpenAIClient();
    const fallbackAnalysisWithColor = {
      ...fallbackAnalysis,
      dominant_color: stylePreferences?.imageDominantColor || fallbackAnalysis.dominant_color,
    };

    // ─── 分析与规划并行执行，避免串行等待两次 GPT-4o 调用 ───
    // 分析为“尽力而为”，不阻塞主流程；规划先用本地设计矩阵兜底，确保生图几乎立即开始。
    writeSse(res, {
      status: "analyzing",
      progress: 0,
      total: totalCount,
      engine,
      message: `正在准备方案并分析素材（${engineLabels[engine]}）...`,
    });

    let analysis = fallbackAnalysisWithColor;

    // ─── 快路径（默认开启）：FAST_DIRECT_MODE ───
    // 直接用本地设计矩阵（已审美优选权重）+ Skill prompt 生图，完全跳过 gpt-4o 的
    // 分析底图与规划方案两次文本调用。这是产品的核心链路：底图 + Skill 直接生图，
    // 又快又稳，且不会被 gpt-4o 重写稀释 Skill 指令。
    // 设为 0 才走 gpt-4o 编排（用于需要 AI 重写文案的高级场景）。
    const fastDirect = process.env.FAST_DIRECT_MODE !== "0";

    // 先用本地兜底方案（基于设计矩阵），无需等待任何网络调用。
    // 按每个比例分别生成 plans，竖版启用安全矩阵过滤器。
    let plans = [];
    for (const group of ratioGroups) {
      const groupPlans = fallbackPlans({ analysis, title, subtitle, count: group.count, keywords: planKeywords, ratio: group.ratio });
      plans.push(...groupPlans);
    }

    if (!fastDirect && openai) {
      // 慢路径：gpt-4o 分析 + 规划（保留为可选）。
      const analysisPromise = analysisImage
        ? analyzeImage(openai, analysisImage, { title, subtitle, keywords: planKeywords }).catch((error) => {
            console.warn("[Generate] Image analysis fallback:", error.message);
            return null;
          })
        : Promise.resolve(null);

      const planningPromise = analysisPromise
        .then((analyzed) => {
          if (analyzed) analysis = analyzed;
          return planCovers(openai, {
            analysis,
            title,
            subtitle,
            keywords: planKeywords,
            count: totalCount,
            stylePreferences,
          });
        })
        .catch((error) => {
          console.warn("[Generate] Cover planning fallback:", error.message);
          return null;
        });

      // 给规划充足等待时间（内容驱动需要 gpt-4o 看图+规划，质量优先于速度）。
      const planWaitMs = envNumber("PLAN_WAIT_MS", 90000, { min: 15000, max: 180000 });
      const planned = await withTimeout(planningPromise, planWaitMs, "方案生成").catch(() => null);
      if (Array.isArray(planned) && planned.length > 0) {
        plans = planned;
      }
    }

    // 跨比例重排 id，保证全局唯一：否则各比例的方案都从 1 开始，前端按 id 合并时
    // 后生成的比例（如横版）会覆盖先生成的（竖版），且缺失的 id 会显示“未返回结果”。
    plans = plans.map((plan, index) => ({ ...plan, id: index + 1 }));
    const jobs = expandRatioJobs(ratioGroups, plans);

    // 逐张引擎分配：前端可为每一张封面单独指定引擎（slotEngines，按 jobs 顺序对齐），
    // 缺省回退到全局 engine。然后只校验“实际用到的引擎”。
    const slotEngineList = Array.isArray(requestedSlotEngines) ? requestedSlotEngines : [];
    jobs.forEach((job, i) => {
      job.engine = resolveEngine(normalizeEngine(slotEngineList[i] || requestedEngine));
    });
    const usedEngines = [...new Set(jobs.map((j) => j.engine))];
    for (const usedEngine of usedEngines) assertEngineAvailable(usedEngine);

    writeSse(res, { status: "planned", progress: 0, total: totalCount, engine, plans, analysis, message: "方案已生成" });

    let completed = 0;
    // 混合引擎时取各引擎并发的最小值（即梦 CLI 串行=1），保证稳定。
    const concurrency = Math.min(...usedEngines.map((e) => generationConcurrency(e, totalCount)));
    writeSse(res, {
      status: "generating",
      progress: 0,
      total: totalCount,
      engine,
      message: concurrency > 1 ? `开始生成，当前 ${concurrency} 张并行...` : "开始生成封面...",
    });
    const results = await mapWithConcurrency(jobs, concurrency, async ({ plan, ratio, engine: jobEngine }, jobIndex) => {
      writeSse(res, {
        status: "generating",
        progress: completed,
        total: totalCount,
        engine: jobEngine,
        message: `开始生成封面 ${jobIndex + 1}/${totalCount}（${engineLabels[jobEngine] || jobEngine}）`,
      });
      try {
        const imageUrl = await generateByEngine({
          openai,
          engine: jobEngine,
          sourceMode,
          sourceImages,
          imageDescription,
          inspiration,
          plan,
          ratio,
        });
        const result = {
          id: plan.id,
          combination: plan.combination,
          label: plan.label,
          description: plan.description,
          image_url: imageUrl,
          engine: jobEngine,
          ratio,
        };
        completed += 1;
        if (req.accessAccount) {
          recordGeneration(req.accessAccount.user, { engine: jobEngine, ratio, title, imageUrl }).catch(() => {});
        }
        writeSse(res, {
          status: "generating",
          progress: completed,
          total: totalCount,
          engine,
          result,
          message: `已完成封面 ${completed}/${totalCount}`,
        });
        return result;
      } catch (error) {
        completed += 1;
        console.warn(`[generate] 封面 ${plan.id} 失败（${jobEngine}）：${error?.message || error}`);
        const result = {
          id: plan.id,
          combination: plan.combination,
          label: plan.label,
          description: plan.description,
          error: friendlyProviderError(error, jobEngine),
          engine: jobEngine,
          ratio,
        };
        writeSse(res, {
          status: "generating",
          progress: completed,
          total: totalCount,
          engine: jobEngine,
          result,
          message: `封面 ${plan.id} 生成失败`,
        });
        return result;
      }
    });

    results.sort((a, b) => a.id - b.id);

    // ─── Deduct credits after successful generation ───
    const successCount = results.filter((r) => !r.error).length;
    if (req.creditsCost > 0 && successCount > 0 && req.user) {
      try {
        await deductCredits(
          req.user.id,
          req.creditsCost,
          `生成 ${successCount} 张封面（${engine}）`,
          `gen-${Date.now()}`
        );
      } catch (err) {
        console.error("[Credits] Deduction failed:", err.message);
      }
    }

    // ─── Apply watermark for free users ───
    if (!localFreeMode && shouldApplyWatermark(req.user)) {
      for (const result of results) {
        if (result.image_url && !result.error) {
          try {
            result.image_url = await addWatermark(result.image_url);
          } catch (e) {
            // Watermark failure is non-critical
          }
        }
      }
    }

    writeSse(res, {
      status: "done",
      progress: completed,
      total: totalCount,
      engine,
      results,
      elapsed_ms: Date.now() - startedAt,
      message: "生成完成",
    });
    res.end();
  } catch (error) {
    // ─── Refund credits on total failure ───
    if (req.creditsCost > 0 && req.user) {
      // Don't deduct if generation completely failed
      // (credits are only deducted on success above)
    }

    writeSse(res, {
      status: "error",
      progress: 0,
      total: totalCount,
      engine,
      message: friendlyProviderError(error, engine),
    });
    res.end();
  }
});

if (serveDist) {
  const distPath = join(__dirname, "..", "dist");
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(/.*/, (_req, res) => res.sendFile(join(distPath, "index.html")));
  }
}

// Render 免费实例防休眠：闲置 15 分钟会被平台睡眠，访客得等 30-60s 的叫醒页。
// Render 自动注入 RENDER_EXTERNAL_URL；醒着时每 8 分钟自 ping 一次 /healthz 制造流量，
// 就永远不会因闲置入睡（GitHub Actions 的定时 ping 保留为兜底叫醒，它经常拖延到 1 小时一次）。
const externalUrl = String(process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/u, "");
if (externalUrl) {
  const keepAlive = setInterval(() => {
    fetch(`${externalUrl}/healthz`).catch(() => {});
  }, 8 * 60 * 1000);
  keepAlive.unref?.();
  console.log(`[KeepAlive] 每 8 分钟自 ping ${externalUrl}/healthz，防止免费实例休眠。`);
}

// 监听地址：默认 0.0.0.0（云平台必须对外监听；本机/隧道也兼容，因为含 127.0.0.1）。
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`LIPA API server running at http://${host}:${port}`);
});
