/**
 * Find/replace / rename family `@PANEL_START` migration (plan 37): parse each
 * script's live `@UI_CONFIG` + `@PANEL` regions and deep-equal against fixtures
 * of the normalized old-parser rows (dumped to `scratchpad/rows-*.json`, then
 * copied to `tests/fixtures/utilities-fr/`).
 *
 * Same normalize contract as the small-utilities suite: strip blank / lineBreak /
 * directive, drop raw / syntax / trailingComma, and drop `attachTo` (new-format
 * only — see `tests/config-ui-panel-spec-colors.test.js`).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const parser = require('../src/config-ui/parser.js');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS');
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'utilities-fr');

/** Utility scripts now live in subfolders (Styles, Variables, …); find by basename. */
function utilityScriptPath(fileName) {
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const hit = walk(p);
        if (hit) return hit;
      } else if (ent.name === fileName) {
        return p;
      }
    }
    return null;
  }
  const found = walk(SCRIPTS_DIR);
  assert.ok(found, fileName + ' not found under EXAMPLE_SCRIPTS');
  return found;
}

const FILES = [
  'replace-styles.js',
  'replace-variables.js',
  'rename-variables.js',
  'rename-styles.js',
  'replace-style-variable-bindings.js',
  'match-colors-to-collection-variables.js',
  'comments-to-annotations.js',
  'variable-inspector.js',
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
  const src = fs.readFileSync(utilityScriptPath(fileName), 'utf8');
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

test('fixtures/utilities-fr covers every migrated find/replace script', () => {
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
