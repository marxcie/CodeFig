/**
 * The Typography panel: its controls, its arithmetic, and the two sections it draws.
 *
 * Frames `2032:2709` (Start) and `2031:8752` (Editing existing) — the skeleton is Grid's with one
 * addition: General → Mode settings → **Overview** → Preview. The Overview table is the only place the
 * *names* of the variables appear, which is what makes it worth having beside a specimen that shows
 * their effect.
 *
 * The interesting assertions are about the pair of numbers per property. Márton, on precise-type's
 * charts: *"how font size increase, line height increase and letter spacing decrease interact… optical
 * consistency and stability is what we aim for."* Two numbers reproduce that, but **only if the curve
 * runs in relative space** — the first version interpolated absolute px and produced a line-height ratio
 * that rose to 2.0 in the body sizes before falling to 1.1 at the top. Loose where it should be tight and
 * tight where it should be loose, from a change that looked right in the config.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const shim = require('./dom-shim.js');
const { document } = shim.install();
const P = require('../src/config-ui/parser.js');
const R = require('../src/config-ui/renderer.js');
const EXAMPLE = require('./dsf-example-configs.js');
const { buildPanelWithCollection } = require('./dsf-panel-helpers.js');
const { resolveImports } = require('../src/import-resolver.js');
const { findAllScripts } = require('../validate-scripts.js');

const TYPOGRAPHY = path.join(
  __dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'typography.js'
);
const TYPOGRAPHY_SRC = fs.readFileSync(TYPOGRAPHY, 'utf8');
const BLOCK = /@CONFIG_START\n([\s\S]*?)\n\s*\/\/ @CONFIG_END/.exec(TYPOGRAPHY_SRC)[1];
const PANEL = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(TYPOGRAPHY_SRC)[1];

/** The script with its imports resolved, minus the execution tail — the way the sandbox sees it. */
function load() {
  const scripts = findAllScripts(path.join(__dirname, '..', 'scripts'), { includeStaging: true });
  const script = scripts.filter((s) => /typography\.js$/.test(s.path))[0];
  let code = resolveImports(script.code, scripts, {});
  code = code.slice(0, code.indexOf('createOrUpdateCollection(typographyConfig)'));
  return new Function('figma', 'console', 'window',
    code +
    '; return { data: typographyConfigData, variables: generateTypographyVariables(typographyConfigData),' +
    ' generateTypographyVariables: generateTypographyVariables,' +
    ' typeScaleTable: typeScaleTable, typeScaleSizes: typeScaleSizes,' +
    ' typeScaleLineHeights: typeScaleLineHeights, typeScaleTrackings: typeScaleTrackings,' +
    ' typographyOverviewHtml: typographyOverviewHtml, typographyPreviewHtml: typographyPreviewHtml,' +
    ' typographyViewportNames: typographyViewportNames,' +
    ' ensureCompatTypographyConfig: ensureCompatTypographyConfig,' +
    ' materializeFontSizes: materializeFontSizes };'
  )({ notify() {} }, { log() {}, warn() {}, error() {} }, {});
}

const T = load();

/**
 * The three viewport modes this script used to ship, and a config carrying them.
 *
 * `desktop / tablet / mobile` were an example of one Figma file; shipping them made them the plugin's
 * opinion about every file, so the block ships one starter mode now. What these tests are about is the
 * per-mode arithmetic and the preview following the selected mode — neither is about viewport names — so
 * they state the modes they need. Built from the block and taken through the script's own compat and
 * materialisation steps, which is what a run does before any of this is read.
 */
const MODES = [
  { name: 'desktop', scaleType: 'modular', ratio: 1.25, base: 8, letterSpacing: 0,
    letterSpacingAtTop: -1.2, lineHeight: 12, lineHeightAtTop: 66, roundTo: 2 },
  { name: 'tablet', scaleType: 'modular', ratio: 1.2, base: 8, letterSpacing: 0,
    letterSpacingAtTop: -0.8, lineHeight: 12, lineHeightAtTop: 46, roundTo: 2 },
  { name: 'mobile', scaleType: 'modular', ratio: 1.125, base: 8, letterSpacing: 0,
    letterSpacingAtTop: -0.46, lineHeight: 12, lineHeightAtTop: 25, roundTo: 1 },
];

