// Spacing
// @DOC_START
// Responsive spacing scale with range-first scaling (min → base → max per viewport).
//
// ## Overview
// Creates FLOAT variables only (no preview frames). **Range layout:** **`scaling.rangeMode`** selects (1) **`full`** (default when omitted) — one ramp from each mode’s **`min` → `max`** across all tokens (`t = index / (lastIndex)`), with **`scaling.type`** / **`scaling.ease`** reshaping progress along that ramp — or (2) **`twoSegment`** — **`min` → `base` → `max`** in two segments (typography-style), with easing applied **within each** segment. Use **`twoSegment`** when you anchor a middle token; otherwise omit for a single eased ramp over the full range. One **`roundTo`** grid applies to every step. Variables use **`WIDTH_HEIGHT`** and **`GAP`**.
//
// ## The scale per mode
// **Each mode carries its own scale**: `bezier` (a ramp along a curve you draw), `metric` (a step that
// grows every N tokens) or `fibonacci` (each step the sum of the two before it).
//
// A **bezier** scale ramps from `base` to `max` along a curve, in log space. Straight, that is a constant
// ratio between steps — a modular scale, exactly. Bend it and the ratio varies across the scale, which is
// what lets a spacing set stay tight at 4, 8, 12 and still open out at the top. Drag the handles, pick a
// preset, or paste `cubic-bezier(…)`; **Add middle point** gives the two halves separate shapes.
//
// `modular` is still accepted in a config and generates precisely what it always generated.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | collectionName | Figma variable collection (e.g. `Responsive System`). |
// | group | Variable name prefix folder (e.g. `Spacing` → `Spacing/md`). |
// | spacings | **Either** an ordered array of token names (smallest → largest), e.g. `["px","xs","sm",…]` — `base.level` must match one entry — **or** a **string template** used with **`steps`** to generate names, e.g. `"spacings-{$step}"` → `spacings-1` … `spacings-N`. Placeholders: `{$index}` (0-based), `{$index1}` / `{$step}` (1-based), `{$steps}` (total count). |
// | steps | Required with the **string** form of **`spacings`**: positive integer = number of tokens. If **`spacings`** is omitted, `[]`, or only whitespace, **`steps`** alone fills names using the default pattern `space-{$index}`. Ignored when **`spacings`** is a non-empty **array**. |
// | modes | `{ name, min, max }` per viewport; optional `base: { level, size }` — if omitted, defaults to `md` and a size derived from min/max. |
// | scaling.type | Range curve: linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio. **Piecewise:** `piecewise`, `piecewise2`, `piecewise4` — snapped Carbon-like ramp (see [Carbon spacing](https://carbondesignsystem.com/elements/spacing/overview/)); single segment `min`→`max` over all tokens. |
// | scaling.rangeMode | `full` — single ramp `min`→`max` over all tokens. `twoSegment` — `min`→`base`→`max` (typography-style). **Omitted (auto):** `full` (all curve types). Set `twoSegment` explicitly for the split ramp. |
// | scaling.ease | Applied to the curve (`getEasedFactor`). **Note:** in `@Math Helpers`, **`ease` is ignored when `type === 'linear'`** (output equals `t`); use a non-linear `type` if you want easing. **Piecewise:** use `ease: "none"`; easing does not reshape the piecewise ladder (tabular generator). |
// | fontScaling | Optional alias; merged into `scaling` when set. |
// | scaling.roundTo | Snap all spacing values to multiples of this number (e.g. `2` → 2, 4, 6, …). Omit or `0` for no snapping. Legacy: `roundUpperValuesTo` is accepted as an alias for `roundTo`. |
// | (output) | Variables use `scopes: ['WIDTH_HEIGHT', 'GAP']`. |
// | generateOverview | Optional boolean (default `false`). When `true`, builds a **Spacing — overview** frame (token rows × mode columns, variable-bound width bars). Uses `@Foundation overview`. |
// @DOC_END

// The Configuration tab redraws this as you type. Pure: it generates in memory and draws
// the same table the run does, so it cannot write anything.
// @PREVIEW: spacingPreviewHtml

