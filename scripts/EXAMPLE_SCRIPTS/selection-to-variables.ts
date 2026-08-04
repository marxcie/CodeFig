// Selection to variables
// @DOC_START
// # Selection to variables
// Recursively walks the selection and creates or updates variables from layer names and values.
//
// ## Layer naming
// When **Target collection** is **New collection** (default), the first `/` segment is the collection name and the rest is the variable path.
// - `bark/900` → collection `bark`, variable `900`
// - `colors/primitives/bark/900` → collection `colors`, variable `primitives/bark/900`
//
// When an existing collection is chosen, the full layer name is the variable path (slashes included).
//
// ## Variable type
// | Type | Layer | Value |
// |------|-------|-------|
// | Color | Shape with solid fill | Fill color |
// | Number | Text | Parsed number from text content |
// | String | Text | Text content |
//
// Results are listed in the **Info panel**. Click a row to select the layer.
// @DOC_END

@import { collectNodesAsync, showProgress, finishCodefigRunProgress } from "@Core Library"
@import { getOrCreateCollection, getCollection, createOrUpdateVariable } from "@Variables"
@import { displayResults, createSelectableResult } from "@InfoPanel"

// @UI_CONFIG_START
// # Selection to variables
var targetCollection = "__NEW__"; // @options: localVariableCollectionsTarget
// **New collection** derives the collection from the first path segment. Pick an existing collection to send all variables there.
//
var variableType = "Color"; // @options: Color|Number|String
// Color: solid fill on shapes. Number / String: text layers.
// @UI_CONFIG_END

var TARGET_NEW = "__NEW__";

function trimTarget(v) {
  return v != null ? String(v).trim() : "";
}

function isNewCollectionTarget(target) {
  var t = trimTarget(target);
  return !t || t === TARGET_NEW;
}

function figmaVariableType(uiType) {
  var t = uiType != null ? String(uiType).trim() : "Color";
  if (t === "Number") return "FLOAT";
  if (t === "String") return "STRING";
  return "COLOR";
}

function normalizeLayerPath(name) {
  var s = name != null ? String(name).trim() : "";
  while (s.indexOf("//") !== -1) s = s.split("//").join("/");
  if (s.charAt(0) === "/") s = s.slice(1);
  if (s.length > 0 && s.charAt(s.length - 1) === "/") s = s.slice(0, -1);
  return s;
}

function resolveCollectionAndVariable(layerPath, target) {
  var path = normalizeLayerPath(layerPath);
  if (!path) return { error: "Empty layer name" };

  if (isNewCollectionTarget(target)) {
    var slash = path.indexOf("/");
    if (slash === -1) {
      return {
        error: 'Layer "' + path + '" needs collection/variable (e.g. bark/900) when New collection is selected',
      };
    }
    var collectionName = path.slice(0, slash);
    var variableName = path.slice(slash + 1);
    if (!collectionName || !variableName) {
      return { error: 'Invalid path in layer "' + path + '"' };
    }
    return { collectionName: collectionName, variableName: variableName, fromLayer: true };
  }

  return { collectionName: trimTarget(target), variableName: path, fromLayer: false };
}

function hasSolidFill(node) {
  if (!("fills" in node) || node.fills === figma.mixed || !node.fills || !node.fills.length) return false;
  for (var i = 0; i < node.fills.length; i++) {
    var fill = node.fills[i];
    if (fill && fill.type === "SOLID" && fill.visible !== false) return true;
  }
  return false;
}

function getSolidFillColor(node) {
  if (!("fills" in node) || node.fills === figma.mixed || !node.fills || !node.fills.length) return null;
  for (var i = 0; i < node.fills.length; i++) {
    var fill = node.fills[i];
    if (!fill || fill.type !== "SOLID" || fill.visible === false) continue;
    var c = fill.color || { r: 0, g: 0, b: 0 };
    var a =
      typeof c.a === "number"
        ? c.a
        : typeof fill.opacity === "number"
          ? fill.opacity
          : 1;
    return { r: c.r, g: c.g, b: c.b, a: a };
  }
  return null;
}

function extractValue(node, type) {
  if (type === "COLOR") {
    return getSolidFillColor(node);
  }
  if (node.type !== "TEXT") return null;
  var text = node.characters != null ? String(node.characters) : "";
  if (type === "STRING") return text;
  if (type === "FLOAT") {
    var n = parseFloat(text.trim());
    return isNaN(n) ? null : n;
  }
  return null;
}

function defaultModeName(collection) {
  if (!collection || !collection.modes || !collection.modes.length) return "Mode 1";
  if (collection.defaultModeId) {
    for (var i = 0; i < collection.modes.length; i++) {
      if (collection.modes[i].modeId === collection.defaultModeId) return collection.modes[i].name;
    }
  }
  return collection.modes[0].name;
}

function formatValuePreview(type, value) {
  if (value == null) return "—";
  if (type === "COLOR" && typeof value.r === "number") {
    function hex(n) {
      var h = Math.round(Math.min(255, Math.max(0, n * 255))).toString(16);
      return h.length === 1 ? "0" + h : h;
    }
    return "#" + hex(value.r) + hex(value.g) + hex(value.b);
  }
  return String(value);
}

