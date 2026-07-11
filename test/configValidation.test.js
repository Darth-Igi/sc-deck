// Mini test suite without a framework: node test/configValidation.test.js
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

test("bundled config.json is valid", () => {
  const cfg = JSON.parse(fs.readFileSync(__dirname + "/../config.json"));
  const { errors } = validateConfig(cfg, Key);
  assert.deepStrictEqual(errors, []);
});

test("valid minimal config: no errors", () => {
  const { errors } = validateConfig(wrap([widget()]), Key);
  assert.deepStrictEqual(errors, []);
});

test("missing pages array is detected", () => {
  assert.ok(validateConfig({}, Key).errors.length > 0);
  assert.ok(validateConfig(null, Key).errors.length > 0);
});

test("empty pages array is detected", () => {
  assert.ok(validateConfig({ pages: [] }, Key).errors.length > 0);
});

test("unknown key name is detected", () => {
  const { errors } = validateConfig(wrap([widget({ keys: ["LeftCtrl"] })]), Key);
  assert.ok(errors.some((e) => e.includes("LeftCtrl")));
});

test("valid modifiers pass", () => {
  const { errors } = validateConfig(wrap([widget({ keys: ["LeftControl", "LeftAlt", "F5"] })]), Key);
  assert.deepStrictEqual(errors, []);
});

test("duplicate widget IDs are detected", () => {
  const { errors } = validateConfig(wrap([widget(), widget({ label: "W2" })]), Key);
  assert.ok(errors.some((e) => e.includes("duplicate ID")));
});

test("unknown widget type is detected", () => {
  const { errors } = validateConfig(wrap([widget({ type: "slider" })]), Key);
  assert.ok(errors.some((e) => e.includes("slider")));
});

test("empty keys are detected", () => {
  const { errors } = validateConfig(wrap([widget({ keys: [] })]), Key);
  assert.ok(errors.length > 0);
});

test("panel without widgets is detected", () => {
  const cfg = { pages: [{ id: "p", title: "P", panels: [{ id: "pl", widgets: [] }] }] };
  assert.ok(validateConfig(cfg, Key).errors.length > 0);
});

console.log(`\n${passed} tests passed`);
