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
// ## Nothing here deletes
// There is no collection- or variable-removal helper in this library, and adding one has a price
// of entry. A variable's id and published key are minted at creation, so removing and recreating
// breaks every binding in this file and leaves subscribing files with missing variables they
// cannot relink. Renaming is safe; deleting is not.
//
// If a removal helper is ever needed here, it **refuses** when the collection is published
// (`getPublishStatusAsync() !== 'UNPUBLISHED'`) or when its variables have consumers, and it takes
// an explicit `force`. Test scratch passes on its own merits: unpublished, unconsumed.
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
// ## The portable config
// One v1 shape does three jobs: the blob you paste between files, the `config` slice a manifest
// records, and what Copy config puts on the clipboard or writes to a text layer.
// `normaliseConfig` accepts every shape CodeFig has ever taken — the current top level, the
// legacy `structure.*`, the internal `{collectionName, group, config, variables}` wrapper,
// `spacingScaling` / `fontScaling`, `figmaStyles`, every `roundTo` spelling — and reports what it
// translated. `toDomainConfig(v1, domain)` converts back to the shape today's unrewritten scripts
// read, which is what keeps the two normalisation paths from disagreeing until phases 3-5.
//
// **v1 carries declared inputs only.** A run mutates its config in place (`materializeSpacingSizes`
// and friends), and exporting a derivation freezes it: paste that elsewhere and `steps: 6`
// regenerates nothing. Derived fields are dropped on the way in and reported.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Storage keys | foundationNamespace, foundationRegistryKey, foundationSetKey, foundationEntrySizeLimit |
// | Helpers | viewportLabel, viewportKeyFromLabel, namePrefix, resolveCollectionName, resolveGroup |
// | Registry shape | normaliseViewport, sortViewports, parseRegistry, serialiseRegistry |
// | Manifest shape | parseManifest, serialiseManifest |
// | Reconciliation | reconcileFoundation, describeFoundation |
// | Figma | readFoundation, registryViewportLabels, writeRegistry, readManifest, writeManifest |
// | Modes | planFoundationModes, applyFoundationModes |
// | Config | normaliseConfig, toDomainConfig, toPortableConfig, emptyPortableConfig, configDomainOf |
// | Config text | serialisePortableConfig, parsePortableConfig, describeConfigTranslations |
// | Config on canvas | writeConfigToTextLayer, readConfigFromTextLayer, findConfigTextLayers |
// | Stamps | stampValue, readStampFrom, stampToken, readStamp, findByStamp |
//
// `requestClipboardCopy` and `createCopyResult` live in `@InfoPanel`, not here — putting the
// clipboard plumbing in the results library is what lets a script use it without depending on
// the foundation.
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

  // 2. Modes. A mode the registry does not list is **reported, not adopted** — a mode renamed by
  //    hand still matches on its key, so it does not become a second viewport.
  //
  //    This is a deliberate correction to 16a, which adopted an unmatched mode as a discovered
  //    viewport. That is right for a breakpoint someone added by hand and wrong for everything
  //    else: `tight` / `relaxed` is a density axis, and Figma gives a collection one mode axis, so
  //    a tool that turns every mode into a viewport decides which axis your collection uses. It
  //    should not. The registry is now only ever written by a person.
  var unregisteredModes = [];
  var modeSets = src.modes || [];
  for (i = 0; i < modeSets.length; i++) {
    var collectionName = modeSets[i].collection;
    var modeList = modeSets[i].modes || [];
    for (var m = 0; m < modeList.length; m++) {
      var modeName = modeList[m].name;
      var viewport = findViewport(modeName);
      if (!viewport) {
        var outside = normaliseViewport({ label: modeName });
        if (!outside) continue;
        unregisteredModes.push({
          collection: collectionName,
          name: modeName,
          key: outside.key,
          modeId: modeList[m].modeId || null
        });
        continue;
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

  // Reported per collection rather than per mode: three density modes are one fact about that
  // collection, and three warnings would read as three problems. The manual route is attached
  // because removing the automatic path into the registry removed the only path a user ever saw —
  // without it, a real breakpoint someone added by hand becomes invisible rather than un-adopted.
  //
  // **A file with no registry at all is a different state**, and gets one sentence rather than
  // one per collection. "Your three modes are not viewports" on a file where nobody has ever
  // written a viewport list is technically true and useless — it reads as a complaint about the
  // shipped default, which is how people learn to ignore warnings. Nothing has claimed the
  // registry yet, so nothing contradicts these modes.
  var hasRegistryList = !!(src.registry && Array.isArray(src.registry.viewports));
  var byCollection = {};
  var collectionOrder = [];
  for (i = 0; i < unregisteredModes.length; i++) {
    var owner = unregisteredModes[i].collection;
    if (!byCollection[owner]) { byCollection[owner] = []; collectionOrder.push(owner); }
    byCollection[owner].push(unregisteredModes[i].name);
  }
  if (!hasRegistryList && unregisteredModes.length > 0) {
    warnings.push(foundationWarning(
      'registry-missing',
      'This file has no viewport list yet, so none of its ' + unregisteredModes.length +
        ' mode(s) is a viewport. Run Grid to create one.',
      { modes: unregisteredModes.map(function(m) { return m.name; }) }
    ));
    collectionOrder = [];
  }
  for (i = 0; i < collectionOrder.length; i++) {
    var names = byCollection[collectionOrder[i]];
    warnings.push(foundationWarning(
      'mode-not-a-viewport',
      'Collection "' + collectionOrder[i] + '" writes modes ' +
        names.map(function(n) { return '`' + n + '`'; }).join(', ') +
        ', which are not viewports in this file\'s registry. The registry is untouched — add ' +
        (names.length === 1 ? 'it' : 'them') + ' in Grid if ' +
        (names.length === 1 ? "it's a breakpoint" : "they're breakpoints") + '.',
      { collection: collectionOrder[i], modes: names.slice() }
    ));
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

  return {
    viewports: ordered,
    sets: sets,
    warnings: warnings,
    // Separate from `viewports` on purpose: these are modes, and whether a mode is a viewport is
    // a decision only a person can make.
    unregisteredModes: unregisteredModes
  };
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
/**
 * The viewport labels in this file's registry, in registry order.
 *
 * Cheap next to `readFoundation` — it reads one shared-plugin-data entry and walks no collections —
 * because it answers one question: what should exist, when a collection cannot say.
 */
function registryViewportLabels() {
  var read = parseRegistry(figma.root.getSharedPluginData(foundationNamespace(), foundationRegistryKey()));
  if (!read.registry) return [];
  return read.registry.viewports.map(function(v) { return v.label; });
}

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
    unregisteredModes: result.unregisteredModes,
    collections: collections.map(function(c) { return c.name; }),
    hasRegistry: registryRead.registry !== null
  };
}

/**
 * What a Collection + Group already holds, for a panel to fill itself from.
 *
 * Replaces the import button: the question "is there a config here" is asked the moment those two
 * fields point somewhere, rather than waiting for someone to press an icon whose meaning had to be
 * explained. Read-only — nothing here writes, so asking costs nothing and can happen on every edit.
 *
 * → { source: 'recorded' | 'none', config, group, collection, tokens, modes }
 *
 * `recognised` — fitting a scale from the variables that are already there — is the third answer and
 * is not wired yet: `adoptRamp` records as it fits, and auto-import must not write. Splitting the fit
 * from the record is its own step, so this reports `none` and the defaults stand, which is the
 * honest outcome rather than a half one.
 */
async function foundationAutoImport(collectionName, group, domain) {
  var answer = {
    source: 'none', config: null, collection: collectionName || null,
    group: group == null ? null : group, tokens: [], modes: []
  };
  if (!collectionName || !domain) return answer;

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = collections.filter(function(c) { return c.name === collectionName; })[0];
  if (!collection) return answer;

  var read = readManifest(collection, domain, group == null ? '' : group);
  if (!read.manifest) return answer;

  // A manifest carries the slice; `toDomainConfig` needs a v1 around it. `viewportOrder` is recorded
  // on the slice at generation time, so the modes survive even when this file's registry is empty —
  // which is exactly the case a fresh file is in.
  var v1 = {
    v: 1,
    collection: collectionName,
    group: group,
    viewports: [],
    domains: {}
  };
  v1.domains[domain] = read.manifest.config || {};

  answer.source = 'recorded';
  answer.config = toDomainConfig(v1, domain);
  answer.tokens = read.manifest.tokens || [];
  answer.modes = read.manifest.modes || [];
  return answer;
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
    // Normalised on the way in, so a manifest can never hold a shape the reader would refuse —
    // and so a run's derived fields (spacingSizes and friends) never reach the file at all.
    config: normaliseDomainSlice(s.config != null ? s.config : existing.config, s.domain || existing.domain)
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

// ============================================================================
// THE PORTABLE v1 CONFIG
//
// One shape for three jobs: the blob you paste between files, the `config` slice a manifest
// records, and what Copy config puts on the clipboard. Declared inputs only — a run mutates a
// config in place (materializeSpacingSizes and friends), and exporting a derivation freezes it.
// ============================================================================

function foundationConfigVersion() {
  return 1;
}

function foundationConfigKind() {
  return 'codefig.foundation';
}

/** An empty but valid v1 config. */
function emptyPortableConfig() {
  return {
    v: foundationConfigVersion(),
    kind: foundationConfigKind(),
    updated: new Date().toISOString(),
    collection: null,
    group: null,
    lineGrid: null,
    viewports: [],
    domains: {}
  };
}

/** Fields a run writes back onto a config. Never exported: they freeze if they are. */
function foundationDerivedKeys() {
  return ['spacingSizes', 'radiusSizes', 'fontSizes'];
}

/** Keys the reader consumes at the top level, whatever the domain. */
function foundationStructuralKeys() {
  return [
    'collectionName', 'group', 'structure', 'config', 'variables', 'modes',
    'v', 'kind', 'updated', 'collection', 'viewports', 'domains', 'lineGrid', 'sets'
  ];
}

/**
 * Every key a v1 domain slice may contain. Anything else is dropped on export.
 *
 * A **whitelist**, because the denylist this replaced named the derived keys it knew about and
 * therefore exported every one it did not: `__rampSetPlan` — the resolver's own working state,
 * with its conflicts and overrides — travelled into the manifest and back out as though it were
 * something the author had written. A list of what is allowed cannot fail that way; a list of what
 * is forbidden fails every time the pipeline grows a field.
 *
 * `sets` is here for the same reason it was previously lost: the *outer* v1 config also has a
 * `sets` key, meaning the generated sets a file contains, and the structural skip for that one was
 * being applied to domain slices too. Two different things with one name, and only the whitelist
 * makes the difference visible.
 */
function foundationSliceKeys(domain) {
  var keys = [
    'tokens', 'nameTemplate', 'steps', 'scaling', 'perViewport', 'sets', 'viewportOrder',
    'modeNames', 'extra',
    'defaultBaseLevel', 'generateOverview', 'roundTo', 'roundLowerValuesTo',
    'styles', 'fontWeights', 'extensionColumns'
  ];
  // A field in a shipped default block is declared by definition. Leaving these to `extra` meant
  // an untouched config warned about itself the first time anyone ran the script it came with,
  // which is how people learn that warnings are noise.
  if (domain === 'typography') return keys.concat(['fontFamily']);
  if (domain === 'colors') return keys.concat(['light', 'dark']);
  return keys;
}

/** Keys each domain understands, so anything else can be preserved as `extra`. */
function foundationDomainKeys(domain) {
  var common = [
    'scaling', 'spacingScaling', 'fontScaling', 'roundTo', 'roundUpperValuesTo',
    'roundLowerValuesTo', 'rangeMode', 'steps', 'defaultBaseLevel', 'generateOverview'
  ].concat(foundationDerivedKeys());
  if (domain === 'spacing') return common.concat(['spacings']);
  if (domain === 'radius') return common.concat(['radii']);
  if (domain === 'typography') return common.concat(['fontScale', 'fontWeights', 'styles', 'figmaStyles']);
  if (domain === 'grid') return common.concat(['extensionColumns']);
  if (domain === 'colors') return common.concat(['light', 'dark']);
  return common;
}

/** The array key each domain calls its token list. */
function foundationTokensKey(domain) {
  if (domain === 'spacing') return 'spacings';
  if (domain === 'radius') return 'radii';
  if (domain === 'typography') return 'fontScale';
  return null;
}

/** A viewport payload, as a legacy config spells it: an object with layout or scale fields. */
function isViewportPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof value.containerWidth === 'number' ||
    typeof value.min === 'number' ||
    typeof value.max === 'number' ||
    !!value.baseFont || !!value.minFont || !!value.maxFont;
}

/**
 * Which domain a legacy config describes, from what it carries. Null when it says nothing —
 * kept and reported rather than guessed at.
 */
function configDomainOf(inner) {
  if (!inner || typeof inner !== 'object') return null;
  if (inner.spacings !== undefined || inner.spacingScaling !== undefined || inner.spacingSizes !== undefined) return 'spacing';
  if (inner.radii !== undefined || inner.radiusSizes !== undefined) return 'radius';
  if (inner.fontScale !== undefined || inner.fontSizes !== undefined || inner.fontWeights !== undefined ||
      inner.fontScaling !== undefined || inner.figmaStyles !== undefined || inner.styles !== undefined) return 'typography';

  if (inner.light !== undefined || inner.dark !== undefined) return 'colors';

  var modes = Array.isArray(inner.modes) ? inner.modes : [];
  for (var i = 0; i < modes.length; i++) {
    if (modes[i] && (typeof modes[i].containerWidth === 'number' || typeof modes[i].columns === 'number')) return 'grid';
  }
  for (var key in inner) {
    if (!Object.prototype.hasOwnProperty.call(inner, key)) continue;
    var v = inner[key];
    if (v && typeof v === 'object' && typeof v.containerWidth === 'number' && typeof v.columns === 'number') return 'grid';
  }
  return null;
}

/**
 * The rounding step, with exactly the precedence the scripts end up with.
 *
 * Two stages, because the scripts have two. `ensureCompat*` runs first and, when a
 * `spacingScaling` / `fontScaling` alias is present, copies its `roundTo` — or its
 * `roundUpperValuesTo` — over the top-level `roundTo`. Only then does `resolveRoundTo` pick
 * between what is left. An alias therefore *wins*, which is not what the ladder looks like.
 */
function foundationResolveRoundTo(inner, alias) {
  if (!inner || typeof inner !== 'object') return 0;
  var scaling = alias || inner.scaling || {};
  if (alias) {
    if (typeof alias.roundTo === 'number' && alias.roundTo > 0) return alias.roundTo;
    if (typeof alias.roundUpperValuesTo === 'number' && alias.roundUpperValuesTo > 0) return alias.roundUpperValuesTo;
  }
  if (typeof inner.roundTo === 'number' && inner.roundTo > 0) return inner.roundTo;
  if (typeof scaling.roundTo === 'number' && scaling.roundTo > 0) return scaling.roundTo;
  if (typeof scaling.roundUpperValuesTo === 'number' && scaling.roundUpperValuesTo > 0) return scaling.roundUpperValuesTo;
  if (typeof inner.roundUpperValuesTo === 'number' && inner.roundUpperValuesTo > 0) return inner.roundUpperValuesTo;
  return 0;
}

function foundationTranslation(from, to, note) {
  return { from: from, to: to, note: note || '' };
}

/** Plain deep copy, so nothing the reader returns aliases what it was given. */
function foundationClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Normalise any config CodeFig has ever accepted into the v1 shape, and say what changed.
 *
 * Accepts: the current top-level shape, the legacy `structure.*` shape, the internal
 * `{collectionName, group, config, variables}` wrapper each script builds, `spacingScaling` /
 * `fontScaling`, `figmaStyles`, every `roundTo` spelling, `modes[]`, grid's viewport-keyed
 * objects, and a v1 config (idempotently).
 *
 * Never silently lossy: a key it does not recognise is kept under `domains.<d>.extra` and
 * reported, because losing a field nobody has met yet is worse than not understanding it.
 *
 * → { config, translations: [{from, to, note}], warnings: [{code, message}] }
 */
function normaliseConfig(raw) {
  var warnings = [];
  var translations = [];
  var out = emptyPortableConfig();

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push(foundationWarning('config-not-an-object', 'A config must be a JSON object. Nothing was read.'));
    return { config: out, translations: translations, warnings: warnings };
  }

  if (raw.v === foundationConfigVersion() && raw.domains && typeof raw.domains === 'object') {
    return normaliseV1Config(raw);
  }
  if (typeof raw.v === 'number' && raw.v !== foundationConfigVersion()) {
    warnings.push(foundationWarning('config-version', 'This config was written by a newer version of CodeFig (v' + raw.v + ').'));
    return { config: out, translations: translations, warnings: warnings };
  }

  // The wrapper each script builds around the user's object is not a user shape, but it is what
  // you get if you copy the wrong variable out of a script.
  var inner = raw;
  if (raw.config && typeof raw.config === 'object' && !Array.isArray(raw.config)) {
    inner = raw.config;
    translations.push(foundationTranslation('config.config', '(unwrapped)', 'read the inner config object'));
  }
  if (raw.variables !== undefined) {
    translations.push(foundationTranslation('variables', '(dropped)', 'variables are computed from the config'));
  }

  // Collection and group, across all three layers.
  if (raw.collectionName != null && raw.collectionName !== '') {
    out.collection = raw.collectionName;
  } else if (inner.collectionName != null && inner.collectionName !== '') {
    out.collection = inner.collectionName;
  } else if (inner.structure && inner.structure.variableCollection != null && inner.structure.variableCollection !== '') {
    out.collection = inner.structure.variableCollection;
    translations.push(foundationTranslation('structure.variableCollection', 'collection'));
  } else if (raw.structure && raw.structure.variableCollection != null && raw.structure.variableCollection !== '') {
    out.collection = raw.structure.variableCollection;
    translations.push(foundationTranslation('structure.variableCollection', 'collection'));
  } else {
    out.collection = 'Responsive System';
  }

  if (raw.group !== undefined && raw.group !== null) {
    out.group = raw.group;
  } else if (inner.group !== undefined && inner.group !== null) {
    out.group = inner.group;
  } else if (inner.structure && inner.structure.variableGroup !== undefined) {
    out.group = inner.structure.variableGroup;
    translations.push(foundationTranslation('structure.variableGroup', 'group'));
  } else if (raw.structure && raw.structure.variableGroup !== undefined) {
    out.group = raw.structure.variableGroup;
    translations.push(foundationTranslation('structure.variableGroup', 'group'));
  } else {
    out.group = '';
  }

  if (typeof inner.lineGrid === 'number') out.lineGrid = inner.lineGrid;

  var domain = configDomainOf(inner);
  if (!domain) {
    domain = 'unknown';
    warnings.push(foundationWarning('config-domain-unknown', 'Could not tell which kind of config this is. Its settings were kept but not interpreted.'));
  }

  var built = buildDomainSlice(inner, domain, translations, warnings);
  out.viewports = built.viewports;
  out.domains[domain] = built.slice;

  return { config: out, translations: translations, warnings: warnings };
}

/** Viewports and one domain slice, out of a legacy inner config. */
function buildDomainSlice(inner, domain, translations, warnings) {
  var slice = {
    tokens: null,
    nameTemplate: null,
    steps: null,
    scaling: {},
    perViewport: {},
    extra: {}
  };
  var viewports = [];
  var seen = {};
  var i;

  function addViewport(name, payload) {
    var entry = normaliseViewport({
      key: name,
      width: payload && typeof payload.containerWidth === 'number' ? payload.containerWidth
        : (payload && typeof payload.width === 'number' ? payload.width : undefined)
    });
    if (!entry || seen[entry.key]) return;
    seen[entry.key] = true;
    viewports.push(entry);
    var carried = {};
    for (var k in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
      if (k === 'name') continue;
      carried[k] = foundationClone(payload[k]);
    }
    slice.perViewport[entry.key] = carried;
  }

  // modes[], the current spelling.
  var modes = Array.isArray(inner.modes) ? inner.modes : [];
  for (i = 0; i < modes.length; i++) {
    if (modes[i] && typeof modes[i].name === 'string' && modes[i].name) addViewport(modes[i].name, modes[i]);
  }
  // Grid's other spelling: viewport objects as top-level keys.
  for (var key in inner) {
    if (!Object.prototype.hasOwnProperty.call(inner, key)) continue;
    if (foundationStructuralKeys().indexOf(key) !== -1) continue;
    if (foundationDomainKeys(domain).indexOf(key) !== -1) continue;
    if (isViewportPayload(inner[key])) addViewport(key, inner[key]);
  }
  // The registry sorts viewports mobile-first; a config block has the order its author wrote.
  // Those are different things, and conflating them would reverse someone's `modes` array the
  // first time they round-tripped a config through this. Keep the declared order for printing.
  if (viewports.length > 0) {
    slice.viewportOrder = viewports.map(function(v) { return v.key; });
  }
  viewports = sortViewports(viewports);

  // Scaling, folded from whichever alias carried it.
  var scalingSource = null;
  var scalingIsAlias = false;
  if (inner.spacingScaling && typeof inner.spacingScaling === 'object') {
    scalingSource = inner.spacingScaling;
    scalingIsAlias = true;
    translations.push(foundationTranslation('spacingScaling', 'scaling'));
    if (inner.fontScaling && typeof inner.fontScaling === 'object') {
      warnings.push(foundationWarning('config-ignored', 'Both spacingScaling and fontScaling were set. spacingScaling wins, as it does at run time; fontScaling was ignored.'));
    }
  } else if (inner.fontScaling && typeof inner.fontScaling === 'object') {
    scalingSource = inner.fontScaling;
    scalingIsAlias = true;
    translations.push(foundationTranslation('fontScaling', 'scaling'));
  } else if (inner.scaling && typeof inner.scaling === 'object') {
    scalingSource = inner.scaling;
  }
  if (scalingSource) {
    var fields = ['type', 'ease', 'rangeMode', 'easeInExponent', 'easeOutExponent'];
    for (i = 0; i < fields.length; i++) {
      if (scalingSource[fields[i]] !== undefined) slice.scaling[fields[i]] = scalingSource[fields[i]];
    }
  }
  if (inner.rangeMode !== undefined && slice.scaling.rangeMode === undefined) slice.scaling.rangeMode = inner.rangeMode;
  // One home. `roundTo` applies to every model, so it sits on the config beside them rather than
  // inside a curve only the endpoints model reads — and writing it to both left no rule saying
  // which one a reader should believe.
  var resolvedRoundTo = foundationResolveRoundTo(inner, scalingIsAlias ? scalingSource : null);
  if (resolvedRoundTo > 0) slice.roundTo = resolvedRoundTo;
  delete slice.scaling.roundTo;
  delete slice.scaling.roundUpperValuesTo;
  if (inner.roundUpperValuesTo !== undefined ||
      (inner.scaling && inner.scaling.roundUpperValuesTo !== undefined) ||
      (scalingIsAlias && scalingSource.roundUpperValuesTo !== undefined)) {
    translations.push(foundationTranslation('roundUpperValuesTo', 'scaling.roundTo'));
  }
  if (domain === 'typography') {
    // typography.js reads this off the alias too (typography.js:82-83).
    var lower = (scalingIsAlias && typeof scalingSource.roundLowerValuesTo === 'number')
      ? scalingSource.roundLowerValuesTo
      : inner.roundLowerValuesTo;
    if (typeof lower === 'number') slice.roundLowerValuesTo = lower;
  }

  // Tokens: an explicit list, or a template plus a count.
  var tokensKey = foundationTokensKey(domain);
  var tokens = tokensKey ? inner[tokensKey] : undefined;
  var steps = typeof inner.steps === 'number' ? inner.steps : null;
  if (Array.isArray(tokens) && tokens.length > 0) {
    slice.tokens = foundationClone(tokens);
    if (steps !== null) {
      // A list always wins over a count at run time, so dropping the count preserves behaviour.
      // This is also what a post-run config looks like: `steps` spent, `spacings` expanded.
      translations.push(foundationTranslation('steps', '(dropped)', 'the token list is explicit, so the step count is unused'));
    }
  } else if (typeof tokens === 'string' && tokens.trim()) {
    slice.nameTemplate = tokens.trim();
    slice.steps = steps;
  } else if (steps !== null) {
    slice.steps = steps;
  }

  // Passthroughs each domain reads.
  if (typeof inner.defaultBaseLevel === 'string') slice.defaultBaseLevel = inner.defaultBaseLevel;
  // Rounding applies to every model, so it is a field of the config rather than of the curve.
  if (typeof inner.roundTo === 'number') slice.roundTo = inner.roundTo;
  if (typeof inner.roundLowerValuesTo === 'number') slice.roundLowerValuesTo = inner.roundLowerValuesTo;
  if (inner.generateOverview !== undefined) slice.generateOverview = !!inner.generateOverview;
  if (domain === 'typography') {
    if (inner.figmaStyles !== undefined) {
      slice.styles = foundationClone(inner.figmaStyles);
      translations.push(foundationTranslation('figmaStyles', 'styles'));
    } else if (inner.styles !== undefined) {
      slice.styles = foundationClone(inner.styles);
    }
    if (Array.isArray(inner.fontWeights) || (inner.fontWeights && typeof inner.fontWeights === 'object')) {
      slice.fontWeights = foundationClone(inner.fontWeights);
    }
    if (inner.fontFamily !== undefined) slice.fontFamily = foundationClone(inner.fontFamily);
  }
  if (domain === 'colors') {
    if (inner.light !== undefined) slice.light = foundationClone(inner.light);
    if (inner.dark !== undefined) slice.dark = foundationClone(inner.dark);
  }
  if (domain === 'grid') {
    if (typeof inner.extensionColumns === 'number') slice.extensionColumns = inner.extensionColumns;
  }

  // Derived fields: dropped, and said out loud.
  var derived = foundationDerivedKeys();
  for (i = 0; i < derived.length; i++) {
    if (inner[derived[i]] !== undefined) {
      translations.push(foundationTranslation(derived[i], '(dropped)', 'recomputed on every run'));
    }
  }

  // Anything left is someone's field this table has not met. Keep it.
  var unknown = [];
  // Parameter sets are a declared field of the slice, not an unknown key — and not the outer v1
  // `sets`, which is a different list with the same name.
  if (Array.isArray(inner.sets)) slice.sets = foundationClone(inner.sets);
  if (Array.isArray(inner.modeNames)) slice.modeNames = foundationClone(inner.modeNames);

  for (var extraKey in inner) {
    if (!Object.prototype.hasOwnProperty.call(inner, extraKey)) continue;
    if (foundationStructuralKeys().indexOf(extraKey) !== -1) continue;
    if (foundationDomainKeys(domain).indexOf(extraKey) !== -1) continue;
    if (foundationSliceKeys(domain).indexOf(extraKey) !== -1) continue;
    if (seen[viewportKeyFromLabel(extraKey)] && isViewportPayload(inner[extraKey])) continue;
    // Working state the pipeline hung on the config on its way through. Not the author's, so not
    // theirs to get back — and dropped rather than parked in `extra`, which is exported.
    if (extraKey.indexOf('__') === 0) continue;
    slice.extra[extraKey] = foundationClone(inner[extraKey]);
    unknown.push(extraKey);
  }
  if (unknown.length > 0) {
    warnings.push(foundationWarning('config-unknown-key', 'Kept, but not interpreted: ' + unknown.join(', ') + '.', { keys: unknown }));
  }

  return { slice: slice, viewports: viewports };
}

/** A v1 config in, the same v1 config out — so a round trip through a text layer cannot drift. */
function normaliseV1Config(raw) {
  var warnings = [];
  var out = emptyPortableConfig();
  var i;

  out.collection = raw.collection != null ? raw.collection : null;
  out.group = raw.group != null ? raw.group : null;
  out.lineGrid = typeof raw.lineGrid === 'number' ? raw.lineGrid : null;

  var viewports = [];
  var list = Array.isArray(raw.viewports) ? raw.viewports : [];
  for (i = 0; i < list.length; i++) {
    var v = normaliseViewport(list[i]);
    if (v) viewports.push(v);
  }
  out.viewports = sortViewports(viewports);

  for (var domain in raw.domains) {
    if (!Object.prototype.hasOwnProperty.call(raw.domains, domain)) continue;
    out.domains[domain] = normaliseDomainSlice(raw.domains[domain], domain);
  }
  if (Array.isArray(raw.sets) && raw.sets.length > 0) {
    out.sets = [];
    for (i = 0; i < raw.sets.length; i++) {
      var set = raw.sets[i] || {};
      out.sets.push({
        collection: set.collection != null ? set.collection : out.collection,
        group: set.group != null ? set.group : out.group,
        domain: String(set.domain || ''),
        config: normaliseDomainSlice(set.config, set.domain)
      });
    }
  }

  return { config: out, translations: [], warnings: warnings };
}

/** One domain slice, with the derived fields stripped wherever it came from. */
function normaliseDomainSlice(raw, domain) {
  var slice = {
    tokens: null,
    nameTemplate: null,
    steps: null,
    scaling: {},
    perViewport: {},
    extra: {}
  };
  if (!raw || typeof raw !== 'object') return slice;

  var allowed = foundationSliceKeys(domain);
  for (var key in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    if (allowed.indexOf(key) === -1) continue;
    slice[key] = foundationClone(raw[key]);
  }
  if (!slice.scaling || typeof slice.scaling !== 'object') slice.scaling = {};
  if (!slice.perViewport || typeof slice.perViewport !== 'object') slice.perViewport = {};
  if (slice.sets !== undefined && !Array.isArray(slice.sets)) delete slice.sets;
  if (!slice.extra || typeof slice.extra !== 'object') slice.extra = {};
  if (slice.tokens === undefined) slice.tokens = null;
  if (slice.nameTemplate === undefined) slice.nameTemplate = null;
  if (slice.steps === undefined) slice.steps = null;
  return slice;
}

/**
 * The bridge back: a v1 config in the shape today's unrewritten scripts read.
 *
 * Two normalisation paths exist for the length of phases 3-5 — this reader and each script's own
 * `ensureCompat*` — and this is what keeps them from disagreeing. Each domain rewrite deletes its
 * branch. Viewports with no payload for this domain are skipped: a mode with no min/max would
 * generate different values, not merely an extra mode.
 */
function toDomainConfig(v1, domain, options) {
  var opts = options || {};
  var config = (v1 && v1.domains && v1.domains[domain]) ? v1.domains[domain] : null;

  if (!config && v1 && Array.isArray(v1.sets)) {
    for (var s = 0; s < v1.sets.length; s++) {
      if (v1.sets[s].domain !== domain) continue;
      if (opts.collection && v1.sets[s].collection !== opts.collection) continue;
      config = v1.sets[s].config;
      break;
    }
  }
  if (!config) return null;

  // Built in the order the shipped config blocks are written, because this object is what a
  // user pastes back into one.
  var out = {};

  // A slice's own collection and group win over the config's defaults — that is how a config
  // carrying Grid in one collection and Spacing in another stays one config.
  out.collectionName = opts.collection != null ? opts.collection
    : (config.collection != null ? config.collection
      : (v1.collection != null ? v1.collection : 'Responsive System'));
  out.group = opts.group != null ? opts.group
    : (config.group != null ? config.group
      : (v1.group != null ? v1.group : ''));

  var tokensKey = foundationTokensKey(domain);
  if (tokensKey) {
    if (Array.isArray(config.tokens) && config.tokens.length > 0) {
      out[tokensKey] = foundationClone(config.tokens);
    } else if (config.nameTemplate) {
      out[tokensKey] = config.nameTemplate;
      if (typeof config.steps === 'number') out.steps = config.steps;
    }
  }
  if (out.steps === undefined && typeof config.steps === 'number' && !config.nameTemplate) out.steps = config.steps;

  if (config.scaling && typeof config.scaling === 'object') {
    // `roundTo: 0` is v1's way of saying "no rounding", which is worth being explicit about in
    // the stored shape and is noise in a pasted block — Grid does not read `scaling` at all.
    // Only what shapes a curve. `roundTo` is emitted at the top level instead: it applies whatever
    // the model is, and a config carrying both spellings gave a reader no way to tell which was
    // live — which is how `scaling: { type: "sine", ease: "in" }` came to sit above sets that all
    // said `model: "metric"`.
    var scaling = {};
    var curveIsRead = sliceUsesEndpoints(config);
    for (var sk in config.scaling) {
      if (!Object.prototype.hasOwnProperty.call(config.scaling, sk)) continue;
      if (sk === 'roundTo' || sk === 'roundUpperValuesTo') continue;
      // The same rule the writer applies, applied on the way out too. A manifest recorded before
      // that rule existed still carries the inert curve, and handing it back would put
      // `type: "sine"` into a block whose every set says `model: "metric"` — the exact thing the
      // rule exists to stop, arriving by age rather than by a bug.
      if (!curveIsRead && curveKeys().indexOf(sk) !== -1) continue;
      scaling[sk] = foundationClone(config.scaling[sk]);
    }
    if (Object.keys(scaling).length > 0) out.scaling = scaling;
  }
  if (config.defaultBaseLevel !== undefined) out.defaultBaseLevel = config.defaultBaseLevel;
  if (config.generateOverview !== undefined) out.generateOverview = config.generateOverview;
  if (config.styles !== undefined) out.styles = foundationClone(config.styles);
  if (config.fontWeights !== undefined) out.fontWeights = foundationClone(config.fontWeights);
  // Promoted on the way out as well as on the way in: an old manifest keeps `roundTo` inside
  // `scaling`, and that is where the reader has just stopped looking.
  if (config.roundTo !== undefined) out.roundTo = config.roundTo;
  else if (config.scaling && typeof config.scaling.roundTo === 'number' && config.scaling.roundTo > 0) {
    out.roundTo = config.scaling.roundTo;
  } else if (config.scaling && typeof config.scaling.roundUpperValuesTo === 'number' && config.scaling.roundUpperValuesTo > 0) {
    out.roundTo = config.scaling.roundUpperValuesTo;
  }
  if (config.roundLowerValuesTo !== undefined) out.roundLowerValuesTo = config.roundLowerValuesTo;
  if (config.fontFamily !== undefined) out.fontFamily = foundationClone(config.fontFamily);
  if (config.light !== undefined) out.light = foundationClone(config.light);
  if (config.dark !== undefined) out.dark = foundationClone(config.dark);
  if (config.extensionColumns !== undefined) out.extensionColumns = config.extensionColumns;
  if (typeof v1.lineGrid === 'number') out.lineGrid = v1.lineGrid;

  // The author's order when we know it, the registry's otherwise.
  var modes = [];
  var order = Array.isArray(config.viewportOrder) && config.viewportOrder.length > 0
    ? config.viewportOrder.map(function(key) { return { key: key }; })
    : (Array.isArray(v1.viewports) ? v1.viewports : []);
  var viewports = order;
  for (var i = 0; i < viewports.length; i++) {
    var payload = config.perViewport[viewports[i].key];
    if (!payload) continue;
    var mode = { name: viewports[i].key };
    for (var k in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) mode[k] = foundationClone(payload[k]);
    }
    modes.push(mode);
  }
  if (modes.length > 0) out.modes = modes;

  // Sets are the newer spelling of the same thing, and they carry `appliesTo`, which `perViewport`
  // has no way to say. A config holding both is not something we invent a resolution for — the
  // sets win, because only a writer that knows about sets could have put them there.
  if (Array.isArray(config.sets) && config.sets.length > 0) {
    out.sets = foundationClone(config.sets);
    delete out.modes;
  }

  // Anything the reader kept but did not interpret goes last, so it never displaces a field the
  // script actually reads.
  for (var extraKey in config.extra) {
    if (Object.prototype.hasOwnProperty.call(config.extra, extraKey) && out[extraKey] === undefined) {
      out[extraKey] = foundationClone(config.extra[extraKey]);
    }
  }

  return out;
}

