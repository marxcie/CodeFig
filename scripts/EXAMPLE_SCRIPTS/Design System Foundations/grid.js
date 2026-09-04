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
// **Extra values** are CSS-calc-style formulas turned into variables — e.g. `col-1+gap` for wrapper
// padding when children sit on a sub-grid. Figma has no `calc()`, so these are precomputed per mode.
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
// | **Extra values**<br>`extraValues` | Formulas using `col-N`, `gap`, `margin`, and numbers with `+ - * /` (e.g. `col-1+gap`, `col-1*2+gap`, `margin-gap`). `margin` is the Margins field. Each entry becomes a variable with that name, valued per mode. Empty by default. Not the same as Extra columns. |
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

/** Space-stripped formula string — also the variable name. */
function normalizeGridExtraValueName(raw) {
  return String(raw == null ? '' : raw).replace(/\s+/g, '');
}

/**
 * Unique formula entries from `extraValues` (array or comma list), names normalized.
 * Order preserved; first spelling wins when two normalize to the same name.
 */
function resolveExtraValues(config) {
  if (!config || config.extraValues == null) return [];
  var raw = config.extraValues;
  var list = [];
  if (Array.isArray(raw)) {
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] == null || raw[i] === '') continue;
      list.push(String(raw[i]));
    }
  } else if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    list = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  } else {
    return [];
  }
  var seen = {};
  var out = [];
  for (var j = 0; j < list.length; j++) {
    var name = normalizeGridExtraValueName(list[j]);
    if (!name || seen[name]) continue;
    seen[name] = true;
    out.push(name);
  }
  return out;
}

/**
 * Tokenize a normalized formula. Atoms: col-N, gap, margin, number. Ops: + - * /.
 * `margin` is the Margins field (`modes[].padding` in config).
 * → { ok: true, tokens } | { ok: false, error }
 */
function tokenizeGridExtraValue(formula) {
  var s = normalizeGridExtraValueName(formula);
  if (!s) return { ok: false, error: 'empty formula' };
  var tokens = [];
  var i = 0;
  while (i < s.length) {
    var col = /^col-(\d+)/.exec(s.slice(i));
    if (col) {
      tokens.push({ type: 'col', n: parseInt(col[1], 10) });
      i += col[0].length;
      continue;
    }
    if (s.slice(i, i + 6) === 'margin') {
      tokens.push({ type: 'margin' });
      i += 6;
      continue;
    }
    if (s.slice(i, i + 3) === 'gap') {
      tokens.push({ type: 'gap' });
      i += 3;
      continue;
    }
    var num = /^(\d+(?:\.\d+)?)/.exec(s.slice(i));
    if (num) {
      tokens.push({ type: 'num', value: parseFloat(num[1]) });
      i += num[0].length;
      continue;
    }
    var ch = s.charAt(i);
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', op: ch });
      i += 1;
      continue;
    }
    return { ok: false, error: 'unexpected "' + ch + '" in ' + s };
  }
  return { ok: true, tokens: tokens };
}

/**
 * Parse a formula into an AST. Precedence: * / before + -; left-associative within a level.
 * No parentheses, no unary minus.
 * → { ok: true, name, ast } | { ok: false, error, name? }
 */
function parseGridExtraValue(raw) {
  var name = normalizeGridExtraValueName(raw);
  var tok = tokenizeGridExtraValue(name);
  if (!tok.ok) return { ok: false, error: tok.error, name: name || undefined };

  var tokens = tok.tokens;
  var pos = 0;

  function peek() { return pos < tokens.length ? tokens[pos] : null; }
  function next() { return tokens[pos++]; }

  function parseFactor() {
    var t = peek();
    if (!t) return { ok: false, error: 'expected a value in ' + name };
    if (t.type === 'op') return { ok: false, error: 'unexpected "' + t.op + '" in ' + name };
    next();
    if (t.type === 'col') return { ok: true, ast: { type: 'col', n: t.n } };
    if (t.type === 'gap') return { ok: true, ast: { type: 'gap' } };
    if (t.type === 'margin') return { ok: true, ast: { type: 'margin' } };
    if (t.type === 'num') return { ok: true, ast: { type: 'num', value: t.value } };
    return { ok: false, error: 'unknown token in ' + name };
  }

  function parseTerm() {
    var left = parseFactor();
    if (!left.ok) return left;
    var ast = left.ast;
    while (peek() && peek().type === 'op' && (peek().op === '*' || peek().op === '/')) {
      var op = next().op;
      var right = parseFactor();
      if (!right.ok) return right;
      ast = { type: 'op', op: op, left: ast, right: right.ast };
    }
    return { ok: true, ast: ast };
  }

  function parseExpr() {
    var left = parseTerm();
    if (!left.ok) return left;
    var ast = left.ast;
    while (peek() && peek().type === 'op' && (peek().op === '+' || peek().op === '-')) {
      var op = next().op;
      var right = parseTerm();
      if (!right.ok) return right;
      ast = { type: 'op', op: op, left: ast, right: right.ast };
    }
    return { ok: true, ast: ast };
  }

  var parsed = parseExpr();
  if (!parsed.ok) return { ok: false, error: parsed.error, name: name };
  if (pos < tokens.length) {
    return { ok: false, error: 'unexpected trailing tokens in ' + name, name: name };
  }
  return { ok: true, name: name, ast: parsed.ast };
}

