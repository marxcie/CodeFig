// Find and replace styles - earlier version
// Enhanced with Team Library API for comprehensive style access

console.log('🎨 Replace Styles - Pattern Matching with Library Import');

// Configuration
var STYLE_REPLACEMENTS = [
  {
    from: ["4xl"],
    to: "3xl"
  }
];

var SELECTION_ONLY = true;

// Main async function
async function replaceStyles() {
  try {
    console.log('====================================');
    
    if (STYLE_REPLACEMENTS.length === 0) {
      console.log('❌ No replacements configured');
      figma.notify('Configure STYLE_REPLACEMENTS first');
      return;
    }
    
    var nodes = SELECTION_ONLY ? figma.currentPage.selection : [figma.currentPage];
    
    if (SELECTION_ONLY && nodes.length === 0) {
      console.log('❌ No elements selected');
      figma.notify('Please select elements to process');
      return;
    }
    
    console.log('🔍 Processing ' + nodes.length + ' root nodes');
    console.log('📋 Replacement patterns:');
    
    for (var i = 0; i < STYLE_REPLACEMENTS.length; i++) {
      var repl = STYLE_REPLACEMENTS[i];
      console.log('   [' + repl.from.join(', ') + '] → "' + repl.to + '"');
    }
    
    var styleCache = await buildEnhancedStyleCache();
    console.log('📋 Found ' + styleCache.size + ' styles (local + library)');
    
    var totalReplacements = 0;
    var processedNodes = new Set();
    
    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      var node = nodes[nodeIndex];
      totalReplacements += await processNode(node, styleCache, processedNodes);
    }
    
    console.log('');
    console.log('📊 Results:');
    console.log('✅ Total replacements: ' + totalReplacements);
    
    if (totalReplacements > 0) {
      figma.notify('✅ Replaced ' + totalReplacements + ' styles');
    } else {
      figma.notify('No style replacements made');
    }
    
  } catch (error) {
    console.log('❌ Script error: ' + error.message);
    figma.notify('Script error - check console');
  }
}

