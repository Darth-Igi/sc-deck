// Physical keyboard input -> key events (Phase B of power tracking:
// prototype, debug display only).
//
// A WH_KEYBOARD_LL hook in a worker thread (inputHookWorker.js) reports
// every key event system-wide. It only LISTENS (CallNextHookEx, nothing is
// swallowed or altered). This module turns the raw fields into key names of
// the SCANCODES table - the same names config.json uses - and filters:
// - the deck's own injected keys (tagged via dwExtraInfo, see
//   DECK_EXTRA_INFO in scancodeSender.js), otherwise every deck tap would
//   count twice
// - auto-repeat (Windows repeats keydown while a key is held): only real
//   down/up transitions are reported
//
// Privacy: this is technically a global key listener. It is opt-in
// (config.input.keyboard), events go to the renderer only and are never
// written to disk or the console.
//
// Pure parts (keyNameFromScan, createKeyEventFilter) are Electron-free and
// unit-tested; the hook itself only runs on win32.

"use strict";

const path = require("path");
const { SCANCODES, DECK_EXTRA_INFO } = require("./scancodeSender");

const LLKHF_EXTENDED = 0x01;
const LLKHF_INJECTED = 0x10;
const LLKHF_UP = 0x80;
const WM_QUIT = 0x0012;

// scancode + extended flag -> config key name. Aliases (LeftWin/LeftSuper/
// LeftMeta ...) map to the FIRST name in the table.
const NAME_BY_SCAN = new Map();
for (const [name, [scan, extended]] of Object.entries(SCANCODES)) {
  const id = `${scan}:${extended}`;
  if (!NAME_BY_SCAN.has(id)) NAME_BY_SCAN.set(id, name);
}

/** Config key name for a scancode, or null if it is not in SCANCODES. */
function keyNameFromScan(scan, extended) {
  return NAME_BY_SCAN.get(`${scan}:${Boolean(extended)}`) ?? null;
}

/**
 * Raw hook records -> key transitions. Returns null for records to drop.
 * Stateful (tracks held keys to drop auto-repeat), one instance per hook.
 */
function createKeyEventFilter() {
  const held = new Set();
  return function filter(raw) {
    if (raw.extraInfo === DECK_EXTRA_INFO) return null; // our own SendInput
    const extended = Boolean(raw.flags & LLKHF_EXTENDED);
    const down = !(raw.flags & LLKHF_UP);
    // unknown scancodes still get an id so debug output shows them
    const key = keyNameFromScan(raw.scan, extended) ??
      `scan:0x${raw.scan.toString(16)}${extended ? "+E0" : ""}`;
    if (down) {
      if (held.has(key)) return null; // auto-repeat
      held.add(key);
    } else {
      held.delete(key);
    }
    return {
      source: "keyboard",
      key,
      down,
      injected: Boolean(raw.flags & LLKHF_INJECTED), // by another tool
    };
  };
}

/**
 * Starts the hook. Windows only - throws elsewhere.
 * @param {{ onEvent: (ev) => void, onStatus: (status) => void }} opts
 * @returns {{ stop: () => void }}
 */
function createKeyboardHook({ onEvent, onStatus }) {
  if (process.platform !== "win32") {
    throw new Error("keyboard hook is Windows-only");
  }
  const { Worker } = require("worker_threads");
  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");
  const PostThreadMessageW = user32.func(
    "bool __stdcall PostThreadMessageW(uint32_t idThread, uint32_t Msg, uintptr_t wParam, intptr_t lParam)"
  );

  const filter = createKeyEventFilter();
  const worker = new Worker(path.join(__dirname, "inputHookWorker.js"), {
    // resolved here: the worker may not share the main thread's module paths
    workerData: { koffiPath: path.dirname(require.resolve("koffi")) },
  });
  let threadId = null;
  let stopped = false;

  worker.on("message", (m) => {
    if (m.kind === "ready") {
      threadId = m.threadId;
      onStatus(m.ok ? "running" : "failed");
      // stop() came before the worker was ready -> quit it now
      if (stopped && m.ok) PostThreadMessageW(threadId, WM_QUIT, 0, 0);
    } else if (m.kind === "key" && !stopped) {
      const ev = filter(m);
      if (ev) onEvent(ev);
    }
  });
  worker.on("error", (err) => {
    console.error("[input] keyboard hook worker failed:", err);
    onStatus("failed");
  });
  worker.on("exit", () => {
    if (!stopped) onStatus("stopped");
  });

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (threadId !== null) PostThreadMessageW(threadId, WM_QUIT, 0, 0);
    },
  };
}

module.exports = { keyNameFromScan, createKeyEventFilter, createKeyboardHook };
