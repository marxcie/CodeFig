// List Used Variables and Styles
// Lists all variables and styles used in the selection, organized by categories

console.log('📋 List Used Variables and Styles');
console.log('==================================');

// Import the libraries
@import * from "@Variables"
@import * from "@Math Helpers"
@import * from "@InfoPanel"
@import * from "@Core Library"

// ============================================================================
// CONFIGURATION
// ============================================================================

var CONFIG = {
  // Search configuration
  searchRecursively: true,
  includeStyles: true,
  includeVariables: true,
  
  // Display options
  showNodeCount: true,
  showNodeNames: true,
  maxNodeNames: 5, // Maximum number of node names to show per item
  
  // Categories to include
  categories: {
    typography: true,
    color: true,
    dimensions: true,
    effects: true,
    grid: true
  }
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function listUsedVariablesAndStyles() {
  try {
    var results = [];
    var selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      results.push(createHtmlResult('<div class="error-text">❌ Please select elements to analyze</div>'));
      displayResults({
        title: 'Used Variables and Styles Analysis',
        results: results,
        type: 'error'
      });
      figma.notify('❌ Please select elements to analyze');
      return;
    }
    
    results.push(createHtmlResult('<div class="info-entry-title">📋 Used Variables and Styles Analysis</div>'));
    results.push(createHtmlResult('<div class="info-entry-subtitle">🔍 Analyzing ' + selection.length + ' selected element(s)</div>'));
    
    // Reset progress state and show progress immediately
    if (window._infoPanelHandler) {
      // First reset any existing progress
      window._infoPanelHandler({
        type: 'PROGRESS_RESET'
      });
      
      // Then show initial progress
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Analyzing selection...',
        processed: 0,
        total: 100,
        percentage: 0
      });
    } else {
      figma.notify('🔍 Analyzing ' + selection.length + ' elements...');
    }
    
    // Check for early warning about large selection
    var estimation = estimateNodeCount(selection);
    console.log('Selection length:', selection.length);
    console.log('Estimation result:', estimation);
    if (estimation.warning) {
      figma.notify('⚠️ ' + estimation.warning);
    }
    
    // For very large selections, suggest breaking them down
    if (estimation.estimated > 5000) {
      figma.notify('⚠️ Very large selection detected (' + estimation.estimated + '+ nodes). Consider selecting smaller areas for better performance.');
    }
    
    // Small delay to ensure progress bar is visible before heavy processing
    setTimeout(function() {
      // Always use chunked processing to handle large selections properly
      // The estimation is unreliable, so we'll use chunked processing for all selections
      console.log('Using chunked processing for all selections...');
      processLargeSelectionInChunks(selection, function(chunkResult) {
        processChunkResult(chunkResult, results);
      });
    }, 100);
    
  } catch (error) {
    var errorMsg = 'Error: ' + error.message;
    var results = [];
    results.push(createHtmlResult('<div class="error-text">❌ ' + errorMsg + '</div>'));
    displayResults({
      title: 'Used Variables and Styles Analysis',
      results: results,
      type: 'error'
    });
    figma.notify('❌ ' + errorMsg);
  }
}

// ============================================================================
// PROCESSING FUNCTIONS
// ============================================================================

function processSelection(selection, estimation, results) {
  try {
    console.log('Processing decision - estimation.estimated:', estimation.estimated, 'threshold: 3000');
    // Use chunked processing for large selections, regular processing for smaller ones
    if (estimation.estimated > 3000) {
      console.log('Starting chunked processing for large selection...');
      processLargeSelectionInChunks(selection, function(chunkResult) {
        processChunkResult(chunkResult, results);
      });
    } else {
      console.log('Starting regular processing for smaller selection...');
      // Use the original approach for smaller selections
      traverseNodesOptimized(selection, function(node) {
        try {
          var nodeData = {
            variables: new Map(),
            styles: new Map()
          };
          
          // Collect variables and styles from this node
          collectNodeVariables(node, nodeData.variables);
          collectNodeStyles(node, nodeData.styles);
          
          return nodeData;
        } catch (e) {
          console.warn('Error processing node ' + node.id + ':', e.message);
          return {
            variables: new Map(),
            styles: new Map()
          };
        }
      }, {
        operation: 'Analyzing nodes',
        showProgress: true,
        maxNodes: 5000,
        chunkSize: 25,
        nodeFilter: function(node) {
          return node.type === 'TEXT' || node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || 
                 node.type === 'POLYGON' || node.type === 'STAR' || node.type === 'VECTOR' ||
                 node.type === 'BOOLEAN_OPERATION' || node.type === 'FRAME' || node.type === 'COMPONENT' ||
                 node.type === 'INSTANCE' || node.type === 'GROUP';
        }
      }).then(function(processingResult) {
        processChunkResult(processingResult, results);
      }).catch(function(error) {
        var errorMsg = 'Error: ' + error.message;
        var errorResults = [];
        errorResults.push(createHtmlResult('<div class="error-text">❌ ' + errorMsg + '</div>'));
        displayResults({
          title: 'Used Variables and Styles Analysis',
          results: errorResults,
          type: 'error'
        });
        figma.notify('❌ ' + errorMsg);
      });
    }
  } catch (e) {
    console.warn('Error in processSelection:', e.message);
    var errorResults = [];
    errorResults.push(createHtmlResult('<div class="error-text">❌ Error processing selection: ' + e.message + '</div>'));
    displayResults({
      title: 'Used Variables and Styles Analysis',
      results: errorResults,
      type: 'error'
    });
    figma.notify('❌ Error processing selection: ' + e.message);
  }
}

