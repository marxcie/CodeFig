// Merge variable collections
// @DOC_START
// # Merge variable collections
// Moves every variable from a source collection into a target collection under a group folder named like the source collection. Optional lines map source modes to target modes; when there are no lines, the first source mode’s value is copied into every target mode.
//
// ## Overview
// Choose source and target (local collections). Variables become `sourceCollectionName / …` in the target (e.g. `typography / body`). Each line in **Preserve modes** is `source mode name, target mode name`. **Empty textarea:** the collection’s **first source mode** is applied to **all** target modes. **With lines:** unmapped source modes still map to the target’s first mode only. After copying values, **layer** bindings and **local style** bindings (text, paint, effect, grid) are updated, then the **source variable collection** is removed.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | sourceCollection | Collection to merge (all variables moved out). |
// | collectionToMergeTo | Destination collection. |
// | preserveModes | One mapping per line: `source mode, target mode`. Optional. |
// @DOC_END

// @UI_CONFIG_START
// # Merge variable collections
// Source: emptied by merge. Target: receives a group named like the source collection.
var sourceCollection = ''; // @options: localVariableCollections
var collectionToMergeTo = ''; // @options: localVariableCollections
//
// Optional: map source modes to target modes. Example:
// brand1 typography, brand1
// brand2 typography, brand2
// Empty: first source mode fills every target mode. With lines: unmapped source modes → target’s first mode.
var preserveModes = ''; // @textarea
// @UI_CONFIG_END

function normalizeVariableName(name) {
  if (typeof name !== 'string') return name;
  return name.replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
}

function parseModeMappings(str) {
  if (!str || typeof str !== 'string') return [];
  var lines = str.split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var comma = line.indexOf(',');
    if (comma === -1) continue;
    var sourceMode = line.slice(0, comma).trim();
    var targetMode = line.slice(comma + 1).trim();
    if (sourceMode && targetMode) out.push([sourceMode, targetMode]);
  }
  return out;
}

/** sourceModeId -> targetModeId */
function buildModeIdMap(sourceCol, targetCol, preserveModesStr) {
  if (!targetCol.modes || targetCol.modes.length === 0) {
    throw new Error('Target collection has no modes');
  }
  var defaultTargetModeId = targetCol.modes[0].modeId;
  var pairs = parseModeMappings(preserveModesStr || '');
  var map = {};
  for (var p = 0; p < pairs.length; p++) {
    var smName = pairs[p][0];
    var tmName = pairs[p][1];
    var sm = sourceCol.modes.find(function(m) { return m.name === smName; });
    var tm = targetCol.modes.find(function(m) { return m.name === tmName; });
    if (!sm) {
      console.warn('Merge variables: unknown source mode in mapping (skipped): "' + smName + '"');
      continue;
    }
    if (!tm) {
      console.warn('Merge variables: unknown target mode in mapping (skipped): "' + tmName + '"');
      continue;
    }
    map[sm.modeId] = tm.modeId;
  }
  for (var j = 0; j < sourceCol.modes.length; j++) {
    var mode = sourceCol.modes[j];
    if (map[mode.modeId] === undefined) {
      map[mode.modeId] = defaultTargetModeId;
    }
  }
  return map;
}

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
  for (var n = 0; n < nodes.length; n++) {
    traverse(nodes[n]);
  }
  return result;
}

var SUPPORTED_BOUND_PROPERTIES = {
  height: 1, width: 1, minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1,
  itemSpacing: 1, paddingLeft: 1, paddingRight: 1, paddingTop: 1, paddingBottom: 1,
  counterAxisSpacing: 1, gridRowGap: 1, gridColumnGap: 1, paragraphSpacing: 1, paragraphIndent: 1,
  cornerRadius: 1, topLeftRadius: 1, topRightRadius: 1, bottomLeftRadius: 1, bottomRightRadius: 1,
  strokeWeight: 1, strokeTopWeight: 1, strokeBottomWeight: 1, strokeLeftWeight: 1, strokeRightWeight: 1,
  characters: 1, fontFamily: 1, fontSize: 1, fontStyle: 1, fontWeight: 1, letterSpacing: 1, lineHeight: 1,
  visible: 1, opacity: 1
};

