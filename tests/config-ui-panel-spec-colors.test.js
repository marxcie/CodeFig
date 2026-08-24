/**
 * Phase 1 of `.plans/31-panel-spec-json.md`'s hardest case, per the prompt "make the DSF config
 * blocks readable": hand-author the `@PANEL_START` equivalent of `colors.js`'s real spec — the
 * 3,222-character `@rows` line the reader had never been tried against — and diff it against the
 * old parser, field by field.
 *
 * **History.** The first pass through this fixture found 13 real gaps (see git history / the
 * session that wrote them for the full list) — tabs, a top-level curve field, prose paragraphs,
 * `showWhen` on headings and chips, `@group:` columns, a curve column's `ends`/`range` shape, and
 * a JSON field's `options` silently breaking its own radio group. All are now fixed in
 * `parser.js`, and the fixture below is the **full** spec — all 27 old-parser rows, all 20
 * `@rows` columns, tabs included — matching the old parser exactly. `colors.js` itself is
 * untouched; this fixture is a test artefact only.
 *
 * **The one surprise, worth recording:** the "anchor asymmetry" (Hue/Chroma's `bright`/`middle`/
 * `dark` groups, Saturation/Chroma's own, Lightness's own) was flagged as gap 6 — three sets of
 * columns reusing the same keys (`bright`, `middle`, `dark`) in one flat array, which looked like
 * it would collide once tabs were added. It doesn't: the *old* parser already produces exactly
 * this — `bright` appears three times in `colors.js`'s real parsed columns today, tabs and all —
 * and works, because whatever reads the columns downstream (`renderer.js`'s tab-aware row
 * building) scopes a key lookup to the tab it is currently drawing, not to the whole flat array.
 * Once `panelColumn` could produce a `{type:"tab",...}` entry at all, the duplicate-key case
 * needed no special handling — it was never actually a JSON-format problem, just an untested
 * assumption from `panelColumn` not having tabs yet to test it with.
 *
 * **The reader now refuses rather than drops.** `parsePanelSpec`/`panelColumn` throw (surfaced as
 * `{rows:[], error}`) on an unrecognised block type, a keyed block with no `type`, and an
 * unparsceable `ends`/`range` — see the dedicated tests below, and `parser.js`'s own comments at
 * `PANEL_MARKER_TYPES`/`PANEL_COLUMN_MARKER_TYPES`.
 *
 * **`text` vs `string`**: still two words for one concept (`inferType()` says `"string"`, every
 * `@rows` column says `"text"`) — decided (`text` canonical, `string` an alias) but not
 * implemented; out of scope for this pass, unrelated to what this fixture tests.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const parser = require('../src/config-ui/parser.js');

const COLORS_PATH = path.join(
  __dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'colors.js'
);

function oldParseColors() {
  const src = fs.readFileSync(COLORS_PATH, 'utf8');
  const m = /@CONFIG_START\n([\s\S]*?)\/\/ @CONFIG_END/.exec(src);
  assert.ok(m, 'colors.js has no @CONFIG_START block — has it moved?');
  return parser.parse(m[1]);
}

/** The full `@PANEL_START` equivalent of `colors.js`'s spec. `@fromFile` omitted (see Grid's
 *  fixture header for why: something downstream reads that value by its own regex over the raw
 *  `@CONFIG_START` text, out of scope for the reader itself). */
