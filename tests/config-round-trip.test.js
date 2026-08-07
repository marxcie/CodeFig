/**
 * The seam: a recorded set → a printed block → a parsed object → a filled block.
 *
 * This is the fourth failure in the same forty lines. The import button was gated on a probe whose
 * result the probe itself decided; the payload was unwrapped twice; the block was printed by one
 * side and parsed by the other with nothing checking they agreed. Each half had tests. **The join
 * had none**, and three of the four would have failed here instead of in someone's hands.
 *
 * So this file owns the join and nothing else. It runs the real functions from both sides — the
 * sandbox's `@Foundation` (`writeManifest`'s slice, `toPortableConfig`, `toDomainConfig`,
 * `formatConfigBlock`) and the UI's `parser.js` (`parseConfigBlockObject`, `fillConfigBlock`) —
 * and asserts on the text that comes out the far end.
 *
 * The two sides cannot import each other: the sandbox runs user scripts through `new Function` and
 * cannot reach another script's source, and the UI is the only context holding every script. That
 * is exactly why the seam needs a test rather than a shared function.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');
const P = require('../src/config-ui/parser.js');

const LIBS = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');
const DSF = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');

function load() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, String, Array, Object, JSON, Date, isNaN, isFinite, parseInt, parseFloat, Number, RegExp
  };
  vm.createContext(ctx);
  for (const file of ['@foundation.js', '@math-helpers.js', '@scale-models.js', '@linear-ramp.js']) {
    const source = fs.readFileSync(path.join(LIBS, file), 'utf8');
    for (const table of source.match(/^var [A-Z][A-Z0-9_]* = \{[\s\S]*?\n\};/gm) || []) {
      vm.runInContext(table, ctx);
    }
    for (const [, code] of resolver.extractFunctionMap(source)) vm.runInContext(code, ctx);
  }
  return ctx;
}

const lib = load();

/** The `@CONFIG_START` body of a shipped script, as text. */
function shippedBlock(file) {
  const source = fs.readFileSync(path.join(DSF, file), 'utf8');
  const start = source.indexOf('// @CONFIG_START');
  const end = source.indexOf('// @CONFIG_END');
  return source.slice(source.indexOf('\n', start) + 1, source.lastIndexOf('\n', end) + 1);
}

/**
 * A run, end to end, without Figma: resolve a config the way `runLinearRamp` does, record it the
 * way `writeManifest` does, read it back the way the import button does.
 */
function recordAndPrint(config, domain, viewports) {
  const spec = domain === 'radius' ? lib.radiusRampSpec() : lib.spacingRampSpec();
  const resolved = JSON.parse(JSON.stringify(config));
  lib.ensureCompatRampConfig(resolved, spec);
  lib.materialiseRampTokens(resolved, spec);
  lib.materialiseRampSizes(resolved, spec, viewports.map((v) => v.label));

  const slice = lib.rampManifestSlice(resolved, spec);
  const v1 = lib.toPortableConfig({
    viewports: viewports,
    sets: [{
      collection: config.collectionName, domain: spec.domain, group: config.group,
      modes: viewports.map((v) => v.key), tokens: resolved[spec.tokensKey], missing: [], config: slice
    }],
    warnings: []
  });

  const domainConfig = lib.toDomainConfig(v1, spec.domain);
  assert.ok(domainConfig, 'the recorded set produced no config for ' + spec.domain);
  return { v1, domainConfig, block: lib.formatConfigBlock(domainConfig) };
}

const VIEWPORTS = [
  { key: 'desktop', label: 'Desktop', width: 1440 },
  { key: 'mobile', label: 'Mobile', width: 375 }
];

const SHIPPED_SPACING = {
  collectionName: 'Responsive System', group: 'Spacing',
  spacings: ['px', 'xs', 'sm', 'md', 'lg', 'xl'], roundTo: 2, generateOverview: false,
  modes: [
    { name: 'desktop', model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4, mod: 3 },
    { name: 'mobile', model: 'metric', min: 1, base: { level: 'xs', size: 2 }, step: 2, mod: 3 }
  ]
};

// ---------------------------------------------------------------------------
// The join
// ---------------------------------------------------------------------------

test('what the sandbox prints, the UI can read', () => {
  // The failure this file exists for: `formatConfigBlock` produced text and
  // `parseConfigBlockObject` returned null, so import said the config could not be read.
  const { block } = recordAndPrint(SHIPPED_SPACING, 'spacing', VIEWPORTS);
  const parsed = P.parseConfigBlockObject(block);
  assert.ok(parsed, 'the printed block did not parse. Block was:\n' + block);
  assert.equal(parsed.collectionName, 'Responsive System');
  assert.equal(parsed.modes.length, 2);
});

test('the printed block fills the shipped block, and the result is what a run would read', () => {
  const { block } = recordAndPrint(SHIPPED_SPACING, 'spacing', VIEWPORTS);
  const incoming = P.parseConfigBlockObject(block);
  const filled = P.fillConfigBlock(shippedBlock('spacing.js'), incoming);

  // The shipped block has three modes; this file has two. That is direction 3, and it is loud.
  assert.equal(filled.removed.length, 1);
  assert.equal(filled.removed[0].name, 'tablet');
  assert.match(filled.summary, /Removed 1 entry from modes: tablet/);

  // What comes out is a config, not a fragment.
  const back = P.parseConfigBlockObject(filled.text);
  assert.ok(back, 'the filled block did not parse');
  assert.deepEqual(back.modes.map((m) => m.name), ['desktop', 'mobile']);
  assert.equal(back.roundTo, 2);
  assert.deepEqual(back.spacings, ['px', 'xs', 'sm', 'md', 'lg', 'xl']);
});

