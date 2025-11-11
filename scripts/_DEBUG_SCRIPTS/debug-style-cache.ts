// Debug style cache
// Shows what styles are actually found and cached

console.log('🔍 Debug: Style Cache Analysis');

// Configuration - same as main script
var STYLE_REPLACEMENTS = [
  {
    from: ["5xl", "4xl", "2xl"],
    to: "3xl"
  }
];

async function debugStyleCache() {
  console.log('====================================');
  
  // Get selection
  var nodes = figma.currentPage.selection;
  if (nodes.length === 0) {
    console.log('❌ No elements selected');
    figma.notify('Please select elements to debug');
    return;
  }
  
  console.log('🔍 Processing ' + nodes.length + ' selected nodes');
  
  // Build cache like the main script
  var cache = new Map();
  
  // Add all local styles
  var localTextStyles = figma.getLocalTextStyles();
  var localPaintStyles = figma.getLocalPaintStyles();
  var localEffectStyles = figma.getLocalEffectStyles();
  
  console.log('📋 Local styles found:');
  console.log('  Text styles: ' + localTextStyles.length);
  console.log('  Paint styles: ' + localPaintStyles.length);
  console.log('  Effect styles: ' + localEffectStyles.length);
  
  for (var i = 0; i < localTextStyles.length; i++) {
    cache.set(localTextStyles[i].name, {
      style: localTextStyles[i],
      key: null,
      isLibrary: false
    });
    console.log('  📝 Local text: "' + localTextStyles[i].name + '"');
  }
  
  // Scan document for currently used styles (fallback method)
  console.log('');
  console.log('🔍 Scanning document for used library styles...');
  
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
                console.log('  📚 Found text style: "' + style.name + '" (library: ' + (style.remote || false) + ')');
              }
            } catch (e) {
              console.log('  ⚠️ Could not access style: ' + segment.textStyleId);
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
            console.log('  🎨 Found ' + prop.replace('StyleId', '') + ' style: "' + style.name + '" (library: ' + (style.remote || false) + ')');
          }
        } catch (e) {
          console.log('  ⚠️ Could not access style: ' + node[prop]);
        }
      }
    }
    
    if ('children' in node) {
      for (var childIndex = 0; childIndex < node.children.length; childIndex++) {
        scanNode(node.children[childIndex]);
      }
    }
  }
  
  // Scan selected nodes
  for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
    scanNode(nodes[nodeIndex]);
  }
  
  console.log('');
  console.log('📊 Final cache summary:');
  console.log('  Total styles in cache: ' + cache.size);
  
  // Show all cached styles
  console.log('');
  console.log('📋 All cached styles:');
  var styleNames = Array.from(cache.keys()).sort();
  for (var nameIndex = 0; nameIndex < styleNames.length; nameIndex++) {
    var styleName = styleNames[nameIndex];
    var styleInfo = cache.get(styleName);
    console.log('  "' + styleName + '" (library: ' + styleInfo.isLibrary + ')');
  }
  
  // Test replacement logic
  console.log('');
  console.log('🔄 Testing replacement patterns:');
  for (var replIndex = 0; replIndex < STYLE_REPLACEMENTS.length; replIndex++) {
    var replacement = STYLE_REPLACEMENTS[replIndex];
    console.log('  Pattern: [' + replacement.from.join(', ') + '] → "' + replacement.to + '"');
    
    for (var nameIndex = 0; nameIndex < styleNames.length; nameIndex++) {
      var styleName = styleNames[nameIndex];
      
      for (var patternIndex = 0; patternIndex < replacement.from.length; patternIndex++) {
        var findPattern = replacement.from[patternIndex];
        
        if (styleName.indexOf(findPattern) !== -1) {
          var newStyleName = styleName.replace(new RegExp(findPattern, 'g'), replacement.to);
          console.log('    "' + styleName + '" → "' + newStyleName + '"');
          
          if (cache.has(newStyleName)) {
            console.log('      ✅ Replacement exists in cache!');
          } else {
            console.log('      ❌ Replacement NOT found in cache');
          }
        }
      }
    }
  }
  
  figma.notify('Debug complete - check console');
}

debugStyleCache();

