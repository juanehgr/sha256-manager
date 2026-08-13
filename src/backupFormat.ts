export const BACKUP_KIND = "sha256-manager-backup";
export const BACKUP_VER = 1;

export type BackupData = {
  wallets: Record<string, unknown>[];
  pools: Record<string, unknown>[];
  configs: Record<string, unknown>[];
  settings: Record<string, string>;
  mrr_users: Record<string, unknown>[];
  schedules: Record<string, unknown>[];
};

export type BackupDoc = {
  kind: string;
  v: number;
  created: string;
  hash: string;
  data: BackupData;
};

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function canonicalData(data: BackupData): string {
  return JSON.stringify({
    wallets: data.wallets || [],
    pools: data.pools || [],
    configs: data.configs || [],
    settings: data.settings || {},
    mrr_users: data.mrr_users || [],
    schedules: data.schedules || [],
  });
}

export async function wrapBackup(data: BackupData): Promise<BackupDoc> {
  const created = new Date().toISOString();
  const hash = await sha256Hex(canonicalData(data));
  return { kind: BACKUP_KIND, v: BACKUP_VER, created, hash, data };
}

export function toShareCode(doc: BackupDoc): string {
  const json = JSON.stringify(doc);
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `S2561.${b64}`;
}

export function parseBackup(raw: string): BackupDoc {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Vacío");
  let doc: BackupDoc;
  if (text.startsWith("S2561.")) {
    let b64 = text.slice(6).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    doc = JSON.parse(decodeURIComponent(escape(atob(b64))));
  } else {
    doc = JSON.parse(text);
  }
  if (doc?.kind !== BACKUP_KIND || !doc.data) throw new Error("No es una copia de SHA-256 Manager");
  return doc;
}
