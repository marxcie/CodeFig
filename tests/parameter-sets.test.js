/**
 * Parameter sets: a scale described once, not once per breakpoint.
 *
 * `modes[]` says the same thing three times and leaves the duplication for the reader to notice
 * as duplication rather than stating it as sameness. A set carries an explicit `appliesTo`, and
 * `"*"` — the default — means every mode in the collection.
 *
 * Two rules do the work, and both are about not guessing:
 *
 * **Explicit beats wildcard**, because one set for everything plus one override is the pattern
 * people write, and it is not silent precedence if the run names which set won for which mode.
 *
 * **Equal specificity refuses the whole run, at plan time.** Resolving sets to modes is pure
 * config, knowable before Figma is touched, so a contradiction never half-applies — writing two
 * modes and skipping the third would leave a file matching no config anyone wrote, and a manifest
 * recording it as though it were a decision.
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

function load() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, String, Array, Object, JSON, Date, isNaN, isFinite, parseInt, parseFloat, Number, RegExp
  };
  vm.createContext(ctx);
  loadInto(ctx, '@foundation.js');
  loadInto(ctx, '@math-helpers.js');
  loadInto(ctx, '@scale-models.js');
  loadInto(ctx, '@linear-ramp.js');
  return ctx;
}

const lib = load();
const spec = lib.spacingRampSpec();
const MODES = ['Desktop', 'Tablet', 'Mobile'];
const TOKENS = ['xs', 'sm', 'md', 'lg'];

const metric = (extra) => Object.assign({
  model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4, mod: 3
}, extra || {});

/** The whole config through the pipeline, to the values a run would write. */
function generate(config) {
  const data = JSON.parse(JSON.stringify(config));
  lib.ensureCompatRampConfig(data, spec);
  lib.materialiseRampTokens(data, spec);
  lib.materialiseRampSizes(data, spec);
  const generated = lib.generateRampVariables(data, spec);
  const out = {};
  for (const name of Object.keys(generated)) out[name.replace('Spacing/', '')] = generated[name].values;
  return out;
}

// ---------------------------------------------------------------------------
// One set, every mode
// ---------------------------------------------------------------------------

test('one set with no appliesTo covers every mode', () => {
  const plan = lib.resolveRampSets([metric({ name: 'all' })], MODES, TOKENS);
  assert.equal(plan.ok, true);
  assert.deepEqual(Object.keys(plan.sizes), MODES);
  assert.equal(plan.sizes.Desktop.step, 4);
  assert.equal(plan.sizes.Mobile.step, 4, 'the same scale, not three copies of it');
});

test('one set generates the same values for every mode', () => {
  // A wildcard set names no modes of its own, so the run supplies them — from the collection
  // when there is one, and here from `modeNames`.
  const values = generate({
    collectionName: 'C', group: 'Spacing', spacings: TOKENS, modeNames: MODES,
    sets: [metric({ name: 'all', appliesTo: '*' })]
  });
  assert.deepEqual(values.lg.Desktop, values.lg.Mobile);
  assert.deepEqual(Object.keys(values.lg).sort(), ['Desktop', 'Mobile', 'Tablet']);
});

test('three sets bound to one mode each reproduce what modes[] did', () => {
  const asModes = generate({
    collectionName: 'C', group: 'Spacing', spacings: TOKENS,
    modes: [
      { name: 'Desktop', model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4, mod: 3 },
      { name: 'Tablet', model: 'metric', min: 1, base: { level: 'xs', size: 3 }, step: 3, mod: 3 },
      { name: 'Mobile', model: 'metric', min: 1, base: { level: 'xs', size: 2 }, step: 2, mod: 3 }
    ]
  });
  const asSets = generate({
    collectionName: 'C', group: 'Spacing', spacings: TOKENS,
    sets: [
      metric({ name: 'd', appliesTo: 'Desktop', base: { level: 'xs', size: 4 }, step: 4 }),
      metric({ name: 't', appliesTo: 'Tablet', base: { level: 'xs', size: 3 }, step: 3 }),
      metric({ name: 'm', appliesTo: 'Mobile', base: { level: 'xs', size: 2 }, step: 2 })
    ]
  });
  assert.deepEqual(asSets, asModes);
});

