/**
 * Fixture tests for the portable v1 config in scripts/CODEFIG_LIBRARIES/@foundation.js.
 *
 * Two properties hold the line here, and everything else is detail.
 *
 * **No divergence.** Two normalisation paths exist for the length of phases 3-5: this reader, and
 * each script's own `ensureCompat*`. If they disagree, a pasted config means one thing to the
 * tooling and another to the code that actually writes variables — the worst possible split. So a
 * legacy blob and its v1 translation are both pushed through spacing.js's *unchanged* pipeline and
 * the generated variables are compared value by value.
 *
 * **Declared inputs only.** `materializeSpacingSizes` and friends mutate the config in place during
 * a run, adding `spacingSizes` / `fontSizes` / an expanded `spacings`. Exporting those freezes them:
 * paste the result elsewhere and `steps: 6` regenerates nothing. v1 carries what was declared.
 *
 * Everything here is plain objects — no Figma. The text-layer round trip and the clipboard live in
 * scripts/_TESTS/_tests-foundation-config.js.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');

const SCRIPTS = path.join(__dirname, '..', 'scripts');

/**
 * Load every extractable function from a script into one shared context, plus the top-level
 * SHOUTY_CASE tables they close over. `@import` cannot extract those either — which is why
 * they are only ever read by functions in the same file — but running the real pipeline needs
 * the real values, not a copy that can drift.
 */
function loadAll(ctx, relativePath) {
  const source = fs.readFileSync(path.join(SCRIPTS, relativePath), 'utf8');
  const tables = source.match(/^var [A-Z][A-Z0-9_]* = \{[\s\S]*?\n\};/gm) || [];
  for (const table of tables) {
    vm.runInContext(table, ctx);
  }
  const map = resolver.extractFunctionMap(source);
  for (const [, code] of map) {
    vm.runInContext(code, ctx);
  }
  return map;
}

function loadContext() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, String, Array, Object, JSON, Date, isNaN, isFinite, parseInt, parseFloat, Number, RegExp
  };
  vm.createContext(ctx);
  loadAll(ctx, 'CODEFIG_LIBRARIES/@foundation.js');
  loadAll(ctx, 'CODEFIG_LIBRARIES/@math-helpers.js');
  loadAll(ctx, 'CODEFIG_LIBRARIES/@bezier.js');
  loadAll(ctx, 'CODEFIG_LIBRARIES/@scale-models.js');
  // The generator behind Spacing since plan 19. The property under test is about the *current*
  // generator, so this follows the collapse rather than pinning the shape it had before it.
  loadAll(ctx, 'CODEFIG_LIBRARIES/@linear-ramp.js');
  return ctx;
}

const lib = loadContext();
const {
  normaliseConfig, toDomainConfig, toPortableConfig, serialisePortableConfig, parsePortableConfig,
  emptyPortableConfig, configDomainOf
} = lib;

/** The spacing pipeline, exactly as `runLinearRamp` runs it. */
function runSpacingPipeline(config) {
  const spec = lib.spacingRampSpec();
  const data = JSON.parse(JSON.stringify(config));
  lib.ensureCompatRampConfig(data, spec);
  lib.materialiseRampTokens(data, spec);
  lib.materialiseRampSizes(data, spec);
  lib.validateRampScalingType(data, spec);
  return { data: data, variables: lib.generateRampVariables(data, spec) };
}

const codes = (result) => result.warnings.map((w) => w.code);
const translated = (result) => result.translations.map((t) => t.from);

/** The shipped spacing config, in the shape a user pastes today. */
function legacySpacingConfig() {
  return {
    collectionName: 'Responsive System',
    group: 'Spacing',
    generateOverview: false,
    spacings: ['px', 'xs', 'sm', 'md', 'lg', 'xl'],
    scaling: { type: 'sine', ease: 'in', roundTo: 2 },
    modes: [
      { name: 'desktop', min: 1, max: 200 },
      { name: 'tablet', min: 1, max: 120 },
      { name: 'mobile', min: 1, max: 80 }
    ]
  };
}

// ---------------------------------------------------------------------------
// The two that hold the line
// ---------------------------------------------------------------------------

test('a legacy blob and its v1 translation generate identical variables', () => {
  // The no-divergence property. Both go through spacing.js unchanged; the variables are compared
  // value by value, because that is what a user actually gets in their file.
  const legacy = legacySpacingConfig();
  const v1 = normaliseConfig(legacy).config;
  const bridged = toDomainConfig(v1, 'spacing');

  const fromLegacy = runSpacingPipeline(legacy);
  const fromV1 = runSpacingPipeline(bridged);

  assert.deepEqual(fromV1.variables, fromLegacy.variables);
  assert.ok(Object.keys(fromLegacy.variables).length >= 6, 'the fixture really did generate something');
  assert.deepEqual(fromV1.data.spacingSizes, fromLegacy.data.spacingSizes);
  assert.equal(lib.getRampRoundGrid(fromV1.data), lib.getRampRoundGrid(fromLegacy.data));
});

test('the same holds for the legacy spellings, not just the current one', () => {
  const legacy = {
    structure: { variableCollection: 'Responsive System', variableGroup: 'Spacing' },
    spacings: ['xs', 'sm', 'md', 'lg'],
    spacingScaling: { type: 'quad', ease: 'out', roundUpperValuesTo: 4 },
    modes: [
      { name: 'desktop', min: 2, max: 160 },
      { name: 'mobile', min: 2, max: 64 }
    ]
  };
  const bridged = toDomainConfig(normaliseConfig(legacy).config, 'spacing');

  assert.deepEqual(runSpacingPipeline(bridged).variables, runSpacingPipeline(legacy).variables);
});

