// Replace styles
// @DOC_START
// # Replace styles
// Replaces style bindings on nodes by matching style names to patterns (rebinds nodes to a different style; does not rename style definitions).
//
// ## Overview
// Same config as batch-rename: searchIn (optional filter on current style name), searchFor/replaceWith for one replacement, batchReplacement for multiple. Only considers bindings whose current style name matches searchIn (if set). Supports text, paint, and effect styles. selectionOnly: process selection vs whole page.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | searchIn | Optional: only try to rebind when the current style name (partial) matches this; empty = all styles. |
// | searchFor / replaceWith | Single find/replace pair applied to style names. |
// | batchReplacement | Textarea (UI) or array (script): multiple "search, replace" pairs; when non-empty, overrides searchFor/replaceWith. |
// | selectionOnly | If true, process only selected nodes; if false, process whole page. |
// @DOC_END

// Import memory management utilities and library functions
@import { processWithOptimization, cleanupMemory, traverseNodes, getAllStyles } from "@Core Library"
@import { matchPattern, escapeWildcards } from "@Pattern Matching"

// Fallback for escapeWildcards if import fails
if (typeof escapeWildcards === 'undefined') {
  var escapeWildcards = function(pattern) {
    // Escape regex special characters, but preserve * for wildcard matching
    // We'll handle * separately in matchPattern
    return pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  };
}

// Fallback for matchPattern if import fails
if (typeof matchPattern === 'undefined') {
  var matchPattern = function(text, pattern, options) {
    try {
      options = options || {};
      var exact = options.exact || false;
      var caseSensitive = options.caseSensitive || false;
      
      var searchText = caseSensitive ? text : text.toLowerCase();
      var searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
      
      // Exact match
      if (exact) {
        return {
          match: searchText === searchPattern,
          confidence: searchText === searchPattern ? 1.0 : 0.0
        };
      }
      
      // For partial matching, check if pattern is contained in text
      // First, escape special regex characters (but not *)
      var escapedPattern = escapeWildcards(searchPattern);
      // Then replace * with .* for wildcard matching
      var regexPattern = escapedPattern.replace(/\*/g, '.*');
      // For partial matching, we want to find the pattern anywhere in the text
      // So we don't use ^ and $ anchors
      var regex = new RegExp(regexPattern, caseSensitive ? '' : 'i');
      var match = regex.test(searchText);
      
      return {
        match: match,
        confidence: match ? 1.0 : 0.0
      };
    } catch (e) {
      // Fallback to simple string contains check if regex fails
      var searchText = (options && options.caseSensitive) ? text : text.toLowerCase();
      var searchPattern = (options && options.caseSensitive) ? pattern : pattern.toLowerCase();
      var match = searchText.indexOf(searchPattern) !== -1;
      return {
        match: match,
        confidence: match ? 1.0 : 0.0
      };
    }
  };
}

// ========================================
// CONFIGURATION
// ========================================

// @UI_CONFIG_START
// # Replace styles
var searchIn = ""; // @placeholder="color/"
// Optional, only rebind when current style name contains this (e.g. "color/", "Typography/")
//
var searchFor = ""; // @placeholder="500"
var replaceWith = ""; // @placeholder="50"
// ---
var batchReplacement = ""; // @textarea
// Batch: one line per pair, "search, replace" (overrides searchFor/replaceWith when non-empty)
// @UI_CONFIG_END
//
// Script-only batch: var batchReplacement = [["500","50"],["4xl","3xl"]]; or [{ searchPattern: "500", replacePattern: "50" }];
//
var selectionOnly = typeof selectionOnly !== 'undefined' ? selectionOnly : true;

function styleCacheKey(name, type) {
  return (name || '') + "|" + (type || 'TEXT');
}

function parseBatchReplacementString(str) {
  if (!str || typeof str !== 'string') return [];
  var lines = str.split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var comma = line.indexOf(',');
    if (comma === -1) continue;
    var search = line.slice(0, comma).trim();
    var replace = line.slice(comma + 1).trim();
    if (search || replace) out.push([search, replace]);
  }
  return out;
}

