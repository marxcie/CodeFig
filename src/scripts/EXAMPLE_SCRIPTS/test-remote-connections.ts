// 04 - Test Remote Variable Connections (DISABLED - TOO COMPLEX)
// This script is temporarily disabled due to syntax errors in Figma's runtime
// Use scripts 00-02 instead for testing remote variable connections
console.log('❌ Script 04 is disabled due to complexity. Use scripts 00-02 instead.');
figma.notify('Script 04 disabled. Use simpler test scripts 00-02 instead.');
return;

// ===== CONFIGURATION =====
var TEST_LIBRARY_ACCESS = true; // Test actual library accessibility
var SHOW_CONNECTION_DETAILS = true; // Show detailed connection information
var INCLUDE_HEALTHY_REMOTES = true; // Include working remote variables in results (for debugging)

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

// ===== REMOTE CONNECTION TESTING =====

var testRemoteConnections = function() {
  var selection = figma.currentPage.selection;
  var remoteConnections = [];
  
  // If nothing selected, search entire page
  var nodesToCheck = selection.length > 0 ? selection : [figma.currentPage];
  var allNodes = collectAllNodes(nodesToCheck);
  
  console.log('=== TESTING REMOTE VARIABLE CONNECTIONS ===');
  console.log('Nodes to analyze:', allNodes.length);
  
  var remoteVariablesFound = 0;
  var brokenConnections = 0;
  var testedVariables = new Set(); // Avoid testing same variable multiple times
  
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
          
          // Skip if we've already tested this variable
          if (testedVariables.has(variableId)) continue;
          testedVariables.add(variableId);
          
          var connectionTest = testSingleRemoteConnection(variableId, node, property);
          
          if (connectionTest && connectionTest.isRemote) {
            remoteVariablesFound++;
            
            if (!connectionTest.isHealthy) {
              brokenConnections++;
            }
            
            // Include in results based on configuration
            if (!connectionTest.isHealthy || INCLUDE_HEALTHY_REMOTES) {
              remoteConnections.push(connectionTest);
            }
          }
        }
      }
    }
  }
  
  console.log('Remote connection analysis complete:');
  console.log('- Remote variables found:', remoteVariablesFound);
  console.log('- Broken connections:', brokenConnections);
  console.log('- Results to display:', remoteConnections.length);
  
  return remoteConnections;
};

