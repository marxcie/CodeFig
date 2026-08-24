/**
 * Phase 1 of `.plans/31-panel-spec-json.md`'s hardest case, per the prompt "make the DSF config
 * blocks readable": hand-author the `@PANEL_START` equivalent of `colors.js`'s real spec and diff
 * it against the old parser, field by field.
 *
 * **History, in two passes.** The first pass found 13 real gaps and fixed them — tabs, a
 * top-level curve field, prose paragraphs, `showWhen` on headings and chips, `@group:` columns, a
 * curve column's `ends`/`range` shape, and a JSON field's `options` silently breaking its own
 * radio group (git history has the full list). That pass matched the old parser exactly, but the
 * fixture came back **larger** than the one-liner it replaced (10.2k characters against 7.2k) and
 * left two faults un-deduplicated: `#>Hue` sat as a flat sibling marker rather than a container,
 * and the anchor groups (Hue's `bright`/`middle`/`dark`, Saturation/Chroma's own, Lightness's own)
 * were eight near-identical blocks for one idea. Correct, but not what "readable" asked for.
 *
 * **Second pass: two format features, not a Colors-specific fix.**
 *
 * 1. **Tabs are containers.** `{ type: "tab", names: [...], columns: [...] }` nests what belongs
 *    to it — indentation answers "which columns are Hue's" instead of scanning forward for the
 *    next marker. `expandColumnsList` (`parser.js`) un-nests it back into the flat
 *    `{type:"tab",...}` marker + columns the old parser has always produced, so nothing
 *    downstream — not `renderer.js`, not the old parser's own output — changes. A merged tab
 *    (`#>Saturation{colorModel=hsl}` / `#>Chroma{colorModel=oklch}`, one tab shown under two
 *    names) is one container with two entries in `names`, each carrying its own `showWhen`; the
 *    shared `columns` are written once and expand to two marker rows followed by the columns
 *    once, matching the old parser's own two-markers-then-shared-columns shape exactly.
 * 2. **`anchors` deduplicates the position × field-per-colour-model cross-product.** One block
 *    names `positions` (`["bright","middle","dark"]` or `["bright","dark"]`), `disabledWhen` if
 *    the whole set is conditionally inert, and `fields` — each with a `labels` map and optional
 *    `placeholders` map, one entry per position, because Hue's "start"/"middle"/"end" suffix
 *    pattern does not hold for Lightness (`"Bright"`, not `"Lightness start"`) or for placeholder
 *    examples (Lightness's are real boundary values, not one example repeated) — a derived
 *    template would have been magic that broke on the second real case. `notes`, optional, is a
 *    per-position escape hatch: the old format's `@disabledNote:` could only attach to whichever
 *    column's segment it was written in (Colors has it on `dark` only), an artifact of the
 *    one-liner rather than a rule, and the mechanism reproduces that asymmetry rather than
 *    smoothing it into "every position" or "none," either of which would change old-parser output.
 *
 * Both are core format features, not Colors-specific: `expandColumnsList` and `expandAnchors` are
 * plain functions over any `columns`/`fields` list, usable with or without tabs, and the
 * dedicated tests below exercise them directly, independent of the full fixture.
 *
 * **The reader still refuses rather than drops.** `parsePanelSpec`/`panelColumn` throw on an
 * unrecognised block or column type, a keyed block with no `type`, an unparseable `ends`/`range`
 * — and now also a tab with no `columns` (the old marker-only shape, no longer accepted) or no
 * `names`, and an `anchors` field missing a label for one of its declared positions.
 *
 * **`text` vs `string`**: still two words for one concept — decided (`text` canonical, `string`
 * an alias) but not implemented; unrelated to what this fixture tests.
 */
const test = require('node:test');
const assert = require('node:assert');

const parser = require('../src/config-ui/parser.js');
const {
  COLORS_PANEL_SPEC, COLORS_VALUES_BLOCK, innerPanelSpec, PRE_MIGRATION_COLORS_ROWS_BLOCK
} = require('./fixtures/colors-panel-spec.js');

// `colors.js` migrated to `@PANEL_START` — its `@CONFIG_START` is pure values now, nothing left to
// compare the new reader against. `oldParseColors()` reads the frozen pre-migration text instead
// of the live file, so this stays "did the migration change what the panel shows", the question it
// was written to answer, rather than becoming "is the fixture consistent with itself."
function oldParseColors() {
  return parser.parse(PRE_MIGRATION_COLORS_ROWS_BLOCK);
}

