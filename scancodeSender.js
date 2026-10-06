// Scancode-based key dispatch via SendInput (KEYEVENTF_SCANCODE).
//
// Why this exists: nut.js/libnut sends virtual-key codes without the
// KEYEVENTF_EXTENDEDKEY flag. On the scancode level RightControl/RightAlt
// share their make code with the LEFT variant (0x1D / 0x38) and differ
// ONLY by the extended flag - so games that read raw scancodes (Star
// Citizen does) see LeftControl/LeftAlt instead. This module calls
// SendInput directly with proper scancode + extended flags. Same API and
// injection path as libnut, just with correct flags - no change in
// anti-cheat risk profile.
//
// Deliberately Electron-free. The FFI part (koffi + user32.dll) only
// loads on win32 inside createScancodeSender(); the mapping/sequence
// logic is pure and unit-testable on any platform.

"use strict";

// PC/AT scancode set 1 make codes, keyed by nut.js Key enum names so the
// config format stays unchanged. Value: [makeCode, extendedFlag].
// NOTE: scancodes are POSITION-based. Y/Z are the US positions - on a
// German layout Key "Y" presses the physical key that types "z" and vice
// versa. Star Citizen binds by scancode as well, so in-game binds match
// physical positions consistently.
const SCANCODES = Object.freeze({
  Escape: [0x01, false],
  Num1: [0x02, false], Num2: [0x03, false], Num3: [0x04, false],
  Num4: [0x05, false], Num5: [0x06, false], Num6: [0x07, false],
  Num7: [0x08, false], Num8: [0x09, false], Num9: [0x0a, false],
  Num0: [0x0b, false],
  Minus: [0x0c, false], Equal: [0x0d, false],
  Backspace: [0x0e, false], Tab: [0x0f, false],
  Q: [0x10, false], W: [0x11, false], E: [0x12, false], R: [0x13, false],
  T: [0x14, false], Y: [0x15, false], U: [0x16, false], I: [0x17, false],
  O: [0x18, false], P: [0x19, false],
  LeftBracket: [0x1a, false], RightBracket: [0x1b, false],
  Return: [0x1c, false],       // main Enter key
  LeftControl: [0x1d, false],
  A: [0x1e, false], S: [0x1f, false], D: [0x20, false], F: [0x21, false],
  G: [0x22, false], H: [0x23, false], J: [0x24, false], K: [0x25, false],
  L: [0x26, false],
  Semicolon: [0x27, false], Quote: [0x28, false], Grave: [0x29, false],
  LeftShift: [0x2a, false], Backslash: [0x2b, false],
  Z: [0x2c, false], X: [0x2d, false], C: [0x2e, false], V: [0x2f, false],
  B: [0x30, false], N: [0x31, false], M: [0x32, false],
  Comma: [0x33, false], Period: [0x34, false], Slash: [0x35, false],
  RightShift: [0x36, false],
  Multiply: [0x37, false],     // numpad *
  LeftAlt: [0x38, false],
  Space: [0x39, false], CapsLock: [0x3a, false],
  F1: [0x3b, false], F2: [0x3c, false], F3: [0x3d, false],
  F4: [0x3e, false], F5: [0x3f, false], F6: [0x40, false],
  F7: [0x41, false], F8: [0x42, false], F9: [0x43, false],
  F10: [0x44, false],
  NumLock: [0x45, false], ScrollLock: [0x46, false],
  NumPad7: [0x47, false], NumPad8: [0x48, false], NumPad9: [0x49, false],
  Subtract: [0x4a, false],
  NumPad4: [0x4b, false], NumPad5: [0x4c, false], NumPad6: [0x4d, false],
  Add: [0x4e, false],
  NumPad1: [0x4f, false], NumPad2: [0x50, false], NumPad3: [0x51, false],
  NumPad0: [0x52, false], Decimal: [0x53, false],
  F11: [0x57, false], F12: [0x58, false],
  F13: [0x64, false], F14: [0x65, false], F15: [0x66, false],
  F16: [0x67, false], F17: [0x68, false], F18: [0x69, false],
  F19: [0x6a, false], F20: [0x6b, false], F21: [0x6c, false],
  F22: [0x6d, false], F23: [0x6e, false], F24: [0x76, false],

  // Extended keys (E0 prefix on the wire = KEYEVENTF_EXTENDEDKEY here).
  // These are exactly the keys nut.js gets wrong / cannot distinguish.
  Enter: [0x1c, true],         // numpad Enter
  RightControl: [0x1d, true],
  Divide: [0x35, true],        // numpad /
  Print: [0x37, true],
  RightAlt: [0x38, true],      // = AltGr on German layouts
  Home: [0x47, true], Up: [0x48, true], PageUp: [0x49, true],
  Left: [0x4b, true], Right: [0x4d, true],
  End: [0x4f, true], Down: [0x50, true], PageDown: [0x51, true],
  Insert: [0x52, true], Delete: [0x53, true],
  LeftWin: [0x5b, true], LeftSuper: [0x5b, true],
  LeftMeta: [0x5b, true], LeftCmd: [0x5b, true],
  RightWin: [0x5c, true], RightSuper: [0x5c, true],
  RightMeta: [0x5c, true], RightCmd: [0x5c, true],
  Menu: [0x5d, true],
  AudioMute: [0x20, true], AudioVolDown: [0x2e, true],
  AudioVolUp: [0x30, true], AudioNext: [0x19, true],
  AudioPrev: [0x10, true], AudioStop: [0x24, true],
  AudioPlay: [0x22, true],
  // Not mapped on purpose (fall back to nut.js): Pause (E1 sequence),
  // NumPadEqual, Clear, Fn, AudioPause/Rewind/Forward/Repeat/Random.
});

