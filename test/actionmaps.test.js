// Mini test suite without a framework: node test/actionmaps.test.js
// actionmaps.xml parsing + binding resolution (Phase C), with the user's
// real file (fixtures/actionmaps-2026-10.xml: VKB rudder + two sticks).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_KEYBOARD_BINDINGS,
  parseActionMaps,
  keysFromScInput,
  resolveBindings,
  actionmapsPathFor,
  actionsOfConfig,
} = require("../actionmaps");
const { SCANCODES } = require("../scancodeSender");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}

const real = parseActionMaps(
  fs.readFileSync(path.join(__dirname, "fixtures", "actionmaps-2026-10.xml"), "utf-8")
);
const POWER = [
  "v_power_toggle", "v_power_toggle_weapons", "v_power_toggle_thrusters",
  "v_power_toggle_shields", "v_flightready",
];

test("real file: joystick instances -> product/vendor from the GUID", () => {
  assert.deepStrictEqual(real.joysticks[1], { name: "VKBSim T-Rudder", product: "011f", vendor: "231d" });
  assert.strictEqual(real.joysticks[2].product, "3201");
  assert.strictEqual(real.joysticks[3].product, "0200");
  assert.strictEqual(real.joysticks[4], undefined, "empty instance slots are skipped");
});

test("real file: power + flight ready bindings (keyboard default + joystick)", () => {
  const { bindings, warnings } = resolveBindings(real, POWER);
  assert.deepStrictEqual(warnings, []);
  const js2 = (button) => ({ kind: "js", product: "3201", vendor: "231d", button });
  assert.deepStrictEqual(bindings.v_power_toggle, [{ kind: "kb", keys: ["U"] }, js2(11)]);
  assert.deepStrictEqual(bindings.v_power_toggle_shields, [{ kind: "kb", keys: ["O"] }, js2(12)]);
  assert.deepStrictEqual(bindings.v_power_toggle_thrusters, [{ kind: "kb", keys: ["I"] }, js2(13)]);
  assert.deepStrictEqual(bindings.v_power_toggle_weapons, [{ kind: "kb", keys: ["P"] }, js2(14)]);
  // in two actionmaps: js2_button28 (spaceship_general) + js1_ " " (vehicle_general)
  assert.deepStrictEqual(bindings.v_flightready, [{ kind: "kb", keys: ["RightAlt", "R"] }, js2(28)]);
});

test("real file: keyboard rebinds are read, modifiers first", () => {
  // kb1_rctrl+d / kb1_lalt+lctrl+np_1 exist in the real file
  const action = Object.entries(real.rebinds).find(([, i]) => i.includes("kb1_lalt+lctrl+np_1"))[0];
  const { bindings } = resolveBindings(real, [action]);
  assert.deepStrictEqual(bindings[action].filter((b) => b.kind === "kb"), [
    { kind: "kb", keys: ["LeftAlt", "LeftControl", "NumPad1"] },
  ]);
});

test("keyboard rebind replaces the default, an empty one unbinds it", () => {
  const xml = (input) => `<ActionMaps><actionmap name="x">
    <action name="v_power_toggle"><rebind input="${input}" /></action></actionmap></ActionMaps>`;
  const rebound = resolveBindings(parseActionMaps(xml("kb1_lshift+u")), ["v_power_toggle"]);
  assert.deepStrictEqual(rebound.bindings.v_power_toggle, [{ kind: "kb", keys: ["LeftShift", "U"] }]);
  const cleared = resolveBindings(parseActionMaps(xml("kb1_ ")), ["v_power_toggle"]);
  assert.deepStrictEqual(cleared.bindings.v_power_toggle, []);
});

test("no actionmaps.xml: keyboard defaults only; unknown actions unbound", () => {
  const { bindings } = resolveBindings(null, ["v_power_toggle", "v_lights"]);
  assert.deepStrictEqual(bindings, { v_power_toggle: [{ kind: "kb", keys: ["U"] }], v_lights: [] });
});

test("untrackable inputs: mouse in kb, axes, unknown device -> skipped/warned", () => {
  const xml = `<ActionMaps><actionmap name="x"><action name="a">
    <rebind input="kb1_mouse4" /><rebind input="js1_x" /><rebind input="js5_button2" />
    <rebind input="mo1_mouse1" /></action></actionmap></ActionMaps>`;
  const { bindings, warnings } = resolveBindings(parseActionMaps(xml), ["a"]);
  assert.deepStrictEqual(bindings.a, []);
  assert.strictEqual(warnings.length, 2, warnings.join("; "));
});

test("SC key tokens map onto valid config key names", () => {
  assert.deepStrictEqual(keysFromScInput("ralt+r"), ["RightAlt", "R"]);
  assert.deepStrictEqual(keysFromScInput("f5+lalt"), ["LeftAlt", "F5"]);
  assert.deepStrictEqual(keysFromScInput("np_add"), ["Add"]);
  assert.deepStrictEqual(keysFromScInput("apostrophe"), ["Quote"]);
  assert.strictEqual(keysFromScInput("mouse4"), null);
  for (const keys of Object.values(DEFAULT_KEYBOARD_BINDINGS)) {
    for (const k of keys) assert.ok(k in SCANCODES, k);
  }
  // every key in the real file's keyboard binds is known to the scancode table
  for (const inputs of Object.values(real.rebinds)) {
    for (const i of inputs) {
      const m = /^kb1_(.+)$/.exec(i);
      if (!m || !m[1].trim() || /mouse/.test(m[1])) continue;
      const keys = keysFromScInput(m[1]);
      assert.ok(keys && keys.every((k) => k in SCANCODES), i);
    }
  }
});

test("path next to Game.log; actions of a config (widgets + effects)", () => {
  const p = actionmapsPathFor(path.join("G:", "SC", "LIVE", "Game.log"));
  assert.strictEqual(p, path.join("G:", "SC", "LIVE", "user", "client", "0", "Profiles", "default", "actionmaps.xml"));
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf-8"));
  assert.deepStrictEqual(actionsOfConfig(cfg).sort(), [...POWER].sort());
});

console.log(`\nactionmaps: ${passed} tests passed`);
