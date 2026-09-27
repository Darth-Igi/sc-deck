// Game.log integration: turns Star Citizen's Game.log into semantic events
// the deck can react to (reset/restore toggle states).
//
// Design notes (see handover_star_citizen_status.md):
// - The log is a ONE-WAY event stream, not a state reader. Component states
//   (lights, power, shields) are NOT logged - we only get *triggers*.
// - Line formats change between patches without notice. Therefore all
//   patterns are plain data (regex strings) and can be overridden in
//   config.json under "gamelog.patterns" without touching code.
// - Primary ship signal (since the 4.x patches OnEntityEnterZone is no longer
//   logged): the ship's comms channel HUD notification.
//     Added notification "You have joined channel 'MISC Starlancer TAC : Owner'.
//     Added notification "You have left the channel 'MISC Starlancer TAC : Owner'.
//   The channel carries the DISPLAY name and the owner, but no instance ID.
//   Ships are therefore keyed by "<class>:<owner>"; freshly retrieved
//   instances are recognised via SetVehicleSpawningInformations (retrieval
//   at the ASOP terminal) - see boardShip() below.
// - ClearDriver ("releasing control token for 'MISC_Starlancer_TAC_848…'")
//   only means standing up from the pilot seat - it is NOT an exit. We use
//   it to learn/correct the instance ID of the current ship.
// - Legacy fallback: interior zone names with spawn instance ID
//   (e.g. "AEGS_Gladius_1234567890123"), kept in case the line comes back.
//
// This module is deliberately free of Electron dependencies so it can be
// unit-tested with plain Node (see test/gamelog.test.js).

const fs = require("fs");
const path = require("path");

