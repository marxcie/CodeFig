// Find broken variables - InfoPanel example
// This script demonstrates how to use @InfoPanel to display diagnostic results
// @import { displayResults, createResult, createSelectableResult, createHtmlResult } from "@InfoPanel"

// ===== BROKEN BINDING DETECTION =====

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

var findBrokenBindings = function() {
  var selection = figma.currentPage.selection;
  var brokenBindings = [];
  
  // If nothing selected, search entire page
  var nodesToCheck = selection.length > 0 ? selection : [figma.currentPage];
  var allNodes = collectAllNodes(nodesToCheck);
  
  for (var i = 0; i < allNodes.length; i++) {
    var node = allNodes[i];
    
    if (node.boundVariables) {
      var properties = Object.keys(node.boundVariables);
      
      // Check if this node has empty boundVariables (cleared by Figma after collection deletion)
      if (properties.length === 0) {
        // Automatically clean up empty boundVariables objects (edge case cleanup)
        try {
          delete node.boundVariables;
          console.log('Cleaned up empty boundVariables from:', node.name);
        } catch (e) {
          console.log('Could not clean up boundVariables from:', node.name, e.message);
        }
        continue; // Skip to next node (don't report as broken)
      }
      
      for (var j = 0; j < properties.length; j++) {
        var prop = properties[j];
        var binding = node.boundVariables[prop];
        
        // Handle both direct binding and array binding formats
        var actualBinding = binding;
        if (binding && Array.isArray(binding) && binding.length > 0 && binding[0].id) {
          // Array binding structure - extract the first binding
          actualBinding = binding[0];
        }
        
        if (actualBinding && actualBinding.id) {
          // Valid binding with ID - check if variable and collection exist
          try {
            var variable = figma.variables.getVariableById(actualBinding.id);
            if (!variable) {
              brokenBindings.push({
                nodeId: node.id,
                nodeName: node.name,
                nodeType: node.type,
                property: prop,
                variableId: actualBinding.id,
                variableName: 'Variable not found',
                issue: 'Variable not found',
                path: getNodePath(node)
              });
            } else {
              // Since you see these as "broken" in Figma UI, treat them as broken
              // even though the API says they're valid
              brokenBindings.push({
                nodeId: node.id,
                nodeName: node.name,
                nodeType: node.type,
                property: prop,
                variableId: actualBinding.id,
                variableName: variable.name,
                issue: 'Variable appears broken in Figma UI (collection disconnected)',
                path: getNodePath(node)
              });
            }
          } catch (e) {
            brokenBindings.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              property: prop,
              variableId: actualBinding.id,
              variableName: 'Error accessing variable',
              issue: 'Variable access error: ' + e.message,
              path: getNodePath(node)
            });
          }
        } else if (binding && typeof binding === 'object' && !binding.id) {
          // BROKEN BINDING: Object exists but has no ID (collection was deleted)
          // Try to extract any remaining information from the binding object
          var bindingInfo = {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            property: prop,
            variableId: 'missing-id',
            issue: 'Variable binding cleared (collection likely deleted)',
            path: getNodePath(node),
            // Extract any available binding properties
            bindingType: binding.type || 'unknown',
            bindingKeys: Object.keys(binding).join(', ') || 'none'
          };
          
          
          brokenBindings.push(bindingInfo);
        } else if (!binding || binding === undefined || binding === null) {
          // Empty/cleared binding
          brokenBindings.push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            property: prop,
            variableId: 'cleared-by-figma',
            issue: 'Variable binding was cleared (collection likely deleted)',
            path: getNodePath(node)
          });
        }
      }
    }
  }
  
  return brokenBindings;
};

// ===== HELPER FUNCTIONS =====

var getNodePath = function(node) {
  var path = [];
  var current = node;
  
  while (current && current.parent && current.parent.type !== 'DOCUMENT') {
    path.unshift(current.name);
    current = current.parent;
  }
  
  return path.join(' > ');
};

// ===== MAIN EXECUTION =====

var brokenBindings = findBrokenBindings();

console.log('=== DETECTION RESULTS ===');
console.log('- Broken bindings:', brokenBindings.length);

if (brokenBindings.length > 0) {
  console.log('First broken binding:', brokenBindings[0]);
} else {
  console.log('No broken bindings found - this means the detection logic needs to be fixed');
}

// ===== GROUP AND DISPLAY RESULTS =====

var allResults = [];

if (brokenBindings.length === 0) {
  // Success case - only show toast notification
  figma.notify('✅ No broken variables found! All bindings are healthy.', { timeout: 3000 });
  
  // Only update InfoPanel if it's already open
  if (window._infoPanelHandler) {
    // Check if panel is open by sending a special message
    window._infoPanelHandler({
      type: 'INFO_PANEL_SUCCESS',
      title: 'Broken Variables:',
      results: [{
        message: 'No broken variables found!',
        severity: 'success'
      }],
      autoClose: true
    });
  }
  
  return;
}

