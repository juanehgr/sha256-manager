import { useEffect, useState } from "react";
import { api } from "./api";
import { apiUrl, isNativeApp } from "./apiBase";
import type { Config, Device, Pool, Wallet } from "./types";
import Dashboard from "./pages/Dashboard";
import Pools from "./pages/Pools";
import Wallets from "./pages/Wallets";
import Configs from "./pages/Configs";
import Schedules from "./pages/Schedules";
import Backup from "./pages/Backup";
import Donate from "./pages/Donate";
import Mrr from "./pages/Mrr";
import ActivityLog from "./ActivityLog";
import { LogProvider } from "./LogContext";
import { I18nProvider, useI18n, type I18nKey } from "./i18n";

type Tab = "dashboard" | "pools" | "wallets" | "configs" | "schedules" | "mrr" | "backup" | "donate";

function Shell() {
  const { t, lang, setLang } = useI18n();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [devices, setDevices] = useState<Device[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [msg, setMsg] = useState("");
  const [version, setVersion] = useState("0.2.3");
  const [upd, setUpd] = useState<{
    available?: boolean;
    latest?: string;
    current?: string;
    url?: string;
    git?: boolean;
    desktop?: boolean;
    tokenConfigured?: boolean;
    error?: string;
    status?: number;
  } | null>(null);
  const [elState, setElState] = useState("");
  const [elPercent, setElPercent] = useState(0);
  const [hideUpd, setHideUpd] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function reloadLib() {
    const [p, w, c] = await Promise.all([api.pools(), api.wallets(), api.configs()]);
    setPools(p as Pool[]);
    setWallets(w as Wallet[]);
    setConfigs(c as Config[]);
  }

  useEffect(() => {
    reloadLib().catch((e) => setMsg(String(e.message)));
    api.devices().then((d) => setDevices(d as Device[])).catch(() => undefined);
    if (!isNativeApp()) {
      fetch(apiUrl("/api/version"))
        .then((r) => r.json())
        .then((v) => setVersion(v.version || "0.2.3"))
        .catch(() => undefined);
    }
    function pollUpdate() {
      api
        .updateCheck()
        .then((u) => setUpd(u as typeof upd))
        .catch((e) => setUpd({ error: String(e.message), current: version, status: 404 }));
    }
    pollUpdate();
    const poll = setInterval(pollUpdate, 10 * 60 * 1000);
    const off = window.sha256Manager?.onUpdate((d) => {
      setElState(d.state || "");
      if (d.percent != null) setElPercent(d.percent);
      if (d.version) setUpd((prev) => ({ ...(prev || {}), latest: d.version, available: d.state === "available" || d.state === "ready" }));
    });
    return () => {
      clearInterval(poll);
      off?.();
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      api.refresh().then((d) => setDevices(d as Device[])).catch(() => undefined);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(""), 7000);
    return () => clearTimeout(id);
  }, [msg]);

  const tabs: [Tab, I18nKey][] = [
    ["dashboard", "dashboard"],
    ["pools", "pools"],
    ["wallets", "wallets"],
    ["configs", "configs"],
    ["schedules", "schedules"],
    ["mrr", "mrr"],
    ["backup", "backup"],
    ["donate", "donate"],
  ];

  return (
    <div className={`app ${menuOpen ? "menu-open" : ""}`}>
      <button className="menu-btn" type="button" onClick={() => setMenuOpen((v) => !v)}>
        {t("menu")}
      </button>
      {menuOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside>
        <div className="brand">
          {t("appName")}
          <span>{t("tagline")}</span>
          <small className="ver">
            {t("version")}
            {version}
          </small>
        </div>
        <nav>
          {tabs.map(([id, key]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setMenuOpen(false);
              }}
            >
              {t(key)}
              {id === "dashboard" && (upd?.available || elState === "available" || elState === "ready") ? (
                <span className="nav-dot" title={t("updateAvailable", { v: upd?.latest || "", c: version })} />
              ) : null}
            </button>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <div className="muted">
            {devices.filter((d) => d.online).length} {t("onlineMiners")}
          </div>
          <div className="lang">
            <button className={lang === "es" ? "active" : ""} type="button" onClick={() => setLang("es")}>
              {t("langEs")}
            </button>
            <button className={lang === "en" ? "active" : ""} type="button" onClick={() => setLang("en")}>
              {t("langEn")}
            </button>
          </div>
        </div>
        {tab !== "dashboard" &&
          !hideUpd &&
          (upd?.available || elState === "ready" || elState === "downloading") && (
          <div className="update-bar">
            <span>
              {elState === "downloading"
                ? t("updateDownloading", { p: String(Math.round(elPercent)) })
                : elState === "ready"
                  ? t("updateReady", { v: upd?.latest || "" })
                  : upd?.available
                    ? t("updateAvailable", { v: upd.latest || "", c: upd.current || version })
                    : t("updateNeedToken")}
            </span>
            <div className="update-actions">
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  if (elState === "ready") {
                    window.sha256Manager?.installUpdate().catch((e) => setMsg(String(e)));
                    return;
                  }
                  if (isNativeApp()) {
                    if (upd?.url) window.open(upd.url, "_blank");
                    return;
                  }
                  if (upd?.git) {
                    api
                      .applyWebUpdate()
                      .then(() => location.reload())
                      .catch((e) => setMsg(String(e.message)));
                    return;
                  }
                  if (window.sha256Manager) {
                    window.sha256Manager.downloadUpdate().catch((e) => setMsg(String(e)));
                    return;
                  }
                  if (upd?.url) window.open(upd.url, "_blank");
                }}
              >
                {elState === "ready" ? t("updateInstall") : t("updateNow")}
              </button>
              <button className="btn ghost" type="button" onClick={() => setHideUpd(true)}>
                {t("updateLater")}
              </button>
            </div>
          </div>
        )}
        {msg && (
          <div className="toast">
            <span>{msg}</span>
            <button type="button" className="toast-x" onClick={() => setMsg("")} aria-label="close">
              ×
            </button>
          </div>
        )}
        <main>
          {tab === "dashboard" && (
            <Dashboard
              devices={devices}
              configs={configs}
              setDevices={setDevices}
              setMsg={setMsg}
              upd={upd}
              elState={elState}
              elPercent={elPercent}
              version={version}
            />
          )}
          {tab === "pools" && <Pools pools={pools} onChange={reloadLib} setMsg={setMsg} />}
          {tab === "wallets" && <Wallets wallets={wallets} onChange={reloadLib} setMsg={setMsg} />}
          {tab === "configs" && (
            <Configs configs={configs} pools={pools} wallets={wallets} onChange={reloadLib} setMsg={setMsg} />
          )}
          {tab === "schedules" && <Schedules configs={configs} devices={devices} setMsg={setMsg} />}
          {tab === "mrr" && <Mrr configs={configs} setMsg={setMsg} />}
          {tab === "backup" && <Backup onChange={reloadLib} setMsg={setMsg} />}
          {tab === "donate" && <Donate />}
        </main>
      </div>
      <ActivityLog />
    </div>
  );
}

function Gate() {
  return (
    <LogProvider>
      <Shell />
    </LogProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <Gate />
    </I18nProvider>
  );
}