function processChunkResult(chunkResult, results) {
  try {
    console.log('Processing completed. Results:', chunkResult.results ? chunkResult.results.length : 0, 'nodes processed');
    
    // Continue showing progress during data processing
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Processing data...',
        processed: 50,
        total: 100,
        percentage: 50
      });
    }
    
    if (chunkResult.partial) {
      results.push(createHtmlResult('<div class="warning-text">⚠️ Large selection detected - processed ' + chunkResult.processed + ' nodes (limit reached). Consider selecting a smaller area for complete analysis.</div>'));
    } else {
      results.push(createHtmlResult('<div class="info-entry-subtitle">📊 Processed ' + chunkResult.processed + ' nodes</div>'));
    }
    
    // Extract variables and styles from results
    var usedVariables = new Map();
    var usedStyles = new Map();
    
    // Handle both chunked and regular results
    if (chunkResult.results && chunkResult.results.length > 0) {
      if (chunkResult.results[0].variables && chunkResult.results[0].styles) {
        // Chunked results - already merged
        usedVariables = chunkResult.results[0].variables;
        usedStyles = chunkResult.results[0].styles;
      } else {
        // Regular results - need to merge
        for (var i = 0; i < chunkResult.results.length; i++) {
          var nodeData = chunkResult.results[i];
          if (nodeData && nodeData.variables && typeof nodeData.variables.forEach === 'function') {
            nodeData.variables.forEach(function(value, key) {
              if (usedVariables.has(key)) {
                var existing = usedVariables.get(key);
                if (existing && Array.isArray(existing.nodes) && Array.isArray(existing.nodeIds) && 
                    Array.isArray(value.nodes) && Array.isArray(value.nodeIds)) {
                  existing.nodes = existing.nodes.concat(value.nodes);
                  existing.nodeIds = existing.nodeIds.concat(value.nodeIds);
                }
              } else {
                usedVariables.set(key, value);
              }
            });
          }
          if (nodeData && nodeData.styles && typeof nodeData.styles.forEach === 'function') {
            nodeData.styles.forEach(function(value, key) {
              if (usedStyles.has(key)) {
                var existing = usedStyles.get(key);
                if (existing && Array.isArray(existing.nodes) && Array.isArray(existing.nodeIds) && 
                    Array.isArray(value.nodes) && Array.isArray(value.nodeIds)) {
                  existing.nodes = existing.nodes.concat(value.nodes);
                  existing.nodeIds = existing.nodeIds.concat(value.nodeIds);
                }
              } else {
                usedStyles.set(key, value);
              }
            });
          }
        }
      }
    }
    
    // Check if we have any data to work with
    if (usedVariables.size === 0 && usedStyles.size === 0) {
      results.push(createHtmlResult('<div class="error-text">❌ No variables or styles found in the processed nodes</div>'));
      displayResults({
        title: 'Used Variables and Styles Analysis',
        results: results,
        severity: 'error'
      });
      return;
    }
    
    // Show progress for organization phase
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Processing data...',
        processed: 80,
        total: 100,
        percentage: 80
      });
    }
    
    // Organize by categories
    var organizedData;
    try {
      organizedData = organizeByCategories(usedVariables, usedStyles);
    } catch (e) {
      console.warn('Error organizing data by categories:', e.message);
      results.push(createHtmlResult('<div class="error-text">❌ Error organizing data: ' + e.message + '</div>'));
      displayResults({
        title: 'Used Variables and Styles Analysis',
        results: results,
        severity: 'error'
      });
      return;
    }
    
    // Show progress for final display phase
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Processing data...',
        processed: 90,
        total: 100,
        percentage: 90
      });
    }
    
    // Display results by category
    try {
      for (var category in organizedData) {
        if (organizedData[category].variables.length === 0 && organizedData[category].styles.length === 0) {
          continue;
        }
        
        results.push(createHtmlResult('<div class="info-category-header">' + getCategoryIcon(category) + ' ' + getCategoryName(category) + '</div>'));
        
        // Display variables
        if (organizedData[category].variables.length > 0) {
          for (var j = 0; j < organizedData[category].variables.length; j++) {
            try {
              var varData = organizedData[category].variables[j];
              results.push(createVariableResult(varData));
            } catch (e) {
              console.warn('Error displaying variable:', e.message);
              results.push(createHtmlResult('<div class="error-text">❌ Error displaying variable</div>'));
            }
          }
        }
        
        // Display styles
        if (organizedData[category].styles.length > 0) {
          for (var k = 0; k < organizedData[category].styles.length; k++) {
            try {
              var styleData = organizedData[category].styles[k];
              results.push(createStyleResult(styleData));
            } catch (e) {
              console.warn('Error displaying style:', e.message);
              results.push(createHtmlResult('<div class="error-text">❌ Error displaying style</div>'));
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error displaying results:', e.message);
      results.push(createHtmlResult('<div class="error-text">❌ Error displaying results: ' + e.message + '</div>'));
    }
    
    // Summary
    var totalVariables = usedVariables.size;
    var totalStyles = usedStyles.size;
    
    var summary = [];
    summary.push('<div class="info-category-header">📊 Summary</div>');
    summary.push('<div class="info-entry-subtitle">📊 Total variables: ' + totalVariables + '</div>');
    summary.push('<div class="info-entry-subtitle">🎨 Total styles: ' + totalStyles + '</div>');
    summary.push('<div class="info-entry-subtitle">📝 Total nodes analyzed: ' + chunkResult.processed + '</div>');
    
    results.push(createHtmlResult(summary.join('')));
    
    // Show final progress before displaying results
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Complete!',
        processed: 100,
        total: 100,
        percentage: 100
      });
    }
    
    // Display results
    displayResults({
      title: 'Used Variables and Styles Analysis',
      results: results,
      type: 'info'
    });
    
    figma.notify('✅ Found ' + totalVariables + ' variables and ' + totalStyles + ' styles in selection');
    
  } catch (e) {
    console.warn('Error in processChunkResult:', e.message);
    results.push(createHtmlResult('<div class="error-text">❌ Error processing results: ' + e.message + '</div>'));
    displayResults({
      title: 'Used Variables and Styles Analysis',
      results: results,
      type: 'error'
    });
    figma.notify('❌ Error processing results: ' + e.message);
  }
}

