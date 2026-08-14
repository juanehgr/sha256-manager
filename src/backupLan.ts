export function lanBackupUrl(host: string) {
  const raw = String(host || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!raw) throw new Error("Indica la IP del otro dispositivo");
  const hostPort = raw.split("/")[0];
  const withPort = /:\d+$/.test(hostPort) ? hostPort : `${hostPort}:3847`;
  return `http://${withPort}/api/backup/export`;
}

export async function pullLanBackup(host: string) {
  const url = lanBackupUrl(host);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  if (!(data as { kind?: string }).kind && !(data as { data?: unknown }).data) {
    throw new Error("Ese dispositivo no devolvió una copia válida");
  }
  return JSON.stringify(data);
}
