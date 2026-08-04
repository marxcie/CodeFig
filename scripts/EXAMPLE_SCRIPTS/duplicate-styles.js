// Duplicate styles collection
// @DOC_START
// # Duplicate styles collection
// Duplicates every **local** style under a source path into a target path, preserving subfolders (`V1 / 3xl / SemiBold` → `V2 / 3xl / SemiBold`).
//
// ## Overview
// Figma’s built-in duplicate keeps styles under the original group. This script creates **new** paint, text, effect, and grid styles whose names mirror the source tree under **targetStyleGroup**. Matching uses path **segments** (split on `/`), so spacing around slashes is normalized.
//
// **Variable bindings:** Text styles use `setBoundVariable` with the same variable references as the source. Paint, effect, and grid slots merge `boundVariables` from the source so color/typography bindings survive JSON cloning.
//
// **Rebind to another collection (optional):** If **rebindTargetCollection** is set, after each duplicate the script maps **every** bound variable on that style to the **same name + type** in the chosen collection (text / paint / effect). If it is empty, bindings stay on the **original** variables copied from the source styles.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | sourceStyleGroup | First segment(s) of the folder to copy (e.g. `V1`). |
// | targetStyleGroup | New root path (e.g. `V2`). |
// | rebindTargetCollection | Optional. Non-empty = rebind duplicated styles to variables in this collection. Empty = keep original variable references. |
// | rebindBreakUnmatchedBindings | If true, detach bindings that have no same-name variable in the target collection. |
// @DOC_END

@import { getAllStyles } from "@Core Library"
@import { buildTargetVariableLookup, rebindStyleVariableBindingsOnStyle } from "@Styles"

if (typeof getAllStyles !== "function") {
  var getAllStyles = function () {
    return Promise.all([
      figma.getLocalPaintStylesAsync(),
      figma.getLocalTextStylesAsync(),
      figma.getLocalEffectStylesAsync(),
      figma.getLocalGridStylesAsync(),
    ]).then(function (r) {
      return r[0].concat(r[1]).concat(r[2]).concat(r[3]);
    });
  };
}

// @UI_CONFIG_START
// # Duplicate style group
// Path prefix (segments separated by /). All local styles under the source path are copied to the target path.
var sourceStyleGroup = ""; // @placeholder="V1"
var targetStyleGroup = ""; // @placeholder="V2"
// ---
var rebindTargetCollection = ""; // @options: variableCollections
// Leave empty to keep bindings on the **original** variables. Choose a collection to point duplicated styles at same-named variables there (text / paint / effect).
// ---
var rebindBreakUnmatchedBindings = false;
// If true: detach bindings that have no same-name variable in the target collection.
// @UI_CONFIG_END

// ========================================
// Path helpers (Figma groups = "A / B / C")
// ========================================

function stylePathSegments(name) {
  return String(name || "")
    .split(/\s*\/\s*/)
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s.length > 0;
    });
}

function segmentsPrefixMatch(styleSegments, groupSegments) {
  if (groupSegments.length === 0) return false;
  if (styleSegments.length < groupSegments.length) return false;
  for (var i = 0; i < groupSegments.length; i++) {
    if (styleSegments[i] !== groupSegments[i]) return false;
  }
  return true;
}

function mapStyleNameToTarget(styleName, sourceSegments, targetSegments) {
  var all = stylePathSegments(styleName);
  if (!segmentsPrefixMatch(all, sourceSegments)) return null;
  if (all.length === sourceSegments.length) {
    return targetSegments.join(" / ");
  }
  var rest = all.slice(sourceSegments.length);
  return targetSegments.concat(rest).join(" / ");
}

function cloneViaJson(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return value;
  }
}

/** Deep-clone a paint/effect/grid slot; re-attach boundVariables Figma may omit from JSON.stringify(slot). */
function cloneSlotWithBindings(slot) {
  if (slot == null) return slot;
  var c = cloneViaJson(slot);
  if (!c || typeof c !== "object") c = {};
  if (slot.boundVariables && typeof slot.boundVariables === "object") {
    c.boundVariables = cloneViaJson(slot.boundVariables);
  }
  return c;
}

function cloneSlotArray(slots) {
  if (!slots || !slots.length) return [];
  var out = [];
  for (var i = 0; i < slots.length; i++) {
    out.push(cloneSlotWithBindings(slots[i]));
  }
  return out;
}

