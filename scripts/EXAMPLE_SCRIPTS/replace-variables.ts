// Replace Variables
// @DOC_START
// # Replace Variables
// Multiple find and replace operations for variable bindings.
//
// ## Overview
// Searches for text within variable names and replaces it. Supports multiple operations and collection filtering.
//
// ## Config options
// - **find** – Text to find (will match anywhere in variable name)
// - **replace** – Text to replace with
// - **sourceCollection** – Optional: only replace from this collection (empty = all)
// - **targetCollection** – Optional: only replace with variables from this collection (empty = all)
// @DOC_END

var CONFIG = [
// @CONFIG_START
{
    find: 'red',
    sourceCollection: '',
    replace: 'blue',
    targetCollection: ''
  }
  // Add more operations by uncommenting:
  // {
  //   find: 'yellow',
  //   sourceCollection: 'Colors',
  //   replace: 'red',
  //   targetCollection: 'Colors-new'
  // },
  // {
  //   find: 'brand-1/yellow',
  //   sourceCollection: 'Colors',
  //   replace: 'brand-2/green',
  //   targetCollection: 'Colors'
  // }
// @CONFIG_END
];

// Collect all nodes recursively
function collectAllNodes(nodes) {
  var result = [];
  function traverse(node) {
    result.push(node);
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        traverse(node.children[i]);
      }
    }
  }
  for (var i = 0; i < nodes.length; i++) {
    traverse(nodes[i]);
  }
  return result;
}