// ============================================================================
// CHUNKED PROCESSING FOR LARGE SELECTIONS
// ============================================================================

function processLargeSelectionInChunks(selection, callback) {
  var CHUNK_SIZE = 500; // Process 500 nodes at a time
  var MAX_NODES_PER_CHUNK = 200; // Limit per chunk to prevent memory issues
  
  // First, collect all nodes in small batches
  var allNodes = [];
  var processed = new Set();
  var nodeCount = 0;
  var maxTotalNodes = 15000; // Higher absolute maximum
  
  function collectNodesRecursively(node, depth) {
    depth = depth || 0;
    
    // Skip if already processed, depth limit reached, or we've hit the absolute limit
    if (processed.has(node.id) || depth > 10 || nodeCount >= maxTotalNodes) return;
    processed.add(node.id);
    
    // Only process nodes that might have variables or styles
    if (node.type === 'TEXT' || node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || 
        node.type === 'POLYGON' || node.type === 'STAR' || node.type === 'VECTOR' ||
        node.type === 'BOOLEAN_OPERATION' || node.type === 'FRAME' || node.type === 'COMPONENT' ||
        node.type === 'INSTANCE' || node.type === 'GROUP') {
      allNodes.push(node);
      nodeCount++;
    }
    
    // Recurse into children only if we haven't hit the limit
    if (nodeCount < maxTotalNodes && 'children' in node && depth < 10) {
      for (var i = 0; i < node.children.length; i++) {
        collectNodesRecursively(node.children[i], depth + 1);
        if (nodeCount >= maxTotalNodes) break;
      }
    }
  }
  
  // Collect all nodes first
  for (var i = 0; i < selection.length; i++) {
    collectNodesRecursively(selection[i]);
    if (nodeCount >= maxTotalNodes) break;
  }
  
  console.log('Collected ' + nodeCount + ' nodes for processing');
  
  // Process in chunks
  var chunkIndex = 0;
  var allResults = {
    variables: new Map(),
    styles: new Map(),
    processedCount: 0,
    totalNodes: allNodes.length
  };
  
  function processNextChunk() {
    var startIndex = chunkIndex * CHUNK_SIZE;
    var endIndex = Math.min(startIndex + CHUNK_SIZE, allNodes.length);
    
    if (startIndex >= allNodes.length) {
      // All chunks processed, merge results
      mergeChunkResults(allResults, callback);
      return;
    }
    
    var chunk = allNodes.slice(startIndex, endIndex);
    var chunkNumber = chunkIndex + 1;
    var totalChunks = Math.ceil(allNodes.length / CHUNK_SIZE);
    
    console.log('Processing chunk ' + chunkNumber + '/' + totalChunks + ' (' + chunk.length + ' nodes)');
    
    // Update progress
    if (window._infoPanelHandler) {
      var progressPercent = Math.round((startIndex / allNodes.length) * 100);
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Analyzing nodes (chunk ' + chunkNumber + '/' + totalChunks + ')',
        processed: startIndex,
        total: allNodes.length,
        percentage: progressPercent
      });
    }
    
    // Process this chunk with very conservative limits
    try {
      var chunkResults = [];
      
      // Process each node individually to minimize memory usage
      for (var i = 0; i < chunk.length; i++) {
        var node = chunk[i];
        
        try {
          var nodeData = {
            variables: new Map(),
            styles: new Map()
          };
          
          // Collect variables and styles from this node
          collectNodeVariables(node, nodeData.variables);
          collectNodeStyles(node, nodeData.styles);
          
          chunkResults.push(nodeData);
          
          // Force garbage collection after every 10 nodes
          if (i % 10 === 0) {
            cleanupMemory();
            if (typeof gc === 'function') {
              try {
                gc();
              } catch (e) {
                // Ignore gc errors
              }
            }
          }
        } catch (e) {
          console.warn('Error processing node ' + node.id + ':', e.message);
          // Add empty result to maintain array structure
          chunkResults.push({
            variables: new Map(),
            styles: new Map()
          });
        }
      }
      
      // Merge chunk results into allResults
      mergeChunkData(allResults, chunkResults);
      allResults.processedCount += chunkResults.length;
      
      // Clear chunk results immediately
      chunkResults = null;
      
      // Force cleanup after each chunk
      cleanupMemory();
      if (typeof gc === 'function') {
        try {
          gc();
        } catch (e) {
          // Ignore gc errors
        }
      }
      
      chunkIndex++;
      
      // Longer delay between chunks to allow memory cleanup
      setTimeout(processNextChunk, 200);
      
    } catch (error) {
      console.warn('Error processing chunk ' + chunkNumber + ':', error.message);
      // Continue with next chunk even if this one failed
      chunkIndex++;
      setTimeout(processNextChunk, 200);
    }
  }
  
  // Start processing
  processNextChunk();
}

