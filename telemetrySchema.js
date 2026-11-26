// Telemetry schema from the game binary (Phase 0, reusable in Phase 1).
//
// StarCitizen.exe embeds the protobuf descriptors of its local gRPC
// telemetry API (sc/game/telemetry/v1/types.proto + api.proto). We read
// them straight from the exe instead of shipping a .proto, so every patch
// brings its own, exact schema. Approach ported from Purzifal/sc_make_proto
// (find "sc/game/telemetry/", walk the FileDescriptorProto wire format to
// its end). Read-only, Electron-free, unit-testable on plain buffers.

const fs = require("fs");
const path = require("path");
const protobuf = require("protobufjs");
const descriptor = require("protobufjs/ext/descriptor");

const PREFIX = Buffer.from("sc/game/telemetry/", "ascii");

// FileDescriptorProto field number → allowed wire types (0 varint,
// 2 length-delimited). Anything else marks the end of the descriptor.
const WIRE_TYPES = {
  1: [2], 2: [2], 3: [2], 4: [2], 5: [2], 6: [2], 7: [2], 8: [2],
  9: [2], 10: [0, 2], 11: [0, 2], 12: [2], 14: [0],
};

function readVarint(buf, i) {
  let value = 0;
  let mul = 1;
  for (;;) {
    if (i >= buf.length) throw new RangeError("varint past end");
    const b = buf[i++];
    value += (b & 0x7f) * mul;
    mul *= 128;
    if (b < 0x80) return [value, i];
    if (mul > 2 ** 63) throw new RangeError("varint too long");
  }
}

function descriptorEnd(buf, i) {
  try {
    while (i < buf.length) {
      const [tag, j0] = readVarint(buf, i);
      if (!(WIRE_TYPES[Math.floor(tag / 8)] || []).includes(tag & 7)) break;
      let [value, j] = readVarint(buf, j0);
      if ((tag & 7) === 2) j += value;
      if (j > buf.length) break;
      i = j;
    }
  } catch {
    // ran off the buffer: descriptor ends here
  }
  return i;
}

/** File version a.b.c.d from the VS_FIXEDFILEINFO resource, or null. */
function fileVersionOf(buf) {
  const key = buf.lastIndexOf(Buffer.from("VS_VERSION_INFO", "utf16le"));
  if (key === -1) return null;
  const sig = buf.indexOf(Buffer.from([0xbd, 0x04, 0xef, 0xfe]), key);
  if (sig === -1) return null;
  const ms = buf.readUInt32LE(sig + 8);
  const ls = buf.readUInt32LE(sig + 12);
  return `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`;
}

/**
 * Find the embedded telemetry descriptors in a buffer.
 * Returns { name → Buffer(serialized FileDescriptorProto) } in file order.
 */
function findDescriptors(buf) {
  const FileDescriptorProto = descriptor.FileDescriptorProto;
  const files = {};
  let hit = buf.indexOf(PREFIX);
  while (hit !== -1) {
    const start = hit - 2;
    if (start >= 0 && buf[start] === 0x0a) {
      const name = buf.toString("latin1", hit, hit + buf[hit - 1]);
      if (name.endsWith(".proto") && !(name in files)) {
        const bytes = buf.subarray(start, descriptorEnd(buf, start));
        try {
          const fdp = FileDescriptorProto.decode(bytes);
          if (fdp.messageType.length || fdp.enumType.length || fdp.service.length) {
            files[name] = Buffer.from(bytes);
          }
        } catch {
          // just a matching string, not a descriptor
        }
      }
    }
    hit = buf.indexOf(PREFIX, hit + 1);
  }
  return files;
}

/** Wrap FileDescriptorProtos into one serialized FileDescriptorSet. */
function toDescriptorSet(files) {
  const parts = [];
  for (const bytes of Object.values(files)) {
    const len = [];
    let n = bytes.length;
    while (n >= 0x80) { len.push((n & 0x7f) | 0x80); n >>>= 7; }
    len.push(n);
    parts.push(Buffer.from([0x0a, ...len]), bytes); // field 1 (file), LEN
  }
  return Buffer.concat(parts);
}

/**
 * Read the exe and return { version, files, descriptorSet, root }.
 * root is a protobufjs Root; throws if no telemetry schema is found.
 */
function loadSchemaFromExe(exePath) {
  const buf = fs.readFileSync(exePath);
  const version = fileVersionOf(buf);
  const files = findDescriptors(buf);
  if (!Object.keys(files).length) {
    throw new Error(`no telemetry schema in ${exePath} (version ${version})`);
  }
  const descriptorSet = toDescriptorSet(files);
  const root = protobuf.Root.fromDescriptor(
    descriptor.FileDescriptorSet.decode(descriptorSet),
  ).resolveAll();
  return { version, files, descriptorSet, root };
}

/** StarCitizen.exe next to a Game.log (…\LIVE\Game.log → …\LIVE\Bin64). */
function exePathFromGameLog(gameLogPath) {
  return path.join(path.dirname(gameLogPath), "Bin64", "StarCitizen.exe");
}

/** Human-readable listing of all messages/enums/services (for diffing). */
function describeSchema(root) {
  const lines = [];
  const walk = (ns, depth) => {
    for (const obj of ns.nestedArray) {
      const pad = "  ".repeat(depth);
      if (obj instanceof protobuf.Service) {
        lines.push(`${pad}service ${obj.name}`);
        for (const m of obj.methodsArray) {
          lines.push(`${pad}  rpc ${m.name}(${m.requestType}) → ${m.responseStream ? "stream " : ""}${m.responseType}`);
        }
      } else if (obj instanceof protobuf.Type) {
        lines.push(`${pad}message ${obj.name}`);
        for (const f of obj.fieldsArray) {
          const label = f.repeated ? "repeated " : f.options?.proto3_optional ? "optional " : "";
          lines.push(`${pad}  ${f.id}: ${label}${f.type} ${f.name}`);
        }
        walk(obj, depth + 1);
      } else if (obj instanceof protobuf.Enum) {
        lines.push(`${pad}enum ${obj.name}`);
        for (const [k, v] of Object.entries(obj.values)) lines.push(`${pad}  ${v}: ${k}`);
      } else if (obj.nestedArray) {
        lines.push(`${pad}package ${obj.name}`);
        walk(obj, depth + 1);
      }
    }
  };
  walk(root, 0);
  return lines.join("\n");
}

module.exports = {
  readVarint,
  descriptorEnd,
  fileVersionOf,
  findDescriptors,
  toDescriptorSet,
  loadSchemaFromExe,
  exePathFromGameLog,
  describeSchema,
};
