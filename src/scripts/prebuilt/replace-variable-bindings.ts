// REPLACE VARIABLE BINDINGS (PATTERN-BASED)
// This script replaces variable bindings based on text patterns in variable names

// Configuration
const searchPattern = 'xl';   // Text pattern to search for in variable names
const replacePattern = 'lg';  // Text pattern to replace with

const replaceVariableBindings = () => {
  if (selection.length === 0) {
    figma.notify('Please select some nodes first');
    return;
  }
  
  // Get all variables for lookup
  const allVariables = figma.variables.getLocalVariables();
  
  // Create a map of variables that match our search pattern and their replacements
  // Preserve collection context when finding replacements
  const variableMap = new Map();
  allVariables.forEach(variable => {
    if (variable.name.includes(searchPattern)) {
      const newVariableName = variable.name.replace(
        new RegExp(searchPattern, 'g'), 
        replacePattern
      );
      
      // Find replacement variable in the SAME collection
      const replacementVariable = allVariables.find(v => 
        v.name === newVariableName && 
        v.variableCollectionId === variable.variableCollectionId
      );
      
      if (replacementVariable) {
        variableMap.set(variable.id, replacementVariable);
      }
    }
  });
  
  if (variableMap.size === 0) {
    figma.notify(`No variables found with pattern "${searchPattern}" that have replacements`);
    return;
  }
  
  let replacedCount = 0;
  
  // Properties that can have variable bindings
  const variableProperties = [
    'fontSize', 'lineHeight', 'letterSpacing', 'paragraphSpacing', 'paragraphIndent',
    'fills', 'strokes', 'effects', 'strokeWeight', 'cornerRadius', 'width', 'height',
    'x', 'y', 'rotation', 'opacity', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
    'itemSpacing', 'mainAxisSizingMode', 'counterAxisSizingMode'
  ];
  
  const processNode = (node: SceneNode) => {
    let nodeChanged = false;
    
    // Method 1: Try getBoundVariable if available
    variableProperties.forEach(property => {
      try {
        if ((node as any).getBoundVariable) {
          const binding = (node as any).getBoundVariable(property);
          if (binding && variableMap.has(binding.id)) {
            const replacementVariable = variableMap.get(binding.id);
            (node as any).setBoundVariable(property, replacementVariable);
            nodeChanged = true;
          }
        }
      } catch (error) {
        // getBoundVariable not available or property doesn't support variables
      }
    });
    
    // Method 2: Fallback - check for variable consumption using different approach
    if (!nodeChanged) {
      try {
        // For text nodes, try specific text properties
        if (node.type === 'TEXT') {
          variableMap.forEach((replacementVariable, oldVariableId) => {
            const oldVariable = figma.variables.getVariableById(oldVariableId);
            if (oldVariable) {
              // Try to bind font size if it matches expected values
              if (oldVariable.name.includes('font-size')) {
                try {
                  (node as any).setBoundVariable('fontSize', replacementVariable);
                  nodeChanged = true;
                } catch (e) {}
              }
              // Try to bind line height
              if (oldVariable.name.includes('line-height')) {
                try {
                  (node as any).setBoundVariable('lineHeight', replacementVariable);
                  nodeChanged = true;
                } catch (e) {}
              }
              // Try to bind letter spacing
              if (oldVariable.name.includes('letter-space')) {
                try {
                  (node as any).setBoundVariable('letterSpacing', replacementVariable);
                  nodeChanged = true;
                } catch (e) {}
              }
            }
          });
        }
        
        // For other node types, try common properties
        if (node.type !== 'TEXT') {
          variableMap.forEach((replacementVariable, oldVariableId) => {
            const oldVariable = figma.variables.getVariableById(oldVariableId);
            if (oldVariable) {
              // Try common properties based on variable name
              if (oldVariable.name.includes('spacing') || oldVariable.name.includes('padding')) {
                ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing'].forEach(prop => {
                  try {
                    (node as any).setBoundVariable(prop, replacementVariable);
                    nodeChanged = true;
                  } catch (e) {}
                });
              }
              if (oldVariable.name.includes('corner') || oldVariable.name.includes('radius')) {
                try {
                  (node as any).setBoundVariable('cornerRadius', replacementVariable);
                  nodeChanged = true;
                } catch (e) {}
              }
              if (oldVariable.name.includes('width')) {
                try {
                  (node as any).setBoundVariable('width', replacementVariable);
                  nodeChanged = true;
                } catch (e) {}
              }
              if (oldVariable.name.includes('height')) {
                try {
                  (node as any).setBoundVariable('height', replacementVariable);
                  nodeChanged = true;
                } catch (e) {}
              }
            }
          });
        }
      } catch (error) {
        // Ignore errors
      }
    }
    
    if (nodeChanged) {
      replacedCount++;
    }
    
    // Recursively process children
    if ('children' in node) {
      node.children.forEach(processNode);
    }
  };
  
  // Process all selected nodes and their children
  selection.forEach(processNode);
  
  if (replacedCount > 0) {
    figma.notify(`Replaced variable bindings in ${replacedCount} nodes (${searchPattern} → ${replacePattern})`);
  } else {
    figma.notify(`No variable bindings were replaced. Variables found: ${variableMap.size}`);
  }
};

// Execute
replaceVariableBindings();
