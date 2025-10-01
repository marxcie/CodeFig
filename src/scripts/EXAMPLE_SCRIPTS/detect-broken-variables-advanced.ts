// Detect Broken Variables - Advanced Method
// Uses resolvedVariableModes and collection analysis to detect truly broken variables
// @import { displayResults, createResult, createSelectableResult, createHtmlResult } from "@InfoPanel"

// ===== CONFIGURATION =====
var SHOW_DETAILED_ANALYSIS = true; // Show detailed collection and mode analysis
var GROUP_BY_ISSUE_TYPE = true; // Group results by type of issue
var SHOW_COLLECTION_HEALTH = true; // Show overall collection health status

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

var extractCollectionHashFromVariableId = function(variableId) {
  // Extract collection hash from VariableID format: "VariableID:hash/localId"
  if (!variableId || typeof variableId !== 'string') return null;
  
  var parts = variableId.split(':');
  if (parts.length < 2) return null;
  
  var hashPart = parts[1].split('/');
  if (hashPart.length < 2) return null;
  
  return hashPart[0]; // Return the collection hash
};

// ===== COLLECTION HEALTH ANALYSIS =====

var analyzeCollectionHealth = function() {
  var collectionHealth = new Map();
  
  console.log('=== ANALYZING COLLECTION HEALTH ===');
  
  // Get all local collections
  var localCollections = figma.variables.getLocalVariableCollections();
  for (var i = 0; i < localCollections.length; i++) {
    var collection = localCollections[i];
    collectionHealth.set(collection.id, {
      id: collection.id,
      name: collection.name,
      remote: false,
      accessible: true,
      modes: collection.modes,
      variableCount: 0,
      status: 'healthy'
    });
  }
  
  // Count variables in each collection
  var localVariables = figma.variables.getLocalVariables();
  for (var i = 0; i < localVariables.length; i++) {
    var variable = localVariables[i];
    var health = collectionHealth.get(variable.variableCollectionId);
    if (health) {
      health.variableCount++;
    }
  }
  
  // Try to get remote collections (this might not work perfectly)
  try {
    // Note: This is async and might not be available in all contexts
    console.log('Attempting to analyze remote collections...');
  } catch (e) {
    console.log('Remote collection analysis not available:', e.message);
  }
  
  console.log('Collection health analysis complete:', collectionHealth.size, 'collections found');
  return collectionHealth;
};

// ===== ADVANCED BROKEN VARIABLE DETECTION =====

var detectBrokenVariablesAdvanced = function() {
  var selection = figma.currentPage.selection;
  var issues = [];
  var collectionHealth = analyzeCollectionHealth();
  
  // If nothing selected, search entire page
  var nodesToCheck = selection.length > 0 ? selection : [figma.currentPage];
  var allNodes = collectAllNodes(nodesToCheck);
  
  console.log('=== ADVANCED BROKEN VARIABLE DETECTION ===');
  console.log('Nodes to analyze:', allNodes.length);
  console.log('Collections available:', collectionHealth.size);
  
  var nodesAnalyzed = 0;
  var issuesFound = 0;
  
  for (var i = 0; i < allNodes.length; i++) {
    var node = allNodes[i];
    
    // Skip nodes without variable-related properties
    if (!node.resolvedVariableModes && !node.boundVariables) {
      continue;
    }
    
    nodesAnalyzed++;
    var nodeIssues = analyzeNodeVariables(node, collectionHealth);
    
    for (var j = 0; j < nodeIssues.length; j++) {
      issues.push(nodeIssues[j]);
      issuesFound++;
    }
    
    if (i < 5 && nodeIssues.length > 0) {
      console.log('Node:', node.name, 'Issues found:', nodeIssues.length);
    }
  }
  
  console.log('Analysis complete:');
  console.log('- Nodes analyzed:', nodesAnalyzed);
  console.log('- Issues found:', issuesFound);
  
  return issues;
};

