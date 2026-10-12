/**
 * Shared lightness must appear when Color model switches to OKLCH.
 *
 * The OKLCH settings section once held a panel-level `{ type: "preview" }` left over from the
 * alignment banner. Content-reveal treated the whole section as a host; nothing fills `__panel__`
 * anymore, so Shared lightness stayed `display: none` after an HSL → OKLCH switch.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const shim = require('./dom-shim.js');
const { document } = shim.install();
const P = require('../src/config-ui/parser.js');
const R = require('../src/config-ui/renderer.js');
const { applyConfigToSchema } = require('./dsf-panel-helpers.js');

const ROOT = path.join(__dirname, '..');
const COLORS = path.join(ROOT, 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'colors.js');
const SRC = fs.readFileSync(COLORS, 'utf8');
const BLOCK = /@CONFIG_START\n([\s\S]*?)\n\s*\/\/ @CONFIG_END/.exec(SRC)[1];
const PANEL = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(SRC)[1];

function parsePanel() {
  return P.parse(BLOCK, PANEL);
}

function mountColors(config) {
  const schema = parsePanel();
  applyConfigToSchema(schema, config);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  const attached = R.attachListeners(container, schema, function () {});
  attached.applyVisibility();
  return { schema, container, attached };
}

test('oklch-settings is not a content-reveal host and has no panel-level preview', () => {
  // The recipe must not put `{ type: "preview" }` beside Shared lightness — that slot is never
  // filled (alignment banner removed), and a host would hide the curve. Mode strips live in the
  // rows preview only.
  const oklchChunk = /id:\s*"oklch-settings"[\s\S]*?(?=id:\s*"mode-settings")/.exec(PANEL);
  assert.ok(oklchChunk, 'oklch-settings section exists in the recipe');
  assert.equal(/type:\s*"preview"/.test(oklchChunk[0]), false,
    'oklch-settings must not declare a panel-level preview');

  const { container } = mountColors({
    collectionName: 'Primitives',
    steps: ['50', '500', '950'],
    colorModel: 'oklch',
  });
  const sec = container.querySelector('[data-section="oklch-settings"]');
  assert.ok(sec, 'OKLCH settings section renders');
  assert.equal(sec.getAttribute('data-content-reveal-host'), null);
  assert.equal(sec.querySelector('[data-preview-slot]'), null);
});

test('switching Color model from HSL to OKLCH reveals Shared lightness', () => {
  const { container, attached } = mountColors({
    collectionName: 'Primitives',
    steps: ['50', '500', '950'],
    colorModel: 'hsl',
  });
  const sec = container.querySelector('[data-section="oklch-settings"]');
  assert.ok(sec);
  assert.equal(sec.style.display, 'none', 'hidden while model is HSL');

  // Dom-shim has no descendant selectors — find radios by value on the whole form.
  const radios = container.querySelectorAll('input').filter(function (el) {
    return el.type === 'radio' && (el.value === 'hsl' || el.value === 'oklch');
  });
  assert.ok(radios.length >= 2, 'Color model radios exist');
  radios.forEach(function (r) { r.checked = r.value === 'oklch'; });
  attached.applyVisibility();

  assert.equal(sec.style.display, '', 'OKLCH settings opens on model switch');
  const curve = sec.querySelector('[data-curve-field="curve"]')
    || sec.querySelector('[data-field="curve"]');
  assert.ok(curve, 'Shared lightness curve is in the section');
});
