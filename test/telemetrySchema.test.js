// Mini test suite without a framework: node test/telemetrySchema.test.js
// Embeds a hand-built telemetry FileDescriptorProto in junk bytes (like
// in StarCitizen.exe) and checks that it is found, cut and decoded.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const descriptor = require("protobufjs/ext/descriptor");
const {
  findDescriptors,
  toDescriptorSet,
  fileVersionOf,
  loadSchemaFromExe,
  exePathFromGameLog,
  descriptorEnd,
} = require("../telemetrySchema");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}

const FDP = descriptor.FileDescriptorProto;
const typesProto = Buffer.from(FDP.encode(FDP.fromObject({
  name: "sc/game/telemetry/v1/types.proto",
  package: "sc.game.telemetry.v1",
  syntax: "proto3",
  messageType: [{
    name: "VehiclePowerState",
    field: [
      { name: "powerplants", number: 1, type: 8, label: 1 },
      { name: "sensors", number: 7, type: 8, label: 1 },
    ],
  }],
})).finish());

// junk, a string-only false positive, the descriptor, then junk that does not
// parse as FileDescriptorProto fields (0xFF = field 31, wire type 7)
const junk = Buffer.from([0x00, 0x13, 0x37, 0xff]);
const falseHit = Buffer.concat([Buffer.from([0x0a, 18]), Buffer.from("sc/game/telemetry/", "ascii")]);
const version = Buffer.alloc(64);
Buffer.from("VS_VERSION_INFO", "utf16le").copy(version, 0);
Buffer.from([0xbd, 0x04, 0xef, 0xfe]).copy(version, 32);
version.writeUInt32LE((4 << 16) | 10, 40);   // 4.10
version.writeUInt32LE((201 << 16) | 4808, 44); // .201.4808
const exe = Buffer.concat([junk, falseHit, junk, typesProto, Buffer.from([0xff, 0xff, 0x00]), junk, version]);

test("descriptorEnd stops exactly at the end of the descriptor", () => {
  const start = exe.indexOf(typesProto);
  assert.strictEqual(descriptorEnd(exe, start), start + typesProto.length);
});

test("findDescriptors finds the descriptor and skips plain string hits", () => {
  const files = findDescriptors(exe);
  assert.deepStrictEqual(Object.keys(files), ["sc/game/telemetry/v1/types.proto"]);
  assert.ok(files["sc/game/telemetry/v1/types.proto"].equals(typesProto));
});

test("fileVersionOf reads VS_FIXEDFILEINFO", () => {
  assert.strictEqual(fileVersionOf(exe), "4.10.201.4808");
  assert.strictEqual(fileVersionOf(junk), null);
});

test("loadSchemaFromExe builds a usable protobufjs root", () => {
  const tmp = path.join(os.tmpdir(), `sc-deck-fake-exe-${process.pid}.bin`);
  fs.writeFileSync(tmp, exe);
  try {
    const { version: v, root, descriptorSet } = loadSchemaFromExe(tmp);
    assert.strictEqual(v, "4.10.201.4808");
    const T = root.lookupType("sc.game.telemetry.v1.VehiclePowerState");
    const msg = T.decode(T.encode({ sensors: true }).finish());
    assert.deepStrictEqual(T.toObject(msg), { sensors: true });
    assert.strictEqual(descriptor.FileDescriptorSet.decode(descriptorSet).file.length, 1);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test("loadSchemaFromExe fails clearly without a schema", () => {
  const tmp = path.join(os.tmpdir(), `sc-deck-empty-exe-${process.pid}.bin`);
  fs.writeFileSync(tmp, junk);
  try {
    assert.throws(() => loadSchemaFromExe(tmp), /no telemetry schema/);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test("toDescriptorSet handles descriptors longer than 127 bytes", () => {
  const big = Buffer.alloc(300, 0);
  const set = toDescriptorSet({ a: big });
  assert.deepStrictEqual([...set.subarray(0, 3)], [0x0a, 0xac, 0x02]);
});

test("exePathFromGameLog points to Bin64 next to the log", () => {
  assert.strictEqual(
    exePathFromGameLog(path.join("G:", "SC", "LIVE", "Game.log")),
    path.join("G:", "SC", "LIVE", "Bin64", "StarCitizen.exe"),
  );
});

console.log(`\ntelemetrySchema: ${passed} passed`);
