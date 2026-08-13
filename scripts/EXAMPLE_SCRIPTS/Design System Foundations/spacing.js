// Spacing
// @DOC_START
// # Spacing
// Responsive spacing scale with range-first scaling (min → base → max per viewport).
//
// ## Overview
// Creates FLOAT variables only (no preview frames). **Range layout:** **`scaling.rangeMode`** selects (1) **`full`** (default when omitted) — one ramp from each mode’s **`min` → `max`** across all tokens (`t = index / (lastIndex)`), with **`scaling.type`** / **`scaling.ease`** reshaping progress along that ramp — or (2) **`twoSegment`** — **`min` → `base` → `max`** in two segments (typography-style), with easing applied **within each** segment. Use **`twoSegment`** when you anchor a middle token; otherwise omit for a single eased ramp over the full range. One **`roundTo`** grid applies to every step. Variables use **`WIDTH_HEIGHT`** and **`GAP`**.
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
@import { viewportLabel, namePrefix, resolveCollectionName, resolveGroup, registryViewportLabels, writeManifest, normaliseConfig } from "@Foundation"
@import { generateScale, isPiecewiseScaleType, snapScaleGrid } from "@Math Helpers"
@import { displayResults, createResult, createHtmlResult } from "@InfoPanel"
@import { scaleSequence, resolveModularRatio } from "@Scale Models"
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
  // Where this goes, and what exists. Pick a collection in this file, or choose "New collection" and
  // type a name — a name that is not in this file is created on Run.
  collectionName: "Responsive System", // @collection @label: Collection
  // @collectionModes: Collection modes
  // The collection's own modes. The chips are a view of the file; the tabs below hold each mode's scale.
  group: "Spacing", // @label: Group within collection @placeholder="eg.: Spacing"
  spacings: ["px", "xs", "sm", "md", "lg", "xl"], // @label: Tokens @helper: Named smallest to largest. Extra spacings below fill the smallest names, and the scale takes over from there.

  // --- @section

  // # Mode settings
  generateOverview: false, // @label: Generate overview @helper: Fills the Spacing — overview section in Design System Foundations
  // Each mode's own scale. `metric` is a base plus a step that grows every N tokens — the way a spacing
  // scale is usually written down. `modular` is a fixed ratio; `fibonacci` is each step the sum of the
  // two before it, which lands on whole numbers where a 1.618 ratio needs rounding at every step.
  //
  // These three generate exactly what this script has always generated: `1, 4, 8, 12, 16, 24` on
  // desktop, and the same shape halved and quartered below it. The spelling is the panel's; the numbers
  // are unchanged.
  modes: [
    {
      name: "desktop",
      scaleType: "metric",
      base: 4,
      step: 4,
      mod: 3,
      roundTo: 2,
      extras: [1]
    },
    {
      name: "tablet",
      scaleType: "metric",
      base: 3,
      step: 3,
      mod: 3,
      roundTo: 2,
      extras: [1]
    },
    {
      name: "mobile",
      scaleType: "metric",
      base: 2,
      step: 2,
      mod: 3,
      roundTo: 2,
      extras: [1]
    }
  ], // @rows: name:text=Mode|scaleType:(modular|metric|fibonacci)=Scale type|ratio:(1.067|1.125|1.2|1.25|1.333|1.414|1.5|1.618){scaleType=modular}=Scaling method|base:number=Base unit|step:number{scaleType=metric|fibonacci}=Step|mod:number{scaleType=metric}=Every N steps|roundTo:number=Round numbers to|extras:list=Extra spacings @tabs @label: Modes

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
    var results = [createHtmlResult(result.scaleHtml, null, 'info')];
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
