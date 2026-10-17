// Colors
// @DOC_START
// # Creates a colour ramp per Variable Mode: separate Hue, Saturation and Lightness curves in HSL; shared Lightness with separate Chroma and Hue in OKLCH
//
// ## Overview
//
// Each mode is a ramp from bright to dark. Edit anchors and the curve in the panel, then **Run** to
// write variables in place. Turn on **Generate overview** to add a Colors section on the canvas under
// Design System Foundations: one horizontal ramp per collection + group. Regenerating the same
// address updates that section only; a different collection or group adds another.
//
// In **OKLCH**, one shared **lightness curve** applies to every mode. Each mode sets its own hue and
// chroma. Steps with the same name (e.g. 200 in two modes) stay at the same lightness with different colour.
//
// In **HSL**, each mode has its own lightness curve. Use the **Color model** control to switch.
//
// ### Which model to choose
//
// - **OKLCH** when every mode should share the same lightness steps. Good for new multi-mode palettes.
// - **HSL** when you are matching or extending a palette that already uses HSL.
//
// HSL ties saturation to lightness: colourfulness is limited near white and black and peaks around
// middle lightness. OKLCH keeps a smoother curve across the full ramp. The panel reads and writes both;
// pick the one that fits your file.
//
// OKLCH and HSL use different hue angles. On near-neutral ramps they can disagree. The panel stores
// both when it reads a collection, so switching model keeps your anchors.
//
// ### Seed color
//
// Enter a hex under **Hex**. The panel rebuilds that mode's full scale from it: bright / middle / dark
// hue and chroma (or saturation), lightness ends, and Linear curves — the same idea as tools like
// tints.dev, using CodeFig's own anchors and curves rather than a separate palette generator.
//
// Changing the hex again re-applies the whole scale. Bend curves or anchors afterwards to refine;
// enter a new seed when you want a fresh family.
//
// **Token** decides which step the seed occupies (default `500` when that name exists, otherwise the
// middle of the list). That step is the middle anchor.
//
// **Lock seed color** keeps the seed's exact hex on that step. Neighbours stay on the ladder. With
// lock on, Hue / Saturation (or Chroma) / Lightness at the seed step cannot be edited — numbers and
// the middle curve grip stay put; ends and curve shape remain free. With lock off, the seed was a
// one-shot authoring tool and later edits can move that step.
//
// ### Color tokens
//
// **Color tokens** are the step names, lightest to darkest. The default list is Tailwind's
// `50…950`. Add or remove names freely — insert `150` between `100` and `200` for an in-between.
// A series expands the same way as Spacing: `shade-{1,12}` becomes twelve names. Names are labels;
// lightness still comes from the ladder.
//
// ### Opacity variations
//
// Leave **Opacity variations** empty (or `100`) for solid colours only — same as before. Enter a
// comma list such as `5, 10, 20, 50, 80, 90` and each step also gets a subgroup of those opacities.
// With group `pine` and step `50`, the solid colour stays at `pine/50`; variants land at
// `pine/pine-50/50-5%`, `pine/pine-50/50-10%`, and so on. `100` in the list is ignored — the main
// group already holds full opacity.
//
// Each variant is a link to its step's variable at that opacity, not a copy of its hex, so editing
// `pine/50` by hand moves every variant of it. A variant whose base is missing or translucent is
// written as plain RGBA instead, because Figma ignores an opacity on a translucent source.
//
// ### The curve
//
// Drag handles, pick a preset, or paste `cubic-bezier(...)`. **Add middle point** splits the ramp into
// two segments so the half above the middle can bend differently from the half below.
//
// New scales start on **Linear**. **Original** means the ramp already in the file; it stays empty until
// a collection is read. A read replaces Linear with the fitted curve.
//
// The panel does not guess a curve for an existing ramp. It may not sit on any curve, so the curve stays
// on **Original** and the panel compares what is in the file with what it would generate.
//
// ### Reading an existing collection
//
// Point **Collection** and **Group within collection** at an existing set and the panel fills from it:
// steps from variable names, and hue, chroma, and lightness anchors from the first, middle, and last values.
//
// ### What the script will not change
//
// - **Aliased variables** are read through and never written.
// - **Non-opaque variables** are reported and skipped.
// - A **group where more than half the variables are non-opaque** is treated as an alpha ramp and declined.
// - **Steps leaving the token list** are reported as orphans and left alone. Variables are never deleted
//   or renamed because a step list shrank.
//
// ### Things to know
//
// - **Chroma is reduced per step to stay inside sRGB; L and hue never move.** Every reduction is
//   reported under the swatch and in the run log.
// - Very saturated colours can read slightly brighter than their lightness suggests. Usually minor on
//   near-neutral ramps.
// - Stored RGB values are treated as **sRGB**.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Collection**<br>`collectionName` | Variable collection to read from and write to. |
// | **Collection modes** | Chips for modes in the collection. Add, remove, or rename here. Each mode gets its own block below. |
// | **Group within collection**<br>`group` | Folder for the colour variables, e.g. `Primitives/Neutrals`. |
// | **Color tokens**<br>`steps` | Step names, lightest to darkest (default Tailwind `50…950`). Variables are `group/step`. Insert names for in-betweens; `shade-{1,12}` expands to a series. |
// | **Opacity variations**<br>`opacityVariations` | Comma-separated opacities (0–100). Empty or `100` only: solid colours in the main group. Otherwise each step gets a subgroup (`pine/pine-50/50-10%`). `100` is never duplicated under the subgroup. Each variant links to its step's variable at that opacity. |
// | **Color model**<br>`colorModel` | **OKLCH** or **HSL**. OKLCH shares lightness steps across modes; HSL matches existing HSL palettes. |
// | **Shared lightness**<br>`curve` | OKLCH only. One lightness curve for every mode, from bright to dark. |
// | **Lightness → Bright / Dark**<br>`lightness.bright` / `lightness.dark` | OKLCH only. Lightness at the two ends (0–100). The shared curve fills everything between. |
// | **Mode**<br>`modes[].name` | Name of this mode. |
// | **Seed color → Hex**<br>`modes[].seed.hex` | Hex that rebuilds this mode's full scale (anchors + Linear curves). |
// | **Seed color → Token**<br>`modes[].seed.placement` | Which step the seed occupies (middle of the ramp). Auto when empty. |
// | **Lock seed color**<br>`modes[].seed.lock` | On: seed step keeps the exact hex; middle H / S / L stay put. Off: later edits can move that step. |
// | **Hue curve**<br>`modes[].hueCurve` / `hslHueCurve` | How hue shifts from the light end to the dark end. Separate curves for OKLCH and HSL. |
// | **Hue start / middle / end** | Anchor hues at bright, middle, and dark. |
// | **Chroma curve** / **Saturation curve**<br>`modes[].chromaCurve` / `saturationCurve` | How colourfulness builds between the ends (OKLCH chroma or HSL saturation). |
// | **Chroma / Saturation start / middle / end** | Anchor colourfulness at bright, middle, and dark. |
// | **Lightness curve**<br>`modes[].curve` | HSL only. Per-mode lightness curve from bright to dark. |
// | **Bright / Middle / Dark**<br>`modes[].bright.lightness` / `middle.lightness` / `dark.lightness` | HSL only. Lightness at the ends and at the seed step (middle). |
// | **Generate overview**<br>`generateOverview` | When on, builds a horizontal colour ramp under Design System Foundations. One section per Collection + Group; overwrite only when both match. Off by default. |
// @DOC_END

