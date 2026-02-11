// DS Foundation: Typography
// @DOC_START
// # DS Foundation: Typography
// Responsive typography system with range-first scaling and style generation.
//
// ## Overview
// Creates typography variables and optional text styles. Scale is range-first: first step = minFont, base step = baseFont, last step = maxFont per viewport. Steps are spread between min and max (linear or curved), rounded to grid, and enforced distinct (no duplicate sizes). Variables are scoped to their use (font size, line height, letter spacing, etc.). Optionally creates an overview frame showing all scale steps per viewport.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | fontFamily | Font family name (e.g. Inter). |
// | fontWeights | Map of weight names to numeric values (e.g. regular: 400, semibold: 600). |
// | structure.variableCollection | Name of the variable collection. |
// | structure.variableGroup | Optional group path within the collection. |
// | fontScale | Array of scale step names (e.g. 3xs … 10xl). |
// | scaling.type | Curve type: linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio (ignored if easeInExponent is set). |
// | scaling.ease | Easing: none, in, out, inout, outin. Shapes step distribution (e.g. "in" = more steps near base). |
// | scaling.easeInExponent | Optional. If set (e.g. 1.2), use power curve instead of type. Typical 0.2–5. |
// | scaling.easeOutExponent | Optional. Used with easeInExponent; defaults to easeInExponent if omitted. |
// | roundLowerValuesTo | Grid for steps from min to base (e.g. 2 = finer; 0 = no rounding). Applies to font size and line height. |
// | roundUpperValuesTo | Grid for steps above base (e.g. 4 or 8 = coarser; 0 = no rounding). Letter spacing is always fractional. |
// | debugScaleJson | If true, log "Generated scales" JSON for the first viewport to the console. |
// | fontSizes | Per viewport (desktop, tablet, mobile): minFont, baseFont, maxFont. Scale fills [minFont, maxFont]; last step = maxFont. |
// | styles.createAndUpdateStyles | If true, creates/updates text styles. |
// | styles.styleNaming | Naming template for styles (e.g. {$fontScale}/{$fontWeight}). |
// @DOC_END

// Import functions from libraries
@import { getOrCreateCollection, setupModes, createOrUpdateVariable, extractModes, processVariables } from "@Variables"
@import { applyEase, applyEaseWithExponents, lerp } from "@Math Helpers"

// ========================================
// ADVANCED TYPOGRAPHY SYSTEM CONFIGURATION
// ========================================

var typographyConfigData = typeof typographyConfigData !== 'undefined' ? typographyConfigData : {
  // @CONFIG_START
  // Configuration values (NOT added as variables)
  fontFamily: "Inter",
  fontWeights: {
    regular: 400,
    semibold: 600
  },
  // Alternative font weight configurations (examples):
  // fontWeights: { 'primary': 400, 'secondary': 600 },
  // fontWeights: { 'regular': 'Light', 'semibold': 'Bold' },
  // fontWeights: { 'normal': 'Regular', 'quote': 'Italic' },
  structure: {
    variableCollection: "Typography",
    variableGroup: ""
  },
  fontScale: ["3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl", "10xl"],
  styles: {
    createAndUpdateStyles: true,
    styleNaming: "{$fontScale}/{$fontWeight}"
  },
  scaling: {
    type: "sine", // linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio (ignored if easeInExponent set)
    ease: "in",   // none, in, out, inout, outin
    // Optional two-number alternative: set easeInExponent (and optionally easeOutExponent) to use power curves instead of type
    // easeInExponent: 3,
    // easeOutExponent: 0.6
  },
  roundLowerValuesTo: 1,  // grid for steps from min to base (e.g. 2 = finer; 0 = no rounding)
  roundUpperValuesTo: 2,  // grid for steps above base (e.g. 4 or 8 = coarser; 0 = no rounding)
  debugScaleJson: false,  // if true, log "Generated scales" JSON for first viewport to console
  fontSizes: {
    desktop: {
      minFont: {
        size: 8,
        lineHeight: 1.25,
        letterSpacing: 0
      },
      baseFont: {
        level: "md",
        size: 18,
        lineHeight: 1.5,
        letterSpacing: -0.2
      },
      maxFont: {
        size: 200,
        lineHeight: 1,
        letterSpacing: -3
      }
    },
    tablet: {
      minFont: {
        size: 8,
        lineHeight: 1.25,
        letterSpacing: 0
      },
      baseFont: {
        level: "md",
        size: 16,
        lineHeight: 1.5,
        letterSpacing: -0.2
      },
      maxFont: {
        size: 160,
        lineHeight: 1,
        letterSpacing: -2.5
      }
    },
    mobile: {
      minFont: {
        size: 8,
        lineHeight: 1.5,
        letterSpacing: 0
      },
      baseFont: {
        level: "md",
        size: 16,
        lineHeight: 1.25,
        letterSpacing: -0.2
      },
      maxFont: {
        size: 120,
        lineHeight: 1,
        letterSpacing: -2
      }
    }
  }
  // @CONFIG_END
};

