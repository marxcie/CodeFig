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

/** The `@CONFIG_START` block of a shipped script, evaluated as the object it is. */
function shippedConfigBlock(file) {
  const source = fs.readFileSync(path.join(SCRIPTS, 'EXAMPLE_SCRIPTS', 'Design System Foundations', file), 'utf8');
  const start = source.indexOf('// @CONFIG_START');
  const end = source.indexOf('// @CONFIG_END');
  return vm.runInNewContext('({' + source.slice(start + '// @CONFIG_START'.length, end) + '})');
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
    const config = shippedConfigBlock(domain.block);
    const old = before()(config);
    assert.ok(Object.keys(old).length > 0, 'the fixture really generated something');
    assert.deepEqual(after()(config), old);
  });

  test(`${domain.label}: a template plus steps generates identically`, () => {
    const config = Object.assign(shippedConfigBlock(domain.block), {
      [domain.tokensKey]: domain.template,
      steps: 5
    });
    assert.deepEqual(after()(config), before()(config));
  });

  test(`${domain.label}: every scaling alias it accepts still means the same`, () => {
    for (const alias of domain.aliases) {
      const config = shippedConfigBlock(domain.block);
      delete config.scaling;
      config[alias] = { type: 'quad', ease: 'out', roundUpperValuesTo: 4 };
      assert.deepEqual(after()(config), before()(config), alias);
    }
  });

  if (domain.notMyAlias) {
    test(`${domain.label}: an alias it never accepted is still ignored`, () => {
      // The two have already drifted — radius takes `cornerRadiusScaling` and spacing does not.
      // Collapsing them must not quietly grant spacing a new alias.
      const config = shippedConfigBlock(domain.block);
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
      const config = Object.assign(shippedConfigBlock(domain.block), rounding);
      assert.deepEqual(after()(config), before()(config), JSON.stringify(rounding));
    }
  });

  test(`${domain.label}: variables carry this domain's scopes`, () => {
    const generated = after()(shippedConfigBlock(domain.block));
    for (const name of Object.keys(generated)) {
      assert.deepEqual(generated[name].scopes, domain.scopes, name);
      assert.equal(generated[name].type, 'FLOAT', name);
    }
  });

  test(`${domain.label}: a token of 0 is generated, not skipped`, () => {
    const config = Object.assign(shippedConfigBlock(domain.block), {
      modes: [{ name: 'mobile', min: 0, max: 0 }]
    });
    const generated = after()(config);
    const first = generated[Object.keys(generated)[0]];
    assert.strictEqual(first.values.Mobile, 0);
    assert.deepEqual(generated, before()(config));
  });

  test(`${domain.label}: a monotonic bump still bumps`, () => {
    // A flat min/max range makes every step collide, which is what the guard exists for.
    const config = Object.assign(shippedConfigBlock(domain.block), {
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