test('a template + steps config survives the round trip', () => {
  const legacy = {
    collectionName: 'Responsive System',
    group: 'Spacing',
    spacings: 'space-{$index}',
    steps: 5,
    scaling: { type: 'linear', ease: 'none', roundTo: 2 },
    modes: [{ name: 'mobile', min: 1, max: 64 }]
  };
  const bridged = toDomainConfig(normaliseConfig(legacy).config, 'spacing');

  assert.deepEqual(runSpacingPipeline(bridged).variables, runSpacingPipeline(legacy).variables);
  assert.equal(Object.keys(runSpacingPipeline(bridged).variables).length, 5);
});

test('v1 carries declared inputs only — never a run derivation', () => {
  // A config as it exists *after* a run: materialize* has written its derivations onto it.
  const afterRun = runSpacingPipeline(legacySpacingConfig()).data;
  assert.ok(afterRun.spacingSizes, 'the fixture is really a post-run config');

  const result = normaliseConfig(afterRun);
  const slice = result.config.domains.spacing;

  assert.equal(slice.spacingSizes, undefined);
  assert.equal(slice.fontSizes, undefined);
  assert.equal(slice.radiusSizes, undefined);
  assert.equal(JSON.stringify(result.config).indexOf('spacingSizes'), -1, 'not hiding anywhere else');
  assert.ok(translated(result).includes('spacingSizes'), 'and it said so');

  // And the stripped config still generates the same variables.
  assert.deepEqual(
    runSpacingPipeline(toDomainConfig(result.config, 'spacing')).variables,
    runSpacingPipeline(afterRun).variables
  );
});

test('the export is a whitelist: a key the shape does not declare does not survive', () => {
  // The rule this replaced named the derived keys it knew about, so it exported every one it did
  // not — `__rampSetPlan`, the resolver's own working state, went into the manifest and came back
  // out as though the author had written it. Naming what is allowed cannot fail that way. This
  // test exists to fail when the pipeline grows a field and nobody declares it.
  const result = normaliseConfig(Object.assign(legacySpacingConfig(), {
    __rampSetPlan: { sizes: {}, conflicts: [{ mode: 'Mobile', sets: ['a', 'b'] }], unclaimed: ['Wide'] },
    junkKey: 'should not survive'
  }));

  const json = JSON.stringify(result.config);
  assert.equal(json.indexOf('__rampSetPlan'), -1, 'internal resolution state is not config');
  assert.equal(json.indexOf('unclaimed'), -1, 'nor any of its fields, under any name');
  assert.equal(json.indexOf('conflicts'), -1);

  // A key the *author* wrote and this reader does not interpret still survives, in `extra` and
  // named in a warning — that is how typography keeps `fontFamily` and colors keep their themes.
  // The line between the two is not a naming convention: it is that nothing in the pipeline may
  // write to a config object, so the only keys present are ones a person put there.
  assert.equal(result.config.domains.spacing.extra.junkKey, 'should not survive');
  assert.ok(result.warnings.some((w) => w.message.indexOf('junkKey') !== -1), 'and it said so');
});

test('no shipped default block warns about itself', () => {
  // A default that complains about itself is how people learn to ignore warnings — the same
  // failure as 19b's metric configs warning about a `max` they never declared. `fontFamily`,
  // `light` and `dark` are in shipped blocks, so they are declared fields by definition, and
  // colors is a domain because it has a script.
  const dir = path.join(SCRIPTS, 'EXAMPLE_SCRIPTS', 'Design System Foundations');
  const checked = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const start = source.indexOf('// @CONFIG_START');
    const end = source.indexOf('// @CONFIG_END');
    if (start === -1 || end === -1) continue;

    const block = vm.runInNewContext('({' + source.slice(start + '// @CONFIG_START'.length, end) + '})');
    const result = normaliseConfig(block);
    assert.deepEqual(
      result.warnings.map((w) => w.message), [],
      file + ' warns about its own default config'
    );
    assert.notEqual(Object.keys(result.config.domains)[0], 'unknown', file + ' is not recognised');
    checked.push(file);
  }

  assert.ok(checked.length >= 5, 'expected every shipped block, found ' + checked.join(', '));
});

test('the pipeline writes nothing onto the config it was handed', () => {
  // The root cause behind the export leak: `resolveRampSizes` hung its plan on the config, so it
  // reached the manifest by riding the object rather than by any decision to export it. A
  // whitelist catches that at the border; this catches it at the source.
  const { data } = runSpacingPipeline(legacySpacingConfig());
  const added = Object.keys(data).filter((k) => k.indexOf('__') === 0);
  assert.deepEqual(added, [], 'no working state left behind: ' + added.join(', '));
});

test('parameter sets survive the manifest, despite sharing a name with v1 sets', () => {
  // The outer v1 config also has `sets` — the generated sets a file contains — and the skip for
  // that one was being applied to domain slices, so a config's parameter sets vanished on the way
  // in and the file silently fell back to `perViewport`.
  const result = normaliseConfig({
    collectionName: 'C', group: 'Spacing', spacings: ['xs', 'sm'],
    sets: [{ name: 'all', appliesTo: '*', model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4 }]
  });
  const slice = result.config.domains.spacing;
  assert.equal(slice.sets.length, 1);
  assert.equal(slice.sets[0].appliesTo, '*');
  assert.equal(toDomainConfig(result.config, 'spacing').sets.length, 1, 'and come back out');
});

test('an expanded token list is kept as tokens, and the spent steps is dropped', () => {
  // `spacings` as an array always wins over `steps` at run time (materializeSpacingsFromSteps
  // returns early), so keeping the list and dropping the count is behaviour-preserving. The
  // template is lost, the result is not.
  const afterRun = runSpacingPipeline({
    collectionName: 'C', group: 'Spacing',
    spacings: 'space-{$index}', steps: 4,
    scaling: { type: 'linear', ease: 'none' },
    modes: [{ name: 'mobile', min: 1, max: 32 }]
  }).data;

  const slice = normaliseConfig(afterRun).config.domains.spacing;
  assert.deepEqual(slice.tokens, ['space-0', 'space-1', 'space-2', 'space-3']);
  assert.equal(slice.steps, null);
  assert.equal(slice.nameTemplate, null);
});

