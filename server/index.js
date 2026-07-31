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
import { buildPlanUserPrompt, fallbackPlans, rebuildPlanFromKey, skillPrompt } from "./prompts.js";
import { generateCombinations, combinationToLabel, fontStyles, textLayouts, textEffects, colorSchemes, decorations, compositions, moods } from "./design-matrix.js";
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
  // Seedream 5.0 Pro 单张实测 60~110s，且会随负载/大尺寸(16:9/4:3)波动更久；180s 太紧会被
  // 批量里靠后的那张卡在超时边缘（实测第 3 张 181s 差点被砍）。给它 300s 余量，避免「直接选
  // Seedream 批量生成时靠后几张静默失败 → 看着没出图」。Image2/SeeDance 维持原值。
  const fallback = engine === "seedance" ? 150000 : engine === "seedream" ? 300000 : 180000;
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

// 退出登录：清掉访问 Cookie 回到登录页（放在口令中间件之前，任何状态都可退）。
app.get("/access-logout", (_req, res) => {
  res.setHeader("Set-Cookie", "baka_access=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  return res.redirect("/");
});

// ─── 账户体系 ───
// ACCESS_USER/ACCESS_PASSWORD = 管理员账户（无限额度，可用 /admin 后台管理）。
// 体验账户存 data/accounts.json，可在 /admin 网页上增删改；首次启动用 ACCESS_ACCOUNTS
// 环境变量播种（格式「用户名:密码:额度」，逗号分隔）。登录名不分大小写。
const ACCESS_USER = process.env.ACCESS_USER || "";
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";
const ADMIN_KEY = (ACCESS_USER || "admin").toLowerCase();

const dataDir = join(__dirname, "..", "data");
const accountsFile = join(dataDir, "accounts.json");
const coversDir = join(dataDir, "covers");

let trialAccounts = null; // 小写用户名 -> { password, quota }
try {
  trialAccounts = JSON.parse(readFileSync(accountsFile, "utf8"));
} catch {
  trialAccounts = null;
}
if (!trialAccounts || typeof trialAccounts !== "object") {
  // 播种：从环境变量初始化体验账户。两个来源合并——
  //   ACCESS_ACCOUNTS   ：一般在 Render 后台里设（不进 git）。
  //   ACCESS_ACCOUNTS_2 ：放 render.yaml 里随 git 走（私有库，安全），用于长期维护的体验账户，
  //                       后者不会覆盖前者已有的用户名。
  // 免费版磁盘易失，data/accounts.json 每次重启都会丢，所以每次都从这里重新播种（后台改的会还原）。
  trialAccounts = {};
  const seedFrom = (raw) => {
    for (const entry of String(raw || "").split(/[\s,]+/u).filter(Boolean)) {
      const [user, password, quotaRaw] = entry.split(":");
      const key = String(user || "").toLowerCase();
      if (!key || !password || key === ADMIN_KEY) continue;
      // quota 特殊值：
      //   "admin"（或 max/全部）= 全权限管理员：无限额度、不限比例、可进 /admin 后台。
      //   "vip"（或 会员/pro/无限）= 会员：无限额度、不限比例，但进不了后台。
      //   数字 = 体验账户：只能 3:4，单次最多该数字张。
      const q = String(quotaRaw || "").trim();
      if (/^(admin|max|全部|全权|全)$/iu.test(q)) {
        trialAccounts[key] = { password, quota: Infinity, admin: true };
      } else if (/^(vip|会员|pro|无限)$/iu.test(q)) {
        trialAccounts[key] = { password, quota: Infinity, vip: true };
      } else {
        trialAccounts[key] = { password, quota: Math.max(1, Number(quotaRaw) || 2) };
      }
    }
  };
  seedFrom(process.env.ACCESS_ACCOUNTS);
  seedFrom(process.env.ACCESS_ACCOUNTS_2);
}
let accountsSaveTimer = null;
function scheduleAccountsSave() {
  clearTimeout(accountsSaveTimer);
  accountsSaveTimer = setTimeout(async () => {
    try {
      await mkdir(dataDir, { recursive: true });
      await writeFile(accountsFile, JSON.stringify(trialAccounts));
    } catch (error) {
      console.warn("[Accounts] 保存失败:", error?.message || error);
    }
  }, 300);
}
// 用户名 → 账户（含管理员）；不匹配返回 null
function accountByKey(key) {
  if (ACCESS_PASSWORD && key === ADMIN_KEY) return { user: key, role: "admin", quota: Infinity, password: ACCESS_PASSWORD };
  const t = trialAccounts[key];
  if (!t) return null;
  if (t.admin) return { user: key, role: "admin", quota: Infinity, password: t.password };
  if (t.vip) return { user: key, role: "vip", quota: Infinity, password: t.password };
  return { user: key, role: "trial", quota: t.quota, password: t.password };
}

// ─── 用量与生成记录（/admin 可见、可管理）───
// usage.json + covers/ 原图文件。注意：Render 免费档磁盘临时，重新部署会清零。
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
// 预扣式计数：请求开始就把额度扣掉（堵住并发同时开多批钻空子），失败的再退回。
function reserveQuota(user, count) {
  const entry = (usageStore[user] ||= { used: 0, records: [] });
  entry.used += count;
  scheduleUsageSave();
}
function releaseQuota(user, count = 1) {
  const entry = usageStore[user];
  if (entry) {
    entry.used = Math.max(0, entry.used - count);
    scheduleUsageSave();
  }
}
async function recordGeneration(user, { engine, ratio, title, imageUrl }) {
  const entry = (usageStore[user] ||= { used: 0, records: [] });
  let thumb = "";
  let file = "";
  try {
    const match = /^data:image\/(\w+);base64,(.+)$/u.exec(String(imageUrl || ""));
    if (match) {
      const buffer = Buffer.from(match[2], "base64");
      const thumbBuffer = await sharp(buffer).resize({ width: 300 }).jpeg({ quality: 72 }).toBuffer();
      thumb = `data:image/jpeg;base64,${thumbBuffer.toString("base64")}`;
      // 资料库存 1024px 高清预览 JPEG（约 200KB/张，5GB 可存 ~2.5 万张），不存印刷级原图。
      const preview = await sharp(buffer).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      file = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await mkdir(coversDir, { recursive: true });
      await writeFile(join(coversDir, file), preview);
    }
  } catch { /* 缩略图/存盘失败不影响计数 */ }
  entry.records.unshift({ time: new Date().toISOString(), engine, ratio, title: String(title || "").slice(0, 60), thumb, file });
  // 超出上限的旧记录连原图文件一起清掉
  const dropped = entry.records.slice(100);
  entry.records = entry.records.slice(0, 100);
  for (const old of dropped) {
    if (old.file) rm(join(coversDir, old.file), { force: true }).catch(() => {});
  }
  scheduleUsageSave();
}

if (ACCESS_PASSWORD) {
  // 签名密钥只依赖管理员密码：增删体验账户不会把大家都登出
  const accessSecret = createHash("sha256").update(`baka-access|${ACCESS_PASSWORD}`).digest("hex");
  const signUser = (user) => createHash("sha256").update(`${accessSecret}|${user}`).digest("hex").slice(0, 40);
  const ACCESS_COOKIE = "baka_access";

  const loginPage = (showError, nextPath = "/") => `<!doctype html>
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
    <input type="hidden" name="next" value="${escapeHtml(nextPath)}" />
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
    const account = accountByKey(key);
    return account && account.password === String(password) ? account : null;
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
      const account = value.slice(dot + 1) === signUser(user) ? accountByKey(user) : null;
      if (account) {
        req.accessAccount = account;
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
    // 登录表单提交（登录成功后跳回原本要去的页面，比如 /admin）
    if (req.method === "POST" && req.path === "/access-login") {
      const { user = "", password = "", next = "/" } = req.body || {};
      const safeNext = /^\/(?!\/)/u.test(String(next)) ? String(next) : "/";
      const account = resolveAccount(user, password);
      if (account) {
        res.setHeader(
          "Set-Cookie",
          `${ACCESS_COOKIE}=${encodeURIComponent(account.user)}.${signUser(account.user)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`,
        );
        return res.redirect(safeNext);
      }
      return res.status(401).type("html").send(loginPage(true, safeNext));
    }
    // API 请求返回 JSON，页面请求给登录页（记住原目标，登录后跳回）
    if (req.path.startsWith("/api/")) return res.status(401).json({ error: "需要登录" });
    return res.status(401).type("html").send(loginPage(false, req.path));
  });

  // 审美库里的可选项（字体/色彩风格），给前端「风格定制」下拉用；库丰富后自动跟着变
  app.get("/api/style-options", (_req, res) => {
    const pick = (list) => list.filter((o) => o.weight > 0).map((o) => ({ id: o.id, name: o.name }));
    res.json({
      fonts: pick(fontStyles),
      layouts: pick(textLayouts),
      effects: pick(textEffects),
      colors: pick(colorSchemes),
      decorations: pick(decorations),
      compositions: pick(compositions),
      moods: pick(moods),
    });
  });

  // 定价表（前端购买页读取；改价只需改 server/pricing.js）
  app.get("/api/pricing", async (_req, res) => {
    const { CREDIT_PACKS, SUBSCRIPTIONS, SIGNUP_BONUS_CREDITS } = await import("./pricing.js");
    res.json({ packs: CREDIT_PACKS, subscriptions: SUBSCRIPTIONS, signupBonus: SIGNUP_BONUS_CREDITS });
  });

  // 当前登录的是谁（前端用它决定要不要显示「管理后台」按钮）
  app.get("/api/whoami", (req, res) => {
    const a = req.accessAccount;
    if (!a) return res.json({ user: null, role: "none" });
    return res.json({
      user: a.user,
      role: a.role,
      quota: a.quota === Infinity ? null : a.quota,
      used: usageOf(a.user),
    });
  });

  // ─── 管理后台：只有管理员能进。账户管理（增/删/改额度/重置用量）+ 生成记录（缩略图→原图）───
  const escapeHtml = (s) => String(s).replace(/[&<>"']/gu, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const requireAdmin = (req, res) => {
    if (!req.accessAccount || req.accessAccount.role !== "admin") {
      res.status(403).send("仅管理员可访问");
      return false;
    }
    return true;
  };

  // 新增/修改体验账户
  app.post("/admin/accounts", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = String(req.body?.user || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const quota = Math.max(1, Math.min(999, Number(req.body?.quota) || 2));
    if (!/^[a-z0-9_-]{2,24}$/u.test(user)) return res.status(400).send("用户名只能是 2-24 位字母/数字/下划线/短横线");
    if (user === ADMIN_KEY) return res.status(400).send("不能占用管理员用户名");
    if (!password) return res.status(400).send("密码不能为空");
    trialAccounts[user] = { password, quota };
    scheduleAccountsSave();
    return res.redirect("/admin");
  });
  // 删除体验账户（连用量记录与原图一起清）
  app.post("/admin/accounts/delete", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = String(req.body?.user || "").trim().toLowerCase();
    delete trialAccounts[user];
    const records = usageStore[user]?.records || [];
    for (const r of records) if (r.file) rm(join(coversDir, r.file), { force: true }).catch(() => {});
    delete usageStore[user];
    scheduleAccountsSave();
    scheduleUsageSave();
    return res.redirect("/admin");
  });
  // 重置某账户的已用张数（保留记录）
  app.post("/admin/accounts/reset", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = String(req.body?.user || "").trim().toLowerCase();
    if (usageStore[user]) {
      usageStore[user].used = 0;
      scheduleUsageSave();
    }
    return res.redirect("/admin");
  });
  // ─── 会员管理（需配置数据库；无数据库时页面提示未启用）───
  app.post("/admin/members/fulfill", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const { isDbAvailable } = await import("./db.js");
      if (!isDbAvailable()) return res.status(400).send("未配置数据库，会员体系未启用");
      const { findUserByPhone, fulfillOrder } = await import("./billing.js");
      const user = await findUserByPhone(req.body?.phone);
      if (!user) return res.status(404).send("没有这个手机号的用户（需对方先注册登录一次）");
      const result = await fulfillOrder({
        userId: user.id,
        productId: String(req.body?.productId || ""),
        channel: "manual",
        tradeNo: String(req.body?.tradeNo || "").trim(),
        operator: req.accessAccount.user,
      });
      if (!result.ok) return res.status(400).send(result.error || "开通失败");
      return res.redirect("/admin#members");
    } catch (error) {
      console.error("[Admin] fulfill error:", error);
      return res.status(500).send("开通失败：" + error.message);
    }
  });

  app.post("/admin/members/adjust", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const { isDbAvailable } = await import("./db.js");
      if (!isDbAvailable()) return res.status(400).send("未配置数据库，会员体系未启用");
      const { findUserByPhone, adminAdjustCredits } = await import("./billing.js");
      const user = await findUserByPhone(req.body?.phone);
      if (!user) return res.status(404).send("没有这个手机号的用户");
      const result = await adminAdjustCredits(user.id, req.body?.amount, String(req.body?.reason || ""), req.accessAccount.user);
      if (!result.ok) return res.status(400).send(result.error || "调整失败");
      return res.redirect("/admin#members");
    } catch (error) {
      console.error("[Admin] adjust error:", error);
      return res.status(500).send("调整失败：" + error.message);
    }
  });

  // 看原图（管理员专用）
  app.get("/admin/cover/:file", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const file = String(req.params.file || "");
    if (!/^[\w.-]+$/u.test(file) || file.includes("..")) return res.status(400).send("bad name");
    const filePath = join(coversDir, file);
    if (!existsSync(filePath)) return res.status(404).send("这张的原图已被清理（重新部署会清空记录）");
    return res.sendFile(filePath);
  });

  app.get("/admin", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    // 会员体系区块（需数据库；未配置则显示引导）
    let membersHtml = "";
    try {
      const { isDbAvailable } = await import("./db.js");
      const { CREDIT_PACKS, SUBSCRIPTIONS } = await import("./pricing.js");
      const productOptions = [...SUBSCRIPTIONS, ...CREDIT_PACKS]
        .map((p) => `<option value="${p.id}">${escapeHtml(p.name)} · ¥${(p.amountFen / 100).toFixed(0)}${p.credits ? ` · ${p.credits} 积分` : ""}</option>`)
        .join("");
      if (!isDbAvailable()) {
        membersHtml = `<div class="glass" id="members"><h2>会员体系</h2>
          <p class="empty">未配置数据库，会员/积分功能暂未启用。配置 MYSQL_HOST 与 MYSQL_DATABASE 后自动建表启用。</p></div>`;
      } else {
        const { listUsers, recentOrders } = await import("./billing.js");
        const [members, orders] = await Promise.all([listUsers(100), recentOrders(50)]);
        const fmt = (d) => (d ? escapeHtml(new Date(d).toLocaleString("zh-CN", { hour12: false })) : "—");
        const memberRows = members.map((m) => {
          const active = m.subscription_plan !== "free" && m.subscription_expires_at && new Date(m.subscription_expires_at) > new Date();
          return `<tr><td>${escapeHtml(m.phone)}</td><td>${m.role === "admin" ? "管理员" : "用户"}</td><td><b>${m.credits}</b></td>
            <td>${active ? `${escapeHtml(m.subscription_plan)} · 到期 ${fmt(m.subscription_expires_at)}` : "免费用户"}</td>
            <td>${fmt(m.created_at)}</td></tr>`;
        }).join("") || `<tr><td colspan="5" class="empty">还没有注册用户</td></tr>`;
        const orderRows = orders.map((o) => `<tr><td>${fmt(o.created_at)}</td><td>${escapeHtml(o.phone)}</td><td>${escapeHtml(o.product_name)}</td>
          <td>¥${(o.amount_fen / 100).toFixed(0)}</td><td>${o.credits || 0}</td><td>${escapeHtml(o.channel)}${o.operator ? " · " + escapeHtml(o.operator) : ""}</td></tr>`).join("")
          || `<tr><td colspan="6" class="empty">还没有订单</td></tr>`;
        membersHtml = `
        <div class="glass" id="members">
          <h2>会员 · 手动开通</h2>
          <form class="addform" method="POST" action="/admin/members/fulfill">
            <input name="phone" placeholder="用户手机号" required />
            <select name="productId" style="padding:10px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.75);font-family:inherit;font-size:14px;background:rgba(255,255,255,.5);color:#241a3d">${productOptions}</select>
            <input name="tradeNo" placeholder="收款单号/备注（选填）" style="width:200px" />
            <button type="submit">确认开通</button>
          </form>
          <p class="hint">用户扫码付款后，你在这里按手机号给他开通（会自动加积分/续会员并留下订单记录）。以后接了微信/支付宝，这一步就自动完成。</p>
          <form class="addform" method="POST" action="/admin/members/adjust" style="margin-top:14px">
            <input name="phone" placeholder="用户手机号" required />
            <input name="amount" type="number" placeholder="积分±" required style="width:110px" />
            <input name="reason" placeholder="原因（选填）" style="width:200px" />
            <button type="submit">调整积分</button>
          </form>
        </div>
        <div class="glass">
          <h2>注册用户（最近 100）</h2>
          <table><thead><tr><th>手机号</th><th>身份</th><th>积分</th><th>会员</th><th>注册时间</th></tr></thead><tbody>${memberRows}</tbody></table>
        </div>
        <div class="glass">
          <h2>订单记录（最近 50）</h2>
          <table><thead><tr><th>时间</th><th>手机号</th><th>套餐</th><th>金额</th><th>积分</th><th>渠道</th></tr></thead><tbody>${orderRows}</tbody></table>
        </div>`;
      }
    } catch (error) {
      membersHtml = `<div class="glass" id="members"><h2>会员体系</h2><p class="empty">加载失败：${escapeHtml(error.message)}</p></div>`;
    }
    const allAccounts = [
      { user: ADMIN_KEY, role: "admin", quota: Infinity },
      ...Object.entries(trialAccounts).map(([user, t]) => ({ user, role: t.admin ? "admin" : t.vip ? "vip" : "trial", quota: t.quota, password: t.password })),
    ];
    const rows = allAccounts.map((a) => {
      const used = usageOf(a.user);
      const quota = a.quota === Infinity ? "∞" : a.quota;
      const last = usageStore[a.user]?.records?.[0]?.time;
      const ops = a.role === "admin" ? "—" : `
        <form method="POST" action="/admin/accounts/reset" class="inline"><input type="hidden" name="user" value="${escapeHtml(a.user)}" /><button class="mini">重置用量</button></form>
        <form method="POST" action="/admin/accounts/delete" class="inline" onsubmit="return confirm('删除账户 ${escapeHtml(a.user)}？记录也会清掉')"><input type="hidden" name="user" value="${escapeHtml(a.user)}" /><button class="mini danger">删除</button></form>`;
      const pass = a.role === "admin" ? "······" : escapeHtml(a.password);
      const roleLabel = a.role === "admin" ? "管理员" : a.role === "vip" ? "会员" : "体验";
      const quotaLabel = a.role === "admin" || a.role === "vip" ? "不限" : `${quota} 张/次`;
      return `<tr><td><b>${escapeHtml(a.user)}</b></td><td>${roleLabel}</td><td>${pass}</td><td>${used}</td><td>${quotaLabel}</td><td>${last ? escapeHtml(new Date(last).toLocaleString("zh-CN", { hour12: false })) : "—"}</td><td class="ops">${ops}</td></tr>`;
    }).join("");
    const cards = Object.entries(usageStore)
      .flatMap(([user, entry]) => (entry.records || []).map((r) => ({ user, ...r })))
      .sort((a, b) => (a.time < b.time ? 1 : -1))
      .slice(0, 120)
      .map((r) => {
        const img = r.thumb ? `<img src="${r.thumb}" alt="" />` : `<div class="noimg">无图</div>`;
        const body = r.file ? `<a href="/admin/cover/${encodeURIComponent(r.file)}" target="_blank" title="点开看原图">${img}</a>` : img;
        return `<figure class="shot">${body}<figcaption><b>${escapeHtml(r.user)}</b> · ${escapeHtml(r.engine || "")} · ${escapeHtml(r.ratio || "")}<br/>${escapeHtml(r.title || "（无标题）")}<br/><small>${escapeHtml(new Date(r.time).toLocaleString("zh-CN", { hour12: false }))}</small></figcaption></figure>`;
      })
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
  h2 { font-size: 15px; margin-bottom: 12px; }
  .sub { font-size: 13px; color: rgba(36,26,61,.6); margin-bottom: 24px; }
  .sub a { color: #5b4bc4; }
  .glass { background: linear-gradient(160deg, rgba(255,255,255,.55), rgba(255,255,255,.3)); border: 1px solid rgba(255,255,255,.7);
    box-shadow: inset 0 1px 1px rgba(255,255,255,.9), 0 18px 50px rgba(80,50,160,.22); border-radius: 24px;
    -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); padding: 22px 24px; margin-bottom: 26px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,.5); }
  th { font-size: 12px; color: rgba(36,26,61,.55); font-weight: 600; }
  .inline { display: inline-block; margin-right: 6px; }
  .mini { font-size: 12px; padding: 5px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.75); cursor: pointer;
    background: linear-gradient(160deg, rgba(255,255,255,.6), rgba(255,255,255,.35)); color: #241a3d; font-family: inherit; }
  .mini.danger { color: #c02662; }
  .mini:hover { filter: brightness(1.05); }
  .addform { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .addform input { padding: 10px 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,.75); font-size: 14px;
    background: linear-gradient(160deg, rgba(255,255,255,.6), rgba(255,255,255,.35)); color: #241a3d; outline: none; font-family: inherit; }
  .addform input[name="user"] { width: 160px; } .addform input[name="password"] { width: 160px; } .addform input[name="quota"] { width: 90px; }
  .addform button { padding: 10px 22px; border-radius: 999px; border: 1px solid rgba(255,255,255,.6); cursor: pointer; font-weight: 700; color: #fff;
    background: linear-gradient(165deg, rgba(167,139,250,.95), rgba(124,105,246,.92)); font-family: inherit; }
  .hint { font-size: 12px; color: rgba(36,26,61,.55); margin-top: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
  .shot { background: rgba(255,255,255,.4); border: 1px solid rgba(255,255,255,.65); border-radius: 16px; overflow: hidden; }
  .shot img { width: 100%; display: block; }
  .noimg { width: 100%; aspect-ratio: 3/4; display: flex; align-items: center; justify-content: center; color: rgba(36,26,61,.4); font-size: 12px; }
  figcaption { padding: 8px 10px; font-size: 11.5px; line-height: 1.5; color: rgba(36,26,61,.75); }
  .empty { color: rgba(36,26,61,.5); font-size: 14px; }
</style></head>
<body>
  <h1>巴卡巴卡 · 管理后台</h1>
  <p class="sub">账户管理与生成记录 · <a href="/">返回生成器</a> · <a href="/access-logout">退出登录</a></p>
  <div class="glass">
    <h2>账户</h2>
    <table><thead><tr><th>账户</th><th>类型</th><th>密码</th><th>累计生成</th><th>单次上限</th><th>最近生成</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="margin-top:16px">
      <form class="addform" method="POST" action="/admin/accounts">
        <input name="user" placeholder="用户名（字母数字）" required />
        <input name="password" placeholder="密码" required />
        <input name="quota" type="number" min="1" max="999" value="2" title="单次最多生成几张" />
        <button type="submit">添加 / 修改账户</button>
      </form>
      <p class="hint">同名提交 = 修改密码/单次上限。体验账户只能生成 小红书 3:4，一次最多「单次上限」张，生成完可再来。累计生成与记录存在服务器磁盘，免费档重启/重新部署会清零（要永久保存需付费磁盘）。</p>
    </div>
  </div>
  ${membersHtml}
  <div class="glass">
    <h2>生成记录（点缩略图看原图）</h2>
    ${cards ? `<div class="grid">${cards}</div>` : `<p class="empty">还没有生成记录。</p>`}
  </div>
</body></html>`);
  });

  console.log(`[Access] 登录保护已启用：管理员 + ${Object.keys(trialAccounts).length} 个体验账户，/admin 可管理。`);
}