async function isVariableFromStyle(node, property, variableId, bindIndex) {
  try {
    if (property === 'fontSize' || property === 'fontWeight' || property === 'lineHeight' || property === 'letterSpacing' ||
        property === 'fontFamily' || property === 'paragraphSpacing' || property === 'paragraphIndent' || property === 'fontStyle') {
      if (node.type !== 'TEXT' || !variableId) return false;
      async function styleDefinesVariable(styleId) {
        if (!styleId || styleId === figma.mixed) return false;
        try {
          var style = await figma.getStyleByIdAsync(styleId);
          if (!style || !style.boundVariables) return false;
          var b = style.boundVariables[property];
          if (!b) return false;
          var bid = (b.id && typeof b.id === 'string') ? b.id : null;
          if (Array.isArray(b) && b[0] && b[0].id) bid = b[0].id;
          if (bid === variableId) return true;
        } catch (e) {}
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
      } catch (e) {}
      return false;
    }
    if (property === 'fills' && 'fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
      var fillStyle = await figma.getStyleByIdAsync(node.fillStyleId);
      if (!fillStyle || !fillStyle.boundVariables) return false;
      var bv = fillStyle.boundVariables;
      if (bv.color && bindIndex == null) {
        var cid = bv.color && bv.color.id ? bv.color.id : (Array.isArray(bv.color) && bv.color[0] ? bv.color[0].id : null);
        return cid === variableId;
      }
    }
    if (property === 'strokes' && 'strokeStyleId' in node && node.strokeStyleId && node.strokeStyleId !== figma.mixed) {
      var strokeStyle = await figma.getStyleByIdAsync(node.strokeStyleId);
      if (!strokeStyle || !strokeStyle.boundVariables) return false;
      var sbv = strokeStyle.boundVariables;
      if (sbv.color && bindIndex == null) {
        var sid = sbv.color && sbv.color.id ? sbv.color.id : null;
        return sid === variableId;
      }
    }
  } catch (e) {}
  return false;
}

/**
 * Rebind all layers in the document from old variable IDs to new Variable instances.
 * @returns {{ replaced: number, skipped: number }}
 */
async function rebindDocument(oldIdToNewVariable) {
  var replacementCount = 0;
  var skippedCount = 0;
  // documentAccess / dynamic-page: pages must be loaded before reading children
  if (typeof figma.loadAllPagesAsync === 'function') {
    await figma.loadAllPagesAsync();
  }
  var pages = Array.prototype.slice.call(figma.root.children);
  var allNodes = collectAllNodes(pages);

  for (var nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
    var node = allNodes[nodeIndex];
    if (!node.boundVariables) continue;

    var properties = Object.keys(node.boundVariables);
    for (var propIndex = 0; propIndex < properties.length; propIndex++) {
      var property = properties[propIndex];
      var binding = node.boundVariables[property];
      if (!binding) continue;
      if (property !== 'fills' && property !== 'strokes' && property !== 'effects' &&
          !SUPPORTED_BOUND_PROPERTIES[property]) {
        continue;
      }

      var bindingArray = Array.isArray(binding) ? binding : [binding];
      for (var bindIndex = 0; bindIndex < bindingArray.length; bindIndex++) {
        var variableAlias = bindingArray[bindIndex];
        if (!variableAlias || !variableAlias.id) continue;

        var replacementVariable = oldIdToNewVariable[variableAlias.id];
        if (!replacementVariable) continue;

        try {
          var currentVariable = await figma.variables.getVariableByIdAsync(variableAlias.id);
          if (!currentVariable) continue;
          if (await isVariableFromStyle(node, property, currentVariable.id, bindIndex)) {
            skippedCount++;
            continue;
          }
          if (currentVariable.resolvedType !== replacementVariable.resolvedType) {
            skippedCount++;
            continue;
          }

          if (property === 'fontSize' || property === 'letterSpacing' || property === 'lineHeight' ||
              property === 'fontFamily' || property === 'fontWeight') {
            if (node.type === 'TEXT') {
              var textLength = node.characters.length;
              node.setRangeBoundVariable(0, textLength, property, replacementVariable);
              replacementCount++;
            }
          } else if (property === 'fills') {
            if ('fills' in node && node.fills !== figma.mixed) {
              var fills = JSON.parse(JSON.stringify(node.fills));
              for (var fi = 0; fi < fills.length; fi++) {
                if (fills[fi].boundVariables && fills[fi].boundVariables.color) {
                  var fillVarId = fills[fi].boundVariables.color.id;
                  if (fillVarId === currentVariable.id && oldIdToNewVariable[fillVarId]) {
                    var rep = oldIdToNewVariable[fillVarId];
                    fills[fi] = {
                      type: fills[fi].type,
                      color: fills[fi].color,
                      visible: fills[fi].visible,
                      opacity: fills[fi].opacity,
                      blendMode: fills[fi].blendMode,
                      boundVariables: { color: { type: 'VARIABLE_ALIAS', id: rep.id } }
                    };
                  }
                }
              }
              node.fills = fills;
              replacementCount++;
            }
          } else if (property === 'strokes') {
            if ('strokes' in node) {
              var strokes = JSON.parse(JSON.stringify(node.strokes));
              for (var si = 0; si < strokes.length; si++) {
                if (strokes[si].boundVariables && strokes[si].boundVariables.color) {
                  var strokeVarId = strokes[si].boundVariables.color.id;
                  if (strokeVarId === currentVariable.id && oldIdToNewVariable[strokeVarId]) {
                    var repS = oldIdToNewVariable[strokeVarId];
                    strokes[si] = {
                      type: strokes[si].type,
                      color: strokes[si].color,
                      visible: strokes[si].visible,
                      opacity: strokes[si].opacity,
                      blendMode: strokes[si].blendMode,
                      boundVariables: { color: { type: 'VARIABLE_ALIAS', id: repS.id } }
                    };
                  }
                }
              }
              node.strokes = strokes;
              replacementCount++;
            }
          } else if (SUPPORTED_BOUND_PROPERTIES[property]) {
            node.setBoundVariable(property, replacementVariable);
            replacementCount++;
          }
        } catch (apiError) {
          console.warn('Rebind:', property, apiError && apiError.message);
          skippedCount++;
        }
      }
    }
  }

  return { replaced: replacementCount, skipped: skippedCount };
}

