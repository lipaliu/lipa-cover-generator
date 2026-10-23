import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const DEFAULT_TITLE_MASTER_API_URL = "https://changdao-title-h5.vercel.app/api/generate";

const normalizeText = (value) => String(value || "").replace(/\s+/gu, " ").trim();

export function normalizeTitlePlans(payload) {
  const plans = Array.isArray(payload?.plans) ? payload.plans : [];
  if (plans.length === 0) throw new Error("标题大师没有返回可用方案");

  return plans.slice(0, 4).map((candidate, index) => {
    const plan = {
      direction: normalizeText(candidate?.direction) || `方案 ${index + 1}`,
      xiaohongshu: normalizeText(candidate?.xiaohongshu),
      videoTitle: normalizeText(candidate?.videoTitle),
      videoTitleAlt: normalizeText(candidate?.videoTitleAlt || candidate?.videoTitle),
      coverMain: normalizeText(candidate?.coverMain),
      coverSub: normalizeText(candidate?.coverSub),
    };
    if (!plan.xiaohongshu || !plan.videoTitle || !plan.coverMain) {
      throw new Error("标题大师返回的方案字段不完整");
    }
    return plan;
  });
}

export async function requestTitlePlans({ text, angle = "", fetchImpl = fetch, waitImpl = delay }) {
  const sourceText = normalizeText(text);
  const creativeAngle = normalizeText(angle);
  if (sourceText.length < 10) throw new Error("请至少输入 10 个字的全文");
  if (sourceText.length > 20000) throw new Error("全文不能超过 20000 个字");
  if (creativeAngle.length > 2000) throw new Error("额外要求不能超过 2000 个字");

  const apiUrl = process.env.TITLE_MASTER_API_URL || DEFAULT_TITLE_MASTER_API_URL;
  const timeoutMs = Math.max(10000, Math.min(120000, Number(process.env.TITLE_MASTER_TIMEOUT_MS) || 100000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const serviceToken = process.env.TITLE_MASTER_SERVICE_TOKEN;
    const target = new URL(apiUrl);
    if (target.protocol !== "https:" || target.username || target.password) throw new Error("标题服务必须使用可信 HTTPS 地址");
    const requestId = randomUUID();
    const headers = {
      "Content-Type": "application/json",
      ...(serviceToken ? { Authorization: `Bearer ${serviceToken}`, "Idempotency-Key": requestId } : {}),
    };
    let response = await fetchImpl(apiUrl, {
      method: "POST",
      signal: controller.signal,
      redirect: "error",
      headers,
      // 不在巴咔巴咔里重写标题逻辑：直接交给标题大师现有的默认豆包模型。
      body: JSON.stringify({ text: sourceText, angle: creativeAngle, model: "doubao" }),
    });
    let data = await response.json().catch(() => ({}));
    // The title service now runs durable jobs. Poll only the configured endpoint,
    // never a response-provided URL, so the service secret cannot be redirected.
    while (response.status === 202) {
      if (!serviceToken || data.requestId !== requestId) throw new Error("标题服务返回无效任务标识");
      await waitImpl(1000, undefined, { signal: controller.signal });
      const pollUrl = new URL(apiUrl);
      pollUrl.searchParams.set("requestId", requestId);
      response = await fetchImpl(pollUrl.toString(), { method: "GET", headers, redirect: "error", signal: controller.signal });
      data = await response.json().catch(() => ({}));
    }
    if (!response.ok) {
      const upstreamMessage = String(data?.error || `标题大师返回 ${response.status}`);
      if (/overdue balance|insufficient balance|余额不足|欠费/iu.test(upstreamMessage)) {
        throw new Error("标题大师的豆包账户余额不足，请充值后再试；没有原文仍可直接进入巴咔巴咔生图。");
      }
      throw new Error(upstreamMessage);
    }
    return {
      plans: normalizeTitlePlans(data),
      provider: data?.provider || "volcengine",
      model: data?.model || "doubao",
      source: apiUrl,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("标题大师响应超时，请稍后重试");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
