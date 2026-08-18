// Replace variables
// @DOC_START
// Replaces variable bindings on layers and/or in the **variables table**: choose scope, source/target collection (dropdowns), and find/replace on variable path (groups + variable name). Rebinds to a different variable; does not rename variable definitions.
//
// **Style vs native:** On layers, bindings that come from an applied **text**, **color (fill)**, **stroke**, or **effect** style are **not** replaced—only **native** bindings on the layer are updated.
//
// ## Overview
// **Scope:** **selection** — layer bindings under the current selection. **variablesCollection** — alias values inside local variable definitions (`valuesByMode`, all modes). **both** — layers (when something is selected) plus the variables table. Use **variablesCollection** or **both** after pasting a file to fix variable-to-variable links that still point at the source file.
//
// **Collections:** Source collection = which **referenced** bindings to consider (empty = all collections and modes). Target collection = where to look up the replacement variable (empty = same collection as source, then any). **Path find/replace:** Applied to the variable path (e.g. "color 2 / red" → find "color 2", replace "color 1" → "color 1 / red"). Supports same-collection group swap and cross-collection replacement.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | rebindScope | **selection**, **variablesCollection**, or **both**. |
// | sourceCollection | Limit to bindings whose referenced variable is from this collection; empty = all collections. |
// | targetCollection | Look up replacement variable in this collection; empty = same as source, then any. |
// | searchFor / replaceWith | Find/replace applied to variable path (collection + variable). |
// | previewOnly | **On by default.** Lists the bindings that would be rebound and changes nothing; untick and run again to apply. |
// | matchCase | Match `searchFor` case-sensitively. |
// | useRegex | Treat `searchFor` as a regular expression. |
// | batchReplacement | Multiple "search, replace" lines; overrides searchFor/replaceWith. |
// | **Replace-all (path)** | When **both** source + target are set and search/replace empty: replace the **source collection name** substring with the **target** in the full path (rename in path, not “same token → lookup by name”). |
// | **Remap by name (automatic)** | When **target** is set, **source** can be empty (all collections), and search/replace/batch are **empty**—bindings are rebound to the variable with the **same name** in the target collection (typical: paste from another file → point at local tokens). Works on layer bindings and variable-table aliases. Unresolved / missing variable IDs are counted; Figma does not expose names for those, so they cannot be remapped automatically. |
//
// ## Preview first
// Previews by default. Every write in the script is guarded, so the preview runs the same
// traversal — same matching, same cache, same replacement lookup — with the writes switched
// off, and lists each binding as `SourceCollection/name → TargetCollection/name` against the
// node and property it belongs to. Untick **Preview only** and run again to apply.
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
// Patterns are matched against the path with plain `/` separators (`Color/red`, not
// `Color / red`), and `searchFor` now supports `*` — a variable whose name contains a
// literal asterisk needs regex mode and `\*`.
//
// ## Replacement tokens
// | Token | Meaning |
// |-------|---------|
// | `$&` | The whole match |
// | `$1` `$2` | Capture groups (regex mode only) |
// | `$n` `$nn` `$nnn` | Ascending counter (1, 01, 001) |
// | `$N` `$NN` `$NNN` | Descending counter |
//
// The counters are **not** useful here: this script rewrites a path to look up an existing
// target variable, so it walks bindings rather than an ordered list and `$n` is always 1.
// @DOC_END

@import { nameMatches, renameByPattern, patternModeNote } from "@Pattern Matching"
@import { previewRowsFromPlan, previewWouldWrite, previewRecord, previewPayload, logPreviewPlan, previewSignature, savePreviewSignature, readPreviewSignature, previewDriftMessage } from "@Rename Preview"
@import { displayResults } from "@InfoPanel"

// ========================================
// CONFIGURATION
// ========================================

// @UI_CONFIG_START
var rebindScope = "selection"; // @options: selection|variablesCollection|both @radio
//
var sourceCollection = ""; // @options: variableCollections
var searchFor = ""; // @placeholder="color 2/*"
// Optional, only rebind when current variable name contains this (e.g. "color 1"")
// ---
var targetCollection = ""; // @options: variableCollections
var replaceWith = ""; // @placeholder="color 1"
// Optional, replace with this variable name (e.g. "color 2")
//
var matchCase = false; // @label: Match case
var useRegex = false; // @label: Use regular expression
// Treat searchFor as a regular expression instead of literal text with `*` wildcards.
//
var previewOnly = true; // @label: Preview only
// **On by default.** Lists the bindings that would be rebound and changes nothing. Untick and run again to apply.
// ---
var batchReplacement = ""; // @textarea
// Batch: one line per pair. "search to replace" or "search, replace" (overrides searchFor/replaceWith)
// **Example:**
// color 2, color 1,
// red, blue
// @UI_CONFIG_END
//
// Batch replacement in script only mode:
// var batchReplacement = [
//   ["color 2", "color 1"],
//   ["red", "blue"],
//   ["50", "050"]
// ];
//
// or
//
// var batchReplacement = [
//   { searchPattern: "color 2", replacePattern: "color 1" },
//   { searchPattern: "red", replacePattern: "blue" },
//   { searchPattern: "50", replacePattern: "050" }
// ];

function getScope(collectionName, variableName) {
  return (collectionName || '') + " / " + (variableName || '');
}

/** If sourceCollection is set, only consider bindings from that collection. */
function bindingInSourceCollection(currentCollectionName, sourceCollectionVal) {
  var s = sourceCollectionVal != null ? String(sourceCollectionVal).trim() : '';
  if (s === '') return true;
  return currentCollectionName === s;
}