// ============================================================================
// PRINTING A CONFIG BACK INTO A CONFIG BLOCK
//
// What a user pastes is the *contents* of a script's `@CONFIG_START` block — a property list in
// a JS object literal, not JSON. Emitting JSON would be a second format to learn, which is the
// thing this whole plan exists to avoid. So the clipboard gets the shape the block already has:
// unquoted keys, two-space indent, objects in arrays expanded.
// ============================================================================

/**
 * Fields that shape a curve, which only the `endpoints` model reads. A function, not a constant,
 * because `@import` extracts only top-level function declarations — see the note at the top.
 */
function curveKeys() {
  return ['type', 'ease', 'easeInExponent', 'easeOutExponent'];
}

/**
 * Does any set or viewport in this slice generate with the endpoints model?
 *
 * Absent means endpoints, which is the older default — so a slice that says nothing keeps its
 * curve. Dropping one someone declared is worse than keeping one nothing reads.
 */
function sliceUsesEndpoints(slice) {
  var payloads = [];
  if (Array.isArray(slice.sets)) payloads = payloads.concat(slice.sets);
  if (slice.perViewport && typeof slice.perViewport === 'object') {
    for (var key in slice.perViewport) {
      if (Object.prototype.hasOwnProperty.call(slice.perViewport, key)) payloads.push(slice.perViewport[key]);
    }
  }
  if (payloads.length === 0) return true;
  for (var i = 0; i < payloads.length; i++) {
    var model = payloads[i] && payloads[i].model;
    if (!model || model === 'endpoints') return true;
  }
  return false;
}

