import { useI18n } from "../i18n";

const DONATE_BTC = "bc1q9uytz2fa2vpary75ntt3d4vjeag6vcj48zu74w";

export default function Donate() {
  const { t } = useI18n();
  const uri = `bitcoin:${DONATE_BTC}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(uri)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(DONATE_BTC);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <h2>{t("donateTitle")}</h2>
      <p className="lead">{t("donateLead")}</p>
      <div className="card" style={{ maxWidth: 520 }}>
        <p className="pool-label">BTC (Bech32)</p>
        <p style={{ wordBreak: "break-all", fontFamily: "ui-monospace, Consolas, monospace" }}>{DONATE_BTC}</p>
        <img src={qr} alt="QR donación BTC" width={220} height={220} style={{ borderRadius: 12, background: "#fff", padding: 8 }} />
        <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
          <button className="btn primary" type="button" onClick={copy}>
            {t("copyAddr")}
          </button>
          <a className="btn" href={uri}>
            {t("openWallet")}
          </a>
        </div>
      </div>
    </div>
  );
}
