// Rename variables
// @DOC_START
// Rename variables using the same pattern as batch-rename-styles: searchIn = scope, searchFor/replaceWith = find/replace in variable name.
//
// ## Overview
// searchIn selects which collections/groups to include. searchFor/replaceWith then run on each variable name. Supports Figma-style placeholders: $&, $1 $2, $n $nn $nnn, $N $NN $NNN.
//
// ## searchIn scope rules (scope = "Collection/group/variable")
// searchIn is matched against the variable's full path with plain `/` separators, so the
// obvious ways to scope all work:
//
// | searchIn | Matches |
// |----------|--------|
// | (empty) | All variables. |
// | Typography | Anything whose path contains it: the Typography collection, Typography-serif, a nested Typography group. |
// | Typography/ | The Typography collection (and any nested group of that name). |
// | Typography/Body | The Body group inside Typography. |
// | Body | Any group or variable named Body, in any collection. |
// | Typography/*/Size | Wildcard: Size under any group in Typography. |
//
// Matching is case-insensitive unless **Match case** is ticked. Both `Typography/Body` and
// `Typography / Body` work — the separator is normalised on both sides.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | searchIn | Optional scope filter (see above); empty = all variables. |
// | searchFor | Pattern to find in the variable name. |
// | replaceWith | Replacement string; may use the tokens below. |
// | previewOnly | **On by default.** Lists what would change and changes nothing; untick and run again to apply. |
// | matchCase | Match `searchIn` and `searchFor` case-sensitively. |
// | useRegex | Treat both patterns as regular expressions. |
// | batchReplacement | Optional array of [search, replace] pairs; overrides searchFor/replaceWith. |
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
// Previews by default: computes every rename, applies none, and lists them as `old → new` in
// the InfoPanel and the console. Rows use the full `Collection/group/name` path, because a
// variable name is only unique inside its collection — and so is a collision. Untick
// **Preview only** and run again to apply.
//
// ## Rename behaviour
// - **searchIn empty**: Replace in the full hierarchy (collection names and variable paths).
// - **searchIn set**: Replace only in what is **within** the scope (variable path inside the matched collection/group; collection name is left unchanged).
// @DOC_END

@import { getAllCollections, getCollectionVariables, getVariable } from "@Variables"
@import { nameMatches, renameByPattern, patternModeNote } from "@Pattern Matching"
@import { previewRow, flagPreviewCollisions, previewPayload, logPreviewPlan, previewSignature, savePreviewSignature, readPreviewSignature, previewDriftMessage } from "@Rename Preview"
@import { displayResults } from "@InfoPanel"

// ============================================================================
// CONFIGURATION
// ============================================================================

// @UI_CONFIG_START
var searchIn = "";
var searchFor = "";
var replaceWith = "";
var matchCase = false;
var useRegex = false;
var previewOnly = true;
var batchReplacement = "";
// @UI_CONFIG_END

// @PANEL_START
// {
//   "blocks": [
//     {
//       "key": "searchIn",
//       "type": "string",
//       "placeholder": "Typography/Body"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Narrows the rename to one collection, group or path — `Typography/`, `Typography/Body`,\n`Color/*/Accent`. Leave it empty to search every variable."
//     },
//     {
//       "key": "searchFor",
//       "type": "string",
//       "placeholder": "50"
//     },
//     {
//       "key": "replaceWith",
//       "type": "string",
//       "placeholder": "050"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Leave **Search for** empty to replace the whole name. In the replacement, `$&` is the text that\nmatched, `$1` a capture group, `$n` counts up and `$N` counts down."
//     },
//     {
//       "key": "matchCase",
//       "type": "boolean",
//       "label": "Match case"
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
//       "key": "previewOnly",
//       "type": "boolean",
//       "label": "Preview only"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "**On by default.** Lists what would change and touches nothing. Untick and run again to apply."
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
//       "text": "```\n50, 050\n100, 0100\n200, 0200\n```"
//     }
//   ]
// }
// @PANEL_END

// Batch replacement in script only mode:
// var batchReplacement = [
//   ["50", "050"],
//   ["100", "0100"],
//   ["200", "0200"]
// ];
//
// or
// 
// var batchReplacement = [
//   { searchPattern: "50", replacePattern: "050" },
//   { searchPattern: "100", replacePattern: "0100" },
//   { searchPattern: "200", replacePattern: "0200" }
// ];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

// Build full scope string: "collection name / variable name" (same as Figma hierarchy).
// Display form — for logs and error messages, not for matching.
function getScope(collection, variable) {
  return collection.name + " / " + variable.name;
}

/** Collapse " / " to "/" so a path reads the way it is typed. */
function normalizeScopeSeparator(s) {
  return String(s == null ? '' : s).trim().replace(/\s*\/\s*/g, '/');
}

