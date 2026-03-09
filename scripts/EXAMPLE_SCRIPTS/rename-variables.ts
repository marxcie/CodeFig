// Rename variables
// @DOC_START
// # Rename variables
// Rename variables using the same pattern as batch-rename-styles: searchIn = scope, searchFor/replaceWith = find/replace in variable name.
//
// ## Overview
// searchIn selects which collections/groups to include. searchFor/replaceWith then run on each variable name. Supports Figma-style placeholders: $&, $1 $2, $n $nn $nnn, $N $NN $NNN.
//
// ## searchIn scope rules (scope = "CollectionName / variableName") — like Figma find/replace
// | searchIn | Meaning |
// |----------|--------|
// | (empty) | All variables. |
// | Typography | Prefix: any scope starting with "Typography" (Typography, Typography-serif, ...). |
// | Typography/ | Exact collection only (that collection only). |
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | searchIn | Optional: prefix (e.g. Typography) or exact collection (e.g. Typography/); empty = all. |
// | searchFor | Pattern to find (partial match, literal or regex). |
// | replaceWith | Replacement string; may use placeholders. |
// | batchReplacement | Optional array of [search, replace] pairs; overrides searchFor/replaceWith. |
//
// ## Rename behaviour
// - **searchIn empty**: Replace in the full hierarchy (collection names and variable paths).
// - **searchIn set**: Replace only in what is **within** the scope (variable path inside the matched collection/group; collection name is left unchanged).
// @DOC_END

@import { getAllCollections, getCollectionVariables, getVariable } from "@Variables"
@import { matchPattern, replaceWithPattern } from "@Pattern Matching"

// Fallback when import fails
if (typeof matchPattern !== 'function') {
  var matchPattern = function(text, pattern, options) {
    options = options || {};
    var t = (options.caseSensitive ? text : text.toLowerCase());
    var p = (options.caseSensitive ? pattern : pattern.toLowerCase());
    if (options.exact) return { match: t === p, confidence: t === p ? 1 : 0 };
    return { match: t.indexOf(p) !== -1, confidence: t.indexOf(p) !== -1 ? 1 : 0 };
  };
}
if (typeof replaceWithPattern !== 'function') {
  var escapeWildcards = function(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var applyFigmaPlaceholders = function(replacePattern, context) {
    var r = replacePattern.replace(/\$&/g, context.fullMatch);
    for (var g = 0; g < (context.groups || []).length; g++) {
      r = r.replace(new RegExp('\\$' + (g + 1) + '(?![0-9])', 'g'), context.groups[g] || '');
    }
    var i = context.index, tot = context.total;
    r = r.replace(/\$nnn/g, String(i + 1).padStart(3, '0')).replace(/\$nn/g, String(i + 1).padStart(2, '0')).replace(/\$n(?![nN0-9])/g, String(i + 1));
    r = r.replace(/\$NNN/g, String(tot - i).padStart(3, '0')).replace(/\$NN(?![0-9])/g, String(tot - i).padStart(2, '0')).replace(/\$N(?![nN0-9])/g, String(tot - i));
    return r;
  };
  var looksLikeRegex = function(p) { return /[()[\]{}*+?^$|\\]/.test(p.replace(/\\./g, '')); };
  var replaceWithPattern = function(text, searchPattern, replacePattern, index, total) {
    index = index != null ? index : 0; total = total != null ? total : 1;
    var fullMatch = '', groups = [];
    if (looksLikeRegex(searchPattern)) {
      try {
        var regex = new RegExp(searchPattern, 'g');
        var match = regex.exec(text);
        if (match) {
          fullMatch = match[0]; groups = match.slice(1);
          var replacement = applyFigmaPlaceholders(replacePattern, { fullMatch: fullMatch, groups: groups, index: index, total: total });
          return text.replace(regex, replacement);
        }
      } catch (e) {}
    }
    var escaped = escapeWildcards(searchPattern).replace(/\\\*/g, '.*');
    var literalRegex = new RegExp(escaped, 'gi');
    var match = literalRegex.exec(text);
    if (!match) return text;
    fullMatch = match[0]; groups = match.slice(1);
    var replacement = applyFigmaPlaceholders(replacePattern, { fullMatch: fullMatch, groups: groups, index: index, total: total });
    return text.replace(literalRegex, replacement);
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// @UI_CONFIG_START
// # Batch rename variables
var searchIn = ""; // @placeholder="Typography" — prefix (Typography) or exact collection (Typography/)
// Optional, narrow to variables whose name contains this (e.g. "color/", "Typography/")
//
var searchFor = ""; // @placeholder="50"
var replaceWith = ""; // @placeholder="050"
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

// Build full scope string: "collection name / variable name" (same as Figma hierarchy)
function getScope(collection, variable) {
  return collection.name + " / " + variable.name;
}

/** Same rules as replace-variables: empty = all; trailing / = exact collection; else prefix match (like Figma find/replace). */
function scopeMatchesSearchIn(scope, searchInValue) {
  var val = searchInValue != null ? String(searchInValue).trim() : '';
  if (val === '') return true;
  if (val.slice(-1) === '/') {
    var exact = val.slice(0, -1).trim();
    return exact !== '' && scope.indexOf(exact + ' / ') === 0;
  }
  return scope.indexOf(val) === 0;
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
  var filtered = items.filter(function(item) {
    var scope = getScope(item.collection, item.variable);
    return scopeMatchesSearchIn(scope, searchInValue);
  });
  return filtered;
}

async function renameVariablesSingle(items, searchForVal, replaceWithVal, scopeIsAll) {
  var renamedCount = 0;
  var errors = [];

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
      var newCollName = replaceWithPattern(coll.name, searchForVal, replaceWithVal, cIdx, uniqueCollections.length);
      if (newCollName !== coll.name) {
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
    var newName = replaceWithPattern(variable.name, searchForVal, replaceWithVal, i, items.length);
    if (newName === variable.name) continue;
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
    } else if (typeof searchFor !== 'undefined' && typeof replaceWith !== 'undefined') {
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
