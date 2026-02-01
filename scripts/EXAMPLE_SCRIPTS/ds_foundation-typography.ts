// DS Foundation: Typography
// Advanced responsive typography system with fluid scaling and style generation

// Import functions from libraries
@import { getOrCreateCollection, setupModes, createOrUpdateVariable, extractModes, processVariables } from "@Variables"

// ========================================
// ADVANCED TYPOGRAPHY SYSTEM CONFIGURATION
// ========================================

// Configuration values (NOT added as variables)
// Use existing config if already defined, otherwise use default
var typographyConfigData = typeof typographyConfigData !== 'undefined' ? typographyConfigData : {
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
  fontScale: ["3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"],
  fontSizes: {
    desktop: {
        baseFont: {
          level: "md",
          size: 16,
          lineHeight: 1.5,
          letterSpacing: -0.2
        },
        minFont: {
          size: 8,
          lineHeight: 1.25,
          letterSpacing: 0,
          force: 0
        },
        maxFont: {
          size: 200,
          lineHeight: 1,
          letterSpacing: -3,
          force: -1.1
        }
    },
    tablet: {
      baseFont: {
        level: "md",
        size: 16,
        lineHeight: 1.5,
        letterSpacing: -0.2
      },
      minFont: {
        size: 8,
        lineHeight: 1.25,
        letterSpacing: 0,
        force: 0
      },
      maxFont: {
        size: 160,
        lineHeight: 1,
        letterSpacing: -2.5,
        force: -1.1
      }
    },
    mobile: {
      baseFont: {
        level: "md",
        size: 16,
        lineHeight: 1.25,
        letterSpacing: -0.2
      },
      minFont: {
        size: 8,
        lineHeight: 1.5,
        letterSpacing: 0,
        force: 0
      },
      maxFont: {
        size: 120,
        lineHeight: 1,
        letterSpacing: -2,
        force: -1.1
      }
    }
  },
  styles: {
    createAndUpdateStyles: true,
    styleNaming: "{$fontScale}/{$fontWeight}"
  },
  scalingMethod: "multiplicative" // Options: "additive" (current) or "multiplicative"
};

// Create the main configuration object that the execution section expects
var typographyConfig = typeof typographyConfig !== 'undefined' ? typographyConfig : {
  collectionName: typographyConfigData.structure.variableCollection,
  config: typographyConfigData
};

// Helper function to calculate fluid font size with force parameter
function calculateFluidFontSize(scaleIndex, totalSteps, viewport, config) {
  var minSize = config.fontSizes[viewport].minFont.size;
  var maxSize = config.fontSizes[viewport].maxFont.size;
  var baseSize = config.fontSizes[viewport].baseFont.size;
  var baseIndex = config.fontScale.indexOf(config.fontSizes[viewport].baseFont.level);
  var scalingMethod = config.scalingMethod || "additive";
  
  if (scaleIndex === baseIndex) {
    return baseSize;
  }
  
  var size;
  
  if (scalingMethod === "multiplicative") {
    // Your previous multiplicative approach
    size = calculateMultiplicativeSize(scaleIndex, totalSteps, baseIndex, baseSize, minSize, maxSize, config.fontSizes[viewport]);
  } else {
    // Current additive approach
    if (scaleIndex < baseIndex) {
      // Below base: interpolate between min and base
      var stepsFromMin = scaleIndex;
      var totalStepsToBase = baseIndex;
      var normalizedPosition = stepsFromMin / totalStepsToBase;
      var force = config.fontSizes[viewport].minFont.force;
      
      // Apply force curve
      var curve = applyForceCurve(normalizedPosition, force);
      size = minSize + (baseSize - minSize) * curve;
    } else {
      // Above base: interpolate between base and max
      var stepsFromBase = scaleIndex - baseIndex;
      var totalStepsToMax = (totalSteps - 1) - baseIndex;
      var normalizedPosition = stepsFromBase / totalStepsToMax;
      var force = config.fontSizes[viewport].maxFont.force;
      
      // Apply force curve
      var curve = applyForceCurve(normalizedPosition, force);
      size = baseSize + (maxSize - baseSize) * curve;
    }
  }
  
  return Math.round(size);
}

// Helper function for multiplicative scaling (your previous approach)
function calculateMultiplicativeSize(scaleIndex, totalSteps, baseIndex, baseSize, minSize, maxSize, fontSizeConfig) {
  if (scaleIndex < baseIndex) {
    // Below base: use minSize as scale reference
    var stepsFromMin = scaleIndex;
    var totalStepsToBase = baseIndex;
    var normalizedPosition = stepsFromMin / totalStepsToBase;
    var force = fontSizeConfig.minFont.force;
    
    // Scale ratio from min to base
    var scaleRatio = Math.max(1, baseSize / Math.max(1, minSize));
    var curvePosition = Math.pow(normalizedPosition, Math.abs(force) || 1);
    
    return minSize * Math.pow(scaleRatio, curvePosition);
  } else {
    // Above base: use your exact formula
    var stepsFromBase = scaleIndex - baseIndex;
    var totalStepsToMax = (totalSteps - 1) - baseIndex;
    var normalizedPosition = stepsFromBase / totalStepsToMax; // (scaleIndex - baseIndex) / totalStepsAboveBase
    var force = fontSizeConfig.maxFont.force;
    
    // Your exact formula: baseFont * Math.pow(Math.max(1, maxFont/baseFont), Math.pow(position, curve))
    var scaleRatio = Math.max(1, maxSize / Math.max(1, baseSize)); // maxFont/baseFont
    var curvePosition = Math.pow(normalizedPosition, Math.abs(force) || 1); // Math.pow(position, curve)
    
    return baseSize * Math.pow(scaleRatio, curvePosition);
  }
}

