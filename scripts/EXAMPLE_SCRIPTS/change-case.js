// Change case
// SCRIPT_NAME: Change case
// @DOC_START
// # Renames canvas layers, components, variants, styles, and variables to a chosen case style
//
// ## Overview
//
// Pick a case style, tick what to rename, and Run. Canvas targets respect **Scope**. Styles and
// variables are file-level: styles cover every local paint, text, effect, and grid style; variables
// use the Collection and optional Group you pick.
//
// Path segments separated by `/` are transformed independently. Within a segment, words split on
// spaces, hyphens, and underscores, then rejoin in the chosen style (hyphen styles join with `-`).
//
// ### Case styles
//
// | Style | Example (`icons/arrow right`) |
// | --- | --- |
// | lower case | `icons/arrow right` |
// | lower-case | `icons/arrow-right` |
// | Capital case | `Icons/Arrow Right` |
// | Capital-case | `Icons/Arrow-Right` |
// | ALL CAPS | `ICONS/ARROW RIGHT` |
// | ALL-CAPS | `ICONS/ARROW-RIGHT` |
// | camelCase | `icons/arrowRight` |
//
// ### Canvas
//
// **Variant labels** also renames BOOLEAN / TEXT / INSTANCE_SWAP property names (what the
// Properties panel shows as `Icon: False`). **Variant values** only rewrites option strings in
// variant layer names (`Type=CTA` → `Type=cta`); boolean true/false display casing is Figma's.
//
// ### Styles
//
// **Style groups** changes every `/` segment except the leaf. **Style names** changes the leaf.
// Both together change every segment. Name collisions are skipped and reported.
//
// ### Variables
//
// One collection at a time. Optional **Group** narrows the path. **Recursive** (default on)
// for Variable names changes the target group and everything under it; off changes only the
// target segment. For Canvas, Recursive walks descendants; off renames only the scope roots
// (or each page's top-level children).
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Canvas**<br>`canvasTargets` | Component names, Variant labels, Variant values, Layer names. |
// | **Styles and variables**<br>`stylesAndVariables` | Variable names, Style groups, Style names. |
// | **Collection**<br>`variableCollection` | Local collection for Variable names. Shown when Variable names is ticked. |
// | **Group**<br>`groupName` | Optional path under the collection. Empty means collection root. |
// | **Case style**<br>`caseStyle` | lower case, lower-case, Capital case, Capital-case, ALL CAPS, ALL-CAPS, or camelCase. |
// | **Scope**<br>`scope` | Selection, This page, or All pages. Shown when a Canvas target is ticked. |
// | **Recursive**<br>`recursive` | Canvas: walk descendants (on) or only scope roots (off). Variable names: target group and children (on) or target segment only (off). |
// @DOC_END

@import { collectNodesAsync, getAllStyles } from "@Core Library"
@import { getCollection, getCollectionVariables, getVariable } from "@Variables"

// @UI_CONFIG_START
var caseStyle = "lower case";
var scope = "Selection";
var canvasTargets = [];
var stylesAndVariables = [];
var variableCollection = "";
var groupName = "";
var recursive = true;
// @UI_CONFIG_END

// @PANEL_START
var __codefigPanel = {
  blocks: [
    { type: "heading", text: "Target" },
    {
      key: "canvasTargets",
      type: "multiselect",
      label: "Canvas",
      options: [
        "Component names",
        "Variant labels",
        "Variant values",
        "Layer names"
      ]
    },
    {
      key: "stylesAndVariables",
      type: "multiselect",
      label: "Styles and variables",
      options: ["Variable names", "Style groups", "Style names"]
    },
    {
      key: "variableCollection",
      type: "select",
      label: "Collection",
      options: "localVariableCollections",
      showWhen: { stylesAndVariables: "Variable names" },
      helper: "Which collection to rename. Only used when Variable names is ticked."
    },
    {
      key: "groupName",
      type: "string",
      label: "Group",
      placeholder: "Color/Brand",
      showWhen: { stylesAndVariables: "Variable names" },
      helper: "Optional path under the collection. Empty means the collection root."
    },
    { type: "divider" },
    { type: "heading", text: "General" },
    {
      key: "caseStyle",
      type: "select",
      label: "Case style",
      options: [
        "lower case",
        "lower-case",
        "Capital case",
        "Capital-case",
        "ALL CAPS",
        "ALL-CAPS",
        "camelCase"
      ]
    },
    {
      key: "scope",
      type: "radio",
      label: "Scope",
      options: ["Selection", "This page", "All pages"],
      showWhen: { canvasTargets: "*" }
    },
    {
      key: "recursive",
      type: "boolean",
      label: "Recursive",
      helper: "Canvas: on walks descendants; off only the scope roots. Variable names: on changes the target group and everything under it; off only the target segment."
    }
  ]
};
// @PANEL_END