function buildReplacementsFromConfig() {
  var batch = typeof batchReplacement !== 'undefined' ? batchReplacement : null;
  if (typeof batch === 'string' && batch.trim()) {
    batch = parseBatchReplacementString(batch);
  }
  if (batch && Array.isArray(batch) && batch.length > 0) {
    var list = [];
    for (var i = 0; i < batch.length; i++) {
      var pair = batch[i];
      var from = Array.isArray(pair) ? pair[0] : (pair.searchPattern != null ? pair.searchPattern : '');
      var to = Array.isArray(pair) ? pair[1] : (pair.replacePattern != null ? pair.replacePattern : '');
      list.push({ from: from, to: to });
    }
    return list;
  }
  var searchForVal = typeof searchFor !== 'undefined' ? searchFor : '';
  var replaceWithVal = typeof replaceWith !== 'undefined' ? replaceWith : '';
  if (searchForVal || replaceWithVal) {
    return [{ from: searchForVal, to: replaceWithVal }];
  }
  return [];
}

// Helper function to collect all nodes using library function
// Uses traverseNodes from @Core Library for optimized traversal
function collectAllNodes(nodes) {
  var allNodes = [];
  var MAX_NODES = 50000; // Hard limit to prevent memory overload
  
  // Use traverseNodes from @Core Library for optimized traversal
  traverseNodes(nodes, function(node) {
    // Check if we've exceeded the limit
    if (allNodes.length >= MAX_NODES) {
      console.log('⚠️ Node collection limit reached (' + MAX_NODES + '). Processing first ' + MAX_NODES + ' nodes only.');
      return 0; // Stop traversal
    }
    
    allNodes.push(node);
    return 0; // Return value doesn't matter for collection
  });
  
  return allNodes;
}

