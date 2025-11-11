// Replace Styles - custom dataset
// Demonstrates how to use the Replace Styles as an importable library
// with custom replacement patterns and recursive processing

console.log('🎨 Replace Styles - custom dataset example');

// Import all functions from the Replace Styles library
@import * from "Replace Styles"

// ============================================================================
// CONFIGURATION
// ============================================================================

// Define your custom replacement patterns
// Each pattern will search for the 'from' text and replace it with 'to' text
var myCustomReplacements = [
  {
    from: "50",            // Replace all "50" with "500"
    to: "500"
  },
  {
    from: "Secondary",     // Replace all "Secondary" with "Primary"
    to: "Primary"
  },
  {
    from: "3xl",           // Replace all "3xl" with "4xl"
    to: "4xl"
  },
  {
    from: "Blue",          // Replace all "Blue" with "Red"
    to: "Red"
  }
  // Add more patterns as needed...
];

// Configuration options
var CONFIG = {
  selectionOnly: true     // true = process only selected elements, false = entire page
};

// ============================================================================
// EXECUTE
// ============================================================================

// Run the style replacement with custom patterns
replaceAllStyles(myCustomReplacements, CONFIG.selectionOnly);