async function findAndReplaceVariables() {
  var selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify('⚠️ Please select at least one node');
    return;
  }
  
  console.log('=== FIND & REPLACE VARIABLES ===');
  console.log('Total operations:', CONFIG.length);
  for (var i = 0; i < CONFIG.length; i++) {
    console.log('  [' + (i + 1) + '] "' + CONFIG[i].find + '" → "' + CONFIG[i].replace + '"' +
      (CONFIG[i].sourceCollection ? ' (from: ' + CONFIG[i].sourceCollection + ')' : '') +
      (CONFIG[i].targetCollection ? ' (to: ' + CONFIG[i].targetCollection + ')' : ''));
  }
  
  var allNodes = collectAllNodes(selection);
  console.log('Total nodes to process:', allNodes.length);
  
  // Build variable cache
  console.log('Building variable cache...');
  var variableCache = new Map(); // fullName -> { id, collectionName, variable }
  
  try {
    // Local variables
    var localCollections = figma.variables.getLocalVariableCollections();
    for (var i = 0; i < localCollections.length; i++) {
      var collection = localCollections[i];
      for (var j = 0; j < collection.variableIds.length; j++) {
        var variable = figma.variables.getVariableById(collection.variableIds[j]);
        if (variable) {
          variableCache.set(variable.name, {
            id: variable.id,
            name: variable.name,
            collectionName: collection.name,
            variable: variable
          });
        }
      }
    }
    
    // Library variables
    var libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    for (var i = 0; i < libraryCollections.length; i++) {
      var libCollection = libraryCollections[i];
      try {
        var libraryVariables = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libCollection.key);
        for (var j = 0; j < libraryVariables.length; j++) {
          var libVar = libraryVariables[j];
          variableCache.set(libVar.name, {
            key: libVar.key,
            name: libVar.name,
            collectionName: libCollection.name,
            isLibrary: true
          });
        }
      } catch (e) {
        // Skip inaccessible collections
      }
    }
    
    console.log('Variable cache built:', variableCache.size, 'variables');
    
  } catch (error) {
    console.error('Error building variable cache:', error);
    figma.notify('❌ Error loading variables: ' + error.message);
    return;
  }
  
  // Process nodes
  var replacementCount = 0;
  var skippedCount = 0;
  
  for (var nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
    var node = allNodes[nodeIndex];
    
    if (!node.boundVariables) continue;
    
    var properties = Object.keys(node.boundVariables);
    if (properties.length === 0) continue;
    
    for (var propIndex = 0; propIndex < properties.length; propIndex++) {
      var property = properties[propIndex];
      var binding = node.boundVariables[property];
      
      if (!binding) continue;
      
      var bindingArray = Array.isArray(binding) ? binding : [binding];
      
      for (var bindIndex = 0; bindIndex < bindingArray.length; bindIndex++) {
        var variableAlias = bindingArray[bindIndex];
        
        if (!variableAlias || !variableAlias.id) continue;
        
        try {
          var currentVariable = figma.variables.getVariableById(variableAlias.id);
          
          if (!currentVariable) {
            console.log('Could not resolve variable:', variableAlias.id);
            continue;
          }
          
          var currentCollection = figma.variables.getVariableCollectionById(currentVariable.variableCollectionId);
          var currentCollectionName = currentCollection ? currentCollection.name : 'Unknown';
          
          console.log('Found bound variable:', currentVariable.name, 'from collection:', currentCollectionName);
          
          // Try each config operation
          var matchedOperation = null;
          var newVariableName = null;
          
          for (var configIndex = 0; configIndex < CONFIG.length; configIndex++) {
            var operation = CONFIG[configIndex];
            
            // Check source collection filter
            if (operation.sourceCollection && currentCollectionName !== operation.sourceCollection) {
              continue;
            }
            
            // Check if variable name contains search text
            if (currentVariable.name.indexOf(operation.find) === -1) {
              continue;
            }
            
            // Found a match!
            matchedOperation = operation;
            newVariableName = currentVariable.name.replace(operation.find, operation.replace);
            break;
          }
          
          if (!matchedOperation) {
            console.log('  No matching operation');
            continue;
          }
          
          console.log('  Match! Looking for replacement:', newVariableName);
          
          // Find replacement variable
          var replacementInfo = variableCache.get(newVariableName);
          
          if (!replacementInfo) {
            console.log('  ❌ Replacement variable not found:', newVariableName);
            skippedCount++;
            continue;
          }
          
          // Check target collection filter
          if (matchedOperation.targetCollection && replacementInfo.collectionName !== matchedOperation.targetCollection) {
            console.log('  ❌ Replacement not in target collection:', matchedOperation.targetCollection);
            skippedCount++;
            continue;
          }
          
          console.log('  Found replacement in collection:', replacementInfo.collectionName);
          
          // Import library variable if needed
          var replacementVariable = null;
          if (replacementInfo.isLibrary) {
            replacementVariable = await figma.variables.importVariableByKeyAsync(replacementInfo.key);
          } else {
            replacementVariable = replacementInfo.variable;
          }
          
          if (!replacementVariable) {
            console.log('  ❌ Could not load replacement variable');
            skippedCount++;
            continue;
          }
          
          // Apply the replacement
          try {
            // Handle text properties (require range binding)
            if (property === 'fontSize' || property === 'letterSpacing' || property === 'lineHeight' || 
                property === 'fontFamily' || property === 'fontWeight') {
              
              if (node.type === 'TEXT') {
                var textLength = node.characters.length;
                node.setRangeBoundVariable(0, textLength, property, {
                  type: 'VARIABLE_ALIAS',
                  id: replacementVariable.id
                });
                console.log('  ✅ Replaced range property:', property);
                replacementCount++;
              }
            }
            // Handle fills (must be set on paint objects)
            else if (property === 'fills') {
              if ('fills' in node && node.fills !== figma.mixed) {
                var fills = JSON.parse(JSON.stringify(node.fills));
                for (var i = 0; i < fills.length; i++) {
                  if (fills[i].boundVariables && fills[i].boundVariables.color) {
                    var fillVarId = fills[i].boundVariables.color.id;
                    if (fillVarId === currentVariable.id) {
                      fills[i] = {
                        type: fills[i].type,
                        color: fills[i].color,
                        visible: fills[i].visible,
                        opacity: fills[i].opacity,
                        blendMode: fills[i].blendMode,
                        boundVariables: {
                          color: {
                            type: 'VARIABLE_ALIAS',
                            id: replacementVariable.id
                          }
                        }
                      };
                    }
                  }
                }
                node.fills = fills;
                console.log('  ✅ Replaced fill color variable');
                replacementCount++;
              }
            }
            // Handle strokes (must be set on paint objects)
            else if (property === 'strokes') {
              if ('strokes' in node) {
                var strokes = JSON.parse(JSON.stringify(node.strokes));
                for (var i = 0; i < strokes.length; i++) {
                  if (strokes[i].boundVariables && strokes[i].boundVariables.color) {
                    var strokeVarId = strokes[i].boundVariables.color.id;
                    if (strokeVarId === currentVariable.id) {
                      strokes[i] = {
                        type: strokes[i].type,
                        color: strokes[i].color,
                        visible: strokes[i].visible,
                        opacity: strokes[i].opacity,
                        blendMode: strokes[i].blendMode,
                        boundVariables: {
                          color: {
                            type: 'VARIABLE_ALIAS',
                            id: replacementVariable.id
                          }
                        }
                      };
                    }
                  }
                }
                node.strokes = strokes;
                console.log('  ✅ Replaced stroke color variable');
                replacementCount++;
              }
            }
            // Handle all other properties (direct binding)
            else {
              node.setBoundVariable(property, {
                type: 'VARIABLE_ALIAS',
                id: replacementVariable.id
              });
              console.log('  ✅ Replaced property:', property);
              replacementCount++;
            }
            
          } catch (apiError) {
            console.error('  ❌ API error setting variable:', apiError);
            skippedCount++;
          }
          
        } catch (error) {
          console.error('Error processing binding:', error);
          skippedCount++;
        }
      }
    }
  }
  
  // Summary
  console.log('=== SUMMARY ===');
  console.log('Properties replaced:', replacementCount);
  console.log('Skipped:', skippedCount);
  
  if (replacementCount > 0) {
    figma.notify('✅ Replaced ' + replacementCount + ' variable bindings');
  } else {
    figma.notify('⚠️ No variables were replaced. Check console for details.');
  }
}

findAndReplaceVariables();
