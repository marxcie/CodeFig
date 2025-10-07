// Font Scale Calculator - Simple script using @Variables library
// Calculates font sizes based on scale ratios and base values

console.log('📏 Font Scale Calculator');
console.log('========================');

// Import the libraries
@import * from "@Variables"
@import * from "@Math Helpers"
@import * from "@InfoPanel"

// ============================================================================
// CONFIGURATION
// ============================================================================

var CONFIG = {
  // Target collection and variables
  targetCollection: "Typography Collection 1",
  targetVariables: ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"],
  
  // Base configuration
  baseVariable: "md",
  baseValue: 16,
  
  // Scale configuration
  scaleType: "linear", // "linear", "exponential", "sine", "cubic", "quint", "goldenRatio"
  scaleRatio: 1.4,
  easing: "none", // "none", "easeIn", "easeOut", "easeInOut", "easeOutIn"
  
  // Modes to update
  modes: ["desktop", "tablet", "mobile"],
  
  // Mode-specific base values (optional)
  modeBaseValues: {
    desktop: 16,
    tablet: 14,
    mobile: 12
  },
  
  // Display options
  previewMode: false, // true = show preview in InfoPanel, false = update variables
  showDetailedLogs: true
};

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

function calculateFontScale(baseValue, ratio, position, scaleType, easing) {
  // Convert position to a 0-1 factor for interpolation
  var factor = position / (CONFIG.targetVariables.length - 1);
  
  // Calculate the target value based on ratio
  var targetValue = baseValue * Math.pow(ratio, position);
  
  // Use interpolation for smooth scaling
  return interpolate(baseValue, targetValue, factor, scaleType, easing);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function calculateFontScales() {
  try {
    var results = [];
    var totalUpdates = 0;
    
    // Get the target collection
    var collection = getCollection(CONFIG.targetCollection);
    if (!collection) {
      var errorMsg = 'Collection not found: ' + CONFIG.targetCollection;
      results.push(createHtmlResult('<div class="error-text">❌ ' + errorMsg + '</div>'));
      displayResults(results);
      figma.notify('❌ ' + errorMsg);
      return;
    }
    
    results.push(createHtmlResult('<div class="info-entry-title">📚 Collection: "' + collection.name + '"</div>'));
    
    // Validate collection has required variables
    var validation = validateCollection(collection, CONFIG.targetVariables, CONFIG.modes);
    if (!validation.valid) {
      var errorMsg = 'Collection validation failed: ' + validation.errors.join(', ');
      results.push(createHtmlResult('<div class="error-text">❌ ' + errorMsg + '</div>'));
      displayResults(results);
      figma.notify('❌ Collection validation failed');
      return;
    }
    
    // Find base variable position
    var baseIndex = CONFIG.targetVariables.indexOf(CONFIG.baseVariable);
    if (baseIndex === -1) {
      var errorMsg = 'Base variable not found: ' + CONFIG.baseVariable;
      results.push(createHtmlResult('<div class="error-text">❌ ' + errorMsg + '</div>'));
      displayResults(results);
      figma.notify('❌ ' + errorMsg);
      return;
    }
    
    results.push(createHtmlResult('<div class="info-entry-subtitle">📊 Base: "' + CONFIG.baseVariable + '" at position ' + baseIndex + '</div>'));
    results.push(createHtmlResult('<div class="info-entry-subtitle">📏 Scale: ' + CONFIG.scaleType + ' (' + CONFIG.scaleRatio + ') with ' + CONFIG.easing + ' easing</div>'));
    
    // Calculate scales for each mode
    for (var modeIndex = 0; modeIndex < CONFIG.modes.length; modeIndex++) {
      var modeName = CONFIG.modes[modeIndex];
      var mode = getModeByName(collection, modeName);
      
      if (!mode) {
        results.push(createHtmlResult('<div class="warning-text">⚠️ Mode not found: ' + modeName + '</div>'));
        continue;
      }
      
      // Get base value for this mode
      var baseValue = CONFIG.modeBaseValues[modeName] || CONFIG.baseValue;
      
      var modeResults = [];
      modeResults.push('<div class="info-category-header">📱 ' + modeName + ' (base: ' + baseValue + ')</div>');
      
      // Calculate values for all variables
      var updates = [];
      var modeTable = '<table style="width: 100%; border-collapse: collapse;">';
      modeTable += '<tr><th style="text-align: left; padding: 4px;">Variable</th><th style="text-align: left; padding: 4px;">Position</th><th style="text-align: left; padding: 4px;">Value</th></tr>';
      
      for (var varIndex = 0; varIndex < CONFIG.targetVariables.length; varIndex++) {
        var variableName = CONFIG.targetVariables[varIndex];
        var position = varIndex - baseIndex;
        var calculatedValue = calculateFontScale(baseValue, CONFIG.scaleRatio, position, CONFIG.scaleType, CONFIG.easing);
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
      if (!CONFIG.previewMode) {
        var updateResults = updateMultipleVariables(collection, updates);
        totalUpdates += updateResults.success;
        
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
    
    // Summary
    var summary = [];
    summary.push('<div class="info-category-header">📊 Summary</div>');
    summary.push('<div class="info-entry-subtitle">✅ Total updates: ' + totalUpdates + '</div>');
    summary.push('<div class="info-entry-subtitle">📚 Collection: ' + collection.name + '</div>');
    summary.push('<div class="info-entry-subtitle">📱 Modes: ' + CONFIG.modes.join(', ') + '</div>');
    summary.push('<div class="info-entry-subtitle">📏 Scale type: ' + CONFIG.scaleType + '</div>');
    summary.push('<div class="info-entry-subtitle">📐 Scale ratio: ' + CONFIG.scaleRatio + '</div>');
    summary.push('<div class="info-entry-subtitle">🎭 Easing: ' + CONFIG.easing + '</div>');
    
    results.push(createHtmlResult(summary.join('')));
    
    // Display results
    displayResults(results);
    
    if (totalUpdates > 0) {
      figma.notify('✅ Updated ' + totalUpdates + ' font scale values');
    } else if (CONFIG.previewMode) {
      figma.notify('👁️ Previewed font scale calculations');
    } else {
      figma.notify('⚠️ No updates made');
    }
    
  } catch (error) {
    var errorMsg = 'Error: ' + error.message;
    results.push(createHtmlResult('<div class="error-text">❌ ' + errorMsg + '</div>'));
    displayResults(results);
    figma.notify('❌ ' + errorMsg);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function previewCalculations() {
  var results = [];
  var baseValue = CONFIG.baseValue;
  var ratio = CONFIG.scaleRatio;
  var scaleType = CONFIG.scaleType;
  var easing = CONFIG.easing;
  
  results.push(createHtmlResult('<div class="info-entry-title">👁️ PREVIEW - Font Scale Calculations</div>'));
  results.push(createHtmlResult('<div class="info-entry-subtitle">Base value: ' + baseValue + '</div>'));
  results.push(createHtmlResult('<div class="info-entry-subtitle">Scale ratio: ' + ratio + '</div>'));
  results.push(createHtmlResult('<div class="info-entry-subtitle">Scale type: ' + scaleType + '</div>'));
  results.push(createHtmlResult('<div class="info-entry-subtitle">Easing: ' + easing + '</div>'));
  
  var table = '<table style="width: 100%; border-collapse: collapse; margin-top: 8px;">';
  table += '<tr><th style="text-align: left; padding: 4px;">Variable</th><th style="text-align: left; padding: 4px;">Position</th><th style="text-align: left; padding: 4px;">Value</th></tr>';
  
  for (var i = 0; i < CONFIG.targetVariables.length; i++) {
    var variableName = CONFIG.targetVariables[i];
    var position = i - CONFIG.targetVariables.indexOf(CONFIG.baseVariable);
    var calculatedValue = calculateFontScale(baseValue, ratio, position, scaleType, easing);
    var roundedValue = Math.round(calculatedValue * 100) / 100;
    
    var positionClass = position === 0 ? 'info-entry-badge' : 'info-entry-subtitle';
    table += '<tr><td style="padding: 4px;">' + variableName + '</td><td style="padding: 4px;"><span class="' + positionClass + '">' + position + '</span></td><td style="padding: 4px;">' + roundedValue + '</td></tr>';
  }
  
  table += '</table>';
  results.push(createHtmlResult(table));
  
  displayResults(results);
}

// ============================================================================
// RUN THE SCRIPT
// ============================================================================

// Uncomment to preview calculations first
// previewCalculations();

calculateFontScales();
