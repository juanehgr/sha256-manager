function detectCoin(address) {
  const a = String(address || "").trim();
  if (!a) return "";
  const lower = a.toLowerCase();
  if (lower.startsWith("bitcoincash:") || (lower.startsWith("q") && a.includes("bitcoincash"))) return "BCH";
  if (lower.startsWith("ecash:")) return "XEC";
  if (lower.startsWith("ltc1") || /^[LM3][a-km-zA-HJ-NP-Z1-9]{25,}$/.test(a)) return "LTC";
  if (lower.startsWith("dgb1")) return "DGB";
  if (lower.startsWith("doge") || /^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(a)) return "DOGE";
  if (lower.startsWith("rvn1") || /^R[a-km-zA-HJ-NP-Z1-9]{25,}$/.test(a)) return "RVN";
  return "";
}

const SUBDOMAIN_COINS = {
  btc: { coin: "BTC", name: "Bitcoin" },
  bch: { coin: "BCH", name: "Bitcoin Cash" },
  bch2: { coin: "BCH2", name: "Bitcoin Cash II" },
  bc2: { coin: "BTC2", name: "Bitcoin II" },
  ltc: { coin: "LTC", name: "Litecoin" },
  doge: { coin: "DOGE", name: "Dogecoin" },
  "dgb-sha": { coin: "DGB", name: "DigiByte SHA" },
  dgb: { coin: "DGB", name: "DigiByte" },
  fb: { coin: "FB", name: "Fractal Bitcoin" },
  fractal: { coin: "FB", name: "Fractal Bitcoin" },
  xec: { coin: "XEC", name: "eCash" },
  rvn: { coin: "RVN", name: "Ravencoin" },
  bsv: { coin: "BSV", name: "Bitcoin SV" },
};

const HOST_HINTS = [
  { re: /fractal|fbtc|\.fb\.|[-_/]fb[-_/]|[-_/]fb$/i, coin: "FB", name: "Fractal Bitcoin" },
  { re: /bitcoinsv|\.bsv\.|[-_/]bsv/i, coin: "BSV", name: "Bitcoin SV" },
  { re: /bitcoincash|\.bch\.|[-_/]bch/i, coin: "BCH", name: "Bitcoin Cash" },
  { re: /digibyte|\.dgb\.|[-_/]dgb/i, coin: "DGB", name: "DigiByte" },
  { re: /ecash|\.xec\./i, coin: "XEC", name: "eCash" },
  { re: /litecoin|\.ltc\./i, coin: "LTC", name: "Litecoin" },
  { re: /dogecoin|\.doge\./i, coin: "DOGE", name: "Dogecoin" },
  { re: /bitcoin.?ii|\.bc2\./i, coin: "BTC2", name: "Bitcoin II" },
  { re: /\.btc\.|[-_/]btc[-_/]/i, coin: "BTC", name: "Bitcoin" },
];

const NAME_HINTS = [
  { re: /fractal|\bfb\b|fbtc/i, coin: "FB", name: "Fractal Bitcoin" },
  { re: /\bbsv\b|bitcoin sv/i, coin: "BSV", name: "Bitcoin SV" },
  { re: /\bbch\b|bitcoin cash/i, coin: "BCH", name: "Bitcoin Cash" },
  { re: /\bdgb\b|digibyte/i, coin: "DGB", name: "DigiByte" },
  { re: /\bbtc\b|bitcoin(?!\s*(cash|sv|ii|2))/i, coin: "BTC", name: "Bitcoin" },
];

function domainKey(host) {
  const h = String(host || "")
    .toLowerCase()
    .replace(/^stratum\+tcp:\/\//, "")
    .replace(/:\d+$/, "");
  const parts = h.split(".").filter(Boolean);
  if (parts.length < 2) return h;
  return parts.slice(-2).join(".");
}

function coinFromHost(host) {
  const h = String(host || "").toLowerCase();
  const m = h.match(/^([a-z0-9-]+)\./);
  if (m && SUBDOMAIN_COINS[m[1]]) return SUBDOMAIN_COINS[m[1]];
  const hit = HOST_HINTS.find((x) => x.re.test(h));
  if (hit) return { coin: hit.coin, name: hit.name };
  return null;
}

function coinFromName(name) {
  const hit = NAME_HINTS.find((x) => x.re.test(String(name || "")));
  return hit ? { coin: hit.coin, name: hit.name } : null;
}

function coinFromStratum(host, port, pools = []) {
  const h = String(host || "").toLowerCase();
  const p = Number(port);
  const fromHost = coinFromHost(h);
  if (fromHost) return fromHost;

  const domain = domainKey(h);
  const matches = (pools || []).filter((row) => {
    if (p && Number(row.port) !== p) return false;
    return domainKey(row.host) === domain || String(row.host || "").toLowerCase() === h;
  });
  for (const row of matches) {
    if (row.coin) return { coin: String(row.coin).toUpperCase(), name: row.coin };
    const n = coinFromName(row.name);
    if (n) return n;
  }
  return null;
}

module.exports = {
  detectCoin,
  SUBDOMAIN_COINS,
  coinFromHost,
  coinFromName,
  coinFromStratum,
  domainKey,
};
