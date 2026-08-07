/**
 * Recognising a scale from its numbers.
 *
 * The headline is the **closed loop**: generate a set from a config, recognise it, and assert the
 * recorded config is the config that generated it. No fixtures to maintain, and it fails the
 * moment the generator and the recogniser drift apart — which is the one failure adoption is built
 * to make impossible. A recogniser that can claim something the generator will not honour is a
 * tool that lies about what it found.
 *
 * That is also why every candidate is *verified by generating*: recognition derives parameters
 * from the values, then feeds them back through `scaleSequence` and only accepts an exact match.
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
  loadInto(ctx, '@scale-models.js');
  return ctx;
}

const lib = loadModels();
const { scaleSequence, recogniseScale } = lib;

/** Generate from a config, then recognise what came out. */
function roundTrip(model, options) {
  const generated = scaleSequence(model, options);
  assert.equal(generated.values.length, options.steps, 'the generator produced nothing to recognise');
  return { values: generated.values, found: recogniseScale(generated.values) };
}

// ---------------------------------------------------------------------------
// The closed loop
// ---------------------------------------------------------------------------

test('metric: whatever the generator makes, the recogniser names', () => {
  for (const base of [2, 4, 16]) {
    for (const step of [1, 2, 4]) {
      for (const mod of [1, 2, 3]) {
        for (const steps of [4, 6, 8]) {
          const options = { steps, min: 0, baseValue: base, baseIndex: 0, step, mod };
          const { values, found } = roundTrip('metric', options);
          const label = `metric base ${base} step ${step} mod ${mod} × ${steps} → ${values.join(',')}`;

          assert.equal(found.model, 'metric', label);
          assert.ok(found.exact, label);
          assert.equal(found.options.step, step, label);
          assert.equal(found.options.baseValue, base, label);
          // `mod` only means something once the increment has had a chance to grow.
          if (steps > mod + 1) assert.equal(found.options.mod, mod, label);

          // And the recorded config regenerates the same numbers.
          assert.deepEqual(scaleSequence('metric', found.options).values, values, label);
        }
      }
    }
  }
});

test('modular: whatever the generator makes, the recogniser names', () => {
  for (const ratio of ['minorSecond', 'majorSecond', 'majorThird', 'perfectFifth', 'phi']) {
    for (const base of [4, 16]) {
      for (const steps of [4, 6]) {
        const options = { steps, min: 0, baseValue: base, baseIndex: 0, ratio };
        const { values, found } = roundTrip('modular', options);
        const label = `modular ${ratio} base ${base} × ${steps} → ${values.join(',')}`;

        assert.equal(found.model, 'modular', label);
        assert.ok(found.exact, label);
        assert.equal(found.options.ratio, ratio, 'the name, not the raw number: ' + label);
        assert.equal(found.options.baseValue, base, label);
        assert.deepEqual(scaleSequence('modular', found.options).values, values, label);
      }
    }
  }
});

test("the shipped default's own output is recognised as the scale that made it", () => {
  // 1, 4, 8, 12, 16, 24 — `px` held at the minimum because the model would put it below. Deriving
  // the step from the first difference gives 3 and fails; the floor-held retry is what saves it.
  // Failing here would mean CodeFig cannot recognise a scale it generated itself.
  const options = { steps: 6, min: 1, baseValue: 4, baseIndex: 1, step: 4, mod: 3 };
  const { values, found } = roundTrip('metric', options);

  assert.deepEqual(values, [1, 4, 8, 12, 16, 24]);
  assert.equal(found.model, 'metric');
  assert.ok(found.exact, 'the most common case in the product must not record as explicit');
  assert.equal(found.options.min, 1);
  assert.equal(found.options.baseValue, 4);
  assert.equal(found.options.baseIndex, 1, 'counted from the full list, not the remainder');
  assert.equal(found.options.step, 4);
  assert.deepEqual(scaleSequence('metric', found.options).values, values);
});

test('two leading tokens held at the floor are still recognised', () => {
  const options = { steps: 6, min: 2, baseValue: 4, baseIndex: 2, step: 4, mod: 3 };
  const { values, found } = roundTrip('metric', options);
  assert.deepEqual(values, [2, 2, 4, 8, 12, 16]);
  assert.equal(found.model, 'metric');
  assert.ok(found.exact);
  assert.equal(found.options.baseIndex, 2);
  assert.deepEqual(scaleSequence('metric', found.options).values, values);
});

