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
  // `bezier` reads its curve with `bezierAt`, so the sandbox needs the library the sandbox in Figma gets.
  loadInto(ctx, '@bezier.js');
  assert.ok(fs.existsSync(path.join(LIBS, '@scale-models.js')), '@scale-models.js does not exist yet');
  loadInto(ctx, '@scale-models.js');
  return ctx;
}

const lib = loadModels();
const { scaleSequence, scaleModelNames, scaleModelAliases, modularRatios, resolveModularRatio } = lib;

const values = (result) => result.values;
const codes = (result) => result.warnings.map((w) => w.code);

// ---------------------------------------------------------------------------
// metric — the model a design system doc actually describes
// ---------------------------------------------------------------------------

test('metric is a base plus a step that grows every few tokens', () => {
  // "4, 8, 12, 16, 24, 32" — a base of 4, a step of 4, growing every third token. This is the
  // sequence people write down, and the reason metric becomes the default.
  const result = scaleSequence('metric', { steps: 6, min: 4, baseValue: 4, baseIndex: 0, step: 4, mod: 3 });
  assert.deepEqual(values(result), [4, 8, 12, 16, 24, 32]);
  assert.deepEqual(result.warnings, []);
});

test('metric grows its increment exactly every `mod` steps', () => {
  const result = scaleSequence('metric', { steps: 8, min: 16, baseValue: 16, baseIndex: 0, step: 4, mod: 3 });
  assert.deepEqual(values(result), [16, 20, 24, 28, 36, 44, 52, 64]);
});

test('metric below the base subtracts a flat step', () => {
  const result = scaleSequence('metric', { steps: 5, min: 0, baseValue: 16, baseIndex: 2, step: 4, mod: 3 });
  assert.deepEqual(values(result), [8, 12, 16, 20, 24]);
});

test('one step held at the floor is a note, not a warning', () => {
  // A base part-way up the token list puts the step below it under the minimum, and the minimum
  // is there to catch it. That is the config working, so it reads in the summary rather than
  // interrupting.
  const result = scaleSequence('metric', { steps: 4, min: 8, baseValue: 16, baseIndex: 3, step: 4, mod: 3, tokens: ['xs', 'sm', 'md', 'lg'] });
  assert.deepEqual(values(result), [8, 8, 12, 16]);
  assert.deepEqual(codes(result), ['scale-floor-held']);
  assert.match(result.warnings[0].message, /xs held at the minimum of 8\./);
});

test('several steps flattened onto the floor is a warning', () => {
  // Now the model and the token list disagree about how many steps sit below the base, and three
  // tokens sharing one number is worth interrupting for.
  const result = scaleSequence('metric', { steps: 5, min: 10, baseValue: 16, baseIndex: 4, step: 4, mod: 3, tokens: ['a', 'b', 'c', 'd', 'e'] });
  assert.deepEqual(values(result), [10, 10, 10, 12, 16]);
  assert.deepEqual(codes(result), ['scale-floored']);
  assert.match(result.warnings[0].message, /3 steps land below the minimum of 10/);
  assert.match(result.warnings[0].message, /a, b, c/);
});

// ---------------------------------------------------------------------------
// bezier — a ramp between two ends, along a curve, in log space
//
// The model that replaced `modular`. Everything below the first test is about the *shape* of a curved
// ramp; the first test is the one the replacement actually rests on, and if it ever fails the right
// response is to stop and work out which scales in which files just changed.
// ---------------------------------------------------------------------------

test('a straight bezier IS a modular scale, term for term', () => {
  // **The claim the whole replacement rests on.** A constant ratio is a straight line in log space, so a
  // straight curve between the ends a ratio implies reproduces the ratio exactly — not nearly. These
  // sequences are already generated into people's files, so "nearly" would mean silently rewriting tokens
  // that other things are bound to.
  for (const ratio of ['minorSecond', 'majorSecond', 'minorThird', 'majorThird', 'perfectFourth',
    'augmentedFourth', 'perfectFifth', 'phi']) {
    for (const steps of [3, 6, 10]) {
      for (const baseIndex of [0, 1, Math.floor((steps - 1) / 2), steps - 1]) {
        for (const base of [1, 4, 8, 16, 4.5]) {
          const options = { steps, min: 0, baseValue: base, baseIndex, ratio };
          const modular = values(scaleSequence('modular', options));
          const r = resolveModularRatio(ratio);
          const bezier = values(scaleSequence('bezier', {
            steps, min: 0, curve: [], ratio: ratio,
            baseValue: base / Math.pow(r, baseIndex),
          }));
          const label = `${ratio} base ${base} @${baseIndex} × ${steps}`;
          assert.equal(bezier.length, modular.length, label);
          modular.forEach((want, i) => {
            // 1e-12 relative, not 1e-9: at 1e-9 this passed while `bezierAt` was rounding its input to six
            // decimals and putting a 5e-6 kink in the ratio. The tolerance is float noise or it is hiding
            // something.
            assert.ok(Math.abs(bezier[i] - want) < 1e-12 * Math.max(1, Math.abs(want)),
              `${label} step ${i}: ${bezier[i]} should be ${want}`);
          });
        }
      }
    }
  }
});