// ============================================================================
// PANEL PREVIEWS
//
// A domain's preview is the one bespoke part of the shared panel skeleton (see plan 18). The ramp
// previews live with their generator in `@Linear Ramp`; Grid has no generator library — `grid.js` is a
// script — so its preview lives here. If a Grid library ever appears, this moves to it.
//
// Pure, like `rampPreviewHtml`: it computes and renders, and touches nothing. That is what lets the
// Configuration tab redraw it on every keystroke.
// ============================================================================

/** `&` and `<` in a label would otherwise close a tag. */
function foundationEscapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * One mode's grid, as numbers.
 *
 * `calculateColumnWidth` is the generator's own function, so the preview and the run cannot disagree
 * about a column width — which is the whole point of a preview.
 *
 * → { ok, width, columns, gap, margin, content, colWidth, spans: [{ n, span }], scale }
 */
function gridPreviewModel(mode, drawnWidth) {
  var width = Number(mode && mode.containerWidth);
  var columns = Number(mode && mode.columns);
  var gap = Number(mode && mode.gap);
  var margin = Number(mode && mode.padding);
  var ok = isFinite(width) && width > 0 && isFinite(columns) && columns > 0 &&
    isFinite(gap) && gap >= 0 && isFinite(margin) && margin >= 0 && width - 2 * margin > 0;
  if (!ok) return { ok: false, columns: isFinite(columns) && columns > 0 ? columns : 12 };

  var content = width - 2 * margin;
  var colWidth = calculateColumnWidth({
    containerWidth: width, padding: margin, columns: columns, gap: gap
  });
  var spans = [];
  for (var n = 1; n <= columns; n++) {
    spans.push({ n: n, span: n * colWidth + (n - 1) * gap });
  }
  return {
    ok: true,
    width: width, columns: columns, gap: gap, margin: margin,
    content: content, colWidth: colWidth, spans: spans,
    // The percentage the Total line reports *is* the scale the diagram is drawn at — the frame draws
    // 716 for a 1440 total, which is 49.7%.
    scale: (drawnWidth || 716) / width
  };
}

