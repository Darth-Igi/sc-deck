// Validation for config.json - deliberately free of Electron dependencies
// so it can be tested in isolation. The key enum is injected.

const { MAX_HOLD_MS } = require("./scancodeSender");

const VALID_TYPES = ["button", "toggle"];

const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

// SC action names as in actionmaps.xml ("v_power_toggle_weapons")
const isActionName = (v) => typeof v === "string" && /^[A-Za-z0-9_]+$/.test(v);
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** Unknown key names in a combo (hasOwnProperty, not `in`: `in` would also
 * accept prototype members like "toString" as valid key names). */
function unknownKeys(keys, keyEnum) {
  return keys.filter(
    (k) => typeof k !== "string" || !Object.prototype.hasOwnProperty.call(keyEnum, k)
  );
}

/**
 * Checks config structure, key names, and duplicate IDs.
 * @param {object} config - parsed config.json
 * @param {object} keyEnum - map of valid key names (SCANCODE_KEY_NAMES)
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateConfig(config, keyEnum) {
  const errors = [];
  const warnings = [];

  if (!config || !Array.isArray(config.pages)) {
    errors.push('Config requires a top-level "pages" array.');
    return { errors, warnings };
  }
  if (config.pages.length === 0) {
    errors.push('"pages" is empty - at least one page is required.');
    return { errors, warnings };
  }

  // Optional Game.log section
  if (config.gamelog !== undefined) {
    const g = config.gamelog;
    if (typeof g !== "object" || g === null || Array.isArray(g)) {
      errors.push('"gamelog" must be an object.');
    } else {
      if (g.enabled !== undefined && typeof g.enabled !== "boolean") {
        errors.push('"gamelog.enabled" must be true or false.');
      }
      if (g.path !== undefined && g.path !== null && typeof g.path !== "string") {
        errors.push('"gamelog.path" must be a string (path to Game.log).');
      }
      if (g.pollMs !== undefined && (typeof g.pollMs !== "number" || g.pollMs < 100)) {
        errors.push('"gamelog.pollMs" must be a number >= 100.');
      }
      if (g.playerName !== undefined && typeof g.playerName !== "string") {
        errors.push('"gamelog.playerName" must be a string.');
      }
      if (g.patterns !== undefined) {
        if (typeof g.patterns !== "object" || g.patterns === null) {
          errors.push('"gamelog.patterns" must be an object of regex strings.');
        } else {
          for (const [name, src] of Object.entries(g.patterns)) {
            if (typeof src !== "string") {
              errors.push(`"gamelog.patterns.${name}" must be a regex string.`);
              continue;
            }
            try {
              new RegExp(src);
            } catch (e) {
              errors.push(`"gamelog.patterns.${name}" is not a valid regex: ${e.message}`);
            }
          }
        }
      }
    }
  }

  // Optional physical input listening (keyboard hook / joysticks)
  if (config.input !== undefined) {
    const inp = config.input;
    if (typeof inp !== "object" || inp === null || Array.isArray(inp)) {
      errors.push('"input" must be an object.');
    } else {
      for (const k of ["keyboard", "joystick", "debug"]) {
        if (inp[k] !== undefined && typeof inp[k] !== "boolean") {
          errors.push(`"input.${k}" must be true or false.`);
        }
      }
      // null/missing -> derived from the Game.log path
      if (inp.actionmaps !== undefined && inp.actionmaps !== null && typeof inp.actionmaps !== "string") {
        errors.push('"input.actionmaps" must be a string (path to actionmaps.xml).');
      }
    }
  }

  const seenIds = new Map(); // id -> location where it was first used
  const toggleIds = new Set();
  const requiring = []; // [wRef, widget] - "requires" is checked after all ids are known

  config.pages.forEach((page, pi) => {
    const pageRef = `page ${pi + 1} ("${page?.title ?? page?.id ?? "?"}")`;

    if (!page?.id) errors.push(`${pageRef}: "id" is missing.`);
    if (!page?.title) warnings.push(`${pageRef}: "title" is missing.`);
    if (!Array.isArray(page?.panels) || page.panels.length === 0) {
      errors.push(`${pageRef}: "panels" is missing or empty.`);
      return;
    }

    page.panels.forEach((panel, pli) => {
      const panelRef = `${pageRef} -> panel ${pli + 1} ("${panel?.title ?? panel?.id ?? "?"}")`;

      if (!panel?.id) errors.push(`${panelRef}: "id" is missing.`);
      if (panel?.columns !== undefined && !isPositiveInt(panel.columns)) {
        errors.push(`${panelRef}: "columns" must be a whole number >= 1.`);
      }
      // "rows": widgets flow top-to-bottom, a new column every `rows`
      // widgets (cockpit power columns: +1 / -1 / on-off per system)
      if (panel?.rows !== undefined && !isPositiveInt(panel.rows)) {
        errors.push(`${panelRef}: "rows" must be a whole number >= 1.`);
      }
      if (!Array.isArray(panel?.widgets) || panel.widgets.length === 0) {
        errors.push(`${panelRef}: "widgets" is missing or empty.`);
        return;
      }

      panel.widgets.forEach((w, wi) => {
        const wRef = `${panelRef} -> widget ${wi + 1} ("${w?.label ?? w?.id ?? "?"}")`;

        if (!w?.id) {
          errors.push(`${wRef}: "id" is missing.`);
        } else if (seenIds.has(w.id)) {
          errors.push(
            `${wRef}: duplicate ID "${w.id}" (already used in ${seenIds.get(w.id)}).`
          );
        } else {
          seenIds.set(w.id, wRef);
          if (w.type === "toggle") toggleIds.add(w.id);
        }

        // "action": the SC action this widget triggers - physical presses
        // of its bindings flip the toggle, "effects" of it apply
        if (w?.action !== undefined && !isActionName(w.action)) {
          errors.push(`${wRef}: "action" must be an SC action name (e.g. "v_power_toggle_weapons").`);
        }

        // "requires": master toggle id (WPN -> POWER). The toggle keeps its
        // state but only shows/acts as ON while the master is on.
        if (w?.requires !== undefined) {
          if (w.type !== "toggle") errors.push(`${wRef}: "requires" is only supported on toggles.`);
          else if (typeof w.requires !== "string") errors.push(`${wRef}: "requires" must be a toggle id.`);
          else requiring.push([wRef, w]);
        }

        if (!VALID_TYPES.includes(w?.type)) {
          errors.push(
            `${wRef}: unknown type "${w?.type}" (allowed: ${VALID_TYPES.join(", ")}).`
          );
        }

        // "initial" is coerced with Boolean() at runtime, so a well-meant
        // string like "false" would silently become true - warn about it.
        if (
          w?.type === "toggle" &&
          w?.initial !== undefined &&
          typeof w.initial !== "boolean"
        ) {
          warnings.push(
            `${wRef}: "initial" should be true or false (got ${JSON.stringify(
              w.initial
            )} - non-empty values count as true).`
          );
        }

        // "accent": color role of the ship theme ("danger", "warn", "active",
        // "line" ...) or a fixed CSS color ("#ff4d4d"). Roles are resolved
        // in the renderer (src/themes), so only the type is checked here.
        if (w?.accent !== undefined && (typeof w.accent !== "string" || !w.accent.trim())) {
          errors.push(
            `${wRef}: "accent" must be a color role (e.g. "danger") or a CSS color (e.g. "#ff4d4d").`
          );
        }

        if (!Array.isArray(w?.keys) || w.keys.length === 0) {
          errors.push(`${wRef}: "keys" is missing or empty.`);
        } else {
          for (const k of unknownKeys(w.keys, keyEnum)) {
            errors.push(
              `${wRef}: unknown key "${k}" - see SCANCODES in scancodeSender.js for valid names (e.g. "LeftControl", "F5", "N").`
            );
          }
          if (w.keys.length > 4) {
            warnings.push(`${wRef}: ${w.keys.length} keys at once - unusual, intended?`);
          }
        }

        // "hold" (buttons only): long press on the deck sends hold.keys
        // (default: the widget's keys) held for hold.holdMs - for game
        // actions that trigger on HOLD, e.g. power MAX/MIN
        if (w?.hold !== undefined) {
          const h = w.hold;
          if (w.type !== "button") {
            errors.push(`${wRef}: "hold" is only supported on buttons.`);
          } else if (typeof h !== "object" || h === null || Array.isArray(h)) {
            errors.push(`${wRef}: "hold" must be an object ({ "keys", "holdMs", "label" }).`);
          } else {
            if (h.keys !== undefined) {
              if (!Array.isArray(h.keys) || h.keys.length === 0) {
                errors.push(`${wRef}: "hold.keys" must be a non-empty key list.`);
              } else {
                for (const k of unknownKeys(h.keys, keyEnum)) {
                  errors.push(`${wRef}: unknown key "${k}" in "hold.keys".`);
                }
              }
            }
            if (
              h.holdMs !== undefined &&
              !(Number.isInteger(h.holdMs) && h.holdMs >= 0 && h.holdMs <= MAX_HOLD_MS)
            ) {
              errors.push(`${wRef}: "hold.holdMs" must be a whole number 0-${MAX_HOLD_MS}.`);
            }
            if (h.label !== undefined && typeof h.label !== "string") {
              errors.push(`${wRef}: "hold.label" must be a string.`);
            }
          }
        }
      });
    });
  });

  // One level only: a master must not require another toggle itself
  const masters = new Map(requiring.map(([, w]) => [w.id, w.requires]));
  for (const [wRef, w] of requiring) {
    if (w.requires === w.id) errors.push(`${wRef}: "requires" must not point to itself.`);
    else if (!toggleIds.has(w.requires)) errors.push(`${wRef}: "requires": "${w.requires}" is not a toggle id.`);
    else if (masters.has(w.requires)) {
      errors.push(`${wRef}: "requires": "${w.requires}" has a "requires" itself (only one level supported).`);
    }
  }

  // Optional "effects": SC action -> toggles it sets to a fixed state
  // ({ "v_flightready": { "once": true, "pwr-all": true } }; "once": only
  // the first trigger per ship counts). Checked after the pages, because
  // the toggle ids must exist.
  if (config.effects !== undefined) {
    if (!isPlainObject(config.effects)) {
      errors.push('"effects" must be an object ({ "<action>": { "<toggle id>": true } }).');
    } else {
      for (const [action, sets] of Object.entries(config.effects)) {
        const ref = `"effects.${action}"`;
        if (!isActionName(action)) {
          errors.push(`${ref}: not a valid SC action name.`);
        } else if (!isPlainObject(sets)) {
          errors.push(`${ref} must be an object of toggle id -> true/false.`);
        } else {
          for (const [id, value] of Object.entries(sets)) {
            if (id === "once") {
              if (typeof value !== "boolean") errors.push(`${ref}: "once" must be true or false.`);
            } else if (typeof value !== "boolean") errors.push(`${ref}: "${id}" must be true or false.`);
            else if (!toggleIds.has(id)) errors.push(`${ref}: "${id}" is not a toggle id.`);
          }
        }
      }
    }
  }

  return { errors, warnings };
}

module.exports = { validateConfig };
