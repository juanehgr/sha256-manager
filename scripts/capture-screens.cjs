const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const dir = path.join(__dirname, "..", "docs", "screenshots");
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto("http://127.0.0.1:3847", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(dir, "01-dashboard.png"), fullPage: true });
  const tabs = [
    ["Pools", "02-pools.png"],
    ["Carteras", "03-wallets.png"],
    ["Configs", "04-configs.png"],
    ["Programación", "05-schedules.png"],
    ["MRR", "06-mrr.png"],
    ["Donar", "07-donate.png"],
  ];
  for (const [label, file] of tabs) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(dir, file), fullPage: true });
  }
  await browser.close();
  console.log("screenshots", dir);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