// Main function - can be called directly or imported
function replaceAllStyles(customReplacements, customSelectionOnly) {
  try {
    var replacements = customReplacements || buildReplacementsFromConfig();
    var selectionOnlyVal = customSelectionOnly !== undefined ? customSelectionOnly : selectionOnly;
    
    console.log('🎨 Replace Styles');
    console.log('====================================');
    
    if (replacements.length === 0) {
      console.log('❌ No replacements configured');
      figma.notify('Configure searchFor/replaceWith or batchReplacement first');
      return Promise.resolve({ success: false, replacements: 0, error: 'No replacements configured' });
    }
    
    var nodes = selectionOnlyVal ? figma.currentPage.selection : [figma.currentPage];
    
    if (selectionOnlyVal && nodes.length === 0) {
      console.log('❌ No elements selected');
      figma.notify('Please select elements to process');
      return Promise.resolve({ success: false, replacements: 0, error: 'No elements selected' });
    }
    
    console.log('🔍 Processing ' + nodes.length + ' root nodes');
    console.log('📋 Replacement patterns:');
    
    for (var i = 0; i < replacements.length; i++) {
      var repl = replacements[i];
      console.log('   "' + repl.from + '" → "' + repl.to + '"');
    }
    
    // Build comprehensive style cache and process nodes
    return buildStyleCache().then(function(styleCache) {
      console.log('📋 Found ' + styleCache.size + ' styles (text + color + effect)');
      
      // Cleanup memory after building cache
      cleanupMemory();
      
      // Collect all nodes into a flat array
      var allNodes = collectAllNodes(nodes);
      console.log('📋 Collected ' + allNodes.length + ' nodes to process');
      
      if (allNodes.length === 0) {
        figma.notify('No nodes found to process');
        return { success: true, replacements: 0, error: null };
      }
      
      // Adaptive chunk size based on node count
      var adaptiveChunkSize = 15; // Default
      if (allNodes.length > 10000) {
        adaptiveChunkSize = 5; // Very small chunks for very large files
      } else if (allNodes.length > 5000) {
        adaptiveChunkSize = 8; // Small chunks for large files
      } else if (allNodes.length > 1000) {
        adaptiveChunkSize = 10; // Medium chunks for medium files
      }
      
      console.log('📊 Using chunk size: ' + adaptiveChunkSize + ' (adaptive based on ' + allNodes.length + ' nodes)');
      
      var searchInVal = typeof searchIn !== 'undefined' ? searchIn : '';
      if (searchInVal && String(searchInVal).trim()) {
        console.log('[Replace styles] DEBUG: searchIn "' + String(searchInVal).trim() + '" – only rebind when current style name matches');
      }
      
      return processWithOptimization(allNodes, function(node) {
        var replacementCount = 0;
        var nodeName = node.name || 'Unnamed';
        
        if (node.type === 'TEXT') {
          replacementCount += processTextNode(node, styleCache, nodeName, replacements, searchInVal);
        }
        replacementCount += processOtherStyles(node, styleCache, nodeName, replacements, searchInVal);
        
        return replacementCount;
      }, {
        chunkSize: adaptiveChunkSize,
        showProgress: true,
        operation: 'Replacing styles',
        maxNodes: allNodes.length > 10000 ? 10000 : undefined // Limit processing for very large files
      }).then(function(resolved) {
        var totalReplacements = 0;
        var resultsArray = resolved && resolved.results ? resolved.results : (Array.isArray(resolved) ? resolved : []);
        for (var i = 0; i < resultsArray.length; i++) {
          totalReplacements += resultsArray[i] || 0;
        }
        
        // Final cleanup
        cleanupMemory();
        
        console.log('');
        console.log('📊 Results:');
        console.log('✅ Total replacements: ' + totalReplacements);
        
        if (totalReplacements > 0) {
          figma.notify('✅ Replaced ' + totalReplacements + ' styles');
        } else {
          figma.notify('No style replacements made');
        }
        
        return { success: true, replacements: totalReplacements, error: null };
      });
    });
    
  } catch (error) {
    console.log('❌ Script error: ' + error.message);
    figma.notify('Script error - check console');
    return Promise.resolve({ success: false, replacements: 0, error: error.message });
  }
}

