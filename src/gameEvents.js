// Pure logic: how game events (from Game.log via the main process) affect
// the deck's toggle states. Kept free of Zustand/React so it can be
// unit-tested with plain Node (test/gameEvents.test.mjs).
//
// Model: toggle state is per SHIP, keyed by the parser's vehicleId
// ("<class>:<owner>"). Standing up from the seat produces no event.
// Boarding restores what we remembered for that ship, unless the parser
// flags it as a freshly retrieved instance (fresh) - then "initial".
// Leaving (channel left) remembers the state and falls back to "initial"
// until the next boarding.

// Initial toggle states as declared in the config
export function initialToggleStates(pages) {
  const states = {};
  for (const page of pages || []) {
    for (const panel of page.panels || []) {
      for (const w of panel.widgets || []) {
        if (w.type === "toggle") states[w.id] = Boolean(w.initial);
      }
    }
  }
  return states;
}

// Store fields describing the current ship (drive status bar + ship theme)
const NO_VEHICLE = {
  currentVehicleId: null,
  currentVehicleClass: null,
  currentVehicleName: null,
};

function currentVehicleFrom(event) {
  return {
    currentVehicleId: event.vehicleId,
    currentVehicleClass: event.vehicleClass,
    currentVehicleName: event.shipName || event.vehicleClass,
  };
}

/**
 * @param {object} prev  { toggleStates, currentVehicleId, vehicleMemory }
 * @param {object} event semantic event from the main process
 * @param {Array}  pages current config pages (source of "initial" values)
 * @returns {object|null} partial state update, or null if nothing changes
 */
export function applyGameEvent(prev, event, pages) {
  const { toggleStates, currentVehicleId, vehicleMemory } = prev;

  switch (event.type) {
    case "vehicle-changed": {
      // Remember the (assumed) state of the ship we came from, then either
      // restore what we know about the new ship or start from "initial".
      const memory = { ...vehicleMemory };
      if (currentVehicleId) memory[currentVehicleId] = { ...toggleStates };
      if (event.fresh) delete memory[event.vehicleId]; // new instance: stale
      const restored = memory[event.vehicleId];
      return {
        ...currentVehicleFrom(event),
        vehicleMemory: memory,
        toggleStates: restored
          ? { ...initialToggleStates(pages), ...restored }
          : initialToggleStates(pages),
      };
    }

    case "vehicle-left": {
      // Left the ship on foot: keep its state for the next boarding.
      if (event.vehicleId !== currentVehicleId) return null;
      return {
        ...NO_VEHICLE,
        vehicleMemory: { ...vehicleMemory, [currentVehicleId]: { ...toggleStates } },
        toggleStates: initialToggleStates(pages),
      };
    }

    case "vehicle-destroyed": {
      // A destroyed ship's remembered state is worthless either way.
      const memory = { ...vehicleMemory };
      if (event.vehicleId) delete memory[event.vehicleId];
      if (!event.isCurrent) {
        return { vehicleMemory: memory }; // someone else's / an old instance
      }
      return {
        ...NO_VEHICLE,
        vehicleMemory: memory,
        toggleStates: initialToggleStates(pages),
      };
    }

    case "player-killed":
      // We respawn elsewhere; the next boarding will fire vehicle-changed.
      // Ship memory is kept - the ship may still exist with its state.
      return {
        ...NO_VEHICLE,
        toggleStates: initialToggleStates(pages),
      };

    case "session-reset":
      // Game restarted: every old instance ID is invalid.
      return {
        ...NO_VEHICLE,
        vehicleMemory: {},
        toggleStates: initialToggleStates(pages),
      };

    default:
      return null;
  }
}

// ---- Log position + persistence ----
// Events carry { session, line } (see createGameLogPipeline in gamelog.js).
// The cursor is the position of the last event the deck applied. Every
// watcher start replays the whole log - after a config reload into the live
// UI, after an app restart into the restored snapshot - so events at or
// before the cursor of the same session must be skipped, otherwise e.g. the
// first boarding (fresh) would wipe the current ship's state again.
export function isAlreadyApplied(cursor, event) {
  return Boolean(
    cursor &&
      event.session &&
      event.session === cursor.session &&
      event.line <= cursor.line
  );
}

// Cursor after applying an event; events without a session (session-reset
// on truncation) start over.
export function cursorAfter(event) {
  return event.session ? { session: event.session, line: event.line } : null;
}

export const SNAPSHOT_VERSION = 1;

// What survives an app restart. Only meaningful together with a cursor:
// the snapshot reflects the log up to exactly that position.
export function snapshotOf(state) {
  return {
    version: SNAPSHOT_VERSION,
    cursor: state.gamelogCursor,
    currentVehicleId: state.currentVehicleId,
    currentVehicleClass: state.currentVehicleClass,
    currentVehicleName: state.currentVehicleName,
    toggleStates: state.toggleStates,
    vehicleMemory: state.vehicleMemory,
  };
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const strOrNull = (v) => (typeof v === "string" ? v : null);

function booleanMap(v) {
  const out = {};
  if (isObject(v)) {
    for (const [k, b] of Object.entries(v)) if (typeof b === "boolean") out[k] = b;
  }
  return out;
}

/**
 * Snapshot -> store update, if it belongs to the session of `event` (the
 * first event after app start). A snapshot of another session is stale: the
 * game was restarted meanwhile, every ship state is void (as session-reset).
 * Toggles are merged over the config's initial values, so widgets added or
 * removed since then are handled like on a config reload.
 * @returns {object|null} store update, or null if not restorable
 */
export function restoreSnapshot(snapshot, event, pages) {
  if (!isObject(snapshot) || snapshot.version !== SNAPSHOT_VERSION) return null;
  const { cursor } = snapshot;
  if (!isObject(cursor) || typeof cursor.session !== "string") return null;
  if (!Number.isInteger(cursor.line) || cursor.session !== event.session) return null;

  const initial = initialToggleStates(pages);
  const saved = booleanMap(snapshot.toggleStates);
  const toggleStates = { ...initial };
  for (const id of Object.keys(initial)) if (id in saved) toggleStates[id] = saved[id];

  const vehicleMemory = {};
  if (isObject(snapshot.vehicleMemory)) {
    for (const [id, states] of Object.entries(snapshot.vehicleMemory)) {
      vehicleMemory[id] = booleanMap(states);
    }
  }

  return {
    gamelogCursor: { session: cursor.session, line: cursor.line },
    currentVehicleId: strOrNull(snapshot.currentVehicleId),
    currentVehicleClass: strOrNull(snapshot.currentVehicleClass),
    currentVehicleName: strOrNull(snapshot.currentVehicleName),
    toggleStates,
    vehicleMemory,
  };
}

// Short human-readable summary for the status bar
export function describeGameEvent(event) {
  switch (event.type) {
    case "vehicle-changed":
      return `SHIP: ${event.shipName || event.vehicleClass}`;
    case "vehicle-left":
      return "LEFT SHIP";
    case "vehicle-destroyed":
      return event.isCurrent ? "SHIP DESTROYED - RESET" : null;
    case "player-killed":
      return "PILOT DOWN - RESET";
    case "session-reset":
      return "GAME RESTARTED - RESET";
    default:
      return null;
  }
}