test('the filled block still generates the values the file already has', () => {
  // The property that makes import safe: pressing it and pressing Run changes nothing.
  const spec = lib.spacingRampSpec();
  const { block } = recordAndPrint(SHIPPED_SPACING, 'spacing', VIEWPORTS);
  const filled = P.fillConfigBlock(shippedBlock('spacing.js'), P.parseConfigBlockObject(block));

  const generate = (config) => {
    const c = JSON.parse(JSON.stringify(config));
    lib.ensureCompatRampConfig(c, spec);
    lib.materialiseRampTokens(c, spec);
    lib.materialiseRampSizes(c, spec, ['Desktop', 'Mobile']);
    return lib.generateRampVariables(c, spec);
  };

  assert.deepEqual(
    generate(P.parseConfigBlockObject(filled.text)),
    generate(SHIPPED_SPACING),
    'importing a config and running it must produce the file it came from'
  );
});

test('a file with more viewports than the block inserts them, and they generate', () => {
  const five = [
    { key: 'mobile', label: 'Mobile', width: 375 },
    { key: 'tablet', label: 'Tablet', width: 768 },
    { key: 'desktop', label: 'Desktop', width: 1440 },
    { key: 'wide', label: 'Wide', width: 1920 }
  ];
  const config = Object.assign({}, SHIPPED_SPACING, {
    modes: five.map((v, i) => ({
      name: v.label, model: 'metric', min: 1, base: { level: 'xs', size: 2 + i }, step: 2 + i, mod: 3
    }))
  });

  const { block } = recordAndPrint(config, 'spacing', five);
  const filled = P.fillConfigBlock(shippedBlock('spacing.js'), P.parseConfigBlockObject(block));

  assert.equal(filled.inserted.length, 1, 'the shipped block has three of these four');
  assert.equal(filled.inserted[0].name, 'Wide');

  const back = P.parseConfigBlockObject(filled.text);
  assert.ok(back, 'the filled block did not parse');
  assert.equal(back.modes.length, 4);
  // An inserted entry is a real entry, not a shape that only looks right.
  const wide = back.modes.filter((m) => m.name === 'Wide')[0];
  assert.deepEqual(wide.base, { level: 'xs', size: 5 });
  assert.equal(wide.step, 5);
});

test('a parameter-set config survives the join', () => {
  const config = {
    collectionName: 'Responsive System', group: 'Spacing', spacings: ['px', 'xs', 'sm'], roundTo: 2,
    sets: [{ name: 'all', appliesTo: '*', model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4, mod: 3 }]
  };
  const { block } = recordAndPrint(config, 'spacing', VIEWPORTS);
  const parsed = P.parseConfigBlockObject(block);
  assert.ok(parsed, 'the printed block did not parse. Block was:\n' + block);
  assert.equal(parsed.sets.length, 1);
  assert.equal(parsed.sets[0].appliesTo, '*');
});

test('corner radius goes through the same seam', () => {
  const config = {
    collectionName: 'Responsive System', group: 'Corner radius',
    radii: ['none', 'xs', 'sm', 'md'], roundTo: 2,
    modes: [
      { name: 'desktop', model: 'metric', min: 0, base: { level: 'xs', size: 2 }, step: 2, mod: 2 },
      { name: 'mobile', model: 'metric', min: 0, base: { level: 'xs', size: 2 }, step: 2, mod: 2 }
    ]
  };
  const { block } = recordAndPrint(config, 'radius', VIEWPORTS);
  const parsed = P.parseConfigBlockObject(block);
  assert.ok(parsed, 'the printed block did not parse. Block was:\n' + block);

  const filled = P.fillConfigBlock(shippedBlock('corner-radius.js'), parsed);
  assert.ok(P.parseConfigBlockObject(filled.text), 'the filled block did not parse');
});

test('the whole portable config prints and parses, which is what copy hands you', () => {
  const { v1 } = recordAndPrint(SHIPPED_SPACING, 'spacing', VIEWPORTS);
  const block = lib.formatConfigBlock(v1);
  const parsed = P.parseConfigBlockObject(block);
  assert.ok(parsed, 'the printed v1 block did not parse. Block was:\n' + block);
  assert.equal(parsed.v, 1);
  assert.ok(parsed.domains.spacing);
});

test('a value with characters the tolerant reader has to handle', () => {
  // Templates, apostrophes and slashes all live in real configs, and all of them are places a
  // hand-rolled reader gives up quietly.
  const odd = Object.assign({}, SHIPPED_SPACING, {
    group: "Marton's spacing / v2",
    nameTemplate: 'spacing-{$step}'
  });
  const { block } = recordAndPrint(odd, 'spacing', VIEWPORTS);
  const parsed = P.parseConfigBlockObject(block);
  assert.ok(parsed, 'the printed block did not parse. Block was:\n' + block);
  assert.equal(parsed.group, "Marton's spacing / v2");
});
