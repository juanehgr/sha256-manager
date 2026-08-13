export type Wallet = {
  id: number;
  name: string;
  address: string;
  notes: string;
  coin: string;
};

export type Pool = {
  id: number;
  name: string;
  host: string;
  port: number;
  password: string;
  suggested_difficulty: number | null;
  coin: string;
  site?: string;
};

export type Config = {
  id: number;
  name: string;
  pool_id: number;
  wallet_id: number;
  worker: string;
  password?: string;
  fallback_pool_id: number | null;
  pool_name: string;
  pool_host: string;
  pool_port: number;
  pool_coin?: string;
  wallet_name: string;
  wallet_address: string;
  wallet_coin?: string;
  fallback_name: string | null;
};

export type MrrRental = {
  id: string;
  name: string;
  algo: string;
  status: string;
  hashrate: number;
  hashrateNice: string;
  poolHost: string;
  poolPort: string;
  poolUser: string;
  end: string;
};

export type Sample = { ts: number; hashrate: number };

export type Device = {
  mac: string;
  ip: string;
  hostname: string;
  model: string;
  asicModel: string;
  boardVersion: string;
  firmware: string;
  hashRate: number;
  temp: number | null;
  power: number | null;
  stratumURL: string;
  stratumPort: number | null;
  stratumUser: string;
  online: boolean;
  sharesAccepted: number;
  sharesRejected: number;
  bestDiff?: string | number | null;
  bestSessionDiff?: string | number | null;
  uptimeSeconds?: number;
  history?: Sample[];
  vrTemp?: number | null;
  fanspeed?: number | null;
  fanrpm?: number | null;
  frequency?: number | null;
  coreVoltage?: number | null;
  ssid?: string;
  wifiRSSI?: number | null;
  fallbackStratumURL?: string;
  isUsingFallbackStratum?: number;
  vendor?: string;
  kind?: string;
  coin?: string;
  coinStats?: {
    coin: string;
    difficulty: number | null;
    networkHashrate: number | null;
    networkMiners: number | null;
    poolName: string | null;
    poolHashrate: number | null;
    poolMiners: number | null;
    poolShare: number | null;
  };
};

export type Schedule = {
  id: number;
  name: string;
  config_id: number;
  config_name?: string;
  device_mac: string | null;
  kind: string;
  time: string | null;
  run_at: string | null;
  days: string;
  restart: number;
  enabled: number;
  last_run: string | null;
};
