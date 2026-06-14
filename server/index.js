import express from "express";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import OpenAI, { toFile } from "openai";
import { buildPlanUserPrompt, fallbackPlans, skillPrompt } from "./prompts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execFileAsync = promisify(execFile);
const app = express();
const port = Number(process.env.PORT || 8787);
const serveDist = process.argv.includes("--serve-dist");
const engineLabels = {
  auto: "自动选择",
  wanxiang: "通义万相（阿里）",
  jimeng: "即梦（字节跳动）",
  openai: "GPT-Image-2（OpenAI）",
  cogview: "CogView-4（智谱 AI）",
  wenxin: "文心一格（百度）",
};
const fallbackAnalysis = {
  dominant_color: "#1A1A2E",
  brightness: "medium",
  saturation: "medium",
  temperature: "neutral",
  subject_position: "center",
  empty_space: "upper area and side margins",
  background_complexity: "medium",
};

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

app.use(express.json({ limit: "35mb" }));

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

function normalizeCount(value) {
  const count = Number(value);
  return [1, 2, 4, 10].includes(count) ? count : 4;
}

function normalizeEngine(value) {
  return Object.prototype.hasOwnProperty.call(engineLabels, value) ? value : "auto";
}

function resolveEngine(engine) {
  if (engine !== "auto") return engine;
  if (process.env.DASHSCOPE_API_KEY) return "wanxiang";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "openai";
}

function assertEngineAvailable(engine) {
  if (engine === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY. Add it to .env.local, then restart the server.");
    }
    return;
  }

  if (engine === "wanxiang") {
    if (!process.env.DASHSCOPE_API_KEY) {
      throw new Error("Missing DASHSCOPE_API_KEY. Add it to .env.local, then restart the server.");
    }
    return;
  }

  if (engine === "jimeng") {
    return;
  }

  const label = engineLabels[engine] || engine;
  throw new Error(
    `${label} 的引擎选择已加入界面，但还没有完成该平台的 API adapter。请先使用 GPT-Image-2、通义万相或即梦。`,
  );
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
  });

  return parseJsonObject(completion.choices?.[0]?.message?.content, fallbackAnalysis);
}

async function planCovers(openai, { analysis, title, subtitle, keywords, count }) {
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
        content: buildPlanUserPrompt({ analysis, title, subtitle, keywords, count }),
      },
    ],
  });

  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content, { plans: [] });
  if (!Array.isArray(parsed.plans) || parsed.plans.length === 0) {
    return fallbackPlans({ analysis, title, subtitle, count });
  }
  return parsed.plans.slice(0, count).map((plan, index) => ({
    id: index + 1,
    combination: String(plan.combination || `方案${index + 1}`),
    label: String(plan.label || plan.description || `方案 ${index + 1}`),
    description: String(plan.description || plan.label || ""),
    prompt: String(plan.prompt || ""),
  }));
}

async function generateCover(openai, imageDataUrl, plan) {
  const { base64, mimeType } = splitDataUrl(imageDataUrl);
  const imageFile = await toFile(Buffer.from(base64, "base64"), "base-image.png", {
    type: mimeType || "image/png",
  });

  const response = await openai.images.edit({
    model: "gpt-image-2",
    image: imageFile,
    prompt: plan.prompt,
    size: "1024x1536",
  });

  const item = response.data?.[0];
  if (item?.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }

  if (item?.url) {
    const imageResponse = await fetch(item.url);
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }

  throw new Error("Image API returned no image data.");
}

function compactDashScopePrompt(prompt) {
  return String(prompt || "")
    .replace(/\s+/gu, " ")
    .slice(0, 1800);
}

function extractDashScopeImage(payload) {
  const content = payload?.output?.choices?.flatMap((choice) => choice?.message?.content || []) || [];
  const item = content.find((entry) => entry?.image || entry?.image_url || entry?.url);
  return (
    item?.image ||
    item?.image_url ||
    item?.url ||
    payload?.output?.results?.[0]?.url ||
    payload?.output?.image_url ||
    payload?.output?.url ||
    ""
  );
}

