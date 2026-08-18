// Copy simple variables JSON
// @DOC_START
// Export selected local variable collections as compact JSON.
//
// ## Overview
// Choose one or more local variable collections, optionally enter mode names to include, then run the script. The JSON is copied to the clipboard and also shown in the Info panel as a fallback.
//
// ## Output shape
// When only one mode is exported for a collection, variables are flattened:
//
// ```json
// {
//   "Colors/Grey": {
//     "grey-900": "#ffff00"
//   }
// }
// ```
//
// When multiple modes are exported, each collection is grouped by mode name.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | collections | Local collections to export (`@multi`). |
// | modeNames | Optional comma- or line-separated mode names. Empty exports all modes. |
// @DOC_END

@import { displayResults, createResult, createCopyResult, requestClipboardCopy } from "@InfoPanel"
@import { finishCodefigRunProgress } from "@Core Library"

// @UI_CONFIG_START
// Choose local collections, then optionally limit export to one or more mode names.
var collections = []; // @options: localVariableCollections @multi
var modeNames = ""; // @placeholder="Light, Dark"
// @UI_CONFIG_END

function parseCollectionNames() {
  var names = [];
  if (typeof collections === "undefined") return names;

  if (Array.isArray(collections)) {
    for (var i = 0; i < collections.length; i++) {
      var item = collections[i] != null ? String(collections[i]).trim() : "";
      if (item && names.indexOf(item) === -1) names.push(item);
    }
  } else {
    var single = collections != null ? String(collections).trim() : "";
    if (single) names.push(single);
  }

  return names;
}

function parseModeNames() {
  var raw = typeof modeNames !== "undefined" ? String(modeNames) : "";
  if (!raw.trim()) return [];

  var parts = raw.split(/[\n,]+/);
  var names = [];
  for (var i = 0; i < parts.length; i++) {
    var name = parts[i].trim();
    if (name && names.indexOf(name) === -1) names.push(name);
  }
  return names;
}

function modeNameMatches(modeName, filters) {
  if (!filters.length) return true;
  var normalized = String(modeName).toLowerCase();
  for (var i = 0; i < filters.length; i++) {
    if (normalized === String(filters[i]).toLowerCase()) return true;
  }
  return false;
}

function byteToHex(value) {
  var hex = Math.max(0, Math.min(255, Math.round(value))).toString(16);
  return hex.length === 1 ? "0" + hex : hex;
}

function formatColor(value) {
  var r = Math.round(value.r * 255);
  var g = Math.round(value.g * 255);
  var b = Math.round(value.b * 255);
  var a = typeof value.a === "number" ? value.a : 1;

  if (a >= 1) {
    return "#" + byteToHex(r) + byteToHex(g) + byteToHex(b);
  }

  return "rgba(" + r + ", " + g + ", " + b + ", " + Math.round(a * 1000) / 1000 + ")";
}

async function formatValue(value, modeName, visited) {
  if (value == null) return value;

  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "object" && value.type === "VARIABLE_ALIAS") {
    var aliasId = value.id || value.key || "";
    if (!aliasId) return { alias: "unknown" };
    if (aliasId && visited[aliasId]) {
      return { alias: aliasId };
    }
    if (aliasId) visited[aliasId] = true;

    try {
      var linked = value.id
        ? await figma.variables.getVariableByIdAsync(value.id)
        : await figma.variables.importVariableByKeyAsync(value.key);
      if (!linked) return { alias: aliasId };

      var linkedCollection = await figma.variables.getVariableCollectionByIdAsync(linked.variableCollectionId);
      var linkedMode = null;
      if (linkedCollection && linkedCollection.modes) {
        for (var m = 0; m < linkedCollection.modes.length; m++) {
          if (String(linkedCollection.modes[m].name).toLowerCase() === String(modeName).toLowerCase()) {
            linkedMode = linkedCollection.modes[m];
            break;
          }
        }
        if (!linkedMode) linkedMode = linkedCollection.modes[0];
      }

      var linkedValue = linkedMode ? linked.valuesByMode[linkedMode.modeId] : undefined;
      if (linkedValue === undefined) return { alias: linked.name || aliasId };
      return await formatValue(linkedValue, linkedMode.name, visited);
    } catch (e) {
      return { alias: aliasId };
    }
  }

  if (typeof value.r === "number" && typeof value.g === "number" && typeof value.b === "number") {
    return formatColor(value);
  }

  return JSON.parse(JSON.stringify(value));
}

