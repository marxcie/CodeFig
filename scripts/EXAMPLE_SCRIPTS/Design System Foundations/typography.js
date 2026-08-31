// Typography
// @DOC_START
// Responsive type scale: one scale per mode, plus the line height and tracking that travel with a size.
//
// ## Overview
// Creates a `font-size`, `line-height` and `letter-spacing` variable per token, a variable per font
// weight, a font family variable, and — optionally — a text style per token and weight bound to them.
// No canvas frames.
//
// **Each mode carries its own scale**: `bezier` (a ramp along a curve you draw), `metric` (a step that grows every N
// tokens) or `fibonacci` (each step the sum of the two before it). `base` is the size of the **first**
// token, so tokens are named smallest to largest and nothing has to say where the base sits.
//
// **Line height and letter spacing take two numbers each**, both in px: the value at the smallest step
// and, optionally, the value at the largest. The steps between are interpolated — line height as a
// *ratio* and tracking as a *share of the size*, which is what makes absolute line height rise while
// its ratio falls and tracking tighten as type grows. Fill in only the first and line height keeps the
// base ratio while tracking stays flat, which is what this script has always done.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | collectionName | Figma variable collection (e.g. same as grid: `Responsive System`). |
// | group | Variable name prefix folder; empty = collection root. |
// | fontScale | Ordered token names, smallest to largest. A series works: `heading-{1,6}`, and it mixes with names you write. |
// | fontFamily | Font family name (e.g. Inter). |
// | fontWeights | A list where a number is a weight and a word is a Figma font style name: `[400, "Semi Bold"]`. Legacy: a map from name to either. |
// | createStyles, styleNaming | Whether to create and update text styles, and their naming (`Typography/{$fontScale}/{$fontWeight}`). Legacy: `figmaStyles.createAndUpdateStyles` / `.styleNaming`. |
// | modes | Per mode: `scaleType`, `ratio`/`curve` or `step`/`mod`, `base`, `lineHeight`, `letterSpacing`, `roundTo`. Rounding applies to size and line height; tracking is left fractional. |
//
// **Line height and letter spacing are percentages of the font size**, written as `{ base, max }` and interpolated between the smallest and largest token. Percent is Figma's own unit for both, and unlike a pixel value it still means the same thing after the scale grows. The variables are written in pixels either way, computed per token.
//
// A config from before the panel spells these as bare numbers — an absolute value *at* the base and at the top (`lineHeight: 12, lineHeightAtTop: 66`) — and keeps generating exactly what it always did. The two are told apart by shape rather than by range, because `-1.2` is equally plausible as −1.2px or −1.2%.
// | generateOverview | Optional boolean (default `false`). When `true`, fills **Render styles — overview** inside **`Design System Foundations`** (see `@Foundation overview`). |
// | overviewStyleFilter | Optional substring for text style names (case-insensitive). When empty, defaults to styles containing `group/` (e.g. `Typography/`). |
// | overviewPreviewText | The specimen's copy, and the overview tiles' when you generate one. A newline becomes a soft line break in Figma. |
//
// ## The older shape still runs
// A config written before the panel — per-mode `minFont`/`baseFont`/`maxFont` with a top-level
// `fontScaling` curve — generates exactly what it always did, and is pinned by
// `tests/typography-legacy-config.test.js`. Those keys have no controls in the panel; nothing else about
// them changed.
//
// | Legacy option | Description |
// |--------|--------------|
// | modes[].minFont / baseFont / maxFont | `{ size, lineHeight, letterSpacing }`; `baseFont.level` must name a token. Legacy alias: a `fontSizes` object. |
// | fontScaling.type | **Range curve** (min→base→max): linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio. **Piecewise:** `piecewise`, `piecewise2`, `piecewise4`. **Modular** (typescale.com): minorSecond … phi. |
// | fontScaling.rangeMode | `full` — single min→max ramp (default for piecewise). `twoSegment` — min→base→max (default for range curves). |
// | fontScaling.ease | For range curves: none, in, out, inout, outin. Ignored for piecewise/modular font size. |
// | fontScaling.roundLowerValuesTo, roundUpperValuesTo | Rounding grid below and above the base step. |
// @DOC_END

// The Configuration tab redraws these as you type. Both are pure: they generate in memory and read the
// same numbers a run writes, so neither can touch the document.
// @SUGGESTIONS: typographyOverviewHtml
// @PREVIEW: typographyPreviewHtml

// Import functions from libraries
@import { getOrCreateCollection, setupModes, extractModes, processVariables, getCollectionVariables } from "@Variables"
@import { applyEase, applyEaseWithExponents, lerp, generateScale, isPiecewiseScaleType, getModularScaleRatio, snapScaleGrid } from "@Math Helpers"
@import { foundationCreateTypographyTextStylesOverview } from "@Foundation overview"
@import { viewportLabel, namePrefix, resolveCollectionName, resolveGroup, expandTokenList, tokenListHasSeries, writeManifest, findFoundationSet, normaliseConfig, foundationModeIds, alignStampedTokens, stampGeneratedTokens, describeStampAlignment } from "@Foundation"
@import { scaleSequence, resolveModularRatio } from "@Scale Models"
@import { bezierAt } from "@Bezier"
@import { typeScaleTokens, typeScaleModes, typeScaleModeIsScaled, typeScaleModeNamed, typeScaleSizes, typeScaleProgress, typeScaleLineHeights, typeScaleTrackings, typeScaleTable, typographyOverviewHtml, typographyPreviewHtml } from "@Type Scale"

// ========================================
// CONFIG HELPERS (collection, modes, fontSizes)
// ========================================

function typographyModesToFontSizes(modes) {
  var out = {};
  if (!Array.isArray(modes)) return out;
  for (var i = 0; i < modes.length; i++) {
    var m = modes[i];
    if (!m || typeof m !== 'object' || typeof m.name !== 'string' || !m.name) continue;
    if (!m.minFont || !m.baseFont || !m.maxFont) continue;
    out[m.name] = {
      minFont: m.minFont,
      baseFont: m.baseFont,
      maxFont: m.maxFont
    };
  }
  return out;
}

