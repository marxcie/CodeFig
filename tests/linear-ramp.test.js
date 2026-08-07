/**
 * The safety net for plan 19: `@Linear Ramp` must generate exactly what `spacing.js` and
 * `corner-radius.js` generate today, value for value.
 *
 * A collapse of two near-identical scripts into one is only safe if it provably changes nothing,
 * and "provably" means running both. So every case here evaluates the **frozen originals** from
 * `tests/fixtures/` and the **new library**, pushes the same config through each, and compares
 * the variables that come out — names, per-mode values and scopes.
 *
 * That is also why plan 19 forbids adding scale models on the way through: new behaviour would
 * destroy the comparison that makes the collapse safe. Models are 19b, after this lands.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const FIXTURES = path.join(__dirname, 'fixtures');

/**
 * Load a script's functions — and its top-level SHOUTY_CASE tables, which `@import` cannot
 * extract either and which the validators close over — into one context.
 */
function loadInto(ctx, source) {
  for (const table of source.match(/^var [A-Z][A-Z0-9_]* = \{[\s\S]*?\n\};/gm) || []) {
    vm.runInContext(table, ctx);
  }
  for (const [, code] of resolver.extractFunctionMap(source)) {
    vm.runInContext(code, ctx);
  }
}

function baseContext() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, String, Array, Object, JSON, Date, isNaN, isFinite, parseInt, parseFloat, Number, RegExp
  };
  vm.createContext(ctx);
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'));
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@math-helpers.js'), 'utf8'));
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@scale-models.js'), 'utf8'));
  return ctx;
}

/** The old world: one frozen generator, with its own pipeline. */
function frozenGenerator(fixture, entry) {
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(FIXTURES, fixture), 'utf8'));
  return function generate(config) {
    const data = JSON.parse(JSON.stringify(config));
    ctx[entry.ensureCompat](data);
    ctx[entry.materialiseTokens](data);
    ctx[entry.materialiseSizes](data);
    return ctx[entry.generate](data);
  };
}

/** The new world: one library, told which domain it is generating for. */
function rampGenerator(specName) {
  const ctx = baseContext();
  const rampPath = path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js');
  assert.ok(fs.existsSync(rampPath), '@linear-ramp.js does not exist yet');
  loadInto(ctx, fs.readFileSync(rampPath, 'utf8'));
  return function generate(config) {
    const spec = ctx[specName]();
    const data = JSON.parse(JSON.stringify(config));
    ctx.ensureCompatRampConfig(data, spec);
    ctx.materialiseRampTokens(data, spec);
    ctx.materialiseRampSizes(data, spec);
    return ctx.generateRampVariables(data, spec);
  };
}

const SPACING_BEFORE = {
  ensureCompat: 'ensureCompatSpacingConfig',
  materialiseTokens: 'materializeSpacingsFromSteps',
  materialiseSizes: 'materializeSpacingSizes',
  generate: 'generateSpacingVariables'
};

const RADIUS_BEFORE = {
  ensureCompat: 'ensureCompatRadiusConfig',
  materialiseTokens: 'materializeRadiiFromSteps',
  materialiseSizes: 'materializeRadiusSizes',
  generate: 'generateCornerRadiusVariables'
};

/** A `@CONFIG_START` block, evaluated as the object it is. */
function configBlockOf(source) {
  const start = source.indexOf('// @CONFIG_START');
  const end = source.indexOf('// @CONFIG_END');
  return vm.runInNewContext('({' + source.slice(start + '// @CONFIG_START'.length, end) + '})');
}

/**
 * The block as it was **before** plan 19b changed the shipped default to metric.
 *
 * The property under test is "an existing config does not move", and the frozen block is what an
 * existing config looks like. Reading the live block instead would quietly become a comparison of
 * the new default against itself the moment a default changes.
 */
function frozenConfigBlock(fixture) {
  return configBlockOf(fs.readFileSync(path.join(FIXTURES, fixture), 'utf8'));
}

/** The block as it ships today. */
function shippedConfigBlock(file) {
  return configBlockOf(fs.readFileSync(path.join(SCRIPTS, 'EXAMPLE_SCRIPTS', 'Design System Foundations', file), 'utf8'));
}

