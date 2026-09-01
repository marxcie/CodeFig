/**
 * Foundation metadata maintenance — clear-case repair of CodeFig plugin data.
 *
 * Lives in `src/` (not `@foundation.js`) so the plugin backend can run it on every open
 * without going through `@import`. Keep `reconcileFoundation` read-only; this is the write
 * path for housekeeping only.
 *
 * Rules (plan 39 / DEFERRED §11):
 * - Never delete variables, collections, or styles
 * - No UI toast / InfoPanel — caller logs to console / bridge only
 * - Duplicate / copy = new identity: when two+ groups share one set id, keep stamp+manifest on
 *   the original group; restamp the others under a new set id (forked manifest). When the
 *   original cannot be chosen without inventing, leave alone (`skippedAmbiguous`).
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
 * Figma's native "Duplicate group" appends ` 2`, ` 3`, …; some paste paths use ` Copy`.
 * Used only to break ties when choosing which group keeps a colliding set id.
 */
function looksLikeFigmaCopySuffix(groupName) {
  var g = String(groupName == null ? '' : groupName);
  if (!g) return false;
  if (/\s+\d+$/.test(g)) return true;
  if (/\s+copy$/i.test(g)) return true;
  return false;
}

/**
 * Which group keeps the existing set id when several claim it.
 * Prefer the manifest's last-known `group`; else the single name that is not a Figma copy
 * suffix. Returns null when still ambiguous — do not invent a winner.
 */
function pickKeepGroupForAmbiguousSet(groups, manifestGroup) {
  var list = [];
  var seen = {};
  for (var i = 0; i < (groups || []).length; i++) {
    var g = groups[i] == null ? '' : String(groups[i]);
    if (seen[g]) continue;
    seen[g] = true;
    list.push(g);
  }
  if (list.length < 2) return list.length === 1 ? list[0] : null;

  var want = manifestGroup == null ? '' : String(manifestGroup);
  if (want) {
    for (var m = 0; m < list.length; m++) {
      if (list[m] === want) return list[m];
    }
  }

  var nonCopy = [];
  for (var j = 0; j < list.length; j++) {
    if (!looksLikeFigmaCopySuffix(list[j])) nonCopy.push(list[j]);
  }
  if (nonCopy.length === 1) return nonCopy[0];
  return null;
}

/** Mint a set id (same shape as `@Foundation` `foundationMintSetId`). */
function mintSetId() {
  var noise = function () {
    var n = Math.floor(Math.random() * 1679616).toString(36);
    while (n.length < 4) n = '0' + n;
    return n;
  };
  return Date.now().toString(36) + '-' + noise() + noise();
}

function stampValue(domain, tokenKey, rev, setId) {
  return JSON.stringify({
    owner: 'dsf',
    domain: String(domain || ''),
    set: setId == null ? '' : String(setId),
    token: String(tokenKey || ''),
    rev: typeof rev === 'number' ? rev : 1
  });
}

function foundationSetKey(domain, setId) {
  return 'set:' + String(domain || '') + ':' + String(setId == null ? '' : setId);
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
 *     manifests: [{ key, id, domain, group }],  // id may be derived from key when missing on the blob
 *     stamps: [{ variableId, domain, set, token, name, rev? }]
 *   }]
 * }
 *
 * → {
 *   removeRegistryKeys: [viewportKey],
 *   keepRegistryViewports: [...] | null,  // null = leave registry untouched
 *   deleteManifestKeys: [{ collectionId, collectionName, key, setId }],
 *   clearStamps: [{ collectionId, collectionName, variableId, setId, reason }],
 *   forkSetGroups: [{
 *     collectionId, collectionName, keepGroup, oldSetId, domain, manifestKey,
 *     forks: [{ group, newSetId, stamps: [{ variableId, domain, token, rev }] }]
 *   }],
 *   skippedAmbiguous: [{ code, detail }]
 * }
 */
