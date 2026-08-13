/**
 * The Corner radius panel, and the preview that judges it.
 *
 * Frame `2065:3045`. Márton: *"It's pretty similar to spacings, so I didn't create the additional screens,
 * I assume you can figure it out."* — so the block is Spacing's with the domain's own words, and the only
 * genuinely new thing is the preview: **the corner drawn at its real size** on the 200×120 box the frame
 * draws, rather than a bar whose height stands for a number.
 *
 * Two things here are worth more than the rest:
 *
 * - **The numbers are unchanged.** The mode spelling moved to the panel's (`scaleType`, a numeric `base`,
 *   `extras`) and `none` stopped being a special case in the maths — it is an extra value of 0. All three
 *   modes still generate exactly what they generated, and that is asserted against the values, not hoped
 *   for.
 * - **Above 60 a radius stops changing the shape**, because the corners of a 200×120 box have met. The
 *   frame's own largest token is 96. A preview that says nothing there draws two different numbers as the
 *   same picture, which is the one failure a preview cannot survive.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const shim = require('./dom-shim.js');
const { document } = shim.install();
const P = require('../src/config-ui/parser.js');
const R = require('../src/config-ui/renderer.js');

const ROOT = path.join(__dirname, '..');
const RADIUS = path.join(ROOT, 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'corner-radius.js');
const BLOCK = /@CONFIG_START\n([\s\S]*?)\n\s*\/\/ @CONFIG_END/.exec(fs.readFileSync(RADIUS, 'utf8'))[1];

/** The libraries, loaded the way a script loads them — the ramp's calls resolve in its consumer. */
function libs() {
  const dir = path.join(ROOT, 'scripts', 'CODEFIG_LIBRARIES');
  const src = ['@math-helpers.js', '@scale-models.js', '@core-library.js', '@foundation.js', '@linear-ramp.js']
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  return new Function('figma', 'console', 'window',
    src + '; return { radiusPreviewHtml: radiusPreviewHtml, spacingPreviewHtml: spacingPreviewHtml,' +
    ' rampPreviewRows: rampPreviewRows, radiusPreviewCap: radiusPreviewCap,' +
    ' radiusPreviewBox: radiusPreviewBox };'
  )({}, { log() {}, warn() {}, error() {} }, {});
}

const L = libs();

