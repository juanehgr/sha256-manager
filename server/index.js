const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { openDb } = require("./db");
const { scanNetwork } = require("./discover");
const { probe, applyPool, restart, identify, normalizeHost } = require("./miners");
const { detectCoin } = require("./coin");
const { attachStats } = require("./coinStats");
const { importFromUrl, siteFromHost } = require("./importPools");
const { mrrRequest, algoFromCoin } = require("./mrr");
const { startScheduler } = require("./scheduler");

const VERSION = require("../package.json").version;
const PORT = Number(process.env.PORT || 3847);
const db = openDb();
const cache = new Map();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, version: VERSION }));
app.get("/api/version", (_req, res) => res.json({ version: VERSION, name: "SHA-256 Manager" }));

function listWallets() {
  return db.prepare("SELECT * FROM wallets ORDER BY id DESC").all();
}
function listPools() {
  return db
    .prepare("SELECT * FROM pools ORDER BY id DESC")
    .all()
    .map((p) => ({ ...p, site: p.site || siteFromHost(p.host) }));
}
function listConfigs() {
  return db
    .prepare(
      `SELECT c.*, p.name AS pool_name, p.host AS pool_host, p.port AS pool_port, p.coin AS pool_coin,
              w.name AS wallet_name, w.address AS wallet_address, w.coin AS wallet_coin,
              fp.name AS fallback_name
       FROM configs c
       JOIN pools p ON p.id = c.pool_id
       JOIN wallets w ON w.id = c.wallet_id
       LEFT JOIN pools fp ON fp.id = c.fallback_pool_id
       ORDER BY c.id DESC`
    )
    .all();
}

