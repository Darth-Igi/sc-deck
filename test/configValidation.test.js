// Mini-Testsuite ohne Framework: node test/configValidation.test.js
const assert = require("assert");
const { validateConfig } = require("../configValidation");
const { Key } = require("@nut-tree-fork/nut-js");
const fs = require("fs");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}

const widget = (over = {}) => ({ type: "button", id: "w1", label: "W", keys: ["N"], ...over });
const wrap = (widgets) => ({ pages: [{ id: "p", title: "P", panels: [{ id: "pl", title: "PL", widgets }] }] });

test("mitgelieferte config.json ist gültig", () => {
  const cfg = JSON.parse(fs.readFileSync(__dirname + "/../config.json"));
  const { errors } = validateConfig(cfg, Key);
  assert.deepStrictEqual(errors, []);
});

test("gültige Minimal-Config: keine Fehler", () => {
  const { errors } = validateConfig(wrap([widget()]), Key);
  assert.deepStrictEqual(errors, []);
});

test("fehlendes pages-Array wird erkannt", () => {
  assert.ok(validateConfig({}, Key).errors.length > 0);
  assert.ok(validateConfig(null, Key).errors.length > 0);
});

test("leeres pages-Array wird erkannt", () => {
  assert.ok(validateConfig({ pages: [] }, Key).errors.length > 0);
});

test("unbekannter Tastenname wird erkannt", () => {
  const { errors } = validateConfig(wrap([widget({ keys: ["LeftCtrl"] })]), Key);
  assert.ok(errors.some((e) => e.includes('LeftCtrl')));
});

test("gültige Modifier passieren", () => {
  const { errors } = validateConfig(wrap([widget({ keys: ["LeftControl", "LeftAlt", "F5"] })]), Key);
  assert.deepStrictEqual(errors, []);
});

test("doppelte Widget-IDs werden erkannt", () => {
  const { errors } = validateConfig(wrap([widget(), widget({ label: "W2" })]), Key);
  assert.ok(errors.some((e) => e.includes('doppelte ID')));
});

test("unbekannter Widget-Typ wird erkannt", () => {
  const { errors } = validateConfig(wrap([widget({ type: "slider" })]), Key);
  assert.ok(errors.some((e) => e.includes('slider')));
});

test("leere keys werden erkannt", () => {
  const { errors } = validateConfig(wrap([widget({ keys: [] })]), Key);
  assert.ok(errors.length > 0);
});

test("Panel ohne Widgets wird erkannt", () => {
  const cfg = { pages: [{ id: "p", title: "P", panels: [{ id: "pl", widgets: [] }] }] };
  assert.ok(validateConfig(cfg, Key).errors.length > 0);
});

console.log(`\n${passed} Tests bestanden`);
