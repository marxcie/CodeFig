const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const parser = require('../src/config-ui/parser.js');

const DSF = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');

function region(src, a, b) {
  const m = new RegExp(a + '\\n([\\s\\S]*?)\\/\\/ ' + b).exec(src);
  assert.ok(m, 'missing ' + a);
  return m[1];
}

function columnsOf(fileName) {
  const src = fs.readFileSync(path.join(DSF, fileName), 'utf8');
  const parsed = parser.parse(region(src, '@CONFIG_START', '@CONFIG_END'), region(src, '@PANEL_START', '@PANEL_END'));
  assert.ok(!parsed.error, parsed.error);
  const found = [];
  const walk = (cols) => (cols || []).forEach((c) => { found.push(c); walk(c.columns); });
  parser.flattenPanelRows(parsed.rows).forEach((r) => { if (r.type === 'field') { found.push(r); walk(r.columns); } });
  return found;
}

function boundsOf(fileName, key) {
  const hit = columnsOf(fileName).filter((c) => (c.key || c.name) === key && c.min !== undefined);
  assert.ok(hit.length, fileName + ' ' + key + ' carries no min');
  return hit[0];
}

test('grid columns cannot go below 1', () => {
  assert.strictEqual(boundsOf('grid.js', 'columns').min, 1);
});

test('colour anchors carry their channel range', () => {
  const colors = 'colors.js';
  assert.deepStrictEqual([boundsOf(colors, 'hue').min, boundsOf(colors, 'hue').max], [0, 360]);
  assert.deepStrictEqual([boundsOf(colors, 'saturation').min, boundsOf(colors, 'saturation').max], [0, 100]);
  assert.deepStrictEqual([boundsOf(colors, 'lightness').min, boundsOf(colors, 'lightness').max], [0, 100]);
  assert.strictEqual(boundsOf(colors, 'chroma').max, 0.5);
});

test('scale scripts keep "Every N steps" at 1 or more', () => {
  ['spacing.js', 'corner-radius.js', 'typography.js'].forEach((f) => assert.strictEqual(boundsOf(f, 'mod').min, 1));
});
