// Game.log integration: turns Star Citizen's Game.log into semantic events
// the deck can react to (reset/restore toggle states).
//
// Design notes (see handover_star_citizen_status.md):
// - The log is a ONE-WAY event stream, not a state reader. Component states
//   (lights, power, shields) are NOT logged - we only get *triggers*.
// - Line formats change between patches without notice. Therefore all
//   patterns are plain data (regex strings) and can be overridden in
//   config.json under "gamelog.patterns" without touching code.
// - Interior zone names carry a unique spawn instance ID
//   (e.g. "AEGS_Gladius_1234567890123"). That ID is the key insight:
//   * standing up from the seat        -> no zone change  -> no event
//   * re-entering the SAME instance    -> same ID         -> no event
//   * boarding a different/reclaimed/  -> different ID    -> "vehicle-changed"
//     respawned ship
//
// This module is deliberately free of Electron dependencies so it can be
// unit-tested with plain Node (see test/gamelog.test.js).

const fs = require("fs");
const path = require("path");

// ---- Default patterns (current community-documented formats) ----
// All of these are overridable via config.gamelog.patterns.<name>.
const DEFAULT_PATTERNS = {
  // Interior zone entry; group 1 = interior/instance name, group 2 = entity
  // that entered. Example line:
  //   <...> [Notice] <CEntityComponentInstancedInterior::OnEntityEnterZone>
  //   [InstancedInterior] OnEntityEnterZone - InstancedInterior
  //   [ANVL_Carrack_1234567890123] [123...] -> Entity [PlayerName] [987...] ...
  zoneEnter:
    "OnEntityEnterZone.*?InstancedInterior \\[([^\\]]+)\\] \\[\\d+\\] -> Entity \\[([^\\]]+)\\]",

  // Vehicle taking soft/hard-death damage; group 1 = vehicle instance name.
  //   <Vehicle Destruction> CVehicle::OnAdvanceDestroyLevel: Vehicle
  //   'ORIG_325a_1234567890123' [id] ... advanced from destroy level 0 to 1 ...
  vehicleDestruction: "<Vehicle Destruction>.*?Vehicle '([^']+)'",

  // Actor death; group 1 = victim name.
  //   <Actor Death> CActor::Kill: 'Victim' [id] in zone '...' killed by ...
  actorDeath: "<Actor Death>.*?CActor::Kill: '([^']+)'",

  // Alternative death marker used in some builds; group 1 = player name.
  actorCorpse: "\\[ActorState\\] Corpse>.*?Player '([^']+)'",

  // Player handle detection (so we can filter zone/death events to *our*
  // player). Two known variants; first match wins.
  loginHandle: "<Legacy login response>.*?Handle\\[([^\\]]+)\\]",
  loginCharacter: "<AccountLoginCharacterStatus_Character>.*?name ([\\w.-]+)",

  // A zone name counts as a *vehicle* if it ends in a long numeric spawn ID
  // (ships/vehicles do, rooms/stations/planets don't) ...
  vehicleZone: "^[A-Za-z0-9]+_.+_\\d{9,}$",

  // ... unless it matches this ignore list (elevators, hangars, habs etc.
  // occasionally carry numeric suffixes too - extend per patch as needed).
  ignoreZones: "^(OOC_|Hangar|Room_|Lift_|Elevator|Transit|SolarSystem)",

  // Entities that are clearly not the player (NPCs, animals) - used as a
  // fallback filter while the player handle is not yet known.
  ignoreEntities: "^(PU_|NPC_|AIModule_|Kopion|Quasigrazer|vlk_|xeno)",
};

function compilePatterns(overrides = {}) {
  const merged = { ...DEFAULT_PATTERNS, ...overrides };
  const compiled = {};
  for (const [name, src] of Object.entries(merged)) {
    compiled[name] = new RegExp(src, "i");
  }
  return compiled;
}

// Strip the trailing spawn ID: "AEGS_Gladius_1234567890123" -> "AEGS_Gladius"
function vehicleClassOf(instanceName) {
  return instanceName.replace(/_\d{9,}$/, "");
}

/**
 * Pure line parser with vehicle tracking.
 * @param {object} opts
 * @param {(event: object) => void} opts.onEvent  semantic events:
 *   { type: "vehicle-changed", vehicleId, vehicleClass, previousVehicleId }
 *   { type: "vehicle-destroyed", vehicleId, vehicleClass, isCurrent }
 *   { type: "player-killed" }
 *   { type: "session-reset" }        (via resetSession(), e.g. log truncated)
 *   { type: "player-identified", name }
 * @param {object} [opts.patterns]   regex-string overrides (see defaults)
 * @param {string} [opts.playerName] pre-known handle (otherwise auto-detected)
 */