// The Configuration tab redraws this as you type. Pure: it generates in memory and draws the same strips a
// run would write, and cannot change the file on its own.
// @PREVIEW: colorsPreviewHtml

// Package-scoped `@import` (plan 32) follows calls across Design System Foundations members, so
// `@Color Ramp` brings `@OKLCH` / `@Bezier` / `@Math Helpers` without naming them here. Keep
// `@PREVIEW:` entry points and anything this file calls directly. Outside a package, imports still
// do not bring cross-script dependencies — `npm run validate` makes a missing one a build error.

@import { displayResults, createResult } from "@InfoPanel"
@import { getOrCreateCollection, setupModes, processVariables, getVariable, buildVariableIndex } from "@Variables"
@import { foundationCreateColorsOverview } from "@Foundation overview"
@import { namePrefix, resolveCollectionName, resolveGroup, expandTokenList, tokenListHasSeries, writeManifest, findFoundationSet, foundationModeIds, alignStampedTokens, stampGeneratedTokens, describeStampAlignment, foundationColorsAutoImport } from "@Foundation"
@import { colorsParseSteps, colorsPreviewHtml, colorsBuildVariableMap, colorsManifestSlice, colorsApplySeedScale, colorsSyncLockedSeedMiddles } from "@Color Ramp"

