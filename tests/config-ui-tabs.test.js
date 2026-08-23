/**
 * **Channel tabs: what they are called, and whether they are there at all.**
 *
 * Both answers depend on the colour model, and both used to be wrong in the same way — the tab was a
 * heading printed from the spec and nothing else. Under OKLCH a mode's *Lightness* holds only
 * `{colorModel=hsl}` cells, because the ladder is the collection's, so the tab opened an empty box; and the
 * channel HSL calls *Saturation* OKLCH calls *Chroma*, which is a different quantity in different units and
 * not a synonym.
 *
 * Neither is stored. A tab is shown when its panel has something in it and captioned by the first of its
 * names whose condition holds, asked again on every pass — so switching model is enough to change both, and
 * there is no flag to get out of step with the radio.
 */
const test = require('node:test');
const assert = require('node:assert');

const shim = require('./dom-shim.js');
const { loadBezierGlobal } = require('../build-bezier.js');
shim.install({ CodeFigBezier: loadBezierGlobal() });

const parser = require('../src/config-ui/parser.js');
const renderer = require('../src/config-ui/renderer.js');

global.self = global;
global.ConfigUIParser = parser;
global.ConfigUIRenderer = renderer;
delete require.cache[require.resolve('../src/config-ui/controller.js')];
require('../src/config-ui/controller.js');
const controller = global.ConfigUIFormController;

/** Hue, then a channel named per model, then one that only exists in HSL. */
const BLOCK = [
  '// @CONFIG_START',
  '  colorModel: "hsl", // @options: hsl:HSL|oklch:OKLCH @radio @label: Color model',
  '  modes: [{ hue: 0, chroma: 0, saturation: 0, lightness: 0 }], ' +
  '// @rows: #>Hue|hue:number=Hue' +
    '|#>Saturation{colorModel=hsl}|#>Chroma{colorModel=oklch}' +
    '|chroma:number{colorModel=oklch}=Chroma|saturation:number{colorModel=hsl}=Saturation' +
    '|#>Lightness|lightness:number{colorModel=hsl}=Lightness @label: Modes',
  '// @CONFIG_END',
].join('\n');

function mount() {
  const container = document.createElement('div');
  controller.createForm(container, parser.parse(BLOCK), { container: container, onChange: function () {} });
  return container;
}

/** The shim has no `click()`; the form listens for the event, not the method. */
function clickTab(container, caption) {
  const button = Array.from(container.querySelectorAll('[data-rows-tab]'))
    .find((b) => b.textContent === caption);
  assert.ok(button, 'no tab captioned ' + caption);
  button.dispatchEvent(new Event('click', { bubbles: true }));
}

function setModel(container, value) {
  const radio = Array.from(container.querySelectorAll('[data-field="colorModel"]'))
    .find((r) => r.value === value);
  assert.ok(radio, 'no radio for ' + value);
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

/** What the tab bar reads, in order, with the hidden ones marked. */
function tabs(container) {
  const item = container.querySelector('.config-ui-rows-item');
  return Array.from(item.querySelectorAll('[data-rows-tab]'))
    .map((b) => b.textContent + (b.style.display === 'none' ? ' (hidden)' : ''));
}

test('two tab markers written next to each other are one tab', () => {
  // Not two. The panel underneath is shared, which is the point: splitting the cells between two real tabs
  // would put two `bright:`-style groups in one row, and `collectRows` overwrites rather than merges those.
  const container = mount();
  const item = container.querySelector('.config-ui-rows-item');
  assert.equal(item.querySelectorAll('[data-rows-tab]').length, 3, 'the run did not fold into one tab');
  assert.equal(item.querySelectorAll('[data-rows-tabpanel]').length, 3);
});

test('the tab is captioned by the model it is showing', () => {
  const container = mount();
  assert.deepEqual(tabs(container), ['Hue', 'Saturation', 'Lightness']);
  setModel(container, 'oklch');
  assert.deepEqual(tabs(container), ['Hue', 'Chroma', 'Lightness (hidden)']);
  setModel(container, 'hsl');
  assert.deepEqual(tabs(container), ['Hue', 'Saturation', 'Lightness'],
    'the caption did not come back — it is being remembered rather than asked');
});

test('the panel keeps its key when the caption changes', () => {
  // Keyed by the caption instead, switching model would rename the panel under `data-rows-tab-open` and
  // close the tab you were looking at.
  const container = mount();
  const item = container.querySelector('.config-ui-rows-item');
  clickTab(container, 'Saturation');
  assert.equal(item.getAttribute('data-rows-tab-open'), 'Saturation');

  setModel(container, 'oklch');
  assert.equal(item.getAttribute('data-rows-tab-open'), 'Saturation',
    'the open tab moved when only its name did');
  const panel = item.querySelector('[data-rows-tabpanel="Saturation"]');
  assert.equal(panel.getAttribute('data-shown'), 'true', 'the tab closed itself on a rename');
});

test('a tab whose every cell belongs to the other model is not drawn', () => {
  const container = mount();
  setModel(container, 'oklch');
  const item = container.querySelector('.config-ui-rows-item');
  const lightness = Array.from(item.querySelectorAll('[data-rows-tab]'))
    .find((b) => b.textContent === 'Lightness');
  assert.equal(lightness.style.display, 'none');
  assert.equal(item.querySelector('[data-rows-tabpanel="Lightness"]').getAttribute('data-shown'), 'false');
});

test('closing the open tab opens the first one that survives', () => {
  // Otherwise switching model leaves every panel shut, which reads as a block that failed to render.
  const container = mount();
  const item = container.querySelector('.config-ui-rows-item');
  clickTab(container, 'Lightness');
  assert.equal(item.getAttribute('data-rows-tab-open'), 'Lightness');

  setModel(container, 'oklch');
  assert.equal(item.getAttribute('data-rows-tab-open'), 'Hue');
  const shown = Array.from(item.querySelectorAll('[data-rows-tabpanel]'))
    .filter((p) => p.getAttribute('data-shown') === 'true')
    .map((p) => p.getAttribute('data-rows-tabpanel'));
  assert.deepEqual(shown, ['Hue'], 'no panel is open, or more than one is');
});

test('a tab condition survives a round trip through the block', () => {
  const again = parser.serialize(parser.parse(BLOCK));
  assert.match(again, /#>Saturation\{colorModel=hsl\}\|#>Chroma\{colorModel=oklch\}/);
});
