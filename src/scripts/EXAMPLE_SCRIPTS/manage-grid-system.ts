// DS Foundation: Grid
// Create and update grid system variables programmatically

// Import functions from libraries
@import { getOrCreateCollection, setupModes, createOrUpdateVariable, extractModes, processVariables } from "@Core Library"
@import { calculateColumnWidth } from "@Custom Helpers"

// ========================================
// GRID SYSTEM CONFIGURATION
// ========================================

var gridSystemConfig = {
  collectionName: "Grid System",
  
  // Configuration values (NOT added as variables)
  config: {
    desktop: {
      containerWidth: 1920,
      columns: 12,
      gap: 40,
      padding: 80
    },
    tablet: {
      containerWidth: 768,
      columns: 8,
      gap: 24,
      padding: 40
    },
    mobile: {
      containerWidth: 375,
      columns: 4,
      gap: 16,
      padding: 20
    }
  },
  
  // Variables to be created in Figma  
  variables: (function() {
    // Basic grid properties
    var basicVariables = {
      "grid/columns": {
        type: "FLOAT",
        values: {
          "Desktop": function(config) { return config.desktop.columns; },
          "Tablet": function(config) { return config.tablet.columns; },
          "Mobile": function(config) { return config.mobile.columns; }
        }
      },
      "grid/gap": {
        type: "FLOAT", 
        values: {
          "Desktop": function(config) { return config.desktop.gap; },
          "Tablet": function(config) { return config.tablet.gap; },
          "Mobile": function(config) { return config.mobile.gap; }
        }
      },
      "grid/padding": {
        type: "FLOAT",
        values: {
          "Desktop": function(config) { return config.desktop.padding; },
          "Tablet": function(config) { return config.tablet.padding; },
          "Mobile": function(config) { return config.mobile.padding; }
        }
      },
      "grid/max-width": {
        type: "FLOAT",
        values: {
          "Desktop": function(config) { return config.desktop.containerWidth - (config.desktop.padding * 2); },
          "Tablet": function(config) { return config.tablet.containerWidth - (config.tablet.padding * 2); },
          "Mobile": function(config) { return config.mobile.containerWidth - (config.mobile.padding * 2); }
        }
      }
    };
    
    // Generate column widths programmatically
    var columnNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    columnNumbers.forEach(function(colNum) {
      basicVariables['grid/col-' + colNum] = {
        type: "FLOAT",
        values: {
          "Desktop": function(config) {
            if (colNum > config.desktop.columns) {
              return config.desktop.containerWidth - (config.desktop.padding * 2);
            }
            var colWidth = calculateColumnWidth(config.desktop);
            return (colWidth * colNum) + (config.desktop.gap * (colNum - 1));
          },
          "Tablet": function(config) {
            if (colNum > config.tablet.columns) {
              return config.tablet.containerWidth - (config.tablet.padding * 2);
            }
            var colWidth = calculateColumnWidth(config.tablet);
            return (colWidth * colNum) + (config.tablet.gap * (colNum - 1));
          },
          "Mobile": function(config) {
            if (colNum > config.mobile.columns) {
              return config.mobile.containerWidth - (config.mobile.padding * 2);
            }
            var colWidth = calculateColumnWidth(config.mobile);
            return (colWidth * colNum) + (config.mobile.gap * (colNum - 1));
          }
        }
      };
    });
    
    return basicVariables;
  })()
};

// ========================================
// CORE FUNCTIONS
// ========================================

function createOrUpdateCollection(config) {
  console.log('=== GRID SYSTEM MANAGER ===');
  console.log('Processing collection: ' + config.collectionName);
  
  // Get or create collection using imported function
  var collection = getOrCreateCollection(config.collectionName);
  
  // Extract modes from variable values or use default (imported function)
  var modes = extractModes(config);
  console.log('Detected modes: ' + modes.join(', '));
  
  // Setup modes (imported function)
  setupModes(collection, modes);
  
  // Process variables (imported function)
  var stats = processVariables(collection, config.variables, config.config, modes);
  
  console.log('=== GRID SYSTEM SUMMARY ===');
  console.log('Collection: ' + config.collectionName);
  console.log('Variables created: ' + stats.created);
  console.log('Variables updated: ' + stats.updated);
  console.log('Variables skipped: ' + stats.skipped);
  
  return {
    collection: collection,
    stats: stats
  };
}

// ========================================
// EXECUTION
// ========================================

try {
  var result = createOrUpdateCollection(gridSystemConfig);
  figma.notify('✅ Grid System: ' + result.stats.created + ' created, ' + result.stats.updated + ' updated');
} catch (error) {
  console.error('Error:', error);
  figma.notify('❌ Error: ' + error.message);
}
