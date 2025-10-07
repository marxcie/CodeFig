// Multi-Collection Font Scale Calculator
// Handles multiple typography collections with different naming schemes

console.log('📚 Multi-Collection Font Scale Calculator');
console.log('==========================================');

// Import the libraries
@import * from "@Variables"
@import * from "@Math Helpers"
@import * from "@InfoPanel"

// ============================================================================
// CONFIGURATION
// ============================================================================

var CONFIGS = [
  {
    // Collection 1: Standard scale
    targetCollection: "Typography Collection 1",
    targetVariables: ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"],
    baseVariable: "md",
    baseValue: 16,
    scaleType: "linear",
    scaleRatio: 1.4,
    easing: "none",
    modes: ["desktop", "tablet", "mobile"],
    modeBaseValues: {
      desktop: 16,
      tablet: 14,
      mobile: 12
    }
  },
  {
    // Collection 2: Semantic naming
    targetCollection: "Typography Collection 2",
    targetVariables: ["tiny", "small", "body", "small-headline", "headline", "huge"],
    baseVariable: "body",
    baseValue: 16,
    scaleType: "cubic",
    scaleRatio: 1.3,
    easing: "easeOut",
    modes: ["desktop", "tablet", "mobile"],
    modeBaseValues: {
      desktop: 16,
      tablet: 14,
      mobile: 12
    }
  }
];

// Global configuration
var GLOBAL_CONFIG = {
  previewMode: false, // true = show preview in InfoPanel, false = update variables
  showDetailedLogs: true
};

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

function calculateFontScale(baseValue, ratio, position, scaleType, easing, totalVariables) {
  // Convert position to a 0-1 factor for interpolation
  var factor = position / (totalVariables - 1);
  
  // Calculate the target value based on ratio
  var targetValue = baseValue * Math.pow(ratio, position);
  
  // Use interpolation for smooth scaling
  return interpolate(baseValue, targetValue, factor, scaleType, easing);
}

// ============================================================================
// COLLECTION PROCESSING
// ============================================================================

