// DS Foundation: Grid
// @DOC_START
// # DS Foundation: Grid
// Create and update grid system variables programmatically.
//
// ## Overview
// Defines a variable collection for layout grid: columns, gap, padding, viewport width per mode (e.g. Desktop, Tablet, Mobile). Config holds container width, columns, gap, padding per viewport; the script creates the variables.
//
// ## Config options
// - **collectionName** / **structure.variableCollection** – Collection name.
// - **structure.variableGroup** – Optional group path.
// - **config** – approximateColumns (when true, tablet/mobile column values map proportionally to desktop so layouts update easily on smaller viewports), and per viewport (desktop, tablet, mobile): containerWidth, columns, gap, padding. Column count (col-1..col-N) is the viewport with the most columns (e.g. desktop 12 → 12 variables).
// - **variables** – Function(innerConfig) or map of variable names to { type: "FLOAT", values: { modeName: function(config) => number } }. Creates grid/columns, grid/gap, grid/padding, grid/viewport-width, and grid/col-1..col-max (max = viewport with most columns).
// - One grid style "Grid" is created (COLUMNS, CENTER) with count, sectionSize (grid/col-1), and gutterSize bound to the collection variables so it responds to Desktop/Tablet/Mobile mode.
// @DOC_END

// Import functions from libraries
@import { getOrCreateCollection, getVariable, setupModes, createOrUpdateVariable, extractModes, processVariables } from "@Variables"
@import { calculateColumnWidth } from "@Core Library"

// ========================================
// GRID SYSTEM CONFIGURATION
// ========================================

// Helper: variable name prefix (no leading slash when group is empty — Figma rejects names like "/grid/columns")
function variableNamePrefix(group) {
  return group ? group + '/' : '';
}

// Helper: compute column variable value for a viewport (supports approximateColumns)
function calculateColumnVariable(colNum, viewportConfig, maxColumns, approximate) {
  if (!approximate && colNum > viewportConfig.columns) {
    return viewportConfig.containerWidth - (viewportConfig.padding * 2);
  }
  var targetCol = approximate
    ? Math.ceil((colNum / maxColumns) * viewportConfig.columns)
    : Math.min(colNum, viewportConfig.columns);
  if (targetCol > viewportConfig.columns) {
    return viewportConfig.containerWidth - (viewportConfig.padding * 2);
  }
  var colWidth = calculateColumnWidth(viewportConfig);
  return (colWidth * targetCol) + (viewportConfig.gap * (targetCol - 1));
}

var gridSystemConfig = typeof gridSystemConfig !== 'undefined' ? gridSystemConfig : {
  // @CONFIG_START
  // Use existing config if already defined, otherwise use default
  collectionName: "Grid System",
  structure: {
    variableCollection: "Grid System",
    variableGroup: ""
  },

  config: {
    // experimental feature
    // when true: tablet/mobile column values map proportionally to desktop for easier layout updates on smaller viewports
    approximateColumns: false, 
    
    // desktop config
    desktop: {
      containerWidth: 1920,
      columns: 12,
      gap: 40,
      padding: 80
    },
    // tablet config
    tablet: {
      containerWidth: 768,
      columns: 8,
      gap: 24,
      padding: 40
    },
    // mobile config
    mobile: {
      containerWidth: 375,
      columns: 4,
      gap: 16,
      padding: 20
    }
  },
  
  // @CONFIG_END
  // Variables to be created in Figma (function of config; max columns = viewport with most columns)
  variables: function(innerConfig) {
    if (!innerConfig || !innerConfig.desktop || !innerConfig.tablet || !innerConfig.mobile) {
      return {};
    }
    var maxCols = Math.max(
      innerConfig.desktop.columns,
      innerConfig.tablet.columns,
      innerConfig.mobile.columns
    );
    var approximate = !!(innerConfig && innerConfig.approximateColumns);

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
      "grid/viewport-width": {
        type: "FLOAT",
        values: {
          "Desktop": function(config) { return config.desktop.containerWidth; },
          "Tablet": function(config) { return config.tablet.containerWidth; },
          "Mobile": function(config) { return config.mobile.containerWidth; }
        }
      }
    };

    for (var colNum = 1; colNum <= maxCols; colNum++) {
      (function(c) {
        basicVariables['grid/col-' + c] = {
          type: "FLOAT",
          values: {
            "Desktop": function(config) {
              return calculateColumnVariable(c, config.desktop, maxCols, approximate);
            },
            "Tablet": function(config) {
              return calculateColumnVariable(c, config.tablet, maxCols, approximate);
            },
            "Mobile": function(config) {
              return calculateColumnVariable(c, config.mobile, maxCols, approximate);
            }
          }
        };
      })(colNum);
    }

    return basicVariables;
  }
};

