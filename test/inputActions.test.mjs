// Mini test suite without a framework: node test/inputActions.test.mjs
// Physical input -> SC action -> toggle states (Phase C, renderer side).
import assert from "assert";
import fs from "fs";
import { createRequire } from "module";
import {
  applyActions,
  createActionMatcher,
  describeChanges,
  isToggleOn,
  ONCE_PREFIX,
} from "../src/inputActions.js";
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

const POWER = ["pwr-all", "pwr-wpn", "pwr-thr", "pwr-shld"];
const shown = (states) => {
  const byId = Object.fromEntries(
    config.pages.flatMap((p) => p.panels.flatMap((pl) => pl.widgets)).map((w) => [w.id, w])
  );
  return Object.fromEntries(POWER.map((id) => [id, isToggleOn(states, byId[id])]));
};
const run = (states, ...actions) => applyActions(states, actions, config.pages, config.effects);

test("fresh ship shows everything OFF; master power brings up WPN + SHLD, not THR", () => {
  const initial = initialToggleStates(config.pages);
  assert.deepStrictEqual(shown(initial), { "pwr-all": false, "pwr-wpn": false, "pwr-thr": false, "pwr-shld": false });
  const on = run(initial, "v_power_toggle");
  assert.deepStrictEqual(
    on.changes.map((c) => [c.id, c.value]),
    [["pwr-wpn", true], ["pwr-shld", true], ["pwr-all", true]],
    "status lists what became visible"
  );
  assert.deepStrictEqual(shown(on.toggleStates), { "pwr-all": true, "pwr-wpn": true, "pwr-thr": false, "pwr-shld": true });
});

test("master power off hides the subsystems, on restores them (SC remembers)", () => {
  let s = run(initialToggleStates(config.pages), "v_power_toggle").toggleStates;
  s = run(s, "v_power_toggle_thrusters", "v_power_toggle_weapons").toggleStates; // THR on, WPN off
  const off = run(s, "v_power_toggle");
  assert.deepStrictEqual(shown(off.toggleStates), { "pwr-all": false, "pwr-wpn": false, "pwr-thr": false, "pwr-shld": false });
  const back = run(off.toggleStates, "v_power_toggle");
  assert.deepStrictEqual(shown(back.toggleStates), { "pwr-all": true, "pwr-wpn": false, "pwr-thr": true, "pwr-shld": true });
});

test("subsystem keys do nothing while master power is off", () => {
  const initial = initialToggleStates(config.pages);
  assert.strictEqual(run(initial, "v_power_toggle_weapons"), null);
  assert.strictEqual(run(initial, "v_power_toggle_thrusters"), null);
  assert.strictEqual(run(initial, "v_unknown"), null);
});

test("flight ready switches everything on - only once per ship", () => {
  const initial = initialToggleStates(config.pages);
  const r = run(initial, "v_flightready");
  assert.deepStrictEqual(shown(r.toggleStates), { "pwr-all": true, "pwr-wpn": true, "pwr-thr": true, "pwr-shld": true });
  assert.strictEqual(r.toggleStates["wpn-safety"], initial["wpn-safety"], "other toggles untouched");
  const off = run(r.toggleStates, "v_power_toggle").toggleStates;
  assert.strictEqual(run(off, "v_flightready"), null, "second flight ready is ignored");
  // the flag alone still counts as a change (must be stored), status stays empty
  const flagOnly = run({ ...initial, "pwr-all": true, "pwr-wpn": true, "pwr-thr": true, "pwr-shld": true }, "v_flightready");
  assert.deepStrictEqual(flagOnly.changes, []);
  assert.strictEqual(flagOnly.toggleStates[ONCE_PREFIX + "v_flightready"], true);
  assert.strictEqual(initialToggleStates(config.pages)[ONCE_PREFIX + "v_flightready"], undefined, "reset clears it");
});

test("effects without once fire every time", () => {
  const pages = [{ panels: [{ widgets: [{ type: "toggle", id: "t", label: "T" }] }] }];
  const fx = { v_x: { t: true } };
  const first = applyActions({ t: false }, ["v_x"], pages, fx).toggleStates;
  assert.deepStrictEqual(first, { t: true }, "no flag stored");
  assert.strictEqual(applyActions({ ...first, t: false }, ["v_x"], pages, fx).toggleStates.t, true);
});

test("status text", () => {
  assert.strictEqual(
    describeChanges("INPUT", [{ label: "WPN", value: false }, { label: "THR", value: true }]),
    "INPUT: WPN → OFF, THR → ON"
  );
});

console.log(`\ninputActions: ${passed} tests passed`);
