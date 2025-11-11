// Replace Variables with Styles
// Intelligently replaces variable bindings with styles based on pattern matching.
// Handles typography, colors, effects, and complex naming patterns.

// ============================================================================
// CONFIGURATION
// ============================================================================

// Define your replacement rules
// Pattern format: Use * as wildcard to match any part of the variable/style name
var REPLACEMENT_RULES = [
  {
    variablePattern: "website V2/typography/*",
    stylePattern: "V4/*",
    description: "Website V2 typography variables -> V4 styles"
  },
  {
    variablePattern: "brand/typography/*",
    stylePattern: "Brand/*",
    description: "Brand typography variables -> Brand styles"
  },
  {
    variablePattern: "colors/primary/*",
    stylePattern: "Primary/*",
    description: "Primary color variables -> Primary color styles"
  }
  // Add more rules as needed
];

// Font weight mappings for intelligent style selection
// Maps common weight names in variables to style naming conventions
var FONT_WEIGHT_MAPPINGS = {
  "thin": "Thin",
  "light": "Light",
  "regular": "Regular",
  "medium": "Medium",
  "semibold": "SemiBold",
  "bold": "Bold",
  "extrabold": "ExtraBold",
  "black": "Black"
};

// Configuration options
var DRY_RUN = false; // Set to true to preview changes without applying them
var VERBOSE_LOGGING = true; // Set to false for minimal console output

// ============================================================================
// MAIN SCRIPT
// ============================================================================

function replaceVariablesWithStyles() {
  try {
    console.log('🎨 Replace Variables with Styles');
    console.log('=====================================');
    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE - No changes will be made');
    }
    console.log('');
    
    // Get current selection
    var selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify('❌ Please select some nodes first');
      console.log('❌ No selection found');
      return;
    }
    
    console.log('📋 Processing ' + selection.length + ' selected node(s)');
    
    // Analyze selection for variable bindings
    var analysis = analyzeSelection(selection);
    
    if (analysis.totalMatches === 0) {
      figma.notify('ℹ️ No matching variables found in selection');
      console.log('ℹ️ No variables matching the configured patterns were found');
      return;
    }
    
    // Show analysis results
    showAnalysisResults(analysis);
    
    if (DRY_RUN) {
      figma.notify('🔍 Dry run complete - ' + analysis.totalMatches + ' potential replacements found');
      console.log('');
      console.log('💡 Set DRY_RUN = false to apply changes');
      return;
    }
    
    // Perform the replacement
    var results = performReplacement(analysis);
    
    // Show results
    showReplacementResults(results);
    
    if (results.successful > 0) {
      figma.notify('✅ Replaced ' + results.successful + ' variable bindings with styles');
    } else {
      figma.notify('❌ No replacements made - check console for details');
    }
    
  } catch (error) {
    console.error('❌ Error in replaceVariablesWithStyles:', error);
    figma.notify('❌ Error occurred - check console');
  }
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function analyzeSelection(selection) {
  var matches = [];
  var rulesUsed = new Set();
  var nodesAffected = new Set();
  
  // Collect all nodes recursively
  var allNodes = collectAllNodes(selection);
  
  console.log('🔍 Analyzing ' + allNodes.length + ' nodes for variable bindings...');
  console.log('');
  
  for (var i = 0; i < allNodes.length; i++) {
    var node = allNodes[i];
    
    if (!node.boundVariables || typeof node.boundVariables !== 'object') continue;
    
    for (var property in node.boundVariables) {
      var binding = node.boundVariables[property];
      if (!binding) continue;
      
      // Handle both single bindings and arrays of bindings
      var variableId = binding.id || (Array.isArray(binding) && binding[0] && binding[0].id);
      if (!variableId) continue;
      
      try {
        var variable = figma.variables.getVariableById(variableId);
        if (!variable || !variable.name) continue;
        
        // Check if this variable matches any of our rules
        var match = findMatchingRule(variable.name, property);
        if (match) {
          var suggestedStyle = generateSuggestedStyle(variable.name, property, match);
          
          matches.push({
            node: node,
            nodeName: node.name || 'Unnamed',
            property: property,
            variable: variable,
            variableName: variable.name,
            matchedRule: match.rule,
            suggestedStyle: suggestedStyle.style,
            confidence: match.confidence
          });
          
          rulesUsed.add(match.rule.description);
          nodesAffected.add(node.id);
        }
      } catch (error) {
        // Variable might not be accessible
        if (VERBOSE_LOGGING) {
          console.log('⚠️  Could not access variable: ' + error.message);
        }
      }
    }
  }
  
  return {
    matches: matches,
    totalMatches: matches.length,
    rulesUsed: rulesUsed,
    nodesAffected: nodesAffected
  };
}

