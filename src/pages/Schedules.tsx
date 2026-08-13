import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import type { Config, Device, Schedule } from "../types";
import { useI18n } from "../i18n";

export default function Schedules({
  configs,
  devices,
  setMsg,
}: {
  configs: Config[];
  devices: Device[];
  setMsg: (s: string) => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Schedule[]>([]);
  const [form, setForm] = useState({
    name: "",
    config_id: "",
    device_mac: "",
    kind: "daily",
    time: "04:00",
    run_at: "",
    days: "1,2,3,4,5",
    restart: true,
    enabled: true,
  });

  async function load() {
    setRows((await api.schedules()) as Schedule[]);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [setMsg]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.saveSchedule({
        ...form,
        config_id: Number(form.config_id),
        device_mac: form.device_mac || null,
      });
      setForm({ ...form, name: "" });
      await load();
      setMsg(t("savedCfg"));
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  return (
    <div>
      <h2>{t("schedulesTitle")}</h2>
      <p className="lead">{t("schedulesLead")}</p>
      <form className="row" onSubmit={onSubmit}>
        <label>
          {t("name")}
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          {t("config")}
          <select value={form.config_id} onChange={(e) => setForm({ ...form, config_id: e.target.value })} required>
            <option value="">—</option>
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("miner")}
          <select value={form.device_mac} onChange={(e) => setForm({ ...form, device_mac: e.target.value })}>
            <option value="">{t("allOnline")}</option>
            {devices.map((d) => (
              <option key={d.mac} value={d.mac}>
                {d.hostname || d.ip}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("type")}
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="daily">{t("daily")}</option>
            <option value="weekly">{t("weekly")}</option>
            <option value="once">{t("once")}</option>
          </select>
        </label>
        {form.kind !== "once" && (
          <label>
            {t("time")}
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </label>
        )}
        {form.kind === "weekly" && (
          <label>
            {t("days")}
            <input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
          </label>
        )}
        {form.kind === "once" && (
          <label>
            {t("datetime")}
            <input type="datetime-local" value={form.run_at} onChange={(e) => setForm({ ...form, run_at: e.target.value })} />
          </label>
        )}
        <label className="switch">
          <input type="checkbox" checked={form.restart} onChange={(e) => setForm({ ...form, restart: e.target.checked })} />
          <span className="switch-ui" aria-hidden />
          <span>{t("restart")}</span>
        </label>
        <button className="btn primary" type="submit">
          {t("add")}
        </button>
      </form>
      <table>
        <thead>
          <tr>
            <th>{t("name")}</th>
            <th>{t("config")}</th>
            <th>{t("when")}</th>
            <th>{t("active")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.config_name}</td>
              <td>
                {s.kind === "once" ? s.run_at : s.kind === "weekly" ? `${s.days} @ ${s.time}` : t("dailyAt", { t: s.time || "" })}
              </td>
              <td>{s.enabled ? t("yes") : t("no")}</td>
              <td>
                <button
                  className="btn"
                  onClick={() =>
                    api
                      .saveSchedule({ ...s, enabled: !s.enabled }, s.id)
                      .then(load)
                      .catch((e) => setMsg(e.message))
                  }
                >
                  {s.enabled ? t("pause") : t("activate")}
                </button>{" "}
                <button className="btn danger" onClick={() => api.deleteSchedule(s.id).then(load).catch((e) => setMsg(e.message))}>
                  {t("del")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