function newParseColors() {
  return parser.parse(COLORS_VALUES_BLOCK, innerPanelSpec(COLORS_PANEL_SPEC));
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

/**
 * Not a gap: `panelColumn` adds `group` to every group-typed column (`block.group || block.key`)
 * for a `data-group` CSS hook the old parser never had (`renderer.js:255`, plan 29). Additive, not
 * lost behaviour — stripped here so it doesn't register as a mismatch in a test about parity.
 *
 * Also not a gap: old-format helper text carries a literal two-character `\n` (annotations are one
 * line; a real newline can't survive one), and `helperBlock()` in `renderer.js:32` runs
 * `text.replace(/\\n/g, "\n")` at render time. A JSON-authored helper can just write a real
 * newline; by the time either reaches the renderer they are the same string.
 */
function normaliseHelper(text) {
  return typeof text === 'string' ? text.replace(/\\n/g, '\n') : text;
}

/**
 * Not a gap either: a paragraph's line break in the old format is where the source comment
 * happened to wrap in an editor, not a meaningful break — a JSON author writing the same prose as
 * one string has no reason to reproduce that exact column width. Collapsed to single spaces so a
 * real wording difference still shows up as one.
 */
function normaliseParagraph(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : text;
}

function stripRowNoise(row) {
  const clone = Object.assign({}, row);
  delete clone.raw;
  delete clone.syntax;
  delete clone.trailingComma;
  // Not a gap: `attachTo` is how a `@PANEL_START` paragraph replaces the blank-`//`-line signal
  // the old format used for the same fact (see `parser.js`'s `parsePanelSpec` and `renderer.js`'s
  // `foldProse`). The old reader has no such field; the new one always sets it. Comparing it here
  // would flag every paragraph row as a mismatch for carrying information the old format simply
  // has nowhere to put.
  delete clone.attachTo;
  if (clone.helper !== undefined) clone.helper = normaliseHelper(clone.helper);
  if (clone.type === 'paragraph' && clone.text !== undefined) clone.text = normaliseParagraph(clone.text);
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
          if (g.helper !== undefined) g.helper = normaliseHelper(g.helper);
          return g;
        });
      }
      return stripUndefinedDeep(cc);
    });
  }
  return stripUndefinedDeep(clone);
}

const UNREPRESENTABLE_TOP_LEVEL_TYPES = new Set(['blank', 'lineBreak', 'directive']);

test('colors.js: the new reader matches the old parser row-by-row, in full', () => {
  const oldRows = oldParseColors().rows
    .filter((r) => !UNREPRESENTABLE_TOP_LEVEL_TYPES.has(r.type))
    .map(stripRowNoise);
  const newRows = newParseColors().rows.map(stripRowNoise);

  assert.strictEqual(newRows.length, oldRows.length, 'row count differs — see which rows below');
  oldRows.forEach((oldRow, i) => {
    assert.deepStrictEqual(
      newRows[i], oldRow,
      `row ${i} (${oldRow.type}${oldRow.name ? ':' + oldRow.name : ''}${oldRow.text ? ':' + oldRow.text.slice(0, 30) : ''}) differs`
    );
  });
});

test('colors.js: the modes rows/tabs field carries the live value from @CONFIG_START, not a placeholder', () => {
  const modesRow = newParseColors().rows.find((r) => r.type === 'field' && r.name === 'modes');
  assert.ok(modesRow);
  assert.ok(Array.isArray(modesRow.value) && modesRow.value.length === 1, 'modes value should be the one seeded mode');
  assert.strictEqual(modesRow.value[0].seed.hex, '');
});

test('a keyed block with no type is refused, not silently dropped', () => {
  const result = parser.parse('{ x: 1 }', [
    '// { blocks: [ { key: "x", label: "X" } ] }',
  ].join('\n'));
  assert.ok(result.error, 'a keyed block with no type should produce an error');
  assert.deepStrictEqual(result.rows, []);
});

test('a paragraph with no attachTo is refused, not silently defaulted', () => {
  const result = parser.parse('{}', [
    '// { blocks: [ { type: "paragraph", text: "huh" } ] }',
  ].join('\n'));
  assert.ok(result.error, 'a paragraph with no attachTo should produce an error');
  assert.match(result.error, /attachTo/);
});