function resolveFontSizes(config) {
  if (config.modes && Array.isArray(config.modes) && config.modes.length > 0) {
    return typographyModesToFontSizes(config.modes);
  }
  if (config.fontSizes && typeof config.fontSizes === 'object') {
    return config.fontSizes;
  }
  return {};
}

function materializeFontSizes(config) {
  if (!config || typeof config !== 'object') return;
  config.fontSizes = resolveFontSizes(config);
}

/**
 * The panel's spelling of the font weights: a comma list, where a number is a weight and a word is a
 * Figma font style name.
 *
 * The frame's placeholder is *"eg. 400, Semi Bold"*, which is both at once — and both are already
 * supported, as a map from a name to either. So the list is promoted into that map rather than the
 * generator learning a second shape: `[400, "Semi Bold"]` becomes
 * `{ "400": 400, "Semi Bold": "Semi Bold" }`, and the style path reads `Typography/Heading-1/400`.
 *
 * **A string is read as that same list.** Every other shape here is enumerated with `Object.keys`, and
 * a string enumerates as its character *indices* — so a quoted value in the config block generated a
 * text style called `0`, one called `1`, and so on to the end of the text. There is no reading of a
 * string under which that is what somebody meant.
 *
 * `"{ 400: 400, 600: 600 }"` is read as the list too, because that string is this map printed and then
 * quoted — the shape a config loaded from a file used to arrive in. `name: value` collapses to one
 * entry only when the two halves are the same text, so a real name is never thrown away.
 */
function typographyPromoteFontWeights(config) {
  if (typeof config.fontWeights === 'string') {
    config.fontWeights = config.fontWeights
      .replace(/^\s*\{/, '').replace(/\}\s*$/, '')
      .split(',')
      .map(function (item) {
        var pair = item.split(':');
        if (pair.length !== 2) return item;
        return pair[0].trim() === pair[1].trim() ? pair[0] : item;
      });
  }
  if (!Array.isArray(config.fontWeights)) return;
  var out = {};
  config.fontWeights.forEach(function (entry) {
    if (entry === null || entry === undefined || entry === '') return;
    var text = String(entry).trim();
    if (!text) return;
    var asNumber = Number(text);
    out[text] = isFinite(asNumber) && text !== '' && /^-?\d+(\.\d+)?$/.test(text) ? asNumber : text;
  });
  config.fontWeights = out;
}

/**
 * The panel's two flat style fields, folded into the nested object the generator reads.
 *
 * The frames show no style controls at all, but text styles are what this script is *for* — so they are
 * two fields rather than none, and `figmaStyles` stays the storage shape so an older config is
 * untouched.
 */
function typographyPromoteStyleFields(config) {
  if (config.createStyles === undefined && config.styleNaming === undefined) return;
  var styles = (config.figmaStyles && typeof config.figmaStyles === 'object') ? config.figmaStyles : {};
  if (config.createStyles !== undefined) styles.createAndUpdateStyles = config.createStyles === true;
  if (typeof config.styleNaming === 'string' && config.styleNaming) styles.styleNaming = config.styleNaming;
  config.figmaStyles = styles;
}

// Merge fontScaling into scaling (plus rounding); figmaStyles into styles for existing code paths.
function ensureCompatTypographyConfig(config) {
  if (!config || typeof config !== 'object') return;
  typographyPromoteFontWeights(config);
  typographyPromoteStyleFields(config);
  // `heading-{1,6}` is six tokens. Expanded here so every reader below — the variables, the styles, the
  // Overview table — counts the same steps.
  if (tokenListHasSeries(config.fontScale)) config.fontScale = expandTokenList(config.fontScale);
  if (config.fontScaling && typeof config.fontScaling === 'object') {
    var fs = config.fontScaling;
    config.scaling = {
      type: fs.type,
      ease: fs.ease,
      rangeMode: fs.rangeMode,
      easeInExponent: fs.easeInExponent,
      easeOutExponent: fs.easeOutExponent
    };
    if (fs.roundLowerValuesTo !== undefined) config.roundLowerValuesTo = fs.roundLowerValuesTo;
    if (fs.roundUpperValuesTo !== undefined) config.roundUpperValuesTo = fs.roundUpperValuesTo;
  }
  if (config.figmaStyles && typeof config.figmaStyles === 'object') {
    config.styles = config.figmaStyles;
  }
  if (!config.scaling || typeof config.scaling !== 'object') {
    config.scaling = { type: 'linear', ease: 'none' };
  }
}

function getFigmaStyles(config) {
  if (!config || typeof config !== 'object') return {};
  return config.figmaStyles || config.styles || {};
}

// Musical-interval ratios (same as typescale.com presets); phi ≈ golden ratio 1.618 — re-exported via @Math Helpers import.

/** Range and piecewise scaling.type values for typography (modular types checked via getModularScaleRatio). */
var KNOWN_TYPOGRAPHY_RANGE_SCALING_TYPES = {
  linear: true,
  sine: true,
  quad: true,
  cubic: true,
  quart: true,
  quint: true,
  circ: true,
  exponential: true,
  goldenratio: true,
  expo: true
};

function notifyUnknownTypographyScalingType(rawType) {
  var label = typeof rawType === 'string' ? rawType : String(rawType);
  var msg =
    'Typography: scaling.type "' +
    label +
    '" is not recognized. Use a modular scale (minorSecond, majorSecond, ..., phi) or a range curve: linear, sine, quad, ..., exponential, piecewise, piecewise2, piecewise4.';
  console.warn(msg);
  try {
    if (typeof figma !== 'undefined' && figma.notify) {
      figma.notify(msg, { error: true, timeout: 10000 });
    }
  } catch (e) {}
}

