// Find broken variables
// This script demonstrates how to use @InfoPanel to display diagnostic results
// @import { displayResults, createResult, createSelectableResult, createHtmlResult } from "@InfoPanel"

// ===== ADVANCED BROKEN VARIABLE DETECTION =====
// Inspired by Swap Variables plugin's sophisticated detection methods

// Enhanced detection categories
var ISSUE_TYPES = {
  MISSING_VARIABLE: 'Variable not found',
  MISSING_COLLECTION: 'Collection not accessible', 
  BINDING_CLEARED: 'Binding cleared by Figma',
  LIBRARY_DISCONNECTED: 'Library collection disconnected',
  VALUE_MISMATCH: 'Variable value mismatch',
  RENAMED_SUSPECTED: 'Variable may have been renamed',
  ACCESS_ERROR: 'Variable access error'
};

// Build comprehensive variable cache for cross-referencing
var buildVariableCache = function() {
  var cache = {
    local: new Map(),
    remote: new Map(),
    collections: new Map()
  };
  
  console.log('Building variable cache...');
  
  // Cache local variables and collections
  var localCollections = figma.variables.getLocalVariableCollections();
  for (var i = 0; i < localCollections.length; i++) {
    var collection = localCollections[i];
    cache.collections.set(collection.id, {
      name: collection.name,
      remote: false,
      accessible: true
    });
    
    var variables = figma.variables.getLocalVariables();
    for (var j = 0; j < variables.length; j++) {
      var variable = variables[j];
      if (variable.variableCollectionId === collection.id) {
        cache.local.set(variable.id, {
          name: variable.name,
          collection: collection.name,
          collectionId: collection.id,
          remote: false
        });
      }
    }
  }
  
  // Cache remote/library variables (async operation)
  try {
    var libraryCollections = figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    // Note: This is async, so we'll handle remote variables during analysis
    console.log('Remote collections will be checked during analysis');
  } catch (e) {
    console.log('Could not access library collections:', e.message);
  }
  
  console.log('Local cache built:', cache.local.size, 'variables,', cache.collections.size, 'collections');
  return cache;
};

// Enhanced broken binding detection with sophisticated analysis
var findBrokenBindingsAdvanced = function() {
  var selection = figma.currentPage.selection;
  var brokenBindings = [];
  var cache = buildVariableCache();
  
  // If nothing selected, search entire page
  var nodesToCheck = selection.length > 0 ? selection : [figma.currentPage];
  var allNodes = collectAllNodes(nodesToCheck);
  
  console.log('=== ADVANCED BROKEN VARIABLE DETECTION ===');
  console.log('Nodes to check:', nodesToCheck.length);
  console.log('Total nodes collected:', allNodes.length);
  console.log('Variable cache size:', cache.local.size + cache.remote.size);
  
  var nodesWithBindings = 0;
  var totalBindingsFound = 0;
  
  for (var i = 0; i < allNodes.length; i++) {
    var node = allNodes[i];
    
    if (node.boundVariables) {
      var properties = Object.keys(node.boundVariables);
      
      if (properties.length > 0) {
        nodesWithBindings++;
        
        // Check if this node has empty boundVariables (cleared by Figma)
        if (properties.length === 0) {
          // Auto-cleanup empty boundVariables
          try {
            delete node.boundVariables;
            console.log('Cleaned up empty boundVariables from:', node.name);
          } catch (e) {
            console.log('Could not clean up boundVariables from:', node.name);
          }
          continue;
        }
        
        for (var j = 0; j < properties.length; j++) {
          var prop = properties[j];
          var binding = node.boundVariables[prop];
          totalBindingsFound++;
          
          // Handle both direct binding and array binding formats
          var actualBinding = binding;
          var isArray = Array.isArray(binding);
          
          if (isArray && binding.length > 0 && binding[0].id) {
            actualBinding = binding[0];
          }
          
          if (actualBinding && actualBinding.id) {
            // Sophisticated variable analysis
            var analysisResult = analyzeVariableBinding(actualBinding.id, cache, node, prop);
            
            if (analysisResult.isBroken) {
              brokenBindings.push({
                nodeId: node.id,
                nodeName: node.name,
                nodeType: node.type,
                property: prop,
                variableId: actualBinding.id,
                variableName: analysisResult.variableName,
                issue: analysisResult.issue,
                issueType: analysisResult.issueType,
                suggestions: analysisResult.suggestions || [],
                path: getNodePath(node),
                isArray: isArray
              });
            }
          } else if (binding && typeof binding === 'object' && !binding.id) {
            // Binding object exists but has no ID (collection deleted)
            brokenBindings.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              property: prop,
              variableId: 'missing-id',
              variableName: 'Binding cleared',
              issue: ISSUE_TYPES.BINDING_CLEARED,
              issueType: 'BINDING_CLEARED',
              suggestions: ['Check if collection was deleted', 'Reapply variable binding'],
              path: getNodePath(node),
              isArray: isArray
            });
          }
        }
      }
    }
  }
  
  console.log('Nodes with bindings:', nodesWithBindings);
  console.log('Total bindings found:', totalBindingsFound);
  console.log('Broken bindings detected:', brokenBindings.length);
  
  return brokenBindings;
};

