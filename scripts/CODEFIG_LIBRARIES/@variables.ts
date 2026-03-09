// @Variables
// @DOC_START
// # @Variables
// Functions for Figma variables, collections, and modes.
//
// ## Overview
// Import to get/create collections, get/set variables by name or mode, list variables, and run batch operations (e.g. getOrCreateCollection, setupModes, createOrUpdateVariable, extractModes, processVariables). No configuration; use via @import.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Collections | getAllCollections, getCollection, getOrCreateCollection, setupModes |
// | Variables | getVariable, getCollectionVariables, getVariableValue, setVariableValue, createOrUpdateVariable |
// | Batch | extractModes, processVariables |
// @DOC_END

// ============================================================================
// CORE VARIABLE FUNCTIONS
// ============================================================================

/**
 * Normalize variable name for Figma API: no empty path segments (e.g. "//" or leading/trailing "/").
 * Figma throws "name cannot contain empty path" for names like "//3xs/font-size".
 */
function normalizeVariableName(name) {
  if (typeof name !== 'string') return name;
  return name.replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
}

/**
 * Get all variable collections (async for documentAccess: dynamic-page)
 */
async function getAllCollections() {
  return await figma.variables.getLocalVariableCollectionsAsync();
}

/**
 * Get collection by name
 */
async function getCollection(name) {
  var collections = await getAllCollections();
  return collections.find(function(c) { return c.name === name; });
}

/**
 * Get variable by name from a collection (async for getVariableByIdAsync)
 */
async function getVariable(collection, variableName) {
  if (!collection) return null;
  
  for (var i = 0; i < collection.variableIds.length; i++) {
    var variableId = collection.variableIds[i];
    var variable = await figma.variables.getVariableByIdAsync(variableId);
    if (variable && variable.name === variableName) {
      return variable;
    }
  }
  return null;
}

/**
 * Get variable value for a specific mode
 */
async function getVariableValue(collection, variableName, modeId) {
  var variable = await getVariable(collection, variableName);
  if (variable && variable.valuesByMode[modeId] !== undefined) {
    return variable.valuesByMode[modeId];
  }
  return null;
}

/**
 * Set variable value for a specific mode
 */
async function setVariableValue(collection, variableName, modeId, value) {
  var variable = await getVariable(collection, variableName);
  if (variable) {
    variable.setValueForMode(modeId, value);
    return true;
  }
  return false;
}

/**
 * Get all variables in a collection (async for getVariableByIdAsync)
 */
async function getCollectionVariables(collection) {
  if (!collection) return [];
  
  var variables = [];
  for (var i = 0; i < collection.variableIds.length; i++) {
    var variableId = collection.variableIds[i];
    var variable = await figma.variables.getVariableByIdAsync(variableId);
    if (variable) {
      variables.push(variable);
    }
  }
  return variables;
}

/**
 * Get all mode IDs from a collection
 */
function getCollectionModes(collection) {
  if (!collection) return [];
  return collection.modes.map(function(mode) { return mode.modeId; });
}

/**
 * Get mode by name
 */
function getModeByName(collection, modeName) {
  if (!collection) return null;
  return collection.modes.find(function(mode) { return mode.name === modeName; });
}

// ============================================================================
// VARIABLE SEARCH AND FILTERING
// ============================================================================

/**
 * Find variables by pattern in name
 */
async function findVariablesByPattern(collection, pattern) {
  var variables = await getCollectionVariables(collection);
  var regex = new RegExp(pattern, 'i');
  return variables.filter(function(v) { return regex.test(v.name); });
}

/**
 * Find variables with function calls in description
 */
async function findSmartVariables(collection) {
  var variables = await getCollectionVariables(collection);
  return variables.filter(function(v) {
    return v.description && /(\w+)\s*\([^)]*\)/.test(v.description);
  });
}

/**
 * Extract function call from variable description
 */
function extractFunctionFromDescription(description) {
  if (!description) return null;
  
  var patterns = [
    /(\w+)\s*\([^)]*\)/,  // functionName()
    /(\w+)\s*\([^)]*\)\s*;/,  // functionName();
    /(\w+)\s*\([^)]*\)\s*$/,  // functionName() at end of line
  ];
  
  for (var i = 0; i < patterns.length; i++) {
    var match = description.match(patterns[i]);
    if (match) {
      return match[0].replace(/;+$/, ''); // Remove trailing semicolons
    }
  }
  
  return null;
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Update multiple variables in a collection
 */
