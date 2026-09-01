/**
 * Grid `@PANEL_START` migration (plan 37). Compares the live `@CONFIG` + `@PANEL`
 * regions against the old annotation parser on a frozen pre-migration CONFIG body
 * (captured from HEAD before migration). Same normalize / differential idea as
 * Spacing and Typography.
 *
 * Not compared: `raw`, `syntax`, `trailingComma` — value-line reprinting artifacts.
 * `blank` / `lineBreak` / `directive` rows are stripped on both sides.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const parser = require('../src/config-ui/parser.js');

const GRID_PATH = path.join(
  __dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'grid.js'
);

/**
 * Pre-migration `@CONFIG_START` body (annotations + values), frozen from HEAD so
 * `oldParseGrid` still works after the live file holds values only.
 */
const PRE_MIGRATION_GRID_CONFIG = [
  '  // @fromFile: domains.grid',
  '',
  '  // # General',
  '  collectionName: "", // @collection @label: Collection @placeholder="eg. Responsive System"',
  '  // @collectionModes: Collection modes',
  '  group: "Grid", // @label: Group within collection @placeholder="eg. Grid"',
  '',
  '  // --- @section',
  '',
  '  // # Mode settings',
  '  extensionColumns: 0, // @label: Extra columns @helper: Extra column variables past the main grid, for layouts that need to overshoot.',
  '  generateOverview: false, // @label: Generate overview @helper: Builds a Grid overview on the canvas: one preview frame per mode with the layout grid applied.',
  '',
  '  modes: [',
  '    {',
  '      name: "Value",',
  '      containerWidth: 1920,',
  '      columns: 12,',
  '      gap: 40,',
  '      padding: 80',
  '    }',
  '  ], // @rows: name:text=Mode|containerWidth:number=Width|columns:number=Columns|gap:number=Gap|padding:number=Margins @tabs @label: Modes',
  '',
  '  // # Suggested whole number divisions',
  '  // @suggestions',
  '',
  '  // # Preview',
  '  // @preview',
  '',
].join('\n');

function extractRegion(src, startMarker, endMarker) {
  const m = new RegExp(startMarker + '\\n([\\s\\S]*?)\\/\\/ ' + endMarker).exec(src);
  assert.ok(m, 'grid.js is missing ' + startMarker + ' … ' + endMarker);
  return m[1];
}

function oldParseGrid() {
  return parser.parse(PRE_MIGRATION_GRID_CONFIG);
}

function newParseGrid() {
  const src = fs.readFileSync(GRID_PATH, 'utf8');
  return parser.parse(
    extractRegion(src, '@CONFIG_START', '@CONFIG_END'),
    extractRegion(src, '@PANEL_START', '@PANEL_END')
  );
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

function normalize(rows) {
  return rows
    .filter((r) => r.type !== 'blank' && r.type !== 'lineBreak' && r.type !== 'directive')
    .map((r) => {
      const clone = Object.assign({}, r);
      delete clone.raw;
      delete clone.syntax;
      delete clone.trailingComma;
      if (clone.columns) {
        clone.columns = clone.columns.map((c) => {
          const cc = Object.assign({}, c);
          delete cc.raw;
          return cc;
        });
      }
      return stripUndefinedDeep(clone);
    });
}

test('the new reader dispatches when a panelSpecText is given, old path otherwise', () => {
  const withSpec = parser.parse('{ a: 1 }', '// { blocks: [] }');
  assert.deepStrictEqual(withSpec.rows, []);
  const withoutSpec = parser.parse('// @UI_CONFIG_START\na: 1,\n// @UI_CONFIG_END');
  assert.ok(withoutSpec.rows.length > 0, 'old path should still produce rows with no panelSpecText');
});

test('an unreadable @PANEL_START reports an error rather than throwing', () => {
  const result = parser.parse('{}', '// { not json');
  assert.ok(result.error);
  assert.deepStrictEqual(result.rows, []);
});

test('grid.js: live @PANEL matches the pre-migration annotation parse, field by field', () => {
  const oldRows = normalize(oldParseGrid().rows);
  const live = newParseGrid();
  assert.ok(!live.error, 'panel parse error: ' + live.error);
  const newRows = normalize(live.rows);
  assert.strictEqual(newRows.length, oldRows.length, 'row count differs — see which rows below');
  oldRows.forEach((oldRow, i) => {
    assert.deepStrictEqual(
      newRows[i], oldRow,
      `row ${i} (${oldRow.type}${oldRow.name ? ':' + oldRow.name : ''}${oldRow.text ? ':' + oldRow.text.slice(0, 30) : ''}) differs`
    );
  });
});

test('grid.js: the rows/tabs field carries the live value from @CONFIG_START, not a placeholder', () => {
  const modesRow = newParseGrid().rows.find((r) => r.type === 'field' && r.name === 'modes');
  assert.ok(modesRow);
  assert.deepStrictEqual(modesRow.value, [
    { name: 'Value', containerWidth: 1920, columns: 12, gap: 40, padding: 80 },
  ]);
});

test('grid.js: @fromFile stays in @CONFIG_START', () => {
  const src = fs.readFileSync(GRID_PATH, 'utf8');
  const config = extractRegion(src, '@CONFIG_START', '@CONFIG_END');
  assert.match(config, /@fromFile:\s*domains\.grid/);
});

test('grid.js: variables function remains a sibling after @PANEL_END', () => {
  const src = fs.readFileSync(GRID_PATH, 'utf8');
  const panelEnd = src.indexOf('// @PANEL_END');
  assert.ok(panelEnd !== -1);
  const after = src.slice(panelEnd + '// @PANEL_END'.length);
  assert.match(after, /^\s*,\s*(?:\/\/[^\n]*\n\s*)*variables:\s*function\s*\(/);
});
