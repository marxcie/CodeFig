// Grid
// @DOC_START
// # Creates a layout grid per Variable Mode with column, gap and margin variables and one Layout Guide style
//
// ## Overview
//
// Each mode defines column count, gap, margins, and viewport width. The script creates the matching
// variables and a single **Grid** layout style for all modes.
//
// Enable **Generate overview** to also create a preview frame on the Figma canvas for each mode,
// with the layout grid applied.
//
// Column width variables (`col-1` … `col-N`) follow the mode with the most columns. **Extra columns**
// adds variables past that maximum for layouts that need to overshoot.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Collection**<br>`collectionName` | Name of the Figma variable collection. |
// | **Collection modes** | Chips for modes in the collection. Add, remove, or rename here. Each mode gets its own settings below. |
// | **Group within collection**<br>`group` | Folder prefix for variable names, e.g. `Grid` → `Grid/columns`. When empty, variables sit at the collection root. |
// | **Extra columns**<br>`extensionColumns` | Extra column variables past the grid maximum. Default `0`. Max 12 + `4` adds `col-13` through `col-16`. Same column unit as the grid; widths can extend past the content area. Does not change column count, layout guides, or the grid style. |
// | **Generate overview**<br>`generateOverview` | When on, creates a grid overview on the canvas: one preview frame per mode with the layout grid applied. Off by default. |
// | **Mode**<br>`modes[].name` | Name of this mode (viewport). |
// | **Width**<br>`modes[].containerWidth` | Viewport / container width in pixels. |
// | **Columns**<br>`modes[].columns` | Number of columns in the layout grid for this mode. |
// | **Gap**<br>`modes[].gap` | Gutter between columns. |
// | **Margins**<br>`modes[].padding` | Offset from the container edges (padding). |
// @DOC_END

// The Configuration tab redraws this as you type. Pure: it computes and renders, and touches nothing.
// @PREVIEW: gridPreviewHtml
// @SUGGESTIONS: gridSuggestionsHtml

// Import functions from libraries

@import { getOrCreateCollection, getVariable, setupModes, extractModes, processVariables, applyModeIntents } from "@Variables"
@import { calculateColumnWidth } from "@Core Library"
@import { foundationCreateGridOverview } from "@Foundation overview"
@import { gridPreviewHtml, gridSuggestionsHtml, viewportLabel, namePrefix, resolveCollectionName, resolveGroup, normaliseConfig, writeManifest, findFoundationSet, foundationModeIds, alignStampedTokens, stampGeneratedTokens, describeStampAlignment } from "@Foundation"

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

