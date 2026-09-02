/**
 * The Spacing panel: its config block, and the preview that judges it.
 *
 * The panel is the second consumer of Grid's skeleton, so most of it is the shared controls doing their
 * job. What is new is the block's shape — conditional columns per scale type, a comma list for Tokens,
 * per-mode rounding, extras merged by value — and `spacingPreviewHtml`, which draws one mode and says
 * where a number moved.
 *
 * The libraries are loaded the way a script loads them, because the ramp's calls resolve in its
 * consumer's context.
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

const ROOT = path.join(__dirname, '..');
const SPACING = path.join(ROOT, 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'spacing.js');

function libs() {
  const dir = path.join(ROOT, 'scripts', 'CODEFIG_LIBRARIES');
  const src = ['@math-helpers.js', '@bezier.js', '@scale-models.js', '@core-library.js', '@foundation.js', '@linear-ramp.js']
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  return new Function('figma', 'console', 'window',
    src + '; return { spacingPreviewHtml: spacingPreviewHtml, rampModeToSize: rampModeToSize,' +
    ' roundRampSequence: roundRampSequence, spacingRampSpec: spacingRampSpec };'
  )({}, { log() {}, warn() {}, error() {} }, {});
}

const L = libs();
const SPACING_SRC = fs.readFileSync(SPACING, 'utf8');
const BLOCK = /@CONFIG_START\n([\s\S]*?)\n\s*\/\/ @CONFIG_END/.exec(SPACING_SRC)[1];
const PANEL = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(SPACING_SRC)[1];

/** Values + panel recipe — the live script no longer carries inline annotations. */
function parsePanel() {
  return P.parse(BLOCK, PANEL);
}

const MODES = [
  { name: 'desktop', scaleType: 'metric', base: 4, step: 4, mod: 3, roundTo: 2, extras: [1] },
  { name: 'tablet', scaleType: 'metric', base: 3, step: 3, mod: 3, roundTo: 2, extras: [1] },
  { name: 'mobile', scaleType: 'metric', base: 2, step: 2, mod: 3, roundTo: 2, extras: [1] },
];
/**
 * The block, with the three viewport modes this script used to ship.
 *
 * `desktop / tablet / mobile` were an example of one Figma file, and shipping them made them the
 * plugin's opinion about every file — so the block now ships one starter mode instead. These tests are
 * about the arithmetic and about the preview following the selected mode, neither of which is about
 * viewport names, so they state the modes they need rather than borrowing whatever the block holds.
 */
function threeModeConfig() {
  const config = P.parseConfigBlockObject(BLOCK);
  config.modes = MODES.map((m) => JSON.parse(JSON.stringify(m)));
  config.spacings = EXAMPLE.spacing.spacings;
  return config;
}

function starterConfig() {
  return JSON.parse(JSON.stringify(EXAMPLE.spacing));
}

