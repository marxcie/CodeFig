/**
 * Spacing + Corner radius `@PANEL_START` migration (plan 37): parse the live
 * `@CONFIG` + `@PANEL` regions and deep-equal against fixtures of the normalized
 * old-parser rows (dumped before migration into `scratchpad/rows-*.json`, then
 * copied through the same normalize used in `tests/config-ui-panel-spec.test.js`).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const parser = require('../src/config-ui/parser.js');

const DSF = path.join(
  __dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations'
);

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

function normalize(rows) {
  return rows
    .filter((r) => r.type !== 'blank' && r.type !== 'lineBreak' && r.type !== 'directive')
    .map((r) => {
      const clone = Object.assign({}, r);
      delete clone.raw;
      delete clone.syntax;
      delete clone.trailingComma;
      if (clone.helper !== undefined) clone.helper = normaliseHelper(clone.helper);
      if (clone.columns) {
        clone.columns = clone.columns.map((c) => {
          const cc = Object.assign({}, c);
          delete cc.raw;
          if (cc.helper !== undefined) cc.helper = normaliseHelper(cc.helper);
          return stripUndefinedDeep(cc);
        });
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
  const src = fs.readFileSync(path.join(DSF, fileName), 'utf8');
  return parser.parse(
    extract(src, '@CONFIG_START', '@CONFIG_END'),
    extract(src, '@PANEL_START', '@PANEL_END')
  );
}

function expectedRows(fixtureName) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', fixtureName), 'utf8')
  );
}

function assertPanelMatchesFixture(fileName, fixtureName) {
  const parsed = liveParse(fileName);
  assert.ok(!parsed.error, fileName + ' panel parse error: ' + parsed.error);
  const live = normalize(parsed.rows);
  const expected = expectedRows(fixtureName);
  assert.strictEqual(live.length, expected.length, fileName + ': row count differs');
  expected.forEach((oldRow, i) => {
    assert.deepStrictEqual(
      live[i], oldRow,
      fileName + ` row ${i} (${oldRow.type}${oldRow.name ? ':' + oldRow.name : ''}` +
        `${oldRow.text ? ':' + oldRow.text.slice(0, 30) : ''}) differs`
    );
  });
}

test('spacing.js: live @PANEL parse matches the pre-migration normalized rows fixture', () => {
  assertPanelMatchesFixture('spacing.js', 'spacing-panel-rows.json');
});

test('corner-radius.js: live @PANEL parse matches the pre-migration normalized rows fixture', () => {
  assertPanelMatchesFixture('corner-radius.js', 'corner-radius-panel-rows.json');
});

test('spacing.js: modes carries the seeded Value mode from @CONFIG_START', () => {
  const modes = liveParse('spacing.js').rows.find((r) => r.type === 'field' && r.name === 'modes');
  assert.ok(modes);
  assert.strictEqual(modes.value[0].name, 'Value');
  assert.deepStrictEqual(modes.value[0].extras, [1]);
});

test('corner-radius.js: modes carries extras [0] from @CONFIG_START', () => {
  const modes = liveParse('corner-radius.js').rows.find((r) => r.type === 'field' && r.name === 'modes');
  assert.ok(modes);
  assert.deepStrictEqual(modes.value[0].extras, [0]);
});
