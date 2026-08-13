export default function Sparkline({ points }: { points: { ts: number; hashrate: number }[] }) {
  if (!points?.length) {
    return <div className="muted">Sin historial todavía (se rellena al refrescar).</div>;
  }
  const vals = points.map((p) => p.hashrate);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 280;
  const h = 64;
  const d = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * w;
      const y = h - 4 - ((p.hashrate - min) / span) * (h - 8);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke="#3ee0a0" strokeWidth="2" />
    </svg>
  );
}
