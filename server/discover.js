const os = require("os");
const Bonjour = require("bonjour-service");
const { probe } = require("./miners");

function localSubnets() {
  const nets = os.networkInterfaces();
  const subnets = [];
  for (const addrs of Object.values(nets)) {
    for (const a of addrs || []) {
      if (a.family !== "IPv4" && a.family !== 4) continue;
      if (a.internal) continue;
      const parts = a.address.split(".").map(Number);
      if (parts[0] === 127) continue;
      const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
      subnets.push({ prefix, self: a.address });
    }
  }
  return subnets;
}

async function mapLimit(items, limit, fn) {
  const out = [];
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
  return out.filter(Boolean);
}

function browseMdns(ms = 2500) {
  return new Promise((resolve) => {
    const found = [];
    let bonjour;
    try {
      const Ctor = Bonjour.Bonjour || Bonjour;
      bonjour = new Ctor();
    } catch {
      resolve([]);
      return;
    }
    const browser = bonjour.find({ type: "http" });
    const onUp = (service) => {
      const subtypes = service.subtypes || [];
      const txt = service.txt || {};
      const name = String(service.name || "").toLowerCase();
      const looksMiner =
        subtypes.includes("axeos") ||
        txt.asic ||
        txt.board ||
        /axe|antminer|whatsminer|miner|sha/i.test(name);
      const host =
        (service.referer && service.referer.address) ||
        (service.addresses || []).find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x));
      if (host && (looksMiner || service.port === 80 || service.port === 4028)) found.push(host);
    };
    browser.on("up", onUp);
    setTimeout(() => {
      try {
        browser.stop();
        bonjour.destroy();
      } catch {
        /* ignore */
      }
      resolve([...new Set(found)]);
    }, ms);
  });
}

async function scanNetwork() {
  const subnets = localSubnets();
  const mdnsIps = await browseMdns(2000);
  const ips = new Set(mdnsIps);
  for (const { prefix, self } of subnets) {
    for (let i = 1; i <= 254; i++) {
      const ip = `${prefix}.${i}`;
      if (ip !== self) ips.add(ip);
    }
  }
  const devices = await mapLimit([...ips], 64, async (ip) => probe(ip));
  const byMac = new Map();
  for (const d of devices) byMac.set(d.mac, d);
  return {
    devices: [...byMac.values()],
    scanned: ips.size,
    subnets: subnets.map((s) => `${s.prefix}.0/24`),
  };
}

module.exports = { scanNetwork, localSubnets };