async function imageReferenceToDataUrl(imageReference, fallbackMimeType = "image/png") {
  if (typeof imageReference !== "string" || !imageReference) return "";
  if (imageReference.startsWith("data:")) return imageReference;

  const imageResponse = await fetch(imageReference);
  if (!imageResponse.ok) {
    throw new Error(`Image download failed with HTTP ${imageResponse.status}.`);
  }

  const mimeType = imageResponse.headers.get("content-type") || fallbackMimeType;
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function generateWanxiangCover(imageDataUrl, plan) {
  const endpoint =
    process.env.DASHSCOPE_ENDPOINT ||
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.DASHSCOPE_IMAGE_MODEL || "wan2.6-image",
      input: {
        messages: [
          {
            role: "user",
            content: [
              {
                text: compactDashScopePrompt(plan.prompt),
              },
              {
                image: imageDataUrl,
              },
            ],
          },
        ],
      },
      parameters: {
        prompt_extend: true,
        watermark: false,
        n: 1,
        enable_interleave: false,
        size: process.env.DASHSCOPE_IMAGE_SIZE || "960*1280",
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code) {
    throw new Error(payload.message || `DashScope request failed with HTTP ${response.status}.`);
  }

  const imageReference = extractDashScopeImage(payload);
  if (!imageReference) {
    throw new Error("DashScope returned no image URL.");
  }

  return imageReferenceToDataUrl(imageReference);
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
  const cliDir = process.env.DREAMINA_CLI_PATH ? dirname(process.env.DREAMINA_CLI_PATH) : "";
  const pathParts = [cliDir, join(homedir(), ".local/bin"), process.env.PATH || ""].filter(Boolean);
  return {
    ...process.env,
    HOME: process.env.DREAMINA_HOME || process.env.HOME || homedir(),
    PATH: pathParts.join(":"),
  };
}

function dreaminaExecutable() {
  return process.env.DREAMINA_CLI_PATH || "dreamina";
}

function normalizeCliError(error) {
  const output = [error?.stdout, error?.stderr, error?.message].filter(Boolean).join("\n").trim();
  if (error?.code === "ENOENT" || /executable file not found|command not found|spawn dreamina ENOENT/iu.test(output)) {
    return new Error(
      "未找到即梦 CLI。请先运行官方安装命令，或在 .env.local 配置 DREAMINA_CLI_PATH=/完整路径/dreamina，然后重启服务。",
    );
  }

  if (/未检测到有效登录态|请先执行 dreamina login|login/iu.test(output)) {
    return new Error("即梦 CLI 未登录。请先在终端运行 dreamina login，完成授权后重启或重新生成。");
  }

  return new Error(output || "即梦 CLI 调用失败。");
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

async function writeTempImage(dataUrl, directory) {
  const { base64, mimeType } = splitDataUrl(dataUrl);
  const filePath = join(directory, `base-image${imageExtensionForMime(mimeType)}`);
  await writeFile(filePath, Buffer.from(base64, "base64"));
  return filePath;
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
  return imageReferenceToDataUrl(reference);
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

  throw new Error(`即梦任务已提交但仍在生成中，submit_id=${submitId}。稍后可用 dreamina query_result 查询。`);
}

async function generateJimengCover(imageDataUrl, plan) {
  const tempDir = await mkdtemp(join(tmpdir(), "lipa-dreamina-"));
  const downloadDir = join(tempDir, "downloads");
  await mkdir(downloadDir, { recursive: true });

  try {
    const inputPath = await writeTempImage(imageDataUrl, tempDir);
    const pollSeconds = Math.max(10, Math.min(180, Number(process.env.DREAMINA_POLL_SECONDS || 75)));
    const args = [
      "image2image",
      "--images",
      inputPath,
      "--prompt",
      compactDreaminaPrompt(plan.prompt),
      "--ratio",
      process.env.DREAMINA_RATIO || "3:4",
      "--resolution_type",
      process.env.DREAMINA_RESOLUTION_TYPE || "2k",
      "--poll",
      String(Math.min(60, pollSeconds)),
    ];

    if (process.env.DREAMINA_MODEL_VERSION) {
      args.push("--model_version", process.env.DREAMINA_MODEL_VERSION);
    }

    const submitOutput = await runDreamina(args, { timeout: (pollSeconds + 45) * 1000 });
    const immediateImage = await dreaminaOutputToDataUrl(submitOutput, downloadDir);
    if (immediateImage) return immediateImage;

    const submitId = extractSubmitId(submitOutput);
    if (!submitId) {
      throw new Error(`即梦没有返回 submit_id 或图片结果：${submitOutput.slice(0, 1000)}`);
    }

    return queryDreaminaResult(submitId, downloadDir, pollSeconds);
  } finally {
    if (process.env.KEEP_DREAMINA_TEMP !== "1") {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function generateByEngine({ openai, engine, image, plan }) {
  if (engine === "openai") {
    if (!openai) throw new Error("OpenAI client is not configured.");
    return generateCover(openai, image, plan);
  }
  if (engine === "wanxiang") {
    return generateWanxiangCover(image, plan);
  }
  if (engine === "jimeng") {
    return generateJimengCover(image, plan);
  }
  throw new Error(`${engineLabels[engine] || engine} is not implemented.`);
}

app.post("/api/generate", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const startedAt = Date.now();
  const { image, title, subtitle = "", keywords = "", engine: requestedEngine = "auto", count: requestedCount } = req.body || {};
  const count = normalizeCount(requestedCount);
  const engine = resolveEngine(normalizeEngine(requestedEngine));

  try {
    assertEngineAvailable(engine);
    if (!image || !title) {
      throw new Error("Image and title are required.");
    }

    const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

    writeSse(res, {
      status: "analyzing",
      progress: 0,
      total: count,
      engine,
      message: `正在使用 ${engineLabels[engine]} 分析底图...`,
    });
    const analysis = openai ? await analyzeImage(openai, image, { title, subtitle, keywords }) : fallbackAnalysis;
    writeSse(res, { status: "planning", progress: 0, total: count, engine, analysis, message: "正在生成方案..." });

    const plans = openai
      ? await planCovers(openai, { analysis, title, subtitle, keywords, count })
      : fallbackPlans({ analysis, title, subtitle, count });
    writeSse(res, { status: "planned", progress: 0, total: count, engine, plans, message: "方案已生成" });

    let completed = 0;
    const results = [];
    await Promise.all(
      plans.map(async (plan) => {
        try {
          const imageUrl = await generateByEngine({ openai, engine, image, plan });
          const result = {
            id: plan.id,
            combination: plan.combination,
            label: plan.label,
            description: plan.description,
            image_url: imageUrl,
            engine,
          };
          results.push(result);
          completed += 1;
          writeSse(res, {
            status: "generating",
            progress: completed,
            total: count,
            engine,
            result,
            message: `正在生成封面 ${completed}/${count}`,
          });
        } catch (error) {
          completed += 1;
          const result = {
            id: plan.id,
            combination: plan.combination,
            label: plan.label,
            description: plan.description,
            error: error instanceof Error ? error.message : "生成失败",
            engine,
          };
          results.push(result);
          writeSse(res, {
            status: "generating",
            progress: completed,
            total: count,
            engine,
            result,
            message: `封面 ${plan.id} 生成失败`,
          });
        }
      }),
    );

    results.sort((a, b) => a.id - b.id);
    writeSse(res, {
      status: "done",
      progress: completed,
      total: count,
      engine,
      results,
      elapsed_ms: Date.now() - startedAt,
      message: "生成完成",
    });
    res.end();
  } catch (error) {
    writeSse(res, {
      status: "error",
      progress: 0,
      total: count,
      engine,
      message: error instanceof Error ? error.message : "生成失败",
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
