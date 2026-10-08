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
  createGameLogPipeline,
  createGameLogTailer,
  DEFAULT_LOG_PATH,
} = require("./gamelog");
const { createKeyboardHook } = require("./inputHook");
const {
  parseActionMaps,
  resolveBindings,
  actionmapsPathFor,
  actionsOfConfig,
} = require("./actionmaps");

// Key dispatch: SendInput with KEYEVENTF_SCANCODE (see scancodeSender.js).
// Replaces the former nut.js path entirely - nut.js sent virtual keys
// without the extended-key flag, so games reading raw scancodes (Star
// Citizen) saw RightControl/RightAlt as the LEFT variant. Initialized
// eagerly: if the native part (koffi) fails to load, remember the error
// and surface it in the UI instead of dying on the first key press.
// On non-Windows dev machines the sender stays null - the UI runs, key
// dispatch errors into the status bar.
const {
  createScancodeSender,
  SCANCODE_KEY_NAMES,
  canSendViaScancodes,
  MAX_HOLD_MS,
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
} else {
  scancodeLoadError = "Key dispatch is Windows-only (dev mode?)";
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

  // Key names are validated against the scancode table - platform-
  // independent, so config editing on a dev machine validates identically.
  // A failed sender init is a warning: config and UI still work, only
  // dispatch will error (visible in the status bar per press).
  const { errors, warnings } = validateConfig(config, SCANCODE_KEY_NAMES);
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
  mainWindow.webContents.on("did-finish-load", () => {
    restartGameLog();
    updateInputBindings();
    // the hook may have started before the page could listen
    sendInputEvent({ type: "input-status", source: "keyboard", state: keyboardHookState });
  });
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
  updateKeyboardHook();
  updateInputBindings();

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
        updateKeyboardHook();
        updateInputBindings();
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
  // Events carry { session, line }: the renderer skips what it already
  // applied, so this replay is harmless for a live UI too (config reload).
  const pipeline = createGameLogPipeline({
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
    onLine: (line, lineNo) => pipeline.feedLine(line, lineNo),
    onTruncate: () => pipeline.truncate(),
    onStatus: (state) => sendGameEvent({ type: "gamelog-status", state, path: logPath }),
  });
}

// ---- Physical input listener (opt-in: config.input.keyboard) ----
// Phase B prototype: physical key presses are forwarded to the renderer
// (debug display in the status bar); later they update toggle states.
// Joysticks are read in the renderer (Gamepad API), not here.
let keyboardHook = null;
let keyboardHookState = "off";

function setKeyboardHookState(state) {
  keyboardHookState = state;
  sendInputEvent({ type: "input-status", source: "keyboard", state });
}

function sendInputEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("input-event", payload);
  }
}

// (Re)evaluated on startup and config hot reload; only touches the hook
// when the setting actually changes (no gap in listening on every save).
function updateKeyboardHook() {
  const result = loadConfigSafe();
  const wanted = Boolean(result.ok && result.config.input?.keyboard);
  if (wanted === Boolean(keyboardHook)) return;

  if (!wanted) {
    keyboardHook.stop();
    keyboardHook = null;
    setKeyboardHookState("off");
    return;
  }
  try {
    keyboardHook = createKeyboardHook({
      onEvent: (ev) => sendInputEvent({ type: "input", ...ev }),
      onStatus: setKeyboardHookState,
    });
  } catch (err) {
    console.error("[input] keyboard hook unavailable:", err.message);
    setKeyboardHookState("failed");
  }
}

// ---- SC bindings (actionmaps.xml) for the actions the config tracks ----
// The game rewrites actionmaps.xml when keybindings change (menu, exit), so
// the file is polled: fs.watchFile also copes with a file that does not
// exist yet. Missing file = SC keyboard defaults only (actionmaps.js).
let inputBindings = null;  // last payload, for get-input-bindings
let watchedActionmaps = null;

function loadInputBindings(file, actions) {
  let parsed = null;
  let state = "default";
  const warnings = [];
  try {
    parsed = parseActionMaps(fs.readFileSync(file, "utf-8"));
    state = "loaded";
  } catch (err) {
    if (err.code !== "ENOENT") warnings.push(`actionmaps.xml not readable: ${err.message}`);
    state = err.code === "ENOENT" ? "missing" : "failed";
  }
  const resolved = resolveBindings(parsed, actions);
  return {
    type: "input-bindings",
    path: file,
    state,
    bindings: resolved.bindings,
    warnings: [...warnings, ...resolved.warnings],
  };
}