var analyzeNodeVariables = function(node, collectionHealth) {
  var issues = [];
  
  // Method 1: Analyze resolvedVariableModes
  if (node.resolvedVariableModes) {
    var resolvedModes = node.resolvedVariableModes;
    
    for (var collectionId in resolvedModes) {
      var modeId = resolvedModes[collectionId];
      var collectionHealthInfo = collectionHealth.get(collectionId);
      
      if (!collectionHealthInfo) {
        // Collection not found in our health map - this is likely broken
        issues.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          issueType: 'MISSING_COLLECTION',
          issue: 'Collection not accessible',
          collectionId: collectionId,
          modeId: modeId,
          details: 'Collection ID not found in accessible collections',
          path: getNodePath(node),
          severity: 'error'
        });
      } else {
        // Collection exists, check if mode exists
        var modeExists = false;
        for (var i = 0; i < collectionHealthInfo.modes.length; i++) {
          if (collectionHealthInfo.modes[i].modeId === modeId) {
            modeExists = true;
            break;
          }
        }
        
        if (!modeExists) {
          issues.push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            issueType: 'INVALID_MODE',
            issue: 'Mode not found in collection',
            collectionId: collectionId,
            collectionName: collectionHealthInfo.name,
            modeId: modeId,
            details: 'Mode ID does not exist in collection',
            path: getNodePath(node),
            severity: 'error'
          });
        }
      }
    }
  }
  
  // Method 2: Analyze boundVariables with collection cross-reference
  if (node.boundVariables) {
    var properties = Object.keys(node.boundVariables);
    
    for (var i = 0; i < properties.length; i++) {
      var property = properties[i];
      var binding = node.boundVariables[property];
      
      // Handle array bindings
      var bindings = Array.isArray(binding) ? binding : [binding];
      
      for (var j = 0; j < bindings.length; j++) {
        var actualBinding = bindings[j];
        
        if (actualBinding && actualBinding.id) {
          var variableId = actualBinding.id;
          var collectionHash = extractCollectionHashFromVariableId(variableId);
          
          if (collectionHash) {
            // Check if any collection matches this hash
            var collectionFound = false;
            collectionHealth.forEach(function(health, id) {
              if (id.indexOf(collectionHash) !== -1) {
                collectionFound = true;
              }
            });
            
            if (!collectionFound) {
              // Try to get the variable to see if it exists
              var variable = null;
              try {
                variable = figma.variables.getVariableById(variableId);
              } catch (e) {
                // Variable access error
              }
              
              issues.push({
                nodeId: node.id,
                nodeName: node.name,
                nodeType: node.type,
                property: property,
                issueType: 'ORPHANED_VARIABLE',
                issue: variable ? 'Variable collection disconnected' : 'Variable not found',
                variableId: variableId,
                variableName: variable ? variable.name : 'Unknown',
                collectionHash: collectionHash,
                details: 'Variable references inaccessible collection',
                path: getNodePath(node),
                severity: 'error'
              });
            }
          }
        }
      }
    }
  }
  
  return issues;
};

// ===== RESULT PROCESSING =====

var processResults = function(issues) {
  if (issues.length === 0) {
    return [{
      message: 'No broken variables detected!',
      details: 'All variable references appear to be healthy',
      severity: 'success'
    }];
  }
  
  var results = [];
  
  if (GROUP_BY_ISSUE_TYPE) {
    // Group by issue type
    var groups = {
      'MISSING_COLLECTION': [],
      'INVALID_MODE': [],
      'ORPHANED_VARIABLE': [],
      'OTHER': []
    };
    
    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i];
      var groupKey = issue.issueType || 'OTHER';
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(issue);
    }
    
    // Create results for each group
    for (var groupKey in groups) {
      var groupIssues = groups[groupKey];
      if (groupIssues.length === 0) continue;
      
      var groupTitle = getGroupTitle(groupKey);
      var groupIcon = getGroupIcon(groupKey);
      
      // Group header
      var headerHtml = '<div class="info-category-header">';
      headerHtml += '<div class="info-category-title">' + groupIcon + ' ' + groupTitle + ' (' + groupIssues.length + ' issues)</div>';
      headerHtml += '</div>';
      
      results.push(createHtmlResult(headerHtml, [], 'error'));
      
      // Individual issues
      for (var i = 0; i < groupIssues.length; i++) {
        var issue = groupIssues[i];
        results.push(createIssueResult(issue));
      }
    }
  } else {
    // Flat list
    for (var i = 0; i < issues.length; i++) {
      results.push(createIssueResult(issues[i]));
    }
  }
  
  return results;
};