async function updateMultipleVariables(collection, updates) {
  var results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (var i = 0; i < updates.length; i++) {
    var update = updates[i];
    try {
      var success = await setVariableValue(collection, update.variableName, update.modeId, update.value);
      if (success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push('Variable not found: ' + update.variableName);
      }
    } catch (error) {
      results.failed++;
      results.errors.push('Error updating ' + update.variableName + ': ' + error.message);
    }
  }
  
  return results;
}

/**
 * Get all variable values for a specific mode
 */
async function getModeValues(collection, modeId) {
  var variables = await getCollectionVariables(collection);
  var values = {};
  
  for (var i = 0; i < variables.length; i++) {
    var variable = variables[i];
    if (variable.valuesByMode[modeId] !== undefined) {
      values[variable.name] = variable.valuesByMode[modeId];
    }
  }
  
  return values;
}

/**
 * Set all variable values for a specific mode
 */
async function setModeValues(collection, modeId, values) {
  var results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (var variableName in values) {
    try {
      var success = await setVariableValue(collection, variableName, modeId, values[variableName]);
      if (success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push('Variable not found: ' + variableName);
      }
    } catch (error) {
      results.failed++;
      results.errors.push('Error updating ' + variableName + ': ' + error.message);
    }
  }
  
  return results;
}

// ============================================================================
// VARIABLE CREATION AND MANAGEMENT
// ============================================================================

/**
 * Create a new variable in a collection
 */
function createVariable(collection, name, type, description) {
  if (!collection) {
    throw new Error('Collection not found');
  }
  name = normalizeVariableName(name);
  var variable = figma.variables.createVariable(name, collection, type);
  if (description) {
    variable.description = description;
  }
  
  return variable;
}

/**
 * Create multiple variables from a configuration
 */
