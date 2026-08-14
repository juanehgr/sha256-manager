import { Lan } from "../native/lan";

const ASIC_MODELS: Record<string, string> = {
  BM1366: "Ultra",
  BM1368: "Supra",
  BM1370: "Gamma",
  BM1397: "Max",
};

export function normalizeHost(host: string) {
  if (!host) return "";
  return String(host)
    .replace(/^stratum\+tcp:\/\//i, "")
    .replace(/^stratum:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .trim();
}

function parseHashrateToGhs(raw: unknown, unitHint?: string) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "string") {
    const m = raw.replace(/,/g, "").match(/([\d.]+)\s*([kKmMgGtTpP])?/);
    if (!m) return Number(raw) || 0;
    const n = Number(m[1]);
    const u = (m[2] || unitHint || "").toLowerCase();
    if (u === "p") return n * 1e6;
    if (u === "t") return n * 1000;
    if (u === "g") return n;
    if (u === "m") return n / 1000;
    if (u === "k") return n / 1e6;
    return n;
  }
  const n = Number(raw);
  const u = String(unitHint || "").toLowerCase();
  if (u.startsWith("t")) return n * 1000;
  if (u.startsWith("m")) return n / 1000;
  return n;
}

async function fetchJson(url: string, options: RequestInit = {}, timeoutMs = 1800): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function rpc4028(ip: string, payload: object, timeoutMs = 900) {
  const { data } = await Lan.tcpJson({
    host: ip,
    port: 4028,
    payload: JSON.stringify(payload),
    timeoutMs,
  });
  const cleaned = String(data || "").replace(/\0/g, "").trim();
  if (!cleaned) throw new Error("empty");
  return JSON.parse(cleaned);
}

async function cgminer(ip: string, command: string, parameter?: string) {
  const body = parameter != null ? { command, parameter } : { command };
  try {
    return await rpc4028(ip, body);
  } catch {
    return await rpc4028(ip, parameter != null ? { cmd: command, parameter } : { cmd: command });
  }
}

function first(arr: unknown) {
  return Array.isArray(arr) ? arr[0] : arr;
}

function baseDevice(ip: string, extra: Record<string, unknown>) {
  return {
    mac: extra.mac,
    ip,
    hostname: extra.hostname || "",
    model: extra.model || "SHA-256",
    asicModel: extra.asicModel || "",
    boardVersion: extra.boardVersion || "",
    firmware: extra.firmware || "",
    vendor: extra.vendor || "",
    kind: extra.kind,
    hashRate: extra.hashRate || 0,
    temp: extra.temp ?? null,
    vrTemp: extra.vrTemp ?? null,
    power: extra.power ?? null,
    fanspeed: extra.fanspeed ?? null,
    fanrpm: extra.fanrpm ?? null,
    frequency: extra.frequency ?? null,
    coreVoltage: extra.coreVoltage ?? null,
    ssid: extra.ssid || "",
    wifiRSSI: extra.wifiRSSI ?? null,
    stratumURL: extra.stratumURL || "",
    stratumPort: extra.stratumPort ?? null,
    stratumUser: extra.stratumUser || "",
    fallbackStratumURL: extra.fallbackStratumURL || "",
    isUsingFallbackStratum: extra.isUsingFallbackStratum,
    sharesAccepted: extra.sharesAccepted ?? 0,
    sharesRejected: extra.sharesRejected ?? 0,
    sharesSent:
      extra.sharesSent ??
      Number(extra.sharesAccepted || 0) + Number(extra.sharesRejected || 0),
    bestDiff: extra.bestDiff ?? null,
    bestSessionDiff: extra.bestSessionDiff ?? null,
    uptimeSeconds: extra.uptimeSeconds ?? 0,
    coin: extra.coin || "",
    online: true,
    lastSeen: new Date().toISOString(),
  };
}

async function probeAxeos(ip: string) {
  const info = await fetchJson(`http://${ip}/api/system/info`);
  if (!info || typeof info !== "object") throw new Error("not axeos");
  if (!(info.ASICModel || info.boardVersion || info.stratumURL !== undefined)) {
    throw new Error("not axeos");
  }
  let asic: Record<string, unknown> | null = null;
  try {
    asic = await fetchJson(`http://${ip}/api/system/asic`, {}, 1200);
  } catch {
    asic = null;
  }
  const chip = String(info.ASICModel || asic?.ASICModel || "");
  const mac = String(info.macAddr || info.mac || `AXE-${ip}`).toUpperCase();
  return baseDevice(String(info.ipv4 || ip), {
    kind: "axeos",
    vendor: "Open ASIC",
    mac,
    hostname: info.hostname || "",
    model: asic?.deviceModel || ASIC_MODELS[chip] || chip || "SHA-256",
    asicModel: chip,
    boardVersion: info.boardVersion || "",
    firmware: info.axeOSVersion || info.version || "",
    hashRate: Number(info.hashRate ?? info.hashRate_1m ?? 0),
    temp: info.temp ?? null,
    vrTemp: info.vrTemp ?? null,
    power: info.power ?? null,
    fanspeed: info.fanspeed ?? null,
    fanrpm: info.fanrpm ?? null,
    frequency: info.frequency ?? null,
    coreVoltage: info.coreVoltage ?? null,
    ssid: info.ssid || "",
    wifiRSSI: info.wifiRSSI ?? null,
    stratumURL: info.stratumURL || "",
    stratumPort: info.stratumPort ?? null,
    stratumUser: info.stratumUser || "",
    fallbackStratumURL: info.fallbackStratumURL || "",
    isUsingFallbackStratum: info.isUsingFallbackStratum,
    sharesAccepted: info.sharesAccepted ?? 0,
    sharesRejected: info.sharesRejected ?? 0,
    sharesSent: info.sharesSent,
    bestDiff: info.bestDiff ?? info.bestDifficulty ?? null,
    bestSessionDiff: info.bestSessionDiff ?? info.bestShare ?? null,
    uptimeSeconds: info.uptimeSeconds ?? 0,
  });
}

