const crypto = require("crypto");

const KIND = "sha256-manager-backup";

function canonical(data) {
  return JSON.stringify({
    wallets: data.wallets || [],
    pools: data.pools || [],
    configs: data.configs || [],
    settings: data.settings || {},
    mrr_users: data.mrr_users || [],
    schedules: data.schedules || [],
  });
}

function hashOf(data) {
  return crypto.createHash("sha256").update(canonical(data)).digest("hex");
}

function dump(db) {
  const settingsRows = db.prepare("SELECT key, value FROM settings WHERE key != 'backup_prev'").all();
  const settings = {};
  for (const r of settingsRows) settings[r.key] = r.value;
  return {
    wallets: db.prepare("SELECT * FROM wallets ORDER BY id").all(),
    pools: db.prepare("SELECT * FROM pools ORDER BY id").all(),
    configs: db.prepare("SELECT * FROM configs ORDER BY id").all(),
    settings,
    mrr_users: db.prepare("SELECT * FROM mrr_users ORDER BY id").all(),
    schedules: db.prepare("SELECT * FROM schedules ORDER BY id").all(),
  };
}

function wrap(data) {
  return {
    kind: KIND,
    v: 1,
    created: new Date().toISOString(),
    hash: hashOf(data),
    data,
  };
}

function parse(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Vacío");
  let doc;
  if (text.startsWith("S2561.")) {
    const b64 = text.slice(6).replace(/-/g, "+").replace(/_/g, "/");
    doc = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } else {
    doc = JSON.parse(text);
  }
  if (doc?.kind !== KIND || !doc.data) throw new Error("No es una copia de SHA-256 Manager");
  return doc;
}

