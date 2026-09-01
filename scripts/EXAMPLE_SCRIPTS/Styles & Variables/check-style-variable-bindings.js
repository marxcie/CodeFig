// Check style and variable bindings
// @DOC_START
// # Audits the selection for style and variable bindings that are not available in this file
//
// ## Overview
//
// No configuration. Traverses all nodes under the selection and flags bindings that are neither
// **local to this file** nor from a **linked team library**. Typical after paste from another file:
// layers still point at the source file's style or variable ids even though this file has its own
// definitions.
//
// ### What is checked
//
// - Applied styles: text, fill, stroke, effect, grid (including mixed text segments)
// - Variable bindings on layers (`boundVariables`, including fills, strokes, and effects slots)
// - Variable bindings on resolved styles that drive the layer
//
// ### Report
//
// Style issues are listed first (grouped by style name), then variable issues (grouped by variable
// name). Click a row to select all elements using that binding. When everything is local or from a
// linked library, only a success notification is shown.
// @DOC_END

@import { displayResults, getPropertyDisplay } from "@InfoPanel"
@import { traverseNodes } from "@Core Library"

var STYLE_PROPS = [
  { prop: "textStyleId", label: "Text style" },
  { prop: "fillStyleId", label: "Fill style" },
  { prop: "strokeStyleId", label: "Stroke style" },
  { prop: "effectStyleId", label: "Effect style" },
  { prop: "gridStyleId", label: "Grid style" }
];

var styleResolveCache = {};
var variableResolveCache = {};
var bindingIssues = {};

function collectAllNodes(roots) {
  var allNodes = [];
  traverseNodes(roots, function(node) {
    allNodes.push(node);
    return 0;
  });
  return allNodes;
}

function reasonSuffix(reason) {
  if (reason === "missing") return "missing";
  if (reason === "library") return "library not linked";
  return "not in this file";
}

function recordStyleIssue(styleId, styleTypeLabel, style, reason, nodeId) {
  if (!styleId || !nodeId) return;
  var key = "style:" + styleId;
  if (!bindingIssues[key]) {
    var styleName = style && style.name ? style.name : "Unknown style";
    bindingIssues[key] = {
      kind: "style",
      sortKey: styleName.toLowerCase(),
      message: styleName + " (" + reasonSuffix(reason) + ")",
      styleTypeLabel: styleTypeLabel || "Style",
      nodeIdMap: {}
    };
  }
  bindingIssues[key].nodeIdMap[nodeId] = true;
}

function recordVariableIssue(issueKey, propertyLabel, variable, reason, nodeId) {
  if (!issueKey || !nodeId) return;
  if (!bindingIssues[issueKey]) {
    var varName = variable && variable.name ? variable.name : "Unknown variable";
    bindingIssues[issueKey] = {
      kind: "variable",
      sortKey: varName.toLowerCase(),
      message: varName + " (" + reasonSuffix(reason) + ")",
      propertyLabels: {},
      nodeIdMap: {}
    };
  }
  if (propertyLabel) {
    bindingIssues[issueKey].propertyLabels[propertyLabel] = true;
  }
  bindingIssues[issueKey].nodeIdMap[nodeId] = true;
}

function getBindingAliases(binding) {
  if (!binding) return [];
  if (Array.isArray(binding)) {
    var out = [];
    for (var i = 0; i < binding.length; i++) {
      if (binding[i] && (binding[i].id || binding[i].key)) {
        out.push({ alias: binding[i], suffix: binding.length > 1 ? " #" + (i + 1) : "" });
      }
    }
    return out;
  }
  if (binding.id || binding.key) {
    return [{ alias: binding, suffix: "" }];
  }
  return [];
}

function idSetFromList(items) {
  var set = {};
  for (var i = 0; i < items.length; i++) {
    if (items[i] && items[i].id) set[items[i].id] = true;
  }
  return set;
}