/** The path searchIn matches against: "Collection/group/variable". */
function getScopePath(collection, variable) {
  return normalizeScopeSeparator(collection.name + '/' + variable.name);
}

/**
 * searchIn is a contains match on the scope path, like every other CodeFig find/replace
 * field. It used to be a case-sensitive **prefix** match against the *displayed* scope,
 * whose spaced slash meant the obvious "Typography/Body" matched nothing while the
 * unguessable "Typography / Body" worked. Both work now: the separator is normalised on
 * the pattern too, except in regex mode where the pattern is the user's own syntax.
 */
function scopeMatchesSearchIn(scopePath, searchInValue, opts) {
  var val = searchInValue != null ? String(searchInValue).trim() : '';
  if (val === '') return true;
  var pattern = opts && opts.useRegex ? val : normalizeScopeSeparator(val);
  return nameMatches(scopePath, pattern, opts);
}

// Get (collection, variable) pairs from all collections, then filter by searchIn.
async function getVariablesInScope(searchInValue) {
  var collections = await getAllCollections();
  var items = [];
  var i, c, vars, v;
  for (i = 0; i < collections.length; i++) {
    c = collections[i];
    vars = await getCollectionVariables(c);
    for (var j = 0; j < vars.length; j++) {
      v = vars[j];
      items.push({ collection: c, variable: v });
    }
  }

  if (!searchInValue || String(searchInValue).trim() === "") {
    return items;
  }
  var opts = getMatchOpts();
  var filtered = items.filter(function(item) {
    return scopeMatchesSearchIn(getScopePath(item.collection, item.variable), searchInValue, opts);
  });
  return filtered;
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

/** Run one name through every operation in sequence; '' means no operation matched. */
function applyOperationsToName(name, operations, index, total, opts) {
  var working = name;
  var matched = false;
  for (var op = 0; op < operations.length; op++) {
    var find = operations[op].find;
    var blankFind = find == null || String(find) === '';
    if (!blankFind && !nameMatches(working, find, opts)) continue;
    matched = true;
    working = renameByPattern(working, find, operations[op].replace, index, total, opts);
  }
  return matched ? working : null;
}

/**
 * What a run would do, computed without touching anything — the single source both the
 * preview and the apply pass read, so they cannot disagree.
 *
 * Rows are keyed by the **scope path** (`Collection/group/name`) rather than the bare variable
 * name, because a variable name is only unique within its collection: two collections may
 * legitimately hold the same name, and collision detection has to know the difference.
 *
 * Collection renames are planned too when the scope is everything, matching the old behaviour.
 */
function planRenameVariables(items, operations, scopeIsAll) {
  var opts = getMatchOpts();
  var entries = [];
  var i;

  if (scopeIsAll) {
    var seen = {};
    var collections = [];
    for (i = 0; i < items.length; i++) {
      var c = items[i].collection;
      if (!seen[c.id]) {
        seen[c.id] = true;
        collections.push(c);
      }
    }
    for (i = 0; i < collections.length; i++) {
      var newCollName = applyOperationsToName(collections[i].name, operations, i, collections.length, opts);
      if (newCollName === null) continue;
      entries.push({
        kind: 'collection',
        collection: collections[i],
        newName: newCollName,
        row: previewRow(collections[i].name, newCollName, 'collection')
      });
    }
  }

  for (i = 0; i < items.length; i++) {
    var variable = items[i].variable;
    var collection = items[i].collection;
    var newName = applyOperationsToName(variable.name, operations, i, items.length, opts);
    if (newName === null) continue;
    var row = previewRow(
      getScopePath(collection, variable),
      normalizeScopeSeparator(collection.name + '/' + newName),
      collection.name
    );
    // The row is qualified so collisions are judged per collection — but that hides an empty
    // *variable* name, since "Typography/" reads as a perfectly good path. Check the name the
    // apply pass would actually write. Without this, an emptying replacement looks like a
    // legitimate change and gets applied, which is the data-loss shape hasRenameOperation
    // already guards at the config level.
    if (String(newName).trim() === '') {
      row.changed = false;
      if (row.flags.indexOf('empty') === -1) row.flags.push('empty');
    }
    entries.push({
      kind: 'variable',
      collection: collection,
      variable: variable,
      newName: newName,
      row: row
    });
  }

  return entries;
}

/** Every existing name, in the same qualified form the plan's rows use. */
function existingVariableNames(items) {
  var names = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    names.push(getScopePath(items[i].collection, items[i].variable));
    var c = items[i].collection;
    if (!seen[c.id]) {
      seen[c.id] = true;
      names.push(c.name);
    }
  }
  return names;
}

