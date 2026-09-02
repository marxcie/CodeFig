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
