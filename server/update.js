const fs = require("fs");
const path = require("path");
const { execFile, execFileSync } = require("child_process");

const OWNER = "juanehgr";
const REPO = "sha256-manager";
const CURRENT = require("../package.json").version;

function cmpVer(a, b) {
  const pa = String(a || "")
    .replace(/^v/i, "")
    .split(".")
    .map((n) => Number(n) || 0);
  const pb = String(b || "")
    .replace(/^v/i, "")
    .split(".")
    .map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function ghCliToken() {
  try {
    const out = execFileSync(process.platform === "win32" ? "gh.exe" : "gh", ["auth", "token"], {
      timeout: 4000,
      encoding: "utf8",
      windowsHide: true,
    });
    return String(out || "").trim();
  } catch {
    return "";
  }
}

function resolveToken(explicit) {
  return (
    String(explicit || "").trim() ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    ghCliToken()
  );
}

function projectRoot() {
  return path.join(__dirname, "..");
}

function isPackagedElectron() {
  try {
    return Boolean(process.versions.electron && require("electron").app.isPackaged);
  } catch {
    return false;
  }
}

function canGitPull() {
  if (isPackagedElectron()) return false;
  return fs.existsSync(path.join(projectRoot(), ".git"));
}

async function githubLatest(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SHA256Manager",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
  let res = await fetch(url, { headers });
  if (res.status === 404) {
    res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=5`, { headers });
  }
  if (!res.ok) {
    const tagsRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/tags?per_page=5`, { headers });
    if (tagsRes.ok) {
      const tags = await tagsRes.json();
      const tag = Array.isArray(tags) && tags[0]?.name;
      if (tag) {
        return {
          tag: String(tag).replace(/^v/i, ""),
          name: tag,
          url: `https://github.com/${OWNER}/${REPO}/releases`,
          notes: "",
          published: "",
        };
      }
    }
    const err = new Error(`GitHub ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const rel = Array.isArray(data) ? data.find((r) => !r.draft) : data;
  if (!rel || rel.message) {
    const tagsRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/tags?per_page=5`, { headers });
    if (tagsRes.ok) {
      const tags = await tagsRes.json();
      const tag = Array.isArray(tags) && tags[0]?.name;
      if (tag) {
        return {
          tag: String(tag).replace(/^v/i, ""),
          name: tag,
          url: `https://github.com/${OWNER}/${REPO}/releases`,
          notes: "",
          published: "",
        };
      }
    }
    return null;
  }
  const tag = String(rel.tag_name || rel.name || "").replace(/^v/i, "");
  return {
    tag,
    name: rel.name || tag,
    url: rel.html_url,
    notes: rel.body || "",
    published: rel.published_at,
  };
}

async function check(token) {
  const latest = await githubLatest(resolveToken(token));
  if (!latest || !latest.tag) {
    return {
      current: CURRENT,
      available: false,
      desktop: isPackagedElectron(),
      git: canGitPull(),
    };
  }
  const available = cmpVer(latest.tag, CURRENT) > 0;
  return {
    current: CURRENT,
    latest: latest.tag,
    name: latest.name,
    url: latest.url,
    notes: latest.notes,
    available,
    desktop: isPackagedElectron(),
    git: canGitPull(),
  };
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: projectRoot(), windowsHide: true, timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve(String(stdout || ""));
    });
  });
}

async function applyGitUpdate() {
  if (!canGitPull()) throw new Error("Esta instalación no es un clon git");
  const git = process.platform === "win32" ? "git.exe" : "git";
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const pull = await run(git, ["pull", "--ff-only"]);
  await run(npm, ["install"]);
  await run(npm, ["run", "build"]);
  return { ok: true, pull };
}

module.exports = {
  check,
  applyGitUpdate,
  cmpVer,
  CURRENT,
  OWNER,
  REPO,
  isPackagedElectron,
  canGitPull,
  resolveToken,
};
