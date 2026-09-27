// Mini test suite without a framework: node test/themes.test.mjs
import assert from "assert";
import { mergeTheme, themeChain, resolveTheme, themeColor } from "../src/themes/resolve.js";
import defaultTheme from "../src/themes/default.js";
import { SHIP_THEMES } from "../src/themes/registry.js";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}

const base = {
  colors: { line: "cyan", danger: "red" },
  button: { radius: 28, accent: "line" },
  art: { logo: null },
};
const registry = {
  RSI: { colors: { line: "white" } },
  RSI_Apollo: { button: { radius: 0 } },
  MISC: { colors: { line: "gold" } },
};

test("mergeTheme deep-merges objects, replaces leaves, ignores undefined", () => {
  const m = mergeTheme(base, { colors: { line: "x" }, button: { radius: undefined }, art: { logo: "a.png" } });
  assert.deepStrictEqual(m.colors, { line: "x", danger: "red" });
  assert.strictEqual(m.button.radius, 28);
  assert.strictEqual(m.art.logo, "a.png");
  assert.strictEqual(base.colors.line, "cyan", "base must not be mutated");
});

test("themeChain: manufacturer then model, shortest first", () => {
  assert.deepStrictEqual(themeChain("RSI_Apollo_Medivac", registry), ["RSI", "RSI_Apollo"]);
  assert.deepStrictEqual(themeChain("RSI_Zeus_MkII_CL", registry), ["RSI"]);
  assert.deepStrictEqual(themeChain("MISC_Starfarer", registry), ["MISC"]);
});

test("themeChain: only matches at underscore boundaries, case-insensitive", () => {
  assert.deepStrictEqual(themeChain("RSIX_Foo", registry), []);
  assert.deepStrictEqual(themeChain("rsi_apollo_triage", registry), ["RSI", "RSI_Apollo"]);
});

test("themeChain: no ship / unknown ship -> default", () => {
  assert.deepStrictEqual(themeChain(null, registry), []);
  assert.deepStrictEqual(themeChain("DRAK_Cutlass_Black", registry), []);
});

test("resolveTheme merges default <- manufacturer <- model", () => {
  const t = resolveTheme("RSI_Apollo_Medivac", registry, base);
  assert.strictEqual(t.colors.line, "white");   // from RSI
  assert.strictEqual(t.button.radius, 0);       // from RSI_Apollo
  assert.strictEqual(t.colors.danger, "red");   // from default
  assert.deepStrictEqual(t.chain, ["RSI", "RSI_Apollo"]);
});

test("resolveTheme without a ship is the default look", () => {
  const t = resolveTheme(null, registry, base);
  assert.strictEqual(t.colors.line, "cyan");
  assert.deepStrictEqual(t.chain, []);
});

test("themeColor: roles resolve, literals pass through, fallback applies", () => {
  const t = resolveTheme("MISC_Starlancer_TAC", registry, base);
  assert.strictEqual(themeColor(t, "line"), "gold");
  assert.strictEqual(themeColor(t, "#ff4d4d"), "#ff4d4d");
  assert.strictEqual(themeColor(t, undefined, "danger"), "red");
  assert.strictEqual(themeColor(t, "danger", "line"), "red");
});

// ---- Sanity of the real theme files: every color slot must be a known
// role or a literal CSS color - catches typos like "lineDimm".
const LITERAL = /^(#|rgb|hsl|transparent$|white$|black$|currentColor$|inherit$)/;
const COLOR_SLOTS = {
  panel: ["border", "background", "titleColor", "titleBackground", "divider"],
  button: ["border", "background", "text", "accent", "pressedText"],
  nav: ["color", "border", "titleBackground", "titleColor"],
  toggle: ["accent", "onTrack", "offThumb", "trackBorder"],
};
// optional slots: null = "not used / fall back"
const NULLABLE_SLOTS = {
  panel: ["titleMarker", "dividerCaps"],
  nav: ["arrowFill", "titleBorder"],
  toggle: ["onTrackBorder", "offThumbBorder"],
};

function checkSlots(label, theme) {
  for (const [section, slots] of Object.entries(NULLABLE_SLOTS)) {
    for (const slot of slots) {
      const v = theme[section][slot];
      assert.ok(
        v === null || (typeof v === "string" && (v in theme.colors || LITERAL.test(v))),
        `${label}: ${section}.${slot} = ${JSON.stringify(v)} is neither null, a color role nor a CSS color`
      );
    }
  }
  for (const [section, slots] of Object.entries(COLOR_SLOTS)) {
    for (const slot of slots) {
      const v = theme[section][slot];
      assert.ok(
        typeof v === "string" && (v in theme.colors || LITERAL.test(v)),
        `${label}: ${section}.${slot} = ${JSON.stringify(v)} is neither a color role nor a CSS color`
      );
    }
  }
}

test("default theme: all color slots reference known roles", () => {
  checkSlots("default", defaultTheme);
});

test("registered ship themes: all color slots resolve after merging", () => {
  for (const key of Object.keys(SHIP_THEMES)) {
    checkSlots(key, resolveTheme(key, SHIP_THEMES, defaultTheme));
  }
});

console.log(`\n${passed} tests passed`);