function validateTypographyScalingTypeConfig(config) {
  if (!config || typeof config !== 'object') return;
  var scaling = config.scaling || {};
  var raw = scaling.type;
  if (raw === undefined || raw === null || raw === '') return;
  if (typeof raw !== 'string') {
    notifyUnknownTypographyScalingType(raw);
    return;
  }
  var t = raw.trim();
  if (!t) return;
  if (getModularScaleRatio(t) != null) return;
  if (isPiecewiseScaleType(t)) return;
  var k = t.toLowerCase();
  if (KNOWN_TYPOGRAPHY_RANGE_SCALING_TYPES[k]) return;
  notifyUnknownTypographyScalingType(raw);
}

// Resolve collection name from wrapper config or raw data object.
// ========================================
// ADVANCED TYPOGRAPHY SYSTEM CONFIGURATION
// ========================================

var typographyConfigData = typeof typographyConfigData !== 'undefined' ? typographyConfigData : {
  // @CONFIG_START
// @fromFile: domains.typography

  collectionName: "",
  group: "Typography",
  fontScale: ["Text-Tiny", "Text-Small", "Text-Regular", "Text-Large", "Heading-6", "Heading-5", "Heading-4", "Heading-3", "Heading-2", "Heading-1"],
  fontFamily: "Inter",
  fontWeights: [400, 600],
  createStyles: true,
  styleNaming: "Typography/{$fontScale}/{$fontWeight}",
  generateOverview: false,
  modes: [
    {
      name: "Value",
      scaleType: "bezier",
      base: 8,
      ratio: 1.25,
      curve: [],
      letterSpacing: { base: 0, max: -2 },
      lineHeight: { base: 150, max: 110 },
      roundTo: 2
    }
  ],
  overviewPreviewText: "Sphinx of black quartz,\njudge my vow."
// @CONFIG_END

// @PANEL_START
// {
//   blocks: [
//     { type: "heading", text: "General" },
//     { key: "collectionName", type: "collection", label: "Collection" },
//     { type: "chips", label: "Collection modes", from: "modes" },
//     { key: "group", type: "string", label: "Group within collection",
//       placeholder: "eg.: Typography" },
//     { key: "fontScale", type: "list", label: "Tokens",
//       helper: "Named smallest to largest, and heading-{6,1} is a series of six. The Base unit below is the size of the first name here." },
//     { key: "fontFamily", type: "string", label: "Font family",
//       placeholder: "eg.: Inter Tight" },
//     { key: "fontWeights", type: "list", label: "Font weights",
//       helper: "A number is a font weight; a word is a Figma font style name, e.g. Semi Bold." },
//     { key: "createStyles", type: "boolean", label: "Create and update text styles" },
//     { key: "styleNaming", type: "string", label: "Style naming",
//       placeholder: "eg.: Typography/{$fontScale}/{$fontWeight}" },
//     { type: "divider", section: true },
//     { type: "heading", text: "Mode settings" },
//     { key: "generateOverview", type: "boolean", label: "Generate overview" },
//     { key: "modes", type: "rows", label: "Modes", layout: "tabs",
//       columns: [
//         { key: "name", type: "text", label: "Mode" },
//         { key: "scaleType", type: "radio", label: "Scale type",
//           options: [{ bezier: "Bezier scale" }, { metric: "Metric scale" }, { fibonacci: "Fibonacci" }] },
//         { key: "curve", type: "curve", label: "Scale", growth: "ratio",
//           showWhen: { scaleType: "bezier" },
//           helper: "Drag the end handle to set how fast the scale grows — the largest value comes out of that and the number of tokens, so adding a token extends the scale instead of squeezing it. Add shape bends the growth: tighter at the small end, looser at the top." },
//         { key: "step", type: "number", label: "Step",
//           showWhen: { scaleType: ["metric", "fibonacci"] },
//           helper: "Metric. The amount each step adds, before it starts growing.\\nFibonacci. The first increment — the sequence is the base, the base plus this, then each value the sum of the two before it." },
//         { key: "mod", type: "number", label: "Every N steps",
//           showWhen: { scaleType: "metric" },
//           helper: "How often the step grows. With a step of 4 and a value of 3 the increments run 4, 4, 4, 8, 8, 8, 12 — which is the ladder a design system doc actually writes down." },
//         { key: "base", type: "number", label: "Base unit" },
//         { key: "letterSpacing", type: "group", label: "Letter spacing",
//           helper: "A percentage of the font size, the way Figma spells it — so it still means the same thing when the scale grows. Interpolated between the two ends and written as pixels.",
//           fields: [
//             { key: "base", type: "number", label: "Base", unit: "%" },
//             { key: "max", type: "number", label: "Largest", unit: "%" }
//           ] },
//         { key: "lineHeight", type: "group", label: "Line height",
//           helper: "A percentage of the font size. 150 is a comfortable body line; large text usually wants less, which is what the second field is for.",
//           fields: [
//             { key: "base", type: "number", label: "Base", unit: "%" },
//             { key: "max", type: "number", label: "Largest", unit: "%" }
//           ] },
//         { key: "roundTo", type: "number", label: "Round numbers to" }
//       ] },
//     { type: "heading", text: "Overview" },
//     { type: "suggestions" },
//     { type: "heading", text: "Preview" },
//     { key: "overviewPreviewText", type: "textarea", label: "Preview text" },
//     { type: "preview" }
//   ]
// }
// @PANEL_END
};

ensureCompatTypographyConfig(typographyConfigData);
materializeFontSizes(typographyConfigData);
validateTypographyScalingTypeConfig(typographyConfigData);

// Grid for a given step: lower steps (min→base) use roundLowerValuesTo; upper steps (above base) use roundUpperValuesTo.
function getGridSizeForStep(config, scaleIndex, baseIndex) {
  var lower = config.roundLowerValuesTo;
  var upper = config.roundUpperValuesTo;
  var gridLower = (lower === undefined || lower === null) ? 0 : (typeof lower === 'number' ? lower : 0);
  var gridUpper = (upper === undefined || upper === null) ? 0 : (typeof upper === 'number' ? upper : 0);
  return scaleIndex <= baseIndex ? gridLower : gridUpper;
}

