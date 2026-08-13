const { coinFromStratum } = require("./coin");

const cache = { at: 0, coins: {}, pools: [] };

const POOL_HINTS = [
  { re: /antpool/i, name: "AntPool" },
  { re: /f2pool/i, name: "F2Pool" },
  { re: /foundry/i, name: "Foundry USA" },
  { re: /viabtc|via\.btc/i, name: "ViaBTC" },
  { re: /slush|braiins/i, name: "Braiins Pool" },
  { re: /spider/i, name: "SpiderPool" },
  { re: /binance/i, name: "Binance Pool" },
  { re: /secpool/i, name: "SECPOOL" },
  { re: /ocean/i, name: "Ocean" },
  { re: /ckpool/i, name: "CKPool" },
  { re: /public-pool|publicpool/i, name: "Public Pool" },
  { re: /solopool/i, name: "Solo" },
  { re: /emcd/i, name: "EMCD" },
  { re: /luxor/i, name: "Luxor" },
  { re: /marapool/i, name: "MARA Pool" },
];

async function refresh() {
  if (Date.now() - cache.at < 5 * 60 * 1000 && Object.keys(cache.coins).length) return;
  const coins = {};
  try {
    const res = await fetch("https://api.minerstat.com/v2/coins?algo=SHA-256", {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    const list = Array.isArray(data) ? data : Object.values(data || {});
    for (const c of list) {
      const id = String(c.coin || c.ticker || "").toUpperCase();
      if (!id) continue;
      coins[id] = {
        coin: id,
        name: c.name || id,
        difficulty: Number(c.difficulty || 0),
        networkHashrate: Number(c.network_hashrate || c.nethash || 0),
      };
    }
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch("https://mempool.space/api/v1/mining/hashrate/3d");
    const d = await res.json();
    const last = (d.currentHashrate && d) || d;
    if (!coins.BTC) coins.BTC = { coin: "BTC", name: "Bitcoin" };
    if (last.currentHashrate) coins.BTC.networkHashrate = Number(last.currentHashrate);
    if (last.currentDifficulty) coins.BTC.difficulty = Number(last.currentDifficulty);
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch("https://mempool.space/api/v1/difficulty-adjustment");
    const d = await res.json();
    if (d.difficulty) {
      if (!coins.BTC) coins.BTC = { coin: "BTC", name: "Bitcoin" };
      coins.BTC.difficulty = Number(d.difficulty);
    }
  } catch {
    /* ignore */
  }
  let pools = [];
  let poolBlocks = 0;
  try {
    const res = await fetch("https://mempool.space/api/v1/mining/pools/24h");
    const d = await res.json();
    pools = d.pools || [];
    poolBlocks = Number(d.blockCount || pools.reduce((s, p) => s + Number(p.blockCount || 0), 0));
  } catch {
    pools = [];
  }
  cache.at = Date.now();
  cache.coins = coins;
  cache.pools = pools;
  cache.poolBlocks = poolBlocks;
}

function matchPool(host) {
  const h = String(host || "");
  const hint = POOL_HINTS.find((p) => p.re.test(h));
  const name = hint?.name || "";
  const pool = cache.pools.find((p) => {
    const n = String(p.name || "");
    if (name && n.toLowerCase().includes(name.split(" ")[0].toLowerCase())) return true;
    return n && h.toLowerCase().includes(n.toLowerCase().replace(/\s+/g, ""));
  });
  return { name: pool?.name || name || host, pool };
}

function detectFromDevice(d, pools = []) {
  const found = coinFromStratum(d.stratumURL || d.fallbackStratumURL || "", d.stratumPort, pools);
  if (found?.coin) return found.coin;
  if (d.coin && d.coin !== "BTC") return d.coin;
  return "";
}

function coinRecord(coin) {
  const id = String(coin || "").toUpperCase();
  if (!id) return {};
  const aliases = { FB: ["FB", "FBTC", "FRACTAL"], BTC2: ["BTC2", "BC2"], BCH2: ["BCH2"] };
  const keys = aliases[id] || [id];
  for (const k of keys) {
    if (cache.coins[k]) return cache.coins[k];
  }
  return { coin: id, name: id, difficulty: 0, networkHashrate: 0 };
}

function statsFor(coin, host) {
  const c = coinRecord(coin);
  const { name, pool } = matchPool(host);
  const netHr = Number(c.networkHashrate || 0);
  const share =
    pool && cache.poolBlocks && String(coin).toUpperCase() === "BTC"
      ? Number(pool.blockCount || 0) / cache.poolBlocks
      : 0;
  const poolHr = share && netHr ? share * netHr : 0;
  const typical = 200e12;
  return {
    coin: c.coin || coin || "",
    difficulty: c.difficulty || null,
    networkHashrate: netHr || null,
    networkMiners: netHr ? Math.round(netHr / typical) : null,
    poolName: name || null,
    poolHashrate: poolHr || null,
    poolMiners: poolHr ? Math.round(poolHr / typical) : null,
    poolShare: share || null,
  };
}

async function attachStats(device, pools = []) {
  await refresh();
  const coin = detectFromDevice(device, pools);
  const host = device.stratumURL || "";
  return { ...device, coin, coinStats: statsFor(coin, host) };
}

module.exports = { refresh, statsFor, attachStats, detectFromDevice };
