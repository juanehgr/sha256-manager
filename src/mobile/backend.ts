import { db, nextId, save, type Row } from "./store";
import { applyPool, normalizeHost, probe, restart } from "./miners";
import { Lan } from "../native/lan";
import { algoFromCoin, mrrRequest } from "./mrr";
import { backupStatus, exportDoc, importMerge, importReplace, restorePrev } from "./backup";

const VERSION = "0.2.2";
const cache = new Map<string, Record<string, unknown>>();

function detectCoin(address: string) {
  const a = String(address || "").trim();
  const lower = a.toLowerCase();
  if (lower.startsWith("ltc1")) return "LTC";
  if (lower.startsWith("doge") || /^D[5-9A-HJ-NP-U]/.test(a)) return "DOGE";
  return "";
}

function siteFromHost(host: string) {
  const parts = String(host || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".")
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R | null>) {
  const out: (R | null)[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch {
        out[idx] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out.filter(Boolean) as R[];
}

function listWallets() {
  return [...db().wallets].sort((a, b) => Number(b.id) - Number(a.id));
}
function listPools() {
  return [...db().pools]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map((p) => ({ ...p, site: p.site || siteFromHost(String(p.host)) }));
}
function listConfigs(): Row[] {
  return [...db().configs]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map((c) => {
      const p = db().pools.find((x) => x.id === c.pool_id) || {};
      const w = db().wallets.find((x) => x.id === c.wallet_id) || {};
      const fp = db().pools.find((x) => x.id === c.fallback_pool_id);
      return {
        ...c,
        pool_name: p.name,
        pool_host: p.host,
        pool_port: p.port,
        pool_coin: p.coin,
        wallet_name: w.name,
        wallet_address: w.address,
        wallet_coin: w.coin,
        fallback_name: fp?.name,
      };
    });
}

function withHistory(device: Record<string, unknown>) {
  const since = Date.now() - 6 * 60 * 60 * 1000;
  const history = db()
    .hashrate_samples.filter((s) => s.mac === device.mac && s.ts >= since)
    .sort((a, b) => a.ts - b.ts)
    .map((s) => ({ ts: s.ts, hashrate: s.hashrate }));
  return { ...device, history };
}

function recordSample(d: Record<string, unknown>) {
  if (!d?.mac || !d.online) return;
  const rows = db().hashrate_samples;
  rows.push({ mac: String(d.mac), ts: Date.now(), hashrate: Number(d.hashRate || 0) });
  const cut = Date.now() - 24 * 60 * 60 * 1000;
  db().hashrate_samples = rows.filter((s) => s.ts >= cut);
  save();
}

function publicMrrUser(u: Row) {
  const key = String(u.api_key || "");
  return {
    id: u.id,
    name: u.name,
    mrr_username: u.mrr_username || "",
    active: Boolean(u.active),
    key_hint: key.length > 4 ? `…${key.slice(-4)}` : "••••",
  };
}

function mrrKeys() {
  const u = db().mrr_users.find((x) => x.active);
  if (!u) throw new Error("Crea o activa un usuario MRR");
  return { key: String(u.api_key), secret: String(u.api_secret), user: u };
}

function hashToGhs(hash: unknown, type: unknown) {
  const n = Number(hash || 0);
  const t = String(type || "").toLowerCase();
  if (t.startsWith("t")) return n * 1000;
  if (t.startsWith("g")) return n;
  if (t.startsWith("m")) return n / 1000;
  return n / 1e9;
}

function buildStratumPayload(configId: number) {
  const cfg = listConfigs().find((c) => Number(c.id) === Number(configId));
  if (!cfg) throw new Error("configuración no encontrada");
  const pool = db().pools.find((p) => p.id === cfg.pool_id);
  const wallet = db().wallets.find((w) => w.id === cfg.wallet_id);
  if (!pool || !wallet) throw new Error("configuración incompleta");
  const user = cfg.worker ? `${wallet.address}.${cfg.worker}` : String(wallet.address);
  const payload: Record<string, unknown> = {
    stratumURL: normalizeHost(String(pool.host)),
    stratumPort: Number(pool.port),
    stratumUser: user,
    stratumPassword: cfg.password || pool.password || "x",
  };
  if (cfg.fallback_pool_id) {
    const fb = db().pools.find((p) => p.id === cfg.fallback_pool_id);
    if (fb) {
      payload.fallbackStratumURL = normalizeHost(String(fb.host));
      payload.fallbackStratumPort = Number(fb.port);
      payload.fallbackStratumUser = user;
      payload.fallbackStratumPassword = fb.password || "x";
    }
  }
  return { payload, cfg };
}

export const localApi = {
  wallets: async () => listWallets(),
  saveWallet: async (body: Record<string, string>, id?: number) => {
    if (!body.name || !body.address) throw new Error("nombre y dirección requeridos");
    const coin = body.coin || detectCoin(body.address);
    if (id) {
      const i = db().wallets.findIndex((w) => Number(w.id) === id);
      if (i < 0) throw new Error("no encontrado");
      db().wallets[i] = { ...db().wallets[i], ...body, coin };
      save();
      return db().wallets[i];
    }
    const row = { id: nextId("wallets"), name: body.name, address: body.address.trim(), notes: body.notes || "", coin };
    db().wallets.push(row);
    save();
    return row;
  },
  deleteWallet: async (id: number) => {
    db().wallets = db().wallets.filter((w) => Number(w.id) !== id);
    save();
    return { ok: true };
  },
  pools: async () => listPools(),
  savePool: async (body: Record<string, unknown>, id?: number) => {
    const host = normalizeHost(String(body.host || ""));
    const row = {
      name: body.name,
      host,
      port: Number(body.port),
      password: body.password || "x",
      suggested_difficulty: body.suggested_difficulty ?? null,
      coin: body.coin || "",
      site: body.site || siteFromHost(host),
    };
    if (!row.name || !host || !row.port) throw new Error("nombre, host y puerto requeridos");
    if (id) {
      const i = db().pools.findIndex((p) => Number(p.id) === id);
      db().pools[i] = { ...db().pools[i], ...row };
      save();
      return db().pools[i];
    }
    const created = { id: nextId("pools"), ...row };
    db().pools.push(created);
    save();
    return created;
  },
  deletePool: async (id: number) => {
    db().pools = db().pools.filter((p) => Number(p.id) !== id);
    save();
    return { ok: true };
  },
  configs: async () => listConfigs(),
  saveConfig: async (body: Record<string, unknown>, id?: number) => {
    const row = {
      name: body.name,
      pool_id: Number(body.pool_id),
      wallet_id: Number(body.wallet_id),
      worker: body.worker || "",
      fallback_pool_id: body.fallback_pool_id || null,
      password: body.password || "x",
    };
    if (!row.name || !row.pool_id || !row.wallet_id) throw new Error("nombre, pool y wallet requeridos");
    if (id) {
      const i = db().configs.findIndex((c) => Number(c.id) === id);
      db().configs[i] = { ...db().configs[i], ...row };
      save();
      return listConfigs().find((c) => Number(c.id) === id);
    }
    const created = { id: nextId("configs"), ...row };
    db().configs.push(created);
    save();
    return listConfigs().find((c) => c.id === created.id);
  },
  deleteConfig: async (id: number) => {
    db().configs = db().configs.filter((c) => Number(c.id) !== id);
    save();
    return { ok: true };
  },
  devices: async () => [...cache.values()].map(withHistory),
  scan: async () => {
    const { ip } = await Lan.getIpv4();
    const parts = ip.split(".").map(Number);
    const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const ips: string[] = [];
    for (let i = 1; i <= 254; i++) {
      const cand = `${prefix}.${i}`;
      if (cand !== ip) ips.push(cand);
    }
    const devices = await mapLimit(ips, 32, async (host) => {
      try {
        return await probe(host);
      } catch {
        return null;
      }
    });
    cache.clear();
    for (const d of devices) {
      cache.set(String(d.mac), d);
      recordSample(d);
    }
    return { devices: devices.map(withHistory), scanned: ips.length, subnets: [`${prefix}.0/24`] };
  },
  refresh: async () => {
    const ips = [...new Set([...cache.values()].map((d) => String(d.ip)).filter(Boolean))];
    await Promise.all(
      ips.map(async (ip) => {
        try {
          const d = await probe(ip);
          cache.set(String(d.mac), d);
          recordSample(d);
        } catch {
          for (const [mac, prev] of cache) {
            if (prev.ip === ip) cache.set(mac, { ...prev, online: false });
          }
        }
      })
    );
    return [...cache.values()].map(withHistory);
  },
  identify: async () => {
    throw new Error("No disponible en el móvil");
  },
  apply: async (configId: number, ips: string[], doRestart: boolean) => {
    const { payload, cfg } = buildStratumPayload(configId);
    const targets = ips?.length ? ips : [...cache.values()].filter((d) => d.online).map((d) => String(d.ip));
    const results = [];
    for (const ip of targets) {
      try {
        const d = [...cache.values()].find((x) => x.ip === ip);
        await applyPool(ip, payload, String(d?.kind || ""));
        if (doRestart) {
          try {
            await restart(ip, String(d?.kind || ""));
          } catch {
            /* ignore */
          }
        }
        results.push({ ip, ok: true });
      } catch (e) {
        results.push({ ip, ok: false, error: String((e as Error).message || e) });
      }
    }
    return { config: cfg.name, payload, results };
  },
  importPools: async (url: string) => {
    const res = await fetch(url);
    const html = await res.text();
    const found: { name: string; host: string; port: number; coin: string; site: string }[] = [];
    const re = /(?:stratum\+tcp:\/\/)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}):(\d{2,5})/g;
    let m: RegExpExecArray | null;
    const have = new Set(db().pools.map((p) => `${String(p.host).toLowerCase()}:${p.port}`));
    while ((m = re.exec(html))) {
      const host = normalizeHost(m[1]);
      const port = Number(m[2]);
      if (!host || port < 1000 || port > 65535) continue;
      const key = `${host.toLowerCase()}:${port}`;
      if (found.some((p) => `${p.host}:${p.port}` === `${host}:${port}`)) continue;
      found.push({ name: `${host}:${port}`, host, port, coin: "", site: siteFromHost(host) });
    }
    let inserted = 0;
    let skipped = 0;
    for (const p of found) {
      const key = `${p.host.toLowerCase()}:${p.port}`;
      if (have.has(key)) {
        skipped++;
        continue;
      }
      db().pools.push({ id: nextId("pools"), ...p, password: "x" });
      have.add(key);
      inserted++;
    }
    save();
    return { found: found.length, inserted, skipped, pools: found };
  },
  schedules: async () =>
    db().schedules.map((s) => ({
      ...s,
      config_name: db().configs.find((c) => c.id === s.config_id)?.name,
    })),
  saveSchedule: async (body: Record<string, unknown>, id?: number) => {
    const row = {
      name: body.name,
      config_id: Number(body.config_id),
      device_mac: body.device_mac || null,
      kind: body.kind || "daily",
      time: body.time || null,
      run_at: body.run_at || null,
      days: body.days || "",
      restart: body.restart ? 1 : 0,
      enabled: body.enabled === false ? 0 : 1,
    };
    if (!row.name || !row.config_id) throw new Error("nombre y configuración requeridos");
    if (id) {
      const i = db().schedules.findIndex((s) => Number(s.id) === id);
      db().schedules[i] = { ...db().schedules[i], ...row };
      save();
      return db().schedules[i];
    }
    const created = { id: nextId("schedules"), ...row };
    db().schedules.push(created);
    save();
    return created;
  },
  deleteSchedule: async (id: number) => {
    db().schedules = db().schedules.filter((s) => Number(s.id) !== id);
    save();
    return { ok: true };
  },
  mrrStatus: async () => {
    const users = db().mrr_users.map(publicMrrUser);
    const active = users.find((u) => u.active) || null;
    return { configured: Boolean(active), users, active };
  },
  mrrUsers: async () => {
    const users = db().mrr_users.map(publicMrrUser);
    return { users, active: users.find((u) => u.active) || null };
  },
  mrrAddUser: async (body: { name: string; key: string; secret: string; activate?: boolean }) => {
    if (!body.name || !body.key || !body.secret) throw new Error("nombre, key y secret requeridos");
    const acct = await mrrRequest(body.key.trim(), body.secret.trim(), "GET", "/account");
    const makeActive = db().mrr_users.length === 0 || body.activate ? 1 : 0;
    if (makeActive) db().mrr_users.forEach((u) => (u.active = 0));
    const row = {
      id: nextId("mrr_users"),
      name: body.name.trim(),
      api_key: body.key.trim(),
      api_secret: body.secret.trim(),
      mrr_username: acct?.username || acct?.name || "",
      active: makeActive,
    };
    db().mrr_users.push(row);
    save();
    return publicMrrUser(row);
  },
  mrrUpdateUser: async (id: number, body: { name?: string; key?: string; secret?: string }) => {
    const i = db().mrr_users.findIndex((u) => Number(u.id) === id);
    if (i < 0) throw new Error("usuario no encontrado");
    const cur = db().mrr_users[i];
    const key = body.key ? body.key.trim() : String(cur.api_key);
    const secret = body.secret ? body.secret.trim() : String(cur.api_secret);
    let uname = cur.mrr_username;
    if (body.key || body.secret) {
      const acct = await mrrRequest(key, secret, "GET", "/account");
      uname = acct?.username || acct?.name || cur.mrr_username;
    }
    db().mrr_users[i] = { ...cur, name: body.name || cur.name, api_key: key, api_secret: secret, mrr_username: uname };
    save();
    return publicMrrUser(db().mrr_users[i]);
  },
  mrrActivateUser: async (id: number) => {
    db().mrr_users.forEach((u) => (u.active = Number(u.id) === id ? 1 : 0));
    save();
    return publicMrrUser(db().mrr_users.find((u) => Number(u.id) === id)!);
  },
  mrrDeleteUser: async (id: number) => {
    db().mrr_users = db().mrr_users.filter((u) => Number(u.id) !== id);
    if (!db().mrr_users.some((u) => u.active) && db().mrr_users[0]) db().mrr_users[0].active = 1;
    save();
    return { ok: true };
  },
  mrrRentals: async () => {
    const { key, secret } = mrrKeys();
    const acct = await mrrRequest(key, secret, "GET", "/account");
    const list = await mrrRequest(key, secret, "GET", "/rental", { type: "renter", history: "false", limit: 100 });
    const rows = list?.rentals || list || [];
    const rentals = [];
    for (const r of Array.isArray(rows) ? rows : []) {
      let poolHost = "";
      let poolPort = "";
      let poolUser = "";
      try {
        const pools = await mrrRequest(key, secret, "GET", `/rental/${r.id}/pool`);
        const first = Array.isArray(pools) ? pools[0]?.pools?.[0] : pools?.pools?.[0];
        if (first) {
          poolHost = first.host || "";
          poolPort = String(first.port || "");
          poolUser = first.user || "";
        }
      } catch {
        /* ignore */
      }
      const adv = r.hashrate?.advertised || r.hashrate?.average || {};
      rentals.push({
        id: String(r.id),
        name: r.rig?.name || `Alquiler ${r.id}`,
        algo: r.rig?.type || r.algo || "",
        status: r.rig?.status?.status || r.status || "",
        hashrate: hashToGhs(adv.hash, adv.type),
        hashrateNice: adv.nice || "",
        poolHost,
        poolPort,
        poolUser,
        end: r.end || "",
      });
    }
    return { account: acct?.username || acct?.name || "", rentals };
  },
  mrrApply: async (configId: number, ids: string[]) => {
    const { payload, cfg } = buildStratumPayload(configId);
    const { key, secret } = mrrKeys();
    const targets = ids?.length ? ids.map(String) : [];
    if (!targets.length) throw new Error("Ningún alquiler seleccionado");
    const results = [];
    for (const id of targets) {
      try {
        await mrrRequest(key, secret, "PUT", `/rental/${id}/pool/0`, {
          host: payload.stratumURL,
          port: payload.stratumPort,
          user: payload.stratumUser,
          pass: payload.stratumPassword || "x",
        });
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: String((e as Error).message) });
      }
    }
    return { config: cfg.name, algo: algoFromCoin(String(cfg.pool_coin || "")), results };
  },
  updateCheck: async () => ({
    current: VERSION,
    available: false,
    desktop: false,
    git: false,
  }),
  saveUpdateToken: async () => ({ ok: true, tokenConfigured: false }),
  applyWebUpdate: async () => {
    throw new Error("En el móvil instala el APK nuevo");
  },
  exportBackup: async () => exportDoc(),
  importBackup: async (raw: string, mode: "replace" | "merge") => {
    const { parseBackup, sha256Hex, canonicalData } = await import("../backupFormat");
    const doc = parseBackup(raw);
    const expect = await sha256Hex(canonicalData(doc.data));
    if (mode === "replace") importReplace(doc.data);
    else importMerge(doc.data);
    return { ok: true, hashOk: !doc.hash || doc.hash === expect, created: doc.created };
  },
  restoreBackup: async () => {
    restorePrev();
    return { ok: true };
  },
  backupStatus: async () => backupStatus(),
};
