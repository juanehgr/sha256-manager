const { execFileSync, spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

function ghToken() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
    return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  }
  try {
    const out = execFileSync(process.platform === "win32" ? "gh.exe" : "gh", ["auth", "token"], {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    return String(out || "").trim();
  } catch {
    return "";
  }
}

const token = ghToken();
if (!token) {
  console.error('Falta GH_TOKEN. En PowerShell:  $env:GH_TOKEN = (gh auth token)');
  process.exit(1);
}

const env = { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token };
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status || 1);
}

run(npm, ["run", "build"]);
run(npx, ["electron-builder", "--win", "--publish", "always"]);
