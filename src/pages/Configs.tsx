import { FormEvent, useState } from "react";
import { api } from "../api";
import type { Config, Pool, Wallet } from "../types";
import { useI18n } from "../i18n";

export default function Configs({
  configs,
  pools,
  wallets,
  onChange,
  setMsg,
}: {
  configs: Config[];
  pools: Pool[];
  wallets: Wallet[];
  onChange: () => Promise<void>;
  setMsg: (s: string) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: "",
    pool_id: "",
    wallet_id: "",
    worker: "",
    password: "x",
    fallback_pool_id: "",
  });
  const [editId, setEditId] = useState<number | undefined>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.saveConfig(
        {
          name: form.name,
          pool_id: Number(form.pool_id),
          wallet_id: Number(form.wallet_id),
          worker: form.worker,
          password: form.password || "x",
          fallback_pool_id: form.fallback_pool_id ? Number(form.fallback_pool_id) : null,
        },
        editId
      );
      setForm({ name: "", pool_id: "", wallet_id: "", worker: "", password: "x", fallback_pool_id: "" });
      setEditId(undefined);
      await onChange();
      setMsg(t("savedCfg"));
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  return (
    <div>
      <h2>{t("configsTitle")}</h2>
      <p className="muted">{t("configsLead")}</p>
      <form className="row" onSubmit={onSubmit}>
        <label>
          {t("name")}
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          Pool
          <select
            value={form.pool_id}
            onChange={(e) => setForm({ ...form, pool_id: e.target.value })}
            required
          >
            <option value="">—</option>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.coin ? `${p.coin} · ` : ""}
                {p.name} ({p.host}:{p.port})
              </option>
            ))}
          </select>
        </label>
        <label>
          Wallet
          <select
            value={form.wallet_id}
            onChange={(e) => setForm({ ...form, wallet_id: e.target.value })}
            required
          >
            <option value="">—</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.coin ? `${w.coin} · ` : ""}
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("worker")}
          <input
            placeholder="gamma-salon"
            value={form.worker}
            onChange={(e) => setForm({ ...form, worker: e.target.value })}
          />
        </label>
        <label>
          {t("password")}
          <input
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="x"
          />
        </label>
        <label>
          {t("fallback")}
          <select
            value={form.fallback_pool_id}
            onChange={(e) => setForm({ ...form, fallback_pool_id: e.target.value })}
          >
            <option value="">{t("none")}</option>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" type="submit">
          {editId ? t("update") : t("addCfg")}
        </button>
      </form>
      <table>
        <thead>
          <tr>
            <th>{t("name")}</th>
            <th>Pool</th>
            <th>{t("walletWorker")}</th>
            <th>{t("passCol")}</th>
            <th>{t("fallbackCol")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {configs.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>
                {c.pool_name} ({c.pool_host}:{c.pool_port})
              </td>
              <td>
                {c.wallet_name}
                {c.worker ? `.${c.worker}` : ""}
              </td>
              <td>{c.password || "x"}</td>
              <td>{c.fallback_name || "—"}</td>
              <td>
                <button
                  className="btn"
                  onClick={() => {
                    setEditId(c.id);
                    setForm({
                      name: c.name,
                      pool_id: String(c.pool_id),
                      wallet_id: String(c.wallet_id),
                      worker: c.worker || "",
                      password: c.password || "x",
                      fallback_pool_id: c.fallback_pool_id ? String(c.fallback_pool_id) : "",
                    });
                  }}
                >
                  {t("edit")}
                </button>{" "}
                <button
                  className="btn danger"
                  onClick={() =>
                    api.deleteConfig(c.id).then(onChange).catch((e) => setMsg(e.message))
                  }
                >
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