// ---------------------------------------------------------------------------
// What it refuses to claim
// ---------------------------------------------------------------------------

test('one value off by one records explicit, and names the deviation', () => {
  const nudged = [4, 8, 12, 16, 25, 32];
  const found = recogniseScale(nudged);

  assert.equal(found.model, 'explicit');
  assert.ok(!found.exact);
  assert.deepEqual(found.options.values, nudged, 'recorded exactly as found');
  assert.ok(found.suggestion, 'and the closest fit is offered');
  assert.equal(found.suggestion.model, 'metric');
  assert.equal(found.suggestion.deviations.length, 1);
  assert.deepEqual(found.suggestion.deviations[0], { index: 4, expected: 24, found: 25 });
});

test('a scale that fits nothing records explicit with no suggestion worth making', () => {
  const found = recogniseScale([3, 7, 13, 29, 31]);
  assert.equal(found.model, 'explicit');
  assert.deepEqual(found.options.values, [3, 7, 13, 29, 31]);
});

test('a flat tail records explicit, because no generator produces one', () => {
  // A clamp only warns, and the monotonic guard lives in the ramp — neither is reproducible by
  // the generator recognition verifies against, so a trailing repeat can never verify exactly.
  const found = recogniseScale([4, 8, 12, 16, 16, 16]);
  assert.equal(found.model, 'explicit');
  assert.match(found.note || '', /repeat/i);
});

test('duplicate values anywhere record explicit', () => {
  assert.equal(recogniseScale([4, 8, 8, 16]).model, 'explicit');
});

test('a descending sequence records explicit and says so', () => {
  const found = recogniseScale([16, 12, 8, 4]);
  assert.equal(found.model, 'explicit');
  assert.match(found.note || '', /down/i);
});

// ---------------------------------------------------------------------------
// Exactness, and the one representation detail
// ---------------------------------------------------------------------------

test('floating point is not a tolerance', () => {
  // 16 × 1.25 × 1.25 is 24.999999999999996. Comparing to a fixed number of decimal places is a
  // representation detail; anything wider would be a tolerance, and every value a tolerance
  // swallows is a value the tool moved without being asked.
  // `majorThird` is 1.25 — a power-of-two fraction, so it multiplies exactly and carries no error
  // at all. `minorSecond` at 1.067 does: 16 → 17.072 → 18.215823999999998.
  const values = scaleSequence('modular', { steps: 4, min: 0, baseValue: 16, baseIndex: 0, ratio: 'minorSecond' }).values;
  assert.notEqual(values[2], 18.215824, 'the fixture really does carry the float error');
  assert.ok(recogniseScale(values).exact, 'and it is still recognised');

  // A whole pixel out is not a rounding artefact.
  assert.ok(!recogniseScale([16, 20, 26, 31.25]).exact);
});

test('a linear ramp is recognised; a curve is not guessed at', () => {
  const linear = scaleSequence('endpoints', { steps: 5, min: 4, max: 20, type: 'linear', ease: 'none' }).values;
  assert.deepEqual(linear, [4, 8, 12, 16, 20]);
  const found = recogniseScale(linear);
  assert.ok(found.exact, 'an even ramp is a scale like any other');

  const curved = scaleSequence('endpoints', { steps: 6, min: 1, max: 200, type: 'sine', ease: 'in' }).values;
  assert.equal(recogniseScale(curved).model, 'explicit', 'the curve is not derivable, so it is not claimed');
});

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

test('short and empty scales are described, never crashed', () => {
  assert.equal(recogniseScale([]).model, 'explicit');
  assert.deepEqual(recogniseScale([]).options.values, []);
  assert.equal(recogniseScale([12]).model, 'explicit');
  assert.deepEqual(recogniseScale([12]).options.values, [12]);
  assert.ok(recogniseScale([4, 8]).model);
});

test('nonsense in is a description out, not a throw', () => {
  for (const input of [null, undefined, 'nope', 42, [1, 'two', 3], [NaN, 4]]) {
    assert.doesNotThrow(() => recogniseScale(input), JSON.stringify(input));
    assert.equal(recogniseScale(input).model, 'explicit');
  }
});
