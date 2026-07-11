import { create } from "zustand";

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

  // Manual correction (e.g. when the game changed state without us
  // noticing): a long press could use this later
  setToggleState: (widgetId, value) =>
    set((state) => ({
      toggleStates: { ...state.toggleStates, [widgetId]: value },
    })),
}));