var getGroupTitle = function(issueType) {
  switch (issueType) {
    case 'MISSING_COLLECTION': return 'Missing Collections';
    case 'INVALID_MODE': return 'Invalid Modes';
    case 'ORPHANED_VARIABLE': return 'Orphaned Variables';
    default: return 'Other Issues';
  }
};

var getGroupIcon = function(issueType) {
  switch (issueType) {
    case 'MISSING_COLLECTION': return '📁❌';
    case 'INVALID_MODE': return '🔄❌';
    case 'ORPHANED_VARIABLE': return '🔗❌';
    default: return '⚠️';
  }
};

var createIssueResult = function(issue) {
  var icon = '❌';
  var title = issue.nodeName + ' (' + issue.nodeType + ')';
  var subtitle = issue.issue;
  
  if (issue.property) {
    subtitle += ' • ' + issue.property;
  }
  
  if (issue.variableName && issue.variableName !== 'Unknown') {
    subtitle += ' • ' + issue.variableName;
  }
  
  if (issue.collectionName) {
    subtitle += ' • ' + issue.collectionName;
  }
  
  var html = '<div class="info-entry">';
  html += '<div class="info-entry-content">';
  html += '<div class="info-entry-title">' + icon + ' ' + title + '</div>';
  html += '<div class="info-entry-subtitle">' + subtitle + '</div>';
  
  if (SHOW_DETAILED_ANALYSIS && issue.details) {
    html += '<div style="margin-top: 4px; font-size: 11px; color: #666;">';
    html += '🔍 ' + issue.details;
    
    if (issue.collectionId) {
      html += '<br>📁 Collection: ' + issue.collectionId.substring(0, 20) + '...';
    }
    
    if (issue.modeId) {
      html += '<br>🔄 Mode: ' + issue.modeId;
    }
    
    if (issue.collectionHash) {
      html += '<br>🔗 Hash: ' + issue.collectionHash.substring(0, 16) + '...';
    }
    
    html += '</div>';
  }
  
  html += '</div>';
  html += '</div>';
  
  return createHtmlResult(html, [issue.nodeId], issue.severity || 'error');
};

// ===== MAIN EXECUTION =====

console.log('=== DETECT BROKEN VARIABLES - ADVANCED METHOD ===');
console.log('Using resolvedVariableModes and collection analysis');

var issues = detectBrokenVariablesAdvanced();
var results = processResults(issues);

if (results.length > 0) {
  var title = 'Advanced Variable Analysis';
  if (issues.length > 0) {
    title += ': ' + issues.length + ' issues found';
  } else {
    title += ': All variables healthy';
  }
  
  displayResults({
    title: title,
    results: results,
    type: issues.length > 0 ? 'error' : 'success'
  });
  
  console.log('Analysis complete - results displayed in InfoPanel');
  console.log('Issues found:', issues.length);
  
  if (issues.length > 0) {
    console.log('Issue breakdown:');
    var breakdown = {};
    for (var i = 0; i < issues.length; i++) {
      var type = issues[i].issueType || 'OTHER';
      breakdown[type] = (breakdown[type] || 0) + 1;
    }
    for (var type in breakdown) {
      console.log('- ' + type + ':', breakdown[type]);
    }
  }
} else {
  figma.notify('No nodes found to analyze');
}