// Map user type (expo) to library (exponential)
function mapTypeToLibrary(type) {
  if (!type) return "linear";
  if (type === "expo") return "exponential";
  if (type === "goldenratio") return "goldenRatio";
  // quad, quart, circ passed through as-is
  return type;
}

function isModularScaleType(type) {
  return getModularScaleRatio(type) != null;
}

/** Single snap grid for piecewise font ramp: prefer roundUpperValuesTo, else roundLowerValuesTo. */
function resolveTypographyPiecewiseSnapGrid(config) {
  var lower = config.roundLowerValuesTo;
  var upper = config.roundUpperValuesTo;
  var gl = (typeof lower === 'number' && lower > 0) ? lower : 0;
  var gu = (typeof upper === 'number' && upper > 0) ? upper : 0;
  if (gu > 0) return gu;
  if (gl > 0) return gl;
  return 0;
}

// When font size uses a modular ratio, line and letter spacing use range lerp with linear curve (not modular names).
function getSpacingScalingType(config) {
  var scaling = config.scaling || {};
  var st = scaling.type || 'linear';
  if (isModularScaleType(st)) return 'linear';
  if (isPiecewiseScaleType(st)) return 'linear';
  return mapTypeToLibrary(st);
}

function getEasedFactorForSpacing(config, t) {
  var scaling = config.scaling || {};
  var easeName = scaling.ease || 'none';
  var useExponents = typeof scaling.easeInExponent === 'number' && scaling.easeInExponent > 0;
  if (useExponents) {
    var outExp = (typeof scaling.easeOutExponent === 'number' && scaling.easeOutExponent > 0)
      ? scaling.easeOutExponent : scaling.easeInExponent;
    return applyEaseWithExponents(scaling.easeInExponent, outExp, easeName, t);
  }
  var curveType = getSpacingScalingType(config);
  return applyEase(curveType, easeName, t);
}

// Returns u in [0,1] for the scale curve. Uses easeInExponent/easeOutExponent when set, else type + ease.
function getEasedFactor(config, t) {
  var scaling = config.scaling || {};
  var easeName = scaling.ease || "none";
  var useExponents = typeof scaling.easeInExponent === 'number' && scaling.easeInExponent > 0;
  if (useExponents) {
    var outExp = (typeof scaling.easeOutExponent === 'number' && scaling.easeOutExponent > 0)
      ? scaling.easeOutExponent : scaling.easeInExponent;
    return applyEaseWithExponents(scaling.easeInExponent, outExp, easeName, t);
  }
  var curveType = mapTypeToLibrary(scaling.type || "linear");
  return applyEase(curveType, easeName, t);
}

function resolveTypographyRangeMode(config, scaling) {
  var rm = String(scaling.rangeMode || '').toLowerCase();
  if (rm === 'full') return 'full';
  if (rm === 'twosegment' || rm === 'two_segment' || rm === 'segment' || rm === 'anchor') {
    return 'twoSegment';
  }
  if (isPiecewiseScaleType(scaling.type)) return 'full';
  if (getModularScaleRatio(scaling.type) != null) return 'twoSegment';
  return 'twoSegment';
}

function buildTypographyFontScaleOpts(totalSteps, viewport, config) {
  var fontSizes = config.fontSizes[viewport];
  var baseIndex = config.fontScale.indexOf(fontSizes.baseFont.level);
  if (baseIndex < 0) {
    console.warn('baseFont.level not found in fontScale, using middle step');
    baseIndex = Math.max(0, Math.floor((totalSteps - 1) / 2));
  }
  var scaling = config.scaling || {};
  var roundTo = resolveTypographyPiecewiseSnapGrid(config);
  if (!roundTo) {
    var upper = config.roundUpperValuesTo;
    var lower = config.roundLowerValuesTo;
    roundTo = (typeof upper === 'number' && upper > 0) ? upper
      : ((typeof lower === 'number' && lower > 0) ? lower : 0);
  }
  return {
    steps: totalSteps,
    min: fontSizes.minFont.size,
    max: fontSizes.maxFont.size,
    type: scaling.type || 'linear',
    ease: scaling.ease,
    rangeMode: resolveTypographyRangeMode(config, scaling),
    baseIndex: baseIndex,
    baseValue: fontSizes.baseFont.size,
    roundTo: roundTo,
    easeInExponent: scaling.easeInExponent,
    easeOutExponent: scaling.easeOutExponent,
    defaultRangeMode: 'twoSegment'
  };
}

function getTypographyFontScale(totalSteps, viewport, config) {
  return generateScale(buildTypographyFontScaleOpts(totalSteps, viewport, config));
}

// Font size ramp via shared generateScale (piecewise = min→max; range = twoSegment by default).
function calculateFluidFontSize(scaleIndex, totalSteps, viewport, config) {
  var scale = getTypographyFontScale(totalSteps, viewport, config);
  var v = scale[scaleIndex];
  var minSize = config.fontSizes[viewport].minFont.size;
  var maxSize = config.fontSizes[viewport].maxFont.size;
  if (typeof v !== 'number' || isNaN(v)) return minSize;
  return Math.max(minSize, Math.min(maxSize, v));
}

