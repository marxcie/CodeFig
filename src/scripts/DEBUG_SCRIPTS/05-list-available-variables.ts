// List available variables
// Utility script to show all variables used in the selection

console.log('List Available Variables');

var mySelection = figma.currentPage.selection;

if (mySelection.length === 0) {
  console.log('No nodes selected');
  figma.notify('Please select nodes to see available variables');
} else {
  console.log('Scanning selected nodes for available variables...');
  
  // Get all variables used in selection
  var allVariableIds = [];
  var variablesByScale = {};
  
  for (var nodeIndex = 0; nodeIndex < mySelection.length; nodeIndex++) {
    var currentNode = mySelection[nodeIndex];
    
    if (currentNode.boundVariables) {
      var propertyKeys = Object.keys(currentNode.boundVariables);
      
      for (var propIndex = 0; propIndex < propertyKeys.length; propIndex++) {
        var bindingArray = currentNode.boundVariables[propertyKeys[propIndex]];
        
        if (Array.isArray(bindingArray)) {
          for (var bindingIndex = 0; bindingIndex < bindingArray.length; bindingIndex++) {
            if (bindingArray[bindingIndex] && bindingArray[bindingIndex].id) {
              allVariableIds.push(bindingArray[bindingIndex].id);
            }
          }
        }
      }
    }
  }
  
  console.log('Found ' + allVariableIds.length + ' variable references');
  
  // Get unique variables and organize by scale
  var uniqueVariables = [];
  var seenIds = {};
  
  for (var idIndex = 0; idIndex < allVariableIds.length; idIndex++) {
    var variableId = allVariableIds[idIndex];
    if (!seenIds[variableId]) {
      seenIds[variableId] = true;
      try {
        var variable = figma.variables.getVariableById(variableId);
        if (variable) {
          uniqueVariables.push(variable);
          
          // Organize typography scale variables
          if (variable.name.indexOf('typography/scale/') !== -1) {
            var scaleParts = variable.name.split('/');
            if (scaleParts.length >= 3) {
              var scale = scaleParts[2]; // e.g., "4xl", "3xl", "2xl"
              if (!variablesByScale[scale]) {
                variablesByScale[scale] = [];
              }
              variablesByScale[scale].push(variable.name);
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
  }
  
  console.log('=== ALL VARIABLES IN SELECTION ===');
  for (var varIndex = 0; varIndex < uniqueVariables.length; varIndex++) {
    var variable = uniqueVariables[varIndex];
    var isRemote = variable.remote ? ' (library)' : ' (local)';
    console.log('• ' + variable.name + isRemote);
  }
  
  console.log('');
  console.log('=== TYPOGRAPHY SCALES AVAILABLE ===');
  var scales = Object.keys(variablesByScale);
  for (var scaleIndex = 0; scaleIndex < scales.length; scaleIndex++) {
    var scale = scales[scaleIndex];
    console.log('Scale: ' + scale + ' (' + variablesByScale[scale].length + ' variables)');
    for (var scaleVarIndex = 0; scaleVarIndex < variablesByScale[scale].length; scaleVarIndex++) {
      console.log('  • ' + variablesByScale[scale][scaleVarIndex]);
    }
  }
  
  // Check if 2xl exists
  if (variablesByScale['2xl']) {
    console.log('');
    console.log('✅ 2xl scale variables ARE available!');
    figma.notify('✅ 2xl variables found! Check console for details.');
  } else {
    console.log('');
    console.log('❌ 2xl scale variables are NOT available in your selection.');
    console.log('Available scales: ' + Object.keys(variablesByScale).join(', '));
    figma.notify('❌ No 2xl variables found. Available: ' + Object.keys(variablesByScale).join(', '));
  }
}