/** Resolve a VARIABLE_ALIAS object to a Variable (local id or library key). */
async function resolveVariableFromAlias(alias) {
  if (!alias) return null;
  if (typeof alias.id === 'string') {
    try {
      return await figma.variables.getVariableByIdAsync(alias.id);
    } catch (e) {
      return null;
    }
  }
  if (typeof alias.key === 'string') {
    try {
      return await figma.variables.importVariableByKeyAsync(alias.key);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function isVariableAliasValue(value) {
  return value != null && typeof value === 'object' && value.type === 'VARIABLE_ALIAS' &&
    (typeof value.id === 'string' || typeof value.key === 'string');
}

function parseBatchReplacementString(str) {
  if (!str || typeof str !== 'string') return [];
  var lines = str.split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var search = '';
    var replace = '';
    var toIdx = line.indexOf(' to ');
    var arrowIdx = line.indexOf(' → ');
    if (toIdx !== -1 || arrowIdx !== -1) {
      var delim = (arrowIdx !== -1 && (toIdx === -1 || arrowIdx < toIdx)) ? ' → ' : ' to ';
      var idx = line.indexOf(delim);
      search = line.slice(0, idx).trim();
      replace = line.slice(idx + delim.length).trim();
    } else {
      var comma = line.indexOf(',');
      if (comma === -1) continue;
      search = line.slice(0, comma).trim();
      replace = line.slice(comma + 1).trim();
    }
    if (search || replace) out.push([search, replace]);
  }
  return out;
}

function findVariableInTargetByName(variableCache, targetCollectionName, variableName, resolvedType) {
  var wantName = normalizeVariablePath(variableName);
  var wantScope = normalizeVariablePath(getScope(targetCollectionName, variableName));
  var match = null;
  variableCache.forEach(function(info) {
    if (info.collectionName !== targetCollectionName) return;
    if (normalizeVariablePath(info.name) !== wantName) return;
    if (resolvedType && info.variable && info.variable.resolvedType !== resolvedType) return;
    match = info;
  });
  if (match) return match;
  variableCache.forEach(function(info) {
    if (normalizeVariablePath(getScope(info.collectionName, info.name)) !== wantScope) return;
    if (resolvedType && info.variable && info.variable.resolvedType !== resolvedType) return;
    match = info;
  });
  return match;
}

function buildReplacementsFromConfig(sourceCollectionVal, targetCollectionVal) {
  var batch = typeof batchReplacement !== 'undefined' ? batchReplacement : null;
  if (typeof batch === 'string' && batch.trim()) {
    batch = parseBatchReplacementString(batch);
  }
  if (batch && Array.isArray(batch) && batch.length > 0) {
    var list = [];
    for (var i = 0; i < batch.length; i++) {
      var pair = batch[i];
      var from = Array.isArray(pair) ? pair[0] : (pair.searchPattern != null ? pair.searchPattern : '');
      var to = Array.isArray(pair) ? pair[1] : (pair.replacePattern != null ? pair.replacePattern : '');
      list.push({ find: from, replace: to });
    }
    return list;
  }
  var searchForVal = typeof searchFor !== 'undefined' ? searchFor : '';
  var replaceWithVal = typeof replaceWith !== 'undefined' ? replaceWith : '';
  if (searchForVal || replaceWithVal) {
    return [{ find: searchForVal, replace: replaceWithVal }];
  }
  // Replace-all mode: source + target set, no search/replace = swap collection for all variables
  sourceCollectionVal = sourceCollectionVal != null ? String(sourceCollectionVal).trim() : '';
  targetCollectionVal = targetCollectionVal != null ? String(targetCollectionVal).trim() : '';
  if (sourceCollectionVal && targetCollectionVal) {
    return [{ find: sourceCollectionVal, replace: targetCollectionVal }];
  }
  return [];
}

// One matcher for every CodeFig find/replace script: see @Pattern Matching. This script used
// to carry its own escape-and-replace pair, which deliberately escaped `*` — so wildcards
// worked in the style scripts and not here.
/** The path a variable is known by, for preview rows. */
async function rvVariablePath(variable) {
  if (!variable) return '(none)';
  try {
    var collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    return normalizeVariablePath(getScope(collection ? collection.name : '', variable.name));
  } catch (e) {
    return variable.name;
  }
}

function getMatchOpts() {
  return {
    useRegex: typeof useRegex !== 'undefined' && useRegex === true,
    matchCase: typeof matchCase !== 'undefined' && matchCase === true
  };
}

/**
 * A find pattern as it should be matched against a normalised path. Outside regex mode the
 * separator is normalised the same way the path is, so "Color / red" and "Color/red" agree;
 * in regex mode the pattern is left exactly as the user wrote it.
 */
function findPatternForPath(find, opts) {
  var raw = find == null ? '' : String(find);
  return opts && opts.useRegex ? raw.trim() : normalizeVariablePath(raw);
}

// Collect all nodes recursively
function collectAllNodes(nodes) {
  var result = [];
  function traverse(node) {
    result.push(node);
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        traverse(node.children[i]);
      }
    }
  }
  for (var i = 0; i < nodes.length; i++) {
    traverse(nodes[i]);
  }
  return result;
}

/** Normalize variable path for comparison: collapse spaces around slashes so "color 1 / red" and "color 1/red" match. */
function normalizeVariablePath(s) {
  if (s == null || typeof s !== 'string') return '';
  return s.trim().replace(/\s*\/\s*/g, '/');
}

