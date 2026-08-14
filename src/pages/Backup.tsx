import { useEffect, useState } from "react";
import { api } from "../api";
import { parseBackup, sha256Hex, canonicalData, toShareCode } from "../backupFormat";
import { useI18n } from "../i18n";

export default function Backup({ onChange, setMsg }: { onChange: () => void; setMsg: (s: string) => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [incoming, setIncoming] = useState("");
  const [lanHost, setLanHost] = useState("");
  const [fp, setFp] = useState("");
  const [hasBackup, setHasBackup] = useState(false);
  const [backupAt, setBackupAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshStatus() {
    try {
      const s = (await api.backupStatus()) as { hasBackup?: boolean; created?: string };
      setHasBackup(Boolean(s.hasBackup));
      setBackupAt(s.created || "");
    } catch {
      setHasBackup(false);
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function fetchLan() {
    setBusy(true);
    try {
      const raw = await api.pullLanBackup(lanHost);
      setIncoming(raw);
      setMsg(t("backupLanOk"));
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function exportNow() {
    setBusy(true);
    try {
      const doc = (await api.exportBackup()) as { hash?: string };
      const share = toShareCode(doc as never);
      setCode(share);
      setFp(String(doc.hash || "").slice(0, 16));
      await navigator.clipboard.writeText(share);
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sha256-manager-backup.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg(t("backupCopied"));
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function runImport(mode: "replace" | "merge") {
    if (!incoming.trim()) {
      setMsg(t("backupEmpty"));
      return;
    }
    setBusy(true);
    try {
      const doc = parseBackup(incoming);
      const expect = await sha256Hex(canonicalData(doc.data));
      if (doc.hash && doc.hash !== expect) {
        setMsg(t("backupHashMismatch"));
      }
      const r = (await api.importBackup(incoming, mode)) as { hashOk?: boolean };
      await onChange();
      await refreshStatus();
      setIncoming("");
      setMsg(r.hashOk === false ? t("backupHashMismatch") : t("backupImported"));
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      await api.restoreBackup();
      await onChange();
      await refreshStatus();
      setMsg(t("backupRestored"));
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div>
      <h2>{t("backupTitle")}</h2>
      <p className="lead">{t("backupLead")}</p>
      </div>

      <div className="card">
        <strong>{t("backupLan")}</strong>
        <p className="muted">{t("backupLanHint")}</p>
        <label className="field">
          {t("backupLanHost")}
          <input
            value={lanHost}
            onChange={(e) => setLanHost(e.target.value)}
            placeholder={t("backupLanHost")}
          />
        </label>
        <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
        <button className="btn primary" type="button" disabled={busy} onClick={fetchLan}>
          {t("backupLanFetch")}
        </button>
        </div>
      </div>

      <div className="card">
        <strong>{t("backupExport")}</strong>
        <p className="muted">{t("backupExportHint")}</p>
        <button className="btn primary" type="button" disabled={busy} onClick={exportNow}>
          {t("backupMake")}
        </button>
        {fp && (
          <p className="muted" style={{ marginTop: 10 }}>
            {t("backupFingerprint")}: <code>{fp}</code>
          </p>
        )}
        {code && <textarea readOnly rows={5} value={code} />}
      </div>

      <div className="card">
        <strong>{t("backupImport")}</strong>
        <p className="muted">{t("backupImportHint")}</p>
        <textarea
          rows={6}
          value={incoming}
          onChange={(e) => setIncoming(e.target.value)}
          placeholder={t("backupPaste")}
        />
        <input
          type="file"
          accept="application/json,.json,.txt"
          style={{ margin: "12px 0" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            f.text().then(setIncoming).catch((err) => setMsg(String(err)));
          }}
        />
        <div className="row" style={{ marginBottom: 0 }}>
          <button className="btn" type="button" disabled={busy} onClick={() => setIncoming("")}>
            {t("backupNothing")}
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => runImport("merge")}>
            {t("backupMerge")}
          </button>
          <button className="btn primary" type="button" disabled={busy} onClick={() => runImport("replace")}>
            {t("backupReplace")}
          </button>
        </div>
      </div>

      <div className="card">
        <strong>{t("backupPrev")}</strong>
        <p className="muted">
          {hasBackup ? t("backupPrevAt", { t: backupAt || "—" }) : t("backupPrevNone")}
        </p>
        <button className="btn" type="button" disabled={busy || !hasBackup} onClick={restore}>
          {t("backupRestore")}
        </button>
      </div>
    </div>
  );
}
