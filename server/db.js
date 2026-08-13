const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

function dataDir() {
  let root;
  if (process.versions.electron) {
    try {
      const { app } = require("electron");
      root = path.join(app.getPath("userData"), "data");
    } catch {
      root = null;
    }
  }
  if (!root) root = path.join(__dirname, "..", "data");
  fs.mkdirSync(root, { recursive: true });
  const dest = path.join(root, "data.sqlite");
  const candidates = [
    path.join(__dirname, "..", "data", "data.sqlite"),
    path.join(process.env.APPDATA || "", "sha256-manager", "data", "data.sqlite"),
    path.join(process.env.APPDATA || "", "bitaxe-manager", "data.sqlite"),
  ];
  if (!fs.existsSync(dest)) {
    for (const old of candidates) {
      if (old && old !== dest && fs.existsSync(old)) {
        fs.copyFileSync(old, dest);
        break;
      }
    }
  }
  return root;
}

function cols(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function addCol(db, table, name, def) {
  if (!cols(db, table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
}

function openDb() {
  const db = new DatabaseSync(path.join(dataDir(), "data.sqlite"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      password TEXT DEFAULT 'x',
      suggested_difficulty INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
      wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      worker TEXT NOT NULL DEFAULT '',
      fallback_pool_id INTEGER REFERENCES pools(id) ON DELETE SET NULL,
      password TEXT DEFAULT 'x',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mrr_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      api_key TEXT NOT NULL,
      api_secret TEXT NOT NULL,
      mrr_username TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS hashrate_samples (
      mac TEXT NOT NULL,
      ts INTEGER NOT NULL,
      hashrate REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      config_id INTEGER NOT NULL REFERENCES configs(id) ON DELETE CASCADE,
      device_mac TEXT,
      kind TEXT NOT NULL DEFAULT 'daily',
      time TEXT,
      run_at TEXT,
      days TEXT,
      restart INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT
    );
  `);
  addCol(db, "pools", "coin", "TEXT DEFAULT ''");
  addCol(db, "pools", "site", "TEXT DEFAULT ''");
  addCol(db, "wallets", "coin", "TEXT DEFAULT ''");
  addCol(db, "configs", "password", "TEXT DEFAULT 'x'");
  try {
    const k = db.prepare("SELECT value FROM settings WHERE key='mrr_key'").get();
    const s = db.prepare("SELECT value FROM settings WHERE key='mrr_secret'").get();
    const n = db.prepare("SELECT COUNT(*) AS c FROM mrr_users").get();
    if (k?.value && s?.value && !n?.c) {
      db.prepare(
        "INSERT INTO mrr_users (name, api_key, api_secret, active) VALUES ('MRR', ?, ?, 1)"
      ).run(k.value, s.value);
      db.prepare("DELETE FROM settings WHERE key IN ('mrr_key','mrr_secret')").run();
    }
  } catch {
    /* ignore */
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_hr_mac_ts ON hashrate_samples(mac, ts)");
  return db;
}

module.exports = { openDb, dataDir };
