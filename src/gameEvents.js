// Pure logic: how game events (from Game.log via the main process) affect
// the deck's toggle states. Kept free of Zustand/React so it can be
// unit-tested with plain Node (test/gameEvents.test.mjs).
//
// Model: toggle state is per SHIP INSTANCE. Standing up from the seat or
// leaving the ship on foot produces no event, so state is naturally kept.
// Switching to a different instance resets to the config's "initial" values
// (or restores what we remembered for that instance).

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
      const restored = memory[event.vehicleId];
      return {
        currentVehicleId: event.vehicleId,
        currentVehicleClass: event.vehicleClass,
        vehicleMemory: memory,
        toggleStates: restored
          ? { ...initialToggleStates(pages), ...restored }
          : initialToggleStates(pages),
      };
    }

    case "vehicle-destroyed": {
      // A destroyed ship's remembered state is worthless either way.
      const memory = { ...vehicleMemory };
      delete memory[event.vehicleId];
      if (!event.isCurrent && event.vehicleId !== currentVehicleId) {
        return { vehicleMemory: memory }; // someone else's ship
      }
      return {
        currentVehicleId: null,
        currentVehicleClass: null,
        vehicleMemory: memory,
        toggleStates: initialToggleStates(pages),
      };
    }

    case "player-killed":
      // We respawn elsewhere; the next boarding will fire vehicle-changed.
      // Ship memory is kept - the ship may still exist with its state.
      return {
        currentVehicleId: null,
        currentVehicleClass: null,
        toggleStates: initialToggleStates(pages),
      };

    case "session-reset":
      // Game restarted: every old instance ID is invalid.
      return {
        currentVehicleId: null,
        currentVehicleClass: null,
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
      return `SHIP: ${event.vehicleClass}`;
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