// Build comprehensive style cache for all style types (local + library)
function buildStyleCache() {
  return new Promise(function(resolve, reject) {
    var cache = new Map();
    
    console.log('🔍 Building comprehensive style cache with Team Library API...');
    
    // Add all local styles
    // Use getAllStyles from @Core Library for consistency
    var allLocalStyles = getAllStyles();
    
    for (var i = 0; i < allLocalStyles.length; i++) {
      var style = allLocalStyles[i];
      var styleType = style.type || 'TEXT';
      cache.set(styleCacheKey(style.name, styleType), {
        style: style,
        type: styleType,
        key: null,
        isLibrary: false
      });
    }
    
    console.log('📋 Added ' + allLocalStyles.length + ' local styles');
    
  // 🚀 Access Team Library styles (with performance optimization)
  // Skip Team Library access for very large files to prevent memory issues
  var skipTeamLibrary = false;
  
  // More robust check for Team Library API availability
  try {
    if (!figma.teamLibrary) {
      skipTeamLibrary = true;
    } else {
      // Check if the method exists and is callable
      var method = figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync;
      if (typeof method !== 'function') {
        skipTeamLibrary = true;
      }
    }
  } catch (e) {
    console.log('⚠️ Team Library API check failed: ' + e.message);
    skipTeamLibrary = true;
  }
  
  if (skipTeamLibrary) {
    // Skip Team Library and just use local styles + document scanning
    console.log('📋 Using local styles only (Team Library skipped)');
    scanDocumentForLibraryStyles(cache).then(function() {
      console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
      cleanupMemory();
      resolve(cache);
    });
    return;
  }
  
  try {
    console.log('🌐 Accessing Team Library styles...');
    var startTime = Date.now();
    
    // Get all available library style collections with timeout protection
    // Use try-catch around the actual call to handle any runtime errors
    var libraryPromise;
    try {
      libraryPromise = figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync();
      
      // Verify it's actually a Promise
      if (!libraryPromise || typeof libraryPromise.then !== 'function') {
        throw new Error('getAvailableLibraryStyleCollectionsAsync did not return a Promise');
      }
    } catch (apiError) {
      console.log('⚠️ Team Library API call failed: ' + apiError.message);
      skipTeamLibrary = true;
      scanDocumentForLibraryStyles(cache).then(function() {
        console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
        cleanupMemory();
        resolve(cache);
      });
      return;
    }
    
    // Add timeout to prevent hanging
    var timeoutPromise = new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new Error('Team Library access timeout (10s)'));
      }, 10000); // 10 second timeout
    });
    
    Promise.race([libraryPromise, timeoutPromise]).then(function(libraryCollections) {
      console.log('📚 Found ' + libraryCollections.length + ' library style collections');
      
      // Performance optimization: Limit collections to prevent timeout
      var maxCollections = 10; // Limit to prevent timeout in large files
      if (libraryCollections.length > maxCollections) {
        console.log('⚠️ Large file detected: Processing first ' + maxCollections + ' collections only');
        libraryCollections = libraryCollections.slice(0, maxCollections);
      }
      
      // Process collections sequentially to avoid Promise complexity
      var processedCollections = 0;
      var totalCollections = libraryCollections.length;
      
      function processNextCollection() {
        if (processedCollections >= totalCollections) {
          var endTime = Date.now();
          console.log('⏱️ Team Library access took: ' + (endTime - startTime) + 'ms');
          console.log('📋 Total styles in cache: ' + cache.size + ' (local + library)');
          // Cleanup memory after building cache
          cleanupMemory();
          resolve(cache);
          return;
        }
        
        var libraryCollection = libraryCollections[processedCollections];
        processedCollections++;
        
        figma.teamLibrary.getStylesInLibraryCollectionAsync(libraryCollection.key).then(function(libraryStyles) {
          console.log('📋 Collection "' + libraryCollection.name + '": ' + libraryStyles.length + ' styles');
          
          for (var styleIndex = 0; styleIndex < libraryStyles.length; styleIndex++) {
            var libraryStyle = libraryStyles[styleIndex];
            var libType = libraryStyle.type || 'TEXT';
            cache.set(styleCacheKey(libraryStyle.name, libType), {
              style: null,
              key: libraryStyle.key,
              isLibrary: true,
              name: libraryStyle.name,
              type: libType
            });
          }
          
          // Process next collection
          processNextCollection();
        }).catch(function(e) {
          console.log('⚠️ Could not access collection: ' + libraryCollection.name);
          // Continue with next collection even if this one fails
          processNextCollection();
        });
      }
      
      // Start processing collections
      processNextCollection();
      
    }).catch(function(error) {
      console.log('⚠️ Team Library access failed: ' + error.message);
      console.log('📋 Falling back to document scanning...');
      
      // Fallback: Scan document for currently used library styles
      scanDocumentForLibraryStyles(cache).then(function() {
        console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
        
        // Cleanup memory after building cache
        cleanupMemory();
        
        resolve(cache);
      });
    });
      
    } catch (error) {
      console.log('⚠️ Team Library access failed: ' + error.message);
      console.log('📋 Falling back to document scanning...');
      
      // Fallback: Scan document for currently used library styles
      scanDocumentForLibraryStyles(cache).then(function() {
        console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
        
        // Cleanup memory after building cache
        cleanupMemory();
        
        resolve(cache);
      });
    }
  });
}

