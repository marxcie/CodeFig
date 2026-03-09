// Replace variables
// @DOC_START
// # Replace variables
// Replaces variable bindings on nodes: choose source/target collection (dropdowns) and find/replace on variable path (groups + variable name). Rebinds nodes to a different variable; does not rename variable definitions.
//
// ## Overview
// **Collections:** Source collection = which bindings to consider (empty = all). Target collection = where to look up the replacement variable (empty = same collection as source, then any). **Path find/replace:** Applied to the variable path (e.g. "color 2 / red" → find "color 2", replace "color 1" → "color 1 / red"). Supports same-collection group swap and cross-collection replacement.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | sourceCollection | Limit to bindings from this collection; empty = all collections. |
// | targetCollection | Look up replacement variable in this collection; empty = same as source, then any. |
// | searchFor / replaceWith | Find/replace applied to variable path (group and name). |
// | batchReplacement | Multiple "search, replace" lines; overrides searchFor/replaceWith. |
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

function buildReplacementsFromConfig() {
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

/** Find variable by name. If targetCollection is set, only that collection; else prefer same as currentCollectionName then any. */
/** Fallback: if full path not in cache (e.g. Figma stores leaf name only), match by leaf name in same collection when unique. */
function findReplacementInCache(variableCache, newVariableName, currentCollectionName, targetCollectionVal) {
  var target = targetCollectionVal != null ? String(targetCollectionVal).trim() : '';
  var want = normalizeVariablePath(newVariableName);
  var inTarget = null;
  var sameCollection = null;
  var anyMatch = null;
  variableCache.forEach(function(info) {
    if (normalizeVariablePath(info.name) !== want) return;
    if (target !== '' && info.collectionName === target) {
      inTarget = info;
    } else if (info.collectionName === currentCollectionName) {
      sameCollection = info;
    } else if (!anyMatch) {
      anyMatch = info;
    }
  });
  var result = inTarget || sameCollection || anyMatch;
  if (result) return result;
  // Fallback: bound variable may be "color 1/red" while cache has name "red" (leaf only) in same collection
  var slashIdx = want.lastIndexOf('/');
  if (slashIdx === -1) return null;
  var leafName = want.slice(slashIdx + 1).trim();
  if (!leafName) return null;
  var leafMatches = [];
  variableCache.forEach(function(info) {
    if (normalizeVariablePath(info.name) !== leafName) return;
    if (target !== '' && info.collectionName !== target) return;
    if (target === '' && info.collectionName !== currentCollectionName) return;
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
  
  var replacements = buildReplacementsFromConfig();
  if (replacements.length === 0) {
    figma.notify('Configure searchFor/replaceWith or batchReplacement first');
    return;
  }
  
  var sourceCollectionVal = (typeof sourceCollection !== 'undefined' && sourceCollection != null) ? String(sourceCollection).trim() : '';
  var targetCollectionVal = (typeof targetCollection !== 'undefined' && targetCollection != null) ? String(targetCollection).trim() : '';
  
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
          
          console.log('Found bound variable:', currentVariable.name, 'from collection:', currentCollectionName);
          
          // Use normalized path for match/replace so "color 2 / red" and "color 2/red" behave the same
          var normalizedCurrentName = normalizeVariablePath(currentVariable.name);
          var matchedOperation = null;
          var newVariableName = null;
          
          for (var opIndex = 0; opIndex < replacements.length; opIndex++) {
            var operation = replacements[opIndex];
            var normalizedFind = normalizeVariablePath(operation.find);
            var normalizedReplace = normalizeVariablePath(operation.replace);
            if (!normalizedFind && !normalizedReplace) continue;
            if (normalizedCurrentName.indexOf(normalizedFind) === -1) continue;
            newVariableName = replaceAllInName(normalizedCurrentName, normalizedFind, normalizedReplace);
            if (newVariableName === normalizedCurrentName) continue;
            matchedOperation = operation;
            break;
          }
          
          if (!matchedOperation || newVariableName == null) {
            console.log('  No matching operation');
            continue;
          }
          
          console.log('  Match! Looking for replacement:', newVariableName);
          
          var replacementInfo = findReplacementInCache(variableCache, newVariableName, currentCollectionName, targetCollectionVal);
          
          if (!replacementInfo) {
            console.log('  ❌ Replacement variable not found:', newVariableName);
            // Debug: list variable names in same collection that share the same normalized prefix
            var wantNorm = normalizeVariablePath(String(newVariableName));
            var prefixNorm = wantNorm.indexOf('/') !== -1 ? wantNorm.split('/')[0] : wantNorm;
            var namesInCollection = [];
            variableCache.forEach(function(info) {
              var n = normalizeVariablePath(info.name);
              if (info.collectionName === currentCollectionName && (n === prefixNorm || n.indexOf(prefixNorm + '/') === 0))
                namesInCollection.push(info.name);
            });
            if (namesInCollection.length > 0)
              console.log('  (In same collection, names starting with "' + prefixNorm + '":', namesInCollection.slice(0, 15).join(', ') + (namesInCollection.length > 15 ? '...' : '') + ')');
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
            // Handle all other properties (direct binding; pass Variable object for documentAccess: dynamic-page)
            else {
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
