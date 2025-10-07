/**
 * Replace Variables with Styles
 * 
 * Simple script to replace variable bindings with styles.
 */

// ============================================================================
// MAIN SCRIPT
// ============================================================================

function replaceVariablesWithStyles() {
  try {
    console.log('🎨 Starting Variable to Style Replacement...');
    
    // Get current selection
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify('❌ Please select some nodes first');
      return;
    }
    
    console.log(`📋 Processing ${selection.length} selected node(s)`);
    
    // Simple analysis - just count variables
    let variableCount = 0;
    const allNodes = collectAllNodes(selection);
    
    for (const node of allNodes) {
      if (node.boundVariables && typeof node.boundVariables === 'object') {
        for (const [property, binding] of Object.entries(node.boundVariables)) {
          if (binding) {
            variableCount++;
          }
        }
      }
    }
    
    if (variableCount === 0) {
      figma.notify('ℹ️ No variable bindings found in selection');
      return;
    }
    
    console.log(`Found ${variableCount} variable bindings`);
    figma.notify(`Found ${variableCount} variable bindings - check console for details`);
    
  } catch (error) {
    console.error('❌ Error in replaceVariablesWithStyles:', error);
    figma.notify('❌ Error occurred during replacement');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function collectAllNodes(selection) {
  const nodes = [];
  
  function traverse(node) {
    nodes.push(node);
    
    if ('children' in node) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  
  for (const node of selection) {
    traverse(node);
  }
  
  return nodes;
}

// ============================================================================
// SCRIPT EXECUTION
// ============================================================================

// Run the script
replaceVariablesWithStyles();
