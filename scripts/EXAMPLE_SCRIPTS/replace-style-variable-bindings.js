// Replace style variable bindings
// @DOC_START
// Rebinds **variables on style definitions** (not on layers). Only styles whose name **partially matches** `searchIn` are processed (e.g. `V5` matches `V5 / Text / 3xs / SemiBold`). Bindings that use variables from **Source collection** are swapped to the **same-named variable** in **Target collection** (types must match).
//
// ## Overview
// Walks **local** text, color (paint), and effect styles. Skips remote/library styles. For each bound variable whose collection is the source, looks up a variable with the same name in the target collection (local first, then team library). Text fields use `setBoundVariable`; fills/effects use cloned paints/effects with updated `VARIABLE_ALIAS` ids.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | searchIn | Style-name pattern; only matching styles are updated. Empty = all local text/paint/effect styles. |
// | sourceCollection | Collection name of variables currently bound on those styles. |
// | targetCollection | Collection where replacement variables are resolved (same variable names as in source). |
// | previewOnly | **On by default.** Lists the bindings that would change and changes nothing; untick and run again to apply. |
// | matchCase | Match `searchIn` case-sensitively. |
// | useRegex | Treat `searchIn` as a regular expression. |
// | breakUnmatchedBindings | If true, **detach** source-collection bindings that have **no** matching variable in the target (default: leave those bindings unchanged). You can enable this with an empty target map to strip all source bindings on matching styles. |
//
// ## Preview first
// Previews by default: the same walk runs in dry-run mode, reporting every binding it would
// change as `SourceCollection/name → TargetCollection/name` (or `(detached)`), and writing
// nothing. Untick **Preview only** and run again to apply. Unlike the rename scripts there is
// no collision flag here — a rebind aims at a variable that already exists, which is the point
// rather than a clash.
//
// ## Search patterns
// | Input | Meaning |
// |-------|---------|
// | text | Matches names **containing** that text (case-insensitive). |
// | V4/*/Primary | `*` matches any characters. A CodeFig extension — Figma has no wildcard. |
// | (\w+)-(\d+) | A regular expression — **only** when "Use regular expression" is ticked. |
// | (blank) | An empty filter matches everything; an empty find replaces the entire name. |
//
// Brackets and parens are literal text unless regex mode is on, so `Text [Legacy]` matches
// only names that really contain `Text [Legacy]`. Tick **Match case** for case-sensitive
// matching. Same rules in every CodeFig find/replace script.
// @DOC_END

@import { buildTargetVariableLookup, rebindStyleVariableBindingsOnStyle } from "@Styles"
@import { nameMatches, patternModeNote } from "@Pattern Matching"
@import { previewRow, previewPayload, logPreviewPlan, previewSignature, savePreviewSignature, readPreviewSignature, previewDriftMessage } from "@Rename Preview"
@import { displayResults } from "@InfoPanel"

// @UI_CONFIG_START
var searchIn = ""; // @placeholder="V5/*"
// Only styles whose name contains this, ignoring case, with `*` allowed. Empty means every local text,
// paint and effect style.
//
var matchCase = false; // @label: Match case
var useRegex = false; // @label: Use regular expression
// Reads **Search in** as a regular expression rather than plain text with `*` wildcards.
//
var sourceCollection = ""; // @options: variableCollections
// Bindings pointing at this collection are the ones that move. Pick a real collection — *(all
// collections)* does nothing here.
//
var targetCollection = ""; // @options: variableCollections
// Each binding moves to the same-named variable in this collection.
// ---
var previewOnly = true; // @label: Preview only
// **On by default.** Lists the bindings that would change and touches nothing. Untick and run again to apply.
//
var breakUnmatchedBindings = false;
// What to do when the target has no variable of that name. **On** removes the binding and leaves the
// raw value behind; **off** leaves the binding pointing where it already does.
// @UI_CONFIG_END

/**
 * Walk every local text, paint and effect style matching `searchIn`, rebinding through
 * @Styles. With `dryRun` it changes nothing and returns the plan instead — same traversal,
 * same matching, same replacement lookup, so a preview cannot drift from the apply.
 */
async function walkMatchingStyles(searchInVal, matchOpts, sourceName, lookup, breakUnmatched, dryRun) {
  var plan = [];
  var options = { dryRun: dryRun === true, plan: plan };
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
      matchCase: typeof matchCase !== "undefined" && matchCase === true
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

    var previewOnlyVal = typeof previewOnly === "undefined" || previewOnly === true;

    // One walk, two modes. The dry run reports through `plan` and writes nothing, so the
    // preview and the apply pass are the same code path over the same styles — not a
    // description of it maintained separately.
    var walk = await walkMatchingStyles(searchInVal, matchOpts, sourceName, lookup, breakUnmatched, previewOnlyVal);

    if (previewOnlyVal) {
      var rows = walk.plan.map(function (entry) {
        return previewRow(
          (entry.fromCollection ? entry.fromCollection + "/" : "") + entry.fromName,
          entry.action === "detach" ? "(detached)" : targetName + "/" + entry.toName,
          entry.styleName + " · " + entry.field
        );
      });
      // No collision check here, unlike the rename scripts: a rebind *targets* a variable that
      // already exists. Its existing is the point, not a clash.
      logPreviewPlan(rows, { field: "previewOnly" });
      await savePreviewSignature("replace-style-variable-bindings", previewSignature(rows));
      displayResults(previewPayload("Replace style variable bindings", rows));
      figma.notify(
        "Preview: " + walk.total + " binding change(s) on " + walk.stylesTouched +
          " style(s). Nothing changed."
      );
      return;
    }

    var applyRows = walk.plan.map(function (entry) {
      return previewRow(
        (entry.fromCollection ? entry.fromCollection + "/" : "") + entry.fromName,
        entry.action === "detach" ? "(detached)" : targetName + "/" + entry.toName,
        entry.styleName
      );
    });
    var drift = previewDriftMessage(
      await readPreviewSignature("replace-style-variable-bindings"),
      previewSignature(applyRows)
    );
    if (drift) console.warn(drift);

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
