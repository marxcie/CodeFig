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
// | searchIn | Optional filter: only styles whose name contains this (e.g. "color/", "Typography/"). |
// | searchFor | Pattern to find in style names (literal or regex if pattern contains regex chars). |
// | replaceWith | Replacement string; may use placeholders above. |
// | batchReplacement | Optional array of [search, replace] pairs; if set, overrides searchFor/replaceWith. |
//
// ## Examples
// Simple: searchFor = "font-", replaceWith = "text-"
// With filter: searchIn = "color/", searchFor = "pine", replaceWith = "Pine"
// Regex + numbering: searchFor = "(\\w+)-(\\d+)", replaceWith = "$1-$2-$nn"
// Batch: batchReplacement = [["LG","XL"], ["MD","LG"], ["SM","MD"]]
// @DOC_END

@import { getAllStyles } from "@Core Library"
@import { matchPattern, replaceWithPattern } from "@Pattern Matching"

// ========================================
// CONFIGURATION
// ========================================

// @UI_CONFIG_START
// # Batch rename styles
var searchIn = ""; // @placeholder="text/"
// Optional, narrow to styles whose name contains this (e.g. "color/", "Typography/")
//
var searchFor = ""; // @placeholder="font-"
var replaceWith = ""; // @placeholder="text-"
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

function filterBySearchIn(styles, searchInValue) {
  if (!searchInValue || String(searchInValue).trim() === "") {
    return styles;
  }
  var pattern = String(searchInValue).trim();
  var filtered = styles.filter(function(style) {
    var result = matchPattern(style.name, pattern, { exact: false, caseSensitive: false });
    return result && result.match;
  });
  return filtered;
}

function renameStylesSingle(styles, searchForVal, replaceWithVal) {
  var count = 0;
  for (var i = 0; i < styles.length; i++) {
    var style = styles[i];
    var newName = replaceWithPattern(style.name, searchForVal, replaceWithVal, i, styles.length);
    if (newName !== style.name) {
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

  var batchList = typeof batchReplacement !== 'undefined' ? batchReplacement : null;
  if (typeof batchList === 'string' && batchList.trim()) {
    batchList = parseBatchReplacementString(batchList);
  }
  if (batchList && batchList.length > 0) {
    console.log('=== BATCH RENAME STYLES ===');
    console.log('Search in: "' + (searchInVal || '(all)') + '", ' + batchList.length + ' operations, ' + filtered.length + ' styles to process');
    totalCount = renameStylesBatch(filtered, batchList);
    figma.notify('Batch complete: Renamed ' + totalCount + ' styles across ' + batchList.length + ' operations');
  } else if (typeof searchFor !== 'undefined' && typeof replaceWith !== 'undefined') {
    console.log('=== RENAME STYLES ===');
    console.log('Search in: "' + (searchInVal || '(all)') + '", for: "' + searchFor + '", with: "' + replaceWith + '", ' + filtered.length + ' styles to process');
    totalCount = renameStylesSingle(filtered, searchFor, replaceWith);
    figma.notify('Renamed ' + totalCount + ' styles');
  } else {
    figma.notify('Configure searchFor and replaceWith, or batchReplacement');
  }
});