function threeModeConfig() {
  const config = P.parseConfigBlockObject(BLOCK);
  Object.assign(config, {
    group: EXAMPLE.typography.group,
    fontScale: EXAMPLE.typography.fontScale,
    fontFamily: EXAMPLE.typography.fontFamily,
    fontWeights: EXAMPLE.typography.fontWeights,
    createStyles: EXAMPLE.typography.createStyles,
    styleNaming: EXAMPLE.typography.styleNaming,
    overviewPreviewText: EXAMPLE.typography.overviewPreviewText,
  });
  config.modes = MODES.map((m) => JSON.parse(JSON.stringify(m)));
  T.ensureCompatTypographyConfig(config);
  T.materializeFontSizes(config);
  return config;
}

function starterConfig(overrides) {
  const config = JSON.parse(JSON.stringify(EXAMPLE.typography));
  if (overrides) Object.assign(config, overrides);
  T.ensureCompatTypographyConfig(config);
  T.materializeFontSizes(config);
  return config;
}

function render(overrides) {
  return buildPanelWithCollection(R, () => P.parse(BLOCK, PANEL), starterConfig(overrides));
}

test('the block renders the four sections the frames show', () => {
  const { schema, container } = render();
  assert.deepEqual(
    schema.rows.filter((r) => r.type === 'heading').map((r) => r.text),
    ['General', 'Mode settings', 'Overview', 'Preview']
  );

  const fields = {};
  schema.rows.filter((r) => r.type === 'field').forEach((r) => { fields[r.name] = r.inputType; });
  assert.equal(fields.collectionName, 'collection');
  assert.equal(fields.fontScale, 'list', 'Tokens is one input holding a comma list');
  assert.equal(fields.fontWeights, 'list', 'and so are the weights: "400, Semi Bold"');
  assert.equal(fields.modes, 'rows');
  assert.equal(fields.overviewPreviewText, 'textarea');

  assert.ok(container.querySelector('[data-chips-field]'), 'the collection modes chips');
  assert.ok(container.querySelector('[data-suggestions-slot]'), 'the Overview table has a slot');
  assert.ok(container.querySelector('[data-preview-slot]'), 'and the specimen has one');
});

test('a mode shows the fields its scale type uses', () => {
  const { items } = render();
  const shown = () => [].filter
    .call(items[0].querySelectorAll('.config-ui-rows-cell'), (c) => c.style.display !== 'none')
    .map((c) => {
      const input = c.querySelector('[data-row-field]');
      return input ? input.getAttribute('data-row-field') : null;
    })
    .filter(Boolean);

  assert.deepEqual(shown(), [
    'scaleType', 'curve', 'base',
    // One entry per *cell*, and each pair is one cell now — `shown()` reports its first part.
    'letterSpacing.base', 'lineHeight.base', 'roundTo',
  ], 'bezier: the scale, then the frame\'s order — letter spacing above line height, each a pair');

  const type = items[0].querySelector('[data-row-field="scaleType"]');
  const metric = type.querySelectorAll('input').filter((r) => r.value === 'metric')[0];
  metric.checked = true;
  metric.dispatchEvent(new shim.Event('change', { bubbles: true }));
  assert.deepEqual(shown(), [
    'scaleType', 'step', 'mod', 'base',
    'letterSpacing.base', 'lineHeight.base', 'roundTo',
  ], 'metric: a step and how often it grows, and neither end of a ramp');
});

test('the modes come from the config, not from a payload it no longer has', () => {
  // `fontSizes` is built from `minFont`/`baseFont`/`maxFont`, which a panel-written mode does not carry —
  // so reading the mode list off it found nothing and the run wrote no modes at all.
  //
  // Asserted on the shipped block *and* on a config with several modes: one entry cannot tell a function
  // that reads a list from one that returns the first thing it finds.
  assert.deepEqual(T.typographyViewportNames(starterConfig()), ['Value']);
  assert.deepEqual(T.typographyViewportNames(threeModeConfig()), ['desktop', 'tablet', 'mobile']);
});

