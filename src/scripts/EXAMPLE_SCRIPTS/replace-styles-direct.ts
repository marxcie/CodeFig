// Replace styles
// Works by directly importing styles using key pattern matching

console.log('🎨 Replace Styles - Direct Import (Fast Version)');

// Configuration
var STYLE_REPLACEMENTS = [
  {
    from: ["5xl", "4xl", "2xl"],
    to: "3xl"
  }
];

var SELECTION_ONLY = true;

// Cache for imported styles to avoid re-importing
var importedStylesCache = new Map();

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
    
    var totalReplacements = 0;
    var processedNodes = new Set();
    
    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      var node = nodes[nodeIndex];
      totalReplacements += await processNode(node, processedNodes);
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

async function processNode(node, processedNodes) {
  if (processedNodes.has(node.id)) {
    return 0;
  }
  
  processedNodes.add(node.id);
  var replacements = 0;
  
  if (node.type === 'TEXT') {
    replacements += await processTextNode(node);
  }
  
  replacements += await processOtherStyles(node);
  
  if ('children' in node) {
    for (var childIndex = 0; childIndex < node.children.length; childIndex++) {
      var child = node.children[childIndex];
      replacements += await processNode(child, processedNodes);
    }
  }
  
  return replacements;
}

async function processTextNode(node) {
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
            var newStyle = await findAndImportReplacementStyle(currentStyle);
            if (newStyle) {
              node.setRangeTextStyleId(segment.start, segment.end, newStyle.id);
              replacements++;
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
  
  return replacements;
}

async function processOtherStyles(node) {
  var replacements = 0;
  var nodeName = node.name || 'Unnamed';
  
  // Handle fill styles
  if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
    try {
      var currentStyle = figma.getStyleById(node.fillStyleId);
      if (currentStyle) {
        var newStyle = await findAndImportReplacementStyle(currentStyle);
        if (newStyle) {
          node.fillStyleId = newStyle.id;
          replacements++;
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
        var newStyle = await findAndImportReplacementStyle(currentStyle);
        if (newStyle) {
          node.strokeStyleId = newStyle.id;
          replacements++;
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
        var newStyle = await findAndImportReplacementStyle(currentStyle);
        if (newStyle) {
          node.effectStyleId = newStyle.id;
          replacements++;
          console.log('✅ Effect: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
        }
      }
    } catch (e) {
      console.log('⚠️ Could not access effect style: ' + e.message);
    }
  }
  
  return replacements;
}

// 🚀 FAST: Direct key-based import without document scanning
async function findAndImportReplacementStyle(currentStyle) {
  for (var replIndex = 0; replIndex < STYLE_REPLACEMENTS.length; replIndex++) {
    var replacement = STYLE_REPLACEMENTS[replIndex];
    
    for (var patternIndex = 0; patternIndex < replacement.from.length; patternIndex++) {
      var findPattern = replacement.from[patternIndex];
      
      if (currentStyle.name.indexOf(findPattern) !== -1) {
        var newStyleName = currentStyle.name.replace(new RegExp(findPattern, 'g'), replacement.to);
        console.log('🔍 Need replacement: "' + currentStyle.name + '" → "' + newStyleName + '"');
        
        // Check cache first
        if (importedStylesCache.has(newStyleName)) {
          console.log('⚡ Found in cache: "' + newStyleName + '"');
          return importedStylesCache.get(newStyleName);
        }
        
        // Try direct import by key pattern (if current style has a key)
        if (currentStyle.key) {
          var guessedKey = currentStyle.key.replace(new RegExp(findPattern, 'g'), replacement.to);
          console.log('🔮 Trying key: "' + guessedKey + '"');
          
          try {
            var importedStyle = await figma.importStyleByKeyAsync(guessedKey);
            console.log('✅ Successfully imported: "' + importedStyle.name + '"');
            
            // Cache for future use
            importedStylesCache.set(newStyleName, importedStyle);
            return importedStyle;
          } catch (importError) {
            console.log('❌ Import failed: ' + importError.message);
          }
        }
        
        // 🎯 FALLBACK: Try alternative key patterns
        if (currentStyle.key) {
          console.log('🔄 Trying alternative key patterns...');
          
          // Pattern 1: Replace in different positions
          var keyPatterns = [
            currentStyle.key.replace(new RegExp(findPattern, 'gi'), replacement.to), // Case insensitive
            currentStyle.key.replace(new RegExp('/' + findPattern + '/', 'g'), '/' + replacement.to + '/'), // With slashes
            currentStyle.key.replace(new RegExp('-' + findPattern + '-', 'g'), '-' + replacement.to + '-'), // With dashes
            currentStyle.key.replace(new RegExp('_' + findPattern + '_', 'g'), '_' + replacement.to + '_')  // With underscores
          ];
          
          for (var keyIndex = 0; keyIndex < keyPatterns.length; keyIndex++) {
            var testKey = keyPatterns[keyIndex];
            if (testKey !== currentStyle.key) { // Don't retry the same key
              console.log('🔮 Trying pattern ' + (keyIndex + 1) + ': "' + testKey + '"');
              
              try {
                var importedStyle = await figma.importStyleByKeyAsync(testKey);
                console.log('✅ Success with pattern ' + (keyIndex + 1) + ': "' + importedStyle.name + '"');
                
                // Cache for future use
                importedStylesCache.set(newStyleName, importedStyle);
                return importedStyle;
              } catch (e) {
                console.log('❌ Pattern ' + (keyIndex + 1) + ' failed');
              }
            }
          }
        }
        
        console.log('❌ All import attempts failed for: "' + newStyleName + '"');
      }
    }
  }
  
  return null;
}

// Run the script
replaceStyles();