// Fallback function to scan document for library styles
// Scans all pages with chunked processing to prevent memory issues
function scanDocumentForLibraryStyles(cache) {
  return new Promise(function(resolve) {
    var allPages = figma.root.children; // All pages in the document
    var totalPages = allPages.length;
    var currentPageIndex = 0;
    var nodesToProcess = [];
    var chunkStartIndex = 0; // Position in current page's nodes array
    var totalNodesScanned = 0; // Total nodes scanned across all pages
    var CHUNK_SIZE = 500; // Process 500 nodes at a time
    var YIELD_DELAY = 10; // 10ms delay between chunks to yield to Figma
    
    console.log('📄 Scanning ' + totalPages + ' pages for styles...');
    
    // Helper function to extract styles from a node
    function extractStylesFromNode(node) {
      if (!node || typeof node !== 'object') {
        return;
      }
      
      // Handle text nodes
      if (node.type === 'TEXT' && typeof node.getStyledTextSegments === 'function') {
        try {
          var segments = node.getStyledTextSegments(['textStyleId']);
          if (Array.isArray(segments)) {
            for (var segIndex = 0; segIndex < segments.length; segIndex++) {
              var segment = segments[segIndex];
              if (segment && segment.textStyleId && segment.textStyleId !== figma.mixed) {
                try {
                  var style = figma.getStyleById(segment.textStyleId);
                  if (style) {
                    var key = styleCacheKey(style.name, 'TEXT');
                    if (!cache.has(key)) {
                      cache.set(key, {
                        style: style,
                        type: 'TEXT',
                        key: style.key || null,
                        isLibrary: style.remote || false
                      });
                    }
                  }
                } catch (e) {
                  // Style might be inaccessible
                }
              }
            }
          }
        } catch (e) {
          // Node might not support text segments
        }
      }
      
      // Check other style types
      var styleProps = ['fillStyleId', 'strokeStyleId', 'effectStyleId'];
      for (var propIndex = 0; propIndex < styleProps.length; propIndex++) {
        var prop = styleProps[propIndex];
        if (prop in node && node[prop] && node[prop] !== figma.mixed) {
          try {
            var style = figma.getStyleById(node[prop]);
            if (style) {
              var scanType = 'PAINT';
              if (prop === 'effectStyleId') scanType = 'EFFECT';
              var key = styleCacheKey(style.name, scanType);
              if (!cache.has(key)) {
                cache.set(key, {
                  style: style,
                  type: scanType,
                  key: style.key || null,
                  isLibrary: style.remote || false
                });
              }
            }
          } catch (e) {
            // Style might be inaccessible
          }
        }
      }
    }
    
    // Collect all nodes from a page
    function collectNodesFromPage(page) {
      nodesToProcess = [];
      try {
        traverseNodes([page], function(node) {
          nodesToProcess.push(node);
          return 0; // Continue traversal
        });
      } catch (e) {
        console.log('⚠️ Error collecting nodes from page: ' + e.message);
      }
    }
    
    // Process nodes in chunks with yields
    function processChunk() {
      var chunkEnd = Math.min(chunkStartIndex + CHUNK_SIZE, nodesToProcess.length);
      
      // Process chunk
      for (var i = chunkStartIndex; i < chunkEnd; i++) {
        extractStylesFromNode(nodesToProcess[i]);
        totalNodesScanned++;
      }
      
      chunkStartIndex = chunkEnd;
      
      // Check if we're done with current page
      if (chunkStartIndex >= nodesToProcess.length) {
        // Move to next page or finish
        currentPageIndex++;
        
        if (currentPageIndex < totalPages) {
          // Collect nodes from next page
          collectNodesFromPage(allPages[currentPageIndex]);
          chunkStartIndex = 0;
          
          console.log('📄 Scanning page ' + (currentPageIndex + 1) + '/' + totalPages + ' (' + allPages[currentPageIndex].name + ')...');
          
          // Process next page
          setTimeout(processChunk, YIELD_DELAY);
        } else {
          // All pages processed
          console.log('✅ Scanned ' + totalNodesScanned + ' nodes across ' + totalPages + ' pages');
          console.log('📋 Found ' + cache.size + ' unique styles');
          cleanupMemory();
          resolve();
        }
      } else {
        // Continue processing current chunk
        setTimeout(processChunk, YIELD_DELAY);
      }
    }
    
    // Start processing first page
    if (totalPages > 0) {
      collectNodesFromPage(allPages[0]);
      console.log('📄 Scanning page 1/' + totalPages + ' (' + allPages[0].name + ')...');
      setTimeout(processChunk, YIELD_DELAY);
    } else {
      console.log('⚠️ No pages found in document');
      resolve();
    }
  });
}