function mergeChunkData(allResults, chunkResults) {
  try {
    for (var i = 0; i < chunkResults.length; i++) {
      var nodeData = chunkResults[i];
      
      // Merge variables
      if (nodeData && nodeData.variables && typeof nodeData.variables.forEach === 'function') {
        nodeData.variables.forEach(function(value, key) {
          if (allResults.variables.has(key)) {
            var existing = allResults.variables.get(key);
            if (existing && Array.isArray(existing.nodes) && Array.isArray(existing.nodeIds) && 
                Array.isArray(value.nodes) && Array.isArray(value.nodeIds)) {
              existing.nodes = existing.nodes.concat(value.nodes);
              existing.nodeIds = existing.nodeIds.concat(value.nodeIds);
            }
          } else {
            allResults.variables.set(key, value);
          }
        });
      }
      
      // Merge styles
      if (nodeData && nodeData.styles && typeof nodeData.styles.forEach === 'function') {
        nodeData.styles.forEach(function(value, key) {
          if (allResults.styles.has(key)) {
            var existing = allResults.styles.get(key);
            if (existing && Array.isArray(existing.nodes) && Array.isArray(existing.nodeIds) && 
                Array.isArray(value.nodes) && Array.isArray(value.nodeIds)) {
              existing.nodes = existing.nodes.concat(value.nodes);
              existing.nodeIds = existing.nodeIds.concat(value.nodeIds);
            }
          } else {
            allResults.styles.set(key, value);
          }
        });
      }
    }
  } catch (e) {
    console.warn('Error merging chunk data:', e.message);
  }
}

function mergeChunkResults(allResults, callback) {
  console.log('Merging results from ' + allResults.processedCount + ' nodes');
  
  // Convert Maps to the format expected by the rest of the script
  var usedVariables = allResults.variables;
  var usedStyles = allResults.styles;
  
  // Continue with the rest of the processing
  callback({
    results: [{
      variables: usedVariables,
      styles: usedStyles
    }],
    partial: allResults.processedCount >= 50000, // Mark as partial if we hit the absolute limit
    processed: allResults.processedCount,
    total: allResults.totalNodes,
    message: allResults.processedCount >= 50000 ? 
      'Processed ' + allResults.processedCount + ' nodes (absolute limit reached)' : 
      'Processed ' + allResults.processedCount + ' nodes successfully'
  });
}

// ============================================================================
// COLLECTION FUNCTIONS
// ============================================================================

function collectAllNodes(selection) {
  var allNodes = [];
  
  for (var i = 0; i < selection.length; i++) {
    var node = selection[i];
    allNodes.push(node);
    
    if ('children' in node) {
      collectChildrenRecursively(node, allNodes);
    }
  }
  
  return allNodes;
}

function collectChildrenRecursively(node, allNodes) {
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    allNodes.push(child);
    
    if ('children' in child) {
      collectChildrenRecursively(child, allNodes);
    }
  }
}

