// DS Foundation: Grid
// @DOC_START
// # DS Foundation: Grid
// Create and update grid system variables programmatically.
//
// ## Overview
// Defines a variable collection for layout grid: columns, gap, padding, viewport width per mode (e.g. Desktop, Tablet, Mobile). Config holds container width, columns, gap, padding per viewport; the script creates the variables.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | collectionName / structure.variableCollection | Collection name. |
// | structure.variableGroup | Optional group path. |
// | config (e.g. desktop, tablet, mobile) | Any named viewports: containerWidth, columns, gap, padding. **Mode order in Figma follows the order of keys in this object.** Keys must be valid JS identifiers *or* quoted strings (e.g. `"desktop-large"` — hyphens require quotes). Mode names are the key with only the first letter uppercased (`desktop-large` → `Desktop-large`). Column count (col-1..col-N) follows the viewport with the most columns. |
// | variables | Function(innerConfig) or map of variable names. Creates grid/columns, grid/gap, grid/padding, grid/viewport-width, and grid/col-1..col-max. |
// | Grid style | One grid style "Grid" (COLUMNS, left/MIN): count, sectionSize (col-1), gutter, and offset (padding) bound to variables; one style for all modes. |
// | Preview frames | One frame per viewport: width bound to grid/viewport-width, explicit variable mode, grid style applied. |
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

// Viewport keys under config.config; only objects with layout fields count as viewports
function getViewportConfigKeys(innerConfig) {
  if (!innerConfig || typeof innerConfig !== 'object') return [];
  return Object.keys(innerConfig).filter(function(k) {
    var vc = innerConfig[k];
    return !!(vc && typeof vc === 'object' && typeof vc.containerWidth === 'number' && typeof vc.columns === 'number');
  });
}

function modeLabelFromViewportKey(key) {
  if (!key || typeof key !== 'string') return 'Default';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// Pixel width for col-1..col-N: spans up to N columns, or full content width when N exceeds this viewport's column count
function calculateColumnVariable(colNum, viewportConfig) {
  if (colNum > viewportConfig.columns) {
    return viewportConfig.containerWidth - (viewportConfig.padding * 2);
  }
  var colWidth = calculateColumnWidth(viewportConfig);
  return (colWidth * colNum) + (viewportConfig.gap * (colNum - 1));
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
    var viewportKeys = getViewportConfigKeys(innerConfig);
    if (viewportKeys.length === 0) {
      return {};
    }
    var maxCols = 0;
    for (var mi = 0; mi < viewportKeys.length; mi++) {
      var cols = innerConfig[viewportKeys[mi]].columns;
      if (cols > maxCols) maxCols = cols;
    }

    function valuesPerViewport(valueFn) {
      var values = {};
      for (var vi = 0; vi < viewportKeys.length; vi++) {
        (function(vk) {
          var modeName = modeLabelFromViewportKey(vk);
          values[modeName] = function(config) {
            return valueFn(config[vk]);
          };
        })(viewportKeys[vi]);
      }
      return values;
    }

    var basicVariables = {
      "grid/columns": {
        type: "FLOAT",
        values: valuesPerViewport(function(vc) { return vc.columns; })
      },
      "grid/gap": {
        type: "FLOAT",
        values: valuesPerViewport(function(vc) { return vc.gap; })
      },
      "grid/padding": {
        type: "FLOAT",
        values: valuesPerViewport(function(vc) { return vc.padding; })
      },
      "grid/viewport-width": {
        type: "FLOAT",
        values: valuesPerViewport(function(vc) { return vc.containerWidth; })
      }
    };

    for (var colNum = 1; colNum <= maxCols; colNum++) {
      (function(c) {
        var colValues = {};
        for (var vi = 0; vi < viewportKeys.length; vi++) {
          (function(vk) {
            var modeName = modeLabelFromViewportKey(vk);
            colValues[modeName] = function(config) {
              return calculateColumnVariable(c, config[vk]);
            };
          })(viewportKeys[vi]);
        }
        basicVariables['grid/col-' + c] = {
          type: "FLOAT",
          values: colValues
        };
      })(colNum);
    }

    return basicVariables;
  }
};

// ========================================
// CORE FUNCTIONS
// ========================================