const DOMAINS = [
  {
    label: 'spacing',
    fixture: 'spacing-before-19.js',
    before: SPACING_BEFORE,
    spec: 'spacingRampSpec',
    block: 'spacing.js',
    tokensKey: 'spacings',
    scopes: ['WIDTH_HEIGHT', 'GAP'],
    aliases: ['spacingScaling', 'fontScaling'],
    notMyAlias: 'cornerRadiusScaling',
    template: 'space-{$index}'
  },
  {
    label: 'radius',
    fixture: 'corner-radius-before-19.js',
    before: RADIUS_BEFORE,
    spec: 'radiusRampSpec',
    block: 'corner-radius.js',
    tokensKey: 'radii',
    scopes: ['CORNER_RADIUS'],
    aliases: ['radiusScaling', 'cornerRadiusScaling', 'fontScaling'],
    notMyAlias: null,
    template: 'radius-{$index}'
  }
];

for (const domain of DOMAINS) {
  const before = () => frozenGenerator(domain.fixture, domain.before);
  const after = () => rampGenerator(domain.spec);

  test(`${domain.label}: the shipped config generates identical variables`, () => {
    const config = frozenConfigBlock(domain.fixture);
    const old = before()(config);
    assert.ok(Object.keys(old).length > 0, 'the fixture really generated something');
    assert.deepEqual(after()(config), old);
  });

  test(`${domain.label}: a template plus steps generates identically`, () => {
    const config = Object.assign(frozenConfigBlock(domain.fixture), {
      [domain.tokensKey]: domain.template,
      steps: 5
    });
    assert.deepEqual(after()(config), before()(config));
  });

  test(`${domain.label}: every scaling alias it accepts still means the same`, () => {
    for (const alias of domain.aliases) {
      const config = frozenConfigBlock(domain.fixture);
      delete config.scaling;
      config[alias] = { type: 'quad', ease: 'out', roundUpperValuesTo: 4 };
      assert.deepEqual(after()(config), before()(config), alias);
    }
  });

  if (domain.notMyAlias) {
    test(`${domain.label}: an alias it never accepted is still ignored`, () => {
      // The two have already drifted — radius takes `cornerRadiusScaling` and spacing does not.
      // Collapsing them must not quietly grant spacing a new alias.
      const config = frozenConfigBlock(domain.fixture);
      config[domain.notMyAlias] = { type: 'quad', ease: 'out' };
      assert.deepEqual(after()(config), before()(config));
    });
  }

  test(`${domain.label}: the rounding ladder resolves identically, all four spellings`, () => {
    const roundings = [
      { roundTo: 3 },
      { scaling: { type: 'sine', ease: 'in', roundTo: 5 } },
      { scaling: { type: 'sine', ease: 'in', roundUpperValuesTo: 8 } },
      { roundUpperValuesTo: 10 }
    ];
    for (const rounding of roundings) {
      const config = Object.assign(frozenConfigBlock(domain.fixture), rounding);
      assert.deepEqual(after()(config), before()(config), JSON.stringify(rounding));
    }
  });

  test(`${domain.label}: variables carry this domain's scopes`, () => {
    const generated = after()(frozenConfigBlock(domain.fixture));
    for (const name of Object.keys(generated)) {
      assert.deepEqual(generated[name].scopes, domain.scopes, name);
      assert.equal(generated[name].type, 'FLOAT', name);
    }
  });

  test(`${domain.label}: a token of 0 is generated, not skipped`, () => {
    const config = Object.assign(frozenConfigBlock(domain.fixture), {
      modes: [{ name: 'mobile', min: 0, max: 0 }]
    });
    const generated = after()(config);
    const first = generated[Object.keys(generated)[0]];
    assert.strictEqual(first.values.Mobile, 0);
    assert.deepEqual(generated, before()(config));
  });

  test(`${domain.label}: a monotonic bump still bumps`, () => {
    // A flat min/max range makes every step collide, which is what the guard exists for.
    const config = Object.assign(frozenConfigBlock(domain.fixture), {
      scaling: { type: 'linear', ease: 'none', roundTo: 4 },
      modes: [{ name: 'mobile', min: 4, max: 12 }]
    });
    assert.deepEqual(after()(config), before()(config));
  });
}

