// List Used Variables and Styles v2
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
    
    // Step 1: Analyze selection structure
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Analyzing selection structure...',
        processed: 5,
        total: 100,
        percentage: 5
      });
    }
    
    // Check for early warning about large selection
    var estimation = estimateNodeCount(selection);
    console.log('Selection length:', selection.length);
    console.log('Estimation result:', estimation);
    
    // Step 2: Validate selection
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Validating selection...',
        processed: 10,
        total: 100,
        percentage: 10
      });
    }
    
    if (estimation.warning) {
      figma.notify('⚠️ ' + estimation.warning);
    }
    
    // For very large selections, suggest breaking them down
    if (estimation.estimated > 5000) {
      figma.notify('⚠️ Very large selection detected (' + estimation.estimated + '+ nodes). Consider selecting smaller areas for better performance.');
    }
    
    // Step 3: Preparing for processing
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Preparing for processing...',
        processed: 15,
        total: 100,
        percentage: 15
      });
    }
    
    // Show progress during preparation delay
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Initializing processing engine...',
        processed: 18,
        total: 100,
        percentage: 18
      });
    }
    
    // Show progress during preparation delay with staggered updates
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Loading processing modules...',
        processed: 16,
        total: 100,
        percentage: 16
      });
    }
    
    // Staggered progress updates during delay
    setTimeout(function() {
      if (window._infoPanelHandler) {
        window._infoPanelHandler({
          type: 'PROGRESS_UPDATE',
          operation: 'Preparing data structures...',
          processed: 17,
          total: 100,
          percentage: 17
        });
      }
    }, 100);
    
    setTimeout(function() {
      if (window._infoPanelHandler) {
        window._infoPanelHandler({
          type: 'PROGRESS_UPDATE',
          operation: 'Starting chunked processing...',
          processed: 19,
          total: 100,
          percentage: 19
        });
      }
    }, 200);
    
    // Longer delay to ensure progress bar is visible and give time for updates
    setTimeout(function() {
      // Always use chunked processing to handle large selections properly
      // The estimation is unreliable, so we'll use chunked processing for all selections
      console.log('Using chunked processing for all selections...');
      processLargeSelectionInChunks(selection, function(chunkResult) {
        processChunkResult(chunkResult, results);
      });
    }, 500); // Increased from 100ms to 500ms
    
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
    
    // Display results - Styles first, then Variables (no grouping)
    try {
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
        if (property === 'textRangeFills') return 'Text Range Fill';
        return property;
      }
      
      // Helper function to get category icon
      function getCategoryIcon(categoryName) {
        if (categoryName === 'Typography') return '🎨';
        if (categoryName === 'Color') return '🎨';
        if (categoryName === 'Dimensions & Spacing') return '📏';
        if (categoryName === 'Grid & Effects') return '📐';
        return '📊';
      }
      
      // 1. DISPLAY STYLES FIRST
      var hasStyles = false;
      var categories = ['Typography', 'Color', 'Dimensions & Spacing', 'Grid & Effects'];
      
      for (var c = 0; c < categories.length; c++) {
        var categoryName = categories[c];
        var categoryData = organizedData[categoryName];
        
        // Find styles in this category
        var styleEntries = [];
        for (var key in categoryData) {
          var entry = categoryData[key];
          if (entry.isStyle) {
            styleEntries.push(entry);
            hasStyles = true;
          }
        }
        
        if (styleEntries.length > 0) {
          // Add category header for styles
          var categoryHtml = '<div class="info-category-header">' +
            '<span class="info-category-title">' + getCategoryIcon(categoryName) + ' ' + categoryName + ' (Styles)</span>' +
          '</div>';
          results.push(createHtmlResult(categoryHtml, null, 'info'));
          
          // Display each style individually (no grouping)
          for (var i = 0; i < styleEntries.length; i++) {
            var entry = styleEntries[i];
            var nodeIds = entry.nodeIds || [];
            
            var entryHtml = '<div class="info-entry">' +
              '<div class="info-entry-content">' +
                '<div class="info-entry-title">' + (entry.styleName || 'Unknown Style') + 
                '<span class="info-entry-count"> (' + entry.count + ')</span>' +
                '</div>' +
                '<div class="info-entry-subtitle">' +
                  '<span class="info-entry-badge">' + getPropertyDisplay(entry.type) + '</span>' +
                '</div>' +
              '</div>' +
            '</div>';
            results.push(createHtmlResult(entryHtml, nodeIds, 'info'));
          }
        }
      }
      
      // 2. DISPLAY VARIABLES SECOND
      var hasVariables = false;
      
      for (var c = 0; c < categories.length; c++) {
        var categoryName = categories[c];
        var categoryData = organizedData[categoryName];
        
        // Find variables in this category
        var variableEntries = [];
        for (var key in categoryData) {
          var entry = categoryData[key];
          if (entry.isVariable) {
            variableEntries.push(entry);
            hasVariables = true;
          }
        }
        
        if (variableEntries.length > 0) {
          // Add category header for variables
          var categoryHtml = '<div class="info-category-header">' +
            '<span class="info-category-title">' + getCategoryIcon(categoryName) + ' ' + categoryName + ' (Variables)</span>' +
          '</div>';
          results.push(createHtmlResult(categoryHtml, null, 'info'));
          
          // Display each variable individually (no grouping)
          for (var i = 0; i < variableEntries.length; i++) {
            var entry = variableEntries[i];
            var nodeIds = entry.nodeIds || [];
            
            var entryHtml = '<div class="info-entry">' +
              '<div class="info-entry-content">' +
                '<div class="info-entry-title">' + (entry.variableName || 'Unknown Variable') + 
                '<span class="info-entry-count"> (' + entry.count + ')</span>' +
                '</div>' +
                '<div class="info-entry-subtitle">' +
                  '<span class="info-entry-badge">' + getPropertyDisplay(entry.property) + '</span>' +
                '</div>' +
              '</div>' +
            '</div>';
            results.push(createHtmlResult(entryHtml, nodeIds, 'info'));
          }
        }
      }
      
      // Show message if no styles or variables found
      if (!hasStyles && !hasVariables) {
        results.push(createHtmlResult('<div class="info-text">No styles or variables found in the selection.</div>'));
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
    
    // Hide progress bar after completion
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_COMPLETE'
      });
    }
    
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
  // Show immediate progress when function starts
  if (window._infoPanelHandler) {
    window._infoPanelHandler({
      type: 'PROGRESS_UPDATE',
      operation: 'Initializing chunked processing...',
      processed: 20,
      total: 100,
      percentage: 20
    });
  }
  
  // Add a small delay to ensure the progress update is visible
  setTimeout(function() {
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Setting up node collection...',
        processed: 21,
        total: 100,
        percentage: 21
      });
    }
  }, 50);
  
  var CHUNK_SIZE = 500; // Process 500 nodes at a time
  var MAX_NODES_PER_CHUNK = 200; // Limit per chunk to prevent memory issues
  
  // Show progress for setup phase
  if (window._infoPanelHandler) {
    window._infoPanelHandler({
      type: 'PROGRESS_UPDATE',
      operation: 'Setting up chunked processing...',
      processed: 20,
      total: 100,
      percentage: 20
    });
  }
  
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
      
        // Update progress more frequently for better feedback
        if (nodeCount % 50 === 0 && window._infoPanelHandler) {
          // Estimate progress based on nodes collected vs expected total
          // Use a rough estimate: assume we'll collect around 5000-6000 nodes
          var estimatedTotal = Math.max(nodeCount * 2, 5000);
          var progressPercent = Math.min(Math.round((nodeCount / estimatedTotal) * 30), 30);
          var timestamp = new Date().toISOString().substr(11, 12); // HH:MM:SS.mmm
          console.log('[' + timestamp + '] Progress update: ' + nodeCount + ' nodes, ' + progressPercent + '%');
          
          // Send progress update immediately (no setTimeout to avoid delays)
          if (window._infoPanelHandler) {
            window._infoPanelHandler({
              type: 'PROGRESS_UPDATE',
              operation: 'Collecting nodes... (' + nodeCount + ' found)',
              processed: progressPercent,
              total: 100,
              percentage: progressPercent
            });
          }
        }
    }
    
    // Recurse into children only if we haven't hit the limit
    if (nodeCount < maxTotalNodes && 'children' in node && depth < 10) {
      for (var i = 0; i < node.children.length; i++) {
        collectNodesRecursively(node.children[i], depth + 1);
        if (nodeCount >= maxTotalNodes) break;
        
        // Show progress during traversal even when not collecting nodes
        if (i % 20 === 0 && window._infoPanelHandler) {
          var estimatedTotal = Math.max(nodeCount * 2, 5000);
          var progressPercent = Math.min(Math.round((nodeCount / estimatedTotal) * 30), 30);
          if (progressPercent > 0) {
            window._infoPanelHandler({
              type: 'PROGRESS_UPDATE',
              operation: 'Traversing structure... (' + nodeCount + ' collected)',
              processed: progressPercent,
              total: 100,
              percentage: progressPercent
            });
          }
        }
      }
    }
  }
  
  // Collect all nodes first with progress updates
  var totalSelectionNodes = selection.length;
  var processedSelectionNodes = 0;
  
  // Show initial progress for node collection
  if (window._infoPanelHandler) {
    window._infoPanelHandler({
      type: 'PROGRESS_UPDATE',
      operation: 'Collecting nodes...',
      processed: 0,
      total: 100,
      percentage: 0
    });
  }
  
  // Add a small delay to ensure the progress update is visible before heavy work
  setTimeout(function() {
    if (window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Starting node traversal...',
        processed: 1,
        total: 100,
        percentage: 1
      });
    }
  }, 100);
  
  for (var i = 0; i < selection.length; i++) {
    var nodesBefore = nodeCount;
    collectNodesRecursively(selection[i]);
    processedSelectionNodes++;
    
    
    if (nodeCount >= maxTotalNodes) break;
  }
  
  console.log('Collected ' + nodeCount + ' nodes for processing');
  
  // Show progress after node collection
  if (window._infoPanelHandler) {
    window._infoPanelHandler({
      type: 'PROGRESS_UPDATE',
      operation: 'Node collection complete (' + nodeCount + ' nodes)',
      processed: 30,
      total: 100,
      percentage: 30
    });
  }
  
  // Show progress for chunk processing setup
  if (window._infoPanelHandler) {
    window._infoPanelHandler({
      type: 'PROGRESS_UPDATE',
      operation: 'Preparing chunk processing...',
      processed: 25,
      total: 100,
      percentage: 25
    });
  }
  
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
    
    // Show progress before starting first chunk
    if (chunkIndex === 0 && window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: 'Starting analysis of ' + allNodes.length + ' nodes...',
        processed: 28,
        total: 100,
        percentage: 28
      });
    }
    
    console.log('Processing chunk ' + chunkNumber + '/' + totalChunks + ' (' + chunk.length + ' nodes)');
    
    // Update progress (30-100% range for chunk processing)
    if (window._infoPanelHandler) {
      var chunkProgress = (startIndex / allNodes.length) * 70; // 70% of total progress
      var progressPercent = Math.round(30 + chunkProgress); // Start from 30%
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
  try {
    var categories = {
      'Typography': {},
      'Color': {},
      'Dimensions & Spacing': {},
      'Grid & Effects': {}
    };
    
    // Process variables - group by variable name and property
    usedVariables.forEach(function(varData) {
      try {
        if (varData && varData.variable && varData.property) {
          var category = getCategoryForProperty(varData.property);
          if (categories[category]) {
            var groupKey = (varData.variable.name || 'Unknown Variable') + '::' + varData.property;
            
            if (!categories[category][groupKey]) {
              categories[category][groupKey] = {
                variableName: varData.variable.name || 'Unknown Variable',
                property: varData.property,
                nodeIds: [],
                nodes: [],
                count: 0,
                isVariable: true,
                data: varData
              };
            }
            
            // Merge nodeIds array
            if (varData.nodeIds && Array.isArray(varData.nodeIds)) {
              for (var i = 0; i < varData.nodeIds.length; i++) {
                if (categories[category][groupKey].nodeIds.indexOf(varData.nodeIds[i]) === -1) {
                  categories[category][groupKey].nodeIds.push(varData.nodeIds[i]);
                }
              }
            }
            // Merge nodes array
            if (varData.nodes && Array.isArray(varData.nodes)) {
              for (var i = 0; i < varData.nodes.length; i++) {
                if (categories[category][groupKey].nodes.indexOf(varData.nodes[i]) === -1) {
                  categories[category][groupKey].nodes.push(varData.nodes[i]);
                }
              }
            }
            categories[category][groupKey].count++;
          }
        }
      } catch (e) {
        console.warn('Error processing variable data:', e.message);
      }
    });
    
    // Process styles - group by style name and type
    usedStyles.forEach(function(styleData) {
      try {
        if (styleData && styleData.style && styleData.type) {
          var category = getCategoryForStyleType(styleData.type);
          if (categories[category]) {
            var groupKey = (styleData.style.name || 'Unknown Style') + '::' + styleData.type;
            
            if (!categories[category][groupKey]) {
              categories[category][groupKey] = {
                styleName: styleData.style.name || 'Unknown Style',
                type: styleData.type,
                nodeIds: [],
                nodes: [],
                count: 0,
                isStyle: true,
                data: styleData
              };
            }
            
            // Merge nodeIds array
            if (styleData.nodeIds && Array.isArray(styleData.nodeIds)) {
              for (var i = 0; i < styleData.nodeIds.length; i++) {
                if (categories[category][groupKey].nodeIds.indexOf(styleData.nodeIds[i]) === -1) {
                  categories[category][groupKey].nodeIds.push(styleData.nodeIds[i]);
                }
              }
            }
            // Merge nodes array
            if (styleData.nodes && Array.isArray(styleData.nodes)) {
              for (var i = 0; i < styleData.nodes.length; i++) {
                if (categories[category][groupKey].nodes.indexOf(styleData.nodes[i]) === -1) {
                  categories[category][groupKey].nodes.push(styleData.nodes[i]);
                }
              }
            }
            categories[category][groupKey].count++;
          }
        }
      } catch (e) {
        console.warn('Error processing style data:', e.message);
      }
    });
    
    return categories;
  } catch (e) {
    console.warn('Error in organizeByCategories:', e.message);
    return {
      'Typography': {},
      'Color': {},
      'Dimensions & Spacing': {},
      'Grid & Effects': {}
    };
  }
}

// Property to category mapping (from broken variables script)
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
  'textRangeFills': 'Typography',
  
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

function getCategoryForProperty(property) {
  return propertyCategories[property] || 'Grid & Effects';
}

function getCategoryForStyleType(styleType) {
  if (styleType === 'text') return 'Typography';
  if (styleType === 'fill' || styleType === 'stroke') return 'Color';
  if (styleType === 'effect') return 'Grid & Effects';
  return 'Color'; // Default fallback
}

function getCategoryIcon(categoryName) {
  if (categoryName === 'Typography') return '📝';
  if (categoryName === 'Color') return '🎨';
  if (categoryName === 'Dimensions & Spacing') return '📏';
  if (categoryName === 'Grid & Effects') return '✨';
  return '📊';
}


// ============================================================================
// DISPLAY FUNCTIONS (Simplified - using new grouping approach)
// ============================================================================

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