function updateInputBindings() {
  const result = loadConfigSafe();
  const input = result.ok ? result.config.input : null;
  const tracking = Boolean(input && (input.keyboard || input.joystick));
  const gamelogPath = (result.ok && result.config.gamelog?.path) || DEFAULT_LOG_PATH;
  const file = tracking ? input.actionmaps || actionmapsPathFor(gamelogPath) : null;

  if (watchedActionmaps !== file) {
    if (watchedActionmaps) fs.unwatchFile(watchedActionmaps);
    watchedActionmaps = file;
    if (file) fs.watchFile(file, { interval: 2000 }, () => updateInputBindings());
  }
  inputBindings = file
    ? loadInputBindings(file, actionsOfConfig(result.config))
    : { type: "input-bindings", path: null, state: "off", bindings: {}, warnings: [] };
  for (const w of inputBindings.warnings) console.warn("[input]", w);
  sendInputEvent(inputBindings);
}

ipcMain.handle("get-input-bindings", () => inputBindings);

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  clearTimeout(watchDebounce); // pending debounce must not fire into teardown
  if (configWatcher) configWatcher.close();
  if (gamelogTailer) gamelogTailer.stop();
  if (keyboardHook) keyboardHook.stop();
  if (watchedActionmaps) fs.unwatchFile(watchedActionmaps);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- Persisted deck state (per-ship toggle memory) ----
// The renderer owns the state and its validation (src/gameEvents.js); the
// main process only stores the snapshot as JSON in userData - dev and
// packaged builds alike. The snapshot is bound to a Game.log session, so a
// stale file is simply ignored by the renderer.
const DECK_STATE_MAX_BYTES = 1024 * 1024;

function deckStatePath() {
  return path.join(app.getPath("userData"), "deck-state.json");
}

ipcMain.handle("get-deck-state", () => {
  try {
    return JSON.parse(fs.readFileSync(deckStatePath(), "utf-8"));
  } catch {
    return null; // missing or corrupt -> start without memory
  }
});

ipcMain.handle("save-deck-state", (_event, snapshot) => {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ok: false, error: "Invalid snapshot" };
  }
  const json = JSON.stringify(snapshot);
  if (json.length > DECK_STATE_MAX_BYTES) {
    return { ok: false, error: "Snapshot too large" };
  }
  try {
    // write + rename: a crash mid-write must not leave a truncated file
    const file = deckStatePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, json);
    fs.renameSync(`${file}.tmp`, file);
    return { ok: true };
  } catch (err) {
    console.error("Failed to save deck state:", err);
    return { ok: false, error: String(err) };
  }
});

// ---- IPC ----

ipcMain.handle("get-config", () => loadConfigSafe());

ipcMain.handle("quit-app", () => app.quit());

// Hotkey queue: strictly serialize key dispatch so press/release of two
// simultaneous taps cannot interleave (otherwise Ctrl+T plus Alt+C could
// briefly register as Ctrl+Alt+T).
let hotkeyQueue = Promise.resolve();

async function doSendKeys(keys, holdMs) {
  if (!scancodeSender) {
    throw new Error(scancodeLoadError || "Key dispatch not available");
  }
  if (!canSendViaScancodes(keys)) {
    // Validation catches this for config-defined keys; this guards the
    // raw IPC input (a compromised renderer could send arbitrary strings).
    throw new Error(`Unknown key(s): ${keys.join(", ")}`);
  }
  await scancodeSender.sendCombo(keys, { holdMs });
}

// holdMs (optional): chord held that long instead of the default ~30 ms -
// for game actions that trigger on HOLD (power MAX/MIN)
ipcMain.handle("send-hotkey", (_event, keys, holdMs) => {
  // Validate IPC input before it reaches the queue
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.length > 8 ||
    !keys.every((k) => typeof k === "string" && k.length <= 32)
  ) {
    return { ok: false, error: "Invalid key list" };
  }
  if (
    holdMs !== undefined &&
    !(Number.isInteger(holdMs) && holdMs >= 0 && holdMs <= MAX_HOLD_MS)
  ) {
    return { ok: false, error: "Invalid hold duration" };
  }

  const job = hotkeyQueue.then(async () => {
    try {
      await doSendKeys(keys, holdMs);
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