test('the two domains stay different where they are supposed to be', () => {
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spacing = ctx.spacingRampSpec();
  const radius = ctx.radiusRampSpec();

  assert.equal(spacing.domain, 'spacing');
  assert.equal(radius.domain, 'radius');
  assert.deepEqual(spacing.scopes, ['WIDTH_HEIGHT', 'GAP']);
  assert.deepEqual(radius.scopes, ['CORNER_RADIUS']);
  assert.equal(spacing.nameTemplate, 'space-{$index}');
  assert.equal(radius.nameTemplate, 'radius-{$index}');
  assert.ok(!spacing.scalingAliases.includes('cornerRadiusScaling'));
  assert.ok(radius.scalingAliases.includes('cornerRadiusScaling'));
});

test('the frozen references are still the originals', () => {
  // If someone edits a fixture to make a test pass, the comparison stops meaning anything.
  for (const domain of DOMAINS) {
    const frozen = fs.readFileSync(path.join(FIXTURES, domain.fixture), 'utf8');
    assert.ok(frozen.indexOf('@CONFIG_START') !== -1, domain.fixture + ' looks truncated');
    assert.ok(frozen.length > 10000, domain.fixture + ' looks truncated');
    assert.ok(
      frozen.indexOf('runLinearRamp') === -1,
      domain.fixture + ' mentions the new generator — it is meant to be the old one'
    );
  }
});

// ---------------------------------------------------------------------------
// The manifest contract
// ---------------------------------------------------------------------------

test('the recorded slice is the whole config, not a hand-picked subset', () => {
  // The gap a hand-written manifest exposed: a partial slice round-trips faithfully as a partial
  // config, so a field left out here is a field that vanishes from the editor on import.
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));

  for (const domain of DOMAINS) {
    const spec = ctx[domain.spec]();
    const declared = shippedConfigBlock(domain.block);
    const resolved = JSON.parse(JSON.stringify(declared));
    ctx.ensureCompatRampConfig(resolved, spec);
    ctx.materialiseRampTokens(resolved, spec);
    ctx.materialiseRampSizes(resolved, spec);

    const slice = ctx.rampManifestSlice(resolved, spec);
    assert.ok(slice, domain.label + ': nothing to record');

    // Importing the manifest reproduces the config the run used.
    const imported = ctx.toDomainConfig(
      { v: 1, collection: declared.collectionName, group: declared.group, viewports: [], domains: { [spec.domain]: slice } },
      spec.domain
    );
    for (const key of Object.keys(declared)) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(imported, key),
        `${domain.label}: "${key}" was declared but is not in the recorded manifest`
      );
    }

    // And regenerating from it produces the same variables.
    const again = JSON.parse(JSON.stringify(imported));
    ctx.ensureCompatRampConfig(again, spec);
    ctx.materialiseRampTokens(again, spec);
    ctx.materialiseRampSizes(again, spec);
    assert.deepEqual(
      ctx.generateRampVariables(again, spec),
      ctx.generateRampVariables(resolved, spec),
      domain.label + ': a round trip through its own manifest changed the values'
    );
  }
});

test('a recorded slice carries no derivation a run wrote onto the config', () => {
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.spacingRampSpec();
  const resolved = shippedConfigBlock('spacing.js');
  ctx.ensureCompatRampConfig(resolved, spec);
  ctx.materialiseRampTokens(resolved, spec);
  ctx.materialiseRampSizes(resolved, spec);
  assert.ok(resolved.spacingSizes, 'the fixture really is a resolved config');

  const slice = ctx.rampManifestSlice(resolved, spec);
  assert.equal(JSON.stringify(slice).indexOf('spacingSizes'), -1);
});

// ---------------------------------------------------------------------------
// Modes a run did not declare
// ---------------------------------------------------------------------------

test('a run names the modes it left holding copied values', () => {
  // Figma copies the first mode's values into every mode it creates, so a config that declares
  // fewer viewports than its collection has leaves numbers behind that nothing chose. Modes are
  // only ever added, which is right — but saying nothing about it reads as a bug later.
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const radius = ctx.radiusRampSpec();

  assert.equal(
    ctx.describeUndeclaredModes(radius, ['Mobile'], ['Mobile', 'Desktop']),
    "Corner radius defines 1 of this collection's 2 modes; Desktop keeps copied values."
  );
  assert.equal(
    ctx.describeUndeclaredModes(radius, ['Mobile'], ['Mobile', 'Tablet', 'Desktop']),
    "Corner radius defines 1 of this collection's 3 modes; Tablet, Desktop keep copied values."
  );
});

