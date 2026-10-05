// Mini test suite without a framework: node test/gamelog.test.js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createGameLogParser,
  createGameLogTailer,
  createGameLogPipeline,
  parseShipChannel,
  sessionIdOf,
} = require("../gamelog");

let passed = 0;
const pending = [];
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}
function testAsync(name, fn) {
  pending.push(
    fn().then(
      () => { passed++; console.log("  ✓", name); },
      (e) => { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
    )
  );
}

// Sample lines in the currently documented community format
const L = {
  login: "<2026-01-01T10:00:00.000Z> [Notice] <Legacy login response> [CIG-net] User Login Success - Handle[TestPilot] - ...",
  enter: (zone, entity) =>
    `<2026-01-01T10:00:01.000Z> [Notice] <CEntityComponentInstancedInterior::OnEntityEnterZone> [InstancedInterior] OnEntityEnterZone - InstancedInterior [${zone}] [123456789012] -> Entity [${entity}] [987654321098] -- m_openDoors[1]`,
  destroy: (veh, from, to) =>
    `<2026-01-01T10:00:02.000Z> [Notice] <Vehicle Destruction> CVehicle::OnAdvanceDestroyLevel: Vehicle '${veh}' [42] in zone 'OOC_Stanton' advanced from destroy level ${from} to ${to} caused by 'Someone'`,
  death: (victim) =>
    `<2026-01-01T10:00:03.000Z> [Notice] <Actor Death> CActor::Kill: '${victim}' [7] in zone 'AEGS_Gladius_100000000001' killed by 'Bandit' [9]`,
};

function collect(playerName) {
  const events = [];
  const parser = createGameLogParser({ onEvent: (e) => events.push(e), playerName });
  return { events, parser };
}

test("player handle is detected from the login line", () => {
  const { events, parser } = collect();
  parser.feedLine(L.login);
  assert.deepStrictEqual(events, [{ type: "player-identified", name: "TestPilot" }]);
  assert.strictEqual(parser.getState().playerName, "TestPilot");
});

test("entering a vehicle emits vehicle-changed with class name", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "TestPilot"));
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, "vehicle-changed");
  assert.strictEqual(events[0].vehicleId, "AEGS_Gladius_100000000001");
  assert.strictEqual(events[0].vehicleClass, "AEGS_Gladius");
  assert.strictEqual(events[0].previousVehicleId, null);
});

test("re-entering the SAME instance emits nothing (stand up / sit down)", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "TestPilot"));
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "TestPilot"));
  assert.strictEqual(events.length, 1);
});

test("entering a DIFFERENT instance emits vehicle-changed with previous id", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "TestPilot"));
  parser.feedLine(L.enter("ANVL_Carrack_200000000002", "TestPilot"));
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[1].previousVehicleId, "AEGS_Gladius_100000000001");
  assert.strictEqual(events[1].vehicleClass, "ANVL_Carrack");
});

test("a reclaimed ship of the same model counts as a different ship", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "TestPilot"));
  parser.feedLine(L.enter("AEGS_Gladius_100000000099", "TestPilot"));
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[1].type, "vehicle-changed");
});

test("non-vehicle zones (stations, hangars) are ignored", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(L.enter("Hangar_SelfLand_300000000003", "TestPilot"));
  parser.feedLine(L.enter("SolarSystem", "TestPilot"));
  parser.feedLine(L.enter("Room_Habs_A1", "TestPilot"));
  assert.strictEqual(events.length, 0);
});

test("other entities entering our zone are ignored", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "SomeoneElse"));
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "NPC_Guard_01"));
  assert.strictEqual(events.length, 0);
});

test("without a known handle, NPC-like and vehicle-like entities are filtered", () => {
  const { events, parser } = collect();
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "PU_Human_Enemy_01"));
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "CRAT_Cargo_400000000004"));
  assert.strictEqual(events.length, 0);
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "SomePlayer"));
  assert.strictEqual(events.length, 1);
});

test("destruction of the current vehicle is flagged and clears tracking", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "TestPilot"));
  parser.feedLine(L.destroy("AEGS_Gladius_100000000001", 0, 1));
  assert.strictEqual(events[1].type, "vehicle-destroyed");
  assert.strictEqual(events[1].isCurrent, true);
  assert.strictEqual(parser.getState().currentVehicleId, null);
});

