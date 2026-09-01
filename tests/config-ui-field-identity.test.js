/**
 * **A field wrapper's identity: what a stylesheet has to select on.**
 *
 * `buildField()` used to stamp only `config-ui-field config-ui-field--{type}` — the control's type
 * and nothing else, so a stylesheet could not address "the fields in this section" or "this one
 * field" without editing the renderer. `data-key`, `data-type`, `data-section` and the form root's
 * `data-package` are additive: no class changed, no parser input required, every existing script
 * renders the same DOM plus attributes. See `.plans/29-field-identity.md`.
 *
 * `data-section` is derived at render time, not stored on the field — `parse()` returns a flat
 * `rows` array with no section object, so this is the "ask the question, don't store the answer"
 * rule: `buildRow` tracks the slug of the last heading it drew and stamps it onto every field row
 * until the next one.
 *
 * Scope: `buildField` and section-tracking in `buildRow` (plain `@UI_CONFIG` fields and the outer
 * `@rows` wrapper), plus the in-rows follow-up — tabpanels (`data-section` from tab text), curves
 * (`data-type="curve"` / `data-key`), row groups (`data-type="group"` / `data-key`), and cells
 * stamped by `stampCellIdentity` (`data-key` / `data-type` / `data-group`).
 */
const test = require('node:test');
const assert = require('node:assert');

const shim = require('./dom-shim.js');
const { loadBezierGlobal } = require('../build-bezier.js');
shim.install({ CodeFigBezier: loadBezierGlobal() });

const parser = require('../src/config-ui/parser.js');
const renderer = require('../src/config-ui/renderer.js');

function render(block) {
  const container = document.createElement('div');
  renderer.buildForm(parser.parse(block), container);
  return container;
}

test('the form root carries an empty data-package, stamped ahead of plan 32', () => {
  const container = render([
    '// @UI_CONFIG_START',
    '  name: "", // @label: Name',
    '// @UI_CONFIG_END',
  ].join('\n'));
  assert.strictEqual(container.getAttribute('data-package'), '');
});

test('a plain field carries its key and type', () => {
  const container = render([
    '// @UI_CONFIG_START',
    '  count: 3, // @label: Count',
    '  flag: true, // @label: Flag',
    '// @UI_CONFIG_END',
  ].join('\n'));

  const count = container.querySelector('[data-key="count"]');
  assert.ok(count, 'no wrapper for count');
  assert.strictEqual(count.getAttribute('data-type'), 'number');

  const flag = container.querySelector('[data-key="flag"]');
  assert.ok(flag, 'no wrapper for flag');
  assert.strictEqual(flag.getAttribute('data-type'), 'boolean');
});

test('a field carries the slug of the heading above it, and the slug changes at the next heading', () => {
  const container = render([
    '// @UI_CONFIG_START',
    '  // # General',
    '  name: "", // @label: Name',
    '  // # Mode settings',
    '  count: 3, // @label: Count',
    '// @UI_CONFIG_END',
  ].join('\n'));

  assert.strictEqual(container.querySelector('[data-key="name"]').getAttribute('data-section'), 'general');
  assert.strictEqual(container.querySelector('[data-key="count"]').getAttribute('data-section'), 'mode-settings');
  // The heading row itself carries the same slug, so a stylesheet can style the section as a whole.
  const heading = Array.from(container.querySelectorAll('.config-ui-row--heading'))
    .find((el) => el.textContent.indexOf('Mode settings') !== -1);
  assert.ok(heading, 'no Mode settings heading row');
  assert.strictEqual(heading.getAttribute('data-section'), 'mode-settings');
});

test('a field before any heading carries no data-section', () => {
  const container = render([
    '// @UI_CONFIG_START',
    '  name: "", // @label: Name',
    '// @UI_CONFIG_END',
  ].join('\n'));
  assert.strictEqual(container.querySelector('[data-key="name"]').hasAttribute('data-section'), false);
});

test('the outer wrapper of an @rows control carries its own key, type and section', () => {
  const container = render([
    '// @CONFIG_START',
    '  // # Modes',
    '  modes: [{ a: 1 }], // @rows: a:number=A @label: Modes',
    '// @CONFIG_END',
  ].join('\n'));
  const rows = container.querySelector('[data-key="modes"]');
  assert.ok(rows, 'no wrapper for the rows field');
  assert.strictEqual(rows.getAttribute('data-type'), 'rows');
  assert.strictEqual(rows.getAttribute('data-section'), 'modes');
});

