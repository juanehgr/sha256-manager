import { useEffect, useState } from "react";
import { api } from "./api";
import type { Config, Device, Pool, Wallet } from "./types";
import Dashboard from "./pages/Dashboard";
import Pools from "./pages/Pools";
import Wallets from "./pages/Wallets";
import Configs from "./pages/Configs";
import Schedules from "./pages/Schedules";
import Donate from "./pages/Donate";
import Mrr from "./pages/Mrr";
import ActivityLog from "./ActivityLog";
import { LogProvider } from "./LogContext";
import { I18nProvider, useI18n, type I18nKey } from "./i18n";

type Tab = "dashboard" | "pools" | "wallets" | "configs" | "schedules" | "mrr" | "donate";

function Shell() {
  const { t, lang, setLang } = useI18n();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [devices, setDevices] = useState<Device[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [msg, setMsg] = useState("");
  const [version, setVersion] = useState("0.1.0");

  async function reloadLib() {
    const [p, w, c] = await Promise.all([api.pools(), api.wallets(), api.configs()]);
    setPools(p as Pool[]);
    setWallets(w as Wallet[]);
    setConfigs(c as Config[]);
  }

  useEffect(() => {
    reloadLib().catch((e) => setMsg(String(e.message)));
    api.devices().then((d) => setDevices(d as Device[])).catch(() => undefined);
    fetch("/api/version")
      .then((r) => r.json())
      .then((v) => setVersion(v.version || "0.1.0"))
      .catch(() => undefined);
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
    ["donate", "donate"],
  ];

  return (
    <div className="app">
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
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {t(key)}
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
            <Dashboard devices={devices} configs={configs} setDevices={setDevices} setMsg={setMsg} />
          )}
          {tab === "pools" && <Pools pools={pools} onChange={reloadLib} setMsg={setMsg} />}
          {tab === "wallets" && <Wallets wallets={wallets} onChange={reloadLib} setMsg={setMsg} />}
          {tab === "configs" && (
            <Configs configs={configs} pools={pools} wallets={wallets} onChange={reloadLib} setMsg={setMsg} />
          )}
          {tab === "schedules" && <Schedules configs={configs} devices={devices} setMsg={setMsg} />}
          {tab === "mrr" && <Mrr configs={configs} setMsg={setMsg} />}
          {tab === "donate" && <Donate />}
        </main>
      </div>
      <ActivityLog />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <LogProvider>
        <Shell />
      </LogProvider>
    </I18nProvider>
  );
}