test('a legacy modes[] config is read as one set per mode, and reported', () => {
  const config = {
    collectionName: 'C', group: 'Spacing', spacings: TOKENS,
    modes: [{ name: 'Desktop', min: 1, max: 40 }, { name: 'Mobile', min: 1, max: 20 }]
  };
  const translated = lib.rampSetsFromConfig(config, spec);
  assert.equal(translated.sets.length, 2);
  assert.deepEqual(translated.sets.map((s) => s.appliesTo), ['Desktop', 'Mobile']);
  assert.ok(translated.translated, 'and says it did so');
});

// ---------------------------------------------------------------------------
// Explicit beats wildcard
// ---------------------------------------------------------------------------

test('an explicit set overrides a wildcard, and the run says which won where', () => {
  const plan = lib.resolveRampSets([
    metric({ name: 'all', appliesTo: '*' }),
    metric({ name: 'tight', appliesTo: 'Mobile', step: 2 })
  ], MODES, TOKENS);

  assert.equal(plan.ok, true);
  assert.equal(plan.sizes.Desktop.step, 4);
  assert.equal(plan.sizes.Mobile.step, 2, 'the override applies');
  assert.deepEqual(plan.overrides, [{ mode: 'Mobile', winner: 'tight', loser: 'all' }]);
  assert.match(lib.describeRampSetPlan(plan).join('\n'), /Mobile: set "tight" overrides set "all"/);
});

test('a list of modes is as explicit as a single one', () => {
  const plan = lib.resolveRampSets([
    metric({ name: 'all', appliesTo: '*' }),
    metric({ name: 'small', appliesTo: ['Tablet', 'Mobile'], step: 2 })
  ], MODES, TOKENS);
  assert.equal(plan.ok, true);
  assert.equal(plan.sizes.Desktop.step, 4);
  assert.equal(plan.sizes.Tablet.step, 2);
  assert.equal(plan.sizes.Mobile.step, 2);
  assert.equal(plan.overrides.length, 2);
});

test('a mode no set claims is named, and generates nothing', () => {
  const plan = lib.resolveRampSets([metric({ name: 'd', appliesTo: 'Desktop' })], MODES, TOKENS);
  assert.equal(plan.ok, true);
  assert.deepEqual(Object.keys(plan.sizes), ['Desktop']);
  assert.deepEqual(plan.unclaimed, ['Tablet', 'Mobile']);
});

// ---------------------------------------------------------------------------
// Equal specificity refuses the whole run
// ---------------------------------------------------------------------------

test('two sets naming one mode outright is refused', () => {
  const plan = lib.resolveRampSets([
    metric({ name: 'tight', appliesTo: 'Mobile' }),
    metric({ name: 'compact', appliesTo: 'Mobile' })
  ], MODES, TOKENS);

  assert.equal(plan.ok, false);
  assert.deepEqual(plan.conflicts, [{ mode: 'Mobile', sets: ['tight', 'compact'] }]);
  const message = lib.describeRampSetPlan(plan).join('\n');
  assert.match(message, /tight/);
  assert.match(message, /compact/);
  assert.match(message, /Mobile/);
  assert.match(message, /Nothing was written/);
});

test('two wildcards are equally specific, so they are refused too', () => {
  const plan = lib.resolveRampSets([
    metric({ name: 'a', appliesTo: '*' }),
    metric({ name: 'b' })
  ], MODES, TOKENS);
  assert.equal(plan.ok, false);
  assert.equal(plan.conflicts.length, 3, 'every mode is contested');
});