function collectNodeVariables(node, usedVariables) {
  try {
    if (!node || !node.boundVariables || typeof node.boundVariables !== 'object') return;
    
    for (var property in node.boundVariables) {
      try {
        var binding = node.boundVariables[property];
        if (!binding) continue;
        
        var variableId = binding.id || (binding[0] && binding[0].id);
        if (!variableId) continue;
        
        var variable = figma.variables.getVariableById(variableId);
        if (!variable || !variable.name) continue;
        
        var key = variable.name + '::' + property;
        if (!usedVariables.has(key)) {
          usedVariables.set(key, {
            variable: variable,
            property: property,
            nodes: [],
            nodeIds: []
          });
        }
        
        var varData = usedVariables.get(key);
        if (varData && Array.isArray(varData.nodes) && Array.isArray(varData.nodeIds)) {
          varData.nodes.push(node.name || 'Unnamed');
          varData.nodeIds.push(node.id);
        }
      } catch (e) {
        console.warn('Error processing variable binding for property ' + property + ' on node ' + node.id + ':', e.message);
      }
    }
  } catch (e) {
    console.warn('Error collecting variables from node ' + (node ? node.id : 'unknown') + ':', e.message);
  }
}

function collectNodeStyles(node, usedStyles) {
  try {
    if (!node) return;
    
    // Text styles
    if (node.textStyleId && node.textStyleId !== figma.mixed) {
      try {
        var textStyle = figma.getStyleById(node.textStyleId);
        if (textStyle && textStyle.name) {
          var key = 'text::' + textStyle.name;
          if (!usedStyles.has(key)) {
            usedStyles.set(key, {
              style: textStyle,
              type: 'text',
              nodes: [],
              nodeIds: []
            });
          }
          var styleData = usedStyles.get(key);
          if (styleData && Array.isArray(styleData.nodes) && Array.isArray(styleData.nodeIds)) {
            styleData.nodes.push(node.name || 'Unnamed');
            styleData.nodeIds.push(node.id);
          }
        }
      } catch (e) {
        console.warn('Error processing text style for node ' + node.id + ':', e.message);
      }
    }
    
    // Fill styles
    if (node.fillStyleId && node.fillStyleId !== figma.mixed) {
      try {
        var fillStyle = figma.getStyleById(node.fillStyleId);
        if (fillStyle && fillStyle.name) {
          var key = 'fill::' + fillStyle.name;
          if (!usedStyles.has(key)) {
            usedStyles.set(key, {
              style: fillStyle,
              type: 'fill',
              nodes: [],
              nodeIds: []
            });
          }
          var styleData = usedStyles.get(key);
          if (styleData && Array.isArray(styleData.nodes) && Array.isArray(styleData.nodeIds)) {
            styleData.nodes.push(node.name || 'Unnamed');
            styleData.nodeIds.push(node.id);
          }
        }
      } catch (e) {
        console.warn('Error processing fill style for node ' + node.id + ':', e.message);
      }
    }
    
    // Stroke styles
    if (node.strokeStyleId && node.strokeStyleId !== figma.mixed) {
      try {
        var strokeStyle = figma.getStyleById(node.strokeStyleId);
        if (strokeStyle && strokeStyle.name) {
          var key = 'stroke::' + strokeStyle.name;
          if (!usedStyles.has(key)) {
            usedStyles.set(key, {
              style: strokeStyle,
              type: 'stroke',
              nodes: [],
              nodeIds: []
            });
          }
          var styleData = usedStyles.get(key);
          if (styleData && Array.isArray(styleData.nodes) && Array.isArray(styleData.nodeIds)) {
            styleData.nodes.push(node.name || 'Unnamed');
            styleData.nodeIds.push(node.id);
          }
        }
      } catch (e) {
        console.warn('Error processing stroke style for node ' + node.id + ':', e.message);
      }
    }
    
    // Effect styles
    if (node.effectStyleId && node.effectStyleId !== figma.mixed) {
      try {
        var effectStyle = figma.getStyleById(node.effectStyleId);
        if (effectStyle && effectStyle.name) {
          var key = 'effect::' + effectStyle.name;
          if (!usedStyles.has(key)) {
            usedStyles.set(key, {
              style: effectStyle,
              type: 'effect',
              nodes: [],
              nodeIds: []
            });
          }
          var styleData = usedStyles.get(key);
          if (styleData && Array.isArray(styleData.nodes) && Array.isArray(styleData.nodeIds)) {
            styleData.nodes.push(node.name || 'Unnamed');
            styleData.nodeIds.push(node.id);
          }
        }
      } catch (e) {
        console.warn('Error processing effect style for node ' + node.id + ':', e.message);
      }
    }
  } catch (e) {
    console.warn('Error collecting styles from node ' + (node ? node.id : 'unknown') + ':', e.message);
  }
}

// ============================================================================
// ORGANIZATION FUNCTIONS
// ============================================================================

