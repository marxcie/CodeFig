// Replace Variables Workflow
// @DOC_START
// # Replace Variables Workflow
// Interactive or batch workflow to find variable usage and replace bindings.
//
// ## Overview
// Discovers variable usage in selection (or page), shows results in the InfoPanel with replacement suggestions. In interactive mode you review and act; in batch mode replacements are applied from BATCH_REPLACEMENTS. Uses @InfoPanel for display.
//
// ## Config options
// - **REPLACEMENT_MODE** – "interactive" (review in InfoPanel) or "batch" (apply BATCH_REPLACEMENTS).
// - **BATCH_REPLACEMENTS** – Array of { from: 'variable-name', to: 'new-variable-name' } for batch mode.
// @DOC_END
// @import { displayResults, createResult, createSelectableResult, createHtmlResult } from "@InfoPanel"

// @CONFIG_START
// ===== CONFIGURATION =====
var REPLACEMENT_MODE = 'interactive'; // 'interactive' or 'batch'

// For batch mode - define your replacements here
var BATCH_REPLACEMENTS = [
  // { from: 'old-variable-name', to: 'new-variable-name' },
  // { from: 'Typography/4xl/font-size', to: 'Typography/3xl/font-size' }
];
// @CONFIG_END

// ===== UTILITY FUNCTIONS =====

var collectAllNodes = function(nodes) {
  var allNodes = [];
  
  function traverse(node) {
    allNodes.push(node);
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        traverse(node.children[i]);
      }
    }
  }
  
  for (var i = 0; i < nodes.length; i++) {
    traverse(nodes[i]);
  }
  
  return allNodes;
};

var getNodePath = function(node) {
  var path = [];
  var current = node;
  
  while (current && current.parent && current.parent.type !== 'DOCUMENT') {
    path.unshift(current.parent.name);
    current = current.parent;
  }
  
  return path.join(' > ');
};

// ===== VARIABLE DISCOVERY =====

var findAllVariableUsage = function() {
  var selection = figma.currentPage.selection;
  var variableUsage = new Map(); // variableId -> usage info
  
  // If nothing selected, search entire page
  var nodesToCheck = selection.length > 0 ? selection : [figma.currentPage];
  var allNodes = collectAllNodes(nodesToCheck);
  
  console.log('=== VARIABLE USAGE DISCOVERY ===');
  console.log('Nodes to check:', nodesToCheck.length);
  console.log('Total nodes collected:', allNodes.length);
  
  for (var i = 0; i < allNodes.length; i++) {
    var node = allNodes[i];
    
    if (node.boundVariables) {
      var properties = Object.keys(node.boundVariables);
      
      for (var j = 0; j < properties.length; j++) {
        var prop = properties[j];
        var binding = node.boundVariables[prop];
        
        // Handle both direct binding and array binding formats
        var actualBinding = binding;
        var isArray = Array.isArray(binding);
        
        if (isArray && binding.length > 0 && binding[0].id) {
          actualBinding = binding[0];
        }
        
        if (actualBinding && actualBinding.id) {
          var variableId = actualBinding.id;
          
          if (!variableUsage.has(variableId)) {
            // Try to get variable info
            var variable = null;
            var variableName = 'Unknown Variable';
            var collectionName = 'Unknown Collection';
            var isRemote = false;
            var hasValidValues = false;
            
            try {
              variable = figma.variables.getVariableById(variableId);
              if (variable) {
                variableName = variable.name;
                isRemote = variable.remote;
                
                try {
                  var collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
                  if (collection) {
                    collectionName = collection.name;
                    
                    // Check if variable has valid values
                    for (var modeIndex = 0; modeIndex < collection.modes.length; modeIndex++) {
                      var mode = collection.modes[modeIndex];
                      var value = variable.valuesByMode[mode.modeId];
                      if (value !== undefined && value !== null) {
                        hasValidValues = true;
                        break;
                      }
                    }
                  }
                } catch (e) {
                  // Collection access error
                }
              }
            } catch (e) {
              // Variable access error
            }
            
            variableUsage.set(variableId, {
              variableId: variableId,
              variableName: variableName,
              collectionName: collectionName,
              isRemote: isRemote,
              hasValidValues: hasValidValues,
              usageCount: 0,
              nodes: [],
              properties: []
            });
          }
          
          var usage = variableUsage.get(variableId);
          usage.usageCount++;
          usage.nodes.push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            path: getNodePath(node)
          });
          usage.properties.push(prop);
        }
      }
    }
  }
  
  console.log('Found', variableUsage.size, 'unique variables in use');
  return variableUsage;
};