test('a paragraph with an attachTo other than next/previous is refused', () => {
  const result = parser.parse('{}', [
    '// { blocks: [ { type: "paragraph", text: "huh", attachTo: "sideways" } ] }',
  ].join('\n'));
  assert.ok(result.error, 'an invalid attachTo should produce an error');
  assert.match(result.error, /attachTo/);
});

test('an unrecognised top-level block type is refused, not silently dropped', () => {
  const result = parser.parse('{}', [
    '// { blocks: [ { type: "wat", text: "huh" } ] }',
  ].join('\n'));
  assert.ok(result.error, 'an unrecognised block type should produce an error');
  assert.match(result.error, /wat/);
});

test('an unrecognised keyless column type is refused, not silently dropped', () => {
  const result = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [ { type: "wat" } ] } ] }',
  ].join('\n'));
  assert.ok(result.error, 'an unrecognised column type should produce an error');
  assert.match(result.error, /wat/);
});

test('a column with no type is refused, not silently dropped', () => {
  const result = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [ { key: "x", label: "X" } ] } ] }',
  ].join('\n'));
  assert.ok(result.error, 'a keyed column with no type should produce an error');
});

test('a malformed curve ends/range is refused, not silently misread', () => {
  const badEnds = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [',
    '//   { key: "c", type: "curve", ends: "not-a-path" }',
    '// ] } ] }',
  ].join('\n'));
  assert.ok(badEnds.error, 'a malformed ends string should produce an error');

  const badRange = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [',
    '//   { key: "c", type: "curve", range: [10, 0] }',
    '// ] } ] }',
  ].join('\n'));
  assert.ok(badRange.error, 'a range with hi <= lo should produce an error');
});

test('gap 10, fixed: a field radio option round-trips through the renderer\'s own split, unlike a bare object', () => {
  function fieldOptionValue(option) {
    var text = String(option);
    var at = text.indexOf(':');
    return at === -1 ? text : text.slice(0, at).trim();
  }
  const colorModel = newParseColors().rows.find((r) => r.type === 'field' && r.name === 'colorModel');
  assert.ok(colorModel.options.every((o) => typeof o === 'string'), 'field options should be raw strings now');
  assert.strictEqual(fieldOptionValue(colorModel.options[0]), 'hsl');
  assert.strictEqual(fieldOptionValue(colorModel.options[1]), 'oklch');
});

test('a tab with no columns is refused -- tabs nest now, they do not mark a position in a flat list', () => {
  const result = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [',
    '//   { type: "tab", names: [{ text: "Hue" }] }',
    '// ] } ] }',
  ].join('\n'));
  assert.ok(result.error, 'a tab with no columns should produce an error');
});

test('a tab with no names is refused', () => {
  const result = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [',
    '//   { type: "tab", columns: [] }',
    '// ] } ] }',
  ].join('\n'));
  assert.ok(result.error, 'a tab with no names should produce an error');
});

test('an anchors block with no positions, or no fields, is refused', () => {
  const noPositions = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [',
    '//   { type: "anchors", fields: [ { key: "hue", labels: { bright: "Hue" } } ] }',
    '// ] } ] }',
  ].join('\n'));
  assert.ok(noPositions.error, 'an anchors block with no positions should produce an error');

  const noFields = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [',
    '//   { type: "anchors", positions: ["bright"] }',
    '// ] } ] }',
  ].join('\n'));
  assert.ok(noFields.error, 'an anchors block with no fields should produce an error');
});

test('an anchors field missing a label for one of the declared positions is refused', () => {
  const result = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [',
    '//   { type: "anchors", positions: ["bright", "dark"],',
    '//     fields: [ { key: "hue", labels: { bright: "Hue start" } } ] }',
    '// ] } ] }',
  ].join('\n'));
  assert.ok(result.error, 'a missing per-position label should produce an error, not a silent undefined label');
  assert.match(result.error, /dark/);
});

