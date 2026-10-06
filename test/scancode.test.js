// Mini test suite without a framework: node test/scancode.test.js
// Tests the pure parts of scancodeSender.js (mapping + event sequence)
// plus the koffi struct layout. The actual SendInput call only runs on
// the Windows target machine.
const assert = require("assert");
const fs = require("fs");
const {
  SCANCODES,
  SCANCODE_KEY_NAMES,
  canSendViaScancodes,
  buildInputSequence,
  buildTimedSequence,
} = require("../scancodeSender");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}

test("right modifiers carry the extended flag, left ones do not", () => {
  assert.deepStrictEqual(SCANCODES.LeftControl, [0x1d, false]);
  assert.deepStrictEqual(SCANCODES.RightControl, [0x1d, true]);
  assert.deepStrictEqual(SCANCODES.LeftAlt, [0x38, false]);
  assert.deepStrictEqual(SCANCODES.RightAlt, [0x38, true]);
  // Shift is the exception: RightShift has its OWN make code, not extended
  assert.deepStrictEqual(SCANCODES.LeftShift, [0x2a, false]);
  assert.deepStrictEqual(SCANCODES.RightShift, [0x36, false]);
});

test("main Enter vs numpad Enter follow nut.js naming (Return/Enter)", () => {
  assert.deepStrictEqual(SCANCODES.Return, [0x1c, false]);
  assert.deepStrictEqual(SCANCODES.Enter, [0x1c, true]);
});

test("legacy nut.js key names remain valid (existing configs keep working)", () => {
  // The mapping deliberately keeps the nut.js naming scheme. This spot
  // check pins the names most likely to appear in user configs so a
  // rename in the table breaks loudly here, not silently in configs.
  const legacy = [
    "LeftShift", "RightShift", "LeftControl", "RightControl",
    "LeftAlt", "RightAlt", "Space", "Return", "Enter", "Escape",
    "Backspace", "Tab", "F1", "F12", "Num0", "Num9", "NumPad0",
    "Up", "Down", "Left", "Right", "A", "Z", "D", "L",
  ];
  for (const name of legacy) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(SCANCODES, name),
      `legacy key name "${name}" is missing from SCANCODES`
    );
  }
});

test("every key used in the bundled config.json is scancode-mappable", () => {
  const cfg = JSON.parse(fs.readFileSync(__dirname + "/../config.json"));
  for (const page of cfg.pages)
    for (const panel of page.panels)
      for (const w of panel.widgets)
        assert.ok(
          canSendViaScancodes(w.keys),
          `widget "${w.id}" keys not fully mappable: ${w.keys}`
        );
});

test("canSendViaScancodes: unknown or unmapped keys reject the whole combo", () => {
  assert.strictEqual(canSendViaScancodes(["RightControl", "D"]), true);
  assert.strictEqual(canSendViaScancodes(["Pause"]), false); // E1 sequence, unmapped
  assert.strictEqual(canSendViaScancodes(["RightControl", "NotAKey"]), false);
  assert.strictEqual(canSendViaScancodes([]), false);
  assert.strictEqual(canSendViaScancodes("D"), false);
});

test("buildInputSequence: press in order, release reversed, correct flags", () => {
  const seq = buildInputSequence(["RightControl", "D"]);
  assert.deepStrictEqual(
    seq.map((e) => [e.name, e.up]),
    [["RightControl", false], ["D", false], ["D", true], ["RightControl", true]]
  );
  assert.strictEqual(seq[0].extended, true);
  assert.strictEqual(seq[0].scan, 0x1d);
  assert.strictEqual(seq[1].extended, false);
  assert.strictEqual(seq[1].scan, 0x20); // D
});

test("buildInputSequence throws on unmapped keys", () => {
  assert.throws(() => buildInputSequence(["Pause"]));
});

test("timed sequence: chord held holdMs, other gaps keyDelayMs, none at the end", () => {
  const timing = { keyDelayMs: 15, holdMs: 30 };
  const seq = buildTimedSequence(["LeftAlt", "F5"], timing);
  assert.deepStrictEqual(
    seq.map((e) => [e.name, e.up, e.delayAfter]),
    [
      ["LeftAlt", false, 15],
      ["F5", false, 30], // chord fully down -> hold
      ["F5", true, 15],
      ["LeftAlt", true, 0],
    ]
  );
  // long hold (power MAX/MIN) only changes the hold slot
  const long = buildTimedSequence(["F5"], { keyDelayMs: 15, holdMs: 800 });
  assert.deepStrictEqual(long.map((e) => e.delayAfter), [800, 0]);
});

test("SCANCODE_KEY_NAMES mirrors the mapping table", () => {
  assert.deepStrictEqual(
    Object.keys(SCANCODE_KEY_NAMES).sort(),
    Object.keys(SCANCODES).sort()
  );
});

test("koffi INPUT struct layout matches Win32 (40 bytes on x64)", () => {
  const koffi = require("koffi");
  const KEYBDINPUT = koffi.struct("T_KEYBDINPUT", {
    wVk: "uint16", wScan: "uint16", dwFlags: "uint32",
    time: "uint32", dwExtraInfo: "uint64",
  });
  const MOUSEINPUT = koffi.struct("T_MOUSEINPUT", {
    dx: "int32", dy: "int32", mouseData: "uint32",
    dwFlags: "uint32", time: "uint32", dwExtraInfo: "uint64",
  });
  const U = koffi.union("T_INPUT_UNION", { mi: MOUSEINPUT, ki: KEYBDINPUT });
  const INPUT = koffi.struct("T_INPUT", { type: "uint32", u: U });
  assert.strictEqual(koffi.sizeof(INPUT), 40);
});

console.log(`\nscancode: ${passed} tests passed`);
