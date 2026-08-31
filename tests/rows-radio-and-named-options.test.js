/**
 * A radio column, and an option that carries the words for its value.
 *
 * Márton, on the Spacing panel: *"Change Scaling type selector to radio buttons"* and *"Add names to
 * the Scaling method drop-down, it's easier to recognize it that way"*. Both are already in his frames
 * and in `artifacts/mockup-panels/spacing-target.html` — the panel had drifted from its own target, and
 * nothing failed, which is why `panel-controls-match-target.test.js` now exists beside this file.
 *
 * Three things here are load-bearing rather than cosmetic:
 *
 * - **The radio group's `name` is per row.** One name across the tabs makes the three modes one group,
 *   so picking Metric on Desktop clears Mobile. The tabs hide rather than unmount, so both are live.
 * - **A radio cell is a `div`.** Wrapping a radio group in a `label` is nested labels: a click on the
 *   caption activates the outer label's first labelable descendant — the first radio — so reading the
 *   label would reset the scale type.
 * - **A select over numbers reads back a number.** `<select>.value` is a string, and
 *   `resolveModularRatio` answered "unknown ratio" to `"1.25"` — an empty scale from picking a ratio.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const shim = require('./dom-shim.js');
const { document } = shim.install();
const P = require('../src/config-ui/parser.js');
const R = require('../src/config-ui/renderer.js');

const SPEC = '@rows: name:text=Mode|' +
  'scaleType:radio(modular:Modular scale|metric:Metric scale|fibonacci:Fibonacci)=Scale type|' +
  'ratio:(1.2:1.2 Minor third|1.25:1.25 Major third){scaleType=modular}=Scaling method|' +
  'step:number{scaleType=metric|fibonacci}=Step @tabs';

const BLOCK = [
  'modes: [',
  '  { name: "Desktop", scaleType: "modular", ratio: 1.25, step: 4 },',
  '  { name: "Mobile", scaleType: "metric", ratio: 1.2, step: 2 },',
  '], // ' + SPEC,
].join('\n');

function render(block) {
  const schema = P.parse(block || BLOCK);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  const seen = [];
  const api = R.attachListeners(container, schema, (values) => { seen.push(values); });
  return {
    schema, container, seen, api,
    items: container.querySelectorAll('.config-ui-rows-item'),
    // What the panel would write, read the way the panel reads it — through `onChange`, not through a
    // private collector. A control that reads correctly and never fires is the bug this catches.
    values: () => api.getValues(),
  };
}

function radios(item, key) {
  const group = item.querySelector('[data-row-field="' + key + '"]');
  return group.querySelectorAll('input');
}

test('a radio column parses, keeps its labels, and survives a round trip', () => {
  const schema = P.parse(BLOCK);
  const columns = schema.rows.filter((r) => r.type === 'field')[0].columns;
  const by = {};
  columns.forEach((c) => { by[c.key] = c; });

  assert.equal(by.scaleType.type, 'radio');
  assert.deepEqual(by.scaleType.options, [
    { value: 'modular', label: 'Modular scale' },
    { value: 'metric', label: 'Metric scale' },
    { value: 'fibonacci', label: 'Fibonacci' },
  ]);
  assert.equal(by.scaleType.label, 'Scale type', 'the type does not eat the column label');

  // An option is a pair, not a string plus a table beside it. Two lists that have to agree is the
  // bug class this area keeps producing.
  assert.deepEqual(by.ratio.options, [
    { value: '1.2', label: '1.2 Minor third' },
    { value: '1.25', label: '1.25 Major third' },
  ]);
  assert.equal(by.ratio.showWhen[0].values[0], 'modular', 'and it still carries its condition');

  assert.equal(P.serialize(schema, {}), BLOCK, 'unedited, via raw');
});

test('a bare option is still its own label, so nothing that omits one changes', () => {
  const spec = '@rows: name:text=Mode|scaleType:(modular|metric)=Scale type @tabs';
  const block = 'modes: [\n  { name: "Desktop", scaleType: "modular" },\n], // ' + spec;
  const schema = P.parse(block);
  const columns = schema.rows.filter((r) => r.type === 'field')[0].columns;
  assert.deepEqual(columns[1].options, [
    { value: 'modular', label: 'modular' },
    { value: 'metric', label: 'metric' },
  ]);
  assert.equal(P.serialize(schema, {}), block, 'and serializes back without inventing "modular:modular"');
});

test('each row gets its own radio group, so one tab cannot clear another', () => {
  const { items } = render();
  const names = [0, 1].map((i) => radios(items[i], 'scaleType')[0].name);
  assert.notEqual(names[0], names[1], 'two rows, two group names');
  assert.match(names[0], /modes-0-scaleType$/);

  // The proof rather than the mechanism: check Metric on row 0 and row 1 keeps its own value.
  const desktop = radios(items[0], 'scaleType');
  const mobile = radios(items[1], 'scaleType');
  assert.equal(mobile[1].checked, true, 'Mobile starts on metric');
  desktop[1].checked = true;
  assert.equal(mobile[1].checked, true, 'and stays there when Desktop switches to metric');
  assert.equal(desktop[0].checked, false, 'while Desktop leaves modular');
});

test('the checked radio is the config value, and an unknown value falls back visibly', () => {
  const { items } = render();
  const desktop = radios(items[0], 'scaleType');
  assert.deepEqual(desktop.map((r) => r.checked), [true, false, false]);

  const odd = render([
    'modes: [',
    '  { name: "Desktop", scaleType: "metrik", ratio: 1.25, step: 4 },',
    '], // ' + SPEC,
  ].join('\n'));
  const picked = radios(odd.items[0], 'scaleType').filter((r) => r.checked);
  assert.equal(picked.length, 1, 'exactly one — a control that reads as nothing selected has no value');
  assert.equal(picked[0].value, 'modular', 'the first option, and it is visible that it happened');
});

test('a radio cell is a div: a click on the caption must not reset the value', () => {
  const { items } = render();
  const group = items[0].querySelector('[data-row-field="scaleType"]');
  assert.equal(group.parentNode.tagName, 'div');
  // Every other cell stays a label — the caption should focus the field it names.
  assert.equal(items[0].querySelector('[data-row-field="step"]').parentNode.tagName, 'label');
});

test('switching the radio switches which columns the row shows', () => {
  const { container, items } = render();
  const shown = (item, key) => {
    const cell = item.querySelector('[data-row-field="' + key + '"]').parentNode;
    return cell.style.display !== 'none';
  };

  assert.equal(shown(items[0], 'ratio'), true, 'modular shows the ratio');
  assert.equal(shown(items[0], 'step'), false, 'and not the step');

  const desktop = radios(items[0], 'scaleType');
  desktop[2].checked = true;
  desktop[2].dispatchEvent(new shim.Event('change', { bubbles: true }));

  const after = container.querySelectorAll('.config-ui-rows-item');
  assert.equal(shown(after[0], 'step'), true, 'fibonacci needs a step');
  assert.equal(shown(after[0], 'ratio'), false, 'and no ratio');
});

test('clicking a radio reaches onChange, and reads back as its value', () => {
  // Not just "the DOM says fibonacci". A row cell's *group* carries `data-row-field`, so the input the
  // user clicks carries nothing — and `isControlEvent` matched on the attribute alone, which is how a
  // `@rows` control once shipped able to render and unable to save.
  const { items, seen } = render();
  const mobile = radios(items[1], 'scaleType')[2];
  mobile.checked = true;
  mobile.dispatchEvent(new shim.Event('change', { bubbles: true }));

  assert.equal(seen.length, 1, 'a radio click is a change the panel hears');
  const modes = seen[0].modes;
  assert.equal(modes[0].scaleType, 'modular');
  assert.equal(modes[1].scaleType, 'fibonacci');
  assert.equal(modes[0].name, 'Desktop', 'and the unrendered name column survives, as ever');
});

test('a select over numbers reads back a number, not "1.25"', () => {
  // The bug this found: the panel wrote `ratio: "1.25"`, and `resolveModularRatio` resolves a *name* or
  // a number — so a quoted ratio produced an empty scale, which reads as the mode generating nothing.
  const { schema, values } = render();
  const modes = values().modes;
  assert.equal(modes[0].ratio, 1.25);
  assert.equal(typeof modes[0].ratio, 'number');

  // And the block it prints keeps the config's own spelling.
  const text = P.serialize(schema, { modes: modes });
  assert.match(text, /ratio: 1\.25/);
  assert.doesNotMatch(text, /ratio: "1\.25"/);
});

test('a value the dropdown does not offer joins the list rather than being replaced', () => {
  // Found in the plugin: a mode written `ratio: 1.15` displayed *1.067*, because a `<select>` always
  // shows something and the first option is what "something" was. The next edit to that mode would have
  // collected 1.067 and written it back — the config rewritten to a number nobody chose.
  //
  // Adding the value also makes a custom ratio first-class, which it is: every type-scale tool offers the
  // named ratios *and* a custom one.
  const block = [
    'modes: [',
    '  { name: "Desktop", scaleType: "modular", ratio: 1.15, step: 4 },',
    '], // ' + SPEC,
  ].join('\n');
  const { items, values } = render(block);
  const select = items[0].querySelector('[data-row-field="ratio"]');
  const offered = select.querySelectorAll('option').map((o) => o.value);
  assert.deepEqual(offered, ['1.15', '1.2', '1.25'], 'its own value first, then the list');
  assert.equal(select.value, '1.15');
  assert.equal(values().modes[0].ratio, 1.15, 'and it reads back as itself, as a number');
});

test('a hidden cell writes nothing, and keeps what the config had', () => {
  // Found in the plugin, not here: `readForm` reported `ratio: "1.067"` for all three metric modes,
  // because a `<select>` always shows *something* and the collector read every rendered cell. So the
  // first edit to any field gave every mode a ratio it does not use, in a block people read and paste.
  const block = [
    'modes: [',
    '  { name: "Desktop", scaleType: "metric", base: 4, step: 4 },',
    '], // ' + SPEC,
  ].join('\n');
  const { items, seen, values } = render(block);

  assert.equal('ratio' in values().modes[0], false, 'no ratio arrives from a cell nobody can see');

  const step = items[0].querySelector('[data-row-field="step"]');
  step.value = '6';
  step.dispatchEvent(new shim.Event('input', { bubbles: true }));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].modes[0].step, 6);
  assert.equal('ratio' in seen[0].modes[0], false, 'and an edit elsewhere does not add one either');

  // The other direction: a ratio the config *does* hold survives a trip through metric, so switching
  // scale type to compare is not a way to lose it.
  const withRatio = render([
    'modes: [',
    '  { name: "Desktop", scaleType: "modular", ratio: 1.25, base: 4, step: 4 },',
    '], // ' + SPEC,
  ].join('\n'));
  const type = withRatio.items[0].querySelector('[data-row-field="scaleType"]');
  const pick = (value) => {
    const input = type.querySelectorAll('input').filter((r) => r.value === value)[0];
    input.checked = true;
    input.dispatchEvent(new shim.Event('change', { bubbles: true }));
  };
  pick('metric');
  assert.equal(withRatio.values().modes[0].ratio, 1.25, 'still there while hidden');
  pick('modular');
  assert.equal(withRatio.values().modes[0].ratio, 1.25, 'and still there when it comes back');
});

test('the shipped Spacing panel is the one Márton asked for', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'spacing.js'),
    'utf8'
  );
  const config = /@CONFIG_START\n([\s\S]*?)\n\s*\/\/ @CONFIG_END/.exec(source)[1];
  const panel = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(source)[1];
  const schema = P.parse(config, panel);
  const modes = schema.rows.filter((r) => r.type === 'field' && r.name === 'modes')[0];
  const by = {};
  modes.columns.forEach((c) => { by[c.key] = c; });

  assert.equal(by.scaleType.type, 'radio', 'scale type is radios');
  assert.deepEqual(by.scaleType.options.map((o) => o.label),
    ['Bezier scale', 'Metric scale', 'Fibonacci']);

  // **The ratio dropdown is gone, and its slot holds the two fields a ramp needs instead.** A named ratio
  // is one number describing the whole scale; `max` and `curve` say where it ends and how it gets there,
  // and a straight curve is exactly the constant ratio the dropdown used to offer.
  // **The ratio is back as a plain number, and the dropdown of eight is gone.** A named ratio was a closed
  // list — the complaint was that it allowed 1.25 and 1.333 and nothing between. The growth handle on the
  // curve drags this same cell continuously, so the number is the truth and there are two ways to set it.
  assert.equal(by.ratio, undefined, 'the growth has no field of its own — the curve control holds it');
  assert.equal(by.max, undefined, 'a typed largest value would pin an end this model does not have');
  assert.equal(by.curve.type, 'curve');
  assert.equal(by.curve.growth, 'ratio', 'the curve knows which cell its growth handle drags');
  assert.deepEqual(by.curve.showWhen[0].values, ['bezier']);
});
