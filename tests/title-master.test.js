import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTitlePlans, requestTitlePlans } from "../server/title-master.js";

const rawPlans = Array.from({ length: 4 }, (_, index) => ({
  direction: `角度 ${index + 1}`,
  xiaohongshu: `小红书标题 ${index + 1}`,
  videoTitle: `抖音标题 ${index + 1}`,
  videoTitleAlt: `抖音备选 ${index + 1}`,
  coverMain: `封面字${index + 1}`,
  coverSub: `副标题${index + 1}`,
}));

test("normalizes title-master plans without changing their content", () => {
  assert.deepEqual(normalizeTitlePlans({ plans: rawPlans }), rawPlans);
});

test("proxies the full text to the title master's existing Doubao route", async () => {
  let request;
  const plans = await requestTitlePlans({
    text: "这是一段足够长的完整口播稿，用来验证标题大师连接层。",
    angle: "真实，不要标题党",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ plans: rawPlans, provider: "volcengine", model: "doubao-seed-2-1-pro-260628" }) };
    },
  });

  assert.equal(request.body.model, "doubao");
  assert.equal(request.body.angle, "真实，不要标题党");
  assert.match(request.url, /changdao-title-h5\.vercel\.app\/api\/generate/u);
  assert.equal(plans.plans.length, 4);
  assert.equal(plans.model, "doubao-seed-2-1-pro-260628");
});

test("rejects short source text before calling the title service", async () => {
  await assert.rejects(() => requestTitlePlans({ text: "太短", fetchImpl: async () => { throw new Error("should not run"); } }), /至少输入 10 个字/u);
});
