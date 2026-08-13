const { SUBDOMAIN_COINS, coinFromHost } = require("./coin");
const { normalizeHost } = require("./miners");

const JUNK_PORTS = new Set([80, 443, 8080, 8443, 3000, 5173, 22, 21, 25, 53]);
const GUIDE_PATHS = [
  "/",
  "/connect",
  "/getting-started",
  "/getting_started",
  "/help",
  "/docs",
  "/guide",
  "/start",
  "/faq",
  "/miner",
  "/stratum",
  "/setup",
  "/howto",
  "/how-to",
  "/connection",
  "/pool",
];
const API_PATHS = [
  "/api/pools",
  "/api/pools/",
  "/api/stats",
  "/api/config",
  "/api/v1/pools",
  "/api/v1/index",
  "/api/v1/stats",
];
const GUIDE_RE = /connect|getting.?start|help|guide|docs|stratum|setup|howto|faq|miner|coin|article|manual|asic|region/i;
const MAX_PAGES = 40;
const MAX_JS = 12;

function siteFromHost(host) {
  const parts = String(host || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".")
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  if (["co", "com", "net", "org", "gov"].includes(second) && last.length <= 3) {
    return parts.slice(-3).join(".");
  }
  return `${second}.${last}`;
}

function absUrl(base, href) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function decodeMaybe(s) {
  try {
    return decodeURIComponent(String(s));
  } catch {
    return String(s);
  }
}

function sameSite(hostname, site) {
  const h = String(hostname || "")
    .toLowerCase()
    .replace(/^www\./, "");
  const s = String(site || "").toLowerCase().replace(/^www\./, "");
  return h === s || h.endsWith(`.${s}`);
}

function relatedHost(hostname, site) {
  const h = String(hostname || "").toLowerCase();
  if (sameSite(h, site)) return true;
  const brand = site.split(".")[0];
  if (brand.length >= 4 && h.includes(brand)) return true;
  return false;
}

