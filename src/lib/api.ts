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
  if (!res.ok) throw new Error(data.error || "标题生成失败，请稍后重试");
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

export async function fetchBillingProducts(): Promise<{
  packs: BillingProduct[];
  subscriptions: BillingProduct[];
  discount: number;
  paymentReady: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/billing/products`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "套餐加载失败");
  return data;
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

// ─── Pricing constants (keep in sync with server/middleware.js) ───
// 阶梯计费：1=300, 2=500, 3-4=800, 5-7=1200, 8-10=1500

function tierCost(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 300;
  if (n === 2) return 500;
  if (n <= 4) return 800;
  if (n <= 7) return 1200;
  return 1500;
}

export function getCreditsCost(count: number): number {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  // 1-10 阶梯；超过 10 张按每满 10 张叠加 15 分 + 余数阶梯。
  const fullTens = Math.floor(n / 10);
  const remainder = n % 10;
  return fullTens * 1500 + tierCost(remainder);
}