function planFoundationMaintenance(snapshot) {
  var src = snapshot || {};
  var removeRegistryKeys = [];
  var keepRegistryViewports = null;
  var deleteManifestKeys = [];
  var clearStamps = [];
  var forkSetGroups = [];
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

    // Count stamped tokens per set id, and stamps per (set id, group).
    var stampCountBySet = {};
    var stampsBySetGroup = {};
    for (var si = 0; si < stamps.length; si++) {
      var st = stamps[si];
      if (!st) continue;
      var sid = st.set == null ? '' : String(st.set);
      if (!sid) continue; // legacy stamps without set id — ambiguous; leave alone
      stampCountBySet[sid] = (stampCountBySet[sid] || 0) + 1;
      var g = groupOfStamp(st.name, st.token);
      if (g == null) g = '';
      if (!stampsBySetGroup[sid]) stampsBySetGroup[sid] = {};
      if (!stampsBySetGroup[sid][g]) stampsBySetGroup[sid][g] = [];
      stampsBySetGroup[sid][g].push(st);
    }

    // Two+ groups claim one set id that still has a manifest → fork copies (new set ids);
    // keep stamp+manifest on the original when we can name it; otherwise skip.
    for (var ambId in stampsBySetGroup) {
      if (!Object.prototype.hasOwnProperty.call(stampsBySetGroup, ambId)) continue;
      var mfLive = manifestBySetId[ambId];
      if (!mfLive) continue;
      var groupNames = Object.keys(stampsBySetGroup[ambId]);
      if (groupNames.length < 2) continue;

      var keepGroup = pickKeepGroupForAmbiguousSet(groupNames, mfLive.group);
      if (!keepGroup) {
        skippedAmbiguous.push({
          code: 'ambiguous-set-groups',
          detail: {
            collection: col.name || '',
            setId: ambId,
            groups: groupNames
          }
        });
        continue;
      }

      var forks = [];
      for (var gi = 0; gi < groupNames.length; gi++) {
        var forkGroup = groupNames[gi];
        if (forkGroup === keepGroup) continue;
        var groupStamps = stampsBySetGroup[ambId][forkGroup] || [];
        var forkStampPlan = [];
        for (var fsi = 0; fsi < groupStamps.length; fsi++) {
          var gs = groupStamps[fsi];
          forkStampPlan.push({
            variableId: gs.variableId,
            domain: gs.domain,
            token: gs.token,
            rev: typeof gs.rev === 'number' ? gs.rev : 1
          });
        }
        forks.push({
          group: forkGroup,
          newSetId: mintSetId(),
          stamps: forkStampPlan
        });
      }
      if (forks.length === 0) continue;

      forkSetGroups.push({
        collectionId: col.id,
        collectionName: col.name || '',
        keepGroup: keepGroup,
        oldSetId: ambId,
        domain: mfLive.domain || '',
        manifestKey: mfLive.key,
        forks: forks
      });
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
    //    Leave legacy (empty set) alone. Stamps being forked still have a live manifest for the
    //    old set id until apply — do not clear them here.
    var forkingVariableIds = {};
    for (var fi = 0; fi < forkSetGroups.length; fi++) {
      if (forkSetGroups[fi].collectionId !== col.id) continue;
      var forksList = forkSetGroups[fi].forks || [];
      for (var fj = 0; fj < forksList.length; fj++) {
        var fstamps = forksList[fj].stamps || [];
        for (var fk = 0; fk < fstamps.length; fk++) {
          forkingVariableIds[fstamps[fk].variableId] = true;
        }
      }
    }

    for (var sti = 0; sti < stamps.length; sti++) {
      var stamp = stamps[sti];
      if (!stamp || stamp.variableId == null) continue;
      if (forkingVariableIds[stamp.variableId]) continue;
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
    forkSetGroups: forkSetGroups,
    skippedAmbiguous: skippedAmbiguous
  };
}

function planIsEmpty(plan) {
  if (!plan) return true;
  if (plan.removeRegistryKeys && plan.removeRegistryKeys.length) return false;
  if (plan.deleteManifestKeys && plan.deleteManifestKeys.length) return false;
  if (plan.clearStamps && plan.clearStamps.length) return false;
  if (plan.forkSetGroups && plan.forkSetGroups.length) return false;
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
        token: stamp.token,
        rev: typeof stamp.rev === 'number' ? stamp.rev : 1
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
    forkedSetGroups: 0,
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

  // Fork copy groups that shared a set id: restamp under a new id + write forked manifest.
  var forkList = plan.forkSetGroups || [];
  for (var fi = 0; fi < forkList.length; fi++) {
    var forkJob = forkList[fi];
    var forkCol = colById[forkJob.collectionId];
    if (!forkCol) continue;

    var sourceRaw = '';
    try {
      sourceRaw = forkCol.getSharedPluginData(NS, forkJob.manifestKey) || '';
    } catch (e8) {
      sourceRaw = '';
    }
    var sourceParsed = null;
    try {
      sourceParsed = sourceRaw ? JSON.parse(sourceRaw) : null;
    } catch (e9) {
      sourceParsed = null;
    }
    if (!sourceParsed || typeof sourceParsed !== 'object') {
      say('foundationMaintain: fork skipped (unreadable manifest): ' + forkJob.manifestKey);
      continue;
    }

    for (var fj = 0; fj < forkJob.forks.length; fj++) {
      var fork = forkJob.forks[fj];
      var newId = fork.newSetId || mintSetId();
      for (var fsi = 0; fsi < fork.stamps.length; fsi++) {
        var fs = fork.stamps[fsi];
        try {
          var variable3 = await figma.variables.getVariableByIdAsync(fs.variableId);
          if (!variable3) continue;
          variable3.setSharedPluginData(
            NS,
            STAMP_KEY,
            stampValue(fs.domain, fs.token, fs.rev, newId)
          );
        } catch (e10) {
          say('foundationMaintain: restamp failed: ' + fs.variableId);
        }
      }

      var forkedBlob = {
        v: 1,
        updated: new Date().toISOString(),
        id: newId,
        domain: String(sourceParsed.domain || forkJob.domain || ''),
        group: fork.group,
        modes: Array.isArray(sourceParsed.modes) ? sourceParsed.modes.slice() : [],
        modeIds: sourceParsed.modeIds && typeof sourceParsed.modeIds === 'object'
          ? sourceParsed.modeIds
          : {},
        tokens: Array.isArray(sourceParsed.tokens) ? sourceParsed.tokens.slice() : [],
        config: sourceParsed.config && typeof sourceParsed.config === 'object'
          ? sourceParsed.config
          : {}
      };
      var forkKey = foundationSetKey(forkedBlob.domain, newId);
      try {
        forkCol.setSharedPluginData(NS, forkKey, JSON.stringify(forkedBlob));
        summary.forkedSetGroups++;
      } catch (e11) {
        say('foundationMaintain: fork manifest write failed: ' + forkKey);
      }
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
        ' forkedSets=' +
        summary.forkedSetGroups +
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
  groupOfStamp: groupOfStamp,
  looksLikeFigmaCopySuffix: looksLikeFigmaCopySuffix,
  pickKeepGroupForAmbiguousSet: pickKeepGroupForAmbiguousSet,
  mintSetId: mintSetId,
  planFoundationMaintenance: planFoundationMaintenance,
  planIsEmpty: planIsEmpty,
  runFoundationMaintain: runFoundationMaintain
};