// Process broken bindings - centralized error management
// Group broken bindings by category and variable name
var categoryGroups = {
  'Typography': {},
  'Color': {},
  'Dimensions & Spacing': {},
  'Grid & Effects': {}
};

// Property to category mapping
var propertyCategories = {
  // Typography
  'fontSize': 'Typography',
  'fontWeight': 'Typography', 
  'fontFamily': 'Typography',
  'lineHeight': 'Typography',
  'letterSpacing': 'Typography',
  'paragraphSpacing': 'Typography',
  'paragraphIndent': 'Typography',
  'textCase': 'Typography',
  'textDecoration': 'Typography',
  'characters': 'Typography',
  
  // Color
  'fills': 'Color',
  'strokes': 'Color',
  'opacity': 'Color',
  
  // Dimensions & Spacing
  'width': 'Dimensions & Spacing',
  'height': 'Dimensions & Spacing',
  'minWidth': 'Dimensions & Spacing',
  'maxWidth': 'Dimensions & Spacing',
  'minHeight': 'Dimensions & Spacing',
  'maxHeight': 'Dimensions & Spacing',
  'paddingTop': 'Dimensions & Spacing',
  'paddingRight': 'Dimensions & Spacing',
  'paddingBottom': 'Dimensions & Spacing',
  'paddingLeft': 'Dimensions & Spacing',
  'itemSpacing': 'Dimensions & Spacing',
  'cornerRadius': 'Dimensions & Spacing',
  'topLeftRadius': 'Dimensions & Spacing',
  'topRightRadius': 'Dimensions & Spacing',
  'bottomLeftRadius': 'Dimensions & Spacing',
  'bottomRightRadius': 'Dimensions & Spacing',
  'strokeWeight': 'Dimensions & Spacing',
  'strokeTopWeight': 'Dimensions & Spacing',
  'strokeRightWeight': 'Dimensions & Spacing',
  'strokeBottomWeight': 'Dimensions & Spacing',
  'strokeLeftWeight': 'Dimensions & Spacing',
  
  // Grid & Effects
  'layoutGrids': 'Grid & Effects',
  'effects': 'Grid & Effects',
  'visible': 'Grid & Effects'
};

for (var i = 0; i < brokenBindings.length; i++) {
  var binding = brokenBindings[i];
  var category = propertyCategories[binding.property] || 'Grid & Effects'; // Default fallback
  var groupKey = (binding.variableName || 'Unknown Variable') + '::' + binding.property;
  
  if (!categoryGroups[category][groupKey]) {
    categoryGroups[category][groupKey] = {
      variableName: binding.variableName || 'Unknown Variable',
      property: binding.property,
      nodeIds: [],
      nodes: [],
      count: 0
    };
  }
  
  categoryGroups[category][groupKey].nodeIds.push(binding.nodeId);
  categoryGroups[category][groupKey].nodes.push(binding.nodeName);
  categoryGroups[category][groupKey].count++;
}

var categories = ['Typography', 'Color', 'Dimensions & Spacing', 'Grid & Effects'];

