// Batch Rename Variables
// Rename variables in a collection with flexible naming patterns

@import { getAllCollections, getCollection, getCollectionVariables, getVariable } from "@Variables"

// ============================================================================
// CONFIGURATION
// ============================================================================

// Collection to target (exact name match)
var collectionName = "colors / pine";

// Group filter - empty string or "/" for root, or specific group path
// Variables are filtered by whether their name starts with this group path
var groupFilter = ""; // e.g., "" or "/" for root, or "colors/pine" for specific group

// Variable names to rename - "*" for all, or array of specific names
var variableNames = "*";
// var variableNames = ["50", "100", "150"];

// Rename configuration
// Define your pattern components
var renamePrefix = "pine";
var renameSuffix = "color";
var renameSequence = 50;
var renameStartNumber = 0;

// Define the rename pattern template
// Use: {currentName}, {numberAscending}, {numberDescending} as placeholders
// Use: renamePrefix, renameSuffix, renameSequence, renameStartNumber as variables
// Example patterns:
//   renamePrefix + "-" + "{currentName}" + "-" + renameSuffix
//   renamePrefix + "-" + "{numberAscending}"
//   renamePrefix + "-" + "{numberDescending}" + "-" + renameSuffix
var renamePattern = renamePrefix + "-" + "{currentName}" + "-" + renameSuffix;
// var renamePattern = renamePrefix + "-" + "{numberAscending}";
// var renamePattern = renamePrefix + "-" + "{numberDescending}" + "-" + renameSuffix;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse the rename pattern template
 */
function parseRenamePattern(patternString) {
  // Replace variable references with their values
  var pattern = patternString
    .replace(/renamePrefix/g, renamePrefix || "")
    .replace(/renameSuffix/g, renameSuffix || "")
    .replace(/renameSequence/g, renameSequence || 1)
    .replace(/renameStartNumber/g, renameStartNumber || 0);
  
  return {
    template: pattern,
    hasCurrentName: pattern.indexOf("{currentName}") !== -1,
    hasNumberAscending: pattern.indexOf("{numberAscending}") !== -1,
    hasNumberDescending: pattern.indexOf("{numberDescending}") !== -1,
    sequence: renameSequence || 1,
    startNumber: renameStartNumber || 0
  };
}

/**
 * Generate new name based on pattern template
 */
function generateNewName(variable, index, total, patternConfig) {
  var nameParts = variable.name.split("/");
  var baseName = nameParts.pop(); // Last part (the actual variable name)
  var groupPath = nameParts.length > 0 ? nameParts.join("/") + "/" : "";
  
  var newName = patternConfig.template;
  
  // Replace {currentName} with the variable's current name
  if (patternConfig.hasCurrentName) {
    newName = newName.replace(/{currentName}/g, variable.name);
  }
  
  // Replace {numberAscending} with ascending number
  if (patternConfig.hasNumberAscending) {
    var numberValue = index * patternConfig.sequence;
    newName = newName.replace(/{numberAscending}/g, numberValue.toString());
  }
  
  // Replace {numberDescending} with descending number
  if (patternConfig.hasNumberDescending) {
    var numberValue = patternConfig.startNumber + (total - 1 - index) * patternConfig.sequence;
    newName = newName.replace(/{numberDescending}/g, numberValue.toString());
  }
  
  // If using numbers but not currentName, preserve group path
  if ((patternConfig.hasNumberAscending || patternConfig.hasNumberDescending) && !patternConfig.hasCurrentName) {
    newName = groupPath + newName;
  }
  
  return newName;
}

/**
 * Filter variables by group
 */
function filterByGroup(variables, groupFilter) {
  if (!groupFilter || groupFilter === "" || groupFilter === "/") {
    // Return variables at root level (no "/" in name)
    return variables.filter(function(v) {
      return v.name.indexOf("/") === -1;
    });
  }
  
  // Normalize group filter (remove leading/trailing slashes)
  var normalizedGroup = groupFilter.replace(/^\/+|\/+$/g, "");
  
  // Filter by group path - variable name should start with group path
  return variables.filter(function(v) {
    // Check if variable name starts with the group path
    // e.g., group "colors/pine" matches "colors/pine/50" or "colors/pine"
    return v.name === normalizedGroup || v.name.startsWith(normalizedGroup + "/");
  });
}

