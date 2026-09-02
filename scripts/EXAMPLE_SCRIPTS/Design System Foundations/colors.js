// Colors
// @DOC_START
// # Creates a colour ramp per Variable Mode: separate Hue, Saturation and Lightness curves in HSL; shared Lightness with separate Chroma and Hue in OKLCH
//
// ## Overview
//
// Each mode is a ramp from bright to dark. Edit anchors and the curve in the panel, then **Run** to
// write variables in place.
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
// A hex you already have. It fills the middle anchor's hue and chroma when you enter it under **Hex**.
//
// **Token** decides which step it occupies. That step becomes the middle anchor, so the two segments
// need not be the same length.
//
// **Lock seed color** re-anchors rather than offsets. With it on, the middle anchor becomes the seed's
// own lightness and the ladder is recomputed through it; bright and dark stay fixed. Interior steps may
// drift; the largest deviation is reported beside the field. With the seed on the first or last step
// there is no endpoint left to keep, and the panel says so.
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
// | **Color tokens**<br>`steps` | Step names, lightest to darkest. Variables are created as `group/step`. |
// | **Color model**<br>`colorModel` | **OKLCH** or **HSL**. OKLCH shares lightness steps across modes; HSL matches existing HSL palettes. |
// | **Shared lightness**<br>`curve` | OKLCH only. One lightness curve for every mode, from bright to dark. |
// | **Lightness → Bright / Dark**<br>`lightness.bright` / `lightness.dark` | OKLCH only. Lightness at the two ends (0–100). The shared curve fills everything between. |
// | **Mode**<br>`modes[].name` | Name of this mode. |
// | **Seed color → Hex**<br>`modes[].seed.hex` | Hex that fills the middle anchor's hue and chroma. |
// | **Seed color → Token**<br>`modes[].seed.placement` | Which step the seed occupies (middle of the ramp). Auto when empty. |
// | **Lock seed color**<br>`modes[].seed.lock` | On: seed keeps its value and the ladder re-anchors through it. Off: seed moves to the nearest step. |
// | **Hue curve**<br>`modes[].hueCurve` / `hslHueCurve` | How hue shifts from the light end to the dark end. Separate curves for OKLCH and HSL. |
// | **Hue start / middle / end** | Anchor hues at bright, middle, and dark. |
// | **Chroma curve** / **Saturation curve**<br>`modes[].chromaCurve` / `saturationCurve` | How colourfulness builds between the ends (OKLCH chroma or HSL saturation). |
// | **Chroma / Saturation start / middle / end** | Anchor colourfulness at bright, middle, and dark. |
// | **Lightness curve**<br>`modes[].curve` | HSL only. Per-mode lightness curve from bright to dark. |
// | **Bright / Dark**<br>`modes[].bright.lightness` / `dark.lightness` | HSL only. Lightness at the two ends. |
// @DOC_END

// The Configuration tab redraws this as you type. Pure: it generates in memory and draws the same strips a
// run would write, and cannot change the file on its own.
// @PREVIEW: colorsPreviewHtml

// Package-scoped `@import` (plan 32) follows calls across Design System Foundations members, so
// `@Color Ramp` brings `@OKLCH` / `@Bezier` / `@Math Helpers` without naming them here. Keep
// `@PREVIEW:` entry points and anything this file calls directly. Outside a package, imports still
// do not bring cross-script dependencies — `npm run validate` makes a missing one a build error.

@import { displayResults, createResult } from "@InfoPanel"
@import { getOrCreateCollection, setupModes, processVariables, getVariable } from "@Variables"
@import { namePrefix, resolveCollectionName, resolveGroup, writeManifest, findFoundationSet, foundationModeIds, alignStampedTokens, stampGeneratedTokens, describeStampAlignment } from "@Foundation"
@import { colorsParseSteps, colorsPreviewHtml, colorsBuildVariableMap, colorsManifestSlice } from "@Color Ramp"

// ========================================
// CONFIG
// ========================================

