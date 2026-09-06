/**
 * 商业定价的唯一数据源。
 *
 * 积分面值：100 积分 = ¥1；充值包通过多送积分形成折扣。
 * 生图成本随引擎线性增长，因此每张按引擎固定计费；批量优惠只放在充值包里，
 * 避免“API 成本按张增长、网站收入却按批次打对折”的亏损结构。
 */

export const CREDIT_UNIT_YUAN = 0.01;

export const CREDIT_MODEL = Object.freeze({
  version: "2026-09-v1",
  creditUnitYuan: CREDIT_UNIT_YUAN,
  perImage: Object.freeze({
    image2: 600,
    seedream: 200,
    seedance: 300,
  }),
  // Image2 会把每张参考图按高保真输入计费；首张已包含在基础价内。
  image2ExtraReference: 120,
  // 防止反复刷标题接口；只在成功返回标题方案后实际消耗，失败自动退回。
  titleGeneration: 20,
});

// 积分包（一次性购买，永久有效）
export const CREDIT_PACKS = [
  { id: "pack_trial", name: "体验包", credits: 3000, amountFen: 2990, note: "约 5 张 Image2 / 15 张 Seedream" },
  { id: "pack_basic", name: "创作者包", credits: 10000, amountFen: 7900, note: "约 16 张 Image2 / 50 张 Seedream" },
  { id: "pack_pro", name: "专业包", credits: 30000, amountFen: 19900, note: "约 50 张 Image2 / 150 张 Seedream" },
  { id: "pack_studio", name: "工作室包", credits: 80000, amountFen: 49900, note: "约 133 张 Image2 / 400 张 Seedream" },
];

// 会员套餐（订阅：免水印 + 赠送积分 + 充值折扣）
export const SUBSCRIPTIONS = [
  {
    id: "sub_monthly",
    name: "月卡会员",
    plan: "monthly",
    months: 1,
    amountFen: 6800,
    credits: 10000,
    perks: ["免水印", "每月 10000 积分（约 16 张 Image2）", "充值 9 折", "优先生成队列"],
  },
  {
    id: "sub_yearly",
    name: "年卡会员",
    plan: "yearly",
    months: 12,
    amountFen: 68800,
    credits: 100000,
    perks: ["免水印", "一次到账 100000 积分（约 166 张 Image2）", "充值 8.5 折", "优先生成队列", "相当于月付 ¥57"],
  },
];

// 新用户可完整体验默认的 4 张 Image2；手机号唯一约束降低批量薅赠金风险。
export const SIGNUP_BONUS_CREDITS = 2500;

function normalizeEngine(engine) {
  const value = String(engine || "image2").toLowerCase();
  if (["seedream", "ark", "doubao", "doubao-seedream", "volcengine"].includes(value)) return "seedream";
  if (["seedance", "jimeng", "dreamina"].includes(value)) return "seedance";
  return "image2";
}

/** 计算一批生成任务需要预扣的积分。 */
export function getCreditsCost(imageCount, { slotEngines = [], engine = "image2", sourceImageCount = 0 } = {}) {
  const count = Math.max(1, Math.floor(Number(imageCount) || 1));
  const fallbackEngine = normalizeEngine(engine);
  const references = Math.max(0, Math.floor(Number(sourceImageCount) || 0));
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const selected = normalizeEngine(slotEngines[index] || fallbackEngine);
    total += CREDIT_MODEL.perImage[selected] || CREDIT_MODEL.perImage.image2;
    if (selected === "image2" && references > 1) {
      total += (references - 1) * CREDIT_MODEL.image2ExtraReference;
    }
  }
  return total;
}

export function publicCreditModel() {
  return {
    version: CREDIT_MODEL.version,
    creditUnitYuan: CREDIT_MODEL.creditUnitYuan,
    perImage: { ...CREDIT_MODEL.perImage },
    image2ExtraReference: CREDIT_MODEL.image2ExtraReference,
    titleGeneration: CREDIT_MODEL.titleGeneration,
  };
}

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
