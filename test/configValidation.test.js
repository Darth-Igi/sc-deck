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

test("hold: valid on buttons (keys/holdMs/label optional)", () => {
  assert.deepStrictEqual(validateConfig(wrap([widget({ hold: {} })]), Key).errors, []);
  const full = widget({ hold: { keys: ["LeftAlt", "F5"], holdMs: 800, label: "MIN" } });
  assert.deepStrictEqual(validateConfig(wrap([full]), Key).errors, []);
});

test("hold: rejected on toggles, bad keys/holdMs/label detected", () => {
  const onToggle = widget({ type: "toggle", hold: {} });
  assert.ok(validateConfig(wrap([onToggle]), Key).errors.some((e) => e.includes("only supported on buttons")));
  const errs = (hold) => validateConfig(wrap([widget({ hold })]), Key).errors;
  assert.ok(errs([]).some((e) => e.includes('"hold" must be an object')));
  assert.ok(errs({ keys: [] }).some((e) => e.includes("hold.keys")));
  assert.ok(errs({ keys: ["LeftCtrl"] }).some((e) => e.includes("LeftCtrl")));
  assert.ok(errs({ holdMs: -1 }).some((e) => e.includes("hold.holdMs")));
  assert.ok(errs({ holdMs: 99999 }).some((e) => e.includes("hold.holdMs")));
  assert.ok(errs({ holdMs: 1.5 }).some((e) => e.includes("hold.holdMs")));
  assert.ok(errs({ label: 3 }).some((e) => e.includes("hold.label")));
});

test("panel rows/columns must be whole numbers >= 1", () => {
  const panel = (over) => ({ pages: [{ id: "p", title: "P", panels: [{ id: "pl", widgets: [widget()], ...over }] }] });
  assert.deepStrictEqual(validateConfig(panel({ rows: 3 }), Key).errors, []);
  assert.deepStrictEqual(validateConfig(panel({ columns: 2 }), Key).errors, []);
  assert.ok(validateConfig(panel({ rows: 0 }), Key).errors.some((e) => e.includes('"rows"')));
  assert.ok(validateConfig(panel({ rows: "3" }), Key).errors.some((e) => e.includes('"rows"')));
  assert.ok(validateConfig(panel({ columns: 1.5 }), Key).errors.some((e) => e.includes('"columns"')));
});

console.log(`\n${passed} tests passed`);