function readout(html) {
  const names = [...html.matchAll(/spacing-preview-name">([^<]*)</g)].map((m) => m[1]);
  const values = [...html.matchAll(/spacing-preview-value">([^<]*)</g)].map((m) => m[1]);
  const notes = [...html.matchAll(/spacing-preview-note">([^<]*)</g)].map((m) => m[1]);
  const bars = [...html.matchAll(/height:([\d.]+)px/g)].map((m) => Number(m[1]));
  return { names, values, notes, bars };
}

test('the block renders the panel the frames show', () => {
  const schema = parsePanel();
  const container = document.createElement('div');
  R.buildForm(schema, container);

  const fields = {};
  schema.rows.filter((r) => r.type === 'field').forEach((r) => { fields[r.name] = r.inputType; });
  assert.equal(fields.collectionName, 'collection');
  assert.equal(fields.group, 'string');
  assert.equal(fields.spacings, 'list', 'Tokens is one input holding a comma list, not a read-only array');
  assert.equal(fields.modes, 'rows');

  assert.ok(container.querySelector('[data-chips-field]'), 'the collection modes chips');
  assert.ok(container.querySelector('[data-rows-field="modes"]'), 'a tab per mode');
  assert.ok(container.querySelector('[data-preview-slot]'), 'and the preview goes in the block');
});

test('a mode shows the fields its scale type uses, and no others', () => {
  const { items } = buildPanelWithCollection(R, parsePanel, starterConfig());
  const item = items[0];
  function shown() {
    return [].filter.call(item.querySelectorAll('.config-ui-rows-cell'), (c) => c.style.display !== 'none')
      .map((c) => (c.querySelector('[data-row-field]') || {}).getAttribute
        ? c.querySelector('[data-row-field]').getAttribute('data-row-field') : null)
      .filter(Boolean);
  }

  // The shipped default is metric: a step, how often it grows, and a base.
  //
  // **Step and Every N steps sit where Scaling method does**, not after Base unit. Both frames put Base
  // unit directly after Scaling method, and these two are what *replaces* it under a metric scale — so
  // the field that changes meaning keeps its position, and the three panels read the same way down.
  // **Bezier is the shipped default**, so a fresh panel opens on the curve.
  assert.deepEqual(shown(), ['scaleType', 'curve', 'base', 'roundTo', 'extras']);

  // **Radios, at Márton's request** — *"Change Scaling type selector to radio buttons"*, which is also
  // what his frames show. This picked a `<select>` value before; the assertions about which fields a
  // mode shows are unchanged, because the control changed and the behaviour did not.
  const type = item.querySelectorAll('[data-row-field="scaleType"]')[0];
  const pick = (value) => {
    const input = type.querySelectorAll('input').filter((r) => r.value === value)[0];
    assert.ok(input, 'the panel offers ' + value);
    input.checked = true;
    input.dispatchEvent(new shim.Event('change', { bubbles: true }));
  };

  pick('metric');
  assert.deepEqual(shown(), ['scaleType', 'step', 'mod', 'base', 'roundTo', 'extras'],
    'a step and how often it grows, in the slot the curve had');

  pick('fibonacci');
  assert.deepEqual(shown(), ['scaleType', 'step', 'base', 'roundTo', 'extras'],
    'a step, because it is the first increment — but nothing to say how often it grows');
});

test('Tokens and Extra spacings stay arrays in the config', () => {
  const { container } = buildPanelWithCollection(R, parsePanel, starterConfig());
  let values = null;
  R.attachListeners(container, parsePanel(), (v) => { values = v; });

  const tokens = container.querySelector('[data-field="spacings"]');
  tokens.value = 'none, px, xs, sm, md';
  tokens.dispatchEvent(new shim.Event('change', { bubbles: true }));

  assert.deepEqual(values.spacings, ['none', 'px', 'xs', 'sm', 'md']);
  assert.deepEqual(values.modes[0].extras, [1], 'and numbers stay numbers');
});

test('the preview draws one mode, at half size, in pixels', () => {
  const config = starterConfig();
  const out = readout(L.spacingPreviewHtml(config, 'spacing', 'Value'));

  assert.deepEqual(out.names, ['px', 'xs', 'sm', 'md', 'lg', 'xl']);
  // The shipped default is a bezier ramp now: the extra of 1 fills `px`, and the curve takes over from
  // the base at ×1.5 a step.
  assert.deepEqual(out.values.map(Number), [1, 4, 6, 10, 14, 20]);
  // Half size, the same fixed scale as Grid's preview, so a ruler agrees with the number beside it.
  assert.equal(out.bars[3], 5, 'md 10 draws 5px');
  assert.equal(out.bars[5], 10, 'xl 20 draws 10px');
  // A geometric ramp does not land on a grid of 2, so the rounding says which values it moved — which is
  // the difference between this default and the metric one it replaced.
  assert.equal(out.notes.length, 3, 'three values were rounded onto the grid');
});

test('the preview follows the mode the panel is showing', () => {
  const config = threeModeConfig();
  const mobile = readout(L.spacingPreviewHtml(config, 'spacing', 'mobile'));
  assert.deepEqual(mobile.values.map(Number), [1, 2, 4, 6, 8, 12]);
  // Its own smaller base, and its own grid.
  assert.notDeepEqual(mobile.values, readout(L.spacingPreviewHtml(config, 'spacing', 'desktop')).values);
});

test('a sibling mode with base 0 does not fail the open tab\'s preview', () => {
  const config = threeModeConfig();
  // Bezier refuses base 0; an aligned-but-unedited tab often lands there.
  config.modes[1] = Object.assign({}, config.modes[1], { scaleType: 'bezier', base: 0, ratio: 1.5, curve: [] });
  config.modes[2] = Object.assign({}, config.modes[2], { scaleType: 'bezier', base: 0, ratio: 1.5, curve: [] });
  const desktop = readout(L.spacingPreviewHtml(config, 'spacing', 'desktop'));
  assert.ok(desktop.values.length > 0, 'Desktop still draws');
  assert.equal(L.spacingPreviewHtml(config, 'spacing', 'mobile'), '', 'unset Mobile stays hidden');
});

test('a rounded value says what it was, and a nudged one says why', () => {
  // Two different things. A value moved by the grid was *rounded*; a value moved because it landed on
  // the token below was *nudged*, and calling that rounding is a small lie in the one place that exists
  // to explain a number.
  const config = starterConfig();
  const modular = JSON.parse(JSON.stringify(config));
  modular.modes[0] = { name: 'Value', scaleType: 'modular', ratio: 1.618, base: 4, roundTo: 2, extras: [1] };
  const rounded = readout(L.spacingPreviewHtml(modular, 'spacing', 'Value'));
  assert.deepEqual(rounded.values.map(Number), [1, 4, 6, 10, 16, 28]);
  assert.match(rounded.notes[0], /^Rounded from 6\.47$/, 'a φ scale needs the grid at nearly every step');
  assert.ok(rounded.notes.length >= 4);

  // A duplicate is a different thing: `tablet`'s base of 3 rounds onto 4, and a value that lands on the
  // token below it was nudged rather than rounded.
  const collide = JSON.parse(JSON.stringify(config));
  collide.modes[0] = { name: 'Value', scaleType: 'metric', base: 2, step: 2, mod: 3, roundTo: 2, extras: [2] };
  const nudged = readout(L.spacingPreviewHtml(collide, 'spacing', 'Value'));
  assert.ok(nudged.notes.some((n) => /Nudged from/.test(n)),
    'the extra and the base are both 2, so one of them has to move');
});

test('the grid rounds what was generated and leaves what was typed', () => {
  assert.deepEqual(L.roundRampSequence([6.47, 10.47, 16.94], 2), [6, 10, 16]);
  assert.deepEqual(L.roundRampSequence([6.47], 0), [6.47], 'a grid of 0 leaves them alone');

  const ramp = fs.readFileSync(path.join(ROOT, 'scripts', 'CODEFIG_LIBRARIES', '@linear-ramp.js'), 'utf8');
  const fn = ramp.slice(ramp.indexOf('function rampSequenceFor'), ramp.indexOf('function roundRampSequence'));
  assert.match(fn, /mergeRampExtras\(rounded, opts\.extras\)/,
    'extras are merged after rounding, so a number entered by hand is left as entered');
  assert.match(fn, /raw: mergeRampExtras\(built\.values\.slice\(\), opts\.extras\)/,
    'and the pre-grid sequence is kept, so the note is computed rather than guessed');
});

test('a mode carries every key the config gave it', () => {
  // This was a hand-written list — `model, ratio, step, mod, values, clamp` — so `scaleType`, `roundTo`
  // and `extras` were dropped in silence, and a dropped key here is a scale that generates the wrong
  // numbers rather than an error. Every value in every mode came out 0.
  const entry = L.rampModeToSize(
    { name: 'desktop', scaleType: 'fibonacci', base: 4, step: 4, roundTo: 2, extras: [0, 1], odd: 'kept' },
    ['a', 'b', 'c'], null
  );
  assert.equal(entry.scaleType, 'fibonacci');
  assert.equal(entry.base, 4, 'a numeric base is passed through, not dressed as { level, size }');
  assert.equal(entry.roundTo, 2);
  assert.deepEqual(entry.extras, [0, 1]);
  assert.equal(entry.odd, 'kept', 'and a key this function does not know is not its business to drop');
  assert.equal(entry.max, null, 'a derived model has no max, under either spelling');

  // The old spelling still works, which is the whole point of not rewriting configs.
  const old = L.rampModeToSize(
    { name: 'd', model: 'metric', min: 1, base: { level: 'b', size: 4 }, step: 4, mod: 3 }, ['a', 'b', 'c'], null
  );
  assert.deepEqual(old.base, { level: 'b', size: 4 });
  assert.equal(old.min, 1);
});

// ---------------------------------------------------------------------------
// A scale nobody can generate says so, in the place the picture would be
// ---------------------------------------------------------------------------

test('a bezier ramp draws its curve, and a straight one is the old modular scale', () => {
  const withCurve = (mode) => {
    const config = starterConfig();
    config.modes = [Object.assign({ name: 'Value', roundTo: 2, extras: [1] }, mode)];
    return readout(L.spacingPreviewHtml(config, 'spacing', 'Value')).values.map(Number);
  };

  // The scale a `modular` config with a ratio of 1.5 has always produced, and the same scale written the
  // new way. Identical, which is the whole basis for retiring the model.
  const legacy = withCurve({ scaleType: 'modular', base: 4, ratio: 1.5 });
  const straight = withCurve({ scaleType: 'bezier', base: 4, ratio: 1.5, curve: [] });
  assert.deepEqual(straight, legacy);
  assert.deepEqual(legacy, [1, 4, 6, 10, 14, 20]);

  // And a curve makes it something a single ratio could not say: tight at the bottom, open at the top.
  const bent = withCurve({ scaleType: 'bezier', base: 4, ratio: 1.5, curve: [0.42, 0, 0.58, 0.35] });
  assert.equal(bent[0], 1, 'the extra is still the extra');
  assert.equal(bent[bent.length - 1], straight[straight.length - 1],
    'bending redistributes; the top comes from the ratio and does not move');
  assert.notDeepEqual(bent, straight);
});

test('a scale the generator refused is reported, not filled in', () => {
  // **`rampValueAt` answers `opts.min` for a step the sequence does not have**, and the monotonic guard
  // then walks those apart by the grid — so a refused scale used to render as six plausible numbers with a
  // `console.warn` nobody sees. A bezier mode reaches that on its first click: `max` is required, and a
  // mode switched over to it has none until somebody types one.
  const refused = (mode) => {
    const config = starterConfig();
    config.modes = [Object.assign({ name: 'Value', roundTo: 2, extras: [1] }, mode)];
    return L.spacingPreviewHtml(config, 'spacing', 'Value');
  };

  const noRatio = refused({ scaleType: 'bezier', base: 4, curve: [] });
  assert.match(noRatio, /needs a `ratio`/, 'it should say what is missing');
  assert.deepEqual(readout(noRatio).values, [], 'and draw no numbers at all');

  // Base 0 is not a previewable scale — hide rather than lecture about Extra values while a sibling
  // tab is still empty from collection alignment.
  const zeroBase = refused({ scaleType: 'bezier', base: 0, ratio: 1.5, curve: [] });
  assert.equal(zeroBase, '');
  assert.deepEqual(readout(zeroBase).values, []);

  // A max of 0 is a different mistake — an empty field, usually a mode just switched to this model. It gets
  // the message about the end that is actually wrong; "put a 0 in Extra values" is advice about the other.
  const zeroMax = refused({ scaleType: 'bezier', base: 4, max: 0, curve: [] });
  assert.match(zeroMax, /largest value above zero/);
  assert.doesNotMatch(zeroMax, /Extra values/);
  assert.deepEqual(readout(zeroMax).values, []);

  // Not a bezier rule — the same hole was open for every model that can refuse.
  const noStep = refused({ scaleType: 'metric', base: 4 });
  assert.match(noStep, /needs a positive `step`/);
  assert.deepEqual(readout(noStep).values, []);
});

test('a base of 0 is a base, not a missing one', () => {
  // `!sizes.base` treated it as a mode that declared nothing, so `buildRampScaleOpts` returned null and the
  // viewport produced no options — and the early return it took was missing `adjustments`, so the caller
  // died on `undefined.forEach` rather than saying anything. Two bugs behind one falsy check.
  const config = starterConfig();
  config.modes = [{ name: 'Value', scaleType: 'metric', base: 0, step: 4, mod: 3, roundTo: 2, extras: [1] }];
  const out = readout(L.spacingPreviewHtml(config, 'spacing', 'Value'));
  assert.equal(out.values.length, 6, 'every token got a value');
  assert.equal(Number(out.values[0]), 0, 'and the base of 0 is the smallest of them');
});