test('a run that covers every mode says nothing about it', () => {
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spacing = ctx.spacingRampSpec();
  assert.equal(ctx.describeUndeclaredModes(spacing, ['Mobile', 'Desktop'], ['Mobile', 'Desktop']), null);
  assert.equal(ctx.describeUndeclaredModes(spacing, [], []), null);
});

// ---------------------------------------------------------------------------
// The shipped defaults, which changed in 19b
// ---------------------------------------------------------------------------

test('the shipped defaults generate the metric sequence a design system doc describes', () => {
  // 4, 8, 12, 16, 24, 32 on desktop — a base of 4 stepping every third token, with `px` held at
  // the minimum of 1 because the model would put it at 0.
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.spacingRampSpec();
  const config = shippedConfigBlock('spacing.js');

  ctx.ensureCompatRampConfig(config, spec);
  ctx.materialiseRampTokens(config, spec);
  ctx.materialiseRampSizes(config, spec);
  const generated = ctx.generateRampVariables(config, spec);

  const desktop = Object.keys(generated).map((name) => generated[name].values.Desktop);
  assert.deepEqual(desktop, [1, 4, 8, 12, 16, 24]);
  assert.deepEqual(Object.keys(generated), [
    'Spacing/px', 'Spacing/xs', 'Spacing/sm', 'Spacing/md', 'Spacing/lg', 'Spacing/xl'
  ], 'the token names did not change — only how their values are described');
});

test('the shipped radius defaults start at zero and step up', () => {
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.radiusRampSpec();
  const config = shippedConfigBlock('corner-radius.js');

  ctx.ensureCompatRampConfig(config, spec);
  ctx.materialiseRampTokens(config, spec);
  ctx.materialiseRampSizes(config, spec);
  const generated = ctx.generateRampVariables(config, spec);

  // The base sits at `xs`, so `none` is one step below it at 0 and the growth starts from there.
  assert.deepEqual(Object.keys(generated).map((n) => generated[n].values.Desktop), [0, 4, 8, 12, 16, 24]);
});

test('a run says which model produced its numbers', () => {
  // The shipped defaults changed, and prebuilt scripts reload from the embedded source — so the
  // reason the numbers moved has to be in the same block that reports the move.
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.spacingRampSpec();
  const config = shippedConfigBlock('spacing.js');
  ctx.ensureCompatRampConfig(config, spec);
  ctx.materialiseRampTokens(config, spec);
  ctx.materialiseRampSizes(config, spec);

  const lines = ctx.describeRampModels(config, spec);
  assert.match(lines[0], /Desktop: metric, base 4, step 4, mod 3/);
  // And the expected consequence of that base, in context rather than as an interruption.
  assert.match(lines[1], /px held at the minimum of 1\./);
  assert.equal(lines.filter((l) => /metric, base/.test(l)).length, 3, 'one per viewport');

  // An unconfigured (endpoints) config says so too, with the numbers that shaped it.
  const frozen = frozenConfigBlock('spacing-before-19.js');
  ctx.ensureCompatRampConfig(frozen, spec);
  ctx.materialiseRampSizes(frozen, spec);
  assert.match(ctx.describeRampModels(frozen, spec)[0], /endpoints, min 1, max 200, sine/);
});

test('two steps that round onto the same number are named, not silently bumped', () => {
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.spacingRampSpec();
  assert.equal(
    ctx.describeRampCollision('sm', 'md', 8, { model: 'modular', ratio: 1.06 }, 2),
    "sm and md both round to 8 — ratio 1.06 with a grid of 2 can't separate them."
  );
  assert.match(
    ctx.describeRampCollision('sm', 'md', 8, { model: 'metric', step: 1 }, 4),
    /a step of 1 with a grid of 4/
  );
});

// ---------------------------------------------------------------------------
// Adoption, round-tripped through the manifest
// ---------------------------------------------------------------------------

/**
 * The hop the recognition sweep skips.
 *
 * `tests/recognise-scale.test.js` proves recognise → generate. This proves
 * recognise → **write manifest → read manifest** → generate, which is where an adopted metric
 * scale regenerated as 4, 5, 6, 8, 12: `base` means `{level, size}` in a config's `modes[]` and a
 * plain number in `@Scale Models`, and the translation only existed in one direction. The
 * recogniser's answer was correct at every step and wrong by the time it reached the generator.
 */