test("destruction of a foreign vehicle keeps our tracking", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "TestPilot"));
  parser.feedLine(L.destroy("MISC_Prospector_500000000005", 0, 2));
  assert.strictEqual(events[1].isCurrent, false);
  assert.strictEqual(parser.getState().currentVehicleId, "AEGS_Gladius_100000000001");
});

test("own death emits player-killed, foreign death does not", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(L.death("Bandit"));
  assert.strictEqual(events.length, 0);
  parser.feedLine(L.death("TestPilot"));
  assert.deepStrictEqual(events, [{ type: "player-killed" }]);
});

test("resetSession emits session-reset and clears the vehicle", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(L.enter("AEGS_Gladius_100000000001", "TestPilot"));
  parser.resetSession();
  assert.strictEqual(events[1].type, "session-reset");
  assert.strictEqual(parser.getState().currentVehicleId, null);
});

test("patterns can be overridden via config (patch drift)", () => {
  const events = [];
  const parser = createGameLogParser({
    onEvent: (e) => events.push(e),
    playerName: "TestPilot",
    patterns: { zoneEnter: "NewZoneFormat zone=(\\S+) who=(\\S+)" },
  });
  parser.feedLine("... NewZoneFormat zone=AEGS_Gladius_100000000001 who=TestPilot ...");
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, "vehicle-changed");
});

// ---- Ship channel path (current patches) ----
// Real lines from a Game.log (2026-09-27), handle replaced by TestPilot.
const R = {
  spawn: (id) =>
    `<2026-09-27T19:00:14.641Z> [Notice] <CEntityComponentShipListProvider::SetVehicleSpawningInformations> SetVehicleSpawningInformations - VehicleEntityId: [${id}], LandingArea: TestPilot's`,
  stow: (id) =>
    `<2026-09-27T19:00:28.670Z> [Notice] <LandingArea_UnregisterFromExternalSystems_StowingVehicle> [STOWING ON UNREGISTER] LandingArea_ShipElevator_HangarLargeFront [847567684616] - Attempting to stow current vehicle [${id}] due to landing area unregistering. Vehicle Zone Host [847567684314], IsAuthorityPossible [0] [Team_MissionFeatures][ATC]`,
  joined: (channel) =>
    `<2026-09-27T19:03:22.353Z> [Notice] <SHUDEvent_OnNotification> Added notification "You have joined channel '${channel}'.`,
  // continuation line the game writes right after the notification
  joinedCont: (channel) => `<2026-09-27T19:03:22.353Z>    "You have joined channel '${channel}'.`,
  left: (channel) =>
    `<2026-09-27T19:07:32.833Z> [Notice] <SHUDEvent_OnNotification> Added notification "You have left the channel '${channel}'.`,
  clearDriver: (instance) =>
    `<2026-09-27T19:06:47.545Z> [Notice] <Vehicle Control Flow> CVehicleMovementBase::ClearDriver: Local client node [204741570099] releasing control token for '${instance}' [${instance.split("_").pop()}] [Team_CGP4][Vehicle]`,
  destroy: (instance) =>
    `<2026-09-27T19:30:00.000Z> [Notice] <Vehicle Destruction> CVehicle::OnAdvanceDestroyLevel: Vehicle '${instance}' [42] in zone 'OOC_Stanton' advanced from destroy level 0 to 2 caused by 'Someone'`,
};
const STARLANCER = "MISC Starlancer TAC : TestPilot";
const APOLLO = "RSI Apollo Medivac : TestPilot";

test("parseShipChannel: display name form", () => {
  assert.deepStrictEqual(parseShipChannel(STARLANCER), {
    vehicleClass: "MISC_Starlancer_TAC",
    manufacturer: "MISC",
    shipName: "MISC Starlancer TAC",
    owner: "TestPilot",
  });
});

test("parseShipChannel: @vehicle_Name loc key form", () => {
  const s = parseShipChannel("@vehicle_NameRSI_Hermes : TestOwner");
  assert.strictEqual(s.vehicleClass, "RSI_Hermes");
  assert.strictEqual(s.manufacturer, "RSI");
  assert.strictEqual(s.owner, "TestOwner");
});

test("parseShipChannel: manufacturer display names map to class codes", () => {
  assert.strictEqual(parseShipChannel("Anvil Hornet Mk II : X").vehicleClass, "ANVL_Hornet_Mk_II");
  assert.strictEqual(parseShipChannel("Drake Cutlass Black : X").manufacturer, "DRAK");
  assert.strictEqual(parseShipChannel("Consolidated Outland Mustang Alpha : X").vehicleClass, "CNOU_Mustang_Alpha");
  // unknown manufacturer: first word kept as prefix
  assert.strictEqual(parseShipChannel("Foo Bar : X").vehicleClass, "FOO_Bar");
});

