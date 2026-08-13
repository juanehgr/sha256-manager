const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { start, PORT } = require("../server/index.js");

const UI = `http://127.0.0.1:${PORT}`;
let win;
let updater;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

function sendUpdate(payload) {
  if (win && !win.isDestroyed()) win.webContents.send("update-status", payload);
}

function setupUpdater() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require("electron-updater");
    updater = autoUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "juanehgr",
      repo: "sha256-manager",
      private: false,
    });
    autoUpdater.on("update-available", (info) => {
      sendUpdate({ state: "available", version: info.version });
    });
    autoUpdater.on("update-not-available", () => {
      sendUpdate({ state: "none" });
    });
    autoUpdater.on("download-progress", (p) => {
      sendUpdate({ state: "downloading", percent: p.percent });
    });
    autoUpdater.on("update-downloaded", (info) => {
      sendUpdate({ state: "ready", version: info.version });
    });
    autoUpdater.on("error", (err) => {
      sendUpdate({ state: "error", message: String(err.message || err) });
    });
    autoUpdater.checkForUpdates().catch(() => undefined);
  } catch (e) {
    console.error("updater", e);
  }
}

ipcMain.handle("update-download", async () => {
  if (!updater) throw new Error("Solo en la app instalada");
  await updater.downloadUpdate();
  return true;
});

ipcMain.handle("update-install", async () => {
  if (!updater) throw new Error("Solo en la app instalada");
  updater.quitAndInstall(false, true);
  return true;
});

async function createWindow() {
  try {
    await start();
  } catch (err) {
    if (err.code !== "EADDRINUSE") {
      console.error(err);
      app.quit();
      return;
    }
  }

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0a0d12",
    title: "SHA-256 Manager",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => win.show());
  win.loadURL(UI);
  win.on("closed", () => {
    win = null;
  });
  setupUpdater();
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
