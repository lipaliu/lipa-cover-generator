/**
 * 定价配置：积分包 + 会员套餐。改价只改这里。
 *
 * 定价依据：Image2 单张 API 成本约 ¥1.37；消耗规则见 middleware.getCreditsCost
 * （1张=3分、2张=5、3-4张=8、5-7张=12、8-10张=15，之后每10张+15）。
 * 定价 1 积分 = ¥3 → 10 张封面 = 15 积分 = ¥45（成本 ¥13.7），毛利健康。
 */

export const CREDIT_UNIT_YUAN = 3; // 1 积分标准价（元），充值包按此打折

// 积分包（一次性购买，永久有效）
export const CREDIT_PACKS = [
  { id: "pack_trial", name: "体验包", credits: 15, amountFen: 4500, note: "约 10 张封面" },
  { id: "pack_basic", name: "基础包", credits: 70, amountFen: 19800, note: "约 46 张 · 省 ¥12" },
  { id: "pack_pro", name: "专业包", credits: 190, amountFen: 49800, note: "约 126 张 · 省 ¥72" },
  { id: "pack_studio", name: "工作室包", credits: 430, amountFen: 99800, note: "约 286 张 · 省 ¥292" },
];

// 会员套餐（订阅：免水印 + 赠送积分 + 充值折扣）
export const SUBSCRIPTIONS = [
  {
    id: "sub_monthly",
    name: "月卡会员",
    plan: "monthly",
    months: 1,
    amountFen: 6800,
    credits: 40, // 开通/续费即到账
    perks: ["免水印", "每月赠 40 积分（约 26 张）", "充值 9 折", "优先生成队列"],
  },
  {
    id: "sub_yearly",
    name: "年卡会员",
    plan: "yearly",
    months: 12,
    amountFen: 68800,
    credits: 500,
    perks: ["免水印", "一次赠 500 积分（约 333 张）", "充值 8.5 折", "优先生成队列", "相当于月付 ¥57"],
  },
];

export const SIGNUP_BONUS_CREDITS = 12; // 注册赠送 = 正好 5 张（5-7 张档位 12 积分）

export function findProduct(productId) {
  return (
    CREDIT_PACKS.find((p) => p.id === productId) ||
    SUBSCRIPTIONS.find((s) => s.id === productId) ||
    null
  );
}

export function yuan(amountFen) {
  return (amountFen / 100).toFixed(amountFen % 100 === 0 ? 0 : 2);
}

// 会员充值折扣（充值包按会员身份打折）
export function discountForPlan(plan) {
  if (plan === "yearly") return 0.85;
  if (plan === "monthly") return 0.9;
  return 1;
}