// Sophisticated variable binding analysis
var analyzeVariableBinding = function(variableId, cache, node, property) {
  var result = {
    isBroken: false,
    variableName: 'Unknown Variable',
    issue: '',
    issueType: '',
    suggestions: []
  };
  
  try {
    var variable = figma.variables.getVariableById(variableId);
    
    if (!variable) {
      // Variable not found - check cache for potential matches
      result.isBroken = true;
      result.issue = ISSUE_TYPES.MISSING_VARIABLE;
      result.issueType = 'MISSING_VARIABLE';
      result.suggestions = ['Variable may have been deleted', 'Check if collection still exists'];
      return result;
    }
    
    result.variableName = variable.name || 'Unnamed Variable';
    
    // Check collection accessibility
    try {
      var collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
      
      if (!collection) {
        result.isBroken = true;
        result.issue = ISSUE_TYPES.MISSING_COLLECTION;
        result.issueType = 'MISSING_COLLECTION';
        result.suggestions = ['Collection was deleted or moved', 'Check library connection'];
        return result;
      }
      
      // For remote variables, additional checks
      if (variable.remote) {
        // Check if library is properly connected
        if (!collection.remote) {
          result.isBroken = true;
          result.issue = ISSUE_TYPES.LIBRARY_DISCONNECTED;
          result.issueType = 'LIBRARY_DISCONNECTED';
          result.suggestions = ['Library connection lost', 'Reconnect library', 'Check library permissions'];
          return result;
        }
      }
      
      // Variable and collection exist - check for value consistency
      // This is where we could add more sophisticated checks like the Swap Variables plugin
      
    } catch (collectionError) {
      result.isBroken = true;
      result.issue = ISSUE_TYPES.ACCESS_ERROR + ': ' + collectionError.message;
      result.issueType = 'ACCESS_ERROR';
      result.suggestions = ['Collection access error', 'Check permissions', 'Reload file'];
      return result;
    }
    
  } catch (variableError) {
    result.isBroken = true;
    result.issue = ISSUE_TYPES.ACCESS_ERROR + ': ' + variableError.message;
    result.issueType = 'ACCESS_ERROR';
    result.suggestions = ['Variable access error', 'Check if variable exists'];
    return result;
  }
  
  // If we get here, variable appears healthy
  return result;
};

// ===== SIMPLE DETECTION (for debugging) =====

