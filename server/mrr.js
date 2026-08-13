const crypto = require("crypto");

const BASE = "https://www.miningrigrentals.com/api/v2";

function nonce() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function mrrRequest(key, secret, method, endpoint, params) {
  const n = nonce();
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const signPath = path.replace(/\/$/, "") || "/";
  const sign = crypto.createHmac("sha1", secret).update(`${key}${n}${signPath}`).digest("hex");
  const url = new URL(BASE + path);
  const headers = {
    "x-api-key": key,
    "x-api-nonce": n,
    "x-api-sign": sign,
    Accept: "application/json",
    "User-Agent": "SHA256Manager/0.2",
  };
  const init = { method, headers };
  if (method === "GET" && params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  } else if (params && method !== "GET") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null))
    ).toString();
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = data.data?.message || data.message || JSON.stringify(data.data || data) || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return data.data;
}

function algoFromCoin(coin) {
  const c = String(coin || "").toUpperCase();
  if (["LTC", "DOGE", "BEL", "PEP"].includes(c)) return "scrypt";
  if (["RVN"].includes(c)) return "kawpow";
  if (["XMR"].includes(c)) return "randomx";
  return "sha256";
}

module.exports = { mrrRequest, algoFromCoin };