// Helper function to apply force curve (matches your visualization)
function applyForceCurve(normalizedPosition, force) {
  if (force === 0) {
    return normalizedPosition; // Linear (0 line in your chart)
  } else if (force > 0) {
    // Positive force: exponential curve (curves upward like +1 in your chart)
    return Math.pow(normalizedPosition, 1 / (1 + force));
  } else {
    // Negative force: logarithmic curve (curves downward like -1 in your chart)
    return 1 - Math.pow(1 - normalizedPosition, 1 / (1 + Math.abs(force)));
  }
}

// Helper function to calculate line height with proper scaling
function calculateFluidLineHeight(scaleIndex, totalSteps, viewport, config) {
  var fontSizes = config.fontSizes[viewport];
  var baseIndex = config.fontScale.indexOf(fontSizes.baseFont.level);
  
  var minLineHeight = fontSizes.minFont.lineHeight;
  var baseLineHeight = fontSizes.baseFont.lineHeight;
  var maxLineHeight = fontSizes.maxFont.lineHeight;
  
  if (scaleIndex === baseIndex) {
    return baseLineHeight;
  }
  
  var lineHeight;
  
  if (scaleIndex < baseIndex) {
    // Below base: interpolate between min and base
    var stepsFromMin = scaleIndex;
    var totalStepsToBase = baseIndex;
    var normalizedPosition = totalStepsToBase > 0 ? stepsFromMin / totalStepsToBase : 0;
    var force = fontSizes.minFont.force;
    
    var curve = applyForceCurve(normalizedPosition, force);
    lineHeight = minLineHeight + (baseLineHeight - minLineHeight) * curve;
  } else {
    // Above base: interpolate between base and max
    var stepsFromBase = scaleIndex - baseIndex;
    var totalStepsToMax = (totalSteps - 1) - baseIndex;
    var normalizedPosition = stepsFromBase / totalStepsToMax;
    var force = fontSizes.maxFont.force;
    
    var curve = applyForceCurve(normalizedPosition, force);
    lineHeight = baseLineHeight + (maxLineHeight - baseLineHeight) * curve;
  }
  
  return lineHeight;
}

// Helper function to calculate letter spacing with proper scaling
function calculateFluidLetterSpacing(scaleIndex, totalSteps, viewport, config) {
  var fontSizes = config.fontSizes[viewport];
  var baseIndex = config.fontScale.indexOf(fontSizes.baseFont.level);
  
  var minLetterSpacing = fontSizes.minFont.letterSpacing;
  var baseLetterSpacing = fontSizes.baseFont.letterSpacing;
  var maxLetterSpacing = fontSizes.maxFont.letterSpacing;
  
  if (scaleIndex === baseIndex) {
    return baseLetterSpacing;
  }
  
  var letterSpacing;
  
  if (scaleIndex < baseIndex) {
    // Below base: interpolate between min and base
    var stepsFromMin = scaleIndex;
    var totalStepsToBase = baseIndex;
    var normalizedPosition = totalStepsToBase > 0 ? stepsFromMin / totalStepsToBase : 0;
    var force = fontSizes.minFont.force;
    
    var curve = applyForceCurve(normalizedPosition, force);
    letterSpacing = minLetterSpacing + (baseLetterSpacing - minLetterSpacing) * curve;
  } else {
    // Above base: interpolate between base and max
    var stepsFromBase = scaleIndex - baseIndex;
    var totalStepsToMax = (totalSteps - 1) - baseIndex;
    var normalizedPosition = stepsFromBase / totalStepsToMax;
    var force = fontSizes.maxFont.force;
    
    var curve = applyForceCurve(normalizedPosition, force);
    letterSpacing = baseLetterSpacing + (maxLetterSpacing - baseLetterSpacing) * curve;
  }
  
  return letterSpacing;
}

// Helper: variable name prefix (no leading slash when group is empty — Figma rejects names like "/md/font-size")
function variableNamePrefix(group) {
  return group ? group + '/' : '';
}

// Generate variables programmatically
function generateTypographyVariables(config) {
  var variables = {};
  var prefix = variableNamePrefix(config.structure.variableGroup);
  
  // Generate variables for each font scale step - grouped by scale level
  config.fontScale.forEach(function(scaleName, index) {
    // Get viewport names in the order they appear in config
    var viewportNames = Object.keys(config.fontSizes);
    
    // Pre-calculate values for each viewport dynamically
    var fontSizeValues = {};
    var lineHeightValues = {};
    var letterSpacingValues = {};
    
    viewportNames.forEach(function(viewport) {
      var viewportKey = viewport.charAt(0).toUpperCase() + viewport.slice(1); // Capitalize first letter
      
      var fontSize = calculateFluidFontSize(index, config.fontScale.length, viewport, config);
      var lineHeightRatio = calculateFluidLineHeight(index, config.fontScale.length, viewport, config);
      var lineHeight = Math.round(fontSize * lineHeightRatio);
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
  
  console.log('=== TYPOGRAPHY SYSTEM SUMMARY ===');
  console.log('Collection: ' + collectionName);
  console.log('Variables created: ' + stats.created);
  console.log('Variables updated: ' + stats.updated);
  console.log('Variables skipped: ' + stats.skipped);
  console.log('Text styles created: ' + styleStats.created);
  console.log('Text styles updated: ' + styleStats.updated);
  
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
        
        console.log('Text style ' + action + ': ' + styleName);
      });
    });
  } catch (error) {
    console.error('Error creating text styles:', error);
    figma.notify('Error creating text styles. Font may not be available.');
  }
  
  return stats;
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