/** Walk a JSON tree and replace any `id` that exists in oldIdToNew (variable id → new Variable). Returns number of replacements. */
function replaceVariableIdsInObject(o, oldIdToNew) {
  var n = 0;
  function walk(node) {
    if (node == null || typeof node !== 'object') return;
    if (typeof node.id === 'string' && oldIdToNew[node.id]) {
      node.id = oldIdToNew[node.id].id;
      n++;
    }
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(node[i]);
      return;
    }
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) walk(node[k]);
    }
  }
  walk(o);
  return n;
}

/**
 * Rebind local style definitions that still point at merged (source) variables.
 */
async function rebindMergeStyles(oldIdToNew) {
  var styleBindingCount = 0;

  var textStyles = await figma.getLocalTextStylesAsync();
  for (var ti = 0; ti < textStyles.length; ti++) {
    var tStyle = textStyles[ti];
    if (tStyle.remote || !tStyle.boundVariables) continue;
    var tProps = Object.keys(tStyle.boundVariables);
    for (var tp = 0; tp < tProps.length; tp++) {
      var tProp = tProps[tp];
      var tBinding = tStyle.boundVariables[tProp];
      if (!tBinding) continue;
      var tAlias = Array.isArray(tBinding) ? tBinding[0] : tBinding;
      if (!tAlias || typeof tAlias.id !== 'string') continue;
      var tRep = oldIdToNew[tAlias.id];
      if (!tRep) continue;
      var tCur = await figma.variables.getVariableByIdAsync(tAlias.id);
      if (!tCur || tCur.resolvedType !== tRep.resolvedType) continue;
      try {
        tStyle.setBoundVariable(tProp, tRep);
        styleBindingCount++;
      } catch (e) {
        console.warn('Merge: text style', tStyle.name, tProp, e && e.message);
      }
    }
  }

  var paintStyles = await figma.getLocalPaintStylesAsync();
  for (var pi = 0; pi < paintStyles.length; pi++) {
    var pStyle = paintStyles[pi];
    if (pStyle.remote || !pStyle.boundVariables || !pStyle.boundVariables.paints || !pStyle.paints) continue;
    var pbv = pStyle.boundVariables.paints;
    var pPaints = JSON.parse(JSON.stringify(pStyle.paints));
    var pChanged = false;
    for (var pj = 0; pj < pPaints.length && pj < pbv.length; pj++) {
      var pAlias = pbv[pj];
      if (!pAlias || typeof pAlias.id !== 'string') continue;
      var pRep = oldIdToNew[pAlias.id];
      if (!pRep) continue;
      var pCur = await figma.variables.getVariableByIdAsync(pAlias.id);
      if (!pCur || pCur.resolvedType !== 'COLOR' || pRep.resolvedType !== 'COLOR') continue;
      if (pPaints[pj].type === 'SOLID' || pPaints[pj].boundVariables) {
        if (!pPaints[pj].boundVariables) pPaints[pj].boundVariables = {};
        pPaints[pj].boundVariables.color = { type: 'VARIABLE_ALIAS', id: pRep.id };
        pChanged = true;
        styleBindingCount++;
      }
    }
    if (pChanged) {
      try {
        pStyle.paints = pPaints;
      } catch (e) {
        console.warn('Merge: paint style', pStyle.name, e && e.message);
      }
    }
  }

  var effectStyles = await figma.getLocalEffectStylesAsync();
  for (var ei = 0; ei < effectStyles.length; ei++) {
    var eStyle = effectStyles[ei];
    if (eStyle.remote) continue;
    if (eStyle.boundVariables) {
      var eBv = JSON.parse(JSON.stringify(eStyle.boundVariables));
      var eN1 = replaceVariableIdsInObject(eBv, oldIdToNew);
      if (eN1 > 0) {
        try {
          eStyle.boundVariables = eBv;
          styleBindingCount += eN1;
        } catch (e) {
          console.warn('Merge: effect style boundVariables', eStyle.name, e && e.message);
        }
      }
    }
    if (eStyle.effects && eStyle.effects.length) {
      var eEff = JSON.parse(JSON.stringify(eStyle.effects));
      var eN2 = replaceVariableIdsInObject(eEff, oldIdToNew);
      if (eN2 > 0) {
        try {
          eStyle.effects = eEff;
          styleBindingCount += eN2;
        } catch (e) {
          console.warn('Merge: effect style effects', eStyle.name, e && e.message);
        }
      }
    }
  }

  if (typeof figma.getLocalGridStylesAsync === 'function') {
    try {
      var gridStyles = await figma.getLocalGridStylesAsync();
      for (var gi = 0; gi < gridStyles.length; gi++) {
        var gStyle = gridStyles[gi];
        if (gStyle.remote || !gStyle.boundVariables) continue;
        var gBv = JSON.parse(JSON.stringify(gStyle.boundVariables));
        var gN = replaceVariableIdsInObject(gBv, oldIdToNew);
        if (gN > 0) {
          try {
            gStyle.boundVariables = gBv;
            styleBindingCount += gN;
          } catch (e) {
            console.warn('Merge: grid style', gStyle.name, e && e.message);
          }
        }
      }
    } catch (e) {
      console.warn('Merge: grid styles', e && e.message);
    }
  }

  return styleBindingCount;
}