test("joined channel boards the ship (continuation line not counted twice)", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.joined(STARLANCER));
  parser.feedLine(R.joinedCont(STARLANCER));
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, "vehicle-changed");
  assert.strictEqual(events[0].vehicleId, "MISC_Starlancer_TAC:TestPilot");
  assert.strictEqual(events[0].vehicleClass, "MISC_Starlancer_TAC");
  assert.strictEqual(events[0].manufacturer, "MISC");
  assert.strictEqual(events[0].shipName, "MISC Starlancer TAC");
  assert.strictEqual(events[0].fresh, false);
});

test("non-ship channels (no owner) are ignored", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.joined("General"));
  assert.strictEqual(events.length, 0);
});

test("left channel of the current ship emits vehicle-left, others are ignored", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.joined(STARLANCER));
  parser.feedLine(R.left(APOLLO)); // not our current ship
  assert.strictEqual(events.length, 1);
  parser.feedLine(R.left(STARLANCER));
  assert.deepStrictEqual(events[1], {
    type: "vehicle-left",
    vehicleId: "MISC_Starlancer_TAC:TestPilot",
    vehicleClass: "MISC_Starlancer_TAC",
  });
  assert.strictEqual(parser.getState().currentVehicleId, null);
});

test("ClearDriver (standing up) is not an exit", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.joined(STARLANCER));
  parser.feedLine(R.clearDriver("MISC_Starlancer_TAC_848673759629"));
  assert.strictEqual(events.length, 1);
  assert.strictEqual(parser.getState().currentVehicle.instanceId, "848673759629");
});

test("terminal retrieval + boarding = fresh instance; re-boarding without retrieval = not fresh", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.spawn("848996865298"));
  parser.feedLine(R.joined(APOLLO));
  assert.strictEqual(events[0].fresh, true);
  assert.strictEqual(events[0].instanceId, "848996865298");
  parser.feedLine(R.left(APOLLO));
  parser.feedLine(R.joined(APOLLO));
  assert.strictEqual(events[2].type, "vehicle-changed");
  assert.strictEqual(events[2].fresh, false);
  assert.strictEqual(events[2].instanceId, "848996865298");
});

test("a re-retrieved ship (new ID) is fresh again", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.spawn("100000000001"));
  parser.feedLine(R.joined(APOLLO));
  parser.feedLine(R.left(APOLLO));
  parser.feedLine(R.spawn("100000000002"));
  parser.feedLine(R.joined(APOLLO));
  assert.strictEqual(events[2].fresh, true);
});

test("stowed retrieval is void: later boarding is not fresh", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.spawn("848673759629"));
  parser.feedLine(R.stow("848673759629"));
  parser.feedLine(R.joined(STARLANCER));
  assert.strictEqual(events[0].fresh, false);
  assert.strictEqual(parser.getState().pendingSpawnId, null);
});

test("boarding someone else's ship does not consume our pending retrieval", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.spawn("100000000001"));
  parser.feedLine(R.joined("RSI Apollo Medivac : Friend"));
  assert.strictEqual(events[0].fresh, false);
  assert.strictEqual(events[0].owner, "Friend");
  assert.strictEqual(parser.getState().pendingSpawnId, "100000000001");
});

test("ClearDriver corrects a wrongly consumed retrieval back to pending", () => {
  const { parser } = collect("TestPilot");
  parser.feedLine(R.spawn("100000000009")); // retrieved ship X ...
  parser.feedLine(R.joined(STARLANCER));    // ... but boarded an existing Starlancer
  parser.feedLine(R.clearDriver("MISC_Starlancer_TAC_100000000005"));
  assert.strictEqual(parser.getState().currentVehicle.instanceId, "100000000005");
  assert.strictEqual(parser.getState().pendingSpawnId, "100000000009");
});

test("destruction of the current (channel-tracked) ship is flagged with its key", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.spawn("848996865298"));
  parser.feedLine(R.joined(APOLLO));
  parser.feedLine(R.destroy("RSI_Apollo_Medivac_848996865298"));
  assert.deepStrictEqual(events[1], {
    type: "vehicle-destroyed",
    vehicleId: "RSI_Apollo_Medivac:TestPilot",
    vehicleClass: "RSI_Apollo_Medivac",
    isCurrent: true,
  });
  assert.strictEqual(parser.getState().currentVehicleId, null);
});

