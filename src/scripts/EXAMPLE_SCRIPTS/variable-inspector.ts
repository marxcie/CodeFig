// Variable Inspector
// Detailed inspector showing all variables with their current values for visual identification
// @import { displayResults, createResult, createSelectableResult, createHtmlResult } from "@InfoPanel"

// ===== CONFIGURATION =====
var SHOW_ONLY_USED_VARIABLES = true; // Set to false to show all variables in file
var GROUP_BY_COLLECTION = true; // Group variables by their collection
var SHOW_VALUE_PREVIEW = true; // Show actual variable values
var MAX_NODES_PREVIEW = 5; // Maximum nodes to show in usage preview

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

var formatValue = function(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  
  if (typeof value === 'object') {
    if (value.type === 'SOLID') {
      var r = Math.round(value.color.r * 255);
      var g = Math.round(value.color.g * 255);
      var b = Math.round(value.color.b * 255);
      var a = value.opacity || 1;
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
    } else if (value.type === 'VARIABLE_ALIAS') {
      return '→ ' + value.id;
    } else {
      return JSON.stringify(value).substring(0, 50) + '...';
    }
  }
  
  if (typeof value === 'number') {
    return value.toString();
  }
  
  return String(value);
};

var getVariableHealth = function(variable, collection) {
  var health = {
    status: 'healthy',
    issues: [],
    score: 100
  };
  
  if (!variable) {
    health.status = 'missing';
    health.issues.push('Variable not found');
    health.score = 0;
    return health;
  }
  
  if (!collection) {
    health.status = 'broken';
    health.issues.push('Collection not accessible');
    health.score = 10;
    return health;
  }
  
  // Check if variable has values in all modes
  var modesWithValues = 0;
  var totalModes = collection.modes.length;
  
  for (var i = 0; i < collection.modes.length; i++) {
    var mode = collection.modes[i];
    var value = variable.valuesByMode[mode.modeId];
    if (value !== undefined && value !== null) {
      modesWithValues++;
    }
  }
  
  if (modesWithValues === 0) {
    health.status = 'broken';
    health.issues.push('No values in any mode');
    health.score = 20;
  } else if (modesWithValues < totalModes) {
    health.status = 'warning';
    health.issues.push('Missing values in ' + (totalModes - modesWithValues) + ' modes');
    health.score = 60;
  }
  
  // Check for remote variables
  if (variable.remote) {
    if (health.status === 'healthy') {
      health.status = 'remote';
    }
    health.issues.push('Remote/library variable');
  }
  
  return health;
};

// ===== VARIABLE ANALYSIS =====