function nodeFilterForType(type) {
  if (type === "COLOR") return hasSolidFill;
  return function (node) {
    return node.type === "TEXT";
  };
}

function buildNotifyMessage(stats, collectionMeta) {
  var actionParts = [];
  if (stats.created) actionParts.push(stats.created + " created");
  if (stats.updated) actionParts.push(stats.updated + " updated");

  if (!actionParts.length) {
    if (stats.skipped) return stats.skipped + " skipped — no variables changed";
    return "No variables changed";
  }

  var msg = actionParts.join(", ");
  if (stats.skipped) msg += " · " + stats.skipped + " skipped";

  var colNames = Object.keys(collectionMeta).sort();
  if (colNames.length) {
    var colParts = [];
    for (var c = 0; c < colNames.length; c++) {
      var cn = colNames[c];
      colParts.push(collectionMeta[cn].created ? cn + " (new)" : cn);
    }
    var colShow =
      colParts.length <= 3 ? colParts.join(", ") : colParts.slice(0, 2).join(", ") + " +" + (colParts.length - 2);
    msg += " · " + colShow;
  }

  return msg;
}

(async function () {
  var selection = figma.currentPage.selection.slice();
  if (!selection.length) {
    figma.notify("Select layers to convert to variables");
    return;
  }

  var resolvedType = figmaVariableType(typeof variableType !== "undefined" ? variableType : "Color");
  var target = trimTarget(typeof targetCollection !== "undefined" ? targetCollection : "");
  var collectionCache = {};
  var collectionMeta = {};

  async function getCollectionForName(name, fromLayer) {
    if (collectionCache[name]) return collectionCache[name];
    var col = null;
    if (fromLayer || isNewCollectionTarget(target)) {
      var existed = await getCollection(name);
      col = await getOrCreateCollection(name);
      if (!collectionMeta[name]) collectionMeta[name] = { created: !existed };
    } else {
      col = await getCollection(name);
      if (col && !collectionMeta[name]) collectionMeta[name] = { created: false };
    }
    collectionCache[name] = col;
    return col;
  }

  var nodes = await collectNodesAsync(selection, {
    nodeFilter: nodeFilterForType(resolvedType),
    operation: "Scanning selection",
    showProgress: true,
  });

  if (!nodes.length) {
    var hint =
      resolvedType === "COLOR"
        ? "No layers with solid fills found in selection"
        : "No text layers found in selection";
    figma.notify(hint);
    finishCodefigRunProgress();
    return;
  }

  var stats = { created: 0, updated: 0, skipped: 0 };
  var results = [];
  var total = nodes.length;

  for (var i = 0; i < nodes.length; i++) {
    if (i % 25 === 0) showProgress(i, total, "Creating variables");

    var node = nodes[i];
    var layerPath = normalizeLayerPath(node.name);
    var resolved = resolveCollectionAndVariable(layerPath, target);

    if (resolved.error) {
      stats.skipped++;
      results.push(createSelectableResult(node.name, node.id, resolved.error, "warning"));
      continue;
    }

    var value = extractValue(node, resolvedType);
    if (value == null) {
      stats.skipped++;
      var reason =
        resolvedType === "COLOR"
          ? "No solid fill"
          : resolvedType === "FLOAT"
            ? "Text is not a valid number"
            : "Empty text";
      results.push(createSelectableResult(node.name, node.id, reason, "warning"));
      continue;
    }

    var collection = await getCollectionForName(resolved.collectionName, resolved.fromLayer);
    if (!collection) {
      stats.skipped++;
      results.push(
        createSelectableResult(
          node.name,
          node.id,
          'Collection "' + resolved.collectionName + '" not found',
          "warning"
        )
      );
      continue;
    }

    var modeName = defaultModeName(collection);
    var action = await createOrUpdateVariable(collection, resolved.variableName, {
      type: resolvedType,
      values: (function () {
        var o = {};
        o[modeName] = value;
        return o;
      })(),
    }, [modeName]);

    if (action === "created") stats.created++;
    else stats.updated++;

    results.push(
      createSelectableResult(
        resolved.collectionName + " / " + resolved.variableName,
        node.id,
        formatValuePreview(resolvedType, value) + " · " + node.name + " (" + action + ")",
        "success"
      )
    );
  }

  finishCodefigRunProgress();

  var summary = buildNotifyMessage(stats, collectionMeta);

  displayResults({
    title: "Selection to variables",
    results: results,
    type: stats.skipped && !stats.created && !stats.updated ? "warning" : "success",
    grouping: {
      modes: ["severity"],
      default: "severity",
      getGroupKey: function (r) {
        return r.severity || "Other";
      },
      getGroupTitle: function (key) {
        return key;
      },
    },
  });

  figma.notify(summary, { timeout: summary.length > 80 ? 8000 : 5000 });
})();
