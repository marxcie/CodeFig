// Copy or move variables
// @DOC_START
// Copies or moves variable **definitions** from a source collection (optional group and mode)
// into a target collection (optional group and mode). Matching names in the target are
// overwritten. **Move** rebinds this file’s layers and local styles to the new variables, then
// removes the source variables (and the source collection when it is empty and unpublished).
// **Copy** leaves the source and its bindings alone.
//
// ## Overview
// Empty **Group** = every variable in the collection. Empty **Mode** on both sides = every source
// mode, matched by name on the target (missing target modes are created). Source mode set + target
// mode set = only that mode’s values are written. Target mode may be a new name.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | sourceCollection / targetCollection | Local collections (pickers, exact name). |
// | sourceGroup / targetGroup | Path prefix filter / destination prefix. Empty = none. |
// | sourceMode / targetMode | Mode filter / destination mode. Empty = all / match by name. |
// | moveOrCopy | **Move** (rebind + remove source) or **Copy** (duplicate only). |
//
// **Not a search pattern.** Collection pickers are identifiers, not `*` / regex matching.
// @DOC_END

// @UI_CONFIG_START
var sourceCollection = '';
var sourceGroup = '';
var sourceMode = '';
var targetCollection = '';
var targetGroup = '';
var targetMode = '';
var moveOrCopy = 'Move';
// @UI_CONFIG_END

// @PANEL_START
// {
//   "blocks": [
//     { "type": "heading", "text": "Source" },
//     { "key": "sourceCollection", "type": "collection", "label": "Collection" },
//     { "key": "sourceGroup", "type": "string", "label": "Group", "placeholder": "color" },
//     { "type": "paragraph", "attachTo": "previous",
//       "text": "Only variables under this path. Leave empty for the whole collection." },
//     { "key": "sourceMode", "type": "mode", "label": "Mode", "collection": "sourceCollection" },
//     { "type": "paragraph", "attachTo": "previous",
//       "text": "Only this mode’s values. Leave empty to take every mode." },
//     { "type": "divider" },
//     { "type": "heading", "text": "Target" },
//     { "key": "targetCollection", "type": "collection", "label": "Collection" },
//     { "key": "targetGroup", "type": "string", "label": "Group", "placeholder": "brand" },
//     { "type": "paragraph", "attachTo": "previous",
//       "text": "Destination path prefix. Leave empty to keep each variable’s name under the source group." },
//     { "key": "targetMode", "type": "mode", "label": "Mode", "collection": "targetCollection" },
//     { "type": "paragraph", "attachTo": "previous",
//       "text": "Mode to write into. Pick an existing one or New mode. Leave empty to match source modes by name." },
//     { "type": "divider" },
//     { "key": "moveOrCopy", "type": "radio", "label": "Move or copy", "options": ["Move", "Copy"] },
//     { "type": "paragraph", "attachTo": "previous",
//       "text": "Move rebinds this file and removes the source variables. Copy leaves the source alone." }
//   ]
// }
// @PANEL_END

function normalizeVariableName(name) {
  if (typeof name !== 'string') return name;
  return name.replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
}

function normalizeGroup(g) {
  return normalizeVariableName(String(g == null ? '' : g).trim());
}

function variableInSourceGroup(varName, sourceGroup) {
  var g = normalizeGroup(sourceGroup);
  if (!g) return true;
  var n = normalizeVariableName(varName);
  return n === g || n.indexOf(g + '/') === 0;
}

function destVariableName(srcName, sourceGroup, targetGroup) {
  var n = normalizeVariableName(srcName);
  var sg = normalizeGroup(sourceGroup);
  var tg = normalizeGroup(targetGroup);
  var relative = n;
  if (sg) {
    if (n === sg) relative = '';
    else if (n.indexOf(sg + '/') === 0) relative = n.slice(sg.length + 1);
  }
  if (tg && relative) return normalizeVariableName(tg + '/' + relative);
  if (tg && !relative) return tg;
  return relative || n;
}

function findModeByName(col, name) {
  var want = String(name == null ? '' : name).trim();
  if (!want || !col || !col.modes) return null;
  for (var i = 0; i < col.modes.length; i++) {
    if (col.modes[i].name === want) return col.modes[i];
  }
  return null;
}

