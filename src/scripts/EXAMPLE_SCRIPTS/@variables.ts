// @Variables
// Provides functions for manipulating Figma variables, collections, and modes

console.log('📚 @Variables - Core Variable Management Library');

// ============================================================================
// CORE VARIABLE FUNCTIONS
// ============================================================================

/**
 * Get all variable collections
 */
function getAllCollections() {
  return figma.variables.getLocalVariableCollections();
}

/**
 * Get collection by name
 */
function getCollection(name) {
  var collections = getAllCollections();
  return collections.find(function(c) { return c.name === name; });
}

/**
 * Get variable by name from a collection
 */
function getVariable(collection, variableName) {
  if (!collection) return null;
  
  for (var i = 0; i < collection.variableIds.length; i++) {
    var variableId = collection.variableIds[i];
    var variable = figma.variables.getVariableById(variableId);
    if (variable && variable.name === variableName) {
      return variable;
    }
  }
  return null;
}

/**
 * Get variable value for a specific mode
 */
function getVariableValue(collection, variableName, modeId) {
  var variable = getVariable(collection, variableName);
  if (variable && variable.valuesByMode[modeId] !== undefined) {
    return variable.valuesByMode[modeId];
  }
  return null;
}

/**
 * Set variable value for a specific mode
 */
function setVariableValue(collection, variableName, modeId, value) {
  var variable = getVariable(collection, variableName);
  if (variable) {
    variable.setValueForMode(modeId, value);
    return true;
  }
  return false;
}

/**
 * Get all variables in a collection
 */
function getCollectionVariables(collection) {
  if (!collection) return [];
  
  var variables = [];
  for (var i = 0; i < collection.variableIds.length; i++) {
    var variableId = collection.variableIds[i];
    var variable = figma.variables.getVariableById(variableId);
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
function findVariablesByPattern(collection, pattern) {
  var variables = getCollectionVariables(collection);
  var regex = new RegExp(pattern, 'i');
  return variables.filter(function(v) { return regex.test(v.name); });
}

/**
 * Find variables with function calls in description
 */
function findSmartVariables(collection) {
  var variables = getCollectionVariables(collection);
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
function updateMultipleVariables(collection, updates) {
  var results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (var i = 0; i < updates.length; i++) {
    var update = updates[i];
    try {
      var success = setVariableValue(collection, update.variableName, update.modeId, update.value);
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
function getModeValues(collection, modeId) {
  var variables = getCollectionVariables(collection);
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
function setModeValues(collection, modeId, values) {
  var results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (var variableName in values) {
    try {
      var success = setVariableValue(collection, variableName, modeId, values[variableName]);
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
function getCollectionSummary(collection) {
  if (!collection) return null;
  
  var variables = getCollectionVariables(collection);
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
function validateCollection(collection, requiredVariables, requiredModes) {
  var errors = [];
  
  if (!collection) {
    errors.push('Collection not found');
    return { valid: false, errors: errors };
  }
  
  var variables = getCollectionVariables(collection);
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
function exportCollectionData(collection) {
  if (!collection) return null;
  
  var variables = getCollectionVariables(collection);
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
function logCollectionInfo(collection) {
  if (!collection) {
    console.log('❌ Collection not found');
    return;
  }
  
  var summary = getCollectionSummary(collection);
  console.log('📚 Collection: "' + summary.name + '"');
  console.log('   Variables: ' + summary.variableCount);
  console.log('   Modes: ' + summary.modeCount);
  console.log('   Variables: [' + summary.variables.join(', ') + ']');
}

/**
 * Log variable values for all modes
 */
function logVariableValues(collection, variableName) {
  var variable = getVariable(collection, variableName);
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
 * Get or create a variable collection
 */
function getOrCreateCollection(name) {
  var collections = figma.variables.getLocalVariableCollections();
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
 */
function setupModes(collection, modeNames) {
  console.log('Setting up modes: ' + modeNames.join(', '));
  
  // Remove extra modes
  while (collection.modes.length > modeNames.length) {
    collection.removeMode(collection.modes[collection.modes.length - 1].modeId);
  }
  
  // Add missing modes
  for (var i = 0; i < modeNames.length; i++) {
    var modeName = modeNames[i];
    var existingMode = collection.modes.find(function(m) { return m.name === modeName; });
    
    if (!existingMode) {
      collection.addMode(modeName);
    }
  }
  
  console.log('Modes setup complete: ' + collection.modes.map(function(m) { return m.name; }).join(', '));
}

/**
 * Create or update a variable in a collection
 */
function createOrUpdateVariable(collection, name, config, modes) {
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
  
  var existing = getVariable(collection, name);
  var action = existing ? 'updated' : 'created';
  
  if (!existing) {
    existing = figma.variables.createVariable(name, collection, actualConfig.type);
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
      
      existing.setValueForMode(mode.modeId, value);
      console.log('  ' + modeName + ': ' + (actualConfig.type === 'COLOR' ? rgbToHex(value.r, value.g, value.b) : value));
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
    processVariables
  };
}