// ---------------------------------------------------------------------------
// The compat table, one case per row
// ---------------------------------------------------------------------------

test('collectionName and group become collection and group', () => {
  const { config } = normaliseConfig({ collectionName: 'Tokens', group: 'Spacing', spacings: ['a'] });
  assert.equal(config.collection, 'Tokens');
  assert.equal(config.group, 'Spacing');
  assert.equal(config.v, 1);
  assert.equal(config.kind, 'codefig.foundation');
});

test('the legacy structure.* shape translates, and says so', () => {
  const result = normaliseConfig({ structure: { variableCollection: 'Old', variableGroup: 'Sp' }, spacings: ['a'] });
  assert.equal(result.config.collection, 'Old');
  assert.equal(result.config.group, 'Sp');
  assert.ok(translated(result).includes('structure.variableCollection'));
});

test('the internal wrapper is unwrapped, and its variables ignored', () => {
  // What each script builds around the user's object (spacing.js:381) — not a user shape, but it
  // reaches the reader whenever someone copies the wrong variable.
  const result = normaliseConfig({
    collectionName: 'Responsive System',
    group: 'Spacing',
    config: { spacings: ['xs', 'sm'], modes: [{ name: 'mobile', min: 1, max: 20 }] },
    variables: { 'Spacing/xs': { type: 'FLOAT', values: {} } }
  });
  assert.deepEqual(result.config.domains.spacing.tokens, ['xs', 'sm']);
  assert.equal(JSON.stringify(result.config).indexOf('FLOAT'), -1, 'variables are a function of the config');
  assert.ok(translated(result).includes('variables'));
});

test('modes become viewports plus a per-viewport payload', () => {
  const { config } = normaliseConfig(legacySpacingConfig());
  assert.deepEqual(config.viewports.map((v) => v.key), ['desktop', 'tablet', 'mobile'],
    'declared order, since a spacing config carries no widths');
  assert.deepEqual(config.viewports.map((v) => v.label), ['Desktop', 'Tablet', 'Mobile']);
  assert.deepEqual(config.domains.spacing.perViewport.mobile, { min: 1, max: 80 });
});

test('a grid config contributes widths, and then viewports sort mobile first', () => {
  const { config } = normaliseConfig({
    collectionName: 'Responsive System',
    group: 'Grid',
    modes: [
      { name: 'desktop', containerWidth: 1920, columns: 12, gap: 40, padding: 80 },
      { name: 'mobile', containerWidth: 375, columns: 4, gap: 16, padding: 20 }
    ]
  });
  assert.deepEqual(config.viewports.map((v) => v.key), ['mobile', 'desktop']);
  assert.equal(config.viewports.find((v) => v.key === 'desktop').width, 1920);
  assert.deepEqual(config.domains.grid.perViewport.mobile, { containerWidth: 375, columns: 4, gap: 16, padding: 20 });
});

test('spacingScaling and fontScaling fold into scaling, spacingScaling winning', () => {
  const result = normaliseConfig({
    spacings: ['a'],
    spacingScaling: { type: 'quad', ease: 'out' },
    fontScaling: { type: 'sine', ease: 'in' }
  });
  assert.equal(result.config.domains.spacing.scaling.type, 'quad');
  assert.ok(translated(result).includes('spacingScaling'));
  assert.ok(codes(result).includes('config-ignored'), 'the loser is reported, not silently dropped');
});

test('roundTo precedence matches resolveRoundTo, all four spellings', () => {
  // All four still resolve the same way; they now land in one place instead of inside the curve.
  const of = (raw) => normaliseConfig(Object.assign({ spacings: ['a'] }, raw)).config.domains.spacing.roundTo;
  assert.equal(of({ roundTo: 2, scaling: { roundTo: 4 } }), 2, 'top level wins');
  assert.equal(of({ scaling: { roundTo: 4 } }), 4);
  assert.equal(of({ scaling: { roundUpperValuesTo: 8 } }), 8);
  assert.equal(of({ roundUpperValuesTo: 16 }), 16);
  assert.equal(of({}), undefined, 'no rounding is the absence of the field, not a zero');
});

test('typography keeps roundLowerValuesTo, and figmaStyles becomes styles', () => {
  const result = normaliseConfig({
    fontScale: ['Text-Small', 'Text-Regular'],
    fontScaling: { type: 'majorSecond', roundLowerValuesTo: 1, roundUpperValuesTo: 2 },
    figmaStyles: { create: true }
  });
  const slice = result.config.domains.typography;
  assert.deepEqual(slice.tokens, ['Text-Small', 'Text-Regular']);
  assert.equal(slice.roundLowerValuesTo, 1);
  assert.deepEqual(slice.styles, { create: true });
  assert.ok(translated(result).includes('figmaStyles'));
});

test('the font weights come back as the list the block holds, not the map a run promoted', () => {
  // **The complaint this fixes.** A run promotes `[400, 600]` into `{ "400": 400, "600": 600 }` — that is
  // the shape the generator names styles from, and it is what the manifest records. Handed back as an
  // object it went into a comma-list field, came back out as the *string* `"{ 400: 400, 600: 600 }"`, and
  // the run enumerated its characters: a text style per index, 0 to 28, under every token.
  const promoted = normaliseConfig({
    fontScale: ['Text-Small'], fontWeights: { 400: 400, 600: 600 }
  }).config;
  assert.deepEqual(toDomainConfig(promoted, 'typography').fontWeights, [400, 600]);

  // A name that is not its own value is the legacy spelling, and the naming is the whole of what it
  // says — so it stays a map.
  const named = normaliseConfig({
    fontScale: ['Text-Small'], fontWeights: { Regular: 400, Semibold: 600 }
  }).config;
  assert.deepEqual(toDomainConfig(named, 'typography').fontWeights, { Regular: 400, Semibold: 600 });

  // A style name promotes to a key equal to itself, so it demotes back too.
  const styles = normaliseConfig({
    fontScale: ['Text-Small'], fontWeights: { 400: 400, 'Semi Bold': 'Semi Bold' }
  }).config;
  assert.deepEqual(toDomainConfig(styles, 'typography').fontWeights, [400, 'Semi Bold']);
});

