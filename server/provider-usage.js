/** Provider-cost ledger. Values are stored in micro-yuan to avoid floating-point money. */

import { isDbAvailable, query } from "./db.js";

const usdCnyRate = () => {
  const value = Number(process.env.USD_CNY_RATE || 7.3);
  return Number.isFinite(value) && value > 0 ? value : 7.3;
};

function fallbackOpenAICostUsd(quality, size, inputImageCount) {
  const square = String(size || "").split("x").filter(Boolean).length === 2 &&
    String(size).split("x")[0] === String(size).split("x")[1];
  const selectedQuality = ["low", "medium", "high"].includes(quality) ? quality : "high";
  const outputUsd = square
    ? { low: 0.006, medium: 0.053, high: 0.211 }[selectedQuality]
    : { low: 0.005, medium: 0.041, high: 0.165 }[selectedQuality];
  // GPT-Image-2 输入图按高保真计费；响应没带 usage 时每张预留 $0.05，另留少量文本输入。
  return outputUsd + Math.max(0, Number(inputImageCount) || 0) * 0.05 + 0.002;
}

export function estimateOpenAIImageCost(response, { requestedQuality, requestedSize, inputImageCount = 0 } = {}) {
  const usage = response?.usage || {};
  const details = usage.input_tokens_details || {};
  const textTokens = Number(details.text_tokens || 0);
  const imageTokens = Number(details.image_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  if (textTokens || imageTokens || outputTokens) {
    // 官方标准价：文本输入 $5/M、图片输入 $8/M、图片输出 $30/M。
    const microUsd = textTokens * 5 + imageTokens * 8 + outputTokens * 30;
    return {
      inputTextTokens: textTokens,
      inputImageTokens: imageTokens,
      outputTokens,
      estimatedCostMicrouan: Math.round(microUsd * usdCnyRate()),
      costBasis: "api_usage",
    };
  }

  const quality = response?.quality || requestedQuality || "auto";
  const size = response?.size || requestedSize || "";
  return {
    inputTextTokens: 0,
    inputImageTokens: 0,
    outputTokens: 0,
    estimatedCostMicrouan: Math.round(fallbackOpenAICostUsd(quality, size, inputImageCount) * usdCnyRate() * 1_000_000),
    costBasis: quality === "auto" ? "estimate_auto_as_high" : "pricing_estimate",
  };
}

export async function recordProviderUsage({
  userId = null,
  provider,
  model,
  operation,
  size = "",
  quality = "",
  inputImageCount = 0,
  response = null,
}) {
  if (!isDbAvailable()) return;
  try {
    let cost;
    if (provider === "openai") {
      cost = estimateOpenAIImageCost(response, {
        requestedQuality: quality,
        requestedSize: size,
        inputImageCount,
      });
      quality = response?.quality || quality;
      size = response?.size || size;
    } else {
      const seedreamYuan = Number(process.env.SEEDREAM_COST_YUAN || 0.22);
      cost = {
        inputTextTokens: 0,
        inputImageTokens: 0,
        outputTokens: 0,
        estimatedCostMicrouan: Math.round(seedreamYuan * 1_000_000),
        costBasis: "provider_per_image",
      };
    }
    await query(
      `INSERT INTO provider_usage
        (user_id, provider, model, operation, size, quality, input_image_count,
         input_text_tokens, input_image_tokens, output_tokens, estimated_cost_microuan, cost_basis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        String(provider || ""),
        String(model || ""),
        String(operation || "generate"),
        String(size || ""),
        String(quality || ""),
        Number(inputImageCount) || 0,
        cost.inputTextTokens,
        cost.inputImageTokens,
        cost.outputTokens,
        cost.estimatedCostMicrouan,
        cost.costBasis,
      ],
    );
  } catch (error) {
    // 成本记账失败绝不能影响用户拿到已经生成成功的图片。
    console.warn("[ProviderUsage] record failed:", error?.message || error);
  }
}

export async function getProviderUsageSummary(days = 30) {
  if (!isDbAvailable()) return [];
  const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)));
  const [rows] = await query(
    `SELECT provider, model, COUNT(*) AS calls,
            SUM(estimated_cost_microuan) AS cost_microuan,
            SUM(input_text_tokens) AS input_text_tokens,
            SUM(input_image_tokens) AS input_image_tokens,
            SUM(output_tokens) AS output_tokens
       FROM provider_usage
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
      GROUP BY provider, model
      ORDER BY cost_microuan DESC`,
  );
  return rows;
}
