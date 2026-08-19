/**
 * The three shapes the Spacing panel needs from the generator, and Márton's decisions behind them.
 *
 * `@Linear Ramp` translates a config's per-mode block into scale options; these are the additions that
 * let the panel's fields land somewhere real:
 *
 *   1. **Fibonacci**, because his frame's "1.618 Golden ratio" values *are* Fibonacci and stay whole.
 *   2. **Round numbers to, per mode** — the frames were right and the config was wrong.
 *   3. **Extra spacings merged by value**, with token names positional and independent.
 *
 * Loaded the way a script loads them: the ramp's calls resolve in its consumer's context.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function load() {
  const dir = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');
  const src = ['@math-helpers.js', '@bezier.js', '@scale-models.js', '@linear-ramp.js']
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
  return new Function('figma', 'console', 'window',
    src + '; return { scaleSequence: scaleSequence, scaleModelNames: scaleModelNames,' +
    ' rampExtras: rampExtras, mergeRampExtras: mergeRampExtras, rampModelOf: rampModelOf,' +
    ' buildRampScaleOpts: typeof buildRampScaleOpts === "function" ? buildRampScaleOpts : null };'
  )({}, { log() {}, warn() {}, error() {} }, {});
}

const L = load();
const SPEC = { tokensKey: 'spacings', sizesKey: 'spacingSizes' };

test('fibonacci is a model, and it is the sequence Márton drew', () => {
  assert.ok(L.scaleModelNames().includes('fibonacci'));
  const out = L.scaleSequence('fibonacci', {
    steps: 10, min: 0, baseIndex: 0, baseValue: 4, step: 4, tokens: new Array(10).fill('t'),
  });
  assert.deepEqual(out.values, [4, 8, 12, 20, 32, 52, 84, 136, 220, 356]);
  assert.deepEqual(out.warnings, [], 'and it needs no rounding to get there');
  // Every value whole, which is the practical reason to offer it at all.
  out.values.forEach((v) => assert.equal(v, Math.round(v)));
});

test('fibonacci refuses without a step, and says what a step is', () => {
  const out = L.scaleSequence('fibonacci', {
    steps: 6, min: 0, baseIndex: 0, baseValue: 4, tokens: new Array(6).fill('t'),
  });
  assert.deepEqual(out.values, []);
  assert.equal(out.warnings[0].code, 'scale-step-required');
  assert.match(out.warnings[0].message, /first increment/);
});

test('extras merge by value, so one can land mid-scale', () => {
  // Márton: "I might need to prepend a 16, where the generated scale is 8, 12, 20… and I need an
  // intermittent step." Which is why "prepend" is the wrong word for what it does.
  assert.deepEqual(L.mergeRampExtras([8, 12, 20, 32], [16]), [8, 12, 16, 20, 32]);
  assert.deepEqual(L.mergeRampExtras([4, 8, 12], [0, 1, 2]), [0, 1, 2, 4, 8, 12]);
  assert.deepEqual(L.mergeRampExtras([4, 8], []), [4, 8], 'no extras, no change');
});

test('extras are cleaned before they are merged', () => {
  assert.deepEqual(L.rampExtras({ extras: [2, 0, 1] }), [0, 1, 2], 'sorted');
  assert.deepEqual(L.rampExtras({ extras: [4, 4, 8] }), [4, 8], 'deduplicated');
  assert.deepEqual(L.rampExtras({ extras: ['12', 'nonsense', null] }), [12], 'numbers only');
  assert.deepEqual(L.rampExtras({}), []);
});

test('the model reads either spelling', () => {
  // The panel writes `scaleType` because that is the label on screen; the config has always had
  // `model`. One of them being the truth and the other silently ignored is the failure to avoid.
  assert.equal(L.rampModelOf({ model: 'metric' }), 'metric');
  assert.equal(L.rampModelOf({ scaleType: 'fibonacci' }), 'fibonacci');
  assert.equal(L.rampModelOf({}), 'endpoints', 'and the old default stands');
});

test('a mode rounds to its own grid, falling back to the config', () => {
  // The frames put "Round numbers to" inside Mode settings and the config had it at the top level.
  // Márton's call: per mode. A 4px desktop grid with a 2px mobile one is the ordinary case.
  const ramp = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'
  );
  const opts = ramp.slice(ramp.indexOf('function buildRampScaleOpts'), ramp.indexOf('function rampExtras'));
  assert.match(opts, /typeof sizes\.roundTo === 'number' && sizes\.roundTo > 0\s*\n?\s*\?\s*sizes\.roundTo/,
    "the mode's own grid wins");
  assert.match(opts, /:\s*getRampRoundGrid\(config\)/, 'and the config-level one is the fallback');
});

test('a numeric base means the base is where the extras stop', () => {
  // The panel shows one "Base unit" number, not a `{ level, size }` pair — and with extras filling the
  // smallest names, nothing has to say where the base sits: it is the first generated token.
  const ramp = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'
  );
  const opts = ramp.slice(ramp.indexOf('function buildRampScaleOpts'), ramp.indexOf('function rampExtras'));
  assert.match(opts, /if \(typeof sizes\.base === 'number'\)/);
  assert.match(opts, /baseIndex = 0;/);
  // And the object form still works, because configs written last week must keep working.
  assert.match(opts, /tokens\.indexOf\(sizes\.base\.level\)/);
  assert.match(opts, /generatedSteps = Math\.max\(1, totalSteps - extras\.length\)/,
    'each extra takes a step from the generated part');
});
