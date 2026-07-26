import { create } from "zustand";
import {
  applyGameEvent,
  describeGameEvent,
  initialToggleStates,
} from "./gameEvents";

export const useDeckStore = create((set, get) => ({
  // ---- Configuration (from config.json via the main process) ----
  pages: [],
  loaded: false,
  configError: null,   // { path, errors: string[] } when the config is broken
  configWarnings: [],

  // ---- Navigation ----
  currentPageIndex: 0,

  // ---- Widget state ----
  pressedId: null,     // which button is visually pressed right now
  errorId: null,       // last widget whose hotkey dispatch failed
  lastError: null,     // { message, time } for the status bar
  toggleStates: {},    // { [widgetId]: boolean } - local "assumed" state

  // ---- Game.log tracking (see src/gameEvents.js) ----
  currentVehicleId: null,    // ship instance we are (assumed to be) in
  currentVehicleClass: null, // e.g. "AEGS_Gladius" - shown in the status bar
  vehicleMemory: {},         // { [vehicleId]: toggleStates } per-ship memory
  gameStatus: null,          // { message, time } last game event, status bar
  gamelogState: null,        // "watching" | "missing" - tailer status

  // Semantic events from the main process (Game.log watcher). Toggle
  // states survive standing up / re-entering the SAME ship (no event is
  // emitted for that); a different ship instance, destruction, death or a
  // game restart resets them to the config's "initial" values.
  handleGameEvent: (event) => {
    if (event.type === "gamelog-status") {
      set({ gamelogState: event.state });
      return;
    }
    const { toggleStates, currentVehicleId, vehicleMemory, pages } = get();
    const update = applyGameEvent(
      { toggleStates, currentVehicleId, vehicleMemory },
      event,
      pages
    );
    if (!update) return;
    const message = describeGameEvent(event);
    if (message) {
      update.gameStatus = { message, time: new Date().toLocaleTimeString() };
    }
    set(update);
  },

  loadConfig: async () => {
    let result;
    try {
      result = await window.scDeck.getConfig();
    } catch (err) {
      set({
        loaded: true,
        configError: { path: "?", errors: [String(err)] },
      });
      return;
    }

    if (!result.ok) {
      set({
        loaded: true,
        configError: { path: result.path, errors: result.errors || [] },
        configWarnings: result.warnings || [],
      });
      return;
    }

    // Toggle states: known widgets keep their current state (important
    // for config hot reload), new ones start with "initial".
    const prev = get().toggleStates;
    const toggleStates = {};
    for (const page of result.config.pages) {
      for (const panel of page.panels) {
        for (const w of panel.widgets) {
          if (w.type === "toggle") {
            toggleStates[w.id] =
              w.id in prev ? prev[w.id] : Boolean(w.initial);
          }
        }
      }
    }

    // Keep the current page, but clamp to the valid range
    // (in case the new config has fewer pages)
    const pageCount = result.config.pages.length;
    const currentPageIndex = Math.min(get().currentPageIndex, pageCount - 1);

    set({
      pages: result.config.pages,
      toggleStates,
      loaded: true,
      configError: null,
      configWarnings: result.warnings || [],
      currentPageIndex,
    });
  },

  nextPage: () => {
    const { pages, currentPageIndex } = get();
    if (pages.length === 0) return;
    set({ currentPageIndex: (currentPageIndex + 1) % pages.length });
  },

  prevPage: () => {
    const { pages, currentPageIndex } = get();
    if (pages.length === 0) return;
    set({
      currentPageIndex: (currentPageIndex - 1 + pages.length) % pages.length,
    });
  },

  goToPage: (index) => set({ currentPageIndex: index }),

  quit: () => window.scDeck.quitApp(),

  // ---- Shared trigger logic: send keys + pressed/error feedback ----
  _sendKeys: async (widget) => {
    set({ pressedId: widget.id, errorId: null });

    const result = await window.scDeck.sendHotkey(widget.keys);

    if (!result.ok) {
      console.error("Hotkey error:", result.error);
      set({
        errorId: widget.id,
        lastError: {
          message: `${widget.label}: ${result.error}`,
          time: new Date().toLocaleTimeString(),
        },
      });
      setTimeout(() => {
        if (get().errorId === widget.id) set({ errorId: null });
      }, 500);
    }

    setTimeout(() => {
      if (get().pressedId === widget.id) set({ pressedId: null });
    }, 120);

    return result.ok;
  },

  // Momentary button: just send the keys
  triggerButton: async (widget) => {
    await get()._sendKeys(widget);
  },

  // Toggle: state only flips on successful dispatch, so the UI and the
  // (assumed) game state don't drift apart when nut.js fails.
  triggerToggle: async (widget) => {
    const ok = await get()._sendKeys(widget);
    if (ok) {
      set((state) => ({
        toggleStates: {
          ...state.toggleStates,
          [widget.id]: !state.toggleStates[widget.id],
        },
      }));
    }
  },

  // Manual reset (⟲ button in the nav bar): back to the config's
  // "initial" values WITHOUT sending any keys. Covers the known gap where
  // the game changed state without us noticing (e.g. ship power-off in the
  // same ship, keys pressed on the physical keyboard). Vehicle tracking is
  // untouched - on the next ship change the reset state is what gets
  // remembered for this ship, which is exactly right.
  resetToggles: () =>
    set((state) => ({
      toggleStates: initialToggleStates(state.pages),
      gameStatus: {
        message: "MANUAL RESET",
        time: new Date().toLocaleTimeString(),
      },
    })),

  // Manual correction (e.g. when the game changed state without us
  // noticing): a long press could use this later
  setToggleState: (widgetId, value) =>
    set((state) => ({
      toggleStates: { ...state.toggleStates, [widgetId]: value },
    })),
}));
