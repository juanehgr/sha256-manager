import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "./i18n";

export type LogKind = "ia" | "ok" | "err" | "cmd";
export type LogLine = { id: number; t: string; kind: LogKind; msg: string };

type LogApi = {
  lines: LogLine[];
  busy: boolean;
  push: (msg: string, kind?: LogKind) => void;
  run: <T>(title: string, fn: (step: (msg: string) => void) => Promise<T>) => Promise<T>;
};

const Ctx = createContext<LogApi | null>(null);

export function LogProvider({ children }: { children: ReactNode }) {
  const { t, lang } = useI18n();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const loc = lang === "en" ? "en-GB" : "es-ES";
  const push = useCallback(
    (msg: string, kind: LogKind = "ia") => {
      const stamp = new Date().toLocaleTimeString(loc, { hour12: false });
      setLines((prev) => {
        const next = [...prev, { id: Date.now() + Math.random(), t: stamp, kind, msg }];
        return next.slice(-200);
      });
    },
    [loc]
  );

  const run = useCallback(
    async <T,>(title: string, fn: (step: (msg: string) => void) => Promise<T>) => {
      setBusy(true);
      push(title, "cmd");
      try {
        const result = await fn((msg) => push(msg, "ia"));
        push(t("done"), "ok");
        return result;
      } catch (e) {
        push(String((e as Error).message || e), "err");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [push, t]
  );

  const value = useMemo(() => ({ lines, busy, push, run }), [lines, busy, push, run]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLog() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLog");
  return v;
}
