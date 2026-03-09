// @Core Library
// @DOC_START
// # @Core Library
// Reusable Figma operations and utilities for nodes, styles, patterns, memory, and colors.
//
// ## Overview
// Import functions into your scripts for node traversal, style listing/replacement, pattern-based rename, progress/memory handling, and color conversion. No configuration; use via @import.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Node | traverseNodes, getTargetNodes, findByName, findAllByName, findAllByType, clone, setupAutoLayout, applyNamingConvention, createComponentFromSelection |
// | Styles | getAllStyles, buildStyleCache, replaceStylesByPattern, getStyleByName, replaceByPattern |
// | Memory | processWithOptimization, estimateNodeCount, showProgress, cleanupMemory |
// | Colors | hexToRgb, rgbToHex |
// | Utilities | log, timeOperation, unique, analyzeSelection |
// @DOC_END

// === NODE UTILITIES ===
function findByName(name, parent) {
  if (!parent) parent = figma.currentPage;
  return parent.findOne(function(node) { return node.name === name; });
}

function findAllByName(name, parent) {
  if (!parent) parent = figma.currentPage;
  return parent.findAll(function(node) { return node.name === name; });
}

function findAllByType(type, parent) {
  if (!parent) parent = figma.currentPage;
  return parent.findAll(function(node) { return node.type === type; });
}

function clone(node, parent) {
  if (!parent) parent = node.parent;
  var cloned = node.clone();
  parent.appendChild(cloned);
  return cloned;
}

// === STYLE OPERATIONS ===
// Async for documentAccess: dynamic-page (Figma requires *Async APIs)
function getAllStyles() {
  return Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync()
  ]).then(function(results) {
    return results[0].concat(results[1]).concat(results[2]).concat(results[3]);
  });
}

function getStyleByName(name, type) {
  if (type === 'TEXT') {
    return figma.getLocalTextStylesAsync().then(function(styles) {
      return styles.find(function(style) { return style.name === name; });
    });
  }
  return figma.getLocalPaintStylesAsync().then(function(styles) {
    return styles.find(function(style) { return style.name === name; });
  });
}

function buildStyleCache() {
  return getAllStyles().then(function(local) {
    var cache = {
      local: local,
      library: []
    };
    try {
      cache.library = figma.getAvailableFonts ? [] : [];
    } catch (e) {}
    return cache;
  });
}

function replaceStylesByPattern(searchPattern, replacePattern) {
  return getAllStyles().then(function(styles) {
    var count = 0;
    styles.forEach(function(style) {
      var newName = style.name.replace(new RegExp(searchPattern, 'g'), replacePattern);
      if (newName !== style.name) {
        console.log('Renaming: "' + style.name + '" -> "' + newName + '"');
        style.name = newName;
        count++;
      }
    });
    return count;
  });
}


// === PATTERN MATCHING ===
function replaceByPattern(items, patterns, getName, setName) {
  var totalReplacements = 0;
  
  items.forEach(function(item) {
    var currentName = getName(item);
    var newName = currentName;
    
    patterns.forEach(function(pattern) {
      var searchPatterns = Array.isArray(pattern.from) ? pattern.from : [pattern.from];
      
      searchPatterns.forEach(function(searchPattern) {
        if (Array.isArray(searchPattern)) {
          searchPattern.forEach(function(subPattern) {
            newName = newName.replace(new RegExp(subPattern, 'g'), pattern.to);
          });
        } else {
          newName = newName.replace(new RegExp(searchPattern, 'g'), pattern.to);
        }
      });
    });
    
    if (newName !== currentName) {
      console.log('Replacing: "' + currentName + '" -> "' + newName + '"');
      setName(item, newName);
      totalReplacements++;
    }
  });
  
  return totalReplacements;
}

