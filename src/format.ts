export function formatScaled(n: number, suffix = ""): string {
  if (!Number.isFinite(n)) return "—";
  const units = ["", "K", "M", "G", "T", "P"];
  let x = Math.abs(n);
  let i = 0;
  while (x >= 1000 && i < units.length - 1) {
    x /= 1000;
    i += 1;
  }
  const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
  let s = x.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return `${s} ${units[i]}${suffix}`.replace(/\s+/g, " ").trim();
}

/** Hashrate stored as GH/s. */
export function formatHashrate(ghs: number | null | undefined): string {
  if (ghs == null || !Number.isFinite(Number(ghs))) return "—";
  return formatScaled(Number(ghs) * 1e9, "H/s");
}

export function formatDiff(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim();
    if (/^[0-9.]+$/.test(cleaned)) return formatScaled(Number(cleaned));
    const m = cleaned.match(/^([0-9.]+)\s*([KMGTkmgt])$/);
    if (m) {
      const mul = { k: 1e3, m: 1e6, g: 1e9, t: 1e12 }[m[2].toLowerCase()] || 1;
      return formatScaled(Number(m[1]) * mul);
    }
    return v;
  }
  return formatScaled(v);
}

export function formatUptime(sec: number | undefined): string {
  if (!sec) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