function ensureTargetMode(targetCol, modeName) {
  var want = String(modeName == null ? '' : modeName).trim();
  if (!want) return null;
  var existing = findModeByName(targetCol, want);
  if (existing) return existing.modeId;
  if (typeof targetCol.addMode !== 'function') {
    throw new Error('Cannot create mode "' + want + '" on target collection');
  }
  return targetCol.addMode(want);
}

/**
 * Build list of { sourceModeId, targetModeId } pairs for this run.
 * Empty source + empty target → every source mode → same-named target mode (created if needed).
 * Source set + target set → that pair only.
 * Source set + target empty → source mode → same-named target mode.
 * Source empty + target set → first source mode → that target mode.
 */
function buildModePairs(sourceCol, targetCol, sourceModeName, targetModeName) {
  var srcWant = String(sourceModeName == null ? '' : sourceModeName).trim();
  var tgtWant = String(targetModeName == null ? '' : targetModeName).trim();
  if (!sourceCol.modes || sourceCol.modes.length === 0) {
    throw new Error('Source collection has no modes');
  }
  var pairs = [];
  if (srcWant && tgtWant) {
    var sm = findModeByName(sourceCol, srcWant);
    if (!sm) throw new Error('Source mode not found: ' + srcWant);
    pairs.push({ sourceModeId: sm.modeId, targetModeId: ensureTargetMode(targetCol, tgtWant) });
    return pairs;
  }
  if (srcWant && !tgtWant) {
    var smOnly = findModeByName(sourceCol, srcWant);
    if (!smOnly) throw new Error('Source mode not found: ' + srcWant);
    pairs.push({
      sourceModeId: smOnly.modeId,
      targetModeId: ensureTargetMode(targetCol, smOnly.name)
    });
    return pairs;
  }
  if (!srcWant && tgtWant) {
    pairs.push({
      sourceModeId: sourceCol.modes[0].modeId,
      targetModeId: ensureTargetMode(targetCol, tgtWant)
    });
    return pairs;
  }
  for (var i = 0; i < sourceCol.modes.length; i++) {
    var mode = sourceCol.modes[i];
    pairs.push({
      sourceModeId: mode.modeId,
      targetModeId: ensureTargetMode(targetCol, mode.name)
    });
  }
  return pairs;
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
 * Rebind local style definitions that still point at moved (source) variables.
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
        console.warn('Copy/move: text style', tStyle.name, tProp, e && e.message);
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
        console.warn('Copy/move: paint style', pStyle.name, e && e.message);
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
          console.warn('Copy/move: effect style boundVariables', eStyle.name, e && e.message);
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
          console.warn('Copy/move: effect style effects', eStyle.name, e && e.message);
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
            console.warn('Copy/move: grid style', gStyle.name, e && e.message);
          }
        }
      }
    } catch (e) {
      console.warn('Copy/move: grid styles', e && e.message);
    }
  }

  return styleBindingCount;
}

/** Rebind VARIABLE_ALIAS values inside local variable definitions that still point at moved ids. */
async function rebindVariableTableAliases(oldIdToNew) {
  var n = 0;
  var local = await figma.variables.getLocalVariableCollectionsAsync();
  for (var ci = 0; ci < local.length; ci++) {
    var col = local[ci];
    for (var vi = 0; vi < col.variableIds.length; vi++) {
      var host = await figma.variables.getVariableByIdAsync(col.variableIds[vi]);
      if (!host || !host.valuesByMode) continue;
      var modeIds = Object.keys(host.valuesByMode);
      for (var mi = 0; mi < modeIds.length; mi++) {
        var modeId = modeIds[mi];
        var val = host.valuesByMode[modeId];
        if (!val || typeof val !== 'object' || val.type !== 'VARIABLE_ALIAS' || typeof val.id !== 'string') continue;
        var rep = oldIdToNew[val.id];
        if (!rep) continue;
        try {
          host.setValueForMode(modeId, { type: 'VARIABLE_ALIAS', id: rep.id });
          n++;
        } catch (e) {
          console.warn('Copy/move: variable alias', host.name, e && e.message);
        }
      }
    }
  }
  return n;
}