// === NODE TRAVERSAL ===
// Iterative traversal to prevent stack overflow on deeply nested structures
// Options: { maxNodes: N } - stop after collecting/processing N nodes
function traverseNodes(nodes, processor, options) {
  options = options || {};
  var maxNodes = options.maxNodes;
  var processed = new Set();
  var count = 0;
  var visited = 0;
  var stack = [];
  var i;
  var STOP = {};
  
  function pushChildren(node) {
    if (!('children' in node)) return;
    var children = node.children;
    for (i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }
  
  if (Array.isArray(nodes)) {
    for (i = nodes.length - 1; i >= 0; i--) {
      stack.push(nodes[i]);
    }
  } else {
    stack.push(nodes);
  }
  
  while (stack.length > 0) {
    if (maxNodes != null && visited >= maxNodes) break;
    
    var node = stack.pop();
    if (!node || processed.has(node.id)) continue;
    processed.add(node.id);
    visited++;
    
    var result = processor(node);
    if (result === STOP) break;
    count += (result && result !== true ? result : 0);
    
    if (maxNodes == null || visited < maxNodes) {
      pushChildren(node);
    }
  }
  
  return count;
}

function getTargetNodes() {
  var selection = figma.currentPage.selection;
  return selection.length > 0 ? selection : [figma.currentPage];
}

// === COLOR UTILITIES ===
function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : null;
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (Math.round(r * 255) << 16) + (Math.round(g * 255) << 8) + Math.round(b * 255)).toString(16).slice(1);
}

// === UTILITIES ===
function log(category, message) {
  console.log('[' + category + '] ' + message);
}

function timeOperation(name, operation) {
  var start = Date.now();
  var result = operation();
  var end = Date.now();
  console.log('⏱️ ' + name + ': ' + (end - start) + 'ms');
  return result;
}

function unique(array) {
  return array.filter(function(item, index) {
    return array.indexOf(item) === index;
  });
}

// === GENERIC UTILITIES ===

// Generate a scale of values based on a base unit and multipliers
function generateScale(baseUnit, multipliers, names) {
  baseUnit = baseUnit || 8;
  multipliers = multipliers || [0.5, 1, 2, 3, 4, 6];
  names = names || ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'];
  
  var scale = {};
  for (var i = 0; i < Math.min(multipliers.length, names.length); i++) {
    scale[names[i]] = baseUnit * multipliers[i];
  }
  return scale;
}

// Calculate column width for grid systems
function calculateColumnWidth(viewportConfig) {
  var availableWidth = viewportConfig.containerWidth - (viewportConfig.padding * 2);
  var totalGaps = (viewportConfig.columns - 1) * viewportConfig.gap;
  return (availableWidth - totalGaps) / viewportConfig.columns;
}

// === NODE OPERATIONS ===

// Smart auto-layout setup with common patterns
function setupAutoLayout(node, direction, spacing, padding) {
  if (!('layoutMode' in node)) {
    console.log('Node does not support auto-layout: ' + node.name);
    return false;
  }
  
  node.layoutMode = direction || 'HORIZONTAL';
  node.itemSpacing = spacing || 16;
  
  if (padding) {
    if (typeof padding === 'number') {
      node.paddingTop = node.paddingRight = node.paddingBottom = node.paddingLeft = padding;
    } else {
      node.paddingTop = padding.top || 0;
      node.paddingRight = padding.right || 0;
      node.paddingBottom = padding.bottom || 0;
      node.paddingLeft = padding.left || 0;
    }
  }
  
  console.log('Applied auto-layout to: ' + node.name);
  return true;
}

// Batch apply consistent naming convention
function applyNamingConvention(nodes, prefix, separator) {
  separator = separator || '/';
  var renamed = 0;
  
  nodes.forEach(function(node, index) {
    var oldName = node.name;
    var newName = prefix + separator + (index + 1).toString().padStart(2, '0');
    
    if (oldName !== newName) {
      node.name = newName;
      console.log('Renamed: "' + oldName + '" → "' + newName + '"');
      renamed++;
    }
  });
  
  return renamed;
}

