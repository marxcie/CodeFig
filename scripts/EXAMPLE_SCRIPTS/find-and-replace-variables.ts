// Find and replace variables
// This script replaces variable bindings based on text patterns in variable names
// Uses library import capabilities for comprehensive variable replacement

// Configuration options

// Collection filtering (leave empty to search all collections)
var fromCollection = '';
var toCollection = '';

// Single pattern replacement (supports grouped patterns and wildcards)
var searchPattern = 'Typography/4xl';
var replacePattern = 'Typography/2xl';

// Replace ALL variables from one collection to another (if same names exist)
// var searchPattern = '*';
// var replacePattern = '*';

// Multiple patterns to single replacement
// var searchPattern = ['Typography/4xl', 'Typography/5xl'];
// var replacePattern = 'Typography/2xl';

// Batch replacements (multiple operations)
// var batchReplacements = [
//   {
//     searchPattern: 'Typography/4xl',
//     replacePattern: 'Typography/2xl',
//   },
//   {
//     searchPattern: 'Typography/5xl', 
//     replacePattern: 'Typography/3xl'
//   }
// ];

// Helper function to escape special regex characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to find replacement variable with collection filtering
function findReplacementVariable(variableName, targetCollection, variableCache) {
  if (!targetCollection) {
    // Search for any version of this variable
    var allVariables = Array.from(variableCache.entries());
    for (var i = 0; i < allVariables.length; i++) {
      var entry = allVariables[i];
      var varInfo = entry[1];
      
      if (varInfo.name === variableName) {
        return varInfo;
      }
    }
    return null;
  }
  
  // Look for specific collection::variable combination
  var targetCacheKey = targetCollection + '::' + variableName;
  return variableCache.get(targetCacheKey) || null;
}

// Helper function to process a single pattern match
function processSinglePattern(variableName, searchPattern, replacePattern) {
  // Handle wildcard patterns
  if (searchPattern === '*') {
    if (replacePattern === '*') {
      return variableName; // Return same name for wildcard
    } else {
      return replacePattern;
    }
  }
  
  // Handle regular pattern matching
  if (variableName.indexOf(searchPattern) !== -1) {
    var escapedPattern = escapeRegExp(searchPattern);
    var result = variableName.replace(new RegExp(escapedPattern, 'g'), replacePattern);
    return result;
  }
  
  return variableName; // No match found
}

// Helper function to handle different pattern types
function replaceByPattern(variableName, searchPattern, replacePattern) {
  if (Array.isArray(searchPattern)) {
    // Multiple patterns to single replacement
    for (var i = 0; i < searchPattern.length; i++) {
      var result = processSinglePattern(variableName, searchPattern[i], replacePattern);
      if (result !== variableName) {
        return result; // Found a match, return the result
      }
    }
    return variableName; // No match found
  } else {
    // Single pattern replacement
    return processSinglePattern(variableName, searchPattern, replacePattern);
  }
}

// Determine which approach to use
var replacementOperations = [];
if (typeof batchReplacements !== 'undefined' && Array.isArray(batchReplacements)) {
  // APPROACH 3: Use batch replacements
  replacementOperations = batchReplacements;
  
  // Log collection info for batch operations
  for (var i = 0; i < replacementOperations.length; i++) {
    var op = replacementOperations[i];
    var fromCol = op.fromCollection || fromCollection || 'any';
    var toCol = op.toCollection || toCollection || 'any';
  }
} else {
  // APPROACH 1 or 2: Use single operation
  replacementOperations = [{
    searchPattern: searchPattern,
    replacePattern: replacePattern,
    fromCollection: fromCollection,
    toCollection: toCollection
  }];
  var fromCol = fromCollection || 'any';
  var toCol = toCollection || 'any';
}

var mySelection = figma.currentPage.selection;

