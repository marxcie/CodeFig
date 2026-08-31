/**
 * Typography `@PANEL_START` migration differential (plan 37).
 *
 * Compares the new panel reader against the pre-migration old-parser rows in
 * `tests/fixtures/typography-panel-rows.json` (directive stripped; originally dumped from
 * scratchpad before migration). Colors already migrated the same way; Typography adds list
 * fields, textarea, nested group columns with `unit`, and a suggestions marker — features
 * Colors never exercised.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const parser = require('../src/config-ui/parser.js');

const TYPOGRAPHY_PATH = path.join(
  __dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'typography.js'
);
const ROWS_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'typography-panel-rows.json');

function extractRegion(src, startMarker, endMarker) {
  const re = new RegExp(startMarker + '\\n([\\s\\S]*?)\\/\\/ ' + endMarker);
  const m = re.exec(src);
  assert.ok(m, 'typography.js is missing ' + startMarker + ' … ' + endMarker);
  return m[1];
}

function liveTypography() {
  const src = fs.readFileSync(TYPOGRAPHY_PATH, 'utf8');
  return parser.parse(
    extractRegion(src, '@CONFIG_START', '@CONFIG_END'),
    extractRegion(src, '@PANEL_START', '@PANEL_END')
  );
}

function expectedRows() {
  const rows = JSON.parse(fs.readFileSync(ROWS_FIXTURE_PATH, 'utf8'));
  return rows.filter((r) => r.type !== 'directive');
}

function stripUndefinedDeep(value) {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((k) => {
      if (value[k] !== undefined) out[k] = stripUndefinedDeep(value[k]);
    });
    return out;
  }
  return value;
}

function normaliseHelper(text) {
  return typeof text === 'string' ? text.replace(/\\n/g, '\n') : text;
}

/**
 * Drops format-specific noise: `raw`/`syntax`/`trailingComma` from the old path, and the
 * additive `group` CSS hook `panelColumn` sets on nested groups (`parser.js`) that the old
 * one-liner never wrote.
 */
function stripRowNoise(row) {
  const clone = Object.assign({}, row);
  delete clone.raw;
  delete clone.syntax;
  delete clone.trailingComma;
  delete clone.attachTo;
  if (clone.helper !== undefined) clone.helper = normaliseHelper(clone.helper);
  if (clone.columns) {
    clone.columns = clone.columns.map((c) => {
      const cc = Object.assign({}, c);
      delete cc.raw;
      delete cc.group;
      if (cc.helper !== undefined) cc.helper = normaliseHelper(cc.helper);
      if (cc.columns) {
        cc.columns = cc.columns.map((gc) => {
          const g = Object.assign({}, gc);
          delete g.raw;
          delete g.group;
          if (g.helper !== undefined) g.helper = normaliseHelper(g.helper);
          return g;
        });
      }
      return stripUndefinedDeep(cc);
    });
  }
  return stripUndefinedDeep(clone);
}

test('typography.js: @PANEL_START matches the pre-migration rows dump, field by field', () => {
  const oldRows = expectedRows().map(stripRowNoise);
  const newRows = liveTypography().rows.map(stripRowNoise);

  assert.ok(!liveTypography().error, 'panel parse error: ' + liveTypography().error);
  assert.strictEqual(newRows.length, oldRows.length, 'row count differs');
  oldRows.forEach((oldRow, i) => {
    assert.deepStrictEqual(
      newRows[i], oldRow,
      `row ${i} (${oldRow.type}${oldRow.name ? ':' + oldRow.name : ''}${oldRow.text ? ':' + oldRow.text.slice(0, 30) : ''}) differs`
    );
  });
});

test('typography.js: live values from @CONFIG_START reach list / textarea / nested group fields', () => {
  const rows = liveTypography().rows;
  const fontScale = rows.find((r) => r.type === 'field' && r.name === 'fontScale');
  assert.ok(Array.isArray(fontScale.value) && fontScale.value.length === 10);
  assert.strictEqual(fontScale.inputType, 'list');

  const fontWeights = rows.find((r) => r.type === 'field' && r.name === 'fontWeights');
  assert.deepStrictEqual(fontWeights.value, [400, 600]);
  assert.strictEqual(fontWeights.inputType, 'list');

  const previewText = rows.find((r) => r.type === 'field' && r.name === 'overviewPreviewText');
  assert.strictEqual(previewText.inputType, 'textarea');
  assert.ok(previewText.value.indexOf('Sphinx') === 0);

  const modes = rows.find((r) => r.type === 'field' && r.name === 'modes');
  const letterSpacing = modes.columns.find((c) => c.key === 'letterSpacing');
  assert.strictEqual(letterSpacing.type, 'group');
  assert.strictEqual(letterSpacing.columns[0].unit, '%');
  assert.strictEqual(letterSpacing.columns[1].unit, '%');
  assert.deepStrictEqual(modes.value[0].letterSpacing, { base: 0, max: -2 });
  assert.deepStrictEqual(modes.value[0].lineHeight, { base: 150, max: 110 });
});

test('typography.js: suggestions and preview markers are present', () => {
  const types = liveTypography().rows.map((r) => r.type);
  assert.ok(types.includes('suggestions'));
  assert.ok(types.includes('preview'));
});

test('typography.js: @fromFile stays in @CONFIG_START', () => {
  const src = fs.readFileSync(TYPOGRAPHY_PATH, 'utf8');
  const config = extractRegion(src, '@CONFIG_START', '@CONFIG_END');
  assert.match(config, /@fromFile:\s*domains\.typography/);
});

test('typography.js: ensureCompatTypographyConfig still sits after the config object', () => {
  const src = fs.readFileSync(TYPOGRAPHY_PATH, 'utf8');
  const end = src.indexOf('// @PANEL_END');
  assert.ok(end !== -1);
  const after = src.slice(end);
  assert.match(after, /};\s*\n\s*ensureCompatTypographyConfig\(typographyConfigData\);/);
});
