// LIST ALL VARIABLES

// Execute
const variables = figma.variables.getLocalVariables();
console.log('All variables:');
variables.forEach(v => console.log(`- ${v.name} (${v.resolvedType})`));
figma.notify(`Found ${variables.length} variables`);
