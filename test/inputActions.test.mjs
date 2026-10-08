// Mini test suite without a framework: node test/inputActions.test.mjs
// Physical input -> SC action -> toggle states (Phase C, renderer side).
import assert from "assert";
import fs from "fs";
import { createRequire } from "module";
import { applyActions, createActionMatcher, describeChanges } from "../src/inputActions.js";
import { initialToggleStates } from "../src/gameEvents.js";

const require = createRequire(import.meta.url);
const { parseActionMaps, resolveBindings, actionsOfConfig } = require("../actionmaps.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}

const config = JSON.parse(fs.readFileSync(new URL("../config.json", import.meta.url)));
const real = parseActionMaps(
  fs.readFileSync(new URL("./fixtures/actionmaps-2026-10.xml", import.meta.url), "utf-8")
);
const { bindings } = resolveBindings(real, actionsOfConfig(config));
const kb = (key, down = true) => ({ source: "keyboard", key, down, injected: false });
const js = (product, button, down = true) => ({ source: "joystick", vendor: "231d", product, button, down });

test("keyboard: plain key and modifier combo fire on press only", () => {
  const match = createActionMatcher(bindings);
  assert.deepStrictEqual(match(kb("P")), ["v_power_toggle_weapons"]);
  assert.deepStrictEqual(match(kb("P", false)), [], "release does nothing");
  assert.deepStrictEqual(match(kb("RightAlt")), []);
  assert.deepStrictEqual(match(kb("R")), ["v_flightready"]);
  match(kb("R", false));
  match(kb("RightAlt", false));
  assert.deepStrictEqual(match(kb("R")), [], "R alone is not flight ready");
});

test("keyboard: extra or wrong modifiers do not match", () => {
  const match = createActionMatcher(bindings);
  match(kb("LeftAlt"));
  assert.deepStrictEqual(match(kb("P")), [], "LeftAlt+P is not P");
  assert.deepStrictEqual(match(kb("R")), [], "LeftAlt+R is not RightAlt+R");
  match(kb("LeftAlt", false));
  match(kb("P", false));
  assert.deepStrictEqual(match(kb("P")), ["v_power_toggle_weapons"], "modifier released");
});

test("joystick: device by product GUID, SC button numbers (real bindings)", () => {
  const match = createActionMatcher(bindings);
  assert.deepStrictEqual(match(js("3201", 11)), ["v_power_toggle"]);
  assert.deepStrictEqual(match(js("3201", 14)), ["v_power_toggle_weapons"]);
  assert.deepStrictEqual(match(js("3201", 28)), ["v_flightready"]);
  assert.deepStrictEqual(match(js("0200", 11)), [], "same button, other stick");
  assert.deepStrictEqual(match(js("3201", 11, false)), [], "release");
  assert.deepStrictEqual(match({ source: "joystick", product: null, vendor: null, button: 11, down: true }), []);
});

test("power starts OFF; flight ready switches everything on", () => {
  const initial = initialToggleStates(config.pages);
  for (const id of ["pwr-all", "pwr-wpn", "pwr-thr", "pwr-shld"]) assert.strictEqual(initial[id], false, id);
  const r = applyActions(initial, ["v_flightready"], config.pages, config.effects);
  assert.deepStrictEqual(
    r.changes.map((c) => [c.id, c.value]),
    [["pwr-wpn", true], ["pwr-thr", true], ["pwr-shld", true], ["pwr-all", true]]
  );
  assert.strictEqual(r.toggleStates["wpn-safety"], initial["wpn-safety"], "other toggles untouched");
  assert.strictEqual(applyActions(r.toggleStates, ["v_flightready"], config.pages, config.effects), null,
    "flight ready only switches on - no change when already on");
});

test("toggle actions flip; master power leaves the subsystems alone", () => {
  const on = { ...initialToggleStates(config.pages), "pwr-all": true, "pwr-wpn": true, "pwr-thr": false, "pwr-shld": true };
  const off = applyActions(on, ["v_power_toggle"], config.pages, config.effects);
  assert.deepStrictEqual(off.changes, [{ id: "pwr-all", label: "POWER", value: false }]);
  const thr = applyActions(on, ["v_power_toggle_thrusters"], config.pages, config.effects);
  assert.deepStrictEqual(thr.changes, [{ id: "pwr-thr", label: "THR", value: true }]);
  assert.strictEqual(applyActions(on, ["v_unknown"], config.pages, config.effects), null);
});

test("status text", () => {
  assert.strictEqual(
    describeChanges("INPUT", [{ label: "WPN", value: false }, { label: "THR", value: true }]),
    "INPUT: WPN → OFF, THR → ON"
  );
});

console.log(`\ninputActions: ${passed} tests passed`);
