// Colors
// @DOC_START
// Generates a colour ramp per mode from three anchors and a curve, in OKLCH or HSL.
//
// ## The shape of it
// A **lightness ladder** is three anchors — bright, middle, dark — with a curve between them, and it is
// **shared by every mode in the script**. Each mode then supplies only its own hue and chroma. That is what
// makes two modes read as the same tone under a greyscale filter: they match on **lightness, not colour**,
// and `Moss 200` and `Granite 200` sit at the same L with different hue and chroma.
//
// In **HSL** there is no shared ladder — a mode's own three anchors are its ladder, and the curve is per
// mode, because an HSL curve is legitimately per hue. The *Color model* radio switches between the two.
//
// ## Which model to generate in
//
// **OKLCH to generate. HSL to read what is already there.** This is not a preference; HSL cannot express a
// full ramp smoothly, and the reason is arithmetic rather than taste.
//
// HSL's saturation is a *fraction of the colour available at that lightness*, so the colourfulness a step
// actually carries is `C = S x (1 - |2L - 1|)`. That envelope is two straight lines meeting at **L = 50%**,
// and `|2L - 1|` has a corner there. Measured with the colour held flat and the lightness on one smooth
// cubic — no join anywhere in the curve — the second difference of chroma runs ±4 across the whole ramp
// and **-25 and -20 at the two steps either side of the crossing**. Every ramp that goes from near-white to
// near-black crosses it.
//
// The same measurement in OKLCH: ±3 the whole way, and no crossing artefact at all. Its one irregularity is
// at the extreme bright end, where the sRGB gamut runs out and chroma is clipped — the gamut's doing, not
// the model's, and it happens where there is almost no colour left to lose.
//
// Neither anchor choice escapes it in HSL. With ends at near-white and near-black the absolute chroma there
// is almost nothing, so interpolating `C` gives a ramp duller than the file and interpolating `S` gives the
// cusp. That is why the panel offers both and reads in both: a collection authored in HSL is read back
// faithfully, and a collection being *made* should be made in OKLCH.
//
// ## Seed color
// A hex you already have. It fills the **Middle** anchor's hue and chroma once, when you enter it, and then
// gets out of the way — the workflow is *place a colour, generate a scale from it, then adjust the scale*.
// **Token placement** decides which step it occupies, and that step becomes the middle anchor, so the two
// segments need not be the same length.
//
// **Lock seed** re-anchors rather than offsets. With it on, the middle anchor becomes the seed's own
// lightness and the ladder is recomputed through it; bright and dark are untouched, so the endpoints still
// match the shared ladder exactly. The cost is that interior steps drift, and the largest deviation is
// reported beside the field, because that number is the whole decision. With the seed *on* the first or last
// step there is no endpoint left to keep, and the panel says so.
//
// ## Two things about colour that are not obvious
// - **Chroma is reduced per step to stay inside sRGB, and L and hue never move.** That is the only fit that
//   keeps a step on its ladder, so there is no setting for it. Every reduction is reported — `C→` under the
//   swatch, and a line in the run log.
// - Very saturated colours read slightly brighter than their lightness suggests (Helmholtz–Kohlrausch).
//   Not a concern for the near-neutral ramps this is for, and worth knowing before you chase it.
// - Stored RGB values are treated as **sRGB**.
//
// ## Reading a collection you already have
// Point *Collection* and *Group* at an existing set and the panel fills itself from it: the steps from the
// variable names, and hue, chroma and the lightness anchors from the real first, middle and last values.
//
// **It does not guess a curve.** An existing ramp is a list of colours with no record of how it was made,
// and a hand-made one may sit on no curve at all — so the curve stays on *Original* and the panel draws what
// is in the file *underneath* what it would generate, with the lightness gap per step. That comparison is the
// honest version of a fit, and it is the only place you can see whether a collection you already have sits on
// the ladder.
//
// ## The curve
// Two anchors and two handles, dragged, arrow-keyed, chosen from a preset list, or pasted as
// `cubic-bezier(…)`. **Add middle point** makes it three anchors and two segments, so the half above the
// middle can bend differently from the half below — which is what a measured neutral ramp actually does. The
// coordinates are the whole of it: there is no family name stored beside them, so the preview cannot show
// one curve while the run generates another.
//
// What it will not touch:
// - **An aliased variable is read through to its value and never written.** An alias is a deliberate
//   indirection and replacing it with a raw value breaks a link silently.
// - **A non-opaque variable is reported and skipped**, never composited over an assumed background to get a
//   lightness, and never overwritten with an opaque value.
// - A **group where more than half the variables are non-opaque** is an alpha ramp, not a lightness ramp.
//   The panel declines it in one line rather than itemising every skip.
// - **A step leaving the token list is reported as an orphan and left alone.** Variables are never deleted
//   or renamed because a step list shrank — update-in-place is the only regeneration that keeps bindings.
//
// ## Writing
// The strip in the panel is the preview — edit and look. **Run** writes: colour variables updated in
// place, stamped, and the set recorded — the same bracket Spacing and Radius use. Aliases, non-opaque
// cells and orphans are reported, never removed.
// @DOC_END

