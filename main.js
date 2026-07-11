const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { validateConfig } = require("./configValidation");

// nut.js direkt beim Start laden (Fix #12): schlägt das native Modul fehl,
// merken wir uns den Fehler und zeigen ihn im UI, statt erst beim ersten
// Tastendruck zu sterben.
let nut = null;
let nutLoadError = null;
try {
  nut = require("@nut-tree-fork/nut-js");
  nut.keyboard.config.autoDelayMs = 20;
} catch (err) {
  nutLoadError = `nut.js konnte nicht geladen werden: ${err.message}`;
  console.error(nutLoadError);
}

let mainWindow;

// ---- Config: lebt in userData, damit sie ein Packaging überlebt (Fix #4) ----
// Beim ersten Start wird die mitgelieferte Default-Config dorthin kopiert.
const defaultConfigPath = path.join(__dirname, "config.json");

function getUserConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function ensureUserConfig() {
  const userPath = getUserConfigPath();
  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(path.dirname(userPath), { recursive: true });
    fs.copyFileSync(defaultConfigPath, userPath);
  }
  return userPath;
}

// Lädt + validiert die Config. Wirft nie – gibt stattdessen ein
// Ergebnis-Objekt zurück, das der Renderer anzeigen kann (Fix #3, #5, #6).
function loadConfigSafe() {
  const userPath = ensureUserConfig();
  let raw;
  try {
    raw = fs.readFileSync(userPath, "utf-8");
  } catch (err) {
    return { ok: false, path: userPath, errors: [`Datei nicht lesbar: ${err.message}`] };
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    return { ok: false, path: userPath, errors: [`JSON-Fehler: ${err.message}`] };
  }

  const keyEnum = nut ? nut.Key : {};
  const { errors, warnings } = validateConfig(config, keyEnum);
  if (nutLoadError) errors.unshift(nutLoadError);

  if (errors.length > 0) {
    return { ok: false, path: userPath, errors, warnings };
  }
  return { ok: true, path: userPath, config, warnings };
}

// ---- Xeneon Edge erkennen (2560x720, notfalls: zweiter Bildschirm) ----
function findTargetDisplay() {
  const displays = screen.getAllDisplays();
  const edge = displays.find(
    (d) => d.size.width === 2560 && d.size.height === 720
  );
  if (edge) return edge;
  const primary = screen.getPrimaryDisplay();
  return displays.find((d) => d.id !== primary.id) || primary;
}

function moveToTargetDisplay() {
  if (!mainWindow) return;
  const target = findTargetDisplay();
  mainWindow.setBounds(target.bounds);
  mainWindow.setFullScreen(true);
}

function createWindow() {
  const target = findTargetDisplay();

  mainWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    frame: false,
    fullscreen: true,
    resizable: false,
    focusable: false, // Tap darf den Fokus nicht vom Spiel wegnehmen
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // Fix #13: Preload nutzt nur ipcRenderer, das geht sandboxed
    },
  });

  const devServerUrl = process.env.ELECTRON_START_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  // Fix #2: App ist ohne Fokus/Frame sonst nicht beendbar.
  // Ctrl+Alt+Q beendet von überall – auch wenn das Spiel den Fokus hat.
  globalShortcut.register("Control+Alt+Q", () => app.quit());

  // Fix #7: auf Monitor-Änderungen reagieren (Edge an-/abstecken, Standby)
  screen.on("display-added", moveToTargetDisplay);
  screen.on("display-removed", moveToTargetDisplay);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- IPC ----

ipcMain.handle("get-config", () => loadConfigSafe());

ipcMain.handle("quit-app", () => app.quit());

// Fix #1: Hotkey-Queue – Tastenversand strikt serialisieren, damit sich
// press/release zweier gleichzeitiger Taps nicht verschränken
// (sonst kann aus Ctrl+T und Alt+C kurzzeitig Ctrl+Alt+T werden).
let hotkeyQueue = Promise.resolve();

async function doSendKeys(keys) {
  if (!nut) throw new Error(nutLoadError || "nut.js nicht verfügbar");
  const { keyboard, Key } = nut;

  const keyConstants = keys.map((k) => {
    if (!(k in Key)) throw new Error(`Unbekannte Taste: ${k}`);
    return Key[k];
  });

  await keyboard.pressKey(...keyConstants);
  await keyboard.releaseKey(...keyConstants);
}

ipcMain.handle("send-hotkey", (_event, keys) => {
  // Fix #13: IPC-Eingabe validieren, bevor sie die Queue erreicht
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.length > 8 ||
    !keys.every((k) => typeof k === "string" && k.length <= 32)
  ) {
    return { ok: false, error: "Ungültige Tastenliste" };
  }

  const job = hotkeyQueue.then(async () => {
    try {
      await doSendKeys(keys);
      return { ok: true };
    } catch (err) {
      console.error("Fehler beim Senden der Tastenkombination:", err);
      return { ok: false, error: String(err) };
    }
  });
  // Queue fortführen, egal ob der Job ok war (Fehler sind im Ergebnis-Objekt)
  hotkeyQueue = job.then(() => {});
  return job;
});