test('a refusal is decided from config alone, with no Figma in the call', () => {
  // resolveRampSets takes a list of sets, a list of names and a list of tokens. If it ever needs
  // a collection, the refusal has stopped being knowable before anything is written.
  const source = fs.readFileSync(path.join(LIBS, '@linear-ramp.js'), 'utf8');
  const fn = /function resolveRampSets\([\s\S]*?\n}/.exec(source);
  assert.ok(fn, 'resolveRampSets not found');
  assert.ok(!/figma\./.test(fn[0]), 'the plan-time decision reaches for Figma: ' + fn[0].slice(0, 200));
});

test('a conflicted config generates nothing at all — not two modes out of three', () => {
  const values = generate({
    collectionName: 'C', group: 'Spacing', spacings: TOKENS,
    sets: [
      metric({ name: 'tight', appliesTo: 'Mobile' }),
      metric({ name: 'compact', appliesTo: 'Mobile' }),
      metric({ name: 'rest', appliesTo: ['Desktop', 'Tablet'] })
    ]
  });
  assert.deepEqual(values, {}, 'half a config applied is worse than none');
});

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

test('a set naming a mode the collection does not have is reported, not silently dropped', () => {
  const plan = lib.resolveRampSets([
    metric({ name: 'all', appliesTo: '*' }),
    metric({ name: 'watch', appliesTo: 'Watch' })
  ], MODES, TOKENS);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.unusedSets, ['watch']);
  assert.match(lib.describeRampSetPlan(plan).join('\n'), /watch/);
});

test('no sets at all is not a crash', () => {
  const plan = lib.resolveRampSets([], MODES, TOKENS);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.sizes, {});
  assert.deepEqual(plan.unclaimed, MODES);
});

test('mode names match however they are cased', () => {
  const plan = lib.resolveRampSets([metric({ name: 'm', appliesTo: 'mobile' })], MODES, TOKENS);
  assert.equal(plan.ok, true);
  assert.ok(plan.sizes.Mobile, 'a config writes `mobile`; the collection shows `Mobile`');
});

// ---------------------------------------------------------------------------
// Where a wildcard's modes come from — and what may create one
// ---------------------------------------------------------------------------

const REGISTRY = ['Mobile', 'Tablet', 'Desktop', 'Wide', 'Ultra'];

test('a wildcard describes the collection it is run against', () => {
  // Portable by design: the same config fills three viewports in one file and five in another.
  const plan = lib.rampModePlan([metric({ name: 'all', appliesTo: '*' })], MODES, REGISTRY, []);
  assert.deepEqual(plan.modes, MODES, 'the collection, not the registry');
  assert.equal(plan.source, 'collection');
  assert.deepEqual(plan.creating, [], 'a wildcard never creates a mode');
  assert.match(plan.message, /Writing 3 mode\(s\) from the collection/);
});

test('a wildcard on a collection nobody has set up seeds from the registry', () => {
  // The one moment the registry is the right source: nothing else can say what should exist.
  const plan = lib.rampModePlan([metric({ name: 'all', appliesTo: '*' })], ['Mode 1'], REGISTRY, []);
  assert.deepEqual(plan.modes, REGISTRY);
  assert.equal(plan.source, 'registry');
  assert.match(plan.message, /Seeded 5 mode\(s\) from this file's registry/);
  assert.match(plan.message, /changes the shape of the collection/, 'and does not read like the other case');
});

test('with neither, it refuses and says the way out', () => {
  const plan = lib.rampModePlan([metric({ name: 'all', appliesTo: '*' })], [], [], []);
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.modes, []);
  assert.match(plan.message, /names no modes/);
  assert.match(plan.message, /Add them in Grid, or name them in the config/);
});

test('naming a mode creates it; describing one does not', () => {
  // The rule that stops a wildcard on an established collection gaining modes whenever the
  // registry grows: naming is a request, a wildcard is a description.
  const wildcard = lib.rampModePlan([metric({ name: 'all', appliesTo: '*' })], ['Desktop'], REGISTRY, []);
  assert.deepEqual(wildcard.modes, ['Desktop']);
  assert.deepEqual(wildcard.creating, []);

  const named = lib.rampModePlan([
    metric({ name: 'all', appliesTo: '*' }),
    metric({ name: 'w', appliesTo: 'Wide' })
  ], ['Desktop'], REGISTRY, []);
  assert.deepEqual(named.modes, ['Desktop', 'Wide']);
  assert.deepEqual(named.creating, ['Wide'], 'the named one is a request');
  assert.match(named.message, /Creating: Wide/);
});