// Name -> true map, mergeable into the key-name enum used by
// configValidation (which only checks hasOwnProperty).
const SCANCODE_KEY_NAMES = Object.freeze(
  Object.fromEntries(Object.keys(SCANCODES).map((n) => [n, true]))
);

/** True if EVERY key of the combo can go through the scancode path.
 * All-or-nothing per combo: mixing scancode and nut.js events within one
 * chord could interleave on the input queue. */
function canSendViaScancodes(keys) {
  return (
    Array.isArray(keys) &&
    keys.length > 0 &&
    keys.every((k) => Object.prototype.hasOwnProperty.call(SCANCODES, k))
  );
}

/** Pure: expands a combo into the ordered SendInput event list.
 * Press in given order (modifiers first in the config), release reversed. */
function buildInputSequence(keys) {
  if (!canSendViaScancodes(keys)) {
    throw new Error(`Combo contains keys without scancode mapping: ${keys}`);
  }
  const press = keys.map((name) => ({
    name,
    scan: SCANCODES[name][0],
    extended: SCANCODES[name][1],
    up: false,
  }));
  const release = [...press]
    .reverse()
    .map((ev) => ({ ...ev, up: true }));
  return [...press, ...release];
}

// Upper bound for a held chord (config "hold.holdMs"). Long holds block the
// hotkey queue, and a renderer must not be able to park a key forever.
const MAX_HOLD_MS = 5000;

/** Pure: the sequence plus the pause after each event. Modifiers and keys
 * go down `keyDelayMs` apart, the full chord stays down `holdMs`, releases
 * are `keyDelayMs` apart again; no pause after the last event. */
function buildTimedSequence(keys, { keyDelayMs, holdMs }) {
  const sequence = buildInputSequence(keys);
  return sequence.map((ev, i) => ({
    ...ev,
    delayAfter:
      i === sequence.length - 1 ? 0 : i === keys.length - 1 ? holdMs : keyDelayMs,
  }));
}

// ---- FFI part (win32 only) ----

const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_SCANCODE = 0x0008;
const INPUT_KEYBOARD = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Creates the sender. Throws immediately if the platform is not win32 or
 * koffi/user32 cannot be loaded - call it once at startup and surface the
 * error like the nut.js load error.
 *
 * @param {{ keyDelayMs?: number, holdMs?: number }} [opts]
 */
function createScancodeSender(opts = {}) {
  if (process.platform !== "win32") {
    throw new Error("scancode sender is Windows-only");
  }
  const keyDelayMs = opts.keyDelayMs ?? 15; // gap between key events
  const holdMs = opts.holdMs ?? 30; // full chord held before release

  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");

  // Exact Win32 layout; sizeof(INPUT) must be 40 on x64 (verified in
  // test/scancode.test.js so a koffi update changing packing would fail CI).
  const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
    wVk: "uint16",
    wScan: "uint16",
    dwFlags: "uint32",
    time: "uint32",
    dwExtraInfo: "uint64",
  });
  const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
    dx: "int32",
    dy: "int32",
    mouseData: "uint32",
    dwFlags: "uint32",
    time: "uint32",
    dwExtraInfo: "uint64",
  });
  const INPUT_UNION = koffi.union("INPUT_UNION", {
    mi: MOUSEINPUT,
    ki: KEYBDINPUT,
  });
  const INPUT = koffi.struct("INPUT", {
    type: "uint32",
    u: INPUT_UNION,
  });

  const SendInput = user32.func(
    "uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)"
  );

  function toInputStruct(ev) {
    let flags = KEYEVENTF_SCANCODE;
    if (ev.extended) flags |= KEYEVENTF_EXTENDEDKEY;
    if (ev.up) flags |= KEYEVENTF_KEYUP;
    return {
      type: INPUT_KEYBOARD,
      u: {
        ki: { wVk: 0, wScan: ev.scan, dwFlags: flags, time: 0, dwExtraInfo: 0 },
      },
    };
  }

  function sendOne(ev) {
    const injected = SendInput(1, [toInputStruct(ev)], koffi.sizeof(INPUT));
    if (injected !== 1) {
      // Most common cause: game runs elevated, deck does not (Windows UIPI
      // blocks input injection into higher-integrity processes).
      throw new Error(
        `SendInput rejected key "${ev.name}" - if the game runs as ` +
          "administrator, the deck must too."
      );
    }
  }

  /** Presses the combo (in order), holds, releases in reverse order.
   * Events are spaced a few ms apart so games that sample input per frame
   * reliably see modifiers before the main key. `opts.holdMs` overrides the
   * hold for long presses (SC "hold" activations like power MAX/MIN). */
  async function sendCombo(keys, opts = {}) {
    const timing = { keyDelayMs, holdMs: opts.holdMs ?? holdMs };
    for (const ev of buildTimedSequence(keys, timing)) {
      sendOne(ev);
      if (ev.delayAfter) await sleep(ev.delayAfter);
    }
  }

  return { sendCombo };
}

module.exports = {
  SCANCODES,
  SCANCODE_KEY_NAMES,
  canSendViaScancodes,
  buildInputSequence,
  buildTimedSequence,
  MAX_HOLD_MS,
  createScancodeSender,
};
