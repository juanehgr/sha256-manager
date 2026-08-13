const BASE = "https://www.miningrigrentals.com/api/v2";

async function hmacSha1Hex(secret: string, msg: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function mrrRequest(key: string, secret: string, method: string, endpoint: string, params?: Record<string, unknown>) {
  const n = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const signPath = path.replace(/\/$/, "") || "/";
  const sign = await hmacSha1Hex(secret, `${key}${n}${signPath}`);
  const url = new URL(BASE + path);
  const headers: Record<string, string> = {
    "x-api-key": key,
    "x-api-nonce": n,
    "x-api-sign": sign,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (method === "GET" && params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  } else if (params && method !== "GET") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))
    ).toString();
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(String(data.data?.message || data.message || `HTTP ${res.status}`));
  }
  return data.data;
}

export function algoFromCoin(coin: string) {
  const c = String(coin || "").toUpperCase();
  if (["LTC", "DOGE", "BEL", "PEP"].includes(c)) return "scrypt";
  if (c === "RVN") return "kawpow";
  return "sha256";
}