test('an unknown key survives under extra and is reported', () => {
  // Losing a field nobody has met yet on a round trip is worse than not understanding it.
  const result = normaliseConfig({ spacings: ['a'], someFutureThing: { nested: 1 } });
  assert.deepEqual(result.config.domains.spacing.extra.someFutureThing, { nested: 1 });
  assert.ok(codes(result).includes('config-unknown-key'));
  assert.deepEqual(toDomainConfig(result.config, 'spacing').someFutureThing, { nested: 1 },
    'and it comes back out the other side');
});

test('the domain is inferred from what the config carries', () => {
  assert.equal(configDomainOf({ spacings: ['a'] }), 'spacing');
  assert.equal(configDomainOf({ radii: ['a'] }), 'radius');
  assert.equal(configDomainOf({ fontScale: ['a'] }), 'typography');
  assert.equal(configDomainOf({ modes: [{ name: 'a', containerWidth: 100, columns: 4 }] }), 'grid');
  assert.equal(configDomainOf({ nothing: true }), null);
});

test('a config whose domain cannot be inferred is kept, not thrown away', () => {
  const result = normaliseConfig({ collectionName: 'C', mystery: 1 });
  assert.equal(result.config.collection, 'C');
  assert.ok(codes(result).includes('config-domain-unknown'));
  assert.deepEqual(result.config.domains.unknown.extra.mystery, 1);
});

// ---------------------------------------------------------------------------
// Shape properties
// ---------------------------------------------------------------------------

test('normalising is idempotent', () => {
  // Without this a round trip through a text layer drifts every time it is saved.
  const once = normaliseConfig(legacySpacingConfig()).config;
  const twice = normaliseConfig(once).config;
  assert.deepEqual(stripUpdated(twice), stripUpdated(once));
  assert.deepEqual(normaliseConfig(twice).translations, [], 'nothing left to translate');
});

function stripUpdated(config) {
  const copy = JSON.parse(JSON.stringify(config));
  delete copy.updated;
  return copy;
}

test('normalising does not mutate its input', () => {
  const legacy = legacySpacingConfig();
  const before = JSON.stringify(legacy);
  normaliseConfig(legacy);
  assert.equal(JSON.stringify(legacy), before);
});

test('garbage normalises to an empty config and never throws', () => {
  for (const raw of [null, undefined, '', 42, [], 'nope']) {
    const result = normaliseConfig(raw);
    assert.equal(result.config.v, 1, `for ${JSON.stringify(raw)}`);
    assert.deepEqual(result.config.viewports, []);
    assert.ok(result.warnings.length > 0);
  }
});

test('a portable config round-trips through its serialised form', () => {
  const { config } = normaliseConfig(legacySpacingConfig());
  const parsed = parsePortableConfig(serialisePortableConfig(config));
  assert.deepEqual(stripUpdated(parsed.config), stripUpdated(config));
  assert.deepEqual(parsed.warnings, []);
});

test('a text layer someone edited into invalid JSON reports where, and applies nothing', () => {
  const broken = '{ "v": 1, "collection": "C", }';
  const parsed = parsePortableConfig(broken);
  assert.equal(parsed.config, null);
  assert.ok(codes(parsed).includes('config-unparseable'));
  assert.ok(/line \d+/.test(parsed.warnings[0].message), 'the message locates it: ' + parsed.warnings[0].message);
});

test('an empty portable config is a valid one', () => {
  const empty = emptyPortableConfig();
  assert.equal(empty.v, 1);
  assert.deepEqual(empty.viewports, []);
  assert.deepEqual(empty.domains, {});
  assert.deepEqual(parsePortableConfig(serialisePortableConfig(empty)).warnings, []);
});

// ---------------------------------------------------------------------------
// toPortableConfig — building v1 from what the file holds
// ---------------------------------------------------------------------------

function foundationWith(sets) {
  return {
    viewports: [
      { key: 'mobile', label: 'Mobile', width: 375, widthSource: { kind: 'file', collection: 'RS' }, materialisedIn: ['RS'] },
      { key: 'desktop', label: 'Desktop', width: 1920, widthSource: { kind: 'registry' }, materialisedIn: ['RS'] }
    ],
    sets: sets,
    warnings: []
  };
}

test('a foundation with one set becomes a config you could paste', () => {
  const config = toPortableConfig(foundationWith([{
    collection: 'RS', domain: 'spacing', group: 'Spacing',
    modes: ['mobile', 'desktop'], tokens: ['xs', 'sm'], missing: [],
    config: { tokens: ['xs', 'sm'], scaling: { type: 'linear', roundTo: 2 } }
  }]));

  assert.equal(config.v, 1);
  assert.equal(config.collection, 'RS');
  assert.equal(config.group, 'Spacing');
  assert.deepEqual(config.viewports, [
    { key: 'mobile', label: 'Mobile', width: 375 },
    { key: 'desktop', label: 'Desktop', width: 1920 }
  ], 'viewport identity only — no widthSource, no materialisedIn');
  assert.deepEqual(config.domains.spacing.tokens, ['xs', 'sm']);
  assert.equal(config.sets, undefined, 'one set needs no set list');
});