/** A number as a panel shows it: whole when it is whole, one decimal when it is not. */
function gridPreviewNumber(value) {
  return Math.abs(value - Math.round(value)) < 0.01 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
}

/**
 * The preview for one mode. Grey until there is somewhere to write — the Start and New frames are grey
 * even with modes set, so grey is about whether a collection has been chosen, not whether fields are
 * filled.
 */
function gridPreviewHtml(config, domain, modeName) {
  var inner = (config && config.config) || config || {};
  var modes = Array.isArray(inner.modes) ? inner.modes : [];
  var mode = null;
  for (var i = 0; i < modes.length; i++) {
    if (!modeName || String(modes[i].name).toLowerCase() === String(modeName).toLowerCase()) {
      mode = modes[i];
      break;
    }
  }
  if (!mode) mode = modes[0] || null;

  var unset = !inner.collectionName || String(inner.collectionName).trim() === '';
  var model = gridPreviewModel(mode, 716);

  var out = ['<div class="grid-preview' + (unset || !model.ok ? ' is-unset' : '') + '">'];

  var columns = model.ok ? model.columns : (model.columns || 12);
  var pct = function(value) { return Math.round((value / model.width) * 10000) / 100; };

  out.push('<div class="grid-preview-diagram">');
  if (model.ok) {
    out.push('<div class="grid-preview-margin" style="width:' + pct(model.margin) + '%"></div>');
    for (var c = 0; c < columns; c++) {
      if (c) out.push('<div class="grid-preview-gap" style="width:' + pct(model.gap) + '%"></div>');
      out.push('<div class="grid-preview-col" style="width:' + pct(model.colWidth) + '%"></div>');
    }
    out.push('<div class="grid-preview-margin" style="width:' + pct(model.margin) + '%"></div>');
  } else {
    // Nothing to be proportional to yet, so an even field of columns stands in for the shape.
    for (var e = 0; e < columns; e++) {
      if (e) out.push('<div class="grid-preview-gap" style="width:1.5%"></div>');
      out.push('<div class="grid-preview-col" style="width:' +
        (Math.round((97 / columns) * 100) / 100) + '%"></div>');
    }
  }
  out.push('</div>');

  out.push('<div class="grid-preview-total">Total: <b>' +
    (model.ok ? gridPreviewNumber(model.width) : '—') + '</b> (' +
    (model.ok ? Math.round(model.scale * 100) + '%' : '—') + ')</div>');

  var inset = model.ok ? pct(model.margin) : 0;
  out.push('<div class="grid-preview-guides" style="margin-left:' + inset + '%;margin-right:' + inset + '%"></div>');

  for (var r = 0; r < columns; r++) {
    var span = model.ok ? model.spans[r] : null;
    out.push('<div class="grid-preview-bar" style="margin-left:' + inset + '%;width:' +
      (span ? pct(span.span) : Math.round(((r + 1) / columns) * 9000) / 100) + '%"></div>');
    out.push('<div class="grid-preview-value">col-' + (r + 1) + ': <b>' +
      (span ? gridPreviewNumber(span.span) : '—') + '</b></div>');
  }

  out.push('</div>');
  return out.join('');
}

