// Rename styles
// @DOC_START
// # Rename styles
// Rename local styles (paint, text, effect, grid) by search/replace patterns.
//
// ## Overview
// Applies find/replace to style names. Use searchIn to narrow by folder, searchFor/replaceWith for single replacement, or batchReplacement for multiple operations. Supports Figma-style placeholders: $& (full match), $1 $2 (regex groups), $n $nn $nnn (ascending), $N $NN $NNN (descending).
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | searchIn | Optional filter: only styles whose name contains this (e.g. "color/", "Typography/*"). |
// | searchFor | Pattern to find in style names. |
// | replaceWith | Replacement string; may use the tokens below. |
// | previewOnly | **On by default.** Lists what would change and changes nothing; untick and run again to apply. |
// | matchCase | Match `searchIn` and `searchFor` case-sensitively. |
// | useRegex | Treat both patterns as regular expressions. |
// | batchReplacement | Optional array of [search, replace] pairs; if set, overrides searchFor/replaceWith. |
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
//
// ## Replacement tokens
// | Token | Meaning |
// |-------|---------|
// | `$&` | The whole match |
// | `$1` `$2` | Capture groups (regex mode only) |
// | `$n` `$nn` `$nnn` | Ascending counter (1, 01, 001) |
// | `$N` `$NN` `$NNN` | Descending counter |
//
// ## Preview first
// The script previews by default: it computes every rename, applies none, and lists them as
// `old → new` in the InfoPanel and the console. Rows are flagged when the new name already
// exists, when two rows would produce the same name, when a pattern matched but changed
// nothing (usually a pattern that does not mean what was intended), or when the result would
// be empty. Untick **Preview only** and run again to apply.
//
// `$n` / `$N` are positional, so they depend on the set of matches. Preview and apply are two
// runs — if the file changes in between, the numbering moves. The apply run says so when the
// plan no longer matches what was previewed.
//
// ## Examples
// Simple: searchFor = "font-", replaceWith = "text-"
// With filter: searchIn = "color/", searchFor = "pine", replaceWith = "Pine"
// Wildcard filter: searchIn = "V4/*/Primary", searchFor = "V4", replaceWith = "V5"
// Regex + numbering: useRegex = true, searchFor = "(\\w+)-(\\d+)", replaceWith = "$1-$2-$nn"
// Batch: batchReplacement = [["LG","XL"], ["MD","LG"], ["SM","MD"]]
// @DOC_END

@import { getAllStyles } from "@Core Library"
@import { nameMatches, renameByPattern, patternModeNote } from "@Pattern Matching"
@import { previewRow, flagPreviewCollisions, previewPayload, logPreviewPlan, previewSignature, savePreviewSignature, readPreviewSignature, previewDriftMessage } from "@Rename Preview"
@import { displayResults } from "@InfoPanel"

// ========================================
// CONFIGURATION
// ========================================

// @UI_CONFIG_START
// # Batch rename styles
var searchIn = ""; // @placeholder="text/*"
// Optional, narrow to styles whose name contains this (e.g. "color/", "V4/*/Primary")
//
var searchFor = ""; // @placeholder="font-"
var replaceWith = ""; // @placeholder="text-"
// Leave searchFor empty to replace the whole name. Tokens: $& $1 $n $nn $nnn $N $NN $NNN
//
var matchCase = false; // @label: Match case
var useRegex = false; // @label: Use regular expression
// Treat searchIn and searchFor as regular expressions instead of literal text with `*` wildcards.
//
var previewOnly = true; // @label: Preview only
// **On by default.** Lists what would change and changes nothing. Untick and run again to apply.
// ---
var batchReplacement = ""; // @textarea
// Batch replacement: one line per pair, "search, replace" (overrides searchFor/replaceWith when non-empty)
// **Example:**
// "SemiBold, semibold ",
// "Regular, regular ",
// "Small, small ",
// @UI_CONFIG_END
//
// Batch replacement in script only mode:
// var batchReplacement = [
//   ["SemiBold", "semibold"],
//   ["Regular", "regular"],
//   ["Small", "small"]
// ];
//
// or
// 
// var batchReplacement = [
//   { searchPattern: "SemiBold", replacePattern: "semibold" },
//   { searchPattern: "Regular", replacePattern: "regular" },
//   { searchPattern: "Small", replacePattern: "small" }
// ];

// ========================================
// FUNCTIONS
// ========================================

function parseBatchReplacementString(str) {
  if (!str || typeof str !== 'string') return [];
  var lines = str.split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var comma = line.indexOf(',');
    if (comma === -1) continue;
    var search = line.slice(0, comma).trim();
    var replace = line.slice(comma + 1).trim();
    if (search || replace) out.push([search, replace]);
  }
  return out;
}

/**
 * Is there an actual rename to do?
 *
 * A blank find replaces the **whole** name (Figma's behaviour, added in plan 10), so a blank
 * find plus a blank replacement would wipe every name in scope. That combination is what an
 * unconfigured form looks like — nobody asks for it — so refuse it. A blank find with a real
 * replacement ("set every name to Icon") and a real find with a blank replacement ("delete
 * this substring") are both legitimate and still run.
 */
function hasRenameOperation(find, replace) {
  var f = find == null ? '' : String(find);
  var r = replace == null ? '' : String(replace);
  return f.trim() !== '' || r !== '';
}

// One matcher for every CodeFig find/replace script: see @Pattern Matching.
function getMatchOpts() {
  return {
    useRegex: typeof useRegex !== 'undefined' && useRegex === true,
    matchCase: typeof matchCase !== 'undefined' && matchCase === true
  };
}