// Quick component creation workflow
function createComponentFromSelection(name, description) {
  var selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify('Please select elements to convert to component');
    return null;
  }
  
  if (selection.length === 1 && selection[0].type === 'FRAME') {
    // Convert frame to component
    var component = figma.createComponent();
    var frame = selection[0];
    
    // Copy frame properties
    component.name = name || frame.name + ' Component';
    component.description = description || 'Auto-generated component';
    component.resize(frame.width, frame.height);
    component.x = frame.x;
    component.y = frame.y;
    
    // Move children
    while (frame.children.length > 0) {
      component.appendChild(frame.children[0]);
    }
    
    // Remove original frame
    frame.remove();
    
    console.log('Created component: ' + component.name);
    figma.notify('Component created: ' + component.name);
    return component;
  } else {
    figma.notify('Please select a single frame to convert to component');
    return null;
  }
}

// === ANALYSIS UTILITIES ===

// Analyze selection and provide insights
function analyzeSelection(nodes) {
  var analysis = {
    totalNodes: 0,
    nodeTypes: {},
    hasStyles: 0,
    hasVariables: 0,
    avgSize: { width: 0, height: 0 },
    bounds: null
  };
  
  if (!nodes || nodes.length === 0) {
    return analysis;
  }
  
  var totalWidth = 0, totalHeight = 0;
  var sizedNodes = 0;
  
  traverseNodes(nodes, function(node) {
    analysis.totalNodes++;
    
    // Count by type
    analysis.nodeTypes[node.type] = (analysis.nodeTypes[node.type] || 0) + 1;
    
    // Check for styles
    if (('textStyleId' in node && node.textStyleId) ||
        ('fillStyleId' in node && node.fillStyleId) ||
        ('strokeStyleId' in node && node.strokeStyleId) ||
        ('effectStyleId' in node && node.effectStyleId)) {
      analysis.hasStyles++;
    }
    
    // Check for variables (simplified check)
    if ('boundVariables' in node && Object.keys(node.boundVariables || {}).length > 0) {
      analysis.hasVariables++;
    }
    
    // Calculate average size
    if ('width' in node && 'height' in node) {
      totalWidth += node.width;
      totalHeight += node.height;
      sizedNodes++;
    }
    
    return 1;
  });
  
  if (sizedNodes > 0) {
    analysis.avgSize.width = Math.round(totalWidth / sizedNodes);
    analysis.avgSize.height = Math.round(totalHeight / sizedNodes);
  }
  
  // Calculate bounds
  if (nodes.length > 0 && 'x' in nodes[0]) {
    analysis.bounds = bounds(nodes);
  }
  
  return analysis;
}

// === MEMORY OPTIMIZATION SYSTEM ===

/**
 * Estimate node count in selection without full traversal
 * @param {Array} selection - Figma selection
 * @returns {Object} - Estimation with counts and warnings
 */
function estimateNodeCount(selection) {
  var estimation = {
    direct: selection.length,
    estimated: selection.length,
    warning: null,
    critical: false
  };
  
  // Quick estimation based on selection types
  var frameCount = 0;
  var componentCount = 0;
  var instanceCount = 0;
  
  selection.forEach(function(node) {
    if (node.type === 'FRAME' || node.type === 'COMPONENT') {
      frameCount++;
      // Estimate children based on type
      if (node.type === 'FRAME') {
        estimation.estimated += Math.min(node.children.length * 2, 100);
      } else if (node.type === 'COMPONENT') {
        estimation.estimated += Math.min(node.children.length * 3, 200);
      }
    } else if (node.type === 'INSTANCE') {
      instanceCount++;
      estimation.estimated += 50; // Instances often have many children
    } else if (node.type === 'COMPONENT_SET') {
      estimation.estimated += 100; // Component sets are complex
    }
  });
  
  // Add warning if estimation is high (using hardcoded values to avoid dependency)
  if (estimation.estimated > 5000) {
    estimation.warning = 'Selection contains ' + estimation.estimated + '+ nodes. This may cause performance issues. Consider breaking into smaller selections.';
    estimation.critical = true;
  } else if (estimation.estimated > 1000) {
    estimation.warning = 'Large selection detected (' + estimation.estimated + '+ nodes). Processing may take longer.';
    estimation.critical = false;
  }
  
  return estimation;
}

