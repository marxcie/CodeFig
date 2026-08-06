/**
 * Fixture tests for resolveModeValues in scripts/CODEFIG_LIBRARIES/@variables.js.
 *
 * `processVariables` used to gate each mode's value on truthiness, so `0` and `""` were
 * dropped before they reached `createOrUpdateVariable` — which is itself careful and checks
 * `!== undefined`. A spacing or radius token could therefore never be changed *to* zero: the
 * write was skipped and the old value stayed, with nothing logged. It only looked correct
 * because a newly created FLOAT variable is already 0.
 *
 * The block is a top-level function now so the resolution rule can be tested without Figma —
 * and, since @import can only extract top-level declarations, so it is importable at all.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');

const VARIABLES = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@variables.js');

function loadResolveModeValues() {
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, String, Array, Object, JSON };
  vm.createContext(ctx);
  const map = resolver.extractFunctionMap(fs.readFileSync(VARIABLES, 'utf8'));
  const code = map.get('resolveModeValues');
  assert.ok(code, 'resolveModeValues is not extractable from @variables.js');
  vm.runInContext(code, ctx);
  return ctx.resolveModeValues;
}

const resolveModeValues = loadResolveModeValues();

const MODES = ['mobile', 'tablet', 'desktop'];

test('a value of 0 resolves to 0', () => {
  // The regression. Truthiness dropped this, so "set this token to zero" did nothing.
  const values = resolveModeValues({ values: { desktop: 0 } }, MODES, {});
  assert.ok(Object.prototype.hasOwnProperty.call(values, 'desktop'));
  assert.strictEqual(values.desktop, 0);
});

test('an empty string resolves to an empty string', () => {
  const values = resolveModeValues({ values: { desktop: '' } }, MODES, {});
  assert.strictEqual(values.desktop, '');
});

test('false resolves to false', () => {
  const values = resolveModeValues({ values: { desktop: false } }, MODES, {});
  assert.strictEqual(values.desktop, false);
});

test('a mode with no entry is absent from the result, not undefined', () => {
  // createOrUpdateVariable skips on `!== undefined`, so an explicit undefined would be
  // equivalent — but an absent key is what the rest of the code reads as "no value".
  const values = resolveModeValues({ values: { desktop: 8 } }, MODES, {});
  assert.deepEqual(Object.keys(values), ['desktop']);
  assert.equal(Object.prototype.hasOwnProperty.call(values, 'mobile'), false);
});

test('a variable with no values at all resolves to nothing', () => {
  assert.deepEqual(resolveModeValues({ type: 'FLOAT' }, MODES, {}), {});
});

test('modes not asked for are ignored even when the config has them', () => {
  const values = resolveModeValues({ values: { mobile: 4, wide: 32 } }, MODES, {});
  assert.deepEqual(values, { mobile: 4 });
});

test('a function value is called with the config values', () => {
  const seen = [];
  const values = resolveModeValues(
    { values: { tablet: function (config) { seen.push(config); return config.base * 2; } } },
    MODES,
    { base: 6 }
  );
  assert.strictEqual(values.tablet, 12);
  assert.deepEqual(seen, [{ base: 6 }]);
});

test('a function value returning 0 resolves to 0', () => {
  const values = resolveModeValues({ values: { desktop: function () { return 0; } } }, MODES, {});
  assert.strictEqual(values.desktop, 0);
});

test('a function value that throws rethrows', () => {
  // Matching current behaviour: processVariables catches it per variable and counts a skip.
  assert.throws(
    () => resolveModeValues({ values: { desktop: function () { throw new Error('bad scale'); } } }, MODES, {}),
    /bad scale/
  );
});
