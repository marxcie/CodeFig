// @Foundation
// @DOC_START
// # @Foundation
// One viewport registry per file, one manifest per generated token set, and one copy of the
// helpers the Design System Foundations scripts each used to carry.
//
// ## Overview
// A **viewport** is `{ key, label, width }` and nothing else — columns, gaps and spacing scales
// are each domain's own payload. The **registry** is the file's list of viewports, stored on
// `figma.root`. A **set** is one run's output: `{ collection, group, domain, config }`, recorded
// as a **manifest** on the collection it wrote to. Two collections can hold two sets ("Spacing A"
// and "Spacing B") while sharing the one registry.
//
// Storage is *shared* plugin data in the `codefig` namespace, so the values are readable by other
// tooling and through the REST API rather than being locked to this plugin's id. Every entry is
// capped at 100 kB by Figma; writes that would exceed it are reported, not thrown.
//
// ## The manifest is a cache. The file wins.
// `readFoundation` reads the registry, the collections' modes and the `viewport-width` variables,
// and reconciles them. Where they disagree the file is believed and the disagreement is reported;
// a manifest is never trusted over what is actually in the document. Call `describeFoundation`
// and print it, so state that is invisible in Figma's UI is at least visible in a run's output.
//
// ## Companion imports
// `@import` does not follow calls across scripts, so a script that uses the mode helpers must
// import them from `@Variables` itself:
//
// | If you call | Also import |
// |---|---|
// | `planFoundationModes` | `planModes` from `@Variables` |
// | `applyFoundationModes` | `setupModes` from `@Variables` |
//
// `npm run validate` fails the build when a runnable script misses one.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Storage keys | foundationNamespace, foundationRegistryKey, foundationSetKey, foundationEntrySizeLimit |
// | Helpers | viewportLabel, viewportKeyFromLabel, namePrefix, resolveCollectionName, resolveGroup |
// | Registry shape | normaliseViewport, sortViewports, parseRegistry, serialiseRegistry |
// | Manifest shape | parseManifest, serialiseManifest |
// | Reconciliation | reconcileFoundation, describeFoundation |
// | Figma | readFoundation, writeRegistry, readManifest, writeManifest |
// | Modes | planFoundationModes, applyFoundationModes |
// | Stamps | stampValue, readStampFrom, stampToken, readStamp, findByStamp |
// @DOC_END

// ============================================================================
// STORAGE KEYS
//
// Zero-argument functions rather than constants: `@import` extracts only top-level function
// declarations, so a `var FOUNDATION_NS = 'codefig'` would reach no consumer.
// ============================================================================

function foundationNamespace() {
  return 'codefig';
}

function foundationRegistryKey() {
  return 'registry';
}

/** One manifest per (domain, group) inside a collection, so parallel sets never collide. */
function foundationSetKey(domain, group) {
  return 'set:' + String(domain || '') + ':' + String(group == null ? '' : group);
}

/**
 * Figma caps a shared plugin data entry — namespace, key and value together — at 100 kB.
 * Held back a little, and measured in characters, which over-counts only for multi-byte text.
 */
function foundationEntrySizeLimit() {
  return 100 * 1024 - 512;
}

// ============================================================================
// HELPERS
//
// Each of these existed in four or five copies, and three of the copies disagreed.
// ============================================================================