function savePrev(db) {
  const prev = JSON.stringify(wrap(dump(db)));
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('backup_prev', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(prev);
}

function clearConfig(db) {
  db.exec("DELETE FROM schedules");
  db.exec("DELETE FROM configs");
  db.exec("DELETE FROM pools");
  db.exec("DELETE FROM wallets");
  db.exec("DELETE FROM mrr_users");
  db.prepare("DELETE FROM settings WHERE key != 'backup_prev'").run();
}

function insertAll(db, data, idMaps) {
  const wMap = idMaps.wallets;
  const pMap = idMaps.pools;
  const cMap = idMaps.configs;
  const insW = db.prepare("INSERT INTO wallets (name, address, notes, coin) VALUES (?, ?, ?, ?)");
  for (const w of data.wallets || []) {
    const r = insW.run(w.name, w.address, w.notes || "", w.coin || "");
    wMap[w.id] = Number(r.lastInsertRowid);
  }
  const insP = db.prepare(
    "INSERT INTO pools (name, host, port, password, suggested_difficulty, coin, site) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const p of data.pools || []) {
    const r = insP.run(
      p.name,
      p.host,
      Number(p.port),
      p.password || "x",
      p.suggested_difficulty ?? null,
      p.coin || "",
      p.site || ""
    );
    pMap[p.id] = Number(r.lastInsertRowid);
  }
  const insC = db.prepare(
    "INSERT INTO configs (name, pool_id, wallet_id, worker, fallback_pool_id, password) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const c of data.configs || []) {
    const poolId = pMap[c.pool_id];
    const walletId = wMap[c.wallet_id];
    if (!poolId || !walletId) continue;
    const fb = c.fallback_pool_id ? pMap[c.fallback_pool_id] || null : null;
    const r = insC.run(c.name, poolId, walletId, c.worker || "", fb, c.password || "x");
    cMap[c.id] = Number(r.lastInsertRowid);
  }
  const insM = db.prepare(
    "INSERT INTO mrr_users (name, api_key, api_secret, mrr_username, active) VALUES (?, ?, ?, ?, ?)"
  );
  for (const u of data.mrr_users || []) {
    insM.run(u.name, u.api_key, u.api_secret, u.mrr_username || "", u.active ? 1 : 0);
  }
  const insS = db.prepare(
    `INSERT INTO schedules (name, config_id, device_mac, kind, time, run_at, days, restart, enabled, last_run)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const s of data.schedules || []) {
    const cfgId = cMap[s.config_id];
    if (!cfgId) continue;
    insS.run(
      s.name,
      cfgId,
      s.device_mac || null,
      s.kind || "daily",
      s.time || null,
      s.run_at || null,
      s.days || "",
      s.restart ? 1 : 0,
      s.enabled === 0 ? 0 : 1,
      s.last_run || null
    );
  }
  const set = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  );
  for (const [k, v] of Object.entries(data.settings || {})) {
    if (k === "backup_prev") continue;
    set.run(k, String(v));
  }
}

function applyReplace(db, data) {
  savePrev(db);
  clearConfig(db);
  insertAll(db, data, { wallets: {}, pools: {}, configs: {} });
}

function applyMerge(db, data) {
  savePrev(db);
  const wMap = {};
  const pMap = {};
  const cMap = {};
  const wallets = db.prepare("SELECT * FROM wallets").all();
  const byAddr = new Map(wallets.map((w) => [String(w.address).trim(), w]));
  const insW = db.prepare("INSERT INTO wallets (name, address, notes, coin) VALUES (?, ?, ?, ?)");
  for (const w of data.wallets || []) {
    const hit = byAddr.get(String(w.address || "").trim());
    if (hit) {
      wMap[w.id] = hit.id;
    } else {
      const r = insW.run(w.name, w.address, w.notes || "", w.coin || "");
      wMap[w.id] = Number(r.lastInsertRowid);
    }
  }
  const pools = db.prepare("SELECT * FROM pools").all();
  const byPool = new Map(pools.map((p) => [`${String(p.host).toLowerCase()}:${p.port}`, p]));
  const insP = db.prepare(
    "INSERT INTO pools (name, host, port, password, suggested_difficulty, coin, site) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const p of data.pools || []) {
    const key = `${String(p.host).toLowerCase()}:${p.port}`;
    const hit = byPool.get(key);
    if (hit) {
      pMap[p.id] = hit.id;
    } else {
      const r = insP.run(
        p.name,
        p.host,
        Number(p.port),
        p.password || "x",
        p.suggested_difficulty ?? null,
        p.coin || "",
        p.site || ""
      );
      pMap[p.id] = Number(r.lastInsertRowid);
    }
  }
  const configs = db.prepare("SELECT * FROM configs").all();
  const cfgKey = (c, pGet, wGet) => {
    const p = pGet(c.pool_id);
    const w = wGet(c.wallet_id);
    return `${c.name}|${p?.host || ""}:${p?.port || ""}|${w?.address || ""}|${c.worker || ""}`;
  };
  const poolById = (id) => db.prepare("SELECT * FROM pools WHERE id=?").get(id);
  const walletById = (id) => db.prepare("SELECT * FROM wallets WHERE id=?").get(id);
  const existingCfg = new Set(configs.map((c) => cfgKey(c, poolById, walletById)));
  const insC = db.prepare(
    "INSERT INTO configs (name, pool_id, wallet_id, worker, fallback_pool_id, password) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const c of data.configs || []) {
    const poolId = pMap[c.pool_id];
    const walletId = wMap[c.wallet_id];
    if (!poolId || !walletId) continue;
    const fake = { ...c, pool_id: poolId, wallet_id: walletId };
    const key = cfgKey(fake, poolById, walletById);
    const hit = configs.find((x) => cfgKey(x, poolById, walletById) === key);
    if (hit) {
      cMap[c.id] = hit.id;
      continue;
    }
    if (existingCfg.has(key)) continue;
    const fb = c.fallback_pool_id ? pMap[c.fallback_pool_id] || null : null;
    const r = insC.run(c.name, poolId, walletId, c.worker || "", fb, c.password || "x");
    cMap[c.id] = Number(r.lastInsertRowid);
  }
  const keys = new Set(db.prepare("SELECT api_key FROM mrr_users").all().map((u) => u.api_key));
  const insM = db.prepare(
    "INSERT INTO mrr_users (name, api_key, api_secret, mrr_username, active) VALUES (?, ?, ?, ?, 0)"
  );
  for (const u of data.mrr_users || []) {
    if (keys.has(u.api_key)) continue;
    insM.run(u.name, u.api_key, u.api_secret, u.mrr_username || "");
  }
  const insS = db.prepare(
    `INSERT INTO schedules (name, config_id, device_mac, kind, time, run_at, days, restart, enabled, last_run)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const s of data.schedules || []) {
    const cfgId = cMap[s.config_id];
    if (!cfgId) continue;
    insS.run(
      s.name,
      cfgId,
      s.device_mac || null,
      s.kind || "daily",
      s.time || null,
      s.run_at || null,
      s.days || "",
      s.restart ? 1 : 0,
      s.enabled === 0 ? 0 : 1,
      s.last_run || null
    );
  }
  const have = new Set(db.prepare("SELECT key FROM settings").all().map((r) => r.key));
  const set = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(data.settings || {})) {
    if (k === "backup_prev" || have.has(k)) continue;
    set.run(k, String(v));
  }
}

function restorePrev(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='backup_prev'").get();
  if (!row?.value) throw new Error("No hay backup anterior");
  const doc = parse(row.value);
  const current = wrap(dump(db));
  clearConfig(db);
  insertAll(db, doc.data, { wallets: {}, pools: {}, configs: {} });
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('backup_prev', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(JSON.stringify(current));
}

function status(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key='backup_prev'").get();
  if (!row?.value) return { hasBackup: false };
  try {
    const doc = JSON.parse(row.value);
    return { hasBackup: true, created: doc.created || "" };
  } catch {
    return { hasBackup: true, created: "" };
  }
}

module.exports = { dump, wrap, parse, hashOf, applyReplace, applyMerge, restorePrev, status, KIND };
