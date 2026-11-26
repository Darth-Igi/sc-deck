// Phase 0: record the Star Citizen telemetry stream (gRPC, 127.0.0.1:2942).
//
//   npm run telemetry:record [-- --exe <StarCitizen.exe>] [--addr host:port] [--out dir]
//
// - Schema is read from the installed StarCitizen.exe (telemetrySchema.js),
//   so the recording always matches the running build.
// - Prints every change of a discrete value (bool/enum/string/int) live.
//   Power-related paths (power, annunciators, sensors/radar, coolers,
//   shields, quantum) are marked with ★.
// - Type a note + Enter at any time to drop a marker into the log
//   (e.g. "radar aus über MFD").
// - Ctrl+C ends the recording and writes summary.json.
//
// Output in recordings/<timestamp>/:
//   schema.txt     readable schema of this build
//   schema.desc    FileDescriptorSet (needed to decode frames.bin later)
//   frames.bin     every raw frame: float64 LE epoch ms, uint32 LE length, bytes
//   changes.log    the live log (changes, events, markers)
//   summary.json   per path: values seen, change count, min/max for floats,
//                  plus all schema fields never seen with a non-default value
//
// Read-only: only TelemetryStream (and nothing that triggers game actions).

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const grpc = require("@grpc/grpc-js");
const protobuf = require("protobufjs");
const schema = require("../telemetrySchema.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG = "sc.game.telemetry.v1";
const STREAM_METHOD = `/${PKG}.GameTelemetryService/TelemetryStream`;
const RETRY_MS = 2000;
const ABSENT_DEBOUNCE = 10; // frames a top-level block must be missing before "absent" is logged

const POWER_RE = /power|annunciator|sensor|radr|radar|cool|shld|shield|qdrv|quantum|pwr|life_support|gravity_gen|emitter/i;

// ---------- args ----------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function defaultExe() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
    if (cfg.gamelog?.path) return schema.exePathFromGameLog(cfg.gamelog.path);
  } catch {
    // fall through
  }
  return "C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Bin64\\StarCitizen.exe";
}

const exePath = arg("exe", defaultExe());
const addr = arg("addr", "127.0.0.1:2942");
const stamp = new Date().toISOString().replace(/[:T]/g, "-").replace(/\..+/, "");
const outDir = path.resolve(arg("out", path.join(ROOT, "recordings", stamp)));

// ---------- schema ----------
console.log(`Schema aus ${exePath} …`);
const { version, descriptorSet, root } = schema.loadSchemaFromExe(exePath);
const Response = root.lookupType(`${PKG}.TelemetryStreamResponse`);
console.log(`Build ${version}`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "schema.txt"), `# StarCitizen.exe ${version}\n${schema.describeSchema(root)}\n`);
fs.writeFileSync(path.join(outDir, "schema.desc"), descriptorSet);
const framesOut = fs.openSync(path.join(outDir, "frames.bin"), "a");
const logOut = fs.openSync(path.join(outDir, "changes.log"), "a");

/** All leaf paths of a message type, with field kind, e.g. vehicle.state.power.sensors → bool. */
function leafPaths(type, prefix = "", seen = new Set()) {
  const out = {};
  if (seen.has(type.fullName)) return out;
  seen = new Set(seen).add(type.fullName);
  for (const f of type.fieldsArray) {
    f.resolve();
    const p = `${prefix}${f.name}${f.repeated ? "[]" : ""}`;
    if (f.resolvedType instanceof protobuf.Type) {
      Object.assign(out, leafPaths(f.resolvedType, `${p}.`, seen));
    } else {
      out[p] = f.resolvedType instanceof protobuf.Enum ? "enum" : f.type;
    }
  }
  return out;
}
const LEAVES = leafPaths(Response);
const FLOATY = new Set(["float", "double"]);
const kindOf = (p) => LEAVES[p.replace(/\[\d+\]/g, "[]")];
// proto3 omits default values: missing = false / 0 / "" / first enum value
function defaultOf(p) {
  const k = kindOf(p);
  if (k === "bool") return false;
  if (k === "string") return "";
  if (k === "enum") return "UNSPECIFIED";
  if (k === "int64" || k === "uint64" || k === "sint64" || k === "fixed64") return "0";
  return 0;
}
const isNoisy = (p) => FLOATY.has(kindOf(p)) || p.startsWith("force_feedback.");

// ---------- state ----------
const t0 = Date.now();
const fmtTime = (ms) => new Date(ms).toTimeString().slice(0, 8) + "." + String(ms % 1000).padStart(3, "0");
const state = {};        // top-level key → { flatPath → value }
const absentFor = {};    // top-level key → consecutive frames missing
const present = {};      // top-level key → bool (as logged)
const stats = {};        // normalized path → { kind, changes, values: Set, min, max, last }
let frames = 0;
let windowFrames = 0;
let windowStart = Date.now();

function log(line, { mark = false } = {}) {
  const text = `${fmtTime(Date.now())} ${mark ? "★ " : "  "}${line}`;
  console.log(text);
  fs.writeSync(logOut, text + "\n");
}

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object") flatten(item, `${p}[${i}]`, out);
        else out[`${p}[${i}]`] = item;
      });
    } else if (v && typeof v === "object") {
      flatten(v, p, out);
    } else {
      out[p] = v;
    }
  }
  return out;
}

