import { create } from "zustand";
import {
  applyGameEvent,
  cursorAfter,
  describeGameEvent,
  initialToggleStates,
  isAlreadyApplied,
  restoreSnapshot,
  snapshotOf,
} from "./gameEvents";
import { applyActions, createActionMatcher, describeChanges } from "./inputActions";

// Default key hold for a button's "hold" action. SC's hold threshold is not
// documented; per widget overridable via "hold.holdMs" (config.json).
export const DEFAULT_BUTTON_HOLD_MS = 800;

// Physical input events kept for the debug display
const INPUT_HISTORY = 4;

let initStarted = false;

// Physical input -> SC actions; rebuilt whenever new bindings arrive
let matchActions = createActionMatcher({});

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
  currentVehicleId: null,    // ship key "<class>:<owner>" we are (assumed to be) in
  currentVehicleClass: null, // e.g. "MISC_Starlancer_TAC" - selects the ship theme
  currentVehicleName: null,  // e.g. "MISC Starlancer TAC" - shown in the status bar
  vehicleMemory: {},         // { [vehicleId]: toggleStates } per-ship memory
  gameStatus: null,          // { message, time } last game event, status bar
  gamelogState: null,        // "watching" | "missing" - tailer status
  gamelogCursor: null,       // { session, line } of the last applied event

  // Startup: game events are queued until config AND the persisted
  // snapshot are loaded (the replay starts right after page load and would
  // otherwise race both). The snapshot waits for the first event, which
  // tells whether it belongs to the current Game.log session.
  ready: false,
  eventQueue: [],
  pendingSnapshot: null,

  // ---- Physical input (see src/inputActions.js) ----
  inputConfig: {},           // config.input: { keyboard, joystick, debug, actionmaps }
  effects: {},               // config.effects: { [action]: { [toggleId]: boolean } }
  inputBindings: null,       // { path, state, bindings, warnings } from actionmaps.js
  keyboardHookState: null,   // "running" | "failed" | "stopped" | "off"
  joystickDevices: [],       // [{ slot, name, vendor, product, buttons }]
  lastInputs: [],            // newest first, max INPUT_HISTORY entries

  // Key transitions from the main process hook, button transitions from
  // the joystick poller. A press bound to an SC action the deck tracks
  // updates the toggles - only while in a ship (Game.log), otherwise e.g.
  // P on foot would flip WPN. Without Game.log tracking there is no way to
  // tell, so inputs always count.
  handleInputEvent: (event) => {
    if (event.type === "input-status") {
      set({ keyboardHookState: event.state });
      return;
    }
    if (event.type === "input-bindings") {
      matchActions = createActionMatcher(event.bindings);
      set({ inputBindings: event });
      return;
    }
    const actions = matchActions(event);
    set((state) => ({
      lastInputs: [{ ...event, actions, time: Date.now() }, ...state.lastInputs].slice(0, INPUT_HISTORY),
    }));
    const { gamelogState, currentVehicleId, toggleStates, pages, effects } = get();
    if (!actions.length || (gamelogState && !currentVehicleId)) return;
    const result = applyActions(toggleStates, actions, pages, effects);
    if (result) {
      set({
        toggleStates: result.toggleStates,
        gameStatus: { message: describeChanges("INPUT", result.changes), time: new Date().toLocaleTimeString() },
      });
    }
  },
  setJoystickDevices: (devices) => set({ joystickDevices: devices }),

  // Dev-only theme preview (StatusBar picker, `npm run dev`): a vehicle
  // class that overrides the detected ship for theming only.
  themePreview: null,
  setThemePreview: (vehicleClass) => set({ themePreview: vehicleClass }),

  // Semantic events from the main process (Game.log watcher). Toggle
  // states are remembered per ship and restored on re-boarding; a freshly
  // retrieved instance, destruction, death or a game restart resets them
  // to the config's "initial" values.
  handleGameEvent: (event) => {
    if (event.type === "gamelog-status") {
      set({ gamelogState: event.state });
      return;
    }
    if (!get().ready) {
      set((state) => ({ eventQueue: [...state.eventQueue, event] }));
      return;
    }

    const snapshot = get().pendingSnapshot;
    if (snapshot) {
      // First event after startup: restore if same session, else drop it
      const restored = restoreSnapshot(snapshot, event, get().pages);
      set({ pendingSnapshot: null, ...(restored || {}) });
    }
    if (isAlreadyApplied(get().gamelogCursor, event)) return;

    const { toggleStates, currentVehicleId, vehicleMemory, pages } = get();
    const update = applyGameEvent(
      { toggleStates, currentVehicleId, vehicleMemory },
      event,
      pages
    );
    const gamelogCursor = cursorAfter(event);
    if (!update) {
      set({ gamelogCursor });
      return;
    }
    update.gamelogCursor = gamelogCursor;
    const message = describeGameEvent(event);
    if (message) {
      update.gameStatus = { message, time: new Date().toLocaleTimeString() };
    }
    set(update);
  },

  // App start: config first (initial toggle values), then the persisted
  // snapshot, then the queued game events.
  init: async () => {
    if (initStarted) return; // StrictMode runs mount effects twice in dev
    initStarted = true;
    await get().loadConfig();
    let snapshot = null;
    try {
      if (window.scDeck.getDeckState) snapshot = await window.scDeck.getDeckState();
    } catch (err) {
      console.error("Failed to load deck state:", err);
    }
    try {
      // bindings may have been pushed before the page listened
      const bindings = await window.scDeck.getInputBindings?.();
      if (bindings) get().handleInputEvent(bindings);
    } catch (err) {
      console.error("Failed to load input bindings:", err);
    }
    const queued = get().eventQueue;
    set({ ready: true, eventQueue: [], pendingSnapshot: snapshot || null });
    for (const event of queued) get().handleGameEvent(event);
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
      inputConfig: result.config.input ?? {},
      effects: result.config.effects ?? {},
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

  quit: () => {
    flushDeckState(); // IPC is ordered: saved before the quit is handled
    window.scDeck.quitApp();
  },

  // ---- Shared trigger logic: send keys + pressed/error feedback ----
  // `keys`/`holdMs` override the widget's combo (button long press)
  _sendKeys: async (widget, keys = widget.keys, holdMs) => {
    set({ pressedId: widget.id, errorId: null });

    const result = await window.scDeck.sendHotkey(keys, holdMs);

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

  // Deck tap of a widget with "action": the game runs that action, so its
  // effects (and other toggles bound to it) apply like a physical press
  _applyWidgetAction: (widget) => {
    const { toggleStates, pages, effects } = get();
    const result = applyActions(toggleStates, [widget.action], pages, effects);
    if (result) set({ toggleStates: result.toggleStates });
  },

  // Momentary button: just send the keys
  triggerButton: async (widget) => {
    const ok = await get()._sendKeys(widget);
    if (ok && widget.action) get()._applyWidgetAction(widget);
  },

  // Long press on a button with "hold": the hold combo (default: the same
  // keys) is held down holdMs long, so game actions bound to HOLD trigger
  // (power MAX/MIN on the same key as +1/-1)
  triggerButtonHold: async (widget) => {
    const { keys = widget.keys, holdMs = DEFAULT_BUTTON_HOLD_MS } = widget.hold;
    // no _applyWidgetAction: holding triggers a DIFFERENT SC action (MAX)
    await get()._sendKeys(widget, keys, holdMs);
  },

  // Toggle: state only flips on successful dispatch, so the UI and the
  // (assumed) game state don't drift apart when key dispatch fails.
  triggerToggle: async (widget) => {
    const ok = await get()._sendKeys(widget);
    if (ok && widget.action) {
      get()._applyWidgetAction(widget); // flips this toggle too
    } else if (ok) {
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

  // Long press on a toggle: flip the LOCAL assumed state WITHOUT sending
  // any keys. Covers per-widget drift (ship power-off resets components
  // in-game, keys pressed on the physical keyboard) without the shotgun
  // of a full manual reset. Reported in the status bar so an accidental
  // hold is noticeable.
  correctToggle: (widget) =>
    set((state) => {
      const next = !state.toggleStates[widget.id];
      return {
        toggleStates: { ...state.toggleStates, [widget.id]: next },
        gameStatus: {
          message: `MANUAL: ${widget.label} → ${next ? "ON" : "OFF"}`,
          time: new Date().toLocaleTimeString(),
        },
      };
    }),
}));

// ---- Persistence: save the snapshot (debounced) whenever it changes ----
// Only with a cursor: without a Game.log session there is nothing a later
// start could validate the snapshot against (gamelog disabled, or right
// after a game restart until the first line of the new log).
const SAVE_DEBOUNCE_MS = 400;
let saveTimer = null;

function flushDeckState() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const state = useDeckStore.getState();
  if (!state.gamelogCursor || !window.scDeck.saveDeckState) return;
  window.scDeck.saveDeckState(snapshotOf(state)).catch((err) =>
    console.error("Failed to save deck state:", err)
  );
}

useDeckStore.subscribe((state, prev) => {
  const changed =
    state.gamelogCursor !== prev.gamelogCursor ||
    state.toggleStates !== prev.toggleStates ||
    state.vehicleMemory !== prev.vehicleMemory ||
    state.currentVehicleId !== prev.currentVehicleId;
  if (!changed || !state.ready || !state.gamelogCursor) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushDeckState, SAVE_DEBOUNCE_MS);
});
