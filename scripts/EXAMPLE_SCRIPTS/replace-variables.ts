// Replace variables
// @DOC_START
// # Replace variables
// Replaces variable bindings on nodes: choose source/target collection (dropdowns) and find/replace on variable path (groups + variable name). Rebinds nodes to a different variable; does not rename variable definitions.
//
// **Style vs native:** Bindings that come from an applied **text**, **color (fill)**, **stroke**, or **effect** style are **not** replaced—only **native** bindings on the layer (no matching variable on that applied style for that slot) are updated.
//
// ## Overview
// **Collections:** Source collection = which bindings to consider (empty = all). Target collection = where to look up the replacement variable (empty = same collection as source, then any). **Path find/replace:** Applied to the variable path (e.g. "color 2 / red" → find "color 2", replace "color 1" → "color 1 / red"). Supports same-collection group swap and cross-collection replacement.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | sourceCollection | Limit to bindings from this collection; empty = all collections. |
// | targetCollection | Look up replacement variable in this collection; empty = same as source, then any. |
// | searchFor / replaceWith | Find/replace applied to variable path (collection + variable). |
// | batchReplacement | Multiple "search, replace" lines; overrides searchFor/replaceWith. |
// | **Replace-all mode** | When source + target are set and search/replace empty: replace all variables from source with same-named vars from target. |
// @DOC_END

@import { matchPattern } from "@Pattern Matching"

if (typeof matchPattern !== 'function') {
  var matchPattern = function(text, pattern, options) {
    options = options || {};
    var t = (options.caseSensitive ? text : text.toLowerCase());
    var p = (options.caseSensitive ? pattern : pattern.toLowerCase());
    if (options.exact) return { match: t === p, confidence: t === p ? 1 : 0 };
    return { match: t.indexOf(p) !== -1, confidence: t.indexOf(p) !== -1 ? 1 : 0 };
  };
}

// ========================================
// CONFIGURATION
// ========================================

// @UI_CONFIG_START
// # Replace variables
var sourceCollection = ""; // @options: variableCollections
var targetCollection = ""; // @options: variableCollections
//
var searchFor = ""; // @placeholder="color 2"
var replaceWith = ""; // @placeholder="color 1"
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