test("destruction of an unknown ship reports no key", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.joined(APOLLO));
  parser.feedLine(R.destroy("DRAK_Cutlass_Black_555555555555"));
  assert.strictEqual(events[1].vehicleId, null);
  assert.strictEqual(events[1].isCurrent, false);
});

test("resetSession forgets pending retrievals and known instances", () => {
  const { events, parser } = collect("TestPilot");
  parser.feedLine(R.spawn("848996865298"));
  parser.feedLine(R.joined(APOLLO));
  parser.resetSession();
  parser.feedLine(R.joined(APOLLO));
  assert.strictEqual(events[2].type, "vehicle-changed");
  assert.strictEqual(events[2].instanceId, null);
  assert.strictEqual(parser.getState().pendingSpawnId, null);
});

test("replay of a real session: Starlancer -> Apollo -> leave -> re-board", () => {
  const { events, parser } = collect(); // handle from the login line
  [
    "<2026-09-27T18:51:46.772Z> [Notice] <Legacy login response> [CIG-net] User Login Success - Handle[TestPilot] - Time[220705257] [Team_GameServices][Login]",
    R.spawn("848673759629"),
    R.stow("848673759629"),
    R.spawn("848673759629"),
    R.joined(STARLANCER),
    R.joinedCont(STARLANCER),
    R.clearDriver("MISC_Starlancer_TAC_848673759629"),
    R.left(STARLANCER),
    R.spawn("848996865298"),
    R.joined(APOLLO),
    R.clearDriver("RSI_Apollo_Medivac_848996865298"),
    R.left(APOLLO),
    R.joined(APOLLO),
  ].forEach((l) => parser.feedLine(l));
  assert.deepStrictEqual(
    events.map((e) => [e.type, e.vehicleClass || e.name, e.fresh]),
    [
      ["player-identified", "TestPilot", undefined],
      ["vehicle-changed", "MISC_Starlancer_TAC", true],
      ["vehicle-left", "MISC_Starlancer_TAC", undefined],
      ["vehicle-changed", "RSI_Apollo_Medivac", true],
      ["vehicle-left", "RSI_Apollo_Medivac", undefined],
      ["vehicle-changed", "RSI_Apollo_Medivac", false],
    ]
  );
});

// Real session 2026-09-28 (test/fixtures, ship-relevant lines only, handle
// replaced): every manufacturer with a theme, boarded once each, M80 twice.
// Pins the channel display names -> class names that the themes are keyed on.
const SESSION_0928 = fs
  .readFileSync(path.join(__dirname, "fixtures", "session-2026-09-28.log"), "utf-8")
  .split(/\r?\n/)
  .filter(Boolean);

test("replay of a real session 2026-09-28: class names, fresh/restore, every exit logged", () => {
  const { events, parser } = collect();
  SESSION_0928.forEach((l) => parser.feedLine(l));
  const boardings = events.filter((e) => e.type === "vehicle-changed");
  assert.deepStrictEqual(
    boardings.map((e) => [e.vehicleClass, e.instanceId, e.fresh]),
    [
      ["ORIG_M80", "848671165705", true],
      ["ORIG_M80", "848671165705", false], // re-boarded without retrieval
      ["ORIG_400i", "849032503426", true],
      ["ANVL_F7A_Hornet_Mk_II", "849589333732", true],
      ["AEGS_Gladius", "849961812176", true],
      ["AEGS_Sabre", "849753131675", true],
      ["CRUS_A1_Spirit", "849547347575", true],
      ["DRAK_Corsair", "849202573030", true],
      ["KRIG_L-21_Wolf", "849132744946", true],
      ["KRIG_L-22_Alpha_Wolf", "850123996035", true],
      ["RSI_Aurora_Mk_II", "849753257297", true],
      ["RSI_Constellation_Andromeda", "849980955387", true],
    ]
  );
  assert.ok(boardings.every((e) => e.owner === "TestPilot"));
  // ClearDriver confirmed every instance ID - nothing left pending/corrected
  const lefts = events.filter((e) => e.type === "vehicle-left");
  assert.strictEqual(lefts.length, boardings.length, "each boarding has its exit");
  assert.strictEqual(parser.getState().currentVehicleId, null);
  assert.strictEqual(parser.getState().pendingSpawnId, null);
});