/** `mobile` → `Mobile`. The mode name Figma shows. */
function viewportLabel(key) {
  if (!key || typeof key !== 'string') return 'Default';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** `Extra Wide` → `extra-wide`. The inverse, for a mode the user named themselves. */
function viewportKeyFromLabel(label) {
  if (!label || typeof label !== 'string') return '';
  var slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return slug.replace(/^-+/, '').replace(/-+$/, '');
}

/** `Spacing` → `Spacing/`, `/Spacing/` → `Spacing/`, nothing → nothing. */
function namePrefix(group) {
  if (!group || typeof group !== 'string') return '';
  var trimmed = group.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? trimmed + '/' : '';
}

/**
 * The target collection, across the three shapes a config can arrive in: top level, nested
 * under `config`, or the legacy `structure.variableCollection`.
 */
function resolveCollectionName(config) {
  if (!config) return 'Responsive System';
  if (config.collectionName != null && config.collectionName !== '') {
    return config.collectionName;
  }
  var data = config.config || config;
  if (data.collectionName != null && data.collectionName !== '') {
    return data.collectionName;
  }
  if (data.structure && data.structure.variableCollection != null && data.structure.variableCollection !== '') {
    return data.structure.variableCollection;
  }
  return 'Responsive System';
}

/** The variable group. An explicit `''` means "no prefix" and is honoured. */
function resolveGroup(config) {
  if (!config) return '';
  if (config.group !== undefined && config.group !== null) {
    return config.group;
  }
  var data = config.config || config;
  if (data.group !== undefined && data.group !== null) {
    return data.group;
  }
  if (data.structure && data.structure.variableGroup !== undefined) {
    return data.structure.variableGroup;
  }
  return '';
}

// ============================================================================
// REGISTRY SHAPE
// ============================================================================

/** A warning is `{ code, message }` plus whatever identifies it, so tests match on code. */
function foundationWarning(code, message, detail) {
  var warning = { code: code, message: message };
  if (detail) {
    for (var k in detail) {
      if (Object.prototype.hasOwnProperty.call(detail, k)) warning[k] = detail[k];
    }
  }
  return warning;
}

/** `{key, label, width}` and nothing else — grid geometry belongs to Grid, not to identity. */
function normaliseViewport(entry) {
  if (!entry || typeof entry !== 'object') return null;
  var key = typeof entry.key === 'string' ? entry.key.trim() : '';
  var label = typeof entry.label === 'string' ? entry.label.trim() : '';
  if (!key && !label) return null;
  if (!key) key = viewportKeyFromLabel(label);
  if (!label) label = viewportLabel(key);
  if (!key) return null;
  var width = (typeof entry.width === 'number' && isFinite(entry.width)) ? entry.width : null;
  return { key: key, label: label, width: width };
}

/** Mobile first, which is also how Figma lays modes out and how everyone writes CSS. */
function sortViewports(viewports) {
  var decorated = (viewports || []).map(function(v, i) { return { v: v, i: i }; });
  decorated.sort(function(a, b) {
    var aw = a.v && typeof a.v.width === 'number' ? a.v.width : null;
    var bw = b.v && typeof b.v.width === 'number' ? b.v.width : null;
    if (aw === null && bw === null) return a.i - b.i;
    if (aw === null) return 1;
    if (bw === null) return -1;
    if (aw !== bw) return aw - bw;
    return a.i - b.i;
  });
  return decorated.map(function(d) { return d.v; });
}

/** Tolerant on purpose: pluginData is a string a human could have edited. Never throws. */
function parseRegistry(text) {
  var warnings = [];
  var raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return { registry: null, warnings: warnings };

  var parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    warnings.push(foundationWarning('registry-unreadable', 'The viewport registry on this file is not valid JSON. It will be rebuilt on the next write.'));
    return { registry: null, warnings: warnings };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warnings.push(foundationWarning('registry-unreadable', 'The viewport registry on this file is not an object.'));
    return { registry: null, warnings: warnings };
  }
  if (parsed.v !== 1) {
    if (typeof parsed.v === 'number') {
      warnings.push(foundationWarning('registry-version', 'The viewport registry was written by a newer version of CodeFig (v' + parsed.v + '). Leaving it alone.'));
    } else {
      warnings.push(foundationWarning('registry-unreadable', 'The viewport registry has no version and cannot be read.'));
    }
    return { registry: null, warnings: warnings };
  }
  if (!Array.isArray(parsed.viewports)) {
    warnings.push(foundationWarning('registry-unreadable', 'The viewport registry has no viewport list.'));
    return { registry: null, warnings: warnings };
  }

  var viewports = [];
  for (var i = 0; i < parsed.viewports.length; i++) {
    var v = normaliseViewport(parsed.viewports[i]);
    if (v) viewports.push(v);
  }
  return { registry: { v: 1, viewports: viewports }, warnings: warnings };
}

function serialiseRegistry(viewports) {
  var normalised = [];
  for (var i = 0; i < (viewports || []).length; i++) {
    var v = normaliseViewport(viewports[i]);
    if (v) normalised.push(v);
  }
  return JSON.stringify({ v: 1, viewports: sortViewports(normalised) });
}

// ============================================================================
// MANIFEST SHAPE
// ============================================================================

