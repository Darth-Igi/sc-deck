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
const {
  createGameLogParser,
  createGameLogTailer,
  DEFAULT_LOG_PATH,
} = require("./gamelog");

// Load nut.js right at startup: if the native module fails to load,
// remember the error and surface it in the UI instead of dying on the
// first key press.
let nut = null;
let nutLoadError = null;
try {
  nut = require("@nut-tree-fork/nut-js");
  nut.keyboard.config.autoDelayMs = 20;
} catch (err) {
  nutLoadError = `Failed to load nut.js: ${err.message}`;
  console.error(nutLoadError);
}

// Scancode sender (SendInput with KEYEVENTF_SCANCODE): preferred dispatch
// path. nut.js sends virtual keys without the extended-key flag, so games
// reading raw scancodes (Star Citizen) see RightControl/RightAlt as the
// LEFT variant. Initialized eagerly for the same fail-fast reason as
// nut.js above; nut.js stays as fallback for keys without a scancode
// mapping (e.g. Pause) and for non-Windows dev machines.
const {
  createScancodeSender,
  SCANCODE_KEY_NAMES,
  canSendViaScancodes,
} = require("./scancodeSender");

let scancodeSender = null;
let scancodeLoadError = null;
if (process.platform === "win32") {
  try {
    scancodeSender = createScancodeSender();
  } catch (err) {
    scancodeLoadError = `Failed to init scancode sender: ${err.message}`;
    console.error(scancodeLoadError);
  }
}

let mainWindow;

// ---- Config path ----
// Development (npm run dev / npm start without packaging): config.json in
// the project folder is read DIRECTLY - no copy to userData, so edits take
// effect immediately.
// Packaged app (.exe): config lives in userData (the install directory is
// read-only); on first launch the bundled default config is copied there.
const defaultConfigPath = path.join(__dirname, "config.json");

function getActiveConfigPath() {
  if (!app.isPackaged) return defaultConfigPath;

  const userPath = path.join(app.getPath("userData"), "config.json");
  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(path.dirname(userPath), { recursive: true });
    fs.copyFileSync(defaultConfigPath, userPath);
  }
  return userPath;
}

// Loads + validates the config. Never throws - returns a result object
// the renderer can display instead.
function loadConfigSafe() {
  const activePath = getActiveConfigPath();
  let raw;
  try {
    raw = fs.readFileSync(activePath, "utf-8");
  } catch (err) {
    return { ok: false, path: activePath, errors: [`File not readable: ${err.message}`] };
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    return { ok: false, path: activePath, errors: [`JSON error: ${err.message}`] };
  }

  // Valid key names = union of both dispatch paths. With the scancode
  // sender available, a broken nut.js is downgraded to a warning: every
  // key the validator then still accepts is scancode-mappable and works.
  const keyEnum = {
    ...(scancodeSender ? SCANCODE_KEY_NAMES : {}),
    ...(nut ? nut.Key : {}),
  };
  const { errors, warnings } = validateConfig(config, keyEnum);
  if (nutLoadError) {
    if (scancodeSender) warnings.unshift(`${nutLoadError} (scancode sender active, unmapped keys would fail)`);
    else errors.unshift(nutLoadError);
  }
  if (scancodeLoadError) warnings.unshift(scancodeLoadError);

  if (errors.length > 0) {
    return { ok: false, path: activePath, errors, warnings };
  }
  return { ok: true, path: activePath, config, warnings };
}

// ---- Detect the Xeneon Edge (2560x720, fallback: any secondary display) ----
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
    focusable: false, // a tap must not steal focus from the game
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // preload only needs ipcRenderer, which works sandboxed
    },
  });

  const devServerUrl = process.env.ELECTRON_START_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  // Game.log watcher (optional, config.gamelog.enabled). (Re)started on
  // EVERY finish-load - not just the first one - so a re-created or
  // reloaded window gets the replayed startup events too (which prime
  // "which ship are we in"; the freshly loaded UI is at its initial state,
  // so replaying is harmless).
  mainWindow.webContents.on("did-finish-load", () => restartGameLog());
}

