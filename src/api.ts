async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

export const api = {
  wallets: () => req("/api/wallets"),
  saveWallet: (body: unknown, id?: number) =>
    req(id ? `/api/wallets/${id}` : "/api/wallets", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    }),
  deleteWallet: (id: number) => req(`/api/wallets/${id}`, { method: "DELETE" }),
  pools: () => req("/api/pools"),
  savePool: (body: unknown, id?: number) =>
    req(id ? `/api/pools/${id}` : "/api/pools", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    }),
  deletePool: (id: number) => req(`/api/pools/${id}`, { method: "DELETE" }),
  configs: () => req("/api/configs"),
  saveConfig: (body: unknown, id?: number) =>
    req(id ? `/api/configs/${id}` : "/api/configs", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    }),
  deleteConfig: (id: number) => req(`/api/configs/${id}`, { method: "DELETE" }),
  devices: () => req("/api/devices"),
  scan: () => req("/api/devices/scan", { method: "POST" }),
  refresh: () => req("/api/devices/refresh", { method: "POST" }),
  identify: (ip: string) =>
    req("/api/devices/identify", { method: "POST", body: JSON.stringify({ ip }) }),
  apply: (configId: number, ips: string[], restart: boolean) =>
    req("/api/devices/apply", {
      method: "POST",
      body: JSON.stringify({ configId, ips, restart }),
    }),
  importPools: (url: string) =>
    req("/api/pools/import", { method: "POST", body: JSON.stringify({ url }) }),
  schedules: () => req("/api/schedules"),
  saveSchedule: (body: unknown, id?: number) =>
    req(id ? `/api/schedules/${id}` : "/api/schedules", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    }),
  deleteSchedule: (id: number) => req(`/api/schedules/${id}`, { method: "DELETE" }),
  mrrStatus: () => req("/api/mrr/status"),
  mrrUsers: () => req("/api/mrr/users"),
  mrrAddUser: (body: { name: string; key: string; secret: string; activate?: boolean }) =>
    req("/api/mrr/users", { method: "POST", body: JSON.stringify(body) }),
  mrrUpdateUser: (id: number, body: { name?: string; key?: string; secret?: string }) =>
    req(`/api/mrr/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  mrrActivateUser: (id: number) => req(`/api/mrr/users/${id}/activate`, { method: "POST" }),
  mrrDeleteUser: (id: number) => req(`/api/mrr/users/${id}`, { method: "DELETE" }),
  mrrRentals: () => req("/api/mrr/rentals"),
  mrrApply: (configId: number, ids: string[]) =>
    req("/api/mrr/apply", { method: "POST", body: JSON.stringify({ configId, ids }) }),
};