var analyzeVariables = function() {
  var selection = figma.currentPage.selection;
  var analysis = {
    usedVariables: new Map(),
    allVariables: new Map(),
    collections: new Map()
  };
  
  console.log('=== VARIABLE INSPECTOR ANALYSIS ===');
  
  // If we want to show only used variables, scan the selection first
  if (SHOW_ONLY_USED_VARIABLES) {
    var nodesToCheck = selection.length > 0 ? selection : [figma.currentPage];
    var allNodes = collectAllNodes(nodesToCheck);
    
    console.log('Scanning', allNodes.length, 'nodes for variable usage...');
    
    for (var i = 0; i < allNodes.length; i++) {
      var node = allNodes[i];
      
      if (node.boundVariables) {
        var properties = Object.keys(node.boundVariables);
        
        for (var j = 0; j < properties.length; j++) {
          var prop = properties[j];
          var binding = node.boundVariables[prop];
          
          // Handle both direct binding and array binding formats
          var actualBinding = binding;
          if (Array.isArray(binding) && binding.length > 0 && binding[0].id) {
            actualBinding = binding[0];
          }
          
          if (actualBinding && actualBinding.id) {
            var variableId = actualBinding.id;
            
            if (!analysis.usedVariables.has(variableId)) {
              analysis.usedVariables.set(variableId, {
                variableId: variableId,
                usageCount: 0,
                nodes: [],
                properties: new Set()
              });
            }
            
            var usage = analysis.usedVariables.get(variableId);
            usage.usageCount++;
            usage.nodes.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              path: getNodePath(node)
            });
            usage.properties.add(prop);
          }
        }
      }
    }
    
    console.log('Found', analysis.usedVariables.size, 'variables in use');
  }
  
  // Get all variables and collections for detailed analysis
  var localCollections = figma.variables.getLocalVariableCollections();
  var localVariables = figma.variables.getLocalVariables();
  
  console.log('Analyzing', localVariables.length, 'local variables in', localCollections.length, 'collections');
  
  // Process collections
  for (var i = 0; i < localCollections.length; i++) {
    var collection = localCollections[i];
    analysis.collections.set(collection.id, collection);
  }
  
  // Process variables
  for (var i = 0; i < localVariables.length; i++) {
    var variable = localVariables[i];
    var collection = analysis.collections.get(variable.variableCollectionId);
    
    var variableInfo = {
      variable: variable,
      collection: collection,
      health: getVariableHealth(variable, collection),
      usage: analysis.usedVariables.get(variable.id) || null,
      values: {}
    };
    
    // Get values for all modes
    if (collection) {
      for (var j = 0; j < collection.modes.length; j++) {
        var mode = collection.modes[j];
        var value = variable.valuesByMode[mode.modeId];
        variableInfo.values[mode.name] = {
          raw: value,
          formatted: formatValue(value)
        };
      }
    }
    
    analysis.allVariables.set(variable.id, variableInfo);
  }
  
  return analysis;
};

// ===== RESULT GENERATION =====

var generateInspectorResults = function(analysis) {
  var results = [];
  var variablesToShow = new Map();
  
  // Decide which variables to show
  if (SHOW_ONLY_USED_VARIABLES) {
    analysis.usedVariables.forEach(function(usage, variableId) {
      var variableInfo = analysis.allVariables.get(variableId);
      if (variableInfo) {
        variablesToShow.set(variableId, variableInfo);
      }
    });
  } else {
    variablesToShow = analysis.allVariables;
  }
  
  console.log('Displaying', variablesToShow.size, 'variables');
  
  if (GROUP_BY_COLLECTION) {
    // Group by collection
    var collectionGroups = new Map();
    
    variablesToShow.forEach(function(variableInfo, variableId) {
      var collectionId = variableInfo.collection ? variableInfo.collection.id : 'unknown';
      var collectionName = variableInfo.collection ? variableInfo.collection.name : 'Unknown Collection';
      
      if (!collectionGroups.has(collectionId)) {
        collectionGroups.set(collectionId, {
          name: collectionName,
          variables: []
        });
      }
      
      collectionGroups.get(collectionId).variables.push(variableInfo);
    });
    
    // Create results for each collection
    collectionGroups.forEach(function(group, collectionId) {
      // Collection header
      var collectionHtml = '<div class="info-category-header">';
      collectionHtml += '<div class="info-category-title">📁 ' + group.name + ' (' + group.variables.length + ' variables)</div>';
      collectionHtml += '</div>';
      
      results.push(createHtmlResult(collectionHtml, [], 'info'));
      
      // Variables in this collection
      for (var i = 0; i < group.variables.length; i++) {
        var variableInfo = group.variables[i];
        results.push(createVariableResult(variableInfo));
      }
    });
    
  } else {
    // Flat list
    variablesToShow.forEach(function(variableInfo, variableId) {
      results.push(createVariableResult(variableInfo));
    });
  }
  
  return results;
};

