// Rename styles
// @DOC_START
// # Renames local paint, text, effect, and grid styles by search and replace patterns
//
// ## Overview
//
// Applies find/replace to local style names. Use **Search in** to narrow by folder, **Search for**
// and **Replace with** for a single replacement, or **Batch replacement** for many pairs in one
// run. Supports Figma-style placeholders: `$&` (full match), `$1` `$2` (regex groups), `$n`
// `$nn` `$nnn` (ascending), `$N` `$NN` `$NNN` (descending). Matching is case-sensitive.
//
// `$n` / `$N` are positional over the set of matches in that run.
//
// ### Search patterns
//
// | Input | Meaning |
// | --- | --- |
// | text | Matches names containing that text (case-sensitive). |
// | `V4/*/Primary` | `*` matches any characters. |
// | `(\\w+)-(\\d+)` | A regular expression, only when **Use regular expression** is on. |
// | (blank) | Empty **Search in** matches everything; empty **Search for** replaces the entire name. |
//
// Brackets and parens are literal text unless regex mode is on.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Search in**<br>`searchIn` | Optional filter: only styles whose name contains this (for example `color/`, `Typography/*`). Empty searches every style. |
// | **Search for**<br>`searchFor` | Pattern to find in style names. Empty replaces the whole name. |
// | **Replace with**<br>`replaceWith` | Replacement string; may use `$&`, capture groups, and counters. |
// | **Use regular expression**<br>`useRegex` | Treat Search in and Search for as regular expressions rather than plain text with `*` wildcards. |
// | **Batch replacement**<br>`batchReplacement` | Many renames in one run: one pair per line, search then replace after the comma. Overrides Search for and Replace with. |
// @DOC_END

@import { getAllStyles } from "@Core Library"
@import { nameMatches, renameByPattern, patternModeNote } from "@Pattern Matching"
@import { previewRow, flagPreviewCollisions } from "@Rename Preview"

// ========================================
// CONFIGURATION
// ========================================

// @UI_CONFIG_START
var searchIn = "";
var searchFor = "";
var replaceWith = "";
var useRegex = false;
var batchReplacement = "";
// @UI_CONFIG_END

// @PANEL_START
// {
//   "blocks": [
//     {
//       "key": "searchIn",
//       "type": "string",
//       "placeholder": "text/*"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Narrows the rename to styles whose name contains this — `color/`, `V4/*/Primary`. Leave it empty\nto search every style."
//     },
//     {
//       "key": "searchFor",
//       "type": "string",
//       "placeholder": "font-"
//     },
//     {
//       "key": "replaceWith",
//       "type": "string",
//       "placeholder": "text-"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Leave **Search for** empty to replace the whole name. In the replacement, `$&` is the text that\nmatched, `$1` a capture group, `$n` counts up and `$N` counts down."
//     },
//     {
//       "key": "useRegex",
//       "type": "boolean",
//       "label": "Use regular expression"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Reads **Search in** and **Search for** as regular expressions rather than plain text with `*` wildcards."
//     },
//     {
//       "type": "divider"
//     },
//     {
//       "key": "batchReplacement",
//       "type": "textarea"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Many renames in one run: one pair per line, search first, replace after the comma. Overrides\n**Search for** and **Replace with**. No quotes, no trailing commas."
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "```\nSemiBold, semibold\nRegular, regular\nSmall, small\n```"
//     }
//   ]
// }
// @PANEL_END
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
    matchCase: true
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

  totalCount = applyRenamePlan(entries);
  if (isBatch) {
    figma.notify('Batch complete: Renamed ' + totalCount + ' styles across ' + batchList.length + ' operations');
  } else {
    figma.notify('Renamed ' + totalCount + ' styles');
  }
});