// ---- Default patterns (current community-documented formats) ----
// All of these are overridable via config.gamelog.patterns.<name>.
const DEFAULT_PATTERNS = {
  // Ship comms channel joined = boarded a ship; group 1 = channel name
  // ("<ship display name> : <owner>" or "@vehicle_Name<CLASS> : <owner>").
  // Anchored on "Added notification" so the continuation line the game
  // writes right after it does not count twice.
  shipChannelJoined: "Added notification \"You have joined channel '([^']+)'",

  // Ship comms channel left = left the ship (note: "left THE channel").
  // Not every exit is logged - death/destruction/restart also end a ship.
  shipChannelLeft: "Added notification \"You have left the channel '([^']+)'",

  // Ship retrieved at the ASOP terminal; group 1 = new vehicle entity ID.
  //   <CEntityComponentShipListProvider::SetVehicleSpawningInformations>
  //   SetVehicleSpawningInformations - VehicleEntityId: [848673759629], ...
  vehicleSpawned: "SetVehicleSpawningInformations - VehicleEntityId: \\[(\\d+)\\]",

  // Ship stowed again (e.g. landing area unregistered); group 1 = entity ID.
  vehicleStowed: "Attempting to stow current vehicle \\[(\\d+)\\]",

  // Pilot seat released; group 1 = vehicle instance name incl. ID.
  //   <Vehicle Control Flow> CVehicleMovementBase::ClearDriver: Local client
  //   node [204741570099] releasing control token for
  //   'MISC_Starlancer_TAC_848673759629' [848673759629]
  clearDriver: "ClearDriver: .*?releasing control token for '([^']+)'",

  // Legacy (not logged in current patches): interior zone entry; group 1 = interior/instance name, group 2 = entity
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

// Trailing spawn ID of an instance name, or null
function spawnIdOf(instanceName) {
  const m = /_(\d{9,})$/.exec(instanceName);
  return m ? m[1] : null;
}

// Manufacturer display names (as used in ship channel names) -> the code
// prefix of the internal class names. MISC and RSI are identical anyway;
// the others make the manufacturer fallback of the ship themes work.
// Keys are lower case; multi-word names are matched before single words.
const MANUFACTURER_CODES = {
  "aegis": "AEGS",
  "anvil": "ANVL",
  "aopoa": "XNAA",
  "argo": "ARGO",
  "banu": "BANU",
  "c.o.": "CNOU",
  "consolidated outland": "CNOU",
  "crusader": "CRUS",
  "drake": "DRAK",
  "esperia": "ESPR",
  "gatac": "GAMA",
  "greycat": "GRIN",
  "kruger": "KRIG",
  "mirai": "MRAI",
  "misc": "MISC",
  "origin": "ORIG",
  "rsi": "RSI",
  "tumbril": "TMBL",
  "vanduul": "VNCL",
};

/**
 * Channel name -> ship info. Handles both known forms:
 *   "MISC Starlancer TAC : Admiral-Chaos"   (display name, current patch)
 *   "@vehicle_NameRSI_Hermes : TestOwner"   (loc key, seen by other tools)
 * @returns {{ vehicleClass, manufacturer, shipName, owner } | null}
 *   vehicleClass: underscore form with manufacturer CODE, e.g.
 *   "MISC_Starlancer_TAC" / "ANVL_Hornet_Mk_II". Derived from the display
 *   name, so the model part may differ from the internal class name - the
 *   ship themes are keyed by this form, not by the internal one.
 */
function parseShipChannel(channel) {
  const sep = channel.indexOf(" : ");
  const rawName = (sep >= 0 ? channel.slice(0, sep) : channel)
    .replace(/^@vehicle_Name/, "")
    .trim();
  const owner = sep >= 0 ? channel.slice(sep + 3).trim() || null : null;
  if (!rawName) return null;

  const words = rawName.split(/[\s_]+/);
  let code = null;
  let rest = words;
  for (const n of [2, 1]) {
    const key = words.slice(0, n).join(" ").toLowerCase();
    if (words.length > n && MANUFACTURER_CODES[key]) {
      code = MANUFACTURER_CODES[key];
      rest = words.slice(n);
      break;
    }
  }
  // Unknown manufacturer: keep the first word as-is (it usually already is
  // the code, e.g. in the @vehicle_Name form).
  const manufacturer = code || words[0].toUpperCase();
  const model = code ? rest : words.slice(1);
  return {
    vehicleClass: [manufacturer, ...model].join("_"),
    manufacturer,
    shipName: rawName.replace(/_/g, " "),
    owner,
  };
}

/**
 * Pure line parser with vehicle tracking.
 * @param {object} opts
 * @param {(event: object) => void} opts.onEvent  semantic events:
 *   { type: "vehicle-changed", vehicleId, vehicleClass, manufacturer,
 *     shipName, owner, instanceId, fresh, previousVehicleId }
 *       vehicleId = ship key "<class>:<owner>" (legacy zone path: the
 *       instance name). fresh = a newly retrieved instance of that ship ->
 *       remembered toggle states are stale.
 *   { type: "vehicle-left", vehicleId, vehicleClass }
 *   { type: "vehicle-destroyed", vehicleId, vehicleClass, isCurrent }
 *       vehicleId = ship key if the destroyed instance is known, else null
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
    current: null,         // { key, vehicleClass, manufacturer, shipName, owner, instanceId }
    pendingSpawnId: null,  // retrieved at the terminal, not boarded yet
    consumedSpawnId: null, // spawn ID assigned at the last boarding (may be corrected)
  };
  // Instance bookkeeping: ship key <-> current spawn ID of that ship
  const keyInstance = new Map();
  const instanceKey = new Map();

  function bindInstance(key, instanceId) {
    const old = keyInstance.get(key);
    if (old) instanceKey.delete(old);
    keyInstance.set(key, instanceId);
    instanceKey.set(instanceId, key);
  }

  function forgetInstance(instanceId) {
    const key = instanceKey.get(instanceId);
    instanceKey.delete(instanceId);
    if (key && keyInstance.get(key) === instanceId) keyInstance.delete(key);
  }

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

  // Only ship channels count: they carry an owner (or the @vehicle_Name
  // loc key) - guards against other chat channels.
  function shipFromChannel(channel) {
    if (!channel.includes(" : ") && !channel.startsWith("@vehicle_Name")) return null;
    const ship = parseShipChannel(channel);
    if (!ship) return null;
    return { ...ship, key: `${ship.vehicleClass}:${ship.owner || "?"}` };
  }

  // Boarding. Fresh-instance detection for the channel path (no ID in the
  // line): a pending terminal retrieval + boarding one of OUR ships = that
  // retrieved instance. If it differs from the instance we knew for this
  // ship, it is a new one (claim/respawn) -> fresh. Without a pending
  // retrieval it is the ship we already know -> restore.
  function boardShip(ship, knownInstanceId = null) {
    if (state.current && state.current.key === ship.key) return; // same ship
    let instanceId = knownInstanceId;
    let fresh = false;
    state.consumedSpawnId = null;
    if (!instanceId) {
      const own = !ship.owner || !state.playerName || ship.owner === state.playerName;
      if (own && state.pendingSpawnId) {
        instanceId = state.pendingSpawnId;
        fresh = keyInstance.get(ship.key) !== instanceId;
        state.consumedSpawnId = instanceId;
        state.pendingSpawnId = null;
      } else {
        instanceId = keyInstance.get(ship.key) || null;
      }
    }
    if (instanceId) bindInstance(ship.key, instanceId);

    const previousVehicleId = state.current ? state.current.key : null;
    state.current = { ...ship, instanceId };
    emit({
      type: "vehicle-changed",
      vehicleId: ship.key,
      vehicleClass: ship.vehicleClass,
      manufacturer: ship.manufacturer,
      shipName: ship.shipName,
      owner: ship.owner,
      instanceId,
      fresh,
      previousVehicleId,
    });
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

    // Ship channel joined -> boarded a ship
    m = re.shipChannelJoined.exec(line);
    if (m) {
      const ship = shipFromChannel(m[1]);
      if (ship) boardShip(ship);
      return;
    }

    // Ship channel left -> left the ship (only if it is the current one)
    m = re.shipChannelLeft.exec(line);
    if (m) {
      const ship = shipFromChannel(m[1]);
      if (ship && state.current && state.current.key === ship.key) {
        state.current = null;
        state.consumedSpawnId = null;
        emit({ type: "vehicle-left", vehicleId: ship.key, vehicleClass: ship.vehicleClass });
      }
      return;
    }

    // Terminal retrieval: remember the new instance until we board
    m = re.vehicleSpawned.exec(line);
    if (m) {
      state.pendingSpawnId = m[1];
      return;
    }

    // Stowed again: a pending retrieval is void, a known instance is gone
    m = re.vehicleStowed.exec(line);
    if (m) {
      if (state.pendingSpawnId === m[1]) state.pendingSpawnId = null;
      forgetInstance(m[1]);
      return;
    }

    // Pilot seat released (standing up, NOT an exit): the local client can
    // only sit in the ship it is in, so this reveals the real instance ID.
    // If boarding consumed a different pending retrieval, that retrieved
    // ship is still out there unboarded -> make it pending again.
    m = re.clearDriver.exec(line);
    if (m) {
      const instanceId = spawnIdOf(m[1]);
      if (state.current && instanceId && state.current.instanceId !== instanceId) {
        if (state.consumedSpawnId && state.consumedSpawnId !== instanceId) {
          forgetInstance(state.consumedSpawnId);
          state.pendingSpawnId = state.consumedSpawnId;
        }
        state.current.instanceId = instanceId;
        bindInstance(state.current.key, instanceId);
      }
      state.consumedSpawnId = null;
      return;
    }

    // Legacy: zone entry with instance name (key = instance name)
    m = re.zoneEnter.exec(line);
    if (m) {
      const [, zone, entity] = m;
      if (!isVehicleZone(zone) || !isPlayerEntity(entity)) return;
      const vehicleClass = vehicleClassOf(zone);
      boardShip(
        {
          key: zone,
          vehicleClass,
          manufacturer: vehicleClass.split("_")[0].toUpperCase(),
          shipName: vehicleClass.replace(/_/g, " "),
          owner: null,
        },
        spawnIdOf(zone)
      );
      return;
    }

    // Vehicle destruction (only meaningful if it is OUR current vehicle,
    // but we forward the flag and let the renderer decide). The key is only
    // reported if the destroyed instance is the one we know for that ship -
    // an older instance of the same ship must not wipe its memory.
    m = re.vehicleDestruction.exec(line);
    if (m) {
      const instanceId = spawnIdOf(m[1]);
      const key = instanceId ? instanceKey.get(instanceId) || null : null;
      const isCurrent = Boolean(
        state.current && instanceId && state.current.instanceId === instanceId
      );
      if (isCurrent) state.current = null;
      if (instanceId) forgetInstance(instanceId);
      emit({
        type: "vehicle-destroyed",
        vehicleId: key,
        vehicleClass: vehicleClassOf(m[1]),
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
      state.current = null;
      emit({ type: "player-killed" });
    }
  }

  // Called when the log file was truncated/recreated (game restart):
  // all old instance IDs are invalid from here on.
  function resetSession() {
    state.current = null;
    state.pendingSpawnId = null;
    state.consumedSpawnId = null;
    keyInstance.clear();
    instanceKey.clear();
    emit({ type: "session-reset" });
  }

  return {
    feedLine,
    resetSession,
    getState: () => ({
      playerName: state.playerName,
      currentVehicleId: state.current ? state.current.key : null,
      currentVehicle: state.current ? { ...state.current } : null,
      pendingSpawnId: state.pendingSpawnId,
    }),
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
  parseShipChannel,
  MANUFACTURER_CODES,
  DEFAULT_PATTERNS,
  DEFAULT_LOG_PATH,
};
