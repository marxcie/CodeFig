// Replace style variable bindings
// @DOC_START
// # Replace style variable bindings
// Rebinds **variables on style definitions** (not on layers). Only styles whose name **partially matches** `searchIn` are processed (e.g. `V5` matches `V5 / Text / 3xs / SemiBold`). Bindings that use variables from **Source collection** are swapped to the **same-named variable** in **Target collection** (types must match).
//
// ## Overview
// Walks **local** text, color (paint), and effect styles. Skips remote/library styles. For each bound variable whose collection is the source, looks up a variable with the same name in the target collection (local first, then team library). Text fields use `setBoundVariable`; fills/effects use cloned paints/effects with updated `VARIABLE_ALIAS` ids.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | searchIn | Substring of style name; only those styles are updated. Empty = all local text/paint/effect styles. |
// | sourceCollection | Collection name of variables currently bound on those styles. |
// | targetCollection | Collection where replacement variables are resolved (same variable names as in source). |
// | breakUnmatchedBindings | If true, **detach** source-collection bindings that have **no** matching variable in the target (default: leave those bindings unchanged). You can enable this with an empty target map to strip all source bindings on matching styles. |
// @DOC_END

// @UI_CONFIG_START
// # Replace style variable bindings
var searchIn = ""; // @placeholder="V5"
// Only styles whose name contains this (case-insensitive). Empty = every local text, paint, and effect style.
//
var sourceCollection = ""; // @options: variableCollections
// Variables bound from this collection are replaced (skip “(all collections)” — pick a real collection).
//
var targetCollection = ""; // @options: variableCollections
// Same-named variables in this collection become the new bindings.
// ---
var breakUnmatchedBindings = false;
// If true: bindings from the source collection with **no** same-name variable in the target are **removed** (raw values stay). If false, those bindings are left as-is.
// @UI_CONFIG_END

function styleNameMatches(styleName, searchInVal) {
  var s = searchInVal != null ? String(searchInVal).trim() : '';
  if (!s) return true;
  return String(styleName || '').toLowerCase().indexOf(s.toLowerCase()) !== -1;
}

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

async function collectionNameForVariable(variable) {
  if (!variable) return '';
  try {
    var col = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    return col ? col.name : '';
  } catch (e) {
    return '';
  }
}

/**
 * Map: variableName + tab + resolvedType -> { variable } or { key } for library.
 */
async function buildTargetLookup(targetCollectionName) {
  var name = String(targetCollectionName || '').trim();
  var map = new Map();

  var localCols = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < localCols.length; i++) {
    if (localCols[i].name !== name) continue;
    for (var j = 0; j < localCols[i].variableIds.length; j++) {
      var v = await figma.variables.getVariableByIdAsync(localCols[i].variableIds[j]);
      if (v) {
        map.set(v.name + '\t' + v.resolvedType, { variable: v });
      }
    }
  }

  if (map.size === 0 && figma.teamLibrary && typeof figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync === 'function') {
    try {
      var libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      for (var c = 0; c < libs.length; c++) {
        if (libs[c].name !== name) continue;
        var lvars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libs[c].key);
        for (var k = 0; k < lvars.length; k++) {
          var lv = lvars[k];
          var ty = lv.resolvedType || 'COLOR';
          map.set(lv.name + '\t' + ty, { key: lv.key, resolvedType: ty });
        }
        break;
      }
    } catch (e) {
      console.log('⚠️ Library target lookup: ' + (e && e.message));
    }
  }

  var imported = new Map();
  async function getReplacement(variableName, resolvedType) {
    var key = variableName + '\t' + resolvedType;
    var entry = map.get(key);
    if (!entry) return null;
    if (entry.variable) return entry.variable;
    if (entry.key) {
      if (imported.has(key)) return imported.get(key);
      try {
        var imp = await figma.variables.importVariableByKeyAsync(entry.key);
        if (imp && imp.resolvedType === resolvedType) {
          imported.set(key, imp);
          return imp;
        }
      } catch (e) { }
    }
    return null;
  }

  return { map: map, getReplacement: getReplacement };
}