function findMatchingRule(variableName, property) {
  for (var i = 0; i < REPLACEMENT_RULES.length; i++) {
    var rule = REPLACEMENT_RULES[i];
    
    // Convert wildcard pattern to regex
    var pattern = rule.variablePattern.replace(/\*/g, '.*');
    var regex = new RegExp('^' + pattern + '$', 'i');
    
    if (regex.test(variableName)) {
      // Calculate confidence based on how well it matches
      var confidence = calculateMatchConfidence(variableName, rule.variablePattern);
      return { rule: rule, confidence: confidence };
    }
  }
  
  return null;
}

function calculateMatchConfidence(variableName, pattern) {
  // Simple confidence calculation based on pattern matching
  var wildcardCount = (pattern.match(/\*/g) || []).length;
  var exactParts = pattern.split('*').filter(function(part) { return part.length > 0; });
  
  var score = 0;
  for (var i = 0; i < exactParts.length; i++) {
    var part = exactParts[i];
    if (variableName.toLowerCase().indexOf(part.toLowerCase()) !== -1) {
      score += part.length;
    }
  }
  
  return Math.min(score / variableName.length, 1);
}

function generateSuggestedStyle(variableName, property, match) {
  var rule = match.rule;
  
  // Extract the variable part after the pattern
  var patternPrefix = rule.variablePattern.replace(/\*.*$/, '');
  var variableSuffix = variableName.replace(patternPrefix, '').replace(/^\//, '');
  
  // Generate the style name
  var styleName = rule.stylePattern.replace(/\*/g, variableSuffix);
  
  // Handle font weight intelligently for typography-related properties
  if (property.indexOf('fontWeight') !== -1 || property.indexOf('font') !== -1) {
    styleName = adjustStyleForFontWeight(styleName, variableName);
  }
  
  return {
    style: styleName,
    reasoning: 'Based on pattern: ' + rule.variablePattern + ' -> ' + rule.stylePattern
  };
}

function adjustStyleForFontWeight(styleName, variableName) {
  // Look for font weight indicators in the variable name
  for (var weightKey in FONT_WEIGHT_MAPPINGS) {
    var weightValue = FONT_WEIGHT_MAPPINGS[weightKey];
    
    if (variableName.toLowerCase().indexOf(weightKey) !== -1) {
      // Replace or append the weight to the style name
      var baseStyle = styleName.replace(/\/[^\/]*$/, ''); // Remove last part
      return baseStyle + '/' + weightValue;
    }
  }
  
  return styleName;
}

// ============================================================================
// REPLACEMENT FUNCTIONS
// ============================================================================

function performReplacement(analysis) {
  var result = {
    successful: 0,
    failed: 0,
    errors: [],
    details: []
  };
  
  console.log('');
  console.log('🔄 Performing replacement on ' + analysis.matches.length + ' bindings...');
  console.log('');
  
  for (var i = 0; i < analysis.matches.length; i++) {
    var match = analysis.matches[i];
    
    try {
      // Find the style by name
      var style = findStyleByName(match.suggestedStyle);
      
      if (!style) {
        result.failed++;
        var errorMsg = 'Style not found: ' + match.suggestedStyle;
        result.errors.push(errorMsg);
        result.details.push({
          nodeName: match.nodeName,
          property: match.property,
          oldVariable: match.variableName,
          newStyle: match.suggestedStyle,
          success: false,
          error: 'Style not found'
        });
        
        if (VERBOSE_LOGGING) {
          console.log('❌ ' + errorMsg);
        }
        continue;
      }
      
      // Unbind the variable first
      unbindVariable(match.node, match.property);
      
      // Apply the style
      var success = applyStyleToNode(match.node, match.property, style);
      
      if (success) {
        result.successful++;
        result.details.push({
          nodeName: match.nodeName,
          property: match.property,
          oldVariable: match.variableName,
          newStyle: match.suggestedStyle,
          success: true
        });
        
        if (VERBOSE_LOGGING) {
          console.log('✅ ' + match.nodeName + ' - ' + match.property);
          console.log('   ' + match.variableName + ' -> ' + match.suggestedStyle);
        }
      } else {
        result.failed++;
        var failMsg = 'Failed to apply style to ' + match.nodeName;
        result.errors.push(failMsg);
        result.details.push({
          nodeName: match.nodeName,
          property: match.property,
          oldVariable: match.variableName,
          newStyle: match.suggestedStyle,
          success: false,
          error: 'Failed to apply style'
        });
        
        if (VERBOSE_LOGGING) {
          console.log('❌ ' + failMsg);
        }
      }
      
    } catch (error) {
      result.failed++;
      var errorMessage = 'Error processing ' + match.nodeName + ': ' + error.message;
      result.errors.push(errorMessage);
      result.details.push({
        nodeName: match.nodeName,
        property: match.property,
        oldVariable: match.variableName,
        newStyle: match.suggestedStyle,
        success: false,
        error: error.message
      });
      
      if (VERBOSE_LOGGING) {
        console.log('❌ ' + errorMessage);
      }
    }
  }
  
  return result;
}

function findStyleByName(styleName) {
  // Search through all styles
  var allStyles = [].concat(
    figma.getLocalTextStyles(),
    figma.getLocalPaintStyles(),
    figma.getLocalEffectStyles()
  );
  
  // Try exact match first
  for (var i = 0; i < allStyles.length; i++) {
    if (allStyles[i].name === styleName) {
      return allStyles[i];
    }
  }
  
  // Try case-insensitive match
  var lowerStyleName = styleName.toLowerCase();
  for (var i = 0; i < allStyles.length; i++) {
    if (allStyles[i].name.toLowerCase() === lowerStyleName) {
      return allStyles[i];
    }
  }
  
  // Try partial match (contains)
  for (var i = 0; i < allStyles.length; i++) {
    if (allStyles[i].name.toLowerCase().indexOf(lowerStyleName) !== -1) {
      return allStyles[i];
    }
  }
  
  return null;
}

function unbindVariable(node, property) {
  try {
    // Unbind the variable before applying a style
    if (node.setBoundVariable && typeof node.setBoundVariable === 'function') {
      node.setBoundVariable(property, null);
    }
  } catch (error) {
    if (VERBOSE_LOGGING) {
      console.log('⚠️  Could not unbind variable: ' + error.message);
    }
  }
}

function applyStyleToNode(node, property, style) {
  try {
    // Map property names to style types and methods
    if (property === 'textStyleId' || property.indexOf('text') !== -1) {
      if (style.type === 'TEXT' && 'textStyleId' in node) {
        node.textStyleId = style.id;
        return true;
      }
    }
    
    if (property === 'fillStyleId' || property.indexOf('fill') !== -1) {
      if (style.type === 'PAINT' && 'fillStyleId' in node) {
        node.fillStyleId = style.id;
        return true;
      }
    }
    
    if (property === 'strokeStyleId' || property.indexOf('stroke') !== -1) {
      if (style.type === 'PAINT' && 'strokeStyleId' in node) {
        node.strokeStyleId = style.id;
        return true;
      }
    }
    
    if (property === 'effectStyleId' || property.indexOf('effect') !== -1) {
      if (style.type === 'EFFECT' && 'effectStyleId' in node) {
        node.effectStyleId = style.id;
        return true;
      }
    }
    
    // Try direct property mapping
    if (property in node) {
      node[property] = style.id;
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Failed to apply style to ' + node.name + ':', error);
    return false;
  }
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function showAnalysisResults(analysis) {
  console.log('📊 Analysis Results:');
  console.log('   Total matches found: ' + analysis.totalMatches);
  console.log('   Nodes affected: ' + analysis.nodesAffected.size);
  console.log('   Rules used: ' + Array.from(analysis.rulesUsed).join(', '));
  console.log('');
  
  // Group matches by rule
  var matchesByRule = {};
  for (var i = 0; i < analysis.matches.length; i++) {
    var match = analysis.matches[i];
    var ruleDesc = match.matchedRule.description;
    
    if (!matchesByRule[ruleDesc]) {
      matchesByRule[ruleDesc] = [];
    }
    matchesByRule[ruleDesc].push(match);
  }
  
  for (var ruleDesc in matchesByRule) {
    var matches = matchesByRule[ruleDesc];
    console.log('📋 ' + ruleDesc + ':');
    console.log('   ' + matches.length + ' matches');
    
    if (VERBOSE_LOGGING) {
      // Show first few examples
      var examples = matches.slice(0, 5);
      for (var j = 0; j < examples.length; j++) {
        var example = examples[j];
        console.log('   • ' + example.nodeName + ' - ' + example.property);
        console.log('     ' + example.variableName + ' -> ' + example.suggestedStyle);
        console.log('     Confidence: ' + Math.round(example.confidence * 100) + '%');
      }
      
      if (matches.length > 5) {
        console.log('   ... and ' + (matches.length - 5) + ' more');
      }
    }
    console.log('');
  }
}

function showReplacementResults(results) {
  console.log('');
  console.log('📊 Replacement Results:');
  console.log('   ✅ Successful: ' + results.successful);
  console.log('   ❌ Failed: ' + results.failed);
  console.log('');
  
  if (results.failed > 0 && results.errors.length > 0) {
    console.log('❌ Errors encountered:');
    var uniqueErrors = {};
    for (var i = 0; i < results.errors.length; i++) {
      var error = results.errors[i];
      uniqueErrors[error] = (uniqueErrors[error] || 0) + 1;
    }
    
    for (var error in uniqueErrors) {
      var count = uniqueErrors[error];
      if (count > 1) {
        console.log('   • ' + error + ' (×' + count + ')');
      } else {
        console.log('   • ' + error);
      }
    }
    console.log('');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function collectAllNodes(selection) {
  var nodes = [];
  
  function traverse(node) {
    nodes.push(node);
    
    if ('children' in node) {
      for (var i = 0; i < node.children.length; i++) {
        traverse(node.children[i]);
      }
    }
  }
  
  for (var i = 0; i < selection.length; i++) {
    traverse(selection[i]);
  }
  
  return nodes;
}

// ============================================================================
// SCRIPT EXECUTION
// ============================================================================

// Run the script
replaceVariablesWithStyles();