/** Parse full path "collection / variable" or "collection/variable" into { collectionName, variableName }. */
function parseFullPath(fullPath) {
  var s = String(fullPath || '').trim();
  var sep = ' / ';
  var idx = s.indexOf(sep);
  if (idx !== -1) {
    return { collectionName: s.slice(0, idx).trim(), variableName: s.slice(idx + sep.length).trim() };
  }
  var slashIdx = s.indexOf('/');
  if (slashIdx !== -1) {
    return { collectionName: s.slice(0, slashIdx).trim(), variableName: s.slice(slashIdx + 1).trim() };
  }
  return { collectionName: '', variableName: s };
}

/** On-demand: search connected library collections for a variable by collection+name (not in cache). */
async function findLibraryVariableByNameAsync(collectionName, variableName, variableCache, resolvedType) {
  if (!figma.teamLibrary || typeof figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync !== 'function') {
    return null;
  }
  try {
    var collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    var wantNorm = normalizeVariablePath(getScope(collectionName, variableName));
    var wantName = normalizeVariablePath(variableName);
    var wantCollection = normalizeVariablePath(collectionName);
    var maxCollections = 15;
    for (var c = 0; c < Math.min(collections.length, maxCollections); c++) {
      var libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collections[c].key);
      var libColNorm = normalizeVariablePath(collections[c].name);
      for (var v = 0; v < libVars.length; v++) {
        var lib = libVars[v];
        var libScope = normalizeVariablePath(getScope(collections[c].name, lib.name));
        var libNameNorm = normalizeVariablePath(lib.name);
        var fullMatch = libScope === wantNorm;
        var nameMatch = libNameNorm === wantName && (wantCollection === '' || libColNorm === wantCollection);
        if (fullMatch || nameMatch) {
          var imported = await figma.variables.importVariableByKeyAsync(lib.key);
          if (imported && resolvedType && imported.resolvedType !== resolvedType) continue;
          if (imported && variableCache) {
            var scopeKey = getScope(collections[c].name, lib.name);
            variableCache.set(scopeKey, { id: imported.id, variable: imported, collectionName: collections[c].name, name: imported.name, isLibrary: true });
          }
          return imported;
        }
      }
    }
  } catch (e) {
    console.log('⚠️ Library variable lookup failed: ' + (e && e.message));
  }
  return null;
}

/** Properties that support setBoundVariable. layoutGrids and similar are NOT supported. */
var SUPPORTED_BOUND_PROPERTIES = {
  height: 1, width: 1, minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1,
  itemSpacing: 1, paddingLeft: 1, paddingRight: 1, paddingTop: 1, paddingBottom: 1,
  counterAxisSpacing: 1, gridRowGap: 1, gridColumnGap: 1, paragraphSpacing: 1, paragraphIndent: 1,
  cornerRadius: 1, topLeftRadius: 1, topRightRadius: 1, bottomLeftRadius: 1, bottomRightRadius: 1,
  strokeWeight: 1, strokeTopWeight: 1, strokeBottomWeight: 1, strokeLeftWeight: 1, strokeRightWeight: 1,
  characters: 1, fontFamily: 1, fontSize: 1, fontStyle: 1, fontWeight: 1, letterSpacing: 1, lineHeight: 1,
  visible: 1, opacity: 1
};

/** Extract variable id from a style binding entry (alias object or nested). */
function bindingEntryVariableId(entry) {
  if (!entry) return null;
  if (typeof entry.id === 'string') return entry.id;
  if (entry.color && typeof entry.color.id === 'string') return entry.color.id;
  if (Array.isArray(entry) && entry[0]) return bindingEntryVariableId(entry[0]);
  return null;
}

/** True if any entry in the list at slotIndex (or whole list if null) matches variableId. */
function stylePaintSlotMatchesVariable(paintsOrStrokes, slotIndex, variableId) {
  if (!variableId || !paintsOrStrokes) return false;
  var arr = Array.isArray(paintsOrStrokes) ? paintsOrStrokes : [paintsOrStrokes];
  if (slotIndex != null && slotIndex >= 0) {
    if (slotIndex < arr.length) {
      var id = bindingEntryVariableId(arr[slotIndex]);
      return id === variableId;
    }
    return false;
  }
  for (var i = 0; i < arr.length; i++) {
    if (bindingEntryVariableId(arr[i]) === variableId) return true;
  }
  return false;
}

/** Typography / text-style-bound fields: variable is from style if applied text style defines it (whole node or per-segment). */
async function isTextTypographyFromStyle(node, property, variableId) {
  var textProps = {
    fontSize: 1, fontWeight: 1, lineHeight: 1, letterSpacing: 1, fontFamily: 1,
    paragraphSpacing: 1, paragraphIndent: 1, fontStyle: 1
  };
  if (!textProps[property] || node.type !== 'TEXT' || !variableId) return false;
  async function styleDefinesVariable(styleId) {
    if (!styleId || styleId === figma.mixed) return false;
    try {
      var style = await figma.getStyleByIdAsync(styleId);
      if (!style || !style.boundVariables) return false;
      var b = style.boundVariables[property];
      if (!b) return false;
      var bid = bindingEntryVariableId(Array.isArray(b) ? b[0] : b) || (typeof b.id === 'string' ? b.id : null);
      if (bid === variableId) return true;
      if (Array.isArray(b)) {
        for (var i = 0; i < b.length; i++) {
          if (bindingEntryVariableId(b[i]) === variableId) return true;
        }
      }
    } catch (e) { }
    return false;
  }
  if (node.textStyleId && node.textStyleId !== figma.mixed) {
    if (await styleDefinesVariable(node.textStyleId)) return true;
  }
  try {
    var segments = node.getStyledTextSegments(['textStyleId']);
    for (var s = 0; s < segments.length; s++) {
      if (await styleDefinesVariable(segments[s].textStyleId)) return true;
    }
  } catch (e) { }
  return false;
}

