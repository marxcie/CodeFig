/**
 * The `@PANEL_START` equivalent of `colors.js`'s real spec, hand-authored against
 * `.plans/31-panel-spec-json.md`'s hardest case. Shared by `tests/config-ui-panel-spec-colors.test.js`
 * (the schema-level differential/round-trip suite) and `devtools/dom-diff-panel.js` (the DOM-level
 * render proof) so there is exactly one fixture to keep in step with `colors.js`, not two copies
 * that can quietly drift apart.
 *
 * `@fromFile` omitted (see Grid's fixture header for why: something downstream reads that value
 * by its own regex over the raw `@CONFIG_START` text, out of scope for the reader itself).
 *
 * **`attachTo` on every paragraph.** A blank `// ` line is how the old format tells the renderer's
 * `foldProse` "this explains what follows, not what precedes" — JSON has no blank-line equivalent,
 * so `parsePanelSpec` requires the same bit spelled out directly (`"next"`/`"previous"`, no
 * default). `devtools/dom-diff-panel.js` is what caught the two paragraphs that had this wrong
 * (the mode-chips intro, and the third OKLCH paragraph) — the schema-level differential test
 * structurally cannot, because attachment is a `foldProse` render-time decision, never part of the
 * `.rows` shape that test compares.
 *
 * **`PRE_MIGRATION_COLORS_ROWS_BLOCK`, frozen.** `colors.js` itself has since migrated to
 * `@PANEL_START` (`.plans/31-panel-spec-json.md`) — its `@CONFIG_START` is pure values now, no
 * one-liner annotations left to read. This is that region's content exactly as it stood in the
 * last commit before the migration (`git show HEAD:...` at migration time), kept so the differential
 * test can still ask "did the migration change what the panel shows", not just "is the fixture
 * self-consistent" — a comparison the live file can no longer supply once the thing it used to
 * hold is gone.
 */
const assert = require('node:assert');