var findBrokenBindingsSimple = function() {
  var selection = figma.currentPage.selection;
  var brokenBindings = [];
  
  // If nothing selected, search entire page
  var nodesToCheck = selection.length > 0 ? selection : [figma.currentPage];
  var allNodes = collectAllNodes(nodesToCheck);
  
  console.log('=== SIMPLE BROKEN VARIABLE DETECTION ===');
  console.log('Nodes to check:', nodesToCheck.length);
  console.log('Total nodes collected:', allNodes.length);
  
  for (var i = 0; i < allNodes.length; i++) {
    var node = allNodes[i];
    
    if (node.boundVariables) {
      var properties = Object.keys(node.boundVariables);
      
      if (properties.length > 0 && i < 3) { // Debug first 3 nodes
        console.log('Node ' + i + ':', node.name, 'Properties:', properties);
      }
      
      for (var j = 0; j < properties.length; j++) {
        var prop = properties[j];
        var binding = node.boundVariables[prop];
        
        if (i < 3 && j < 2) { // Debug first few bindings
          console.log('  Binding ' + j + ' - Property:', prop, 'Binding:', typeof binding, binding);
        }
        
        // Handle both direct binding and array binding formats
        var actualBinding = binding;
        var isArray = Array.isArray(binding);
        
        if (isArray && binding.length > 0 && binding[0].id) {
          actualBinding = binding[0];
        }
        
        // ORIGINAL WORKING DETECTION LOGIC - DON'T CHANGE THIS!
        if (actualBinding && actualBinding.id) {
          // Binding has an ID, try to get the variable
          try {
            var variable = figma.variables.getVariableById(actualBinding.id);
            
            if (i < 3 && j < 2) {
              console.log('    Variable lookup result:', variable ? 'found' : 'null', variable ? variable.name : 'n/a');
            }
            
            // If variable is null, it's broken
            if (!variable) {
              brokenBindings.push({
                nodeId: node.id,
                nodeName: node.name,
                nodeType: node.type,
                property: prop,
                variableId: actualBinding.id,
                variableName: 'Variable not found',
                issue: 'Variable not found',
                path: getNodePath(node),
                isArray: isArray
              });
              
              if (i < 3 && j < 2) {
                console.log('    -> BROKEN: Variable not found');
              }
            } else {
              // Variable exists, but check if its collection is accessible
              // This is the key insight from Swap Variables plugin
              try {
                var collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
                
                if (i < 3 && j < 2) {
                  console.log('    Collection check:', collection ? collection.name : 'null', 'Remote:', variable.remote);
                }
                
                if (!collection) {
                  // Collection not found - this is the real broken state!
                  brokenBindings.push({
                    nodeId: node.id,
                    nodeName: node.name,
                    nodeType: node.type,
                    property: prop,
                    variableId: actualBinding.id,
                    variableName: variable.name || 'Unknown Variable',
                    issue: 'Collection not accessible (disconnected)',
                    path: getNodePath(node),
                    isArray: isArray
                  });
                  
                  if (i < 3 && j < 2) {
                    console.log('    -> BROKEN: Collection not accessible');
                  }
                } else {
                  // Collection exists, but let's check if variable values are accessible
                  // This is the deeper check that Swap Variables plugin likely uses
                  try {
                    var modes = collection.modes;
                    var hasValidValue = false;
                    
                    if (i < 3 && j < 2) {
                      console.log('    Checking variable values in', modes.length, 'modes...');
                    }
                    
                    for (var modeIndex = 0; modeIndex < modes.length; modeIndex++) {
                      var mode = modes[modeIndex];
                      try {
                        var value = variable.valuesByMode[mode.modeId];
                        if (value !== undefined && value !== null) {
                          hasValidValue = true;
                          if (i < 3 && j < 2) {
                            console.log('      Mode', mode.name, '- value found:', typeof value);
                          }
                          break;
                        }
                      } catch (valueError) {
                        if (i < 3 && j < 2) {
                          console.log('      Mode', mode.name, '- value error:', valueError.message);
                        }
                      }
                    }
                    
                    if (!hasValidValue) {
                      // Variable exists, collection exists, but no valid values - this might be the broken state!
                      brokenBindings.push({
                        nodeId: node.id,
                        nodeName: node.name,
                        nodeType: node.type,
                        property: prop,
                        variableId: actualBinding.id,
                        variableName: variable.name || 'Unknown Variable',
                        issue: 'Variable has no accessible values',
                        path: getNodePath(node),
                        isArray: isArray
                      });
                      
                      if (i < 3 && j < 2) {
                        console.log('    -> BROKEN: No accessible values');
                      }
                    } else {
                      // API says everything is OK, but check force detection settings
                      var shouldForceDetect = false;
                      var forceReason = '';
                      
                      if (FORCE_DETECT_REMOTE_AS_BROKEN && variable.remote) {
                        shouldForceDetect = true;
                        forceReason = 'Remote variable (forced detection due to UI mismatch)';
                      }
                      
                      if (FORCE_DETECT_COLLECTIONS.length > 0) {
                        for (var forceIndex = 0; forceIndex < FORCE_DETECT_COLLECTIONS.length; forceIndex++) {
                          if (collection.name === FORCE_DETECT_COLLECTIONS[forceIndex]) {
                            shouldForceDetect = true;
                            forceReason = 'Collection in force-detect list: ' + collection.name;
                            break;
                          }
                        }
                      }
                      
                      if (FORCE_DETECT_VARIABLES.length > 0) {
                        for (var varIndex = 0; varIndex < FORCE_DETECT_VARIABLES.length; varIndex++) {
                          if (variable.name === FORCE_DETECT_VARIABLES[varIndex]) {
                            shouldForceDetect = true;
                            forceReason = 'Variable in force-detect list: ' + variable.name;
                            break;
                          }
                        }
                      }
                      
                      if (shouldForceDetect) {
                        brokenBindings.push({
                          nodeId: node.id,
                          nodeName: node.name,
                          nodeType: node.type,
                          property: prop,
                          variableId: actualBinding.id,
                          variableName: variable.name || 'Unknown Variable',
                          issue: forceReason,
                          path: getNodePath(node),
                          isArray: isArray
                        });
                        
                        if (i < 3 && j < 2) {
                          console.log('    -> FORCED BROKEN:', forceReason);
                        }
                      } else {
                        if (i < 3 && j < 2) {
                          console.log('    -> OK: Variable has valid values');
                        }
                      }
                    }
                    
                  } catch (valueCheckError) {
                    // Error checking values - might be broken
                    brokenBindings.push({
                      nodeId: node.id,
                      nodeName: node.name,
                      nodeType: node.type,
                      property: prop,
                      variableId: actualBinding.id,
                      variableName: variable.name || 'Unknown Variable',
                      issue: 'Variable value check failed: ' + valueCheckError.message,
                      path: getNodePath(node),
                      isArray: isArray
                    });
                    
                    if (i < 3 && j < 2) {
                      console.log('    -> BROKEN: Value check error:', valueCheckError.message);
                    }
                  }
                }
                
              } catch (collectionError) {
                // Error accessing collection - definitely broken
                brokenBindings.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  nodeType: node.type,
                  property: prop,
                  variableId: actualBinding.id,
                  variableName: variable.name || 'Unknown Variable',
                  issue: 'Collection access error: ' + collectionError.message,
                  path: getNodePath(node),
                  isArray: isArray
                });
                
                if (i < 3 && j < 2) {
                  console.log('    -> BROKEN: Collection error:', collectionError.message);
                }
              }
            }
            
          } catch (e) {
            // Error accessing variable - definitely broken
            brokenBindings.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              property: prop,
              variableId: actualBinding.id,
              variableName: 'Access Error',
              issue: 'Variable access error: ' + e.message,
              path: getNodePath(node),
              isArray: isArray
            });
            
            if (i < 3 && j < 2) {
              console.log('    -> BROKEN: Access error:', e.message);
            }
          }
          
        } else if (binding && typeof binding === 'object' && !binding.id) {
          // ORIGINAL WORKING DETECTION: Binding object exists but has no ID
          brokenBindings.push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            property: prop,
            variableId: 'missing-id',
            variableName: 'Binding cleared',
            issue: 'Binding cleared by Figma',
            path: getNodePath(node),
            isArray: isArray
          });
          
          if (i < 3 && j < 2) {
            console.log('    -> BROKEN: Binding has no ID (cleared by Figma)');
          }
        }
      }
    }
  }
  
  console.log('Simple detection found:', brokenBindings.length, 'broken bindings');
  return brokenBindings;
};