var testSingleRemoteConnection = function(variableId, node, property) {
  var result = {
    variableId: variableId,
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    property: property,
    path: getNodePath(node),
    isRemote: false,
    isHealthy: true,
    variable: null,
    collection: null,
    libraryInfo: null,
    connectionTests: {},
    issues: []
  };
  
  console.log('🔍 Testing variable:', variableId, 'on node:', node.name, 'property:', property);
  
  try {
    // Step 1: Get the variable
    var variable = figma.variables.getVariableById(variableId);
    result.variable = variable;
    
    console.log('  📋 Variable found:', variable ? 'YES' : 'NO');
    if (variable) {
      console.log('  📋 Variable name:', variable.name);
      console.log('  📋 Variable remote:', variable.remote);
      console.log('  📋 Variable key:', variable.key ? variable.key.substring(0, 20) + '...' : 'NONE');
    }
    
    if (!variable) {
      result.issues.push('Variable not found');
      result.isHealthy = false;
      console.log('  ❌ Variable not found - marking as unhealthy');
      return result;
    }
    
    // Step 2: Check if it's remote
    if (!variable.remote) {
      result.isRemote = false;
      console.log('  ℹ️ Variable is LOCAL - skipping remote tests');
      return result; // Not remote, skip further testing
    }
    
    result.isRemote = true;
    console.log('  🔗 Variable is REMOTE - running connection tests...');
    
    // Step 3: Test collection access
    try {
      var collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
      result.collection = collection;
      result.connectionTests.collectionAccess = collection ? 'success' : 'failed';
      
      console.log('  📁 Collection found:', collection ? 'YES' : 'NO');
      if (collection) {
        console.log('  📁 Collection name:', collection.name);
        console.log('  📁 Collection remote:', collection.remote);
        console.log('  📁 Collection modes:', collection.modes.length);
        
        // DETAILED COLLECTION ANALYSIS - This is the key!
        console.log('  📊 DETAILED COLLECTION PROPERTIES:');
        console.log('    - ID:', collection.id);
        console.log('    - Library ID:', collection.libraryId || 'MISSING');
        console.log('    - Key:', collection.key || 'MISSING');
        console.log('    - Default mode ID:', collection.defaultModeId || 'MISSING');
        console.log('    - Hidden from publishing:', collection.hiddenFromPublishing);
        
        // Try to access additional properties that might indicate connection status
        try {
          console.log('    - Variable collection type:', typeof collection);
          console.log('    - Has modes array:', Array.isArray(collection.modes));
          if (collection.modes && collection.modes.length > 0) {
            console.log('    - First mode name:', collection.modes[0].name);
            console.log('    - First mode ID:', collection.modes[0].modeId);
          }
        } catch (propError) {
          console.log('    - Property access error:', propError.message);
        }
        
        // Test if we can access the collection's library information
        try {
          console.log('    - Collection toString:', collection.toString());
        } catch (toStringError) {
          console.log('    - toString error:', toStringError.message);
        }
      }
      
      if (!collection) {
        result.issues.push('Collection not accessible');
        result.isHealthy = false;
        console.log('  ❌ Collection not accessible - marking as unhealthy');
      }
    } catch (collectionError) {
      result.connectionTests.collectionAccess = 'error';
      result.issues.push('Collection access error: ' + collectionError.message);
      result.isHealthy = false;
      console.log('  ❌ Collection access error:', collectionError.message);
    }
    
    // Step 4: Test library source connection (CRITICAL TEST!)
    try {
      console.log('  📚 Testing library source connection...');
      
      // HYPOTHESIS: Both collections might be cached locally with "hidden from publishing: true"
      // The real test is whether they appear in available library collections
      
      if (variable.key && result.collection) {
        console.log('  📚 Testing if collection is truly connected to library...');
        
        // Key insight: Check if "hidden from publishing" indicates disconnection
        if (result.collection.hiddenFromPublishing === true) {
          console.log('  ⚠️ Collection is hidden from publishing - might indicate disconnection');
          result.connectionTests.hiddenFromPublishing = 'true-suspicious';
          
          // This might be the key indicator of a broken connection
          result.issues.push('Collection hidden from publishing (likely disconnected)');
          result.isHealthy = false;
          result.connectionTests.librarySourceConnection = 'likely-broken-hidden';
          
        } else {
          console.log('  ✅ Collection is NOT hidden from publishing - likely connected');
          result.connectionTests.hiddenFromPublishing = 'false-healthy';
          result.connectionTests.librarySourceConnection = 'likely-healthy-visible';
        }
        
        // Additional test: Try to import the variable by key
        console.log('  📚 Testing import by key for library connection...');
        try {
          var importPromise = figma.variables.importVariableByKeyAsync(variable.key);
          result.connectionTests.importByKeyTest = 'initiated';
          console.log('  📚 Import by key initiated successfully');
          
          // Import success doesn't guarantee live connection (might be cached)
          result.connectionTests.importResult = 'initiated-but-might-be-cached';
          
        } catch (importSyncError) {
          // If the sync part of import fails, it's definitely a broken connection
          result.connectionTests.importByKeyTest = 'sync-error';
          result.connectionTests.librarySourceConnection = 'definitely-broken';
          result.issues.push('Library import failed: ' + importSyncError.message);
          result.isHealthy = false;
          console.log('  ❌ Import by key sync error:', importSyncError.message);
        }
          
          // Test 4: Check if the collection has a valid library reference
          if (result.collection && result.collection.libraryId) {
            console.log('  📚 Collection has library ID:', result.collection.libraryId);
            result.connectionTests.collectionLibraryId = 'present';
            result.connectionTests.libraryConnectionStatus = 'healthy';
          } else {
            console.log('  📚 Collection missing library ID');
            result.connectionTests.collectionLibraryId = 'missing';
            
            // Check if collection has a key instead
            if (result.collection && result.collection.key) {
              console.log('  📚 Collection has key but no library ID - might still be connected');
              result.connectionTests.libraryConnectionStatus = 'unclear-has-key';
              // Don't mark as unhealthy yet - this might be normal for some remote collections
            } else {
              console.log('  📚 Collection missing both library ID and key - likely broken');
              result.connectionTests.libraryConnectionStatus = 'broken-no-identifiers';
              result.issues.push('Collection missing library reference and key');
              result.isHealthy = false;
            }
          }
          
        } catch (libraryTestError) {
          result.connectionTests.librarySourceConnection = 'error';
          result.issues.push('Library source test error: ' + libraryTestError.message);
          result.isHealthy = false;
          console.log('  ❌ Library source test error:', libraryTestError.message);
        }
      } else {
        result.connectionTests.librarySourceConnection = 'no-key';
        result.issues.push('No variable key for library testing');
        result.isHealthy = false;
        console.log('  ❌ No variable key for library testing');
      }
      
    } catch (libraryError) {
      result.connectionTests.libraryListAccess = 'error';
      result.issues.push('Library access error: ' + libraryError.message);
      result.isHealthy = false;
      console.log('  ❌ Library access error:', libraryError.message);
    }
    
    // Step 5: Test variable key accessibility
    try {
      if (variable.key) {
        result.connectionTests.variableKey = 'present';
        console.log('  🔑 Variable key present:', variable.key.substring(0, 20) + '...');
        
        // Try to import by key (this should fail for broken connections)
        try {
          // Note: This is async, but attempting it might give us info
          var importTest = figma.variables.importVariableByKeyAsync(variable.key);
          result.connectionTests.importByKey = 'initiated';
          console.log('  🔑 Import by key: initiated (async)');
        } catch (importError) {
          result.connectionTests.importByKey = 'error';
          result.issues.push('Import by key failed: ' + importError.message);
          result.isHealthy = false;
          console.log('  ❌ Import by key failed:', importError.message);
        }
      } else {
        result.connectionTests.variableKey = 'missing';
        result.issues.push('Variable key missing');
        result.isHealthy = false;
        console.log('  ❌ Variable key missing - marking as unhealthy');
      }
    } catch (keyError) {
      result.connectionTests.variableKey = 'error';
      result.issues.push('Key access error: ' + keyError.message);
      result.isHealthy = false;
      console.log('  ❌ Key access error:', keyError.message);
    }
    
    // Step 6: Test value accessibility in different modes
    if (result.collection) {
      var modesWithValues = 0;
      var totalModes = result.collection.modes.length;
      var actualValues = [];
      
      console.log('  🎨 Testing value access across', totalModes, 'modes...');
      
      for (var i = 0; i < result.collection.modes.length; i++) {
        var mode = result.collection.modes[i];
        try {
          var value = variable.valuesByMode[mode.modeId];
          console.log('    Mode', mode.name + ':', value !== undefined && value !== null ? 'HAS VALUE' : 'NO VALUE');
          
          if (value !== undefined && value !== null) {
            modesWithValues++;
            actualValues.push({
              mode: mode.name,
              value: typeof value === 'object' ? JSON.stringify(value).substring(0, 50) + '...' : String(value)
            });
          }
        } catch (valueError) {
          console.log('    Mode', mode.name + ': ERROR -', valueError.message);
          // Value access error might indicate connection issues
        }
      }
      
      result.connectionTests.valueAccess = modesWithValues + '/' + totalModes + ' modes';
      result.connectionTests.actualValues = actualValues;
      
      console.log('  🎨 Value access result:', result.connectionTests.valueAccess);
      
      if (modesWithValues === 0) {
        result.issues.push('No values accessible in any mode');
        result.isHealthy = false;
        console.log('  ❌ No values accessible - marking as unhealthy');
      } else if (modesWithValues < totalModes) {
        result.issues.push('Values missing in ' + (totalModes - modesWithValues) + ' modes');
        console.log('  ⚠️ Some values missing, but not marking as unhealthy');
        // This might be OK, so don't mark as unhealthy
      }
    }
    
    // Step 7: Test if variable can be applied to a new node (CRITICAL TEST!)
    try {
      console.log('  🧪 Testing variable application to new node...');
      
      // Create a temporary rectangle to test variable application
      var testRect = figma.createRectangle();
      testRect.name = 'TEMP_TEST_NODE_DELETE_ME';
      
      // Try to apply the variable to the test node
      try {
        if (property === 'fills' || property === 'fill') {
          // For fills, we need to set it on the paint object, not directly
          var currentFills = testRect.fills;
          if (currentFills && currentFills.length > 0) {
            // Clone the first fill and set the variable on it
            var newFill = JSON.parse(JSON.stringify(currentFills[0]));
            newFill.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: variable.id } };
            testRect.fills = [newFill];
            result.connectionTests.variableApplication = 'success';
            console.log('  ✅ Variable successfully applied to test node (fills)');
          } else {
            // Create a new solid fill with the variable
            testRect.fills = [{
              type: 'SOLID',
              color: { r: 1, g: 0, b: 0 }, // Default red
              boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variable.id } }
            }];
            result.connectionTests.variableApplication = 'success';
            console.log('  ✅ Variable successfully applied to test node (new fill)');
          }
        } else if (property === 'strokes' || property === 'stroke') {
          // For strokes, similar approach
          var currentStrokes = testRect.strokes;
          if (currentStrokes && currentStrokes.length > 0) {
            var newStroke = JSON.parse(JSON.stringify(currentStrokes[0]));
            newStroke.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: variable.id } };
            testRect.strokes = [newStroke];
            result.connectionTests.variableApplication = 'success';
            console.log('  ✅ Variable successfully applied to test node (strokes)');
          } else {
            // Create a new solid stroke with the variable
            testRect.strokes = [{
              type: 'SOLID',
              color: { r: 0, g: 0, b: 1 }, // Default blue
              boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variable.id } }
            }];
            testRect.strokeWeight = 2;
            result.connectionTests.variableApplication = 'success';
            console.log('  ✅ Variable successfully applied to test node (new stroke)');
          }
        } else {
          // Try to apply to other properties that should work
          try {
            testRect.setBoundVariable('width', variable);
            result.connectionTests.variableApplication = 'success';
            console.log('  ✅ Variable successfully applied to test node (width)');
          } catch (widthError) {
            try {
              testRect.setBoundVariable('height', variable);
              result.connectionTests.variableApplication = 'success';
              console.log('  ✅ Variable successfully applied to test node (height)');
            } catch (heightError) {
              try {
                testRect.setBoundVariable('cornerRadius', variable);
                result.connectionTests.variableApplication = 'success';
                console.log('  ✅ Variable successfully applied to test node (cornerRadius)');
              } catch (cornerError) {
                result.connectionTests.variableApplication = 'failed';
                result.issues.push('Cannot apply variable to any test property');
                result.isHealthy = false;
                console.log('  ❌ Variable application failed on all properties:', cornerError.message);
              }
            }
          }
        }
      } catch (applicationError) {
        result.connectionTests.variableApplication = 'error';
        result.issues.push('Variable application error: ' + applicationError.message);
        result.isHealthy = false;
        console.log('  ❌ Variable application error:', applicationError.message);
      }
      
      // Clean up the test node
      testRect.remove();
      console.log('  🧹 Test node cleaned up');
      
    } catch (testNodeError) {
      result.connectionTests.variableApplication = 'test-setup-error';
      result.issues.push('Could not create test node: ' + testNodeError.message);
      console.log('  ❌ Test node creation error:', testNodeError.message);
    }
    
    // Step 8: Additional remote-specific checks
    if (variable.remote && result.collection && result.collection.remote) {
      // Both variable and collection are marked as remote - this should be healthy
      result.connectionTests.remoteConsistency = 'consistent';
    } else if (variable.remote && result.collection && !result.collection.remote) {
      // Variable is remote but collection is not - this might indicate an issue
      result.connectionTests.remoteConsistency = 'inconsistent';
      result.issues.push('Variable is remote but collection is not');
      result.isHealthy = false;
    }
    
  } catch (mainError) {
    result.issues.push('Main test error: ' + mainError.message);
    result.isHealthy = false;
    console.log('  ❌ Main test error:', mainError.message);
  }
  
  // Final assessment
  console.log('  🏁 Final result for', variable ? variable.name : 'unknown variable');
  console.log('    - Is Remote:', result.isRemote);
  console.log('    - Is Healthy:', result.isHealthy);
  console.log('    - Issues:', result.issues.length > 0 ? result.issues.join(', ') : 'none');
  console.log('    - Connection Tests:', Object.keys(result.connectionTests).length);
  
  return result;
};

