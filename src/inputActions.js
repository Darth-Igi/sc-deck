// Pure logic (Phase C): physical inputs -> SC actions -> toggle states.
// Kept free of Zustand/React so it can be unit-tested with plain Node
// (test/inputActions.test.mjs).
//
// Bindings come from the main process (actionmaps.js):
//   { [action]: [{ kind: "kb", keys }, { kind: "js", product, vendor, button }] }
// An action affects the deck in two ways:
// - toggle widgets with that "action" flip (the game toggles too)
// - config "effects" set toggles to fixed values (v_flightready -> power on)
// Both apply to physical input AND to deck taps of a widget with "action".

const MODIFIERS = new Set([
  "LeftAlt", "RightAlt", "LeftControl", "RightControl", "LeftShift", "RightShift",
]);

/**
 * Stateful matcher, one per bindings set. Fires on the press (down) of an
 * input; keyboard combos match only with EXACTLY their modifiers held, so
 * LeftAlt+P does not count as P (SC does not fire the plain bind either).
 * @returns {(event) => string[]} actions triggered by the event
 */
export function createActionMatcher(bindings) {
  const held = new Set();
  const entries = Object.entries(bindings || {});
  return function match(event) {
    if (event.source === "keyboard") {
      if (!event.down) {
        held.delete(event.key);
        return [];
      }
      held.add(event.key);
      const mods = [...held].filter((k) => MODIFIERS.has(k) && k !== event.key);
      return entries
        .filter(([, list]) =>
          list.some((b) => {
            if (b.kind !== "kb" || b.keys[b.keys.length - 1] !== event.key) return false;
            const need = b.keys.slice(0, -1);
            return need.length === mods.length && need.every((k) => mods.includes(k));
          })
        )
        .map(([action]) => action);
    }
    if (event.source === "joystick" && event.down && event.product) {
      return entries
        .filter(([, list]) =>
          list.some(
            (b) =>
              b.kind === "js" &&
              b.button === event.button &&
              b.product === event.product &&
              b.vendor === event.vendor
          )
        )
        .map(([action]) => action);
    }
    return [];
  };
}

function toggleWidgets(pages) {
  const out = [];
  for (const page of pages || []) {
    for (const panel of page.panels || []) {
      for (const w of panel.widgets || []) if (w.type === "toggle") out.push(w);
    }
  }
  return out;
}

/**
 * Applies actions to the toggle states: toggles bound to the action flip,
 * then the action's effects set fixed values.
 * @returns {{ toggleStates, changes: { id, label, value }[] } | null} null if nothing changed
 */
export function applyActions(toggleStates, actions, pages, effects = {}) {
  const toggles = toggleWidgets(pages);
  const next = { ...toggleStates };
  for (const action of actions) {
    for (const w of toggles) if (w.action === action) next[w.id] = !next[w.id];
    for (const [id, value] of Object.entries(effects[action] || {})) {
      if (id in next) next[id] = value;
    }
  }
  const changes = toggles
    .filter((w) => next[w.id] !== toggleStates[w.id])
    .map((w) => ({ id: w.id, label: w.label, value: next[w.id] }));
  return changes.length ? { toggleStates: next, changes } : null;
}

// Status bar text, e.g. "INPUT: WPN → OFF"
export function describeChanges(prefix, changes) {
  return `${prefix}: ${changes.map((c) => `${c.label} → ${c.value ? "ON" : "OFF"}`).join(", ")}`;
}
