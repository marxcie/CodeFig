// Typography
// @DOC_START
// # Typography
// Responsive typography system with range-first scaling and style generation.
//
// ## Overview
// Creates typography variables and optional text styles. **Range mode:** min → base → max per viewport with easing between steps. **Modular mode** (`fontScaling.type` = minorSecond … perfectFifth, `phi`): font size = base × ratio^(step−base), clamped to min/max. Line height and letter spacing always use the range model. Does not create canvas preview frames.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | fontFamily | Font family name (e.g. Inter). |
// | fontWeights | Map of style names to numeric weight (400, 600) or Figma style name string (`"Regular"`, `"Light"`). |
// | collectionName | Figma variable collection (e.g. same as grid: `Responsive System`). |
// | group | Optional variable name prefix; empty = collection root. |
// | modes | Ordered `{ name, minFont, baseFont, maxFont }` per viewport. Legacy: `fontSizes` object. |
// | fontScale | Ordered step names; `baseFont.level` must match one entry. |
// | fontScaling.type | **Range curve** (min→base→max): linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio. **Piecewise** (font size only): `piecewise`, `piecewise2`, `piecewise4` — snapped ramp from min→max over all steps ([Carbon spacing](https://carbondesignsystem.com/elements/spacing/overview/) rhythm); **Modular scale** (like [typescale.com](https://typescale.com/)): minorSecond, majorSecond, minorThird, majorThird, perfectFourth, augmentedFourth, perfectFifth, phi (1.618). Modular uses `baseFont.size × ratio^(step−base)` clamped to min/max. |
// | fontScaling.ease | For range curves: none, in, out, inout, outin. Ignored for modular types (font size); still used for line height and letter spacing with a linear ramp when type is modular. **Piecewise (font size):** use `ease: "none"`; line height and letter spacing still use a linear ramp in `t`. |
// | fontScaling.roundLowerValuesTo, roundUpperValuesTo | Rounding grid for font size and line height. |
// | figmaStyles | `createAndUpdateStyles`, `styleNaming` (e.g. `Typography/{$fontScale}/{$fontWeight}`). Legacy: `styles`. |
// | scaling, round* (legacy) | Old top-level keys; use `fontScaling` instead. |
// | generateOverview | Optional boolean (default `false`). When `true`, fills **Render styles — overview** inside **`Design System Foundations`** (see `@Foundation overview`). |
// | overviewStyleFilter | Optional substring for text style names (case-insensitive). When empty, defaults to styles containing `group/` (e.g. `Typography/`). |
// | overviewPreviewText | Optional multiline sample for overview tiles; newline becomes a soft line break in Figma. |
// @DOC_END

// Import functions from libraries
@import { getOrCreateCollection, setupModes, createOrUpdateVariable, extractModes, processVariables } from "@Variables"
@import { applyEase, applyEaseWithExponents, lerp, generatePiecewiseSnappedScale, isPiecewiseScaleType } from "@Math Helpers"
@import { foundationCreateTypographyTextStylesOverview } from "@Foundation overview"

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