async function mergeCollections(sourceCol, targetCol, preserveModesStr) {
  var groupPrefix = normalizeVariableName(sourceCol.name);
  if (!groupPrefix) {
    throw new Error('Source collection name is empty');
  }

  var explicitPairs = parseModeMappings(preserveModesStr || '');
  var hasExplicitMapping = explicitPairs.length > 0;
  var modeMap = hasExplicitMapping ? buildModeIdMap(sourceCol, targetCol, preserveModesStr) : null;
  var oldIdToNew = {};
  var created = 0;
  var updated = 0;

  for (var vi = 0; vi < sourceCol.variableIds.length; vi++) {
    var vid = sourceCol.variableIds[vi];
    var srcVar = await figma.variables.getVariableByIdAsync(vid);
    if (!srcVar) continue;

    var newName = normalizeVariableName(groupPrefix + '/' + srcVar.name);
    var existing = null;
    for (var tj = 0; tj < targetCol.variableIds.length; tj++) {
      var tv = await figma.variables.getVariableByIdAsync(targetCol.variableIds[tj]);
      if (tv && tv.name === newName) {
        existing = tv;
        break;
      }
    }

    var destVar = existing;
    if (!destVar) {
      destVar = figma.variables.createVariable(newName, targetCol, srcVar.resolvedType);
      created++;
    } else {
      if (destVar.resolvedType !== srcVar.resolvedType) {
        console.warn('Skip merge (type mismatch):', newName, srcVar.resolvedType, 'vs', destVar.resolvedType);
        continue;
      }
      updated++;
    }

    if (srcVar.description) destVar.description = srcVar.description;
    if (srcVar.scopes && srcVar.scopes.length > 0) {
      destVar.scopes = srcVar.scopes.slice();
    }

    if (!hasExplicitMapping) {
      if (!sourceCol.modes || sourceCol.modes.length === 0) {
        console.warn('Merge variables: source collection has no modes, skip:', newName);
      } else {
        var firstSrcModeId = sourceCol.modes[0].modeId;
        var broadcastVal = srcVar.valuesByMode[firstSrcModeId];
        if (broadcastVal !== undefined) {
          for (var ti = 0; ti < targetCol.modes.length; ti++) {
            try {
              destVar.setValueForMode(targetCol.modes[ti].modeId, broadcastVal);
            } catch (e) {
              console.warn('setValueForMode', newName, e && e.message);
            }
          }
        }
      }
    } else {
      for (var smi = 0; smi < sourceCol.modes.length; smi++) {
        var smode = sourceCol.modes[smi];
        var tModeId = modeMap[smode.modeId];
        if (!tModeId) continue;
        var val = srcVar.valuesByMode[smode.modeId];
        if (val !== undefined) {
          try {
            destVar.setValueForMode(tModeId, val);
          } catch (e) {
            console.warn('setValueForMode', newName, e && e.message);
          }
        }
      }
    }

    oldIdToNew[srcVar.id] = destVar;
  }

  var rebindStats = await rebindDocument(oldIdToNew);
  var styleBindings = await rebindMergeStyles(oldIdToNew);

  var collectionRemoved = false;
  if (typeof sourceCol.remove === 'function') {
    try {
      sourceCol.remove();
      collectionRemoved = true;
    } catch (e) {
      console.warn('Merge: collection.remove failed, removing variables individually:', e && e.message);
    }
  }
  if (!collectionRemoved) {
    var idsFallback = sourceCol.variableIds ? sourceCol.variableIds.slice() : [];
    for (var ri = 0; ri < idsFallback.length; ri++) {
      var rv = await figma.variables.getVariableByIdAsync(idsFallback[ri]);
      if (rv) {
        try {
          rv.remove();
        } catch (e2) {
          console.warn('Could not remove variable:', rv.name, e2 && e2.message);
        }
      }
    }
  }

  return {
    created: created,
    updated: updated,
    rebindReplaced: rebindStats.replaced,
    rebindSkipped: rebindStats.skipped,
    styleBindings: styleBindings,
    collectionRemoved: collectionRemoved
  };
}

