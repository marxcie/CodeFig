/**
 * `validatePanelKeyParity` — the key-parity gate from `.plans/31-panel-spec-json.md`. A no-op
 * against the real repo today (no shipped script has a `@PANEL_START` block yet), so exercised
 * here against synthetic script objects shaped like `findAllScripts` produces.
 */
const test = require('node:test');
const assert = require('node:assert');

const { validatePanelKeyParity } = require('../validate-scripts.js');

function scriptWith(code) {
  return { name: 'Test Script', code };
}

test('a script with no @PANEL_START is skipped entirely', () => {
  const errors = validatePanelKeyParity([scriptWith('// @CONFIG_START\n  a: 1,\n// @CONFIG_END')]);
  assert.deepStrictEqual(errors, []);
});

test('matching keys on both sides produce no errors', () => {
  const code = [
    '// @PANEL_START',
    '// { blocks: [ { key: "a", type: "number", label: "A" } ] }',
    '// @PANEL_END',
    '// @CONFIG_START',
    '  a: 1,',
    '// @CONFIG_END',
  ].join('\n');
  assert.deepStrictEqual(validatePanelKeyParity([scriptWith(code)]), []);
});

test('a value with no field is an error', () => {
  const code = [
    '// @PANEL_START',
    '// { blocks: [ { key: "a", type: "number", label: "A" } ] }',
    '// @PANEL_END',
    '// @CONFIG_START',
    '  a: 1,',
    '  b: 2,',
    '// @CONFIG_END',
  ].join('\n');
  const errors = validatePanelKeyParity([scriptWith(code)]);
  assert.ok(errors.some((e) => /"b" has a value/.test(e.message)));
});

test('a field with no value is an error', () => {
  const code = [
    '// @PANEL_START',
    '// { blocks: [ { key: "a", type: "number", label: "A" }, { key: "b", type: "number", label: "B" } ] }',
    '// @PANEL_END',
    '// @CONFIG_START',
    '  a: 1,',
    '// @CONFIG_END',
  ].join('\n');
  const errors = validatePanelKeyParity([scriptWith(code)]);
  assert.ok(errors.some((e) => /"b" is a field/.test(e.message)));
});

test('an unreadable @PANEL_START is reported rather than thrown', () => {
  const code = [
    '// @PANEL_START',
    '// { not json',
    '// @PANEL_END',
    '// @CONFIG_START',
    '  a: 1,',
    '// @CONFIG_END',
  ].join('\n');
  const errors = validatePanelKeyParity([scriptWith(code)]);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /unreadable @PANEL_START/);
});