function escapeForGlobalReplace(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAllInName(name, find, replace) {
  if (!find && !replace) return name;
  var escaped = escapeForGlobalReplace(find);
  var regex = new RegExp(escaped, 'gi');
  return String(name).replace(regex, replace);
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

async function findAndReplaceVariables() {
  try {
  var selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify('⚠️ Please select at least one node');
    return;
  }
  
  var sourceCollectionVal = (typeof sourceCollection !== 'undefined' && sourceCollection != null) ? String(sourceCollection).trim() : '';
  var targetCollectionVal = (typeof targetCollection !== 'undefined' && targetCollection != null) ? String(targetCollection).trim() : '';
  
  var replacements = buildReplacementsFromConfig(sourceCollectionVal, targetCollectionVal);
  if (replacements.length === 0) {
    figma.notify('Configure searchFor/replaceWith, batchReplacement, or source+target collection');
    return;
  }
  
  console.log('=== Replace Variables ===');
  console.log('Source collection:', sourceCollectionVal || '(all)');
  console.log('Target collection:', targetCollectionVal || '(same as source, then any)');
  console.log('Operations:', replacements.length);
  for (var i = 0; i < replacements.length; i++) {
    console.log('  [' + (i + 1) + '] "' + replacements[i].find + '" → "' + replacements[i].replace + '"');
  }
  
  var allNodes = collectAllNodes(selection);
  console.log('Total nodes to process:', allNodes.length);
  
  console.log('Building variable cache (keyed by scope)...');
  var variableCache = new Map();
  
  try {
    var localCollections = await figma.variables.getLocalVariableCollectionsAsync();
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
  
  var replacementCount = 0;
  var skippedCount = 0;
  
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
          var currentVariable = variableAlias.id
            ? await figma.variables.getVariableByIdAsync(variableAlias.id)
            : null;
          if (!currentVariable && variableAlias.key) {
            try {
              currentVariable = await figma.variables.importVariableByKeyAsync(variableAlias.key);
            } catch (e) {}
          }
          
          if (!currentVariable) {
            console.log('Could not resolve variable:', variableAlias.id || variableAlias.key);
            continue;
          }
          
          var currentCollection = await figma.variables.getVariableCollectionByIdAsync(currentVariable.variableCollectionId);
          var currentCollectionName = currentCollection ? currentCollection.name : 'Unknown';
          if (!bindingInSourceCollection(currentCollectionName, sourceCollectionVal)) {
            continue;
          }

          var variableId = currentVariable.id;
          if (await isVariableFromStyle(node, property, variableId, bindIndex)) {
            console.log('  ⏭️ Skipping (variable comes from style):', currentVariable.name);
            skippedCount++;
            continue;
          }
          
          console.log('Found bound variable:', currentVariable.name, 'from collection:', currentCollectionName);
          
          // Apply find/replace to full path "collection / variable" so collection names (e.g. v5→v4) work
          var fullPath = getScope(currentCollectionName, currentVariable.name);
          var normalizedFullPath = normalizeVariablePath(fullPath);
          var matchedOperation = null;
          var newFullPath = null;
          
          for (var opIndex = 0; opIndex < replacements.length; opIndex++) {
            var operation = replacements[opIndex];
            var normalizedFind = normalizeVariablePath(operation.find);
            var normalizedReplace = normalizeVariablePath(operation.replace);
            if (!normalizedFind && !normalizedReplace) continue;
            if (normalizedFullPath.indexOf(normalizedFind) === -1) continue;
            newFullPath = replaceAllInName(normalizedFullPath, normalizedFind, normalizedReplace);
            if (newFullPath === normalizedFullPath) continue;
            matchedOperation = operation;
            break;
          }
          
          if (!matchedOperation || newFullPath == null) {
            console.log('  No matching operation');
            continue;
          }
          
          var parsed = parseFullPath(newFullPath);
          var newCollectionName = parsed.collectionName || currentCollectionName;
          var newVariableName = parsed.variableName || newFullPath;
          console.log('  Match! Looking for replacement:', newFullPath);
          
          var replacementInfo = findReplacementInCache(variableCache, newFullPath, currentCollectionName, targetCollectionVal);
          
          if (!replacementInfo) {
            var libVar = await findLibraryVariableByNameAsync(newCollectionName, newVariableName, variableCache, currentVariable.resolvedType);
            if (libVar) {
              replacementInfo = { variable: libVar, collectionName: newCollectionName, name: libVar.name, isLibrary: true };
            }
          }
          
          if (!replacementInfo) {
            console.log('  ❌ Replacement variable not found:', newFullPath);
            skippedCount++;
            continue;
          }
          
          console.log('  Found replacement in collection:', replacementInfo.collectionName);
          
          // Import library variable if needed; for local, use cached Variable object
          var replacementVariable = null;
          if (replacementInfo.isLibrary) {
            if (!replacementInfo.key) {
              console.log('  ❌ Library variable has no key');
              skippedCount++;
              continue;
            }
            replacementVariable = await figma.variables.importVariableByKeyAsync(replacementInfo.key);
          } else {
            if (!replacementInfo.variable) {
              console.log('  ❌ Cache entry missing variable reference');
              skippedCount++;
              continue;
            }
            replacementVariable = replacementInfo.variable;
          }
          
          if (!replacementVariable) {
            console.log('  ❌ Could not load replacement variable');
            skippedCount++;
            continue;
          }
          
          // Type must match (e.g. COLOR vs FLOAT) or Figma may throw
          if (currentVariable.resolvedType !== replacementVariable.resolvedType) {
            console.log('  ❌ Type mismatch: current', currentVariable.resolvedType, 'vs replacement', replacementVariable.resolvedType);
            skippedCount++;
            continue;
          }
          
          // Apply the replacement
          try {
            // Handle text properties (require range binding)
            if (property === 'fontSize' || property === 'letterSpacing' || property === 'lineHeight' || 
                property === 'fontFamily' || property === 'fontWeight') {
              
              if (node.type === 'TEXT') {
                var textLength = node.characters.length;
                node.setRangeBoundVariable(0, textLength, property, replacementVariable);
                console.log('  ✅ Replaced range property:', property);
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
                node.fills = fills;
                console.log('  ✅ Replaced fill color variable');
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
                node.strokes = strokes;
                console.log('  ✅ Replaced stroke color variable');
                replacementCount++;
              }
            }
            // Handle other supported properties (direct binding)
            else if (SUPPORTED_BOUND_PROPERTIES[property]) {
              node.setBoundVariable(property, replacementVariable);
              console.log('  ✅ Replaced property:', property);
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
  
  // Summary
  console.log('=== SUMMARY ===');
  console.log('Properties replaced:', replacementCount);
  console.log('Skipped:', skippedCount);
  
  if (replacementCount > 0) {
    figma.notify('✅ Replaced ' + replacementCount + ' variable bindings');
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
