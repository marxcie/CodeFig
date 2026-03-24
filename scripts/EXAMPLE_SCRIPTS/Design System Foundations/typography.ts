// Typography
// @DOC_START
// # Typography
// Responsive typography system with range-first scaling and style generation.
//
// ## Overview
// Creates typography variables and optional text styles. **Range mode:** min → base → max per viewport with easing between steps. **Modular mode** (`fontScaling.type` = minorSecond … perfectFifth, `phi`): font size = base × ratio^(step−base), clamped to min/max. Line height and letter spacing always use the range model. Optionally creates overview frames.
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
// | fontScaling.type | **Range curve** (min→base→max): linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio. **Modular scale** (like [typescale.com](https://typescale.com/)): minorSecond, majorSecond, minorThird, majorThird, perfectFourth, augmentedFourth, perfectFifth, phi (1.618). Modular uses `baseFont.size × ratio^(step−base)` clamped to min/max. |
// | fontScaling.ease | For range curves: none, in, out, inout, outin. Ignored for modular types (font size); still used for line height / letter spacing with a linear ramp when type is modular. |
// | fontScaling.roundLowerValuesTo / roundUpperValuesTo | Rounding grid for font size and line height. |
// | figmaStyles | `createAndUpdateStyles`, `styleNaming` (e.g. `Typography/{$fontScale}/{$fontWeight}`). Legacy: `styles`. |
// | scaling / round* (legacy) | Old top-level keys; use `fontScaling` instead. |
// @DOC_END

// Import functions from libraries
@import { getOrCreateCollection, setupModes, createOrUpdateVariable, extractModes, processVariables } from "@Variables"
@import { applyEase, applyEaseWithExponents, lerp } from "@Math Helpers"

// ========================================
// CONFIG HELPERS (collection / modes / fontSizes)
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

/** Merge `fontScaling` → `scaling` + rounding; `figmaStyles` → `styles` for existing code paths. */
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

/** Resolve collection name from wrapper `{ config, collectionName }` or raw data object. */
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

  fontScaling: {
    type: "sine",
    // Range curve (min→base→max): linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio. 
    // Modular scale (like typescale.com): minorSecond, majorSecond, minorThird, majorThird, perfectFourth, augmentedFourth, perfectFifth. 
    ease: "in",
    roundLowerValuesTo: 1,
    roundUpperValuesTo: 2
  },

  figmaStyles: {
    createAndUpdateStyles: true,
    styleNaming: "Typography/{$fontScale}/{$fontWeight}"
  },

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

/** When font size uses a modular ratio, line/letter spacing use range lerp with linear curve (not modular names). */
function getSpacingScalingType(config) {
  var scaling = config.scaling || {};
  var st = scaling.type || 'linear';
  if (isModularScaleType(st)) return 'linear';
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

// Helper: variable name prefix (no leading slash or empty path — Figma rejects names like "/md/font-size" or "//3xs/font-size")
function variableNamePrefix(group) {
  if (!group || typeof group !== 'string') return '';
  var trimmed = group.replace(/^\//, '').replace(/\/$/, '');
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

// ========================================
// CORE FUNCTIONS
// ========================================

async function createOrUpdateCollection(config) {
  var data = config.config || config;
  ensureCompatTypographyConfig(data);
  materializeFontSizes(data);

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
      console.log('Creating typography overview frames...');
      return createOverviewFrames(config, collection).then(function() {
        return finishTypographySummary(styleStats);
      });
    });
  }
  console.log('Creating typography overview frames...');
  return createOverviewFrames(config, collection).then(function() {
    return finishTypographySummary(styleStats);
  });
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

// Map numeric font weight to Figma style name for loading font
function fontWeightToStyleName(weight) {
  if (typeof weight !== 'number') return 'Regular';
  if (weight <= 400) return 'Regular';
  if (weight < 600) return 'Medium';
  if (weight < 700) return 'Semi Bold';
  return 'Bold';
}

// Resolve style name from template (e.g. {$fontScale}/{$fontWeight} -> "md/regular")
function resolveStyleName(styleNaming, scaleName, weightName) {
  return styleNaming
    .replace(/\{\$fontScale\}/g, scaleName)
    .replace(/\{\$fontWeight\}/g, weightName);
}

// Format a value as script-style literal (same syntax as between // @CONFIG_START and // @CONFIG_END).
function formatConfigValue(val, indent) {
  indent = indent || 0;
  var pad = '';
  for (var i = 0; i < indent; i++) pad += ' ';
  var pad2 = pad + '  ';
  if (val === null) return 'null';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'string') return JSON.stringify(val);
  if (Array.isArray(val)) {
    var arrParts = val.map(function(item) { return formatConfigValue(item, indent + 2); });
    return '[' + arrParts.join(', ') + ']';
  }
  if (typeof val === 'object') {
    var keys = Object.keys(val);
    var lines = keys.map(function(k) {
      var kStr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
      return pad2 + kStr + ': ' + formatConfigValue(val[k], indent + 2);
    });
    return '{\n' + lines.join(',\n') + '\n' + pad + '}';
  }
  return 'undefined';
}