// Range-first: line height ratio mapped from min→base→max using applyEase + lerp.
function calculateFluidLineHeight(scaleIndex, totalSteps, viewport, config) {
  var fontSizes = config.fontSizes[viewport];
  var baseIndex = config.fontScale.indexOf(fontSizes.baseFont.level);

  var minLineHeight = fontSizes.minFont.lineHeight;
  var baseLineHeight = fontSizes.baseFont.lineHeight;
  var maxLineHeight = fontSizes.maxFont.lineHeight;

  if (scaleIndex === baseIndex) {
    return baseLineHeight;
  }

  var t;
  var startVal;
  var endVal;

  if (scaleIndex < baseIndex) {
    t = baseIndex > 0 ? scaleIndex / baseIndex : 0;
    startVal = minLineHeight;
    endVal = baseLineHeight;
  } else {
    var stepsAboveBase = (totalSteps - 1) - baseIndex;
    t = stepsAboveBase > 0 ? (scaleIndex - baseIndex) / stepsAboveBase : 0;
    startVal = baseLineHeight;
    endVal = maxLineHeight;
  }

  var u = getEasedFactorForSpacing(config, t);
  return lerp(startVal, endVal, u);
}

// Range-first: letter spacing mapped from min→base→max using applyEase + lerp. No grid; fractional allowed.
function calculateFluidLetterSpacing(scaleIndex, totalSteps, viewport, config) {
  var fontSizes = config.fontSizes[viewport];
  var baseIndex = config.fontScale.indexOf(fontSizes.baseFont.level);

  var minLetterSpacing = fontSizes.minFont.letterSpacing;
  var baseLetterSpacing = fontSizes.baseFont.letterSpacing;
  var maxLetterSpacing = fontSizes.maxFont.letterSpacing;

  if (scaleIndex === baseIndex) {
    return Math.round(baseLetterSpacing * 100) / 100;
  }

  var t;
  var startVal;
  var endVal;

  if (scaleIndex < baseIndex) {
    t = baseIndex > 0 ? scaleIndex / baseIndex : 0;
    startVal = minLetterSpacing;
    endVal = baseLetterSpacing;
  } else {
    var stepsAboveBase = (totalSteps - 1) - baseIndex;
    t = stepsAboveBase > 0 ? (scaleIndex - baseIndex) / stepsAboveBase : 0;
    startVal = baseLetterSpacing;
    endVal = maxLetterSpacing;
  }

  var u = getEasedFactorForSpacing(config, t);
  var letterSpacing = lerp(startVal, endVal, u);
  return Math.round(letterSpacing * 100) / 100;
}

// Helper: variable name prefix (no leading slash or empty path — Figma rejects bad path segments)
// Round value to grid (8, 4, or 2 pt). Returns value unchanged if gridSize is falsy or <= 0.
/**
 * Which modes this config has, whichever shape it is written in.
 *
 * The panel's modes carry a scale rather than a min/base/max payload, so `fontSizes` — which is built
 * from those payloads — is empty for them, and reading the mode list off it found nothing to write.
 */
function typographyViewportNames(config) {
  var scaled = typeScaleModes({ config: config }).filter(typeScaleModeIsScaled);
  if (scaled.length > 0) {
    return scaled.map(function (m) { return m.name; });
  }
  return Object.keys(config.fontSizes || {});
}

/**
 * The size, line height and tracking for every token of one mode.
 *
 * The one seam between the two models, and it is deliberately the *only* one: everything below this
 * function writes variables from three arrays and does not know which shape produced them. The
 * alternative — a second generator — is two places to fix a scope, a name or a rounding rule.
 */
function typographyValuesFor(config, viewport, tokens, legacyBaseIndex) {
  var mode = typeScaleModeNamed({ config: config }, viewport);
  if (typeScaleModeIsScaled(mode)) {
    var sizes = typeScaleSizes(mode, tokens.length);
    var lineHeights = typeScaleLineHeights(mode, sizes.values);
    var trackings = typeScaleTrackings(mode, sizes.values);
    return tokens.map(function (token, i) {
      return { size: sizes.values[i], lineHeight: lineHeights[i], letterSpacing: trackings[i] };
    });
  }

  var sizesFor = config.fontSizes[viewport];
  var scaleArr = getTypographyFontScale(tokens.length, viewport, config);
  var minSize = sizesFor.minFont.size;
  var maxSize = sizesFor.maxFont.size;
  return tokens.map(function (token, index) {
    var gridSize = getGridSizeForStep(config, index, legacyBaseIndex);
    var fontSize = scaleArr[index];
    if (typeof fontSize !== 'number' || isNaN(fontSize)) fontSize = minSize;
    fontSize = Math.max(minSize, Math.min(maxSize, fontSize));
    var lineHeightPx = fontSize * calculateFluidLineHeight(index, tokens.length, viewport, config);
    return {
      size: fontSize,
      lineHeight: gridSize > 0
        ? snapScaleGrid(Math.round(lineHeightPx * 100) / 100, gridSize)
        : Math.round(lineHeightPx * 100) / 100,
      letterSpacing: calculateFluidLetterSpacing(index, tokens.length, viewport, config)
    };
  });
}