// ===== REMOTE CONNECTION DETECTION =====
// Based on successful testing with test-remote-connections.ts
// Key insight: collection.libraryId missing indicates broken library connection

var detectBrokenRemoteConnections = function(brokenBindings) {
  console.log('🔗 Testing remote variable connections...');
  
  var remoteConnectionIssues = 0;
  var testedRemoteVariables = new Set();
  
  for (var i = 0; i < brokenBindings.length; i++) {
    var binding = brokenBindings[i];
    
    // Skip if we've already tested this variable
    if (testedRemoteVariables.has(binding.variableId)) continue;
    testedRemoteVariables.add(binding.variableId);
    
    try {
      var variable = figma.variables.getVariableById(binding.variableId);
      
      if (variable && variable.remote) {
        console.log('  🔍 Testing remote variable:', variable.name);
        
        // Get the collection
        var collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
        
        if (collection) {
          // Debug: Log ALL collection properties to understand the difference
          console.log('    📊 Collection details:');
          console.log('      - Name:', collection.name);
          console.log('      - ID:', collection.id);
          console.log('      - Remote:', collection.remote);
          console.log('      - Modes:', collection.modes.length);
          console.log('      - Library ID:', collection.libraryId || 'MISSING');
          console.log('      - Key:', collection.key || 'MISSING');
          
          // Try to access other properties that might indicate connection status
          try {
            console.log('      - Default mode:', collection.defaultModeId);
            console.log('      - Hidden from publishing:', collection.hiddenFromPublishing);
          } catch (e) {
            console.log('      - Additional properties error:', e.message);
          }
          
          // Check if collection has library reference
          if (!collection.libraryId) {
            console.log('    ⚠️ Collection missing library ID - might be broken connection');
            
            // Additional test: Try to access the collection's key
            if (!collection.key) {
              console.log('    ❌ Collection also missing key - definitely broken');
              binding.issue = 'Remote variable missing library connection (no key)';
              binding.isRemoteConnectionBroken = true;
              remoteConnectionIssues++;
            } else {
              console.log('    🤔 Collection has key but no library ID - investigating...');
              // This might be a working connection that just doesn't expose libraryId
              binding.issue = 'Remote variable - unclear connection status';
              binding.isRemoteConnectionBroken = false; // Don't flag as broken yet
            }
          } else {
            console.log('    ✅ Collection has library ID:', collection.libraryId);
            binding.isRemoteConnectionBroken = false;
          }
        } else {
          console.log('    ❌ Collection not found');
          binding.issue = 'Remote variable collection not accessible';
          binding.isRemoteConnectionBroken = true;
          remoteConnectionIssues++;
        }
      }
    } catch (error) {
      console.log('    ❌ Error testing remote connection:', error.message);
      binding.issue = 'Error testing remote connection: ' + error.message;
      binding.isRemoteConnectionBroken = true;
      remoteConnectionIssues++;
    }
  }
  
  console.log('🔗 Remote connection test complete:', remoteConnectionIssues, 'issues found');
  return brokenBindings;
};