(async function() {
  try {
    var srcName = (typeof sourceCollection !== 'undefined' && sourceCollection != null)
      ? String(sourceCollection).trim() : '';
    var tgtName = (typeof collectionToMergeTo !== 'undefined' && collectionToMergeTo != null)
      ? String(collectionToMergeTo).trim() : '';
    var modesStr = (typeof preserveModes !== 'undefined' && preserveModes != null)
      ? String(preserveModes) : '';

    if (!srcName || !tgtName) {
      figma.notify('Choose both source and target collections');
      return;
    }
    if (srcName === tgtName) {
      figma.notify('Source and target must be different collections');
      return;
    }

    var local = await figma.variables.getLocalVariableCollectionsAsync();
    var sourceCol = local.find(function(c) { return c.name === srcName; });
    var targetCol = local.find(function(c) { return c.name === tgtName; });
    if (!sourceCol) {
      figma.notify('Source collection not found: ' + srcName);
      return;
    }
    if (!targetCol) {
      figma.notify('Target collection not found: ' + tgtName);
      return;
    }

    var stats = await mergeCollections(sourceCol, targetCol, modesStr);
    figma.notify(
      'Merged into "' + tgtName + '": +' + stats.created + ' vars. ' +
      stats.rebindReplaced + ' layer + ' + stats.styleBindings + ' style bindings. ' +
      (stats.collectionRemoved ? 'Source collection removed.' : 'Source collection removal incomplete — see console.')
    );
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    console.error('Merge variable collections:', msg);
    figma.notify('Merge failed: ' + msg);
  }
})();