async function findVariableByNameInCollection(col, name) {
  var want = normalizeVariableName(name);
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = await figma.variables.getVariableByIdAsync(col.variableIds[i]);
    if (v && normalizeVariableName(v.name) === want) return v;
  }
  return null;
}

/**
 * @param {{ sourceCol, targetCol, sourceGroup, targetGroup, sourceMode, targetMode, isMove }} opts
 */
async function copyOrMoveVariables(opts) {
  var sourceCol = opts.sourceCol;
  var targetCol = opts.targetCol;
  var sourceGroup = opts.sourceGroup;
  var targetGroup = opts.targetGroup;
  var isMove = opts.isMove === true;
  var modePairs = buildModePairs(sourceCol, targetCol, opts.sourceMode, opts.targetMode);
  var oldIdToNew = {};
  var created = 0;
  var updated = 0;
  var skipped = 0;
  var sourceIdsToRemove = [];

  for (var vi = 0; vi < sourceCol.variableIds.length; vi++) {
    var vid = sourceCol.variableIds[vi];
    var srcVar = await figma.variables.getVariableByIdAsync(vid);
    if (!srcVar) continue;
    if (!variableInSourceGroup(srcVar.name, sourceGroup)) continue;

    var newName = destVariableName(srcVar.name, sourceGroup, targetGroup);
    if (!newName) {
      console.warn('Copy/move: empty destination name for', srcVar.name);
      skipped++;
      continue;
    }

    var sameSlot = sourceCol.id === targetCol.id && normalizeVariableName(srcVar.name) === normalizeVariableName(newName);
    var destVar = sameSlot ? srcVar : await findVariableByNameInCollection(targetCol, newName);

    if (!destVar) {
      destVar = figma.variables.createVariable(newName, targetCol, srcVar.resolvedType);
      created++;
    } else if (!sameSlot) {
      if (destVar.resolvedType !== srcVar.resolvedType) {
        console.warn('Skip (type mismatch):', newName, srcVar.resolvedType, 'vs', destVar.resolvedType);
        skipped++;
        continue;
      }
      updated++;
    } else {
      updated++;
    }

    if (srcVar.description) destVar.description = srcVar.description;
    if (srcVar.scopes && srcVar.scopes.length > 0) {
      destVar.scopes = srcVar.scopes.slice();
    }

    var fallbackVal = undefined;
    for (var pi = 0; pi < modePairs.length; pi++) {
      var pair = modePairs[pi];
      var val = srcVar.valuesByMode[pair.sourceModeId];
      if (val === undefined) continue;
      if (fallbackVal === undefined) fallbackVal = val;
      try {
        destVar.setValueForMode(pair.targetModeId, val);
      } catch (e) {
        console.warn('setValueForMode', newName, e && e.message);
      }
    }

    // New variables need a value in every target mode; fill gaps from the first copied value.
    if (fallbackVal !== undefined && targetCol.modes) {
      for (var ti = 0; ti < targetCol.modes.length; ti++) {
        var tModeId = targetCol.modes[ti].modeId;
        if (destVar.valuesByMode[tModeId] !== undefined) continue;
        try {
          destVar.setValueForMode(tModeId, fallbackVal);
        } catch (e) {
          console.warn('setValueForMode (fill)', newName, e && e.message);
        }
      }
    }

    if (!sameSlot) {
      oldIdToNew[srcVar.id] = destVar;
      if (isMove) sourceIdsToRemove.push(srcVar);
    }
  }

  var rebindStats = { replaced: 0, skipped: 0 };
  var styleBindings = 0;
  var aliasBindings = 0;
  if (isMove && Object.keys(oldIdToNew).length > 0) {
    rebindStats = await rebindDocument(oldIdToNew);
    styleBindings = await rebindMergeStyles(oldIdToNew);
    aliasBindings = await rebindVariableTableAliases(oldIdToNew);
  }

  var variablesRemoved = 0;
  if (isMove) {
    for (var ri = 0; ri < sourceIdsToRemove.length; ri++) {
      try {
        sourceIdsToRemove[ri].remove();
        variablesRemoved++;
      } catch (e) {
        console.warn('Copy/move: could not remove source variable', sourceIdsToRemove[ri].name, e && e.message);
      }
    }
  }

  var collectionRemoved = false;
  if (isMove && sourceCol.variableIds.length === 0) {
    var publishStatus = 'UNPUBLISHED';
    try {
      if (typeof sourceCol.getPublishStatusAsync === 'function') {
        publishStatus = await sourceCol.getPublishStatusAsync();
      }
    } catch (e) {
      publishStatus = 'UNKNOWN';
    }
    if (publishStatus !== 'UNPUBLISHED') {
      console.warn(
        'Copy/move: "' + sourceCol.name + '" is published (' + publishStatus + '), so it was NOT removed.\n' +
        '  Its variables were moved and this file was rebound, but other files subscribe to these ' +
        'variables by key. Deleting it would leave them with missing variables they cannot relink.\n' +
        '  Delete it yourself in the Variables panel once you know nothing depends on it.'
      );
    } else if (typeof sourceCol.remove === 'function') {
      try {
        sourceCol.remove();
        collectionRemoved = true;
      } catch (e) {
        console.warn('Copy/move: collection.remove failed:', e && e.message);
      }
    }
  }

  return {
    created: created,
    updated: updated,
    skipped: skipped,
    rebindReplaced: rebindStats.replaced,
    rebindSkipped: rebindStats.skipped,
    styleBindings: styleBindings,
    aliasBindings: aliasBindings,
    variablesRemoved: variablesRemoved,
    collectionRemoved: collectionRemoved
  };
}