const COLORS_PANEL_SPEC = [
  '// @PANEL_START',
  '// {',
  '//   blocks: [',
  '//     { type: "heading", text: "General" },',
  '//     { key: "collectionName", type: "collection", label: "Collection" },',
  '//     { type: "paragraph", text: "The collection\'s own modes. The chips are the mode list — a read fills them, and there is one mode block below per chip, in chip order. Removing and renaming happen here, which is why a block carries neither." },',
  '//     { type: "chips", label: "Collection modes",',
  '//       showWhen: { collectionName: "*", steps: "*" } },',
  '//     { key: "group", type: "string", label: "Group within collection",',
  '//       placeholder: "eg.: Primitives/Neutrals" },',
  '//     { key: "steps", type: "string", label: "Color tokens",',
  '//       placeholder: "Eg. 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950",',
  '//       helper: "Named lightest to darkest, and the only source for token placement below. The variables are <group>/<step>." },',
  '//     { key: "colorModel", type: "radio", label: "Color model",',
  '//       options: [{ hsl: "HSL" }, { oklch: "OKLCH" }],',
  '//       helper: "OKLCH to generate, HSL to read. OKLCH shares one lightness ladder across every mode, which is what makes them match in greyscale. HSL keeps a curve per mode — and its colourfulness envelope, S x (1 - |2L - 1|), has a corner at 50% lightness that every full ramp crosses. See the Documentation tab." },',
  '//     { type: "paragraph", text: "Each anchor keeps a hue for both models: OKLCH\'s is a perceptual angle, HSL\'s is where the maximum channel sits, and on a near-neutral ramp the two disagree by more than 30°. Both are filled when the panel reads a collection, so switching model loses nothing." },',
  '//     { type: "divider", section: true },',
  '//     { type: "heading", text: "OKLCH settings",',
  '//       showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" } },',
  '//     { type: "paragraph", text: "The same curve editor a mode has, at collection scope: the ladder is shared, so the curve belongs to the collection rather than to one of its modes — **one curve for every mode**, which is what makes the modes match in greyscale." },',
  '//     { type: "paragraph", text: "**Nothing below General until there are tokens.** Choosing a collection sets a read going — modes are fetched, blocks are added, the block is rewritten — and every one of those rebuilds the form. With the mode settings on screen that reads as flicker and a jumping layout, over a panel that cannot say anything useful yet: a collection with no token list has no ramp to show. Naming the tokens is the point at which there is something to draw, so it is the point at which the rest appears." },',
  '//     { type: "paragraph", text: "**A new scale starts Linear, not Original.** *Original* means \\"the ramp already in the file\\", so on a collection that has no ramp yet it names nothing — an empty editor and a preview with no line in it. Linear is the honest starting point: an even ladder between the two ends, which is a thing you can see and then bend. A read replaces it with the curve fitted to what the file actually holds." },',
  '//     { key: "curve", type: "curve", label: "Curve", allowOriginal: true,',
  '//       ramp: "oklch($% 0 0)", ends: "lightness.bright..lightness.dark", range: [0, 100],',
  '//       showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" },',
  '//       helper: "One curve, bright to dark. Drag a handle, pick a preset, or paste coordinates. Add middle point bends the two halves differently — which is what a real neutral ramp does — and that anchor is the middle colour\'s lightness and its step." },',
  '//     { type: "preview" },',
  '//     { key: "lightness", type: "group", label: "Lightness",',
  '//       showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" },',
  '//       helper: "0 to 100. The two ends hold exactly; the curve fills everything between them.",',
  '//       fields: [',
  '//         { key: "bright", type: "number", label: "Bright" },',
  '//         { key: "dark", type: "number", label: "Dark" }',
  '//       ] },',
  '//     { type: "heading", text: "Mode settings", showWhen: { collectionName: "*", steps: "*" } },',
  '//     { key: "modes", type: "rows", label: "Modes", layout: "blocks",',
  '//       showWhen: { collectionName: "*", steps: "*" },',
  '//       columns: [',
  '//         { key: "name", type: "text", label: "Mode" },',
  '//         { key: "seed", type: "group", label: "Seed color", fields: [',
  '//           { key: "hex", type: "text", label: "Hex", placeholder: "eg. #71717A" },',
  '//           { key: "placement", type: "text", label: "Token", placeholder: "Auto" },',
  '//           { key: "lock", type: "checkbox", label: "Lock seed color",',
  '//             helper: "On. Seed keeps its value. The ladder re-anchors through it, endpoints unchanged.\\nOff. Seed moves to the nearest step on the ladder." }',
  '//         ] },',
  '//         { type: "tab", text: "Hue" },',
  '//         { key: "hueCurve", type: "curve", label: "Hue curve",',
  '//           ramp: "oklch(70% ~bright.chroma $)",',
  '//           ends: "bright.hue..middle.hue..dark.hue", range: [0, 360],',
  '//           showWhen: { colorModel: "oklch" },',
  '//           helper: "How the hue travels between the ends. Worth least on a cool palette and most on a warm one — amber crosses 49 degrees and needs its own timing. Empty on a near-grey, where a measured hue is rounding rather than a value." },',
  '//         { key: "hslHueCurve", type: "curve", label: "Hue curve",',
  '//           ramp: "hsl($ ~bright.saturation% 50%)",',
  '//           ends: "bright.hslHue..middle.hslHue..dark.hslHue", range: [0, 360],',
  '//           showWhen: { colorModel: "hsl" },',
  '//           helper: "The same, for HSL — a different angle from OKLCH\'s, so a different curve." },',
  '//         { key: "bright", type: "group", label: "Bright", disabledWhen: { hueCurve: "original" }, fields: [',
  '//           { key: "hue", type: "number", label: "Hue start", placeholder: "eg. 264",',
  '//             showWhen: { colorModel: "oklch" } },',
  '//           { key: "hslHue", type: "number", label: "Hue start", placeholder: "eg. 264",',
  '//             showWhen: { colorModel: "hsl" } }',
  '//         ] },',
  '//         { key: "middle", type: "group", label: "Middle", disabledWhen: { hueCurve: "original" }, fields: [',
  '//           { key: "hue", type: "number", label: "Hue middle", placeholder: "eg. 264",',
  '//             showWhen: { colorModel: "oklch" } },',
  '//           { key: "hslHue", type: "number", label: "Hue middle", placeholder: "eg. 264",',
  '//             showWhen: { colorModel: "hsl" } }',
  '//         ] },',
  '//         { key: "dark", type: "group", label: "Dark", disabledWhen: { hueCurve: "original" }, fields: [',
  '//           { key: "hue", type: "number", label: "Hue end", placeholder: "eg. 264",',
  '//             showWhen: { colorModel: "oklch" } },',
  '//           { key: "hslHue", type: "number", label: "Hue end", placeholder: "eg. 264",',
  '//             showWhen: { colorModel: "hsl" } }',
  '//         ] },',
  '//         { type: "tab", text: "Saturation", showWhen: { colorModel: "hsl" } },',
  '//         { type: "tab", text: "Chroma", showWhen: { colorModel: "oklch" } },',
  '//         { key: "chromaCurve", type: "curve", label: "Chroma curve",',
  '//           ramp: "oklch(70% $ ~bright.hue)",',
  '//           ends: "bright.chroma..middle.chroma..dark.chroma", range: [0, 0.4],',
  '//           showWhen: { colorModel: "oklch" },',
  '//           helper: "How fast the colour arrives, as opposed to the lightness. A designed palette usually rises to its most colourful step and falls, on its own timing." },',
  '//         { key: "saturationCurve", type: "curve", label: "Saturation curve",',
  '//           ramp: "hsl(~bright.hslHue $% 50%)",',
  '//           ends: "bright.saturation..middle.saturation..dark.saturation", range: [0, 100],',
  '//           showWhen: { colorModel: "hsl" },',
  '//           helper: "The same, for HSL. Saturation and chroma are different quantities, so they carry different curves and a read fits both — switching model keeps whichever one it is switching to." },',
  '//         { key: "bright", type: "group", label: "Bright", fields: [',
  '//           { key: "chroma", type: "number", label: "Chroma start", placeholder: "eg. 0.012",',
  '//             showWhen: { colorModel: "oklch" } },',
  '//           { key: "saturation", type: "number", label: "Saturation start", placeholder: "eg. 12",',
  '//             showWhen: { colorModel: "hsl" } }',
  '//         ] },',
  '//         { key: "middle", type: "group", label: "Middle", fields: [',
  '//           { key: "chroma", type: "number", label: "Chroma middle", placeholder: "eg. 0.012",',
  '//             showWhen: { colorModel: "oklch" } },',
  '//           { key: "saturation", type: "number", label: "Saturation middle", placeholder: "eg. 12",',
  '//             showWhen: { colorModel: "hsl" } }',
  '//         ] },',
  '//         { key: "dark", type: "group", label: "Dark", fields: [',
  '//           { key: "chroma", type: "number", label: "Chroma end", placeholder: "eg. 0.012",',
  '//             showWhen: { colorModel: "oklch" } },',
  '//           { key: "saturation", type: "number", label: "Saturation end", placeholder: "eg. 12",',
  '//             showWhen: { colorModel: "hsl" } }',
  '//         ] },',
  '//         { type: "tab", text: "Lightness" },',
  '//         { key: "curve", type: "curve", label: "Lightness curve", allowOriginal: true,',
  '//           ramp: "hsl(~bright.hslHue ~bright.saturation% $%)",',
  '//           ends: "bright.lightness..dark.lightness", range: [0, 100],',
  '//           showWhen: { colorModel: "hsl" },',
  '//           helper: "One curve, bright to dark. Drag a handle, pick a preset, or paste coordinates. Add middle point bends the two halves differently — which is what a real neutral ramp does — and that anchor is the middle colour\'s lightness and its step." },',
  '//         { key: "bright", type: "group", label: "Bright", fields: [',
  '//           { key: "lightness", type: "number", label: "Bright", placeholder: "eg. 98",',
  '//             showWhen: { colorModel: "hsl" } }',
  '//         ] },',
  '//         { key: "dark", type: "group", label: "Dark", disabledNote: "Anchors take effect once you choose a curve.", fields: [',
  '//           { key: "lightness", type: "number", label: "Dark", placeholder: "eg. 4",',
  '//             showWhen: { colorModel: "hsl" } }',
  '//         ] },',
  '//         { type: "preview" }',
  '//       ] }',
  '//   ]',
  '// }',
  '// @PANEL_END',
].join('\n');

const COLORS_VALUES_BLOCK = [
  '  collectionName: "",',
  '  group: "",',
  '  steps: "",',
  '  colorModel: "hsl",',
  '  curve: [0.333333, 0.333333, 0.666667, 0.666667],',
  '  lightness: {},',
  '  modes: [',
  '    {',
  '      name: "",',
  '      curve: [0.333333, 0.333333, 0.666667, 0.666667],',
  '      chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],',
  '      seed: { hex: "", placement: "", lock: false },',
  '      bright: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 98 },',
  '      middle: { hue: 0, hslHue: 0, chroma: 0, saturation: 0 },',
  '      dark: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 4 }',
  '    }',
  '  ]',
].join('\n');

function innerPanelSpec(block) {
  const m = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(block);
  assert.ok(m, 'COLORS_PANEL_SPEC fixture has no @PANEL_START/@PANEL_END markers');
  return m[1];
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
