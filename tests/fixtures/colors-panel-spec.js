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
  '//     { type: "paragraph", attachTo: "next", text: "The collection\'s own modes. The chips are the mode list — a read fills them, and there is one mode block below per chip, in chip order. Removing and renaming happen here, which is why a block carries neither." },',
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
  '//     { type: "paragraph", attachTo: "previous", text: "Each anchor keeps a hue for both models: OKLCH\'s is a perceptual angle, HSL\'s is where the maximum channel sits, and on a near-neutral ramp the two disagree by more than 30°. Both are filled when the panel reads a collection, so switching model loses nothing." },',
  '//     { type: "divider", section: true },',
  '//     { type: "heading", text: "OKLCH settings",',
  '//       showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" } },',
  '//     { type: "paragraph", attachTo: "previous", text: "The same curve editor a mode has, at collection scope: the ladder is shared, so the curve belongs to the collection rather than to one of its modes — **one curve for every mode**, which is what makes the modes match in greyscale." },',
  '//     { type: "paragraph", attachTo: "previous", text: "**Nothing below General until there are tokens.** Choosing a collection sets a read going — modes are fetched, blocks are added, the block is rewritten — and every one of those rebuilds the form. With the mode settings on screen that reads as flicker and a jumping layout, over a panel that cannot say anything useful yet: a collection with no token list has no ramp to show. Naming the tokens is the point at which there is something to draw, so it is the point at which the rest appears." },',
  '//     { type: "paragraph", attachTo: "next", text: "**A new scale starts Linear, not Original.** *Original* means \\"the ramp already in the file\\", so on a collection that has no ramp yet it names nothing — an empty editor and a preview with no line in it. Linear is the honest starting point: an even ladder between the two ends, which is a thing you can see and then bend. A read replaces it with the curve fitted to what the file actually holds." },',
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
  '//         { type: "tab", names: [{ text: "Hue" }], columns: [',
  '//           { key: "hueCurve", type: "curve", label: "Hue curve",',
  '//             ramp: "oklch(70% ~bright.chroma $)",',
  '//             ends: "bright.hue..middle.hue..dark.hue", range: [0, 360],',
  '//             showWhen: { colorModel: "oklch" },',
  '//             helper: "How the hue travels between the ends. Worth least on a cool palette and most on a warm one — amber crosses 49 degrees and needs its own timing. Empty on a near-grey, where a measured hue is rounding rather than a value." },',
  '//           { key: "hslHueCurve", type: "curve", label: "Hue curve",',
  '//             ramp: "hsl($ ~bright.saturation% 50%)",',
  '//             ends: "bright.hslHue..middle.hslHue..dark.hslHue", range: [0, 360],',
  '//             showWhen: { colorModel: "hsl" },',
  '//             helper: "The same, for HSL — a different angle from OKLCH\'s, so a different curve." },',
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
  '//               helper: "How fast the colour arrives, as opposed to the lightness. A designed palette usually rises to its most colourful step and falls, on its own timing." },',
  '//             { key: "saturationCurve", type: "curve", label: "Saturation curve",',
  '//               ramp: "hsl(~bright.hslHue $% 50%)",',
  '//               ends: "bright.saturation..middle.saturation..dark.saturation", range: [0, 100],',
  '//               showWhen: { colorModel: "hsl" },',
  '//               helper: "The same, for HSL. Saturation and chroma are different quantities, so they carry different curves and a read fits both — switching model keeps whichever one it is switching to." },',
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
  '//             helper: "One curve, bright to dark. Drag a handle, pick a preset, or paste coordinates. Add middle point bends the two halves differently — which is what a real neutral ramp does — and that anchor is the middle colour\'s lightness and its step." },',
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
  "  // The collection's own modes. The chips are the mode list — a read fills them, and there is one mode block",
  "  // below per chip, in chip order. Removing and renaming happen here, which is why a block carries neither.",
  "  // @collectionModes: Collection modes @showWhen: collectionName=* @showWhen: steps=*",
  "  group: \"\", // @label: Group within collection @placeholder=\"eg.: Primitives/Neutrals\"",
  "  steps: \"\", // @label: Color tokens @placeholder=\"Eg. 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950\" @helper: Named lightest to darkest, and the only source for token placement below. The variables are <group>/<step>.",
  "  colorModel: \"hsl\", // @options: hsl:HSL|oklch:OKLCH @radio @label: Color model @helper: OKLCH to generate, HSL to read. OKLCH shares one lightness ladder across every mode, which is what makes them match in greyscale. HSL keeps a curve per mode — and its colourfulness envelope, S x (1 - |2L - 1|), has a corner at 50% lightness that every full ramp crosses. See the Documentation tab.",
  "  // Each anchor keeps a hue for both models: OKLCH's is a perceptual angle, HSL's is where the",
  "  // maximum channel sits, and on a near-neutral ramp the two disagree by more than 30°. Both are",
  "  // filled when the panel reads a collection, so switching model loses nothing.",
  "",
  "  // --- @section",
  "",
  "  // # OKLCH settings @showWhen: colorModel=oklch @showWhen: collectionName=* @showWhen: steps=*",
  "  // The same curve editor a mode has, at collection scope: the ladder is shared, so the curve belongs to",
  "  // the collection rather than to one of its modes — **one curve for every mode**, which is what makes the",
  "  // modes match in greyscale.",
  "  //",
  "  // **Nothing below General until there are tokens.** Choosing a collection sets a read going — modes are",
  "  // fetched, blocks are added, the block is rewritten — and every one of those rebuilds the form. With the",
  "  // mode settings on screen that reads as flicker and a jumping layout, over a panel that cannot say",
  "  // anything useful yet: a collection with no token list has no ramp to show. Naming the tokens is the",
  "  // point at which there is something to draw, so it is the point at which the rest appears.",
  "  //",
  "  // **A new scale starts Linear, not Original.** *Original* means \"the ramp already in the file\", so on a",
  "  // collection that has no ramp yet it names nothing — an empty editor and a preview with no line in it.",
  "  // Linear is the honest starting point: an even ladder between the two ends, which is a thing you can see",
  "  // and then bend. A read replaces it with the curve fitted to what the file actually holds.",
  "  curve: [0.333333, 0.333333, 0.666667, 0.666667], // @curve @allowOriginal @ramp: oklch($% 0 0) @ends: lightness.bright..lightness.dark @range: 0..100 @label: Curve @showWhen: colorModel=oklch @showWhen: collectionName=* @showWhen: steps=* @helper: One curve, bright to dark. Drag a handle, pick a preset, or paste coordinates. Add middle point bends the two halves differently — which is what a real neutral ramp does — and that anchor is the middle colour's lightness and its step.",
  "  // @preview",
  "  lightness: {}, // @group: bright:number=Bright|dark:number=Dark @label: Lightness @showWhen: colorModel=oklch @showWhen: collectionName=* @showWhen: steps=* @helper: 0 to 100. The two ends hold exactly; the curve fills everything between them.",
  "  // # Mode settings @showWhen: collectionName=* @showWhen: steps=*",
  "  modes: [",
  "    {",
  "      name: \"\",",
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
  "  ], // @rows: name:text=Mode|seed:{hex:text@placeholder=\"eg. #71717A\"=Hex|placement:text@placeholder=\"Auto\"=Token|lock:checkbox=Lock seed color @helper: On. Seed keeps its value. The ladder re-anchors through it, endpoints unchanged.\\nOff. Seed moves to the nearest step on the ladder.}=Seed color|#>Hue|hueCurve:curve(ramp:oklch(70% ~bright.chroma $), ends:bright.hue..middle.hue..dark.hue, range:0..360){colorModel=oklch}=Hue curve @helper: How the hue travels between the ends. Worth least on a cool palette and most on a warm one — amber crosses 49 degrees and needs its own timing. Empty on a near-grey, where a measured hue is rounding rather than a value.|hslHueCurve:curve(ramp:hsl($ ~bright.saturation% 50%), ends:bright.hslHue..middle.hslHue..dark.hslHue, range:0..360){colorModel=hsl}=Hue curve @helper: The same, for HSL — a different angle from OKLCH's, so a different curve.|bright:{hue:number{colorModel=oklch}@placeholder=\"eg. 264\"=Hue start|hslHue:number{colorModel=hsl}@placeholder=\"eg. 264\"=Hue start}=Bright|middle:{hue:number{colorModel=oklch}@placeholder=\"eg. 264\"=Hue middle|hslHue:number{colorModel=hsl}@placeholder=\"eg. 264\"=Hue middle}=Middle|dark:{hue:number{colorModel=oklch}@placeholder=\"eg. 264\"=Hue end|hslHue:number{colorModel=hsl}@placeholder=\"eg. 264\"=Hue end}=Dark|#>Saturation{colorModel=hsl}|#>Chroma{colorModel=oklch}|chromaCurve:curve(ramp:oklch(70% $ ~bright.hue), ends:bright.chroma..middle.chroma..dark.chroma, range:0..0.4){colorModel=oklch}=Chroma curve @helper: How fast the colour arrives, as opposed to the lightness. A designed palette usually rises to its most colourful step and falls, on its own timing.|saturationCurve:curve(ramp:hsl(~bright.hslHue $% 50%), ends:bright.saturation..middle.saturation..dark.saturation, range:0..100){colorModel=hsl}=Saturation curve @helper: The same, for HSL. Saturation and chroma are different quantities, so they carry different curves and a read fits both — switching model keeps whichever one it is switching to.|bright:{chroma:number{colorModel=oklch}@placeholder=\"eg. 0.012\"=Chroma start|saturation:number{colorModel=hsl}@placeholder=\"eg. 12\"=Saturation start}=Bright|middle:{chroma:number{colorModel=oklch}@placeholder=\"eg. 0.012\"=Chroma middle|saturation:number{colorModel=hsl}@placeholder=\"eg. 12\"=Saturation middle}=Middle|dark:{chroma:number{colorModel=oklch}@placeholder=\"eg. 0.012\"=Chroma end|saturation:number{colorModel=hsl}@placeholder=\"eg. 12\"=Saturation end}=Dark|#>Lightness|curve:curve(original, ramp:hsl(~bright.hslHue ~bright.saturation% $%), ends:bright.lightness..dark.lightness, range:0..100){colorModel=hsl}=Lightness curve @helper: One curve, bright to dark. Drag a handle, pick a preset, or paste coordinates. Add middle point bends the two halves differently — which is what a real neutral ramp does — and that anchor is the middle colour's lightness and its step.|bright:{lightness:number{colorModel=hsl}@placeholder=\"eg. 98\"=Bright}=Bright|dark:{lightness:number{colorModel=hsl}@placeholder=\"eg. 4\"=Dark}=Dark @disabledNote: Anchors take effect once you choose a curve.|@preview @blocks @label: Modes @showWhen: collectionName=* @showWhen: steps=*",
  "",
  "  ",
].join('\n');

module.exports = { COLORS_PANEL_SPEC, COLORS_VALUES_BLOCK, innerPanelSpec, PRE_MIGRATION_COLORS_ROWS_BLOCK };
