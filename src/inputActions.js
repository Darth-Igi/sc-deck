// Pure logic (Phase C): physical inputs -> SC actions -> toggle states.
// Kept free of Zustand/React so it can be unit-tested with plain Node
// (test/inputActions.test.mjs).
//
// Bindings come from the main process (actionmaps.js):
//   { [action]: [{ kind: "kb", keys }, { kind: "js", product, vendor, button }] }
// An action affects the deck in two ways:
// - toggle widgets with that "action" flip (the game toggles too)
// - config "effects" set toggles to fixed values (v_flightready -> power on)
// Toggles with "requires" only count while their master toggle is on.
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

// Per-ship flag "this once-only action already ran" (Flight Ready). Lives in
// toggleStates, so it is remembered per ship, persisted with the snapshot
// and cleared with every reset to "initial" (fresh ship, manual reset).
export const ONCE_PREFIX = "once:";
export const isFlagKey = (key) => key.startsWith(ONCE_PREFIX);

// Displayed state: a toggle with "requires" (WPN -> POWER) keeps its own
// state, but only counts while that master toggle is on - like SC, which
// remembers the subsystems across master power off/on.
export function isToggleOn(toggleStates, widget) {
  return Boolean(
    toggleStates[widget.id] && (!widget.requires || toggleStates[widget.requires])
  );
}

// config.effects entry: { "once": true, "<toggle id>": true, ... }
function effectOf(entry) {
  const { once = false, ...set } = entry || {};
  return { once, set };
}

/**
 * Applies actions to the toggle states: toggles bound to the action flip
 * (not while their "requires" master is off - SC ignores the key then),
 * then the action's effects set fixed values. A "once" effect fires only
 * once per ship (Flight Ready; afterwards it is master power on/off).
 * @returns {{ toggleStates, changes: { id, label, value }[] } | null} null if nothing changed
 */
export function applyActions(toggleStates, actions, pages, effects = {}) {
  const toggles = toggleWidgets(pages);
  const next = { ...toggleStates };
  let flagged = false;
  for (const action of actions) {
    const { once, set } = effectOf(effects[action]);
    if (once) {
      if (next[ONCE_PREFIX + action]) continue;
      next[ONCE_PREFIX + action] = true;
      flagged = true;
    }
    for (const w of toggles) {
      if (w.action === action && (!w.requires || next[w.requires])) next[w.id] = !next[w.id];
    }
    for (const [id, value] of Object.entries(set)) {
      if (id in next) next[id] = value;
    }
  }
  // changes as displayed: POWER on also shows WPN/SHLD coming on
  const changes = toggles
    .filter((w) => isToggleOn(next, w) !== isToggleOn(toggleStates, w))
    .map((w) => ({ id: w.id, label: w.label, value: isToggleOn(next, w) }));
  return changes.length || flagged ? { toggleStates: next, changes } : null;
}

// Status bar text, e.g. "INPUT: WPN → OFF"
export function describeChanges(prefix, changes) {
  return `${prefix}: ${changes.map((c) => `${c.label} → ${c.value ? "ON" : "OFF"}`).join(", ")}`;
}
