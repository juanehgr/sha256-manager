import { FormEvent, Fragment, useMemo, useState } from "react";
import { api } from "../api";
import type { Pool } from "../types";
import { useLog } from "../LogContext";
import { useI18n } from "../i18n";

const empty = { name: "", host: "", port: 3333, password: "x", suggested_difficulty: "", coin: "" };

export default function Pools({
  pools,
  onChange,
  setMsg,
}: {
  pools: Pool[];
  onChange: () => Promise<void>;
  setMsg: (s: string) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | undefined>();
  const [importUrl, setImportUrl] = useState("");
  const { run } = useLog();
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = pools.filter((p) => {
      if (!query) return true;
      return [p.name, p.host, p.coin, p.site, String(p.port)].join(" ").toLowerCase().includes(query);
    });
    const map = new Map<string, Pool[]>();
    for (const p of filtered) {
      const key = p.site || p.host.split(".").slice(-2).join(".") || "otros";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pools, q]);

  function isOpen(site: string) {
    return open[site] !== false;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.savePool(
        {
          ...form,
          port: Number(form.port),
          suggested_difficulty: form.suggested_difficulty ? Number(form.suggested_difficulty) : null,
        },
        editId
      );
      setForm(empty);
      setEditId(undefined);
      await onChange();
      setMsg(t("poolSaved"));
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  async function doImport() {
    setImporting(true);
    try {
      const r = await run(`Importar pools desde ${importUrl}`, async (step) => {
        step("Abriendo canal de actividad…");
        return await new Promise<{ found: number; inserted: number; skipped: number }>((resolve, reject) => {
          const es = new EventSource(`/api/pools/import/stream?url=${encodeURIComponent(importUrl)}`);
          es.onmessage = (ev) => {
            const d = JSON.parse(ev.data);
            if (d.type === "log") step(d.msg);
            if (d.type === "done") {
              es.close();
              resolve(d);
            }
            if (d.type === "error") {
              es.close();
              reject(new Error(d.error));
            }
          };
          es.onerror = () => {
            es.close();
            reject(new Error("Se cortó la conexión al importar"));
          };
        });
      });
      await onChange();
      setMsg(t("imported", { f: r.found ?? 0, n: r.inserted, s: r.skipped }));
    } catch (err) {
      setMsg(String((err as Error).message));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <h2>{t("pools")}</h2>
      <div className="import-box">
        <p className="lead">{t("importLead")}</p>
        <div className="row" style={{ marginBottom: 0 }}>
          <label style={{ flex: 1, minWidth: 280 }}>
            {t("url")}
            <input
              placeholder="https://molepool.com"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
            />
          </label>
          <button className="btn primary" type="button" onClick={doImport} disabled={importing || !importUrl.trim()}>
            {importing ? t("importing") : t("importBtn")}
          </button>
        </div>
      </div>
      <form className="row" onSubmit={onSubmit}>
        <label>
          {t("name")}
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          {t("host")}
          <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required />
        </label>
        <label>
          {t("port")}
          <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} required />
        </label>
        <label>
          {t("coin")}
          <input placeholder="auto" value={form.coin} onChange={(e) => setForm({ ...form, coin: e.target.value })} />
        </label>
        <label>
          Password
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <button className="btn primary" type="submit">
          {editId ? t("update") : t("addPool")}
        </button>
      </form>
      <div className="row">
        <label style={{ flex: 1, minWidth: 240 }}>
          {t("search")}
          <input placeholder="nombre, host, moneda, sitio…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            const next: Record<string, boolean> = {};
            for (const [site] of groups) next[site] = false;
            setOpen(next);
          }}
        >
          {t("collapseAll")}
        </button>
        <button className="btn ghost" type="button" onClick={() => setOpen({})}>
          {t("expandAll")}
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("name")}</th>
            <th>{t("coin")}</th>
            <th>{t("host")}</th>
            <th>{t("port")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([site, rows]) => (
            <Fragment key={site}>
              <tr className="group-row" onClick={() => setOpen((o) => ({ ...o, [site]: !isOpen(site) }))}>
                <td colSpan={5}>
                  {isOpen(site) ? "▾" : "▸"} {site}{" "}
                  <span className="muted">({rows.length})</span>
                </td>
              </tr>
              {isOpen(site) &&
                rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.coin ? <span className="chip">{p.coin}</span> : "—"}</td>
                    <td>{p.host}</td>
                    <td>{p.port}</td>
                    <td>
                      <button
                        className="btn"
                        onClick={() => {
                          setEditId(p.id);
                          setForm({
                            name: p.name,
                            host: p.host,
                            port: p.port,
                            password: p.password,
                            suggested_difficulty: p.suggested_difficulty ? String(p.suggested_difficulty) : "",
                            coin: p.coin || "",
                          });
                        }}
                      >
                        {t("edit")}
                      </button>{" "}
                      <button
                        className="btn danger"
                        onClick={() => api.deletePool(p.id).then(onChange).catch((e) => setMsg(e.message))}
                      >
                        {t("del")}
                      </button>
                    </td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