function serialiseManifest(set) {
  var s = set || {};
  return JSON.stringify({
    v: 1,
    updated: new Date().toISOString(),
    domain: String(s.domain || ''),
    group: s.group == null ? '' : String(s.group),
    modes: Array.isArray(s.modes) ? s.modes.slice() : [],
    tokens: Array.isArray(s.tokens) ? s.tokens.slice() : [],
    config: s.config && typeof s.config === 'object' ? s.config : {}
  });
}

function parseManifest(text) {
  var warnings = [];
  var raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return { manifest: null, warnings: warnings };

  var parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    warnings.push(foundationWarning('manifest-unreadable', 'A set manifest on this collection is not valid JSON. It will be rebuilt on the next run.'));
    return { manifest: null, warnings: warnings };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warnings.push(foundationWarning('manifest-unreadable', 'A set manifest on this collection is not an object.'));
    return { manifest: null, warnings: warnings };
  }
  return {
    manifest: {
      v: typeof parsed.v === 'number' ? parsed.v : 1,
      updated: typeof parsed.updated === 'string' ? parsed.updated : '',
      domain: String(parsed.domain || ''),
      group: parsed.group == null ? '' : String(parsed.group),
      modes: Array.isArray(parsed.modes) ? parsed.modes : [],
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens : [],
      config: parsed.config && typeof parsed.config === 'object' ? parsed.config : {}
    },
    warnings: warnings
  };
}

// ============================================================================
// RECONCILIATION — pure, so it is testable without Figma
// ============================================================================

/**
 * Reconcile the three records of the same thing: the registry (pluginData), the collections'
 * modes, and the `viewport-width` variables. The file wins; every disagreement is reported.
 *
 * sources: {
 *   registry:  parsed registry object or null,
 *   modes:     [{ collection, modes: [{ modeId, name }] }],
 *   widths:    [{ collection, variable, byMode: { "Desktop": 1920 } }],
 *   variables: [{ collection, names: [] }],          // omit a collection to skip its token check
 *   manifests: [{ collection, key, manifest }]
 * }
 * returns {
 *   viewports: [{ key, label, width, widthSource, materialisedIn: [collection] }],
 *   sets:      [{ collection, key, domain, group, modes, tokens, missing }],
 *   warnings:  [{ code, message, ... }]
 * }
 */
