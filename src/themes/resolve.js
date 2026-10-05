// Pure ship-theme logic (no React/MUI/Vite imports) so it can be
// unit-tested with plain Node (test/themes.test.mjs).
//
// Resolution: the vehicle class is cut at its underscores and every prefix
// that has a registered theme is merged over the default, shortest first:
//   "RSI_Apollo_Medivac" -> default <- RSI <- RSI_Apollo <- RSI_Apollo_Medivac
// So manufacturer themes are simply the shortest prefix ("RSI", "MISC"),
// model themes a longer one, and a theme only states what differs.

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
}

// Deep merge for theme objects: nested plain objects merge, everything else
// (strings, numbers, arrays, null) replaces. undefined is ignored.
export function mergeTheme(base, override) {
  if (!isPlainObject(override)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(base[key])
      ? mergeTheme(base[key], value)
      : value;
  }
  return out;
}

/**
 * Registered theme keys applying to a vehicle class, shortest first.
 * Matching is case-insensitive and only at underscore boundaries
 * ("RSI" matches "RSI_Apollo", but not "RSIX_Foo").
 */
export function themeChain(vehicleClass, registry) {
  if (!vehicleClass) return [];
  const byLower = new Map(Object.keys(registry).map((k) => [k.toLowerCase(), k]));
  const parts = vehicleClass.split("_");
  const chain = [];
  for (let i = 1; i <= parts.length; i++) {
    const key = byLower.get(parts.slice(0, i).join("_").toLowerCase());
    if (key) chain.push(key);
  }
  return chain;
}

/**
 * @returns the merged theme plus `chain` (applied theme keys, for the
 *   status bar / dev preview; empty = default look)
 */
export function resolveTheme(vehicleClass, registry, base) {
  const chain = themeChain(vehicleClass, registry);
  const merged = chain.reduce((acc, key) => mergeTheme(acc, registry[key]), base);
  return { ...merged, chain };
}

// Logo watermark of a vehicle class: like the themes, the longest prefix
// with a logo file wins ("ORIG_M80" -> ORIG_M80.svg, else ORIG.svg).
export function logoFor(vehicleClass, logos) {
  const chain = themeChain(vehicleClass, logos);
  return chain.length ? logos[chain[chain.length - 1]] : null;
}

// art.logo: null = automatic (logo file by prefix), false = none, string =
// explicit URL set by the theme.
export function withLogo(theme, vehicleClass, logos) {
  if (theme.art.logo !== null) return theme;
  return { ...theme, art: { ...theme.art, logo: logoFor(vehicleClass, logos) } };
}

// SVG source -> data URL. Logos are inlined because CSS mask-image is
// fetched in CORS mode, which file:// URLs (packaged app) never pass.
export function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Color value -> CSS color. Role names ("line", "danger", "active" ...)
// resolve against the theme's palette; anything else (hex, rgba, CSS
// names) passes through. Used for theme slots AND for per-widget colors
// from config.json ("accent": "danger" follows the ship theme,
// "accent": "#ff4d4d" stays fixed).
export function themeColor(theme, value, fallback) {
  const v = value ?? fallback;
  if (v == null) return v;
  return Object.prototype.hasOwnProperty.call(theme.colors, v) ? theme.colors[v] : v;
}
