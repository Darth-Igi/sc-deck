const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scDeck", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  sendHotkey: (keys) => ipcRenderer.invoke("send-hotkey", keys),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  // Per-ship toggle memory survives app restarts (userData/deck-state.json)
  getDeckState: () => ipcRenderer.invoke("get-deck-state"),
  saveDeckState: (snapshot) => ipcRenderer.invoke("save-deck-state", snapshot),
  // Config hot reload: main process notifies when config.json has changed
  onConfigChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("config-changed", listener);
    return () => ipcRenderer.removeListener("config-changed", listener);
  },
  // Game.log events (vehicle changed/destroyed, player killed, session
  // reset, watcher status) - only fires when config.gamelog.enabled is true
  onGameEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("game-event", listener);
    return () => ipcRenderer.removeListener("game-event", listener);
  },
});