function parseHostPort(raw) {
  const s = String(raw || "")
    .replace(/stratum\+?(?:tcp|ssl|tls)?:\/\//i, "")
    .trim();
  const m = s.match(/^([a-z0-9.-]+):(\d{2,5})\b/i);
  if (!m) return null;
  return { host: m[1], port: Number(m[2]) };
}

function resolveStratumHost(extracted, pageUrl, site) {
  const host = normalizeHost(extracted);
  const pageHost = new URL(pageUrl).hostname.replace(/^www\./, "");
  if (!host) return pageHost;
  if (host === site && pageHost !== site && pageHost.endsWith(`.${site}`)) return pageHost;
  return host;
}

function coinHint(urlOrHost) {
  try {
    const h = urlOrHost.includes("://") ? new URL(urlOrHost).hostname : urlOrHost;
    const meta = coinFromHost(h);
    if (meta?.coin) return meta;
    const sub = h.split(".")[0];
    if (SUBDOMAIN_COINS[sub]) return SUBDOMAIN_COINS[sub];
    if (/^[a-z0-9]{2,6}$/i.test(sub) && sub !== "www" && sub !== "api") {
      return { coin: sub.toUpperCase(), name: sub.toUpperCase() };
    }
  } catch {
    /* ignore */
  }
  return { coin: "", name: "" };
}

async function fetchText(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 SHA256Manager/0.2", Accept: "*/*" },
      redirect: "follow",
    });
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    return { ok: res.ok, status: res.status, ct, text, url: res.url || url };
  } finally {
    clearTimeout(t);
  }
}

function extractStratumPairs(text, pageUrl, site) {
  const found = [];
  const decoded = decodeMaybe(text);
  const add = (host, port, extra = {}) => {
    const p = Number(port);
    if (!p || p < 1 || p > 65535) return;
    if (JUNK_PORTS.has(p) && !/stratum/i.test(extra.name || "")) return;
    found.push({
      host: resolveStratumHost(host, pageUrl, site),
      port: p,
      ...extra,
    });
  };

  let m;
  const proto = /stratum\+?(?:tcp|ssl|tls)?:\/\/([a-zA-Z0-9.-]+)(?::(\d+))?/gi;
  while ((m = proto.exec(decoded))) add(m[1], m[2] || 3333, { name: "stratum" });

  const ssl = /stratum\+ssl:\/\/([a-zA-Z0-9.-]+):(\d+)/gi;
  while ((m = ssl.exec(decoded))) add(m[1], m[2]);

  for (const m of decoded.matchAll(/"stratum(?:URL|Url|Host|Address)"\s*:\s*"([^"]+)"/gi)) {
    const raw = m[1].replace(/^stratum\+tcp:\/\//i, "");
    const [h, p] = raw.split(":");
    add(h, p || 3333);
  }
  const portKeys = decoded.matchAll(/"stratumPort(?:Low|Mid|High)?"\s*:\s*(\d+)/gi);
  const hostKeys = [...decoded.matchAll(/"stratumHost(?:EU|US|UK)?"\s*:\s*"([^"]+)"/gi)].map((x) => x[1]);
  const portsFound = [...portKeys].map((x) => Number(x[1]));
  for (const h of hostKeys.filter((x) => x && x !== "false")) {
    for (const p of portsFound) add(h, p);
  }

  const portObj = /info\s*:\s*"([^"]+)"\s*,\s*host\s*:\s*"([^"]+)"\s*,\s*port\s*:\s*(\d+)/gi;
  while ((m = portObj.exec(decoded))) add(m[2], m[3], { tier: m[1] });

  const hostPort = /\b((?:[a-z0-9-]+\.)+[a-z]{2,})\s*:\s*(\d{3,5})\b/gi;
  while ((m = hostPort.exec(decoded))) {
    const h = m[1];
    if (relatedHost(h, site) || /stratum|pool|solo|ckpool|braiins|ocean|kryptex|network/i.test(h)) add(h, m[2]);
  }

  for (const m of decoded.matchAll(/<option[^>]*value=["']([^"']+)["'][^>]*>([^<]*)/gi)) {
    const parsed = parseHostPort(m[1]) || parseHostPort(m[2]);
    if (parsed) add(parsed.host, parsed.port, { name: "dropdown" });
  }
  for (const m of decoded.matchAll(/<(?:option|li|button|div)[^>]*data-(?:host|url|stratum|pool)=["']([^"']+)["'][^>]*>/gi)) {
    const parsed = parseHostPort(m[1]);
    if (parsed) add(parsed.host, parsed.port, { name: "dropdown" });
  }

  const labeled = /(?:stratum\s*(?:host|url|server)|host)\s*[:=]\s*["']?([a-z0-9.-]+\.[a-z.]{2,})["']?[\s\S]{0,80}(?:port)\s*[:=]\s*["']?(\d{2,5})/gi;
  while ((m = labeled.exec(decoded))) add(m[1], m[2]);

  const labeled2 = /(?:port)\s*[:=]\s*["']?(\d{2,5})["']?[\s\S]{0,80}(?:stratum\s*(?:host|url|server)|host)\s*[:=]\s*["']?([a-z0-9.-]+\.[a-z.]{2,})/gi;
  while ((m = labeled2.exec(decoded))) add(m[2], m[1]);

  return found;
}

function extractMiningcore(json, site, pageUrl) {
  const pools = json?.pools;
  if (!Array.isArray(pools)) return [];
  const defaultHost = new URL(pageUrl).hostname.replace(/^www\./, "") || site;
  const out = [];
  for (const p of pools) {
    const coin = p.coin?.symbol || p.id || "";
    const ports = p.ports || {};
    for (const [port, meta] of Object.entries(ports)) {
      out.push({
        host: defaultHost,
        port: Number(port),
        coin,
        name: `${site} ${coin} ${meta?.name || port}`,
        site,
      });
    }
  }
  return out;
}

function extractIndexCoins(json) {
  const rows = json?.result || json?.coins || json?.pools || [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => String(r.coin || r.symbol || r.id || r.algo || "").toLowerCase())
    .filter((s) => /^[a-z0-9-]{2,12}$/.test(s));
}

function collectLinks(html, base, site) {
  const urls = new Set();
  const re = /(?:href|src)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const abs = absUrl(base, m[1]);
    if (!abs || !/^https?:/i.test(abs)) continue;
    try {
      const u = new URL(abs);
      if (!sameSite(u.hostname, site) && !relatedHost(u.hostname, site)) continue;
      if (/twitter|facebook|t\.me|discord|github|google|cloudflare|youtube/i.test(u.hostname)) continue;
      u.hash = "";
      if (/\.(png|jpe?g|gif|svg|woff2?|ttf|css|ico|webp|mp4)(\?|$)/i.test(u.pathname)) continue;
      urls.add(u.href);
    } catch {
      /* ignore */
    }
  }
  return [...urls];
}