/** Can this key be written without quotes in a JS object literal? */
function isPlainConfigKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(key));
}

function formatConfigString(value) {
  return JSON.stringify(String(value));
}

/** One value, indented for its depth. Arrays of primitives stay on one line. */
function formatConfigLiteral(value, indent) {
  var pad = new Array(indent + 1).join('  ');
  var innerPad = new Array(indent + 2).join('  ');
  var i;

  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return formatConfigString(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    var allPrimitive = true;
    for (i = 0; i < value.length; i++) {
      if (value[i] !== null && typeof value[i] === 'object') allPrimitive = false;
    }
    if (allPrimitive) {
      var inline = [];
      for (i = 0; i < value.length; i++) inline.push(formatConfigLiteral(value[i], 0));
      return '[' + inline.join(', ') + ']';
    }
    var items = [];
    for (i = 0; i < value.length; i++) {
      items.push(innerPad + formatConfigLiteral(value[i], indent + 1));
    }
    return '[\n' + items.join(',\n') + '\n' + pad + ']';
  }

  var keys = Object.keys(value);
  if (keys.length === 0) return '{}';
  var lines = [];
  for (i = 0; i < keys.length; i++) {
    var key = isPlainConfigKey(keys[i]) ? keys[i] : formatConfigString(keys[i]);
    lines.push(innerPad + key + ': ' + formatConfigLiteral(value[keys[i]], indent + 1));
  }
  return '{\n' + lines.join(',\n') + '\n' + pad + '}';
}