/**
 * Show progress indicator in UI
 * @param {string} operation - Current operation description
 * @param {number} processed - Number of items processed
 * @param {number} total - Total number of items
 */
function showProgress(operation, processed, total) {
  var percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
  
  // Initialize progress tracking if not exists
  if (!window._progressStartTime) {
    window._progressStartTime = Date.now();
  }
  
  // Send progress update to UI via message passing
  try {
    var message = operation + ': ' + processed + '/' + total + ' (' + percentage + '%)';
    
    // Try to send to UI via the info panel handler if available
    if (typeof window !== 'undefined' && window._infoPanelHandler) {
      window._infoPanelHandler({
        type: 'PROGRESS_UPDATE',
        operation: operation,
        processed: processed,
        total: total,
        percentage: percentage
      });
    } else {
      // Fallback to Figma notification for progress updates
      figma.notify(message, { timeout: 1000 });
    }
  } catch (e) {
    console.log('Progress: ' + operation + ': ' + processed + '/' + total + ' (' + percentage + '%)');
  }
}

/**
 * Clean up memory by clearing large objects and arrays
 */
function cleanupMemory() {
  // Clear any global caches or large objects
  if (typeof global !== 'undefined') {
    // Clear global caches if they exist
    if (global.styleCache) {
      global.styleCache = null;
    }
    if (global.variableCache) {
      global.variableCache = null;
    }
  }
  
  // Clear window-level caches
  if (typeof window !== 'undefined') {
    if (window._styleCache) {
      window._styleCache = null;
    }
    if (window._variableCache) {
      window._variableCache = null;
    }
  }
  
  // Force garbage collection if available
  if (typeof gc === 'function') {
    try {
      gc();
    } catch (e) {
      // Ignore if gc is not available
    }
  }
}

/**
 * Process nodes with memory optimization, chunking, and progress tracking
 * @param {Array} nodes - Nodes to process
 * @param {Function} processor - Function to process each node
 * @param {Object} options - Processing options
 * @returns {Promise} - Promise that resolves with results
 */