async function processTextStyle(style, sourceName, lookup, breakUnmatched) {
  if (!style.boundVariables || style.remote) return 0;
  var n = 0;
  var props = Object.keys(style.boundVariables);
  for (var f = 0; f < props.length; f++) {
    var prop = props[f];
    var binding = style.boundVariables[prop];
    if (!binding) continue;
    var alias = Array.isArray(binding) ? binding[0] : binding;
    var current = await resolveVariableFromAlias(alias);
    if (!current) continue;
    var colName = await collectionNameForVariable(current);
    if (colName !== sourceName) continue;
    var repl = await lookup.getReplacement(current.name, current.resolvedType);
    if (repl && repl.id !== current.id) {
      try {
        style.setBoundVariable(prop, repl);
        n++;
        console.log('  ✅ Text style "' + style.name + '" · ' + prop + ' · ' + current.name + ' → target collection');
      } catch (e) {
        console.log('  ❌ ' + style.name + ' · ' + prop + ': ' + (e && e.message));
      }
    } else if (breakUnmatched && !repl) {
      try {
        style.setBoundVariable(prop, null);
        n++;
        console.log('  🔓 Text style "' + style.name + '" · ' + prop + ' · detached (no target match)');
      } catch (e) {
        console.log('  ❌ detach ' + style.name + ' · ' + prop + ': ' + (e && e.message));
      }
    }
  }
  return n;
}

async function processPaintStyle(style, sourceName, lookup, breakUnmatched) {
  if (!style.boundVariables || !style.boundVariables.paints || style.remote) return 0;
  var bv = style.boundVariables.paints;
  if (!Array.isArray(bv) || !style.paints || !style.paints.length) return 0;

  var paints = JSON.parse(JSON.stringify(style.paints));
  var changed = false;
  var n = 0;

  for (var j = 0; j < paints.length && j < bv.length; j++) {
    var alias = bv[j];
    if (!alias || (!alias.id && !alias.key)) continue;
    var current = await resolveVariableFromAlias(alias);
    if (!current) continue;
    var colName = await collectionNameForVariable(current);
    if (colName !== sourceName) continue;
    if (current.resolvedType !== 'COLOR') continue;
    var repl = await lookup.getReplacement(current.name, current.resolvedType);
    if (repl && repl.id !== current.id) {
      if (paints[j].type === 'SOLID' || paints[j].boundVariables) {
        if (!paints[j].boundVariables) paints[j].boundVariables = {};
        paints[j].boundVariables.color = { type: 'VARIABLE_ALIAS', id: repl.id };
        changed = true;
        n++;
      }
    } else if (breakUnmatched && !repl) {
      if (paints[j].boundVariables && paints[j].boundVariables.color) {
        delete paints[j].boundVariables.color;
        if (Object.keys(paints[j].boundVariables).length === 0) {
          delete paints[j].boundVariables;
        }
        changed = true;
        n++;
      }
    }
  }

  if (changed) {
    try {
      style.paints = paints;
      console.log('  ✅ Paint style "' + style.name + '" · ' + n + ' color binding(s)');
    } catch (e) {
      console.log('  ❌ Paint "' + style.name + '": ' + (e && e.message));
      return 0;
    }
  }
  return n;
}

async function processEffectStyle(style, sourceName, lookup, breakUnmatched) {
  if (style.remote || !style.effects || !style.effects.length) return 0;
  var effects = JSON.parse(JSON.stringify(style.effects));
  var ebv = style.boundVariables && style.boundVariables.effects;
  var n = 0;

  for (var j = 0; j < effects.length; j++) {
    if (ebv && Array.isArray(ebv) && ebv[j] && (ebv[j].id || ebv[j].key)) {
      var current = await resolveVariableFromAlias(ebv[j]);
      if (current) {
        var colName = await collectionNameForVariable(current);
        if (colName === sourceName) {
          var repl = await lookup.getReplacement(current.name, current.resolvedType);
          if (repl && repl.id !== current.id) {
            var eff = effects[j];
            if (!eff.boundVariables) eff.boundVariables = {};
            var hit = false;
            for (var k in eff.boundVariables) {
              if (eff.boundVariables.hasOwnProperty(k) && eff.boundVariables[k] && eff.boundVariables[k].id === current.id) {
                eff.boundVariables[k] = { type: 'VARIABLE_ALIAS', id: repl.id };
                hit = true;
                n++;
              }
            }
            if (!hit) {
              eff.boundVariables.color = { type: 'VARIABLE_ALIAS', id: repl.id };
              n++;
            }
          } else if (breakUnmatched && !repl) {
            var eff2 = effects[j];
            var hit2 = false;
            if (eff2.boundVariables) {
              for (var k2 in eff2.boundVariables) {
                if (eff2.boundVariables.hasOwnProperty(k2) && eff2.boundVariables[k2] && eff2.boundVariables[k2].id === current.id) {
                  delete eff2.boundVariables[k2];
                  hit2 = true;
                  n++;
                }
              }
              if (eff2.boundVariables && Object.keys(eff2.boundVariables).length === 0) {
                delete eff2.boundVariables;
              }
            }
            if (!hit2) {
              var ev = JSON.parse(JSON.stringify(eff2));
              if (ev.boundVariables) delete ev.boundVariables;
              effects[j] = ev;
              n++;
            }
          }
        }
      }
    }
    if (!effects[j].boundVariables) continue;
    var keysToDelete = [];
    for (var key in effects[j].boundVariables) {
      if (!effects[j].boundVariables.hasOwnProperty(key)) continue;
      var ent = effects[j].boundVariables[key];
      if (!ent || typeof ent.id !== 'string') continue;
      var cur2 = await resolveVariableFromAlias(ent);
      if (!cur2) continue;
      var cn2 = await collectionNameForVariable(cur2);
      if (cn2 !== sourceName) continue;
      var rep2 = await lookup.getReplacement(cur2.name, cur2.resolvedType);
      if (rep2 && rep2.id !== cur2.id) {
        effects[j].boundVariables[key] = { type: 'VARIABLE_ALIAS', id: rep2.id };
        n++;
      } else if (breakUnmatched && !rep2) {
        keysToDelete.push(key);
        n++;
      }
    }
    for (var kd = 0; kd < keysToDelete.length; kd++) {
      delete effects[j].boundVariables[keysToDelete[kd]];
    }
    if (effects[j].boundVariables && Object.keys(effects[j].boundVariables).length === 0) {
      delete effects[j].boundVariables;
    }
  }

  if (n > 0) {
    try {
      style.effects = effects;
      console.log('  ✅ Effect style "' + style.name + '" · ' + n + ' binding(s)');
    } catch (e) {
      console.log('  ❌ Effect "' + style.name + '": ' + (e && e.message));
      return 0;
    }
  }
  return n;
}

