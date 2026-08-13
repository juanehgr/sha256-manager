import { db, nextId, save, type Row } from "./store";
import { wrapBackup, type BackupData } from "../backupFormat";

const PREV = "sha256_backup_prev";

function dump(): BackupData {
  const settings = { ...(db().settings || {}) };
  delete settings.backup_prev;
  return {
    wallets: db().wallets.map((w) => ({ ...w })),
    pools: db().pools.map((p) => ({ ...p })),
    configs: db().configs.map((c) => ({ ...c })),
    settings,
    mrr_users: db().mrr_users.map((u) => ({ ...u })),
    schedules: db().schedules.map((s) => ({ ...s })),
  };
}

function savePrev() {
  localStorage.setItem(PREV, JSON.stringify({ kind: "sha256-manager-backup", v: 1, created: new Date().toISOString(), data: dump() }));
}

function clearConfig() {
  const d = db();
  d.wallets = [];
  d.pools = [];
  d.configs = [];
  d.mrr_users = [];
  d.schedules = [];
  d.settings = {};
  d.seq = { wallets: 1, pools: 1, configs: 1, mrr_users: 1, schedules: 1 };
}

function insertAll(data: BackupData) {
  const wMap: Record<string, number> = {};
  const pMap: Record<string, number> = {};
  const cMap: Record<string, number> = {};
  for (const w of data.wallets || []) {
    const id = nextId("wallets");
    wMap[String(w.id)] = id;
    db().wallets.push({ ...w, id });
  }
  for (const p of data.pools || []) {
    const id = nextId("pools");
    pMap[String(p.id)] = id;
    db().pools.push({ ...p, id });
  }
  for (const c of data.configs || []) {
    const pool_id = pMap[String(c.pool_id)];
    const wallet_id = wMap[String(c.wallet_id)];
    if (!pool_id || !wallet_id) continue;
    const id = nextId("configs");
    cMap[String(c.id)] = id;
    db().configs.push({
      ...c,
      id,
      pool_id,
      wallet_id,
      fallback_pool_id: c.fallback_pool_id ? pMap[String(c.fallback_pool_id)] || null : null,
    });
  }
  for (const u of data.mrr_users || []) {
    db().mrr_users.push({ ...u, id: nextId("mrr_users") });
  }
  for (const s of data.schedules || []) {
    const config_id = cMap[String(s.config_id)];
    if (!config_id) continue;
    db().schedules.push({ ...s, id: nextId("schedules"), config_id });
  }
  db().settings = { ...(data.settings || {}) };
  delete db().settings.backup_prev;
  save();
}

export async function exportDoc() {
  return wrapBackup(dump());
}

export function importReplace(data: BackupData) {
  savePrev();
  clearConfig();
  insertAll(data);
}

export function importMerge(data: BackupData) {
  savePrev();
  const wMap: Record<string, number> = {};
  const pMap: Record<string, number> = {};
  const cMap: Record<string, number> = {};
  const byAddr = new Map(db().wallets.map((w) => [String(w.address).trim(), w]));
  for (const w of data.wallets || []) {
    const hit = byAddr.get(String(w.address || "").trim());
    if (hit) wMap[String(w.id)] = Number(hit.id);
    else {
      const id = nextId("wallets");
      wMap[String(w.id)] = id;
      const row = { ...w, id };
      db().wallets.push(row);
      byAddr.set(String(w.address).trim(), row);
    }
  }
  const byPool = new Map(db().pools.map((p) => [`${String(p.host).toLowerCase()}:${p.port}`, p]));
  for (const p of data.pools || []) {
    const key = `${String(p.host).toLowerCase()}:${p.port}`;
    const hit = byPool.get(key);
    if (hit) pMap[String(p.id)] = Number(hit.id);
    else {
      const id = nextId("pools");
      pMap[String(p.id)] = id;
      const row = { ...p, id };
      db().pools.push(row);
      byPool.set(key, row);
    }
  }
  const cfgKey = (c: Row) => {
    const p = db().pools.find((x) => x.id === c.pool_id);
    const w = db().wallets.find((x) => x.id === c.wallet_id);
    return `${c.name}|${p?.host || ""}:${p?.port || ""}|${w?.address || ""}|${c.worker || ""}`;
  };
  const existing = new Map(db().configs.map((c) => [cfgKey(c), c]));
  for (const c of data.configs || []) {
    const pool_id = pMap[String(c.pool_id)];
    const wallet_id = wMap[String(c.wallet_id)];
    if (!pool_id || !wallet_id) continue;
    const row = {
      ...c,
      pool_id,
      wallet_id,
      fallback_pool_id: c.fallback_pool_id ? pMap[String(c.fallback_pool_id)] || null : null,
    };
    const key = cfgKey(row);
    const hit = existing.get(key);
    if (hit) cMap[String(c.id)] = Number(hit.id);
    else {
      const id = nextId("configs");
      cMap[String(c.id)] = id;
      const created = { ...row, id };
      db().configs.push(created);
      existing.set(key, created);
    }
  }
  const keys = new Set(db().mrr_users.map((u) => String(u.api_key)));
  for (const u of data.mrr_users || []) {
    if (keys.has(String(u.api_key))) continue;
    db().mrr_users.push({ ...u, id: nextId("mrr_users"), active: 0 });
  }
  for (const s of data.schedules || []) {
    const config_id = cMap[String(s.config_id)];
    if (!config_id) continue;
    db().schedules.push({ ...s, id: nextId("schedules"), config_id });
  }
  for (const [k, v] of Object.entries(data.settings || {})) {
    if (k === "backup_prev" || db().settings[k] != null) continue;
    db().settings[k] = String(v);
  }
  save();
}

export function restorePrev() {
  const raw = localStorage.getItem(PREV);
  if (!raw) throw new Error("No hay backup anterior");
  const doc = JSON.parse(raw);
  const current = dump();
  clearConfig();
  insertAll(doc.data);
  localStorage.setItem(PREV, JSON.stringify({ kind: "sha256-manager-backup", v: 1, created: new Date().toISOString(), data: current }));
}

export function backupStatus() {
  const raw = localStorage.getItem(PREV);
  if (!raw) return { hasBackup: false };
  try {
    const doc = JSON.parse(raw);
    return { hasBackup: true, created: doc.created || "" };
  } catch {
    return { hasBackup: true, created: "" };
  }
}