// ===== RESULT PROCESSING =====

var processRemoteConnectionResults = function(connections) {
  if (connections.length === 0) {
    return [{
      message: 'No remote variable connections found',
      details: 'All variables appear to be local or no variables found',
      severity: 'info'
    }];
  }
  
  var results = [];
  var brokenCount = 0;
  var healthyCount = 0;
  
  // Count healthy vs broken
  for (var i = 0; i < connections.length; i++) {
    if (connections[i].isHealthy) {
      healthyCount++;
    } else {
      brokenCount++;
    }
  }
  
  // Summary header
  var summaryHtml = '<div class="info-category-header">';
  summaryHtml += '<div class="info-category-title">🔗 Remote Connection Analysis</div>';
  summaryHtml += '<div style="font-size: 12px; color: #666; margin-top: 4px;">';
  summaryHtml += '✅ Healthy: ' + healthyCount + ' • ❌ Broken: ' + brokenCount + ' • Total: ' + connections.length;
  summaryHtml += '</div>';
  summaryHtml += '</div>';
  
  results.push(createHtmlResult(summaryHtml, [], 'info'));
  
  // Individual connection results
  for (var i = 0; i < connections.length; i++) {
    var connection = connections[i];
    results.push(createConnectionResult(connection));
  }
  
  return results;
};