function organizeByCategories(usedVariables, usedStyles) {
  var organized = {
    typography: { variables: [], styles: [] },
    color: { variables: [], styles: [] },
    dimensions: { variables: [], styles: [] },
    effects: { variables: [], styles: [] },
    grid: { variables: [], styles: [] }
  };
  
  // Organize variables
  try {
    if (usedVariables && typeof usedVariables.forEach === 'function') {
      usedVariables.forEach(function(varData, key) {
        try {
          if (varData && varData.variable && varData.property) {
            var category = categorizeVariable(varData.variable.name, varData.property);
            if (organized[category]) {
              organized[category].variables.push(varData);
            }
          }
        } catch (e) {
          console.warn('Error categorizing variable ' + key + ':', e.message);
        }
      });
    }
  } catch (e) {
    console.warn('Error organizing variables:', e.message);
  }
  
  // Organize styles
  try {
    if (usedStyles && typeof usedStyles.forEach === 'function') {
      usedStyles.forEach(function(styleData, key) {
        try {
          if (styleData && styleData.style && styleData.type) {
            var category = categorizeStyle(styleData.style.name, styleData.type);
            if (organized[category]) {
              organized[category].styles.push(styleData);
            }
          }
        } catch (e) {
          console.warn('Error categorizing style ' + key + ':', e.message);
        }
      });
    }
  } catch (e) {
    console.warn('Error organizing styles:', e.message);
  }
  
  return organized;
}

function categorizeVariable(variableName, property) {
  var name = variableName.toLowerCase();
  var prop = property.toLowerCase();
  
  // Typography
  if (prop.includes('font') || prop.includes('text') || name.includes('typography') || name.includes('font')) {
    return 'typography';
  }
  
  // Color
  if (prop.includes('color') || prop.includes('fill') || prop.includes('stroke') || name.includes('color')) {
    return 'color';
  }
  
  // Dimensions
  if (prop.includes('width') || prop.includes('height') || prop.includes('padding') || prop.includes('margin') || 
      prop.includes('radius') || prop.includes('gap') || prop.includes('spacing') || name.includes('spacing') || 
      name.includes('padding') || name.includes('margin') || name.includes('radius')) {
    return 'dimensions';
  }
  
  // Grid
  if (name.includes('grid') || name.includes('column') || name.includes('row')) {
    return 'grid';
  }
  
  // Effects
  if (prop.includes('effect') || prop.includes('shadow') || prop.includes('blur') || name.includes('effect') || 
      name.includes('shadow') || name.includes('blur')) {
    return 'effects';
  }
  
  // Default to dimensions for unknown
  return 'dimensions';
}