/**
 * True if this binding is driven by an applied library/document style (skip replacement).
 * bindIndex: for fills/strokes/effects, index of the paint/effect slot when boundVariables uses an array.
 */
async function isVariableFromStyle(node, property, variableId, bindIndex) {
  try {
    if (property === 'fontSize' || property === 'fontWeight' || property === 'lineHeight' || property === 'letterSpacing' ||
        property === 'fontFamily' || property === 'paragraphSpacing' || property === 'paragraphIndent' || property === 'fontStyle') {
      return await isTextTypographyFromStyle(node, property, variableId);
    }
    if (property === 'fills') {
      if (!('fillStyleId' in node) || !node.fillStyleId || node.fillStyleId === figma.mixed) return false;
      var fillStyle = await figma.getStyleByIdAsync(node.fillStyleId);
      if (!fillStyle || !fillStyle.boundVariables) return false;
      var bv = fillStyle.boundVariables;
      if (bv.paints && (Array.isArray(bv.paints) ? bv.paints.length : 0) > 0) {
        return stylePaintSlotMatchesVariable(bv.paints, bindIndex != null ? bindIndex : null, variableId);
      }
      if (bv.color && (bindIndex == null || bindIndex === 0)) {
        return bindingEntryVariableId(bv.color) === variableId || bindingEntryVariableId(Array.isArray(bv.color) ? bv.color[0] : bv.color) === variableId;
      }
      return false;
    }
    if (property === 'strokes') {
      if (!('strokeStyleId' in node) || !node.strokeStyleId || node.strokeStyleId === figma.mixed) return false;
      var strokeStyle = await figma.getStyleByIdAsync(node.strokeStyleId);
      if (!strokeStyle || !strokeStyle.boundVariables) return false;
      var sbv = strokeStyle.boundVariables;
      if (sbv.strokes && (Array.isArray(sbv.strokes) ? sbv.strokes.length : 0) > 0) {
        return stylePaintSlotMatchesVariable(sbv.strokes, bindIndex != null ? bindIndex : null, variableId);
      }
      if (sbv.paints && (Array.isArray(sbv.paints) ? sbv.paints.length : 0) > 0) {
        return stylePaintSlotMatchesVariable(sbv.paints, bindIndex != null ? bindIndex : null, variableId);
      }
      if (sbv.color && (bindIndex == null || bindIndex === 0)) {
        return bindingEntryVariableId(sbv.color) === variableId;
      }
      return false;
    }
    if (property === 'effects') {
      if (!('effectStyleId' in node) || !node.effectStyleId || node.effectStyleId === figma.mixed) return false;
      var effectStyle = await figma.getStyleByIdAsync(node.effectStyleId);
      if (!effectStyle || !effectStyle.boundVariables || !effectStyle.boundVariables.effects) return false;
      var effects = effectStyle.boundVariables.effects;
      var effArr = Array.isArray(effects) ? effects : [effects];
      if (bindIndex != null && bindIndex >= 0 && bindIndex < effArr.length) {
        return bindingEntryVariableId(effArr[bindIndex]) === variableId;
      }
      for (var k = 0; k < effArr.length; k++) {
        if (bindingEntryVariableId(effArr[k]) === variableId) return true;
      }
      return false;
    }
  } catch (e) { }
  return false;
}

/** Find variable by name or full path. If targetCollection is set, only that collection; else prefer same as currentCollectionName then any. */
/** newFullPathOrName: "Collection / variable" or "variable" (variable-only). */
function findReplacementInCache(variableCache, newFullPathOrName, currentCollectionName, targetCollectionVal) {
  var target = targetCollectionVal != null ? String(targetCollectionVal).trim() : '';
  var parsed = parseFullPath(newFullPathOrName);
  var searchCollection = parsed.collectionName || currentCollectionName;
  var searchVariable = parsed.variableName || newFullPathOrName;
  var wantFull = normalizeVariablePath(getScope(searchCollection, searchVariable));
  var wantName = normalizeVariablePath(searchVariable);
  var inTarget = null;
  var sameCollection = null;
  var anyMatch = null;
  variableCache.forEach(function(info) {
    var infoFull = normalizeVariablePath(getScope(info.collectionName, info.name));
    var infoName = normalizeVariablePath(info.name);
    if (infoFull !== wantFull && infoName !== wantName) return;
    if (target !== '' && info.collectionName === target) {
      inTarget = info;
    } else if (info.collectionName === searchCollection || info.collectionName === currentCollectionName) {
      sameCollection = info;
    } else if (!anyMatch) {
      anyMatch = info;
    }
  });
  var result = inTarget || sameCollection || anyMatch;
  if (result) return result;
  var leafName = wantName.lastIndexOf('/') !== -1 ? wantName.slice(wantName.lastIndexOf('/') + 1).trim() : wantName;
  if (!leafName) return null;
  var leafMatches = [];
  variableCache.forEach(function(info) {
    if (normalizeVariablePath(info.name) !== leafName) return;
    if (target !== '' && info.collectionName !== target) return;
    if (target === '' && info.collectionName !== searchCollection && info.collectionName !== currentCollectionName) return;
    leafMatches.push(info);
  });
  return leafMatches.length === 1 ? leafMatches[0] : null;
}

