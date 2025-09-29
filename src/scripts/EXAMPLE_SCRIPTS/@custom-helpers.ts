// @Custom Helpers
// Design system and workflow helper functions
//
// 📚 IMPORT THESE FUNCTIONS IN YOUR SCRIPTS:
// @import { generateSpacing, setupAutoLayout, analyzeSelection } from "@Custom Helpers"
//
// 🛠️ AVAILABLE FUNCTIONS:
// • Design System: generateSpacing, generateBorderRadius, calculateColumnWidth
// • Workflows: setupAutoLayout, applyNamingConvention
// • Analysis: analyzeSelection
// • Components: createComponentFromSelection

// var shared = true; // Disabled for now - too heavy for injection

// ========================================
// 🎨 CUSTOM DESIGN SYSTEM HELPERS
// ========================================

// Calculate column width for grid systems
function calculateColumnWidth(viewportConfig) {
  var availableWidth = viewportConfig.containerWidth - (viewportConfig.padding * 2);
  var totalGaps = (viewportConfig.columns - 1) * viewportConfig.gap;
  return (availableWidth - totalGaps) / viewportConfig.columns;
}

// Generate consistent spacing values
function generateSpacing(baseUnit) {
  baseUnit = baseUnit || 8;
  return {
    xs: baseUnit * 0.5,    // 4px
    sm: baseUnit * 1,      // 8px  
    md: baseUnit * 2,      // 16px
    lg: baseUnit * 3,      // 24px
    xl: baseUnit * 4,      // 32px
    xxl: baseUnit * 6      // 48px
  };
}

// Create consistent border radius values
function generateBorderRadius(baseRadius) {
  baseRadius = baseRadius || 4;
  return {
    none: 0,
    sm: baseRadius,           // 4px
    md: baseRadius * 2,       // 8px
    lg: baseRadius * 3,       // 12px
    xl: baseRadius * 4,       // 16px
    full: 9999                // Fully rounded
  };
}

// ========================================
// 🔧 CUSTOM NODE OPERATIONS
// ========================================

// Smart auto-layout setup with common patterns
function setupAutoLayout(node, direction, spacing, padding) {
  if (!('layoutMode' in node)) {
    console.log('Node does not support auto-layout: ' + node.name);
    return false;
  }
  
  node.layoutMode = direction || 'HORIZONTAL';
  node.itemSpacing = spacing || 16;
  
  if (padding) {
    if (typeof padding === 'number') {
      node.paddingTop = node.paddingRight = node.paddingBottom = node.paddingLeft = padding;
    } else {
      node.paddingTop = padding.top || 0;
      node.paddingRight = padding.right || 0;
      node.paddingBottom = padding.bottom || 0;
      node.paddingLeft = padding.left || 0;
    }
  }
  
  console.log('Applied auto-layout to: ' + node.name);
  return true;
}

// Batch apply consistent naming convention
function applyNamingConvention(nodes, prefix, separator) {
  separator = separator || '/';
  var renamed = 0;
  
  nodes.forEach(function(node, index) {
    var oldName = node.name;
    var newName = prefix + separator + (index + 1).toString().padStart(2, '0');
    
    if (oldName !== newName) {
      node.name = newName;
      console.log('Renamed: "' + oldName + '" → "' + newName + '"');
      renamed++;
    }
  });
  
  return renamed;
}

// ========================================
// 📊 CUSTOM ANALYSIS FUNCTIONS
// ========================================

// Analyze selection and provide insights
function analyzeSelection(nodes) {
  var analysis = {
    totalNodes: 0,
    nodeTypes: {},
    hasStyles: 0,
    hasVariables: 0,
    avgSize: { width: 0, height: 0 },
    bounds: null
  };
  
  if (!nodes || nodes.length === 0) {
    return analysis;
  }
  
  var totalWidth = 0, totalHeight = 0;
  var sizedNodes = 0;
  
  FigmaCore.traverseNodes(nodes, function(node) {
    analysis.totalNodes++;
    
    // Count by type
    analysis.nodeTypes[node.type] = (analysis.nodeTypes[node.type] || 0) + 1;
    
    // Check for styles
    if (('textStyleId' in node && node.textStyleId) ||
        ('fillStyleId' in node && node.fillStyleId) ||
        ('strokeStyleId' in node && node.strokeStyleId) ||
        ('effectStyleId' in node && node.effectStyleId)) {
      analysis.hasStyles++;
    }
    
    // Check for variables (simplified check)
    if ('boundVariables' in node && Object.keys(node.boundVariables || {}).length > 0) {
      analysis.hasVariables++;
    }
    
    // Calculate average size
    if ('width' in node && 'height' in node) {
      totalWidth += node.width;
      totalHeight += node.height;
      sizedNodes++;
    }
    
    return 1;
  });
  
  if (sizedNodes > 0) {
    analysis.avgSize.width = Math.round(totalWidth / sizedNodes);
    analysis.avgSize.height = Math.round(totalHeight / sizedNodes);
  }
  
  // Calculate bounds
  if (nodes.length > 0 && 'x' in nodes[0]) {
    analysis.bounds = FigmaCore.bounds(nodes);
  }
  
  return analysis;
}

// ========================================
// 🎯 CUSTOM WORKFLOW HELPERS
// ========================================

// Quick component creation workflow
function createComponentFromSelection(name, description) {
  var selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify('Please select elements to convert to component');
    return null;
  }
  
  if (selection.length === 1 && selection[0].type === 'FRAME') {
    // Convert frame to component
    var component = figma.createComponent();
    var frame = selection[0];
    
    // Copy frame properties
    component.name = name || frame.name + ' Component';
    component.description = description || 'Auto-generated component';
    component.resize(frame.width, frame.height);
    component.x = frame.x;
    component.y = frame.y;
    
    // Move children
    while (frame.children.length > 0) {
      component.appendChild(frame.children[0]);
    }
    
    // Remove original frame
    frame.remove();
    
    console.log('Created component: ' + component.name);
    figma.notify('Component created: ' + component.name);
    return component;
  } else {
    figma.notify('Please select a single frame to convert to component');
    return null;
  }
}

// ========================================
// 🚀 CUSTOM LIBRARY INITIALIZATION
// ========================================

// Export custom helpers object
var MyHelpers = {
  // Design system
  generateSpacing: generateSpacing,
  generateBorderRadius: generateBorderRadius,
  
  // Node operations
  setupAutoLayout: setupAutoLayout,
  applyNamingConvention: applyNamingConvention,
  
  // Analysis
  analyzeSelection: analyzeSelection,
  
  // Workflows
  createComponentFromSelection: createComponentFromSelection
};

console.log('📚 My Custom Helpers loaded!');
console.log('Available via MyHelpers object: generateSpacing, setupAutoLayout, analyzeSelection, etc.');
