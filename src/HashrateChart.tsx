import { formatHashrate } from "./format";

export default function HashrateChart({
  points,
  label,
}: {
  points: { ts: number; hashrate: number }[];
  label?: string;
}) {
  if (!points?.length || points.filter((p) => p.hashrate > 0).length < 2) {
    return null;
  }
  const vals = points.map((p) => p.hashrate);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.08 || max * 0.05 || 1;
  const y0 = Math.max(0, min - pad);
  const y1 = max + pad;
  const span = y1 - y0 || 1;
  const w = 420;
  const h = 150;
  const left = 78;
  const right = 10;
  const top = 8;
  const bottom = 24;
  const iw = w - left - right;
  const ih = h - top - bottom;
  const t0 = points[0].ts;
  const t1 = points[points.length - 1].ts;
  const xAt = (ts: number) => left + ((ts - t0) / Math.max(t1 - t0, 1)) * iw;
  const yAt = (v: number) => top + ih - ((v - y0) / span) * ih;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(p.ts).toFixed(1)},${yAt(p.hashrate).toFixed(1)}`)
    .join(" ");
  const area = `${d} L${xAt(t1).toFixed(1)},${top + ih} L${xAt(t0).toFixed(1)},${top + ih} Z`;
  const ticks = [y0, y0 + span / 2, y1];
  const times = [t0, t0 + (t1 - t0) / 2, t1];
  const fmtT = (ts: number) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="chart-wrap">
      <div className="chart-head">
        <span>{label || "H/s"}</span>
        <strong>{formatHashrate(vals[vals.length - 1])}</strong>
      </div>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={left} x2={w - right} y1={yAt(v)} y2={yAt(v)} className="chart-grid" />
            <text x={left - 6} y={yAt(v) + 4} className="chart-axis" textAnchor="end">
              {formatHashrate(v)}
            </text>
          </g>
        ))}
        <path d={area} className="chart-fill" />
        <path d={d} className="chart-line" />
        {times.map((ts) => (
          <text key={ts} x={xAt(ts)} y={h - 4} className="chart-axis" textAnchor="middle">
            {fmtT(ts)}
          </text>
        ))}
      </svg>
    </div>
  );
}