function categorizeStyle(styleName, styleType) {
  var name = styleName.toLowerCase();
  
  // Typography
  if (styleType === 'text' || name.includes('typography') || name.includes('font') || name.includes('text')) {
    return 'typography';
  }
  
  // Color
  if (styleType === 'fill' || styleType === 'stroke' || name.includes('color')) {
    return 'color';
  }
  
  // Effects
  if (styleType === 'effect' || name.includes('effect') || name.includes('shadow') || name.includes('blur')) {
    return 'effects';
  }
  
  // Default to color for unknown
  return 'color';
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function createVariableResult(varData) {
  try {
    if (!varData || !varData.variable || !varData.property) {
      return createHtmlResult('<div class="error-text">❌ Invalid variable data</div>');
    }
    
    var variable = varData.variable;
    var property = varData.property;
    var nodes = varData.nodes || [];
    var nodeIds = varData.nodeIds || [];
    
    var html = [];
    html.push('<div class="info-entry" onclick="selectNodes([\'' + nodeIds.join('\',\'') + '\'])">');
    html.push('  <div class="info-entry-icon">📊</div>');
    html.push('  <div class="info-entry-content">');
    html.push('    <div class="info-entry-title">' + (variable.name || 'Unknown Variable') + '</div>');
    html.push('    <div class="info-entry-subtitle">' + (property || 'Unknown Property') + '</div>');
    
    // Add visual preview for variables
    try {
      var preview = createVariablePreview(variable, property);
      if (preview) {
        html.push('    <div class="variable-preview">' + preview + '</div>');
      }
    } catch (e) {
      console.warn('Error creating variable preview:', e.message);
    }
    
    if (CONFIG.showNodeCount) {
      html.push('    <div class="info-entry-badge">' + nodes.length + ' node' + (nodes.length !== 1 ? 's' : '') + '</div>');
    }
    
    if (CONFIG.showNodeNames && nodes.length > 0) {
      var displayNodes = nodes.slice(0, CONFIG.maxNodeNames);
      var moreCount = nodes.length - CONFIG.maxNodeNames;
      var nodeList = displayNodes.join(', ');
      if (moreCount > 0) {
        nodeList += ' +' + moreCount + ' more';
      }
      html.push('    <div class="info-entry-subtitle">' + nodeList + '</div>');
    }
    
    html.push('  </div>');
    html.push('</div>');
    
    return createHtmlResult(html.join(''));
  } catch (e) {
    console.warn('Error creating variable result:', e.message);
    return createHtmlResult('<div class="error-text">❌ Error displaying variable</div>');
  }
}

function createStyleResult(styleData) {
  try {
    if (!styleData || !styleData.style || !styleData.type) {
      return createHtmlResult('<div class="error-text">❌ Invalid style data</div>');
    }
    
    var style = styleData.style;
    var type = styleData.type;
    var nodes = styleData.nodes || [];
    var nodeIds = styleData.nodeIds || [];
    
    var html = [];
    html.push('<div class="info-entry" onclick="selectNodes([\'' + nodeIds.join('\',\'') + '\'])">');
    html.push('  <div class="info-entry-icon">🎨</div>');
    html.push('  <div class="info-entry-content">');
    html.push('    <div class="info-entry-title">' + (style.name || 'Unknown Style') + '</div>');
    html.push('    <div class="info-entry-subtitle">' + (type || 'Unknown Type') + ' style</div>');
    
    // Add visual preview based on style type
    try {
      var preview = createStylePreview(style, type);
      if (preview) {
        html.push('    <div class="style-preview">' + preview + '</div>');
      }
    } catch (e) {
      console.warn('Error creating style preview:', e.message);
    }
    
    if (CONFIG.showNodeCount) {
      html.push('    <div class="info-entry-badge">' + nodes.length + ' node' + (nodes.length !== 1 ? 's' : '') + '</div>');
    }
    
    if (CONFIG.showNodeNames && nodes.length > 0) {
      var displayNodes = nodes.slice(0, CONFIG.maxNodeNames);
      var moreCount = nodes.length - CONFIG.maxNodeNames;
      var nodeList = displayNodes.join(', ');
      if (moreCount > 0) {
        nodeList += ' +' + moreCount + ' more';
      }
      html.push('    <div class="info-entry-subtitle">' + nodeList + '</div>');
    }
    
    html.push('  </div>');
    html.push('</div>');
    
    return createHtmlResult(html.join(''));
  } catch (e) {
    console.warn('Error creating style result:', e.message);
    return createHtmlResult('<div class="error-text">❌ Error displaying style</div>');
  }
}

function getCategoryIcon(category) {
  var icons = {
    typography: '📝',
    color: '🎨',
    dimensions: '📏',
    effects: '✨',
    grid: '📐'
  };
  return icons[category] || '📋';
}

function getCategoryName(category) {
  var names = {
    typography: 'Typography',
    color: 'Color',
    dimensions: 'Dimensions & Spacing',
    effects: 'Grid & Effects',
    grid: 'Grid System'
  };
  return names[category] || category;
}

// ============================================================================
// VISUAL PREVIEW FUNCTIONS
// ============================================================================

function createVariablePreview(variable, property) {
  try {
    if (!variable || !property) return null;
    
    // Get the first mode value for preview
    var modes = variable.valuesByMode;
    if (!modes) return null;
    
    var firstMode = Object.keys(modes)[0];
    if (!firstMode) return null;
    
    var value = modes[firstMode];
    if (!value) return null;
    
    var html = [];
    
    // Color variables
    if (property === 'fills' && value.type === 'VARIABLE_ALIAS') {
      // Try to resolve the color
      try {
        var colorVar = figma.variables.getVariableById(value.id);
        if (colorVar && colorVar.valuesByMode[firstMode] && colorVar.valuesByMode[firstMode].type === 'COLOR') {
          var color = colorVar.valuesByMode[firstMode];
          var hex = rgbToHex(color.r, color.g, color.b);
          html.push('<div class="color-preview" style="background-color: ' + hex + '; width: 20px; height: 20px; border-radius: 4px; display: inline-block; margin-right: 8px;"></div>');
          html.push('<span class="color-value">' + hex + '</span>');
        }
      } catch (e) {
        console.warn('Error resolving color variable:', e.message);
      }
    } else if (property === 'fills' && value.type === 'COLOR') {
      try {
        var hex = rgbToHex(value.r, value.g, value.b);
        html.push('<div class="color-preview" style="background-color: ' + hex + '; width: 20px; height: 20px; border-radius: 4px; display: inline-block; margin-right: 8px;"></div>');
        html.push('<span class="color-value">' + hex + '</span>');
      } catch (e) {
        console.warn('Error creating color preview:', e.message);
      }
    }
    // Typography variables
    else if (property === 'fontSize' && value.type === 'VARIABLE_ALIAS') {
      try {
        var fontSizeVar = figma.variables.getVariableById(value.id);
        if (fontSizeVar && fontSizeVar.valuesByMode[firstMode] && fontSizeVar.valuesByMode[firstMode].type === 'FLOAT') {
          var fontSize = fontSizeVar.valuesByMode[firstMode];
          html.push('<span class="font-size-preview" style="font-size: ' + Math.min(fontSize, 16) + 'px; font-weight: 500;">Aa</span>');
          html.push('<span class="font-size-value">' + fontSize + 'px</span>');
        }
      } catch (e) {
        console.warn('Error resolving font size variable:', e.message);
      }
    } else if (property === 'fontSize' && value.type === 'FLOAT') {
      try {
        html.push('<span class="font-size-preview" style="font-size: ' + Math.min(value, 16) + 'px; font-weight: 500;">Aa</span>');
        html.push('<span class="font-size-value">' + value + 'px</span>');
      } catch (e) {
        console.warn('Error creating font size preview:', e.message);
      }
    }
    // Dimension variables
    else if ((property === 'width' || property === 'height') && value.type === 'FLOAT') {
      try {
        html.push('<span class="dimension-value">' + value + 'px</span>');
      } catch (e) {
        console.warn('Error creating dimension preview:', e.message);
      }
    }
    // Spacing variables
    else if ((property === 'paddingLeft' || property === 'paddingRight' || property === 'paddingTop' || property === 'paddingBottom' || property === 'itemSpacing') && value.type === 'FLOAT') {
      try {
        html.push('<span class="spacing-value">' + value + 'px</span>');
      } catch (e) {
        console.warn('Error creating spacing preview:', e.message);
      }
    }
    // Border radius variables
    else if ((property === 'topLeftRadius' || property === 'topRightRadius' || property === 'bottomLeftRadius' || property === 'bottomRightRadius') && value.type === 'FLOAT') {
      try {
        html.push('<span class="radius-value">' + value + 'px</span>');
      } catch (e) {
        console.warn('Error creating radius preview:', e.message);
      }
    }
    
    return html.length > 0 ? html.join('') : null;
  } catch (e) {
    console.warn('Error creating variable preview:', e.message);
    return null;
  }
}

function createStylePreview(style, type) {
  try {
    if (!style || !type) return null;
    
    var html = [];
    
    if (type === 'text') {
      // Text style preview
      try {
        var fontFamily = style.fontName ? style.fontName.family : 'System';
        var fontSize = style.fontSize || 14;
        var fontWeight = style.fontWeight || 400;
        var letterSpacing = style.letterSpacing ? style.letterSpacing.value + 'px' : '0px';
        
        html.push('<div class="text-preview" style="');
        html.push('font-family: \'' + fontFamily + '\'; ');
        html.push('font-size: ' + Math.min(fontSize, 16) + 'px; ');
        html.push('font-weight: ' + fontWeight + '; ');
        html.push('letter-spacing: ' + letterSpacing + '; ');
        html.push('">Aa</div>');
        html.push('<div class="text-details">');
        html.push('<span class="font-family">' + fontFamily + '</span> ');
        html.push('<span class="font-size">' + fontSize + 'px</span> ');
        html.push('<span class="font-weight">' + fontWeight + '</span>');
        html.push('</div>');
      } catch (e) {
        console.warn('Error creating text style preview:', e.message);
      }
    }
    else if (type === 'fill') {
      // Fill style preview
      try {
        if (style.paints && style.paints.length > 0) {
          var paint = style.paints[0];
          if (paint.type === 'SOLID') {
            var hex = rgbToHex(paint.color.r, paint.color.g, paint.color.b);
            html.push('<div class="color-preview" style="background-color: ' + hex + '; width: 20px; height: 20px; border-radius: 4px; display: inline-block; margin-right: 8px;"></div>');
            html.push('<span class="color-value">' + hex + '</span>');
          }
        }
      } catch (e) {
        console.warn('Error creating fill style preview:', e.message);
      }
    }
    else if (type === 'stroke') {
      // Stroke style preview
      try {
        if (style.paints && style.paints.length > 0) {
          var paint = style.paints[0];
          if (paint.type === 'SOLID') {
            var hex = rgbToHex(paint.color.r, paint.color.g, paint.color.b);
            html.push('<div class="stroke-preview" style="border: 2px solid ' + hex + '; width: 20px; height: 20px; border-radius: 4px; display: inline-block; margin-right: 8px;"></div>');
            html.push('<span class="color-value">' + hex + '</span>');
          }
        }
      } catch (e) {
        console.warn('Error creating stroke style preview:', e.message);
      }
    }
    else if (type === 'effect') {
      // Effect style preview
      try {
        if (style.effects && style.effects.length > 0) {
          var effect = style.effects[0];
          if (effect.type === 'DROP_SHADOW') {
            html.push('<div class="effect-preview" style="');
            html.push('width: 20px; height: 20px; background: #f0f0f0; border-radius: 4px; ');
            html.push('box-shadow: ' + effect.offset.x + 'px ' + effect.offset.y + 'px ' + effect.radius + 'px rgba(0,0,0,' + effect.color.a + '); ');
            html.push('display: inline-block; margin-right: 8px;"></div>');
            html.push('<span class="effect-value">Drop Shadow</span>');
          }
        }
      } catch (e) {
        console.warn('Error creating effect style preview:', e.message);
      }
    }
    
    return html.length > 0 ? html.join('') : null;
  } catch (e) {
    console.warn('Error creating style preview:', e.message);
    return null;
  }
}

// ============================================================================
// RUN THE SCRIPT
// ============================================================================

listUsedVariablesAndStyles();