// Create the main configuration object that the execution section expects
var typographyConfig = typeof typographyConfig !== 'undefined' ? typographyConfig : {
  collectionName: typographyConfigData.structure.variableCollection,
  config: typographyConfigData
};

// Grid for a given step: lower steps (min→base) use roundLowerValuesTo; upper steps (above base) use roundUpperValuesTo.
function getGridSizeForStep(config, scaleIndex, baseIndex) {
  var lower = config.roundLowerValuesTo;
  var upper = config.roundUpperValuesTo;
  var gridLower = (lower === undefined || lower === null) ? 0 : (typeof lower === 'number' ? lower : 0);
  var gridUpper = (upper === undefined || upper === null) ? 0 : (typeof upper === 'number' ? upper : 0);
  return scaleIndex <= baseIndex ? gridLower : gridUpper;
}

// Map user ease (in, out, inout, outin, none) to library (easeIn, easeOut, etc.)
function mapEaseToLibrary(ease) {
  if (!ease || ease === "none") return "none";
  if (ease === "in") return "easeIn";
  if (ease === "out") return "easeOut";
  if (ease === "inout") return "easeInOut";
  if (ease === "outin") return "easeOutIn";
  return "none";
}

// Map user type (expo) to library (exponential)
function mapTypeToLibrary(type) {
  if (!type) return "linear";
  if (type === "expo") return "exponential";
  if (type === "goldenratio") return "goldenRatio";
  // quad, quart, circ passed through as-is
  return type;
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

// Range-first: steps from minFont to baseFont to maxFont. Use getEasedFactor then lerp from @Math Helpers.
function calculateFluidFontSize(scaleIndex, totalSteps, viewport, config) {
  var minSize = config.fontSizes[viewport].minFont.size;
  var maxSize = config.fontSizes[viewport].maxFont.size;
  var baseSize = config.fontSizes[viewport].baseFont.size;
  var baseIndex = config.fontScale.indexOf(config.fontSizes[viewport].baseFont.level);
  var gridSize = getGridSizeForStep(config, scaleIndex, baseIndex);

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

  var u = getEasedFactor(config, t);
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

  var u = getEasedFactor(config, t);
  var letterSpacing = lerp(startVal, endVal, u);
  return Math.round(letterSpacing * 100) / 100;
}

// Helper: variable name prefix (no leading slash when group is empty — Figma rejects names like "/md/font-size")
function variableNamePrefix(group) {
  return group ? group + '/' : '';
}

// Round value to grid (8, 4, or 2 pt). Returns value unchanged if gridSize is falsy or <= 0.
function roundToGrid(value, gridSize) {
  if (!gridSize || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

// Scale sizes for one viewport and one (type, ease): piecewise + curve + rounding (no distinct-step nudge).
// Used for variable generation (which then applies nudge) and for "Generated scales" JSON export.
function getScaleSizesForViewport(config, viewport, curveType, ease) {
  var override = {
    fontScale: config.fontScale,
    fontSizes: config.fontSizes,
    scaling: { type: curveType, ease: ease },
    roundLowerValuesTo: config.roundLowerValuesTo,
    roundUpperValuesTo: config.roundUpperValuesTo,
    structure: config.structure
  };
  var n = config.fontScale.length;
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push(calculateFluidFontSize(i, n, viewport, override));
  }
  return out;
}

// All curve types and eases for the "Generated scales" matrix (labels × type × ease).
var SCALE_JSON_TYPES = ["linear", "sine", "quad", "cubic", "quart", "quint", "circ", "exponential", "goldenratio"];
var SCALE_JSON_EASES = ["none", "in", "out", "inout", "outin"];

// Build { labels, scales: { [type]: { [ease]: [ ... ] } } } for a viewport (e.g. desktop).
function generateScaleJson(config, viewport) {
  var scales = {};
  SCALE_JSON_TYPES.forEach(function(type) {
    scales[type] = {};
    SCALE_JSON_EASES.forEach(function(ease) {
      scales[type][ease] = getScaleSizesForViewport(config, viewport, type, ease);
    });
  });
  return {
    labels: config.fontScale.slice(),
    scales: scales
  };
}

// Generate variables programmatically
function generateTypographyVariables(config) {
  var variables = {};
  var prefix = variableNamePrefix(config.structure.variableGroup);
  
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
  
  // Font weights - handle both numeric (400, 600) and string ('Light', 'Bold') values
  // Use the same modes as font sizes for consistency
  var viewportNames = Object.keys(config.fontSizes);
  
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
var typographyConfig = {
  config: typographyConfigData,
  variables: generateTypographyVariables(typographyConfigData)
};

// ========================================
// CORE FUNCTIONS
// ========================================

function createOrUpdateCollection(config) {
  console.log('=== ADVANCED TYPOGRAPHY SYSTEM MANAGER ===');
  var collectionName = config.config.structure.variableCollection;
  var groupName = config.config.structure.variableGroup;
  console.log('Processing collection: ' + collectionName + ' (group: ' + groupName + ')');
  
  // Get or create collection using imported function
  var collection = getOrCreateCollection(collectionName);
  
  // Extract modes from variable values or use default (imported function)
  var modes = extractModes({variables: config.variables});
  console.log('Detected modes: ' + modes.join(', '));
  
  // Setup modes (imported function)
  setupModes(collection, modes);
  
  // Process all variables with the same responsive modes (Mobile, Tablet, Desktop)
  var stats = processVariables(collection, config.variables, config.config, modes);
  
  // Create text styles if enabled
  var styleStats = {created: 0, updated: 0};
  if (config.config.styles.createAndUpdateStyles) {
    console.log('Creating/updating text styles...');
    styleStats = createOrUpdateTextStyles(config, collection);
  }

  // Create overview frames for viewport preview
  console.log('Creating typography overview frames...');
  createOverviewFrames(config, collection);

  console.log('=== TYPOGRAPHY SYSTEM SUMMARY ===');
  console.log('Collection: ' + collectionName);
  console.log('Variables created: ' + stats.created);
  console.log('Variables updated: ' + stats.updated);
  console.log('Variables skipped: ' + stats.skipped);
  console.log('Text styles created: ' + styleStats.created);
  console.log('Text styles updated: ' + styleStats.updated);

  if (config.config.debugScaleJson) {
    var viewport = Object.keys(config.config.fontSizes)[0] || 'desktop';
    console.log('Generated scales (type × ease) for viewport: ' + viewport);
    console.log(JSON.stringify(generateScaleJson(config.config, viewport), null, 2));
  }
  
  return {
    collection: collection,
    stats: stats,
    styleStats: styleStats
  };
}

// Function to create or update text styles using the variables
function createOrUpdateTextStyles(config, collection) {
  var stats = {created: 0, updated: 0};
  var existingStyles = figma.getLocalTextStyles();
  
  
  try {
    // Create styles for each font scale and weight combination
    config.config.fontScale.forEach(function(scaleName) {
      Object.keys(config.config.fontWeights).forEach(function(weightName) {
        // Generate style name using the naming pattern
        var styleName = config.config.styles.styleNaming
          .replace('{$fontScale}', scaleName)
          .replace('{$fontWeight}', weightName);
        
        // Check if style already exists
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
        
        // Find the corresponding variables in the collection (same naming as generateTypographyVariables)
        var namePrefix = variableNamePrefix(config.config.structure.variableGroup);
        var fontSizeVar = collection.variableIds
          .map(function(id) { return figma.variables.getVariableById(id); })
          .find(function(v) { return v && v.name === namePrefix + scaleName + '/font-size'; });
        
        var lineHeightVar = collection.variableIds
          .map(function(id) { return figma.variables.getVariableById(id); })
          .find(function(v) { return v && v.name === namePrefix + scaleName + '/line-height'; });
        
        var letterSpacingVar = collection.variableIds
          .map(function(id) { return figma.variables.getVariableById(id); })
          .find(function(v) { return v && v.name === namePrefix + scaleName + '/letter-spacing'; });
        
        // Look for both numeric font weight and font style variables
        var fontWeightVar = collection.variableIds
          .map(function(id) { return figma.variables.getVariableById(id); })
          .find(function(v) { return v && v.name === namePrefix + 'font-weight/' + weightName; });
          
        var fontStyleVar = collection.variableIds
          .map(function(id) { return figma.variables.getVariableById(id); })
          .find(function(v) { return v && v.name === namePrefix + 'font-style/' + weightName; });
        
        var fontFamilyVar = collection.variableIds
          .map(function(id) { return figma.variables.getVariableById(id); })
          .find(function(v) { return v && v.name === namePrefix + 'font-family/primary'; });
        
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
  var collectionName = config.config.structure.variableCollection;
  var prefix = variableNamePrefix(config.config.structure.variableGroup);
  var viewportNames = Object.keys(config.config.fontSizes);
  var fontFamily = config.config.fontFamily;
  var styleNaming = config.config.styles.styleNaming || '{$fontScale}/{$fontWeight}';
  var existingStyles = figma.getLocalTextStyles();
  var weightNames = Object.keys(config.config.fontWeights);
  var scalingRoundingLabel = getScalingRoundingLabel(config.config);

  var fontLoads = weightNames.map(function(weightName) {
    var weightValue = config.config.fontWeights[weightName];
    var styleName = typeof weightValue === 'number'
      ? fontWeightToStyleName(weightValue)
      : String(weightValue);
    return figma.loadFontAsync({ family: fontFamily, style: styleName });
  });

  return Promise.all(fontLoads).then(function() {
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

try {
  var result = createOrUpdateCollection(typographyConfig);
  var message = '✅ Typography: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' updated';
  if (result.styleStats.created > 0 || result.styleStats.updated > 0) {
    message += ', ' + result.styleStats.created + ' styles created, ' + result.styleStats.updated + ' styles updated';
  }
  figma.notify(message);
} catch (error) {
  console.error('Error:', error);
  figma.notify('❌ Error: ' + error.message);
}

// ========================================
// SIMPLE API FOR CUSTOM CONFIGURATIONS
// ========================================

// Simple function to create a complete typography system with custom config
function createTypographySystem(customConfig) {
  try {
    // Generate variables in the correct format for processVariables
    var typographyVariables = {};
    
    // Generate font size variables
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
        var variableName = variableNamePrefix(customConfig.structure.variableGroup) + scaleName + '/font-size';
        
        if (!typographyVariables[variableName]) {
          typographyVariables[variableName] = {
            type: 'FLOAT',
            values: {}
          };
        }
        typographyVariables[variableName].values[viewportKey] = Math.round(fontSize);
      });
    });
    
    // Create collection and process variables
    var collection = getOrCreateCollection(customConfig.structure.variableCollection);
    var modes = extractModes({variables: typographyVariables});
    setupModes(collection, modes);
    var result = processVariables(collection, typographyVariables, null, modes);
    
    figma.notify('✅ Typography system created: ' + result.created + ' variables created!');
    return result;
    
  } catch (error) {
    figma.notify('❌ Error: ' + error.message);
    throw error;
  }
}
