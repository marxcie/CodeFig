/**
 * `@PANEL_START`: the differential test `.plans/31-panel-spec-json.md` asks for before any real
 * panel migrates. Parse a real script's block with the old annotation parser, hand-author the
 * `@PANEL_START` equivalent, parse that with the new reader, and deep-equal the two on the fields
 * the renderer actually reads.
 *
 * **Scope, stated plainly.** This proves the reader and the merge-with-live-values mechanism work
 * for a real, representative panel (Grid) — not that all six are migrated. Two things are
 * deliberately out of this pass:
 *
 * - The `@fromFile: domains.grid` directive. Something downstream of `parse()` reads that value
 *   out of the raw `@CONFIG_START` text by its own regex (per the comment on the directive branch
 *   in `parse()`); for the new format that value would need to move somewhere `@PANEL_START`-aware
 *   code can reach it, and finding every such reader was out of scope for the reader itself. The
 *   fixture below omits it, and the comparison strips the old parser's directive row to match.
 * - Wiring `parse(code, panelSpecText)`'s second argument into `src/ui.html`'s own
 *   `@CONFIG_START`/`@PANEL_START` extraction. No call site there passes it yet — see the comment
 *   above `parse()` in `src/config-ui/parser.js`.
 *
 * Not compared: `raw`, `syntax`, `trailingComma` — value-line reprinting artifacts specific to the
 * one-line-per-field format, meaningless once the spec lives in its own region.  `blank`/
 * `lineBreak` rows are also excluded from both sides — they exist only because the old format is
 * line-oriented text; a JSON block has no concept of "a blank source line" to preserve.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const parser = require('../src/config-ui/parser.js');

const GRID_PATH = path.join(
  __dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'grid.js'
);

function oldParseGrid() {
  const src = fs.readFileSync(GRID_PATH, 'utf8');
  const m = /@CONFIG_START\n([\s\S]*?)\/\/ @CONFIG_END/.exec(src);
  assert.ok(m, 'grid.js has no @CONFIG_START block — has it moved?');
  return parser.parse(m[1]);
}

/** The @PANEL_START equivalent of grid.js's spec, hand-authored, @fromFile omitted (see header). */
const GRID_PANEL_SPEC = [
  '// @PANEL_START',
  '// {',
  '//   blocks: [',
  '//     { type: "heading", text: "General" },',
  '//     { key: "collectionName", type: "collection", label: "Collection",',
  '//       placeholder: "eg. Responsive System" },',
  '//     { type: "chips", label: "Collection modes", from: "modes" },',
  '//     { key: "group", type: "string", label: "Group within collection", placeholder: "eg. Grid" },',
  '//     { type: "divider", section: true },',
  '//     { type: "heading", text: "Mode settings" },',
  '//     { key: "extensionColumns", type: "number", label: "Extra columns",',
  '//       helper: "Added as numeric variables for overshoot layout" },',
  '//     { key: "generateOverview", type: "boolean", label: "Generate overview",',
  '//       helper: "Generate Figma frames for each mode" },',
  '//     { key: "modes", type: "rows", label: "Modes", layout: "tabs",',
  '//       columns: [',
  '//         { key: "name", type: "text", label: "Mode" },',
  '//         { key: "containerWidth", type: "number", label: "Width" },',
  '//         { key: "columns", type: "number", label: "Columns" },',
  '//         { key: "gap", type: "number", label: "Gap" },',
  '//         { key: "padding", type: "number", label: "Margins" }',
  '//       ] },',
  '//     { type: "heading", text: "Suggested whole number divisions" },',
  '//     { type: "suggestions" },',
  '//     { type: "heading", text: "Preview" },',
  '//     { type: "preview" }',
  '//   ]',
  '// }',
  '// @PANEL_END',
].join('\n');

/** Plain values only — what @CONFIG_START becomes once the spec moves to @PANEL_START. */
const GRID_VALUES_BLOCK = [
  '  collectionName: "",',
  '  group: "Grid",',
  '  extensionColumns: 0,',
  '  generateOverview: false,',
  '  modes: [',
  '    { name: "Value", containerWidth: 1920, columns: 12, gap: 40, padding: 80 }',
  '  ]',
].join('\n');

/** `parse()`'s second argument is the region's *inner* text, the same convention @CONFIG_START's
 *  own extraction uses — the marker lines themselves are the caller's problem, not the reader's. */
function innerPanelSpec(block) {
  const m = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(block);
  assert.ok(m, 'GRID_PANEL_SPEC fixture has no @PANEL_START/@PANEL_END markers');
  return m[1];
}

function newParseGrid() {
  return parser.parse(GRID_VALUES_BLOCK, innerPanelSpec(GRID_PANEL_SPEC));
}

/**
 * Drops the format-specific noise both sides carry, per the header comment, plus any key whose
 * value is `undefined` — the old parser sets `showWhenRules: undefined` on a plain heading rather
 * than omitting the key, which `buildRow`'s `r.showWhenRules || …` reads identically to an absent
 * key. A test asserting object shape should not fail on a difference the renderer cannot see.
 */
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

test('grid.js: the new reader matches the old parser field-by-field, section-heading-by-section-heading', () => {
  const oldRows = normalize(oldParseGrid().rows);
  const newRows = normalize(newParseGrid().rows);
  assert.strictEqual(newRows.length, oldRows.length, 'row count differs — see which rows below');
  oldRows.forEach((oldRow, i) => {
    assert.deepStrictEqual(newRows[i], oldRow, `row ${i} (${oldRow.type}${oldRow.name ? ':' + oldRow.name : ''}) differs`);
  });
});

test('grid.js: the rows/tabs field carries the live value from @CONFIG_START, not a placeholder', () => {
  const modesRow = newParseGrid().rows.find((r) => r.type === 'field' && r.name === 'modes');
  assert.ok(modesRow);
  assert.deepStrictEqual(modesRow.value, [
    { name: 'Value', containerWidth: 1920, columns: 12, gap: 40, padding: 80 },
  ]);
});