function reconcileFoundation(sources) {
  var src = sources || {};
  var warnings = [];
  var viewports = [];
  var i;

  function findViewport(name) {
    var lower = String(name || '').toLowerCase();
    var key = viewportKeyFromLabel(name);
    for (var j = 0; j < viewports.length; j++) {
      if (viewports[j].label.toLowerCase() === lower) return viewports[j];
    }
    for (var k = 0; k < viewports.length; k++) {
      if (key && viewports[k].key.toLowerCase() === key) return viewports[k];
    }
    return null;
  }

  function findViewportByKey(key) {
    var lower = String(key || '').toLowerCase();
    for (var j = 0; j < viewports.length; j++) {
      if (viewports[j].key.toLowerCase() === lower) return viewports[j];
    }
    return null;
  }

  // 1. The registry, in its stored order.
  var registered = (src.registry && Array.isArray(src.registry.viewports)) ? src.registry.viewports : [];
  for (i = 0; i < registered.length; i++) {
    var entry = normaliseViewport(registered[i]);
    if (!entry) continue;
    if (findViewportByKey(entry.key)) {
      warnings.push(foundationWarning('duplicate-key', 'Two viewports in the registry share the key "' + entry.key + '". Ignoring the second.', { key: entry.key }));
      continue;
    }
    var sameLabel = null;
    for (var d = 0; d < viewports.length; d++) {
      if (viewports[d].label.toLowerCase() === entry.label.toLowerCase()) sameLabel = viewports[d];
    }
    if (sameLabel) {
      warnings.push(foundationWarning('duplicate-label', 'Two viewports in the registry are both called "' + entry.label + '". Ignoring the second.', { label: entry.label }));
      continue;
    }
    viewports.push({
      key: entry.key,
      label: entry.label,
      width: entry.width,
      widthSource: entry.width === null ? null : { kind: 'registry' },
      materialisedIn: [],
      fromRegistry: true
    });
  }

  // 2. Modes. A mode nobody knows about is adopted, not ignored — and a mode renamed by hand
  //    matches on its key, so it does not become a second viewport.
  var modeSets = src.modes || [];
  for (i = 0; i < modeSets.length; i++) {
    var collectionName = modeSets[i].collection;
    var modeList = modeSets[i].modes || [];
    for (var m = 0; m < modeList.length; m++) {
      var modeName = modeList[m].name;
      var viewport = findViewport(modeName);
      if (!viewport) {
        var discovered = normaliseViewport({ label: modeName });
        if (!discovered) continue;
        viewport = {
          key: discovered.key,
          label: discovered.label,
          width: null,
          widthSource: null,
          materialisedIn: [],
          fromRegistry: false
        };
        viewports.push(viewport);
        warnings.push(foundationWarning('viewport-discovered', 'Collection "' + collectionName + '" has a mode "' + modeName + '" that the registry does not list. Adopted as a viewport.', { collection: collectionName, key: viewport.key }));
      } else if (viewport.label !== modeName) {
        warnings.push(foundationWarning('viewport-relabelled', 'Viewport "' + viewport.key + '" is called "' + modeName + '" in "' + collectionName + '" but "' + viewport.label + '" in the registry. Using the file\'s name.', { collection: collectionName, key: viewport.key }));
        viewport.label = modeName;
      }
      if (viewport.materialisedIn.indexOf(collectionName) === -1) {
        viewport.materialisedIn.push(collectionName);
      }
    }
  }

  // 3. Widths, from the variable. This is the file speaking, so it beats the registry.
  var widthSets = src.widths || [];
  for (i = 0; i < widthSets.length; i++) {
    var widthEntry = widthSets[i];
    var byMode = widthEntry.byMode || {};
    for (var label in byMode) {
      if (!Object.prototype.hasOwnProperty.call(byMode, label)) continue;
      var value = byMode[label];
      if (typeof value !== 'number' || !isFinite(value)) continue;
      var target = findViewport(label);
      if (!target) continue;

      if (target.widthSource && target.widthSource.kind === 'file') {
        if (target.width !== value) {
          warnings.push(foundationWarning(
            'width-conflict',
            'Viewport "' + target.label + '" is ' + target.width + ' in "' + target.widthSource.collection + '" but ' + value + ' in "' + widthEntry.collection + '". Using ' + target.width + '; fix one of them.',
            { key: target.key, collections: [target.widthSource.collection, widthEntry.collection] }
          ));
        }
        continue;
      }
      if (target.width !== null && target.width !== value) {
        warnings.push(foundationWarning(
          'width-from-file',
          'Viewport "' + target.label + '" is ' + value + ' in the file but ' + target.width + ' in the registry. Using ' + value + '.',
          { key: target.key, collection: widthEntry.collection }
        ));
      }
      target.width = value;
      target.widthSource = { kind: 'file', collection: widthEntry.collection, variable: widthEntry.variable };
    }
  }

  // 4 and 5. States worth naming: no width anywhere, and a viewport no collection carries.
  for (i = 0; i < viewports.length; i++) {
    if (viewports[i].width === null) {
      warnings.push(foundationWarning('width-unknown', 'Viewport "' + viewports[i].label + '" has no width. Run Grid, or set one in the viewport editor.', { key: viewports[i].key }));
    }
    if (viewports[i].fromRegistry && viewports[i].materialisedIn.length === 0) {
      warnings.push(foundationWarning('viewport-not-materialised', 'Viewport "' + viewports[i].label + '" is in the registry but is not a mode of any collection.', { key: viewports[i].key }));
    }
  }

  // 6. Sets. The manifest is checked against the file, never the other way round.
  var sets = [];
  var manifestEntries = src.manifests || [];
  var variableIndex = {};
  var variableLists = src.variables || [];
  for (i = 0; i < variableLists.length; i++) {
    variableIndex[variableLists[i].collection] = variableLists[i].names || [];
  }

  for (i = 0; i < manifestEntries.length; i++) {
    var record = manifestEntries[i];
    var manifest = record.manifest;
    if (!manifest) continue;

    var missing = [];
    var known = variableIndex[record.collection];
    if (known) {
      var prefix = namePrefix(manifest.group);
      for (var t = 0; t < manifest.tokens.length; t++) {
        if (known.indexOf(prefix + manifest.tokens[t]) === -1) missing.push(manifest.tokens[t]);
      }
      if (missing.length > 0) {
        warnings.push(foundationWarning(
          'manifest-token-missing',
          'The ' + manifest.domain + ' set in "' + record.collection + '" claims ' + missing.length + ' token(s) that no variable matches: ' + missing.join(', ') + '.',
          { collection: record.collection, domain: manifest.domain, tokens: missing }
        ));
      }
    }

    var collectionModes = [];
    for (var ms = 0; ms < modeSets.length; ms++) {
      if (modeSets[ms].collection === record.collection) {
        collectionModes = (modeSets[ms].modes || []).map(function(mode) { return mode.name; });
      }
    }
    var missingModes = [];
    for (var mm = 0; mm < manifest.modes.length; mm++) {
      var wantedKey = String(manifest.modes[mm]);
      var present = false;
      for (var cm = 0; cm < collectionModes.length; cm++) {
        if (collectionModes[cm].toLowerCase() === wantedKey.toLowerCase() ||
            viewportKeyFromLabel(collectionModes[cm]) === viewportKeyFromLabel(wantedKey)) {
          present = true;
        }
      }
      if (!present) missingModes.push(wantedKey);
    }
    if (missingModes.length > 0) {
      warnings.push(foundationWarning(
        'manifest-mode-missing',
        'The ' + manifest.domain + ' set in "' + record.collection + '" claims mode(s) the collection does not have: ' + missingModes.join(', ') + '.',
        { collection: record.collection, domain: manifest.domain, modes: missingModes }
      ));
    }

    sets.push({
      collection: record.collection,
      key: record.key,
      domain: manifest.domain,
      group: manifest.group,
      modes: manifest.modes,
      tokens: manifest.tokens,
      missing: missing,
      updated: manifest.updated,
      config: manifest.config
    });
  }

  var ordered = sortViewports(viewports).map(function(v) {
    return {
      key: v.key,
      label: v.label,
      width: v.width,
      widthSource: v.widthSource,
      materialisedIn: v.materialisedIn
    };
  });

  return { viewports: ordered, sets: sets, warnings: warnings };
}

