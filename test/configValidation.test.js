// Mini test suite without a framework: node test/configValidation.test.js
const assert = require("assert");
const { validateConfig } = require("../configValidation");
const { SCANCODE_KEY_NAMES: Key } = require("../scancodeSender");
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

test("accent: role names and CSS colors pass, non-strings fail", () => {
  assert.deepStrictEqual(validateConfig(wrap([widget({ accent: "danger" })]), Key).errors, []);
  assert.deepStrictEqual(validateConfig(wrap([widget({ accent: "#ff4d4d" })]), Key).errors, []);
  assert.ok(validateConfig(wrap([widget({ accent: 42 })]), Key).errors.some((e) => e.includes("accent")));
  assert.ok(validateConfig(wrap([widget({ accent: " " })]), Key).errors.some((e) => e.includes("accent")));
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

test("valid gamelog section passes", () => {
  const cfg = { ...wrap([widget()]), gamelog: { enabled: true, path: "C:\\x\\Game.log", pollMs: 500 } };
  assert.deepStrictEqual(validateConfig(cfg, Key).errors, []);
});

test("gamelog with invalid types is detected", () => {
  const cfg = { ...wrap([widget()]), gamelog: { enabled: "yes", pollMs: 10 } };
  const { errors } = validateConfig(cfg, Key);
  assert.ok(errors.some((e) => e.includes("gamelog.enabled")));
  assert.ok(errors.some((e) => e.includes("gamelog.pollMs")));
});

test("gamelog with broken regex pattern is detected", () => {
  const cfg = { ...wrap([widget()]), gamelog: { enabled: true, patterns: { zoneEnter: "([unclosed" } } };
  const { errors } = validateConfig(cfg, Key);
  assert.ok(errors.some((e) => e.includes("zoneEnter")));
});

test('non-boolean "initial" produces a warning', () => {
  const cfg = wrap([widget({ type: "toggle", initial: "false" })]);
  const { errors, warnings } = validateConfig(cfg, Key);
  assert.deepStrictEqual(errors, []); // warning only, not an error
  assert.ok(warnings.some((w) => w.includes('"initial"')));
  // proper booleans stay silent
  const ok = validateConfig(wrap([widget({ type: "toggle", initial: false })]), Key);
  assert.ok(!ok.warnings.some((w) => w.includes('"initial"')));
});

test("prototype members are not valid key names", () => {
  // `in` would accept "toString" via the prototype chain - hasOwnProperty
  // must reject it (same guard exists in main.js doSendKeys)
  const { errors } = validateConfig(wrap([widget({ keys: ["toString"] })]), Key);
  assert.ok(errors.some((e) => e.includes("toString")));
});

console.log(`\n${passed} tests passed`);