test('two sets of one domain are both represented, and the overflow is reported', () => {
  const config = toPortableConfig(foundationWith([
    { collection: 'Spacing A', domain: 'spacing', group: 'Spacing', modes: ['mobile'], tokens: ['xs'], missing: [], config: { tokens: ['xs'] } },
    { collection: 'Spacing B', domain: 'spacing', group: 'Spacing', modes: ['mobile'], tokens: ['lg'], missing: [], config: { tokens: ['lg'] } }
  ]));

  assert.equal(config.sets.length, 2, 'nothing is lost');
  assert.deepEqual(config.sets.map((s) => s.collection), ['Spacing A', 'Spacing B']);
  assert.deepEqual(config.domains.spacing.tokens, ['xs'], 'the first is the convenience view');
});

test('two domains in one file come out as one pasteable config', () => {
  const config = toPortableConfig(foundationWith([
    { collection: 'RS', domain: 'grid', group: 'Grid', modes: ['mobile'], tokens: [], missing: [], config: { perViewport: { mobile: { columns: 4 } } } },
    { collection: 'RS', domain: 'spacing', group: 'Spacing', modes: ['mobile'], tokens: ['xs'], missing: [], config: { tokens: ['xs'] } }
  ]));
  assert.deepEqual(Object.keys(config.domains).sort(), ['grid', 'spacing']);
  assert.equal(config.sets, undefined, 'different domains do not collide');
});

test('a portable config carries no derived fields, whatever the manifest held', () => {
  const config = toPortableConfig(foundationWith([{
    collection: 'RS', domain: 'spacing', group: 'Spacing', modes: ['mobile'], tokens: ['xs'], missing: [],
    config: { tokens: ['xs'], spacingSizes: { mobile: { min: 1, max: 8 } } }
  }]));
  assert.equal(JSON.stringify(config).indexOf('spacingSizes'), -1);
});

// ---------------------------------------------------------------------------
// Nothing declared may fall through the round trip
// ---------------------------------------------------------------------------

/** The `@CONFIG_START` block of a shipped script, evaluated as the object it is. */
function shippedConfigBlock(file) {
  const source = fs.readFileSync(path.join(SCRIPTS, 'EXAMPLE_SCRIPTS', 'Design System Foundations', file), 'utf8');
  const start = source.indexOf('// @CONFIG_START');
  const end = source.indexOf('// @CONFIG_END');
  assert.ok(start !== -1 && end > start, file + ' has a config block');
  return vm.runInNewContext('({' + source.slice(start + '// @CONFIG_START'.length, end) + '})');
}

test('every field a shipped config declares survives the round trip', () => {
  // A declared field is an input, whatever else it is — `generateOverview` is a user-facing
  // toggle, not a derivation, and dropping it on import would quietly change what a run does.
  // Renames are allowed and listed; anything else lost or invented is a bug.
  const cases = [
    { file: 'grid.js', domain: 'grid', renames: {} },
    { file: 'spacing.js', domain: 'spacing', renames: {} },
    { file: 'corner-radius.js', domain: 'radius', renames: {} },
    { file: 'typography.js', domain: 'typography', renames: { figmaStyles: 'styles', fontScaling: 'scaling' } }
  ];

  for (const { file, domain, renames } of cases) {
    const declared = shippedConfigBlock(file);
    const back = toDomainConfig(normaliseConfig(declared).config, domain) || {};

    for (const key of Object.keys(declared)) {
      const landsAs = renames[key] || key;
      assert.ok(
        Object.prototype.hasOwnProperty.call(back, landsAs),
        `${file}: "${key}" did not survive (expected as "${landsAs}"). Kept: ${Object.keys(back).join(', ')}`
      );
    }

    // `roundTo` is promoted out of `scaling`/`fontScaling` wherever a block still writes it there:
    // it applies to every model, so it is a field of the config, not of a curve.
    const allowedExtra = Object.values(renames).concat(['roundLowerValuesTo', 'roundTo']);
    for (const key of Object.keys(back)) {
      if (Object.prototype.hasOwnProperty.call(declared, key)) continue;
      assert.ok(allowedExtra.includes(key), `${file}: invented "${key}", which the block never declared`);
    }
  }
});

test('generateOverview survives even when it is false', () => {
  // The falsy trap that cost us a whole plan on values of 0.
  const back = toDomainConfig(normaliseConfig({
    collectionName: 'C', group: 'Spacing', spacings: ['xs'], generateOverview: false,
    modes: [{ name: 'mobile', min: 1, max: 8 }]
  }).config, 'spacing');
  assert.strictEqual(back.generateOverview, false);
});

test('a rounding step is spelled one way, not two', () => {
  // Both `scaling.roundTo` and a top-level `roundTo` in one config means one of them is a lie in
  // the editor. **Which one is the truth changed**: rounding applies to every model, while
  // `scaling` describes a curve only the endpoints model reads — so a metric config was carrying
  // `scaling: { type: "sine", ease: "in", roundTo: 2 }` where two of the three fields were inert.
  // The top level is the home now, and every spelling promotes into it.
  const back = toDomainConfig(normaliseConfig(legacySpacingConfig()).config, 'spacing');
  assert.equal(back.roundTo, 2);
  assert.equal((back.scaling || {}).roundTo, undefined);
  assert.equal(back.roundUpperValuesTo, undefined);
});

// ---------------------------------------------------------------------------
// Printing a config back into a config block — what the clipboard actually carries
// ---------------------------------------------------------------------------

test('a pasted block keeps the mode order its author wrote', () => {
  // The registry is mobile-first by design (16a §2.2). A config block is not the registry —
  // reversing someone's modes array on a round trip would be a change they never asked for.
  const legacy = {
    collectionName: 'Responsive System', group: 'Grid',
    modes: [
      { name: 'desktop', containerWidth: 1920, columns: 12 },
      { name: 'tablet', containerWidth: 768, columns: 8 },
      { name: 'mobile', containerWidth: 375, columns: 4 }
    ]
  };
  const v1 = normaliseConfig(legacy).config;
  assert.deepEqual(v1.viewports.map((v) => v.key), ['mobile', 'tablet', 'desktop'], 'the registry sorts');
  assert.deepEqual(
    toDomainConfig(v1, 'grid').modes.map((m) => m.name),
    ['desktop', 'tablet', 'mobile'],
    'the config block does not'
  );
});

