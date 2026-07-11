// Validierung der config.json – bewusst ohne Electron-Abhängigkeiten,
// damit sie separat testbar ist. Das Key-Enum wird injiziert.

const VALID_TYPES = ["button", "toggle"];

/**
 * Prüft die Config-Struktur, Key-Namen und doppelte IDs.
 * @param {object} config - geparste config.json
 * @param {object} keyEnum - das Key-Enum aus @nut-tree-fork/nut-js
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateConfig(config, keyEnum) {
  const errors = [];
  const warnings = [];

  if (!config || !Array.isArray(config.pages)) {
    errors.push('Config braucht ein "pages"-Array auf oberster Ebene.');
    return { errors, warnings };
  }
  if (config.pages.length === 0) {
    errors.push('"pages" ist leer – mindestens eine Seite wird benötigt.');
    return { errors, warnings };
  }

  const seenIds = new Map(); // id -> Fundort

  config.pages.forEach((page, pi) => {
    const pageRef = `Seite ${pi + 1} ("${page?.title ?? page?.id ?? "?"}")`;

    if (!page?.id) errors.push(`${pageRef}: "id" fehlt.`);
    if (!page?.title) warnings.push(`${pageRef}: "title" fehlt.`);
    if (!Array.isArray(page?.panels) || page.panels.length === 0) {
      errors.push(`${pageRef}: "panels" fehlt oder ist leer.`);
      return;
    }

    page.panels.forEach((panel, pli) => {
      const panelRef = `${pageRef} → Panel ${pli + 1} ("${panel?.title ?? panel?.id ?? "?"}")`;

      if (!panel?.id) errors.push(`${panelRef}: "id" fehlt.`);
      if (!Array.isArray(panel?.widgets) || panel.widgets.length === 0) {
        errors.push(`${panelRef}: "widgets" fehlt oder ist leer.`);
        return;
      }

      panel.widgets.forEach((w, wi) => {
        const wRef = `${panelRef} → Widget ${wi + 1} ("${w?.label ?? w?.id ?? "?"}")`;

        if (!w?.id) {
          errors.push(`${wRef}: "id" fehlt.`);
        } else if (seenIds.has(w.id)) {
          errors.push(
            `${wRef}: doppelte ID "${w.id}" (bereits verwendet in ${seenIds.get(w.id)}).`
          );
        } else {
          seenIds.set(w.id, wRef);
        }

        if (!VALID_TYPES.includes(w?.type)) {
          errors.push(
            `${wRef}: unbekannter Typ "${w?.type}" (erlaubt: ${VALID_TYPES.join(", ")}).`
          );
        }

        if (!Array.isArray(w?.keys) || w.keys.length === 0) {
          errors.push(`${wRef}: "keys" fehlt oder ist leer.`);
        } else {
          for (const k of w.keys) {
            if (typeof k !== "string" || !(k in keyEnum)) {
              errors.push(
                `${wRef}: unbekannte Taste "${k}" – gültige Namen siehe nut.js Key-Enum (z.B. "LeftControl", "F5", "N").`
              );
            }
          }
          if (w.keys.length > 4) {
            warnings.push(`${wRef}: ${w.keys.length} Tasten gleichzeitig – ungewöhnlich, Absicht?`);
          }
        }
      });
    });
  });

  return { errors, warnings };
}

module.exports = { validateConfig };
