// Replace Styles
// Handles text, color, and effect styles with partial matching
// Can be used as standalone script or imported by other scripts

// Default configuration - can be overridden by importing scripts
var STYLE_REPLACEMENTS = typeof STYLE_REPLACEMENTS !== 'undefined' ? STYLE_REPLACEMENTS : [
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
];

var SELECTION_ONLY = typeof SELECTION_ONLY !== 'undefined' ? SELECTION_ONLY : true;

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
      
      var totalReplacements = 0;
      var processedNodes = new Set();
      
      // Process all nodes recursively
      var processPromises = [];
      for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        var node = nodes[nodeIndex];
        processPromises.push(processNodeRecursively(node, styleCache, processedNodes, replacements));
      }
      
      return Promise.all(processPromises).then(function(results) {
        for (var i = 0; i < results.length; i++) {
          totalReplacements += results[i];
        }
        
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
    var localTextStyles = figma.getLocalTextStyles();
    var localPaintStyles = figma.getLocalPaintStyles();
    var localEffectStyles = figma.getLocalEffectStyles();
    
    for (var i = 0; i < localTextStyles.length; i++) {
      var style = localTextStyles[i];
      cache.set(style.name, {
        style: style,
        type: 'TEXT',
        key: null,
        isLibrary: false
      });
    }
    for (var i = 0; i < localPaintStyles.length; i++) {
      var style = localPaintStyles[i];
      cache.set(style.name, {
        style: style,
        type: 'PAINT',
        key: null,
        isLibrary: false
      });
    }
    for (var i = 0; i < localEffectStyles.length; i++) {
      var style = localEffectStyles[i];
      cache.set(style.name, {
        style: style,
        type: 'EFFECT',
        key: null,
        isLibrary: false
      });
    }
    
    console.log('📋 Added ' + (localTextStyles.length + localPaintStyles.length + localEffectStyles.length) + ' local styles');
    
  // 🚀 Access Team Library styles (with performance optimization)
  try {
    console.log('🌐 Accessing Team Library styles...');
    var startTime = Date.now();
    
    // Get all available library style collections
    figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync().then(function(libraryCollections) {
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
      scanDocumentForLibraryStyles(cache);
      console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
      
      // Debug: Show what styles were found
      console.log('🔍 Found styles:');
      for (var [styleName, styleInfo] of cache.entries()) {
        console.log('   - "' + styleName + '" (' + styleInfo.type + ', library: ' + styleInfo.isLibrary + ')');
      }
      
      resolve(cache);
    });
      
    } catch (error) {
      console.log('⚠️ Team Library access failed: ' + error.message);
      console.log('📋 Falling back to document scanning...');
      
      // Fallback: Scan document for currently used library styles
      scanDocumentForLibraryStyles(cache);
      console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
      
      // Debug: Show what styles were found
      console.log('🔍 Found styles:');
      for (var [styleName, styleInfo] of cache.entries()) {
        console.log('   - "' + styleName + '" (' + styleInfo.type + ', library: ' + styleInfo.isLibrary + ')');
      }
      
      resolve(cache);
    }
  });
}

// Fallback function to scan document for library styles
function scanDocumentForLibraryStyles(cache) {
  function scanNode(node) {
    // Safely check if node exists and has the required properties
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
    
    // Recursively scan children
    if (node.children && Array.isArray(node.children)) {
      for (var childIndex = 0; childIndex < node.children.length; childIndex++) {
        scanNode(node.children[childIndex]);
      }
    }
  }
  
  try {
    scanNode(figma.currentPage);
  } catch (e) {
    console.log('⚠️ Error scanning document: ' + e.message);
  }
}

// Recursive node processing function
function processNodeRecursively(node, styleCache, processedNodes, replacements) {
  if (processedNodes.has(node.id)) {
    return 0;
  }
  
  processedNodes.add(node.id);
  var totalReplacements = 0;
  var nodeName = node.name || 'Unnamed';
  
  // Process text styles
  if (node.type === 'TEXT') {
    totalReplacements += processTextNode(node, styleCache, nodeName, replacements);
  }
  
  // Process other style types
  totalReplacements += processOtherStyles(node, styleCache, nodeName, replacements);
  
  // Recursively process all children
  if ('children' in node) {
    for (var childIndex = 0; childIndex < node.children.length; childIndex++) {
      var child = node.children[childIndex];
      totalReplacements += processNodeRecursively(child, styleCache, processedNodes, replacements);
    }
  }
  
  return totalReplacements;
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
              // It's a Promise (library style import)
              newStyle.then(function(importedStyle) {
                if (importedStyle) {
                  node.setRangeTextStyleId(segment.start, segment.end, importedStyle.id);
                  totalReplacements++;
                  console.log('✅ Text: "' + currentStyle.name + '" → "' + importedStyle.name + '" in "' + nodeName + '"');
                }
              }).catch(function(error) {
                console.log('❌ Failed to import style: ' + error.message);
              });
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
          // It's a Promise (library style import)
          newStyle.then(function(importedStyle) {
            if (importedStyle) {
              node.fillStyleId = importedStyle.id;
              totalReplacements++;
              console.log('✅ Fill: "' + currentStyle.name + '" → "' + importedStyle.name + '" in "' + nodeName + '"');
            }
          }).catch(function(error) {
            console.log('❌ Failed to import style: ' + error.message);
          });
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
          // It's a Promise (library style import)
          newStyle.then(function(importedStyle) {
            if (importedStyle) {
              node.strokeStyleId = importedStyle.id;
              totalReplacements++;
              console.log('✅ Stroke: "' + currentStyle.name + '" → "' + importedStyle.name + '" in "' + nodeName + '"');
            }
          }).catch(function(error) {
            console.log('❌ Failed to import style: ' + error.message);
          });
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
          // It's a Promise (library style import)
          newStyle.then(function(importedStyle) {
            if (importedStyle) {
              node.effectStyleId = importedStyle.id;
              totalReplacements++;
              console.log('✅ Effect: "' + currentStyle.name + '" → "' + importedStyle.name + '" in "' + nodeName + '"');
            }
          }).catch(function(error) {
            console.log('❌ Failed to import style: ' + error.message);
          });
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
    
    // Check if current style name contains the pattern
    if (currentStyle.name.indexOf(findPattern) !== -1) {
      // Create new style name by replacing the pattern
      var newStyleName = currentStyle.name.replace(new RegExp(findPattern, 'g'), replacement.to);
      
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