test('anchors: deduplication does not change what the old parser produces', () => {
  // The same check the full-fixture test already makes, isolated to just the mechanism that
  // changed in this pass -- 3 positions x 2 fields should equal the 3 hand-written groups the
  // old parser builds from 3 separate bright:{...}/middle:{...}/dark:{...} blocks.
  const expanded = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [',
    '//   { type: "anchors", positions: ["bright", "middle", "dark"],',
    '//     disabledWhen: { hueCurve: "original" },',
    '//     fields: [',
    '//       { key: "hue", showWhen: { colorModel: "oklch" },',
    '//         labels: { bright: "Hue start", middle: "Hue middle", dark: "Hue end" },',
    '//         placeholders: { bright: "eg. 264", middle: "eg. 264", dark: "eg. 264" } }',
    '//     ] }',
    '// ] } ] }',
  ].join('\n'));
  const groups = expanded.rows[0].columns;
  assert.strictEqual(groups.length, 3, 'one group per position');
  assert.deepStrictEqual(groups.map((g) => g.key), ['bright', 'middle', 'dark']);
  assert.deepStrictEqual(groups.map((g) => g.label), ['Bright', 'Middle', 'Dark']);
  assert.ok(groups.every((g) => g.disabledWhen && g.disabledWhen[0].field === 'hueCurve'), 'disabledWhen applies to every position');
  assert.strictEqual(groups[0].columns[0].label, 'Hue start');
  assert.strictEqual(groups[1].columns[0].label, 'Hue middle');
  assert.strictEqual(groups[2].columns[0].label, 'Hue end');
});

test('anchors: a scalar placeholder/note is the same at every position as writing the map out', () => {
  function withPlaceholders(placeholders) {
    return parser.parse('{}', [
      '// { blocks: [ { key: "modes", type: "rows", columns: [',
      '//   { type: "anchors", positions: ["bright", "middle", "dark"], notes: NOTE,',
      '//     fields: [ { key: "hue", labels: { bright: "Hue start", middle: "Hue middle", dark: "Hue end" },',
      '//       placeholders: PLACEHOLDERS } ]',
      '//   }',
      '// ] } ] }',
    ].join('\n')
      .replace('PLACEHOLDERS', JSON.stringify(placeholders))
      .replace('NOTE', JSON.stringify('note')));
  }
  const scalar = withPlaceholders('eg. 264').rows[0].columns;
  const map = withPlaceholders({ bright: 'eg. 264', middle: 'eg. 264', dark: 'eg. 264' }).rows[0].columns;
  assert.deepStrictEqual(scalar, map, 'a scalar placeholder should produce exactly the same output as the equivalent map');
  assert.strictEqual(scalar[0].disabledNote, 'note', 'a scalar note applies to every position too');
  assert.strictEqual(scalar[1].disabledNote, 'note');
  assert.strictEqual(scalar[2].disabledNote, 'note');
});

test('tabs: a merged tab (two names, one shared column set) matches the old parser\'s two-marker-then-columns-once shape', () => {
  const result = parser.parse('{}', [
    '// { blocks: [ { key: "modes", type: "rows", columns: [',
    '//   { type: "tab", names: [',
    '//       { text: "Saturation", showWhen: { colorModel: "hsl" } },',
    '//       { text: "Chroma", showWhen: { colorModel: "oklch" } }',
    '//     ],',
    '//     columns: [ { key: "x", type: "number", label: "X" } ] }',
    '// ] } ] }',
  ].join('\n'));
  const cols = result.rows[0].columns;
  assert.strictEqual(cols.length, 3, 'two tab markers, then the shared column once -- not duplicated per name');
  assert.strictEqual(cols[0].type, 'tab');
  assert.strictEqual(cols[0].text, 'Saturation');
  assert.strictEqual(cols[1].type, 'tab');
  assert.strictEqual(cols[1].text, 'Chroma');
  assert.strictEqual(cols[2].key, 'x');
});

// ---------------------------------------------------------------------------------------------
// Round-trip: serialize() against a @PANEL_START-backed schema.
// ---------------------------------------------------------------------------------------------

/** Deep-cloned baseline values, shared by every edit-case test below so each starts from the
 *  exact same defaults colors.js itself ships with. */
function baseValues() {
  return JSON.parse(JSON.stringify(parser.parseConfigBlockObject(COLORS_VALUES_BLOCK)));
}

/** Runs one edit through both paths and returns the two resulting *values* objects, re-parsed
 *  from whatever text each path produced -- not a text comparison, since the old block still
 *  carries annotations/comments the new one has never had, and never will. */
function editBothPaths(mutate) {
  const oldValues = baseValues();
  const newValues = baseValues();
  mutate(oldValues);
  mutate(newValues);

  const oldParsed = oldParseColors();
  const oldOut = parser.serialize(oldParsed, oldValues);
  const oldReparsed = parser.parseConfigBlockObject(oldOut);
  assert.ok(oldReparsed, 'the old path\'s own output should still parse as a values object');

  const newParsed = newParseColors();
  const newOut = parser.serialize(newParsed, newValues);
  const newReparsed = parser.parseConfigBlockObject(newOut);
  assert.ok(newReparsed, 'the new path\'s output should parse as a values object');

  return { oldOut, newOut, oldReparsed, newReparsed };
}