var findAllRemoteVariables = function() {
  console.log('🔍 Scanning for all remote variables...');
  
  var selection = figma.currentPage.selection;
  var nodesToCheck = selection.length > 0 ? selection : [figma.currentPage];
  var allNodes = collectAllNodes(nodesToCheck);
  
  var remoteVariables = [];
  var foundVariableIds = new Set();
  
  for (var i = 0; i < allNodes.length; i++) {
    var node = allNodes[i];
    
    if (!node.boundVariables) continue;
    
    var properties = Object.keys(node.boundVariables);
    
    for (var j = 0; j < properties.length; j++) {
      var property = properties[j];
      var binding = node.boundVariables[property];
      
      // Handle array bindings
      var bindings = Array.isArray(binding) ? binding : [binding];
      
      for (var k = 0; k < bindings.length; k++) {
        var actualBinding = bindings[k];
        
        if (actualBinding && actualBinding.id) {
          var variableId = actualBinding.id;
          
          // Skip if we've already found this variable
          if (foundVariableIds.has(variableId)) continue;
          foundVariableIds.add(variableId);
          
          try {
            var variable = figma.variables.getVariableById(variableId);
            
            if (variable && variable.remote) {
              console.log('  📡 Found remote variable:', variable.name);
              
              remoteVariables.push({
                nodeId: node.id,
                nodeName: node.name,
                nodeType: node.type,
                property: property,
                variableId: variableId,
                variableName: variable.name,
                issue: 'Remote variable (needs connection test)',
                path: getNodePath(node),
                isArray: Array.isArray(binding)
              });
            }
          } catch (error) {
            console.log('  ❌ Error checking variable:', variableId, error.message);
          }
        }
      }
    }
  }
  
  console.log('🔍 Remote variable scan complete:', remoteVariables.length, 'found');
  return remoteVariables;
};