/**
 * Evaluate a parsed AST against one viewport. `maxCols` is the grid-wide column variable count
 * before Extra columns (same rule as `col-N` generation).
 * → { ok: true, value } | { ok: false, error }
 */
function evalGridExtraValue(ast, viewportConfig, maxCols) {
  if (!ast) return { ok: false, error: 'missing formula' };
  if (ast.type === 'num') return { ok: true, value: ast.value };
  if (ast.type === 'gap') {
    return { ok: true, value: typeof viewportConfig.gap === 'number' ? viewportConfig.gap : 0 };
  }
  if (ast.type === 'margin') {
    return { ok: true, value: typeof viewportConfig.padding === 'number' ? viewportConfig.padding : 0 };
  }
  if (ast.type === 'col') {
    var n = ast.n;
    var cap = typeof maxCols === 'number' ? maxCols : viewportConfig.columns;
    if (n > cap) {
      return { ok: true, value: calculateExtensionColumnVariable(n, viewportConfig) };
    }
    return { ok: true, value: calculateColumnVariable(n, viewportConfig) };
  }
  if (ast.type === 'op') {
    var L = evalGridExtraValue(ast.left, viewportConfig, maxCols);
    if (!L.ok) return L;
    var R = evalGridExtraValue(ast.right, viewportConfig, maxCols);
    if (!R.ok) return R;
    if (ast.op === '+') return { ok: true, value: L.value + R.value };
    if (ast.op === '-') return { ok: true, value: L.value - R.value };
    if (ast.op === '*') return { ok: true, value: L.value * R.value };
    if (ast.op === '/') {
      if (R.value === 0) return { ok: false, error: 'division by zero' };
      return { ok: true, value: L.value / R.value };
    }
    return { ok: false, error: 'unknown operator' };
  }
  return { ok: false, error: 'unknown formula node' };
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
  extraValues: [],
  generateOverview: false,
  modes: []
// @CONFIG_END

  ,
  // Variables to be created in Figma (function of config; max columns = viewport with most columns)
  // Second arg is the full grid config (optional); used for extensionColumns and extraValues
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

    var extras = resolveExtraValues(gridConfig);
    for (var ei = 0; ei < extras.length; ei++) {
      (function(formulaName) {
        var parsed = parseGridExtraValue(formulaName);
        if (!parsed.ok) {
          console.warn('Extra value skipped ("' + formulaName + '"): ' + parsed.error);
          return;
        }
        var formulaValues = {};
        for (var vi = 0; vi < viewportKeys.length; vi++) {
          (function(vk) {
            var modeName = viewportLabel(vk);
            formulaValues[modeName] = function(configCtx) {
              var got = evalGridExtraValue(parsed.ast, configCtx[vk], maxCols);
              if (!got.ok) {
                console.warn('Extra value "' + formulaName + '" failed for ' + modeName + ': ' + got.error);
                return 0;
              }
              return got.value;
            };
          })(viewportKeys[vi]);
        }
        basicVariables[parsed.name] = {
          type: "FLOAT",
          scopes: ["WIDTH_HEIGHT", "GAP"],
          values: formulaValues
        };
      })(extras[ei]);
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
    { key: "extraValues", type: "list", label: "Extra values",
      showWhen: { collectionName: "*" },
      placeholder: "col-1+gap, col-1*2+gap",
      helper: "Formulas using col-N, gap, margin, and numbers with + - * /. margin is the Margins field. Each entry becomes a variable with that name, valued per mode. Leave empty for none." },
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