test('round-trip: idempotence -- serializing with nothing edited reproduces the values block byte-identically', () => {
  const parsed = newParseColors();
  const values = parser.parseConfigBlockObject(COLORS_VALUES_BLOCK);
  const output = parser.serialize(parsed, values);
  assert.strictEqual(output, COLORS_VALUES_BLOCK,
    'no edit should reprint every property verbatim -- indentation, trailing commas, key order, all of it');
});

test('round-trip: a plain top-level field (group)', () => {
  const { oldReparsed, newReparsed } = editBothPaths((v) => { v.group = 'neutral'; });
  assert.strictEqual(newReparsed.group, 'neutral');
  assert.strictEqual(newReparsed.group, oldReparsed.group);
  // Nothing else should have moved.
  assert.strictEqual(newReparsed.steps, oldReparsed.steps);
  assert.strictEqual(newReparsed.colorModel, oldReparsed.colorModel);
});

test('round-trip: a value inside an @rows cell (modes[0].name)', () => {
  const { oldReparsed, newReparsed } = editBothPaths((v) => { v.modes[0].name = 'Granite'; });
  assert.strictEqual(newReparsed.modes[0].name, 'Granite');
  assert.strictEqual(newReparsed.modes[0].name, oldReparsed.modes[0].name);
});

test('round-trip: a value inside a nested group (modes[0].seed.hex)', () => {
  const { oldReparsed, newReparsed } = editBothPaths((v) => { v.modes[0].seed.hex = '#71717A'; });
  assert.strictEqual(newReparsed.modes[0].seed.hex, '#71717A');
  assert.deepStrictEqual(newReparsed.modes[0].seed, oldReparsed.modes[0].seed);
});

test('round-trip: an anchor value (modes[0].bright.hue)', () => {
  const { oldReparsed, newReparsed } = editBothPaths((v) => { v.modes[0].bright.hue = 264; });
  assert.strictEqual(newReparsed.modes[0].bright.hue, 264);
  assert.deepStrictEqual(newReparsed.modes[0].bright, oldReparsed.modes[0].bright);
});

test('round-trip: a curve (the top-level OKLCH curve field)', () => {
  const { oldReparsed, newReparsed } = editBothPaths((v) => { v.curve = [0.1, 0.2, 0.8, 0.9]; });
  assert.deepStrictEqual(newReparsed.curve, [0.1, 0.2, 0.8, 0.9]);
  assert.deepStrictEqual(newReparsed.curve, oldReparsed.curve);
});

test('round-trip: an untouched value in the same save reprints verbatim, edited or not', () => {
  const { newOut } = editBothPaths((v) => { v.group = 'neutral'; });
  // steps was never touched -- its line should be byte-identical to the source, not just
  // value-equal after reparsing.
  const originalStepsLine = COLORS_VALUES_BLOCK.split('\n').find((l) => l.trim().startsWith('steps:'));
  assert.ok(newOut.includes(originalStepsLine), 'an untouched property should reprint its exact original line');
});

test('serialize refuses a @PANEL_START-sourced field reaching the old reconstruction path', () => {
  const parsed = newParseColors();
  const fakedOldSchema = { rows: parsed.rows }; // no .fromPanelSpec -- forces the old branch
  assert.throws(() => parser.serialize(fakedOldSchema, { group: 'neutral' }), /has no raw text/);
});

test('serialize refuses when a @PANEL_START field has no matching value in @CONFIG_START', () => {
  const parsed = parser.parsePanelSpec(innerPanelSpec(COLORS_PANEL_SPEC), {});
  parsed.fromPanelSpec = true;
  parsed.configText = '  group: "",'; // only one of the real keys
  assert.throws(() => parser.serialize(parsed, { group: 'x' }), /has no value in @CONFIG_START/);
});

test('parse() reports drift on load, not only on save', () => {
  const withExtra = parser.parse('  group: "", ghost: "left behind",', innerPanelSpec(COLORS_PANEL_SPEC));
  assert.ok(withExtra.driftWarning, 'a value with no field should be reported at load time');
  assert.match(withExtra.driftWarning, /"ghost"/);
  assert.match(withExtra.driftWarning, /won't show/);

  const clean = newParseColors();
  assert.strictEqual(clean.driftWarning, null, 'agreeing regions should report no drift');
});