function processWithOptimization(nodes, processor, options) {
  options = options || {};
  
  // Set defaults (using hardcoded values to avoid dependency on MEMORY_CONFIG)
  var chunkSize = options.chunkSize || 15; // Further reduced chunk size for better memory management
  var showProgressUpdates = options.showProgress !== false;
  var operationName = options.operation || 'Processing nodes';
  var nodeFilter = options.nodeFilter || null;
  var maxNodes = options.maxNodes; // Caller sets limit when needed

  return new Promise(function(resolve, reject) {
    // Initialize progress state locally
    var localProgressState = {
      isProcessing: true,
      total: nodes.length,
      processed: 0,
      startTime: Date.now(),
      currentOperation: operationName
    };
    
    var results = [];
    var index = 0;
    var lastCleanup = 0;
    var errorCount = 0;
    var maxErrors = 50; // Stop if too many errors occur
    
    // Check for early warning
    var estimation = estimateNodeCount(nodes);
    if (estimation.warning && showProgressUpdates) {
      showProgress('Warning: ' + estimation.warning, 0, nodes.length);
    }
    
    function processChunk() {
      try {
        // Adaptive timeout based on dataset size
        var timeoutMs = 15000; // Reduced default timeout
        if (nodes.length > 1000) {
          timeoutMs = 45000; // 45 seconds for large datasets
        } else if (nodes.length > 500) {
          timeoutMs = 30000; // 30 seconds for medium datasets
        }
        
        // Check if we've exceeded time limit
        if (Date.now() - localProgressState.startTime > timeoutMs) {
          localProgressState.isProcessing = false;
          console.warn('Processing timeout exceeded: ' + Math.round(timeoutMs / 1000) + 's');
          resolve({
            results: results,
            partial: true,
            processed: localProgressState.processed,
            total: nodes.length,
            message: 'Processing timeout exceeded (' + Math.round(timeoutMs / 1000) + 's)'
          });
          return;
        }
        
        // Check if we've exceeded node limit
        if (maxNodes && localProgressState.processed >= maxNodes) {
          localProgressState.isProcessing = false;
          resolve({
            results: results,
            partial: true,
            processed: localProgressState.processed,
            total: nodes.length,
            message: 'Processed ' + maxNodes + ' nodes (limit reached)'
          });
          return;
        }
        
        // Check if too many errors occurred
        if (errorCount >= maxErrors) {
          localProgressState.isProcessing = false;
          console.warn('Too many errors occurred: ' + errorCount);
          resolve({
            results: results,
            partial: true,
            processed: localProgressState.processed,
            total: nodes.length,
            message: 'Processing stopped due to errors (' + errorCount + ' errors)'
          });
          return;
        }
        
        // Process chunk (smaller chunks = less concurrent async work = lower memory)
        var chunkStartTime = Date.now();
        var chunk = nodes.slice(index, Math.min(index + chunkSize, nodes.length));
        var promises = chunk.map(function(node) {
          if (nodeFilter && !nodeFilter(node)) {
            return Promise.resolve(undefined);
          }
          try {
            var result = processor(node);
            return Promise.resolve(result);
          } catch (e) {
            errorCount++;
            console.warn('Error processing node ' + node.id + ' (error #' + errorCount + '):', e.message);
            if (e.message && e.message.includes('Aborted')) {
              return Promise.reject(e);
            }
            return Promise.resolve(undefined);
          }
        });
        
        Promise.all(promises).then(function(resolvedChunkResults) {
          var resultsToAdd = [];
          for (var r = 0; r < resolvedChunkResults.length; r++) {
            var result = resolvedChunkResults[r];
            if (result !== undefined && result !== null) {
              if (Array.isArray(result)) {
                resultsToAdd = resultsToAdd.concat(result);
              } else {
                resultsToAdd.push(result);
              }
            }
          }
          
          var chunkProcessingTime = Date.now() - chunkStartTime;
          
          // Adaptive chunk sizing: prefer smaller chunks to reduce memory
          if (chunkProcessingTime > 2000) {
            chunkSize = Math.max(2, Math.floor(chunkSize * 0.5));
          } else if (chunkProcessingTime > 1000) {
            chunkSize = Math.max(3, Math.floor(chunkSize * 0.7));
          } else if (chunkProcessingTime < 50 && chunkSize < 12) {
            chunkSize = Math.min(12, Math.floor(chunkSize * 1.1));
          }
          
          results = results.concat(resultsToAdd);
          localProgressState.processed = Math.min(index + chunk.length, nodes.length);
          
          if (showProgressUpdates && localProgressState.processed % 3 === 0) {
            showProgress(operationName, localProgressState.processed, nodes.length);
          }
          
          if (localProgressState.processed - lastCleanup > 15) {
            cleanupMemory();
            lastCleanup = localProgressState.processed;
            if (typeof gc !== 'undefined') {
              try { gc(); } catch (e) { }
            }
          }
          
          index += chunkSize;
          
          if (index < nodes.length) {
            setTimeout(processChunk, 1);
          } else {
            localProgressState.isProcessing = false;
            localProgressState.processed = nodes.length;
            cleanupMemory();
            
            if (showProgressUpdates) {
              showProgress(operationName, nodes.length, nodes.length);
              setTimeout(function() {
                try {
                  if (typeof window !== 'undefined' && window._infoPanelHandler) {
                    window._infoPanelHandler({
                      type: 'PROGRESS_COMPLETE',
                      operation: operationName,
                      processed: nodes.length,
                      total: nodes.length,
                      message: options.partial ? 
                        'Processed ' + nodes.length + ' nodes (limit reached)' : 
                        'Processed ' + nodes.length + ' nodes successfully'
                    });
                  } else {
                    figma.notify('Processing complete: ' + nodes.length + ' nodes processed');
                  }
                } catch (e) {
                  console.log('Progress complete: ' + nodes.length + ' nodes processed');
                }
              }, 100);
            }
            
            resolve({
              results: results,
              partial: options.partial || false,
              processed: localProgressState.processed,
              total: nodes.length,
              message: options.partial ? 
                'Processed ' + nodes.length + ' nodes (limit reached)' : 
                'Processed ' + nodes.length + ' nodes successfully'
            });
          }
        }).catch(function(e) {
          reject(e);
        });
      } catch (e) {
        localProgressState.isProcessing = false;
        console.error('Critical error in processChunk:', e.message);
        reject(e);
      }
    }
    
    // Start processing
    processChunk();
  });
}