// Generate variables programmatically
function generateTypographyVariables(config) {
  var variables = {};
  var prefix = namePrefix(resolveGroup({ config: config }));

  var viewportNames = typographyViewportNames(config);
  var first = config.fontSizes && config.fontSizes[viewportNames[0]];
  // Read from the first mode only, which is how it has always been read. It decides nothing but which
  // rounding grid a step uses, and every mode names the same base level in practice.
  var baseIndex = first && first.baseFont ? config.fontScale.indexOf(first.baseFont.level) : 0;
  var valuesByViewport = {};
  viewportNames.forEach(function(viewport) {
    valuesByViewport[viewport] = typographyValuesFor(config, viewport, config.fontScale, baseIndex);
  });

  // Generate variables for each font scale step - grouped by scale level
  config.fontScale.forEach(function(scaleName, index) {
    // Pre-calculate values for each viewport dynamically
    var fontSizeValues = {};
    var lineHeightValues = {};
    var letterSpacingValues = {};

    viewportNames.forEach(function(viewport) {
      var viewportKey = viewportLabel(viewport);
      var cell = valuesByViewport[viewport][index] || {};
      fontSizeValues[viewportKey] = cell.size;
      lineHeightValues[viewportKey] = cell.lineHeight;
      letterSpacingValues[viewportKey] = cell.letterSpacing;
    });

    // Font sizes for each viewport
    variables[prefix + scaleName + '/font-size'] = {
      type: "FLOAT",
      scopes: ["FONT_SIZE"],
      values: fontSizeValues
    };
    
    // Line heights for each viewport
    variables[prefix + scaleName + '/line-height'] = {
      type: "FLOAT",
      scopes: ["LINE_HEIGHT"],
      values: lineHeightValues
    };
    
    // Letter spacing for each viewport
    variables[prefix + scaleName + '/letter-spacing'] = {
      type: "FLOAT",
      scopes: ["LETTER_SPACING"],
      values: letterSpacingValues
    };
  });
  
  // Font weights - handle both numeric (400, 600) and string ('Light', 'Bold') values (same viewports as above)
  Object.keys(config.fontWeights).forEach(function(weightName) {
    var weightValue = config.fontWeights[weightName]; // Capture the value
    
    // Create values object with same value for all viewports
    var weightValues = {};
    viewportNames.forEach(function(viewport) {
      var viewportKey = viewportLabel(viewport);
      weightValues[viewportKey] = weightValue;
    });
    
    // Determine if it's a numeric weight or font style name
    var isNumeric = typeof weightValue === 'number';
    
    if (isNumeric) {
      // Numeric weight (400, 600, etc.) - same value for all modes
      variables[prefix + 'font-weight/' + weightName] = {
        type: "FLOAT",
        scopes: ["FONT_WEIGHT"],
        values: weightValues
      };
    } else {
      // Font style name ('Light', 'Bold', 'Italic', etc.) - same value for all modes
      variables[prefix + 'font-style/' + weightName] = {
        type: "STRING",
        scopes: ["FONT_STYLE"],
        values: weightValues
      };
    }
  });
  
  // Font family - store as string with same value for all modes
  var fontFamilyValues = {};
  viewportNames.forEach(function(viewport) {
    var viewportKey = viewportLabel(viewport);
    fontFamilyValues[viewportKey] = config.fontFamily;
  });
  
  variables[prefix + 'font-family/primary'] = {
    type: "STRING",
    scopes: ["FONT_FAMILY"],
    values: fontFamilyValues
  };
  
  return variables;
}

// Create the final configuration object
var typographyConfig = typeof typographyConfig !== 'undefined' ? typographyConfig : {
  collectionName: resolveCollectionName(typographyConfigData),
  group: resolveGroup(typographyConfigData),
  config: typographyConfigData,
  variables: generateTypographyVariables(typographyConfigData)
};

function resolveTypographyGenerateOverview(config) {
  if (!config || typeof config !== 'object') return false;
  if (config.generateOverview === true) return true;
  var inner = config.config;
  if (inner && typeof inner === 'object' && inner.generateOverview === true) return true;
  return false;
}

// ========================================
// CORE FUNCTIONS
// ========================================

function hasFontWeightScope(variable) {
  if (!variable || !variable.scopes || variable.scopes.length !== 1) return false;
  return variable.scopes[0] === 'FONT_WEIGHT';
}

function hasFontStyleScope(variable) {
  if (!variable || !variable.scopes || variable.scopes.length !== 1) return false;
  return variable.scopes[0] === 'FONT_STYLE';
}

/**
 * Log typography weight variables that conflict with the current config.
 * Does not remove variables — remove() can crash Figma when bindings are resolved (editScope).
 */
async function logConflictingTypographyWeightVariables(collection, config, collectionVariables) {
  var data = config.config || config;
  if (!data || !data.fontWeights || typeof data.fontWeights !== 'object') return;

  var prefix = namePrefix(resolveGroup(config));
  var variables = collectionVariables || await getCollectionVariables(collection);
  console.log('Checking typography weight variables for conflicts...');

  Object.keys(data.fontWeights).forEach(function(weightName) {
    var weightValue = data.fontWeights[weightName];
    var isNumeric = typeof weightValue === 'number';

    if (isNumeric) {
      var styleVarName = prefix + 'font-style/' + weightName;
      var styleVar = variables.find(function(v) { return v && v.name === styleVarName; });
      if (styleVar && !styleVar.remote) {
        console.warn('Conflicting font-style variable (numeric weight now used): ' + styleVarName + ' — delete manually in Variables panel if needed.');
      }

      var weightVarName = prefix + 'font-weight/' + weightName;
      var weightVar = variables.find(function(v) { return v && v.name === weightVarName; });
      if (weightVar && !weightVar.remote &&
          (weightVar.resolvedType !== 'FLOAT' || !hasFontWeightScope(weightVar))) {
        console.warn(
          'Font-weight variable needs manual fix (expected FLOAT + FONT_WEIGHT scope): ' + weightVarName +
          ' (type: ' + weightVar.resolvedType + ', scopes: [' + (weightVar.scopes || []).join(', ') + '])'
        );
      }
    } else {
      var obsoleteWeightName = prefix + 'font-weight/' + weightName;
      var obsoleteWeight = variables.find(function(v) { return v && v.name === obsoleteWeightName; });
      if (obsoleteWeight && !obsoleteWeight.remote) {
        console.warn('Conflicting font-weight variable (string style now used): ' + obsoleteWeightName + ' — delete manually in Variables panel if needed.');
      }

      var styleVarName = prefix + 'font-style/' + weightName;
      var styleVar = variables.find(function(v) { return v && v.name === styleVarName; });
      if (styleVar && !styleVar.remote &&
          (styleVar.resolvedType !== 'STRING' || !hasFontStyleScope(styleVar))) {
        console.warn(
          'Font-style variable needs manual fix (expected STRING + FONT_STYLE scope): ' + styleVarName +
          ' (type: ' + styleVar.resolvedType + ', scopes: [' + (styleVar.scopes || []).join(', ') + '])'
        );
      }
    }
  });
}

