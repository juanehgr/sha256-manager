const { app, BrowserWindow } = require("electron");
const { start, PORT } = require("../server/index.js");

const UI = `http://127.0.0.1:${PORT}`;

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

  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0e1116",
    title: "SHA-256 Manager",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL(UI);
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