async function buildAuditContext() {
  var styleLists = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync()
  ]);

  var localStyleIds = {};
  for (var s = 0; s < styleLists.length; s++) {
    var ids = idSetFromList(styleLists[s]);
    var keys = Object.keys(ids);
    for (var k = 0; k < keys.length; k++) {
      localStyleIds[keys[k]] = true;
    }
  }

  var localVariables = await figma.variables.getLocalVariablesAsync();
  var localVariableIds = idSetFromList(localVariables);

  var linkedStyleKeys = {};
  var linkedVariableKeys = {};

  if (figma.teamLibrary) {
    try {
      if (typeof figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync === "function") {
        var styleCollections = await figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync();
        for (var sc = 0; sc < styleCollections.length; sc++) {
          var libStyles = await figma.teamLibrary.getStylesInLibraryCollectionAsync(styleCollections[sc].key);
          for (var ls = 0; ls < libStyles.length; ls++) {
            if (libStyles[ls].key) linkedStyleKeys[libStyles[ls].key] = true;
          }
        }
      }
    } catch (e) {
      console.log("Could not load linked style libraries:", e && e.message);
    }

    try {
      if (typeof figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync === "function") {
        var varCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
        for (var vc = 0; vc < varCollections.length; vc++) {
          var libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(varCollections[vc].key);
          for (var lv = 0; lv < libVars.length; lv++) {
            if (libVars[lv].key) linkedVariableKeys[libVars[lv].key] = true;
          }
        }
      }
    } catch (e) {
      console.log("Could not load linked variable libraries:", e && e.message);
    }
  }

  console.log(
    "Catalog: " + Object.keys(localStyleIds).length + " local styles, " +
    Object.keys(localVariableIds).length + " local variables, " +
    Object.keys(linkedStyleKeys).length + " linked style keys, " +
    Object.keys(linkedVariableKeys).length + " linked variable keys"
  );

  return {
    localStyleIds: localStyleIds,
    localVariableIds: localVariableIds,
    linkedStyleKeys: linkedStyleKeys,
    linkedVariableKeys: linkedVariableKeys
  };
}

