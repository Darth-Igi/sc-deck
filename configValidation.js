// Validation for config.json - deliberately free of Electron dependencies
// so it can be tested in isolation. The key enum is injected.

const VALID_TYPES = ["button", "toggle"];

/**
 * Checks config structure, key names, and duplicate IDs.
 * @param {object} config - parsed config.json
 * @param {object} keyEnum - the Key enum from @nut-tree-fork/nut-js
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

  const seenIds = new Map(); // id -> location where it was first used

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
        }

        if (!VALID_TYPES.includes(w?.type)) {
          errors.push(
            `${wRef}: unknown type "${w?.type}" (allowed: ${VALID_TYPES.join(", ")}).`
          );
        }

        if (!Array.isArray(w?.keys) || w.keys.length === 0) {
          errors.push(`${wRef}: "keys" is missing or empty.`);
        } else {
          for (const k of w.keys) {
            if (typeof k !== "string" || !(k in keyEnum)) {
              errors.push(
                `${wRef}: unknown key "${k}" - see the nut.js Key enum for valid names (e.g. "LeftControl", "F5", "N").`
              );
            }
          }
          if (w.keys.length > 4) {
            warnings.push(`${wRef}: ${w.keys.length} keys at once - unusual, intended?`);
          }
        }
      });
    });
  });

  return { errors, warnings };
}

module.exports = { validateConfig };