function processTextNode(node, styleCache, nodeName, replacements, searchInVal) {
  var totalReplacements = 0;
  
  try {
    var segments = node.getStyledTextSegments(['textStyleId']);
    
    for (var segIndex = 0; segIndex < segments.length; segIndex++) {
      var segment = segments[segIndex];
      if (segment.textStyleId && segment.textStyleId !== figma.mixed) {
        try {
          var currentStyle = figma.getStyleById(segment.textStyleId);
          if (currentStyle) {
            var newStyle = findReplacementStyle(currentStyle, styleCache, 'TEXT', replacements, searchInVal);
            
            // Handle both synchronous and Promise returns
            if (newStyle && typeof newStyle.then === 'function') {
              // It's a Promise (library style import) - handle synchronously by waiting
              // Note: This will block, but we're processing in chunks so it's acceptable
              try {
                // For now, skip async imports during chunked processing to avoid blocking
                // They can be handled in a second pass if needed
                console.log('⚠️ Skipping library style import for "' + currentStyle.name + '" (async import deferred)');
              } catch (error) {
                console.log('❌ Failed to import style: ' + error.message);
              }
            } else if (newStyle) {
              // It's a synchronous result (local style)
              node.setRangeTextStyleId(segment.start, segment.end, newStyle.id);
              totalReplacements++;
              console.log('✅ Text: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
            }
          }
        } catch (e) {
          console.log('⚠️ Could not access text style: ' + e.message);
        }
      }
    }
  } catch (e) {
    console.log('⚠️ Could not process text segments: ' + e.message);
  }
  
  return totalReplacements;
}

function processOtherStyles(node, styleCache, nodeName, replacements, searchInVal) {
  var totalReplacements = 0;
  
  if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
    try {
      var currentStyle = figma.getStyleById(node.fillStyleId);
      if (currentStyle) {
        var newStyle = findReplacementStyle(currentStyle, styleCache, 'PAINT', replacements, searchInVal);
        
        // Handle both synchronous and Promise returns
        if (newStyle && typeof newStyle.then === 'function') {
          // It's a Promise (library style import) - skip during chunked processing
          console.log('⚠️ Skipping library style import for "' + currentStyle.name + '" (async import deferred)');
        } else if (newStyle) {
          // It's a synchronous result (local style)
          node.fillStyleId = newStyle.id;
          totalReplacements++;
          console.log('✅ Fill: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
        }
      }
    } catch (e) {
      console.log('⚠️ Could not access fill style: ' + e.message);
    }
  }
  
  if ('strokeStyleId' in node && node.strokeStyleId && node.strokeStyleId !== figma.mixed) {
    try {
      var currentStyle = figma.getStyleById(node.strokeStyleId);
      if (currentStyle) {
        var newStyle = findReplacementStyle(currentStyle, styleCache, 'PAINT', replacements, searchInVal);
        
        // Handle both synchronous and Promise returns
        if (newStyle && typeof newStyle.then === 'function') {
          // It's a Promise (library style import) - skip during chunked processing
          console.log('⚠️ Skipping library style import for "' + currentStyle.name + '" (async import deferred)');
        } else if (newStyle) {
          // It's a synchronous result (local style)
          node.strokeStyleId = newStyle.id;
          totalReplacements++;
          console.log('✅ Stroke: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
        }
      }
    } catch (e) {
      console.log('⚠️ Could not access stroke style: ' + e.message);
    }
  }
  
  if ('effectStyleId' in node && node.effectStyleId && node.effectStyleId !== figma.mixed) {
    try {
      var currentStyle = figma.getStyleById(node.effectStyleId);
      if (currentStyle) {
        var newStyle = findReplacementStyle(currentStyle, styleCache, 'EFFECT', replacements, searchInVal);
        
        // Handle both synchronous and Promise returns
        if (newStyle && typeof newStyle.then === 'function') {
          // It's a Promise (library style import) - skip during chunked processing
          console.log('⚠️ Skipping library style import for "' + currentStyle.name + '" (async import deferred)');
        } else if (newStyle) {
          // It's a synchronous result (local style)
          node.effectStyleId = newStyle.id;
          totalReplacements++;
          console.log('✅ Effect: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
        }
      }
    } catch (e) {
      console.log('⚠️ Could not access effect style: ' + e.message);
    }
  }
  
  return totalReplacements;
}

function findReplacementStyle(currentStyle, styleCache, expectedType, replacements, searchInVal) {
  if (searchInVal != null && String(searchInVal).trim() !== '') {
    var scopeMatch = matchPattern(currentStyle.name, String(searchInVal).trim(), { exact: false, caseSensitive: false });
    if (!scopeMatch || !scopeMatch.match) {
      console.log('[Replace styles] DEBUG: skip "' + currentStyle.name + '" – does not match searchIn');
      return null;
    }
  }
  
  console.log('🔍 Checking style: "' + currentStyle.name + '" (type: ' + expectedType + ')');
  
  for (var replIndex = 0; replIndex < replacements.length; replIndex++) {
    var replacement = replacements[replIndex];
    var findPattern = replacement.from;
    
    console.log('🔍 Testing pattern: "' + findPattern + '" → "' + replacement.to + '"');
    
    var patternMatch = matchPattern(currentStyle.name, findPattern, {
      exact: false,
      caseSensitive: false
    });
    
    if (patternMatch && patternMatch.match) {
      var newStyleName = currentStyle.name;
      var patternRegex = new RegExp(findPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'gi');
      newStyleName = newStyleName.replace(patternRegex, replacement.to);
      
      if (newStyleName !== currentStyle.name) {
        console.log('🔍 Looking for replacement: "' + currentStyle.name + '" → "' + newStyleName + '"');
        
        var cacheKey = styleCacheKey(newStyleName, expectedType);
        var styleInfo = styleCache.get(cacheKey);
        if (styleInfo && styleInfo.type === expectedType) {
          if (styleInfo.style) {
            console.log('✅ Found replacement: "' + newStyleName + '"');
            return styleInfo.style;
          }
          
          if (styleInfo.isLibrary && styleInfo.key) {
            console.log('📥 Importing library style: "' + newStyleName + '"');
            try {
              var importedStyle = figma.importStyleByKeyAsync(styleInfo.key);
              return importedStyle.then(function(importedStyle) {
                console.log('✅ Successfully imported: "' + importedStyle.name + '"');
                styleCache.set(styleCacheKey(importedStyle.name, expectedType), {
                  style: importedStyle,
                  type: expectedType,
                  key: styleInfo.key,
                  isLibrary: true
                });
                return importedStyle;
              }).catch(function(importError) {
                console.log('❌ Failed to import style: ' + importError.message);
                return null;
              });
            } catch (importError) {
              console.log('❌ Failed to import style: ' + importError.message);
            }
          }
        } else {
          console.log('❌ Replacement style not found: "' + newStyleName + '" (type: ' + expectedType + ')');
        }
      }
    }
  }
  
  return null;
}

// Run the script (only when not imported)
// Check if this is being imported by looking for import markers
var isImported = false;
try {
  // This will be true if the script is being imported
  isImported = typeof window !== 'undefined' && window._importedScripts && window._importedScripts.includes('Comprehensive Style Replacement');
} catch (e) {
  isImported = false;
}

if (!isImported) {
  replaceAllStyles();
}