/**
 * Plan 37 follow-on: `type: "section"` containers + `spacer-s`/`m`/`l`.
 * Sections stay in the IR (and DOM); leaves flatten for field walks.
 */
const test = require('node:test');
const assert = require('node:assert');
const shim = require('./dom-shim.js');
const { document } = shim.install();
const parser = require('../src/config-ui/parser.js');
const renderer = require('../src/config-ui/renderer.js');

test('section nests blocks, inherits showWhen, and flattens for field walks', () => {
  const values = { collectionName: '', tokens: [], flag: false };
  const parsed = parser.parsePanelSpec(`var __codefigPanel = { blocks: [
    { type: "section", id: "general", blocks: [
      { type: "heading", text: "General" },
      { key: "collectionName", type: "collection", label: "Collection" },
      { type: "spacer-m" },
      { key: "tokens", type: "list", label: "Tokens" }
    ]},
    { type: "divider" },
    { type: "section", id: "mode-settings",
      showWhen: { collectionName: "*", tokens: "*" },
      blocks: [
        { type: "heading", text: "Mode settings" },
        { key: "flag", type: "boolean", label: "Flag" }
      ]}
  ]};`, values);

  assert.ok(!parsed.error, parsed.error);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].type, 'section');
  assert.equal(parsed.rows[0].id, 'general');
  assert.equal(parsed.rows[1].type, 'divider');
  assert.equal(parsed.rows[1].section, true, 'root divider between sections is edge-to-edge');
  assert.equal(parsed.rows[2].type, 'section');
  assert.deepEqual(parsed.rows[2].showWhenRules, [
    { field: 'collectionName', values: ['*'] },
    { field: 'tokens', values: ['*'] },
  ]);

  const flag = parsed.rows[2].blocks.find((r) => r.type === 'field' && r.name === 'flag');
  assert.ok(flag);
  assert.deepEqual(flag.showWhenRules, parsed.rows[2].showWhenRules);

  const flat = parser.flattenPanelRows(parsed.rows);
  assert.ok(flat.some((r) => r.type === 'spacer' && r.size === 'm'));
  assert.deepEqual(
    flat.filter((r) => r.type === 'field').map((r) => r.name),
    ['collectionName', 'tokens', 'flag']
  );
});

test('root divider is edge-to-edge only when sections are siblings', () => {
  const withSections = parser.parsePanelSpec(`var __codefigPanel = { blocks: [
    { type: "section", blocks: [{ type: "heading", text: "A" }] },
    { type: "divider" },
    { type: "section", blocks: [{ type: "heading", text: "B" }] }
  ]};`, {});
  assert.equal(withSections.rows[1].section, true);

  const flat = parser.parsePanelSpec(`var __codefigPanel = { blocks: [
    { type: "heading", text: "A" },
    { type: "divider" },
    { type: "heading", text: "B" },
    { type: "divider", section: true }
  ]};`, {});
  assert.equal(flat.rows[1].section, false);
  assert.equal(flat.rows[3].section, true);
});

test('divider inside a section stays short unless section: true', () => {
  const parsed = parser.parsePanelSpec(`var __codefigPanel = { blocks: [
    { type: "section", blocks: [
      { type: "heading", text: "A" },
      { type: "divider" },
      { type: "divider", section: true }
    ]}
  ]};`, {});
  assert.ok(!parsed.error, parsed.error);
  const divs = parsed.rows[0].blocks.filter((r) => r.type === 'divider');
  assert.equal(divs[0].section, false);
  assert.equal(divs[1].section, true);
});

test('renderer wraps sections and spacers in their own classes', () => {
  const schema = parser.parse(
    'collectionName: "",\ntokens: [],\nflag: false,',
    `var __codefigPanel = { blocks: [
      { type: "section", id: "general", blocks: [
        { type: "heading", text: "General" },
        { key: "collectionName", type: "collection", label: "Collection" },
        { type: "spacer-s" },
        { type: "spacer-m" },
        { type: "spacer-l" },
        { key: "tokens", type: "list", label: "Tokens" }
      ]},
      { type: "section", id: "mode-settings",
        showWhen: { collectionName: "*", tokens: "*" },
        blocks: [
          { type: "heading", text: "Mode settings" },
          { key: "flag", type: "boolean", label: "Flag" }
        ]}
    ]};`
  );
  assert.ok(!schema.error, schema.error);
  const container = document.createElement('div');
  renderer.buildForm(schema, container);
  const sections = container.querySelectorAll('section.config-ui-section');
  assert.equal(sections.length, 2);
  assert.ok(container.querySelector('.config-ui-section--general'));
  assert.ok(container.querySelector('.config-ui-section--mode-settings'));
  assert.ok(container.querySelector('.config-ui-spacer--s'));
  assert.ok(container.querySelector('.config-ui-spacer--m'));
  assert.ok(container.querySelector('.config-ui-spacer--l'));
  assert.ok(sections[1].getAttribute('data-show-when-rules'));
});
