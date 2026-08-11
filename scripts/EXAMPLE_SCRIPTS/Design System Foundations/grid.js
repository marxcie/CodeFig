// Grid
// @DOC_START
// # Grid
// Create and update grid system variables programmatically.
//
// ## Overview
// Defines a variable collection for layout grid: columns, gap, padding, viewport width per mode (e.g. Desktop, Tablet, Mobile). Each mode specifies container width, columns, gap, padding; the script creates the variables.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | collectionName | Figma variable collection name. |
// | group | Optional folder prefix for variable names (e.g. `layout` → `layout/columns`). When empty, variables are at the collection root (`columns`, `gap`, …). |
// | modes | Ordered array of `{ name, containerWidth, columns, gap, padding }`. **Figma mode order matches array order.** Mode display names use `name` with only the first letter uppercased (`desktop-large` → `Desktop-large`). Column count (col-1..col-N) follows the mode with the most columns. |
// | extensionColumns | Optional number (default `0`). Adds virtual `col-*` variables beyond the grid max (e.g. max 12 + `4` → `col-13`…`col-16`). Widths use the same column unit as the grid and grow past the content area (e.g. col-13 > col-12). Does not change `columns`, layout-guide count, or grid style. |
// | distributeToMaxColumns | Optional boolean (default `false`). When `true`, slot `col-s` on a viewport with `N` columns uses the width for span `round(s × N ÷ maxCols)` (clamped to 1…`N`), so the **grid fraction** `s/maxCols` matches `span/N` (e.g. 6/12 → 4/8 on tablet). Extension columns (`col-(maxCols+1)`…) always use direct span widths and ignore this option. |
// | config (legacy) | Optional keyed object of viewports; ignored when `modes` is non-empty. |
// | variables | Function(innerConfig) or map of variable names. Creates columns, gap, padding, viewport-width, and col-1..col-(max+extensionColumns) (optionally under `group/`). |
// | Grid style | One grid style "Grid" (COLUMNS, left/MIN): count, sectionSize (col-1), gutter, and offset (padding) bound to variables; one style for all modes. |
// | Preview | **Grid — overview** section: one preview frame per viewport (width bound to viewport-width variable, explicit mode, grid style). **Only when `generateOverview` is true** (default `false`). |
// | generateOverview | Optional boolean (default `false`). When `true`, fills the **Grid — overview** section inside **`Design System Foundations`** (see `@Foundation overview`). |
// | (output scopes) | `columns` → `EFFECT_FLOAT` (layout grid count in the Effects / layout guide picker). `gap`, `padding`, `viewport-width`, `col-*` → `WIDTH_HEIGHT` and `GAP`. |
// @DOC_END

// Import functions from libraries
@import { getOrCreateCollection, getVariable, setupModes, extractModes, processVariables } from "@Variables"
@import { calculateColumnWidth } from "@Core Library"
@import { foundationCreateGridOverview } from "@Foundation overview"
@import { viewportLabel, namePrefix, resolveCollectionName, resolveGroup, normaliseConfig, writeManifest } from "@Foundation"

// ========================================
// GRID SYSTEM CONFIGURATION
// ========================================

// Build keyed viewport map from modes[] (insertion order preserved for Object.keys)
function gridModesToInnerConfig(modes) {
  var out = {};
  if (!Array.isArray(modes)) return out;
  for (var i = 0; i < modes.length; i++) {
    var m = modes[i];
    if (!m || typeof m !== 'object') continue;
    if (typeof m.name !== 'string' || !m.name) continue;
    if (typeof m.containerWidth !== 'number' || typeof m.columns !== 'number') continue;
    out[m.name] = {
      containerWidth: m.containerWidth,
      columns: m.columns,
      gap: typeof m.gap === 'number' ? m.gap : 0,
      padding: typeof m.padding === 'number' ? m.padding : 0
    };
  }
  return out;
}

