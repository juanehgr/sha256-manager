import { useEffect, useState } from "react";
import { api } from "../api";
import type { Config, Device, MrrRental } from "../types";
import HashrateChart from "../HashrateChart";
import { formatDiff, formatHashrate, formatUptime } from "../format";
import { useLog } from "../LogContext";
import { useI18n } from "../i18n";

export default function Dashboard({
  devices,
  configs,
  setDevices,
  setMsg,
}: {
  devices: Device[];
  configs: Config[];
  setDevices: (d: Device[]) => void;
  setMsg: (s: string) => void;
}) {
  const { t } = useI18n();
  const { run } = useLog();
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedMrr, setSelectedMrr] = useState<string[]>([]);
  const [restartAfter, setRestartAfter] = useState(true);
  const [applying, setApplying] = useState<number | null>(null);
  const [rentals, setRentals] = useState<MrrRental[]>([]);
  const [mrrOn, setMrrOn] = useState(false);

  useEffect(() => {
    let stop = false;
    async function loadMrr() {
      try {
        const s = (await api.mrrStatus()) as { configured?: boolean };
        if (!s.configured) {
          if (!stop) {
            setRentals([]);
            setMrrOn(false);
          }
          return;
        }
        const r = (await api.mrrRentals()) as { rentals?: MrrRental[] };
        if (!stop) {
          setMrrOn(true);
          setRentals(r.rentals || []);
        }
      } catch {
        if (!stop) setRentals([]);
      }
    }
    loadMrr();
    const id = setInterval(loadMrr, 30000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  async function scan() {
    setScanning(true);
    try {
      const r = await run(t("scanTitle"), async (step) => {
        step(t("scanStep"));
        return (await api.scan()) as { devices: Device[]; scanned: number; subnets: string[] };
      });
      setDevices(r.devices);
      setMsg(t("foundN", { n: r.devices.length }));
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setScanning(false);
    }
  }

  function toggle(ip: string) {
    setSelected((s) => (s.includes(ip) ? s.filter((x) => x !== ip) : [...s, ip]));
  }

  function toggleMrr(id: string) {
    setSelectedMrr((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function apply(id: number) {
    const lanPicked = selected.length > 0;
    const mrrPicked = selectedMrr.length > 0;
    const ips = lanPicked ? selected : mrrPicked ? [] : devices.filter((d) => d.online).map((d) => d.ip);
    const mrrIds = mrrPicked ? selectedMrr : lanPicked ? [] : rentals.map((r) => r.id);
    if (!ips.length && !mrrIds.length) {
      setMsg(t("noMiners"));
      return;
    }
    setApplying(id);
    try {
      const parts: string[] = [];
      if (ips.length) {
        const r = await run(t("applyCfg"), async (step) => {
          step(ips.join(", "));
          return (await api.apply(id, ips, restartAfter)) as {
            config: string;
            results: { ip: string; ok: boolean; error?: string }[];
          };
        });
        const ok = r.results.filter((x) => x.ok).length;
        parts.push(`LAN ${ok}/${r.results.length}`);
      }
      if (mrrIds.length) {
        const r = await run(t("applyMrr"), async (step) => {
          step(mrrIds.join(", "));
          return (await api.mrrApply(id, mrrIds)) as {
            config: string;
            results: { id: string; ok: boolean; error?: string }[];
          };
        });
        const ok = r.results.filter((x) => x.ok).length;
        parts.push(`MRR ${ok}/${r.results.length}`);
      }
      setMsg(parts.join(" · "));
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setApplying(null);
    }
  }

  return (
    <div>
      <div className="row">
        <button className="btn primary" onClick={scan} disabled={scanning}>
          {scanning ? t("scanning") : t("scan")}
        </button>
        <button
          className="btn"
          onClick={() => {
            setSelected(devices.filter((d) => d.online).map((d) => d.ip));
            setSelectedMrr(rentals.map((r) => r.id));
          }}
        >
          {t("selectAll")}
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            setSelected([]);
            setSelectedMrr([]);
          }}
        >
          {t("clearSel")}
        </button>
      </div>

      <div className="section-head">
        <div>
          <h2>{t("poolChange")}</h2>
          <p className="lead">{t("poolChangeLead")}</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={restartAfter} onChange={(e) => setRestartAfter(e.target.checked)} />
          <span className="switch-ui" aria-hidden />
          <span>{t("restartAfter")}</span>
        </label>
      </div>
      {configs.length === 0 && <p className="muted">{t("createCfgFirst")}</p>}
      <div className="cfg-grid">
        {configs.map((c) => {
          const coin = c.pool_coin || c.wallet_coin || "";
          return (
            <button
              key={c.id}
              type="button"
              className={`cfg-card ${applying === c.id ? "busy" : ""}`}
              disabled={applying !== null}
              onClick={() => apply(c.id)}
            >
              <div className="cfg-card-top">
                {coin ? <span className="chip">{coin}</span> : <span />}
              </div>
              <strong className="cfg-name">{applying === c.id ? "…" : c.name}</strong>
              <span className="cfg-host">
                {c.pool_host}:{c.pool_port}
              </span>
              <span className="cfg-user">
                {c.wallet_name}
                {c.worker ? `.${c.worker}` : ""}
              </span>
              <span className="cfg-apply">{t("applyNow")}</span>
            </button>
          );
        })}
      </div>

      <h2 style={{ marginTop: 28 }}>{t("miners")}</h2>
      <div className="grid miners">
        {devices.length === 0 && <div className="card muted">{t("noneFound")}</div>}
        {devices.map((d) => {
          const usingFb = Boolean(d.isUsingFallbackStratum);
          const activeHost = usingFb ? d.fallbackStratumURL : d.stratumURL;
          const hist = (d.history || []).filter((p) => p.hashrate > 0);
          const cs = d.coinStats;
          return (
            <div
              key={d.mac}
              className={`card miner ${selected.includes(d.ip) ? "selected" : ""}`}
              onClick={() => toggle(d.ip)}
            >
              <div className="miner-head">
                <h3>
                  {d.hostname || d.ip}
                  <span className={d.online ? "ok" : "off"}>{d.online ? t("online") : t("offline")}</span>
                </h3>
              </div>
              <div className="miner-body">
                <div>
                  <div className="pool-active">
                    <span className="pool-label">{usingFb ? t("poolFallback") : t("poolActive")}</span>
                    <strong>
                      {activeHost || d.stratumURL || "—"}
                      {d.stratumPort ? `:${d.stratumPort}` : ""}
                    </strong>
                    <span className="muted">{d.stratumUser || t("noUser")}</span>
                  </div>
                  <div className="metrics">
                    <span>{formatHashrate(d.hashRate)}</span>
                    <span>{d.temp != null ? `${Number(d.temp).toFixed(0)} °C` : "—"}</span>
                    <span>
                      {t("session")} {formatDiff(d.bestSessionDiff)}
                    </span>
                    <span>
                      {t("boot")} {formatDiff(d.bestDiff)}
                    </span>
                  </div>
                  {cs && (
                    <div className="coin-stats">
                      <span>
                        {t("coin")} <strong>{cs.coin || "—"}</strong>
                      </span>
                      <span>
                        {t("difficulty")} <strong>{formatDiff(cs.difficulty)}</strong>
                      </span>
                      <span>
                        {t("netHr")} <strong>{formatHashrate((cs.networkHashrate || 0) / 1e9)}</strong>
                      </span>
                      <span>
                        {t("poolMiners")} <strong>{cs.poolMiners ?? "—"}</strong>
                        {cs.poolName ? ` (${cs.poolName})` : ""}
                      </span>
                      <span>
                        {t("netMiners")} <strong>{cs.networkMiners ?? "—"}</strong>
                      </span>
                    </div>
                  )}
                  <div className="miner-meta">
                    <div>
                      {d.model} · {d.asicModel || "ASIC"} {d.boardVersion ? `· ${d.boardVersion}` : ""}
                    </div>
                    <div>
                      {d.ip} · {d.mac}
                    </div>
                    <div>
                      FW {d.firmware || "—"}
                      {d.frequency ? ` · ${d.frequency} MHz` : ""}
                      {d.coreVoltage ? ` · ${d.coreVoltage} mV` : ""}
                      {d.power != null ? ` · ${Number(d.power).toFixed(1)} W` : ""}
                      {` · ${formatUptime(d.uptimeSeconds)}`}
                    </div>
                  </div>
                </div>
                <HashrateChart points={hist} label={t("chartHr")} />
              </div>
            </div>
          );
        })}
      </div>

      {(mrrOn || rentals.length > 0) && (
        <>
          <h2 style={{ marginTop: 28 }}>{t("mrrSection")}</h2>
          <div className="grid miners">
            {rentals.length === 0 && <div className="card muted">{t("noRentals")}</div>}
            {rentals.map((r) => (
              <div
                key={r.id}
                className={`card miner ${selectedMrr.includes(r.id) ? "selected" : ""}`}
                onClick={() => toggleMrr(r.id)}
              >
                <div className="miner-head">
                  <h3>
                    {r.name} <span className="chip">MRR</span>
                    <span className="ok">{r.status || t("online")}</span>
                  </h3>
                </div>
                <div className="miner-body">
                  <div>
                    <div className="pool-active">
                      <span className="pool-label">{t("poolActive")}</span>
                      <strong>
                        {r.poolHost || "—"}
                        {r.poolPort ? `:${r.poolPort}` : ""}
                      </strong>
                      <span className="muted">{r.poolUser || t("noUser")}</span>
                    </div>
                    <div className="metrics">
                      <span>{r.hashrateNice || formatHashrate(r.hashrate)}</span>
                      <span>{r.algo}</span>
                    </div>
                    <div className="miner-meta">
                      id {r.id}
                      {r.end ? ` · ${t("until")} ${r.end}` : ""}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {devices.some((d) => d.coinStats) && <p className="muted">{t("estNote")}</p>}
    </div>
  );
}