test('the line-height ratio falls as the size grows, which is the whole point of the pair', () => {
  // The bug worth pinning: interpolating the absolute px (12 → 66) against a geometric size ramp made
  // the ratio *rise* to 2.0 at Text-Regular — a 12px step with 24px of line height — before coming back
  // down to 1.1. Interpolating the ratio (1.5 → 1.1) is what the charts actually show.
  const table = T.typeScaleTable({ config: starterConfig() }, 'Value');
  const ratios = table.rows.map((r) => r.ratio);
  assert.equal(ratios[0], 1.5, 'the base ratio is the one typed: 12 over 8');
  assert.equal(ratios[ratios.length - 1], 1.1, 'and the top is 66 over 60');
  assert.ok(Math.max.apply(null, ratios) <= 1.5,
    'no step is looser than the base — the ratios were ' + ratios.join(', '));

  // Absolute line height still rises the whole way, monotonically.
  const heights = table.rows.map((r) => r.lineHeight);
  for (let i = 1; i < heights.length; i++) {
    assert.ok(heights[i] >= heights[i - 1], 'line height never shrinks: ' + heights.join(', '));
  }
});

test('tracking tightens as a share of the size, and the Overview shows that share', () => {
  const rows = T.typeScaleTable({ config: starterConfig() }, 'Value').rows;
  assert.equal(rows[0].tracking, 0, 'nothing at the base, as typed');
  assert.equal(rows[rows.length - 1].tracking, -1.2, 'and the top is what was typed too');
  const percents = rows.map((r) => r.trackingPercent);
  assert.equal(percents[0], 0);
  assert.equal(percents[percents.length - 1], -2, 'which is −2% of 60px');
  for (let i = 1; i < percents.length; i++) {
    assert.ok(percents[i] <= percents[i - 1], 'monotone: ' + percents.join(', '));
  }
});

test('one number typed once means the same thing it always did', () => {
  // The optional companions have to be optional. Line height with no top holds the *ratio*, so it grows
  // with the size; tracking with no top holds the *px*, because "this tracking, everywhere" is the plain
  // reading of one field — and reading it as a percentage would turn -0.2 at an 8px base into -1.5px at
  // the top of a heading ramp.
  const mode = { name: 'desktop', scaleType: 'modular', ratio: 2, base: 8, lineHeight: 12, letterSpacing: -0.2 };
  const sizes = T.typeScaleSizes(mode, 4);
  assert.deepEqual(sizes.values, [8, 16, 32, 64]);
  assert.deepEqual(T.typeScaleLineHeights(mode, sizes.values), [12, 24, 48, 96], 'the ratio is held at 1.5');
  assert.deepEqual(T.typeScaleTrackings(mode, sizes.values), [-0.2, -0.2, -0.2, -0.2], 'and tracking is flat');
});

test('the base is the first token, so nothing has to say where it sits', () => {
  // Same convention as the Spacing panel: one number, and the scale grows from it. The frames have no
  // base-level picker, and this is why they do not need one.
  const mode = { name: 'm', scaleType: 'metric', base: 4, step: 4, mod: 3 };
  assert.equal(T.typeScaleSizes(mode, 5).values[0], 4);
  const fib = { name: 'm', scaleType: 'fibonacci', base: 4, step: 4 };
  assert.deepEqual(T.typeScaleSizes(fib, 6).values, [4, 8, 12, 20, 32, 52]);
});

test('rounding is per mode, and the table says what moved', () => {
  const config = threeModeConfig();
  const desktop = T.typeScaleTable({ config }, 'desktop').rows;
  const mobile = T.typeScaleTable({ config }, 'mobile').rows;
  desktop.forEach((row) => assert.equal(row.size % 2, 0, 'desktop rounds to 2: ' + row.size));
  mobile.forEach((row) => assert.equal(row.size % 1, 0, 'mobile rounds to 1: ' + row.size));

  const moved = desktop.filter((row) => row.rounded);
  assert.ok(moved.length > 0, 'a modular ratio does not land on whole numbers by itself');
  moved.forEach((row) => assert.notEqual(row.raw, row.size));
});

test('the Overview lists every token with the variable a run would write', () => {
  const data = starterConfig();
  const html = T.typographyOverviewHtml({ config: data }, 'typography', 'Value');
  const table = T.typeScaleTable({ config: data }, 'Value');
  const variables = T.generateTypographyVariables(data);
  assert.match(html, /class="type-overview"/);
  ['Step', 'Size', 'Line height', 'Ratio', 'Tracking', 'Variables'].forEach((head) => {
    assert.ok(html.indexOf('<th>' + head + '</th>') !== -1, head + ' is a column');
  });
  table.rows.forEach((row) => {
    assert.ok(html.indexOf(row.token) !== -1, row.token + ' has a row');
    assert.ok(html.indexOf(row.variable) !== -1, row.variable + ' is named');
    // A step is three variables, so the column names the **folder** — and every one of the three a run
    // writes has to live under it. Naming `Typography/Text-Tiny` in a column headed *Variable* was
    // naming something no file contains.
    assert.match(row.variable, /\/$/, 'the folder, with its slash');
    ['font-size', 'line-height', 'letter-spacing'].forEach((leaf) => {
      assert.ok(variables[row.variable + leaf], row.variable + leaf + ' is what a run writes');
    });
  });
  // The numbers are the run's numbers. A preview computed a second way is the trap every one of these
  // is written to avoid.
  assert.ok(html.indexOf('>' + table.rows[0].size + '<') !== -1);
});