// ---- Pipeline: session + line tagging ----
function pipe() {
  const events = [];
  const pipeline = createGameLogPipeline({ onEvent: (e) => events.push(e), playerName: "TestPilot" });
  const feed = (lines, from = 1) => lines.forEach((l, i) => pipeline.feedLine(l, from + i));
  return { events, pipeline, feed };
}
const FIRST = "<2026-09-28T18:29:21.844Z> BackupNameAttachment=\" Build(12660092) 28 Sep 26\"";
const FIRST_NEXT = "<2026-09-29T09:00:00.000Z> BackupNameAttachment=\" Build(12660092) 29 Sep 26\"";

test("sessionIdOf: start timestamp of the first log line", () => {
  assert.strictEqual(sessionIdOf(FIRST), "2026-09-28T18:29:21.844Z");
  assert.strictEqual(sessionIdOf("no timestamp"), "no timestamp");
});

test("pipeline tags every event with session and line", () => {
  const { events, feed } = pipe();
  feed([FIRST, R.joined(STARLANCER), R.left(STARLANCER)]);
  assert.deepStrictEqual(
    events.map((e) => [e.type, e.session, e.line]),
    [
      ["vehicle-changed", "2026-09-28T18:29:21.844Z", 2],
      ["vehicle-left", "2026-09-28T18:29:21.844Z", 3],
    ]
  );
});

test("pipeline: truncation resets with session null, new log gets its own session", () => {
  const { events, pipeline, feed } = pipe();
  feed([FIRST, R.joined(STARLANCER)]);
  pipeline.truncate();
  feed([FIRST_NEXT, R.joined(STARLANCER)]);
  assert.deepStrictEqual(
    events.map((e) => [e.type, e.session, e.line]),
    [
      ["vehicle-changed", "2026-09-28T18:29:21.844Z", 2],
      ["session-reset", null, 0],
      ["vehicle-changed", "2026-09-29T09:00:00.000Z", 2],
    ]
  );
});

test("pipeline: log replaced unnoticed (new first line) resets the session", () => {
  const { events, pipeline, feed } = pipe();
  feed([FIRST, R.joined(STARLANCER)]);
  feed([FIRST_NEXT], 1); // tailer restarted at offset 0 (file was missing)
  assert.strictEqual(events[1].type, "session-reset");
  assert.strictEqual(events[1].session, "2026-09-29T09:00:00.000Z");
  assert.strictEqual(pipeline.getState().currentVehicleId, null);
});

test("pipeline: the same log read from the start again is not a new session", () => {
  const { events, feed } = pipe();
  feed([FIRST, R.joined(STARLANCER)]);
  feed([FIRST, R.joined(STARLANCER)], 1);
  assert.ok(!events.some((e) => e.type === "session-reset"));
});

// ---- Tailer: real file on disk, short poll interval ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

testAsync("tailer reads appended lines, handles partial lines and truncation", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scdeck-"));
  const file = path.join(dir, "Game.log");
  const lines = [];
  const numbers = [];
  let truncations = 0;
  const statuses = [];

  // File does not exist yet -> tailer must wait, not crash
  const tailer = createGameLogTailer({
    filePath: file,
    pollMs: 40,
    onLine: (l, n) => { lines.push(l); numbers.push(n); },
    onTruncate: () => truncations++,
    onStatus: (s) => statuses.push(s),
  });

  await sleep(100);
  assert.ok(statuses.includes("missing"), "should report missing file");

  fs.writeFileSync(file, "line one\nline two\npartial");
  await sleep(120);
  assert.deepStrictEqual(lines, ["line one", "line two"], "partial line must be held back");

  fs.appendFileSync(file, " completed\r\nline three\n");
  await sleep(120);
  assert.deepStrictEqual(lines, ["line one", "line two", "partial completed", "line three"]);

  // Truncation = game restart
  fs.writeFileSync(file, "fresh session\n");
  await sleep(120);
  assert.strictEqual(truncations, 1, "truncation must be detected");
  assert.strictEqual(lines[lines.length - 1], "fresh session");
  assert.deepStrictEqual(numbers, [1, 2, 3, 4, 1], "line numbers restart with the file");
  assert.ok(statuses.includes("watching"));

  tailer.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

Promise.all(pending).then(() => console.log(`\n${passed} tests passed`));