async function createOrUpdateCollection(config) {
  var collectionName = (config.structure && config.structure.variableCollection != null) ? config.structure.variableCollection : config.collectionName;
  var group = (config.structure && config.structure.variableGroup !== undefined) ? config.structure.variableGroup : '';
  var prefix = variableNamePrefix(group);

  // Resolve variables (may be a function of config for dynamic column count)
  var variables = typeof config.variables === 'function' ? config.variables(config.config) : config.variables;

  console.log('=== GRID SYSTEM MANAGER ===');
  console.log('Processing collection: ' + collectionName + (group ? ' (group: ' + group + ')' : ' (no group)'));
  
  var collection = await getOrCreateCollection(collectionName);
  
  // Mode order follows config object key order (not Object.keys on variable.values, which can differ)
  var modes = getViewportConfigKeys(config.config).map(modeLabelFromViewportKey);
  if (modes.length === 0) {
    modes = extractModes({ variables: variables });
  }
  console.log('Detected modes (config order): ' + modes.join(', '));
  
  setupModes(collection, modes);
  
  var variablesWithPrefix = {};
  for (var key in variables) {
    variablesWithPrefix[prefix + key] = variables[key];
  }
  
  var stats = await processVariables(collection, variablesWithPrefix, config.config, modes);
  
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

// One layout grid style: COLUMNS, left (MIN); count, width (col-1), gutter, offset (padding) bound to variables
async function createGridStyles(collection, config) {
  var group = (config.structure && config.structure.variableGroup !== undefined) ? config.structure.variableGroup : '';
  var prefix = variableNamePrefix(group);
  var styleName = "Grid";
  var styleStats = { created: 0, updated: 0 };

  var viewportKeys = getViewportConfigKeys(config.config);
  var firstVc = viewportKeys.length > 0 ? config.config[viewportKeys[0]] : null;
  if (!firstVc) {
    console.warn("Grid style skipped: no viewport configs");
    return { styleStats: styleStats, gridStyle: null };
  }

  var sectionSize = calculateColumnWidth(firstVc);
  var gridLayoutNumeric = {
    pattern: "COLUMNS",
    alignment: "MIN",
    count: firstVc.columns,
    gutterSize: firstVc.gap,
    sectionSize: sectionSize,
    offset: firstVc.padding
  };

  var localGridStyles = await figma.getLocalGridStylesAsync();
  var existing = localGridStyles.find(function(s) { return s.name === styleName; });
  var gridStyle;
  if (existing) {
    gridStyle = existing;
    styleStats.updated++;
  } else {
    gridStyle = figma.createGridStyle();
    gridStyle.name = styleName;
    styleStats.created++;
  }

  var columnsVar = await getVariable(collection, prefix + "grid/columns");
  var gapVar = await getVariable(collection, prefix + "grid/gap");
  var col1Var = await getVariable(collection, prefix + "grid/col-1");
  var paddingVar = await getVariable(collection, prefix + "grid/padding");

  var layoutGridToApply = gridLayoutNumeric;
  if (columnsVar && gapVar && col1Var && paddingVar && typeof figma.variables.setBoundVariableForLayoutGrid === "function") {
    try {
      layoutGridToApply = figma.variables.setBoundVariableForLayoutGrid(layoutGridToApply, "count", columnsVar);
      layoutGridToApply = figma.variables.setBoundVariableForLayoutGrid(layoutGridToApply, "gutterSize", gapVar);
      layoutGridToApply = figma.variables.setBoundVariableForLayoutGrid(layoutGridToApply, "sectionSize", col1Var);
      layoutGridToApply = figma.variables.setBoundVariableForLayoutGrid(layoutGridToApply, "offset", paddingVar);
      console.log("Grid style: " + styleName + " (COLUMNS, MIN; count, gutterSize, sectionSize, offset bound to variables)");
    } catch (e) {
      console.warn("Grid style: variable binding failed: " + (e.message || e));
    }
  } else if (!columnsVar || !gapVar || !col1Var || !paddingVar) {
    console.log("Grid style: " + styleName + " (COLUMNS, MIN; missing grid/columns, grid/gap, grid/col-1, or grid/padding — using numeric values)");
  }

  gridStyle.layoutGrids = [layoutGridToApply];

  return { styleStats: styleStats, gridStyle: gridStyle };
}

// One frame per viewport: width → grid/viewport-width, explicit mode, grid style
async function createGridPreviewFrames(collection, config, gridStyle) {
  var stats = { created: 0, removed: 0 };
  if (!gridStyle) {
    console.warn("Preview frames skipped: no grid style");
    return stats;
  }

  var group = (config.structure && config.structure.variableGroup !== undefined) ? config.structure.variableGroup : '';
  var prefix = variableNamePrefix(group);
  var viewportKeys = getViewportConfigKeys(config.config);
  if (viewportKeys.length === 0) return stats;

  var parentName = "Grid System Preview";
  var i;
  var ch = figma.currentPage.children;
  for (i = ch.length - 1; i >= 0; i--) {
    if (ch[i].name === parentName && ch[i].type === "FRAME") {
      ch[i].remove();
      stats.removed++;
    }
  }

  var viewportWidthVar = await getVariable(collection, prefix + "grid/viewport-width");
  var previewHeight = 480;

  var parentFrame = figma.createFrame();
  parentFrame.name = parentName;
  parentFrame.layoutMode = "HORIZONTAL";
  parentFrame.primaryAxisSizingMode = "AUTO";
  parentFrame.counterAxisSizingMode = "AUTO";
  parentFrame.itemSpacing = 32;
  parentFrame.paddingLeft = 40;
  parentFrame.paddingRight = 40;
  parentFrame.paddingTop = 40;
  parentFrame.paddingBottom = 40;
  parentFrame.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.97 } }];

  for (i = 0; i < viewportKeys.length; i++) {
    var vk = viewportKeys[i];
    var modeLabel = modeLabelFromViewportKey(vk);
    var vc = config.config[vk];

    var viewportFrame = figma.createFrame();
    viewportFrame.name = modeLabel;
    viewportFrame.layoutMode = "NONE";
    viewportFrame.resize(vc.containerWidth, previewHeight);
    viewportFrame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    viewportFrame.strokes = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.88 } }];
    viewportFrame.strokeWeight = 1;

    var mode = collection.modes.find(function(m) { return m.name === modeLabel; });
    if (mode && typeof viewportFrame.setExplicitVariableModeForCollection === "function") {
      viewportFrame.setExplicitVariableModeForCollection(collection, mode.modeId);
    }

    if (viewportWidthVar && typeof viewportFrame.setBoundVariable === "function") {
      try {
        viewportFrame.setBoundVariable("width", viewportWidthVar);
      } catch (e) {
        console.warn("Preview frame " + modeLabel + ": width binding failed: " + (e.message || e));
      }
    }

    if ("setGridStyleIdAsync" in viewportFrame && typeof viewportFrame.setGridStyleIdAsync === "function") {
      await viewportFrame.setGridStyleIdAsync(gridStyle.id);
    } else {
      viewportFrame.gridStyleId = gridStyle.id;
    }

    parentFrame.appendChild(viewportFrame);
    stats.created++;
  }

  figma.currentPage.appendChild(parentFrame);
  figma.viewport.scrollAndZoomIntoView([parentFrame]);
  console.log("Grid preview: " + stats.created + " frame(s) (" + viewportKeys.map(modeLabelFromViewportKey).join(", ") + ")");
  return stats;
}

// ========================================
// EXECUTION
// ========================================

(async function() {
  try {
    var result = await createOrUpdateCollection(gridSystemConfig);
    var gridOut = await createGridStyles(result.collection, gridSystemConfig);
    var gridStyleStats = gridOut.styleStats;
    var previewStats = await createGridPreviewFrames(result.collection, gridSystemConfig, gridOut.gridStyle);
    var msg = '✅ Grid System: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' vars updated';
    if (gridStyleStats.created > 0 || gridStyleStats.updated > 0) {
      msg += '; ' + gridStyleStats.created + ' grid style(s) created, ' + gridStyleStats.updated + ' updated';
    }
    if (previewStats.created > 0) {
      msg += '; ' + previewStats.created + ' preview frame(s)';
    }
    figma.notify(msg);
  } catch (error) {
    console.error('Error:', error);
    figma.notify('❌ Error: ' + error.message);
  }
})();
