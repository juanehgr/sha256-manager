import { api } from "../api";
import { useI18n } from "../i18n";

export type UpdateInfo = {
  available?: boolean;
  latest?: string;
  current?: string;
  url?: string;
  git?: boolean;
  desktop?: boolean;
  tokenConfigured?: boolean;
  error?: string;
  status?: number;
};

export default function UpdateCard({
  upd,
  elState,
  elPercent,
  version,
  onBusy,
}: {
  upd: UpdateInfo | null;
  elState: string;
  elPercent: number;
  version: string;
  onBusy: (s: string) => void;
}) {
  const { t } = useI18n();
  const available = Boolean(upd?.available) || elState === "available" || elState === "ready" || elState === "downloading";
  const latest = upd?.latest || "";

  async function apply() {
    try {
      if (elState === "ready") {
        await window.sha256Manager?.installUpdate();
        return;
      }
      if (window.sha256Manager) {
        await window.sha256Manager.downloadUpdate();
        return;
      }
      if (upd?.git) {
        onBusy(t("updateChecking"));
        await api.applyWebUpdate();
        location.reload();
        return;
      }
      if (upd?.url) window.open(upd.url, "_blank");
    } catch (e) {
      onBusy(String((e as Error).message));
    }
  }

  return (
    <div className={`update-card ${available ? "hot" : ""}`}>
      <div>
        <div className="pool-label">{t("updateTitle")}</div>
        <strong>
          {elState === "downloading"
            ? t("updateDownloading", { p: String(Math.round(elPercent)) })
            : elState === "ready"
              ? t("updateReady", { v: latest })
              : available
                ? t("updateAvailable", { v: latest, c: upd?.current || version })
                : t("updateIdle", { c: upd?.current || version })}
        </strong>
      </div>
      {available && (
        <button className="btn primary" type="button" onClick={apply}>
          {elState === "ready" ? t("updateInstall") : t("updateNow")}
        </button>
      )}
    </div>
  );
}
