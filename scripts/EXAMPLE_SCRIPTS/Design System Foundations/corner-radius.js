// Corner radius
// @DOC_START
// A corner-radius scale, one per mode.
//
// ## Overview
// Creates FLOAT variables with the **`CORNER_RADIUS`** scope only, so a binding offers itself in a corner
// field and not in width or gap. No canvas frames unless you ask for the overview.
//
// **Each mode carries its own scale**: `bezier` (a ramp along a curve you draw), `metric` (a step that
// grows every N tokens) or `fibonacci` (each step the sum of the two before it). `base` is the value of the
// first *generated* token and `roundTo` is the mode's own grid, so a 4px desktop scale and a 2px mobile one
// are the ordinary case rather than a compromise.
//
// **A bezier scale ramps from `base` to `max` along a curve, in log space.** Straight, that is a constant
// ratio between steps — a modular scale, exactly. Bend it and the ratio varies across the scale, which is
// how a radius set stays tight at the small end without flattening at the large one. Drag the handles, pick
// a preset, or paste `cubic-bezier(…)`; **Add middle point** gives the two halves separate shapes.
//
// `modular` is still accepted in a config and generates precisely what it always generated.
//
// **`none` is an extra value, not a special case.** Put `0` in Extra values and it fills the smallest
// token name; the scale then takes over from the base. Extras merge into the pool by value, so the number
// of tokens is the number of names — add an extra without adding a name and the largest generated value
// falls off the end of the list.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | collectionName | Figma variable collection (e.g. `Responsive System`). |
// | group | Variable name prefix folder (e.g. `Corner radius` → `Corner radius/md`). |
// | radii | Ordered token names, smallest to largest. A series works: `radius-{1,10}` is ten of them, and it mixes with names you write — `none, xs, radius-{1,6}`. |
// | modes | Per mode: `scaleType`, `max`/`curve` or `step`/`mod`, `base`, `roundTo`, `extras`. |
// | generateOverview | Optional boolean (default `false`). When `true`, builds a **Corner radius — overview** frame (token rows × mode columns, variable-bound swatches). Uses `@Foundation overview`. |
// | (output) | Variables use `scopes: ['CORNER_RADIUS']`. |
//
// ## The older shape still runs
// A config written before the panel keeps working and generates what it always generated: per-mode
// `min`/`max` with `base: { level, size }`, a top-level `roundTo`, and a `scaling` curve. Those keys have
// no controls now; nothing else about them changed.
//
// | Legacy option | Description |
// |--------|-------------|
// | modes[].min / max / base | `{ name, min, max }` per viewport; optional `base: { level, size }` — if omitted, defaults to `md` and a size derived from min/max. |
// | radii (string) + steps | A name template used with `steps`, e.g. `"radius-{$step}"` → `radius-1` … `radius-N`. Placeholders: `{$index}` (0-based), `{$index1}` / `{$step}` (1-based), `{$steps}`. |
// | scaling.type | Range curve: linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio. **Piecewise:** `piecewise`, `piecewise2`, `piecewise4` — snapped ramp; single segment `min`→`max` over all tokens. |
// | scaling.rangeMode | `full` — one ramp `min`→`max` over all tokens. `twoSegment` — `min`→`base`→`max`. Omitted: `full`. |
// | scaling.ease | Applied to the curve. **`ease` is ignored when `type === 'linear'`**; use a non-linear type if you want easing. |
// | scaling.roundTo | Snap every value to a multiple of this. Legacy aliases: `roundUpperValuesTo`, and `fontScaling` for the whole curve object. |
// @DOC_END

// The Configuration tab redraws this as you type. Pure: it generates in memory and draws
// the same table the run does, so it cannot write anything.
// @PREVIEW: radiusPreviewHtml

@import { getCollection, getOrCreateCollection, setupModes, extractModes, processVariables } from "@Variables"
@import { foundationCreateCornerRadiusOverview } from "@Foundation overview"
@import { viewportLabel, namePrefix, resolveCollectionName, resolveGroup, registryViewportLabels, writeManifest, readManifest, findFoundationSet, normaliseConfig, foundationModeIds, expandTokenList, tokenListHasSeries, alignStampedTokens, stampGeneratedTokens, describeStampAlignment } from "@Foundation"
@import { generateScale, isPiecewiseScaleType, snapScaleGrid } from "@Math Helpers"
@import { displayResults, createResult } from "@InfoPanel"
@import { scaleSequence, resolveModularRatio } from "@Scale Models"
@import { bezierAt } from "@Bezier"
@import { radiusRampSpec, radiusPreviewHtml, ensureCompatRampConfig, materialiseRampTokens, materialiseRampSizes, validateRampScalingType, generateRampVariables, runLinearRamp } from "@Linear Ramp"