app.get("/api/wallets", (_req, res) => res.json(listWallets()));
app.post("/api/wallets", (req, res) => {
  const { name, address, notes, coin } = req.body || {};
  if (!name || !address) return res.status(400).json({ error: "nombre y dirección requeridos" });
  const detected = coin || detectCoin(address);
  const r = db
    .prepare("INSERT INTO wallets (name, address, notes, coin) VALUES (?, ?, ?, ?)")
    .run(name, address.trim(), notes || "", detected);
  res.json(db.prepare("SELECT * FROM wallets WHERE id = ?").get(r.lastInsertRowid));
});
app.put("/api/wallets/:id", (req, res) => {
  const { name, address, notes, coin } = req.body || {};
  const detected = coin || detectCoin(address);
  db.prepare("UPDATE wallets SET name=?, address=?, notes=?, coin=? WHERE id=?").run(
    name,
    address,
    notes || "",
    detected,
    req.params.id
  );
  res.json(db.prepare("SELECT * FROM wallets WHERE id = ?").get(req.params.id));
});
app.delete("/api/wallets/:id", (req, res) => {
  db.prepare("DELETE FROM wallets WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/pools", (_req, res) => res.json(listPools()));
app.post("/api/pools", (req, res) => {
  const { name, host, port, password, suggested_difficulty, coin, site } = req.body || {};
  if (!name || !host || !port) return res.status(400).json({ error: "nombre, host y puerto requeridos" });
  const r = db
    .prepare(
      "INSERT INTO pools (name, host, port, password, suggested_difficulty, coin, site) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      name,
      normalizeHost(host),
      Number(port),
      password || "x",
      suggested_difficulty ?? null,
      coin || "",
      site || siteFromHost(host)
    );
  res.json(db.prepare("SELECT * FROM pools WHERE id = ?").get(r.lastInsertRowid));
});
app.put("/api/pools/:id", (req, res) => {
  const { name, host, port, password, suggested_difficulty, coin, site } = req.body || {};
  db.prepare(
    "UPDATE pools SET name=?, host=?, port=?, password=?, suggested_difficulty=?, coin=?, site=? WHERE id=?"
  ).run(
    name,
    normalizeHost(host),
    Number(port),
    password || "x",
    suggested_difficulty ?? null,
    coin || "",
    site || siteFromHost(host),
    req.params.id
  );
  res.json(db.prepare("SELECT * FROM pools WHERE id = ?").get(req.params.id));
});
app.delete("/api/pools/:id", (req, res) => {
  db.prepare("DELETE FROM pools WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

function saveImportedPools(found) {
  const existing = db.prepare("SELECT host, port FROM pools").all();
  const have = new Set(existing.map((p) => `${String(p.host).toLowerCase()}:${p.port}`));
  const inserted = [];
  const skipped = [];
  const ins = db.prepare(
    "INSERT INTO pools (name, host, port, password, coin, site) VALUES (?, ?, ?, 'x', ?, ?)"
  );
  for (const p of found) {
    const key = `${p.host.toLowerCase()}:${p.port}`;
    if (have.has(key)) {
      skipped.push(p);
      continue;
    }
    ins.run(p.name, p.host, p.port, p.coin || "", p.site || siteFromHost(p.host));
    have.add(key);
    inserted.push(p);
  }
  return { found: found.length, inserted: inserted.length, skipped: skipped.length, pools: inserted };
}

app.post("/api/pools/import", async (req, res) => {
  try {
    const found = await importFromUrl(req.body?.url);
    res.json(saveImportedPools(found));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get("/api/pools/import/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  try {
    const url = String(req.query.url || "");
    const found = await importFromUrl(url, (msg) => send({ type: "log", msg }));
    send({ type: "log", msg: "Guardando pools nuevos sin tocar los existentes…" });
    const result = saveImportedPools(found);
    send({
      type: "log",
      msg: `Listo: ${result.found} encontrados, ${result.inserted} nuevos, ${result.skipped} ya estaban.`,
    });
    send({ type: "done", ...result });
  } catch (e) {
    send({ type: "error", error: String(e.message || e) });
  }
  res.end();
});

app.get("/api/configs", (_req, res) => res.json(listConfigs()));
app.post("/api/configs", (req, res) => {
  const { name, pool_id, wallet_id, worker, fallback_pool_id, password } = req.body || {};
  if (!name || !pool_id || !wallet_id) {
    return res.status(400).json({ error: "nombre, pool y wallet requeridos" });
  }
  const r = db
    .prepare(
      "INSERT INTO configs (name, pool_id, wallet_id, worker, fallback_pool_id, password) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(name, pool_id, wallet_id, worker || "", fallback_pool_id || null, password || "x");
  res.json(listConfigs().find((c) => c.id === Number(r.lastInsertRowid)));
});
app.put("/api/configs/:id", (req, res) => {
  const { name, pool_id, wallet_id, worker, fallback_pool_id, password } = req.body || {};
  db.prepare(
    "UPDATE configs SET name=?, pool_id=?, wallet_id=?, worker=?, fallback_pool_id=?, password=? WHERE id=?"
  ).run(name, pool_id, wallet_id, worker || "", fallback_pool_id || null, password || "x", req.params.id);
  res.json(listConfigs().find((c) => c.id === Number(req.params.id)));
});
app.delete("/api/configs/:id", (req, res) => {
  db.prepare("DELETE FROM configs WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

function withHistory(device) {
  const since = Date.now() - 6 * 60 * 60 * 1000;
  const history = db
    .prepare("SELECT ts, hashrate FROM hashrate_samples WHERE mac=? AND ts>=? ORDER BY ts ASC")
    .all(device.mac, since);
  return { ...device, history };
}

async function decorate(device) {
  try {
    return withHistory(await attachStats(device, listPools()));
  } catch {
    return withHistory(device);
  }
}

function recordSample(d) {
  if (!d?.mac || !d.online) return;
  db.prepare("INSERT INTO hashrate_samples (mac, ts, hashrate) VALUES (?, ?, ?)").run(
    d.mac,
    Date.now(),
    Number(d.hashRate || 0)
  );
  db.prepare("DELETE FROM hashrate_samples WHERE ts < ?").run(Date.now() - 24 * 60 * 60 * 1000);
}

app.get("/api/devices", async (_req, res) => {
  res.json(await Promise.all([...cache.values()].map(decorate)));
});

app.post("/api/devices/scan", async (_req, res) => {
  try {
    const result = await scanNetwork();
    cache.clear();
    for (const d of result.devices) {
      cache.set(d.mac, d);
      recordSample(d);
    }
    res.json({ ...result, devices: await Promise.all(result.devices.map(decorate)) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/devices/refresh", async (_req, res) => {
  const ips = [...new Set([...cache.values()].map((d) => d.ip).filter(Boolean))];
  await Promise.all(
    ips.map(async (ip) => {
      try {
        const d = await probe(ip);
        cache.set(d.mac, d);
        recordSample(d);
      } catch {
        for (const [mac, prev] of cache) {
          if (prev.ip === ip) cache.set(mac, { ...prev, online: false });
        }
      }
    })
  );
  res.json(await Promise.all([...cache.values()].map(decorate)));
});

app.get("/api/schedules", (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT s.*, c.name AS config_name FROM schedules s
         JOIN configs c ON c.id = s.config_id ORDER BY s.id DESC`
      )
      .all()
  );
});
app.post("/api/schedules", (req, res) => {
  const { name, config_id, device_mac, kind, time, run_at, days, restart, enabled } = req.body || {};
  if (!name || !config_id) return res.status(400).json({ error: "nombre y configuración requeridos" });
  const r = db
    .prepare(
      `INSERT INTO schedules (name, config_id, device_mac, kind, time, run_at, days, restart, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      config_id,
      device_mac || null,
      kind || "daily",
      time || null,
      run_at || null,
      days || "",
      restart ? 1 : 0,
      enabled === false ? 0 : 1
    );
  res.json(db.prepare("SELECT * FROM schedules WHERE id=?").get(r.lastInsertRowid));
});
app.put("/api/schedules/:id", (req, res) => {
  const { name, config_id, device_mac, kind, time, run_at, days, restart, enabled } = req.body || {};
  db.prepare(
    `UPDATE schedules SET name=?, config_id=?, device_mac=?, kind=?, time=?, run_at=?, days=?, restart=?, enabled=? WHERE id=?`
  ).run(
    name,
    config_id,
    device_mac || null,
    kind || "daily",
    time || null,
    run_at || null,
    days || "",
    restart ? 1 : 0,
    enabled === false ? 0 : 1,
    req.params.id
  );
  res.json(db.prepare("SELECT * FROM schedules WHERE id=?").get(req.params.id));
});
app.delete("/api/schedules/:id", (req, res) => {
  db.prepare("DELETE FROM schedules WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/devices/identify", async (req, res) => {
  try {
    const d = [...cache.values()].find((x) => x.ip === req.body.ip);
    await identify(req.body.ip, d?.kind);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

function buildStratumPayload(configId) {
  const cfg = listConfigs().find((c) => c.id === Number(configId));
  if (!cfg) throw new Error("configuración no encontrada");
  const pool = db.prepare("SELECT * FROM pools WHERE id=?").get(cfg.pool_id);
  const wallet = db.prepare("SELECT * FROM wallets WHERE id=?").get(cfg.wallet_id);
  const user = cfg.worker ? `${wallet.address}.${cfg.worker}` : wallet.address;
  const payload = {
    stratumURL: normalizeHost(pool.host),
    stratumPort: Number(pool.port),
    stratumUser: user,
    stratumPassword: cfg.password || pool.password || "x",
  };
  if (pool.suggested_difficulty) {
    payload.stratumSuggestedDifficulty = Number(pool.suggested_difficulty);
  }
  if (cfg.fallback_pool_id) {
    const fb = db.prepare("SELECT * FROM pools WHERE id=?").get(cfg.fallback_pool_id);
    payload.fallbackStratumURL = normalizeHost(fb.host);
    payload.fallbackStratumPort = Number(fb.port);
    payload.fallbackStratumUser = user;
    payload.fallbackStratumPassword = fb.password || "x";
  }
  return { payload, cfg };
}

app.post("/api/devices/apply", async (req, res) => {
  const { configId, ips, restart: doRestart } = req.body || {};
  try {
    const { payload, cfg } = buildStratumPayload(configId);
    const targets = ips?.length ? ips : [...cache.values()].filter((d) => d.online).map((d) => d.ip);
    const results = [];
    for (const ip of targets) {
      try {
        const d = [...cache.values()].find((x) => x.ip === ip);
        await applyPool(ip, payload, d?.kind);
        if (doRestart) {
          try {
            await restart(ip, d?.kind);
          } catch {
            /* some firmware closes the socket immediately */
          }
        }
        results.push({ ip, ok: true });
      } catch (e) {
        results.push({ ip, ok: false, error: String(e.message || e) });
      }
    }
    res.json({ config: cfg.name, payload, results });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

function publicMrrUser(u) {
  const key = u.api_key || "";
  return {
    id: u.id,
    name: u.name,
    mrr_username: u.mrr_username || "",
    active: Boolean(u.active),
    key_hint: key.length > 4 ? `…${key.slice(-4)}` : "••••",
  };
}

function mrrKeys() {
  const u = db.prepare("SELECT * FROM mrr_users WHERE active = 1").get();
  if (!u) throw new Error("Crea o activa un usuario MRR en la base de datos");
  return { key: u.api_key, secret: u.api_secret, user: u };
}

function hashToGhs(hash, type) {
  const n = Number(hash || 0);
  const t = String(type || "").toLowerCase();
  if (t.startsWith("t")) return n * 1000;
  if (t.startsWith("g")) return n;
  if (t.startsWith("m")) return n / 1000;
  if (t.startsWith("k")) return n / 1e6;
  return n / 1e9;
}

app.get("/api/donate", (_req, res) => {
  res.json({ btc: "bc1q9uytz2fa2vpary75ntt3d4vjeag6vcj48zu74w" });
});

app.get("/api/mrr/users", (_req, res) => {
  const users = db.prepare("SELECT * FROM mrr_users ORDER BY id").all().map(publicMrrUser);
  const active = users.find((u) => u.active) || null;
  res.json({ users, active });
});

app.post("/api/mrr/users", async (req, res) => {
  try {
    const { name, key, secret } = req.body || {};
    if (!name || !key || !secret) return res.status(400).json({ error: "nombre, key y secret requeridos" });
    const acct = await mrrRequest(key.trim(), secret.trim(), "GET", "/account");
    const uname = acct?.username || acct?.name || "";
    const count = db.prepare("SELECT COUNT(*) AS c FROM mrr_users").get().c;
    const makeActive = count === 0 || req.body.activate ? 1 : 0;
    if (makeActive) db.prepare("UPDATE mrr_users SET active = 0").run();
    const r = db
      .prepare(
        "INSERT INTO mrr_users (name, api_key, api_secret, mrr_username, active) VALUES (?, ?, ?, ?, ?)"
      )
      .run(name.trim(), key.trim(), secret.trim(), uname, makeActive);
    const row = db.prepare("SELECT * FROM mrr_users WHERE id=?").get(r.lastInsertRowid);
    res.json(publicMrrUser(row));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put("/api/mrr/users/:id", async (req, res) => {
  try {
    const cur = db.prepare("SELECT * FROM mrr_users WHERE id=?").get(req.params.id);
    if (!cur) return res.status(404).json({ error: "usuario no encontrado" });
    const name = req.body.name || cur.name;
    const key = req.body.key ? String(req.body.key).trim() : cur.api_key;
    const secret = req.body.secret ? String(req.body.secret).trim() : cur.api_secret;
    let uname = cur.mrr_username;
    if (req.body.key || req.body.secret) {
      const acct = await mrrRequest(key, secret, "GET", "/account");
      uname = acct?.username || acct?.name || cur.mrr_username;
    }
    db.prepare("UPDATE mrr_users SET name=?, api_key=?, api_secret=?, mrr_username=? WHERE id=?").run(
      name,
      key,
      secret,
      uname,
      cur.id
    );
    res.json(publicMrrUser(db.prepare("SELECT * FROM mrr_users WHERE id=?").get(cur.id)));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post("/api/mrr/users/:id/activate", (req, res) => {
  const cur = db.prepare("SELECT * FROM mrr_users WHERE id=?").get(req.params.id);
  if (!cur) return res.status(404).json({ error: "usuario no encontrado" });
  db.prepare("UPDATE mrr_users SET active = 0").run();
  db.prepare("UPDATE mrr_users SET active = 1 WHERE id=?").run(cur.id);
  res.json(publicMrrUser(db.prepare("SELECT * FROM mrr_users WHERE id=?").get(cur.id)));
});

app.delete("/api/mrr/users/:id", (req, res) => {
  const was = db.prepare("SELECT * FROM mrr_users WHERE id=?").get(req.params.id);
  db.prepare("DELETE FROM mrr_users WHERE id=?").run(req.params.id);
  if (was?.active) {
    const next = db.prepare("SELECT id FROM mrr_users ORDER BY id LIMIT 1").get();
    if (next) db.prepare("UPDATE mrr_users SET active = 1 WHERE id=?").run(next.id);
  }
  res.json({ ok: true });
});

app.get("/api/mrr/status", (_req, res) => {
  const active = db.prepare("SELECT * FROM mrr_users WHERE active = 1").get();
  res.json({
    configured: Boolean(active),
    users: db.prepare("SELECT * FROM mrr_users ORDER BY id").all().map(publicMrrUser),
    active: active ? publicMrrUser(active) : null,
  });
});

app.get("/api/mrr/rentals", async (_req, res) => {
  try {
    const { key, secret } = mrrKeys();
    const acct = await mrrRequest(key, secret, "GET", "/account");
    const list = await mrrRequest(key, secret, "GET", "/rental", {
      type: "renter",
      history: "false",
      limit: 100,
    });
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
    res.json({ account: acct?.username || acct?.name || "", rentals });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post("/api/mrr/apply", async (req, res) => {
  try {
    const { configId, ids } = req.body || {};
    const { payload, cfg } = buildStratumPayload(configId);
    const { key, secret } = mrrKeys();
    const targets = ids?.length ? ids.map(String) : [];
    if (!targets.length) return res.status(400).json({ error: "Ningún alquiler seleccionado" });
    const results = [];
    for (const id of targets) {
      try {
        await mrrRequest(key, secret, "PUT", `/rental/${id}/pool/0`, {
          host: payload.stratumURL,
          port: payload.stratumPort,
          user: payload.stratumUser,
          pass: payload.stratumPassword || "x",
        });
        if (payload.fallbackStratumURL) {
          try {
            await mrrRequest(key, secret, "PUT", `/rental/${id}/pool/1`, {
              host: payload.fallbackStratumURL,
              port: payload.fallbackStratumPort,
              user: payload.fallbackStratumUser,
              pass: payload.fallbackStratumPassword || "x",
            });
          } catch {
            /* optional */
          }
        }
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: String(e.message || e) });
      }
    }
    res.json({ config: cfg.name, algo: algoFromCoin(cfg.pool_coin), results });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

const dist = path.join(__dirname, "..", "dist");
app.use(express.static(dist));
app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(dist, "index.html"), (err) => {
    if (err) next();
  });
});

const server = http.createServer(app);

function start() {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off("listening", onListen);
      reject(err);
    };
    const onListen = () => {
      server.off("error", onError);
      console.log(`SHA-256 Manager v${VERSION} en http://127.0.0.1:${PORT}`);
      resolve(server);
    };
    server.once("error", onError);
    server.once("listening", onListen);
    server.listen(PORT, "127.0.0.1");
  });
}

startScheduler(db, {
  cache,
  buildStratumPayload,
  patchSystem: async (ip, payload) => {
    const d = [...cache.values()].find((x) => x.ip === ip);
    return applyPool(ip, payload, d?.kind);
  },
  restart: async (ip) => {
    const d = [...cache.values()].find((x) => x.ip === ip);
    return restart(ip, d?.kind);
  },
});

if (require.main === module) {
  start().catch((err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`El puerto ${PORT} está ocupado. Cierra la otra instancia y vuelve a intentar.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

module.exports = { start, PORT };