// Enhanced style cache with Team Library API (like variable replacement)
async function buildEnhancedStyleCache() {
  var cache = new Map();
  
  console.log('🔍 Building comprehensive style cache with Team Library API...');
  
  // Add all local styles
  var localTextStyles = figma.getLocalTextStyles();
  var localPaintStyles = figma.getLocalPaintStyles();
  var localEffectStyles = figma.getLocalEffectStyles();
  
  for (var i = 0; i < localTextStyles.length; i++) {
    cache.set(localTextStyles[i].name, {
      style: localTextStyles[i],
      key: null,
      isLibrary: false
    });
  }
  for (var i = 0; i < localPaintStyles.length; i++) {
    cache.set(localPaintStyles[i].name, {
      style: localPaintStyles[i],
      key: null,
      isLibrary: false
    });
  }
  for (var i = 0; i < localEffectStyles.length; i++) {
    cache.set(localEffectStyles[i].name, {
      style: localEffectStyles[i],
      key: null,
      isLibrary: false
    });
  }
  
  console.log('📋 Added ' + (localTextStyles.length + localPaintStyles.length + localEffectStyles.length) + ' local styles');
  
  // 🚀 NEW: Access Team Library styles (like we do for variables)
  try {
    console.log('🌐 Accessing Team Library styles...');
    
    // Get all available library style collections
    var libraryCollections = await figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync();
    console.log('📚 Found ' + libraryCollections.length + ' library style collections');
    
    for (var libIndex = 0; libIndex < libraryCollections.length; libIndex++) {
      var libraryCollection = libraryCollections[libIndex];
      
      try {
        // Get styles from each collection
        var libraryStyles = await figma.teamLibrary.getStylesInLibraryCollectionAsync(libraryCollection.key);
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
      } catch (e) {
        console.log('⚠️ Could not access collection: ' + libraryCollection.name);
      }
    }
  } catch (error) {
    console.log('⚠️ Team Library access failed: ' + error.message);
    console.log('📋 Falling back to document scanning...');
    
    // Fallback: Scan document for currently used library styles
    function scanNode(node) {
      if (node.type === 'TEXT') {
        try {
          var segments = node.getStyledTextSegments(['textStyleId']);
          for (var segIndex = 0; segIndex < segments.length; segIndex++) {
            var segment = segments[segIndex];
            if (segment.textStyleId && segment.textStyleId !== figma.mixed) {
              try {
                var style = figma.getStyleById(segment.textStyleId);
                if (style && !cache.has(style.name)) {
                  cache.set(style.name, {
                    style: style,
                    key: style.key || null,
                    isLibrary: style.remote || false
                  });
                }
              } catch (e) {
                // Style might be inaccessible
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
              cache.set(style.name, {
                style: style,
                key: style.key || null,
                isLibrary: style.remote || false
              });
            }
          } catch (e) {
            // Style might be inaccessible
          }
        }
      }
      
      if ('children' in node) {
        for (var childIndex = 0; childIndex < node.children.length; childIndex++) {
          scanNode(node.children[childIndex]);
        }
      }
    }
    
    scanNode(figma.currentPage);
  }
  
  console.log('📋 Total styles in cache: ' + cache.size);
  return cache;
}

async function processNode(node, styleCache, processedNodes) {
  if (processedNodes.has(node.id)) {
    return 0;
  }
  
  processedNodes.add(node.id);
  var replacements = 0;
  
  if (node.type === 'TEXT') {
    replacements += await processTextNode(node, styleCache);
  }
  
  replacements += await processOtherStyles(node, styleCache);
  
  if ('children' in node) {
    for (var childIndex = 0; childIndex < node.children.length; childIndex++) {
      var child = node.children[childIndex];
      replacements += await processNode(child, styleCache, processedNodes);
    }
  }
  
  return replacements;
}

async function processTextNode(node, styleCache) {
  var replacements = 0;
  var nodeName = node.name || 'Unnamed';
  
  try {
    var segments = node.getStyledTextSegments(['textStyleId']);
    
    for (var segIndex = 0; segIndex < segments.length; segIndex++) {
      var segment = segments[segIndex];
      if (segment.textStyleId && segment.textStyleId !== figma.mixed) {
        try {
          var currentStyle = figma.getStyleById(segment.textStyleId);
          if (currentStyle) {
            var newStyle = await findReplacementStyle(currentStyle, styleCache);
            if (newStyle) {
              node.setRangeTextStyleId(segment.start, segment.end, newStyle.id);
              replacements++;
              console.log('✅ Text: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
            }
          }
        } catch (e) {
          // Style might be inaccessible
        }
      }
    }
  } catch (e) {
    // Node might not support text segments
  }
  
  return replacements;
}

async function processOtherStyles(node, styleCache) {
  var replacements = 0;
  var nodeName = node.name || 'Unnamed';
  
  // Handle fill styles
  if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
    try {
      var currentStyle = figma.getStyleById(node.fillStyleId);
      if (currentStyle) {
        var newStyle = await findReplacementStyle(currentStyle, styleCache);
        if (newStyle) {
          node.fillStyleId = newStyle.id;
          replacements++;
          console.log('✅ Fill: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
        }
      }
    } catch (e) {
      // Style might be inaccessible
    }
  }
  
  // Handle stroke styles
  if ('strokeStyleId' in node && node.strokeStyleId && node.strokeStyleId !== figma.mixed) {
    try {
      var currentStyle = figma.getStyleById(node.strokeStyleId);
      if (currentStyle) {
        var newStyle = await findReplacementStyle(currentStyle, styleCache);
        if (newStyle) {
          node.strokeStyleId = newStyle.id;
          replacements++;
          console.log('✅ Stroke: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
        }
      }
    } catch (e) {
      // Style might be inaccessible
    }
  }
  
  // Handle effect styles
  if ('effectStyleId' in node && node.effectStyleId && node.effectStyleId !== figma.mixed) {
    try {
      var currentStyle = figma.getStyleById(node.effectStyleId);
      if (currentStyle) {
        var newStyle = await findReplacementStyle(currentStyle, styleCache);
        if (newStyle) {
          node.effectStyleId = newStyle.id;
          replacements++;
          console.log('✅ Effect: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
        }
      }
    } catch (e) {
      // Style might be inaccessible
    }
  }
  
  return replacements;
}

// Enhanced replacement function with Team Library import (like variable replacement)
async function findReplacementStyle(currentStyle, styleCache) {
  for (var replIndex = 0; replIndex < STYLE_REPLACEMENTS.length; replIndex++) {
    var replacement = STYLE_REPLACEMENTS[replIndex];
    
    for (var patternIndex = 0; patternIndex < replacement.from.length; patternIndex++) {
      var findPattern = replacement.from[patternIndex];
      
      if (currentStyle.name.indexOf(findPattern) !== -1) {
        var newStyleName = currentStyle.name.replace(new RegExp(findPattern, 'g'), replacement.to);
        console.log('🔍 Looking for replacement style: "' + newStyleName + '"');
        
        // Check if style is in cache
        var styleInfo = styleCache.get(newStyleName);
        if (styleInfo) {
          // If it's a local style or already imported library style
          if (styleInfo.style) {
            console.log('✅ Found in cache: "' + newStyleName + '"');
            return styleInfo.style;
          }
          
          // If it's a library style that needs to be imported
          if (styleInfo.isLibrary && styleInfo.key) {
            console.log('📥 Importing library style: "' + newStyleName + '"');
            try {
              var importedStyle = await figma.importStyleByKeyAsync(styleInfo.key);
              console.log('✅ Successfully imported: "' + importedStyle.name + '"');
              
              // Update cache with imported style
              styleCache.set(newStyleName, {
                style: importedStyle,
                key: styleInfo.key,
                isLibrary: true
              });
              
              return importedStyle;
            } catch (importError) {
              console.log('❌ Failed to import style: ' + importError.message);
            }
          }
        }
        
        console.log('❌ Style not found: "' + newStyleName + '"');
      }
    }
  }
  
  return null;
}

// Run the script
replaceStyles();