// The Configuration tab redraws this as you type. Pure: it generates in memory and draws the same strips a
// run would write, and cannot change the file on its own.
// @PREVIEW: colorsPreviewHtml

// `@Color Ramp` and `@OKLCH` both, and `@Math Helpers` under them: **imports do not bring cross-script
// dependencies.** `colorsGenerateMode` arrives here as text and its calls resolve in *this* context, so
// everything it reaches for has to be named here too. `npm run validate` makes that a build error rather
// than a ReferenceError swallowed by a caller's try/catch.
@import { displayResults, createResult } from "@InfoPanel"
@import { getOrCreateCollection, setupModes, processVariables, getVariable } from "@Variables"
@import { namePrefix, resolveCollectionName, resolveGroup, writeManifest, findFoundationSet, foundationModeIds, alignStampedTokens, stampGeneratedTokens, describeStampAlignment } from "@Foundation"
@import { bezierAt, bezierNormalise, bezierFromEase, bezierWithMiddle, bezierWithoutMiddle, bezierParse, bezierFormat, bezierEaseName, bezierJoin, bezierSplit, bezierThrough, bezierFitRamp } from "@Bezier"
@import { oklchFromHex, oklchHslFromHex, oklchNormaliseHex, oklchClamp01, oklchLadder, oklchNearestStep, oklchReanchor, oklchRamp, oklchCompare, oklchDistance, oklchToHex, oklchHslToHex } from "@OKLCH"
@import { colorsPlaceholderSteps, colorsParseSteps, colorsLightnessAnchors, colorsNumber, colorsMidIndex, colorsChannel, colorsCurve, colorsFitCurve, colorsFitChromaCurve, colorsFitHueCurve, colorsBestAnchor, colorsAnchorFits, colorsSharedLadder, colorsLightnessOf, colorsGenerateMode, colorsPreviewHtml, colorsAnchorStrip, colorsCard, colorsChangeCaption, colorsStrip, colorsAlignment, colorsTolerance, colorsEscapeHtml, colorsPct, colorsBuildVariableMap, colorsManifestSlice } from "@Color Ramp"

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