const COLORS_PANEL_SPEC = [
  '// @PANEL_START',
  '// {',
  '//   blocks: [',
  '//     { type: "heading", text: "General" },',
  '//     { key: "collectionName", type: "collection", label: "Collection" },',
  '//     { type: "paragraph", attachTo: "next", text: "These chips are the collection\'s modes. Add, remove, or rename here. Each chip gets a mode block below." },',
  '//     { type: "chips", label: "Collection modes",',
  '//       showWhen: { collectionName: "*" } },',
  '//     { key: "group", type: "string", label: "Group within collection",',
  '//       placeholder: "eg.: Primitives/Neutrals" },',
  '//     { key: "steps", type: "string", label: "Color tokens",',
  '//       placeholder: "Eg. 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950",',
  '//       helper: "Names for each step, lightest to darkest. Variables are created as group/step." },',
  '//     { key: "colorModel", type: "radio", label: "Color model",',
  '//       options: [{ hsl: "HSL" }, { oklch: "OKLCH" }],',
  '//       helper: "OKLCH when every mode should share the same lightness steps. HSL when you are matching a palette that already uses HSL. When to pick each: Documentation." },',
  '//     { type: "paragraph", attachTo: "previous", text: "Each end keeps an OKLCH hue and an HSL hue. Both fill when a collection is read, so switching model keeps your anchors." },',
  '//     { type: "divider", section: true },',
  '//     { type: "heading", text: "OKLCH settings",',
  '//       showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" } },',
  '//     { type: "paragraph", attachTo: "previous", text: "One lightness curve for every mode. Each mode only sets its own hue and chroma." },',
  '//     { type: "paragraph", attachTo: "previous", text: "Name Color tokens first. Mode settings and the ramp appear after that." },',
  '//     { type: "paragraph", attachTo: "next", text: "New scales start on Linear. Original means the ramp already in the file, so it stays empty until a collection is read. A read replaces Linear with the fitted curve." },',
  '//     { key: "curve", type: "curve", label: "Curve", allowOriginal: true,',
  '//       ramp: "oklch($% 0 0)", ends: "lightness.bright..lightness.dark", range: [0, 100],',
  '//       showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" },',
  '//       helper: "One curve from bright to dark. Drag a handle or pick a preset. Add middle point to bend the two halves differently." },',
  '//     { type: "preview" },',
  '//     { key: "lightness", type: "group", label: "Lightness",',
  '//       showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" },',
  '//       helper: "0–100 at the two ends. The curve fills everything between.",',
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
  '//         { type: "tab", names: [{ text: "Hue" }], columns: [',
  '//           { key: "hueCurve", type: "curve", label: "Hue curve",',
  '//             ramp: "oklch(70% ~bright.chroma $)",',
  '//             ends: "bright.hue..middle.hue..dark.hue", range: [0, 360],',
  '//             showWhen: { colorModel: "oklch" },',
  '//             helper: "How hue shifts from the light end to the dark end. Leave it as it is unless the palette is warm (amber, orange), where it usually needs its own timing. Near-greys can stay empty." },',
  '//           { key: "hslHueCurve", type: "curve", label: "Hue curve",',
  '//             ramp: "hsl($ ~bright.saturation% 50%)",',
  '//             ends: "bright.hslHue..middle.hslHue..dark.hslHue", range: [0, 360],',
  '//             showWhen: { colorModel: "hsl" },',
  '//             helper: "Same control for HSL hue. Separate from OKLCH because the two models use different angles." },',
  '//           { type: "anchors", positions: ["bright", "middle", "dark"],',
  '//             fields: [',
  '//               { key: "hue", showWhen: { colorModel: "oklch" },',
  '//                 labels: { bright: "Hue start", middle: "Hue middle", dark: "Hue end" },',
  '//                 placeholders: "eg. 264" },',
  '//               { key: "hslHue", showWhen: { colorModel: "hsl" },',
  '//                 labels: { bright: "Hue start", middle: "Hue middle", dark: "Hue end" },',
  '//                 placeholders: "eg. 264" }',
  '//             ] }',
  '//         ] },',
  '//         { type: "tab",',
  '//           names: [',
  '//             { text: "Saturation", showWhen: { colorModel: "hsl" } },',
  '//             { text: "Chroma", showWhen: { colorModel: "oklch" } }',
  '//           ],',
  '//           columns: [',
  '//             { key: "chromaCurve", type: "curve", label: "Chroma curve",',
  '//               ramp: "oklch(70% $ ~bright.hue)",',
  '//               ends: "bright.chroma..middle.chroma..dark.chroma", range: [0, 0.4],',
  '//               showWhen: { colorModel: "oklch" },',
  '//               helper: "How colourfulness builds between the ends. Most palettes peak mid-ramp, then fall." },',
  '//             { key: "saturationCurve", type: "curve", label: "Saturation curve",',
  '//               ramp: "hsl(~bright.hslHue $% 50%)",',
  '//               ends: "bright.saturation..middle.saturation..dark.saturation", range: [0, 100],',
  '//               showWhen: { colorModel: "hsl" },',
  '//               helper: "Same idea for HSL saturation. Kept separate from chroma so switching model keeps the right curve." },',
  '//             { type: "anchors", positions: ["bright", "middle", "dark"],',
  '//               fields: [',
  '//                 { key: "chroma", showWhen: { colorModel: "oklch" },',
  '//                   labels: { bright: "Chroma start", middle: "Chroma middle", dark: "Chroma end" },',
  '//                   placeholders: "eg. 0.012" },',
  '//                 { key: "saturation", showWhen: { colorModel: "hsl" },',
  '//                   labels: { bright: "Saturation start", middle: "Saturation middle", dark: "Saturation end" },',
  '//                   placeholders: "eg. 12" }',
  '//               ] }',
  '//         ] },',
  '//         { type: "tab", names: [{ text: "Lightness" }], columns: [',
  '//           { key: "curve", type: "curve", label: "Lightness curve", allowOriginal: true,',
  '//             ramp: "hsl(~bright.hslHue ~bright.saturation% $%)",',
  '//             ends: "bright.lightness..dark.lightness", range: [0, 100],',
  '//             showWhen: { colorModel: "hsl" },',
  '//             helper: "One curve from bright to dark. Drag a handle or pick a preset. Add middle point to bend the two halves differently." },',
  '//           { type: "anchors", positions: ["bright", "dark"],',
  '//             notes: { dark: "Anchors take effect once you choose a curve." },',
  '//             fields: [',
  '//               { key: "lightness", showWhen: { colorModel: "hsl" },',
  '//                 labels: { bright: "Bright", dark: "Dark" },',
  '//                 placeholders: { bright: "eg. 98", dark: "eg. 4" } }',
  '//             ] }',
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
  '      name: "Value",',
  '      curve: [0.333333, 0.333333, 0.666667, 0.666667],',
  '      chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],',
  '      seed: { hex: "", placement: "", lock: false },',
  '      bright: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 98 },',
  '      middle: { hue: 0, hslHue: 0, chroma: 0, saturation: 0 },',
  '      dark: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 4 }',
  '    }',
  '  ]',
].join('\n');

