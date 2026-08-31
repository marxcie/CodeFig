/**
 * Foundation metadata maintenance — clear-case repair of CodeFig plugin data.
 *
 * Lives in `src/` (not `@foundation.js`) so the plugin backend can run it on every open
 * without going through `@import`. Keep `reconcileFoundation` read-only; this is the write
 * path for housekeeping only.
 *
 * Rules (plan 39):
 * - Never delete variables, collections, or styles
 * - No UI toast / InfoPanel — caller logs to console / bridge only
 * - Ambiguous cases (e.g. two groups claiming one set id while a manifest still exists) → leave alone
 *
 * `planFoundationMaintenance(snapshot)` is pure and unit-tested. `runFoundationMaintain(figma, log)`
 * gathers a snapshot from the document and applies the plan.
 */

'use strict';

var NS = 'codefig';
var REGISTRY_KEY = 'registry';
var STAMP_KEY = 'stamp';

function viewportLabel(key) {
  if (!key || typeof key !== 'string') return 'Default';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function viewportKeyFromLabel(label) {
  if (!label || typeof label !== 'string') return '';
  var slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return slug.replace(/^-+/, '').replace(/-+$/, '');
}

function normaliseViewport(entry) {
  if (!entry || typeof entry !== 'object') return null;
  var key = typeof entry.key === 'string' ? entry.key.trim() : '';
  var label = typeof entry.label === 'string' ? entry.label.trim() : '';
  if (!key && !label) return null;
  if (!key) key = viewportKeyFromLabel(label);
  if (!label) label = viewportLabel(key);
  if (!key) return null;
  var width = typeof entry.width === 'number' && isFinite(entry.width) ? entry.width : null;
  return { key: key, label: label, width: width };
}

function sortViewports(viewports) {
  var decorated = (viewports || []).map(function (v, i) {
    return { v: v, i: i };
  });
  decorated.sort(function (a, b) {
    var aw = a.v && typeof a.v.width === 'number' ? a.v.width : null;
    var bw = b.v && typeof b.v.width === 'number' ? b.v.width : null;
    if (aw === null && bw === null) return a.i - b.i;
    if (aw === null) return 1;
    if (bw === null) return -1;
    if (aw !== bw) return aw - bw;
    return a.i - b.i;
  });
  return decorated.map(function (d) {
    return d.v;
  });
}

function parseRegistry(text) {
  var raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return null;
  var parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.v !== 1 || !Array.isArray(parsed.viewports)) return null;
  var viewports = [];
  for (var i = 0; i < parsed.viewports.length; i++) {
    var v = normaliseViewport(parsed.viewports[i]);
    if (v) viewports.push(v);
  }
  return { v: 1, viewports: viewports };
}

function serialiseRegistry(viewports) {
  var normalised = [];
  for (var i = 0; i < (viewports || []).length; i++) {
    var v = normaliseViewport(viewports[i]);
    if (v) normalised.push(v);
  }
  return JSON.stringify({ v: 1, viewports: sortViewports(normalised) });
}

function foundationSetIdFromKey(key) {
  var text = String(key == null ? '' : key);
  if (text.indexOf('set:') !== 0) return '';
  var rest = text.slice(4);
  var cut = rest.indexOf(':');
  return cut === -1 ? '' : rest.slice(cut + 1);
}

function parseManifest(text) {
  var raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return null;
  var parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    id: parsed.id == null ? '' : String(parsed.id),
    domain: String(parsed.domain || ''),
    group: parsed.group == null ? '' : String(parsed.group)
  };
}

function readStampFrom(text) {
  var raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return null;
  var parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!parsed || parsed.owner !== 'dsf') return null;
  return parsed;
}

/** Group prefix for a stamped variable name (same inverse as deriveSetGroup). */
function groupOfStamp(name, token) {
  var full = String(name == null ? '' : name);
  var tok = String(token == null ? '' : token);
  if (!tok || full.length < tok.length) return null;
  if (full.slice(full.length - tok.length) !== tok) return null;
  return full.slice(0, full.length - tok.length).replace(/\/+$/, '');
}