// ===== REPLACEMENT SUGGESTIONS =====

var generateReplacementSuggestions = function(variableUsage) {
  var suggestions = [];
  
  // Get all available variables for suggestions
  var availableVariables = new Map();
  
  // Local variables
  var localVariables = figma.variables.getLocalVariables();
  for (var i = 0; i < localVariables.length; i++) {
    var variable = localVariables[i];
    availableVariables.set(variable.name, {
      id: variable.id,
      name: variable.name,
      remote: false,
      collection: 'Local'
    });
  }
  
  console.log('Available variables for replacement:', availableVariables.size);
  
  variableUsage.forEach(function(usage, variableId) {
    var suggestion = {
      current: {
        id: usage.variableId,
        name: usage.variableName,
        collection: usage.collectionName,
        remote: usage.isRemote,
        hasValidValues: usage.hasValidValues
      },
      usageCount: usage.usageCount,
      nodes: usage.nodes,
      properties: usage.properties,
      replacementOptions: []
    };
    
    // Generate replacement suggestions based on name similarity
    var currentName = usage.variableName.toLowerCase();
    availableVariables.forEach(function(available, name) {
      if (available.id !== usage.variableId) {
        var similarity = calculateNameSimilarity(currentName, name.toLowerCase());
        if (similarity > 0.3) { // 30% similarity threshold
          suggestion.replacementOptions.push({
            id: available.id,
            name: available.name,
            collection: available.collection,
            remote: available.remote,
            similarity: similarity
          });
        }
      }
    });
    
    // Sort by similarity
    suggestion.replacementOptions.sort(function(a, b) {
      return b.similarity - a.similarity;
    });
    
    suggestions.push(suggestion);
  });
  
  return suggestions;
};

var calculateNameSimilarity = function(str1, str2) {
  // Simple similarity calculation based on common substrings
  var longer = str1.length > str2.length ? str1 : str2;
  var shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  var matches = 0;
  for (var i = 0; i < shorter.length; i++) {
    if (longer.indexOf(shorter[i]) !== -1) {
      matches++;
    }
  }
  
  return matches / longer.length;
};

// ===== MAIN EXECUTION =====

console.log('=== REPLACE VARIABLES WORKFLOW ===');

var variableUsage = findAllVariableUsage();
var suggestions = generateReplacementSuggestions(variableUsage);

console.log('Generated', suggestions.length, 'replacement suggestions');

// Display results in InfoPanel
var results = [];

for (var i = 0; i < suggestions.length; i++) {
  var suggestion = suggestions[i];
  
  var statusIcon = suggestion.current.hasValidValues ? '✅' : '❌';
  var remoteIcon = suggestion.current.remote ? '🔗' : '📁';
  
  var title = statusIcon + ' ' + remoteIcon + ' ' + suggestion.current.name;
  var details = suggestion.current.collection + ' • Used ' + suggestion.usageCount + ' times';
  
  if (suggestion.replacementOptions.length > 0) {
    details += ' • ' + suggestion.replacementOptions.length + ' replacement options';
  }
  
  // Create HTML result with replacement options
  var html = '<div class="info-entry">';
  html += '<div class="info-entry-content">';
  html += '<div class="info-entry-title">' + title + '</div>';
  html += '<div class="info-entry-subtitle">' + details + '</div>';
  
  if (suggestion.replacementOptions.length > 0) {
    html += '<div style="margin-top: 8px; font-size: 12px; color: #666;">';
    html += '<strong>Suggested replacements:</strong><br>';
    for (var j = 0; j < Math.min(3, suggestion.replacementOptions.length); j++) {
      var option = suggestion.replacementOptions[j];
      var percent = Math.round(option.similarity * 100);
      html += '• ' + option.name + ' (' + percent + '% match)<br>';
    }
    html += '</div>';
  }
  
  html += '</div>';
  html += '</div>';
  
  // Collect all node IDs for bulk selection
  var nodeIds = [];
  for (var k = 0; k < suggestion.nodes.length; k++) {
    nodeIds.push(suggestion.nodes[k].nodeId);
  }
  
  results.push(createHtmlResult(html, nodeIds, suggestion.current.hasValidValues ? 'info' : 'warning'));
}

if (results.length > 0) {
  displayResults({
    title: 'Variable Usage Analysis: ' + results.length + ' variables',
    results: results,
    type: 'info'
  });
  
  console.log('Results displayed in InfoPanel');
  console.log('Click on any variable to select all nodes using it');
  console.log('Variables marked with ❌ may need replacement');
} else {
  figma.notify('No variables found in selection');
}