function track(p, value) {
  const key = p.replace(/\[\d+\]/g, "[]");
  const s = (stats[key] ??= { kind: kindOf(p), changes: 0, values: new Set(), min: null, max: null, last: null });
  s.changes++;
  s.last = value;
  if (typeof value === "number" && FLOATY.has(s.kind)) {
    s.min = s.min === null ? value : Math.min(s.min, value);
    s.max = s.max === null ? value : Math.max(s.max, value);
  } else if (s.values.size < 50) {
    s.values.add(value);
  }
}

const show = (v) => JSON.stringify(v);

function onFrame(buf) {
  const now = Date.now();
  const head = Buffer.alloc(12);
  head.writeDoubleLE(now, 0);
  head.writeUInt32LE(buf.length, 8);
  fs.writeSync(framesOut, Buffer.concat([head, buf]));
  frames++;
  windowFrames++;

  const msg = Response.toObject(Response.decode(buf), { enums: String, longs: String, defaults: false });

  // events are one-shots, not state
  for (const ev of msg.events?.events ?? []) {
    log(`EVENT ${ev.type}`, { mark: false });
    track("events.events[].type", ev.type);
  }

  for (const top of Response.fieldsArray.map((f) => f.name)) {
    if (top === "events") continue;
    if (!(top in msg)) {
      absentFor[top] = (absentFor[top] ?? 0) + 1;
      if (present[top] && absentFor[top] === ABSENT_DEBOUNCE) {
        present[top] = false;
        log(`[${top}] nicht mehr im Stream`);
      }
      continue;
    }
    absentFor[top] = 0;
    if (!present[top]) {
      present[top] = true;
      log(`[${top}] im Stream`);
    }
    const next = flatten(msg[top], top);
    const prev = state[top] ?? {};
    for (const p of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      const a = p in prev ? prev[p] : defaultOf(p);
      const b = p in next ? next[p] : defaultOf(p);
      if (a === b) continue;
      track(p, b);
      if (!isNoisy(p)) log(`${p}: ${show(a)} → ${show(b)}`, { mark: POWER_RE.test(p) });
    }
    state[top] = next;
  }

  if (now - windowStart >= 10000) {
    const hz = (windowFrames * 1000) / (now - windowStart);
    process.stdout.write(`   … ${frames} Frames, ${hz.toFixed(1)} Hz\n`);
    windowFrames = 0;
    windowStart = now;
    writeSummary();
  }
}

function writeSummary() {
  const seen = {};
  for (const [p, s] of Object.entries(stats)) {
    seen[p] = {
      kind: s.kind,
      changes: s.changes,
      ...(FLOATY.has(s.kind) ? { min: s.min, max: s.max } : { values: [...s.values] }),
      last: s.last,
      powerRelated: POWER_RE.test(p) || undefined,
    };
  }
  const neverSet = Object.keys(LEAVES).filter((p) => !(p in stats));
  const summary = {
    build: version,
    startedAt: new Date(t0).toISOString(),
    durationS: Math.round((Date.now() - t0) / 1000),
    frames,
    powerRelated: Object.fromEntries(Object.entries(seen).filter(([, v]) => v.powerRelated)),
    seen,
    neverSetNonDefault: neverSet,
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
}

// ---------- gRPC ----------
const client = new grpc.Client(addr, grpc.credentials.createInsecure());
let status = "";
function setStatus(s) {
  if (s !== status) {
    status = s;
    log(`-- ${s}`);
  }
}

function connect() {
  const call = client.makeServerStreamRequest(
    STREAM_METHOD,
    () => Buffer.alloc(0),   // TelemetryStreamRequest is empty
    (b) => b,                // keep raw bytes; decoded in onFrame
    {},
  );
  let gotFrame = false;
  call.on("data", (buf) => {
    if (!gotFrame) {
      gotFrame = true;
      setStatus("verbunden, Frames kommen");
    }
    try {
      onFrame(buf);
    } catch (e) {
      log(`Decode-Fehler: ${e.message}`);
    }
  });
  call.on("metadata", () => setStatus("verbunden (wartet auf Frames, erst nach dem Spawn)"));
  const retry = (why) => {
    setStatus(`keine Verbindung zu ${addr} (${why}), neuer Versuch alle ${RETRY_MS / 1000} s`);
    setTimeout(connect, RETRY_MS);
  };
  let done = false;
  call.on("error", (e) => { if (!done) { done = true; retry(grpc.status[e.code] ?? e.message); } });
  call.on("end", () => { if (!done) { done = true; retry("Stream beendet"); } });
}

// ---------- markers & exit ----------
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (line.trim()) log(`=== MARKE: ${line.trim()} ===`, { mark: true });
});

function finish() {
  writeSummary();
  fs.closeSync(framesOut);
  fs.closeSync(logOut);
  console.log(`\n${frames} Frames gespeichert in ${outDir}`);
  process.exit(0);
}
process.on("SIGINT", finish);
rl.on("close", finish);

log(`Aufnahme ${version} → ${outDir}`);
log("Notiz tippen + Enter = Marke setzen, Strg+C = beenden");
connect();
