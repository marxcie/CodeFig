// Replace styles with pattern matching

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

// Enhanced style cache that includes library styles
async function buildEnhancedStyleCache() {
  var cache = new Map();
  
  console.log('🔍 Building enhanced style cache...');
  
  // Add all local styles
  var localTextStyles = figma.getLocalTextStyles();
  var localPaintStyles = figma.getLocalPaintStyles();
  var localEffectStyles = figma.getLocalEffectStyles();
  
  for (var i = 0; i < localTextStyles.length; i++) {
    cache.set(localTextStyles[i].name, localTextStyles[i]);
  }
  for (var i = 0; i < localPaintStyles.length; i++) {
    cache.set(localPaintStyles[i].name, localPaintStyles[i]);
  }
  for (var i = 0; i < localEffectStyles.length; i++) {
    cache.set(localEffectStyles[i].name, localEffectStyles[i]);
  }
  
  console.log('📋 Added ' + (localTextStyles.length + localPaintStyles.length + localEffectStyles.length) + ' local styles');
  
  // Scan document for currently used library styles
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
                cache.set(style.name, style);
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
            cache.set(style.name, style);
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

// Enhanced replacement function with library style import
async function findReplacementStyle(currentStyle, styleCache) {
  for (var replIndex = 0; replIndex < STYLE_REPLACEMENTS.length; replIndex++) {
    var replacement = STYLE_REPLACEMENTS[replIndex];
    
    for (var patternIndex = 0; patternIndex < replacement.from.length; patternIndex++) {
      var findPattern = replacement.from[patternIndex];
      
      if (currentStyle.name.indexOf(findPattern) !== -1) {
        var newStyleName = currentStyle.name.replace(new RegExp(findPattern, 'g'), replacement.to);
        console.log('🔍 Looking for replacement style: "' + newStyleName + '"');
        
        // First check if style is already in cache
        var newStyle = styleCache.get(newStyleName);
        if (newStyle) {
          console.log('✅ Found in cache: "' + newStyleName + '"');
          return newStyle;
        }
        
        // If not in cache, try to import from library
        console.log('📥 Attempting to import from library: "' + newStyleName + '"');
        try {
          // Try to import by key - this requires the style to exist in a team library
          // Note: This is a simplified approach. In practice, you'd need to:
          // 1. Get available library style collections
          // 2. Search through them for matching style names
          // 3. Import by key if found
          
          // For now, we'll just check if it's a library style we can access
          // This approach works if the style exists in the document or libraries
          var allStyles = [];
          
          // Get all styles from the document (including library styles that are used)
          function collectAllStyles(node) {
            if (node.type === 'TEXT') {
              try {
                var segments = node.getStyledTextSegments(['textStyleId']);
                for (var segIndex = 0; segIndex < segments.length; segIndex++) {
                  var segment = segments[segIndex];
                  if (segment.textStyleId && segment.textStyleId !== figma.mixed) {
                    try {
                      var style = figma.getStyleById(segment.textStyleId);
                      if (style && style.name === newStyleName && !styleCache.has(style.name)) {
                        console.log('🎯 Found library style in document: "' + style.name + '"');
                        styleCache.set(style.name, style);
                        return style;
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
                  if (style && style.name === newStyleName && !styleCache.has(style.name)) {
                    console.log('🎯 Found library style in document: "' + style.name + '"');
                    styleCache.set(style.name, style);
                    return style;
                  }
                } catch (e) {
                  // Style might be inaccessible
                }
              }
            }
            
            if ('children' in node) {
              for (var childIndex = 0; childIndex < node.children.length; childIndex++) {
                var foundStyle = collectAllStyles(node.children[childIndex]);
                if (foundStyle) return foundStyle;
              }
            }
            
            return null;
          }
          
          // Search the entire document for the target style
          var foundStyle = collectAllStyles(figma.root);
          if (foundStyle) {
            return foundStyle;
          }
          
          console.log('❌ Style not found in document or libraries: "' + newStyleName + '"');
          
        } catch (error) {
          console.log('❌ Error importing style: ' + error.message);
        }
      }
    }
  }
  
  return null;
}

// Run the script
replaceStyles();