function createVariablesFromConfig(collection, config) {
  var results = {
    created: [],
    errors: []
  };
  
  for (var i = 0; i < config.length; i++) {
    var varConfig = config[i];
    try {
      var variable = createVariable(collection, varConfig.name, varConfig.type, varConfig.description);
      
      // Set initial values if provided
      if (varConfig.values) {
        for (var modeId in varConfig.values) {
          variable.setValueForMode(modeId, varConfig.values[modeId]);
        }
      }
      
      results.created.push(variable);
    } catch (error) {
      results.errors.push('Error creating ' + varConfig.name + ': ' + error.message);
    }
  }
  
  return results;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get collection summary
 */
async function getCollectionSummary(collection) {
  if (!collection) return null;
  
  var variables = await getCollectionVariables(collection);
  var modes = getCollectionModes(collection);
  
  return {
    name: collection.name,
    variableCount: variables.length,
    modeCount: modes.length,
    variables: variables.map(function(v) { return v.name; }),
    modes: modes
  };
}

/**
 * Validate collection configuration
 */
async function validateCollection(collection, requiredVariables, requiredModes) {
  var errors = [];
  
  if (!collection) {
    errors.push('Collection not found');
    return { valid: false, errors: errors };
  }
  
  var variables = await getCollectionVariables(collection);
  var variableNames = variables.map(function(v) { return v.name; });
  
  // Check required variables
  for (var i = 0; i < requiredVariables.length; i++) {
    if (!variableNames.includes(requiredVariables[i])) {
      errors.push('Missing required variable: ' + requiredVariables[i]);
    }
  }
  
  // Check required modes
  var modeNames = collection.modes.map(function(m) { return m.name; });
  for (var j = 0; j < requiredModes.length; j++) {
    if (!modeNames.includes(requiredModes[j])) {
      errors.push('Missing required mode: ' + requiredModes[j]);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Export collection data
 */
async function exportCollectionData(collection) {
  if (!collection) return null;
  
  var variables = await getCollectionVariables(collection);
  var data = {
    name: collection.name,
    modes: collection.modes,
    variables: {}
  };
  
  for (var i = 0; i < variables.length; i++) {
    var variable = variables[i];
    data.variables[variable.name] = {
      id: variable.id,
      type: variable.variableCollectionId,
      description: variable.description,
      values: variable.valuesByMode
    };
  }
  
  return data;
}

// ============================================================================
// DEBUGGING AND LOGGING
// ============================================================================

/**
 * Log collection information
 */
async function logCollectionInfo(collection) {
  if (!collection) {
    console.log('❌ Collection not found');
    return;
  }
  
  var summary = await getCollectionSummary(collection);
  console.log('📚 Collection: "' + summary.name + '"');
  console.log('   Variables: ' + summary.variableCount);
  console.log('   Modes: ' + summary.modeCount);
  console.log('   Variables: [' + summary.variables.join(', ') + ']');
}

/**
 * Log variable values for all modes
 */
async function logVariableValues(collection, variableName) {
  var variable = await getVariable(collection, variableName);
  if (!variable) {
    console.log('❌ Variable not found: ' + variableName);
    return;
  }
  
  console.log('📊 Variable: "' + variableName + '"');
  for (var modeId in variable.valuesByMode) {
    var mode = collection.modes.find(function(m) { return m.modeId === modeId; });
    var modeName = mode ? mode.name : modeId;
    console.log('   ' + modeName + ': ' + variable.valuesByMode[modeId]);
  }
}

// ============================================================================
// ADVANCED VARIABLE OPERATIONS
// ============================================================================

/**
 * Get or create a variable collection (async for documentAccess: dynamic-page)
 */
async function getOrCreateCollection(name) {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var existing = collections.find(function(c) { return c.name === name; });
  
  if (existing) {
    return existing;
  }
  
  var collection = figma.variables.createVariableCollection(name);
  console.log('Created collection: ' + name);
  return collection;
}

/**
 * Setup modes for a collection
 * Figma creates new collections with a default first mode (e.g. "Mode 1").
 * We replace that with only the desired mode names so we don't end up with
 * Mode 1 + Desktop + Tablet + Mobile (or similar).
 */
function setupModes(collection, modeNames) {
  console.log('Setting up modes: ' + modeNames.join(', '));
  
  // 1. Add any missing modes (so we have at least our desired set before removing defaults)
  for (var i = 0; i < modeNames.length; i++) {
    var modeName = modeNames[i];
    var existingMode = collection.modes.find(function(m) { return m.name === modeName; });
    if (!existingMode) {
      collection.addMode(modeName);
    }
  }
  
  // 2. Remove any mode not in our list (e.g. default "Mode 1" from createVariableCollection)
  for (var j = collection.modes.length - 1; j >= 0; j--) {
    var mode = collection.modes[j];
    if (modeNames.indexOf(mode.name) === -1) {
      collection.removeMode(mode.modeId);
    }
  }
  
  console.log('Modes setup complete: ' + collection.modes.map(function(m) { return m.name; }).join(', '));
}

/**
 * Create or update a variable in a collection
 */
async function createOrUpdateVariable(collection, name, config, modes) {
  // Handle both old signature (type, values) and new signature (config, modes)
  var actualConfig, actualModes;
  
  if (typeof config === 'string') {
    // Old signature: createOrUpdateVariable(collection, name, type, values)
    actualConfig = { type: config, values: modes };
    actualModes = Object.keys(modes);
  } else {
    // New signature: createOrUpdateVariable(collection, name, config, modes)
    actualConfig = config;
    actualModes = modes;
  }
  
  name = normalizeVariableName(name);
  var existing = await getVariable(collection, name);
  var action = existing ? 'updated' : 'created';
  
  if (!existing) {
    existing = figma.variables.createVariable(name, collection, actualConfig.type);
  }

  // Set scopes so the variable appears only in the relevant property picker (e.g. FONT_SIZE, LINE_HEIGHT, LETTER_SPACING)
  if (actualConfig.scopes && Array.isArray(actualConfig.scopes) && actualConfig.scopes.length > 0) {
    existing.scopes = actualConfig.scopes;
  }

  // Set values for each mode
  actualModes.forEach(function(modeName) {
    try {
      var mode = collection.modes.find(function(m) { return m.name === modeName; });
      if (!mode) {
        console.error('Mode not found: ' + modeName);
        return;
      }
      
      if (actualConfig.values && actualConfig.values[modeName] !== undefined) {
        var value = actualConfig.values[modeName];
        
        // Validate value
        if (value === null || value === undefined) {
          console.error('Invalid value for mode ' + modeName + ': ' + value);
          return;
        }
        
        // Convert color strings to RGB objects
        if (actualConfig.type === 'COLOR' && typeof value === 'string') {
          value = hexToRgb(value);
          if (!value) {
            console.error('Invalid color value for mode ' + modeName + ': ' + actualConfig.values[modeName]);
            return;
          }
        }
        
        // Validate number values
        if (actualConfig.type === 'FLOAT' && (typeof value !== 'number' || isNaN(value))) {
          console.error('Invalid FLOAT value for mode ' + modeName + ': ' + value + ' (type: ' + typeof value + ')');
          return;
        }
        
        existing.setValueForMode(mode.modeId, value);
        console.log('  ' + modeName + ': ' + (actualConfig.type === 'COLOR' ? rgbToHex(value.r, value.g, value.b) : value));
      }
    } catch (e) {
      console.error('Error setting value for mode ' + modeName + ':', e);
      console.error('Error details:', {
        message: e.message,
        stack: e.stack,
        name: e.name,
        error: e,
        value: actualConfig.values ? actualConfig.values[modeName] : 'undefined',
        type: actualConfig.type
      });
      throw e;
    }
  });
  
  return action;
}

/**
 * Extract modes from a configuration
 */
function extractModes(config) {
  // Get modes from the first variable's values
  var firstVariable = Object.keys(config.variables)[0];
  if (firstVariable && config.variables[firstVariable].values) {
    return Object.keys(config.variables[firstVariable].values);
  }
  return ["Default"];
}

/**
 * Process multiple variables
 */
async function processVariables(collection, variables, configValues, modes) {
  var stats = { created: 0, updated: 0, skipped: 0 };
  
  console.log('Processing ' + Object.keys(variables).length + ' variables...');
  
  var varNames = Object.keys(variables);
  for (var idx = 0; idx < varNames.length; idx++) {
    var varName = varNames[idx];
    try {
      var varConfig = variables[varName];
      console.log('Processing variable: ' + varName);
      
      var calculatedConfig = {
        type: varConfig.type,
        values: {}
      };
      if (varConfig.scopes && Array.isArray(varConfig.scopes)) {
        calculatedConfig.scopes = varConfig.scopes;
      }

      modes.forEach(function(mode) {
        if (varConfig.values && varConfig.values[mode]) {
          try {
            if (typeof varConfig.values[mode] === 'function') {
              calculatedConfig.values[mode] = varConfig.values[mode](configValues);
            } else {
              calculatedConfig.values[mode] = varConfig.values[mode];
            }
          } catch (e) {
            console.error('Error calculating value for mode ' + mode + ':', e);
            throw e;
          }
        }
      });
      
      var result = await createOrUpdateVariable(collection, varName, calculatedConfig, modes);
      stats[result]++;
    } catch (e) {
      console.error('Error processing variable ' + varName + ':', e);
      console.error('Error details:', {
        message: e.message,
        stack: e.stack,
        name: e.name,
        error: e
      });
      stats.skipped++;
    }
  }
  
  return stats;
}

// Helper functions for color conversion (needed by createOrUpdateVariable)
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

// ============================================================================
// VARIABLE ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Collect variables from a node and add to the usedVariables Map (async for getVariableByIdAsync)
 */
async function collectNodeVariables(node, usedVariables) {
  try {
    if (!node || !node.boundVariables || typeof node.boundVariables !== 'object') return;
    
    for (var property in node.boundVariables) {
      try {
        var binding = node.boundVariables[property];
        if (!binding) continue;
        
        var variableId = binding.id || (binding[0] && binding[0].id);
        if (!variableId) continue;
        
        var variable = await figma.variables.getVariableByIdAsync(variableId);
        if (!variable || !variable.name) continue;
        
        var key = variable.name + '::' + property;
        if (!usedVariables.has(key)) {
          usedVariables.set(key, {
            variable: variable,
            property: property,
            nodes: [],
            nodeIds: []
          });
        }
        
        var varData = usedVariables.get(key);
        if (varData && Array.isArray(varData.nodes) && Array.isArray(varData.nodeIds)) {
          varData.nodes.push(node.name || 'Unnamed');
          varData.nodeIds.push(node.id);
        }
      } catch (e) {
        console.warn('Error processing variable binding for property ' + property + ' on node ' + node.id + ':', e.message);
      }
    }
  } catch (e) {
    console.warn('Error collecting variables from node ' + (node ? node.id : 'unknown') + ':', e.message);
  }
}

/**
 * Categorize a variable by its name and property
 */
function categorizeVariable(variableName, property) {
  var name = variableName.toLowerCase();
  var prop = property.toLowerCase();
  
  // Typography
  if (prop.includes('font') || prop.includes('text') || name.includes('typography') || name.includes('font')) {
    return 'typography';
  }
  
  // Color
  if (prop.includes('color') || prop.includes('fill') || prop.includes('stroke') || name.includes('color')) {
    return 'color';
  }
  
  // Dimensions
  if (prop.includes('width') || prop.includes('height') || prop.includes('padding') || prop.includes('margin') || 
      prop.includes('radius') || prop.includes('gap') || prop.includes('spacing') || name.includes('spacing') || 
      name.includes('padding') || name.includes('margin') || name.includes('radius')) {
    return 'dimensions';
  }
  
  // Grid
  if (name.includes('grid') || name.includes('column') || name.includes('row')) {
    return 'grid';
  }
  
  // Effects
  if (prop.includes('effect') || prop.includes('shadow') || prop.includes('blur') || name.includes('effect') || 
      name.includes('shadow') || name.includes('blur')) {
    return 'effects';
  }
  
  // Default to dimensions for unknown
  return 'dimensions';
}

/**
 * Create a variable result for display
 */
function createVariableResult(varData) {
  try {
    if (!varData || !varData.variable || !varData.property) {
      return createHtmlResult('<div class="error-text">❌ Invalid variable data</div>');
    }
    
    var variable = varData.variable;
    var property = varData.property;
    var nodes = varData.nodes || [];
    var nodeIds = varData.nodeIds || [];
    
    var html = [];
    html.push('<div class="info-entry" onclick="selectNodes([\'' + nodeIds.join('\',\'') + '\'])">');
    html.push('  <div class="info-entry-icon">📊</div>');
    html.push('  <div class="info-entry-content">');
    html.push('    <div class="info-entry-title">' + (variable.name || 'Unknown Variable') + '</div>');
    html.push('    <div class="info-entry-subtitle">' + (property || 'Unknown Property') + '</div>');
    
    // Add visual preview for variables
    try {
      var preview = createVariablePreview(variable, property);
      if (preview) {
        html.push('    <div class="variable-preview">' + preview + '</div>');
      }
    } catch (e) {
      console.warn('Error creating variable preview:', e.message);
    }
    
    if (nodes.length > 0) {
      html.push('    <div class="info-entry-badge">' + nodes.length + ' node' + (nodes.length !== 1 ? 's' : '') + '</div>');
    }
    
    html.push('  </div>');
    html.push('</div>');
    
    return createHtmlResult(html.join(''));
  } catch (e) {
    console.warn('Error creating variable result:', e.message);
    return createHtmlResult('<div class="error-text">❌ Error displaying variable</div>');
  }
}

/**
 * Create a visual preview for a variable
 */
function createVariablePreview(variable, property) {
  try {
    if (!variable || !property) return null;
    
    // Get the first mode value for preview
    var modeIds = Object.keys(variable.valuesByMode);
    if (modeIds.length === 0) return null;
    
    var value = variable.valuesByMode[modeIds[0]];
    if (!value) return null;
    
    var preview = '';
    
    // Color variables
    if (property.includes('fill') || property.includes('stroke') || property.includes('color')) {
      if (value.type === 'VARIABLE_ALIAS') {
        preview = '<div class="color-preview" style="background-color: var(--' + value.id + '); width: 20px; height: 20px; border-radius: 3px; display: inline-block; margin-right: 8px;"></div>';
      } else if (value.type === 'VARIABLE_ALIAS') {
        preview = '<div class="color-preview" style="background-color: var(--' + value.id + '); width: 20px; height: 20px; border-radius: 3px; display: inline-block; margin-right: 8px;"></div>';
      }
    }
    
    // Typography variables
    if (property.includes('font') || property.includes('text')) {
      if (value.type === 'VARIABLE_ALIAS') {
        preview = '<span class="typography-preview" style="font-family: var(--' + value.id + '); font-size: 12px;">Aa</span>';
      }
    }
    
    return preview;
  } catch (e) {
    console.warn('Error creating variable preview:', e.message);
    return null;
  }
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAllCollections,
    getCollection,
    getVariable,
    getVariableValue,
    setVariableValue,
    getCollectionVariables,
    getCollectionModes,
    getModeByName,
    findVariablesByPattern,
    findSmartVariables,
    extractFunctionFromDescription,
    updateMultipleVariables,
    getModeValues,
    setModeValues,
    createVariable,
    createVariablesFromConfig,
    getCollectionSummary,
    validateCollection,
    exportCollectionData,
    logCollectionInfo,
    logVariableValues,
    getOrCreateCollection,
    setupModes,
    createOrUpdateVariable,
    extractModes,
    processVariables,
    
    // Variable Analysis Functions
    collectNodeVariables,
    categorizeVariable,
    createVariableResult,
    createVariablePreview
  };
}