test('`modular` still generates what it always generated', () => {
  // The alias, through the front door. Same assertion as above with the conversion left to the library,
  // which is how every config written before the curve editor arrives.
  assert.deepEqual(
    values(scaleSequence('modular', { steps: 5, min: 0, baseValue: 16, baseIndex: 2, ratio: 1.25 }))
      .map((v) => Math.round(v * 100) / 100),
    [10.24, 12.8, 16, 20, 25]
  );
  assert.deepEqual(
    values(scaleSequence('modular', { steps: 4, min: 0, baseValue: 16, baseIndex: 0, ratio: 'majorThird' }))
      .map((v) => Math.round(v * 100) / 100),
    [16, 20, 25, 31.25]
  );
});

test('`modular` is accepted but not advertised', () => {
  assert.equal(scaleModelNames().includes('bezier'), true);
  assert.equal(scaleModelNames().includes('modular'), false, 'nothing should be offering it any more');
  assert.equal(scaleModelAliases().includes('modular'), true, 'and it still has to work');
  // The message a bad model prints must not suggest the retired spelling.
  const unknown = scaleSequence('nope', { steps: 3, min: 0 });
  assert.equal(unknown.warnings[0].message.includes('modular'), false);
});

test('both ends are exact, whatever the curve does between them', () => {
  // A curve reshapes the pacing, never the endpoints — which is what makes it safe to bend one on a scale
  // whose largest and smallest values are already agreed.
  for (const preset of [[], [0.9, 0.05, 0.1, 0.95], [0.1, 0.9, 0.9, 0.1], [1, 0, 0, 1]]) {
    const out = values(scaleSequence('bezier', { steps: 7, min: 0, baseValue: 4, max: 96, curve: preset }));
    assert.equal(out[0], 4, JSON.stringify(preset));
    assert.equal(out[out.length - 1], 96, JSON.stringify(preset));
  }
});

test('a curve varies the ratio across the scale, which is the point of it', () => {
  const ends = { steps: 8, min: 0, baseValue: 4, max: 96 };
  const straight = values(scaleSequence('bezier', Object.assign({ curve: [] }, ends)));
  const bent = values(scaleSequence('bezier',
    Object.assign({ curve: [0.42, 0, 0.58, 0.35] }, ends)));

  const ratios = (v) => v.slice(1).map((x, i) => x / v[i]);
  const spread = (v) => Math.max(...ratios(v)) - Math.min(...ratios(v));

  assert.ok(spread(straight) < 1e-12, 'a straight curve holds one ratio the whole way');
  assert.ok(spread(bent) > 0.1, 'a bent one does not');
  assert.notDeepEqual(bent, straight);
});

test('every bezier ramp climbs, however the handles are placed', () => {
  const curves = [[], [0.9, 0.05, 0.1, 0.95], [1, 0, 0, 1], [0, 1, 1, 0],
    [0.2, 0, 0.4, 0.3, 0.5, 0.5, 0.6, 0.7, 0.8, 1]];
  for (const curve of curves) {
    const out = values(scaleSequence('bezier', { steps: 12, min: 0, baseValue: 2, max: 200, curve }));
    for (let i = 1; i < out.length; i++) {
      assert.ok(out[i] >= out[i - 1] - 1e-9,
        `went backwards at ${i} on ${JSON.stringify(curve)}: ${out[i - 1]} → ${out[i]}`);
    }
  }
});

test('a bezier scale needs a ratio, and says so rather than generating nothing', () => {
  const noRatio = scaleSequence('bezier', { steps: 5, min: 0, baseValue: 4 });
  assert.deepEqual(values(noRatio), []);
  assert.ok(codes(noRatio).includes('scale-ratio-required'));

  // `max` is the spelling configs were briefly written in. Converted, not refused, and not a second path:
  // it becomes the ratio that reaches it.
  const viaMax = scaleSequence('bezier', { steps: 6, min: 0, baseValue: 4, max: 30.375, curve: [] });
  const viaRatio = scaleSequence('bezier', { steps: 6, min: 0, baseValue: 4, ratio: 1.5, curve: [] });
  values(viaMax).forEach((v, i) => assert.ok(Math.abs(v - values(viaRatio)[i]) < 1e-9, 'step ' + i));
});