test('a grid config gains no scaling block it never had', () => {
  const grid = toDomainConfig(normaliseConfig({
    collectionName: 'C', group: 'Grid',
    modes: [{ name: 'mobile', containerWidth: 375, columns: 4 }]
  }).config, 'grid');
  assert.equal(grid.scaling, undefined, 'roundTo: 0 means no rounding, not a setting to carry');
  assert.equal(grid.roundTo, undefined);
});

test('a config prints as the block you paste, not as JSON', () => {
  const grid = toDomainConfig(normaliseConfig({
    collectionName: 'Responsive System',
    group: 'Grid',
    distributeToMaxColumns: false,
    extensionColumns: 0,
    modes: [
      { name: 'desktop', containerWidth: 1920, columns: 12, gap: 40, padding: 80 },
      { name: 'mobile', containerWidth: 375, columns: 4, gap: 16, padding: 20 }
    ]
  }).config, 'grid');

  const block = lib.formatConfigBlock(grid);

  assert.ok(block.startsWith('  collectionName: "Responsive System",'), block.split('\n')[0]);
  assert.ok(block.includes('  group: "Grid",'));
  assert.ok(block.includes('  modes: [\n    {\n      name: "desktop",'), 'objects in arrays are expanded, in the declared order:\n' + block);
  assert.ok(!/"collectionName"/.test(block), 'keys are unquoted, as the shipped blocks have them');
  assert.ok(!/\n\s*\}\s*$/.test(block), 'no outer braces — this goes inside an existing literal');
});

test('a printed block evaluates back to the config it came from', () => {
  // The property that matters: paste it into a config block and the script sees what was copied.
  const source = toDomainConfig(normaliseConfig(legacySpacingConfig()).config, 'spacing');
  const block = lib.formatConfigBlock(source);
  const roundTripped = vm.runInNewContext('({\n' + block + '\n})');
  assert.deepEqual(roundTripped, source);
});

test('printing survives the values a config can actually hold', () => {
  const tricky = {
    collectionName: 'Quote " and \\ backslash',
    'not-an-identifier': 1,
    empty: {},
    none: [],
    tokens: ['px', 'xs'],
    nested: { a: { b: [1, 2] } },
    flag: false,
    zero: 0
  };
  const block = lib.formatConfigBlock(tricky);
  assert.deepEqual(vm.runInNewContext('({\n' + block + '\n})'), tricky);
  assert.ok(block.includes('"not-an-identifier":'), 'a key that needs quotes gets them');
  assert.ok(block.includes('tokens: ["px", "xs"]'), 'primitive arrays stay on one line');
});

test('a domain with nothing to say prints nothing rather than an empty husk', () => {
  assert.equal(lib.formatConfigBlock(null), '');
  assert.equal(lib.formatConfigBlock({}), '');
});

test('the JSON shape leaves out keys that are only null', () => {
  const config = emptyPortableConfig();
  const json = serialisePortableConfig(config);
  assert.equal(json.indexOf('null'), -1, json);
  assert.deepEqual(parsePortableConfig(json).config.collection, null, 'and a reader restores them');
});

test('an empty foundation gives an empty config rather than nothing', () => {
  const config = toPortableConfig({ viewports: [], sets: [], warnings: [] });
  assert.equal(config.v, 1);
  assert.deepEqual(config.domains, {});
});

test('a manifest recorded before the curve rule does not hand the curve back', () => {
  // Found in a real file: corner radius still exported `scaling: { type: "sine", ease: "in" }`
  // after the rule that removes it, because its manifest predated the rule by four hours. The
  // writer strips it; so must the reader, or the problem simply waits for an old file.
  const stale = {
    v: 1, collection: 'RS', group: 'Corner radius', viewports: [{ key: 'desktop', label: 'Desktop', width: null }],
    domains: {
      radius: {
        tokens: ['none', 'xs'],
        scaling: { type: 'sine', ease: 'in', roundTo: 2 },
        perViewport: { desktop: { model: 'metric', min: 0, base: { level: 'xs', size: 4 }, step: 4, mod: 3 } },
        extra: {}
      }
    }
  };
  const back = toDomainConfig(stale, 'radius');
  assert.equal((back.scaling || {}).type, undefined);
  assert.equal((back.scaling || {}).ease, undefined);
  assert.equal(back.roundTo, 2, 'the rounding it really does declare survives');
});

test('an endpoints manifest keeps its curve, whenever it was written', () => {
  const endpoints = {
    v: 1, collection: 'RS', group: 'Spacing', viewports: [{ key: 'desktop', label: 'Desktop', width: null }],
    domains: {
      spacing: {
        tokens: ['xs', 'sm'], scaling: { type: 'sine', ease: 'in' },
        perViewport: { desktop: { model: 'endpoints', min: 4, max: 64 } }, extra: {}
      }
    }
  };
  assert.equal(toDomainConfig(endpoints, 'spacing').scaling.type, 'sine');
});

test('a slice that names no model keeps its curve', () => {
  // Absent means endpoints, the older default. Silence is not permission to drop something.
  const quiet = {
    v: 1, collection: 'RS', group: 'Spacing', viewports: [],
    domains: { spacing: { tokens: ['xs'], scaling: { type: 'quad' }, perViewport: {}, extra: {} } }
  };
  assert.equal(toDomainConfig(quiet, 'spacing').scaling.type, 'quad');
});