/** `COLORS_PANEL_SPEC` with the `@PANEL_START`/`@PANEL_END` markers stripped, ready for `parse()`'s second argument. */
function innerPanelSpec(block) {
  const m = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(block);
  assert.ok(m, 'COLORS_PANEL_SPEC fixture has no @PANEL_START/@PANEL_END markers');
  return m[1];
}

// colors.js's real @CONFIG_START..@CONFIG_END content, one-liner annotations and all, exactly as
// it read before the @PANEL_START migration. See the module comment.
const PRE_MIGRATION_COLORS_ROWS_BLOCK = [
  "  // @fromFile: domains.colors",
  "",
  "  // # General",
  "  collectionName: \"\", // @collection @label: Collection",
  "  //",
  "  // These chips are the collection's modes. Add, remove, or rename here. Each chip gets a mode block below.",
  "  // @collectionModes: Collection modes @showWhen: collectionName=* @showWhen: steps=*",
  "  group: \"\", // @label: Group within collection @placeholder=\"eg.: Primitives/Neutrals\"",
  "  steps: \"\", // @label: Color tokens @placeholder=\"Eg. 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950\" @helper: Names for each step, lightest to darkest. Variables are created as group/step.",
  "  colorModel: \"hsl\", // @options: hsl:HSL|oklch:OKLCH @radio @label: Color model @helper: OKLCH when every mode should share the same lightness steps. HSL when you are matching a palette that already uses HSL. When to pick each: Documentation.",
  "  // Each end keeps an OKLCH hue and an HSL hue. Both fill when a collection is read, so switching model keeps your anchors.",
  "",
  "  // --- @section",
  "",
  "  // # OKLCH settings @showWhen: colorModel=oklch @showWhen: collectionName=* @showWhen: steps=*",
  "  // One lightness curve for every mode. Each mode only sets its own hue and chroma.",
  "  //",
  "  // Name Color tokens first. Mode settings and the ramp appear after that.",
  "  //",
  "  // New scales start on Linear. Original means the ramp already in the file, so it stays empty until a collection is read. A read replaces Linear with the fitted curve.",
  "  curve: [0.333333, 0.333333, 0.666667, 0.666667], // @curve @allowOriginal @ramp: oklch($% 0 0) @ends: lightness.bright..lightness.dark @range: 0..100 @label: Curve @showWhen: colorModel=oklch @showWhen: collectionName=* @showWhen: steps=* @helper: One curve from bright to dark. Drag a handle or pick a preset. Add middle point to bend the two halves differently.",
  "  // @preview",
  "  lightness: {}, // @group: bright:number=Bright|dark:number=Dark @label: Lightness @showWhen: colorModel=oklch @showWhen: collectionName=* @showWhen: steps=* @helper: 0–100 at the two ends. The curve fills everything between.",
  "  // # Mode settings @showWhen: collectionName=* @showWhen: steps=*",
  "  modes: [",
  "    {",
  "      name: \"Value\",",
  "      curve: [0.333333, 0.333333, 0.666667, 0.666667],",
  "      chromaCurve: [],",
  "      saturationCurve: [],",
  "      hueCurve: [],",
  "      hslHueCurve: [],",
  "      seed: { hex: \"\", placement: \"\", lock: false },",
  "      bright: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 98 },",
  "      middle: { hue: 0, hslHue: 0, chroma: 0, saturation: 0 },",
  "      dark: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 4 }",
  "    }",
  "  ], // @rows: name:text=Mode|seed:{hex:text@placeholder=\"eg. #71717A\"=Hex|placement:text@placeholder=\"Auto\"=Token|lock:checkbox=Lock seed color @helper: On. Seed keeps its value. The ladder re-anchors through it, endpoints unchanged.\\nOff. Seed moves to the nearest step on the ladder.}=Seed color|#>Hue|hueCurve:curve(ramp:oklch(70% ~bright.chroma $), ends:bright.hue..middle.hue..dark.hue, range:0..360){colorModel=oklch}=Hue curve @helper: How hue shifts from the light end to the dark end. Leave it as it is unless the palette is warm (amber, orange), where it usually needs its own timing. Near-greys can stay empty.|hslHueCurve:curve(ramp:hsl($ ~bright.saturation% 50%), ends:bright.hslHue..middle.hslHue..dark.hslHue, range:0..360){colorModel=hsl}=Hue curve @helper: Same control for HSL hue. Separate from OKLCH because the two models use different angles.|bright:{hue:number{colorModel=oklch}@placeholder=\"eg. 264\"=Hue start|hslHue:number{colorModel=hsl}@placeholder=\"eg. 264\"=Hue start}=Bright|middle:{hue:number{colorModel=oklch}@placeholder=\"eg. 264\"=Hue middle|hslHue:number{colorModel=hsl}@placeholder=\"eg. 264\"=Hue middle}=Middle|dark:{hue:number{colorModel=oklch}@placeholder=\"eg. 264\"=Hue end|hslHue:number{colorModel=hsl}@placeholder=\"eg. 264\"=Hue end}=Dark|#>Saturation{colorModel=hsl}|#>Chroma{colorModel=oklch}|chromaCurve:curve(ramp:oklch(70% $ ~bright.hue), ends:bright.chroma..middle.chroma..dark.chroma, range:0..0.4){colorModel=oklch}=Chroma curve @helper: How colourfulness builds between the ends. Most palettes peak mid-ramp, then fall.|saturationCurve:curve(ramp:hsl(~bright.hslHue $% 50%), ends:bright.saturation..middle.saturation..dark.saturation, range:0..100){colorModel=hsl}=Saturation curve @helper: Same idea for HSL saturation. Kept separate from chroma so switching model keeps the right curve.|bright:{chroma:number{colorModel=oklch}@placeholder=\"eg. 0.012\"=Chroma start|saturation:number{colorModel=hsl}@placeholder=\"eg. 12\"=Saturation start}=Bright|middle:{chroma:number{colorModel=oklch}@placeholder=\"eg. 0.012\"=Chroma middle|saturation:number{colorModel=hsl}@placeholder=\"eg. 12\"=Saturation middle}=Middle|dark:{chroma:number{colorModel=oklch}@placeholder=\"eg. 0.012\"=Chroma end|saturation:number{colorModel=hsl}@placeholder=\"eg. 12\"=Saturation end}=Dark|#>Lightness|curve:curve(original, ramp:hsl(~bright.hslHue ~bright.saturation% $%), ends:bright.lightness..dark.lightness, range:0..100){colorModel=hsl}=Lightness curve @helper: One curve from bright to dark. Drag a handle or pick a preset. Add middle point to bend the two halves differently.|bright:{lightness:number{colorModel=hsl}@placeholder=\"eg. 98\"=Bright}=Bright|dark:{lightness:number{colorModel=hsl}@placeholder=\"eg. 4\"=Dark}=Dark @disabledNote: Anchors take effect once you choose a curve.|@preview @blocks @label: Modes @showWhen: collectionName=* @showWhen: steps=*",
  "",
  "  ",
].join('\n');

module.exports = { COLORS_PANEL_SPEC, COLORS_VALUES_BLOCK, innerPanelSpec, PRE_MIGRATION_COLORS_ROWS_BLOCK };