function resolveGridInnerConfig(config) {
  if (config.modes && Array.isArray(config.modes) && config.modes.length > 0) {
    return gridModesToInnerConfig(config.modes);
  }
  if (config.config && typeof config.config === 'object') {
    return config.config;
  }
  return {};
}

function resolveExtensionColumns(config) {
  if (!config || typeof config.extensionColumns !== 'number' || config.extensionColumns <= 0) {
    return 0;
  }
  return Math.floor(config.extensionColumns);
}

// Viewport keys on inner config object; only objects with layout fields count as viewports
function getViewportConfigKeys(innerConfig) {
  if (!innerConfig || typeof innerConfig !== 'object') return [];
  return Object.keys(innerConfig).filter(function(k) {
    var vc = innerConfig[k];
    return !!(vc && typeof vc === 'object' && typeof vc.containerWidth === 'number' && typeof vc.columns === 'number');
  });
}

// Pixel width for col-1..col-N: spans up to N columns, or full content width when N exceeds this viewport's column count
function calculateColumnVariable(colNum, viewportConfig) {
  if (colNum > viewportConfig.columns) {
    return viewportConfig.containerWidth - (viewportConfig.padding * 2);
  }
  var colWidth = calculateColumnWidth(viewportConfig);
  return (colWidth * colNum) + (viewportConfig.gap * (colNum - 1));
}

// Virtual extension slots (col-(maxCols+1)…): same column unit as the grid, but span may exceed the viewport column count
function calculateExtensionColumnVariable(colNum, viewportConfig) {
  var colWidth = calculateColumnWidth(viewportConfig);
  return (colWidth * colNum) + (viewportConfig.gap * (colNum - 1));
}

// Map col-slot s (1..maxSlots) to span 1..viewportColumns so s/maxSlots ≈ span/viewportColumns (same grid fraction across breakpoints)
function slotToProportionalSpan(slot, maxSlots, viewportColumns) {
  if (viewportColumns <= 0 || maxSlots <= 0) {
    return 1;
  }
  if (slot < 1) {
    return 1;
  }
  if (slot > maxSlots) {
    slot = maxSlots;
  }
  var span = Math.round((slot * viewportColumns) / maxSlots);
  if (span < 1) {
    span = 1;
  }
  if (span > viewportColumns) {
    span = viewportColumns;
  }
  return span;
}

function resolveColVariableValue(colSlot, viewportConfig, maxCols, distribute) {
  if (!distribute) {
    return calculateColumnVariable(colSlot, viewportConfig);
  }
  var n = viewportConfig.columns;
  if (n <= 0) {
    return calculateColumnVariable(colSlot, viewportConfig);
  }
  var span = slotToProportionalSpan(colSlot, maxCols, n);
  return calculateColumnVariable(span, viewportConfig);
}

