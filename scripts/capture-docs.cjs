const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const out = path.join(__dirname, "..", "docs", "screenshots");
fs.mkdirSync(out, { recursive: true });

const chrome =
  process.env.CHROME ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function anon(page) {
  await page.evaluate(() => {
    const hide = document.querySelector(".activity");
    if (hide) hide.style.display = "none";
    const names = ["Gamma-1", "Ultra-2", "Max-3"];
    let i = 0;
    document.querySelectorAll(".miner-head h3").forEach((h) => {
      const t = h.childNodes[0];
      if (t && t.nodeType === 3) t.nodeValue = names[i++ % names.length] + " ";
    });
    const scrub = (s) =>
      String(s)
        .replace(/bc1[a-z0-9]{8,}/gi, "bc1qexample00000000000000000000xyz")
        .replace(/ltc1[a-z0-9]{8,}/gi, "ltc1qexample00000000000000000xyz")
        .replace(/bitcoincash:[a-z0-9]+/gi, "bitcoincash:qpexample")
        .replace(/ecash:[a-z0-9]+/gi, "ecash:qpexample")
        .replace(/[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}/g, "AA:BB:CC:DD:EE:01")
        .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (m) => (m.startsWith("127.") ? m : "192.168.1.40"));
    const walk = (n) => {
      if (!n) return;
      if (n.nodeType === 3) {
        n.nodeValue = scrub(n.nodeValue);
        return;
      }
      if (n.nodeType === 1) {
        if (n.tagName === "INPUT" || n.tagName === "TEXTAREA") {
          try {
            n.value = scrub(n.value);
          } catch (e) {
            /* ignore */
          }
        }
        if (n.tagName === "IMG" && /qr|qrserver/i.test((n.alt || "") + (n.src || ""))) {
          n.src =
            "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=" +
            encodeURIComponent("bitcoin:bc1qexample00000000000000000000xyz");
        }
        [...n.childNodes].forEach(walk);
      }
    };
    walk(document.body);
    document.querySelectorAll(".grid .card h3").forEach((h) => {
      if (/active/i.test(h.textContent) || h.querySelector(".chip")) {
        h.childNodes.forEach((c) => {
          if (c.nodeType === 3 && c.nodeValue.trim()) c.nodeValue = "Demo account ";
        });
      }
    });
    const h2 = document.querySelector("h2");
    if (h2 && /wallets/i.test(h2.textContent)) {
      document.querySelectorAll("table tbody tr").forEach((tr, idx) => {
        const td = tr.querySelector("td");
        if (td) td.textContent = "Wallet " + (idx + 1);
      });
    }
  });
}

async function clickNav(page, label) {
  await page.evaluate((name) => {
    const btns = [...document.querySelectorAll("aside nav button")];
    const b = btns.find((x) => x.textContent.trim() === name);
    if (b) b.click();
  }, label);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    args: ["--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto("http://127.0.0.1:3847/", { waitUntil: "networkidle0", timeout: 20000 });
  await page.waitForSelector(".app aside nav");
  await page.evaluate(() => {
    const en = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "EN");
    if (en) en.click();
  });
  await page.addStyleTag({ content: ".activity{display:none!important}" });
  await new Promise((r) => setTimeout(r, 500));

  const shots = [
    ["Dashboard", "01-dashboard.png"],
    ["Pools", "02-pools.png"],
    ["Wallets", "03-wallets.png"],
    ["Configs", "04-configs.png"],
    ["Schedules", "05-schedules.png"],
    ["MRR", "06-mrr.png"],
    ["Donate", "07-donate.png"],
    ["Sync", "08-sync.png"],
  ];

  for (const [tab, file] of shots) {
    await clickNav(page, tab);
    await new Promise((r) => setTimeout(r, 400));
    if (tab === "Pools") {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /collapse all/i.test(x.textContent));
        if (b) b.click();
      });
      await new Promise((r) => setTimeout(r, 200));
    }
    await anon(page);
    await new Promise((r) => setTimeout(r, 150));
    const dest = path.join(out, file);
    await page.screenshot({ path: dest, type: "png" });
    console.log("wrote", dest);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