/**
 * Find a replacement Variable for a resolved binding target.
 * @returns {{ replacementVariable: Variable|null, status: string, newFullPath?: string }}
 * status: ok | orphan | source | alreadyTarget | noMatch | notFound | typeMismatch | loadFailed
 */
async function resolveReplacementForBinding(currentVariable, currentCollectionName, ctx) {
  if (!bindingInSourceCollection(currentCollectionName, ctx.sourceCollectionVal)) {
    return { replacementVariable: null, status: 'source' };
  }

  var fullPath = getScope(currentCollectionName, currentVariable.name);
  var normalizedFullPath = normalizeVariablePath(fullPath);
  var matchedOperation = null;
  var newFullPath = null;

  if (ctx.remapBySameName && ctx.targetCollectionVal) {
    if (ctx.targetLocalCollectionId && currentVariable.variableCollectionId === ctx.targetLocalCollectionId) {
      return { replacementVariable: null, status: 'alreadyTarget' };
    }
    newFullPath = normalizeVariablePath(getScope(ctx.targetCollectionVal, currentVariable.name));
    matchedOperation = { remapByName: true };
  } else {
    var matchOpts = getMatchOpts();
    for (var opIndex = 0; opIndex < ctx.replacements.length; opIndex++) {
      var operation = ctx.replacements[opIndex];
      var normalizedFind = findPatternForPath(operation.find, matchOpts);
      var normalizedReplace = normalizeVariablePath(operation.replace);
      if (!normalizedFind && !normalizedReplace) continue;
      if (!nameMatches(normalizedFullPath, normalizedFind, matchOpts)) continue;
      newFullPath = renameByPattern(normalizedFullPath, normalizedFind, normalizedReplace, 0, 1, matchOpts);
      if (newFullPath === normalizedFullPath) continue;
      matchedOperation = operation;
      break;
    }
    if (!matchedOperation || newFullPath == null) {
      return { replacementVariable: null, status: 'noMatch' };
    }
  }

  var parsed = parseFullPath(newFullPath);
  var newCollectionName = parsed.collectionName || currentCollectionName;
  var newVariableName = parsed.variableName || newFullPath;

  var replacementInfo = findReplacementInCache(ctx.variableCache, newFullPath, currentCollectionName, ctx.targetCollectionVal);
  if (!replacementInfo && ctx.remapBySameName) {
    replacementInfo = findVariableInTargetByName(ctx.variableCache, ctx.targetCollectionVal, currentVariable.name, currentVariable.resolvedType);
  }
  if (!replacementInfo) {
    var libVar = await findLibraryVariableByNameAsync(newCollectionName, newVariableName, ctx.variableCache, currentVariable.resolvedType);
    if (libVar) {
      replacementInfo = { variable: libVar, collectionName: newCollectionName, name: libVar.name, isLibrary: true };
    }
  }
  if (!replacementInfo) {
    return { replacementVariable: null, status: 'notFound', newFullPath: newFullPath };
  }

  var replacementVariable = null;
  if (replacementInfo.isLibrary) {
    if (!replacementInfo.key) {
      return { replacementVariable: null, status: 'loadFailed', newFullPath: newFullPath };
    }
    replacementVariable = await figma.variables.importVariableByKeyAsync(replacementInfo.key);
  } else if (replacementInfo.variable) {
    replacementVariable = replacementInfo.variable;
  }
  if (!replacementVariable) {
    return { replacementVariable: null, status: 'loadFailed', newFullPath: newFullPath };
  }
  if (currentVariable.resolvedType !== replacementVariable.resolvedType) {
    return { replacementVariable: null, status: 'typeMismatch', newFullPath: newFullPath };
  }
  return { replacementVariable: replacementVariable, status: 'ok', newFullPath: newFullPath };
}

/**
 * Rebind VARIABLE_ALIAS values inside local variable definitions (all modes per collection).
 */