for (var c = 0; c < categories.length; c++) {
  var categoryName = categories[c];
  var categoryData = categoryGroups[categoryName];
  
  // Skip empty categories
  var hasEntries = false;
  for (var key in categoryData) {
    hasEntries = true;
    break;
  }
  if (!hasEntries) continue;
  
  // Add category header
  var categoryHtml = '<div class="info-category-header">' +
    '<span class="info-category-title">' + categoryName + '</span>' +
  '</div>';
  allResults.push(createHtmlResult(categoryHtml, null, 'info'));
  
  // Helper function to convert property name to readable format
  function getPropertyDisplay(property) {
    if (property === 'fills') return 'Fill';
    if (property === 'strokes') return 'Stroke';
    if (property === 'effects') return 'Effects';
    if (property === 'fontSize') return 'Font Size';
    if (property === 'fontWeight') return 'Font Weight';
    if (property === 'fontFamily') return 'Font Family';
    if (property === 'lineHeight') return 'Line Height';
    if (property === 'letterSpacing') return 'Letter Spacing';
    if (property === 'paragraphSpacing') return 'Paragraph Spacing';
    if (property === 'paragraphIndent') return 'Paragraph Indent';
    if (property === 'textCase') return 'Text Case';
    if (property === 'textDecoration') return 'Text Decoration';
    if (property === 'characters') return 'Text Content';
    if (property === 'width') return 'Width';
    if (property === 'height') return 'Height';
    if (property === 'minWidth') return 'Min Width';
    if (property === 'maxWidth') return 'Max Width';
    if (property === 'minHeight') return 'Min Height';
    if (property === 'maxHeight') return 'Max Height';
    if (property === 'paddingTop') return 'Padding Top';
    if (property === 'paddingRight') return 'Padding Right';
    if (property === 'paddingBottom') return 'Padding Bottom';
    if (property === 'paddingLeft') return 'Padding Left';
    if (property === 'itemSpacing') return 'Gap';
    if (property === 'cornerRadius') return 'Corner Radius';
    if (property === 'topLeftRadius') return 'Top Left Radius';
    if (property === 'topRightRadius') return 'Top Right Radius';
    if (property === 'bottomLeftRadius') return 'Bottom Left Radius';
    if (property === 'bottomRightRadius') return 'Bottom Right Radius';
    if (property === 'strokeWeight') return 'Stroke Weight';
    if (property === 'strokeTopWeight') return 'Stroke Top Weight';
    if (property === 'strokeRightWeight') return 'Stroke Right Weight';
    if (property === 'strokeBottomWeight') return 'Stroke Bottom Weight';
    if (property === 'strokeLeftWeight') return 'Stroke Left Weight';
    if (property === 'opacity') return 'Opacity';
    if (property === 'visible') return 'Visibility';
    if (property === 'layoutGrids') return 'Layout Grids';
    return property;
  }

  // Helper function to get base variable name (remove last part for typography)
  function getBaseVariableName(variableName, category) {
    if (category === 'Typography' && variableName) {
      var parts = variableName.split('/');
      if (parts.length > 1) {
        // Remove the last part (e.g., "Typography/4xl/font-size" -> "Typography/4xl")
        return parts.slice(0, -1).join('/');
      }
    }
    return variableName;
  }

  // Special handling for Typography category - group by base name
  if (categoryName === 'Typography') {
    var typographyGroups = {};
    
    // Group typography entries by base name
    for (var groupKey in categoryData) {
      var group = categoryData[groupKey];
      var baseName = getBaseVariableName(group.variableName, 'Typography');
      
      if (!typographyGroups[baseName]) {
        typographyGroups[baseName] = {
          baseName: baseName,
          properties: [],
          nodeIds: [],
          totalCount: 0,
          originalEntries: [] // Keep track of original entries
        };
      }
      
      typographyGroups[baseName].properties.push(group.property);
      typographyGroups[baseName].nodeIds = typographyGroups[baseName].nodeIds.concat(group.nodeIds);
      typographyGroups[baseName].totalCount += group.count;
      typographyGroups[baseName].originalEntries.push(group);
    }
    
    // Create entries for typography groups
    for (var baseName in typographyGroups) {
      var typoGroup = typographyGroups[baseName];
      
      // If only one property, don't merge - show full variable name
      if (typoGroup.properties.length === 1) {
        var originalGroup = typoGroup.originalEntries[0];
        var propertyDisplay = getPropertyDisplay(originalGroup.property);
        
        // Create entry HTML with full variable name
        var entryHtml = '<div class="info-entry">' +
          '<div class="info-entry-content">' +
            '<div class="info-entry-title">' + originalGroup.variableName + 
            '<span class="info-entry-count"> (' + originalGroup.count + ')</span>' +
            '</div>' +
            '<div class="info-entry-subtitle">' +
              '<span class="info-entry-badge error">' + propertyDisplay + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
        
        // Create HTML result with bulk selection
        allResults.push(createHtmlResult(entryHtml, originalGroup.nodeIds, 'error'));
      } else {
        // Multiple properties - merge with base name and multiple badges
        var propertyBadges = typoGroup.properties.map(function(prop) {
          return '<span class="info-entry-badge error">' + getPropertyDisplay(prop) + '</span>';
        }).join('');
        
        // Create entry HTML with base name
        var entryHtml = '<div class="info-entry">' +
          '<div class="info-entry-content">' +
            '<div class="info-entry-title">' + typoGroup.baseName + 
            '<span class="info-entry-count"> (' + typoGroup.totalCount + ')</span>' +
            '</div>' +
            '<div class="info-entry-subtitle">' +
              propertyBadges +
            '</div>' +
          '</div>' +
        '</div>';
        
        // Create HTML result with bulk selection
        allResults.push(createHtmlResult(entryHtml, typoGroup.nodeIds, 'error'));
      }
    }
  } else {
    // Regular handling for other categories - keep properties separate
    for (var groupKey in categoryData) {
      var group = categoryData[groupKey];
      var propertyDisplay = getPropertyDisplay(group.property);
      
      // Create entry HTML
      var entryHtml = '<div class="info-entry">' +
        '<div class="info-entry-content">' +
          '<div class="info-entry-title">' + group.variableName + 
          '<span class="info-entry-count"> (' + group.count + ')</span>' +
          '</div>' +
          '<div class="info-entry-subtitle">' +
            '<span class="info-entry-badge error">' + propertyDisplay + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
      
      // Create HTML result with bulk selection
      allResults.push(createHtmlResult(entryHtml, group.nodeIds, 'error'));
    }
  }
}

// Create summary message
var summary = 'Found ' + brokenBindings.length + ' broken binding' + (brokenBindings.length > 1 ? 's' : '');

console.log('About to display results:', allResults.length, 'items');

displayResults({
  title: 'Broken Variables: ' + brokenBindings.length,
  results: allResults,
  type: 'error'
});

console.log('Results sent to InfoPanel');
figma.notify(summary);
