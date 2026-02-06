// Variable Inspector
// @DOC_START
// # 🔍 Variable Inspector
// 
// Comprehensive variable analysis tool showing all variables with their values, health status, and usage in your selection and styles.
//
// ## Features
// - **Health Check**: Identifies variables with missing values or issues
// - **Usage Analysis**: Shows which nodes AND styles use each variable
// - **Value Preview**: Displays variable values across all modes
// - **Smart Filtering**: Filter by variable purpose (typography, color, dimensions, effects)
// - **Clickable Nodes**: Click individual nodes to select them
//
// ## Configuration
// See CONFIG tab to adjust inspector behavior:
// 
// **Display Options:**
// - `onlyUsedVariables` - Show only variables used in selection/styles
// - `groupByCollection` - Organize variables by collection
// - `showValuePreview` - Display actual variable values
// - `maxNodesPreview` - Number of individual nodes to show (rest clickable as "Show all X nodes")
//
// **Variable Purpose Filters:**
// - `typographicVariables` - Typography (fontSize, letterSpacing, lineHeight, etc.)
// - `colorVariables` - Colors (fills, strokes, backgrounds)
// - `dimensionVariables` - Dimensions & spacing (width, height, padding, gap, radius, etc.)
// - `effectVariables` - Effects & opacity (shadows, blur, opacity)
// - `otherVariables` - Other/miscellaneous variables
//
// **Advanced Options:**
// - `checkStyleUsage` - Check if variables are used in text/paint/effect styles
// - `showHealthScore` - Display variable health score (0-100)
//
// ## Status Indicators
// - ✅ Healthy - Variable is working correctly
// - ⚠️ Warning - Variable has some issues (missing values in modes)
// - ❌ Broken - Variable has critical issues
// - 🔗 Remote - Library/remote variable
//
// ## Usage
// 1. Select nodes to inspect (or leave empty for entire page)
// 2. Run the script
// 3. Click any variable to select all nodes using it
// 4. Click individual node names to select specific nodes
// 5. Click "Show all X nodes" to select all nodes at once
// @DOC_END

// @UI_CONFIG_START
// # Configuration
// Display and filter options for the Variable Inspector.

// ## Display Options
//
var onlyUsedVariables = true; // Show only variables used in selection/styles
var groupByCollection = true; // Group variables by collection
var showValuePreview = true; // Show actual variable values
var maxNodesPreview = 5; // Max nodes in usage preview (rest: "Show all X nodes")
//
// ---
//
// ## Variable Purpose Filters
//
var typographicVariables = true; // Typography (fontSize, letterSpacing, etc.)
var colorVariables = true; // Colors (fills, strokes)
var dimensionVariables = true; // Dimensions & spacing
var effectVariables = true; // Effects & opacity
var otherVariables = true; // Other/miscellaneous
//
// ---
//
// ## Advanced
//
var checkStyleUsage = true; // Check usage in text/paint/effect styles
var showHealthScore = false; // Show variable health score (0-100)
// @UI_CONFIG_END

// Variable Inspector
// Detailed inspector showing all variables with their current values for visual identification
// @import { displayResults, createResult, createSelectableResult, createHtmlResult } from "@InfoPanel"

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

