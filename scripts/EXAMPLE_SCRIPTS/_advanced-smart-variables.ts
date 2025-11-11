// Advanced Smart Variables - Dynamic Variable System with JavaScript Execution
// Variables with executable JavaScript functions stored in descriptions

console.log('🧠 Advanced Smart Variables - Dynamic Variable System');
console.log('======================================================');

// Configuration
var CONFIG = {
  targetCollections: [],
  selectedOnly: false,
  verboseLogging: true,
  previewMode: false,
  // Security: Only allow certain function names
  allowedFunctions: ['calculateFontSize', 'getBaseValue', 'multiplyValue', 'addValue', 'getVariableValue']
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function executeAdvancedSmartVariables() {
  try {
    console.log('🔍 Scanning for smart variables...');
    
    var collections = figma.variables.getLocalVariableCollections();
    var processedVariables = 0;
    var updatedVariables = 0;
    
    for (var colIndex = 0; colIndex < collections.length; colIndex++) {
      var collection = collections[colIndex];
      
      if (CONFIG.targetCollections.length > 0 && !CONFIG.targetCollections.includes(collection.name)) {
        continue;
      }
      
      console.log('📚 Processing collection: "' + collection.name + '"');
      
      for (var varIndex = 0; varIndex < collection.variableIds.length; varIndex++) {
        var variableId = collection.variableIds[varIndex];
        var variable = figma.variables.getVariableById(variableId);
        
        if (!variable) continue;
        
        var functionCall = extractFunctionFromDescription(variable.description);
        if (!functionCall) continue;
        
        console.log('🧠 Found smart variable: "' + variable.name + '"');
        console.log('📝 Function: ' + functionCall);
        
        try {
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
  
  // Look for function calls in various formats
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
// FUNCTION EXECUTION
// ============================================================================

async function executeVariableFunction(variable, functionCall, collection) {
  // Parse function call
  var functionMatch = functionCall.match(/(\w+)\s*\(([^)]*)\)/);
  if (!functionMatch) {
    throw new Error('Invalid function call format');
  }
  
  var functionName = functionMatch[1];
  var argsString = functionMatch[2];
  
  // Check if function is allowed
  if (CONFIG.allowedFunctions.length > 0 && !CONFIG.allowedFunctions.includes(functionName)) {
    throw new Error('Function "' + functionName + '" is not allowed');
  }
  
  // Parse arguments
  var args = [];
  if (argsString.trim()) {
    args = argsString.split(',').map(function(arg) {
      return arg.trim().replace(/['"]/g, ''); // Remove quotes
    });
  }
  
  // Execute function for each mode
  var newValues = {};
  
  for (var modeIndex = 0; modeIndex < collection.modes.length; modeIndex++) {
    var mode = collection.modes[modeIndex];
    var modeId = mode.modeId;
    
    try {
      var result = await executeFunction(functionName, args, variable, collection, modeId);
      
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
// FUNCTION EXECUTOR
// ============================================================================

async function executeFunction(functionName, args, variable, collection, modeId) {
  // Create helper functions for accessing other variables
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
  
  var getVariableValue = function(name) {
    var varObj = getVariable(name);
    if (varObj && varObj.valuesByMode[modeId] !== undefined) {
      return varObj.valuesByMode[modeId];
    }
    return null;
  };
  
  var getCurrentValue = function() {
    return variable.valuesByMode[modeId];
  };
  
  // Execute based on function name
  switch (functionName) {
    case 'calculateFontSize':
      var baseSize = args.length > 0 ? parseFloat(args[0]) : 16;
      var multiplier = args.length > 1 ? parseFloat(args[1]) : 1.5;
      return baseSize * multiplier;
      
    case 'getBaseValue':
      var varName = args.length > 0 ? args[0] : 'base-font-size';
      return getVariableValue(varName) || 16;
      
    case 'multiplyValue':
      var sourceVar = args.length > 0 ? args[0] : variable.name;
      var mult = args.length > 1 ? parseFloat(args[1]) : 2;
      var sourceValue = sourceVar === variable.name ? getCurrentValue() : getVariableValue(sourceVar);
      return sourceValue ? sourceValue * mult : null;
      
    case 'addValue':
      var sourceVar2 = args.length > 0 ? args[0] : variable.name;
      var add = args.length > 1 ? parseFloat(args[1]) : 0;
      var sourceValue2 = sourceVar2 === variable.name ? getCurrentValue() : getVariableValue(sourceVar2);
      return sourceValue2 ? sourceValue2 + add : null;
      
    case 'getVariableValue':
      var varName2 = args.length > 0 ? args[0] : 'base-font-size';
      return getVariableValue(varName2);
      
    case 'exampleFunction':
      return 12;
      
    default:
      console.log('⚠️ Unknown function: ' + functionName);
      return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function createSmartVariable(collectionName, variableName, description, functionCall) {
  var collection = figma.variables.getLocalVariableCollections().find(c => c.name === collectionName);
  if (!collection) {
    console.log('❌ Collection not found: ' + collectionName);
    return null;
  }
  
  // Create variable with function in description
  var variable = figma.variables.createVariable(variableName, collection, 'FLOAT');
  variable.description = description + '\n\nFunction: ' + functionCall;
  
  console.log('✅ Created smart variable: "' + variableName + '"');
  return variable;
}

// ============================================================================
// EXAMPLES
// ============================================================================

function createExampleSmartVariables() {
  console.log('📝 Creating example smart variables...');
  
  // Example 1: Simple calculation
  createSmartVariable(
    'Design System',
    'large-font-size',
    'Large font size calculated from base',
    'calculateFontSize(16, 1.5)'
  );
  
  // Example 2: Reference other variable
  createSmartVariable(
    'Design System',
    'extra-large-font-size',
    'Extra large font size based on large font size',
    'multiplyValue(large-font-size, 1.2)'
  );
  
  // Example 3: Get base value
  createSmartVariable(
    'Design System',
    'medium-font-size',
    'Medium font size from base',
    'getBaseValue(base-font-size)'
  );
}

// ============================================================================
// RUN THE SCRIPT
// ============================================================================

// Uncomment to create examples first
// createExampleSmartVariables();

executeAdvancedSmartVariables();
