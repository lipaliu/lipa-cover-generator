/**
 * API client module for auth and credits.
 */

const API_BASE = "";

// ─── Token management ───

export function getToken(): string | null {
  return localStorage.getItem("koc_token");
}

export function setToken(token: string): void {
  localStorage.setItem("koc_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("koc_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function generateTitlePlans(
  text: string,
  angle = "",
): Promise<import("./types").TitlePlan[]> {
  const res = await fetch(`${API_BASE}/api/title-plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text, angle }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "标题生成失败，请稍后重试") as Error & {
      status?: number;
      required?: number;
      current?: number;
    };
    error.status = res.status;
    error.required = Number(data.required || 0);
    error.current = Number(data.current || 0);
    throw error;
  }
  if (!Array.isArray(data.plans)) throw new Error("标题大师没有返回可用方案");
  return data.plans;
}

// ─── Auth API ───

export async function sendCode(phone: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  return res.json();
}

export interface UserInfo {
  id: number;
  phone: string;
  nickname: string;
  avatar_url: string;
  role: "user" | "admin";
  credits: number;
  subscription_plan: string;
  subscription_expires_at: string | null;
  created_at: string;
}

export async function login(
  phone: string,
  code: string,
  acceptedTerms: boolean,
): Promise<{ ok: boolean; token?: string; user?: UserInfo; error?: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code, acceptedTerms }),
  });
  const data = await res.json();
  if (data.ok && data.token) {
    setToken(data.token);
  }
  return data;
}

export async function fetchMe(): Promise<{ user: UserInfo | null; dbAvailable?: boolean }> {
  const token = getToken();
  if (!token) return { user: null };

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: authHeaders(),
    });
    if (res.status === 401) {
      clearToken();
      return { user: null };
    }
    return res.json();
  } catch {
    return { user: null };
  }
}

export function logout(): void {
  clearToken();
  // Fire and forget
  fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  }).catch(() => {});
}

// ─── Credits API ───

export interface CreditsBalance {
  credits: number;
  plan: string;
  expires_at: string | null;
}

export async function fetchBalance(): Promise<CreditsBalance> {
  const res = await fetch(`${API_BASE}/api/credits/balance`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch balance");
  return res.json();
}

export interface CreditTransaction {
  id: number;
  amount: number;
  type: string;
  description: string;
  reference_id: string;
  balance_after: number;
  created_at: string;
}

export async function fetchCreditHistory(
  limit = 50,
  offset = 0
): Promise<{ transactions: CreditTransaction[] }> {
  const res = await fetch(
    `${API_BASE}/api/credits/history?limit=${limit}&offset=${offset}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error("Failed to fetch history");
  return res.json();
}

// ─── Billing API ───

export interface BillingProduct {
  id: string;
  name: string;
  credits: number;
  amountFen: number;
  originalAmountFen: number;
  note?: string;
  plan?: string;
  months?: number;
  perks?: string[];
}

export interface CreditModel {
  version: string;
  creditUnitYuan: number;
  perImage: Record<"image2" | "seedream" | "seedance", number>;
  image2ExtraReference: number;
  titleGeneration: number;
}

export async function fetchBillingProducts(): Promise<{
  packs: BillingProduct[];
  subscriptions: BillingProduct[];
  discount: number;
  paymentReady: boolean;
  creditModel: CreditModel;
}> {
  const res = await fetch(`${API_BASE}/api/billing/products`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "套餐加载失败");
  return data;
}

export async function fetchPublicPricing(): Promise<{ creditModel: CreditModel; signupBonus: number }> {
  const res = await fetch(`${API_BASE}/api/pricing`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.creditModel) throw new Error(data.error || "积分规则加载失败");
  return {
    creditModel: data.creditModel as CreditModel,
    signupBonus: Math.max(0, Number(data.signupBonus) || 0),
  };
}

export async function createBillingOrder(productId: string): Promise<{
  order: { orderNo: string; name: string; amountFen: number; credits: number };
  qrDataUrl: string;
  expiresInSeconds: number;
}> {
  const res = await fetch(`${API_BASE}/api/billing/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ productId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "创建支付订单失败");
  return data;
}

export async function fetchBillingOrder(orderNo: string): Promise<{
  order: { status: "pending" | "paid" | "refunded"; amount_fen: number; product_name: string };
}> {
  const res = await fetch(`${API_BASE}/api/billing/orders/${encodeURIComponent(orderNo)}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "订单查询失败");
  return data;
}

export function calculateCreditsCost(
  model: CreditModel,
  count: number,
  slotEngines: Array<"image2" | "seedream" | "seedance"> = [],
  fallbackEngine: "image2" | "seedream" | "seedance" = "image2",
  sourceImageCount = 0,
): number {
  const total = Math.max(1, Math.floor(Number(count) || 1));
  const references = Math.max(0, Math.floor(Number(sourceImageCount) || 0));
  return Array.from({ length: total }, (_, index) => {
    const selected = slotEngines[index] || fallbackEngine;
    const referenceSurcharge = selected === "image2" && references > 1
      ? (references - 1) * model.image2ExtraReference
      : 0;
    return model.perImage[selected] + referenceSurcharge;
  }).reduce((sum, value) => sum + value, 0);
}
