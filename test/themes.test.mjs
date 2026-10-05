// Mini test suite without a framework: node test/themes.test.mjs
import assert from "assert";
import { readFileSync } from "fs";
import { createRequire } from "module";
import {
  mergeTheme,
  themeChain,
  resolveTheme,
  themeColor,
  logoFor,
  withLogo,
  svgDataUrl,
} from "../src/themes/resolve.js";
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
  nav: ["color", "border", "titleBackground", "titleColor", "counterColor"],
  toggle: ["accent", "onTrack", "offThumb", "trackBorder"],
};
// optional slots: null = "not used / fall back"
const NULLABLE_SLOTS = {
  panel: ["titleMarker", "dividerCaps"],
  nav: ["arrowFill", "titleBorder", "titleMarker"],
  toggle: ["onTrackBorder", "offThumbBorder"],
  art: ["logoColor"],
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

test("real registry: manufacturer fallback and model overrides", () => {
  assert.deepStrictEqual(themeChain("RSI_Apollo_Medivac", SHIP_THEMES), ["RSI"]);
  assert.deepStrictEqual(themeChain("RSI_Aurora_Mk_II", SHIP_THEMES), ["RSI"]);
  assert.deepStrictEqual(themeChain("RSI_Constellation_Andromeda", SHIP_THEMES), ["RSI", "RSI_Constellation"]);
  assert.deepStrictEqual(themeChain("ORIG_M80", SHIP_THEMES), ["ORIG", "ORIG_M80"]);
  assert.deepStrictEqual(themeChain("KRIG_L-22_Alpha_Wolf", SHIP_THEMES), ["KRIG"]);
  // the Constellation must undo the RSI chamfer shapes
  const conny = resolveTheme("RSI_Constellation_Andromeda", SHIP_THEMES, defaultTheme);
  assert.strictEqual(conny.button.corner, "round");
  assert.strictEqual(conny.nav.corner, "round");
  assert.strictEqual(resolveTheme("RSI_Aurora_Mk_II", SHIP_THEMES, defaultTheme).button.corner, "chamfer");
});

test("real session 2026-09-28: every boarded ship lands in its theme", () => {
  // End to end: real Game.log lines -> parser -> vehicleClass -> theme chain.
  // Breaks loudly if a patch renames the channel display names.
  const { createGameLogParser } = createRequire(import.meta.url)("../gamelog.js");
  const fixture = new URL("./fixtures/session-2026-09-28.log", import.meta.url);
  const chains = {};
  const parser = createGameLogParser({
    onEvent: (e) => {
      if (e.type === "vehicle-changed") chains[e.vehicleClass] = themeChain(e.vehicleClass, SHIP_THEMES);
    },
  });
  readFileSync(fixture, "utf-8").split(/\r?\n/).forEach((l) => parser.feedLine(l));
  assert.deepStrictEqual(chains, {
    ORIG_M80: ["ORIG", "ORIG_M80"],
    ORIG_400i: ["ORIG"],
    ANVL_F7A_Hornet_Mk_II: ["ANVL"],
    AEGS_Gladius: ["AEGS"],
    AEGS_Sabre: ["AEGS"],
    CRUS_A1_Spirit: ["CRUS"],
    DRAK_Corsair: ["DRAK"],
    "KRIG_L-21_Wolf": ["KRIG"],
    "KRIG_L-22_Alpha_Wolf": ["KRIG"],
    RSI_Aurora_Mk_II: ["RSI"],
    RSI_Constellation_Andromeda: ["RSI", "RSI_Constellation"],
  });
});

const LOGOS = { ORIG: "orig.svg", ORIG_M80: "m80.svg", ARGO: "argo.svg" };

test("logoFor: longest prefix with a logo file, none without", () => {
  assert.strictEqual(logoFor("ORIG_M80", LOGOS), "m80.svg");
  assert.strictEqual(logoFor("ORIG_400i", LOGOS), "orig.svg");
  assert.strictEqual(logoFor("argo_MOLE", LOGOS), "argo.svg"); // case-insensitive
  assert.strictEqual(logoFor("DRAK_Corsair", LOGOS), null);
  assert.strictEqual(logoFor(null, LOGOS), null);
  assert.strictEqual(logoFor("ORIG_M80", {}), null); // assets folder missing
});

test("withLogo: automatic only while the theme leaves art.logo at null", () => {
  const auto = resolveTheme("ORIG_400i", SHIP_THEMES, defaultTheme);
  assert.strictEqual(auto.art.logo, null, "no theme hard-codes a logo");
  assert.strictEqual(withLogo(auto, "ORIG_400i", LOGOS).art.logo, "orig.svg");
  const off = mergeTheme(auto, { art: { logo: false } });
  assert.strictEqual(withLogo(off, "ORIG_400i", LOGOS).art.logo, false);
  const fixed = mergeTheme(auto, { art: { logo: "custom.svg" } });
  assert.strictEqual(withLogo(fixed, "ORIG_400i", LOGOS).art.logo, "custom.svg");
  assert.strictEqual(withLogo(defaultTheme, null, LOGOS).art.logo, null, "default look: no logo");
});

test("svgDataUrl: encodes quotes and hashes (usable inside url(\"...\"))", () => {
  const url = svgDataUrl('<svg fill="#000"><path d="M0 0"/></svg>');
  assert.ok(url.startsWith("data:image/svg+xml;charset=utf-8,"));
  assert.ok(!/["#<>]/.test(url.slice(url.indexOf(",") + 1)));
});

test("font scale is a positive number in every theme", () => {
  for (const key of [null, ...Object.keys(SHIP_THEMES)]) {
    const s = resolveTheme(key, SHIP_THEMES, defaultTheme).font.scale;
    assert.ok(typeof s === "number" && s > 0, `${key}: font.scale = ${s}`);
  }
});

console.log(`\n${passed} tests passed`);
