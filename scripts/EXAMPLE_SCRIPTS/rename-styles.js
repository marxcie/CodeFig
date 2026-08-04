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
// ## Examples
// Simple: searchFor = "font-", replaceWith = "text-"
// With filter: searchIn = "color/", searchFor = "pine", replaceWith = "Pine"
// Wildcard filter: searchIn = "V4/*/Primary", searchFor = "V4", replaceWith = "V5"
// Regex + numbering: useRegex = true, searchFor = "(\\w+)-(\\d+)", replaceWith = "$1-$2-$nn"
// Batch: batchReplacement = [["LG","XL"], ["MD","LG"], ["SM","MD"]]
// @DOC_END

@import { getAllStyles } from "@Core Library"
@import { nameMatches, renameByPattern, patternModeNote } from "@Pattern Matching"

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

function renameStylesSingle(styles, searchForVal, replaceWithVal) {
  var count = 0;
  var opts = getMatchOpts();
  for (var i = 0; i < styles.length; i++) {
    var style = styles[i];
    var newName = renameByPattern(style.name, searchForVal, replaceWithVal, i, styles.length, opts);
    if (newName !== style.name) {
      // Never rename something to nothing: a name is how it is found again.
      if (newName.trim() === '') {
        console.warn('Skipped "' + style.name + '": the replacement would leave an empty name.');
        continue;
      }
      console.log('Renamed: "' + style.name + '" → "' + newName + '"');
      style.name = newName;
      count++;
    }
  }
  return count;
}

function renameStylesBatch(styles, batchReplacementList) {
  var totalCount = 0;
  for (var op = 0; op < batchReplacementList.length; op++) {
    var pair = batchReplacementList[op];
    var search = Array.isArray(pair) ? pair[0] : pair.searchPattern;
    var replace = Array.isArray(pair) ? pair[1] : pair.replacePattern;
    console.log('--- Batch op ' + (op + 1) + ': "' + search + '" → "' + replace + '"');
    var count = renameStylesSingle(styles, search, replace);
    totalCount += count;
    console.log('Changed: ' + count + ' styles');
  }
  return totalCount;
}

// ========================================
// EXECUTION
// ========================================

getAllStyles().then(function(allStyles) {
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
  if (batchList && batchList.length > 0) {
    console.log('=== BATCH RENAME STYLES ===');
    console.log('Search in: "' + (searchInVal || '(all)') + '", ' + batchList.length + ' operations, ' + filtered.length + ' styles to process');
    totalCount = renameStylesBatch(filtered, batchList);
    figma.notify('Batch complete: Renamed ' + totalCount + ' styles across ' + batchList.length + ' operations');
  } else if (typeof searchFor !== 'undefined' && typeof replaceWith !== 'undefined' &&
             hasRenameOperation(searchFor, replaceWith)) {
    console.log('=== RENAME STYLES ===');
    console.log('Search in: "' + (searchInVal || '(all)') + '", for: "' + searchFor + '", with: "' + replaceWith + '", ' + filtered.length + ' styles to process');
    totalCount = renameStylesSingle(filtered, searchFor, replaceWith);
    figma.notify('Renamed ' + totalCount + ' styles');
  } else {
    figma.notify('Configure searchFor and replaceWith, or batchReplacement');
  }
});