if (mySelection.length === 0) {
  figma.notify('Please select nodes to process');
} else {
  
  // Helper function to recursively collect all nodes (including children)
  function collectAllNodes(nodes) {
    var allNodes = [];
    
    function traverseNode(node) {
      allNodes.push(node);
      
      // Recursively traverse children if they exist
      if (node.children && node.children.length > 0) {
        for (var i = 0; i < node.children.length; i++) {
          traverseNode(node.children[i]);
        }
      }
    }
    
    // Start traversal from each selected node
    for (var i = 0; i < nodes.length; i++) {
      traverseNode(nodes[i]);
    }
    
    return allNodes;
  }

  async function replaceVariableBindings() {
    var totalReplacements = 0;
    var variableCache = new Map();
    
    // Collect all nodes recursively
    var allNodes = collectAllNodes(mySelection);
      try {
      
      // Build cache from library collections
      var libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      
      for (var libIndex = 0; libIndex < libraryCollections.length; libIndex++) {
        var libraryCollection = libraryCollections[libIndex];
        
        try {
          var libraryVariables = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libraryCollection.key);
          
          for (var libVarIndex = 0; libVarIndex < libraryVariables.length; libVarIndex++) {
            var libraryVariable = libraryVariables[libVarIndex];
            // Use unique key: collection + variable name to avoid collisions
            var cacheKey = libraryCollection.name + '::' + libraryVariable.name;
            variableCache.set(cacheKey, {
              name: libraryVariable.name,
              key: libraryVariable.key,
              collectionName: libraryCollection.name,
              isLibrary: true
            });
          }
        } catch (e) {
          // Skip inaccessible collections
        }
      }
      
      // Build cache from local collections
      var localCollections = figma.variables.getLocalVariableCollections();
      for (var localIndex = 0; localIndex < localCollections.length; localIndex++) {
        var localCollection = localCollections[localIndex];
        
        var localVariableIds = localCollection.variableIds;
        for (var localVarIndex = 0; localVarIndex < localVariableIds.length; localVarIndex++) {
          var localVariable = figma.variables.getVariableById(localVariableIds[localVarIndex]);
          if (localVariable) {
            // Use unique key: collection + variable name to avoid collisions
            var cacheKey = localCollection.name + '::' + localVariable.name;
            variableCache.set(cacheKey, {
              name: localVariable.name,
              key: localVariable.id, // Use ID for local variables, not key
              collectionName: localCollection.name,
              isLibrary: false
            });
          }
        }
      }
      
      
      // Process each node (including nested children)
      for (var nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
        var currentNode = allNodes[nodeIndex];
        
        if (currentNode.type !== 'TEXT') {
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
                
                var replacementVariable = null;
                var hasVariablesToReplace = false;
                
                // First: Check if we have variables to replace and import replacement
                for (var bindingIndex = 0; bindingIndex < bindingArray.length; bindingIndex++) {
                  var variableAlias = bindingArray[bindingIndex];
                  
                  if (variableAlias && variableAlias.id) {
                    try {
                      var currentVariable = figma.variables.getVariableById(variableAlias.id);
                      if (currentVariable && currentVariable.name) {
                        // Check all replacement operations
                        for (var opIndex = 0; opIndex < replacementOperations.length; opIndex++) {
                          var operation = replacementOperations[opIndex];
                          
                          // Check if current variable is in the source collection (if specified)
                          var currentVarCollection = currentVariable.variableCollectionId ? 
                            figma.variables.getVariableCollectionById(currentVariable.variableCollectionId) : null;
                          var currentCollectionName = currentVarCollection ? currentVarCollection.name : 'Unknown';
                          
                          var sourceCollection = operation.fromCollection || fromCollection;
                          if (sourceCollection && currentCollectionName !== sourceCollection) {
                            continue; // Skip this variable, it's not from the specified source collection
                          }
                          
                          var targetCollection = operation.toCollection || toCollection;
                          var newVariableName = replaceByPattern(currentVariable.name, operation.searchPattern, operation.replacePattern);
                          
                          // Check if we have a match (name changed OR wildcard match OR collection swap)
                          var isWildcardMatch = (operation.searchPattern === '*' || (Array.isArray(operation.searchPattern) && operation.searchPattern.indexOf('*') !== -1));
                          var isCollectionSwap = (newVariableName === currentVariable.name && targetCollection && targetCollection !== currentCollectionName);
                          var hasMatch = (newVariableName !== currentVariable.name) || isWildcardMatch || isCollectionSwap;
                          
                          if (hasMatch) {
                            hasVariablesToReplace = true;
                            
                            if (!replacementVariable) {
                              
                              // Filter replacement by target collection if specified
                              var replacementInfo = findReplacementVariable(newVariableName, targetCollection, variableCache);
                              
                              if (replacementInfo) {
                                
                                if (replacementInfo.isLibrary) {
                                  replacementVariable = await figma.variables.importVariableByKeyAsync(replacementInfo.key);
                                } else {
                                  replacementVariable = figma.variables.getVariableById(replacementInfo.key);
                                }
                                break; // Found a replacement, stop looking
                              } else {
                                var collectionMsg = targetCollection ? ' in collection "' + targetCollection + '"' : '';
                              }
                            }
                          }
                        }
                      }
                    } catch (e) {
                    }
                  }
                }
                
                // Second: If we have replacements to make, use correct parameter order
                if (hasVariablesToReplace && replacementVariable) {
                  
                  try {
                    if (propertyName === 'fontSize' || propertyName === 'letterSpacing' || propertyName === 'lineHeight') {
                      // For text properties, use correct parameter order: start, end, property, variable
                      var textLength = currentNode.characters.length;
                      var startPos = 0;
                      var endPos = Number(textLength);
                      
                      
                      // CORRECT ORDER: setRangeBoundVariable(start, end, property, variable)
                      currentNode.setRangeBoundVariable(startPos, endPos, propertyName, {
                        type: 'VARIABLE_ALIAS',
                        id: replacementVariable.id
                      });
                      
                      totalReplacements++;
                    } else {
                      // For other properties, use setBoundVariable
                      currentNode.setBoundVariable(propertyName, {
                        type: 'VARIABLE_ALIAS',
                        id: replacementVariable.id
                      });
                      totalReplacements++;
                    }
                  } catch (apiError) {
                  }
                }
              }
            }
          }
        } catch (nodeError) {
        }
      }
      
      if (totalReplacements > 0) {
        var operationSummary = replacementOperations.length > 1 ? 
          replacementOperations.length + ' operations' : 
          (Array.isArray(replacementOperations[0].searchPattern) ? 
            'multiple patterns' : 
            replacementOperations[0].searchPattern + ' → ' + replacementOperations[0].replacePattern);
        figma.notify('✅ Replaced ' + totalReplacements + ' properties in ' + allNodes.length + ' nodes (' + operationSummary + ')');
      } else {
        figma.notify('No variables were replaced in ' + allNodes.length + ' processed nodes. Check console for details.');
      }
      
    } catch (error) {
      figma.notify('❌ Error: ' + error.message);
    }
  }
  
replaceVariableBindings();
}