// Full config as script-style block (content only, no outer braces) for pasting between // @CONFIG_START and // @CONFIG_END.
function getFullConfigString(config) {
  try {
    var lines = [];
    var keys = Object.keys(config);
    keys.forEach(function(key) {
      var keyStr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
      lines.push('  ' + keyStr + ': ' + formatConfigValue(config[key], 2));
    });
    return lines.join(',\n');
  } catch (e) {
    return 'config (serialization failed)';
  }
}

// Build scaling/rounding label for overview frame names (e.g. "linear, in | 2/4")
function getScalingRoundingLabel(config) {
  var type = (config.scaling && config.scaling.type) ? config.scaling.type : 'linear';
  var ease = (config.scaling && config.scaling.ease) ? config.scaling.ease : 'none';
  var lower = config.roundLowerValuesTo;
  var upper = config.roundUpperValuesTo;
  var lowerStr = (lower === undefined || lower === null) ? '0' : String(lower);
  var upperStr = (upper === undefined || upper === null) ? '0' : String(upper);
  return type + ', ' + ease + ' | ' + lowerStr + '/' + upperStr;
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

// Create overview frames: one row per scale; each row = vertical stack of weights (same folder), no gap. Scaling/rounding in frame name.
function createOverviewFrames(config, collection) {
  var collectionName = resolveCollectionName(config);
  var prefix = variableNamePrefix(resolveGroup(config));
  var viewportNames = Object.keys(config.config.fontSizes);
  var fontFamily = config.config.fontFamily;
  var styleNaming = getFigmaStyles(config.config).styleNaming || '{$fontScale}/{$fontWeight}';
  var weightNames = Object.keys(config.config.fontWeights);
  var scalingRoundingLabel = getScalingRoundingLabel(config.config);

  var fontLoads = weightNames.map(function(weightName) {
    var weightValue = config.config.fontWeights[weightName];
    var styleName = typeof weightValue === 'number'
      ? fontWeightToStyleName(weightValue)
      : String(weightValue);
    return figma.loadFontAsync({ family: fontFamily, style: styleName });
  });

  return Promise.all(fontLoads.concat([figma.getLocalTextStylesAsync()])).then(function(results) {
    var existingStyles = results[results.length - 1];
    var parentFrame = figma.createFrame();
    parentFrame.name = 'Typography Overview - ' + collectionName + ' (' + scalingRoundingLabel + ')';
    parentFrame.layoutMode = 'HORIZONTAL';
    parentFrame.primaryAxisSizingMode = 'AUTO';
    parentFrame.counterAxisSizingMode = 'AUTO';
    parentFrame.itemSpacing = 100;
    parentFrame.paddingLeft = 24;
    parentFrame.paddingRight = 24;
    parentFrame.paddingTop = 24;
    parentFrame.paddingBottom = 24;

    viewportNames.forEach(function(viewport) {
      var viewportKey = viewport.charAt(0).toUpperCase() + viewport.slice(1);
      var viewportFrame = figma.createFrame();
      viewportFrame.name = viewportKey + ' (' + scalingRoundingLabel + ')';
      viewportFrame.layoutMode = 'VERTICAL';
      viewportFrame.primaryAxisSizingMode = 'AUTO';
      viewportFrame.counterAxisSizingMode = 'AUTO';
      viewportFrame.itemSpacing = 12;
      viewportFrame.paddingLeft = 16;
      viewportFrame.paddingRight = 16;
      viewportFrame.paddingTop = 16;
      viewportFrame.paddingBottom = 16;

      var titleText = figma.createText();
      titleText.characters = viewportKey;
      titleText.fontName = { family: fontFamily, style: 'Regular' };
      titleText.fontSize = 20;
      titleText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
      viewportFrame.appendChild(titleText);

      var configInfoText = figma.createText();
      configInfoText.characters = getFullConfigString(config.config);
      configInfoText.fontName = { family: fontFamily, style: 'Regular' };
      configInfoText.fontSize = 11;
      configInfoText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
      viewportFrame.appendChild(configInfoText);
      configInfoText.textTruncation = 'ENDING';
      configInfoText.maxLines = 1;
      configInfoText.maxWidth = 420;

      config.config.fontScale.forEach(function(scaleName) {
        var fontSizeVar = config.variables[prefix + scaleName + '/font-size'];
        if (!fontSizeVar || !fontSizeVar.values[viewportKey]) return;
        var fontSize = fontSizeVar.values[viewportKey];
        var rowFrame = figma.createFrame();
        rowFrame.name = scaleName;
        rowFrame.layoutMode = 'VERTICAL';
        rowFrame.primaryAxisSizingMode = 'AUTO';
        rowFrame.counterAxisSizingMode = 'AUTO';
        rowFrame.itemSpacing = 0;

        weightNames.forEach(function(weightName) {
          var styleName = resolveStyleName(styleNaming, scaleName, weightName);
          var style = existingStyles.find(function(s) { return s.name === styleName; });
          if (!style) return;
          var cell = figma.createText();
          cell.characters = scaleName + ' ' + fontSize;
          cell.textStyleId = style.id;
          cell.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
          rowFrame.appendChild(cell);
        });

        if (rowFrame.children.length > 0) {
          viewportFrame.appendChild(rowFrame);
        }
      });

      // Apply this viewport's variable mode to the frame so variables resolve to Desktop/Tablet/Mobile
      var mode = collection.modes.find(function(m) { return m.name === viewportKey; });
      if (mode && typeof viewportFrame.setExplicitVariableModeForCollection === 'function') {
        viewportFrame.setExplicitVariableModeForCollection(collection, mode.modeId);
      }

      parentFrame.appendChild(viewportFrame);
    });

    figma.currentPage.appendChild(parentFrame);
    figma.viewport.scrollAndZoomIntoView([parentFrame]);
    return parentFrame;
  }).catch(function(err) {
    console.warn('Could not create typography overview (font load failed):', err.message);
    return null;
  });
}

// ========================================
// EXECUTION
// ========================================

createOrUpdateCollection(typographyConfig).then(function(result) {
  var message = '✅ Typography: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' updated';
  if (result.styleStats && (result.styleStats.created > 0 || result.styleStats.updated > 0)) {
    message += ', ' + result.styleStats.created + ' styles created, ' + result.styleStats.updated + ' styles updated';
  }
  figma.notify(message);
}).catch(function(error) {
  console.error('Error:', error);
  figma.notify('❌ Error: ' + error.message);
});

// ========================================
// SIMPLE API FOR CUSTOM CONFIGURATIONS
// ========================================

// Simple function to create a complete typography system with custom config
async function createTypographySystem(customConfig) {
  try {
    ensureCompatTypographyConfig(customConfig);
    materializeFontSizes(customConfig);
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
    
    figma.notify('✅ Typography system created: ' + result.created + ' variables created!');
    return result;
    
  } catch (error) {
    figma.notify('❌ Error: ' + error.message);
    throw error;
  }
}