// ========================================
// CONFIG
// ========================================

var colorsConfigData = typeof colorsConfigData !== 'undefined' ? colorsConfigData : {
  // @CONFIG_START
// @fromFile: domains.colors

  collectionName: "",
  group: "",
  steps: ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"],
  opacityVariations: "",
  colorModel: "hsl",
  curve: [0.333333, 0.333333, 0.666667, 0.666667],
  lightness: {},
  generateOverview: false,
  modes: [
    {
      name: "Value",
      curve: [0.333333, 0.333333, 0.666667, 0.666667],
      chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],
      seed: { hex: "", placement: "", lock: false },
      bright: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 98 },
      middle: { hue: 0, hslHue: 0, chroma: 0, saturation: 0 },
      dark: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 4 }
    }
  ]
// @CONFIG_END

};

// @PANEL_START
var __codefigPanel = {
  blocks: [
    { type: "section", id: "general", blocks: [
      { type: "heading", text: "General" },
      { key: "collectionName", type: "collection", label: "Collection" },
      { type: "paragraph", attachTo: "next", text: "These chips are the collection's modes. Add, remove, or rename here. Each chip gets a mode block below." },
      { type: "chips", label: "Collection modes",
        showWhen: { collectionName: "*" } },
      { key: "group", type: "string", label: "Group within collection",
        placeholder: "eg.: Primitives/Neutrals" },
      { key: "steps", type: "list", label: "Color tokens",
        placeholder: "50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950",
        helper: "Names from lightest to darkest. Starts as Tailwind's 50…950. Insert a name between two steps for an in-between. shade-{1,12} expands to a series." },
      { key: "opacityVariations", type: "string", label: "Opacity variations",
        placeholder: "eg. 5, 10, 20, 50, 80, 90",
        helper: "Comma-separated opacities from 0 to 100. Leave empty for solid colours only. Each step gets a subgroup: pine/50 stays opaque; pine/pine-50/50-10% is 10%." },
      { key: "colorModel", type: "radio", label: "Color model",
        options: [{ hsl: "HSL" }, { oklch: "OKLCH" }],
        helper: "OKLCH when every mode should share the same lightness steps. HSL when you are matching a palette that already uses HSL. When to pick each: Documentation." },
      { type: "paragraph", attachTo: "previous", text: "Each end keeps an OKLCH hue and an HSL hue. Both fill when a collection is read, so switching model keeps your anchors." }
    ]},
    { type: "divider" },
    { type: "section", id: "oklch-settings",
      showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" },
      blocks: [
        { type: "heading", text: "OKLCH settings" },
        { type: "paragraph", attachTo: "previous", text: "One lightness curve for every mode. Each mode only sets its own hue and chroma." },
        { type: "paragraph", attachTo: "previous", text: "Choose a collection. Mode settings and the ramp appear after that." },
        { type: "paragraph", attachTo: "next", text: "New scales start on Linear. Original means the ramp already in the file, so it stays empty until a collection is read. A read replaces Linear with the fitted curve." },
        { key: "curve", type: "curve", label: "Shared lightness", allowOriginal: true,
          ramp: "oklch($% 0 0)", ends: "lightness.bright..lightness.dark", range: [0, 100],
          helper: "One curve from bright to dark. Drag a handle or pick a preset. Add middle point to bend the two halves differently." },
        { key: "lightness", type: "group", label: "Lightness",
          helper: "0–100 at the two ends. The curve fills everything between.",
          fields: [
            { key: "bright", type: "number", label: "Bright", min: 0, max: 100 },
            { key: "dark", type: "number", label: "Dark", min: 0, max: 100 }
          ] }
      ]},
    { type: "section", id: "mode-settings",
      showWhen: { collectionName: "*", steps: "*" },
      blocks: [
        { type: "heading", text: "Mode settings" },
        { key: "generateOverview", type: "boolean", label: "Generate overview",
          helper: "Builds a horizontal colour ramp under Design System Foundations. One section per Collection + Group; the same address overwrites, a different one adds a section." },
        { key: "modes", type: "rows", label: "Modes", layout: "blocks",
          columns: [
            { key: "name", type: "text", label: "Mode" },
            { key: "seed", type: "group", label: "Seed color", fields: [
              { key: "hex", type: "text", label: "Hex", placeholder: "eg. #71717A or 71717A",
                helper: "Rebuilds this mode's scale from one colour. With or without #. Changing it again starts over." },
              { key: "placement", type: "text", label: "Token", placeholder: "Auto" },
              { key: "lock", type: "checkbox", label: "Lock seed color",
                helper: "On. The seed step keeps this exact hex. Middle Hue, Saturation, and Lightness stay put.\nOff. Later edits can move that step." }
            ] },
            { type: "tab", names: [{ text: "Hue" }], columns: [
              { key: "hueCurve", type: "curve", label: "Hue curve", overshoot: true,
                ramp: "oklch(70% ~bright.chroma $)",
                ends: "bright.hue..middle.hue..dark.hue", range: [0, 360],
                showWhen: { colorModel: "oklch" },
                helper: "How hue shifts from the light end to the dark end. Leave it as it is unless the palette is warm (amber, orange), where it usually needs its own timing. Near-greys can stay empty." },
              { key: "hslHueCurve", type: "curve", label: "Hue curve", overshoot: true,
                ramp: "hsl($ ~bright.saturation% 50%)",
                ends: "bright.hslHue..middle.hslHue..dark.hslHue", range: [0, 360],
                showWhen: { colorModel: "hsl" },
                helper: "Same control for HSL hue. Separate from OKLCH because the two models use different angles." },
              { type: "anchors", positions: ["bright", "middle", "dark"],
                fields: [
                  { key: "hue", min: 0, max: 360, showWhen: { colorModel: "oklch" },
                    labels: { bright: "Hue start", middle: "Hue middle", dark: "Hue end" },
                    placeholders: "eg. 264" },
                  { key: "hslHue", min: 0, max: 360, showWhen: { colorModel: "hsl" },
                    labels: { bright: "Hue start", middle: "Hue middle", dark: "Hue end" },
                    placeholders: "eg. 264" }
                ] }
            ] },
            { type: "tab",
              names: [
                { text: "Saturation", showWhen: { colorModel: "hsl" } },
                { text: "Chroma", showWhen: { colorModel: "oklch" } }
              ],
              columns: [
                { key: "chromaCurve", type: "curve", label: "Chroma curve", overshoot: true,
                  ramp: "oklch(70% $ ~bright.hue)",
                  ends: "bright.chroma..middle.chroma..dark.chroma", range: [0, 0.4],
                  showWhen: { colorModel: "oklch" },
                  helper: "How colourfulness builds between the ends. Most palettes peak mid-ramp, then fall." },
                { key: "saturationCurve", type: "curve", label: "Saturation curve", overshoot: true,
                  ramp: "hsl(~bright.hslHue $% 50%)",
                  ends: "bright.saturation..middle.saturation..dark.saturation", range: [0, 100],
                  showWhen: { colorModel: "hsl" },
                  helper: "Same idea for HSL saturation. Kept separate from chroma so switching model keeps the right curve." },
                { type: "anchors", positions: ["bright", "middle", "dark"],
                  fields: [
                    { key: "chroma", min: 0, max: 0.5, showWhen: { colorModel: "oklch" },
                      labels: { bright: "Chroma start", middle: "Chroma middle", dark: "Chroma end" },
                      placeholders: "eg. 0.012" },
                    { key: "saturation", min: 0, max: 100, showWhen: { colorModel: "hsl" },
                      labels: { bright: "Saturation start", middle: "Saturation middle", dark: "Saturation end" },
                      placeholders: "eg. 12" }
                  ] }
            ] },
            { type: "tab", names: [{ text: "Lightness" }], columns: [
              { key: "curve", type: "curve", label: "Lightness curve", allowOriginal: true,
                ramp: "hsl(~bright.hslHue ~bright.saturation% $%)",
                ends: "bright.lightness..middle.lightness..dark.lightness", range: [0, 100],
                showWhen: { colorModel: "hsl" },
                helper: "One curve from bright to dark. Drag a handle or pick a preset. Add middle point to bend the two halves differently." },
              { type: "anchors", positions: ["bright", "middle", "dark"],
                notes: { dark: "Anchors take effect once you choose a curve." },
                fields: [
                  { key: "lightness", min: 0, max: 100, showWhen: { colorModel: "hsl" },
                    labels: { bright: "Bright", middle: "Middle", dark: "Dark" },
                    placeholders: { bright: "eg. 98", middle: "eg. 50", dark: "eg. 4" } }
                ] }
            ] },
            { type: "preview" }
          ] }
      ]}
  ]
};
// @PANEL_END