async function createOrUpdateCollection(config) {
  var data = config.config || config;
  ensureCompatTypographyConfig(data);
  materializeFontSizes(data);
  validateTypographyScalingTypeConfig(data);

  console.log('=== ADVANCED TYPOGRAPHY SYSTEM MANAGER ===');
  var collectionName = resolveCollectionName(config);
  var groupName = resolveGroup(config);
  console.log('Processing collection: ' + collectionName + (groupName ? ' (group: ' + groupName + ')' : ' (no group)'));
  
  var collection = await getOrCreateCollection(collectionName);
  
  var modes = typographyViewportNames(data).map(function(k) {
    return viewportLabel(k);
  });
  if (modes.length === 0) {
    modes = extractModes({ variables: config.variables });
  }
  console.log('Detected modes (config order): ' + modes.join(', '));
  
  setupModes(collection, modes);

  var collectionVariables = await getCollectionVariables(collection);
  await logConflictingTypographyWeightVariables(collection, config, collectionVariables);

  // Identity before names, so a renamed group moves this set rather than duplicating it. Typography
  // writes three variables per token, and duplicating it means three orphans per token.
  var names = Object.keys(config.variables);
  // Through the stamps, so a renamed group is the same set rather than a second one.
  var setId = (await findFoundationSet(collection, 'typography', groupName)).id || '';
  var aligned = await alignStampedTokens(collection, 'typography', groupName, names, setId);
  describeStampAlignment(aligned).forEach(function(line) { console.log(line); });

  var stats = await processVariables(collection, config.variables, config.config, modes);

  var styleStats = {created: 0, updated: 0};

  /**
   * Record the set, the way the ramps and Grid do.
   *
   * **Typography was the last domain that never did**, and the consequence was not subtle: the panel's
   * auto-import had nothing to find, so opening the script in a file that already had a typography set
   * showed the shipped ten tokens instead of the four the file holds. A feature that lies, exactly as
   * Grid's comment puts it — the read half was built, the write half never was.
   *
   * Written last and it cannot fail the run: the variables and the text styles are real whether or not the
   * record of them is.
   */
  function recordTypographySet() {
    try {
      var manifest = writeManifest(collection, {
        id: setId,
        domain: 'typography',
        group: groupName,
        modes: modes,
        modeIds: foundationModeIds(collection, modes),
        tokens: typeScaleTokens(config),
        config: normaliseConfig(config).config.domains.typography
      });
      if (manifest && manifest.ok) {
        console.log('Recorded this set: ' + manifest.key + ' (' + manifest.bytes + ' characters)');
      } else if (manifest) {
        console.warn('Variables were written. The set could not be recorded: ' +
          ((manifest.warnings[0] || {}).message || 'unknown reason'));
      }
      return manifest;
    } catch (e) {
      console.warn('Variables were written. The set could not be recorded: ' +
        (e && e.message ? e.message : e));
      return null;
    }
  }

  async function finishTypographySummary(styleStats) {
    var manifest = recordTypographySet();
    // After the manifest: it mints the set id, and the stamps have to carry the same one.
    var stamped = await stampGeneratedTokens(
      collection, 'typography', groupName, names,
      (manifest && manifest.manifest ? manifest.manifest.id : setId)
    );
    stamped.warnings.forEach(function(w) { console.warn(w.message); });
    console.log('=== TYPOGRAPHY SYSTEM SUMMARY ===');
    console.log('Collection: ' + collectionName);
    console.log('Variables created: ' + stats.created);
    console.log('Variables updated: ' + stats.updated);
    console.log('Variables skipped: ' + stats.skipped);
    console.log('Text styles created: ' + styleStats.created);
    console.log('Text styles updated: ' + styleStats.updated);
    return { collection: collection, stats: stats, styleStats: styleStats };
  }

  if (getFigmaStyles(config.config).createAndUpdateStyles) {
    console.log('Creating/updating text styles...');
    return createOrUpdateTextStyles(config, collection).then(function(styleStats) {
      return finishTypographySummary(styleStats);
    });
  }
  return Promise.resolve(finishTypographySummary(styleStats));
}

// Function to create or update text styles using the variables
function createOrUpdateTextStyles(config, collection) {
  var stats = {created: 0, updated: 0};
  return figma.getLocalTextStylesAsync().then(async function(existingStyles) {
  var variableList = await Promise.all(collection.variableIds.map(function(id) { return figma.variables.getVariableByIdAsync(id); }));
  try {
    config.config.fontScale.forEach(function(scaleName) {
      Object.keys(config.config.fontWeights).forEach(function(weightName) {
        var styleName = (getFigmaStyles(config.config).styleNaming || '{$fontScale}/{$fontWeight}')
          .replace('{$fontScale}', scaleName)
          .replace('{$fontWeight}', weightName);
        
        var existingStyle = existingStyles.find(function(style) {
          return style.name === styleName;
        });
        
        var textStyle;
        var action;
        
        if (existingStyle) {
          textStyle = existingStyle;
          action = 'updated';
          stats.updated++;
        } else {
          textStyle = figma.createTextStyle();
          textStyle.name = styleName;
          action = 'created';
          stats.created++;
        }
        
        var prefix = namePrefix(resolveGroup(config));
        var fontSizeVar = variableList.find(function(v) { return v && v.name === prefix + scaleName + '/font-size'; });
        
        var lineHeightVar = variableList.find(function(v) { return v && v.name === prefix + scaleName + '/line-height'; });
        
        var letterSpacingVar = variableList.find(function(v) { return v && v.name === prefix + scaleName + '/letter-spacing'; });
        
        var fontWeightVar = variableList.find(function(v) { return v && v.name === prefix + 'font-weight/' + weightName; });
          
        var fontStyleVar = variableList.find(function(v) { return v && v.name === prefix + 'font-style/' + weightName; });
        
        var fontFamilyVar = variableList.find(function(v) { return v && v.name === prefix + 'font-family/primary'; });
        
        // Apply variables to the text style
        if (fontSizeVar) {
          textStyle.setBoundVariable('fontSize', fontSizeVar);
        }
        if (lineHeightVar) {
          textStyle.setBoundVariable('lineHeight', lineHeightVar);
        }
        if (letterSpacingVar) {
          textStyle.setBoundVariable('letterSpacing', letterSpacingVar);
        }
        
        // Bind font weight (numeric) or font style (string) variable
        if (fontWeightVar) {
          textStyle.setBoundVariable('fontWeight', fontWeightVar);
          console.log('Numeric font weight bound for: ' + styleName);
        } else if (fontStyleVar) {
          // For string-based font styles, we'll set the font name directly
          var fontStyleValue = config.config.fontWeights[weightName];
          console.log('Font style variable found for ' + styleName + ': ' + fontStyleValue);
        }
        
        if (fontFamilyVar) {
          try {
            textStyle.setBoundVariable('fontFamily', fontFamilyVar);
            console.log('Font family variable bound successfully for: ' + styleName);
          } catch (fontError) {
            console.log('Could not bind font family variable for: ' + styleName);
          }
        }

        // Set style description (info) with scaling and rounding
        if (typeof textStyle.description !== 'undefined') {
          textStyle.description = getStyleDescription(config.config);
        }
        
        console.log('Text style ' + action + ': ' + styleName);
      });
    });
  } catch (error) {
    console.error('Error creating text styles:', error);
    figma.notify('Error creating text styles. Font may not be available.');
  }
  
  return stats;
  });
}