// ===== LEGACY DETECTION (keeping for comparison) =====

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
  
  console.log('=== DEBUGGING BROKEN BINDINGS ===');
  console.log('Nodes to check:', nodesToCheck.length);
  console.log('Total nodes collected:', allNodes.length);
  
  for (var i = 0; i < allNodes.length; i++) {
    var node = allNodes[i];
    
    if (node.boundVariables) {
      var properties = Object.keys(node.boundVariables);
      
      if (properties.length > 0 && i < 5) { // Only log first 5 nodes with bindings
        console.log('Node with bindings:', node.name, 'Properties:', properties);
      }
      
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
              // Variable object exists, but check if it's actually broken
              // For remote variables, check if the collection is accessible
              if (variable.remote) {
                try {
                  var collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
                  if (!collection) {
                    // Remote variable's collection is not accessible - broken library connection
                    brokenBindings.push({
                      nodeId: node.id,
                      nodeName: node.name,
                      nodeType: node.type,
                      property: prop,
                      variableId: actualBinding.id,
                      variableName: variable.name || 'Unknown Variable',
                      issue: 'Library variable collection not accessible',
                      path: getNodePath(node)
                    });
                  }
                } catch (collectionError) {
                  // Error accessing collection - likely broken library connection
                  brokenBindings.push({
                    nodeId: node.id,
                    nodeName: node.name,
                    nodeType: node.type,
                    property: prop,
                    variableId: actualBinding.id,
                    variableName: variable.name || 'Unknown Variable',
                    issue: 'Library variable collection error: ' + collectionError.message,
                    path: getNodePath(node)
                  });
                }
              }
              // For local variables, if we got here, they should be healthy
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

// ===== CONFIGURATION =====
// Since the API doesn't match UI state, allow manual configuration
var FORCE_DETECT_REMOTE_AS_BROKEN = false; // Set to true if ALL remote variables appear broken in UI
var FORCE_DETECT_COLLECTIONS = ['colors / grey']; // Add collection names that appear broken: ['Responsive V2', 'colors / grey']
var FORCE_DETECT_VARIABLES = []; // Add specific variable names that appear broken: ['grey/900', 'Typography/4xl/font-size']

// ===== MAIN EXECUTION =====

// Use simple detection first to debug what's happening
var brokenBindings = findBrokenBindingsSimple();

// Also scan for remote variables that might have broken library connections
var allRemoteVariables = findAllRemoteVariables();
console.log('Found', allRemoteVariables.length, 'remote variables to test');

// Test remote connections for all found bindings AND remote variables
var allVariablesToTest = brokenBindings.concat(allRemoteVariables);
brokenBindings = detectBrokenRemoteConnections(allVariablesToTest);

console.log('=== DETECTION RESULTS ===');
console.log('- Broken bindings:', brokenBindings.length);

// Debug: Show some details about what we found
if (brokenBindings.length > 0) {
  console.log('First few broken bindings:');
  for (var debugIndex = 0; debugIndex < Math.min(3, brokenBindings.length); debugIndex++) {
    var debugBinding = brokenBindings[debugIndex];
    console.log('  ' + (debugIndex + 1) + '. ' + debugBinding.nodeName + ' - ' + debugBinding.property + ' - ' + debugBinding.issue);
  }
} else {
  console.log('No broken bindings detected - checking if this is correct...');
}

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
