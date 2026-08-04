// Rename variables
// @DOC_START
// # Rename variables
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
// ## Rename behaviour
// - **searchIn empty**: Replace in the full hierarchy (collection names and variable paths).
// - **searchIn set**: Replace only in what is **within** the scope (variable path inside the matched collection/group; collection name is left unchanged).
// @DOC_END

@import { getAllCollections, getCollectionVariables, getVariable } from "@Variables"
@import { nameMatches, renameByPattern, patternModeNote } from "@Pattern Matching"

// ============================================================================
// CONFIGURATION
// ============================================================================

// @UI_CONFIG_START
// # Batch rename variables
var searchIn = ""; // @placeholder="Typography/Body"
// Optional scope: collection, group, or path (e.g. "Typography/", "Typography/Body", "Color/*/Accent")
//
var searchFor = ""; // @placeholder="50"
var replaceWith = ""; // @placeholder="050"
// Leave searchFor empty to replace the whole name. Tokens: $& $1 $n $nn $nnn $N $NN $NNN
//
var matchCase = false; // @label: Match case
var useRegex = false; // @label: Use regular expression
// Treat searchIn and searchFor as regular expressions instead of literal text with `*` wildcards.
// ---
var batchReplacement = ""; // @textarea
// Batch replacement: one line per pair, "search, replace" (overrides searchFor/replaceWith when non-empty)
// **Example:**
// "50, 050",
// "100, 0100",
// "200, 0200",
// @UI_CONFIG_END

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

async function renameVariablesSingle(items, searchForVal, replaceWithVal, scopeIsAll) {
  var renamedCount = 0;
  var errors = [];
  var opts = getMatchOpts();

  if (scopeIsAll) {
    var seenCollectionIds = {};
    var uniqueCollections = [];
    for (var k = 0; k < items.length; k++) {
      var c = items[k].collection;
      if (!seenCollectionIds[c.id]) {
        seenCollectionIds[c.id] = true;
        uniqueCollections.push(c);
      }
    }
    for (var cIdx = 0; cIdx < uniqueCollections.length; cIdx++) {
      var coll = uniqueCollections[cIdx];
      var newCollName = renameByPattern(coll.name, searchForVal, replaceWithVal, cIdx, uniqueCollections.length, opts);
      if (newCollName !== coll.name) {
        if (newCollName.trim() === '') {
          console.warn('Skipped collection "' + coll.name + '": the replacement would leave an empty name.');
          continue;
        }
        try {
          var oldCollName = coll.name;
          coll.name = newCollName;
          console.log('Renamed collection: "' + oldCollName + '" → "' + newCollName + '"');
          renamedCount++;
        } catch (e) {
          errors.push('Collection "' + coll.name + '": ' + e.message);
        }
      }
    }
  }

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var variable = item.variable;
    var collection = item.collection;
    var newName = renameByPattern(variable.name, searchForVal, replaceWithVal, i, items.length, opts);
    if (newName === variable.name) continue;
    // Never rename something to nothing: a name is how it is found again.
    if (newName.trim() === '') {
      errors.push(getScope(collection, variable) + ': the replacement would leave an empty name');
      continue;
    }
    try {
      var existing = await getVariable(collection, newName);
      if (existing && existing.id !== variable.id) {
        errors.push('Name already exists: ' + getScope(collection, { name: newName }));
        continue;
      }
      var oldName = variable.name;
      variable.name = newName;
      console.log('Renamed: "' + getScope(collection, { name: oldName }) + '" → "' + newName + '"');
      renamedCount++;
    } catch (e) {
      errors.push(getScope(collection, variable) + ': ' + e.message);
    }
  }
  return { renamedCount: renamedCount, errors: errors };
}

async function renameVariablesBatch(items, batchReplacementList, scopeIsAll) {
  var totalRenamed = 0;
  var allErrors = [];
  for (var op = 0; op < batchReplacementList.length; op++) {
    var pair = batchReplacementList[op];
    var search = Array.isArray(pair) ? pair[0] : pair.searchPattern;
    var replace = Array.isArray(pair) ? pair[1] : pair.replacePattern;
    console.log('--- Batch op ' + (op + 1) + ': "' + search + '" → "' + replace + '"');
    var result = await renameVariablesSingle(items, search, replace, scopeIsAll);
    totalRenamed += result.renamedCount;
    allErrors = allErrors.concat(result.errors);
  }
  return { renamedCount: totalRenamed, errors: allErrors };
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

    var totalRenamed = 0;
    var errors = [];

    if (batchList && batchList.length > 0) {
      console.log('[Batch rename variables] Mode: batch (' + batchList.length + ' operations)');
      var batchResult = await renameVariablesBatch(sorted, batchList, scopeIsAll);
      totalRenamed = batchResult.renamedCount;
      errors = batchResult.errors;
    } else if (typeof searchFor !== 'undefined' && typeof replaceWith !== 'undefined' &&
               hasRenameOperation(searchFor, replaceWith)) {
      console.log('[Batch rename variables] Mode: single, searchFor="' + searchFor + '", replaceWith="' + replaceWith + '"');
      var singleResult = await renameVariablesSingle(sorted, searchFor, replaceWith, scopeIsAll);
      totalRenamed = singleResult.renamedCount;
      errors = singleResult.errors;
    } else {
      figma.notify('Configure searchFor and replaceWith, or batch replacement lines');
      return;
    }

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
