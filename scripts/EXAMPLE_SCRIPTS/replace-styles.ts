// Replace Styles
// @DOC_START
// # Replace Styles
// Replaces style bindings on nodes by matching style names to patterns.
//
// ## Overview
// Uses STYLE_REPLACEMENTS (or overrides when imported): each entry has "from" and "to" for partial matching on style names. Scans selection, finds matching styles, and rebinds nodes to the replacement style. Supports text, paint, and effect styles. Can be run standalone or imported.
//
// ## Config options
// - **STYLE_REPLACEMENTS** – Array of { from: string, to: string }. "from" is matched partially in style names (e.g. "500" matches "Primary/500"). Use multiple entries for several replacements.
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

// Default configuration - can be overridden by importing scripts
var STYLE_REPLACEMENTS = typeof STYLE_REPLACEMENTS !== 'undefined' ? STYLE_REPLACEMENTS : [
// @CONFIG_START
  {
    from: "500",           // Partial match: "Primary/500" -> "Primary/50"
    to: "50"
  },
  {
    from: "4xl",           // Partial match: "Typography/4xl" -> "Typography/3xl"
    to: "3xl"
  },
  {
    from: "Red",           // Partial match: "Red/500" -> "Blue/500"
    to: "Blue"
  },
  {
    from: "Primary",       // Partial match: "Primary/500" -> "Secondary/500"
    to: "Secondary"
  }
// @CONFIG_END
];

