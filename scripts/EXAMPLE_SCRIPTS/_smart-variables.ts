// Smart Variables - Dynamic Variable System
// Variables with executable functions stored in descriptions that automatically calculate values

console.log('🧠 Smart Variables - Dynamic Variable System');
console.log('==============================================');

// Configuration
var CONFIG = {
  // Which collections to process (empty array = all collections)
  targetCollections: [],
  
  // Whether to process only selected variables or all variables
  selectedOnly: false,
  
  // Whether to show detailed execution logs
  verboseLogging: true,
  
  // Whether to update variables or just preview changes
  previewMode: false
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function executeSmartVariables() {
  try {
    console.log('🔍 Scanning for smart variables...');
    
    // Get all variable collections
    var collections = figma.variables.getLocalVariableCollections();
    var processedVariables = 0;
    var updatedVariables = 0;
    
    for (var colIndex = 0; colIndex < collections.length; colIndex++) {
      var collection = collections[colIndex];
      
      // Skip if target collections specified and this one not included
      if (CONFIG.targetCollections.length > 0 && !CONFIG.targetCollections.includes(collection.name)) {
        continue;
      }
      
      console.log('📚 Processing collection: "' + collection.name + '"');
      
      for (var varIndex = 0; varIndex < collection.variableIds.length; varIndex++) {
        var variableId = collection.variableIds[varIndex];
        var variable = figma.variables.getVariableById(variableId);
        
        if (!variable) continue;
        
        // Check if variable has a function in its description
        var functionCall = extractFunctionFromDescription(variable.description);
        if (!functionCall) continue;
        
        console.log('🧠 Found smart variable: "' + variable.name + '"');
        console.log('📝 Function: ' + functionCall);
        
        try {
          // Execute the function and get new values
          var newValues = await executeVariableFunction(variable, functionCall, collection);
          
          if (newValues && Object.keys(newValues).length > 0) {
            processedVariables++;
            
            if (CONFIG.previewMode) {
              console.log('👁️ PREVIEW - Would update "' + variable.name + '":');
              for (var modeId in newValues) {
                var mode = collection.modes.find(m => m.modeId === modeId);
                console.log('   ' + (mode ? mode.name : modeId) + ': ' + newValues[modeId]);
              }
            } else {
              // Update the variable with new values
              for (var modeId in newValues) {
                variable.setValueForMode(modeId, newValues[modeId]);
              }
              updatedVariables++;
              console.log('✅ Updated "' + variable.name + '"');
            }
          }
        } catch (error) {
          console.log('❌ Error processing "' + variable.name + '": ' + error.message);
        }
      }
    }
    
    console.log('');
    console.log('📊 Results:');
    console.log('✅ Processed variables: ' + processedVariables);
    if (!CONFIG.previewMode) {
      console.log('✅ Updated variables: ' + updatedVariables);
    } else {
      console.log('👁️ Preview mode - no variables were updated');
    }
    
    if (updatedVariables > 0) {
      figma.notify('✅ Updated ' + updatedVariables + ' smart variables');
    } else if (processedVariables > 0) {
      figma.notify('👁️ Previewed ' + processedVariables + ' smart variables');
    } else {
      figma.notify('No smart variables found');
    }
    
  } catch (error) {
    console.log('❌ Error: ' + error.message);
    figma.notify('❌ Error: ' + error.message);
  }
}

// ============================================================================
// FUNCTION EXTRACTION
// ============================================================================

function extractFunctionFromDescription(description) {
  if (!description) return null;
  
  // Look for function calls in the format: functionName() or functionName(args)
  var functionRegex = /(\w+)\s*\([^)]*\)/;
  var match = description.match(functionRegex);
  
  if (match) {
    return match[0]; // Return the full function call
  }
  
  return null;
}

// ============================================================================
// FUNCTION EXECUTION
// ============================================================================