// Merge fontScaling into scaling (plus rounding); figmaStyles into styles for existing code paths.
function ensureCompatTypographyConfig(config) {
  if (!config || typeof config !== 'object') return;
  if (config.fontScaling && typeof config.fontScaling === 'object') {
    var fs = config.fontScaling;
    config.scaling = {
      type: fs.type,
      ease: fs.ease,
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

// Musical-interval ratios (same as typescale.com presets); phi ≈ golden ratio 1.618
function getModularScaleRatio(type) {
  if (!type || typeof type !== 'string') return null;
  var map = {
    minorSecond: 1.067,
    majorSecond: 1.125,
    minorThird: 1.2,
    majorThird: 1.25,
    perfectFourth: 1.333,
    augmentedFourth: 1.414,
    perfectFifth: 1.5,
    phi: 1.618
  };
  return map[type] !== undefined ? map[type] : null;
}

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
function resolveCollectionName(config) {
  if (config.collectionName != null && config.collectionName !== '') {
    return config.collectionName;
  }
  var data = config.config || config;
  if (data.collectionName != null && data.collectionName !== '') {
    return data.collectionName;
  }
  if (data.structure && data.structure.variableCollection != null) {
    return data.structure.variableCollection;
  }
  return 'Responsive System';
}

function resolveGroup(config) {
  if (config.group !== undefined && config.group !== null) {
    return config.group;
  }
  var data = config.config || config;
  if (data.group !== undefined && data.group !== null) {
    return data.group;
  }
  if (data.structure && data.structure.variableGroup !== undefined) {
    return data.structure.variableGroup;
  }
  return '';
}

// ========================================
// ADVANCED TYPOGRAPHY SYSTEM CONFIGURATION
// ========================================

var typographyConfigData = typeof typographyConfigData !== 'undefined' ? typographyConfigData : {
  // @CONFIG_START
  collectionName: "Responsive System",
  group: "Typography",

  fontFamily: "Inter",
  fontWeights: {
    "Regular": 400,
    "Semibold": 600
  },

  fontScale: [
    "Text-Tiny",
    "Text-Small",
    "Text-Regular",
    "Text-Large",
    "Heading-6",
    "Heading-5",
    "Heading-4",
    "Heading-3",
    "Heading-2",
    "Heading-1"
  ],
  // Array ["Text-Tiny", "Text-Small", "Text-Regular", "Text-Large", "Heading-6", "Heading-5", "Heading-4", "Heading-3", "Heading-2", "Heading-1"] or string template "Text-{$fontScale}"
  // steps: 10, // If string template is selected, steps is required.

  fontScaling: {
    type: "sine",
    // Range curve (min→base→max): linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio.  
    // Modular scale: minorSecond, majorSecond, minorThird, majorThird, perfectFourth, augmentedFourth, perfectFifth.
    // Piecewise: piecewise, piecewise2, piecewise4
    ease: "in", // none, in, out, inout, outin. Only used for range curves. Ignored for piecewise types.
    roundLowerValuesTo: 1, // Rounding grid for font size and line height.
    roundUpperValuesTo: 2 // Rounding grid for font size and line height.
  },

  figmaStyles: {
    createAndUpdateStyles: true,
    styleNaming: "Typography/{$fontScale}/{$fontWeight}"
  },

  // When true: update **Render styles — overview** inside **Design System Foundations** (after variables and styles run)
  generateOverview: false,
  // overviewStyleFilter: "", // Optional name substring; when empty, uses styles matching `group/`
  // overviewPreviewText: "", // Optional multiline preview copy for overview tiles

  modes: [
    {
      name: "desktop",
      minFont: {
        size: 8,  // Only when Range curve mode is used
        lineHeight: 1.25,
        letterSpacing: 0
      },
      baseFont: {
        level: "Text-Regular",
        size: 18,
        lineHeight: 1.5,
        letterSpacing: -0.2
      },
      maxFont: {
        size: 200, // Only when Range curve mode is used
        lineHeight: 1,
        letterSpacing: -3
      }
    },
    {
      name: "tablet",
      minFont: {
        size: 8,  // Only when Range curve mode is used
        lineHeight: 1.25,
        letterSpacing: 0
      },
      baseFont: {
        level: "Text-Regular",
        size: 16,
        lineHeight: 1.5,
        letterSpacing: -0.2
      },
      maxFont: {
        size: 160, // Only when Range curve mode is used
        lineHeight: 1,
        letterSpacing: -2.5
      }
    },
    {
      name: "mobile",
      minFont: {
        size: 8,  // Only when Range curve mode is used
        lineHeight: 1.5,
        letterSpacing: 0
      },
      baseFont: {
        level: "Text-Regular",
        size: 16,
        lineHeight: 1.25,
        letterSpacing: -0.2
      },
      maxFont: {
        size: 120, // Only when Range curve mode is used
        lineHeight: 1,
        letterSpacing: -2
      }
    }
  ]
  // @CONFIG_END
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

// Range-first OR modular ratio (typescale-style): baseSize × ratio^(step − base), clamped to min/max.
function calculateFluidFontSize(scaleIndex, totalSteps, viewport, config) {
  var minSize = config.fontSizes[viewport].minFont.size;
  var maxSize = config.fontSizes[viewport].maxFont.size;
  var baseSize = config.fontSizes[viewport].baseFont.size;
  var baseIndex = config.fontScale.indexOf(config.fontSizes[viewport].baseFont.level);
  if (baseIndex < 0) {
    console.warn('baseFont.level not found in fontScale, using middle step');
    baseIndex = Math.max(0, Math.floor((totalSteps - 1) / 2));
  }
  var gridSize = getGridSizeForStep(config, scaleIndex, baseIndex);

  var scaling = config.scaling || {};
  var modularRatio = getModularScaleRatio(scaling.type);
  if (modularRatio != null) {
    var exp = scaleIndex - baseIndex;
    var rawMod = baseSize * Math.pow(modularRatio, exp);
    rawMod = Math.max(minSize, Math.min(maxSize, rawMod));
    return roundToGrid(Math.round(rawMod * 100) / 100, gridSize);
  }

  if (isPiecewiseScaleType(scaling.type)) {
    var pwGrid = resolveTypographyPiecewiseSnapGrid(config);
    var piecewiseVals = generatePiecewiseSnappedScale({
      steps: totalSteps,
      min: minSize,
      max: maxSize,
      roundTo: pwGrid,
      type: scaling.type
    });
    if (scaleIndex === baseIndex) {
      return roundToGrid(baseSize, gridSize);
    }
    var pvv = piecewiseVals[scaleIndex];
    if (typeof pvv !== 'number' || isNaN(pvv)) return minSize;
    return Math.max(minSize, Math.min(maxSize, pvv));
  }

  if (scaleIndex === baseIndex) {
    return roundToGrid(baseSize, gridSize);
  }

  var t;
  var startVal;
  var endVal;

  if (scaleIndex < baseIndex) {
    t = baseIndex > 0 ? scaleIndex / baseIndex : 0;
    startVal = minSize;
    endVal = baseSize;
  } else {
    var stepsAboveBase = (totalSteps - 1) - baseIndex;
    t = stepsAboveBase > 0 ? (scaleIndex - baseIndex) / stepsAboveBase : 0;
    startVal = baseSize;
    endVal = maxSize;
  }

  var u = getEasedFactor(config, t);
  var rawSize = lerp(startVal, endVal, u);
  rawSize = Math.max(minSize, Math.min(maxSize, rawSize));
  return roundToGrid(Math.round(rawSize * 100) / 100, gridSize);
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
function variableNamePrefix(group) {
  if (!group || typeof group !== 'string') return '';
  var trimmed = String(group);
  if (trimmed.charAt(0) === '/') trimmed = trimmed.slice(1);
  if (trimmed.charAt(trimmed.length - 1) === '/') trimmed = trimmed.slice(0, -1);
  return trimmed ? trimmed + '/' : '';
}

// Round value to grid (8, 4, or 2 pt). Returns value unchanged if gridSize is falsy or <= 0.
function roundToGrid(value, gridSize) {
  if (!gridSize || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

// Generate variables programmatically
function generateTypographyVariables(config) {
  var variables = {};
  var prefix = variableNamePrefix(resolveGroup({ config: config }));
  
  var viewportNames = Object.keys(config.fontSizes);
  var baseIndex = config.fontScale.indexOf(config.fontSizes[viewportNames[0]].baseFont.level);
  var lastFontSizePerViewport = {};
  viewportNames.forEach(function(viewport) {
    var viewportKey = viewport.charAt(0).toUpperCase() + viewport.slice(1);
    lastFontSizePerViewport[viewportKey] = 0;
  });

  // Generate variables for each font scale step - grouped by scale level
  config.fontScale.forEach(function(scaleName, index) {
    var gridSize = getGridSizeForStep(config, index, baseIndex);
    // Pre-calculate values for each viewport dynamically
    var fontSizeValues = {};
    var lineHeightValues = {};
    var letterSpacingValues = {};
    
    viewportNames.forEach(function(viewport) {
      var viewportKey = viewport.charAt(0).toUpperCase() + viewport.slice(1); // Capitalize first letter
      var maxSize = config.fontSizes[viewport].maxFont.size;
      
      var fontSize = calculateFluidFontSize(index, config.fontScale.length, viewport, config);
      var previous = lastFontSizePerViewport[viewportKey];
      if (index !== baseIndex && fontSize <= previous && previous >= 0) {
        var step = gridSize > 0 ? gridSize : 1;
        fontSize = Math.min(maxSize, previous + step);
      }
      lastFontSizePerViewport[viewportKey] = fontSize;
      
      var lineHeightRatio = calculateFluidLineHeight(index, config.fontScale.length, viewport, config);
      var lineHeightPx = fontSize * lineHeightRatio;
      var lineHeight = gridSize > 0 ? roundToGrid(Math.round(lineHeightPx * 100) / 100, gridSize) : Math.round(lineHeightPx * 100) / 100;
      var letterSpacing = calculateFluidLetterSpacing(index, config.fontScale.length, viewport, config);
      
      fontSizeValues[viewportKey] = fontSize;
      lineHeightValues[viewportKey] = lineHeight;
      letterSpacingValues[viewportKey] = letterSpacing;
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
      var viewportKey = viewport.charAt(0).toUpperCase() + viewport.slice(1);
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
    var viewportKey = viewport.charAt(0).toUpperCase() + viewport.slice(1);
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
  
  var modes = Object.keys(data.fontSizes || {}).map(function(k) {
    return k.charAt(0).toUpperCase() + k.slice(1);
  });
  if (modes.length === 0) {
    modes = extractModes({ variables: config.variables });
  }
  console.log('Detected modes (config order): ' + modes.join(', '));
  
  setupModes(collection, modes);
  
  var stats = await processVariables(collection, config.variables, config.config, modes);
  
  var styleStats = {created: 0, updated: 0};

  function finishTypographySummary(styleStats) {
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
        
        var namePrefix = variableNamePrefix(resolveGroup(config));
        var fontSizeVar = variableList.find(function(v) { return v && v.name === namePrefix + scaleName + '/font-size'; });
        
        var lineHeightVar = variableList.find(function(v) { return v && v.name === namePrefix + scaleName + '/line-height'; });
        
        var letterSpacingVar = variableList.find(function(v) { return v && v.name === namePrefix + scaleName + '/letter-spacing'; });
        
        var fontWeightVar = variableList.find(function(v) { return v && v.name === namePrefix + 'font-weight/' + weightName; });
          
        var fontStyleVar = variableList.find(function(v) { return v && v.name === namePrefix + 'font-style/' + weightName; });
        
        var fontFamilyVar = variableList.find(function(v) { return v && v.name === namePrefix + 'font-family/primary'; });
        
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
        var viewportKey = viewport.charAt(0).toUpperCase() + viewport.slice(1);
        
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
        var variableName = variableNamePrefix(resolveGroup({ config: customConfig })) + scaleName + '/font-size';
        
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