app.whenReady().then(() => {
  createWindow();

  // Without focus/frame the app would otherwise be unquittable.
  // Ctrl+Alt+Q quits from anywhere - even while the game has focus.
  globalShortcut.register("Control+Alt+Q", () => app.quit());

  // React to monitor changes (Edge plugged in/out, standby)
  screen.on("display-added", moveToTargetDisplay);
  screen.on("display-removed", moveToTargetDisplay);

  // Config hot reload: pick up changes to the active config.json
  // immediately (fs.watch may fire multiple times per save -> debounce).
  watchConfig();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let configWatcher = null;
let watchDebounce = null;

function watchConfig() {
  const activePath = getActiveConfigPath();
  // Watch the DIRECTORY, not the file: editors like Notepad++ often save
  // via rename-replace, which leaves a file watcher attached to a dead
  // handle - hot reload would silently stop working. Directory watching
  // survives that; we filter events down to our config file name.
  const dir = path.dirname(activePath);
  const base = path.basename(activePath);
  try {
    configWatcher = fs.watch(dir, (_eventType, filename) => {
      // filename may be null on some platforms -> react anyway (debounced)
      if (filename && filename !== base) return;
      clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("config-changed");
        }
        // gamelog settings (enabled/path/patterns) may have changed too
        restartGameLog();
      }, 150);
    });
  } catch (err) {
    console.error("Failed to start config watcher:", err);
  }
}

// ---- Game.log watcher ----
// Feeds Game.log lines through the parser and forwards the resulting
// semantic events to the renderer, which resets/restores toggle states.
// On startup the existing log is replayed from the beginning so the parser
// knows which ship the player is already sitting in - at that point the UI
// is still at its initial state, so the replayed events are harmless.
let gamelogTailer = null;

function sendGameEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("game-event", payload);
  }
}

function restartGameLog() {
  if (gamelogTailer) {
    gamelogTailer.stop();
    gamelogTailer = null;
  }

  const result = loadConfigSafe();
  const gamelog = result.ok ? result.config.gamelog : null;
  if (!gamelog || !gamelog.enabled) return;

  const logPath = gamelog.path || DEFAULT_LOG_PATH;
  const parser = createGameLogParser({
    patterns: gamelog.patterns,
    playerName: gamelog.playerName,
    onEvent: (event) => {
      console.log("[gamelog]", JSON.stringify(event));
      sendGameEvent(event);
    },
  });

  gamelogTailer = createGameLogTailer({
    filePath: logPath,
    pollMs: gamelog.pollMs || 750,
    onLine: (line) => parser.feedLine(line),
    onTruncate: () => parser.resetSession(),
    onStatus: (state) => sendGameEvent({ type: "gamelog-status", state, path: logPath }),
  });
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  clearTimeout(watchDebounce); // pending debounce must not fire into teardown
  if (configWatcher) configWatcher.close();
  if (gamelogTailer) gamelogTailer.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- IPC ----

ipcMain.handle("get-config", () => loadConfigSafe());

ipcMain.handle("quit-app", () => app.quit());

// Hotkey queue: strictly serialize key dispatch so press/release of two
// simultaneous taps cannot interleave (otherwise Ctrl+T plus Alt+C could
// briefly register as Ctrl+Alt+T).
let hotkeyQueue = Promise.resolve();

async function doSendKeys(keys) {
  // Preferred path: scancodes with correct extended-key flags. All-or-
  // nothing per combo - mixing both senders within one chord could
  // interleave on the system input queue.
  if (scancodeSender && canSendViaScancodes(keys)) {
    await scancodeSender.sendCombo(keys);
    return;
  }

  if (!nut) throw new Error(nutLoadError || "nut.js not available");
  const { keyboard, Key } = nut;

  const keyConstants = keys.map((k) => {
    // hasOwnProperty, not `in`: `in` also matches prototype members like
    // "toString", which would pass validation and then blow up in nut.js
    if (!Object.prototype.hasOwnProperty.call(Key, k)) {
      throw new Error(`Unknown key: ${k}`);
    }
    return Key[k];
  });

  await keyboard.pressKey(...keyConstants);
  await keyboard.releaseKey(...keyConstants);
}

ipcMain.handle("send-hotkey", (_event, keys) => {
  // Validate IPC input before it reaches the queue
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.length > 8 ||
    !keys.every((k) => typeof k === "string" && k.length <= 32)
  ) {
    return { ok: false, error: "Invalid key list" };
  }

  const job = hotkeyQueue.then(async () => {
    try {
      await doSendKeys(keys);
      return { ok: true };
    } catch (err) {
      console.error("Failed to send hotkey:", err);
      return { ok: false, error: String(err) };
    }
  });
  // Keep the queue going regardless of job outcome (errors are in the result)
  hotkeyQueue = job.then(() => {});
  return job;
});
