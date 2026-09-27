// Mini test suite without a framework: node test/gameEvents.test.mjs
import assert from "assert";
import { applyGameEvent, initialToggleStates, describeGameEvent } from "../src/gameEvents.js";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}

const pages = [
  {
    id: "p", title: "P",
    panels: [
      {
        id: "pl", title: "PL",
        widgets: [
          { type: "toggle", id: "lights", label: "L", keys: ["T"], initial: false },
          { type: "toggle", id: "wpn", label: "W", keys: ["F5"], initial: true },
          { type: "button", id: "btn", label: "B", keys: ["N"] },
        ],
      },
    ],
  },
];

const base = () => ({
  toggleStates: { lights: true, wpn: false }, // user flipped both
  currentVehicleId: "AEGS_Gladius_1",
  vehicleMemory: {},
});

test("initialToggleStates reads initial values, ignores buttons", () => {
  assert.deepStrictEqual(initialToggleStates(pages), { lights: false, wpn: true });
});

test("vehicle-changed resets toggles to initial and remembers the old ship", () => {
  const up = applyGameEvent(base(), {
    type: "vehicle-changed", vehicleId: "ANVL_Carrack_2",
    vehicleClass: "ANVL_Carrack", previousVehicleId: "AEGS_Gladius_1",
  }, pages);
  assert.deepStrictEqual(up.toggleStates, { lights: false, wpn: true });
  assert.strictEqual(up.currentVehicleId, "ANVL_Carrack_2");
  assert.deepStrictEqual(up.vehicleMemory["AEGS_Gladius_1"], { lights: true, wpn: false });
});

test("returning to a remembered ship restores its state", () => {
  const state = base();
  const up1 = applyGameEvent(state, {
    type: "vehicle-changed", vehicleId: "ANVL_Carrack_2", vehicleClass: "ANVL_Carrack",
  }, pages);
  const up2 = applyGameEvent({ ...state, ...up1 }, {
    type: "vehicle-changed", vehicleId: "AEGS_Gladius_1", vehicleClass: "AEGS_Gladius",
  }, pages);
  assert.deepStrictEqual(up2.toggleStates, { lights: true, wpn: false });
});

test("destruction of the current ship resets and forgets it", () => {
  const state = base();
  state.vehicleMemory = { AEGS_Gladius_1: { lights: true, wpn: false } };
  const up = applyGameEvent(state, {
    type: "vehicle-destroyed", vehicleId: "AEGS_Gladius_1",
    vehicleClass: "AEGS_Gladius", isCurrent: true,
  }, pages);
  assert.deepStrictEqual(up.toggleStates, { lights: false, wpn: true });
  assert.strictEqual(up.currentVehicleId, null);
  assert.ok(!("AEGS_Gladius_1" in up.vehicleMemory));
});

test("destruction of a foreign ship only prunes its memory", () => {
  const state = base();
  state.vehicleMemory = { MISC_Prospector_9: { lights: true } };
  const up = applyGameEvent(state, {
    type: "vehicle-destroyed", vehicleId: "MISC_Prospector_9",
    vehicleClass: "MISC_Prospector", isCurrent: false,
  }, pages);
  assert.strictEqual(up.toggleStates, undefined, "toggles must stay untouched");
  assert.deepStrictEqual(up.vehicleMemory, {});
});

test("player-killed resets toggles but keeps ship memory", () => {
  const state = base();
  state.vehicleMemory = { ANVL_Carrack_2: { wpn: false } };
  const up = applyGameEvent(state, { type: "player-killed" }, pages);
  assert.deepStrictEqual(up.toggleStates, { lights: false, wpn: true });
  assert.strictEqual(up.currentVehicleId, null);
  assert.strictEqual(up.vehicleMemory, undefined, "memory untouched");
});

test("session-reset wipes everything including memory", () => {
  const state = base();
  state.vehicleMemory = { ANVL_Carrack_2: { wpn: false } };
  const up = applyGameEvent(state, { type: "session-reset" }, pages);
  assert.deepStrictEqual(up.vehicleMemory, {});
  assert.deepStrictEqual(up.toggleStates, { lights: false, wpn: true });
});

test("vehicle-changed with fresh drops the stale memory of that ship", () => {
  const state = base();
  state.currentVehicleId = null;
  state.vehicleMemory = { "RSI_Apollo_Medivac:P": { lights: true, wpn: false } };
  const up = applyGameEvent(state, {
    type: "vehicle-changed", vehicleId: "RSI_Apollo_Medivac:P",
    vehicleClass: "RSI_Apollo_Medivac", shipName: "RSI Apollo Medivac", fresh: true,
  }, pages);
  assert.deepStrictEqual(up.toggleStates, { lights: false, wpn: true });
  assert.ok(!("RSI_Apollo_Medivac:P" in up.vehicleMemory));
  assert.strictEqual(up.currentVehicleName, "RSI Apollo Medivac");
});

test("vehicle-left remembers the state and falls back to initial", () => {
  const up = applyGameEvent(base(), {
    type: "vehicle-left", vehicleId: "AEGS_Gladius_1", vehicleClass: "AEGS_Gladius",
  }, pages);
  assert.strictEqual(up.currentVehicleId, null);
  assert.strictEqual(up.currentVehicleClass, null);
  assert.deepStrictEqual(up.toggleStates, { lights: false, wpn: true });
  assert.deepStrictEqual(up.vehicleMemory["AEGS_Gladius_1"], { lights: true, wpn: false });
});

test("leave + re-board (not fresh) restores the ship's state", () => {
  const state = base();
  const up1 = applyGameEvent(state, { type: "vehicle-left", vehicleId: "AEGS_Gladius_1" }, pages);
  const up2 = applyGameEvent({ ...state, ...up1 }, {
    type: "vehicle-changed", vehicleId: "AEGS_Gladius_1", vehicleClass: "AEGS_Gladius", fresh: false,
  }, pages);
  assert.deepStrictEqual(up2.toggleStates, { lights: true, wpn: false });
});

test("vehicle-left for a ship we are not in changes nothing", () => {
  assert.strictEqual(
    applyGameEvent(base(), { type: "vehicle-left", vehicleId: "OTHER" }, pages),
    null
  );
});

test("destruction without a known key keeps memory and toggles", () => {
  const state = base();
  state.vehicleMemory = { X: { lights: true } };
  const up = applyGameEvent(state, {
    type: "vehicle-destroyed", vehicleId: null, vehicleClass: "DRAK_Cutlass_Black", isCurrent: false,
  }, pages);
  assert.deepStrictEqual(up.vehicleMemory, { X: { lights: true } });
  assert.strictEqual(up.toggleStates, undefined);
});

test("unknown events change nothing", () => {
  assert.strictEqual(applyGameEvent(base(), { type: "whatever" }, pages), null);
});

test("describeGameEvent produces status bar messages", () => {
  assert.strictEqual(describeGameEvent({ type: "vehicle-changed", vehicleClass: "AEGS_Gladius" }), "SHIP: AEGS_Gladius");
  assert.strictEqual(describeGameEvent({ type: "vehicle-changed", vehicleClass: "RSI_Apollo_Medivac", shipName: "RSI Apollo Medivac" }), "SHIP: RSI Apollo Medivac");
  assert.strictEqual(describeGameEvent({ type: "vehicle-left" }), "LEFT SHIP");
  assert.strictEqual(describeGameEvent({ type: "vehicle-destroyed", isCurrent: false }), null);
  assert.ok(describeGameEvent({ type: "player-killed" }));
});

console.log(`\n${passed} tests passed`);