function filterBySearchIn(styles, searchInValue) {
  if (!searchInValue || String(searchInValue).trim() === "") {
    return styles;
  }
  var pattern = String(searchInValue).trim();
  var opts = getMatchOpts();
  return styles.filter(function(style) {
    return nameMatches(style.name, pattern, opts);
  });
}

/** Normalise batchReplacement entries (arrays or objects) to { find, replace } operations. */
function toRenameOperations(batchReplacementList, searchForVal, replaceWithVal) {
  var operations = [];
  var op;
  if (batchReplacementList && batchReplacementList.length > 0) {
    for (op = 0; op < batchReplacementList.length; op++) {
      var pair = batchReplacementList[op];
      operations.push({
        find: Array.isArray(pair) ? pair[0] : pair.searchPattern,
        replace: Array.isArray(pair) ? pair[1] : pair.replacePattern
      });
    }
    return operations;
  }
  return [{ find: searchForVal, replace: replaceWithVal }];
}

/**
 * What a run would do, computed without touching anything.
 *
 * The preview and the apply pass both read this, which is the only way they cannot disagree.
 * Batch operations are simulated in sequence against a working copy of the names, because
 * each operation really does see the previous one's output — a preview that ignored that
 * would be lying about the end state.
 *
 * Counters (`$n`) stay positional over the filtered set, exactly as before, so switching to
 * a planned apply changes no names.
 */
function planRenameStyles(styles, operations) {
  var opts = getMatchOpts();
  var entries = [];

  for (var i = 0; i < styles.length; i++) {
    var working = styles[i].name;
    var matched = false;

    for (var op = 0; op < operations.length; op++) {
      var find = operations[op].find;
      var replace = operations[op].replace;
      // A blank find means "replace the whole name", which matches everything by definition.
      var blankFind = find == null || String(find) === '';
      if (!blankFind && !nameMatches(working, find, opts)) continue;
      matched = true;
      working = renameByPattern(working, find, replace, i, styles.length, opts);
    }

    // Only matched styles are worth a row: an untouched name is not a finding, whereas a
    // name that matched and came out identical is exactly what a wrong pattern looks like.
    if (matched) {
      entries.push({ style: styles[i], row: previewRow(styles[i].name, working, styles[i].type) });
    }
  }

  return entries;
}

/** Apply a plan. Rows the plan flagged as unchanged or empty are skipped, as flagged. */
function applyRenamePlan(entries) {
  var count = 0;
  for (var i = 0; i < entries.length; i++) {
    var row = entries[i].row;
    if (!row.changed) {
      if (row.flags.indexOf('empty') !== -1) {
        console.warn('Skipped "' + row.from + '": the replacement would leave an empty name.');
      }
      continue;
    }
    console.log('Renamed: "' + row.from + '" → "' + row.to + '"');
    entries[i].style.name = row.to;
    count++;
  }
  return count;
}

// ========================================
// EXECUTION
// ========================================

getAllStyles().then(async function(allStyles) {
  var searchInVal = typeof searchIn !== 'undefined' ? searchIn : "";
  var filtered = filterBySearchIn(allStyles, searchInVal);
  var totalCount = 0;

  var searchInNote = patternModeNote(searchInVal, getMatchOpts());
  if (searchInNote) console.log('searchIn — ' + searchInNote);
  if (typeof searchFor !== 'undefined') {
    var searchForNote = patternModeNote(searchFor, getMatchOpts());
    if (searchForNote) console.log('searchFor — ' + searchForNote);
  }

  var batchList = typeof batchReplacement !== 'undefined' ? batchReplacement : null;
  if (typeof batchList === 'string' && batchList.trim()) {
    batchList = parseBatchReplacementString(batchList);
  }
  var isBatch = Boolean(batchList && batchList.length > 0);
  if (!isBatch && !(typeof searchFor !== 'undefined' && typeof replaceWith !== 'undefined' &&
                    hasRenameOperation(searchFor, replaceWith))) {
    figma.notify('Configure searchFor and replaceWith, or batchReplacement');
    return;
  }

  if (isBatch) {
    console.log('=== BATCH RENAME STYLES ===');
    console.log('Search in: "' + (searchInVal || '(all)') + '", ' + batchList.length + ' operations, ' + filtered.length + ' styles in scope');
  } else {
    console.log('=== RENAME STYLES ===');
    console.log('Search in: "' + (searchInVal || '(all)') + '", for: "' + searchFor + '", with: "' + replaceWith + '", ' + filtered.length + ' styles in scope');
  }

  var operations = toRenameOperations(batchList, searchFor, replaceWith);
  var entries = planRenameStyles(filtered, operations);
  var rows = entries.map(function (entry) { return entry.row; });

  // Collisions are judged against every style in the file, not just the filtered scope:
  // renaming into a name that exists outside the scope clashes just as hard.
  var existingNames = allStyles.map(function (style) { return style.name; });
  flagPreviewCollisions(rows, existingNames);

  var previewOnlyVal = typeof previewOnly === 'undefined' || previewOnly === true;
  var signature = previewSignature(rows);

  if (previewOnlyVal) {
    logPreviewPlan(rows, { field: 'previewOnly' });
    await savePreviewSignature('rename-styles', signature);
    displayResults(previewPayload('Rename styles', rows));
    figma.notify('Preview: ' + rows.filter(function (r) { return r.changed; }).length + ' style(s) would be renamed. Nothing changed.');
    return;
  }

  var drift = previewDriftMessage(await readPreviewSignature('rename-styles'), signature);
  if (drift) console.warn(drift);

  totalCount = applyRenamePlan(entries);
  if (isBatch) {
    figma.notify('Batch complete: Renamed ' + totalCount + ' styles across ' + batchList.length + ' operations');
  } else {
    figma.notify('Renamed ' + totalCount + ' styles');
  }
});
