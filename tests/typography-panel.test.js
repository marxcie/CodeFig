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
const { resolveImports } = require('../src/import-resolver.js');
const { findAllScripts } = require('../validate-scripts.js');

const TYPOGRAPHY = path.join(
  __dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'typography.js'
);
const BLOCK = /@CONFIG_START\n([\s\S]*?)\n\s*\/\/ @CONFIG_END/.exec(fs.readFileSync(TYPOGRAPHY, 'utf8'))[1];

/** The script with its imports resolved, minus the execution tail — the way the sandbox sees it. */
function load() {
  const scripts = findAllScripts(path.join(__dirname, '..', 'scripts'), { includeStaging: true });
  const script = scripts.filter((s) => /typography\.js$/.test(s.path))[0];
  let code = resolveImports(script.code, scripts, {});
  code = code.slice(0, code.indexOf('createOrUpdateCollection(typographyConfig)'));
  return new Function('figma', 'console', 'window',
    code +
    '; return { data: typographyConfigData, variables: generateTypographyVariables(typographyConfigData),' +
    ' typeScaleTable: typeScaleTable, typeScaleSizes: typeScaleSizes,' +
    ' typeScaleLineHeights: typeScaleLineHeights, typeScaleTrackings: typeScaleTrackings,' +
    ' typographyOverviewHtml: typographyOverviewHtml, typographyPreviewHtml: typographyPreviewHtml,' +
    ' typographyViewportNames: typographyViewportNames,' +
    ' ensureCompatTypographyConfig: ensureCompatTypographyConfig,' +
    ' materializeFontSizes: materializeFontSizes };'
  )({ notify() {} }, { log() {}, warn() {}, error() {} }, {});
}

const T = load();

function render() {
  const schema = P.parse(BLOCK);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  const api = R.attachListeners(container, schema, () => {});
  return { schema, container, api, items: container.querySelectorAll('.config-ui-rows-item') };
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
    'scaleType', 'ratio', 'base',
    'letterSpacing', 'letterSpacingAtTop', 'lineHeight', 'lineHeightAtTop', 'roundTo',
  ], 'modular: a ratio, and the frame\'s order — letter spacing above line height');

  const type = items[0].querySelector('[data-row-field="scaleType"]');
  const metric = type.querySelectorAll('input').filter((r) => r.value === 'metric')[0];
  metric.checked = true;
  metric.dispatchEvent(new shim.Event('change', { bubbles: true }));
  assert.deepEqual(shown(), [
    'scaleType', 'step', 'mod', 'base',
    'letterSpacing', 'letterSpacingAtTop', 'lineHeight', 'lineHeightAtTop', 'roundTo',
  ], 'metric: a step and how often it grows, and no ratio');
});

test('the modes come from the config, not from a payload it no longer has', () => {
  // `fontSizes` is built from `minFont`/`baseFont`/`maxFont`, which a panel-written mode does not carry —
  // so reading the mode list off it found nothing and the run wrote no modes at all.
  assert.deepEqual(T.typographyViewportNames(T.data), ['desktop', 'tablet', 'mobile']);
});

test('the line-height ratio falls as the size grows, which is the whole point of the pair', () => {
  // The bug worth pinning: interpolating the absolute px (12 → 66) against a geometric size ramp made
  // the ratio *rise* to 2.0 at Text-Regular — a 12px step with 24px of line height — before coming back
  // down to 1.1. Interpolating the ratio (1.5 → 1.1) is what the charts actually show.
  const table = T.typeScaleTable({ config: T.data }, 'desktop');
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
  const rows = T.typeScaleTable({ config: T.data }, 'desktop').rows;
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
  const desktop = T.typeScaleTable({ config: T.data }, 'desktop').rows;
  const mobile = T.typeScaleTable({ config: T.data }, 'mobile').rows;
  desktop.forEach((row) => assert.equal(row.size % 2, 0, 'desktop rounds to 2: ' + row.size));
  mobile.forEach((row) => assert.equal(row.size % 1, 0, 'mobile rounds to 1: ' + row.size));

  const moved = desktop.filter((row) => row.rounded);
  assert.ok(moved.length > 0, 'a modular ratio does not land on whole numbers by itself');
  moved.forEach((row) => assert.notEqual(row.raw, row.size));
});

