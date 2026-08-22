/**
 * A column of a `@rows` control that appears only when a sibling column holds a given value.
 *
 * Márton's instruction for the Spacing and Typography panels: *"add the fields that are required, and
 * remove the ones that are not used in that mode."* A modular scale needs a ratio and a metric one
 * needs a step, so showing both leaves half of every mode tab inert — and the frames are guidance
 * rather than an exhaustive field list.
 *
 * `@showWhen:` already did this for top-level rows. It could not do it here, because under `@tabs` the
 * fields are *columns of one field*, and the thing a column depends on is the cell beside it. Two modes
 * on two tabs can be using different scale types at the same moment, so the condition has to be judged
 * inside its own row — which is the whole difficulty.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const shim = require('./dom-shim.js');
const { document } = shim.install();
const P = require('../src/config-ui/parser.js');
const R = require('../src/config-ui/renderer.js');

const SPEC = '@rows: name:text=Mode|scaleType:(modular|metric)=Scale type|' +
  'ratio:text{scaleType=modular}=Scaling method|step:number{scaleType=metric}=Step @tabs';

const BLOCK = [
  'modes: [',
  '  { name: "Desktop", scaleType: "modular", ratio: "1.2", step: 4 },',
  '  { name: "Mobile", scaleType: "metric", ratio: "1.2", step: 2 },',
  '], // ' + SPEC,
].join('\n');

function cellState(item) {
  const out = {};
  item.querySelectorAll('[data-row-show-when]').forEach((cell) => {
    const key = cell.querySelector('[data-row-field]').getAttribute('data-row-field');
    out[key] = cell.style.display === 'none' ? 'hidden' : 'shown';
  });
  return out;
}

function render(block) {
  const schema = P.parse(block || BLOCK);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  R.attachListeners(container, schema, () => {});
  return { schema, container, items: container.querySelectorAll('.config-ui-rows-item') };
}

test('a condition parses off the column and survives a round trip', () => {
  const schema = P.parse(BLOCK);
  const columns = schema.rows.filter((r) => r.type === 'field')[0].columns;
  const by = {};
  columns.forEach((c) => { by[c.key] = c; });

  assert.deepEqual(by.ratio.showWhen, [{ field: 'scaleType', values: ['modular'] }]);
  assert.deepEqual(by.step.showWhen, [{ field: 'scaleType', values: ['metric'] }]);
  assert.equal(by.ratio.type, 'text', 'the condition does not eat the type');
  assert.equal(by.step.type, 'number');
  assert.equal(by.ratio.label, 'Scaling method', 'nor the label — the condition contains an "=" too');

  assert.equal(P.serialize(schema, {}), BLOCK, 'unedited, via raw');
  const edited = P.serialize(schema, {
    modes: [{ name: 'Desktop', scaleType: 'metric', ratio: '1.2', step: 8 }],
  });
  assert.match(edited, /ratio:text\{scaleType=modular\}=Scaling method/);
  assert.match(edited, /step:number\{scaleType=metric\}=Step/);
});

test('each row is judged on its own value, not the form\'s', () => {
  // The reason this could not reuse the top-level mechanism: `getValues` flattens rows into one array
  // per field, and what a cell needs is the sibling beside it. Desktop is modular and Mobile is metric
  // in the same form, and both must be right at once.
  const { items } = render();
  assert.equal(items.length, 2);
  assert.deepEqual(cellState(items[0]), { ratio: 'shown', step: 'hidden' });
  assert.deepEqual(cellState(items[1]), { ratio: 'hidden', step: 'shown' });
});

test('changing the controlling cell changes what that row shows, and only that row', () => {
  const { container, items } = render();
  const select = items[0].querySelectorAll('[data-row-field="scaleType"]')[0];
  select.value = 'metric';
  select.dispatchEvent(new shim.Event('change', { bubbles: true }));

  assert.deepEqual(cellState(items[0]), { ratio: 'hidden', step: 'shown' }, 'the row that changed');
  assert.deepEqual(cellState(items[1]), { ratio: 'hidden', step: 'shown' }, 'the other row is unmoved');
  assert.ok(container, 'rendered');
});

test('a hidden cell keeps its value rather than losing it', () => {
  // Hiding is not clearing. Switching a mode to metric and back must return the ratio that was there —
  // the alternative is a control that quietly destroys what you typed when you look at something else.
  const { schema, container, items } = render();
  let collected = null;
  R.attachListeners(container, schema, (values) => { collected = values; });

  const select = items[0].querySelectorAll('[data-row-field="scaleType"]')[0];
  select.value = 'metric';
  select.dispatchEvent(new shim.Event('change', { bubbles: true }));

  assert.equal(collected.modes[0].scaleType, 'metric');
  assert.equal(collected.modes[0].ratio, '1.2', 'the hidden ratio is still in the config');
});

test('a column with no condition is always shown', () => {
  const { items } = render();
  const unconditional = items[0].querySelectorAll('.config-ui-rows-cell').length -
    Object.keys(cellState(items[0])).length;
  assert.ok(unconditional >= 1, 'Scale type itself carries no condition');
});

test('a select reports its selected option, which is what the condition reads', () => {
  // The shim gap this uncovered: the renderer marks `<option selected>` and never assigns `value`, so
  // every reader saw "" and drew the wrong conclusion — every cell hidden, on both rows. In a browser
  // this is free. A shim that answers "" for a control with a visible value is worse than one that
  // throws.
  const select = document.createElement('select');
  ['a', 'b'].forEach((v) => {
    const o = document.createElement('option');
    o.value = v;
    o.selected = v === 'b';
    select.appendChild(o);
  });
  assert.equal(select.value, 'b');
  select.value = 'a';
  assert.equal(select.value, 'a');
  assert.equal(select.children[0].selected, true, 'and assigning moves the selection');
  assert.equal(select.children[1].selected, false);
});

test('a group key repeated across columns merges rather than the last one winning', () => {
  /**
   * **Load-bearing for the channel tabs.** Márton's design splits a mode into Hue, Saturation and
   * Lightness, and each tab wants its own slice of the same three anchors — `bright.hue` under Hue,
   * `bright.chroma` under Saturation, `bright.lightness` under Lightness. That means `bright` appears as a
   * group column three times in one row.
   *
   * The obvious failure is the last column winning and the other two channels' anchors being dropped on
   * every keystroke — silently, because the form still shows them. It does not happen: `collectRows` seeds
   * each group from what the row already holds, so the three accumulate. Pinned here because the tabs are
   * about to depend on it and nothing else says so.
   */
  const source = [
    '// @UI_CONFIG_START',
    'var modes = [',
    '  { name: "Granite", bright: { hue: 264, chroma: 0.012, lightness: 98 } }',
    '];  // @rows: name:text=Mode|bright:{hue:number=Hue}=Hue|' +
      'bright:{chroma:number=Chroma}=Chroma|bright:{lightness:number=Lightness}=Lightness @blocks',
    '// @UI_CONFIG_END',
  ].join('\n');

  const schema = P.parse(source);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  let seen = null;
  R.attachListeners(container, schema, (values) => { seen = values; });

  const hue = container.querySelector('[data-row-field="bright.hue"]');
  hue.value = '271';
  hue.dispatch('change', { bubbles: true });

  assert.deepEqual(seen.modes, [
    { name: 'Granite', bright: { hue: 271, chroma: 0.012, lightness: 98 } },
  ], 'a channel that is not the last column lost its anchor');
});