test('the specimen sets the type at its real size, largest last', () => {
  const data = starterConfig();
  const html = T.typographyPreviewHtml({ config: data }, 'typography', 'Value');
  const sizes = [...html.matchAll(/font-size:([\d.]+)px/g)].map((m) => Number(m[1]));
  assert.deepEqual(sizes, T.typeScaleTable({ config: data }, 'Value').rows.map((r) => r.size));
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] > sizes[i - 1], 'ascending, so it reads as a scale');
  assert.match(html, /class="type-specimen"/);
  assert.ok(html.indexOf('Sphinx of black quartz') !== -1, 'the preview text is the config\'s');
  // **Beside the number it moved**, not on a line of its own — `Font size: 218 (218.37)`. A separate
  // *Rounded from* line left you matching it back to whichever value it belonged to.
  assert.equal(html.indexOf('Rounded from'), -1, 'the standalone line is gone');
  assert.match(html, /Font size: [\d.]+ \([\d.]+\)/, 'and a rounded step says what it was, in place');
});

test('the preview follows the mode the panel is showing', () => {
  const data = threeModeConfig();
  const desktop = T.typographyPreviewHtml({ config: data }, 'typography', 'desktop');
  const mobile = T.typographyPreviewHtml({ config: data }, 'typography', 'mobile');
  assert.notEqual(desktop, mobile);
  assert.match(mobile, /font-size:23px/, 'mobile tops out at 23');
  assert.match(desktop, /font-size:60px/, 'desktop at 60');

  // An unknown mode name falls back to the first rather than rendering nothing — a blank preview reads
  // as a broken panel.
  assert.equal(T.typographyPreviewHtml({ config: data }, 'typography', 'nonsense'), desktop);
});

test('the variables a run writes are the table, per mode', () => {
  const data = threeModeConfig();
  const variables = T.generateTypographyVariables(data);
  const byMode = { Desktop: 'desktop', Tablet: 'tablet', Mobile: 'mobile' };
  Object.keys(byMode).forEach((label) => {
    const rows = T.typeScaleTable({ config: data }, byMode[label]).rows;
    rows.forEach((row) => {
      assert.equal(variables['Typography/' + row.token + '/font-size'].values[label], row.size);
      assert.equal(variables['Typography/' + row.token + '/line-height'].values[label], row.lineHeight);
      assert.equal(variables['Typography/' + row.token + '/letter-spacing'].values[label], row.tracking);
    });
  });
});

test('the weights list becomes the map the styles are named from', () => {
  // `[400, "Semi Bold"]` is the frame's placeholder — a number is a weight, a word is a font style name.
  const raw = { fontScale: ['a'], fontWeights: [400, 'Semi Bold'], modes: [] };
  T.ensureCompatTypographyConfig(raw);
  assert.deepEqual(raw.fontWeights, { 400: 400, 'Semi Bold': 'Semi Bold' });

  const config = starterConfig();
  config.fontScale = ['a'];
  config.fontWeights = [400, 'Semi Bold'];
  T.ensureCompatTypographyConfig(config);
  const variables = T.generateTypographyVariables(config);
  // A numeric weight gets a FLOAT variable; a style name gets a STRING one. Both already existed — this
  // only had to reach them.
  assert.equal(variables['Typography/font-weight/400'].type, 'FLOAT');
  assert.equal(variables['Typography/font-family/primary'].type, 'STRING');
});