var CASE_STYLES = {
  "lower case": true,
  "lower-case": true,
  "Capital case": true,
  "Capital-case": true,
  "ALL CAPS": true,
  "ALL-CAPS": true,
  camelCase: true
};

function hasTarget(list, label) {
  if (!Array.isArray(list)) return false;
  for (var i = 0; i < list.length; i++) {
    if (list[i] === label) return true;
  }
  return false;
}

function resolveCaseStyle(style) {
  var s = style == null ? "" : String(style);
  return CASE_STYLES[s] ? s : "lower case";
}

function splitWords(text) {
  return String(text || "")
    .split(/[\s\-_]+/)
    .filter(function (part) {
      return part.length > 0;
    });
}

function titleWord(word) {
  var lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function transformSegment(segment, style) {
  var words = splitWords(segment);
  if (!words.length) return segment;

  if (style === "lower case") {
    return segment.toLowerCase();
  }
  if (style === "lower-case") {
    return words
      .map(function (word) {
        return word.toLowerCase();
      })
      .join("-");
  }
  if (style === "Capital case") {
    return words.map(titleWord).join(" ");
  }
  if (style === "Capital-case") {
    return words.map(titleWord).join("-");
  }
  if (style === "ALL CAPS") {
    return segment.toUpperCase();
  }
  if (style === "ALL-CAPS") {
    return words
      .map(function (word) {
        return word.toUpperCase();
      })
      .join("-");
  }
  // camelCase
  return words
    .map(function (word, index) {
      var lower = word.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function applyCase(name, style) {
  var value = String(name == null ? "" : name);
  if (!value) return value;
  var resolved = resolveCaseStyle(style);
  return value
    .split("/")
    .map(function (segment) {
      return transformSegment(segment, resolved);
    })
    .join("/");
}

function normalizeGroupPath(group) {
  var s = group == null ? "" : String(group).trim();
  while (s.indexOf("//") !== -1) s = s.split("//").join("/");
  if (s.charAt(0) === "/") s = s.slice(1);
  if (s.charAt(s.length - 1) === "/") s = s.slice(0, -1);
  return s;
}

function pathParts(path) {
  var s = normalizeGroupPath(path);
  if (!s) return [];
  return s.split("/");
}

/**
 * Style path: groups = non-leaf segments, names = leaf. A single-segment name is a leaf only.
 */
function applyCaseToStylePath(name, style, doGroups, doNames) {
  var parts = String(name == null ? "" : name).split("/");
  if (!parts.length) return name;
  if (parts.length === 1) {
    return doNames ? transformSegment(parts[0], style) : name;
  }
  for (var i = 0; i < parts.length; i++) {
    var isLast = i === parts.length - 1;
    if (isLast && doNames) parts[i] = transformSegment(parts[i], style);
    if (!isLast && doGroups) parts[i] = transformSegment(parts[i], style);
  }
  return parts.join("/");
}

/**
 * Variable path under an optional group. Recursive = target segment + everything below it.
 * Non-recursive = target segment only. Empty group + non-recursive = top-level segment only.
 */
function applyCaseToVariablePath(varName, groupPath, isRecursive, style) {
  var parts = pathParts(varName);
  if (!parts.length) return null;
  var groupParts = pathParts(groupPath);

  if (groupParts.length) {
    if (parts.length < groupParts.length) return null;
    for (var i = 0; i < groupParts.length; i++) {
      if (parts[i] !== groupParts[i]) return null;
    }
    var start = groupParts.length - 1;
    var end = isRecursive ? parts.length : start + 1;
    for (var j = start; j < end; j++) {
      parts[j] = transformSegment(parts[j], style);
    }
    return parts.join("/");
  }

  if (isRecursive) {
    for (var k = 0; k < parts.length; k++) {
      parts[k] = transformSegment(parts[k], style);
    }
  } else {
    parts[0] = transformSegment(parts[0], style);
  }
  return parts.join("/");
}

function renameIfChanged(node, nextName) {
  if (!nextName || nextName === node.name) return false;
  node.name = nextName;
  return true;
}

function parseVariantPairs(name) {
  var pairs = [];
  var parts = String(name || "").split(", ");
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf("=");
    if (eq === -1) continue;
    pairs.push({
      key: parts[i].slice(0, eq),
      value: parts[i].slice(eq + 1)
    });
  }
  return pairs;
}

function buildVariantName(pairs) {
  return pairs
    .map(function (pair) {
      return pair.key + "=" + pair.value;
    })
    .join(", ");
}

function isVariantComponent(node) {
  return (
    node.type === "COMPONENT" &&
    node.parent &&
    node.parent.type === "COMPONENT_SET"
  );
}

function variantPropertyLabel(propertyKey) {
  var hash = propertyKey.indexOf("#");
  return hash === -1 ? propertyKey : propertyKey.slice(0, hash);
}

function processComponentPropertyLabels(node, style, stats) {
  if (typeof node.editComponentProperty !== "function") return;
  var defs = node.componentPropertyDefinitions || {};
  for (var propertyKey in defs) {
    if (!Object.prototype.hasOwnProperty.call(defs, propertyKey)) continue;

    var currentLabel = variantPropertyLabel(propertyKey);
    var nextLabel = applyCase(currentLabel, style);
    if (nextLabel === currentLabel) continue;

    try {
      node.editComponentProperty(propertyKey, { name: nextLabel });
      stats.variantLabels++;
    } catch (error) {
      stats.errors++;
      stats.reports.push(
        "Property label " +
          node.name +
          " / " +
          currentLabel +
          ": " +
          (error && error.message ? error.message : error)
      );
    }
  }
}

function processComponentSetVariants(set, style, doLabels, doValues, stats) {
  // Property *names* (the left side of Figma's "Icon: False" / "Type: CTA" panel). Not only
  // VARIANT — BOOLEAN / TEXT / INSTANCE_SWAP names show the same way and used to be skipped.
  if (doLabels) processComponentPropertyLabels(set, style, stats);

  if (!doValues) return;

  // Variant *option* strings live in each variant COMPONENT's name (`Type=CTA, Size=s`).
  // BOOLEAN true/false is not a string option — Figma still draws "False" in the panel; that
  // casing is not renameable.
  var children = set.children;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.type !== "COMPONENT") continue;

    var pairs = parseVariantPairs(child.name);
    if (!pairs.length) continue;

    var changed = false;
    for (var j = 0; j < pairs.length; j++) {
      var nextValue = applyCase(pairs[j].value, style);
      if (nextValue !== pairs[j].value) {
        pairs[j].value = nextValue;
        changed = true;
      }
    }
    if (!changed) continue;

    try {
      child.name = buildVariantName(pairs);
      stats.variantValues++;
    } catch (error) {
      stats.errors++;
      stats.reports.push(
        "Variant value " +
          child.name +
          ": " +
          (error && error.message ? error.message : error)
      );
    }
  }
}

function getScopeValue() {
  var sc = typeof scope !== "undefined" ? scope : "Selection";
  if (sc === "This page" || sc === "All pages") return sc;
  return "Selection";
}

function getSelectionRoots() {
  return figma.currentPage.selection.slice();
}

function getTraversalRoots(sc) {
  if (sc === "All pages") {
    var roots = [];
    for (var p = 0; p < figma.root.children.length; p++) {
      roots.push(figma.root.children[p]);
    }
    return roots;
  }
  if (sc === "This page") {
    return [figma.currentPage];
  }
  return getSelectionRoots();
}

async function ensurePagesLoaded(sc) {
  if (sc === "All pages") {
    if (typeof figma.loadAllPagesAsync === "function") {
      await figma.loadAllPagesAsync();
    } else {
      for (var i = 0; i < figma.root.children.length; i++) {
        var pg = figma.root.children[i];
        if (pg && typeof pg.loadAsync === "function") {
          await pg.loadAsync();
        }
      }
    }
    return;
  }
  if (figma.currentPage && typeof figma.currentPage.loadAsync === "function") {
    await figma.currentPage.loadAsync();
  }
}

function anyTargetEnabled(canvas, stylesVars) {
  return (
    (Array.isArray(canvas) && canvas.length > 0) ||
    (Array.isArray(stylesVars) && stylesVars.length > 0)
  );
}

function plural(n, one, many) {
  return n + " " + (n === 1 ? one : many || one + "s");
}

function buildSummary(stats) {
  var parts = [];
  if (stats.components) parts.push(plural(stats.components, "component"));
  if (stats.layers) parts.push(plural(stats.layers, "layer"));
  if (stats.variantLabels) parts.push(plural(stats.variantLabels, "variant label"));
  if (stats.variantValues) parts.push(plural(stats.variantValues, "variant value"));
  if (stats.styles) parts.push(plural(stats.styles, "style"));
  if (stats.variables) parts.push(plural(stats.variables, "variable"));
  if (!parts.length) {
    if (stats.reports.length) {
      return stats.reports[0];
    }
    return "Nothing to rename";
  }
  var message = "Renamed " + parts.join(", ");
  if (stats.skipped) {
    message +=
      " (" + plural(stats.skipped, "collision", "collisions") + " skipped)";
  }
  if (stats.errors) {
    message +=
      " (" + plural(stats.errors, "error") + ")";
  }
  return message;
}

async function renameStyles(style, doGroups, doNames, stats) {
  if (!doGroups && !doNames) return;
  var styles = await getAllStyles();
  var planned = [];
  var claimed = {};
  var i;

  for (i = 0; i < styles.length; i++) {
    claimed[styles[i].type + "\0" + styles[i].name] = styles[i].id;
  }

  for (i = 0; i < styles.length; i++) {
    var st = styles[i];
    var next = applyCaseToStylePath(st.name, style, doGroups, doNames);
    if (!next || next === st.name) continue;
    var key = st.type + "\0" + next;
    var owner = claimed[key];
    if (owner && owner !== st.id) {
      stats.skipped++;
      stats.reports.push('Style collision: "' + st.name + '" → "' + next + '"');
      continue;
    }
    claimed[key] = st.id;
    planned.push({ style: st, nextName: next });
  }

  for (i = 0; i < planned.length; i++) {
    try {
      planned[i].style.name = planned[i].nextName;
      stats.styles++;
    } catch (error) {
      stats.errors++;
      stats.reports.push(
        'Style "' +
          planned[i].style.name +
          '": ' +
          (error && error.message ? error.message : error)
      );
    }
  }
}

async function renameVariables(style, stats) {
  var collName =
    typeof variableCollection !== "undefined" && variableCollection != null
      ? String(variableCollection).trim()
      : "";
  if (!collName) {
    figma.notify("Pick a collection for Variable names");
    return false;
  }

  var collection = await getCollection(collName);
  if (!collection) {
    figma.notify('Collection not found: "' + collName + '"');
    return false;
  }

  var groupPath = normalizeGroupPath(
    typeof groupName !== "undefined" ? groupName : ""
  );
  var isRecursive = typeof recursive === "undefined" ? true : !!recursive;
  var variables = await getCollectionVariables(collection);
  var planned = [];
  var claimed = {};
  var i;

  for (i = 0; i < variables.length; i++) {
    claimed[variables[i].name] = variables[i].id;
  }

  for (i = 0; i < variables.length; i++) {
    var variable = variables[i];
    var next = applyCaseToVariablePath(
      variable.name,
      groupPath,
      isRecursive,
      style
    );
    if (next == null || next === variable.name) continue;
    if (!String(next).trim()) {
      stats.skipped++;
      stats.reports.push('Variable empty name: "' + variable.name + '"');
      continue;
    }
    var owner = claimed[next];
    if (owner && owner !== variable.id) {
      stats.skipped++;
      stats.reports.push(
        'Variable collision: "' + variable.name + '" → "' + next + '"'
      );
      continue;
    }
    claimed[next] = variable.id;
    planned.push({ variable: variable, nextName: next });
  }

  for (i = 0; i < planned.length; i++) {
    try {
      var existing = await getVariable(collection, planned[i].nextName);
      if (existing && existing.id !== planned[i].variable.id) {
        stats.skipped++;
        stats.reports.push(
          'Variable collision: "' +
            planned[i].variable.name +
            '" → "' +
            planned[i].nextName +
            '"'
        );
        continue;
      }
      planned[i].variable.name = planned[i].nextName;
      stats.variables++;
    } catch (error) {
      stats.errors++;
      stats.reports.push(
        'Variable "' +
          planned[i].variable.name +
          '": ' +
          (error && error.message ? error.message : error)
      );
    }
  }
  return true;
}

async function renameCanvas(style, canvas, stats) {
  var doComponents = hasTarget(canvas, "Component names");
  var doVariantLabels = hasTarget(canvas, "Variant labels");
  var doVariantValues = hasTarget(canvas, "Variant values");
  var doLayers = hasTarget(canvas, "Layer names");
  if (!doComponents && !doVariantLabels && !doVariantValues && !doLayers) {
    return true;
  }

  var sc = getScopeValue();
  if (sc === "Selection" && getSelectionRoots().length === 0) {
    figma.notify("Select layers first");
    return false;
  }

  await ensurePagesLoaded(sc);
  var roots = getTraversalRoots(sc);
  if (!roots.length) {
    figma.notify("Nothing to rename in this scope");
    return false;
  }

  var isRecursive = typeof recursive === "undefined" ? true : !!recursive;
  var wantComponents = doComponents || doVariantLabels || doVariantValues;

  /**
   * Only keep nodes this run can rename. A page full of instances used to fill the default
   * 15 000-node collect budget before any COMPONENT_SET was reached, so Component / Variant
   * targets reported "Nothing to rename" on a page that had dozens of sets.
   */
  function canvasNodeFilter(node) {
    if (!node || node.type === "PAGE" || node.type === "DOCUMENT") return false;
    if (wantComponents && (node.type === "COMPONENT_SET" || node.type === "COMPONENT")) {
      return true;
    }
    if (doLayers) {
      if (node.type === "INSTANCE") return false;
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") return false;
      return true;
    }
    return false;
  }

  var nodes;
  if (isRecursive) {
    nodes = await collectNodesAsync(roots, {
      operation: "Scanning layers",
      maxDepth: 100,
      // High finite cap: Infinity makes the progress bar read oddly; nodeFilter keeps the list small.
      maxNodes: 500000,
      nodeFilter: canvasNodeFilter
    });
  } else {
    nodes = [];
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      if (!root) continue;
      if (root.type === "PAGE" || root.type === "DOCUMENT") {
        var kids = root.children || [];
        for (var k = 0; k < kids.length; k++) {
          if (canvasNodeFilter(kids[k])) nodes.push(kids[k]);
        }
      } else if (canvasNodeFilter(root)) {
        nodes.push(root);
      }
    }
  }

  var processedSets = {};
  var setsSeen = 0;

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (!node || node.type === "PAGE" || node.type === "DOCUMENT") continue;

    if (node.type === "COMPONENT_SET") {
      setsSeen++;
      if (!processedSets[node.id]) {
        processedSets[node.id] = true;
        if (doVariantLabels || doVariantValues) {
          processComponentSetVariants(
            node,
            style,
            doVariantLabels,
            doVariantValues,
            stats
          );
        }
      }
      if (doComponents) {
        if (renameIfChanged(node, applyCase(node.name, style))) {
          stats.components++;
        }
      }
      continue;
    }

    if (isVariantComponent(node)) continue;

    if (node.type === "COMPONENT") {
      if (doComponents) {
        if (renameIfChanged(node, applyCase(node.name, style))) {
          stats.components++;
        }
      }
      // Standalone components can still expose BOOLEAN / TEXT properties.
      if (doVariantLabels) processComponentPropertyLabels(node, style, stats);
      continue;
    }

    if (!doLayers) continue;
    if (node.type === "INSTANCE") continue;
    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") continue;

    if (renameIfChanged(node, applyCase(node.name, style))) {
      stats.layers++;
    }
  }

  if (
    wantComponents &&
    setsSeen === 0 &&
    !stats.components &&
    !stats.variantLabels &&
    !stats.variantValues &&
    !doLayers
  ) {
    stats.reports.push(
      "No local component sets in this scope. Instances are skipped — use All pages if the mains live elsewhere."
    );
  }

  return true;
}