var createConnectionResult = function(connection) {
  var statusIcon = connection.isHealthy ? '✅' : '❌';
  var title = connection.nodeName + ' (' + connection.nodeType + ')';
  var subtitle = connection.property;
  
  if (connection.variable) {
    subtitle += ' • ' + connection.variable.name;
  }
  
  if (connection.collection) {
    subtitle += ' • ' + connection.collection.name;
  }
  
  var html = '<div class="info-entry">';
  html += '<div class="info-entry-content">';
  html += '<div class="info-entry-title">' + statusIcon + ' 🔗 ' + title + '</div>';
  html += '<div class="info-entry-subtitle">' + subtitle + '</div>';
  
  // Show issues
  if (connection.issues.length > 0) {
    html += '<div style="margin-top: 4px; font-size: 11px; color: #ff6b6b;">';
    html += '⚠️ Issues: ' + connection.issues.join(', ');
    html += '</div>';
  }
  
  // Show connection test details
  if (SHOW_CONNECTION_DETAILS && Object.keys(connection.connectionTests).length > 0) {
    html += '<div style="margin-top: 8px; font-size: 11px; color: #666; font-family: monospace;">';
    html += '<strong>Connection Tests:</strong><br>';
    
    for (var testName in connection.connectionTests) {
      var testResult = connection.connectionTests[testName];
      var testIcon = '🔍';
      
      if (testResult === 'success') testIcon = '✅';
      else if (testResult === 'error' || testResult === 'failed') testIcon = '❌';
      else if (testResult === 'initiated' || testResult === 'attempting') testIcon = '⏳';
      
      html += testIcon + ' ' + testName + ': ' + testResult + '<br>';
    }
    html += '</div>';
  }
  
  // Show variable details
  if (connection.variable) {
    html += '<div style="margin-top: 4px; font-size: 11px; color: #666;">';
    html += '🔑 Key: ' + (connection.variable.key ? connection.variable.key.substring(0, 16) + '...' : 'none');
    html += ' • 📁 Collection: ' + (connection.variable.variableCollectionId ? connection.variable.variableCollectionId.substring(0, 16) + '...' : 'none');
    html += '</div>';
  }
  
  html += '</div>';
  html += '</div>';
  
  var severity = connection.isHealthy ? 'info' : 'error';
  return createHtmlResult(html, [connection.nodeId], severity);
};

// ===== MAIN EXECUTION =====

console.log('=== TEST REMOTE VARIABLE CONNECTIONS ===');
console.log('Focusing on library connection testing');

var connections = testRemoteConnections();
var results = processRemoteConnectionResults(connections);

if (results.length > 0) {
  var brokenCount = 0;
  for (var i = 0; i < connections.length; i++) {
    if (!connections[i].isHealthy) brokenCount++;
  }
  
  var title = 'Remote Connection Test';
  if (brokenCount > 0) {
    title += ': ' + brokenCount + ' broken connections';
  } else if (connections.length > 0) {
    title += ': All ' + connections.length + ' connections healthy';
  } else {
    title += ': No remote variables found';
  }
  
  displayResults({
    title: title,
    results: results,
    type: brokenCount > 0 ? 'error' : 'info'
  });
  
  console.log('Remote connection test complete');
  console.log('Results displayed in InfoPanel');
  
  if (brokenCount > 0) {
    figma.notify(brokenCount + ' broken remote connections found');
  } else if (connections.length > 0) {
    figma.notify('All ' + connections.length + ' remote connections are healthy');
  } else {
    figma.notify('No remote variables found in selection');
  }
} else {
  figma.notify('No remote variables found to test');
}