async function exportVariablesForMode(collection, mode) {
  var out = {};
  var count = 0;
  var variables = [];

  for (var i = 0; i < collection.variableIds.length; i++) {
    var variable = await figma.variables.getVariableByIdAsync(collection.variableIds[i]);
    if (variable) variables.push(variable);
  }

  variables.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });

  for (var v = 0; v < variables.length; v++) {
    var raw = variables[v].valuesByMode[mode.modeId];
    if (raw === undefined) continue;
    out[variables[v].name] = await formatValue(raw, mode.name, {});
    count++;
  }

  return { data: out, count: count };
}

async function exportCollection(collection, modeFilters, missingModes) {
  var selectedModes = [];
  for (var i = 0; i < collection.modes.length; i++) {
    if (modeNameMatches(collection.modes[i].name, modeFilters)) {
      selectedModes.push(collection.modes[i]);
    }
  }

  if (modeFilters.length) {
    for (var f = 0; f < modeFilters.length; f++) {
      var found = false;
      for (var m = 0; m < collection.modes.length; m++) {
        if (String(collection.modes[m].name).toLowerCase() === String(modeFilters[f]).toLowerCase()) {
          found = true;
          break;
        }
      }
      if (!found) missingModes.push(collection.name + ": " + modeFilters[f]);
    }
  }

  if (!selectedModes.length) return null;

  if (selectedModes.length === 1) {
    return await exportVariablesForMode(collection, selectedModes[0]);
  }

  var byMode = {};
  var total = 0;
  for (var s = 0; s < selectedModes.length; s++) {
    var modeExport = await exportVariablesForMode(collection, selectedModes[s]);
    byMode[selectedModes[s].name] = modeExport.data;
    total += modeExport.count;
  }
  return { data: byMode, count: total };
}

async function run() {
  var selectedCollections = parseCollectionNames();
  if (!selectedCollections.length) {
    figma.notify("Select at least one local collection.");
    displayResults({
      title: "Copy simple variables JSON",
      results: [createResult("Select at least one collection in the config.", "", "warning")],
      type: "warning",
      showFilters: false,
    });
    finishCodefigRunProgress();
    return;
  }

  var modeFilters = parseModeNames();
  var localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  var payload = {};
  var missingCollections = [];
  var missingModes = [];
  var collectionCount = 0;
  var valueCount = 0;

  for (var i = 0; i < selectedCollections.length; i++) {
    var collectionName = selectedCollections[i];
    var collection = null;
    for (var c = 0; c < localCollections.length; c++) {
      if (localCollections[c].name === collectionName) {
        collection = localCollections[c];
        break;
      }
    }

    if (!collection) {
      missingCollections.push(collectionName);
      continue;
    }

    var exported = await exportCollection(collection, modeFilters, missingModes);
    if (!exported) continue;

    payload[collection.name] = exported.data;
    collectionCount++;
    valueCount += exported.count;
  }

  if (!Object.keys(payload).length) {
    figma.notify("No variables exported.");
    displayResults({
      title: "Copy simple variables JSON",
      results: [createResult("No variables exported.", "Check collection and mode filters.", "warning")],
      type: "warning",
      showFilters: false,
    });
    finishCodefigRunProgress();
    return;
  }

  var json = JSON.stringify(payload, null, 2);
  var summary = collectionCount + " collection(s), " + valueCount + " value(s)";
  if (modeFilters.length) summary += ", modes: " + modeFilters.join(", ");
  if (missingCollections.length) summary += ", missing collections: " + missingCollections.join(", ");
  if (missingModes.length) summary += ", missing modes: " + missingModes.join(", ");

  requestClipboardCopy(json);
  figma.notify("Variables JSON copied to clipboard - " + collectionCount + " collection(s)");

  displayResults({
    title: "Copy simple variables JSON",
    results: [
      createResult("Copied to clipboard", summary, "success"),
      createCopyResult("Variables JSON", json, "Use the copy button if clipboard access was blocked."),
    ],
    type: "success",
    showFilters: false,
  });

  console.log("[copy-simple-variables-json] " + summary);
  finishCodefigRunProgress();
}

run().catch(function (err) {
  figma.notify("Export failed: " + (err && err.message ? err.message : err));
  try {
    displayResults({
      title: "Copy simple variables JSON",
      results: [createResult("Export failed", err && err.message ? err.message : String(err), "error")],
      type: "error",
      showFilters: false,
    });
    finishCodefigRunProgress();
  } catch (e) {}
});