function pushPool(out, seen, p, site) {
  const host = normalizeHost(p.host);
  const port = Number(p.port);
  if (!host || !port) return;
  if (JUNK_PORTS.has(port) && !/stratum/i.test(p.name || "")) return;
  const key = `${host.toLowerCase()}:${port}`;
  if (seen.has(key)) return;
  seen.add(key);
  const hint = coinHint(host);
  const coin = p.coin || hint.coin || "";
  const brand = site.replace(/\.(com|org|net|io|sh)$/i, "");
  const label = [...new Set([p.tier, p.name].filter((x) => x && !String(x).includes(host)))].join(" ");
  const bits = [brand, coin, label, `${host}:${port}`].filter(Boolean).join(" ");
  out.push({
    name: bits.replace(/\s+/g, " ").trim(),
    host,
    port,
    password: "x",
    coin,
    site,
  });
}

async function importFromUrl(rawUrl, onLog = () => {}) {
  const log = (msg) => {
    try {
      onLog(msg);
    } catch {
      /* ignore */
    }
  };
  let url = String(rawUrl || "").trim();
  if (!url) throw new Error("URL requerida");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  log(`Objetivo: ${url}`);
  log("Buscando URLs de guía, APIs y desplegables…");
  const start = new URL(url);
  const site = siteFromHost(start.hostname);
  const origin = `${start.protocol}//${start.hostname}`;
  const high = [];
  const low = [];
  const queued = new Set();
  const enqueue = (href, pri = "low") => {
    if (!href || queued.has(href)) return;
    queued.add(href);
    (pri === "high" ? high : low).push(href);
  };
  const next = () => high.shift() || low.shift();

  enqueue(start.href, "high");
  for (const p of API_PATHS) enqueue(origin + p, "high");
  for (const p of GUIDE_PATHS) enqueue(origin + p, "low");

  const discovered = [];
  const seen = new Set();
  let jsCount = 0;
  let pages = 0;

  const seenBodies = new Set();
  while ((high.length || low.length) && pages < MAX_PAGES) {
    const page = next();
    if (!page) break;
    let got;
    try {
      got = await fetchText(page);
    } catch {
      continue;
    }
    if (!got?.text) continue;
    const sig = `${got.status}:${got.ct}:${got.text.length}:${got.text.slice(0, 120)}`;
    if (seenBodies.has(sig)) continue;
    seenBodies.add(sig);
    pages += 1;
    const pageUrl = got.url || page;
    log(`Visitando ${page}`);
    try {
      const text = got.text;
      const isJson = /json/i.test(got.ct) || /^\s*[{[]/.test(text);

      if (isJson) {
        try {
          const json = JSON.parse(text);
          for (const p of extractMiningcore(json, site, pageUrl)) pushPool(discovered, seen, p, site);
          for (const ticker of extractIndexCoins(json)) {
            enqueue(`${start.protocol}//${ticker}.${site}/`, "high");
            log(`Moneda detectada en API: ${ticker}`);
          }
        } catch {
          /* not json */
        }
      }

      for (const s of extractStratumPairs(text, pageUrl, site)) {
        const hint = coinHint(pageUrl);
        pushPool(discovered, seen, { ...s, coin: hint.coin, name: s.tier || hint.name }, site);
      }

      if (/html/i.test(got.ct) || text.includes("<html")) {
        for (const link of collectLinks(text, pageUrl, site)) {
          try {
            const u = new URL(link);
            if (
              GUIDE_RE.test(u.pathname + u.search) ||
              /^\/[a-z0-9+-]{2,16}\/?$/i.test(u.pathname) ||
              u.hostname !== start.hostname
            ) {
              enqueue(link, u.hostname !== start.hostname || /^\/[a-z0-9+-]{2,16}\/?$/i.test(u.pathname) ? "high" : "low");
              if (/^\/[a-z0-9+-]{2,16}\/?$/i.test(u.pathname) || /select|option|coin/i.test(u.pathname)) {
                log(`URL encontrada: ${u.pathname} (${u.hostname})`);
              }
            }
          } catch {
            /* ignore */
          }
        }
        const scripts = [...text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((x) => absUrl(pageUrl, x[1]));
        for (const src of scripts) {
          if (!src || jsCount >= MAX_JS) break;
          try {
            if (!relatedHost(new URL(src).hostname, site)) continue;
          } catch {
            continue;
          }
          jsCount += 1;
          try {
            log("Recopilando información de scripts (desplegables, regiones, puertos)…");
            const js = await fetchText(src, 15000);
            for (const s of extractStratumPairs(js.text, pageUrl, site)) {
              const hint = coinHint(pageUrl);
              pushPool(discovered, seen, { ...s, coin: hint.coin, name: s.tier || hint.name }, site);
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      log(`Página omitida (${String(e.message || e)})`);
    }
  }

  log(`Recopilación lista: ${discovered.length} endpoints stratum.`);
  return discovered;
}

module.exports = { importFromUrl, siteFromHost };
