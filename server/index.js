import express from "express";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import OpenAI, { toFile } from "openai";
import { ProxyAgent, setGlobalDispatcher } from "undici";
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
  seedream: "seedance",
};
const supportedRatios = new Set(["16:9", "4:3", "1:1", "3:4", "9:16"]);
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
  return envNumber(["OPENAI_TEXT_TIMEOUT_MS", "OPENAI_REQUEST_TIMEOUT_MS"], 45000, {
    min: 10000,
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
  const prefix = engine === "seedance" ? "SEEDANCE" : "IMAGE2";
  const fallback = engine === "seedance" ? 150000 : 180000;
  return envNumber([`${prefix}_JOB_TIMEOUT_MS`, "IMAGE_JOB_TIMEOUT_MS"], fallback, {
    min: 30000,
    max: 600000,
  });
}

function generationConcurrency(engine, totalCount) {
  const prefix = engine === "seedance" ? "SEEDANCE" : "IMAGE2";
  const fallback = engine === "seedance" ? 1 : 2;
  const limit = envNumber([`${prefix}_CONCURRENCY`, "GENERATION_CONCURRENCY"], fallback, {
    min: 1,
    max: 4,
  });
  return Math.max(1, Math.min(totalCount, limit));
}

function requestOptions(timeoutMs) {
  return { timeout: timeoutMs, maxRetries: 0 };
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
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

configureProxy();

app.use(express.json({ limit: "35mb" }));

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

  const label = engineLabels[engine] || engine;
  throw new Error(`${label} 还没有完成后端 adapter。当前只支持 Image2 和 SeeDance。`);
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

function normalizeRatios(ratios, count) {
  const requestedRatios = Array.isArray(ratios) ? ratios : [];
  const normalized = [];
  let remaining = count;

  for (const item of requestedRatios) {
    const ratio = String(item?.ratio || "").trim();
    if (!supportedRatios.has(ratio) || remaining <= 0) continue;
    const itemCount = normalizeCount(item?.count);
    const take = Math.min(itemCount, remaining);
    if (take > 0) {
      normalized.push({ ratio, count: take });
      remaining -= take;
    }
  }

  return normalized.length > 0 ? normalized : [{ ratio: "3:4", count }];
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
  };
  return sizes[ratio] || "1152x1536";
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

function buildImage2Prompt(plan, context) {
  return `${buildSourceInstruction(context)}
Target aspect ratio: ${context.ratio}.

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

async function generateImage2Cover(openai, { sourceMode, sourceImages, imageDescription, plan, ratio }) {
  const prompt = buildImage2Prompt(plan, { sourceMode, imageDescription, ratio });
  const size = image2SizeForRatio(ratio);
  const timeoutMs = imageJobTimeoutMs("image2");
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
  return String(prompt || "")
    .replace(/\s+/gu, " ")
    .slice(0, 2600);
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
  return compactDreaminaPrompt(`${buildSourceInstruction(context)}
Target aspect ratio: ${context.ratio}.

${plan.prompt}`);
}

async function generateSeedanceCover({ sourceMode, sourceImages, imageDescription, plan, ratio }) {
  const tempDir = await mkdtemp(join(tmpdir(), "lipa-dreamina-"));
  const downloadDir = join(tempDir, "downloads");
  await mkdir(downloadDir, { recursive: true });

  try {
    const pollSeconds = Math.max(
      10,
      Math.min(180, Number(process.env.SEEDANCE_POLL_SECONDS || process.env.DREAMINA_POLL_SECONDS || 75)),
    );
    const prompt = buildSeedancePrompt(plan, { sourceMode, imageDescription, ratio });
    const args = [sourceImages.length > 0 ? "image2image" : "text2image"];

    if (sourceImages.length > 0) {
      const inputPaths = await writeTempImages(sourceImages, tempDir);
      for (const inputPath of inputPaths) {
        args.push("--images", inputPath);
      }
    }

    args.push(
      "--prompt",
      prompt,
      "--ratio",
      ratio || process.env.SEEDANCE_RATIO || process.env.DREAMINA_RATIO || "3:4",
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

async function generateByEngine({ openai, engine, sourceMode, sourceImages, imageDescription, plan, ratio }) {
  const timeoutMs = imageJobTimeoutMs(engine);
  if (engine === "image2") {
    if (!openai) throw new Error("OpenAI client is not configured.");
    return withTimeout(
      generateImage2Cover(openai, { sourceMode, sourceImages, imageDescription, plan, ratio }),
      timeoutMs,
      `${engineLabels[engine]} 单张生成`,
    );
  }
  if (engine === "seedance") {
    return withTimeout(
      generateSeedanceCover({ sourceMode, sourceImages, imageDescription, plan, ratio }),
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

app.post("/api/generate", async (req, res) => {
  // ─── Credits check (before starting SSE) ───
  const { isDbAvailable } = await import("./db.js");
  const localFreeMode = isLocalFreeMode(req);
  if (isDbAvailable() && !localFreeMode) {
    if (!req.user) {
      return res.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
    }
    const requestedCount = Number(req.body?.count || req.body?.ratios?.reduce?.((s, r) => s + (r.count || 0), 0) || 4);
    const creditsCost = getCreditsCost(Math.min(10, Math.max(1, requestedCount)));
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

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

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
    elementImages = [],
    ratios: requestedRatios = [],
    stylePreferences = null,
  } = req.body || {};
  const sourceMode = normalizeSourceMode(requestedSourceMode);
  const count = normalizeCount(requestedCount);
  const engine = resolveEngine(normalizeEngine(requestedEngine));
  const ratioGroups = normalizeRatios(requestedRatios, count);
  const totalCount = ratioGroups.reduce((sum, item) => sum + item.count, 0);

  try {
    assertEngineAvailable(engine);
    validateGenerateInput({ sourceMode, image, elementImages, imageDescription, title });
    const sourceImages = getSourceImages({ sourceMode, image, elementImages });
    const analysisImage = sourceImages[0] || "";
    const planKeywords = [keywords, imageDescription ? `画面描述：${imageDescription}` : ""].filter(Boolean).join("\n");

    const openai = process.env.OPENAI_API_KEY
      ? new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: envNumber("OPENAI_REQUEST_TIMEOUT_MS", 120000, { min: 15000, max: 600000 }),
          maxRetries: 0,
        })
      : null;
    const fallbackAnalysisWithColor = {
      ...fallbackAnalysis,
      dominant_color: stylePreferences?.imageDominantColor || fallbackAnalysis.dominant_color,
    };

    writeSse(res, {
      status: "analyzing",
      progress: 0,
      total: totalCount,
      engine,
      message: `正在使用 ${engineLabels[engine]} 分析素材...`,
    });
    let analysis = fallbackAnalysisWithColor;
    if (openai && analysisImage) {
      try {
        analysis = await analyzeImage(openai, analysisImage, { title, subtitle, keywords: planKeywords });
      } catch (error) {
        console.warn("[Generate] Image analysis fallback:", error.message);
        writeSse(res, {
          status: "analyzing",
          progress: 0,
          total: totalCount,
          engine,
          message: "素材分析超时，已使用本地色彩信息继续生成...",
        });
      }
    }
    writeSse(res, { status: "planning", progress: 0, total: totalCount, engine, analysis, message: "正在生成方案..." });

    let plans = fallbackPlans({ analysis, title, subtitle, count: totalCount, keywords: planKeywords });
    if (openai) {
      try {
        plans = await planCovers(openai, { analysis, title, subtitle, keywords: planKeywords, count: totalCount, stylePreferences });
      } catch (error) {
        console.warn("[Generate] Cover planning fallback:", error.message);
        writeSse(res, {
          status: "planning",
          progress: 0,
          total: totalCount,
          engine,
          message: "方案生成超时，已使用内置封面方案继续生成...",
        });
      }
    }
    const jobs = expandRatioJobs(ratioGroups, plans);
    writeSse(res, { status: "planned", progress: 0, total: totalCount, engine, plans, message: "方案已生成" });

    let completed = 0;
    const concurrency = generationConcurrency(engine, totalCount);
    writeSse(res, {
      status: "generating",
      progress: 0,
      total: totalCount,
      engine,
      message: concurrency > 1 ? `开始生成，当前 ${concurrency} 张并行...` : "开始生成封面...",
    });
    const results = await mapWithConcurrency(jobs, concurrency, async ({ plan, ratio }, jobIndex) => {
      writeSse(res, {
        status: "generating",
        progress: completed,
        total: totalCount,
        engine,
        message: `开始生成封面 ${jobIndex + 1}/${totalCount}`,
      });
      try {
        const imageUrl = await generateByEngine({
          openai,
          engine,
          sourceMode,
          sourceImages,
          imageDescription,
          plan,
          ratio,
        });
        const result = {
          id: plan.id,
          combination: plan.combination,
          label: plan.label,
          description: plan.description,
          image_url: imageUrl,
          engine,
          ratio,
        };
        completed += 1;
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
        const result = {
          id: plan.id,
          combination: plan.combination,
          label: plan.label,
          description: plan.description,
          error: friendlyProviderError(error, engine),
          engine,
          ratio,
        };
        writeSse(res, {
          status: "generating",
          progress: completed,
          total: totalCount,
          engine,
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

app.listen(port, "127.0.0.1", () => {
  console.log(`LIPA API server running at http://127.0.0.1:${port}`);
});