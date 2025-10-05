// @Core Library
// Comprehensive collection of reusable Figma operations and utilities
// 
// 📚 IMPORT THESE FUNCTIONS IN YOUR SCRIPTS:
// @import { getAllStyles, traverseNodes, generateScale } from "@Core Library"
//
// 🎯 AVAILABLE FUNCTIONS:
// • Node Operations: traverseNodes, getTargetNodes, findByName, findAllByName, findAllByType, clone, setupAutoLayout, applyNamingConvention, createComponentFromSelection
// • Style Operations: getAllStyles, buildStyleCache, replaceStylesByPattern, getStyleByName  
// • Pattern Matching: replaceByPattern
// • Colors: hexToRgb, rgbToHex
// • Utilities: log, timeOperation, unique, analyzeSelection


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
function getAllStyles() {
  return figma.getLocalPaintStyles()
    .concat(figma.getLocalTextStyles())
    .concat(figma.getLocalEffectStyles())
    .concat(figma.getLocalGridStyles());
}

function getStyleByName(name, type) {
  var styles;
  if (type === 'TEXT') {
    styles = figma.getLocalTextStyles();
  } else {
    styles = figma.getLocalPaintStyles();
  }
  return styles.find(function(style) { return style.name === name; });
}

function buildStyleCache() {
  var cache = {
    local: getAllStyles(),
    library: []
  };
  
  // Add library styles if available
  try {
    cache.library = figma.getAvailableFonts ? [] : [];
  } catch (e) {
    // Library styles not available
  }
  
  return cache;
}

function replaceStylesByPattern(searchPattern, replacePattern) {
  var styles = getAllStyles();
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
function traverseNodes(nodes, processor) {
  var processed = new Set();
  var count = 0;
  
  function processNode(node) {
    if (processed.has(node.id)) return 0;
    processed.add(node.id);
    
    var result = processor(node);
    count += result || 0;
    
    if ('children' in node) {
      for (var i = 0; i < node.children.length; i++) {
        processNode(node.children[i]);
      }
    }
    
    return result;
  }
  
  if (Array.isArray(nodes)) {
    nodes.forEach(processNode);
  } else {
    processNode(nodes);
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

console.log('📚 @Core Library loaded - ' + 
  'getAllStyles, traverseNodes, findByName, replaceByPattern, ' +
  'hexToRgb, generateScale, setupAutoLayout, analyzeSelection, ' +
  'and more available for import');