function parsePools(data: Record<string, unknown>) {
  const pools = (data.POOLS || data.pools || []) as Record<string, string>[];
  const active =
    pools.find((p) => String(p.Status || p.status).toLowerCase() === "alive") || pools[0];
  if (!active) return {};
  const url = String(active.URL || active.url || "");
  const host = normalizeHost(url);
  const portM = url.match(/:(\d+)\s*$/);
  return {
    stratumURL: host,
    stratumPort: portM ? Number(portM[1]) : null,
    stratumUser: active.User || active.user || "",
  };
}

async function probeCgminer(ip: string) {
  const summary = await cgminer(ip, "summary");
  const sum = (first(summary.SUMMARY || summary.summary || summary.Msg) || summary.Msg || {}) as Record<
    string,
    unknown
  >;
  let pools: Record<string, unknown> = {};
  try {
    pools = parsePools(await cgminer(ip, "pools"));
  } catch {
    pools = {};
  }
  let stats: Record<string, unknown> = {};
  try {
    const st = await cgminer(ip, "stats");
    stats = (first(st.STATS || st.stats) || {}) as Record<string, unknown>;
  } catch {
    stats = {};
  }
  const type = String(stats.Type || stats.type || sum.Type || summary.Info || "").toLowerCase();
  const msg = (summary.Msg || {}) as Record<string, unknown>;
  const isWhats = type.includes("whats") || msg["Hash Rate"] != null;
  const ghs = parseHashrateToGhs(
    sum["GHS 5s"] ?? sum["GHS av"] ?? sum["Hash Rate"] ?? sum.hashrate ?? msg["Hash Rate"],
    sum["GHS 5s"] != null || sum["GHS av"] != null ? "g" : "t"
  );
  const model = String(stats.Type || stats.type || summary.Info || (isWhats ? "Whatsminer" : "Antminer"));
  const mac = String(stats.MAC || stats.mac || msg.mac || `${isWhats ? "WM" : "ASIC"}-${ip}`).toUpperCase();
  return baseDevice(ip, {
    kind: isWhats ? "whatsminer" : "cgminer",
    vendor: isWhats ? "Whatsminer" : /ant/i.test(model) ? "Antminer" : "cgminer",
    mac,
    hostname: ip,
    model,
    asicModel: stats.Type || "",
    firmware: String(stats.CompileTime || msg.firmware || ""),
    hashRate: ghs,
    temp: Number(sum.Temperature || sum.temp || stats.temp1 || stats.Temp || 0) || null,
    power: Number(sum.Power || msg.Power || 0) || null,
    fanspeed: Number(sum["Fan Speed In"] || stats.fan1 || 0) || null,
    sharesAccepted: Number(sum.Accepted || sum.accepted || 0),
    sharesRejected: Number(sum.Rejected || sum.rejected || 0),
    bestDiff: sum["Best Share"] || sum.DifficultyAccepted || null,
    uptimeSeconds: Number(sum.Elapsed || sum.elapsed || msg["Elapsed Time"] || 0),
    ...pools,
  });
}

export async function probe(ip: string) {
  try {
    return await probeAxeos(ip);
  } catch {
    return await probeCgminer(ip);
  }
}

async function applyAxeos(ip: string, payload: object) {
  const res = await fetch(`http://${ip}/api/system`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}`);
  return true;
}

async function applyCgminer(ip: string, payload: { stratumURL: string; stratumPort: number; stratumUser: string; stratumPassword?: string }) {
  const url = `stratum+tcp://${payload.stratumURL}:${payload.stratumPort}`;
  await cgminer(ip, "addpool", `${url},${payload.stratumUser},${payload.stratumPassword || "x"}`);
  const pools = await cgminer(ip, "pools");
  const list = (pools.POOLS || pools.pools || []) as Record<string, string>[];
  const idx = list.findIndex((p) => String(p.URL || p.url || "").includes(payload.stratumURL));
  if (idx >= 0) {
    try {
      await cgminer(ip, "switchpool", String(idx));
    } catch {
      await cgminer(ip, "enablepool", String(idx));
    }
  }
  return true;
}

export async function applyPool(ip: string, payload: Record<string, unknown>, kind?: string) {
  if (kind === "axeos") return applyAxeos(ip, payload);
  if (kind === "cgminer" || kind === "whatsminer") return applyCgminer(ip, payload as never);
  try {
    return await applyAxeos(ip, payload);
  } catch {
    return applyCgminer(ip, payload as never);
  }
}

export async function restart(ip: string, kind?: string) {
  if (kind === "cgminer" || kind === "whatsminer") {
    try {
      await cgminer(ip, "restart");
    } catch {
      await rpc4028(ip, { cmd: "reboot" }).catch(() => undefined);
    }
    return true;
  }
  await fetch(`http://${ip}/api/system/restart`, { method: "POST" });
  return true;
}