/** Apply a plan. Rows flagged unchanged or empty are skipped, as flagged. */
async function applyRenameVariablesPlan(entries) {
  var renamedCount = 0;
  var errors = [];

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var row = entry.row;
    if (!row.changed) {
      if (row.flags.indexOf('empty') !== -1) {
        errors.push(row.from + ': the replacement would leave an empty name');
      }
      continue;
    }

    if (entry.kind === 'collection') {
      try {
        console.log('Renamed collection: "' + entry.collection.name + '" → "' + entry.newName + '"');
        entry.collection.name = entry.newName;
        renamedCount++;
      } catch (e) {
        errors.push('Collection "' + entry.collection.name + '": ' + e.message);
      }
      continue;
    }

    try {
      // Re-check against the live document: the plan flagged collisions it could see, but
      // only Figma knows whether the name is free at the moment of writing.
      var existing = await getVariable(entry.collection, entry.newName);
      if (existing && existing.id !== entry.variable.id) {
        errors.push('Name already exists: ' + getScope(entry.collection, { name: entry.newName }));
        continue;
      }
      console.log('Renamed: "' + row.from + '" → "' + entry.newName + '"');
      entry.variable.name = entry.newName;
      renamedCount++;
    } catch (e) {
      errors.push(row.from + ': ' + e.message);
    }
  }

  return { renamedCount: renamedCount, errors: errors };
}

// ============================================================================
// MAIN
// ============================================================================

(async function() {
  try {
    console.log('Batch Rename Variables');
    console.log('========================');

    var searchInVal = typeof searchIn !== 'undefined' ? searchIn : "";
    var searchInNote = patternModeNote(searchInVal, getMatchOpts());
    if (searchInNote) console.log('searchIn — ' + searchInNote);
    if (typeof searchFor !== 'undefined') {
      var searchForNote = patternModeNote(searchFor, getMatchOpts());
      if (searchForNote) console.log('searchFor — ' + searchForNote);
    }
    var items = await getVariablesInScope(searchInVal);

    var sorted = items.slice().sort(function(a, b) {
      return getScope(a.collection, a.variable).localeCompare(getScope(b.collection, b.variable));
    });

    if (sorted.length === 0) {
      figma.notify('No variables in scope (check searchIn in figma-console.log)');
      return;
    }

    var scopeIsAll = !searchInVal || String(searchInVal).trim() === "";

    var batchList = typeof batchReplacement !== 'undefined' ? batchReplacement : null;
    if (typeof batchList === 'string' && batchList.trim()) {
      batchList = parseBatchReplacementString(batchList);
    }

    var isBatch = Boolean(batchList && batchList.length > 0);
    if (isBatch) {
      console.log('[Batch rename variables] Mode: batch (' + batchList.length + ' operations)');
    } else if (typeof searchFor !== 'undefined' && typeof replaceWith !== 'undefined' &&
               hasRenameOperation(searchFor, replaceWith)) {
      console.log('[Batch rename variables] Mode: single, searchFor="' + searchFor + '", replaceWith="' + replaceWith + '"');
    } else {
      figma.notify('Configure searchFor and replaceWith, or batch replacement lines');
      return;
    }

    var operations = toRenameOperations(batchList, searchFor, replaceWith);
    var entries = planRenameVariables(sorted, operations, scopeIsAll);
    var rows = entries.map(function (entry) { return entry.row; });
    // Collisions are judged over every variable in the file, in the same qualified form the
    // rows use — a name is only unique within its collection.
    flagPreviewCollisions(rows, existingVariableNames(items));

    var previewOnlyVal = typeof previewOnly === 'undefined' || previewOnly === true;
    var signature = previewSignature(rows);

    if (previewOnlyVal) {
      logPreviewPlan(rows, { field: 'previewOnly' });
      await savePreviewSignature('rename-variables', signature);
      displayResults(previewPayload('Rename variables', rows));
      figma.notify(
        'Preview: ' + rows.filter(function (r) { return r.changed; }).length +
          ' name(s) would change. Nothing changed.'
      );
      return;
    }

    var drift = previewDriftMessage(await readPreviewSignature('rename-variables'), signature);
    if (drift) console.warn(drift);

    var result = await applyRenameVariablesPlan(entries);
    var totalRenamed = result.renamedCount;
    var errors = result.errors;

    if (errors.length > 0) {
      errors.forEach(function(e) { console.log('Error: ' + e); });
    }
    if (totalRenamed > 0) {
      figma.notify('Renamed ' + totalRenamed + ' variables');
    } else {
      figma.notify('No variables were renamed');
    }
  } catch (error) {
    console.log('Script error: ' + error.message);
    figma.notify('Script error: ' + error.message);
  }
})();
