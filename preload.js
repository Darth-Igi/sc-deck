const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scDeck", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  sendHotkey: (keys) => ipcRenderer.invoke("send-hotkey", keys),
  quitApp: () => ipcRenderer.invoke("quit-app"),
});
