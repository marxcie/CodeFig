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

const ROOT = path.join(__dirname, '..');
const SPACING = path.join(ROOT, 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'spacing.js');

function libs() {
  const dir = path.join(ROOT, 'scripts', 'CODEFIG_LIBRARIES');
  const src = ['@math-helpers.js', '@scale-models.js', '@core-library.js', '@foundation.js', '@linear-ramp.js']
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  return new Function('figma', 'console', 'window',
    src + '; return { spacingPreviewHtml: spacingPreviewHtml, rampModeToSize: rampModeToSize,' +
    ' roundRampSequence: roundRampSequence, spacingRampSpec: spacingRampSpec };'
  )({}, { log() {}, warn() {}, error() {} }, {});
}

const L = libs();
const BLOCK = /@CONFIG_START\n([\s\S]*?)\n\s*\/\/ @CONFIG_END/.exec(fs.readFileSync(SPACING, 'utf8'))[1];

function readout(html) {
  const names = [...html.matchAll(/spacing-preview-name">([^<]*)</g)].map((m) => m[1]);
  const values = [...html.matchAll(/spacing-preview-value">([^<]*)</g)].map((m) => m[1]);
  const notes = [...html.matchAll(/spacing-preview-note">([^<]*)</g)].map((m) => m[1]);
  const bars = [...html.matchAll(/height:([\d.]+)px/g)].map((m) => Number(m[1]));
  return { names, values, notes, bars };
}

test('the block renders the panel the frames show', () => {
  const schema = P.parse(BLOCK);
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
  // Márton: "add the fields that are required, and remove the ones that are not used in that mode."
  const schema = P.parse(BLOCK);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  R.attachListeners(container, schema, () => {});

  const item = container.querySelectorAll('.config-ui-rows-item')[0];
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
  assert.deepEqual(shown(), ['scaleType', 'step', 'mod', 'base', 'roundTo', 'extras']);

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

  pick('modular');
  assert.deepEqual(shown(), ['scaleType', 'ratio', 'base', 'roundTo', 'extras'],
    'a ratio in that same slot, and neither the step nor the module size');

  pick('fibonacci');
  assert.deepEqual(shown(), ['scaleType', 'step', 'base', 'roundTo', 'extras'],
    'a step, because it is the first increment — but nothing to say how often it grows');
});

test('Tokens and Extra spacings stay arrays in the config', () => {
  // A string there would read as an array of one to `rampExtras` and generate nothing.
  const schema = P.parse(BLOCK);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  let values = null;
  R.attachListeners(container, schema, (v) => { values = v; });

  const tokens = container.querySelector('[data-field="spacings"]');
  tokens.value = 'none, px, xs, sm, md';
  tokens.dispatchEvent(new shim.Event('change', { bubbles: true }));

  assert.deepEqual(values.spacings, ['none', 'px', 'xs', 'sm', 'md']);
  assert.deepEqual(values.modes[0].extras, [1], 'and numbers stay numbers');
});

test('the preview draws one mode, at half size, in pixels', () => {
  const config = P.parseConfigBlockObject(BLOCK);
  const out = readout(L.spacingPreviewHtml(config, 'spacing', 'desktop'));

  assert.deepEqual(out.names, ['px', 'xs', 'sm', 'md', 'lg', 'xl']);
  // The numbers this script has always generated: the extra of 1 fills `px`, and the metric scale takes
  // over from the base. The spelling changed for the panel; the output did not.
  assert.deepEqual(out.values.map(Number), [1, 4, 8, 12, 16, 24]);
  // Half size, the same fixed scale as Grid's preview, so a ruler agrees with the number beside it.
  assert.equal(out.bars[3], 6, 'md 12 draws 6px');
  assert.equal(out.bars[5], 12, 'xl 24 draws 12px');
  assert.deepEqual(out.notes, [], 'every value is already on the grid of 2, so it says nothing');
});

test('the preview follows the mode the panel is showing', () => {
  const config = P.parseConfigBlockObject(BLOCK);
  const mobile = readout(L.spacingPreviewHtml(config, 'spacing', 'mobile'));
  assert.deepEqual(mobile.values.map(Number), [1, 2, 4, 6, 8, 12]);
  // Its own smaller base, and its own grid.
  assert.notDeepEqual(mobile.values, readout(L.spacingPreviewHtml(config, 'spacing', 'desktop')).values);
});

test('a rounded value says what it was, and a nudged one says why', () => {
  // Two different things. A value moved by the grid was *rounded*; a value moved because it landed on
  // the token below was *nudged*, and calling that rounding is a small lie in the one place that exists
  // to explain a number.
  const config = P.parseConfigBlockObject(BLOCK);
  const modular = JSON.parse(JSON.stringify(config));
  modular.modes[0] = { name: 'desktop', scaleType: 'modular', ratio: 1.618, base: 4, roundTo: 2, extras: [1] };
  const rounded = readout(L.spacingPreviewHtml(modular, 'spacing', 'desktop'));
  assert.deepEqual(rounded.values.map(Number), [1, 4, 6, 10, 16, 28]);
  assert.match(rounded.notes[0], /^Rounded from 6\.47$/, 'a φ scale needs the grid at nearly every step');
  assert.ok(rounded.notes.length >= 4);

  // A duplicate is a different thing: `tablet`'s base of 3 rounds onto 4, and a value that lands on the
  // token below it was nudged rather than rounded.
  const collide = JSON.parse(JSON.stringify(config));
  collide.modes[0] = { name: 'desktop', scaleType: 'metric', base: 2, step: 2, mod: 3, roundTo: 2, extras: [2] };
  const nudged = readout(L.spacingPreviewHtml(collide, 'spacing', 'desktop'));
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
