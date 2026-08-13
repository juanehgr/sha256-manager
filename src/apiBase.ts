const KEY = "sha256_api";

export function getApiBase(): string {
  try {
    return String(localStorage.getItem(KEY) || "").replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function setApiBase(url: string) {
  localStorage.setItem(KEY, String(url || "").trim().replace(/\/$/, ""));
}

export function clearApiBase() {
  localStorage.removeItem(KEY);
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}

export function isNativeApp(): boolean {
  try {
    return Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function normalizeHost(input: string): string {
  let s = String(input || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s.replace(/\/$/, "");
}