test('a config still imports when nothing is a viewport', () => {
  // Step 3's real risk. Unmatched modes stop becoming viewports, so a file where Grid has never
  // run has an empty viewport list — and `toDomainConfig` reads viewports to rebuild `modes[]`.
  // What saves it is `viewportOrder`, recorded on each set at generation time: the run knew the
  // order even if the registry never did. Without this test, step 3 would silently make import
  // return a config with no modes on exactly the files most likely to need it.
  const v1 = {
    v: 1, collection: 'RS', group: 'Spacing',
    viewports: [],
    domains: {
      spacing: {
        tokens: ['xs', 'sm'],
        viewportOrder: ['desktop', 'mobile'],
        perViewport: {
          desktop: { model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4, mod: 3 },
          mobile: { model: 'metric', min: 1, base: { level: 'xs', size: 2 }, step: 2, mod: 3 }
        },
        extra: {}
      }
    }
  };
  const back = toDomainConfig(v1, 'spacing');
  assert.ok(back, 'no config at all would be the silent failure');
  assert.deepEqual(back.modes.map((m) => m.name), ['desktop', 'mobile']);
  assert.equal(back.modes[0].step, 4);
});

test('a portable config from a registry-less file carries no invented viewports', () => {
  // The other half: the config says what the file holds, and an empty registry means it holds no
  // viewport list. Emitting three from the collection's modes is what step 3 removed.
  const config = toPortableConfig({
    viewports: [],
    unregisteredModes: [
      { collection: 'RS', name: 'Tight', key: 'tight', modeId: null },
      { collection: 'RS', name: 'Relaxed', key: 'relaxed', modeId: null }
    ],
    sets: [],
    warnings: []
  });
  assert.deepEqual(config.viewports, []);
  assert.equal(JSON.stringify(config).indexOf('Tight'), -1, 'a density mode is not a viewport');
});

test('a recorded Grid set comes back as the config that made it', () => {
  // Grid records a manifest now, like the ramps — plan 19's contract is that a run records the whole
  // `domains[domain]` slice, and Grid simply predated it, which left its panel with an auto-import
  // that could never fire.
  //
  // The risk worth checking rather than assuming: `foundationSliceKeys` and `foundationDomainKeys`
  // are hand-written lists, and a grid key missing from either would be dropped on the way in — the
  // seventh instance of that shape in this codebase. This asserts every field survives, per-mode
  // payload included.
  const config = {
    collectionName: 'Responsive System',
    group: 'Grid',
    extensionColumns: 4,
    generateOverview: true,
    modes: [
      { name: 'desktop', containerWidth: 1920, columns: 12, gap: 40, padding: 80 },
      { name: 'mobile', containerWidth: 375, columns: 4, gap: 16, padding: 20 }
    ]
  };

  const slice = normaliseConfig(config).config.domains.grid;
  assert.ok(slice, 'grid was not recognised as a domain');

  // Exactly what `foundationAutoImport` does with what it reads back.
  const back = toDomainConfig({
    v: 1, collection: 'Responsive System', group: 'Grid', viewports: [], domains: { grid: slice }
  }, 'grid');

  assert.equal(back.extensionColumns, 4, 'a top-level grid key was dropped');
  assert.equal(back.generateOverview, true);
  assert.deepEqual(back.modes.map((m) => m.name), ['desktop', 'mobile'], 'and in the order declared');
  assert.deepEqual(back.modes[0], {
    name: 'desktop', containerWidth: 1920, columns: 12, gap: 40, padding: 80
  }, 'the per-mode payload must survive whole');
  assert.deepEqual(back.modes[1], {
    name: 'mobile', containerWidth: 375, columns: 4, gap: 16, padding: 20
  });
});

test('a Grid manifest keeps mode order without needing the registry', () => {
  // The same property the ramps rely on: `viewportOrder` is recorded on the slice, so a file whose
  // registry is empty still gets its modes back in the order the run used.
  const slice = normaliseConfig({
    collectionName: 'RS', group: 'Grid',
    modes: [
      { name: 'mobile', containerWidth: 375, columns: 4, gap: 16, padding: 20 },
      { name: 'desktop', containerWidth: 1920, columns: 12, gap: 40, padding: 80 }
    ]
  }).config.domains.grid;

  assert.deepEqual(slice.viewportOrder, ['mobile', 'desktop']);
  const back = toDomainConfig({ v: 1, collection: 'RS', viewports: [], domains: { grid: slice } }, 'grid');
  assert.deepEqual(back.modes.map((m) => m.name), ['mobile', 'desktop']);
});

test('a config still carrying distributeToMaxColumns is reported, not carried through', () => {
  // Removed rather than deprecated: `round(s × N ÷ maxCols)` made tokens collide — on an 8-column mode
  // `col-1` and `col-2` both became one column, `col-4` and `col-5` both became three, so twelve
  // tokens held eight distinct widths. It is no longer a declared field, so an old config carrying it
  // lands in `extra` with a warning naming it, rather than round-tripping as though it still worked.
  const result = normaliseConfig({
    collectionName: 'RS', group: 'Grid',
    distributeToMaxColumns: true,
    modes: [{ name: 'desktop', containerWidth: 1440, columns: 12, gap: 24, padding: 80 }]
  });
  const slice = result.config.domains.grid;

  assert.equal(slice.distributeToMaxColumns, undefined, 'not a declared field any more');
  assert.equal(slice.extra.distributeToMaxColumns, true, 'kept, because the author wrote it');
  assert.ok(
    result.warnings.some((w) => w.message.indexOf('distributeToMaxColumns') !== -1),
    'and named, so it is not silently inert'
  );

  // It *does* come back out, because `extra` exists so an author's key is never lost — and that is
  // the right end of the chain: the value reaches the script, and the script reports that it is no
  // longer supported and ignores it. Two honest signals rather than a disappearance.
  assert.equal(toDomainConfig(result.config, 'grid').distributeToMaxColumns, true);

  const grid = fs.readFileSync(path.join(SCRIPTS, 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'grid.js'), 'utf8');
  assert.match(grid, /distributeToMaxColumns is no longer supported and was ignored/);
  assert.equal(/function slotToProportionalSpan/.test(grid), false, 'the arithmetic is gone, not just unused');
});

