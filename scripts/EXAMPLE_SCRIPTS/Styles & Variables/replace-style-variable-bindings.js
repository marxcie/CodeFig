// Replace variables in local styles
// @DOC_START
// # Rebinds variables on local style definitions from a source collection to same-named variables in a target
//
// ## Overview
//
// Walks **local** text, color (paint), and effect styles. Skips remote or library styles. Only
// styles whose name matches **Search in** are processed (partial match; empty means all local
// text, paint, and effect styles).
//
// Bindings that use variables from **Source collection** are swapped to the same-named variable
// in **Target collection** (types must match). Text fields use bound variables; fills and effects
// update variable alias ids on cloned paints and effects. Matching is case-sensitive.
//
// ### Search patterns
//
// | Input | Meaning |
// | --- | --- |
// | text | Matches names containing that text (case-sensitive). |
// | `V4/*/Primary` | `*` matches any characters. |
// | `(\\w+)-(\\d+)` | A regular expression, only when **Use regular expression** is on. |
// | (blank) | Empty Search in matches every local text, paint, and effect style. |
//
// Brackets and parens are literal text unless regex mode is on.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Search in**<br>`searchIn` | Only styles whose name contains this. Empty means every local text, paint, and effect style. |
// | **Use regular expression**<br>`useRegex` | Treat Search in as a regular expression rather than plain text with `*` wildcards. |
// | **Source collection**<br>`sourceCollection` | Bindings pointing at this collection are the ones that move. |
// | **Target collection**<br>`targetCollection` | Each binding moves to the same-named variable in this collection. |
// | **Break unmatched bindings**<br>`breakUnmatchedBindings` | When on, remove a binding if the target has no variable of that name (raw value remains). Off leaves the binding as it is. |
// @DOC_END

@import { buildTargetVariableLookup, rebindStyleVariableBindingsOnStyle } from "@Styles"
@import { nameMatches, patternModeNote } from "@Pattern Matching"

// @UI_CONFIG_START
var searchIn = "";
var useRegex = false;
var sourceCollection = "";
var targetCollection = "";
var breakUnmatchedBindings = false;
// @UI_CONFIG_END

// @PANEL_START
// {
//   "blocks": [
//     {
//       "key": "searchIn",
//       "type": "string",
//       "placeholder": "V5/*"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Only styles whose name contains this, with `*` allowed. Empty means every local text, paint and\neffect style."
//     },
//     {
//       "key": "useRegex",
//       "type": "boolean",
//       "label": "Use regular expression"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Reads **Search in** as a regular expression rather than plain text with `*` wildcards."
//     },
//     {
//       "key": "sourceCollection",
//       "type": "select",
//       "options": "variableCollections"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Bindings pointing at this collection are the ones that move. Pick a real collection — *(all\ncollections)* does nothing here."
//     },
//     {
//       "key": "targetCollection",
//       "type": "select",
//       "options": "variableCollections"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Each binding moves to the same-named variable in this collection."
//     },
//     {
//       "type": "divider"
//     },
//     {
//       "key": "breakUnmatchedBindings",
//       "type": "boolean"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "What to do when the target has no variable of that name. **On** removes the binding and leaves the\nraw value behind; **off** leaves the binding pointing where it already does."
//     }
//   ]
// }
// @PANEL_END

/**
 * Walk every local text, paint and effect style matching `searchIn`, rebinding through
 * @Styles.
 */
async function walkMatchingStyles(searchInVal, matchOpts, sourceName, lookup, breakUnmatched) {
  var plan = [];
  var options = { dryRun: false, plan: plan };
  var total = 0;
  var stylesTouched = 0;
  var i;

  var groups = [
    await figma.getLocalTextStylesAsync(),
    await figma.getLocalPaintStylesAsync(),
    await figma.getLocalEffectStylesAsync()
  ];

  for (var g = 0; g < groups.length; g++) {
    var styles = groups[g];
    for (i = 0; i < styles.length; i++) {
      if (!nameMatches(styles[i].name, searchInVal, matchOpts)) continue;
      var changed = await rebindStyleVariableBindingsOnStyle(
        styles[i], sourceName, lookup, breakUnmatched, options
      );
      if (changed > 0) {
        total += changed;
        stylesTouched++;
      }
    }
  }

  return { plan: plan, total: total, stylesTouched: stylesTouched };
}

async function main() {
  try {
    var searchInVal = typeof searchIn !== "undefined" ? searchIn : "";
    // One matcher for every CodeFig find/replace script: see @Pattern Matching.
    var matchOpts = {
      useRegex: typeof useRegex !== "undefined" && useRegex === true,
      matchCase: true
    };
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
    var modeNote = patternModeNote(searchInVal, matchOpts);
    if (modeNote) console.log(modeNote);
    console.log("Source collection:", sourceName);
    console.log("Target collection:", targetName);
    var breakUnmatched = typeof breakUnmatchedBindings !== "undefined" && breakUnmatchedBindings === true;
    console.log("breakUnmatchedBindings:", breakUnmatched);

    var lookup = await buildTargetVariableLookup(targetName);
    if (lookup.map.size === 0 && !breakUnmatched) {
      figma.notify("❌ No variables found in target collection: " + targetName);
      return;
    }

    var walk = await walkMatchingStyles(searchInVal, matchOpts, sourceName, lookup, breakUnmatched);

    console.log("=== Done ===");
    console.log("Bindings updated:", walk.total, "· Styles modified:", walk.stylesTouched);

    if (walk.total > 0) {
      figma.notify("✅ " + walk.total + " binding change(s) on " + walk.stylesTouched + " style(s) (replace / detach)");
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
