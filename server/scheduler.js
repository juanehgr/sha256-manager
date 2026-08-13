function startScheduler(db, { cache, buildStratumPayload, patchSystem, restart }) {
  setInterval(() => {
    tick(db, { cache, buildStratumPayload, patchSystem, restart }).catch((e) =>
      console.error("scheduler", e)
    );
  }, 20000);
}

function minuteKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function tick(db, ctx) {
  const rows = db.prepare("SELECT * FROM schedules WHERE enabled = 1").all();
  const now = new Date();
  const key = minuteKey(now);
  for (const s of rows) {
    if (s.last_run === key) continue;
    if (!isDue(s, now, key)) continue;
    try {
      const { payload } = ctx.buildStratumPayload(s.config_id);
      let ips;
      if (s.device_mac) {
        const d = [...ctx.cache.values()].find((x) => x.mac === s.device_mac);
        ips = d?.ip ? [d.ip] : [];
      } else {
        ips = [...ctx.cache.values()].filter((d) => d.online).map((d) => d.ip);
      }
      for (const ip of ips) {
        try {
          await ctx.patchSystem(ip, payload);
          if (s.restart) {
            try {
              await ctx.restart(ip);
            } catch {
              /* ignore */
            }
          }
        } catch (e) {
          console.error("schedule apply", ip, e.message);
        }
      }
      db.prepare("UPDATE schedules SET last_run=? WHERE id=?").run(key, s.id);
    } catch (e) {
      console.error("schedule", s.id, e.message);
    }
  }
}

function isDue(s, now, key) {
  if (s.kind === "once") {
    if (!s.run_at) return false;
    return now >= new Date(s.run_at) && !s.last_run;
  }
  const [hh, mm] = String(s.time || "00:00").split(":").map(Number);
  if (now.getHours() !== hh || now.getMinutes() !== mm) return false;
  if (s.kind === "weekly") {
    const days = String(s.days || "")
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => !Number.isNaN(n));
    if (days.length && !days.includes(now.getDay())) return false;
  }
  return true;
}

module.exports = { startScheduler, minuteKey };