/**
 * Filter variables by name pattern
 */
function filterByName(variables, namePattern) {
  if (namePattern === "*") {
    return variables;
  }
  
  if (Array.isArray(namePattern)) {
    return variables.filter(function(v) {
      // Extract variable name (last part after "/")
      var varName = v.name.split("/").pop();
      return namePattern.indexOf(varName) !== -1 || namePattern.indexOf(v.name) !== -1;
    });
  }
  
  // Treat as wildcard pattern
  var regex = new RegExp(namePattern.replace(/\*/g, ".*"), "i");
  return variables.filter(function(v) {
    var varName = v.name.split("/").pop();
    return regex.test(varName) || regex.test(v.name);
  });
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

function batchRenameVariables() {
  try {
    console.log('🔄 Batch Rename Variables');
    console.log('========================');
    
    // Get collection
    var collection = getCollection(collectionName);
    if (!collection) {
      console.log('❌ Collection not found: "' + collectionName + '"');
      figma.notify('❌ Collection not found: ' + collectionName);
      return;
    }
    
    console.log('📦 Collection: "' + collection.name + '"');
    
    // Get all variables in collection
    var allVariables = getCollectionVariables(collection);
    console.log('📋 Found ' + allVariables.length + ' variables in collection');
    
    // Filter by group
    var filteredByGroup = filterByGroup(allVariables, groupFilter);
    console.log('📁 After group filter: ' + filteredByGroup.length + ' variables');
    
    // Filter by name
    var filteredByName = filterByName(filteredByGroup, variableNames);
    console.log('🏷️ After name filter: ' + filteredByName.length + ' variables');
    
    if (filteredByName.length === 0) {
      console.log('⚠️ No variables match the filters');
      figma.notify('⚠️ No variables match the filters');
      return;
    }
    
    // Parse rename pattern
    var patternConfig = parseRenamePattern(renamePattern);
    console.log('📝 Rename pattern:');
    console.log('   Template: "' + patternConfig.template + '"');
    console.log('   Components:');
    if (patternConfig.hasCurrentName) {
      console.log('     - {currentName}');
    }
    if (patternConfig.hasNumberAscending) {
      console.log('     - {numberAscending} (sequence: ' + patternConfig.sequence + ')');
    }
    if (patternConfig.hasNumberDescending) {
      console.log('     - {numberDescending} (sequence: ' + patternConfig.sequence + ', start: ' + patternConfig.startNumber + ')');
    }
    
    // Sort variables for consistent numbering
    var sortedVariables = filteredByName.slice().sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
    
    // Generate new names and rename
    var renamedCount = 0;
    var errors = [];
    
    for (var i = 0; i < sortedVariables.length; i++) {
      var variable = sortedVariables[i];
      var newName = generateNewName(variable, i, sortedVariables.length, patternConfig);
      
      if (newName === variable.name) {
        console.log('⏭️ Skipping "' + variable.name + '" (name unchanged)');
        continue;
      }
      
      try {
        // Check if name already exists
        var existingVar = getVariable(collection, newName);
        if (existingVar && existingVar.id !== variable.id) {
          console.log('⚠️ Skipping "' + variable.name + '" → "' + newName + '" (name already exists)');
          errors.push('Name already exists: ' + newName);
          continue;
        }
        
        variable.name = newName;
        console.log('✅ Renamed: "' + variable.name + '" → "' + newName + '"');
        renamedCount++;
      } catch (e) {
        console.log('❌ Error renaming "' + variable.name + '": ' + e.message);
        errors.push(variable.name + ': ' + e.message);
      }
    }
    
    // Summary
    console.log('');
    console.log('📊 Results:');
    console.log('✅ Renamed: ' + renamedCount + ' variables');
    if (errors.length > 0) {
      console.log('❌ Errors: ' + errors.length);
      errors.forEach(function(error) {
        console.log('   - ' + error);
      });
    }
    
    if (renamedCount > 0) {
      figma.notify('✅ Renamed ' + renamedCount + ' variables');
    } else {
      figma.notify('⚠️ No variables were renamed');
    }
    
  } catch (error) {
    console.log('❌ Script error: ' + error.message);
    figma.notify('❌ Script error: ' + error.message);
  }
}

// Run the script
batchRenameVariables();