var SELECTION_ONLY = typeof SELECTION_ONLY !== 'undefined' ? SELECTION_ONLY : true;

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
    // Use provided parameters or defaults
    var replacements = customReplacements || STYLE_REPLACEMENTS;
    var selectionOnly = customSelectionOnly !== undefined ? customSelectionOnly : SELECTION_ONLY;
    
    console.log('🎨 Comprehensive Style Replacement');
    console.log('====================================');
    
    if (replacements.length === 0) {
      console.log('❌ No replacements configured');
      figma.notify('Configure STYLE_REPLACEMENTS first');
      return Promise.resolve({ success: false, replacements: 0, error: 'No replacements configured' });
    }
    
    var nodes = selectionOnly ? figma.currentPage.selection : [figma.currentPage];
    
    if (selectionOnly && nodes.length === 0) {
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
      
      // Process nodes with optimization (chunked processing with memory management)
      return processWithOptimization(allNodes, function(node) {
        var replacementCount = 0;
        var nodeName = node.name || 'Unnamed';
        
        // Process text styles
        if (node.type === 'TEXT') {
          replacementCount += processTextNode(node, styleCache, nodeName, replacements);
        }
        
        // Process other style types
        replacementCount += processOtherStyles(node, styleCache, nodeName, replacements);
        
        return replacementCount;
      }, {
        chunkSize: adaptiveChunkSize,
        showProgress: true,
        operation: 'Replacing styles',
        maxNodes: allNodes.length > 10000 ? 10000 : undefined // Limit processing for very large files
      }).then(function(results) {
        var totalReplacements = 0;
        
        // Sum up all replacement counts
        if (Array.isArray(results)) {
          for (var i = 0; i < results.length; i++) {
            totalReplacements += results[i] || 0;
          }
        } else if (typeof results === 'number') {
          totalReplacements = results;
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
      var styleType = style.type || 'TEXT'; // Default to TEXT if type not available
      
      cache.set(style.name, {
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
            
            // Store library style info for later import
            cache.set(libraryStyle.name, {
              style: null, // Will be imported when needed
              key: libraryStyle.key,
              isLibrary: true,
              name: libraryStyle.name,
              type: libraryStyle.type
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
                  if (style && !cache.has(style.name)) {
                    cache.set(style.name, {
                      style: style,
                      type: 'TEXT',
                      key: style.key || null,
                      isLibrary: style.remote || false
                    });
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
            if (style && !cache.has(style.name)) {
              var styleType = 'PAINT';
              if (prop === 'effectStyleId') styleType = 'EFFECT';
              
              cache.set(style.name, {
                style: style,
                type: styleType,
                key: style.key || null,
                isLibrary: style.remote || false
              });
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

function processTextNode(node, styleCache, nodeName, replacements) {
  var totalReplacements = 0;
  
  try {
    var segments = node.getStyledTextSegments(['textStyleId']);
    
    for (var segIndex = 0; segIndex < segments.length; segIndex++) {
      var segment = segments[segIndex];
      if (segment.textStyleId && segment.textStyleId !== figma.mixed) {
        try {
          var currentStyle = figma.getStyleById(segment.textStyleId);
          if (currentStyle) {
            var newStyle = findReplacementStyle(currentStyle, styleCache, 'TEXT', replacements);
            
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

function processOtherStyles(node, styleCache, nodeName, replacements) {
  var totalReplacements = 0;
  
  // Handle fill styles
  if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
    try {
      var currentStyle = figma.getStyleById(node.fillStyleId);
      if (currentStyle) {
        var newStyle = findReplacementStyle(currentStyle, styleCache, 'PAINT', replacements);
        
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
  
  // Handle stroke styles
  if ('strokeStyleId' in node && node.strokeStyleId && node.strokeStyleId !== figma.mixed) {
    try {
      var currentStyle = figma.getStyleById(node.strokeStyleId);
      if (currentStyle) {
        var newStyle = findReplacementStyle(currentStyle, styleCache, 'PAINT', replacements);
        
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
  
  // Handle effect styles
  if ('effectStyleId' in node && node.effectStyleId && node.effectStyleId !== figma.mixed) {
    try {
      var currentStyle = figma.getStyleById(node.effectStyleId);
      if (currentStyle) {
        var newStyle = findReplacementStyle(currentStyle, styleCache, 'EFFECT', replacements);
        
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

// Enhanced replacement function with Team Library import support
function findReplacementStyle(currentStyle, styleCache, expectedType, replacements) {
  console.log('🔍 Checking style: "' + currentStyle.name + '" (type: ' + expectedType + ')');
  
  for (var replIndex = 0; replIndex < replacements.length; replIndex++) {
    var replacement = replacements[replIndex];
    var findPattern = replacement.from;
    
    console.log('🔍 Testing pattern: "' + findPattern + '" → "' + replacement.to + '"');
    
    // Use pattern matching library for more robust matching
    // Don't escape the pattern here - let matchPattern handle it
    var patternMatch = matchPattern(currentStyle.name, findPattern, {
      exact: false,
      caseSensitive: false
    });
    
    // Check if current style name matches the pattern
    if (patternMatch && patternMatch.match) {
      // Create new style name by replacing the pattern
      // Use simple string replacement for the pattern (case-insensitive)
      var newStyleName = currentStyle.name;
      var patternRegex = new RegExp(findPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'gi');
      newStyleName = newStyleName.replace(patternRegex, replacement.to);
      
      // Only proceed if the name actually changed
      if (newStyleName !== currentStyle.name) {
        console.log('🔍 Looking for replacement: "' + currentStyle.name + '" → "' + newStyleName + '"');
        
        // Check if replacement style exists in cache
        var styleInfo = styleCache.get(newStyleName);
        if (styleInfo && styleInfo.type === expectedType) {
          // If it's a local style or already imported library style
          if (styleInfo.style) {
            console.log('✅ Found replacement: "' + newStyleName + '"');
            return styleInfo.style;
          }
          
          // If it's a library style that needs to be imported
          if (styleInfo.isLibrary && styleInfo.key) {
            console.log('📥 Importing library style: "' + newStyleName + '"');
            try {
              var importedStyle = figma.importStyleByKeyAsync(styleInfo.key);
              return importedStyle.then(function(importedStyle) {
                console.log('✅ Successfully imported: "' + importedStyle.name + '"');
                
                // Update cache with imported style
                styleCache.set(newStyleName, {
                  style: importedStyle,
                  type: styleInfo.type,
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