async function resolveVariableAliasForCopy(alias) {
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

/** Copy typography variable bindings; assigning boundVariables on TextStyle is unreliable — use setBoundVariable. */
async function copyTextStyleVariableBindingsFromSource(src, dest) {
  if (!src.boundVariables || typeof dest.setBoundVariable !== "function") return;
  var props = Object.keys(src.boundVariables);
  for (var i = 0; i < props.length; i++) {
    var prop = props[i];
    if (!src.boundVariables.hasOwnProperty(prop)) continue;
    var binding = src.boundVariables[prop];
    var alias = Array.isArray(binding) ? binding[0] : binding;
    if (!alias) continue;
    var v = await resolveVariableAliasForCopy(alias);
    if (v) {
      try {
        dest.setBoundVariable(prop, v);
      } catch (e) {
        console.warn("[DuplicateStyles] Text bind " + prop + ": " + (e && e.message));
      }
    }
  }
}

// ========================================
// Per-type duplication
// ========================================

async function duplicatePaintStyle(src, newName) {
  var d = figma.createPaintStyle();
  d.name = newName;
  if (src.description) d.description = src.description;
  d.paints = cloneSlotArray(src.paints);
  if (src.boundVariables && typeof src.boundVariables === "object") {
    d.boundVariables = cloneViaJson(src.boundVariables);
  }
  return d;
}

async function duplicateEffectStyle(src, newName) {
  var d = figma.createEffectStyle();
  d.name = newName;
  if (src.description) d.description = src.description;
  d.effects = cloneSlotArray(src.effects);
  if (src.boundVariables && typeof src.boundVariables === "object") {
    d.boundVariables = cloneViaJson(src.boundVariables);
  }
  return d;
}

async function duplicateGridStyle(src, newName) {
  var d = figma.createGridStyle();
  d.name = newName;
  if (src.description) d.description = src.description;
  d.layoutGrids = cloneSlotArray(src.layoutGrids);
  if (src.boundVariables && typeof src.boundVariables === "object") {
    d.boundVariables = cloneViaJson(src.boundVariables);
  }
  return d;
}

async function duplicateTextStyle(src, newName) {
  await figma.loadFontAsync(src.fontName);
  var d = figma.createTextStyle();
  d.name = newName;
  if (src.description) d.description = src.description;
  d.fontName = src.fontName;
  d.fontSize = src.fontSize;
  d.lineHeight = src.lineHeight;
  d.letterSpacing = src.letterSpacing;
  d.paragraphSpacing = src.paragraphSpacing;
  d.paragraphIndent = src.paragraphIndent;
  d.textCase = src.textCase;
  d.textDecoration = src.textDecoration;
  try {
    if ("leadingTrim" in src) d.leadingTrim = src.leadingTrim;
    if ("textTrailingTrim" in src) d.textTrailingTrim = src.textTrailingTrim;
  } catch (e) {}
  await copyTextStyleVariableBindingsFromSource(src, d);
  return d;
}

async function duplicateOneStyle(src, newName) {
  var t = src.type;
  if (t === "PAINT") return duplicatePaintStyle(src, newName);
  if (t === "TEXT") return duplicateTextStyle(src, newName);
  if (t === "EFFECT") return duplicateEffectStyle(src, newName);
  if (t === "GRID") return duplicateGridStyle(src, newName);
  throw new Error("Unsupported style type: " + t);
}

// ========================================
// Run
// ========================================

(async function () {
  var sourceRaw = typeof sourceStyleGroup !== "undefined" ? String(sourceStyleGroup).trim() : "";
  var targetRaw = typeof targetStyleGroup !== "undefined" ? String(targetStyleGroup).trim() : "";

  if (!sourceRaw || !targetRaw) {
    figma.notify("Set sourceStyleGroup and targetStyleGroup");
    return;
  }

  var sourceSegments = stylePathSegments(sourceRaw);
  var targetSegments = stylePathSegments(targetRaw);
  if (sourceSegments.length === 0 || targetSegments.length === 0) {
    figma.notify("Invalid source or target path");
    return;
  }

  var rebindTargetName =
    typeof rebindTargetCollection !== "undefined" && rebindTargetCollection != null
      ? String(rebindTargetCollection).trim()
      : "";
  var rebindBreak =
    typeof rebindBreakUnmatchedBindings !== "undefined" && rebindBreakUnmatchedBindings === true;

  var lookup = null;
  if (rebindTargetName) {
    if (typeof buildTargetVariableLookup !== "function" || typeof rebindStyleVariableBindingsOnStyle !== "function") {
      figma.notify("Rebind: @Styles import missing (buildTargetVariableLookup)");
      return;
    }
    lookup = await buildTargetVariableLookup(rebindTargetName);
    if (lookup.map.size === 0) {
      console.warn(
        '[DuplicateStyles] Target collection "' + rebindTargetName + '" has no variables; rebind skipped'
      );
      lookup = null;
    }
  }

  var allStyles = await getAllStyles();

  var candidates = [];
  for (var i = 0; i < allStyles.length; i++) {
    var s = allStyles[i];
    if (s.remote) continue;
    var mapped = mapStyleNameToTarget(s.name, sourceSegments, targetSegments);
    if (!mapped) continue;
    candidates.push({ style: s, newName: mapped });
  }

  if (candidates.length === 0) {
    figma.notify('No local styles under "' + sourceRaw + '"');
    return;
  }

  var created = 0;
  var failed = 0;
  var reboundTotal = 0;

  for (var j = 0; j < candidates.length; j++) {
    var item = candidates[j];
    var newName = item.newName;
    try {
      var dup = await duplicateOneStyle(item.style, newName);
      created++;
      console.log('[DuplicateStyles] ' + item.style.type + ' "' + item.style.name + '" → "' + newName + '"');
      if (lookup && dup) {
        var rb = await rebindStyleVariableBindingsOnStyle(dup, "", lookup, rebindBreak);
        reboundTotal += rb;
      }
    } catch (err) {
      failed++;
      console.error(
        '[DuplicateStyles] Failed "' + item.style.name + '" → "' + newName + '":',
        err && err.message ? err.message : err
      );
    }
  }

  var msg = "Duplicated " + created + " style(s)";
  if (rebindTargetName && lookup) msg += "; rebind ops: " + reboundTotal;
  if (rebindTargetName && !lookup) msg += "; rebind skipped (empty target map)";
  if (failed) msg += "; " + failed + " failed";
  figma.notify(msg);
})();
