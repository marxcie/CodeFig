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
  const of = (raw) => normaliseConfig(Object.assign({ spacings: ['a'] }, raw)).config.domains.spacing.scaling.roundTo;
  assert.equal(of({ roundTo: 2, scaling: { roundTo: 4 } }), 2, 'top level wins');
  assert.equal(of({ scaling: { roundTo: 4 } }), 4);
  assert.equal(of({ scaling: { roundUpperValuesTo: 8 } }), 8);
  assert.equal(of({ roundUpperValuesTo: 16 }), 16);
  assert.equal(of({}), 0);
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

    const allowedExtra = Object.values(renames).concat(['roundLowerValuesTo']);
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
  // Both `scaling.roundTo` and a top-level `roundTo` in one config means one of them is a lie
  // in the editor. The scripts read either; the shipped blocks put it inside `scaling`.
  const back = toDomainConfig(normaliseConfig(legacySpacingConfig()).config, 'spacing');
  assert.equal(back.scaling.roundTo, 2);
  assert.equal(back.roundTo, undefined);
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