/**
 * Enhanced traverseNodes with memory optimization
 * @param {Array} nodes - Nodes to traverse
 * @param {Function} processor - Function to process each node
 * @param {Object} options - Processing options
 * @returns {Promise} - Promise that resolves with results
 */
function traverseNodesOptimized(nodes, processor, options) {
  options = options || {};
  
  // Get maxNodes limit early to prevent memory issues
  var maxNodes = options.maxNodes || 15000; // Increased limit for larger selections
  
  // Collect nodes with early termination if limit reached
  var allNodes = [];
  var processed = new Set();
  var nodeCount = 0;
  var startTime = Date.now();
  var maxCollectionTime = 30000; // 30 seconds max for node collection
  
  function collectNodes(node, depth) {
    depth = depth || 0;
    
    // Check for timeout during collection
    if (Date.now() - startTime > maxCollectionTime) {
      console.warn('Node collection timeout reached, stopping at ' + nodeCount + ' nodes');
      return;
    }
    
    // Skip if already processed or depth limit reached
    if (processed.has(node.id) || depth > 15) return; // Reduced depth limit
    processed.add(node.id);
    
    // Apply node filter if provided
    if (!options.nodeFilter || options.nodeFilter(node)) {
      allNodes.push(node);
      nodeCount++;
      
      // Early termination if we've reached the limit
      if (nodeCount >= maxNodes) {
        console.log('Node limit reached: ' + nodeCount + '/' + maxNodes);
        return;
      }
    }
    
    // Recurse into children only if we haven't hit the limit
    if (nodeCount < maxNodes && 'children' in node && depth < 15) {
      for (var i = 0; i < node.children.length; i++) {
        collectNodes(node.children[i], depth + 1);
        // Check limit again after each child
        if (nodeCount >= maxNodes) {
          return;
        }
      }
    }
  }
  
  try {
    if (Array.isArray(nodes)) {
      for (var i = 0; i < nodes.length; i++) {
        collectNodes(nodes[i]);
        if (nodeCount >= maxNodes) break;
      }
    } else {
      collectNodes(nodes);
    }
  } catch (e) {
    console.warn('Error during node collection:', e.message);
    // Continue with what we have collected so far
  }
  
  console.log('Node collection completed: ' + nodeCount + ' nodes collected');
  
  // Mark as partial if we hit the limit
  if (nodeCount >= maxNodes) {
    options.partial = true;
  }
  
  // Clean up memory after collection
  cleanupMemory();
  
  // Process with optimization
  return processWithOptimization(allNodes, processor, options);
}

