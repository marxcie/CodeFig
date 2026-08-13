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

// A stand-in for the shipped block, in the spelling the panel writes: `scaleType`, a numeric base, a
// per-mode grid, and the smallest value as an extra rather than as a floor the model runs into. The
// numbers it generates are the same ones this script has always generated — `1, 4, 8, 12, 16, 24` on
// desktop — which is what lets the comparison below mean anything.
const SHIPPED_SPACING = {
  collectionName: 'Responsive System', group: 'Spacing',
  spacings: ['px', 'xs', 'sm', 'md', 'lg', 'xl'], generateOverview: false,
  modes: [
    { name: 'desktop', scaleType: 'metric', base: 4, step: 4, mod: 3, roundTo: 2, extras: [1] },
    { name: 'mobile', scaleType: 'metric', base: 2, step: 2, mod: 3, roundTo: 2, extras: [1] }
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
  // **Per mode now**, on Márton's call: the frames put "Round numbers to" inside Mode settings, and a
  // file with a 4px desktop grid and a 2px mobile one is the ordinary case. It used to be checked at the
  // top level here, which is where the config had it.
  assert.equal(back.modes[0].roundTo, 2);
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

// ---------------------------------------------------------------------------
// Editing one value changes one line
// ---------------------------------------------------------------------------

test('a value edit rewrites its own line and nothing else', () => {
  // The block is the human format, and every form interaction reserialises the whole of it. So the
  // measure of the printer is a **diff**: change one number, and exactly one line may differ.
  //
  // It did not hold. `fmt` printed anything holding objects with `JSON.stringify(v, null, 2)`, and a
  // reprinted row was written with no indentation at all — so typing in one Gap in the Mode settings
  // tabs turned Grid's `modes` array into quoted-key JSON hanging off the left margin, 19 lines
  // changed out of 51. Both were invisible in a `@UI_CONFIG` block, where rows start at column 0 and
  // nothing nests, which is why they lasted.
  const dir = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 4, 'the Foundations scripts are not where this test looks');

  let checked = 0;
  for (const file of files) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const m = /@CONFIG_START\n([\s\S]*?)\n\s*\/\/ @CONFIG_END/.exec(src);
    if (!m) continue;
    const block = m[1];
    const schema = P.parse(block);
    const fields = schema.rows.filter((r) => r.type === 'field');

    // A scalar, and a number nested inside a `@rows` array — the two shapes a panel edits.
    const scalar = fields.filter((r) => r.inputType === 'number')[0];
    const rows = fields.filter((r) => r.inputType === 'rows')[0];
    if (!scalar && !rows) continue;

    const values = {};
    if (scalar) values[scalar.name] = (scalar.value || 0) + 7;
    if (rows) {
      const next = JSON.parse(JSON.stringify(rows.value));
      const key = Object.keys(next[0] || {}).filter((k) => typeof next[0][k] === 'number')[0];
      if (key) next[0][key] = 999;
      values[rows.name] = next;
    }

    const before = block.split('\n');
    const after = P.serialize(schema, values).split('\n');
    assert.equal(after.length, before.length,
      file + ': the block changed length — the printer is reshaping, not editing');

    const changed = before
      .map((line, i) => (line === after[i] ? null : i + 1))
      .filter((n) => n !== null);
    assert.equal(changed.length, Object.keys(values).length,
      file + ': edited ' + Object.keys(values).length + ' value(s) but ' + changed.length +
      ' line(s) differ (' + changed.join(', ') + ')\n' +
      changed.map((n) => '  - ' + JSON.stringify(before[n - 1]) + '\n  + ' +
        JSON.stringify(after[n - 1])).join('\n'));
    checked++;
  }
  assert.ok(checked >= 3, 'only ' + checked + ' blocks were actually checked');
});

test('an annotation the source spelled out survives an edit', () => {
  // `@rows: columns:number=Columns` and `@label: Modes` both *match* what the parser would infer, so
  // serialize dropped them and the first keystroke in any cell rewrote the annotation. Nothing broke,
  // which is the problem: a block that quietly loses what someone wrote is a block they stop trusting.
  const line = 'modes: [{ name: "a", columns: 2 }], ' +
    '// @rows: name:text=Mode|columns:number=Columns @tabs @label: Modes';
  const schema = P.parse(line);
  assert.equal(P.serialize(schema, {}), line, 'unedited, via raw');

  const edited = P.serialize(schema, { modes: [{ name: 'a', columns: 3 }] });
  assert.match(edited, /@rows: name:text=Mode\|columns:number=Columns @tabs @label: Modes/,
    'the spelled-out labels came back as inferred ones');

  // And one that genuinely is inferable stays absent, so this is faithfulness rather than noise.
  const bare = P.parse('modes: [{ name: "a" }], // @rows: name:text @tabs');
  assert.match(P.serialize(bare, { modes: [{ name: 'b' }] }), /@rows: name:text @tabs/);
});

test('the fill states a different order without claiming what happens to it', () => {
  // The message used to read "the block's order was kept, so its comments stay with what they
  // describe" — true of the fill in isolation, and false of the outcome once the panel began putting a
  // collection's modes into the collection's own order. Márton read that sentence sitting under a list
  // that was visibly in the wrong order, which is the worst kind of wrong: confident and specific.
  //
  // So the fill names the fact, and whatever acts on it says what it did.
  const block = [
    'modes: [',
    '  { name: "Desktop", gap: 24 },',
    '  { name: "Mobile", gap: 16 },',
    '], // @rows: name:text|gap:number @tabs',
  ].join('\n');
  const incoming = { modes: [{ name: 'Mobile', gap: 16 }, { name: 'Desktop', gap: 24 }] };
  const filled = P.fillConfigBlock(block, incoming);

  assert.match(filled.summary, /lists modes in a different order\./);
  assert.doesNotMatch(filled.summary, /order was kept/);
  assert.doesNotMatch(filled.summary, /comments stay with what they describe/);

  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  assert.match(ui, /if \(ordered\.changed\) summary \+= ' The modes now follow this file/,
    'and the panel says what it did about it');
});