// Full description for style info: scaling (type + ease or exponents) and rounding.
function getStyleDescription(config) {
  var scaling = config.scaling || {};
  var ease = scaling.ease || 'none';
  var useExponents = typeof scaling.easeInExponent === 'number' && scaling.easeInExponent > 0;
  var scalingPart;
  if (useExponents) {
    var outExp = (typeof scaling.easeOutExponent === 'number' && scaling.easeOutExponent > 0)
      ? scaling.easeOutExponent : scaling.easeInExponent;
    scalingPart = 'Scaling: exponents in ' + scaling.easeInExponent + ', out ' + outExp + ', ease ' + ease;
  } else {
    var type = scaling.type || 'linear';
    scalingPart = 'Scaling: ' + type + ', ' + ease;
  }
  var lower = config.roundLowerValuesTo;
  var upper = config.roundUpperValuesTo;
  var lowerStr = (lower === undefined || lower === null) ? '0' : String(lower);
  var upperStr = (upper === undefined || upper === null) ? '0' : String(upper);
  return scalingPart + ' | Rounding: ' + lowerStr + '/' + upperStr;
}

// ========================================
// EXECUTION
// ========================================

createOrUpdateCollection(typographyConfig)
  .then(async function (result) {
    var data = typographyConfig.config || typographyConfigData;
    var showOverview = resolveTypographyGenerateOverview(typographyConfig);
    if (showOverview) {
      await foundationCreateTypographyTextStylesOverview({
        groupPrefix: resolveGroup(typographyConfigData),
        styleNameNeedle:
          typeof data.overviewStyleFilter === 'string' ? data.overviewStyleFilter : '',
        previewText: typeof data.overviewPreviewText === 'string' ? data.overviewPreviewText : ''
      });
    }
    var message =
      'Typography: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' updated';
    if (result.styleStats && (result.styleStats.created > 0 || result.styleStats.updated > 0)) {
      message += ', ' + result.styleStats.created + ' styles created, ' + result.styleStats.updated + ' styles updated';
    }
    if (showOverview) {
      message += '; overview frame';
    }
    figma.notify(message);
  })
  .catch(function (error) {
    console.error('Error:', error);
    figma.notify('Error: ' + error.message);
  });

// ========================================
// SIMPLE API FOR CUSTOM CONFIGURATIONS
// ========================================

// Simple function to create a complete typography system with custom config
async function createTypographySystem(customConfig) {
  try {
    ensureCompatTypographyConfig(customConfig);
    materializeFontSizes(customConfig);
    validateTypographyScalingTypeConfig(customConfig);
    var typographyVariables = {};
    
    customConfig.fontScale.forEach(function(scaleName, index) {
      var viewportNames = Object.keys(customConfig.fontSizes);
      var totalSteps = customConfig.fontScale.length;
      
      viewportNames.forEach(function(viewport) {
        var viewportKey = viewportLabel(viewport);
        
        // Calculate font size (simplified version)
        var baseIndex = customConfig.fontScale.indexOf(customConfig.fontSizes[viewport].baseFont.level);
        var minSize = customConfig.fontSizes[viewport].minFont.size;
        var maxSize = customConfig.fontSizes[viewport].maxFont.size;
        var baseSize = customConfig.fontSizes[viewport].baseFont.size;
        
        var fontSize = baseSize;
        if (index !== baseIndex) {
          var ratio = (index - baseIndex) / (totalSteps - 1);
          fontSize = minSize + (maxSize - minSize) * Math.abs(ratio);
        }
        
        // Store variables in the correct format (no leading slash when group empty)
        var variableName = namePrefix(resolveGroup({ config: customConfig })) + scaleName + '/font-size';
        
        if (!typographyVariables[variableName]) {
          typographyVariables[variableName] = {
            type: 'FLOAT',
            values: {}
          };
        }
        typographyVariables[variableName].values[viewportKey] = Math.round(fontSize);
      });
    });
    
    var collection = await getOrCreateCollection(resolveCollectionName(customConfig));
    var modes = extractModes({variables: typographyVariables});
    setupModes(collection, modes);
    var result = await processVariables(collection, typographyVariables, null, modes);
    
    figma.notify('Typography system created: ' + result.created + ' variables created!');
    return result;
    
  } catch (error) {
    figma.notify('Error: ' + error.message);
    throw error;
  }
}