/**
 * A config as the property list that goes between `// @CONFIG_START` and `// @CONFIG_END` —
 * no outer braces, indented to sit where the shipped block sits.
 *
 * Comments are not regenerated: a pasted block carries the values, not the explanations the
 * shipped script ships with. That is the one thing this loses against copying the block by hand.
 */
function formatConfigBlock(config) {
  if (!config || typeof config !== 'object') return '';
  var keys = Object.keys(config);
  var lines = [];
  for (var i = 0; i < keys.length; i++) {
    var key = isPlainConfigKey(keys[i]) ? keys[i] : formatConfigString(keys[i]);
    lines.push('  ' + key + ': ' + formatConfigLiteral(config[keys[i]], 1));
  }
  return lines.join(',\n');
}

/** Which script's config block a domain's config belongs in. */
function foundationDomainScriptName(domain) {
  if (domain === 'grid') return 'Grid';
  if (domain === 'spacing') return 'Spacing';
  if (domain === 'radius') return 'Corner radius';
  if (domain === 'typography') return 'Typography';
  return domain;
}

/**
 * Build a v1 config from what `readFoundation` found: the registry's viewports, and one entry
 * per recorded set. `domains` is the convenience view, one entry per domain; when a file holds
 * two sets of the same domain — "Spacing A" and "Spacing B" — every set is also listed under
 * `sets`, so nothing is lost to the shape.
 */