var getVariablePurpose = function(variableInfo) {
  var variable = variableInfo.variable;
  var usage = variableInfo.usage;
  
  // If COLOR type, it's definitely a color variable
  if (variable.resolvedType === 'COLOR') {
    return 'color';
  }
  
  // Check usage properties to determine purpose
  if (usage && usage.properties) {
    var properties = Array.from(usage.properties);
    
    // Typography-related properties
    var typographyProps = ['fontSize', 'letterSpacing', 'lineHeight', 'paragraphSpacing', 'paragraphIndent', 'fontWeight', 'textCase', 'textDecoration'];
    var hasTypography = properties.some(function(prop) {
      return typographyProps.indexOf(prop) !== -1;
    });
    if (hasTypography) return 'typographic';
    
    // Dimension & spacing properties
    var dimensionProps = ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing', 'counterAxisSpacing', 'cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius', 'strokeWeight', 'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'];
    var hasDimension = properties.some(function(prop) {
      return dimensionProps.indexOf(prop) !== -1;
    });
    if (hasDimension) return 'dimension';
    
    // Effect-related properties
    var effectProps = ['effects', 'opacity', 'blendMode'];
    var hasEffect = properties.some(function(prop) {
      return effectProps.indexOf(prop) !== -1;
    });
    if (hasEffect) return 'effect';
    
    // Fill/stroke properties (color-related)
    var colorProps = ['fills', 'strokes', 'backgrounds'];
    var hasColor = properties.some(function(prop) {
      return colorProps.indexOf(prop) !== -1;
    });
    if (hasColor) return 'color';
  }
  
  // Check variable name patterns as fallback
  var varName = variable.name.toLowerCase();
  if (varName.indexOf('color') !== -1 || varName.indexOf('fill') !== -1 || varName.indexOf('stroke') !== -1) {
    return 'color';
  }
  if (varName.indexOf('font') !== -1 || varName.indexOf('text') !== -1 || varName.indexOf('letter') !== -1 || varName.indexOf('line-height') !== -1) {
    return 'typographic';
  }
  if (varName.indexOf('spacing') !== -1 || varName.indexOf('padding') !== -1 || varName.indexOf('margin') !== -1 || varName.indexOf('gap') !== -1 || varName.indexOf('radius') !== -1 || varName.indexOf('size') !== -1 || varName.indexOf('width') !== -1 || varName.indexOf('height') !== -1) {
    return 'dimension';
  }
  if (varName.indexOf('opacity') !== -1 || varName.indexOf('shadow') !== -1 || varName.indexOf('blur') !== -1 || varName.indexOf('effect') !== -1) {
    return 'effect';
  }
  
  // Default to other
  return 'other';
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
    collections: new Map(),
    styleUsage: new Map() // Track variable usage in styles
  };
  
  console.log('=== VARIABLE INSPECTOR ANALYSIS ===');
  
  // If we want to show only used variables, scan the selection first
  if (onlyUsedVariables) {
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
                styles: [],
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
  
  // Check style usage if enabled
  if (checkStyleUsage) {
    console.log('Checking styles for variable usage...');
    
    // Check text styles
    var textStyles = figma.getLocalTextStyles();
    for (var i = 0; i < textStyles.length; i++) {
      var style = textStyles[i];
      if (style.boundVariables) {
        var properties = Object.keys(style.boundVariables);
        for (var j = 0; j < properties.length; j++) {
          var prop = properties[j];
          var binding = style.boundVariables[prop];
          if (binding && binding.id) {
            var variableId = binding.id;
            
            if (!analysis.usedVariables.has(variableId)) {
              analysis.usedVariables.set(variableId, {
                variableId: variableId,
                usageCount: 0,
                nodes: [],
                styles: [],
                properties: new Set()
              });
            }
            
            var usage = analysis.usedVariables.get(variableId);
            usage.styles.push({
              styleName: style.name,
              styleType: 'TEXT',
              property: prop
            });
            usage.properties.add(prop);
          }
        }
      }
    }
    
    // Check paint styles
    var paintStyles = figma.getLocalPaintStyles();
    for (var i = 0; i < paintStyles.length; i++) {
      var style = paintStyles[i];
      if (style.boundVariables && style.boundVariables.paints) {
        var bindings = style.boundVariables.paints;
        if (Array.isArray(bindings)) {
          for (var j = 0; j < bindings.length; j++) {
            var binding = bindings[j];
            if (binding && binding.id) {
              var variableId = binding.id;
              
              if (!analysis.usedVariables.has(variableId)) {
                analysis.usedVariables.set(variableId, {
                  variableId: variableId,
                  usageCount: 0,
                  nodes: [],
                  styles: [],
                  properties: new Set()
                });
              }
              
              var usage = analysis.usedVariables.get(variableId);
              usage.styles.push({
                styleName: style.name,
                styleType: 'PAINT',
                property: 'color'
              });
              usage.properties.add('paints');
            }
          }
        }
      }
    }
    
    // Check effect styles
    var effectStyles = figma.getLocalEffectStyles();
    for (var i = 0; i < effectStyles.length; i++) {
      var style = effectStyles[i];
      if (style.boundVariables && style.boundVariables.effects) {
        var bindings = style.boundVariables.effects;
        if (Array.isArray(bindings)) {
          for (var j = 0; j < bindings.length; j++) {
            var binding = bindings[j];
            if (binding && binding.id) {
              var variableId = binding.id;
              
              if (!analysis.usedVariables.has(variableId)) {
                analysis.usedVariables.set(variableId, {
                  variableId: variableId,
                  usageCount: 0,
                  nodes: [],
                  styles: [],
                  properties: new Set()
                });
              }
              
              var usage = analysis.usedVariables.get(variableId);
              usage.styles.push({
                styleName: style.name,
                styleType: 'EFFECT',
                property: 'effects'
              });
              usage.properties.add('effects');
            }
          }
        }
      }
    }
    
    console.log('Style checking complete');
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
  if (onlyUsedVariables) {
    analysis.usedVariables.forEach(function(usage, variableId) {
      var variableInfo = analysis.allVariables.get(variableId);
      if (variableInfo) {
        variablesToShow.set(variableId, variableInfo);
      }
    });
  } else {
    variablesToShow = analysis.allVariables;
  }
  
  // Filter by variable purpose
  var filteredVariables = new Map();
  variablesToShow.forEach(function(variableInfo, variableId) {
    var purpose = getVariablePurpose(variableInfo);
    var shouldInclude = false;
    
    if (purpose === 'typographic' && typographicVariables) shouldInclude = true;
    else if (purpose === 'color' && colorVariables) shouldInclude = true;
    else if (purpose === 'dimension' && dimensionVariables) shouldInclude = true;
    else if (purpose === 'effect' && effectVariables) shouldInclude = true;
    else if (purpose === 'other' && otherVariables) shouldInclude = true;
    
    if (shouldInclude) {
      filteredVariables.set(variableId, variableInfo);
    }
  });
  
  console.log('Displaying', filteredVariables.size, 'variables');
  
  if (groupByCollection) {
    // Group by collection
    var collectionGroups = new Map();
    
    filteredVariables.forEach(function(variableInfo, variableId) {
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
    filteredVariables.forEach(function(variableInfo, variableId) {
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
  var healthIcon = '';
  if (health.status === 'broken') healthIcon = '❌';
  else if (health.status === 'warning') healthIcon = '⚠️';
  else if (health.status === 'remote') healthIcon = '❖';
  
  var typeIcon = '';
  // if (variable.resolvedType === 'COLOR') typeIcon = '🎨';
  // else if (variable.resolvedType === 'FLOAT') typeIcon = '🔢';
  // else if (variable.resolvedType === 'BOOLEAN') typeIcon = '☑️';
  
  // Build HTML - using InfoPanel CSS classes instead of inline styles
  var html = '<div class="info-entry">';
  html += '<div class="info-entry-content">';
  html += '<div class="info-entry-title">' + healthIcon + ' ' + typeIcon + ' ' + variable.name + '</div>';
  
  var subtitle = 'Collection:' + variableInfo.collection ? variableInfo.collection.name : 'Unknown Collection';
  if (usage) {
    var totalUsage = usage.nodes.length + usage.styles.length;
    subtitle += ' • Used ' + totalUsage + ' times';
  } else {
    subtitle += ' • Not used in selection';
  }
  
  if (showHealthScore) {
    subtitle += ' • Health: ' + health.score + '/100';
  }
  
  html += '<div class="info-entry-subtitle">' + subtitle + '</div>';
  
  // Health issues - using error-text class instead of inline color
  if (health.issues.length > 0) {
    html += '<div class="info-result-details" style="margin-top: 4px;">';
    html += '<span class="error-text">⚠️ ' + health.issues.join(', ') + '</span>';
    html += '</div>';
  }
  
  // Values preview - using info-result-details class for styling
  if (showValuePreview && Object.keys(variableInfo.values).length > 0) {
    html += '<div class="info-result-details" style="margin-top: 8px;">';
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
  
  // Style usage preview
  if (usage && usage.styles && usage.styles.length > 0) {
    html += '<div class="info-result-details" style="margin-top: 8px;">';
    html += '<strong>Used in styles:</strong><br>';
    
    for (var i = 0; i < usage.styles.length; i++) {
      var style = usage.styles[i];
      html += '• ' + style.styleName + ' (' + style.styleType + ' STYLE)<br>';
    }
    html += '</div>';
  }
  
  // Node usage preview with clickable individual nodes
  if (usage && usage.nodes && usage.nodes.length > 0) {
    html += '<div class="info-result-details" style="margin-top: 8px;">';
    html += '<strong>Used by ' + usage.nodes.length + ' node' + (usage.nodes.length > 1 ? 's' : '') + ':</strong><br>';
    
    // Show individual clickable nodes up to maxNodesPreview
    for (var i = 0; i < Math.min(maxNodesPreview, usage.nodes.length); i++) {
      var node = usage.nodes[i];
      // Each node gets its own clickable line - we'll create separate results for these
      html += '• <span data-node-id="' + node.nodeId + '">' + node.nodeName + ' (' + node.nodeType + ')</span><br>';
    }
    
    // Show total count with click to select all
    if (usage.nodes.length > maxNodesPreview) {
      html += '• <strong><span data-select-all="true">Show all ' + usage.nodes.length + ' nodes</span></strong><br>';
    }
    
    html += '<strong>Properties:</strong> ' + Array.from(usage.properties).join(', ');
    html += '</div>';
  }
  
  html += '</div>';
  html += '</div>';
  
  // Collect node IDs for selection when clicking the main result
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
  if (onlyUsedVariables) {
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