test('a prebuilt panel (Spacing) renders every field with a key and a type', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'spacing.js'),
    'utf8'
  );
  const config = /@CONFIG_START\n([\s\S]*?)\/\/ @CONFIG_END/.exec(src);
  const panel = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(src);
  assert.ok(config, 'spacing.js has no @CONFIG_START block');
  assert.ok(panel, 'spacing.js has no @PANEL_START block');
  const container = document.createElement('div');
  renderer.buildForm(parser.parse(config[1], panel[1]), container);
  const fields = container.querySelectorAll('[data-key]');
  assert.ok(fields.length > 0, 'no fields carried data-key');
  fields.forEach((el) => {
    assert.ok(el.getAttribute('data-type'), 'a field wrapper has data-key but no data-type');
  });
});

/**
 * In-rows identity (plan 29 follow-up). Channel tabs used to be addressable only by
 * `data-rows-tabpanel="Hue"`; stylesheets that already select form sections with
 * `[data-section="hue"]` could not reach curves inside those panels. Walk the DOM rather than
 * using a descendant combinator — `dom-shim` refuses those on purpose.
 */
test('a @rows tabpanel carries data-section from the tab text, and holds a keyed curve', () => {
  const container = render([
    '// @CONFIG_START',
    '  modes: [{ hueCurve: [], lightness: 50 }], // @rows: name:text=Mode' +
      '|#>Hue|hueCurve:curve=Hue curve' +
      '|#>Lightness|lightness:number=Lightness @tabs @label: Modes',
    '// @CONFIG_END',
  ].join('\n'));

  const panels = Array.from(container.querySelectorAll('.config-ui-rows-tabpanel'));
  assert.ok(panels.length >= 2, 'expected Hue and Lightness tabpanels');

  const hue = panels.find((el) => el.getAttribute('data-rows-tabpanel') === 'Hue');
  assert.ok(hue, 'no Hue tabpanel');
  assert.strictEqual(hue.getAttribute('data-section'), 'hue');

  const lightness = panels.find((el) => el.getAttribute('data-rows-tabpanel') === 'Lightness');
  assert.ok(lightness, 'no Lightness tabpanel');
  assert.strictEqual(lightness.getAttribute('data-section'), 'lightness');

  const curve = Array.from(hue.querySelectorAll('.config-ui-curve'))[0];
  assert.ok(curve, 'Hue panel has no curve');
  assert.strictEqual(curve.getAttribute('data-type'), 'curve');
  assert.strictEqual(curve.getAttribute('data-key'), 'hueCurve');
});

test('a row group carries data-type=group and data-key', () => {
  const container = render([
    '// @CONFIG_START',
    '  modes: [{ bright: { hue: 250, chroma: 0.01 } }], // @rows: name:text=Mode' +
      '|bright:{hue:number=Hue|chroma:number=Chroma}=Bright @tabs @label: Modes',
    '// @CONFIG_END',
  ].join('\n'));

  const group = container.querySelector('.config-ui-rows-group');
  assert.ok(group, 'no row group');
  assert.strictEqual(group.getAttribute('data-type'), 'group');
  assert.strictEqual(group.getAttribute('data-key'), 'bright');
});

test('a row cell stamped by stampCellIdentity carries data-key, data-type and data-group', () => {
  const container = render([
    '// @CONFIG_START',
    '  modes: [{ gap: 8 }], // @rows: name:text=Mode|gap:number=Gap @tabs @label: Modes',
    '// @CONFIG_END',
  ].join('\n'));

  const cell = container.querySelector('[data-row-field="gap"]');
  assert.ok(cell, 'no gap cell');
  assert.strictEqual(cell.getAttribute('data-key'), 'gap');
  assert.strictEqual(cell.getAttribute('data-type'), 'number');
  assert.ok(cell.getAttribute('data-group'), 'cell has no data-group');
});

test('Colors panel tabpanels use data-section=hue and nest curves with data-type=curve', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'colors.js'),
    'utf8'
  );
  const config = /@CONFIG_START\n([\s\S]*?)\/\/ @CONFIG_END/.exec(src);
  const panel = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(src);
  assert.ok(config, 'colors.js has no @CONFIG_START block');
  assert.ok(panel, 'colors.js has no @PANEL_START block');
  const container = document.createElement('div');
  renderer.buildForm(parser.parse(config[1], panel[1]), container);

  const huePanels = Array.from(container.querySelectorAll('.config-ui-rows-tabpanel'))
    .filter((el) => el.getAttribute('data-section') === 'hue');
  assert.ok(huePanels.length > 0, 'no [data-section="hue"] tabpanel');

  const curves = huePanels.flatMap((p) => Array.from(p.querySelectorAll('.config-ui-curve')));
  assert.ok(curves.length > 0, 'hue tabpanel has no curve');
  curves.forEach((curve) => {
    assert.strictEqual(curve.getAttribute('data-type'), 'curve');
    assert.ok(curve.getAttribute('data-key'), 'curve inside hue has no data-key');
  });
});