async function executeVariableFunction(variable, functionCall, collection) {
  // Create a safe execution context
  var context = {
    variable: variable,
    collection: collection,
    figmaCollection: function() { return collection; },
    // Add helper functions for accessing other variables
    getVariable: function(name) {
      for (var i = 0; i < collection.variableIds.length; i++) {
        var varId = collection.variableIds[i];
        var varObj = figma.variables.getVariableById(varId);
        if (varObj && varObj.name === name) {
          return varObj;
        }
      }
      return null;
    },
    getVariableValue: function(name, modeId) {
      var varObj = context.getVariable(name);
      if (varObj) {
        return varObj.valuesByMode[modeId];
      }
      return null;
    }
  };
  
  // Parse function call to extract function name and arguments
  var functionMatch = functionCall.match(/(\w+)\s*\(([^)]*)\)/);
  if (!functionMatch) {
    throw new Error('Invalid function call format');
  }
  
  var functionName = functionMatch[1];
  var argsString = functionMatch[2];
  
  // Parse arguments
  var args = [];
  if (argsString.trim()) {
    args = argsString.split(',').map(function(arg) {
      return arg.trim();
    });
  }
  
  // Create the function dynamically
  var functionCode = 'function ' + functionName + '() {';
  
  // Add helper functions to the execution context
  functionCode += `
    var figmaCollection = function() { return collection; };
    var getVariable = function(name) {
      for (var i = 0; i < collection.variableIds.length; i++) {
        var varId = collection.variableIds[i];
        var varObj = figma.variables.getVariableById(varId);
        if (varObj && varObj.name === name) {
          return varObj;
        }
      }
      return null;
    };
    var getVariableValue = function(name, modeId) {
      var varObj = getVariable(name);
      if (varObj) {
        return varObj.valuesByMode[modeId];
      }
      return null;
    };
  `;
  
  // Add the function body (this would need to be defined elsewhere)
  functionCode += getFunctionBody(functionName);
  functionCode += '}';
  
  // Execute the function for each mode
  var newValues = {};
  
  for (var modeIndex = 0; modeIndex < collection.modes.length; modeIndex++) {
    var mode = collection.modes[modeIndex];
    var modeId = mode.modeId;
    
    try {
      // Create mode-specific context
      var modeContext = {
        collection: collection,
        variable: variable,
        modeId: modeId,
        mode: mode,
        figmaCollection: function() { return collection; },
        getVariable: context.getVariable,
        getVariableValue: function(name) { return context.getVariableValue(name, modeId); }
      };
      
      // Execute function (this is a simplified version - would need proper execution)
      var result = await executeFunctionSafely(functionName, args, modeContext);
      
      if (result !== null && result !== undefined) {
        newValues[modeId] = result;
      }
    } catch (error) {
      console.log('⚠️ Error in mode "' + mode.name + '": ' + error.message);
    }
  }
  
  return newValues;
}

// ============================================================================
// FUNCTION DEFINITIONS
// ============================================================================

function getFunctionBody(functionName) {
  // This would contain the actual function definitions
  // For now, return a simple example
  var functions = {
    'exampleFunction': `
      var num = 12;
      return num;
    `,
    'calculateFontSize': `
      var baseFontSize = 16;
      var multiplier = 1.5;
      return baseFontSize * multiplier;
    `,
    'getBaseFontSize': `
      var baseVar = getVariable('base-font-size');
      if (baseVar) {
        return baseVar.valuesByMode[modeId];
      }
      return 16;
    `
  };
  
  return functions[functionName] || 'return null;';
}

// ============================================================================
// SAFE EXECUTION
// ============================================================================

async function executeFunctionSafely(functionName, args, context) {
  // This is a simplified version - in reality, you'd need a proper JavaScript parser/executor
  // For now, we'll use a simple switch statement for predefined functions
  
  switch (functionName) {
    case 'exampleFunction':
      return 12;
      
    case 'calculateFontSize':
      var baseFontSize = 16;
      var multiplier = args.length > 0 ? parseFloat(args[0]) : 1.5;
      return baseFontSize * multiplier;
      
    case 'getBaseFontSize':
      var baseVar = context.getVariable('base-font-size');
      if (baseVar) {
        return baseVar.valuesByMode[context.modeId];
      }
      return 16;
      
    default:
      console.log('⚠️ Unknown function: ' + functionName);
      return null;
  }
}

// ============================================================================
// RUN THE SCRIPT
// ============================================================================

executeSmartVariables();
