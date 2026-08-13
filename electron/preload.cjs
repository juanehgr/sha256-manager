const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("sha256Manager", { desktop: true });
