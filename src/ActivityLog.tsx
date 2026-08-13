import { useEffect, useRef } from "react";
import { useLog } from "./LogContext";
import { useI18n } from "./i18n";

export default function ActivityLog() {
  const { lines, busy } = useLog();
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo(0, box.current.scrollHeight);
  }, [lines]);
  return (
    <div className="activity">
      <div className="activity-head">
        <span>{t("activity")}</span>
        {busy && <span className="pulse">{t("inProgress")}</span>}
      </div>
      <div className="activity-body" ref={box}>
        {lines.length === 0 && <div className="muted">{t("activityEmpty")}</div>}
        {lines.map((l) => (
          <div key={l.id} className={`log-${l.kind}`}>
            <span className="log-t">{l.t}</span> {l.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
