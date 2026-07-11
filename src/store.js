import { create } from "zustand";

export const useDeckStore = create((set, get) => ({
  // ---- Konfiguration (aus config.json via Main-Prozess) ----
  pages: [],
  loaded: false,
  configError: null,   // { path, errors: string[] } wenn die Config kaputt ist
  configWarnings: [],

  // ---- Navigation ----
  currentPageIndex: 0,

  // ---- Widget-Zustände ----
  pressedId: null,
  errorId: null,
  lastError: null,     // { message, time } für die Statuszeile
  toggleStates: {},    // { [widgetId]: boolean } – lokaler "vermuteter" Zustand

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

    const toggleStates = {};
    for (const page of result.config.pages) {
      for (const panel of page.panels) {
        for (const w of panel.widgets) {
          if (w.type === "toggle") toggleStates[w.id] = Boolean(w.initial);
        }
      }
    }

    set({
      pages: result.config.pages,
      toggleStates,
      loaded: true,
      configError: null,
      configWarnings: result.warnings || [],
      currentPageIndex: 0,
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

  // ---- Gemeinsame Trigger-Logik ----
  _sendKeys: async (widget) => {
    set({ pressedId: widget.id, errorId: null });

    const result = await window.scDeck.sendHotkey(widget.keys);

    if (!result.ok) {
      console.error("Hotkey-Fehler:", result.error);
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

  triggerButton: async (widget) => {
    await get()._sendKeys(widget);
  },

  // Toggle: Zustand kippt nur bei erfolgreichem Versand
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

  setToggleState: (widgetId, value) =>
    set((state) => ({
      toggleStates: { ...state.toggleStates, [widgetId]: value },
    })),
}));