test('adding a token appends — it does not move the tokens already there', () => {
  // **The property the whole model exists for.** A `max` pins both ends, so a seventh token re-subdivides
  // the range and every value below it changes — six spacing variables already bound to things in a file,
  // silently rewritten because somebody added a seventh. Deriving the top from the ratio makes the step
  // count cancel out of the exponent, so the sequence does not depend on how long it is.
  const of = (steps) => values(scaleSequence('bezier', { steps, min: 0, baseValue: 4, ratio: 1.5, curve: [] }));
  const six = of(6);
  for (const longer of [7, 9, 14]) {
    const grown = of(longer);
    six.forEach((was, i) => {
      assert.ok(Math.abs(grown[i] - was) < 1e-9,
        `token ${i} moved from ${was} to ${grown[i]} when the list grew to ${longer}`);
    });
  }
  assert.deepEqual(six.map((v) => Math.round(v * 1000) / 1000), [4, 6, 9, 13.5, 20.25, 30.375]);
});

test('bending moves the interior and never the ends', () => {
  const ends = { steps: 7, min: 0, baseValue: 4, ratio: 1.5 };
  const flat = values(scaleSequence('bezier', Object.assign({ curve: [] }, ends)));
  for (const curve of [[0.9, 0.05, 0.1, 0.95], [0.42, 0, 0.58, 0.35], [0.1, 0.6, 0.4, 0.9]]) {
    const bent = values(scaleSequence('bezier', Object.assign({ curve }, ends)));
    assert.ok(Math.abs(bent[0] - 4) < 1e-9, 'the base moved');
    assert.ok(Math.abs(bent[6] - 4 * Math.pow(1.5, 6)) < 1e-9, 'the top moved');
    assert.notDeepEqual(bent, flat, 'the bend did nothing');
  }
});

test('a ramp between zero and anything is refused, and the message names the right end', () => {
  // Log space has no ratio to a zero. **Which end is zero changes the advice**: a base of 0 is somebody
  // wanting a `none` token, and an extra value is the answer; a max of 0 is an empty field on a mode just
  // switched to this model, and pointing them at extra values sends them to the wrong control. One message
  // for both was the first thing on screen after picking Bezier, and it was about the other end.
  const zeroBase = scaleSequence('bezier', { steps: 5, min: 0, baseValue: 0, max: 96, curve: [] });
  assert.deepEqual(values(zeroBase), []);
  assert.ok(codes(zeroBase).includes('scale-bezier-positive'));
  assert.match(zeroBase.warnings[0].message, /base has to be above zero/);
  assert.match(zeroBase.warnings[0].message, /Extra values/, 'it should say what to do instead');

  const zeroMax = scaleSequence('bezier', { steps: 5, min: 0, baseValue: 4, max: 0, curve: [] });
  assert.deepEqual(values(zeroMax), []);
  assert.ok(codes(zeroMax).includes('scale-bezier-positive'));
  assert.match(zeroMax.warnings[0].message, /largest value above zero/);
  assert.doesNotMatch(zeroMax.warnings[0].message, /Extra values/, 'that is advice about the other end');
});

// ---------------------------------------------------------------------------
// modular — unclamped, the top comes out of the ratio
// ---------------------------------------------------------------------------

test('modular multiplies by its ratio above the base and divides below', () => {
  const result = scaleSequence('modular', { steps: 5, min: 0, baseValue: 16, baseIndex: 2, ratio: 1.25 });
  assert.deepEqual(values(result).map((v) => Math.round(v * 100) / 100), [10.24, 12.8, 16, 20, 25]);
});

test('modular produces the numbers designers recognise', () => {
  // 16 → 20 → 25 → 31.25, from the shipped rounded table rather than equal temperament.
  const result = scaleSequence('modular', { steps: 4, min: 0, baseValue: 16, baseIndex: 0, ratio: 'majorThird' });
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
  const result = scaleSequence('modular', { steps: 3, min: 0, baseValue: 10, baseIndex: 0, ratio: 2 });
  assert.deepEqual(values(result), [10, 20, 40]);
});

test('an unknown ratio name is refused, not guessed at', () => {
  const result = scaleSequence('modular', { steps: 3, min: 0, baseValue: 10, baseIndex: 0, ratio: 'sixthish' });
  assert.deepEqual(values(result), []);
  assert.ok(codes(result).includes('scale-ratio-unknown'));
});

test('modular ignores max, and says so', () => {
  // The top comes out of the ratio. Enforcing a max would change the ratio, which is the one
  // property a modular scale promises to hold.
  const withMax = scaleSequence('modular', { steps: 4, min: 0, baseValue: 16, baseIndex: 0, ratio: 1.25, max: 20 });
  const without = scaleSequence('modular', { steps: 4, min: 0, baseValue: 16, baseIndex: 0, ratio: 1.25 });
  assert.deepEqual(values(withMax), values(without));
  assert.ok(codes(withMax).includes('scale-max-ignored'));
  assert.deepEqual(codes(without), []);
});