/**
 * True when a registry viewport matches a collection mode name (label or key).
 */
function modeMatchesViewport(modeName, viewport) {
  if (!viewport) return false;
  var name = String(modeName || '');
  if (!name) return false;
  if (name === viewport.label || name === viewport.key) return true;
  var asKey = viewportKeyFromLabel(name);
  return !!(asKey && asKey === viewport.key);
}

/**
 * Pure plan from a document snapshot.
 *
 * snapshot = {
 *   registry: { v, viewports } | null,
 *   modes: [{ name }]  // every local collection mode (flat is enough for materialisation)
 *   collections: [{
 *     id, name,
 *     manifests: [{ key, id, domain }],  // id may be derived from key when missing on the blob
 *     stamps: [{ variableId, domain, set, token, name }]
 *   }]
 * }
 *
 * → {
 *   removeRegistryKeys: [viewportKey],
 *   keepRegistryViewports: [...] | null,  // null = leave registry untouched
 *   deleteManifestKeys: [{ collectionId, collectionName, key, setId }],
 *   clearStamps: [{ collectionId, collectionName, variableId, setId, reason }],
 *   skippedAmbiguous: [{ code, detail }]
 * }
 */
function planFoundationMaintenance(snapshot) {
  var src = snapshot || {};
  var removeRegistryKeys = [];
  var keepRegistryViewports = null;
  var deleteManifestKeys = [];
  var clearStamps = [];
  var skippedAmbiguous = [];

  var modes = src.modes || [];
  var registry = src.registry;

  // 1. Registry viewport with no matching mode in any local collection → drop it.
  //    (Also covers "collection deleted outside CodeFig": its modes vanish with it.)
  if (registry && Array.isArray(registry.viewports)) {
    keepRegistryViewports = [];
    for (var vi = 0; vi < registry.viewports.length; vi++) {
      var vp = normaliseViewport(registry.viewports[vi]);
      if (!vp) continue;
      var materialised = false;
      for (var mi = 0; mi < modes.length; mi++) {
        if (modeMatchesViewport(modes[mi] && modes[mi].name, vp)) {
          materialised = true;
          break;
        }
      }
      if (materialised) {
        keepRegistryViewports.push(vp);
      } else {
        removeRegistryKeys.push(vp.key);
      }
    }
  }

  var collections = src.collections || [];
  for (var ci = 0; ci < collections.length; ci++) {
    var col = collections[ci] || {};
    var manifests = col.manifests || [];
    var stamps = col.stamps || [];

    // Index manifests by set id.
    var manifestBySetId = {};
    for (var mfi = 0; mfi < manifests.length; mfi++) {
      var mf = manifests[mfi];
      if (!mf || !mf.key) continue;
      var setId = mf.id || foundationSetIdFromKey(mf.key);
      if (!setId) continue;
      manifestBySetId[setId] = mf;
    }

    // Count stamped tokens per set id, and groups claiming each set id.
    var stampCountBySet = {};
    var groupsBySet = {};
    for (var si = 0; si < stamps.length; si++) {
      var st = stamps[si];
      if (!st) continue;
      var sid = st.set == null ? '' : String(st.set);
      if (!sid) continue; // legacy stamps without set id — ambiguous; leave alone
      stampCountBySet[sid] = (stampCountBySet[sid] || 0) + 1;
      var g = groupOfStamp(st.name, st.token);
      if (g == null) g = '';
      if (!groupsBySet[sid]) groupsBySet[sid] = {};
      groupsBySet[sid][g] = true;
    }

    // Ambiguous: two+ groups claim one set id that still has a manifest → leave alone.
    for (var ambId in groupsBySet) {
      if (!Object.prototype.hasOwnProperty.call(groupsBySet, ambId)) continue;
      if (!manifestBySetId[ambId]) continue;
      var groupNames = Object.keys(groupsBySet[ambId]);
      if (groupNames.length > 1) {
        skippedAmbiguous.push({
          code: 'ambiguous-set-groups',
          detail: {
            collection: col.name || '',
            setId: ambId,
            groups: groupNames
          }
        });
      }
    }

    // 2. Manifest set:* with no remaining stamped tokens for that set id → delete key.
    for (var mid in manifestBySetId) {
      if (!Object.prototype.hasOwnProperty.call(manifestBySetId, mid)) continue;
      if ((stampCountBySet[mid] || 0) > 0) continue;
      var doomed = manifestBySetId[mid];
      deleteManifestKeys.push({
        collectionId: col.id,
        collectionName: col.name || '',
        key: doomed.key,
        setId: mid
      });
    }

    // 3. Stamp whose set id has no matching manifest on the same collection → clear stamp.
    //    Leave legacy (empty set) alone. Leave alone is automatic when a manifest exists,
    //    including the ambiguous multi-group case above.
    for (var sti = 0; sti < stamps.length; sti++) {
      var stamp = stamps[sti];
      if (!stamp || stamp.variableId == null) continue;
      var stampSet = stamp.set == null ? '' : String(stamp.set);
      if (!stampSet) continue;
      if (manifestBySetId[stampSet]) continue;
      clearStamps.push({
        collectionId: col.id,
        collectionName: col.name || '',
        variableId: stamp.variableId,
        setId: stampSet,
        reason: 'no-manifest'
      });
    }
  }

  return {
    removeRegistryKeys: removeRegistryKeys,
    keepRegistryViewports: keepRegistryViewports,
    deleteManifestKeys: deleteManifestKeys,
    clearStamps: clearStamps,
    skippedAmbiguous: skippedAmbiguous
  };
}

