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

// Build comprehensive style cache for all style types
function buildStyleCache() {
  var cache = new Map();
  
  console.log('🔍 Building comprehensive style cache...');
  
  // Add all local text styles
  var localTextStyles = figma.getLocalTextStyles();
  for (var i = 0; i < localTextStyles.length; i++) {
    var style = localTextStyles[i];
    cache.set(style.name, {
      style: style,
      type: 'TEXT',
      isLibrary: false
    });
  }
  
  // Add all local paint styles
  var localPaintStyles = figma.getLocalPaintStyles();
  for (var i = 0; i < localPaintStyles.length; i++) {
    var style = localPaintStyles[i];
    cache.set(style.name, {
      style: style,
      type: 'PAINT',
      isLibrary: false
    });
  }
  
  // Add all local effect styles
  var localEffectStyles = figma.getLocalEffectStyles();
  for (var i = 0; i < localEffectStyles.length; i++) {
    var style = localEffectStyles[i];
    cache.set(style.name, {
      style: style,
      type: 'EFFECT',
      isLibrary: false
    });
  }
  
  console.log('📋 Added ' + localTextStyles.length + ' text styles');
  console.log('📋 Added ' + localPaintStyles.length + ' paint styles');
  console.log('📋 Added ' + localEffectStyles.length + ' effect styles');
  
  return Promise.resolve(cache);
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
            if (newStyle) {
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
        if (newStyle) {
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
        if (newStyle) {
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
        if (newStyle) {
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

// Enhanced replacement function with partial matching
function findReplacementStyle(currentStyle, styleCache, expectedType, replacements) {
  for (var replIndex = 0; replIndex < replacements.length; replIndex++) {
    var replacement = replacements[replIndex];
    var findPattern = replacement.from;
    
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
          console.log('✅ Found replacement: "' + newStyleName + '"');
          return styleInfo.style;
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