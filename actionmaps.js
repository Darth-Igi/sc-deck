// Star Citizen key/joystick bindings -> input bindings per SC action
// (Phase C of power tracking).
//
// SC stores only the bindings the player CHANGED in
// <LIVE>\user\client\0\Profiles\default\actionmaps.xml:
//   <options type="joystick" instance="2" Product="VKBsim ... {3201231D-...}">
//   <action name="v_power_toggle"><rebind input="js2_button11" /></action>
//   <action name="v_flightready"><rebind input="kb1_ " /></action>   (unbound)
// Keyboard defaults are NOT in that file (they live in the game's pak), so
// the few actions the deck tracks have their defaults in
// DEFAULT_KEYBOARD_BINDINGS. A keyboard rebind (also an empty one = unbound)
// replaces the default; joystick bindings only come from the file.
//
// Joystick instances (js1, js2 ...) are matched to devices via the product
// GUID ({PPPPVVVV-...} = product, vendor), which the Gamepad API reports too
// - so the deck does not depend on SC's instance numbering.
//
// Electron-free and unit-tested (test/actionmaps.test.js).

"use strict";

const path = require("path");

// SC defaults (4.x, English client) for the actions the deck tracks.
// Verified in-game by the user: P/I/O/U toggles, RightAlt+R flight ready.
const DEFAULT_KEYBOARD_BINDINGS = Object.freeze({
  v_power_toggle: ["U"],
  v_power_toggle_weapons: ["P"],
  v_power_toggle_thrusters: ["I"],
  v_power_toggle_shields: ["O"],
  v_flightready: ["RightAlt", "R"],
});

// SC keyboard token -> key name of the SCANCODES table (config schema).
// Letters, digits and F-keys are generated below.
const SC_KEY_NAMES = {
  lalt: "LeftAlt", ralt: "RightAlt",
  lctrl: "LeftControl", rctrl: "RightControl",
  lshift: "LeftShift", rshift: "RightShift",
  escape: "Escape", tab: "Tab", space: "Space", enter: "Return",
  backspace: "Backspace", capslock: "CapsLock",
  minus: "Minus", equals: "Equal",
  lbracket: "LeftBracket", rbracket: "RightBracket",
  semicolon: "Semicolon", apostrophe: "Quote", grave: "Grave",
  backslash: "Backslash", comma: "Comma", period: "Period", slash: "Slash",
  insert: "Insert", delete: "Delete", home: "Home", end: "End",
  pgup: "PageUp", pgdn: "PageDown",
  up: "Up", down: "Down", left: "Left", right: "Right",
  print: "Print", scrolllock: "ScrollLock", numlock: "NumLock",
  np_add: "Add", np_subtract: "Subtract", np_multiply: "Multiply",
  np_divide: "Divide", np_period: "Decimal", np_enter: "Enter",
};
for (let i = 0; i <= 9; i++) {
  SC_KEY_NAMES[String(i)] = `Num${i}`;
  SC_KEY_NAMES[`np_${i}`] = `NumPad${i}`;
}
for (let i = 1; i <= 24; i++) SC_KEY_NAMES[`f${i}`] = `F${i}`;
for (const c of "abcdefghijklmnopqrstuvwxyz") SC_KEY_NAMES[c] = c.toUpperCase();

const MODIFIERS = new Set([
  "LeftAlt", "RightAlt", "LeftControl", "RightControl", "LeftShift", "RightShift",
]);

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};

/**
 * Raw parse: joystick devices per instance + rebind inputs per action.
 * The file is machine-written with a fixed shape, so a tag scan is enough.
 * @returns {{ joysticks: Object<number, {name, product, vendor}>, rebinds: Object<string, string[]> }}
 */