function readout(html) {
  return {
    names: [...html.matchAll(/radius-preview-name">([^<]*)</g)].map((m) => m[1]),
    values: [...html.matchAll(/radius-preview-value">([^<]*)</g)].map((m) => m[1]),
    notes: [...html.matchAll(/radius-preview-note">([^<]*)</g)].map((m) => m[1]),
    radii: [...html.matchAll(/border-radius:([\d.]+)px/g)].map((m) => Number(m[1])),
    boxes: [...html.matchAll(/width:(\d+)px;height:(\d+)px/g)].map((m) => [Number(m[1]), Number(m[2])]),
  };
}

test('the block renders the panel the frame shows', () => {
  const schema = P.parse(BLOCK);
  const container = document.createElement('div');
  R.buildForm(schema, container);

  const fields = {};
  schema.rows.filter((r) => r.type === 'field').forEach((r) => { fields[r.name] = r.inputType; });
  assert.equal(fields.collectionName, 'collection');
  assert.equal(fields.group, 'string');
  assert.equal(fields.radii, 'list', 'Tokens is one input holding a comma list');
  assert.equal(fields.modes, 'rows');

  assert.deepEqual(
    schema.rows.filter((r) => r.type === 'heading').map((r) => r.text),
    ['General', 'Mode settings', 'Preview']
  );
  assert.ok(container.querySelector('[data-chips-field]'), 'the collection modes chips');
  assert.ok(container.querySelector('[data-rows-field="modes"]'), 'a tab per mode');
  assert.ok(container.querySelector('[data-preview-slot]'), 'and the preview goes in the block');
});

test('the frame has three radios, which settles what the Spacing frames left open', () => {
  // Spacing's frames only ever show Modular and Metric. This one draws Fibonacci too, so the third option
  // is the design's rather than mine.
  const schema = P.parse(BLOCK);
  const modes = schema.rows.filter((r) => r.type === 'field' && r.name === 'modes')[0];
  const by = {};
  modes.columns.forEach((c) => { by[c.key] = c; });
  assert.equal(by.scaleType.type, 'radio');
  assert.deepEqual(by.scaleType.options.map((o) => o.label),
    ['Modular scale', 'Metric scale', 'Fibonacci']);
  assert.equal(by.extras.label, 'Extra values', "the domain's own word for the same control");
});

test('a mode shows the fields its scale type uses', () => {
  const schema = P.parse(BLOCK);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  R.attachListeners(container, schema, () => {});
  const item = container.querySelectorAll('.config-ui-rows-item')[0];
  const shown = () => [].filter
    .call(item.querySelectorAll('.config-ui-rows-cell'), (c) => c.style.display !== 'none')
    .map((c) => {
      const input = c.querySelector('[data-row-field]');
      return input ? input.getAttribute('data-row-field') : null;
    })
    .filter(Boolean);

  // Step and Every N steps sit where Scaling method does — they are what replaces it — so all three
  // panels read the same way down the tab.
  assert.deepEqual(shown(), ['scaleType', 'step', 'mod', 'base', 'roundTo', 'extras']);

  const type = item.querySelector('[data-row-field="scaleType"]');
  const modular = type.querySelectorAll('input').filter((r) => r.value === 'modular')[0];
  modular.checked = true;
  modular.dispatchEvent(new shim.Event('change', { bubbles: true }));
  assert.deepEqual(shown(), ['scaleType', 'ratio', 'base', 'roundTo', 'extras']);
});

test('every mode generates exactly what it generated before the panel', () => {
  // The spelling moved to the panel's — `scaleType`, a numeric `base`, and `none` as an extra value of 0
  // rather than a floor the maths has to know about. These are the values the previous block produced,
  // checked mode by mode: same generator, same output, different words.
  const config = P.parseConfigBlockObject(BLOCK);
  const expected = {
    desktop: [0, 4, 8, 12, 16, 24],
    tablet: [0, 4, 6, 10, 12, 18],
    mobile: [0, 2, 4, 6, 8, 12],
  };
  Object.keys(expected).forEach((mode) => {
    const rows = L.rampPreviewRows(config, 'radius', mode).rows;
    assert.deepEqual(rows.map((r) => r.token), ['none', 'xs', 'sm', 'md', 'lg', 'xl']);
    assert.deepEqual(rows.map((r) => r.value), expected[mode], mode);
  });
});

test('the preview draws the corner at its real size, on the box the frame draws', () => {
  const config = P.parseConfigBlockObject(BLOCK);
  const out = readout(L.radiusPreviewHtml(config, 'radius', 'desktop'));

  assert.deepEqual(out.names, ['none', 'xs', 'sm', 'md', 'lg', 'xl']);
  assert.deepEqual(out.values.map(Number), [0, 4, 8, 12, 16, 24]);
  // Real px, not a scale: a radius is judged against the corner it will sit on.
  assert.deepEqual(out.radii, [0, 4, 8, 12, 16, 24]);
  out.boxes.forEach((box) => assert.deepEqual(box, [200, 120], "the frame's own box"));
  assert.deepEqual(L.radiusPreviewBox(), { width: 200, height: 120 });
});

test('a radius past what the box can show says so', () => {
  // 60 is min(200, 120) / 2 — the corners have met, and 60 and 600 draw the identical pill. The frame's
  // largest value is 96, so this is not a hypothetical.
  assert.equal(L.radiusPreviewCap(), 60);

  const config = P.parseConfigBlockObject(BLOCK);
  const big = JSON.parse(JSON.stringify(config));
  big.modes[0] = { name: 'desktop', scaleType: 'metric', base: 24, step: 24, mod: 1, roundTo: 2, extras: [0] };
  const out = readout(L.radiusPreviewHtml(big, 'radius', 'desktop'));

  assert.ok(out.values.map(Number).some((v) => v > 60), 'the fixture actually goes past the cap');
  const past = out.notes.filter((n) => n.indexOf('box can show') !== -1);
  assert.ok(past.length > 0, 'and the rows past it say so');
  assert.match(past[0], /200×120/);
  assert.match(past[0], /60 and up draw the same pill/);
});

test('a rounded value still says what it was, and both notes can appear together', () => {
  const config = P.parseConfigBlockObject(BLOCK);
  const modular = JSON.parse(JSON.stringify(config));
  modular.modes[0] = { name: 'desktop', scaleType: 'modular', ratio: 1.618, base: 40, roundTo: 2, extras: [0] };
  const out = readout(L.radiusPreviewHtml(modular, 'radius', 'desktop'));

  const rounded = out.notes.filter((n) => n.indexOf('Rounded from') !== -1);
  assert.ok(rounded.length > 0, 'a 1.618 ratio does not land on a grid of 2 by itself');
  // A value can be both rounded and past the cap; the two notes are joined rather than one hiding the
  // other, because they explain different things about the same row.
  const both = out.notes.filter((n) => n.indexOf('Rounded from') !== -1 && n.indexOf('box can show') !== -1);
  assert.ok(both.length > 0, 'the notes were: ' + out.notes.join(' / '));
});

test('the preview follows the mode the panel is showing', () => {
  const config = P.parseConfigBlockObject(BLOCK);
  const mobile = readout(L.radiusPreviewHtml(config, 'radius', 'mobile'));
  assert.deepEqual(mobile.values.map(Number), [0, 2, 4, 6, 8, 12]);
  assert.notDeepEqual(mobile.radii, readout(L.radiusPreviewHtml(config, 'radius', 'desktop')).radii);

  // An unknown name falls back to the first mode rather than drawing nothing.
  assert.equal(
    L.radiusPreviewHtml(config, 'radius', 'nonsense'),
    L.radiusPreviewHtml(config, 'radius', 'desktop')
  );
});

test('the two previews are one set of numbers in two shapes', () => {
  // `rampPreviewRows` was extracted so the radius preview could not compute its values a second way. A
  // preview that generates differently from the run is the thing nobody can judge, and two previews that
  // generate differently from each other is the same problem twice.
  const config = P.parseConfigBlockObject(BLOCK);
  const rows = L.rampPreviewRows(config, 'radius', 'desktop').rows;
  const drawn = readout(L.radiusPreviewHtml(config, 'radius', 'desktop'));
  assert.deepEqual(drawn.values.map(Number), rows.map((r) => r.value));

  const bars = L.spacingPreviewHtml(config, 'radius', 'desktop');
  const barValues = [...bars.matchAll(/spacing-preview-value">([^<]*)</g)].map((m) => Number(m[1]));
  assert.deepEqual(barValues, rows.map((r) => r.value), 'and the bar drawing agrees with the box drawing');
});

test('an unreadable config says so instead of drawing nothing', () => {
  assert.match(L.radiusPreviewHtml(null, 'radius', null), /no config/i);
  assert.match(L.radiusPreviewHtml({ radii: [], modes: [] }, 'radius', null), /names no tokens|no modes/i);
});