function adoptionRoundTrip(ctx, spec, tokens, valuesByMode) {
  const fits = {};
  for (const mode of Object.keys(valuesByMode)) {
    fits[mode] = {
      order: tokens,
      values: valuesByMode[mode],
      recognised: ctx.recogniseScale(valuesByMode[mode])
    };
  }

  // Through the manifest: the slice is normalised on the way in, exactly as writeManifest does.
  const slice = ctx.normaliseDomainSlice(ctx.rampAdoptionSlice(fits, tokens, 'Spacing', 'C'));
  const viewports = Object.keys(valuesByMode).map((mode) => ({
    key: ctx.viewportKeyFromLabel(mode), label: mode, width: null
  }));
  const config = ctx.toDomainConfig(
    { v: 1, collection: 'C', group: 'Spacing', viewports, domains: { spacing: slice } },
    'spacing'
  );

  ctx.ensureCompatRampConfig(config, spec);
  ctx.materialiseRampTokens(config, spec);
  ctx.materialiseRampSizes(config, spec);
  const generated = ctx.generateRampVariables(config, spec);

  const out = {};
  for (const mode of Object.keys(valuesByMode)) {
    out[mode] = tokens.map((t) => generated['Spacing/' + t].values[mode]);
  }
  return { fits, generated: out };
}

test('adoption survives the manifest: every model, swept', () => {
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.spacingRampSpec();
  const tokens = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

  const cases = [];
  for (const step of [1, 2, 4]) {
    for (const mod of [2, 3]) {
      cases.push(['metric', { steps: 6, min: 0, baseValue: 4, baseIndex: 0, step, mod }]);
      cases.push(['metric', { steps: 6, min: 4, baseValue: 8, baseIndex: 2, step, mod }]);
    }
  }
  for (const ratio of ['majorSecond', 'majorThird', 'perfectFifth']) {
    cases.push(['modular', { steps: 6, min: 0, baseValue: 8, baseIndex: 0, ratio }]);
    cases.push(['modular', { steps: 6, min: 0, baseValue: 16, baseIndex: 3, ratio }]);
  }

  for (const [model, options] of cases) {
    const values = ctx.scaleSequence(model, options).values;
    const label = `${model} ${JSON.stringify(options)} → ${values.join(',')}`;
    const { fits, generated } = adoptionRoundTrip(ctx, spec, tokens, { Desktop: values });

    assert.equal(fits.Desktop.recognised.model, model, label);
    assert.ok(fits.Desktop.recognised.exact, label);
    assert.deepEqual(generated.Desktop, values, 'regenerated from its own manifest: ' + label);
  }
});

test("adoption survives the manifest: the shipped default's own numbers", () => {
  // 1, 4, 8, 12, 16, 24 with `px` floored — the case that failed in Figma, in Node now.
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.spacingRampSpec();
  const tokens = ['px', 'xs', 'sm', 'md', 'lg', 'xl'];
  const values = { Desktop: [1, 4, 8, 12, 16, 24], Mobile: [1, 2, 4, 6, 8, 12] };

  const { fits, generated } = adoptionRoundTrip(ctx, spec, tokens, values);

  assert.equal(fits.Desktop.recognised.model, 'metric');
  assert.equal(fits.Desktop.recognised.options.baseIndex, 1);
  assert.deepEqual(generated.Desktop, values.Desktop);
  assert.deepEqual(generated.Mobile, values.Mobile);
});

test('adoption survives the manifest: an explicit table', () => {
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.spacingRampSpec();
  const tokens = ['xs', 'sm', 'md', 'lg'];
  const values = { Desktop: [3, 7, 13, 29] };

  const { fits, generated } = adoptionRoundTrip(ctx, spec, tokens, values);
  assert.equal(fits.Desktop.recognised.model, 'explicit');
  assert.deepEqual(generated.Desktop, values.Desktop, 'the numbers you had are the numbers you keep');
});