async function processCollection(config) {
  var results = [];
  
  results.push(createHtmlResult('<div class="info-entry-title">📚 Collection: "' + config.targetCollection + '"</div>'));
  
  // Get the target collection
  var collection = getCollection(config.targetCollection);
  if (!collection) {
    var errorMsg = 'Collection not found: ' + config.targetCollection;
    results.push(createHtmlResult('<div class="error-text">❌ ' + errorMsg + '</div>'));
    return { success: false, error: errorMsg, results: results };
  }
  
  // Validate collection
  var validation = validateCollection(collection, config.targetVariables, config.modes);
  if (!validation.valid) {
    var errorMsg = 'Collection validation failed: ' + validation.errors.join(', ');
    results.push(createHtmlResult('<div class="error-text">❌ ' + errorMsg + '</div>'));
    return { success: false, error: errorMsg, results: results };
  }
  
  // Find base variable position
  var baseIndex = config.targetVariables.indexOf(config.baseVariable);
  if (baseIndex === -1) {
    var errorMsg = 'Base variable not found: ' + config.baseVariable;
    results.push(createHtmlResult('<div class="error-text">❌ ' + errorMsg + '</div>'));
    return { success: false, error: errorMsg, results: results };
  }
  
  results.push(createHtmlResult('<div class="info-entry-subtitle">📊 Base: "' + config.baseVariable + '" at position ' + baseIndex + '</div>'));
  results.push(createHtmlResult('<div class="info-entry-subtitle">📏 Scale: ' + config.scaleType + ' (' + config.scaleRatio + ') with ' + config.easing + ' easing</div>'));
  
  var totalUpdates = 0;
  var totalErrors = 0;
  
  // Process each mode
  for (var modeIndex = 0; modeIndex < config.modes.length; modeIndex++) {
    var modeName = config.modes[modeIndex];
    var mode = getModeByName(collection, modeName);
    
    if (!mode) {
      results.push(createHtmlResult('<div class="warning-text">⚠️ Mode not found: ' + modeName + '</div>'));
      continue;
    }
    
    // Get base value for this mode
    var baseValue = config.modeBaseValues[modeName] || config.baseValue;
    
    var modeResults = [];
    modeResults.push('<div class="info-category-header">📱 ' + modeName + ' (base: ' + baseValue + ')</div>');
    
    // Calculate values for all variables
    var updates = [];
    var modeTable = '<table style="width: 100%; border-collapse: collapse;">';
    modeTable += '<tr><th style="text-align: left; padding: 4px;">Variable</th><th style="text-align: left; padding: 4px;">Position</th><th style="text-align: left; padding: 4px;">Value</th></tr>';
    
    for (var varIndex = 0; varIndex < config.targetVariables.length; varIndex++) {
      var variableName = config.targetVariables[varIndex];
      var position = varIndex - baseIndex;
      var calculatedValue = calculateFontScale(baseValue, config.scaleRatio, position, config.scaleType, config.easing, config.targetVariables.length);
      var roundedValue = Math.round(calculatedValue * 100) / 100;
      
      updates.push({
        variableName: variableName,
        modeId: mode.modeId,
        value: roundedValue
      });
      
      var positionClass = position === 0 ? 'info-entry-badge' : 'info-entry-subtitle';
      modeTable += '<tr><td style="padding: 4px;">' + variableName + '</td><td style="padding: 4px;"><span class="' + positionClass + '">' + position + '</span></td><td style="padding: 4px;">' + roundedValue + '</td></tr>';
    }
    
    modeTable += '</table>';
    modeResults.push(modeTable);
    
    // Update all variables for this mode
    if (!GLOBAL_CONFIG.previewMode) {
      var updateResults = updateMultipleVariables(collection, updates);
      totalUpdates += updateResults.success;
      totalErrors += updateResults.failed;
      
      if (updateResults.success > 0) {
        modeResults.push('<div class="success-text">✅ Updated ' + updateResults.success + ' variables</div>');
      }
      if (updateResults.failed > 0) {
        modeResults.push('<div class="error-text">❌ Failed ' + updateResults.failed + ' variables</div>');
      }
    } else {
      modeResults.push('<div class="info-text">👁️ Preview mode - no variables updated</div>');
    }
    
    results.push(createHtmlResult(modeResults.join('')));
  }
  
  return {
    success: true,
    updates: totalUpdates,
    errors: totalErrors,
    collection: config.targetCollection,
    results: results
  };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function calculateAllFontScales() {
  try {
    var allResults = [];
    var totalUpdates = 0;
    var totalErrors = 0;
    var successfulCollections = 0;
    var failedCollections = 0;
    
    allResults.push(createHtmlResult('<div class="info-entry-title">🔍 Multi-Collection Font Scale Calculator</div>'));
    allResults.push(createHtmlResult('<div class="info-entry-subtitle">📊 Processing ' + CONFIGS.length + ' collections</div>'));
    
    // Process each collection
    for (var i = 0; i < CONFIGS.length; i++) {
      var config = CONFIGS[i];
      
      allResults.push(createHtmlResult('<div class="info-category-header">📚 Collection ' + (i + 1) + '/' + CONFIGS.length + '</div>'));
      
      var result = await processCollection(config);
      
      // Add collection results to all results
      if (result.results) {
        for (var j = 0; j < result.results.length; j++) {
          allResults.push(result.results[j]);
        }
      }
      
      if (result.success) {
        successfulCollections++;
        totalUpdates += result.updates;
        totalErrors += result.errors;
        allResults.push(createHtmlResult('<div class="success-text">✅ Collection processed successfully</div>'));
      } else {
        failedCollections++;
        allResults.push(createHtmlResult('<div class="error-text">❌ Collection failed: ' + result.error + '</div>'));
      }
    }
    
    // Summary
    var summary = [];
    summary.push('<div class="info-category-header">📊 FINAL RESULTS</div>');
    summary.push('<div class="info-entry-subtitle">✅ Successful collections: ' + successfulCollections + '</div>');
    summary.push('<div class="info-entry-subtitle">❌ Failed collections: ' + failedCollections + '</div>');
    summary.push('<div class="info-entry-subtitle">📝 Total updates: ' + totalUpdates + '</div>');
    summary.push('<div class="info-entry-subtitle">⚠️ Total errors: ' + totalErrors + '</div>');
    
    allResults.push(createHtmlResult(summary.join('')));
    
    // Display all results
    displayResults(allResults);
    
    if (totalUpdates > 0) {
      figma.notify('✅ Updated ' + totalUpdates + ' font scale values across ' + successfulCollections + ' collections');
    } else if (GLOBAL_CONFIG.previewMode) {
      figma.notify('👁️ Previewed font scale calculations across ' + CONFIGS.length + ' collections');
    } else {
      figma.notify('⚠️ No updates made - check collection names and variables');
    }
    
  } catch (error) {
    var errorMsg = 'Error: ' + error.message;
    var results = [];
    results.push(createHtmlResult('<div class="error-text">❌ ' + errorMsg + '</div>'));
    displayResults(results);
    figma.notify('❌ ' + errorMsg);
  }
}

// ============================================================================
// PREVIEW FUNCTION
// ============================================================================

function previewAllCalculations() {
  var results = [];
  
  results.push(createHtmlResult('<div class="info-entry-title">👁️ PREVIEW - All Font Scale Calculations</div>'));
  
  for (var i = 0; i < CONFIGS.length; i++) {
    var config = CONFIGS[i];
    
    results.push(createHtmlResult('<div class="info-category-header">📚 Collection: ' + config.targetCollection + '</div>'));
    results.push(createHtmlResult('<div class="info-entry-subtitle">Base: ' + config.baseVariable + ' (' + config.baseValue + ')</div>'));
    results.push(createHtmlResult('<div class="info-entry-subtitle">Scale: ' + config.scaleType + ' (' + config.scaleRatio + ') with ' + config.easing + ' easing</div>'));
    
    var baseIndex = config.targetVariables.indexOf(config.baseVariable);
    var table = '<table style="width: 100%; border-collapse: collapse; margin-top: 8px;">';
    table += '<tr><th style="text-align: left; padding: 4px;">Variable</th><th style="text-align: left; padding: 4px;">Position</th><th style="text-align: left; padding: 4px;">Value</th></tr>';
    
    for (var j = 0; j < config.targetVariables.length; j++) {
      var variableName = config.targetVariables[j];
      var position = j - baseIndex;
      var calculatedValue = calculateFontScale(config.baseValue, config.scaleRatio, position, config.scaleType, config.easing, config.targetVariables.length);
      var roundedValue = Math.round(calculatedValue * 100) / 100;
      
      var positionClass = position === 0 ? 'info-entry-badge' : 'info-entry-subtitle';
      table += '<tr><td style="padding: 4px;">' + variableName + '</td><td style="padding: 4px;"><span class="' + positionClass + '">' + position + '</span></td><td style="padding: 4px;">' + roundedValue + '</td></tr>';
    }
    
    table += '</table>';
    results.push(createHtmlResult(table));
  }
  
  displayResults(results);
}

// ============================================================================
// RUN THE SCRIPT
// ============================================================================

// Uncomment to preview calculations first
// previewAllCalculations();

calculateAllFontScales();
