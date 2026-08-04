// Export/import variables
// @DOC_START
// # Export/import variables
// Copy **local** variable collections between files as JSON.
//
// ## Export
// Select one or more local collections. The script serializes them to JSON, copies to the clipboard, and shows the payload in the **Info panel** as a fallback.
//
// ## Import
// Paste JSON from an export into the target file. Collections and variables are matched by name; missing modes are added. Aliases within a collection are restored after all variables exist.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | mode | **Export** or **Import**. |
// | collections | Local collections to export (`@multi`, Export only). |
// | importPayload | JSON payload (Import only). |
// @DOC_END

@import { getOrCreateCollection, getVariable } from "@Variables"
@import { displayResults, createResult } from "@InfoPanel"
@import { finishCodefigRunProgress } from "@Core Library"

// @UI_CONFIG_START
// # Export/import variables
var mode = "Export"; // @options: Export|Import @radio
// ---
// # Export @showWhen: mode=Export
// Choose every local collection to include in the export payload. @showWhen: mode=Export
var collections = []; // @options: localVariableCollections @multi @showWhen: mode=Export
// # Import @showWhen: mode=Import
// Paste JSON copied from Export mode in another file. @showWhen: mode=Import
var importPayload = ""; // @textarea @placeholder="Paste JSON exported from another file" @showWhen: mode=Import
// @UI_CONFIG_END

var EXPORT_VERSION = 1;

function getMode() {
  var m = typeof mode !== "undefined" ? String(mode).trim() : "Export";
  return m === "Import" ? "Import" : "Export";
}

function parseCollectionNames() {
  var names = [];
  if (typeof collections !== "undefined") {
    if (Array.isArray(collections)) {
      for (var i = 0; i < collections.length; i++) {
        var t = collections[i] != null ? String(collections[i]).trim() : "";
        if (t && names.indexOf(t) === -1) names.push(t);
      }
    } else {
      var single = collections != null ? String(collections).trim() : "";
      if (single) names.push(single);
    }
  }
  return names;
}

function normalizeVariableName(name) {
  if (typeof name !== "string") return name;
  var s = name;
  while (s.indexOf("//") !== -1) s = s.split("//").join("/");
  if (s.charAt(0) === "/") s = s.slice(1);
  if (s.length > 0 && s.charAt(s.length - 1) === "/") s = s.slice(0, -1);
  return s;
}

function cloneLiteralValue(value) {
  if (value == null) return value;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object" && typeof value.r === "number") {
    return {
      r: value.r,
      g: value.g,
      b: value.b,
      a: typeof value.a === "number" ? value.a : 1,
    };
  }
  return JSON.parse(JSON.stringify(value));
}

async function resolveExportValue(raw, idToName, visited) {
  if (raw == null) return null;
  if (typeof raw === "object" && raw.type === "VARIABLE_ALIAS") {
    if (raw.id && idToName[raw.id]) {
      return { type: "VARIABLE_ALIAS", name: idToName[raw.id] };
    }
    visited = visited || {};
    if (raw.id && visited[raw.id]) return null;
    if (raw.id) visited[raw.id] = true;
    try {
      var linked = await figma.variables.getVariableByIdAsync(raw.id);
      if (!linked) return null;
      var linkedColl = await figma.variables.getVariableCollectionByIdAsync(linked.variableCollectionId);
      var pickMode = linkedColl.modes[0] ? linkedColl.modes[0].modeId : null;
      if (!pickMode) return null;
      var next = linked.valuesByMode[pickMode];
      if (next === undefined) return null;
      return resolveExportValue(next, idToName, visited);
    } catch (e) {
      return null;
    }
  }
  return cloneLiteralValue(raw);
}

async function exportCollection(collection) {
  var idToName = {};
  var i;
  for (i = 0; i < collection.variableIds.length; i++) {
    var v0 = await figma.variables.getVariableByIdAsync(collection.variableIds[i]);
    if (v0) idToName[v0.id] = v0.name;
  }

  var variables = [];
  for (i = 0; i < collection.variableIds.length; i++) {
    var variable = await figma.variables.getVariableByIdAsync(collection.variableIds[i]);
    if (!variable) continue;

    var valuesByMode = {};
    for (var m = 0; m < collection.modes.length; m++) {
      var modeEntry = collection.modes[m];
      var raw = variable.valuesByMode[modeEntry.modeId];
      if (raw === undefined) continue;
      valuesByMode[modeEntry.name] = await resolveExportValue(raw, idToName, {});
    }

    var entry = {
      name: variable.name,
      type: variable.resolvedType,
      valuesByMode: valuesByMode,
    };
    if (variable.description) entry.description = variable.description;
    if (variable.scopes && variable.scopes.length) entry.scopes = variable.scopes.slice();
    variables.push(entry);
  }

  return {
    name: collection.name,
    modes: collection.modes.map(function (modeEntry) {
      return modeEntry.name;
    }),
    variables: variables,
  };
}