function parseActionMaps(xml) {
  const joysticks = {};
  for (const [tag] of xml.matchAll(/<options\b[^>]*>/g)) {
    if (attr(tag, "type") !== "joystick") continue;
    const product = attr(tag, "Product");
    const guid = product && /\{([0-9a-f]{4})([0-9a-f]{4})-/i.exec(product);
    if (!guid) continue; // empty instance slot
    joysticks[Number(attr(tag, "instance"))] = {
      name: product.replace(/\{.*\}/, "").trim(),
      product: guid[1].toLowerCase(),
      vendor: guid[2].toLowerCase(),
    };
  }

  const rebinds = {};
  // an action may appear in several actionmaps -> inputs are collected
  for (const m of xml.matchAll(/<action\s+name="([^"]+)"\s*>([\s\S]*?)<\/action>/g)) {
    const inputs = [...m[2].matchAll(/<rebind\b[^>]*>/g)].map(([tag]) => attr(tag, "input"));
    (rebinds[m[1]] ??= []).push(...inputs.filter((i) => i !== null));
  }
  return { joysticks, rebinds };
}

/** "kb1_lalt+f5" -> ["LeftAlt", "F5"] (modifiers first, like config.json);
 * null for unmappable tokens (mouse buttons inside kb binds, unknown keys). */
function keysFromScInput(combo) {
  const names = combo.split("+").map((t) => SC_KEY_NAMES[t.trim().toLowerCase()]);
  if (names.some((n) => !n)) return null;
  return [...names.filter((n) => MODIFIERS.has(n)), ...names.filter((n) => !MODIFIERS.has(n))];
}

/**
 * Bindings for the given actions:
 *   { [action]: [{ kind: "kb", keys: [...] } | { kind: "js", product, vendor, button }] }
 * @param {ReturnType<parseActionMaps> | null} parsed  null = no actionmaps.xml
 * @param {string[]} actions
 * @returns {{ bindings: object, warnings: string[] }}
 */
function resolveBindings(parsed, actions) {
  const bindings = {};
  const warnings = [];
  for (const action of actions) {
    const inputs = parsed?.rebinds[action] ?? [];
    const list = [];
    let kbRebound = false;
    for (const input of inputs) {
      const m = /^(kb|js)(\d+)_(.*)$/.exec(input);
      if (!m) continue; // mouse/gamepad bindings are not tracked
      const [, kind, instance, rest] = m;
      const value = rest.trim();
      if (kind === "kb") {
        kbRebound = true; // also an empty rebind: default removed
        if (!value) continue;
        const keys = keysFromScInput(value);
        if (keys) list.push({ kind: "kb", keys });
        else warnings.push(`${action}: keyboard binding "${value}" is not trackable`);
      } else if (value) {
        const button = /^button(\d+)$/.exec(value);
        const device = parsed.joysticks[Number(instance)];
        if (!button) continue; // axes/hats: not trackable as presses
        if (!device) {
          warnings.push(`${action}: js${instance} has no device in actionmaps.xml`);
          continue;
        }
        list.push({ kind: "js", product: device.product, vendor: device.vendor, button: Number(button[1]) });
      }
    }
    if (!kbRebound && DEFAULT_KEYBOARD_BINDINGS[action]) {
      list.unshift({ kind: "kb", keys: [...DEFAULT_KEYBOARD_BINDINGS[action]] });
    }
    bindings[action] = list;
  }
  return { bindings, warnings };
}

/** actionmaps.xml next to the game's Game.log (LIVE folder). */
function actionmapsPathFor(gamelogPath) {
  return path.join(path.dirname(gamelogPath), "user", "client", "0", "Profiles", "default", "actionmaps.xml");
}

/** SC actions referenced by the config: widget "action" + "effects" keys. */
function actionsOfConfig(config) {
  const actions = new Set(Object.keys(config.effects ?? {}));
  for (const page of config.pages ?? []) {
    for (const panel of page.panels ?? []) {
      for (const w of panel.widgets ?? []) if (w.action) actions.add(w.action);
    }
  }
  return [...actions];
}

module.exports = {
  DEFAULT_KEYBOARD_BINDINGS,
  parseActionMaps,
  keysFromScInput,
  resolveBindings,
  actionmapsPathFor,
  actionsOfConfig,
};