(async function() {
  try {
    var srcName = (typeof sourceCollection !== 'undefined' && sourceCollection != null)
      ? String(sourceCollection).trim() : '';
    var tgtName = (typeof targetCollection !== 'undefined' && targetCollection != null)
      ? String(targetCollection).trim() : '';
    // Prefer new keys; fall back to the old merge field name if a pasted config still has it.
    if (!tgtName && typeof collectionToMergeTo !== 'undefined' && collectionToMergeTo != null) {
      tgtName = String(collectionToMergeTo).trim();
    }
    var srcGroup = (typeof sourceGroup !== 'undefined' && sourceGroup != null) ? String(sourceGroup) : '';
    var tgtGroup = (typeof targetGroup !== 'undefined' && targetGroup != null) ? String(targetGroup) : '';
    var srcMode = (typeof sourceMode !== 'undefined' && sourceMode != null) ? String(sourceMode) : '';
    var tgtMode = (typeof targetMode !== 'undefined' && targetMode != null) ? String(targetMode) : '';
    var action = (typeof moveOrCopy !== 'undefined' && moveOrCopy != null)
      ? String(moveOrCopy).trim() : 'Move';
    var isMove = action !== 'Copy';

    if (!srcName || !tgtName) {
      figma.notify('Choose both source and target collections');
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
      targetCol = figma.variables.createVariableCollection(tgtName);
    }

    var stats = await copyOrMoveVariables({
      sourceCol: sourceCol,
      targetCol: targetCol,
      sourceGroup: srcGroup,
      targetGroup: tgtGroup,
      sourceMode: srcMode,
      targetMode: tgtMode,
      isMove: isMove
    });

    var verb = isMove ? 'Moved' : 'Copied';
    var msg = verb + ' into "' + tgtName + '": +' + stats.created + ' created, ' +
      stats.updated + ' updated';
    if (isMove) {
      msg += '. ' + stats.rebindReplaced + ' layer + ' + stats.styleBindings + ' style + ' +
        stats.aliasBindings + ' alias bindings. Removed ' + stats.variablesRemoved + ' source var(s).';
      if (stats.collectionRemoved) msg += ' Source collection removed.';
    }
    figma.notify(msg);
  } catch (err) {
    var errMsg = err instanceof Error ? err.message : String(err);
    console.error('Copy or move variables:', errMsg);
    figma.notify('Copy/move failed: ' + errMsg);
  }
})();