function createGameLogParser({ onEvent, patterns, playerName } = {}) {
  const re = compilePatterns(patterns);
  const emit = typeof onEvent === "function" ? onEvent : () => {};

  const state = {
    playerName: playerName || null,
    currentVehicleId: null,
  };

  function isVehicleZone(name) {
    return re.vehicleZone.test(name) && !re.ignoreZones.test(name);
  }

  // Is this entity (probably) our player? Exact match once the handle is
  // known; before that, a conservative heuristic: not an obvious NPC and
  // not itself a vehicle-like name (cargo crates etc. enter zones too).
  function isPlayerEntity(name) {
    if (state.playerName) return name === state.playerName;
    return !re.ignoreEntities.test(name) && !re.vehicleZone.test(name);
  }

  function feedLine(line) {
    let m;

    // Player handle (cheap checks first: both lines are rare)
    if (!state.playerName) {
      m = re.loginHandle.exec(line) || re.loginCharacter.exec(line);
      if (m) {
        state.playerName = m[1];
        emit({ type: "player-identified", name: m[1] });
        return;
      }
    }

    // Zone entry -> vehicle change detection
    m = re.zoneEnter.exec(line);
    if (m) {
      const [, zone, entity] = m;
      if (!isVehicleZone(zone) || !isPlayerEntity(entity)) return;
      if (zone === state.currentVehicleId) return; // same ship: keep state
      const previousVehicleId = state.currentVehicleId;
      state.currentVehicleId = zone;
      emit({
        type: "vehicle-changed",
        vehicleId: zone,
        vehicleClass: vehicleClassOf(zone),
        previousVehicleId,
      });
      return;
    }

    // Vehicle destruction (only meaningful if it is OUR current vehicle,
    // but we forward the flag and let the renderer decide)
    m = re.vehicleDestruction.exec(line);
    if (m) {
      const vehicleId = m[1];
      const isCurrent = vehicleId === state.currentVehicleId;
      if (isCurrent) state.currentVehicleId = null;
      emit({
        type: "vehicle-destroyed",
        vehicleId,
        vehicleClass: vehicleClassOf(vehicleId),
        isCurrent,
      });
      return;
    }

    // Player death
    m = re.actorDeath.exec(line) || re.actorCorpse.exec(line);
    if (m) {
      const victim = m[1];
      if (state.playerName && victim !== state.playerName) return;
      if (!state.playerName && re.ignoreEntities.test(victim)) return;
      state.currentVehicleId = null;
      emit({ type: "player-killed" });
    }
  }

  // Called when the log file was truncated/recreated (game restart):
  // all old instance IDs are invalid from here on.
  function resetSession() {
    state.currentVehicleId = null;
    emit({ type: "session-reset" });
  }

  return {
    feedLine,
    resetSession,
    getState: () => ({ ...state }),
  };
}

// ---- Tailer: polls the log file and feeds complete lines to a callback ----
// fs.watch is unreliable on a file the game holds open and appends to, so
// community tools poll - we do the same. Handles: file not there yet,
// truncation (new session), partial lines at the read boundary.
function createGameLogTailer({
  filePath,
  onLine,
  onTruncate,
  onStatus,
  pollMs = 750,
  fromStart = true,
} = {}) {
  let pos = null; // null = not initialized yet
  let partial = "";
  let timer = null;
  let stopped = false;
  let lastStatus = null;

  const status = (s) => {
    if (s !== lastStatus) {
      lastStatus = s;
      if (onStatus) onStatus(s);
    }
  };

  function readNewBytes(size) {
    return new Promise((resolve) => {
      const stream = fs.createReadStream(filePath, {
        start: pos,
        end: size - 1,
        encoding: "utf-8",
      });
      let data = "";
      stream.on("data", (c) => (data += c));
      stream.on("end", () => resolve(data));
      stream.on("error", () => resolve(null));
    });
  }

  async function poll() {
    if (stopped) return;
    let st;
    try {
      st = fs.statSync(filePath);
      status("watching");
    } catch {
      // Log not there (game not running / wrong path): keep waiting.
      status("missing");
      pos = null;
      partial = "";
      schedule();
      return;
    }

    if (pos === null) {
      // First sighting of the file. fromStart: replay the whole current
      // session so the parser knows which ship we are already in.
      pos = fromStart ? 0 : st.size;
    } else if (st.size < pos) {
      // File shrank -> game restarted and recreated the log.
      pos = 0;
      partial = "";
      if (onTruncate) onTruncate();
    }

    if (st.size > pos) {
      const chunk = await readNewBytes(st.size);
      if (chunk !== null) {
        pos = st.size;
        partial += chunk;
        const lines = partial.split(/\r?\n/);
        partial = lines.pop(); // last element may be an incomplete line
        for (const line of lines) {
          if (line) onLine(line);
        }
      }
    }
    schedule();
  }

  function schedule() {
    if (!stopped) timer = setTimeout(poll, pollMs);
  }

  poll();

  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

// Default install path; overridable via config.gamelog.path.
const DEFAULT_LOG_PATH = path.join(
  "C:",
  "Program Files",
  "Roberts Space Industries",
  "StarCitizen",
  "LIVE",
  "Game.log"
);

module.exports = {
  createGameLogParser,
  createGameLogTailer,
  compilePatterns,
  vehicleClassOf,
  DEFAULT_PATTERNS,
  DEFAULT_LOG_PATH,
};
