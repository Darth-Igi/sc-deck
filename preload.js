const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scDeck", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  sendHotkey: (keys) => ipcRenderer.invoke("send-hotkey", keys),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  // Config hot reload: main process notifies when config.json has changed
  onConfigChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("config-changed", listener);
    return () => ipcRenderer.removeListener("config-changed", listener);
  },
});