var createVariableResult = function(variableInfo) {
  var variable = variableInfo.variable;
  var health = variableInfo.health;
  var usage = variableInfo.usage;
  
  // Status icons
  var healthIcon = '✅';
  if (health.status === 'broken') healthIcon = '❌';
  else if (health.status === 'warning') healthIcon = '⚠️';
  else if (health.status === 'remote') healthIcon = '🔗';
  
  var typeIcon = '📝';
  if (variable.resolvedType === 'COLOR') typeIcon = '🎨';
  else if (variable.resolvedType === 'FLOAT') typeIcon = '🔢';
  else if (variable.resolvedType === 'BOOLEAN') typeIcon = '☑️';
  
  // Build HTML
  var html = '<div class="info-entry">';
  html += '<div class="info-entry-content">';
  html += '<div class="info-entry-title">' + healthIcon + ' ' + typeIcon + ' ' + variable.name + '</div>';
  
  var subtitle = variableInfo.collection ? variableInfo.collection.name : 'Unknown Collection';
  if (usage) {
    subtitle += ' • Used ' + usage.usageCount + ' times';
  } else {
    subtitle += ' • Not used in selection';
  }
  
  html += '<div class="info-entry-subtitle">' + subtitle + '</div>';
  
  // Health issues
  if (health.issues.length > 0) {
    html += '<div style="margin-top: 4px; font-size: 11px; color: #ff6b6b;">';
    html += '⚠️ ' + health.issues.join(', ');
    html += '</div>';
  }
  
  // Values preview
  if (SHOW_VALUE_PREVIEW && Object.keys(variableInfo.values).length > 0) {
    html += '<div style="margin-top: 8px; font-size: 11px; color: #666; font-family: monospace;">';
    html += '<strong>Values:</strong><br>';
    
    var modeCount = 0;
    for (var modeName in variableInfo.values) {
      if (modeCount >= 3) break; // Limit to 3 modes for space
      var value = variableInfo.values[modeName];
      html += '• ' + modeName + ': ' + value.formatted + '<br>';
      modeCount++;
    }
    
    if (Object.keys(variableInfo.values).length > 3) {
      html += '• ... and ' + (Object.keys(variableInfo.values).length - 3) + ' more modes<br>';
    }
    html += '</div>';
  }
  
  // Usage preview
  if (usage && usage.nodes.length > 0) {
    html += '<div style="margin-top: 8px; font-size: 11px; color: #666;">';
    html += '<strong>Used by:</strong><br>';
    
    for (var i = 0; i < Math.min(MAX_NODES_PREVIEW, usage.nodes.length); i++) {
      var node = usage.nodes[i];
      html += '• ' + node.nodeName + ' (' + node.nodeType + ')<br>';
    }
    
    if (usage.nodes.length > MAX_NODES_PREVIEW) {
      html += '• ... and ' + (usage.nodes.length - MAX_NODES_PREVIEW) + ' more nodes<br>';
    }
    
    html += '<strong>Properties:</strong> ' + Array.from(usage.properties).join(', ');
    html += '</div>';
  }
  
  html += '</div>';
  html += '</div>';
  
  // Collect node IDs for selection
  var nodeIds = [];
  if (usage) {
    for (var i = 0; i < usage.nodes.length; i++) {
      nodeIds.push(usage.nodes[i].nodeId);
    }
  }
  
  var severity = 'info';
  if (health.status === 'broken') severity = 'error';
  else if (health.status === 'warning') severity = 'warning';
  
  return createHtmlResult(html, nodeIds, severity);
};

// ===== MAIN EXECUTION =====

console.log('=== VARIABLE INSPECTOR ===');

var analysis = analyzeVariables();
var results = generateInspectorResults(analysis);

if (results.length > 0) {
  var title = 'Variable Inspector';
  if (SHOW_ONLY_USED_VARIABLES) {
    title += ': ' + analysis.usedVariables.size + ' used variables';
  } else {
    title += ': ' + analysis.allVariables.size + ' total variables';
  }
  
  displayResults({
    title: title,
    results: results,
    type: 'info'
  });
  
  console.log('Variable inspector results displayed');
  console.log('Click on any variable to select all nodes using it');
  console.log('Variables marked with ❌ or ⚠️ may need attention');
} else {
  figma.notify('No variables found to inspect');
}