function toPortableConfig(foundation, options) {
  var opts = options || {};
  var out = emptyPortableConfig();
  var f = foundation || {};
  var sets = Array.isArray(f.sets) ? f.sets : [];
  var i;

  var viewports = Array.isArray(f.viewports) ? f.viewports : [];
  for (i = 0; i < viewports.length; i++) {
    out.viewports.push({ key: viewports[i].key, label: viewports[i].label, width: viewports[i].width });
  }
  if (typeof f.lineGrid === 'number') out.lineGrid = f.lineGrid;

  if (sets.length > 0) {
    out.collection = opts.collection != null ? opts.collection : sets[0].collection;
    out.group = opts.group != null ? opts.group : sets[0].group;
  }

  // Each slice carries its own collection and group, so two domains written to two different
  // collections do not need a second shape to describe them.
  var overflow = false;
  for (i = 0; i < sets.length; i++) {
    var set = sets[i];
    var slice = normaliseDomainSlice(set.config, set.domain);
    slice.collection = set.collection;
    slice.group = set.group;
    if (!out.domains[set.domain]) {
      out.domains[set.domain] = slice;
    } else {
      overflow = true;
    }
  }

  // Only a genuine collision needs the set list: two sets of the *same* domain, which is what
  // "Spacing A" and "Spacing B" in two collections looks like. Nothing is lost to the shape.
  if (overflow) {
    out.sets = [];
    for (i = 0; i < sets.length; i++) {
      out.sets.push({
        collection: sets[i].collection,
        group: sets[i].group,
        domain: sets[i].domain,
        config: normaliseDomainSlice(sets[i].config, sets[i].domain)
      });
    }
    out.note = 'This file holds more than one set of the same kind. `domains` shows the first; `sets` lists them all.';
  }

  return out;
}