@import { getCollection, getOrCreateCollection, setupModes, extractModes, processVariables } from "@Variables"
@import { foundationCreateSpacingOverview } from "@Foundation overview"
@import { viewportLabel, namePrefix, resolveCollectionName, resolveGroup, registryViewportLabels, writeManifest, readManifest, findFoundationSet, normaliseConfig, foundationModeIds, expandTokenList, tokenListHasSeries, alignStampedTokens, stampGeneratedTokens, describeStampAlignment } from "@Foundation"
@import { generateScale, isPiecewiseScaleType, snapScaleGrid } from "@Math Helpers"
@import { displayResults, createResult } from "@InfoPanel"
@import { scaleSequence, resolveModularRatio } from "@Scale Models"
@import { bezierAt } from "@Bezier"
@import { spacingRampSpec, spacingPreviewHtml, ensureCompatRampConfig, materialiseRampTokens, materialiseRampSizes, validateRampScalingType, generateRampVariables, runLinearRamp } from "@Linear Ramp"

// ========================================
// CONFIG
//
// The generator lives in `@Linear Ramp`; this file is the config and the overview call. Paste a
// config into the block below exactly as before — it is still the only thing that decides what a
// run produces.
// ========================================

var spacingConfigData = typeof spacingConfigData !== 'undefined' ? spacingConfigData : {
  // @CONFIG_START
  // @fromFile: domains.spacing

  // # General
  collectionName: "Responsive System", // @collection @label: Collection
  // @collectionModes: Collection modes
  group: "Spacing", // @label: Group within collection @placeholder="eg.: Spacing"
  spacings: ["px", "xs", "sm", "md", "lg", "xl"], // @label: Tokens @helper: Named smallest to largest, and spacing-{1,10} is a series of ten. 

  // --- @section

  // # Mode settings
  generateOverview: false, // @label: Generate overview @helper: Generate Figma frames for each mode

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
      extras: [1]
    }
  ], // @rows: name:text=Mode|scaleType:radio(bezier:Bezier scale|metric:Metric scale|fibonacci:Fibonacci)=Scale type|curve:curve(growth:ratio){scaleType=bezier}=Scale @helper: Drag the end handle to set how fast the scale grows — the largest value comes out of that and the number of tokens, so adding a token extends the scale instead of squeezing it. Add shape bends the growth: tighter at the small end, looser at the top.|step:number{scaleType=metric|fibonacci}=Step @helper: Metric. The amount each step adds, before it starts growing.\nFibonacci. The first increment — the sequence is the base, the base plus this, then each value the sum of the two before it.|mod:number{scaleType=metric}=Every N steps @helper: How often the step grows. With a step of 4 and a value of 3 the increments run 4, 4, 4, 8, 8, 8, 12 — which is the ladder a design system doc actually writes down.|base:number=Base unit|roundTo:number=Round numbers to|extras:list=Extra spacings @helper: Values that are not part of the scale, merged in by size — a 1px hairline below a base of 4. They fill the smallest token names and the scale takes over above them, so an extra without an extra token name pushes the largest generated value off the end of the list. @tabs @label: Modes

  // # Preview
  // @preview
  // @CONFIG_END
};


var spacingConfig = typeof spacingConfig !== 'undefined' ? spacingConfig : {
  collectionName: resolveCollectionName(spacingConfigData),
  group: resolveGroup(spacingConfigData),
  config: spacingConfigData
};

function resolveSpacingGenerateOverview(config) {
  if (!config || typeof config !== 'object') return false;
  if (config.generateOverview === true) return true;
  var inner = config.config;
  if (inner && typeof inner === 'object' && inner.generateOverview === true) return true;
  return false;
}

// ========================================
// EXECUTION
// ========================================

runLinearRamp(spacingConfig, spacingRampSpec())
  .then(async function (result) {
    var showOverview = resolveSpacingGenerateOverview(spacingConfig);
    if (showOverview) {
      await foundationCreateSpacingOverview(result.collection, spacingConfig.config || spacingConfigData);
    }
    var msg = '✅ Spacing: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' updated';
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
    displayResults({ title: 'Spacing', results: results, type: 'success', showFilters: false });
  })
  .catch(function (error) {
    console.error('Error:', error);
    figma.notify('❌ Error: ' + error.message);
  });
