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
  code: string
): Promise<{ ok: boolean; token?: string; user?: UserInfo; error?: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
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

// ─── Pricing constants (keep in sync with server/middleware.js) ───
// 阶梯计费：1=3, 2=5, 3-4=8, 5-7=12, 8-10=15

function tierCost(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 3;
  if (n === 2) return 5;
  if (n <= 4) return 8;
  if (n <= 7) return 12;
  return 15;
}

export function getCreditsCost(count: number): number {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  // 1-10 阶梯；超过 10 张按每满 10 张叠加 15 分 + 余数阶梯。
  const fullTens = Math.floor(n / 10);
  const remainder = n % 10;
  return fullTens * 15 + tierCost(remainder);
}
