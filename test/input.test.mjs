// Mini test suite without a framework: node test/input.test.mjs
// Pure parts of the physical input listening (Phase B): keyboard hook
// record filter (inputHook.js, main process) and joystick button diff
// (src/joystick.js, renderer). The hook itself only runs on Windows.
import assert from "assert";
import { createRequire } from "module";
import { parseGamepadId, diffGamepadButtons } from "../src/joystick.js";

const require = createRequire(import.meta.url);
const { keyNameFromScan, createKeyEventFilter } = require("../inputHook.js");
const { DECK_EXTRA_INFO, SCANCODES } = require("../scancodeSender.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}

const LLKHF_EXTENDED = 0x01, LLKHF_INJECTED = 0x10, LLKHF_UP = 0x80;
const raw = (scan, flags = 0, extraInfo = 0) => ({ scan, flags, extraInfo });

test("scancode -> config key name, extended flag distinguishes left/right", () => {
  assert.strictEqual(keyNameFromScan(0x3f, false), "F5");
  assert.strictEqual(keyNameFromScan(0x1d, false), "LeftControl");
  assert.strictEqual(keyNameFromScan(0x1d, true), "RightControl");
  assert.strictEqual(keyNameFromScan(0x1c, true), "Enter"); // numpad Enter
  assert.strictEqual(keyNameFromScan(0x5b, true), "LeftWin"); // first alias
  assert.strictEqual(keyNameFromScan(0x7f, false), null);
});

test("every config key name round-trips (aliases map to the first name)", () => {
  const first = new Map();
  for (const [name, [scan, ext]] of Object.entries(SCANCODES)) {
    const id = `${scan}:${ext}`;
    if (!first.has(id)) first.set(id, name);
    assert.strictEqual(keyNameFromScan(scan, ext), first.get(id), name);
  }
});

test("filter: down/up transitions, auto-repeat dropped", () => {
  const f = createKeyEventFilter();
  assert.deepStrictEqual(f(raw(0x3f)), { source: "keyboard", key: "F5", down: true, injected: false });
  assert.strictEqual(f(raw(0x3f)), null, "repeat must be dropped");
  assert.strictEqual(f(raw(0x3f)), null);
  assert.deepStrictEqual(f(raw(0x3f, LLKHF_UP)), { source: "keyboard", key: "F5", down: false, injected: false });
  assert.strictEqual(f(raw(0x3f)).down, true, "next press counts again");
});

test("filter: the deck's own keys (dwExtraInfo tag) are dropped", () => {
  const f = createKeyEventFilter();
  assert.strictEqual(f(raw(0x3f, LLKHF_INJECTED, DECK_EXTRA_INFO)), null);
  assert.strictEqual(f(raw(0x3f, LLKHF_INJECTED | LLKHF_UP, DECK_EXTRA_INFO)), null);
});

test("filter: keys injected by OTHER tools still count, flagged", () => {
  const f = createKeyEventFilter();
  const ev = f(raw(0x1d, LLKHF_INJECTED | LLKHF_EXTENDED));
  assert.deepStrictEqual(ev, { source: "keyboard", key: "RightControl", down: true, injected: true });
});

test("filter: unknown scancodes get a debug id", () => {
  const f = createKeyEventFilter();
  assert.strictEqual(f(raw(0x7f, LLKHF_EXTENDED)).key, "scan:0x7f+E0");
});

test("gamepad id -> name + vendor/product (matches actionmaps GUID parts)", () => {
  assert.deepStrictEqual(
    parseGamepadId("VKBsim Gladiator EVO  R  (Vendor: 231d Product: 0200)"),
    { name: "VKBsim Gladiator EVO  R", vendor: "231d", product: "0200" }
  );
  assert.deepStrictEqual(parseGamepadId("Some Pad"), { name: "Some Pad", vendor: null, product: null });
});

const pad = (index, pressed, id = "Stick (Vendor: 231d Product: 0200)") => ({
  index, id, buttons: pressed.map((p) => ({ pressed: p })),
});

test("joystick diff: 1-based button numbers, press and release once", () => {
  const prev = new Map();
  assert.deepStrictEqual(diffGamepadButtons(prev, [pad(0, [false, false, false])]), []);
  const down = diffGamepadButtons(prev, [pad(0, [false, false, true])]);
  assert.deepStrictEqual(down.map((e) => [e.slot, e.button, e.down, e.product]), [[0, 3, true, "0200"]]);
  assert.deepStrictEqual(diffGamepadButtons(prev, [pad(0, [false, false, true])]), [], "held = no event");
  const up = diffGamepadButtons(prev, [pad(0, [false, false, false])]);
  assert.deepStrictEqual(up.map((e) => [e.button, e.down]), [[3, false]]);
});

test("joystick diff: several devices, empty slots, unplug forgets state", () => {
  const prev = new Map();
  diffGamepadButtons(prev, [pad(0, [true]), null, pad(2, [false], "Other")]);
  assert.strictEqual(prev.size, 2);
  const evs = diffGamepadButtons(prev, [null, null, pad(2, [true], "Other")]);
  assert.deepStrictEqual(evs.map((e) => [e.slot, e.button, e.down]), [[2, 1, true]], "no fake release on unplug");
  assert.strictEqual(prev.size, 1);
});

console.log(`\ninput: ${passed} tests passed`);