async function resolveVariableFromAlias(alias) {
  if (!alias) return null;
  if (typeof alias.id === "string") {
    try {
      return await figma.variables.getVariableByIdAsync(alias.id);
    } catch (e) {
      return null;
    }
  }
  if (typeof alias.key === "string") {
    try {
      return await figma.variables.importVariableByKeyAsync(alias.key);
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function resolveStyle(styleId) {
  if (!styleId || styleId === figma.mixed || styleId === "") return null;
  if (styleResolveCache[styleId] !== undefined) {
    return styleResolveCache[styleId];
  }
  var style = null;
  try {
    style = await figma.getStyleByIdAsync(styleId);
  } catch (e) {
    style = null;
  }
  styleResolveCache[styleId] = style;
  return style;
}

async function checkStylePresence(styleId, baseLabel, ctx) {
  if (!styleId || styleId === figma.mixed || styleId === "") {
    return { ok: true };
  }

  if (ctx.localStyleIds[styleId]) {
    return { ok: true, style: await resolveStyle(styleId) };
  }

  var style = await resolveStyle(styleId);
  if (!style) {
    return { ok: false, styleId: styleId, styleTypeLabel: baseLabel, style: null, reason: "missing" };
  }

  if (style.remote) {
    if (style.key && ctx.linkedStyleKeys[style.key]) {
      return { ok: true, style: style };
    }
    return { ok: false, styleId: styleId, styleTypeLabel: baseLabel, style: style, reason: "library" };
  }

  return { ok: false, styleId: styleId, styleTypeLabel: baseLabel, style: style, reason: "foreign" };
}

async function checkVariablePresence(alias, baseLabel, ctx) {
  if (!alias || (!alias.id && !alias.key)) {
    return { ok: true };
  }

  if (alias.id && ctx.localVariableIds[alias.id]) {
    return { ok: true };
  }

  var cacheKey = alias.id || ("key:" + alias.key);
  var variable = null;
  if (variableResolveCache[cacheKey] !== undefined) {
    variable = variableResolveCache[cacheKey];
  } else {
    variable = await resolveVariableFromAlias(alias);
    variableResolveCache[cacheKey] = variable;
  }

  if (!variable) {
    return {
      ok: false,
      issueKey: "var:" + (alias.id || ("key:" + alias.key)),
      propertyLabel: baseLabel,
      variable: null,
      reason: "missing"
    };
  }

  if (ctx.localVariableIds[variable.id]) {
    return { ok: true, variable: variable };
  }

  var issueKey = "var:" + (variable.id || alias.id || ("key:" + (variable.key || alias.key)));
  var libKey = variable.key || alias.key;
  if (variable.remote || alias.key) {
    if (libKey && ctx.linkedVariableKeys[libKey]) {
      return { ok: true, variable: variable };
    }
    return { ok: false, issueKey: issueKey, propertyLabel: baseLabel, variable: variable, reason: "library" };
  }

  return { ok: false, issueKey: issueKey, propertyLabel: baseLabel, variable: variable, reason: "foreign" };
}

async function checkStyleId(styleId, label, nodeId, checkedStyleIds, ctx) {
  if (!styleId || styleId === figma.mixed || styleId === "") return;
  if (checkedStyleIds[styleId]) return;
  checkedStyleIds[styleId] = true;

  var result = await checkStylePresence(styleId, label, ctx);
  if (!result.ok) {
    recordStyleIssue(result.styleId, result.styleTypeLabel, result.style, result.reason, nodeId);
    return;
  }

  if (result.style) {
    await checkStyleVariableBindings(result.style, label, nodeId, ctx);
  }
}

async function checkStyleVariableBindings(style, styleLabel, nodeId, ctx) {
  if (!style || !style.boundVariables) return;
  var properties = Object.keys(style.boundVariables);
  for (var i = 0; i < properties.length; i++) {
    var property = properties[i];
    var aliases = getBindingAliases(style.boundVariables[property]);
    for (var j = 0; j < aliases.length; j++) {
      var baseLabel = getPropertyDisplay(property) + " (" + styleLabel + ")" + aliases[j].suffix;
      var varResult = await checkVariablePresence(aliases[j].alias, baseLabel, ctx);
      if (!varResult.ok) {
        recordVariableIssue(varResult.issueKey, baseLabel, varResult.variable, varResult.reason, nodeId);
      }
    }
  }
}

async function checkNodeStyleIds(node, ctx) {
  var checkedStyleIds = {};
  var nodeId = node.id;

  for (var i = 0; i < STYLE_PROPS.length; i++) {
    var entry = STYLE_PROPS[i];
    if (!(entry.prop in node)) continue;

    var styleId = node[entry.prop];
    if (styleId === figma.mixed) {
      if (node.type === "TEXT" && entry.prop === "textStyleId" && typeof node.getStyledTextSegments === "function") {
        try {
          var textSegments = node.getStyledTextSegments(["textStyleId"]);
          for (var t = 0; t < textSegments.length; t++) {
            await checkStyleId(textSegments[t].textStyleId, entry.label, nodeId, checkedStyleIds, ctx);
          }
        } catch (e) {}
      }
      if (node.type === "TEXT" && entry.prop === "fillStyleId" && typeof node.getStyledTextSegments === "function") {
        try {
          var fillSegments = node.getStyledTextSegments(["fillStyleId"]);
          for (var f = 0; f < fillSegments.length; f++) {
            await checkStyleId(fillSegments[f].fillStyleId, entry.label, nodeId, checkedStyleIds, ctx);
          }
        } catch (e) {}
      }
      continue;
    }

    await checkStyleId(styleId, entry.label, nodeId, checkedStyleIds, ctx);
  }
}

async function checkNodeVariableBindings(node, ctx) {
  if (!node.boundVariables || typeof node.boundVariables !== "object") return;
  var nodeId = node.id;

  var properties = Object.keys(node.boundVariables);
  for (var i = 0; i < properties.length; i++) {
    var property = properties[i];
    var aliases = getBindingAliases(node.boundVariables[property]);
    for (var j = 0; j < aliases.length; j++) {
      var baseLabel = getPropertyDisplay(property) + aliases[j].suffix;
      var varResult = await checkVariablePresence(aliases[j].alias, baseLabel, ctx);
      if (!varResult.ok) {
        recordVariableIssue(varResult.issueKey, baseLabel, varResult.variable, varResult.reason, nodeId);
      }
    }
  }
}

async function auditNode(node, ctx) {
  await checkNodeStyleIds(node, ctx);
  await checkNodeVariableBindings(node, ctx);
}

function buildIssueResult(issue) {
  var nodeIds = Object.keys(issue.nodeIdMap);
  var countStr = nodeIds.length + " element" + (nodeIds.length === 1 ? "" : "s");
  var details = countStr;

  if (issue.kind === "style" && issue.styleTypeLabel) {
    details = issue.styleTypeLabel + " · " + countStr;
  } else if (issue.kind === "variable") {
    var props = Object.keys(issue.propertyLabels || {});
    if (props.length > 0) {
      details = props.join(", ") + " · " + countStr;
    }
  }

  return {
    message: issue.message,
    details: details,
    severity: "error",
    nodeIds: nodeIds,
    kind: issue.kind,
    sortKey: issue.sortKey || issue.message.toLowerCase()
  };
}

function buildResultsFromBindingIssues() {
  var keys = Object.keys(bindingIssues);
  var styleResults = [];
  var variableResults = [];

  for (var i = 0; i < keys.length; i++) {
    var built = buildIssueResult(bindingIssues[keys[i]]);
    if (built.kind === "style") {
      styleResults.push(built);
    } else {
      variableResults.push(built);
    }
  }

  styleResults.sort(function(a, b) {
    return a.sortKey.localeCompare(b.sortKey);
  });
  variableResults.sort(function(a, b) {
    return a.sortKey.localeCompare(b.sortKey);
  });

  var results = [];
  if (styleResults.length > 0) {
    results.push({
      message: "Styles",
      details: styleResults.length + " issue" + (styleResults.length === 1 ? "" : "s"),
      severity: "info"
    });
    for (var s = 0; s < styleResults.length; s++) {
      results.push(styleResults[s]);
    }
  }
  if (variableResults.length > 0) {
    results.push({
      message: "Variables",
      details: variableResults.length + " issue" + (variableResults.length === 1 ? "" : "s"),
      severity: "info"
    });
    for (var v = 0; v < variableResults.length; v++) {
      results.push(variableResults[v]);
    }
  }
  return results;
}

function countAffectedElements() {
  var seen = {};
  var keys = Object.keys(bindingIssues);
  for (var i = 0; i < keys.length; i++) {
    var nodeIds = Object.keys(bindingIssues[keys[i]].nodeIdMap);
    for (var j = 0; j < nodeIds.length; j++) {
      seen[nodeIds[j]] = true;
    }
  }
  return Object.keys(seen).length;
}

async function main() {
  var selection = figma.currentPage.selection;
  if (!selection || selection.length === 0) {
    figma.notify("Select elements to check bindings");
    return;
  }

  console.log("=== Check style and variable bindings ===");
  bindingIssues = {};
  var ctx = await buildAuditContext();
  var allNodes = collectAllNodes(selection);
  console.log("Checking " + allNodes.length + " node(s)...");

  for (var i = 0; i < allNodes.length; i++) {
    await auditNode(allNodes[i], ctx);
  }

  var results = buildResultsFromBindingIssues();
  var issueRows = results.filter(function(r) { return r.nodeIds && r.nodeIds.length > 0; });

  if (issueRows.length === 0) {
    figma.notify("✅ All bindings OK (" + allNodes.length + " node" + (allNodes.length === 1 ? "" : "s") + ")");
    return;
  }

  var affectedCount = countAffectedElements();
  displayResults({
    title: "Bindings not in file (" + issueRows.length + " issue" + (issueRows.length === 1 ? "" : "s") + ")",
    results: results,
    type: "error",
    showFilters: false
  });

  figma.notify(
    "⚠️ " + issueRows.length + " binding issue(s) across " +
    affectedCount + " element" + (affectedCount === 1 ? "" : "s")
  );
}

main().catch(function(err) {
  console.error("Check bindings failed:", err && err.message ? err.message : err);
  figma.notify("❌ Check failed: " + (err && err.message ? err.message : String(err)));
});