// ========================================
// CORE FUNCTIONS
// ========================================

function createOrUpdateCollection(config) {
  var collectionName = (config.structure && config.structure.variableCollection != null) ? config.structure.variableCollection : config.collectionName;
  var group = (config.structure && config.structure.variableGroup !== undefined) ? config.structure.variableGroup : '';
  var prefix = variableNamePrefix(group);

  // Resolve variables (may be a function of config for dynamic column count)
  var variables = typeof config.variables === 'function' ? config.variables(config.config) : config.variables;

  console.log('=== GRID SYSTEM MANAGER ===');
  console.log('Processing collection: ' + collectionName + (group ? ' (group: ' + group + ')' : ' (no group)'));
  
  // Get or create collection using imported function
  var collection = getOrCreateCollection(collectionName);
  
  // Extract modes from variable values or use default (imported function)
  var modes = extractModes({ variables: variables });
  console.log('Detected modes: ' + modes.join(', '));
  
  // Setup modes (imported function)
  setupModes(collection, modes);
  
  // Prefix variable names with group when set (no leading slash when group empty)
  var variablesWithPrefix = {};
  for (var key in variables) {
    variablesWithPrefix[prefix + key] = variables[key];
  }
  
  // Process variables (imported function)
  var stats = processVariables(collection, variablesWithPrefix, config.config, modes);
  
  console.log('=== GRID SYSTEM SUMMARY ===');
  console.log('Collection: ' + collectionName);
  console.log('Variables created: ' + stats.created);
  console.log('Variables updated: ' + stats.updated);
  console.log('Variables skipped: ' + stats.skipped);
  
  return {
    collection: collection,
    stats: stats
  };
}

// Create one centered layout grid style; count, column width, and gutter bound to collection variables (one style for all viewports, responds to mode)
function createGridStyles(collection, config) {
  var group = (config.structure && config.structure.variableGroup !== undefined) ? config.structure.variableGroup : '';
  var prefix = variableNamePrefix(group);
  var styleName = "Grid";
  var styleStats = { created: 0, updated: 0 };

  var desktop = config.config && config.config.desktop;
  if (!desktop) {
    console.warn("Grid style skipped: no desktop config");
    return styleStats;
  }

  var sectionSize = calculateColumnWidth(desktop);
  var gridLayoutNumeric = {
    pattern: "COLUMNS",
    alignment: "CENTER",
    count: desktop.columns,
    gutterSize: desktop.gap,
    sectionSize: sectionSize
  };

  var existing = figma.getLocalGridStyles().find(function(s) { return s.name === styleName; });
  var gridStyle;
  if (existing) {
    gridStyle = existing;
    styleStats.updated++;
  } else {
    gridStyle = figma.createGridStyle();
    gridStyle.name = styleName;
    styleStats.created++;
  }

  var columnsVar = getVariable(collection, prefix + "grid/columns");
  var gapVar = getVariable(collection, prefix + "grid/gap");
  var col1Var = getVariable(collection, prefix + "grid/col-1");

  var layoutGridToApply = gridLayoutNumeric;
  if (columnsVar && gapVar && col1Var && typeof figma.variables.setBoundVariableForLayoutGrid === "function") {
    try {
      layoutGridToApply = figma.variables.setBoundVariableForLayoutGrid(layoutGridToApply, "count", columnsVar);
      layoutGridToApply = figma.variables.setBoundVariableForLayoutGrid(layoutGridToApply, "gutterSize", gapVar);
      layoutGridToApply = figma.variables.setBoundVariableForLayoutGrid(layoutGridToApply, "sectionSize", col1Var);
      console.log("Grid style: " + styleName + " (COLUMNS, CENTER; count, gutterSize, sectionSize bound to variables)");
    } catch (e) {
      console.warn("Grid style: variable binding failed: " + (e.message || e));
    }
  } else if (!columnsVar || !gapVar || !col1Var) {
    console.log("Grid style: " + styleName + " (COLUMNS, CENTER; grid/columns, grid/gap, or grid/col-1 not found, using numeric values)");
  }

  gridStyle.layoutGrids = [layoutGridToApply];

  return styleStats;
}

// ========================================
// EXECUTION
// ========================================

try {
  var result = createOrUpdateCollection(gridSystemConfig);
  var gridStyleStats = createGridStyles(result.collection, gridSystemConfig);
  var msg = '✅ Grid System: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' vars updated';
  if (gridStyleStats.created > 0 || gridStyleStats.updated > 0) {
    msg += '; ' + gridStyleStats.created + ' grid style(s) created, ' + gridStyleStats.updated + ' updated';
  }
  figma.notify(msg);
} catch (error) {
  console.error('Error:', error);
  figma.notify('❌ Error: ' + error.message);
}