test('the Overview lists every token with the variable a run would write', () => {
  const html = T.typographyOverviewHtml({ config: T.data }, 'typography', 'desktop');
  const table = T.typeScaleTable({ config: T.data }, 'desktop');
  assert.match(html, /class="type-overview"/);
  ['Step', 'Size', 'Line height', 'Ratio', 'Tracking', 'Variable'].forEach((head) => {
    assert.ok(html.indexOf('<th>' + head + '</th>') !== -1, head + ' is a column');
  });
  table.rows.forEach((row) => {
    assert.ok(html.indexOf(row.token) !== -1, row.token + ' has a row');
    assert.ok(html.indexOf(row.variable) !== -1, row.variable + ' is named');
  });
  // The numbers are the run's numbers. A preview computed a second way is the trap every one of these
  // is written to avoid.
  assert.ok(html.indexOf('>' + table.rows[0].size + '<') !== -1);
});

test('the specimen sets the type at its real size, largest last', () => {
  const html = T.typographyPreviewHtml({ config: T.data }, 'typography', 'desktop');
  const sizes = [...html.matchAll(/font-size:([\d.]+)px/g)].map((m) => Number(m[1]));
  assert.deepEqual(sizes, T.typeScaleTable({ config: T.data }, 'desktop').rows.map((r) => r.size));
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] > sizes[i - 1], 'ascending, so it reads as a scale');
  assert.match(html, /class="type-specimen"/);
  assert.ok(html.indexOf('Sphinx of black quartz') !== -1, 'the preview text is the config\'s');
  assert.ok(html.indexOf('Rounded from') !== -1, 'and a rounded step says what it was');
});

test('the preview follows the mode the panel is showing', () => {
  const desktop = T.typographyPreviewHtml({ config: T.data }, 'typography', 'desktop');
  const mobile = T.typographyPreviewHtml({ config: T.data }, 'typography', 'mobile');
  assert.notEqual(desktop, mobile);
  assert.match(mobile, /font-size:28px/, 'mobile tops out at 28');
  assert.match(desktop, /font-size:60px/, 'desktop at 60');

  // An unknown mode name falls back to the first rather than rendering nothing — a blank preview reads
  // as a broken panel.
  assert.equal(T.typographyPreviewHtml({ config: T.data }, 'typography', 'nonsense'), desktop);
});

test('the variables a run writes are the table, per mode', () => {
  const byMode = { Desktop: 'desktop', Tablet: 'tablet', Mobile: 'mobile' };
  Object.keys(byMode).forEach((label) => {
    const rows = T.typeScaleTable({ config: T.data }, byMode[label]).rows;
    rows.forEach((row) => {
      assert.equal(T.variables['Typography/' + row.token + '/font-size'].values[label], row.size);
      assert.equal(T.variables['Typography/' + row.token + '/line-height'].values[label], row.lineHeight);
      assert.equal(T.variables['Typography/' + row.token + '/letter-spacing'].values[label], row.tracking);
    });
  });
});

test('the weights list becomes the map the styles are named from', () => {
  // `[400, "Semi Bold"]` is the frame's placeholder — a number is a weight, a word is a font style name.
  const config = { fontScale: ['a'], fontWeights: [400, 'Semi Bold'], modes: [] };
  T.ensureCompatTypographyConfig(config);
  assert.deepEqual(config.fontWeights, { 400: 400, 'Semi Bold': 'Semi Bold' });

  // A numeric weight gets a FLOAT variable; a style name gets a STRING one. Both already existed — this
  // only had to reach them.
  assert.equal(T.variables['Typography/font-weight/400'].type, 'FLOAT');
  assert.equal(T.variables['Typography/font-family/primary'].type, 'STRING');
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

test('an empty scale says what to do rather than rendering nothing', () => {
  const bare = { config: { fontScale: [], modes: [] } };
  assert.match(T.typographyOverviewHtml(bare, 'typography', null), /scale type|base unit/i);
  assert.match(T.typographyPreviewHtml(bare, 'typography', null), /tokens|scale/i);
});