(async function () {
  var canvas =
    typeof canvasTargets !== "undefined" && Array.isArray(canvasTargets)
      ? canvasTargets
      : [];
  var stylesVars =
    typeof stylesAndVariables !== "undefined" &&
    Array.isArray(stylesAndVariables)
      ? stylesAndVariables
      : [];

  if (!anyTargetEnabled(canvas, stylesVars)) {
    figma.notify("Tick at least one rename target");
    return;
  }

  var style = resolveCaseStyle(
    typeof caseStyle !== "undefined" ? caseStyle : "lower case"
  );

  var doVariables = hasTarget(stylesVars, "Variable names");
  if (doVariables) {
    var collCheck =
      typeof variableCollection !== "undefined" && variableCollection != null
        ? String(variableCollection).trim()
        : "";
    if (!collCheck) {
      figma.notify("Pick a collection for Variable names");
      return;
    }
  }

  var stats = {
    components: 0,
    layers: 0,
    variantLabels: 0,
    variantValues: 0,
    styles: 0,
    variables: 0,
    skipped: 0,
    errors: 0,
    reports: []
  };

  var ok = await renameCanvas(style, canvas, stats);
  if (!ok) return;

  var doStyleGroups = hasTarget(stylesVars, "Style groups");
  var doStyleNames = hasTarget(stylesVars, "Style names");
  if (doStyleGroups || doStyleNames) {
    await renameStyles(style, doStyleGroups, doStyleNames, stats);
  }

  if (doVariables) {
    var varsOk = await renameVariables(style, stats);
    if (!varsOk) return;
  }

  for (var r = 0; r < stats.reports.length; r++) {
    console.warn("[Change case] " + stats.reports[r]);
  }

  figma.notify(buildSummary(stats));
})();