/**
 * v1 as JSON, for the machine-readable routes: a manifest, a canvas text layer, the CLI.
 * Keys that are null carry no information — a reader restores them — so they are left out
 * rather than filling the file with `"lineGrid": null`.
 */
function serialisePortableConfig(config) {
  return JSON.stringify(config, function (key, value) {
    return value === null ? undefined : value;
  }, 2);
}

/**
 * Parse a config someone may have hand-edited — in a text layer, or pasted. Never throws, and
 * locates a syntax error by line, because "Unexpected token } at position 412" is not usable.
 */
function parsePortableConfig(text) {
  var raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) {
    return { config: null, translations: [], warnings: [foundationWarning('config-empty', 'There is nothing to read.')] };
  }

  var parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    var message = (e && e.message) ? e.message : String(e);
    var match = /position (\d+)/.exec(message);
    var where = '';
    if (match) {
      var position = parseInt(match[1], 10);
      var before = raw.slice(0, position);
      var line = before.split('\n').length;
      var column = position - before.lastIndexOf('\n');
      var fragment = raw.split('\n')[line - 1] || '';
      where = ' at line ' + line + ', column ' + column + ': ' + fragment.trim().slice(0, 60);
    } else {
      where = ' at line 1';
    }
    return {
      config: null,
      translations: [],
      warnings: [foundationWarning('config-unparseable', 'This is not valid JSON' + where + '. Nothing was applied.')]
    };
  }

  return normaliseConfig(parsed);
}

/** One line per translation, for a run's output. */
function describeConfigTranslations(translations) {
  var lines = [];
  for (var i = 0; i < (translations || []).length; i++) {
    var t = translations[i];
    lines.push('  ' + t.from + ' → ' + t.to + (t.note ? ' (' + t.note + ')' : ''));
  }
  return lines.join('\n');
}

// ============================================================================
// CONFIG ON CANVAS, AND ON THE CLIPBOARD
// ============================================================================

function foundationConfigLayerName(collection) {
  return 'CodeFig config' + (collection ? ' — ' + collection : '');
}

/**
 * A font that can actually be loaded. `createText` then `.characters` throws without one, and
 * Inter is only the default until it is not — there is no loadFontAsync anywhere in the DSF
 * scripts today, and this is where that omission would have bitten.
 */
async function loadConfigFont() {
  var candidates = [
    { family: 'Roboto Mono', style: 'Regular' },
    { family: 'Inter', style: 'Regular' }
  ];
  for (var i = 0; i < candidates.length; i++) {
    try {
      await figma.loadFontAsync(candidates[i]);
      return candidates[i];
    } catch (e) {}
  }
  var available = await figma.listAvailableFontsAsync();
  for (var j = 0; j < available.length; j++) {
    try {
      await figma.loadFontAsync(available[j].fontName);
      return available[j].fontName;
    } catch (e) {}
  }
  return null;
}

/** Every text node on this page that is one of ours, by stamp first and name second. */
async function findConfigTextLayers(options) {
  var opts = options || {};
  var page = opts.page || figma.currentPage;
  var found = [];
  var texts = page.findAllWithCriteria ? page.findAllWithCriteria({ types: ['TEXT'] }) : [];
  for (var i = 0; i < texts.length; i++) {
    var node = texts[i];
    var stamp = '';
    try {
      stamp = node.getSharedPluginData(foundationNamespace(), 'config-kind');
    } catch (e) {}
    if (stamp === foundationConfigKind() || String(node.name || '').indexOf('CodeFig config') === 0) {
      found.push(node);
    }
  }
  return found;
}

/**
 * Park a config on canvas, in a form the reader can take straight back.
 * Updates the existing layer for this collection rather than adding a second one.
 */
async function writeConfigToTextLayer(config, options) {
  var opts = options || {};
  var text = serialisePortableConfig(config);
  var name = opts.name || foundationConfigLayerName(config && config.collection);

  var font = await loadConfigFont();
  if (!font) {
    return { ok: false, node: null, warnings: [foundationWarning('config-no-font', 'No font could be loaded, so the config could not be written to canvas. Copy it to the clipboard instead.')] };
  }

  var node = null;
  var existing = await findConfigTextLayers(opts);
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].name === name) { node = existing[i]; break; }
  }

  if (!node) {
    node = figma.createText();
    node.name = name;
    var bounds = figma.viewport.bounds;
    node.x = Math.round(bounds.x + 40);
    node.y = Math.round(bounds.y + 40);
    figma.currentPage.appendChild(node);
  }

  node.fontName = font;
  node.characters = text;
  node.setSharedPluginData(foundationNamespace(), 'config-kind', foundationConfigKind());

  return { ok: true, node: node, warnings: [], bytes: text.length };
}

/**
 * Read a config back off canvas: the selection if it is a text node, otherwise the page's
 * stamped layers. Two candidates is an ambiguity to report, not a coin to toss.
 */
async function readConfigFromTextLayer(options) {
  var opts = options || {};
  var node = opts.node || null;

  if (!node) {
    var selection = figma.currentPage.selection || [];
    for (var i = 0; i < selection.length; i++) {
      if (selection[i].type === 'TEXT') { node = selection[i]; break; }
    }
  }
  if (!node) {
    var candidates = await findConfigTextLayers(opts);
    if (candidates.length === 1) {
      node = candidates[0];
    } else if (candidates.length > 1) {
      var names = candidates.map(function (n) { return n.name; });
      return {
        config: null, translations: [], node: null,
        warnings: [foundationWarning('config-ambiguous', 'This page has ' + candidates.length + ' config layers: ' + names.join(', ') + '. Select the one you mean and run again.', { names: names })]
      };
    }
  }
  if (!node) {
    return {
      config: null, translations: [], node: null,
      warnings: [foundationWarning('config-not-found', 'No config layer on this page, and nothing selected. Write one first, or select a text layer holding a config.')]
    };
  }

  var read = parsePortableConfig(node.characters);
  return { config: read.config, translations: read.translations, warnings: read.warnings, node: node };
}

// ============================================================================
// LOADING A CONFIG FROM THE FILE
//
// The one implementation of "read this file's config", shared by the sync button, a run and the
// CLI. It lives here rather than in src/code.ts because the backend cannot reach a script
// library: @foundation.js is embedded in ui.html and resolved at run time, and dist/code.js is a
// separate bundle. A second copy in TypeScript is exactly the duplication 16a removed.
// ============================================================================

/**
 * Everything a form or a CLI needs to fill a config from the file: the v1 config, and — when a
 * domain is named — that domain in the shape today's scripts read.
 *
 * Reads only. Nothing here writes a variable, a mode, a manifest or the registry.
 */
async function foundationConfigPayload(domain, options) {
  var foundation = await readFoundation(options || {});
  var v1 = toPortableConfig(foundation);
  var payload = {
    v1: v1,
    domain: domain || null,
    config: domain ? toDomainConfig(v1, domain) : null,
    warnings: foundation.warnings || []
  };
  return payload;
}
