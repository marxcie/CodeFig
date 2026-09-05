/**
 * Help documentation specimen shelf `@PANEL_START` migration (plan 37).
 *
 * Live `@UI_CONFIG` + `@PANEL` must deep-equal the pre-migration normalized rows
 * in `tests/fixtures/help-documentation.js.json` (dumped from the old annotation
 * parser before the move). Strips the same noise as the utilities differential:
 * blank / lineBreak / directive, raw / syntax / trailingComma / attachTo, plus
 * `unknownAnnotations` (old-path leftover on `@group` + `@unit`).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const parser = require('../src/config-ui/parser.js');

const HELP = path.join(__dirname, '..', 'scripts', 'HELP', 'help-documentation.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'help-documentation.js.json');

function extract(src, startMarker, endMarker) {
  const start = new RegExp('^\\s*//\\s*' + startMarker + '\\s*$', 'm').exec(src);
  const end = new RegExp('^\\s*//\\s*' + endMarker + '\\s*$', 'm').exec(src);
  assert.ok(start && end && end.index > start.index, 'missing ' + startMarker);
  return src.slice(start.index + start[0].length, end.index).replace(/^\n/, '');
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

function normaliseParagraph(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : text;
}

function normalize(rows) {
  return parser.flattenPanelRows(rows)
    .filter((r) => r.type !== 'blank' && r.type !== 'lineBreak' && r.type !== 'directive' && r.type !== 'spacer')
    .map((r) => {
      const clone = Object.assign({}, r);
      delete clone.raw;
      delete clone.syntax;
      delete clone.trailingComma;
      delete clone.attachTo;
      delete clone.unknownAnnotations;
      if (clone.helper !== undefined) clone.helper = normaliseHelper(clone.helper);
      if (clone.type === 'paragraph' && clone.text !== undefined) {
        clone.text = normaliseParagraph(clone.text);
      }
      if (clone.columns) {
        clone.columns = clone.columns.map((c) => {
          const cc = Object.assign({}, c);
          delete cc.raw;
          delete cc.group;
          return cc;
        });
      }
      return stripUndefinedDeep(clone);
    });
}

test('help-documentation.js: live @PANEL parse matches the pre-migration fixture', () => {
  const src = fs.readFileSync(HELP, 'utf8');
  assert.match(src, /^\/\/ @UI_CONFIG_START$/m);
  assert.match(src, /^\/\/ @PANEL_START$/m);
  const parsed = parser.parse(
    extract(src, '@UI_CONFIG_START', '@UI_CONFIG_END'),
    extract(src, '@PANEL_START', '@PANEL_END')
  );
  assert.ok(!parsed.error, parsed.error);
  assert.equal(parsed.driftWarning, null);

  const live = normalize(parsed.rows);
  const expected = normalize(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')));
  assert.strictEqual(live.length, expected.length, 'row count differs');
  expected.forEach((oldRow, i) => {
    assert.deepStrictEqual(
      live[i], oldRow,
      `row ${i} (${oldRow.type}${oldRow.name ? ':' + oldRow.name : ''}` +
        `${oldRow.text ? ':' + String(oldRow.text).slice(0, 30) : ''}) differs`
    );
  });
});

test('help specimen keeps the intentional unsupported nested object', () => {
  const src = fs.readFileSync(HELP, 'utf8');
  const parsed = parser.parse(
    extract(src, '@UI_CONFIG_START', '@UI_CONFIG_END'),
    extract(src, '@PANEL_START', '@PANEL_END')
  );
  const nested = parser.flattenPanelRows(parsed.rows).find((r) => r.type === 'field' && r.name === 'nested');
  assert.ok(nested, 'nested field missing');
  assert.strictEqual(nested.inputType, 'unsupported');
});

test('help specimen keeps @prose so paragraphs stay on the page', () => {
  const src = fs.readFileSync(HELP, 'utf8');
  const parsed = parser.parse(
    extract(src, '@UI_CONFIG_START', '@UI_CONFIG_END'),
    extract(src, '@PANEL_START', '@PANEL_END')
  );
  assert.ok(parsed.rows.some((r) => r.type === 'directive' && r.directive === 'prose'));
});