function requestClipboardCopy(text, notifyMessage) {
  try {
    figma.ui.postMessage({
      type: "COPY_TO_CLIPBOARD",
      text: text,
      notifyMessage: notifyMessage || "Variables copied to clipboard",
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function runExport() {
  var collectionNames = parseCollectionNames();
  if (!collectionNames.length) {
    figma.notify("Select at least one local collection.");
    if (typeof displayResults !== "undefined") {
      displayResults({
        title: "Export/import variables",
        results: [createResult("Select at least one collection in the config.", "", "warning")],
        type: "warning",
      });
    }
    finishCodefigRunProgress();
    return;
  }

  var local = await figma.variables.getLocalVariableCollectionsAsync();
  var exported = [];
  var missing = [];

  for (var c = 0; c < collectionNames.length; c++) {
    var name = collectionNames[c];
    var hit = null;
    for (var li = 0; li < local.length; li++) {
      if (local[li].name === name) {
        hit = local[li];
        break;
      }
    }
    if (!hit) {
      missing.push(name);
      continue;
    }
    exported.push(await exportCollection(hit));
  }

  if (!exported.length) {
    figma.notify("No matching local collections found.");
    if (typeof displayResults !== "undefined") {
      displayResults({
        title: "Export/import variables",
        results: [
          createResult(
            "No collections exported.",
            missing.length ? "Not found: " + missing.join(", ") : "",
            "warning"
          ),
        ],
        type: "warning",
      });
    }
    finishCodefigRunProgress();
    return;
  }

  var payload = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    collections: exported,
  };
  var json = JSON.stringify(payload, null, 2);
  var varCount = 0;
  for (var ei = 0; ei < exported.length; ei++) {
    varCount += exported[ei].variables.length;
  }

  var summary =
    exported.length +
    " collection(s), " +
    varCount +
    " variable(s)" +
    (missing.length ? " · skipped missing: " + missing.join(", ") : "");

  requestClipboardCopy(json, "Variables copied to clipboard");
  figma.notify("Variables copied to clipboard — " + summary);

  if (typeof displayResults !== "undefined") {
    displayResults({
      title: "Export/import variables",
      results: [
        createResult("Copied to clipboard", summary, "success"),
        {
          message: "Variable export JSON",
          details: "Paste into Import mode in the target file if needed.",
          severity: "info",
          copyText: json,
        },
      ],
      type: "success",
      showFilters: false,
    });
  }

  console.log("[export-import-variables] export " + summary);
  finishCodefigRunProgress();
}

function parsePayload(raw) {
  if (!raw || !String(raw).trim()) {
    throw new Error("Paste export JSON into Import payload.");
  }
  var data = JSON.parse(String(raw));
  if (!data || !Array.isArray(data.collections)) {
    throw new Error("Invalid payload: expected { collections: [...] }.");
  }
  return data;
}

function ensureModes(collection, modeNames) {
  if (!modeNames || !modeNames.length) return;
  var empty = !collection.variableIds || !collection.variableIds.length;
  if (
    empty &&
    collection.modes.length === 1 &&
    collection.modes[0].name !== modeNames[0] &&
    typeof collection.renameMode === "function"
  ) {
    collection.renameMode(collection.modes[0].modeId, modeNames[0]);
  }
  for (var i = 0; i < modeNames.length; i++) {
    var modeName = modeNames[i];
    if (!collection.modes.find(function (m) {
      return m.name === modeName;
    })) {
      collection.addMode(modeName);
    }
  }
}

function isAliasValue(value) {
  return value && typeof value === "object" && value.type === "VARIABLE_ALIAS" && value.name;
}

async function findVariableByName(collection, variableName) {
  return getVariable(collection, normalizeVariableName(variableName));
}

async function applyLiteralValues(collection, variableDef, modeNames) {
  var name = normalizeVariableName(variableDef.name);
  var existing = await findVariableByName(collection, name);
  var variable = existing;

  if (existing && existing.remote) {
    return { status: "skipped", name: name, reason: "remote" };
  }
  if (existing && existing.resolvedType !== variableDef.type) {
    return { status: "skipped", name: name, reason: "type mismatch" };
  }

  if (!existing) {
    variable = figma.variables.createVariable(name, collection, variableDef.type);
  }

  if (variableDef.description) variable.description = variableDef.description;
  if (variableDef.scopes && variableDef.scopes.length) {
    variable.scopes = variableDef.scopes.slice();
  }

  var valuesByMode = variableDef.valuesByMode || {};
  for (var i = 0; i < modeNames.length; i++) {
    var modeName = modeNames[i];
    var raw = valuesByMode[modeName];
    if (raw === undefined || isAliasValue(raw)) continue;
    var modeEntry = collection.modes.find(function (m) {
      return m.name === modeName;
    });
    if (!modeEntry) continue;
    try {
      variable.setValueForMode(modeEntry.modeId, raw);
    } catch (e) {
      console.warn("[export-import-variables] setValueForMode", name, modeName, e && e.message);
    }
  }

  return { status: existing ? "updated" : "created", name: name, variable: variable };
}

async function applyAliasValues(collection, variableDef, modeNames) {
  var name = normalizeVariableName(variableDef.name);
  var variable = await findVariableByName(collection, name);
  if (!variable || variable.remote) return { aliases: 0, missing: 0 };

  var valuesByMode = variableDef.valuesByMode || {};
  var aliases = 0;
  var missing = 0;

  for (var i = 0; i < modeNames.length; i++) {
    var modeName = modeNames[i];
    var raw = valuesByMode[modeName];
    if (!isAliasValue(raw)) continue;
    var target = await findVariableByName(collection, raw.name);
    var modeEntry = collection.modes.find(function (m) {
      return m.name === modeName;
    });
    if (!target || !modeEntry) {
      missing++;
      continue;
    }
    if (target.resolvedType !== variable.resolvedType) {
      missing++;
      continue;
    }
    try {
      variable.setValueForMode(modeEntry.modeId, { type: "VARIABLE_ALIAS", id: target.id });
      aliases++;
    } catch (e) {
      console.warn("[export-import-variables] alias", name, modeName, "→", raw.name, e && e.message);
      missing++;
    }
  }

  return { aliases: aliases, missing: missing };
}

async function importCollection(collectionDef) {
  var collectionName = String(collectionDef.name || "").trim();
  if (!collectionName) throw new Error("Collection entry is missing a name.");

  var modeNames = Array.isArray(collectionDef.modes) ? collectionDef.modes.slice() : [];
  if (!modeNames.length) modeNames = ["Value"];

  var collection = await getOrCreateCollection(collectionName);
  ensureModes(collection, modeNames);

  var variables = Array.isArray(collectionDef.variables) ? collectionDef.variables : [];
  var stats = { created: 0, updated: 0, skipped: 0, aliases: 0, aliasMissing: 0 };

  for (var i = 0; i < variables.length; i++) {
    var result = await applyLiteralValues(collection, variables[i], modeNames);
    if (result.status === "created") stats.created++;
    else if (result.status === "updated") stats.updated++;
    else stats.skipped++;
  }

  for (var j = 0; j < variables.length; j++) {
    var aliasResult = await applyAliasValues(collection, variables[j], modeNames);
    stats.aliases += aliasResult.aliases;
    stats.aliasMissing += aliasResult.missing;
  }

  return stats;
}

async function runImport() {
  var raw = typeof importPayload !== "undefined" ? importPayload : "";
  var data;
  try {
    data = parsePayload(raw);
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    figma.notify(msg);
    if (typeof displayResults !== "undefined") {
      displayResults({
        title: "Export/import variables",
        results: [createResult(msg, "", "error")],
        type: "error",
      });
    }
    finishCodefigRunProgress();
    return;
  }

  var totals = { created: 0, updated: 0, skipped: 0, aliases: 0, aliasMissing: 0 };
  var results = [];

  for (var i = 0; i < data.collections.length; i++) {
    var def = data.collections[i];
    try {
      var stats = await importCollection(def);
      totals.created += stats.created;
      totals.updated += stats.updated;
      totals.skipped += stats.skipped;
      totals.aliases += stats.aliases;
      totals.aliasMissing += stats.aliasMissing;
      results.push(
        createResult(
          def.name,
          "+" +
            stats.created +
            " created · " +
            stats.updated +
            " updated · " +
            stats.aliases +
            " aliases" +
            (stats.skipped ? " · " + stats.skipped + " skipped" : "") +
            (stats.aliasMissing ? " · " + stats.aliasMissing + " unresolved aliases" : ""),
          "success"
        )
      );
    } catch (collErr) {
      var collMsg = collErr instanceof Error ? collErr.message : String(collErr);
      results.push(createResult(def && def.name ? def.name : "Collection " + (i + 1), collMsg, "error"));
    }
  }

  var summary =
    totals.created +
    " created, " +
    totals.updated +
    " updated" +
    (totals.skipped ? ", " + totals.skipped + " skipped" : "") +
    (totals.aliasMissing ? ", " + totals.aliasMissing + " unresolved aliases" : "");

  figma.notify("Variables imported — " + summary);

  if (typeof displayResults !== "undefined") {
    displayResults({
      title: "Export/import variables",
      results: [createResult("Variables imported", summary, "success")].concat(results),
      type: "success",
      showFilters: false,
    });
  }

  console.log("[export-import-variables] import " + summary);
  finishCodefigRunProgress();
}

async function run() {
  if (getMode() === "Import") {
    await runImport();
  } else {
    await runExport();
  }
}

run().catch(function (err) {
  figma.notify((getMode() === "Import" ? "Import" : "Export") + " failed: " + (err && err.message ? err.message : err));
  try {
    finishCodefigRunProgress();
  } catch (e) {}
});
