// Mini test suite without a framework: node test/gameEvents.test.mjs
import assert from "assert";
import {
  applyGameEvent,
  initialToggleStates,
  describeGameEvent,
  isAlreadyApplied,
  cursorAfter,
  snapshotOf,
  restoreSnapshot,
} from "../src/gameEvents.js";

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

// ---- Log position + persistence ----
const S = "2026-09-28T18:29:21.844Z";
const ev = (line, session = S) => ({ type: "vehicle-left", vehicleId: "x", session, line });

test("isAlreadyApplied: same session up to the cursor is skipped, everything else applies", () => {
  const cursor = { session: S, line: 10 };
  assert.strictEqual(isAlreadyApplied(cursor, ev(9)), true);
  assert.strictEqual(isAlreadyApplied(cursor, ev(10)), true);
  assert.strictEqual(isAlreadyApplied(cursor, ev(11)), false);
  assert.strictEqual(isAlreadyApplied(cursor, ev(3, "other session")), false);
  assert.strictEqual(isAlreadyApplied(null, ev(3)), false);
  // session-reset after truncation has no session -> always applies
  assert.strictEqual(isAlreadyApplied(cursor, { type: "session-reset", session: null, line: 0 }), false);
});

test("cursorAfter: position of the event, null after a truncation reset", () => {
  assert.deepStrictEqual(cursorAfter(ev(7)), { session: S, line: 7 });
  assert.strictEqual(cursorAfter({ type: "session-reset", session: null, line: 0 }), null);
});

const live = () => ({
  gamelogCursor: { session: S, line: 42 },
  currentVehicleId: "ORIG_M80:P",
  currentVehicleClass: "ORIG_M80",
  currentVehicleName: "Origin M80",
  toggleStates: { lights: true, wpn: false },
  vehicleMemory: { "AEGS_Sabre:P": { lights: true, wpn: true } },
  pages, // not part of the snapshot
});

test("snapshot round trip within the same session restores ship, toggles and memory", () => {
  const snap = JSON.parse(JSON.stringify(snapshotOf(live())));
  assert.strictEqual(snap.pages, undefined);
  assert.deepStrictEqual(restoreSnapshot(snap, ev(1), pages), {
    gamelogCursor: { session: S, line: 42 },
    currentVehicleId: "ORIG_M80:P",
    currentVehicleClass: "ORIG_M80",
    currentVehicleName: "Origin M80",
    toggleStates: { lights: true, wpn: false },
    vehicleMemory: { "AEGS_Sabre:P": { lights: true, wpn: true } },
  });
});

test("snapshot of another game session is not restored", () => {
  const snap = snapshotOf(live());
  assert.strictEqual(restoreSnapshot(snap, ev(1, "2026-09-29T09:00:00.000Z"), pages), null);
  assert.strictEqual(restoreSnapshot(snap, { type: "session-reset", session: null, line: 0 }, pages), null);
});

test("restore: toggles follow the current config, garbage is dropped", () => {
  const snap = snapshotOf(live());
  snap.toggleStates = { lights: true, removedWidget: true, wpn: "yes", "once:v_flightready": true };
  snap.vehicleMemory = { "A:P": { lights: false, junk: 3 }, "B:P": "nope" };
  const up = restoreSnapshot(snap, ev(1), pages);
  // wpn: invalid value -> initial (true); removed widget dropped; once-flag kept
  assert.deepStrictEqual(up.toggleStates, { lights: true, wpn: true, "once:v_flightready": true });
  assert.deepStrictEqual(up.vehicleMemory, { "A:P": { lights: false }, "B:P": {} });
});

test("restore rejects unknown versions and broken files", () => {
  assert.strictEqual(restoreSnapshot(null, ev(1), pages), null);
  assert.strictEqual(restoreSnapshot({ ...snapshotOf(live()), version: 99 }, ev(1), pages), null);
  assert.strictEqual(restoreSnapshot({ ...snapshotOf(live()), cursor: null }, ev(1), pages), null);
  assert.strictEqual(
    restoreSnapshot({ ...snapshotOf(live()), cursor: { session: S, line: "x" } }, ev(1), pages),
    null
  );
});

test("restored state + replayed log: only events after the cursor change anything", () => {
  // Saved while in the M80 with lights ON (line 42). The app restarts; the
  // replay starts with the first boarding of the M80 (fresh, line 5) - that
  // must not wipe the state - and continues past the cursor.
  let state = restoreSnapshot(snapshotOf(live()), ev(1), pages);
  const replay = [
    { type: "vehicle-changed", vehicleId: "ORIG_M80:P", vehicleClass: "ORIG_M80", fresh: true, session: S, line: 5 },
    { type: "vehicle-left", vehicleId: "ORIG_M80:P", session: S, line: 50 },
  ];
  for (const e of replay) {
    if (isAlreadyApplied(state.gamelogCursor, e)) continue;
    state = { ...state, ...applyGameEvent(state, e, pages), gamelogCursor: cursorAfter(e) };
  }
  assert.deepStrictEqual(state.vehicleMemory["ORIG_M80:P"], { lights: true, wpn: false });
  assert.strictEqual(state.currentVehicleId, null);
  assert.deepStrictEqual(state.gamelogCursor, { session: S, line: 50 });
});

console.log(`\n${passed} tests passed`);