test('two tokens held at the floor stay held, rather than being bumped apart', () => {
  // The guard exists for rounding collisions above the floor. At the floor a repeat is the model
  // doing what it was told — and bumping one to an invented value also makes the scale
  // unrecognisable, so an adopted file could never regenerate itself.
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.spacingRampSpec();
  const config = {
    collectionName: 'C', group: 'Spacing',
    spacings: ['xs', 'sm', 'md', 'lg'],
    modes: [{ name: 'desktop', model: 'metric', min: 4, base: { level: 'md', size: 8 }, step: 4, mod: 2 }]
  };
  ctx.ensureCompatRampConfig(config, spec);
  ctx.materialiseRampTokens(config, spec);
  ctx.materialiseRampSizes(config, spec);
  const generated = ctx.generateRampVariables(config, spec);

  assert.deepEqual(
    ['xs', 'sm', 'md', 'lg'].map((t) => generated['Spacing/' + t].values.Desktop),
    [4, 4, 8, 12],
    'the model said 4, 4, 8, 12 — the ramp must not turn the second 4 into a 5'
  );
});

test('the published-write gate is a function of the status, and says what it costs', () => {
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const gate = (status, confirm) => ctx.publishedWriteGate(status, confirm, 'Responsive System');

  assert.equal(gate('UNPUBLISHED', false).allowed, true);
  assert.equal(gate('UNPUBLISHED', false).message, null, 'nothing to say about a private collection');

  for (const status of ['CURRENT', 'CHANGED']) {
    const refused = gate(status, false);
    assert.equal(refused.allowed, false, status);
    assert.match(refused.message, /Responsive System/);
    assert.match(refused.message, /published \(/);
    assert.match(refused.message, /library update/, 'names the cost to subscribers');
    assert.match(refused.message, /no value, name or binding/, 'and what it does not cost');
    assert.match(refused.message, /confirmPublished/, 'and how to say yes');

    const confirmed = gate(status, true);
    assert.equal(confirmed.allowed, true, status + ' with a yes');
    assert.match(confirmed.message, /as asked/, 'still says what it did');
  }

  // An unknown status is treated as published: the safe reading when the answer is unclear.
  assert.equal(gate('UNKNOWN', false).allowed, false);
});

test('the guard names every value it moves, and why', () => {
  // It has caused two bugs by being silent — rounded steps colliding, and floor repeats being
  // bumped apart. Both fixes were local; this closes the class. A guard that edits numbers
  // without saying so is the failure mode, not any particular case of it.
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.spacingRampSpec();

  // A range too narrow for its grid: adjacent steps snap onto the same multiple. Endpoints,
  // because it is the only model whose values are rounded today — see the note in the plan about
  // `roundTo` being inert for metric and modular.
  const config = {
    collectionName: 'C', group: 'Spacing',
    spacings: ['xs', 'sm', 'md', 'lg'],
    scaling: { type: 'linear', ease: 'none', roundTo: 4 },
    modes: [{ name: 'desktop', min: 4, max: 10 }]
  };
  ctx.ensureCompatRampConfig(config, spec);
  ctx.materialiseRampTokens(config, spec);
  ctx.materialiseRampSizes(config, spec);

  const report = {};
  ctx.generateRampVariables(config, spec, report);

  assert.ok(report.adjustments.length > 0, 'something moved a value and said nothing');
  const first = report.adjustments[0];
  assert.equal(first.viewport, 'Desktop');
  assert.ok(first.token, 'the token is named');
  assert.notEqual(first.from, first.to, 'with what it was and what it became');
  assert.match(first.why, /raised|lowered|pinned|held|collided/, 'and a reason: ' + first.why);

  const lines = ctx.describeRampAdjustments(report.adjustments);
  assert.match(lines[0], /Adjusted \d+ value/);
  assert.match(lines[1], new RegExp(first.token + ': ' + first.from + ' → ' + first.to));
});

test('a scale the guard never touches reports no adjustments', () => {
  const ctx = baseContext();
  loadInto(ctx, fs.readFileSync(path.join(SCRIPTS, 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8'));
  const spec = ctx.spacingRampSpec();
  const config = shippedConfigBlock('spacing.js');
  ctx.ensureCompatRampConfig(config, spec);
  ctx.materialiseRampTokens(config, spec);
  ctx.materialiseRampSizes(config, spec);

  const report = {};
  ctx.generateRampVariables(config, spec, report);
  assert.deepEqual(report.adjustments, [], 'the shipped default needs no correcting');
  assert.deepEqual(ctx.describeRampAdjustments([]), [], 'and says nothing about it');
});