async function main() {
  try {
    var searchInVal = typeof searchIn !== 'undefined' ? searchIn : '';
    var sourceName = (typeof sourceCollection !== 'undefined' && sourceCollection != null) ? String(sourceCollection).trim() : '';
    var targetName = (typeof targetCollection !== 'undefined' && targetCollection != null) ? String(targetCollection).trim() : '';

    if (!sourceName || sourceName === '(all collections)') {
      figma.notify('⚠️ Choose a Source collection (not “all”)');
      return;
    }
    if (!targetName || targetName === '(all collections)') {
      figma.notify('⚠️ Choose a Target collection');
      return;
    }
    if (sourceName === targetName) {
      figma.notify('⚠️ Source and Target collections must differ');
      return;
    }

    console.log('=== Replace style variable bindings ===');
    console.log('searchIn:', searchInVal ? '"' + searchInVal + '"' : '(all styles)');
    console.log('Source collection:', sourceName);
    console.log('Target collection:', targetName);
    var breakUnmatched =
      typeof breakUnmatchedBindings !== 'undefined' && breakUnmatchedBindings === true;
    console.log('breakUnmatchedBindings:', breakUnmatched);

    var lookup = await buildTargetLookup(targetName);
    if (lookup.map.size === 0 && !breakUnmatched) {
      figma.notify('❌ No variables found in target collection: ' + targetName);
      return;
    }

    var total = 0;
    var stylesTouched = 0;

    var textStyles = await figma.getLocalTextStylesAsync();
    for (var t = 0; t < textStyles.length; t++) {
      var ts = textStyles[t];
      if (!styleNameMatches(ts.name, searchInVal)) continue;
      var c = await processTextStyle(ts, sourceName, lookup, breakUnmatched);
      if (c > 0) {
        total += c;
        stylesTouched++;
      }
    }

    var paintStyles = await figma.getLocalPaintStylesAsync();
    for (var p = 0; p < paintStyles.length; p++) {
      var ps = paintStyles[p];
      if (!styleNameMatches(ps.name, searchInVal)) continue;
      var c2 = await processPaintStyle(ps, sourceName, lookup, breakUnmatched);
      if (c2 > 0) {
        total += c2;
        stylesTouched++;
      }
    }

    var effectStyles = await figma.getLocalEffectStylesAsync();
    for (var e = 0; e < effectStyles.length; e++) {
      var es = effectStyles[e];
      if (!styleNameMatches(es.name, searchInVal)) continue;
      var c3 = await processEffectStyle(es, sourceName, lookup, breakUnmatched);
      if (c3 > 0) {
        total += c3;
        stylesTouched++;
      }
    }

    console.log('=== Done ===');
    console.log('Bindings updated:', total, '· Styles modified:', stylesTouched);

    if (total > 0) {
      figma.notify('✅ ' + total + ' binding change(s) on ' + stylesTouched + ' style(s) (replace / detach)');
    } else {
      figma.notify('⚠️ No changes. Check filters, collections, breakUnmatchedBindings, and target variable names.');
    }
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    console.error('replace-style-variable-bindings:', msg);
    figma.notify('❌ ' + msg);
  }
}

main();
