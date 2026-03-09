// Duplicate variable collection
// @DOC_START
// # Duplicate variable collection
// Clones a local variable collection (modes, variables, values, descriptions, scopes).
//
// ## Overview
// Finds a collection by name, creates a new collection with the given new name, copies all modes and variables with their values and metadata. No recursive option; run once per copy.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | sourceCollectionName | Exact name of the collection to duplicate. |
// | newCollectionName | Name for the new collection. |
// @DOC_END

// @UI_CONFIG_START
// # Duplicate variable collection
// Source collection (choose from existing). New name for the copy.
var sourceCollectionName = 'website V3'; // @options: variableCollections
var newCollectionName = ''; // @placeholder="website V4"
// @UI_CONFIG_END

async function duplicateVariableCollection(collection, newName) {
  var newCollection = figma.variables.createVariableCollection(newName || collection.name + ' Copy');
  
  var modesToCopy = collection.modes.slice(1);
  modesToCopy.forEach(function(mode) {
    newCollection.addMode(mode.name);
  });
  
  for (var i = 0; i < collection.variableIds.length; i++) {
    var variableId = collection.variableIds[i];
    var originalVar = await figma.variables.getVariableByIdAsync(variableId);
    if (originalVar) {
      var newVar = figma.variables.createVariable(originalVar.name, newCollection, originalVar.resolvedType);
      
      if (originalVar.description) {
        newVar.description = originalVar.description;
      }
      
      if (originalVar.scopes && originalVar.scopes.length > 0) {
        newVar.scopes = originalVar.scopes.slice();
      }
      
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
  }
  
  return newCollection;
}

// Execute
(async function() {
  var localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = localCollections.find(function(c) {
    return c.name === sourceCollectionName;
  });
  if (collection) {
    await duplicateVariableCollection(collection, newCollectionName);
    figma.notify('Collection duplicated with all properties!');
  } else {
    figma.notify('Collection not found');
  }
})();