function planIsEmpty(plan) {
  if (!plan) return true;
  if (plan.removeRegistryKeys && plan.removeRegistryKeys.length) return false;
  if (plan.deleteManifestKeys && plan.deleteManifestKeys.length) return false;
  if (plan.clearStamps && plan.clearStamps.length) return false;
  return true;
}

/**
 * Gather snapshot, plan, apply. Returns a quiet summary for logs.
 * `log` is optional `(message: string) => void`.
 */
async function runFoundationMaintain(figmaApi, log) {
  var figma = figmaApi;
  var say = typeof log === 'function' ? log : function () {};

  var registryText = '';
  try {
    registryText = figma.root.getSharedPluginData(NS, REGISTRY_KEY) || '';
  } catch (e) {
    registryText = '';
  }
  var registry = parseRegistry(registryText);

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var modes = [];
  var collectionSnapshots = [];

  for (var i = 0; i < (collections || []).length; i++) {
    var collection = collections[i];
    var colModes = collection.modes || [];
    for (var m = 0; m < colModes.length; m++) {
      modes.push({ name: colModes[m].name, modeId: colModes[m].modeId });
    }

    var manifests = [];
    var keys = [];
    try {
      keys = collection.getSharedPluginDataKeys(NS) || [];
    } catch (e2) {
      keys = [];
    }
    for (var k = 0; k < keys.length; k++) {
      if (String(keys[k]).indexOf('set:') !== 0) continue;
      var raw = '';
      try {
        raw = collection.getSharedPluginData(NS, keys[k]) || '';
      } catch (e3) {
        raw = '';
      }
      var parsed = parseManifest(raw);
      if (!parsed) continue;
      var id = parsed.id || foundationSetIdFromKey(keys[k]);
      manifests.push({ key: keys[k], id: id, domain: parsed.domain, group: parsed.group });
    }

    var stamps = [];
    var varIds = collection.variableIds || [];
    for (var v = 0; v < varIds.length; v++) {
      var variable = await figma.variables.getVariableByIdAsync(varIds[v]);
      if (!variable) continue;
      var stampRaw = '';
      try {
        stampRaw = variable.getSharedPluginData(NS, STAMP_KEY) || '';
      } catch (e4) {
        stampRaw = '';
      }
      var stamp = readStampFrom(stampRaw);
      if (!stamp) continue;
      stamps.push({
        variableId: variable.id,
        name: variable.name,
        domain: stamp.domain,
        set: stamp.set || '',
        token: stamp.token
      });
    }

    collectionSnapshots.push({
      id: collection.id,
      name: collection.name,
      manifests: manifests,
      stamps: stamps,
      _collection: collection
    });
  }

  var plan = planFoundationMaintenance({
    registry: registry,
    modes: modes,
    collections: collectionSnapshots
  });

  var summary = {
    removedRegistryViewports: plan.removeRegistryKeys.slice(),
    deletedManifestKeys: plan.deleteManifestKeys.map(function (d) {
      return d.collectionName + '/' + d.key;
    }),
    clearedStamps: plan.clearStamps.length,
    skippedAmbiguous: plan.skippedAmbiguous.length
  };

  if (planIsEmpty(plan) && plan.skippedAmbiguous.length === 0) {
    return summary;
  }

  // Apply registry prune (empty list is a valid write when every viewport was orphaned).
  if (plan.keepRegistryViewports !== null && plan.removeRegistryKeys.length > 0) {
    try {
      figma.root.setSharedPluginData(NS, REGISTRY_KEY, serialiseRegistry(plan.keepRegistryViewports));
    } catch (e5) {
      say('foundationMaintain: registry write failed: ' + (e5 && e5.message ? e5.message : String(e5)));
    }
  }

  // Apply manifest key deletes (empty string clears shared plugin data).
  var colById = {};
  for (var c = 0; c < collectionSnapshots.length; c++) {
    colById[collectionSnapshots[c].id] = collectionSnapshots[c]._collection;
  }
  for (var di = 0; di < plan.deleteManifestKeys.length; di++) {
    var del = plan.deleteManifestKeys[di];
    var targetCol = colById[del.collectionId];
    if (!targetCol) continue;
    try {
      targetCol.setSharedPluginData(NS, del.key, '');
    } catch (e6) {
      say('foundationMaintain: manifest clear failed: ' + del.key);
    }
  }

  // Apply stamp clears.
  for (var ci2 = 0; ci2 < plan.clearStamps.length; ci2++) {
    var clr = plan.clearStamps[ci2];
    try {
      var variable2 = await figma.variables.getVariableByIdAsync(clr.variableId);
      if (variable2) variable2.setSharedPluginData(NS, STAMP_KEY, '');
    } catch (e7) {
      say('foundationMaintain: stamp clear failed: ' + clr.variableId);
    }
  }

  if (!planIsEmpty(plan) || plan.skippedAmbiguous.length) {
    say(
      'foundationMaintain: removedRegistry=' +
        summary.removedRegistryViewports.length +
        ' deletedManifests=' +
        summary.deletedManifestKeys.length +
        ' clearedStamps=' +
        summary.clearedStamps +
        ' skippedAmbiguous=' +
        summary.skippedAmbiguous
    );
  }

  return summary;
}

module.exports = {
  NS: NS,
  REGISTRY_KEY: REGISTRY_KEY,
  STAMP_KEY: STAMP_KEY,
  viewportLabel: viewportLabel,
  viewportKeyFromLabel: viewportKeyFromLabel,
  parseRegistry: parseRegistry,
  serialiseRegistry: serialiseRegistry,
  foundationSetIdFromKey: foundationSetIdFromKey,
  parseManifest: parseManifest,
  readStampFrom: readStampFrom,
  planFoundationMaintenance: planFoundationMaintenance,
  planIsEmpty: planIsEmpty,
  runFoundationMaintain: runFoundationMaintain
};
