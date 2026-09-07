/**
 * `@rows` with `layout: "tabs"` — collapse chevron at the end of the mode tab bar.
 *
 * Hides the settings body so Preview (outside the rows control) can come up. View state only:
 * class on the wrap, never written into the config. Starts open.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const shim = require('./dom-shim.js');
const { document } = shim.install();
const P = require('../src/config-ui/parser.js');
const R = require('../src/config-ui/renderer.js');

const PANEL = [
  'var __codefigPanel = { blocks: [',
  '  { key: "modes", type: "rows", label: "Modes", layout: "tabs",',
  '    columns: [',
  '      { key: "name", type: "text", label: "Mode" },',
  '      { key: "base", type: "number", label: "Base unit" }',
  '    ] }',
  '] };',
].join('\n');

const VALUES = [
  'modes: [',
  '  { name: "Desktop", base: 4 },',
  '  { name: "Mobile", base: 2 },',
  '],',
].join('\n');

function render() {
  const schema = P.parse(VALUES, PANEL);
  assert.ok(!schema.error, schema.error);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  const wrap = container.querySelector('[data-rows-field="modes"]');
  const tabBar = wrap.querySelector('.config-ui-rows-tabs');
  const body = wrap.querySelector('.config-ui-rows-body');
  const chevron = tabBar.querySelector('[data-rows-tabs-collapse]');
  return { schema, container, wrap, tabBar, body, chevron };
}

test('tabs layout puts a collapse chevron at the end of the tab bar', () => {
  const { tabBar, chevron, wrap } = render();
  const kids = tabBar.children;
  assert.equal(kids[kids.length - 1], chevron, 'chevron is last in the tab row');
  assert.equal(tabBar.querySelectorAll('.config-ui-rows-tab').length, 2);
  assert.equal(wrap.classList.contains('is-collapsed'), false, 'starts open');
  assert.equal(chevron.getAttribute('aria-expanded'), 'true');
});

test('clicking the chevron hides the settings body and keeps the tab bar', () => {
  const { wrap, tabBar, body, chevron } = render();
  chevron.dispatch('click');
  assert.equal(wrap.classList.contains('is-collapsed'), true);
  assert.equal(chevron.getAttribute('aria-expanded'), 'false');
  // CSS hides the body; the class is the contract (shim has no cascade).
  assert.ok(tabBar.querySelectorAll('.config-ui-rows-tab').length >= 1);
  assert.ok(body);
  chevron.dispatch('click');
  assert.equal(wrap.classList.contains('is-collapsed'), false);
  assert.equal(chevron.getAttribute('aria-expanded'), 'true');
});

test('collapse is view state — never written into the config block', () => {
  const { schema, wrap, chevron } = render();
  chevron.dispatch('click');
  assert.equal(wrap.classList.contains('is-collapsed'), true);
  assert.equal(/collaps/i.test(P.serialize(schema, null)), false);
});
