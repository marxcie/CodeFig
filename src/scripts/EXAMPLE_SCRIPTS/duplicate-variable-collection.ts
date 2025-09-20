// Duplicate variable collection

// Configuration - Change these values as needed
const sourceCollectionName = 'website V3';
const newCollectionName = 'website V4';

const duplicateVariableCollection = (collection: VariableCollection, newName: string) => {
  const newCollection = figma.variables.createVariableCollection(newName || `${collection.name} Copy`);
  
  // Copy collection modes (skip the default mode as it's automatically created)
  const modesToCopy = collection.modes.slice(1);
  modesToCopy.forEach(mode => {
    newCollection.addMode(mode.name);
  });
  
  // Copy variables with ALL properties
  collection.variableIds.forEach(variableId => {
    const originalVar = figma.variables.getVariableById(variableId);
    if (originalVar) {
      const newVar = figma.variables.createVariable(originalVar.name, newCollection, originalVar.resolvedType);
      
      // Copy variable description
      if (originalVar.description) {
        newVar.description = originalVar.description;
      }
      
      // Copy variable scopes
      if (originalVar.scopes && originalVar.scopes.length > 0) {
        newVar.scopes = [...originalVar.scopes];
      }
      
      // Copy variable values for each mode
      collection.modes.forEach((originalMode, modeIndex) => {
        const value = originalVar.valuesByMode[originalMode.modeId];
        if (value !== undefined) {
          const targetMode = modeIndex === 0 ? newCollection.modes[0] : newCollection.modes[modeIndex];
          if (targetMode) {
            newVar.setValueForMode(targetMode.modeId, value);
          }
        }
      });
    }
  });
  
  return newCollection;
};

// Execute
const collection = figma.variables.getLocalVariableCollections().find(c => c.name === sourceCollectionName);
if (collection) {
  const duplicate = duplicateVariableCollection(collection, newCollectionName);
  figma.notify('Collection duplicated with all properties!');
} else {
  figma.notify('Collection not found');
}