// Initialize database connection (non-blocking, graceful if not configured)
getPool();
// 配了数据库就自动建表（幂等），省去手动执行 schema.sql
import("./db.js").then(({ ensureSchema }) => ensureSchema()).catch(() => {});

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
  return Math.max(1, Math.min(8, count));
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

// 每个比例各自独立 1-8 张，互不占用名额；总数为各比例之和，受 MAX_TOTAL_COUNT 封顶。
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
// 火山 Seedream 单张有像素上限（实测硬上限 4,624,220px；超了直接报
// "image area must be at most 4624220 pixels" → 该比例永远出不来）。
// 原来的 16:9 / 9:16 / bilibili（2880x1620 = 4,665,600px）就是超了，所以「直接选 Seedream
// 生成 16:9」永远失败、静默消失。这里统一按上限夹一刀：保持比例、按面积等比缩到安全值内。
const SEEDREAM_MAX_AREA = 4500000; // 留足余量（硬上限 ~4.62M；四舍五入后仍稳稳低于）
function seedreamSizeForRatio(ratio) {
  const sizes = {
    "16:9": "2880x1620",
    "4:3": "2304x1728",
    "1:1": "2048x2048",
    "3:4": "1728x2304",
    "9:16": "1620x2880",
    "bilibili-safe": "2880x1620", // B站：16:9 输出
  };
  const raw = sizes[ratio] || "1728x2304";
  const [w, h] = raw.split("x").map(Number);
  const area = w * h;
  if (!area || area <= SEEDREAM_MAX_AREA) return raw;
  const scale = Math.sqrt(SEEDREAM_MAX_AREA / area);
  const cw = Math.max(8, Math.round((w * scale) / 8) * 8); // 对齐到 8 像素，模型更稳
  const ch = Math.max(8, Math.round((h * scale) / 8) * 8);
  return `${cw}x${ch}`;
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

function buildSourceInstruction({ sourceMode, imageDescription, sourceCount }) {
  if (sourceMode === "describe") {
    return `Source mode: text-only generation. Create the cover scene from this description: ${imageDescription}.`;
  }
  if (sourceMode === "elements") {
    const n = Number(sourceCount) || 0;
    if (n >= 2) {
      // 元素模式的硬约束：给了几张就必须用几张——每张抠图、全部融进同一张，不许只用其中一张。
      return `Source mode: ${n} MATERIAL REFERENCE IMAGES were uploaded. This is a HARD compositing brief, NOT a pick-one:
- You MUST use ALL ${n} uploaded images. CUT OUT the main subject/object from EACH image (clean-edge cut-out) and composite ALL ${n} of them together into ONE single cover. Never drop one or use only a single image.
- Read the semantic relationship between these ${n} subjects and FUSE them into one coherent, intentional scene where they interact and complement each other — a genuinely combined composition with real chemistry, not separate stickers floating apart.
- Keep each subject recognizable (its key shape, face/identity, colors, material, texture), while unifying lighting, perspective, scale and color grade so the whole frame reads as one shot.`;
    }
    return "Source mode: material reference. Use the uploaded material as the main subject of the cover; keep its recognizable product/person/material/color/texture features.";
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
  // 仅对「上传底图」生效——元素融合/文字描述没有单张原图可保留，硬套会逼模型只用一张、不敢合成。
  if (isVertical && sourceMode === "base") {
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
  const prompt = buildImage2Prompt(plan, { sourceMode, imageDescription, ratio, inspiration, sourceCount: sourceImages.length });
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
    const prompt = buildSeedancePrompt(plan, { sourceMode, imageDescription, ratio, inspiration, sourceCount: sourceImages.length });
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
  const prompt = buildImage2Prompt(plan, { sourceMode, ratio, inspiration, sourceCount: sourceImages.length });
  const body = {
    model,
    prompt,
    size: seedreamSizeForRatio(ratio),
    response_format: "url",
    watermark: false,
  };
  // 图生图：把底图作为输入（base64 data URL）。元素模式给几张就传几张——实测 ARK 接受 image 数组，
  // 多参考图会全部作为参考（配合 prompt 里的「必须全用+抠图融合」硬约束）。
  if (sourceImages.length > 0) {
    body.image = sourceImages.length === 1 ? sourceImages[0] : sourceImages;
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

// 判断一次失败是否值得重试：只有「重试也不会好」的（内容安全审核 / 额度用尽 / 密钥无效）不重试；
// 其余（网络抖动、超时、限流 429、5xx、未知）都当临时性，值得再试一次。
function isTransientError(error) {
  const raw = [error?.message, error?.cause?.message, error?.cause?.code, error?.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/safety|sexual|nsfw|moderat|request was rejected|violat|insufficient_quota|billing|额度|敏感|审核|违规|invalid_api_key|incorrect api key|unauthorized|\b401\b/u.test(raw)) {
    return false;
  }
  return true;
}

// 把生成结果转成 JPEG 再发给前端：封面是"照片 + 大字"，JPEG 高质量画质几乎看不出差别，但体积比
// PNG 小 5-10 倍——大幅省 Render 出站流量（免费 5GB 能用很久，不再动不动因带宽被暂停）。
// 转失败或反而更大就退回原图，绝不影响出图。质量默认 90，可用 COVER_JPEG_QUALITY 调。
async function toJpegDataUrl(dataUrl) {
  try {
    const m = /^data:([^;]+);base64,(.*)$/su.exec(String(dataUrl || ""));
    if (!m) return dataUrl;
    if (/jpe?g/iu.test(m[1])) return dataUrl; // 已经是 JPEG
    const quality = envNumber("COVER_JPEG_QUALITY", 90, { min: 60, max: 100 });
    const srcBuf = Buffer.from(m[2], "base64");
    const outBuf = await sharp(srcBuf).jpeg({ quality, mozjpeg: true }).toBuffer();
    return outBuf.length < srcBuf.length ? `data:image/jpeg;base64,${outBuf.toString("base64")}` : dataUrl;
  } catch {
    return dataUrl;
  }
}

async function generateByEngine({ openai, engine, sourceMode, sourceImages, imageDescription, inspiration, plan, ratio }) {
  const timeoutMs = imageJobTimeoutMs(engine);
  const runOnce = async () => {
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
  };

  // 成功的封面一次就出、零额外耗时。只有真的失败、且是临时性错误（限流/网络/超时）的那张才重试，
  // 且用递增退避把重试错开，避免几张同时撞同一个"抖动窗口"（Seedream 是 Oregon→北京 跨境链路，
  // 批量时最容易一批一起失败，所以多给两次机会）。安全审核/额度/密钥这类不重试。
  const maxAttempts = engine === "seedream" ? 3 : 2;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await toJpegDataUrl(await runOnce());
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === maxAttempts) throw error;
      const backoff = attempt * 1200; // 1.2s、2.4s… 错开重试
      console.warn(`[Retry] ${engine} 第 ${attempt}/${maxAttempts} 次临时性失败，${backoff}ms 后重试：${String(error?.message || error).slice(0, 160)}`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw lastError;
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
      plan: requestedPlan,
      rebuild,
      ratio = "3:4",
      sourceMode: requestedSourceMode = "base",
      image,
      elementImages = [],
      imageDescription = "",
      inspiration = "",
    } = req.body || {};
    let plan = requestedPlan;
    // 单张「换某一项」：按组合键重建方案（可替换一个维度 / 或只改字体颜色）
    if (!plan && rebuild?.combination) {
      plan = rebuildPlanFromKey({
        combinationKey: rebuild.combination,
        swap: rebuild.swap,
        analysis: fallbackAnalysis,
        title: String(rebuild.title || ""),
        subtitle: String(rebuild.subtitle || ""),
        ratio,
        textColor: /^#[0-9a-fA-F]{6}$/u.test(String(rebuild.textColor || "")) ? String(rebuild.textColor).toUpperCase() : "",
        smartScene: rebuild.smartScene === true,
      });
      if (plan) plan.id = Number(rebuild.id) || 1;
    }
    if (!plan || typeof plan !== "object" || plan.id == null) {
      return res.status(400).json({ error: "缺少方案数据（plan），无法重生这张封面。" });
    }
    const sourceMode = normalizeSourceMode(requestedSourceMode);
    const engine = resolveEngine(normalizeEngine(requestedEngineRaw));
    assertEngineAvailable(engine);
    // 体验账户(trial)：单张重生 / 换模型只能 3:4；会员(vip)/管理员(admin) 不限。
    if (req.accessAccount && req.accessAccount.role === "trial") {
      if (ratio !== "3:4") {
        return res.json({ error: "体验账户只能生成「小红书封面 3:4」。" });
      }
    }
    // 计 1 张统计，失败在 catch 里退回
    if (req.accessAccount) reserveQuota(req.accessAccount.user, 1);
    let imageUrl;
    try {
      const sourceImages = getSourceImages({ sourceMode, image, elementImages });
      const openai = createOpenAIClient();
      imageUrl = await generateByEngine({
        openai,
        engine,
        sourceMode,
        sourceImages,
        imageDescription,
        inspiration,
        plan,
        ratio,
      });
    } catch (error) {
      if (req.accessAccount) releaseQuota(req.accessAccount.user, 1);
      throw error;
    }
    if (req.accessAccount) {
      recordGeneration(req.accessAccount.user, { engine, ratio, title: plan.label, imageUrl }).catch(() => {});
    }
    return res.json({
      id: plan.id,
      combination: plan.combination,
      label: plan.label,
      description: plan.description,
      prompt: plan.prompt, // 前端存下，后续「重生」沿用换过之后的方案
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

  // 体验账户限制（须在开 SSE 流之前，才能返回明确的拒绝信息）：
  // ① 只能生成小红书 3:4；② 单次最多 quota 张（生成完可以再来，但一次不能薅太多）。
  // 单次上限不依赖服务器计数 → 免费服务器重启也不会失效。
  let reservedCount = 0;
  // 只限制「体验账户(trial)」：会员(vip)/管理员(admin) 不限比例、不限张数。
  if (req.accessAccount && req.accessAccount.role === "trial") {
    if (ratioGroups.some((g) => g.ratio !== "3:4")) {
      return res.status(403).json({ error: "体验账户只能生成「小红书封面 3:4」，请只勾选 3:4 这一个比例。" });
    }
    if (totalCount > req.accessAccount.quota) {
      return res.status(403).json({ error: `体验账户单次最多生成 ${req.accessAccount.quota} 张，请把数量调小，生成完可以再来。` });
    }
  }
  // 计数仅作统计（管理后台展示累计生成量），不再作为拦截依据
  if (req.accessAccount) {
    reserveQuota(req.accessAccount.user, totalCount);
    reservedCount = totalCount;
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

    // 用户在界面锁定的各维度（都选填；未选 = 库内随机）
    const styleLock = {};
    // 多选：前端每个维度传 id 数组（也兼容旧的单值）。只保留库里存在的 id；空 = 不锁。
    const lockIf = (dim, list, ids) => {
      const arr = (Array.isArray(ids) ? ids : ids ? [ids] : []).filter((id) => list.some((o) => o.id === id));
      if (arr.length) styleLock[dim] = arr;
    };
    lockIf("A", fontStyles, stylePreferences?.fontIds ?? stylePreferences?.fontId);
    lockIf("B", textLayouts, stylePreferences?.layoutIds ?? stylePreferences?.layoutId);
    lockIf("C", textEffects, stylePreferences?.effectIds ?? stylePreferences?.effectId);
    lockIf("D", colorSchemes, stylePreferences?.colorSchemeIds ?? stylePreferences?.colorSchemeId);
    lockIf("E", decorations, stylePreferences?.decorationIds ?? stylePreferences?.decorationId);
    lockIf("F", compositions, stylePreferences?.compositionIds ?? stylePreferences?.compositionId);
    lockIf("G", moods, stylePreferences?.moodIds ?? stylePreferences?.moodId);
    // 字色多选：一组合法 hex，交给 fallbackPlans 每张随机取一个（兼容旧的单值 textColor）。
    const rawColors = Array.isArray(stylePreferences?.textColors)
      ? stylePreferences.textColors
      : stylePreferences?.textColor
      ? [stylePreferences.textColor]
      : [];
    const lockedTextColors = [...new Set(
      rawColors
        .map((c) => String(c || "").toUpperCase())
        .filter((c) => /^#[0-9A-F]{6}$/u.test(c)),
    )];
    // 「读懂标题去配场景」独立开关：任何风格都可搭，开了才抠图配场景、放开像素保护。
    const smartScene = stylePreferences?.smartScene === true;

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
      const groupPlans = fallbackPlans({
        analysis,
        title,
        subtitle,
        count: group.count,
        keywords: planKeywords,
        ratio: group.ratio,
        styleLock,
        textColors: lockedTextColors,
        smartScene,
      });
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
    // 交给逐张 worker 后，额度由「失败退回」接管；预扣里没跑到的任务（方案不足）在结果后对账退回。
    reservedCount = 0;
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
        if (req.accessAccount) releaseQuota(req.accessAccount.user, 1); // 失败的退回额度
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
    // 对账：预扣了 totalCount，但实际任务数可能更少（方案不足），差额退回。
    if (req.accessAccount && results.length < totalCount) {
      releaseQuota(req.accessAccount.user, totalCount - results.length);
    }

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
    // 生成还没开始就挂了（校验/规划阶段）：把预扣的额度整体退回
    if (req.accessAccount && reservedCount > 0) {
      releaseQuota(req.accessAccount.user, reservedCount);
      reservedCount = 0;
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