test('a string of weights is read as the list, never enumerated character by character', () => {
  // Everything downstream reads the weights with `Object.keys`, and a string enumerates as its
  // character *indices* — so a quoted value in the block generated a text style called `0`, one called
  // `1`, and so on to the end of the text, under every token in the scale.
  const typed = { fontScale: ['a'], fontWeights: '400, Semi Bold', modes: [] };
  T.ensureCompatTypographyConfig(typed);
  assert.deepEqual(typed.fontWeights, { 400: 400, 'Semi Bold': 'Semi Bold' });

  // The map printed and then quoted, which is the shape a config loaded from a file used to arrive in.
  const printed = { fontScale: ['a'], fontWeights: '{\n    400: 400,\n    600: 600\n  }', modes: [] };
  T.ensureCompatTypographyConfig(printed);
  assert.deepEqual(printed.fontWeights, { 400: 400, 600: 600 });
});

test('the flat style fields fold into the nested object the generator reads', () => {
  const config = { fontScale: ['a'], createStyles: false, styleNaming: 'T/{$fontScale}', modes: [] };
  T.ensureCompatTypographyConfig(config);
  assert.equal(config.figmaStyles.createAndUpdateStyles, false);
  assert.equal(config.figmaStyles.styleNaming, 'T/{$fontScale}');
  assert.equal(config.styles, config.figmaStyles, 'and the older alias still points at it');
});

test('a token series in the Tokens field is expanded before anything counts steps', () => {
  const config = { fontScale: ['heading-{3,1}'], modes: [] };
  T.ensureCompatTypographyConfig(config);
  assert.deepEqual(config.fontScale, ['heading-3', 'heading-2', 'heading-1']);
});

test('an empty scale stays hidden — no placeholder copy', () => {
  const bare = { config: { fontScale: [], modes: [] } };
  assert.equal(T.typographyOverviewHtml(bare, 'typography', null), '');
  assert.equal(T.typographyPreviewHtml(bare, 'typography', null), '');
});

test('line height and letter spacing are percentages, and the old spelling still generates its numbers', () => {
  // **The shape is the version marker.** `{ base, max }` is the panel's and the numbers are percentages of
  // the font size; a bare number is the older absolute-at-the-endpoint spelling. Told apart by `typeof`
  // rather than by range, because both fields are genuinely ambiguous by value — `-1.2` is equally
  // plausible as −1.2px or −1.2%, and `110` as 110px or 110%.
  const ctx = load();
  const sizes = ctx.typeScaleSizes(
    { scaleType: 'bezier', base: 8, ratio: 1.25, curve: [], roundTo: 2 }, 10
  ).values;
  assert.deepEqual(sizes, [8, 10, 12, 16, 20, 24, 30, 38, 48, 60]);

  const old = { lineHeight: 12, lineHeightAtTop: 66, letterSpacing: 0, letterSpacingAtTop: -1.2, roundTo: 2 };
  // 12px on a base of 8 is 150%; 66px on a top of 60 is 110%. Same scale, said the other way.
  const now = { lineHeight: { base: 150, max: 110 }, letterSpacing: { base: 0, max: -2 }, roundTo: 2 };

  assert.deepEqual(ctx.typeScaleLineHeights(now, sizes), ctx.typeScaleLineHeights(old, sizes));
  assert.deepEqual(ctx.typeScaleTrackings(now, sizes), ctx.typeScaleTrackings(old, sizes));
  assert.deepEqual(ctx.typeScaleLineHeights(old, sizes), [12, 14, 16, 22, 26, 30, 38, 46, 54, 66]);

  // A flat old letter spacing with no second end stays flat at every size, which is what it always did.
  assert.deepEqual(
    ctx.typeScaleTrackings({ letterSpacing: -0.5 }, sizes),
    sizes.map(() => -0.5)
  );
});

test('the percentage fields carry their unit in the input', () => {
  // A placeholder disappears the moment you type; a unit has to stay, or `-1.5` is unreadable as either
  // pixels or percent. Márton asked for it drawn inside the field at the right edge.
  const schema = P.parse(BLOCK, PANEL);
  const modes = schema.rows.filter((r) => r.type === 'field' && r.inputType === 'rows')[0];
  const by = {};
  modes.columns.forEach((c) => { by[c.key] = c; });
  for (const key of ['letterSpacing', 'lineHeight']) {
    assert.equal(by[key].type, 'group', key + ' should be one row of two');
    assert.deepEqual(by[key].columns.map((c) => c.key), ['base', 'max']);
    by[key].columns.forEach((part) => {
      assert.equal(part.unit, '%', key + '.' + part.key + ' lost its unit');
      assert.equal(part.type, 'number');
    });
  }
});