// ============================================================================
// STYLE ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Collect styles from a node and add to the usedStyles Map (async for documentAccess: dynamic-page)
 */
async function collectNodeStyles(node, usedStyles) {
  try {
    if (!node) return;
    
    // Text styles
    if (node.textStyleId && node.textStyleId !== figma.mixed) {
      try {
        var textStyle = await figma.getStyleByIdAsync(node.textStyleId);
        if (textStyle && textStyle.name) {
          var key = textStyle.name + '::text';
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
        var fillStyle = await figma.getStyleByIdAsync(node.fillStyleId);
        if (fillStyle && fillStyle.name) {
          var key = fillStyle.name + '::fill';
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
        var strokeStyle = await figma.getStyleByIdAsync(node.strokeStyleId);
        if (strokeStyle && strokeStyle.name) {
          var key = strokeStyle.name + '::stroke';
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
        var effectStyle = await figma.getStyleByIdAsync(node.effectStyleId);
        if (effectStyle && effectStyle.name) {
          var key = effectStyle.name + '::effect';
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
    
    // Grid styles
    if (node.layoutGrids && node.layoutGrids.length > 0) {
      for (var i = 0; i < node.layoutGrids.length; i++) {
        try {
          var grid = node.layoutGrids[i];
          if (grid.pattern === 'COLUMNS' || grid.pattern === 'ROWS') {
            var key = 'Layout Grid::' + grid.pattern.toLowerCase();
            if (!usedStyles.has(key)) {
              usedStyles.set(key, {
                style: { name: 'Layout Grid', type: 'GRID' },
                type: 'grid',
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
          console.warn('Error processing grid style for node ' + node.id + ':', e.message);
        }
      }
    }
  } catch (e) {
    console.warn('Error collecting styles from node ' + (node ? node.id : 'unknown') + ':', e.message);
  }
}

/**
 * Categorize a style by its name and type
 */
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
  
  // Grid
  if (styleType === 'grid' || name.includes('grid') || name.includes('column') || name.includes('row')) {
    return 'grid';
  }
  
  // Default to color for unknown
  return 'color';
}

/**
 * Create a style result for display
 */
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
    
    if (nodes.length > 0) {
      html.push('    <div class="info-entry-badge">' + nodes.length + ' node' + (nodes.length !== 1 ? 's' : '') + '</div>');
    }
    
    html.push('  </div>');
    html.push('</div>');
    
    return createHtmlResult(html.join(''));
  } catch (e) {
    console.warn('Error creating style result:', e.message);
    return createHtmlResult('<div class="error-text">❌ Error displaying style</div>');
  }
}

/**
 * Create a visual preview for a style
 */
function createStylePreview(style, type) {
  try {
    if (!style || !type) return null;
    
    var preview = '';
    
    // Fill styles
    if (type === 'fill' && style.paints && style.paints.length > 0) {
      var paint = style.paints[0];
      if (paint.type === 'SOLID') {
        var color = paint.color;
        var hex = rgbToHex(color.r, color.g, color.b);
        preview = '<div class="color-preview" style="background-color: ' + hex + '; width: 20px; height: 20px; border-radius: 3px; display: inline-block; margin-right: 8px;"></div>';
      }
    }
    
    // Text styles
    if (type === 'text') {
      preview = '<span class="typography-preview" style="font-size: 12px;">Aa</span>';
    }
    
    return preview;
  } catch (e) {
    console.warn('Error creating style preview:', e.message);
    return null;
  }
}

console.log('📚 @Core Library loaded - ' + 
  'getAllStyles, traverseNodes, findByName, replaceByPattern, ' +
  'hexToRgb, generateScale, setupAutoLayout, analyzeSelection, ' +
  'processWithOptimization, estimateNodeCount, showProgress, ' +
  'collectNodeStyles, categorizeStyle, createStyleResult, createStylePreview ' +
  'and more available for import');
