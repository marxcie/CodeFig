// ✅ Duplicate variable collection

// Configuration - Change these values as needed
var sourceCollectionName = 'website V3';
var newCollectionName = 'website V4';

function duplicateVariableCollection(collection, newName) {
  var newCollection = figma.variables.createVariableCollection(newName || collection.name + ' Copy');
  
  // Copy collection modes (skip the default mode as it's automatically created)
  var modesToCopy = collection.modes.slice(1);
  modesToCopy.forEach(function(mode) {
    newCollection.addMode(mode.name);
  });
  
  // Copy variables with ALL properties
  collection.variableIds.forEach(function(variableId) {
    var originalVar = figma.variables.getVariableById(variableId);
    if (originalVar) {
      var newVar = figma.variables.createVariable(originalVar.name, newCollection, originalVar.resolvedType);
      
      // Copy variable description
      if (originalVar.description) {
        newVar.description = originalVar.description;
      }
      
      // Copy variable scopes
      if (originalVar.scopes && originalVar.scopes.length > 0) {
        newVar.scopes = originalVar.scopes.slice();
      }
      
      // Copy variable values for each mode
      collection.modes.forEach(function(originalMode, modeIndex) {
        var value = originalVar.valuesByMode[originalMode.modeId];
        if (value !== undefined) {
          var targetMode = modeIndex === 0 ? newCollection.modes[0] : newCollection.modes[modeIndex];
          if (targetMode) {
            newVar.setValueForMode(targetMode.modeId, value);
          }
        }
      });
    }
  });
  
  return newCollection;
}

// Execute
var collection = figma.variables.getLocalVariableCollections().find(function(c) {
  return c.name === sourceCollectionName;
});
if (collection) {
  var duplicate = duplicateVariableCollection(collection, newCollectionName);
  figma.notify('Collection duplicated with all properties!');
} else {
  figma.notify('Collection not found');
}
