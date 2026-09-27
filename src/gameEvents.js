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
