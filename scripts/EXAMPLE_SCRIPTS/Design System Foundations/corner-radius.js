// Corner radius
// @DOC_START
// # Corner radius
// Responsive corner-radius scale with range-first scaling (min → base → max per viewport).
//
// ## Overview
// Creates FLOAT variables only (no preview frames). **Range layout:** **`scaling.rangeMode`** selects (1) **`full`** (default when omitted) — one ramp from each mode’s **`min` → `max`** across all tokens (`t = index / (lastIndex)`), with **`scaling.type`** / **`scaling.ease`** reshaping progress along that ramp — or (2) **`twoSegment`** — **`min` → `base` → `max`** in two segments (typography-style), with easing applied **within each** segment. Use **`twoSegment`** when you anchor a middle token; otherwise omit for a single eased ramp over the full range. One **`roundTo`** grid applies to every step. Variables use **`CORNER_RADIUS`** only (numeric bindings appear in corner-radius fields, not width/gap).
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | collectionName | Figma variable collection (e.g. `Responsive System`). |
// | group | Variable name prefix folder (e.g. `Corner radius` → `Corner radius/md`). |
// | radii | **Either** an ordered array of token names (smallest → largest), e.g. `["none","xs","sm",…]` — `base.level` must match one entry — **or** a **string template** used with **`steps`** to generate names, e.g. `"radius-{$step}"` → `radius-1` … `radius-N`. Placeholders: `{$index}` (0-based), `{$index1}` / `{$step}` (1-based), `{$steps}` (total count). |
// | steps | Required with the **string** form of **`radii`**: positive integer = number of tokens. If **`radii`** is omitted, `[]`, or only whitespace, **`steps`** alone fills names using the default pattern `radius-{$index}`. Ignored when **`radii`** is a non-empty **array**. |
// | modes | `{ name, min, max }` per viewport; optional `base: { level, size }` — if omitted, defaults to `md` and a size derived from min/max. |
// | scaling.type | Range curve: linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio. **Piecewise:** `piecewise`, `piecewise2`, `piecewise4` — snapped ramp; single segment `min`→`max` over all tokens. |
// | scaling.rangeMode | `full` — single ramp `min`→`max` over all tokens. `twoSegment` — `min`→`base`→`max` (typography-style). **Omitted (auto):** `full` (all curve types). Set `twoSegment` explicitly for the split ramp. |
// | scaling.ease | Applied to the curve (`getEasedFactor`). **Note:** in `@Math Helpers`, **`ease` is ignored when `type === 'linear'`** (output equals `t`); use a non-linear `type` if you want easing. **Piecewise:** use `ease: "none"`; easing does not reshape the piecewise ladder (tabular generator). |
// | fontScaling | Optional alias; merged into `scaling` when set. |
// | scaling.roundTo | Snap all radius values to multiples of this number (e.g. `2` → 0, 2, 4, …). Omit or `0` for no snapping. Legacy: `roundUpperValuesTo` is accepted as an alias for `roundTo`. |
// | (output) | Variables use `scopes: ['CORNER_RADIUS']`. |
// | generateOverview | Optional boolean (default `false`). When `true`, builds a **Corner radius — overview** frame (token rows × mode columns, variable-bound swatches). Uses `@Foundation overview`. |
// @DOC_END

@import { getOrCreateCollection, setupModes, extractModes, processVariables } from "@Variables"
@import { foundationCreateCornerRadiusOverview } from "@Foundation overview"
@import { viewportLabel, namePrefix, resolveCollectionName, resolveGroup, writeManifest, normaliseConfig } from "@Foundation"
@import { generateScale, isPiecewiseScaleType, snapScaleGrid } from "@Math Helpers"
@import { radiusRampSpec, ensureCompatRampConfig, materialiseRampTokens, materialiseRampSizes, validateRampScalingType, generateRampVariables, runLinearRamp } from "@Linear Ramp"

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
  collectionName: "Responsive System",
  group: "Corner radius",

  // When true: after variables run, builds the **Corner radius — overview** frame (see @Foundation overview)
  generateOverview: false,

  radii: ["none", "xs", "sm", "md", "lg", "xl"],
  // Array ["s", "m", "l"] or string template "radius-{$step}".
  // steps: 10, // If string template is selected, steps is required.

  scaling: {
    type: "sine",
    // Range curve: linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio.
    // Piecewise: `piecewise`, `piecewise2`, `piecewise4`
    ease: "in",
    // none, in, out, inout, outin. Only used for range curves. Ignored for piecewise types.
    roundTo: 2,
    // Snap all radius values to multiples of this number (e.g. `2` → 0, 2, 4, …). Omit or `0` for no snapping.
  },

  modes: [
    {
      name: "desktop",
      min: 0,
      max: 48
    },
    {
      name: "tablet",
      min: 0,
      max: 32
    },
    {
      name: "mobile",
      min: 0,
      max: 24
    }
  ]
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
  })
  .catch(function (error) {
    console.error('Error:', error);
    figma.notify('❌ Error: ' + error.message);
  });