var colorsConfigData = typeof colorsConfigData !== 'undefined' ? colorsConfigData : {
  // @CONFIG_START
// @fromFile: domains.colors

  collectionName: "",
  group: "",
  steps: "",
  colorModel: "hsl",
  curve: [0.333333, 0.333333, 0.666667, 0.666667],
  lightness: {},
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
    { type: "heading", text: "General" },
    { key: "collectionName", type: "collection", label: "Collection" },
    { type: "paragraph", attachTo: "next", text: "These chips are the collection's modes. Add, remove, or rename here. Each chip gets a mode block below." },
    { type: "chips", label: "Collection modes",
      showWhen: { collectionName: "*" } },
    { key: "group", type: "string", label: "Group within collection",
      placeholder: "eg.: Primitives/Neutrals" },
    { key: "steps", type: "string", label: "Color tokens",
      placeholder: "Eg. 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950",
      helper: "Names for each step, lightest to darkest. Variables are created as group/step." },
    { key: "colorModel", type: "radio", label: "Color model",
      options: [{ hsl: "HSL" }, { oklch: "OKLCH" }],
      helper: "OKLCH when every mode should share the same lightness steps. HSL when you are matching a palette that already uses HSL. When to pick each: Documentation." },
    { type: "paragraph", attachTo: "previous", text: "Each end keeps an OKLCH hue and an HSL hue. Both fill when a collection is read, so switching model keeps your anchors." },
    { type: "divider", section: true },
    { type: "heading", text: "OKLCH settings",
      showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" } },
    { type: "paragraph", attachTo: "previous", text: "One lightness curve for every mode. Each mode only sets its own hue and chroma." },
    { type: "paragraph", attachTo: "previous", text: "Name Color tokens first. Mode settings and the ramp appear after that." },
    { type: "paragraph", attachTo: "next", text: "New scales start on Linear. Original means the ramp already in the file, so it stays empty until a collection is read. A read replaces Linear with the fitted curve." },
    { key: "curve", type: "curve", label: "Shared lightness", allowOriginal: true,
      ramp: "oklch($% 0 0)", ends: "lightness.bright..lightness.dark", range: [0, 100],
      showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" },
      helper: "One curve from bright to dark. Drag a handle or pick a preset. Add middle point to bend the two halves differently." },
    { type: "preview" },
    { key: "lightness", type: "group", label: "Lightness",
      showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" },
      helper: "0–100 at the two ends. The curve fills everything between.",
      fields: [
        { key: "bright", type: "number", label: "Bright" },
        { key: "dark", type: "number", label: "Dark" }
      ] },
    { type: "heading", text: "Mode settings", showWhen: { collectionName: "*", steps: "*" } },
    { key: "modes", type: "rows", label: "Modes", layout: "blocks",
      showWhen: { collectionName: "*", steps: "*" },
      columns: [
        { key: "name", type: "text", label: "Mode" },
        { key: "seed", type: "group", label: "Seed color", fields: [
          { key: "hex", type: "text", label: "Hex", placeholder: "eg. #71717A" },
          { key: "placement", type: "text", label: "Token", placeholder: "Auto" },
          { key: "lock", type: "checkbox", label: "Lock seed color",
            helper: "On. Seed keeps its value. The ladder re-anchors through it, endpoints unchanged.\nOff. Seed moves to the nearest step on the ladder." }
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
              { key: "hue", showWhen: { colorModel: "oklch" },
                labels: { bright: "Hue start", middle: "Hue middle", dark: "Hue end" },
                placeholders: "eg. 264" },
              { key: "hslHue", showWhen: { colorModel: "hsl" },
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
                { key: "chroma", showWhen: { colorModel: "oklch" },
                  labels: { bright: "Chroma start", middle: "Chroma middle", dark: "Chroma end" },
                  placeholders: "eg. 0.012" },
                { key: "saturation", showWhen: { colorModel: "hsl" },
                  labels: { bright: "Saturation start", middle: "Saturation middle", dark: "Saturation end" },
                  placeholders: "eg. 12" }
              ] }
        ] },
        { type: "tab", names: [{ text: "Lightness" }], columns: [
          { key: "curve", type: "curve", label: "Lightness curve", allowOriginal: true,
            ramp: "hsl(~bright.hslHue ~bright.saturation% $%)",
            ends: "bright.lightness..dark.lightness", range: [0, 100],
            showWhen: { colorModel: "hsl" },
            helper: "One curve from bright to dark. Drag a handle or pick a preset. Add middle point to bend the two halves differently." },
          { type: "anchors", positions: ["bright", "dark"],
            notes: { dark: "Anchors take effect once you choose a curve." },
            fields: [
              { key: "lightness", showWhen: { colorModel: "hsl" },
                labels: { bright: "Bright", dark: "Dark" },
                placeholders: { bright: "eg. 98", dark: "eg. 4" } }
            ] }
        ] },
        { type: "preview" }
      ] }
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
 * overwritten — an alias is a deliberate link, and an alpha value is not a lightness step.
 */
async function colorsApplyWriteGuards(collection, built) {
  var skippedAlias = [];
  var skippedAlpha = [];
  if (!collection) {
    return { variables: built.variables, skippedAlias: skippedAlias, skippedAlpha: skippedAlpha };
  }
  var variables = {};
  var names = Object.keys(built.variables);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var entry = built.variables[name];
    var existing = await getVariable(collection, name);
    var values = {};
    var modeNames = Object.keys(entry.values || {});
    for (var m = 0; m < modeNames.length; m++) {
      var modeName = modeNames[m];
      var hex = entry.values[modeName];
      if (!existing) {
        values[modeName] = hex;
        continue;
      }
      var mode = collection.modes.filter(function (mm) { return mm.name === modeName; })[0];
      if (!mode) {
        values[modeName] = hex;
        continue;
      }
      var cell = existing.valuesByMode[mode.modeId];
      if (cell && cell.type === 'VARIABLE_ALIAS') {
        skippedAlias.push(name + ' · ' + modeName);
        continue;
      }
      if (cell && typeof cell.a === 'number' && cell.a < 1) {
        skippedAlpha.push(name + ' · ' + modeName);
        continue;
      }
      values[modeName] = hex;
    }
    if (Object.keys(values).length > 0) {
      variables[name] = { type: 'COLOR', values: values };
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
  results.push(createResult(
    names.length + ' colour variables · ' + built.modeNames.length + ' modes',
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

async function runColors(config) {
  var data = config || {};
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
  var built = colorsBuildVariableMap(data);
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

  var guards = await colorsApplyWriteGuards(collection, built);
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
    stats.created + ' created, ' + stats.updated + ' updated, ' + stats.skipped + ' skipped',
    'Collection: ' + collection.name +
      (manifest && manifest.ok ? '; set recorded' : ''),
    'success'
  ));
  displayResults({
    title: 'Colors',
    results: results,
    type: 'success',
    showFilters: false,
    autoOpen: false
  });
  figma.notify('✅ Colors: ' + stats.created + ' created, ' + stats.updated + ' updated');
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