async function replaceVariableTableAliases(localCollections, ctx) {
  var replacementCount = 0;
  var skippedCount = 0;
  var orphanUnresolvedCount = 0;

  for (var ci = 0; ci < localCollections.length; ci++) {
    var hostCollection = localCollections[ci];

    for (var vi = 0; vi < hostCollection.variableIds.length; vi++) {
      var hostVariable = await figma.variables.getVariableByIdAsync(hostCollection.variableIds[vi]);
      if (!hostVariable || !hostVariable.valuesByMode) continue;

      for (var mi = 0; mi < hostCollection.modes.length; mi++) {
        var mode = hostCollection.modes[mi];
        var aliasValue = hostVariable.valuesByMode[mode.modeId];
        if (!isVariableAliasValue(aliasValue)) continue;

        try {
          var currentVariable = await resolveVariableFromAlias(aliasValue);
          if (!currentVariable) {
            console.log('Variable table: orphan alias on', getScope(hostCollection.name, hostVariable.name),
              'mode', mode.name, '—', aliasValue.id || aliasValue.key || '(none)');
            orphanUnresolvedCount++;
            skippedCount++;
            continue;
          }

          var currentCollection = await figma.variables.getVariableCollectionByIdAsync(currentVariable.variableCollectionId);
          var currentCollectionName = currentCollection ? currentCollection.name : 'Unknown';

          console.log('Variable table alias:', getScope(hostCollection.name, hostVariable.name),
            'mode', mode.name, '→', currentVariable.name, 'from', currentCollectionName);

          var result = await resolveReplacementForBinding(currentVariable, currentCollectionName, ctx);
          if (result.status === 'alreadyTarget') {
            console.log('  Already points at local target collection, skip');
            continue;
          }
          if (result.status === 'source' || result.status === 'noMatch') continue;
          if (result.status === 'notFound') {
            console.log('  ❌ Replacement variable not found:', result.newFullPath);
            skippedCount++;
            continue;
          }
          if (result.status === 'typeMismatch') {
            console.log('  ❌ Type mismatch for', result.newFullPath);
            skippedCount++;
            continue;
          }
          if (result.status === 'loadFailed') {
            console.log('  ❌ Could not load replacement variable');
            skippedCount++;
            continue;
          }
          if (result.status !== 'ok' || !result.replacementVariable) continue;

          if (aliasValue.id === result.replacementVariable.id) continue;

          previewRecord(
            ctx,
            'variables table · ' + hostVariable.name + ' · mode ' + mode.name,
            await rvVariablePath(currentVariable),
            await rvVariablePath(result.replacementVariable)
          );
          if (previewWouldWrite(ctx)) {
            hostVariable.setValueForMode(mode.modeId, {
              type: 'VARIABLE_ALIAS',
              id: result.replacementVariable.id
            });
            console.log('  ✅ Replaced variable-table alias →', result.replacementVariable.name);
          }
          replacementCount++;
        } catch (error) {
          var errMsg = error instanceof Error ? error.message : String(error);
          console.error('Variable table alias error:', errMsg);
          skippedCount++;
        }
      }
    }
  }

  return { replacementCount: replacementCount, skippedCount: skippedCount, orphanUnresolvedCount: orphanUnresolvedCount };
}