// @PANEL_START
// {
//   blocks: [
//     { type: "heading", text: "General" },
//     { key: "collectionName", type: "collection", label: "Collection" },
//     { type: "paragraph", attachTo: "next", text: "The collection's own modes. The chips are the mode list — a read fills them, and there is one mode block below per chip, in chip order. Removing and renaming happen here, which is why a block carries neither." },
//     { type: "chips", label: "Collection modes",
//       showWhen: { collectionName: "*", steps: "*" } },
//     { key: "group", type: "string", label: "Group within collection",
//       placeholder: "eg.: Primitives/Neutrals" },
//     { key: "steps", type: "string", label: "Color tokens",
//       placeholder: "Eg. 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950",
//       helper: "Named lightest to darkest, and the only source for token placement below. The variables are <group>/<step>." },
//     { key: "colorModel", type: "radio", label: "Color model",
//       options: [{ hsl: "HSL" }, { oklch: "OKLCH" }],
//       helper: "OKLCH to generate, HSL to read. OKLCH shares one lightness ladder across every mode, which is what makes them match in greyscale. HSL keeps a curve per mode — and its colourfulness envelope, S x (1 - |2L - 1|), has a corner at 50% lightness that every full ramp crosses. See the Documentation tab." },
//     { type: "paragraph", attachTo: "previous", text: "Each anchor keeps a hue for both models: OKLCH's is a perceptual angle, HSL's is where the maximum channel sits, and on a near-neutral ramp the two disagree by more than 30°. Both are filled when the panel reads a collection, so switching model loses nothing." },
//     { type: "divider", section: true },
//     { type: "heading", text: "OKLCH settings",
//       showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" } },
//     { type: "paragraph", attachTo: "previous", text: "The same curve editor a mode has, at collection scope: the ladder is shared, so the curve belongs to the collection rather than to one of its modes — **one curve for every mode**, which is what makes the modes match in greyscale." },
//     { type: "paragraph", attachTo: "previous", text: "**Nothing below General until there are tokens.** Choosing a collection sets a read going — modes are fetched, blocks are added, the block is rewritten — and every one of those rebuilds the form. With the mode settings on screen that reads as flicker and a jumping layout, over a panel that cannot say anything useful yet: a collection with no token list has no ramp to show. Naming the tokens is the point at which there is something to draw, so it is the point at which the rest appears." },
//     { type: "paragraph", attachTo: "next", text: "**A new scale starts Linear, not Original.** *Original* means \"the ramp already in the file\", so on a collection that has no ramp yet it names nothing — an empty editor and a preview with no line in it. Linear is the honest starting point: an even ladder between the two ends, which is a thing you can see and then bend. A read replaces it with the curve fitted to what the file actually holds." },
//     { key: "curve", type: "curve", label: "Shared lightness", allowOriginal: true,
//       ramp: "oklch($% 0 0)", ends: "lightness.bright..lightness.dark", range: [0, 100],
//       showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" },
//       helper: "One curve, bright to dark. Drag a handle, pick a preset, or paste coordinates. Add middle point bends the two halves differently — which is what a real neutral ramp does — and that anchor is the middle colour's lightness and its step." },
//     { type: "preview" },
//     { key: "lightness", type: "group", label: "Lightness",
//       showWhen: { colorModel: "oklch", collectionName: "*", steps: "*" },
//       helper: "0 to 100. The two ends hold exactly; the curve fills everything between them.",
//       fields: [
//         { key: "bright", type: "number", label: "Bright" },
//         { key: "dark", type: "number", label: "Dark" }
//       ] },
//     { type: "heading", text: "Mode settings", showWhen: { collectionName: "*", steps: "*" } },
//     { key: "modes", type: "rows", label: "Modes", layout: "blocks",
//       showWhen: { collectionName: "*", steps: "*" },
//       columns: [
//         { key: "name", type: "text", label: "Mode" },
//         { key: "seed", type: "group", label: "Seed color", fields: [
//           { key: "hex", type: "text", label: "Hex", placeholder: "eg. #71717A" },
//           { key: "placement", type: "text", label: "Token", placeholder: "Auto" },
//           { key: "lock", type: "checkbox", label: "Lock seed color",
//             helper: "On. Seed keeps its value. The ladder re-anchors through it, endpoints unchanged.\nOff. Seed moves to the nearest step on the ladder." }
//         ] },
//         { type: "tab", names: [{ text: "Hue" }], columns: [
//           { key: "hueCurve", type: "curve", label: "Hue curve", overshoot: true,
//             ramp: "oklch(70% ~bright.chroma $)",
//             ends: "bright.hue..middle.hue..dark.hue", range: [0, 360],
//             showWhen: { colorModel: "oklch" },
//             helper: "How the hue travels between the ends. Worth least on a cool palette and most on a warm one — amber crosses 49 degrees and needs its own timing. Empty on a near-grey, where a measured hue is rounding rather than a value." },
//           { key: "hslHueCurve", type: "curve", label: "Hue curve", overshoot: true,
//             ramp: "hsl($ ~bright.saturation% 50%)",
//             ends: "bright.hslHue..middle.hslHue..dark.hslHue", range: [0, 360],
//             showWhen: { colorModel: "hsl" },
//             helper: "The same, for HSL — a different angle from OKLCH's, so a different curve." },
//           { type: "anchors", positions: ["bright", "middle", "dark"],
//             fields: [
//               { key: "hue", showWhen: { colorModel: "oklch" },
//                 labels: { bright: "Hue start", middle: "Hue middle", dark: "Hue end" },
//                 placeholders: "eg. 264" },
//               { key: "hslHue", showWhen: { colorModel: "hsl" },
//                 labels: { bright: "Hue start", middle: "Hue middle", dark: "Hue end" },
//                 placeholders: "eg. 264" }
//             ] }
//         ] },
//         { type: "tab",
//           names: [
//             { text: "Saturation", showWhen: { colorModel: "hsl" } },
//             { text: "Chroma", showWhen: { colorModel: "oklch" } }
//           ],
//           columns: [
//             { key: "chromaCurve", type: "curve", label: "Chroma curve", overshoot: true,
//               ramp: "oklch(70% $ ~bright.hue)",
//               ends: "bright.chroma..middle.chroma..dark.chroma", range: [0, 0.4],
//               showWhen: { colorModel: "oklch" },
//               helper: "How fast the colour arrives, as opposed to the lightness. A designed palette usually rises to its most colourful step and falls, on its own timing." },
//             { key: "saturationCurve", type: "curve", label: "Saturation curve", overshoot: true,
//               ramp: "hsl(~bright.hslHue $% 50%)",
//               ends: "bright.saturation..middle.saturation..dark.saturation", range: [0, 100],
//               showWhen: { colorModel: "hsl" },
//               helper: "The same, for HSL. Saturation and chroma are different quantities, so they carry different curves and a read fits both — switching model keeps whichever one it is switching to." },
//             { type: "anchors", positions: ["bright", "middle", "dark"],
//               fields: [
//                 { key: "chroma", showWhen: { colorModel: "oklch" },
//                   labels: { bright: "Chroma start", middle: "Chroma middle", dark: "Chroma end" },
//                   placeholders: "eg. 0.012" },
//                 { key: "saturation", showWhen: { colorModel: "hsl" },
//                   labels: { bright: "Saturation start", middle: "Saturation middle", dark: "Saturation end" },
//                   placeholders: "eg. 12" }
//               ] }
//         ] },
//         { type: "tab", names: [{ text: "Lightness" }], columns: [
//           { key: "curve", type: "curve", label: "Lightness curve", allowOriginal: true,
//             ramp: "hsl(~bright.hslHue ~bright.saturation% $%)",
//             ends: "bright.lightness..dark.lightness", range: [0, 100],
//             showWhen: { colorModel: "hsl" },
//             helper: "One curve, bright to dark. Drag a handle, pick a preset, or paste coordinates. Add middle point bends the two halves differently — which is what a real neutral ramp does — and that anchor is the middle colour's lightness and its step." },
//           { type: "anchors", positions: ["bright", "dark"],
//             notes: { dark: "Anchors take effect once you choose a curve." },
//             fields: [
//               { key: "lightness", showWhen: { colorModel: "hsl" },
//                 labels: { bright: "Bright", dark: "Dark" },
//                 placeholders: { bright: "eg. 98", dark: "eg. 4" } }
//             ] }
//         ] },
//         { type: "preview" }
//       ] }
//   ]
// }
// @PANEL_END
};

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
