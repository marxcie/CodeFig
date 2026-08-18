// Selection to variables
// @DOC_START
// Recursively walks the selection and creates or updates variables from layer names and values.
//
// ## Collection
// Pick a collection in this file, or choose **New collection** and type a name — a name that is not
// in this file is created on Run. Same control as the Design System Foundations scripts.
//
// ## Mode
// Which mode the values are written to, chosen the same way: a mode of that collection, or **New
// mode** and a name, created on Run. Left empty, the values go to the collection's default mode.
//
// Changing the collection empties it, because the modes on offer are the new collection's.
//
// ## Layer naming
// The layer name is the variable path *inside* that collection; slashes are groups.
// - `bark/350` → group `bark`, variable `350`
// - `primitives/bark/350` → group `primitives/bark`, variable `350`
// - `350` → variable `350` at the collection root
//
// ## Variable type
// | Type | Layer | Value |
// |------|-------|-------|
// | Color | Shape with solid fill | Fill color |
// | Number | Text | Parsed number from text content |
// | String | Text | Text content |
//
// Results are listed in the **Info panel**. Click a row to select the layer.
//
// **Not a search pattern.** The collection field is a picker — compared by exact name, not with the
// `*` / regex matching used by the CodeFig find/replace scripts. Deliberate: this is an
// identifier, not a search.
// @DOC_END

@import { collectNodesAsync, showProgress, finishCodefigRunProgress } from "@Core Library"
@import { getOrCreateCollection, getCollection, createOrUpdateVariable, getOrCreateMode, getDefaultMode, getModeByName } from "@Variables"
@import { displayResults, createSelectableResult } from "@InfoPanel"

// @UI_CONFIG_START
// Where the variables go. Pick a collection in this file, or choose "New collection" and type a
// name — a name that is not in this file is created on Run.
var targetCollection = ""; // @collection @label: Collection
// Which mode the values are written to. Empty means the collection's default mode.
var targetMode = ""; // @mode: targetCollection @label: Mode
//
var variableType = "Color"; // @options: Color|Number|String
// Color: solid fill on shapes. Number / String: text layers.
// @UI_CONFIG_END

function trimTarget(v) {
  return v != null ? String(v).trim() : "";
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

// The layer name is the variable path inside the chosen collection — nothing is peeled off the
// front. The collection comes from the picker, which is the whole point of standardising on it:
// one place says where variables go, and `bark/350` means the same thing whether that collection
// already exists or is about to.
function resolveVariableName(layerPath) {
  var path = normalizeLayerPath(layerPath);
  if (!path) return { error: "Empty layer name" };
  return { variableName: path };
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

function buildNotifyMessage(stats, collectionName, collectionCreated, modeName, modeCreated) {
  var actionParts = [];
  if (stats.created) actionParts.push(stats.created + " created");
  if (stats.updated) actionParts.push(stats.updated + " updated");

  if (!actionParts.length) {
    if (stats.skipped) return stats.skipped + " skipped — no variables changed";
    return "No variables changed";
  }

  var msg = actionParts.join(", ");
  if (stats.skipped) msg += " · " + stats.skipped + " skipped";
  msg += " · " + collectionName + (collectionCreated ? " (new)" : "");
  // The mode only earns its place in the summary when it was a choice: naming the one mode of a
  // single-mode collection is noise, and creating one is the thing worth reading twice.
  if (modeName && modeCreated) msg += " / " + modeName + " (new mode)";

  return msg;
}

(async function () {
  var selection = figma.currentPage.selection.slice();
  if (!selection.length) {
    figma.notify("Select layers to convert to variables");
    return;
  }

  var resolvedType = figmaVariableType(typeof variableType !== "undefined" ? variableType : "Color");
  var collectionName = trimTarget(typeof targetCollection !== "undefined" ? targetCollection : "");

  if (!collectionName) {
    figma.notify("Pick a collection, or choose New collection and type a name");
    return;
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

  // Asked before creating, so the summary can say whether the collection is new — the picker's
  // "New collection" is an instruction, not a promise the name is absent.
  var collectionCreated = !(await getCollection(collectionName));
  var collection = await getOrCreateCollection(collectionName);
  if (!collection) {
    figma.notify('Could not open or create collection "' + collectionName + '"');
    finishCodefigRunProgress();
    return;
  }
  // The ids that were there before, so "new" is decided by which mode came back rather than by
  // comparing names — `getOrCreateMode` matches the way Figma does, and a rename of a new
  // collection's default mode is not a mode being added.
  var requestedMode = trimTarget(typeof targetMode !== "undefined" ? targetMode : "");
  var modeIdsBefore = collection.modes.map(function (m) {
    return m.modeId;
  });
  var mode;
  try {
    mode = getOrCreateMode(collection, requestedMode);
  } catch (err) {
    figma.notify(err && err.message ? err.message : String(err), { timeout: 8000 });
    finishCodefigRunProgress();
    return;
  }
  if (!mode) {
    figma.notify('Could not open or create mode "' + requestedMode + '"');
    finishCodefigRunProgress();
    return;
  }
  var modeName = mode.name;
  var modeCreated = modeIdsBefore.indexOf(mode.modeId) === -1;

  var stats = { created: 0, updated: 0, skipped: 0 };
  var results = [];
  var total = nodes.length;

  for (var i = 0; i < nodes.length; i++) {
    if (i % 25 === 0) showProgress(i, total, "Creating variables");

    var node = nodes[i];
    var resolved = resolveVariableName(node.name);

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
        collectionName + " / " + resolved.variableName,
        node.id,
        formatValuePreview(resolvedType, value) + " · " + node.name + " (" + action + ")",
        "success"
      )
    );
  }

  finishCodefigRunProgress();

  var summary = buildNotifyMessage(stats, collectionName, collectionCreated, modeName, modeCreated);

  // **No `grouping`.** It carried `getGroupKey` / `getGroupTitle` functions, and the panel is
  // reached by `postMessage` — so the whole call threw `Cannot unwrap function` before anything was
  // shown, and the run never signalled completion. The panel groups by `node` or `property` and by
  // nothing else; `severity` was never one of them, and every row shows its own severity anyway.
  displayResults({
    title: "Selection to variables",
    results: results,
    type: stats.skipped && !stats.created && !stats.updated ? "warning" : "success",
  });

  figma.notify(summary, { timeout: summary.length > 80 ? 8000 : 5000 });
})();
