export type Row = Record<string, unknown>;

type Db = {
  wallets: Row[];
  pools: Row[];
  configs: Row[];
  settings: Record<string, string>;
  mrr_users: Row[];
  hashrate_samples: { mac: string; ts: number; hashrate: number }[];
  schedules: Row[];
  known_devices: Row[];
  seq: Record<string, number>;
};

const KEY = "sha256_local_db";

function empty(): Db {
  return {
    wallets: [],
    pools: [],
    configs: [],
    settings: {},
    mrr_users: [],
    hashrate_samples: [],
    schedules: [],
    known_devices: [],
    seq: { wallets: 1, pools: 1, configs: 1, mrr_users: 1, schedules: 1 },
  };
}

let mem: Db | null = null;

export function db(): Db {
  if (mem) return mem;
  let next = empty();
  try {
    next = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    next.seq = { ...empty().seq, ...(next.seq || {}) };
    next.known_devices = next.known_devices || [];
  } catch {
    next = empty();
  }
  mem = next;
  return mem;
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(db()));
}

export function nextId(table: keyof Db["seq"]) {
  const d = db();
  const id = d.seq[table] || 1;
  d.seq[table] = id + 1;
  return id;
}
