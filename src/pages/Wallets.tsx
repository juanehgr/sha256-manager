import { FormEvent, useState } from "react";
import { api } from "../api";
import type { Wallet } from "../types";
import { useI18n } from "../i18n";

const empty = { name: "", address: "", notes: "", coin: "" };

function guessCoin(address: string) {
  const a = address.trim();
  const lower = a.toLowerCase();
  if (lower.startsWith("bitcoincash:") || lower.startsWith("q")) return "BCH";
  if (lower.startsWith("ecash:")) return "XEC";
  if (lower.startsWith("ltc1") || /^[LM]/.test(a)) return "LTC";
  if (lower.startsWith("dgb1")) return "DGB";
  if (/^D[5-9A-HJ-NP-U]/.test(a)) return "DOGE";
  if (lower.startsWith("rvn1") || /^R/.test(a)) return "RVN";
  return "";
}

export default function Wallets({
  wallets,
  onChange,
  setMsg,
}: {
  wallets: Wallet[];
  onChange: () => Promise<void>;
  setMsg: (s: string) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | undefined>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.saveWallet({ ...form, coin: form.coin || guessCoin(form.address) }, editId);
      setForm(empty);
      setEditId(undefined);
      await onChange();
      setMsg(t("walletSaved"));
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  return (
    <div>
      <h2>{t("wallets")}</h2>
      <p className="lead">{t("walletsLead")}</p>
      <form className="row" onSubmit={onSubmit}>
        <label>
          {t("name")}
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          {t("address")}
          <input
            placeholder="bc1q…"
            value={form.address}
            onChange={(e) => {
              const address = e.target.value;
              setForm({ ...form, address, coin: form.coin || guessCoin(address) });
            }}
            required
            style={{ minWidth: 320 }}
          />
        </label>
        <label>
          {t("coin")}
          <input value={form.coin} onChange={(e) => setForm({ ...form, coin: e.target.value })} placeholder="auto" />
        </label>
        <label>
          {t("notes")}
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <button className="btn primary" type="submit">
          {editId ? t("update") : t("addWallet")}
        </button>
      </form>
      <table>
        <thead>
          <tr>
            <th>{t("name")}</th>
            <th>{t("coin")}</th>
            <th>{t("address")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {wallets.map((w) => (
            <tr key={w.id}>
              <td>{w.name}</td>
              <td>{w.coin ? <span className="chip">{w.coin}</span> : "—"}</td>
              <td>{w.address}</td>
              <td>
                <button
                  className="btn"
                  onClick={() => {
                    setEditId(w.id);
                    setForm({ name: w.name, address: w.address, notes: w.notes || "", coin: w.coin || "" });
                  }}
                >
                  {t("edit")}
                </button>{" "}
                <button className="btn danger" onClick={() => api.deleteWallet(w.id).then(onChange).catch((e) => setMsg(e.message))}>
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
