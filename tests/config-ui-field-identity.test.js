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
 * Scope, stated plainly: this covers `buildField` and the section-tracking in `buildRow`, which is
 * every plain `@UI_CONFIG` field and the outer wrapper of an `@rows` control. It does **not** cover
 * the cells and groups *inside* an `@rows` table (`buildRowsControl`/`buildRowGroup`/`buildRowCell`)
 * — those are a separate, denser builder family the plan flagged as a follow-up rather than
 * something "10-15 lines, no logic touched" could respectably reach in one pass.
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
  const m = /@CONFIG_START\n([\s\S]*?)\/\/ @CONFIG_END/.exec(src);
  assert.ok(m, 'spacing.js has no @CONFIG_START block');
  const container = render(m[1]);
  const fields = container.querySelectorAll('[data-key]');
  assert.ok(fields.length > 0, 'no fields carried data-key');
  fields.forEach((el) => {
    assert.ok(el.getAttribute('data-type'), 'a field wrapper has data-key but no data-type');
  });
});