test('every foundation script records the set it wrote', () => {
  // **Typography did not, and the panel could not tell.** The read half was built — the config block carries
  // `@fromFile: domains.typography` and auto-import knows how to fill from it — but nothing ever wrote the
  // record, so opening the script in a file that already had a typography set showed the shipped ten tokens
  // instead of the four the file holds. Grid's own comment names the shape: *"an auto-import that could
  // never fire — a feature that lies."*
  //
  // Checked on the source rather than by running, because the failure is an absence: there is no wrong
  // output to catch, only a call that is not there.
  const dir = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');
  const viaRunner = { 'spacing.js': 'runLinearRamp', 'corner-radius.js': 'runLinearRamp' };
  const missing = [];

  for (const file of ['spacing.js', 'corner-radius.js', 'typography.js', 'grid.js']) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    // Either it calls `writeManifest` itself, or it hands the whole run to a library that does.
    const records = /writeManifest\s*\(/.test(source) ||
      (viaRunner[file] && new RegExp(viaRunner[file] + '\\s*\\(').test(source));
    if (!records) missing.push(file);
  }

  assert.deepEqual(missing, [],
    'these write variables and never record what they wrote, so their panel has nothing to load: ' +
      missing.join(', '));
});

test('the typography manifest carries the tokens the panel needs back', () => {
  // The token list is the thing that was wrong on screen — ten shipped names over four real ones — so it is
  // the thing worth asserting travels.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'typography.js'),
    'utf8'
  );
  assert.match(source, /domain: 'typography'/);
  assert.match(source, /tokens: typeScaleTokens\(config\)/, 'the real token list, not an empty array');
  assert.match(source, /config: normaliseConfig\(config\)\.config\.domains\.typography/);
});

// ---------------------------------------------------------------------------
// Loading the tokens a file already has
// ---------------------------------------------------------------------------

/** A Figma stub with one collection and the variable names given. */
function fileWith(names, modes) {
  const vars = names.map((name, i) => ({ id: 'v' + i, name }));
  const collection = {
    name: 'Responsive System',
    variableIds: vars.map((v) => v.id),
    modes: (modes || ['Desktop']).map((n, i) => ({ modeId: 'm' + i, name: n })),
    getSharedPluginData: () => '',
    getSharedPluginDataKeys: () => [],
  };
  return {
    variables: {
      getLocalVariableCollectionsAsync: async () => [collection],
      getVariableByIdAsync: async (id) => vars.filter((v) => v.id === id)[0] || null,
    },
    root: { getSharedPluginData: () => '' },
  };
}

function loadFoundation(figmaStub) {
  const vm = require('node:vm');
  const ctx = {
    figma: figmaStub, console: { log() {}, warn() {}, error() {} },
    Math, String, Array, Object, JSON, Date, isNaN, isFinite, parseInt, parseFloat, Number, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'),
    ctx
  );
  return ctx;
}

test('a panel with no manifest loads the token names the file actually has', async () => {
  // **The complaint this fixes.** Opening Typography on a file holding four tokens showed the shipped ten,
  // because nothing recorded is not the same as nothing there. Only Grid read the variables; every other
  // domain gave up.
  const ctx = loadFoundation(fileWith([
    'Typography/Text-Tiny/font-size', 'Typography/Text-Tiny/line-height', 'Typography/Text-Tiny/letter-spacing',
    'Typography/Text-Small/font-size', 'Typography/Text-Small/line-height',
    'Typography/Text-Regular/font-size',
    'Typography/Text-Large/font-size',
    // Not tokens: no `font-size` under them.
    'Typography/font-weight/400', 'Typography/font-weight/600', 'Typography/font-family/primary',
  ], ['Desktop', 'Mobile']));

  const found = await ctx.foundationAutoImport('Responsive System', 'Typography', 'typography');
  assert.equal(found.source, 'recognised');
  assert.deepEqual(found.tokens, ['Text-Tiny', 'Text-Small', 'Text-Regular', 'Text-Large']);
  assert.deepEqual(found.config, { fontScale: ['Text-Tiny', 'Text-Small', 'Text-Regular', 'Text-Large'] });
  assert.deepEqual(found.modes, ['Desktop', 'Mobile']);
});

test('a flat domain takes the leaf as the token, and skips anything nested', async () => {
  const ctx = loadFoundation(fileWith([
    'Spacing/px', 'Spacing/xs', 'Spacing/sm',
    // A nested name under the same group is not one of this domain's tokens.
    'Spacing/legacy/old-md',
    // Another group entirely.
    'Corner radius/none',
  ]));
  const found = await ctx.foundationAutoImport('Responsive System', 'Spacing', 'spacing');
  assert.deepEqual(found.tokens, ['px', 'xs', 'sm']);
  assert.deepEqual(found.config, { spacings: ['px', 'xs', 'sm'] });
});

test('it loads the names and says nothing about the scale', async () => {
  // Recognising *how* a set was made is `adoptRamp`'s question and a much larger one. A panel opening on
  // somebody's collection is asking what the tokens are — answering only that lets a real set load without
  // the panel claiming to know how it was built, and every scale control keeps what it holds because
  // `fillConfigBlock` writes the keys a payload carries and leaves the rest.
  const ctx = loadFoundation(fileWith(['Spacing/px', 'Spacing/xs']));
  const found = await ctx.foundationAutoImport('Responsive System', 'Spacing', 'spacing');
  assert.deepEqual(Object.keys(found.config), ['spacings'], 'the token list and nothing else');
});

test('an address holding nothing loads nothing', async () => {
  const ctx = loadFoundation(fileWith(['Spacing/px', 'Spacing/xs']));
  const found = await ctx.foundationAutoImport('Responsive System', 'Typography', 'typography');
  assert.equal(found.source, 'none');
  assert.equal(found.config, null, 'an empty answer, not an empty set');
});
