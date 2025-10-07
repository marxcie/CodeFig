// Simple Smart Variables - Uses @Variables library
// Executes functions stored in variable descriptions

console.log('🧠 Simple Smart Variables');
console.log('=========================');

// Import the @Variables library
@import * from "@Variables"

// ============================================================================
// CONFIGURATION
// ============================================================================

var CONFIG = {
  // Target collections (empty array = all collections)
  targetCollections: [],
  
  // Whether to preview changes or actually update
  previewMode: false,
  
  // Allowed functions for security
  allowedFunctions: [
    'calculateFontSize',
    'getBaseValue', 
    'multiplyValue',
    'addValue',
    'getVariableValue'
  ]
};

// ============================================================================
// FUNCTION EXECUTORS
// ============================================================================

function executeFunction(functionName, args, variable, collection, modeId) {
  // Helper functions for accessing other variables
  var getVariableValue = function(name) {
    return getVariableValue(collection, name, modeId);
  };
  
  var getCurrentValue = function() {
    return getVariableValue(collection, variable.name, modeId);
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
      
    default:
      console.log('⚠️ Unknown function: ' + functionName);
      return null;
  }
}

// ============================================================================
// FUNCTION PARSING
// ============================================================================

function parseFunctionCall(functionCall) {
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
      return arg.trim().replace(/['"]/g, '');
    });
  }
  
  return { functionName: functionName, args: args };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function executeSmartVariables() {
  try {
    console.log('🔍 Scanning for smart variables...');
    
    var collections = CONFIG.targetCollections.length > 0 
      ? CONFIG.targetCollections.map(function(name) { return getCollection(name); }).filter(Boolean)
      : getAllCollections();
    
    var processedVariables = 0;
    var updatedVariables = 0;
    
    for (var colIndex = 0; colIndex < collections.length; colIndex++) {
      var collection = collections[colIndex];
      
      console.log('📚 Processing collection: "' + collection.name + '"');
      
      // Find smart variables in this collection
      var smartVariables = findSmartVariables(collection);
      console.log('🧠 Found ' + smartVariables.length + ' smart variables');
      
      for (var varIndex = 0; varIndex < smartVariables.length; varIndex++) {
        var variable = smartVariables[varIndex];
        var functionCall = extractFunctionFromDescription(variable.description);
        
        if (!functionCall) continue;
        
        console.log('🔧 Processing: "' + variable.name + '"');
        console.log('📝 Function: ' + functionCall);
        
        try {
          // Parse function call
          var parsed = parseFunctionCall(functionCall);
          
          // Check if function is allowed
          if (CONFIG.allowedFunctions.length > 0 && !CONFIG.allowedFunctions.includes(parsed.functionName)) {
            console.log('⚠️ Function not allowed: ' + parsed.functionName);
            continue;
          }
          
          // Execute function for each mode
          var newValues = {};
          var modes = getCollectionModes(collection);
          
          for (var modeIndex = 0; modeIndex < modes.length; modeIndex++) {
            var modeId = modes[modeIndex];
            var mode = collection.modes.find(function(m) { return m.modeId === modeId; });
            
            try {
              var result = executeFunction(parsed.functionName, parsed.args, variable, collection, modeId);
              
              if (result !== null && result !== undefined) {
                newValues[modeId] = result;
                console.log('   ' + (mode ? mode.name : modeId) + ': ' + result);
              }
            } catch (error) {
              console.log('   ⚠️ Error in mode ' + (mode ? mode.name : modeId) + ': ' + error.message);
            }
          }
          
          if (Object.keys(newValues).length > 0) {
            processedVariables++;
            
            if (CONFIG.previewMode) {
              console.log('👁️ PREVIEW - Would update "' + variable.name + '":');
              for (var modeId in newValues) {
                var mode = collection.modes.find(function(m) { return m.modeId === modeId; });
                console.log('   ' + (mode ? mode.name : modeId) + ': ' + newValues[modeId]);
              }
            } else {
              // Update the variable
              for (var modeId in newValues) {
                setVariableValue(collection, variable.name, modeId, newValues[modeId]);
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
// RUN THE SCRIPT
// ============================================================================

executeSmartVariables();
