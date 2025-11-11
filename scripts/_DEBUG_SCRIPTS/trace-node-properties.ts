// Trace node properties - InfoPanel version
// Comprehensive debugging script to inspect node properties and variable bindings
// @import { displayResults, createHtmlResult } from "@InfoPanel"

(function() {
var selection = figma.currentPage.selection;

if (selection.length === 0) {
  figma.notify('Please select a node to trace');
  return;
}

var node = selection[0];
var traceResults = [];

// Helper function to get property display name
function getTracePropertyDisplay(property) {
  var propertyMap = {
    'fills': 'Fill',
    'strokes': 'Stroke',
    'effects': 'Effects',
    'fontSize': 'Font Size',
    'fontWeight': 'Font Weight',
    'fontFamily': 'Font Family',
    'lineHeight': 'Line Height',
    'letterSpacing': 'Letter Spacing',
    'width': 'Width',
    'height': 'Height',
    'cornerRadius': 'Corner Radius',
    'paddingTop': 'Padding Top',
    'paddingRight': 'Padding Right',
    'paddingBottom': 'Padding Bottom',
    'paddingLeft': 'Padding Left',
    'itemSpacing': 'Gap',
    'opacity': 'Opacity',
    'visible': 'Visibility'
  };
  return propertyMap[property] || property;
}

// Add basic node information
var basicInfoHtml = '<div class="info-entry">' +
  '<div class="info-entry-content">' +
    '<div class="info-entry-title">Node Information</div>' +
    '<div class="info-entry-subtitle">' +
      '<span class="info-entry-badge info">Type: ' + node.type + '</span>' +
      '<span class="info-entry-badge info">Name: ' + node.name + '</span>' +
      '<span class="info-entry-badge info">ID: ' + node.id + '</span>' +
    '</div>' +
  '</div>' +
'</div>';
traceResults.push(createHtmlResult(basicInfoHtml, node.id, 'info'));

// Log detailed node structure to console
console.log('=== DETAILED NODE TRACE ===');
console.log('Node:', node);
console.log('Node type:', node.type);
console.log('Node name:', node.name);
console.log('Node ID:', node.id);

// Check for variable bindings
if (node.boundVariables) {
  var properties = Object.keys(node.boundVariables);
  
  if (properties.length > 0) {
    // Add header for variable bindings
    var bindingsHeaderHtml = '<div class="info-category-header">' +
      '<span class="info-category-title">Variable Bindings (' + properties.length + ')</span>' +
    '</div>';
    traceResults.push(createHtmlResult(bindingsHeaderHtml, null, 'info'));
    
    console.log('=== VARIABLE BINDINGS ===');
    console.log('Found', properties.length, 'bound properties');
    
    for (var i = 0; i < properties.length; i++) {
      var property = properties[i];
      var binding = node.boundVariables[property];
      
      console.log('Property:', property);
      console.log('  Binding structure:', binding);
      console.log('  Binding type:', typeof binding);
      
      // Handle both direct binding and array binding formats
      var actualBinding = binding;
      var isArray = Array.isArray(binding);
      
      if (isArray && binding.length > 0 && binding[0].id) {
        actualBinding = binding[0];
      }
      
      var variableName = 'Unknown Variable';
      var variableStatus = 'error';
      var variableDetails = '';
      
      if (actualBinding && actualBinding.id) {
        try {
          var variable = figma.variables.getVariableById(actualBinding.id);
          if (variable) {
            variableName = variable.name || 'Unnamed Variable';
            variableStatus = 'success';
            variableDetails = 'Remote: ' + (variable.remote ? 'Yes' : 'No');
            if (variable.key) {
              variableDetails += ' • Key: ' + variable.key;
            }
            
            console.log('  ✅ Variable name:', variableName);
            console.log('  Variable key:', variable.key || 'no key');
            console.log('  Variable remote:', variable.remote || false);
          } else {
            variableDetails = 'Variable not found';
            console.log('  ❌ Variable not found for ID:', actualBinding.id);
          }
        } catch (error) {
          variableDetails = 'Error: ' + error.message;
          console.log('  ❌ Error getting variable:', error.message);
        }
      } else {
        variableDetails = 'No binding ID found';
        console.log('  ❌ No binding ID found');
      }
      
      // Create InfoPanel entry for this binding
      var bindingHtml = '<div class="info-entry">' +
        '<div class="info-entry-content">' +
          '<div class="info-entry-title">' + variableName + '</div>' +
          '<div class="info-entry-subtitle">' +
            '<span class="info-entry-badge ' + variableStatus + '">' + getTracePropertyDisplay(property) + '</span>' +
            (variableDetails ? '<span style="margin-left: 8px; font-size: 11px; color: #666;">' + variableDetails + '</span>' : '') +
            (isArray ? '<span style="margin-left: 8px; font-size: 11px; color: #666;">Array binding</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
      
      traceResults.push(createHtmlResult(bindingHtml, node.id, variableStatus));
    }
  } else {
    // No variable bindings
    var noBindingsHtml = '<div class="info-entry">' +
      '<div class="info-entry-content">' +
        '<div class="info-entry-title">No Variable Bindings</div>' +
        '<div class="info-entry-subtitle">' +
          '<span class="info-entry-badge info">This node has no variable bindings</span>' +
        '</div>' +
      '</div>' +
    '</div>';
    traceResults.push(createHtmlResult(noBindingsHtml, node.id, 'info'));
    
    console.log('No variable bindings found');
  }
} else {
  // No boundVariables property
  var noBoundVarsHtml = '<div class="info-entry">' +
    '<div class="info-entry-content">' +
      '<div class="info-entry-title">No boundVariables Property</div>' +
      '<div class="info-entry-subtitle">' +
        '<span class="info-entry-badge warning">This node type doesn\'t support variable bindings</span>' +
      '</div>' +
    '</div>' +
  '</div>';
  traceResults.push(createHtmlResult(noBoundVarsHtml, node.id, 'warning'));
  
  console.log('No boundVariables property found');
}

// Add console reference
var consoleInfoHtml = '<div class="info-entry">' +
  '<div class="info-entry-content">' +
    '<div class="info-entry-title">Detailed Information</div>' +
    '<div class="info-entry-subtitle">' +
      '<span class="info-entry-badge info">Check console for complete node structure and binding details</span>' +
    '</div>' +
  '</div>' +
'</div>';
traceResults.push(createHtmlResult(consoleInfoHtml, null, 'info'));

console.log('=== TRACE COMPLETED ===');

// Display results in InfoPanel
displayResults({
  title: 'Node Trace: ' + node.name,
  results: traceResults,
  type: 'info'
});

figma.notify('Node traced - check InfoPanel and console for details');
})();