// ========================================
// EXECUTION
//
// Run always writes. The panel strip is the preview; this path is align → processVariables →
// writeManifest → stamp, same as Spacing/Radius.
// ========================================

/**
 * Drop aliased and non-opaque mode cells from the write map. Those cells are reported, never
 * overwritten — an alias is a deliberate link, and an alpha value on a main-ramp step is not a
 * lightness step. Opacity-variation subgroups (nested under the group) are written on purpose and
 * are not skipped for being non-opaque.
 */
async function colorsApplyWriteGuards(collection, built, group) {
  var skippedAlias = [];
  var skippedAlpha = [];
  if (!collection) {
    return { variables: built.variables, skippedAlias: skippedAlias, skippedAlpha: skippedAlpha };
  }
  var variables = {};
  var names = Object.keys(built.variables);
  var prefix = namePrefix(group);
  var index = await buildVariableIndex(collection);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var entry = built.variables[name];
    var existing = await getVariable(collection, name, index);
    var values = {};
    var modeNames = Object.keys(entry.values || {});
    var tail = prefix && name.indexOf(prefix) === 0 ? name.slice(prefix.length) : name;
    // Nested under the group → opacity variant we own; do not treat existing alpha as a skip.
    var nestedUnderGroup = tail.indexOf('/') !== -1;
    for (var m = 0; m < modeNames.length; m++) {
      var modeName = modeNames[m];
      var cellValue = entry.values[modeName];
      if (!existing) {
        values[modeName] = cellValue;
        continue;
      }
      var mode = collection.modes.filter(function (mm) { return mm.name === modeName; })[0];
      if (!mode) {
        values[modeName] = cellValue;
        continue;
      }
      var cell = existing.valuesByMode[mode.modeId];
      if (cell && cell.type === 'VARIABLE_ALIAS') {
        skippedAlias.push(name + ' · ' + modeName);
        continue;
      }
      if (!nestedUnderGroup && cell && typeof cell.a === 'number' && cell.a < 1) {
        skippedAlpha.push(name + ' · ' + modeName);
        continue;
      }
      values[modeName] = cellValue;
    }
    if (Object.keys(values).length > 0) {
      variables[name] = { type: 'COLOR', values: values };
      if (entry.opacityOf) {
        variables[name].opacityOf = entry.opacityOf;
        variables[name].opacity = entry.opacity;
      }
    }
  }
  return { variables: variables, skippedAlias: skippedAlias, skippedAlpha: skippedAlpha };
}

