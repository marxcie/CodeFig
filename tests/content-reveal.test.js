/**
 * Content-reveal: preview / suggestions start hidden and open only when they hold HTML.
 * `@showWhen` alone must not flash an empty Preview section.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const shim = require('./dom-shim.js');
const { document } = shim.install();
const R = require('../src/config-ui/renderer.js');

function mount(schema) {
  const container = document.createElement('div');
  R.buildForm(schema, container);
  return container;
}

test('preview and suggestions start hidden with data-content-reveal', () => {
  const container = mount({
    rows: [
      { type: 'heading', text: 'Preview' },
      { type: 'preview', showWhen: { collectionName: '*' } },
      { type: 'heading', text: 'Suggested whole number divisions' },
      { type: 'suggestions' },
    ],
  });
  const preview = container.querySelector('[data-preview-slot]');
  const suggestions = container.querySelector('[data-suggestions-slot]');
  assert.equal(preview.getAttribute('data-content-reveal'), 'true');
  assert.equal(suggestions.getAttribute('data-content-reveal'), 'true');
  assert.equal(preview.style.display, 'none');
  assert.equal(suggestions.style.display, 'none');

  const previewHeading = container.querySelectorAll('.config-ui-row--heading')[0];
  assert.equal(previewHeading.getAttribute('data-content-reveal-pair'), 'true');
  assert.equal(previewHeading.style.display, 'none');
});

test('fillContentReveal opens the slot and its paired heading together', () => {
  const container = mount({
    rows: [
      { type: 'heading', text: 'Preview' },
      { type: 'preview' },
    ],
  });
  const slot = container.querySelector('[data-preview-slot]');
  const heading = container.querySelector('.config-ui-row--heading');
  R.fillContentReveal(slot, '<div class="ok">bars</div>');
  assert.equal(slot.style.display, '');
  assert.equal(heading.style.display, '');
  assert.match(slot.innerHTML, /bars/);

  R.fillContentReveal(slot, '');
  assert.equal(slot.style.display, 'none');
  assert.equal(heading.style.display, 'none');
});

test('applyVisibility cannot open an empty preview even when showWhen matches', () => {
  const schema = {
    rows: [
      { type: 'field', name: 'collectionName', inputType: 'text', value: 'Spacing' },
      { type: 'heading', text: 'Preview' },
      { type: 'preview', showWhenRules: [{ field: 'collectionName', values: ['*'] }] },
    ],
  };
  const container = mount(schema);
  const attached = R.attachListeners(container, schema, function () {});

  const slot = container.querySelector('[data-preview-slot]');
  const heading = [...container.querySelectorAll('.config-ui-row--heading')]
    .filter((el) => /Preview/.test(el.textContent || ''))[0];

  attached.applyVisibility();
  assert.equal(slot.style.display, 'none', 'empty preview stays hidden');
  assert.equal(heading.style.display, 'none', 'paired heading stays hidden');

  R.fillContentReveal(slot, '<b>ready</b>');
  attached.applyVisibility();
  assert.equal(slot.style.display, '', 'filled preview opens');
  assert.equal(heading.style.display, '', 'paired heading opens with it');

  // Clearing the collection suppresses even a filled slot.
  const field = container.querySelector('[data-field="collectionName"]');
  field.value = '';
  attached.applyVisibility();
  assert.equal(slot.style.display, 'none', 'showWhen can still hide a filled slot');
  assert.equal(heading.style.display, 'none');
});

test('in-rows preview slots also start as content-reveal', () => {
  const container = mount({
    rows: [
      {
        type: 'field',
        name: 'modes',
        inputType: 'rows',
        layout: 'blocks',
        value: [{ name: 'Value' }],
        columns: [
          { key: 'name', type: 'text', label: 'Mode' },
          { type: 'preview' },
        ],
      },
    ],
  });
  const slot = container.querySelector('[data-preview-slot]');
  assert.ok(slot);
  assert.equal(slot.getAttribute('data-content-reveal'), 'true');
  assert.equal(slot.style.display, 'none');
  R.fillContentReveal(slot, '<div class="color-ramp-preview">x</div>');
  assert.equal(slot.style.display, '');
});

test('a section hosting preview hides dividers and spacers with the host', () => {
  const container = mount({
    rows: [
      {
        type: 'section',
        id: 'preview',
        blocks: [
          { type: 'divider', section: false },
          { type: 'spacer', size: 'l' },
          { type: 'heading', text: 'Preview' },
          { type: 'preview' },
        ],
      },
    ],
  });
  const host = container.querySelector('section.config-ui-section--preview');
  assert.ok(host);
  assert.equal(host.getAttribute('data-content-reveal-host'), 'true');
  assert.equal(host.style.display, 'none', 'empty preview section starts hidden');

  const slot = host.querySelector('[data-preview-slot]');
  R.fillContentReveal(slot, '<div class="ok">bars</div>');
  assert.equal(host.style.display, '', 'filled section opens as a unit');
  assert.equal(slot.style.display, '');

  R.fillContentReveal(slot, '');
  assert.equal(host.style.display, 'none', 'clearing HTML hides the whole section again');
});

test('section showWhen suppresses a filled preview host', () => {
  const schema = {
    rows: [
      { type: 'field', name: 'collectionName', inputType: 'text', value: 'Grid' },
      {
        type: 'section',
        id: 'preview',
        showWhenRules: [{ field: 'collectionName', values: ['*'] }],
        blocks: [
          { type: 'divider', section: false },
          { type: 'heading', text: 'Preview' },
          { type: 'preview' },
        ],
      },
    ],
  };
  const container = mount(schema);
  const attached = R.attachListeners(container, schema, function () {});
  const host = container.querySelector('[data-content-reveal-host]');
  const slot = host.querySelector('[data-preview-slot]');

  attached.applyVisibility();
  assert.equal(host.style.display, 'none', 'empty host stays closed even when showWhen matches');

  R.fillContentReveal(slot, '<b>ready</b>');
  attached.applyVisibility();
  assert.equal(host.style.display, '', 'filled host opens when showWhen matches');

  container.querySelector('[data-field="collectionName"]').value = '';
  attached.applyVisibility();
  assert.equal(host.style.display, 'none', 'failed showWhen suppresses the filled host');
});

test('a settings section with a preview slot is not a content-reveal host', () => {
  // Colors once put `{ type: "preview" }` next to Shared lightness inside oklch-settings. The
  // alignment banner that used to fill `__panel__` is gone, so treating that section as a host
  // hid the curve forever. Form fields keep ordinary showWhen; only the slot content-reveals.
  const schema = {
    rows: [
      { type: 'field', name: 'colorModel', inputType: 'radio', value: 'oklch',
        options: ['hsl:HSL', 'oklch:OKLCH'] },
      {
        type: 'section',
        id: 'oklch-settings',
        showWhenRules: [{ field: 'colorModel', values: ['oklch'] }],
        blocks: [
          { type: 'heading', text: 'OKLCH settings' },
          { type: 'field', name: 'curve', inputType: 'curve', value: [0.33, 0.33, 0.67, 0.67],
            ends: [], range: [0, 100] },
          { type: 'preview' },
        ],
      },
    ],
  };
  const container = mount(schema);
  const attached = R.attachListeners(container, schema, function () {});
  const sec = container.querySelector('[data-section="oklch-settings"]');
  assert.ok(sec);
  assert.equal(sec.getAttribute('data-content-reveal-host'), null,
    'settings + preview must not become a reveal host');
  attached.applyVisibility();
  assert.equal(sec.style.display, '', 'showWhen alone opens the settings section');
  const slot = sec.querySelector('[data-preview-slot]');
  assert.equal(slot.style.display, 'none', 'empty preview slot still stays closed');
});
