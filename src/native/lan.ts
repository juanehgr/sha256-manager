import { registerPlugin } from "@capacitor/core";

export type LanPlugin = {
  getIpv4: () => Promise<{ ip: string }>;
  tcpJson: (opts: { host: string; port?: number; payload: string; timeoutMs?: number }) => Promise<{ data: string }>;
};

export const Lan = registerPlugin<LanPlugin>("Lan");
