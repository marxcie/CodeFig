/**
 * `copyToOthers: true` on a `@tabs` rows control — Copy these values to: Mode…
 *
 * Spacing / Corner radius / Typography opt in; Grid and Colors do not. Each other mode is a link;
 * click copies the open mode's settings onto that entry only (name stays), confirms when it already
 * differs, and the whole line hides when there is only one mode. Uses the same `freshModeEntry`
 * seed as adding a chip.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const shim = require('./dom-shim.js');
const { document } = shim.install();
const P = require('../src/config-ui/parser.js');
const R = require('../src/config-ui/renderer.js');

const PANEL = [
  'var __codefigPanel = { blocks: [',
  '  { key: "modes", type: "rows", label: "Modes", layout: "tabs", copyToOthers: true,',
  '    columns: [',
  '      { key: "name", type: "text", label: "Mode" },',
  '      { key: "base", type: "number", label: "Base unit" },',
  '      { key: "step", type: "number", label: "Step" }',
  '    ] }',
  '] };',
].join('\n');

const VALUES = [
  'modes: [',
  '  { name: "Desktop", base: 4, step: 4 },',
  '  { name: "Tablet", base: 3, step: 3 },',
  '  { name: "Mobile", base: 2, step: 2 },',
  '],',
].join('\n');

function render(panelText, valuesText) {
  const schema = P.parse(valuesText || VALUES, panelText || PANEL);
  assert.ok(!schema.error, schema.error);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  const api = R.attachListeners(container, schema, function () {});
  return {
    schema,
    container,
    api,
    wrap: container.querySelector('[data-rows-field="modes"]'),
    items: container.querySelectorAll('.config-ui-rows-item'),
    lines: container.querySelectorAll('.config-ui-rows-copy-others'),
    links: container.querySelectorAll('.config-ui-rows-copy-others-mode'),
  };
}

test('panelFieldRow: copyToOthers is opt-in on tabs rows', () => {
  const withFlag = P.parse(VALUES, PANEL);
  const modes = withFlag.rows.filter((r) => r.type === 'field' && r.name === 'modes')[0];
  assert.equal(modes.copyToOthers, true);
  assert.equal(modes.tabs, true);

  const without = P.parse(VALUES, PANEL.replace('copyToOthers: true,', ''));
  const bare = without.rows.filter((r) => r.type === 'field' && r.name === 'modes')[0];
  assert.equal(bare.copyToOthers, undefined);
});

test('each mode tab lists every other mode as a link', () => {
  const { items, lines, links } = render();
  assert.equal(items.length, 3);
  assert.equal(lines.length, 3);
  // Three tabs × two targets each.
  assert.equal(links.length, 6);
  const desktopLine = items[0].querySelector('.config-ui-rows-copy-others');
  assert.match(desktopLine.textContent, /^Copy these values to: Tablet, Mobile$/);
  assert.equal(
    desktopLine.querySelector('[data-rows-copy-to="1"]').textContent,
    'Tablet'
  );
  assert.equal(
    desktopLine.querySelector('[data-rows-copy-to="2"]').textContent,
    'Mobile'
  );
});

test('one mode: no copy line', () => {
  const one = [
    'modes: [',
    '  { name: "Value", base: 4, step: 4 },',
    '],',
  ].join('\n');
  const { lines, links } = render(PANEL, one);
  assert.equal(lines.length, 0);
  assert.equal(links.length, 0);
});

test('clicking one mode copies only that mode and keeps its name', () => {
  const prior = global.confirm;
  let asked = null;
  global.confirm = function (msg) {
    asked = msg;
    return true;
  };
  try {
    const { items, api } = render();
    items[0].querySelector('[data-rows-copy-to="1"]').dispatch('click');
    assert.match(asked, /Replace settings on Tablet with Desktop's\?/);
    const modes = api.getValues().modes;
    assert.deepEqual(modes[0], { name: 'Desktop', base: 4, step: 4 });
    assert.deepEqual(modes[1], { name: 'Tablet', base: 4, step: 4 });
    // Mobile was not the target.
    assert.deepEqual(modes[2], { name: 'Mobile', base: 2, step: 2 });
  } finally {
    global.confirm = prior;
  }
});

test('cancelling the confirm leaves the target alone', () => {
  const prior = global.confirm;
  global.confirm = function () { return false; };
  try {
    const { items, api } = render();
    items[0].querySelector('[data-rows-copy-to="2"]').dispatch('click');
    const modes = api.getValues().modes;
    assert.equal(modes[1].base, 3);
    assert.equal(modes[2].base, 2);
  } finally {
    global.confirm = prior;
  }
});

test('already matching target: no confirm and no rewrite', () => {
  const prior = global.confirm;
  let asks = 0;
  global.confirm = function () {
    asks += 1;
    return true;
  };
  try {
    const same = [
      'modes: [',
      '  { name: "Desktop", base: 4, step: 4 },',
      '  { name: "Tablet", base: 4, step: 4 },',
      '],',
    ].join('\n');
    const { items, api } = render(PANEL, same);
    items[0].querySelector('[data-rows-copy-to="1"]').dispatch('click');
    assert.equal(asks, 0);
    assert.deepEqual(api.getValues().modes[1], { name: 'Tablet', base: 4, step: 4 });
  } finally {
    global.confirm = prior;
  }
});

test('Spacing / Corner radius / Typography opt in; Grid and Colors do not', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');
  function panelOf(file) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    return /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(src)[1];
  }
  function modesFlag(file) {
    const schema = P.parse('modes: [],', panelOf(file));
    const modes = schema.rows.filter((r) => r.type === 'field' && r.name === 'modes')[0];
    return !!(modes && modes.copyToOthers);
  }
  assert.equal(modesFlag('spacing.js'), true);
  assert.equal(modesFlag('corner-radius.js'), true);
  assert.equal(modesFlag('typography.js'), true);
  assert.equal(modesFlag('grid.js'), false);
  assert.equal(modesFlag('colors.js'), false);
});

test('freshModeEntry is the public seed copy-to-mode uses', () => {
  const seeded = P.freshModeEntry('Mobile', { name: 'Desktop', base: 8, extras: [1, 2] });
  assert.deepEqual(seeded, { name: 'Mobile', base: 8, extras: [1, 2] });
  seeded.extras.push(3);
  assert.deepEqual(P.freshModeEntry('X', { name: 'Desktop', extras: [1, 2] }).extras, [1, 2]);
});