test('a clamp warns rather than squashes, naming both numbers', () => {
  const result = scaleSequence('modular', {
    steps: 4, min: 0, baseValue: 16, baseIndex: 0, ratio: 1.25, clamp: 24,
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
    const result = scaleSequence(model, { steps: 3, baseValue: 16, baseIndex: 0, ratio: 1.25, step: 4, mod: 3, values: [1, 2, 3] });
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
    ['metric', { steps: 9, min: 0, baseValue: 4, baseIndex: 0, step: 4, mod: 3 }],
    ['metric', { steps: 9, min: 0, baseValue: 24, baseIndex: 4, step: 2, mod: 2 }],
    ['modular', { steps: 9, min: 0, baseValue: 16, baseIndex: 4, ratio: 'minorSecond' }],
    ['modular', { steps: 9, min: 0, baseValue: 16, baseIndex: 0, ratio: 1.02 }],
    ['modular', { steps: 9, min: 0, baseValue: 100, baseIndex: 8, ratio: 'phi' }],
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
  assert.deepEqual(values(scaleSequence('modular', { steps: 1, min: 0, baseValue: 16, baseIndex: 0, ratio: 1.25 })), [16]);
  assert.deepEqual(values(scaleSequence('metric', { steps: 1, min: 0, baseValue: 16, baseIndex: 0, step: 4, mod: 3 })), [16]);
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

// ---------------------------------------------------------------------------
// Nothing edits a scale in silence
// ---------------------------------------------------------------------------

test('enforceMonotonicScale reports every value it moves, including the pinned ends', () => {
  // This is where a generated scale's numbers actually change — collisions pushed apart, and the
  // first and last values pinned to min and max whatever the curve produced. It was silent, and
  // that silence hid three separate bugs.
  const report = {};
  const out = lib.enforceMonotonicScale([5, 5, 5, 30], 4, 40, 4, report);

  assert.deepEqual(out, [4, 8, 12, 40]);
  const moved = report.adjustments.map((a) => a.index);
  assert.deepEqual(moved, [0, 1, 2, 3], 'every one of them');
  assert.match(report.adjustments[0].why, /minimum/);
  assert.match(report.adjustments[3].why, /maximum/);
  assert.match(report.adjustments[1].why, /above the step before/);
  assert.equal(report.adjustments[1].from, 5);
  assert.equal(report.adjustments[1].to, 8);
});

test('a scale it does not need to touch reports nothing', () => {
  const report = {};
  const out = lib.enforceMonotonicScale([4, 8, 12, 16], 4, 16, 4, report);
  assert.deepEqual(out, [4, 8, 12, 16]);
  assert.deepEqual(report.adjustments, []);
});

test('the report is opt-in, so every existing caller is untouched', () => {
  assert.deepEqual(lib.enforceMonotonicScale([5, 5, 5, 30], 4, 40, 4), [4, 8, 12, 40]);
  assert.doesNotThrow(() => lib.enforceMonotonicScale([1, 2], 1, 2, 1, null));
});

test('an endpoints scale carries its adjustments out with it', () => {
  const built = scaleSequence('endpoints', {
    steps: 4, min: 4, max: 10, type: 'linear', ease: 'none', roundTo: 4
  });
  assert.deepEqual(built.values, [4, 8, 10, 10]);
  assert.ok(built.adjustments.length > 0, 'and does not keep them to itself');
});

test('a growth at or below 1 is refused — a scale that shrinks is not a scale', () => {
  // These tokens are named smallest to largest, so a ratio under 1 contradicts the list it is filling. It
  // did not fail: it generated `0, 0, 0, 1, 2, 4` and the grid rounded most of that to nothing. Found by
  // typing a curve's coordinates into the growth field, where `0.42` was read as the growth.
  for (const ratio of [0.42, 0.99, 1]) {
    const result = scaleSequence('bezier', { steps: 6, min: 0, baseValue: 4, ratio, curve: [] });
    assert.deepEqual(values(result), [], `${ratio} generated something`);
    assert.ok(codes(result).includes('scale-ratio-not-growing'), `${ratio} was not reported`);
    assert.match(result.warnings[0].message, /smallest to largest/);
  }
  // And just above 1 still works, because the refusal is about direction, not about being cautious.
  assert.equal(values(scaleSequence('bezier', { steps: 4, min: 0, baseValue: 4, ratio: 1.01, curve: [] })).length, 4);
});