async function findAndReplaceVariables() {
  try {
  var selection = figma.currentPage.selection;
  var scopeVal = (typeof rebindScope !== 'undefined' && rebindScope != null) ? String(rebindScope).trim() : 'selection';
  var includeSelection = scopeVal === 'selection' || scopeVal === 'both';
  var includeVariableTable = scopeVal === 'variablesCollection' || scopeVal === 'both';

  if (includeSelection && selection.length === 0 && !includeVariableTable) {
    figma.notify('⚠️ Please select at least one node');
    return;
  }
  if (!includeSelection && !includeVariableTable) {
    figma.notify('⚠️ Choose a rebind scope');
    return;
  }
  
  var sourceCollectionVal = (typeof sourceCollection !== 'undefined' && sourceCollection != null) ? String(sourceCollection).trim() : '';
  var targetCollectionVal = (typeof targetCollection !== 'undefined' && targetCollection != null) ? String(targetCollection).trim() : '';
  
  var replacements = buildReplacementsFromConfig(sourceCollectionVal, targetCollectionVal);
  /** True when: target set + no path/batch operations (buildReplacements empty). Mutually exclusive with source+target path swap (that always yields a non-empty replacements list). */
  var remapBySameName = targetCollectionVal.length > 0 && replacements.length === 0;
  
  if (!remapBySameName && replacements.length === 0) {
    figma.notify('Configure search/replace or batch, or set Target collection (all sources → remap by same name), or Source+Target for path rename');
    return;
  }
  
  console.log('=== Replace Variables ===');
  console.log('Scope:', scopeVal);
  console.log('Source collection:', sourceCollectionVal || '(all)');
  console.log('Target collection:', targetCollectionVal || '(same as source, then any)');
  if (remapBySameName) {
    console.log('Mode: remap same variable name → collection:', targetCollectionVal);
  } else {
    console.log('Operations:', replacements.length);
    for (var i = 0; i < replacements.length; i++) {
      console.log('  [' + (i + 1) + '] "' + replacements[i].find + '" → "' + replacements[i].replace + '"');
      var ruleNote = patternModeNote(replacements[i].find, getMatchOpts());
      if (ruleNote) console.log('      ' + ruleNote);
    }
  }
  
  var allNodes = includeSelection && selection.length > 0 ? collectAllNodes(selection) : [];
  if (includeSelection) {
    console.log('Total nodes to process:', allNodes.length);
  }
  
  console.log('Building variable cache (keyed by scope)...');
  var variableCache = new Map();
  /** Local collection id for target name — two collections can share the same display name (e.g. library "Colors" vs local "Colors"); only same id means already using this file's collection. */
  var targetLocalCollectionId = null;
  var localCollections = [];
  
  try {
    localCollections = await figma.variables.getLocalVariableCollectionsAsync();
    if (remapBySameName && targetCollectionVal) {
      for (var tc = 0; tc < localCollections.length; tc++) {
        if (localCollections[tc].name === targetCollectionVal) {
          targetLocalCollectionId = localCollections[tc].id;
          console.log('Target maps to local collection id:', targetLocalCollectionId);
          break;
        }
      }
      if (!targetLocalCollectionId) {
        console.log('⚠️ No local collection named "' + targetCollectionVal + '" — will not skip as "already local"; remap may still match by name in cache');
      }
    }
    for (var i = 0; i < localCollections.length; i++) {
      var collection = localCollections[i];
      for (var j = 0; j < collection.variableIds.length; j++) {
        var variable = await figma.variables.getVariableByIdAsync(collection.variableIds[j]);
        if (variable) {
          var scopeKey = getScope(collection.name, variable.name);
          variableCache.set(scopeKey, {
            id: variable.id,
            name: variable.name,
            collectionName: collection.name,
            variable: variable
          });
        }
      }
    }
    
    var libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    for (var i = 0; i < libraryCollections.length; i++) {
      var libCollection = libraryCollections[i];
      try {
        var libraryVariables = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libCollection.key);
        for (var j = 0; j < libraryVariables.length; j++) {
          var libVar = libraryVariables[j];
          var scopeKey = getScope(libCollection.name, libVar.name);
          variableCache.set(scopeKey, {
            key: libVar.key,
            name: libVar.name,
            collectionName: libCollection.name,
            isLibrary: true
          });
        }
      } catch (e) {}
    }
    
    console.log('Variable cache built:', variableCache.size, 'variables');
    
  } catch (error) {
    console.error('Error building variable cache:', error);
    figma.notify('❌ Error loading variables: ' + error.message);
    return;
  }

  var previewOnlyVal = typeof previewOnly === 'undefined' || previewOnly === true;
  var ctx = {
    variableCache: variableCache,
    sourceCollectionVal: sourceCollectionVal,
    targetCollectionVal: targetCollectionVal,
    targetLocalCollectionId: targetLocalCollectionId,
    remapBySameName: remapBySameName,
    replacements: replacements,
    previewOnly: previewOnlyVal,
    plan: []
  };
  
  var replacementCount = 0;
  var skippedCount = 0;
  var orphanUnresolvedCount = 0;
  var variableTableCount = 0;
  
  for (var nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
    var node = allNodes[nodeIndex];
    
    if (!node.boundVariables) continue;
    
    var properties = Object.keys(node.boundVariables);
    if (properties.length === 0) continue;
    
    for (var propIndex = 0; propIndex < properties.length; propIndex++) {
      var property = properties[propIndex];
      var binding = node.boundVariables[property];
      
      if (!binding) continue;
      // Skip layoutGrids and other properties that don't support setBoundVariable
      if (property !== 'fills' && property !== 'strokes' && property !== 'effects' &&
          !SUPPORTED_BOUND_PROPERTIES[property]) {
        continue;
      }
      
      var bindingArray = Array.isArray(binding) ? binding : [binding];
      
      for (var bindIndex = 0; bindIndex < bindingArray.length; bindIndex++) {
        var variableAlias = bindingArray[bindIndex];
        
        if (!variableAlias || (!variableAlias.id && !variableAlias.key)) continue;
        
        try {
          var currentVariable = await resolveVariableFromAlias(variableAlias);
          
          if (!currentVariable) {
            console.log('Could not resolve variable (orphan binding—no ID in this file and no usable library key):', variableAlias.id || variableAlias.key || '(none)');
            orphanUnresolvedCount++;
            skippedCount++;
            continue;
          }
          
          var currentCollection = await figma.variables.getVariableCollectionByIdAsync(currentVariable.variableCollectionId);
          var currentCollectionName = currentCollection ? currentCollection.name : 'Unknown';

          var variableId = currentVariable.id;
          if (await isVariableFromStyle(node, property, variableId, bindIndex)) {
            console.log('  ⏭️ Skipping (variable comes from style):', currentVariable.name);
            skippedCount++;
            continue;
          }
          
          console.log('Found bound variable:', currentVariable.name, 'from collection:', currentCollectionName);

          var bindResult = await resolveReplacementForBinding(currentVariable, currentCollectionName, ctx);
          if (bindResult.status === 'alreadyTarget') {
            console.log('  Already bound to local target collection (same id), skip');
            continue;
          }
          if (bindResult.status === 'source' || bindResult.status === 'noMatch') continue;
          if (bindResult.status === 'notFound') {
            console.log('  ❌ Replacement variable not found:', bindResult.newFullPath);
            skippedCount++;
            continue;
          }
          if (bindResult.status === 'typeMismatch') {
            console.log('  ❌ Type mismatch: current', currentVariable.resolvedType);
            skippedCount++;
            continue;
          }
          if (bindResult.status === 'loadFailed') {
            console.log('  ❌ Could not load replacement variable');
            skippedCount++;
            continue;
          }
          if (bindResult.status !== 'ok' || !bindResult.replacementVariable) continue;

          var replacementVariable = bindResult.replacementVariable;
          if (!remapBySameName && bindResult.newFullPath) {
            console.log('  Match! Looking for replacement:', bindResult.newFullPath);
          } else if (remapBySameName) {
            console.log('  Remap by name →', bindResult.newFullPath);
          }
          
          // Apply the replacement
          try {
            // Handle text properties (require range binding)
            if (property === 'fontSize' || property === 'letterSpacing' || property === 'lineHeight' || 
                property === 'fontFamily' || property === 'fontWeight') {
              
              if (node.type === 'TEXT') {
                var textLength = node.characters.length;
                previewRecord(ctx, node.name + ' · ' + property, await rvVariablePath(currentVariable), await rvVariablePath(replacementVariable));
                if (previewWouldWrite(ctx)) {
                  node.setRangeBoundVariable(0, textLength, property, replacementVariable);
                  console.log('  ✅ Replaced range property:', property);
                }
                replacementCount++;
              }
            }
            // Handle fills (must be set on paint objects)
            else if (property === 'fills') {
              if ('fills' in node && node.fills !== figma.mixed) {
                var fills = JSON.parse(JSON.stringify(node.fills));
                for (var i = 0; i < fills.length; i++) {
                  if (fills[i].boundVariables && fills[i].boundVariables.color) {
                    var fillVarId = fills[i].boundVariables.color.id;
                    if (fillVarId === currentVariable.id) {
                      fills[i] = {
                        type: fills[i].type,
                        color: fills[i].color,
                        visible: fills[i].visible,
                        opacity: fills[i].opacity,
                        blendMode: fills[i].blendMode,
                        boundVariables: {
                          color: {
                            type: 'VARIABLE_ALIAS',
                            id: replacementVariable.id
                          }
                        }
                      };
                    }
                  }
                }
                previewRecord(ctx, node.name + ' · fills', await rvVariablePath(currentVariable), await rvVariablePath(replacementVariable));
                if (previewWouldWrite(ctx)) {
                  node.fills = fills;
                  console.log('  ✅ Replaced fill color variable');
                }
                replacementCount++;
              }
            }
            // Handle strokes (must be set on paint objects)
            else if (property === 'strokes') {
              if ('strokes' in node) {
                var strokes = JSON.parse(JSON.stringify(node.strokes));
                for (var i = 0; i < strokes.length; i++) {
                  if (strokes[i].boundVariables && strokes[i].boundVariables.color) {
                    var strokeVarId = strokes[i].boundVariables.color.id;
                    if (strokeVarId === currentVariable.id) {
                      strokes[i] = {
                        type: strokes[i].type,
                        color: strokes[i].color,
                        visible: strokes[i].visible,
                        opacity: strokes[i].opacity,
                        blendMode: strokes[i].blendMode,
                        boundVariables: {
                          color: {
                            type: 'VARIABLE_ALIAS',
                            id: replacementVariable.id
                          }
                        }
                      };
                    }
                  }
                }
                previewRecord(ctx, node.name + ' · strokes', await rvVariablePath(currentVariable), await rvVariablePath(replacementVariable));
                if (previewWouldWrite(ctx)) {
                  node.strokes = strokes;
                  console.log('  ✅ Replaced stroke color variable');
                }
                replacementCount++;
              }
            }
            // Handle other supported properties (direct binding)
            else if (SUPPORTED_BOUND_PROPERTIES[property]) {
              previewRecord(ctx, node.name + ' · ' + property, await rvVariablePath(currentVariable), await rvVariablePath(replacementVariable));
              if (previewWouldWrite(ctx)) {
                node.setBoundVariable(property, replacementVariable);
                console.log('  ✅ Replaced property:', property);
              }
              replacementCount++;
            }
            
          } catch (apiError) {
            var errMsg = apiError instanceof Error ? apiError.message : String(apiError);
            console.error('  ❌ API error setting variable:', errMsg);
            figma.notify('Replace variables: ' + errMsg);
            skippedCount++;
          }
          
        } catch (error) {
          var errMsg = error instanceof Error ? error.message : String(error);
          console.error('Error processing binding:', errMsg);
          if (error instanceof Error && error.stack) console.error(error.stack);
          figma.notify('Replace variables: ' + errMsg);
          skippedCount++;
        }
      }
    }
  }

  if (includeVariableTable) {
    console.log('Processing variable table aliases (all local collections and modes)...');
    var tableStats = await replaceVariableTableAliases(localCollections, ctx);
    variableTableCount = tableStats.replacementCount;
    replacementCount += tableStats.replacementCount;
    skippedCount += tableStats.skippedCount;
    orphanUnresolvedCount += tableStats.orphanUnresolvedCount;
  }
  
  if (previewOnlyVal) {
    var rows = previewRowsFromPlan(ctx.plan);
    // No collision flagging: a rebind targets a variable that already exists, which is the
    // point rather than a clash — same reasoning as replace-style-variable-bindings.
    logPreviewPlan(rows, { field: 'previewOnly' });
    await savePreviewSignature('replace-variables', previewSignature(rows));
    displayResults(previewPayload('Replace variables', rows));
    figma.notify('Preview: ' + rows.length + ' binding(s) would be rebound. Nothing changed.');
    return;
  }

  var driftRows = previewRowsFromPlan(ctx.plan);
  var drift = previewDriftMessage(await readPreviewSignature('replace-variables'), previewSignature(driftRows));
  if (drift) console.warn(drift);

  // Summary
  console.log('=== SUMMARY ===');
  if (includeSelection) console.log('Layer bindings replaced:', replacementCount - variableTableCount);
  if (includeVariableTable) console.log('Variable-table aliases replaced:', variableTableCount);
  console.log('Total replaced:', replacementCount);
  console.log('Skipped:', skippedCount);
  if (orphanUnresolvedCount > 0) {
    console.log('Unresolved / missing variable IDs (cannot remap—no name in API):', orphanUnresolvedCount);
  }
  
  if (replacementCount > 0) {
    var sumMsg = '✅ Replaced ' + replacementCount + ' binding(s)';
    if (includeSelection && includeVariableTable) {
      sumMsg += ' (' + (replacementCount - variableTableCount) + ' layer, ' + variableTableCount + ' variable table)';
    } else if (includeVariableTable) {
      sumMsg += ' in variable table';
    }
    if (orphanUnresolvedCount > 0) {
      sumMsg += '. ' + orphanUnresolvedCount + ' still unresolved (missing ID—names not available to remap)';
    }
    figma.notify(sumMsg);
  } else if (orphanUnresolvedCount > 0) {
    figma.notify('⚠️ No bindings replaced. ' + orphanUnresolvedCount + ' unresolved (missing variable in this file). Others may be styles, wrong collection, or no matching name in target.');
  } else {
    figma.notify('⚠️ No variables were replaced. Check console for details.');
  }
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    console.error('Replace variables error:', msg);
    if (err instanceof Error && err.stack) console.error(err.stack);
    figma.notify('❌ Replace variables: ' + msg);
  }
}

findAndReplaceVariables();