// ========================================
// CONFIG
//
// The generator lives in `@Linear Ramp`; this file is the config and the overview call. Paste a
// config into the block below exactly as before — it is still the only thing that decides what a
// run produces.
// ========================================

var cornerRadiusConfigData = typeof cornerRadiusConfigData !== 'undefined' ? cornerRadiusConfigData : {
  // @CONFIG_START
  // @fromFile: domains.radius

  // # General
  collectionName: "Responsive System", // @collection @label: Collection
  // @collectionModes: Collection modes
  group: "Corner radius", // @label: Group within collection @placeholder="eg.: Corner radius"
  radii: ["none", "xs", "sm", "md", "lg", "xl"], // @label: Tokens @helper: Named smallest to largest, and radius-{1,10} is a series of ten. 

  // --- @section

  // # Mode settings
  generateOverview: false, // @label: Generate overview @helper: Builds the Corner radius overview frame
  modes: [
    {
      name: "Value",
      scaleType: "bezier",
      base: 4,
      ratio: 1.5,
      curve: [],
      step: 4,
      mod: 3,
      roundTo: 2,
      extras: [0]
    }
  ], // @rows: name:text=Mode|scaleType:radio(bezier:Bezier scale|metric:Metric scale|fibonacci:Fibonacci)=Scale type|curve:curve(growth:ratio){scaleType=bezier}=Scale @helper: Drag the end handle to set how fast the scale grows — the largest value comes out of that and the number of tokens, so adding a token extends the scale instead of squeezing it. Add shape bends the growth: tighter at the small end, looser at the top.|step:number{scaleType=metric|fibonacci}=Step @helper: Metric. The amount each step adds, before it starts growing.\nFibonacci. The first increment — the sequence is the base, the base plus this, then each value the sum of the two before it.|mod:number{scaleType=metric}=Every N steps @helper: How often the step grows. With a step of 4 and a value of 3 the increments run 4, 4, 4, 8, 8, 8, 12 — which is the ladder a design system doc actually writes down.|base:number=Base unit|roundTo:number=Round numbers to|extras:list=Extra values @helper: Values that are not part of the scale, merged in by size. Put a 0 here for a `none` token: it fills the smallest name and the scale takes over above it, so `none` needs no special case. @tabs @label: Modes

  // # Preview
  // @preview
  // @CONFIG_END
};


var cornerRadiusConfig = typeof cornerRadiusConfig !== 'undefined' ? cornerRadiusConfig : {
  collectionName: resolveCollectionName(cornerRadiusConfigData),
  group: resolveGroup(cornerRadiusConfigData),
  config: cornerRadiusConfigData
};

function resolveRadiusGenerateOverview(config) {
  if (!config || typeof config !== 'object') return false;
  if (config.generateOverview === true) return true;
  var inner = config.config;
  if (inner && typeof inner === 'object' && inner.generateOverview === true) return true;
  return false;
}

// ========================================
// EXECUTION
// ========================================

runLinearRamp(cornerRadiusConfig, radiusRampSpec())
  .then(async function (result) {
    var showOverview = resolveRadiusGenerateOverview(cornerRadiusConfig);
    if (showOverview) {
      await foundationCreateCornerRadiusOverview(result.collection, cornerRadiusConfig.config || cornerRadiusConfigData);
    }
    var msg = '✅ Corner radius: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' updated';
    if (showOverview) msg += '; overview frame';
    if (result.manifest && result.manifest.ok) msg += '; set recorded';
    figma.notify(msg);

    // After the overview, so `displayResults` — which is what reports the run complete — is not
    // called while there is still a frame being drawn.
    // **No scale table here.** The Configuration tab already draws it, live, from the same generator — so
    // repeating it in the results was the same numbers twice, and the second copy went stale the moment
    // anything was edited. What is left is what a run has to say that the panel cannot: what it wrote.
    var results = [];
    if (result.undeclaredModes) results.push(createResult('Modes this run did not write', result.undeclaredModes, 'info'));
    results.push(createResult(
      result.stats.created + ' created, ' + result.stats.updated + ' updated, ' + result.stats.skipped + ' skipped',
      'Collection: ' + (result.collection ? result.collection.name : '—'),
      'success'
    ));
    displayResults({ title: 'Corner radius', results: results, type: 'success', showFilters: false });
  })
  .catch(function (error) {
    console.error('Error:', error);
    figma.notify('❌ Error: ' + error.message);
  });
