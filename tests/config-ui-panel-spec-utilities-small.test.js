/**
 * Small/medium EXAMPLE_SCRIPTS `@PANEL_START` migration (plan 37): parse each
 * script's live `@UI_CONFIG` + `@PANEL` regions and deep-equal against fixtures
 * of the normalized old-parser rows (dumped to `scratchpad/rows-*.json`, then
 * copied to `tests/fixtures/utilities/`).
 *
 * Same normalize contract as Spacing / Colors: strip blank / lineBreak /
 * directive, drop raw / syntax / trailingComma, and drop `attachTo` (new-format
 * only — see `tests/config-ui-panel-spec-colors.test.js`).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const parser = require('../src/config-ui/parser.js');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS');
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'utilities');

const FILES = [
  'change-case.js',
  'relink-local-instances.js',
  'relink-local-styles.js',
  'remove-unnecessary-nesting.js',
  'color-scale-layout.js',
  'render-styles-overview.js',
  'copy-simple-variables-json.js',
  'duplicate-variable-collection.js',
  'frame-or-auto-layout-selected.js',
  'detach-styles_&_variables.js',
  'merge-variable-collections.js',
  'export-import-variables.js',
  'duplicate-styles.js',
  'select-by-styles-variables.js',
  'selection-to-variables.js',
  'scale-selection.js',
];

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

/** Old annotations carried a literal two-character `\n`; JSON helpers may use a real newline. */
function normaliseHelper(text) {
  return typeof text === 'string' ? text.replace(/\\n/g, '\n') : text;
}

/**
 * A paragraph's line break in the old format is where the source comment happened to wrap,
 * not a meaningful break — collapse whitespace so a real wording difference still shows up.
 */
function normaliseParagraph(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : text;
}

function normalize(rows) {
  return rows
    .filter((r) => r.type !== 'blank' && r.type !== 'lineBreak' && r.type !== 'directive')
    .map((r) => {
      const clone = Object.assign({}, r);
      delete clone.raw;
      delete clone.syntax;
      delete clone.trailingComma;
      // `attachTo` is how a `@PANEL_START` paragraph replaces the blank-`//`-line signal the old
      // format used; the old reader has no such field. Comparing it would flag every paragraph.
      delete clone.attachTo;
      if (clone.helper !== undefined) clone.helper = normaliseHelper(clone.helper);
      if (clone.type === 'paragraph' && clone.text !== undefined) {
        clone.text = normaliseParagraph(clone.text);
      }
      return stripUndefinedDeep(clone);
    });
}

function extract(src, startMarker, endMarker) {
  const m = new RegExp(startMarker + '\\n([\\s\\S]*?)\\/\\/ ' + endMarker).exec(src);
  assert.ok(m, 'missing ' + startMarker);
  return m[1];
}

function liveParse(fileName) {
  const src = fs.readFileSync(path.join(SCRIPTS_DIR, fileName), 'utf8');
  assert.match(src, /@UI_CONFIG_START/, fileName + ' should keep @UI_CONFIG_START');
  assert.match(src, /@PANEL_START/, fileName + ' should have @PANEL_START');
  return parser.parse(
    extract(src, '@UI_CONFIG_START', '@UI_CONFIG_END'),
    extract(src, '@PANEL_START', '@PANEL_END')
  );
}

function expectedRows(fileName) {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, fileName + '.json'), 'utf8')
  );
}

function assertPanelMatchesFixture(fileName) {
  const parsed = liveParse(fileName);
  assert.ok(!parsed.error, fileName + ' panel parse error: ' + parsed.error);
  const live = normalize(parsed.rows);
  const expected = normalize(expectedRows(fileName));
  assert.strictEqual(live.length, expected.length, fileName + ': row count differs');
  expected.forEach((oldRow, i) => {
    assert.deepStrictEqual(
      live[i], oldRow,
      fileName + ` row ${i} (${oldRow.type}${oldRow.name ? ':' + oldRow.name : ''}` +
        `${oldRow.text ? ':' + oldRow.text.slice(0, 30) : ''}) differs`
    );
  });
}

test('fixtures/utilities covers every migrated utility script', () => {
  const onDisk = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json')).sort();
  assert.deepStrictEqual(
    onDisk,
    FILES.map((f) => f + '.json').sort(),
    'fixture set and FILES list must stay in sync'
  );
});

for (const fileName of FILES) {
  test(fileName + ': live @PANEL parse matches the pre-migration normalized rows fixture', () => {
    assertPanelMatchesFixture(fileName);
  });
}

test('panelFieldRow: a string options value is an optionSource, not character-index options', () => {
  const parsed = parser.parse(
    'var collections = [];',
    '// { blocks: [ { key: "collections", type: "multiselect", options: "localVariableCollections" } ] }'
  );
  assert.ok(!parsed.error, parsed.error);
  const row = parsed.rows[0];
  assert.strictEqual(row.optionSource, 'localVariableCollections');
  assert.strictEqual(row.options, undefined);
});

test('panelFieldRow: mode carries collectionField from collection', () => {
  const parsed = parser.parse(
    'var targetMode = "";',
    '// { blocks: [ { key: "targetMode", type: "mode", label: "Mode", collection: "targetCollection" } ] }'
  );
  assert.ok(!parsed.error, parsed.error);
  assert.strictEqual(parsed.rows[0].collectionField, 'targetCollection');
  assert.strictEqual(parsed.rows[0].labelSpelled, true);
});