/**
 * The state dump. pluginData is invisible in Figma's UI, so a run that does not print this
 * leaves a stale registry undiagnosable by looking at the file.
 */
function describeFoundation(foundation) {
  var f = foundation || {};
  var lines = ['Foundation state'];
  var viewports = f.viewports || [];
  var i;

  if (viewports.length === 0) {
    lines.push('  Viewports: none — this file has no registry yet.');
  } else {
    lines.push('  Viewports:');
    for (i = 0; i < viewports.length; i++) {
      var v = viewports[i];
      var width = v.width === null ? 'width unknown' : v.width + 'px';
      var source = v.widthSource ? (v.widthSource.kind === 'file' ? 'from ' + v.widthSource.collection : 'from the registry') : 'no source';
      var where = v.materialisedIn.length ? v.materialisedIn.join(', ') : 'no collection';
      lines.push('    ' + v.label + ' (' + v.key + ') — ' + width + ' (' + source + '), in ' + where);
    }
  }

  var sets = f.sets || [];
  if (sets.length === 0) {
    lines.push('  Sets: none recorded.');
  } else {
    lines.push('  Sets:');
    for (i = 0; i < sets.length; i++) {
      var s = sets[i];
      lines.push('    ' + s.domain + ' in "' + s.collection + '"' + (s.group ? ' (group: ' + s.group + ')' : '') +
        ' — ' + s.tokens.length + ' token(s)' + (s.missing.length ? ', ' + s.missing.length + ' missing' : '') +
        (s.updated ? ', updated ' + s.updated : ''));
    }
  }

  var warnings = f.warnings || [];
  if (warnings.length > 0) {
    lines.push('  Notes:');
    for (i = 0; i < warnings.length; i++) {
      lines.push('    [' + warnings[i].code + '] ' + warnings[i].message);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// FIGMA SIDE
// ============================================================================

/** True when a variable name is the viewport-width variable, whatever group it sits under. */
function isViewportWidthName(name) {
  var n = String(name || '');
  return n === 'viewport-width' || n.lastIndexOf('/viewport-width') === n.length - '/viewport-width'.length;
}

/**
 * Read the registry, the collections' modes, their `viewport-width` variables and their set
 * manifests, and reconcile them. Reads only — it never repairs as a side effect.
 *
 * options: { collections: [names] } to limit the scan; otherwise every local collection.
 * Note this walks every variable in scope, which is what makes the manifest check possible.
 */
async function readFoundation(options) {
  var opts = options || {};
  var ns = foundationNamespace();
  var warnings = [];

  var registryRead = parseRegistry(figma.root.getSharedPluginData(ns, foundationRegistryKey()));
  warnings = warnings.concat(registryRead.warnings);

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  if (opts.collections && opts.collections.length > 0) {
    collections = collections.filter(function(c) { return opts.collections.indexOf(c.name) !== -1; });
  }
  // Sorted so that a width conflict resolves the same way on every run.
  collections = collections.slice().sort(function(a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });

  var modes = [];
  var widths = [];
  var variables = [];
  var manifests = [];

  for (var i = 0; i < collections.length; i++) {
    var collection = collections[i];
    modes.push({
      collection: collection.name,
      modes: collection.modes.map(function(m) { return { modeId: m.modeId, name: m.name }; })
    });

    var names = [];
    for (var v = 0; v < collection.variableIds.length; v++) {
      var variable = await figma.variables.getVariableByIdAsync(collection.variableIds[v]);
      if (!variable) continue;
      names.push(variable.name);
      if (isViewportWidthName(variable.name) && variable.resolvedType === 'FLOAT') {
        var byMode = {};
        for (var m2 = 0; m2 < collection.modes.length; m2++) {
          var value = variable.valuesByMode[collection.modes[m2].modeId];
          if (typeof value === 'number') byMode[collection.modes[m2].name] = value;
        }
        widths.push({ collection: collection.name, variable: variable.name, byMode: byMode });
      }
    }
    variables.push({ collection: collection.name, names: names });

    var keys = collection.getSharedPluginDataKeys(ns) || [];
    for (var k = 0; k < keys.length; k++) {
      if (keys[k].indexOf('set:') !== 0) continue;
      var read = parseManifest(collection.getSharedPluginData(ns, keys[k]));
      warnings = warnings.concat(read.warnings);
      if (read.manifest) {
        manifests.push({ collection: collection.name, key: keys[k], manifest: read.manifest });
      }
    }
  }

  var result = reconcileFoundation({
    registry: registryRead.registry,
    modes: modes,
    widths: widths,
    variables: variables,
    manifests: manifests
  });

  return {
    viewports: result.viewports,
    sets: result.sets,
    warnings: warnings.concat(result.warnings),
    collections: collections.map(function(c) { return c.name; }),
    hasRegistry: registryRead.registry !== null
  };
}

/** Write the registry. Over the entry cap it reports and writes nothing, rather than throwing. */
function writeRegistry(viewports) {
  var text = serialiseRegistry(viewports);
  if (text.length > foundationEntrySizeLimit()) {
    var tooBig = foundationWarning('registry-too-large', 'The viewport registry is ' + text.length + ' characters, over Figma\'s 100 kB entry limit. Nothing was written.');
    console.error(tooBig.message);
    return { ok: false, warnings: [tooBig], bytes: text.length };
  }
  figma.root.setSharedPluginData(foundationNamespace(), foundationRegistryKey(), text);
  return { ok: true, warnings: [], bytes: text.length, viewports: parseRegistry(text).registry.viewports };
}

function readManifest(collection, domain, group) {
  return parseManifest(collection.getSharedPluginData(foundationNamespace(), foundationSetKey(domain, group)));
}

/**
 * Merge one set's slice into its manifest. Merging rather than replacing so a domain never
 * clobbers a key it does not know about.
 */
function writeManifest(collection, set) {
  var s = set || {};
  var key = foundationSetKey(s.domain, s.group);
  var existing = parseManifest(collection.getSharedPluginData(foundationNamespace(), key)).manifest || {};
  var merged = {
    domain: s.domain != null ? s.domain : existing.domain,
    group: s.group != null ? s.group : existing.group,
    modes: s.modes != null ? s.modes : existing.modes,
    tokens: s.tokens != null ? s.tokens : existing.tokens,
    config: s.config != null ? s.config : existing.config
  };
  var text = serialiseManifest(merged);
  if (text.length > foundationEntrySizeLimit()) {
    var tooBig = foundationWarning('manifest-too-large', 'The ' + merged.domain + ' manifest is ' + text.length + ' characters, over Figma\'s 100 kB entry limit. Nothing was written.');
    console.error(tooBig.message);
    return { ok: false, warnings: [tooBig], key: key, bytes: text.length };
  }
  collection.setSharedPluginData(foundationNamespace(), key, text);
  return { ok: true, warnings: [], key: key, bytes: text.length, manifest: parseManifest(text).manifest };
}

// ============================================================================
// MODES — over planModes/setupModes from @Variables, which the consumer must import
// ============================================================================

/** The labels a set of viewport keys should become, taking names from the registry. */
function viewportLabelsFor(foundation, viewportKeys) {
  var known = (foundation && foundation.viewports) || [];
  return (viewportKeys || []).map(function(key) {
    for (var i = 0; i < known.length; i++) {
      if (known[i].key.toLowerCase() === String(key).toLowerCase()) return known[i].label;
    }
    return viewportLabel(key);
  });
}

/** Plan only. Requires `planModes` from @Variables. */
function planFoundationModes(foundation, collection, viewportKeys) {
  var labels = viewportLabelsFor(foundation, viewportKeys);
  var state = {
    name: collection.name,
    modes: collection.modes.map(function(m) { return { modeId: m.modeId, name: m.name }; }),
    hasVariables: !!(collection.variableIds && collection.variableIds.length > 0)
  };
  return { labels: labels, plan: planModes(state, labels) };
}

/**
 * Apply the plan. Requires `setupModes` from @Variables.
 * A spent mode budget arrives here as `blocked`/`modeLimit` and leaves as a warning — the run
 * continues with the modes it has, and the caller decides what to do about it.
 */
function applyFoundationModes(foundation, collection, viewportKeys) {
  var labels = viewportLabelsFor(foundation, viewportKeys);
  var result = setupModes(collection, labels);
  var warnings = [];

  if (result.blocked && result.blocked.length > 0) {
    warnings.push(foundationWarning(
      'mode-budget',
      'Collection "' + collection.name + '" is at this file\'s limit of ' + result.modeLimit + ' modes. Not created: ' + result.blocked.join(', ') + '. Split the domain into a second collection, or drop a viewport.',
      { collection: collection.name, blocked: result.blocked, modeLimit: result.modeLimit }
    ));
  }
  if (result.extra && result.extra.length > 0) {
    warnings.push(foundationWarning(
      'modes-not-ours',
      'Collection "' + collection.name + '" also has modes this run did not create: ' + result.extra.join(', ') + '. Left alone.',
      { collection: collection.name, extra: result.extra }
    ));
  }

  return { labels: labels, result: result, warnings: warnings };
}

// ============================================================================
// STAMPS
//
// Identity for a generated token, so a rename updates in place instead of duplicating.
// Nothing writes these yet — each generator starts stamping when it is rewritten.
// ============================================================================

function stampValue(domain, tokenKey, rev) {
  return JSON.stringify({
    owner: 'dsf',
    domain: String(domain || ''),
    token: String(tokenKey || ''),
    rev: typeof rev === 'number' ? rev : 1
  });
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

/** Variable, VariableCollection and every style are all PluginDataMixin. */
function stampToken(target, domain, tokenKey, rev) {
  target.setSharedPluginData(foundationNamespace(), 'stamp', stampValue(domain, tokenKey, rev));
}

function readStamp(target) {
  return readStampFrom(target.getSharedPluginData(foundationNamespace(), 'stamp'));
}

/**
 * Stamp first, then exact name — the resolution order that survives a rename.
 * Two candidates sharing a stamp is what duplicating a variable in Figma produces; the exact
 * name breaks the tie rather than picking arbitrarily.
 */
function findByStamp(candidates, domain, tokenKey, getData, exactName) {
  var matches = [];
  for (var i = 0; i < (candidates || []).length; i++) {
    var stamp = readStampFrom(getData(candidates[i]));
    if (stamp && stamp.domain === domain && stamp.token === tokenKey) matches.push(candidates[i]);
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  for (var j = 0; j < matches.length; j++) {
    if (exactName != null && matches[j].name === exactName) return matches[j];
  }
  return matches[0];
}
