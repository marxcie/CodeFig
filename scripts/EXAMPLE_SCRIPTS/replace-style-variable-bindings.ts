// Replace style variable bindings
// @DOC_START
// # Replace style variable bindings
// Rebinds **variables on style definitions** (not on layers). Only styles whose name **partially matches** `searchIn` are processed (e.g. `V5` matches `V5 / Text / 3xs / SemiBold`). Bindings that use variables from **Source collection** are swapped to the **same-named variable** in **Target collection** (types must match).
//
// ## Overview
// Walks **local** text, color (paint), and effect styles. Skips remote/library styles. For each bound variable whose collection is the source, looks up a variable with the same name in the target collection (local first, then team library). Text fields use `setBoundVariable`; fills/effects use cloned paints/effects with updated `VARIABLE_ALIAS` ids.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | searchIn | Substring of style name; only those styles are updated. Empty = all local text/paint/effect styles. |
// | sourceCollection | Collection name of variables currently bound on those styles. |
// | targetCollection | Collection where replacement variables are resolved (same variable names as in source). |
// | breakUnmatchedBindings | If true, **detach** source-collection bindings that have **no** matching variable in the target (default: leave those bindings unchanged). You can enable this with an empty target map to strip all source bindings on matching styles. |
// @DOC_END

@import { buildTargetVariableLookup, rebindStyleVariableBindingsOnStyle } from "@Styles"

// @UI_CONFIG_START
// # Replace style variable bindings
var searchIn = ""; // @placeholder="V5"
// Only styles whose name contains this (case-insensitive). Empty = every local text, paint, and effect style.
//
var sourceCollection = ""; // @options: variableCollections
// Variables bound from this collection are replaced (skip “(all collections)” — pick a real collection).
//
var targetCollection = ""; // @options: variableCollections
// Same-named variables in this collection become the new bindings.
// ---
var breakUnmatchedBindings = false;
// If true: bindings from the source collection with **no** same-name variable in the target are **removed** (raw values stay). If false, those bindings are left as-is.
// @UI_CONFIG_END

function styleNameMatches(styleName, searchInVal) {
  var s = searchInVal != null ? String(searchInVal).trim() : "";
  if (!s) return true;
  return String(styleName || "").toLowerCase().indexOf(s.toLowerCase()) !== -1;
}

async function main() {
  try {
    var searchInVal = typeof searchIn !== "undefined" ? searchIn : "";
    var sourceName = typeof sourceCollection !== "undefined" && sourceCollection != null ? String(sourceCollection).trim() : "";
    var targetName = typeof targetCollection !== "undefined" && targetCollection != null ? String(targetCollection).trim() : "";

    if (!sourceName) {
      figma.notify("⚠️ Choose a Source collection");
      return;
    }
    if (!targetName) {
      figma.notify("⚠️ Choose a Target collection");
      return;
    }
    if (sourceName === targetName) {
      figma.notify("⚠️ Source and Target collections must differ");
      return;
    }

    console.log("=== Replace style variable bindings ===");
    console.log("searchIn:", searchInVal ? '"' + searchInVal + '"' : "(all styles)");
    console.log("Source collection:", sourceName);
    console.log("Target collection:", targetName);
    var breakUnmatched = typeof breakUnmatchedBindings !== "undefined" && breakUnmatchedBindings === true;
    console.log("breakUnmatchedBindings:", breakUnmatched);

    var lookup = await buildTargetVariableLookup(targetName);
    if (lookup.map.size === 0 && !breakUnmatched) {
      figma.notify("❌ No variables found in target collection: " + targetName);
      return;
    }

    var total = 0;
    var stylesTouched = 0;

    var textStyles = await figma.getLocalTextStylesAsync();
    for (var t = 0; t < textStyles.length; t++) {
      var ts = textStyles[t];
      if (!styleNameMatches(ts.name, searchInVal)) continue;
      var c = await rebindStyleVariableBindingsOnStyle(ts, sourceName, lookup, breakUnmatched);
      if (c > 0) {
        total += c;
        stylesTouched++;
      }
    }

    var paintStyles = await figma.getLocalPaintStylesAsync();
    for (var p = 0; p < paintStyles.length; p++) {
      var ps = paintStyles[p];
      if (!styleNameMatches(ps.name, searchInVal)) continue;
      var c2 = await rebindStyleVariableBindingsOnStyle(ps, sourceName, lookup, breakUnmatched);
      if (c2 > 0) {
        total += c2;
        stylesTouched++;
      }
    }

    var effectStyles = await figma.getLocalEffectStylesAsync();
    for (var e = 0; e < effectStyles.length; e++) {
      var es = effectStyles[e];
      if (!styleNameMatches(es.name, searchInVal)) continue;
      var c3 = await rebindStyleVariableBindingsOnStyle(es, sourceName, lookup, breakUnmatched);
      if (c3 > 0) {
        total += c3;
        stylesTouched++;
      }
    }

    console.log("=== Done ===");
    console.log("Bindings updated:", total, "· Styles modified:", stylesTouched);

    if (total > 0) {
      figma.notify("✅ " + total + " binding change(s) on " + stylesTouched + " style(s) (replace / detach)");
    } else {
      figma.notify("⚠️ No changes. Check filters, collections, breakUnmatchedBindings, and target variable names.");
    }
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    console.error("replace-style-variable-bindings:", msg);
    figma.notify("❌ " + msg);
  }
}

main();