/** COLOR variables under the group whose step is not in the token list — reported, never removed. */
async function colorsFindOrphans(collection, group, steps) {
  var orphans = [];
  if (!collection) return orphans;
  var prefix = namePrefix(group);
  var wanted = {};
  (steps || []).forEach(function (step) { wanted[prefix + step] = true; });
  var ids = collection.variableIds || [];
  for (var i = 0; i < ids.length; i++) {
    var variable = await figma.variables.getVariableByIdAsync(ids[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;
    if (variable.name.indexOf(prefix) !== 0) continue;
    var tail = variable.name.slice(prefix.length);
    if (tail.indexOf('/') !== -1) continue;
    if (wanted[variable.name]) continue;
    orphans.push(variable.name);
  }
  return orphans;
}

function colorsPlanLines(built, guards, orphans) {
  var results = [];
  var names = Object.keys(guards.variables);
  var opacityNote = (built.opacities && built.opacities.length)
    ? ' · opacities ' + built.opacities.join(', ') + '%'
    : '';
  results.push(createResult(
    names.length + ' colour variables · ' + built.modeNames.length + ' modes' + opacityNote,
    'Writing: ' + (names.length ? names.join(', ') : '—'),
    'info'
  ));
  if (guards.skippedAlias.length) {
    results.push(createResult(
      guards.skippedAlias.length + ' aliased cell' + (guards.skippedAlias.length === 1 ? '' : 's') + ' left alone',
      guards.skippedAlias.join(', '),
      'warning'
    ));
  }
  if (guards.skippedAlpha.length) {
    results.push(createResult(
      guards.skippedAlpha.length + ' non-opaque cell' + (guards.skippedAlpha.length === 1 ? '' : 's') + ' left alone',
      guards.skippedAlpha.join(', '),
      'warning'
    ));
  }
  if (orphans.length) {
    results.push(createResult(
      orphans.length + ' orphan' + (orphans.length === 1 ? '' : 's') + ' not in the token list — left in the file',
      orphans.join(', '),
      'warning'
    ));
  }
  if (built.clamped.length) {
    results.push(createResult(
      built.clamped.length + ' chroma reduction' + (built.clamped.length === 1 ? '' : 's') + ' to stay in sRGB',
      built.clamped.map(function (c) {
        return (c.mode || '') + ' / ' + c.step + (c.chroma != null ? ' (C→' + c.chroma + ')' : '');
      }).join(', '),
      'info'
    ));
  }
  if (built.invalid.length) {
    results.push(createResult(
      built.invalid.length + ' step' + (built.invalid.length === 1 ? '' : 's') + ' had no colour to write',
      built.invalid.map(function (row) { return row.name + ' · ' + row.mode; }).join(', '),
      'warning'
    ));
  }
  return results;
}

function resolveColorsGenerateOverview(config) {
  if (!config || typeof config !== 'object') return false;
  if (config.generateOverview === true) return true;
  return false;
}

async function runColors(config) {
  var data = config || {};
  // Same as Spacing: expand `shade-{1,12}` (or a comma series) into concrete names before write.
  if (tokenListHasSeries(data.steps)) data.steps = expandTokenList(data.steps);
  var parsed = colorsParseSteps(data.steps);
  var results = [];

  if (!data.collectionName || !String(data.collectionName).trim()) {
    displayResults({
      title: 'Colors',
      results: [createResult('Choose a collection', 'Nothing to write without one.', 'error')],
      type: 'error',
      showFilters: false
    });
    return;
  }
  if (!parsed.steps.length) {
    displayResults({
      title: 'Colors',
      results: [createResult('Add colour tokens', 'Name the steps lightest to darkest, then run again.', 'error')],
      type: 'error',
      showFilters: false
    });
    return;
  }

  var collectionName = resolveCollectionName({ config: data, collectionName: data.collectionName });
  var groupName = resolveGroup({ config: data, group: data.group });

  // **Same `existing` the preview injects — otherwise Original becomes Linear.**
  //
  // The panel holds file hexes in session state and passes them into `colorsPreviewHtml` as
  // `config.existing`. They are never saved into the config block (`colorsManifestSlice` drops
  // them). A Run that builds the write map without them hits `colorsGenerateMode`'s
  // "Original has nothing to hold onto → fall back to Linear" branch and rewrites every interior
  // step onto a unified linear lightness range while the strip still shows the quiet file ramp.
  // Confirmed live on `color - neutral`: strip hexes `#FCFCFC…`, Run wrote `#f1f1f1…`.
  //
  // `skipFit: true` — we only need the hex map; fitting curves here would redo work the panel
  // already did (or deliberately left as Original).
  var modeNames = (Array.isArray(data.modes) ? data.modes : []).map(function (m) {
    return m && typeof m.name === 'string' ? m.name.trim() : '';
  }).filter(Boolean);
  var heldImport = await foundationColorsAutoImport(
    collectionName, groupName, modeNames, data.colorModel || 'hsl', null, true
  );
  var forWrite = data;
  if (heldImport && heldImport.existing && Object.keys(heldImport.existing).length > 0) {
    forWrite = Object.assign({}, data, { existing: heldImport.existing });
  }

  var built = colorsBuildVariableMap(forWrite);
  if (!built.modeNames.length) {
    displayResults({
      title: 'Colors',
      results: [createResult('Add at least one mode', 'The chips under Collection modes are the mode list.', 'error')],
      type: 'error',
      showFilters: false
    });
    return;
  }

  console.log('=== COLORS ===');
  console.log('Collection: ' + collectionName + (groupName ? ' (group: ' + groupName + ')' : ''));

  var collection = await getOrCreateCollection(collectionName);
  setupModes(collection, built.modeNames);

  var guards = await colorsApplyWriteGuards(collection, built, groupName);
  var orphans = await colorsFindOrphans(collection, groupName, built.steps);

  var names = Object.keys(guards.variables);
  var setId = (await findFoundationSet(collection, 'colors', groupName)).id || '';
  var aligned = await alignStampedTokens(collection, 'colors', groupName, names, setId);
  describeStampAlignment(aligned).forEach(function (line) { console.log(line); });

  var stats = await processVariables(collection, guards.variables, data, built.modeNames);

  var manifest = null;
  try {
    manifest = writeManifest(collection, {
      id: setId,
      domain: 'colors',
      group: groupName,
      modes: built.modeNames.slice(),
      modeIds: foundationModeIds(collection, built.modeNames),
      tokens: built.steps.slice(),
      config: colorsManifestSlice(data)
    });
    if (manifest.ok) {
      console.log('Recorded this set: ' + manifest.key + ' (' + manifest.bytes + ' characters)');
    } else {
      console.warn('Variables were written. The set could not be recorded: ' +
        ((manifest.warnings[0] && manifest.warnings[0].message) || ''));
    }
  } catch (e) {
    console.warn('Variables were written. The set could not be recorded: ' +
      (e && e.message ? e.message : e));
  }

  var stamped = await stampGeneratedTokens(
    collection, 'colors', groupName, names,
    (manifest && manifest.manifest ? manifest.manifest.id : setId)
  );
  (stamped.warnings || []).forEach(function (w) { console.warn(w.message); });

  results = colorsPlanLines(built, guards, orphans);
  results.push(createResult(
    stats.created + ' created, ' + stats.updated + ' updated, ' + stats.unchanged + ' unchanged, ' + stats.skipped + ' skipped',
    'Collection: ' + collection.name +
      (manifest && manifest.ok ? '; set recorded' : ''),
    'success'
  ));

  var showOverview = resolveColorsGenerateOverview(data);
  if (showOverview) {
    await foundationCreateColorsOverview(collection, data);
  }

  // After the overview, so `displayResults` — which reports the run complete — is not called while
  // a frame is still being drawn.
  displayResults({
    title: 'Colors',
    results: results,
    type: 'success',
    showFilters: false,
    autoOpen: false
  });
  var notifyMsg = '✅ Colors: ' + stats.created + ' created, ' + stats.updated + ' updated';
  if (showOverview) notifyMsg += '; overview frame';
  figma.notify(notifyMsg);
}

runColors(colorsConfigData).catch(function (error) {
  console.error('Error:', error);
  figma.notify('❌ Error: ' + (error && error.message ? error.message : error));
  displayResults({
    title: 'Colors',
    results: [createResult('Colors failed', String(error && error.message ? error.message : error), 'error')],
    type: 'error',
    showFilters: false
  });
});
