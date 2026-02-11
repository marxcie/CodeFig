// Replace variables
// @DOC_START
// # Replace variables
// Replaces variable bindings on nodes by matching variable names to patterns (rebinds nodes to a different variable; does not rename variable definitions).
//
// ## Overview
// Same config as batch-rename: searchIn (optional scope filter on "collection / variable path"), searchFor/replaceWith for one replacement, batchReplacement for multiple. Only considers bindings whose scope matches searchIn (if set). First matching operation per binding wins. selectionOnly: process selection only.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | searchIn | Optional: only consider bindings whose variable scope ("collection / variable path") matches this (partial); empty = all. |
// | searchFor / replaceWith | Single find/replace pair applied to variable names (global replace). |
// | batchReplacement | Textarea (UI) or array (script): multiple "search, replace" pairs; when non-empty, overrides searchFor/replaceWith. |
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
  console.log('[Replace variables] DEBUG: using fallback matchPattern');
}

// ========================================
// CONFIGURATION
// ========================================

// @UI_CONFIG_START
// # Replace variables
var searchIn = ""; // @placeholder="color/"
// Optional, only consider bindings whose scope (collection / variable path) contains this
//
var searchFor = "red"; // @placeholder="red"
var replaceWith = "blue"; // @placeholder="blue"
// ---
var batchReplacement = ""; // @textarea
// Batch: one line per pair, "search, replace" (overrides searchFor/replaceWith when non-empty)
// @UI_CONFIG_END
//
// Script-only batch: var batchReplacement = [["red","blue"],["50","050"]]; or [{ searchPattern: "red", replacePattern: "blue" }];

function getScope(collectionName, variableName) {
  return (collectionName || '') + " / " + (variableName || '');
}

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

function findReplacementInCache(variableCache, newVariableName, preferCollectionName) {
  var sameCollection = null;
  var anyMatch = null;
  variableCache.forEach(function(info, scope) {
    if (info.name !== newVariableName) return;
    if (info.collectionName === preferCollectionName) {
      sameCollection = info;
    } else if (!anyMatch) {
      anyMatch = info;
    }
  });
  return sameCollection || anyMatch;
}

async function findAndReplaceVariables() {
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
  
  var searchInVal = typeof searchIn !== 'undefined' ? searchIn : '';
  if (searchInVal && String(searchInVal).trim()) {
    console.log('[Replace variables] DEBUG: searchIn "' + String(searchInVal).trim() + '" – only bindings whose scope matches');
  }
  
  console.log('=== Replace Variables ===');
  console.log('Operations:', replacements.length);
  for (var i = 0; i < replacements.length; i++) {
    console.log('  [' + (i + 1) + '] "' + replacements[i].find + '" → "' + replacements[i].replace + '"');
  }
  
  var allNodes = collectAllNodes(selection);
  console.log('Total nodes to process:', allNodes.length);
  
  console.log('Building variable cache (keyed by scope)...');
  var variableCache = new Map();
  
  try {
    var localCollections = figma.variables.getLocalVariableCollections();
    for (var i = 0; i < localCollections.length; i++) {
      var collection = localCollections[i];
      for (var j = 0; j < collection.variableIds.length; j++) {
        var variable = figma.variables.getVariableById(collection.variableIds[j]);
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
        
        if (!variableAlias || !variableAlias.id) continue;
        
        try {
          var currentVariable = figma.variables.getVariableById(variableAlias.id);
          
          if (!currentVariable) {
            console.log('Could not resolve variable:', variableAlias.id);
            continue;
          }
          
          var currentCollection = figma.variables.getVariableCollectionById(currentVariable.variableCollectionId);
          var currentCollectionName = currentCollection ? currentCollection.name : 'Unknown';
          var scope = getScope(currentCollectionName, currentVariable.name);
          
          if (searchInVal != null && String(searchInVal).trim() !== '') {
            var scopeMatch = matchPattern(scope, String(searchInVal).trim(), { exact: false, caseSensitive: false });
            if (!scopeMatch || !scopeMatch.match) {
              console.log('[Replace variables] DEBUG: skip "' + scope + '" – does not match searchIn');
              continue;
            }
          }
          
          console.log('Found bound variable:', currentVariable.name, 'from collection:', currentCollectionName);
          
          var matchedOperation = null;
          var newVariableName = null;
          
          for (var opIndex = 0; opIndex < replacements.length; opIndex++) {
            var operation = replacements[opIndex];
            if (currentVariable.name.indexOf(operation.find) === -1) continue;
            newVariableName = replaceAllInName(currentVariable.name, operation.find, operation.replace);
            if (newVariableName === currentVariable.name) continue;
            matchedOperation = operation;
            break;
          }
          
          if (!matchedOperation) {
            console.log('  No matching operation');
            continue;
          }
          
          console.log('  Match! Looking for replacement:', newVariableName);
          
          var replacementInfo = findReplacementInCache(variableCache, newVariableName, currentCollectionName);
          
          if (!replacementInfo) {
            console.log('  ❌ Replacement variable not found:', newVariableName);
            skippedCount++;
            continue;
          }
          
          console.log('  Found replacement in collection:', replacementInfo.collectionName);
          
          // Import library variable if needed
          var replacementVariable = null;
          if (replacementInfo.isLibrary) {
            replacementVariable = await figma.variables.importVariableByKeyAsync(replacementInfo.key);
          } else {
            replacementVariable = replacementInfo.variable;
          }
          
          if (!replacementVariable) {
            console.log('  ❌ Could not load replacement variable');
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
                node.setRangeBoundVariable(0, textLength, property, {
                  type: 'VARIABLE_ALIAS',
                  id: replacementVariable.id
                });
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
            // Handle all other properties (direct binding)
            else {
              node.setBoundVariable(property, {
                type: 'VARIABLE_ALIAS',
                id: replacementVariable.id
              });
              console.log('  ✅ Replaced property:', property);
              replacementCount++;
            }
            
          } catch (apiError) {
            console.error('  ❌ API error setting variable:', apiError);
            skippedCount++;
          }
          
        } catch (error) {
          console.error('Error processing binding:', error);
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
}

findAndReplaceVariables();
