// Batch rename Styles
// @DOC_START
// # Batch rename Styles
// Rename local styles (paint, text, effect, grid) by search/replace patterns.
//
// ## Overview
// Applies one or more find/replace operations to style names. Choose: single pattern, multiple patterns to one replacement, or a batch list of operations.
//
// ## Config options
// - **searchPattern** – String or array of strings to find in style names.
// - **replacePattern** – Replacement string.
// - **batchReplacements** – Optional array of { searchPattern, replacePattern } for multiple operations.
// @DOC_END

// Import utility functions
@import { getAllStyles, replaceByPattern } from "@Core Library"

// ========================================
// CONFIGURATION - Choose one approach:
// ========================================

// @CONFIG_START
// APPROACH 1: Single pattern replacement
var searchPattern = 'font-';
var replacePattern = 'text-';

// APPROACH 2: Multiple patterns to single replacement
// var searchPattern = ['SM', 'LG'];  // Both 'SM' and 'LG' will be replaced
// var replacePattern = 'XL';

// APPROACH 3: Batch replacements (multiple operations)
// var batchReplacements = [
//   {
//     searchPattern: 'LG',
//     replacePattern: 'XL'
//   },
//   {
//     searchPattern: 'MD', 
//     replacePattern: 'LG'
//   },
//   {
//     searchPattern: 'SM',
//     replacePattern: 'MD'
//   }
// ];
// @CONFIG_END

// ========================================
// FUNCTIONS
// ========================================

function renameStyles(searchPattern, replacePattern) {
  var styles = getAllStyles(); // Using imported function
  
  // Use imported replaceByPattern function
  var patterns = [{ from: searchPattern, to: replacePattern }];
  
  return replaceByPattern(
    styles,
    patterns,
    function(style) { return style.name; },
    function(style, newName) { style.name = newName; }
  );
}

function executeBatchReplacements(replacements) {
  var totalCount = 0;
  
  replacements.forEach(function(replacement, index) {
    console.log('--- Batch operation ' + (index + 1) + ' ---');
    console.log('Search: ' + (Array.isArray(replacement.searchPattern) ? replacement.searchPattern.join(', ') : replacement.searchPattern));
    console.log('Replace: ' + replacement.replacePattern);
    
    var count = renameStyles(replacement.searchPattern, replacement.replacePattern);
    totalCount += count;
    
    console.log('Changed: ' + count + ' styles');
  });
  
  return totalCount;
}

// ========================================
// EXECUTION
// ========================================

var totalCount = 0;

// Check which approach is configured
if (typeof batchReplacements !== 'undefined' && batchReplacements.length > 0) {
  // APPROACH 3: Batch replacements
  console.log('=== BATCH RENAME STYLES ===');
  console.log('Executing ' + batchReplacements.length + ' replacement operations...');
  totalCount = executeBatchReplacements(batchReplacements);
  figma.notify('Batch complete: Renamed ' + totalCount + ' styles across ' + batchReplacements.length + ' operations');
  
} else if (typeof searchPattern !== 'undefined' && typeof replacePattern !== 'undefined') {
  // APPROACH 1 or 2: Single or multiple patterns
  console.log('=== RENAME STYLES ===');
  if (Array.isArray(searchPattern)) {
    console.log('Search patterns: ' + searchPattern.join(', '));
  } else {
    console.log('Search pattern: ' + searchPattern);
  }
  console.log('Replace with: ' + replacePattern);
  
  totalCount = renameStyles(searchPattern, replacePattern);
  figma.notify('Renamed ' + totalCount + ' styles');
  
} else {
  figma.notify('Please configure searchPattern and replacePattern, or batchReplacements');
}