test('config.modeNames overrides both, for a config that must be deterministic', () => {
  const plan = lib.rampModePlan([metric({ name: 'all', appliesTo: '*' })], MODES, REGISTRY, ['A', 'B']);
  assert.deepEqual(plan.modes, ['A', 'B']);
  assert.equal(plan.source, 'config');
  assert.match(plan.message, /named in the config/);
});

test('a config with no wildcard writes exactly the modes it names', () => {
  const plan = lib.rampModePlan([
    metric({ name: 'd', appliesTo: 'Desktop' }),
    metric({ name: 'm', appliesTo: 'Mobile' })
  ], ['Desktop', 'Tablet'], REGISTRY, []);
  assert.deepEqual(plan.modes, ['Desktop', 'Mobile'], 'Tablet is not written just for existing');
  assert.deepEqual(plan.creating, ['Mobile']);
});

// ---------------------------------------------------------------------------
// Adoption: three identical fits are one scale, and should be recorded as one
// ---------------------------------------------------------------------------

test('value-identical per-mode fits collapse to one wildcard set', () => {
  // Honest because it is derived from the values being equal, not from guessing intent: if the
  // three modes generate the same numbers, they are one scale written three times.
  const same = { model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4, mod: 3 };
  const sets = lib.collapseRampSets([
    Object.assign({ name: 'Desktop', appliesTo: 'Desktop' }, same),
    Object.assign({ name: 'Tablet', appliesTo: 'Tablet' }, same),
    Object.assign({ name: 'Mobile', appliesTo: 'Mobile' }, same)
  ], MODES);

  assert.equal(sets.length, 1);
  assert.equal(sets[0].appliesTo, '*');
  assert.equal(sets[0].step, 4);

  // The same numbers, a different config: what the collapse must preserve is the output.
  const before = generate({ collectionName: 'C', group: 'Spacing', spacings: TOKENS, modeNames: MODES,
    sets: [Object.assign({ name: 'd', appliesTo: 'Desktop' }, same),
           Object.assign({ name: 't', appliesTo: 'Tablet' }, same),
           Object.assign({ name: 'm', appliesTo: 'Mobile' }, same)] });
  const after = generate({ collectionName: 'C', group: 'Spacing', spacings: TOKENS, modeNames: MODES, sets: sets });
  assert.deepEqual(after, before);
});

test('a set that differs is left as its own set', () => {
  const base = { model: 'metric', min: 1, base: { level: 'xs', size: 4 }, mod: 3 };
  const sets = lib.collapseRampSets([
    Object.assign({ name: 'Desktop', appliesTo: 'Desktop', step: 4 }, base),
    Object.assign({ name: 'Tablet', appliesTo: 'Tablet', step: 4 }, base),
    Object.assign({ name: 'Mobile', appliesTo: 'Mobile', step: 2 }, base)
  ], MODES);

  assert.equal(sets.length, 2, 'the two that agree, and the one that does not');
  assert.equal(sets.filter((s) => s.appliesTo === 'Mobile').length, 1);
});

test('a partial match does not become a wildcard', () => {
  // Two of three agreeing is not "every mode": claiming so would write the third one wrongly.
  const base = { model: 'metric', min: 1, base: { level: 'xs', size: 4 }, mod: 3 };
  const sets = lib.collapseRampSets([
    Object.assign({ name: 'Desktop', appliesTo: 'Desktop', step: 4 }, base),
    Object.assign({ name: 'Tablet', appliesTo: 'Tablet', step: 4 }, base)
  ], MODES);
  assert.equal(sets.length, 1);
  assert.deepEqual(sets[0].appliesTo, ['Desktop', 'Tablet'], 'named, not "*"');
});
