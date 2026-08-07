/**
 * The four scale models: endpoints, modular, metric, explicit.
 *
 * `@Scale Models` turns a description of a scale into a sequence of numbers, and does nothing
 * else — no viewports, no rounding, no variables, no Figma. That boundary is what lets these
 * tests be plain arithmetic anyone can check by hand, which matters because the whole point of
 * naming the models is that a designer can predict what they will produce.
 *
 * The load-bearing case is monotonicity **before rounding**. The ramp bumps a step that lands on
 * or below its predecessor, so a model that generates a flat or backwards sequence would be
 * silently patched over downstream and never look broken.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');

const LIBS = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');

function loadInto(ctx, file) {
  const source = fs.readFileSync(path.join(LIBS, file), 'utf8');
  for (const table of source.match(/^var [A-Z][A-Z0-9_]* = \{[\s\S]*?\n\};/gm) || []) {
    vm.runInContext(table, ctx);
  }
  for (const [, code] of resolver.extractFunctionMap(source)) {
    vm.runInContext(code, ctx);
  }
}

function loadModels() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, String, Array, Object, JSON, isNaN, isFinite, parseInt, parseFloat, Number, RegExp
  };
  vm.createContext(ctx);
  loadInto(ctx, '@math-helpers.js');
  assert.ok(fs.existsSync(path.join(LIBS, '@scale-models.js')), '@scale-models.js does not exist yet');
  loadInto(ctx, '@scale-models.js');
  return ctx;
}

const lib = loadModels();
const { scaleSequence, modularRatios, resolveModularRatio } = lib;

const values = (result) => result.values;
const codes = (result) => result.warnings.map((w) => w.code);

// ---------------------------------------------------------------------------
// metric — the model a design system doc actually describes
// ---------------------------------------------------------------------------

test('metric is a base plus a step that grows every few tokens', () => {
  // "4, 8, 12, 16, 24, 32" — a base of 4, a step of 4, growing every third token. This is the
  // sequence people write down, and the reason metric becomes the default.
  const result = scaleSequence('metric', { steps: 6, min: 4, base: 4, baseIndex: 0, step: 4, mod: 3 });
  assert.deepEqual(values(result), [4, 8, 12, 16, 24, 32]);
  assert.deepEqual(result.warnings, []);
});

test('metric grows its increment exactly every `mod` steps', () => {
  const result = scaleSequence('metric', { steps: 8, min: 16, base: 16, baseIndex: 0, step: 4, mod: 3 });
  assert.deepEqual(values(result), [16, 20, 24, 28, 36, 44, 52, 64]);
});

test('metric below the base subtracts a flat step', () => {
  const result = scaleSequence('metric', { steps: 5, min: 0, base: 16, baseIndex: 2, step: 4, mod: 3 });
  assert.deepEqual(values(result), [8, 12, 16, 20, 24]);
});

test('one step held at the floor is a note, not a warning', () => {
  // A base part-way up the token list puts the step below it under the minimum, and the minimum
  // is there to catch it. That is the config working, so it reads in the summary rather than
  // interrupting.
  const result = scaleSequence('metric', { steps: 4, min: 8, base: 16, baseIndex: 3, step: 4, mod: 3, tokens: ['xs', 'sm', 'md', 'lg'] });
  assert.deepEqual(values(result), [8, 8, 12, 16]);
  assert.deepEqual(codes(result), ['scale-floor-held']);
  assert.match(result.warnings[0].message, /xs held at the minimum of 8\./);
});

test('several steps flattened onto the floor is a warning', () => {
  // Now the model and the token list disagree about how many steps sit below the base, and three
  // tokens sharing one number is worth interrupting for.
  const result = scaleSequence('metric', { steps: 5, min: 10, base: 16, baseIndex: 4, step: 4, mod: 3, tokens: ['a', 'b', 'c', 'd', 'e'] });
  assert.deepEqual(values(result), [10, 10, 10, 12, 16]);
  assert.deepEqual(codes(result), ['scale-floored']);
  assert.match(result.warnings[0].message, /3 steps land below the minimum of 10/);
  assert.match(result.warnings[0].message, /a, b, c/);
});

// ---------------------------------------------------------------------------
// modular — unclamped, the top comes out of the ratio
// ---------------------------------------------------------------------------

test('modular multiplies by its ratio above the base and divides below', () => {
  const result = scaleSequence('modular', { steps: 5, min: 0, base: 16, baseIndex: 2, ratio: 1.25 });
  assert.deepEqual(values(result).map((v) => Math.round(v * 100) / 100), [10.24, 12.8, 16, 20, 25]);
});

test('modular produces the numbers designers recognise', () => {
  // 16 → 20 → 25 → 31.25, from the shipped rounded table rather than equal temperament.
  const result = scaleSequence('modular', { steps: 4, min: 0, base: 16, baseIndex: 0, ratio: 'majorThird' });
  assert.deepEqual(values(result).map((v) => Math.round(v * 100) / 100), [16, 20, 25, 31.25]);
});

test('the two ratio tables agree, so neither can drift', () => {
  // @Math Helpers keeps its own copy for generateScale, which the endpoints path delegates to.
  // Two tables of the same numbers is exactly the drift that cost 916 lines to undo elsewhere,
  // so they are pinned together here.
  const table = modularRatios();
  for (const name of Object.keys(table)) {
    assert.equal(lib.getModularScaleRatio(name), table[name], name);
  }
});

test('the ratio table is the shipped one, not equal temperament', () => {
  // Revaluing these names would move scales people already have. Equal temperament, if it ever
  // arrives, is an explicit tuning option in plan 20 — never a silent revaluation.
  assert.equal(resolveModularRatio('majorThird'), 1.25);
  assert.equal(resolveModularRatio('perfectFifth'), 1.5);
  assert.equal(resolveModularRatio('phi'), 1.618);
  assert.notEqual(resolveModularRatio('majorThird'), Math.pow(2, 4 / 12));
  assert.ok(Object.keys(modularRatios()).length >= 8);
});

test('a numeric ratio is accepted, which is how you get an exact value', () => {
  assert.equal(resolveModularRatio(1.2599), 1.2599);
  const result = scaleSequence('modular', { steps: 3, min: 0, base: 10, baseIndex: 0, ratio: 2 });
  assert.deepEqual(values(result), [10, 20, 40]);
});

test('an unknown ratio name is refused, not guessed at', () => {
  const result = scaleSequence('modular', { steps: 3, min: 0, base: 10, baseIndex: 0, ratio: 'sixthish' });
  assert.deepEqual(values(result), []);
  assert.ok(codes(result).includes('scale-ratio-unknown'));
});

test('modular ignores max, and says so', () => {
  // The top comes out of the ratio. Enforcing a max would change the ratio, which is the one
  // property a modular scale promises to hold.
  const withMax = scaleSequence('modular', { steps: 4, min: 0, base: 16, baseIndex: 0, ratio: 1.25, max: 20 });
  const without = scaleSequence('modular', { steps: 4, min: 0, base: 16, baseIndex: 0, ratio: 1.25 });
  assert.deepEqual(values(withMax), values(without));
  assert.ok(codes(withMax).includes('scale-max-ignored'));
  assert.deepEqual(codes(without), []);
});

test('a clamp warns rather than squashes, naming both numbers', () => {
  const result = scaleSequence('modular', {
    steps: 4, min: 0, base: 16, baseIndex: 0, ratio: 1.25, clamp: 24,
    tokens: ['sm', 'md', 'lg', 'xl']
  });
  assert.deepEqual(values(result).map((v) => Math.round(v * 100) / 100), [16, 20, 25, 31.25]);
  const warning = result.warnings.find((w) => w.code === 'scale-clamp-exceeded');
  assert.ok(warning);
  // Both numbers: where it left the budget (which step to drop) and where it ends up (what you
  // would have to raise the clamp to).
  assert.match(warning.message, /24/, 'the clamp');
  assert.match(warning.message, /lg \(25\)/, 'where it first passed');
  assert.match(warning.message, /31\.25 at xl/, 'and where it ends up');
  assert.equal(warning.clamp, 24);
  assert.equal(warning.top, 31.25);
});

// ---------------------------------------------------------------------------
// explicit — your numbers, untouched
// ---------------------------------------------------------------------------

test('explicit returns exactly what it was given', () => {
  const result = scaleSequence('explicit', { steps: 4, min: 0, values: [3, 7, 13, 29] });
  assert.deepEqual(values(result), [3, 7, 13, 29]);
  assert.deepEqual(result.warnings, []);
});

test('explicit is never rounded and never floored', () => {
  // The numbers you typed are the numbers you get: rounding a hand-nudged table is the silent
  // value change 19c's exact-fit rule exists to prevent.
  const result = scaleSequence('explicit', { steps: 3, min: 10, roundTo: 8, values: [1.5, 2.5, 3.5] });
  assert.deepEqual(values(result), [1.5, 2.5, 3.5]);
});

test('explicit refuses a length that does not match the token count', () => {
  const result = scaleSequence('explicit', { steps: 4, min: 0, values: [1, 2] });
  assert.deepEqual(values(result), []);
  assert.ok(codes(result).includes('scale-explicit-length'));
});

test('a non-monotonic explicit table is reported but not corrected', () => {
  const result = scaleSequence('explicit', { steps: 3, min: 0, values: [10, 4, 20] });
  assert.deepEqual(values(result), [10, 4, 20], 'the user decided');
  assert.ok(codes(result).includes('scale-not-monotonic'));
});

// ---------------------------------------------------------------------------
// endpoints — the current behaviour, with a name
// ---------------------------------------------------------------------------

test('endpoints is literally the old code path', () => {
  const opts = {
    steps: 6, min: 1, max: 200, type: 'sine', ease: 'in', rangeMode: 'full',
    baseIndex: 3, baseValue: 14, roundTo: 2, defaultRangeMode: 'full'
  };
  assert.deepEqual(values(scaleSequence('endpoints', opts)), lib.generateScale(opts));
});

test('endpoints honours max, because in that model max is the top', () => {
  const result = scaleSequence('endpoints', {
    steps: 4, min: 4, max: 40, type: 'linear', ease: 'none', baseIndex: 1, baseValue: 8
  });
  assert.equal(values(result)[0], 4);
  assert.equal(values(result)[3], 40);
  assert.ok(!codes(result).includes('scale-max-ignored'));
});

// ---------------------------------------------------------------------------
// Shared rules
// ---------------------------------------------------------------------------

test('min is required in every model', () => {
  for (const model of ['endpoints', 'modular', 'metric', 'explicit']) {
    const result = scaleSequence(model, { steps: 3, base: 16, baseIndex: 0, ratio: 1.25, step: 4, mod: 3, values: [1, 2, 3] });
    assert.ok(codes(result).includes('scale-min-required'), model + ' accepted a missing min');
  }
});

test('an unknown model is refused rather than defaulted', () => {
  const result = scaleSequence('logarithmic', { steps: 3, min: 1 });
  assert.deepEqual(values(result), []);
  assert.ok(codes(result).includes('scale-model-unknown'));
});

test('every generated model is monotonic before rounding', () => {
  // The load-bearing one. The ramp bumps a step that lands on or below its predecessor, so a
  // model that generates a flat or backwards sequence would be patched over downstream and never
  // look broken. `explicit` is exempt: those numbers are the user's.
  const cases = [
    ['metric', { steps: 9, min: 0, base: 4, baseIndex: 0, step: 4, mod: 3 }],
    ['metric', { steps: 9, min: 0, base: 24, baseIndex: 4, step: 2, mod: 2 }],
    ['modular', { steps: 9, min: 0, base: 16, baseIndex: 4, ratio: 'minorSecond' }],
    ['modular', { steps: 9, min: 0, base: 16, baseIndex: 0, ratio: 1.02 }],
    ['modular', { steps: 9, min: 0, base: 100, baseIndex: 8, ratio: 'phi' }],
    ['endpoints', { steps: 9, min: 1, max: 200, type: 'sine', ease: 'in', baseIndex: 4, baseValue: 20 }]
  ];
  for (const [model, options] of cases) {
    const sequence = values(scaleSequence(model, options));
    assert.equal(sequence.length, options.steps, model + ' produced the wrong length');
    for (let i = 1; i < sequence.length; i++) {
      assert.ok(
        sequence[i] >= sequence[i - 1],
        `${model} went backwards at step ${i}: ${JSON.stringify(sequence)}`
      );
    }
  }
});

test('a single-step scale is the base, in every model', () => {
  assert.deepEqual(values(scaleSequence('modular', { steps: 1, min: 0, base: 16, baseIndex: 0, ratio: 1.25 })), [16]);
  assert.deepEqual(values(scaleSequence('metric', { steps: 1, min: 0, base: 16, baseIndex: 0, step: 4, mod: 3 })), [16]);
});

test('zero steps is an empty scale, not a crash', () => {
  for (const model of ['endpoints', 'modular', 'metric', 'explicit']) {
    assert.deepEqual(values(scaleSequence(model, { steps: 0, min: 0, base: 1, ratio: 1.25, step: 1, mod: 1, values: [] })), []);
  }
});

test('the library knows nothing about Figma, viewports or variables', () => {
  const source = fs.readFileSync(path.join(LIBS, '@scale-models.js'), 'utf8');
  const body = source.slice(source.indexOf('// @DOC_END'));
  for (const forbidden of ['figma.', 'viewport', 'variable', 'collection']) {
    assert.equal(
      body.toLowerCase().indexOf(forbidden),
      -1,
      `@scale-models.js mentions "${forbidden}" — the boundary is size sequences and nothing else`
    );
  }
});
