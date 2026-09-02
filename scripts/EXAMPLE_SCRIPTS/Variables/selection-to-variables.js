// Selection to variables
// @DOC_START
// # Creates or updates variables from selected layers' names and values
//
// ## Overview
//
// Recursively walks the selection and writes variables into a collection.
//
// **Collection:** pick one in this file, or choose New collection and type a name. A name that is
// not in this file is created on Run.
//
// **Mode:** which mode the values are written to. Empty means the collection's default mode. New
// mode always means a mode beside the ones you have, never a rename. The exception is a collection
// with no variables yet: its untouched Mode 1 is a placeholder Figma made, so New mode can take
// that slot.
//
// Changing the collection clears Mode, because the modes on offer belong to the new collection.
//
// **Group within collection:** a prefix every variable goes under. Empty means the collection
// root. It composes with the layer name: group `bark` plus a layer named `350`, or no group plus
// a layer named `bark/350`, both write `bark/350`.
//
// ### Layer naming
//
// The layer name is the variable path inside the collection (after the group); slashes are further
// groups.
//
// - `bark/350` → group `bark`, variable `350`
// - `primitives/bark/350` → group `primitives/bark`, variable `350`
// - `350` → variable `350` at the collection root
//
// ### Variable type
//
// | Type | Layer | Value |
// | --- | --- |
// | Color | Shape with solid fill | Fill color |
// | Number | Text | Parsed number from text content |
// | String | Text | Text content |
//
// Every variable the run touched is listed in the Info panel (created or updated). Click a row to
// select the layer. Open the Info panel from its button when you want to read the run.
//
// Collection is an exact picker, not a search pattern.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Collection**<br>`targetCollection` | Destination collection, or New collection with a name. |
// | **Mode**<br>`targetMode` | Mode to write into. Empty means the collection's default mode. |
// | **Group within collection**<br>`targetGroup` | Prefix under which every variable is created. Empty means collection root. |
// | **Variable type**<br>`variableType` | Color (solid fill on shapes), Number, or String (text layers). |
// @DOC_END

@import { collectNodesAsync, showProgress, finishCodefigRunProgress } from "@Core Library"
@import { getOrCreateCollection, getCollection, createOrUpdateVariable, getOrCreateMode, getDefaultMode, getModeByName } from "@Variables"
@import { displayResults, createSelectableResult } from "@InfoPanel"

// @UI_CONFIG_START
var targetCollection = "";
var targetMode = "";
var targetGroup = "";
var variableType = "Color";
// @UI_CONFIG_END

// @PANEL_START
var __codefigPanel = {
  blocks: [
    { type: "paragraph", attachTo: "next",
      text: "Where the variables go. Pick a collection in this file, or choose \"New collection\" and type a\nname — a name that is not in this file is created on Run." },
    { key: "targetCollection", type: "collection", label: "Collection" },
    { type: "paragraph", attachTo: "next", text: "Which mode the values are written to. Empty means the collection's default mode." },
    { key: "targetMode", type: "mode", label: "Mode", collection: "targetCollection" },
    { type: "paragraph", attachTo: "next",
      text: "A group inside the collection that every variable goes under. Empty means the collection root." },
    { key: "targetGroup", type: "string", label: "Group within collection", placeholder: "eg.: primitives/bark" },
    { key: "variableType", type: "select", options: ["Color", "Number", "String"] },
    { type: "paragraph", attachTo: "previous", text: "Color: solid fill on shapes. Number / String: text layers." }
  ]
};
// @PANEL_END

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

// `bark` → `bark/`, `/primitives/bark/` → `primitives/bark/`, nothing → nothing.
function groupPrefix(group) {
  var path = normalizeLayerPath(group);
  return path ? path + "/" : "";
}

// The layer name is the variable path inside the chosen collection — nothing is peeled off the
// front. The collection comes from the picker, which is the whole point of standardising on it:
// one place says where variables go, and `bark/350` means the same thing whether that collection
// already exists or is about to.
//
// The group is a prefix on that path, not a replacement for it: naming the group in one field is
// cleaner than repeating it in every layer name, but a layer named `bark/350` still means the same
// thing, so the two compose rather than competing. A group of `bark` over a layer called `350` and
// no group over a layer called `bark/350` both write `bark/350`.
function resolveVariableName(layerPath, group) {
  var path = normalizeLayerPath(layerPath);
  if (!path) return { error: "Empty layer name" };
  return { variableName: groupPrefix(group) + path };
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
  var groupName = trimTarget(typeof targetGroup !== "undefined" ? targetGroup : "");

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
    var resolved = resolveVariableName(node.name, groupName);

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
  // **`autoOpen: false`.** The panel is where the run is written down — every variable, its value and
  // whether it was created or updated — and it stays reachable from the button. It is not where you
  // are sent. The notification is the outcome; opening a panel over the file to say the same thing in
  // more words is the plugin talking over the work. The severity stays honest either way, so a run
  // that skipped everything still reads as a warning when you go and look.
  displayResults({
    title: "Selection to variables",
    results: results,
    type: stats.skipped && !stats.created && !stats.updated ? "warning" : "success",
    autoOpen: false,
  });

  figma.notify(summary, { timeout: summary.length > 80 ? 8000 : 5000 });
})();
