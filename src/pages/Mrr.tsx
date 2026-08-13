import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import type { Config, MrrRental } from "../types";
import { useLog } from "../LogContext";
import { formatHashrate } from "../format";
import { useI18n } from "../i18n";

type MrrUser = {
  id: number;
  name: string;
  mrr_username: string;
  active: boolean;
  key_hint: string;
};

export default function Mrr({
  configs,
  setMsg,
}: {
  configs: Config[];
  setMsg: (s: string) => void;
}) {
  const { t } = useI18n();
  const { run } = useLog();
  const [users, setUsers] = useState<MrrUser[]>([]);
  const [active, setActive] = useState<MrrUser | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [account, setAccount] = useState("");
  const [rentals, setRentals] = useState<MrrRental[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [configId, setConfigId] = useState("");

  async function load() {
    const s = (await api.mrrStatus()) as { configured: boolean; users: MrrUser[]; active: MrrUser | null };
    setUsers(s.users || []);
    setActive(s.active || null);
    if (s.configured) {
      const r = (await api.mrrRentals()) as { account?: string; rentals: MrrRental[] };
      setAccount(r.account || "");
      setRentals(r.rentals || []);
    } else {
      setAccount("");
      setRentals([]);
    }
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [setMsg]);

  function resetForm() {
    setEditId(null);
    setName("");
    setKey("");
    setSecret("");
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault();
    try {
      await run(editId ? t("updateMrr") : t("addMrr"), async (step) => {
        if (editId) {
          step(t("savingDb"));
          await api.mrrUpdateUser(editId, {
            name,
            ...(key ? { key } : {}),
            ...(secret ? { secret } : {}),
          });
        } else {
          step(t("checkingHmac"));
          await api.mrrAddUser({ name, key, secret, activate: users.length === 0 });
        }
      });
      resetForm();
      await load();
      setMsg(t("mrrUserSaved"));
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  async function activate(id: number) {
    try {
      await api.mrrActivateUser(id);
      await load();
      setMsg(t("mrrUserActive"));
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  async function remove(id: number) {
    try {
      await api.mrrDeleteUser(id);
      if (editId === id) resetForm();
      await load();
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  async function refresh() {
    try {
      await run(t("syncMrr"), async (step) => {
        step("GET /rental (renter, activos)…");
        await load();
      });
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  async function apply() {
    const ids = selected.length ? selected : rentals.map((r) => r.id);
    if (!ids.length || !configId) {
      setMsg(t("pickCfg"));
      return;
    }
    try {
      const r = await run(t("applyMrr"), async (step) => {
        step(`PUT /rental/${ids.join(";")}/pool …`);
        return (await api.mrrApply(Number(configId), ids)) as {
          config: string;
          results: { id: string; ok: boolean; error?: string }[];
        };
      });
      const ok = r.results.filter((x) => x.ok).length;
      setMsg(`MRR «${r.config}» → ${ok}/${r.results.length}`);
      await load();
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  return (
    <div>
      <h2>{t("mrr")}</h2>
      <p className="lead">
        {t("mrrLead")}{" "}
        <a href="https://www.miningrigrentals.com/account" target="_blank" rel="noreferrer">
          miningrigrentals.com
        </a>
      </p>

      <div className="grid">
        {users.length === 0 && (
          <div className="card muted">{t("noMrrUsers")}</div>
        )}
        {users.map((u) => (
          <div key={u.id} className={`card miner ${u.active ? "selected" : ""}`}>
            <h3>
              {u.name} {u.active && <span className="chip">{t("activeUser")}</span>}
            </h3>
            <div className="muted">
              MRR: {u.mrr_username || "—"} · key {u.key_hint}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              {!u.active && (
                <button className="btn primary" type="button" onClick={() => activate(u.id)}>
                  {t("useThisKey")}
                </button>
              )}
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEditId(u.id);
                  setName(u.name);
                  setKey("");
                  setSecret("");
                }}
              >
                {t("change")}
              </button>
              <button className="btn danger" type="button" onClick={() => remove(u.id)}>
                {t("remove")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <form className="row" onSubmit={saveUser}>
        <label>
          {t("appNameField")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="p. ej. Juan"
            required
          />
        </label>
        <label>
          API key
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={editId ? t("leaveEmpty") : ""}
            required={!editId}
          />
        </label>
        <label>
          API secret
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={editId ? t("leaveEmpty") : ""}
            required={!editId}
          />
        </label>
        <button className="btn primary" type="submit">
          {editId ? t("saveChanges") : t("addUser")}
        </button>
        {editId && (
          <button className="btn" type="button" onClick={resetForm}>
            {t("cancel")}
          </button>
        )}
      </form>

      {active && (
        <>
          <div className="row">
            <span className="muted">
              {t("activeUser")}: {active.name}
              {account ? ` · ${account}` : ""}
            </span>
            <button className="btn" type="button" onClick={refresh}>
              {t("refreshRentals")}
            </button>
            <label>
              {t("config")}
              <select value={configId} onChange={(e) => setConfigId(e.target.value)}>
                <option value="">—</option>
                {configs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn primary" type="button" onClick={apply}>
              {t("applySelected")}
            </button>
          </div>
          <div className="grid">
            {rentals.length === 0 && <div className="card muted">{t("noRentals")}</div>}
            {rentals.map((r) => (
              <div
                key={r.id}
                className={`card miner ${selected.includes(r.id) ? "selected" : ""}`}
                onClick={() =>
                  setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))
                }
              >
                <h3>
                  {r.name} <span className="chip">MRR</span>
                </h3>
                <div className="pool-active">
                  <span className="pool-label">{t("poolOnRental")}</span>
                  <strong>
                    {r.poolHost || "—"}
                    {r.poolPort ? `:${r.poolPort}` : ""}
                  </strong>
                  <span className="muted">{r.poolUser || ""}</span>
                </div>
                <div className="metrics">
                  <span>{r.hashrateNice || formatHashrate(r.hashrate)}</span>
                  <span>{r.algo}</span>
                  <span>{r.status}</span>
                </div>
                <div className="miner-meta">
                  id {r.id}
                  {r.end ? ` · hasta ${r.end}` : ""}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
