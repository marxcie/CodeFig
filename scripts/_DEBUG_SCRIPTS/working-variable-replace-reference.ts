// Working variable replace reference
// Reference implementation of working variable replacement with library import

console.log('Working Variable Replace Reference - Library Import Version');

// Configuration
var searchPattern = '4xl';
var replacePattern = '2xl';

var mySelection = figma.currentPage.selection;

if (mySelection.length === 0) {
  console.log('No nodes selected');
  figma.notify('Please select nodes to process');
} else {
  console.log('Processing ' + mySelection.length + ' nodes');
  
  async function replaceWithCorrectOrder() {
    var totalReplacements = 0;
    var variableCache = new Map();
    
    try {
      console.log('Building variable cache...');
      
      // Build cache from library collections
      var libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      console.log('Found ' + libraryCollections.length + ' library variable collections');
      
      for (var libIndex = 0; libIndex < libraryCollections.length; libIndex++) {
        var libraryCollection = libraryCollections[libIndex];
        
        try {
          var libraryVariables = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libraryCollection.key);
          
          for (var libVarIndex = 0; libVarIndex < libraryVariables.length; libVarIndex++) {
            var libraryVariable = libraryVariables[libVarIndex];
            variableCache.set(libraryVariable.name, {
              name: libraryVariable.name,
              key: libraryVariable.key,
              isLibrary: true
            });
          }
        } catch (e) {
          // Skip collections that can't be accessed
        }
      }
      
      console.log('Variable cache built with ' + variableCache.size + ' total variables');
      
      // Process each selected node
      for (var nodeIndex = 0; nodeIndex < mySelection.length; nodeIndex++) {
        var currentNode = mySelection[nodeIndex];
        console.log('Processing node: ' + currentNode.name);
        
        if (currentNode.type !== 'TEXT') {
          console.log('  Skipping non-text node');
          continue;
        }
        
        try {
          var nodeBoundVars = currentNode.boundVariables;
          if (nodeBoundVars) {
            var propertyKeys = Object.keys(nodeBoundVars);
            
            // Process each property
            for (var propIndex = 0; propIndex < propertyKeys.length; propIndex++) {
              var propertyName = propertyKeys[propIndex];
              var bindingArray = nodeBoundVars[propertyName];
              
              if (Array.isArray(bindingArray)) {
                console.log('  Processing property: ' + propertyName + ' (' + bindingArray.length + ' variables)');
                
                var replacementVariable = null;
                var hasVariablesToReplace = false;
                
                // First: Check if we have variables to replace and import replacement
                for (var bindingIndex = 0; bindingIndex < bindingArray.length; bindingIndex++) {
                  var variableAlias = bindingArray[bindingIndex];
                  
                  if (variableAlias && variableAlias.id) {
                    try {
                      var currentVariable = figma.variables.getVariableById(variableAlias.id);
                      if (currentVariable && currentVariable.name && currentVariable.name.indexOf(searchPattern) !== -1) {
                        console.log('    Found variable to replace: "' + currentVariable.name + '"');
                        hasVariablesToReplace = true;
                        
                        if (!replacementVariable) {
                          var newVariableName = currentVariable.name.replace(new RegExp(searchPattern, 'g'), replacePattern);
                          console.log('    Looking for replacement: "' + newVariableName + '"');
                          
                          var replacementInfo = variableCache.get(newVariableName);
                          if (replacementInfo) {
                            console.log('    Importing replacement variable...');
                            replacementVariable = await figma.variables.importVariableByKeyAsync(replacementInfo.key);
                            console.log('    ✅ Imported: "' + replacementVariable.name + '"');
                          } else {
                            console.log('    ❌ Replacement not found in cache');
                          }
                        }
                      }
                    } catch (e) {
                      console.log('    Error getting variable: ' + e.message);
                    }
                  }
                }
                
                // Second: If we have replacements to make, use correct parameter order
                if (hasVariablesToReplace && replacementVariable) {
                  console.log('    🔄 Replacing with correct parameter order...');
                  
                  try {
                    if (propertyName === 'fontSize' || propertyName === 'letterSpacing' || propertyName === 'lineHeight') {
                      // For text properties, use correct parameter order: start, end, property, variable
                      var textLength = currentNode.characters.length;
                      var startPos = 0;
                      var endPos = Number(textLength);
                      
                      console.log('    Parameters: start=' + startPos + ', end=' + endPos + ', property="' + propertyName + '"');
                      
                      // CORRECT ORDER: setRangeBoundVariable(start, end, property, variable)
                      currentNode.setRangeBoundVariable(startPos, endPos, propertyName, {
                        type: 'VARIABLE_ALIAS',
                        id: replacementVariable.id
                      });
                      
                      console.log('    ✅ Successfully replaced using correct parameter order!');
                      totalReplacements++;
                    } else {
                      // For other properties, use setBoundVariable
                      console.log('    Using setBoundVariable for property: ' + propertyName);
                      currentNode.setBoundVariable(propertyName, {
                        type: 'VARIABLE_ALIAS',
                        id: replacementVariable.id
                      });
                      console.log('    ✅ Successfully replaced using setBoundVariable!');
                      totalReplacements++;
                    }
                  } catch (apiError) {
                    console.log('    ❌ API method failed: ' + apiError.message);
                  }
                }
              }
            }
          }
        } catch (nodeError) {
          console.log('  Error processing node: ' + nodeError.message);
        }
      }
      
      console.log('');
      console.log('=== REPLACEMENT COMPLETED ===');
      console.log('Total replacements: ' + totalReplacements);
      
      if (totalReplacements > 0) {
        figma.notify('✅ Replaced ' + totalReplacements + ' properties (' + searchPattern + ' → ' + replacePattern + ')');
      } else {
        figma.notify('No variables were replaced. Check console for details.');
      }
      
    } catch (error) {
      console.log('❌ Error: ' + error.message);
      figma.notify('❌ Error: ' + error.message);
    }
  }
  
  replaceWithCorrectOrder();
}