var gridSystemConfig = typeof gridSystemConfig !== 'undefined' ? gridSystemConfig : {
  // @CONFIG_START
  // @fromFile: domains.grid

  collectionName: "",
  group: "",
  extensionColumns: 0,
  generateOverview: false,
  modes: []
// @CONFIG_END

  ,
  // Variables to be created in Figma (function of config; max columns = viewport with most columns)
  // Second arg is the full grid config (optional); used for extensionColumns
  variables: function(innerConfig, gridConfig) {
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
              return calculateColumnVariable(c, configCtx[vk]);
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

// @PANEL_START
var __codefigPanel = {
  blocks: [
    { type: "heading", text: "General" },
    { key: "collectionName", type: "collection", label: "Collection",
      placeholder: "eg. Responsive System" },
    { type: "chips", label: "Collection modes", from: "modes" },
    { key: "group", type: "string", label: "Group within collection", placeholder: "eg. Grid" },
    { type: "divider", section: true },
    { type: "heading", text: "Mode settings", showWhen: { collectionName: "*" } },
    { key: "extensionColumns", type: "number", label: "Extra columns",
      showWhen: { collectionName: "*" },
      helper: "Extra column variables past the main grid, for layouts that need to overshoot." },
    { key: "generateOverview", type: "boolean", label: "Generate overview",
      showWhen: { collectionName: "*" },
      helper: "Builds a Grid overview on the canvas: one preview frame per mode with the layout grid applied." },
    { key: "modes", type: "rows", label: "Modes", layout: "tabs",
      showWhen: { collectionName: "*" },
      columns: [
        { key: "name", type: "text", label: "Mode" },
        { key: "containerWidth", type: "number", label: "Width" },
        { key: "columns", type: "number", label: "Columns" },
        { key: "gap", type: "number", label: "Gap" },
        { key: "padding", type: "number", label: "Margins" }
      ] },
    { type: "heading", text: "Suggested whole number divisions",
      showWhen: { collectionName: "*" } },
    { type: "suggestions", showWhen: { collectionName: "*" } },
    { type: "heading", text: "Preview", showWhen: { collectionName: "*" } },
    { type: "preview", showWhen: { collectionName: "*" } }
  ]
};
// @PANEL_END

// ========================================
// CORE FUNCTIONS
// ========================================

async function createOrUpdateCollection(config) {
  var collectionName = resolveCollectionName(config);
  var group = resolveGroup(config);
  var prefix = namePrefix(group);
  var innerConfig = resolveGridInnerConfig(config);

  // Resolve variables (may be a function of config for dynamic column count; pass full config for extensionColumns)
  var variables = typeof config.variables === 'function' ? config.variables(innerConfig, config) : config.variables;

  if (config.distributeToMaxColumns !== undefined) {
    console.warn('distributeToMaxColumns is no longer supported and was ignored. col-s is always the ' +
      'width of s columns of that mode. If this was set to true, col-* values change on any mode whose ' +
      'column count differs from the largest — remove the setting to stop seeing this.');
  }

  console.log('=== GRID SYSTEM MANAGER ===');
  console.log('Processing collection: ' + collectionName + (group ? ' (group: ' + group + ')' : ' (no group)'));
  
  var collection = await getOrCreateCollection(collectionName);

  // What the panel's chips asked for, before anything else reads a mode name.
  //
  // Renames must land before `setupModes`, which matches on names: a mode renamed in the panel would
  // otherwise read as one mode gone and one arrived — an add plus an orphan holding every value and
  // binding. Removals land here too, so that removing a mode and adding one with the same name is the
  // replacement Márton's spec calls it rather than a deletion.
  //
  // Null for a CLI run or a script opened without a panel, and then nothing here happens at all: names
  // are matched, nothing is removed, which is the invariant a pasted config relies on.
  var intents = typeof window !== 'undefined' ? window.codefigModeIntents : null;
  var modeReport = applyModeIntents(collection, intents);
  if (modeReport.renamed.length) {
    console.log('Renamed ' + modeReport.renamed.length + ' mode(s) from the panel: ' +
      modeReport.renamed.map(function (r) { return r.from + ' \u2192 ' + r.to; }).join(', '));
  }
  if (modeReport.removed.length) {
    console.log('Removed ' + modeReport.removed.length + ' mode(s) as asked: ' +
      modeReport.removed.join(', ') + ' — their values are gone and any binding to them is lost');
  }
  modeReport.skipped.forEach(function (skip) {
    console.warn('Mode "' + skip.name + '" was left alone: ' + skip.reason);
  });

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

  // The same rule the mode intents above follow, one level down: `processVariables` matches on names,
  // so a group renamed in the panel has to become a move of the variables already there before
  // anything is written, or it becomes a second grid beside the first.
  var names = Object.keys(variablesWithPrefix);
  // Through the stamps, so a renamed group is the same set rather than a second one.
  var setId = (await findFoundationSet(collection, 'grid', group)).id || '';
  var aligned = await alignStampedTokens(collection, 'grid', group, names, setId);
  describeStampAlignment(aligned).forEach(function (line) { console.log(line); });

  var stats = await processVariables(collection, variablesWithPrefix, innerConfig, modes);

  console.log('=== GRID SYSTEM SUMMARY ===');
  console.log('Collection: ' + collectionName);
  console.log('Variables created: ' + stats.created);
  console.log('Variables updated: ' + stats.updated);
  console.log('Variables skipped: ' + stats.skipped);
  
  return {
    collection: collection,
    stats: stats,
    names: names,
    setId: setId
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
  .then(async function (done) {
    var previewStats = done.previewStats;
    var result = done.result;
    var gridStyleStats = done.gridStyleStats;

    // Record the set, the way the ramps do. Plan 19's contract is that a run records the whole
    // `normaliseConfig(...).domains[domain]` slice; Grid simply predates it, which is why its panel
    // had an auto-import that could never fire — a feature that lies. Written last and it cannot fail
    // the run: the variables and the grid style are real whether or not the record of them is.
    var manifest = null;
    try {
      var gridModes = (gridSystemConfig.modes || []).map(function (m) { return m.name; });
      manifest = writeManifest(result.collection, {
        id: result.setId,
        domain: 'grid',
        group: resolveGroup(gridSystemConfig),
        modes: gridModes,
        modeIds: foundationModeIds(result.collection, gridModes),
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

    // After the manifest: it is what mints the set id, and a stamp without one cannot tell two grids
    // in a collection apart.
    var stamped = await stampGeneratedTokens(
      result.collection, 'grid', resolveGroup(gridSystemConfig), result.names,
      (manifest && manifest.manifest ? manifest.manifest.id : result.setId)
    );
    stamped.warnings.forEach(function (w) { console.warn(w.message); });

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
