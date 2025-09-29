// @Core Library
// Comprehensive collection of reusable Figma operations and utilities
// 
// 📚 IMPORT THESE FUNCTIONS IN YOUR SCRIPTS:
// @import { getAllStyles, traverseNodes, distance } from "@Core Library"
//
// 🎯 AVAILABLE FUNCTIONS:
// • Node Operations: traverseNodes, getTargetNodes, findByName, findAllByName, findAllByType, clone
// • Style Operations: getAllStyles, buildStyleCache, replaceStylesByPattern, getStyleByName  
// • Variable Operations: getOrCreateCollection, setupModes, createOrUpdateVariable, buildVariableCache, extractModes, processVariables
// • Pattern Matching: replaceByPattern
// • Geometry: distance, center, bounds
// • Colors: hexToRgb, rgbToHex
// • Utilities: log, timeOperation, unique

// === GEOMETRY UTILITIES ===
function distance(a, b) {
  return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

function center(node) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  };
}

function bounds(nodes) {
  if (nodes.length === 0) return null;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

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

// === VARIABLE OPERATIONS ===
function getOrCreateCollection(name) {
  var collections = figma.variables.getLocalVariableCollections();
  var existing = collections.find(function(c) { return c.name === name; });
  
  if (existing) {
    return existing;
  }
  
  return figma.variables.createVariableCollection(name);
}

function setupModes(collection, modeNames) {
  console.log('Setting up modes: ' + modeNames.join(', '));
  
  // Remove extra modes
  while (collection.modes.length > modeNames.length) {
    collection.removeMode(collection.modes[collection.modes.length - 1].modeId);
  }
  
  // Add missing modes and rename
  modeNames.forEach(function(modeName, index) {
    if (index === 0) {
      // Rename default mode
      collection.renameMode(collection.modes[0].modeId, modeName);
    } else if (index >= collection.modes.length) {
      // Add new mode
      collection.addMode(modeName);
    } else {
      // Rename existing mode
      collection.renameMode(collection.modes[index].modeId, modeName);
    }
  });
  
  return collection;
}

function createOrUpdateVariable(collection, name, config, modes) {
  // Handle both old signature (type, values) and new signature (config, modes)
  var actualConfig, actualModes;
  
  if (typeof config === 'string') {
    // Old signature: createOrUpdateVariable(collection, name, type, values)
    actualConfig = { type: config, values: modes || {} };
    actualModes = Object.keys(modes || {});
  } else {
    // New signature: createOrUpdateVariable(collection, name, config, modes)
    actualConfig = config;
    actualModes = modes || Object.keys(config.values || {});
  }
  
  // Find existing variable
  var existingVar = collection.variableIds
    .map(function(id) { return figma.variables.getVariableById(id); })
    .find(function(v) { return v && v.name === name; });
  
  var variable;
  var action;
  
  if (existingVar) {
    variable = existingVar;
    action = 'updated';
    console.log('Updating variable: ' + name);
  } else {
    variable = figma.variables.createVariable(name, collection, actualConfig.type);
    action = 'created';
    console.log('Creating variable: ' + name + ' (' + actualConfig.type + ')');
  }
  
  // Set scopes if provided
  if (actualConfig.scopes && actualConfig.scopes.length > 0) {
    variable.scopes = actualConfig.scopes;
    console.log('  Scopes set: ' + actualConfig.scopes.join(', '));
  }
  
  // Set values for each mode
  actualModes.forEach(function(modeName) {
    var mode = collection.modes.find(function(m) { return m.name === modeName; });
    if (mode && actualConfig.values && actualConfig.values[modeName] !== undefined) {
      var value = actualConfig.values[modeName];
      
      // Convert color strings to RGB objects
      if (actualConfig.type === 'COLOR' && typeof value === 'string') {
        value = hexToRgb(value);
      }
      
      variable.setValueForMode(mode.modeId, value);
      console.log('  ' + modeName + ': ' + (actualConfig.type === 'COLOR' ? rgbToHex(value.r, value.g, value.b) : value));
    }
  });
  
  return action;
}

function extractModes(config) {
  // Get modes from the first variable's values
  var firstVariable = Object.keys(config.variables)[0];
  if (firstVariable && config.variables[firstVariable].values) {
    return Object.keys(config.variables[firstVariable].values);
  }
  return ["Default"];
}

function processVariables(collection, variables, configValues, modes) {
  var stats = { created: 0, updated: 0, skipped: 0 };
  
  console.log('Processing ' + Object.keys(variables).length + ' variables...');
  
  // Process all variables
  Object.keys(variables).forEach(function(varName) {
    var varConfig = variables[varName];
    console.log('Processing variable: ' + varName);
    
    // Calculate values using config
    var calculatedConfig = {
      type: varConfig.type,
      values: {}
    };
    
    modes.forEach(function(mode) {
      if (varConfig.values && varConfig.values[mode]) {
        if (typeof varConfig.values[mode] === 'function') {
          // Calculate value using config
          calculatedConfig.values[mode] = varConfig.values[mode](configValues);
        } else {
          // Use static value
          calculatedConfig.values[mode] = varConfig.values[mode];
        }
      }
    });
    
    var result = createOrUpdateVariable(collection, varName, calculatedConfig, modes);
    stats[result]++;
  });
  
  return stats;
}

function buildVariableCache() {
  return {
    local: figma.variables.getLocalVariables(),
    collections: figma.variables.getLocalVariableCollections()
  };
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

console.log('📚 @Core Library loaded - ' + 
  'getAllStyles, traverseNodes, distance, center, bounds, ' +
  'findByName, replaceByPattern, hexToRgb, and more available for import');