var gridSystemConfig = typeof gridSystemConfig !== 'undefined' ? gridSystemConfig : {
  // @CONFIG_START
  // @fromFile: domains.grid

  // # General
  // Where this goes, and what exists. Pick a collection in this file, or choose "New collection" and
  // type a name — a name that is not in this file is created on Run, including one that arrived in a
  // pasted config.
  collectionName: "Responsive System", // @collection @label: Collection

  // The collection's own modes. For Grid these are viewports; the chips are a view of the file, and
  // the tabs below hold each mode's values.
  // @collectionModes: Collection modes

  group: "Grid", // @label: Group within collection @placeholder="eg. Grid"

  // ---

  // # Mode settings
  // Global mode settings — values that apply to every mode, above the tab bar.
  // These doesn't appear in the grid, just added as numeric variables for overshoot layout
  extensionColumns: 0, // @label: Extra columns

  modes: [
    {
      name: "desktop",
      containerWidth: 1920,
      columns: 12,
      gap: 40,
      padding: 80
    },
    {
      name: "tablet",
      containerWidth: 768,
      columns: 8,
      gap: 24,
      padding: 40
    },
    {
      name: "mobile",
      containerWidth: 375,
      columns: 4,
      gap: 16,
      padding: 20
    }
  ], // @rows: name:text=Mode|containerWidth:number=Width|columns:number=Columns|gap:number=Gap|padding:number=Margins @tabs @label: Modes

  // When true: col-s uses span round(s×N÷maxCols) per viewport so grid fractions align (see @DOC)
  distributeToMaxColumns: false,

  // When true: create the "Grid System Preview" overview frame (one column per viewport)
  generateOverview: false,

  // @CONFIG_END
  // Variables to be created in Figma (function of config; max columns = viewport with most columns)
  // Second arg is the full grid config (optional); used for distributeToMaxColumns and extensionColumns
  variables: function(innerConfig, gridConfig) {
    var distribute = !!(gridConfig && gridConfig.distributeToMaxColumns);
    var extensionCols = resolveExtensionColumns(gridConfig);
    var viewportKeys = getViewportConfigKeys(innerConfig);
    if (viewportKeys.length === 0) {
      return {};
    }
    var maxCols = 0;
    for (var mi = 0; mi < viewportKeys.length; mi++) {
      var cols = innerConfig[viewportKeys[mi]].columns;
      if (cols > maxCols) maxCols = cols;
    }
    var totalColVars = maxCols + extensionCols;

    function valuesPerViewport(valueFn) {
      var values = {};
      for (var vi = 0; vi < viewportKeys.length; vi++) {
        (function(vk) {
          var modeName = viewportLabel(vk);
          values[modeName] = function(config) {
            return valueFn(config[vk]);
          };
        })(viewportKeys[vi]);
      }
      return values;
    }

    var basicVariables = {
      "columns": {
        type: "FLOAT",
        scopes: ["EFFECT_FLOAT"],
        values: valuesPerViewport(function(vc) { return vc.columns; })
      },
      "gap": {
        type: "FLOAT",
        scopes: ["WIDTH_HEIGHT", "GAP"],
        values: valuesPerViewport(function(vc) { return vc.gap; })
      },
      "padding": {
        type: "FLOAT",
        scopes: ["WIDTH_HEIGHT", "GAP"],
        values: valuesPerViewport(function(vc) { return vc.padding; })
      },
      "viewport-width": {
        type: "FLOAT",
        scopes: ["WIDTH_HEIGHT", "GAP"],
        values: valuesPerViewport(function(vc) { return vc.containerWidth; })
      }
    };

    for (var colNum = 1; colNum <= totalColVars; colNum++) {
      (function(c) {
        var isExtensionCol = c > maxCols;
        var colValues = {};
        for (var vi = 0; vi < viewportKeys.length; vi++) {
          (function(vk) {
            var modeName = viewportLabel(vk);
            colValues[modeName] = function(configCtx) {
              if (isExtensionCol) {
                return calculateExtensionColumnVariable(c, configCtx[vk]);
              }
              return resolveColVariableValue(c, configCtx[vk], maxCols, distribute);
            };
          })(viewportKeys[vi]);
        }
        basicVariables['col-' + c] = {
          type: "FLOAT",
          scopes: ["WIDTH_HEIGHT", "GAP"],
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
  var collectionName = resolveCollectionName(config);
  var group = resolveGroup(config);
  var prefix = namePrefix(group);
  var innerConfig = resolveGridInnerConfig(config);

  // Resolve variables (may be a function of config for dynamic column count; pass full config for options like distributeToMaxColumns)
  var variables = typeof config.variables === 'function' ? config.variables(innerConfig, config) : config.variables;

  console.log('=== GRID SYSTEM MANAGER ===');
  console.log('Processing collection: ' + collectionName + (group ? ' (group: ' + group + ')' : ' (no group)'));
  
  var collection = await getOrCreateCollection(collectionName);
  
  // Mode order follows modes[] array or legacy config key order
  var modes = getViewportConfigKeys(innerConfig).map(function(k) { return viewportLabel(k); });
  if (modes.length === 0) {
    modes = extractModes({ variables: variables });
  }
  console.log('Detected modes (config order): ' + modes.join(', '));
  
  setupModes(collection, modes);
  
  var variablesWithPrefix = {};
  for (var key in variables) {
    variablesWithPrefix[prefix + key] = variables[key];
  }
  
  var stats = await processVariables(collection, variablesWithPrefix, innerConfig, modes);
  
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
  var group = resolveGroup(config);
  var prefix = namePrefix(group);
  var styleName = "Grid";
  var styleStats = { created: 0, updated: 0 };

  var innerConfig = resolveGridInnerConfig(config);
  var viewportKeys = getViewportConfigKeys(innerConfig);
  var firstVc = viewportKeys.length > 0 ? innerConfig[viewportKeys[0]] : null;
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

  var columnsVar = await getVariable(collection, prefix + "columns");
  var gapVar = await getVariable(collection, prefix + "gap");
  var col1Var = await getVariable(collection, prefix + "col-1");
  var paddingVar = await getVariable(collection, prefix + "padding");

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
    console.log("Grid style: " + styleName + " (COLUMNS, MIN; missing columns, gap, col-1, or padding — using numeric values)");
  }

  gridStyle.layoutGrids = [layoutGridToApply];

  return { styleStats: styleStats, gridStyle: gridStyle };
}

// Grid preview lives in **Design System Foundations → Grid — overview** (@Foundation overview).

// ========================================
// EXECUTION
// ========================================

createOrUpdateCollection(gridSystemConfig)
  .then(function (result) {
    return createGridStyles(result.collection, gridSystemConfig).then(function (gridOut) {
      return { result: result, gridOut: gridOut };
    });
  })
  .then(function (ctx) {
    var result = ctx.result;
    var gridOut = ctx.gridOut;
    var gridStyleStats = gridOut.styleStats;
    if (!gridSystemConfig.generateOverview) {
      return Promise.resolve({ previewStats: { created: 0, removed: 0 }, result: result, gridStyleStats: gridStyleStats, gridOut: gridOut });
    }
    return foundationCreateGridOverview(result.collection, gridSystemConfig, gridOut.gridStyle).then(function (previewStats) {
      return { previewStats: previewStats, result: result, gridStyleStats: gridStyleStats, gridOut: gridOut };
    });
  })
  .then(function (done) {
    var previewStats = done.previewStats;
    var result = done.result;
    var gridStyleStats = done.gridStyleStats;

    // Record the set, the way the ramps do. Plan 19's contract is that a run records the whole
    // `normaliseConfig(...).domains[domain]` slice; Grid simply predates it, which is why its panel
    // had an auto-import that could never fire — a feature that lies. Written last and it cannot fail
    // the run: the variables and the grid style are real whether or not the record of them is.
    var manifest = null;
    try {
      manifest = writeManifest(result.collection, {
        domain: 'grid',
        group: resolveGroup(gridSystemConfig),
        modes: (gridSystemConfig.modes || []).map(function (m) { return m.name; }),
        tokens: [],
        config: normaliseConfig(gridSystemConfig).config.domains.grid
      });
      if (manifest && manifest.ok) {
        console.log('Recorded this set: ' + manifest.key + ' (' + manifest.bytes + ' characters)');
      } else if (manifest) {
        console.warn('Variables were written. The set could not be recorded: ' +
          ((manifest.warnings[0] || {}).message || 'unknown reason'));
      }
    } catch (e) {
      console.warn('Variables were written. The set could not be recorded: ' + (e && e.message ? e.message : e));
    }

    var msg = 'Grid System: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' vars updated';
    if (gridStyleStats.created > 0 || gridStyleStats.updated > 0) {
      msg += '; ' + gridStyleStats.created + ' grid style(s) created, ' + gridStyleStats.updated + ' updated';
    }
    if (previewStats.created > 0) {
      msg += '; ' + previewStats.created + ' preview frame(s)';
    }
    if (manifest && manifest.ok) msg += '; set recorded';
    figma.notify(msg);
  })
  .catch(function (error) {
    console.error('Error:', error);
    figma.notify('Error: ' + error.message);
  });
