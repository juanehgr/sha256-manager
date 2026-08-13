const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sha256Manager", {
  desktop: true,
  onUpdate: (fn) => {
    const wrap = (_e, data) => fn(data);
    ipcRenderer.on("update-status", wrap);
    return () => ipcRenderer.removeListener("update-status", wrap);
  },
  downloadUpdate: () => ipcRenderer.invoke("update-download"),
  installUpdate: () => ipcRenderer.invoke("update-install"),
});
