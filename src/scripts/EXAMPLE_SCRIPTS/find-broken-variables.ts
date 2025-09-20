// Find broken variables

const findBrokenVariables = () => {
  const variables = figma.variables.getLocalVariables();
  const broken: Array<{
    variable: Variable;
    issue: string;
    collectionId: string;
  }> = [];
  
  variables.forEach(variable => {
    if (!figma.variables.getVariableCollectionById(variable.variableCollectionId)) {
      broken.push({
        variable,
        issue: 'Collection missing',
        collectionId: variable.variableCollectionId
      });
    }
  });
  
  return broken;
};

// Execute
const broken = findBrokenVariables();
console.log('Broken variables:', broken);
figma.notify(`Found ${broken.length} broken variables`);
