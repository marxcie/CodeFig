// @Foundation
// @DOC_START
// # Stores Design System Foundations manifests, viewport registry, stamps, and portable config
//
// ## Overview
//
// One **viewport registry** per file (on `figma.root`), one **manifest** per generated token set (on the collection), and the helpers Design System Foundations scripts share.
//
// A **viewport** is `{ key, label, width }` — columns, gaps, and scales stay in each domain's payload. A **set** is one run's output: `{ collection, group, domain, config }`. Two collections can hold two sets while sharing one registry.
//
// Storage is shared plugin data in the `codefig` namespace (readable by other tooling / REST). Each entry is capped at 100 kB; oversize writes are reported, not thrown.
//
// ### Nothing here deletes
//
// No collection- or variable-removal helper. A variable's id and published key are minted at creation — delete and recreate breaks bindings in this file and leaves subscribers with missing variables. Rename is safe; update in place.
//
// ### The file wins over the manifest
//
// `readFoundation` reconciles registry, modes, and `viewport-width` variables. Where they disagree, the document wins and the disagreement is reported. Use `describeFoundation` so invisible state shows up in a run's output.
//
// Mode helpers need companions from `@Variables`: `planFoundationModes` → `planModes`; `applyFoundationModes` → `setupModes`.
//
// ### Portable config
//
// One v1 shape covers paste-between-files, the manifest `config` slice, and Copy config. `normaliseConfig` accepts older spellings and reports translations. `toDomainConfig` converts back for domain scripts. Derived fields are dropped on the way in so a paste cannot freeze a one-shot derivation.
//
// Token identity is a **stamp** (`{ owner, domain, set, token }`), not a name. Bracket writes with `alignStampedTokens` then `stampGeneratedTokens` after `writeManifest`.
//
// Boot-time repair of orphan plugin data lives in the plugin main (`foundation-maintain`), not here — `reconcileFoundation` stays read-only.
//
// ## Exported functions
//
// | Category | Functions |
// |----------|-----------|
// | Storage keys | foundationNamespace, foundationRegistryKey, foundationSetKey, foundationSetIdFromKey, foundationMintSetId, foundationEntrySizeLimit |
// | Helpers | viewportLabel, viewportKeyFromLabel, namePrefix, resolveCollectionName, resolveGroup, expandTokenList, tokenListHasSeries |
// | Registry / manifest | normaliseViewport, sortViewports, parseRegistry, serialiseRegistry, parseManifest, serialiseManifest |
// | Reconciliation | reconcileFoundation, describeFoundation, deriveSetGroup |
// | Figma | readFoundation, registryViewportLabels, writeRegistry, readManifest, writeManifest, findFoundationSet |
// | Modes | planFoundationModes, applyFoundationModes, foundationModeIds |
// | Config | normaliseConfig, toDomainConfig, toPortableConfig, emptyPortableConfig, configDomainOf |
// | Config text | serialisePortableConfig, parsePortableConfig, describeConfigTranslations |
// | Config on canvas | writeConfigToTextLayer, readConfigFromTextLayer, findConfigTextLayers |
// | Stamps | stampValue, readStampFrom, stampToken, readStamp, planCopyMoveSetIdentity, findByStamp, alignStampedTokens, stampGeneratedTokens, describeStampAlignment |
// @DOC_END
// Shared component styles for markup this library emits (tier 2: library @STYLE_START).
// Opening a script that @imports this library injects these with the script sheet.
// @STYLE_START
// /* ============================================================
//    GRID PANEL — preview and suggestions
//
//    Written against artifacts/mockup-panels/grid-target.html, which links this stylesheet, so
//    the mockup and the plugin cannot disagree about how these look. Colours from the frames:
//    margins purple, columns green.
//    ============================================================ */
// /* 7 & 8. **One grid.** Row N holds the span bar and its col-N value, so they share a line by
//    construction rather than because two stacks were given matching gaps — which is what they had,
//    7px against 5px, and matching the numbers would only have hidden the fact that nothing tied
//    them together.
//
//    The diagram and the Total line are the first row; the twelve span rows follow.
//
//    8. Every width is a **proportion of the largest mode**, fitted to the preview column: the
//    widest viewport is 100% of the content area, and every other mode is `width / maxWidth` of
//    that. Name + width sit **above** the track; ticks continue through the grey remainder and
//    sit under the active grid so they never paint over margins or columns. The right-hand
//    Total/values column keeps a fixed min width across modes so the bar does not reflow. */
// .grid-preview {
//   display: grid;
//   grid-template-columns: minmax(0, 1fr) max-content;
//   column-gap: var(--space-xl);
//   row-gap: 6px;
//   width: 100%;
//   align-items: center;
// }
//
// /* Viewport ruler: every mode as a named tick on the largest-mode scale. Not interactive. */
// .grid-preview-ruler {
//   grid-column: 1;
//   position: relative;
//   /* Name + width + 4px under them, then the track. */
//   padding-top: 30px;
//   margin-bottom: 6px;
//   pointer-events: none;
// }
//
// .grid-preview-ruler-track {
//   position: relative;
//   height: 28px;
//   border-radius: var(--radius-sm);
//   background: rgba(128, 128, 128, 0.18);
//   overflow: hidden;
// }
//
// /* Opaque so a through-tick never shows in gaps. */
// .grid-preview-ruler-active {
//   position: absolute;
//   left: 0;
//   top: 0;
//   bottom: 0;
//   z-index: 2;
//   background: var(--bg-primary, #2c2c2e);
// }
//
// .grid-preview-diagram {
//   display: flex;
//   width: 100%;
//   height: 100%;
// }
//
// /* A filled band, not a dashed edge. The dashed guides still run down the spans area at the
//    content edges — the frame has both — but the band is the margin. */
// /* `flex: 0 0 auto` because these widths *are* the drawing: a flex item that shrinks turns a
//    proportional diagram into an approximate one, and at a narrow width the margin band rounds
//    away to nothing — which is exactly how it went missing. Percentages are of the diagram (itself
//    a % of the column), so they stay exact without scrolling. */
// .grid-preview-margin,
// .grid-preview-col,
// .grid-preview-gap {
//   flex: 0 0 auto;
// }
//
// .grid-preview-margin { background: #b7a8f0; }
// .grid-preview-col { background: #17976a; }
// .grid-preview-gap { background: transparent; }
//
// /* Through the track only — under the active grid, so grey shows the line and green/purple do not. */
// .grid-preview-ruler-tick {
//   position: absolute;
//   top: 0;
//   bottom: 0;
//   z-index: 1;
//   width: 0;
//   border-left: 1px solid rgba(80, 80, 85, 0.9);
// }
//
// .grid-preview-ruler-tick.is-active {
//   border-left-color: rgba(200, 200, 210, 0.95);
// }
//
// /* Label band above the track: name + width, tick ending at the bar. */
// .grid-preview-ruler-mark {
//   position: absolute;
//   top: 0;
//   height: 30px;
//   width: 0;
//   border-left: 1px solid rgba(80, 80, 85, 0.9);
// }
//
// .grid-preview-ruler-mark.is-active {
//   border-left-color: rgba(200, 200, 210, 0.95);
// }
//
// .grid-preview-ruler-label {
//   position: absolute;
//   right: 5px;
//   bottom: 4px;
//   display: flex;
//   flex-direction: column;
//   align-items: flex-end;
//   gap: 0;
//   white-space: nowrap;
//   text-align: right;
//   font-size: var(--font-size-small);
//   line-height: 1.15;
//   opacity: 0.4;
// }
//
// .grid-preview-ruler-mark.is-active .grid-preview-ruler-label {
//   opacity: 0.9;
// }
//
// .grid-preview-ruler-size {
//   opacity: 0.85;
// }
//
// /* Fixed across modes — otherwise Total/col-N length changes squeeze the bar when switching tabs. */
// .grid-preview-total,
// .grid-preview-value {
//   min-width: calc(var(--grid-preview-meta-ch, 14) * 1ch);
// }
//
// .grid-preview-total {
//   grid-column: 2;
//   align-self: flex-start;
//   white-space: nowrap;
// }
//
// /* The guides: one item spanning every span row, behind the bars. Drawn once rather than per row,
//    so they are continuous the way the frame shows them. */
// .grid-preview-guides {
//   grid-column: 1;
//   grid-row: 2 / -1;
//   align-self: stretch;
//   border-left: 1px dashed rgba(120, 100, 200, 0.7);
//   border-right: 1px dashed rgba(120, 100, 200, 0.7);
//   background: rgba(183, 168, 240, 0.09);
//   pointer-events: none;
// }
//
// .grid-preview-bar {
//   grid-column: 1;
//   height: 8px;
//   border-radius: var(--radius-sm);
//   background: #17976a;
// }
//
// .grid-preview-value {
//   grid-column: 2;
//   white-space: nowrap;
//   font-size: var(--font-size-body);
// }
//
// /* No target chosen yet. The Start and New frames are grey even with modes set, so this is about
//    whether there is somewhere to write, not whether the fields are filled. */
// .grid-preview.is-unset .grid-preview-margin { background: #dcdcdf; }
// .grid-preview.is-unset .grid-preview-col { background: #8a8a8e; }
// .grid-preview.is-unset .grid-preview-bar { background: #dcdcdf; }
// .grid-preview.is-unset .grid-preview-guides {
//   border-color: rgba(140, 140, 145, 0.6);
//   background: rgba(140, 140, 145, 0.05);
// }
// .grid-preview.is-unset .grid-preview-value,
// .grid-preview.is-unset .grid-preview-total { opacity: 0.55; }
//
// /* **Three across, two down.** Márton's revision: the cards speak for the mode you are looking at
//    and nothing else, so they carry no badges — and without a right-hand column of tags there is no
//    reason for a card to be a full-width row. `repeat(3, 1fr)` rather than `auto-fill`, because six
//    cards in a 3x2 grid is the design; a card count that reflows with the panel width would make the
//    section a different shape at every size. */
// .grid-suggestions {
//   display: grid;
//   grid-template-columns: repeat(3, 1fr);
//   gap: var(--space-sm);
//   width: 100%;
// }
//
// .grid-suggestion {
//   display: flex;
//   flex-direction: column;
//   gap: 2px;
//   min-width: 0;
//   padding: 10px 14px;
//   border: 1px solid var(--border-color, #e1e5e9);
//   border-radius: var(--radius-md);
//   background: var(--input-bg, #fff);
//   font: inherit;
//   font-size: var(--font-size-body);
//   color: inherit;
//   text-align: left;
//   cursor: pointer;
// }
//
// /* Selected means *currently applied*, computed from the fields rather than remembered. */
// .grid-suggestion.is-selected {
//   border-color: var(--active-bg, #0a84ff);
//   box-shadow: 0 0 0 1px var(--active-bg, #0a84ff);
// }
//
// .grid-suggestion-spans {
//   font-size: var(--font-size-small);
//   opacity: 0.6;
// }
//
// .grid-suggestions-empty,
// .grid-suggestions-more {
//   grid-column: 1 / -1;
//   margin: 0;
//   font-size: var(--font-size-small);
//   opacity: 0.7;
// }
// @STYLE_END


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

/**
 * One manifest per set inside a collection, so parallel sets never collide.
 *
 * **The second half is an id, not a group.** It used to be the group name, which meant renaming a group
 * filed the record under a key nothing looked for: the panel found no config and offered defaults over a
 * set sitting right there, while `readFoundation` still enumerated the orphan and reported every one of
 * its tokens missing. A minted id cannot go stale, because there is nothing about it a person would want
 * to change.
 *
 * A manifest written before ids keeps its key, and that key becomes its id — it was already unique per
 * (domain, group), and from here on it is opaque. So the migration is nothing: no rewrite, no deletion,
 * no window where a set exists under two keys.
 */
function foundationSetKey(domain, setId) {
  return 'set:' + String(domain || '') + ':' + String(setId == null ? '' : setId);
}

/** The id half of a set key, or `''` for anything that is not one. */
function foundationSetIdFromKey(key) {
  var text = String(key == null ? '' : key);
  if (text.indexOf('set:') !== 0) return '';
  var rest = text.slice(4);
  var cut = rest.indexOf(':');
  return cut === -1 ? '' : rest.slice(cut + 1);
}

/**
 * A new set id. Minted once, at the first run that records a set, and never again — every later run
 * reads it back off the manifest.
 *
 * Time plus randomness rather than a counter: two files, or two collections in one file, must not agree
 * on an id by having both been the first thing somebody generated.
 */
function foundationMintSetId() {
  return Date.now().toString(36) + '-' + foundationIdNoise() + foundationIdNoise();
}

/**
 * Four base-36 characters of randomness. Two of these, not one: a single chunk is 1.7M values, and a
 * run that records several sets mints them all inside one millisecond — so the timestamp contributes
 * nothing and the birthday bound is the whole of the guarantee.
 */
function foundationIdNoise() {
  var noise = Math.floor(Math.random() * 1679616).toString(36);
  while (noise.length < 4) noise = '0' + noise;
  return noise;
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
    id: s.id == null ? '' : String(s.id),
    domain: String(s.domain || ''),
    group: s.group == null ? '' : String(s.group),
    modes: Array.isArray(s.modes) ? s.modes.slice() : [],
    // `{ viewportKey: modeId }`. The names in `modes` are what a person reads and what a pasted config
    // carries between files; the ids are what survives someone renaming a mode in this one.
    modeIds: s.modeIds && typeof s.modeIds === 'object' ? s.modeIds : {},
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
      id: parsed.id == null ? '' : String(parsed.id),
      domain: String(parsed.domain || ''),
      group: parsed.group == null ? '' : String(parsed.group),
      modes: Array.isArray(parsed.modes) ? parsed.modes : [],
      modeIds: parsed.modeIds && typeof parsed.modeIds === 'object' && !Array.isArray(parsed.modeIds)
        ? parsed.modeIds
        : {},
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
/**
 * Where a set's tokens actually live, read off their stamps.
 *
 * A stamp's token key is the variable's name with the group taken off, so the group is the name with the
 * token key taken off — the exact inverse, with no prefix guessing in it. That is what makes this an
 * answer rather than a heuristic, and it is why the recorded group can be treated as a label.
 *
 * `stamps` is `[{ name, domain, set, token }]`. A set id on both sides narrows it to one set; without one
 * — a stamp written before ids — domain alone has to do, which is exact whenever a collection holds one
 * set per domain and is why the id was added.
 *
 * → `{ group, counts, total }`, or `null` when nothing is stamped. `counts` has more than one entry when
 * somebody moved part of a set, which is a thing worth saying out loud.
 */
function deriveSetGroup(stamps, domain, setId) {
  var counts = {};
  var total = 0;
  var order = [];

  for (var i = 0; i < (stamps || []).length; i++) {
    var stamp = stamps[i];
    if (!stamp || stamp.domain !== String(domain || '')) continue;
    if (setId && stamp.set && stamp.set !== String(setId)) continue;

    var name = String(stamp.name == null ? '' : stamp.name);
    var token = String(stamp.token == null ? '' : stamp.token);
    if (!token || name.length < token.length) continue;
    if (name.slice(name.length - token.length) !== token) continue;

    var group = name.slice(0, name.length - token.length).replace(/\/+$/, '');
    if (!Object.prototype.hasOwnProperty.call(counts, group)) order.push(group);
    counts[group] = (counts[group] || 0) + 1;
    total++;
  }

  if (total === 0) return null;

  // The majority, with insertion order breaking a tie so two runs over one file agree.
  var best = order[0];
  for (var o = 1; o < order.length; o++) {
    if (counts[order[o]] > counts[best]) best = order[o];
  }
  return { group: best, counts: counts, total: total };
}

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
  var stampIndex = {};
  var variableLists = src.variables || [];
  for (i = 0; i < variableLists.length; i++) {
    variableIndex[variableLists[i].collection] = variableLists[i].names || [];
    stampIndex[variableLists[i].collection] = variableLists[i].stamps || [];
  }

  for (i = 0; i < manifestEntries.length; i++) {
    var record = manifestEntries[i];
    var manifest = record.manifest;
    if (!manifest) continue;

    var setId = manifest.id || foundationSetIdFromKey(record.key);
    var stamps = stampIndex[record.collection] || [];

    // **The group is derived, not read.** The manifest's copy is a label from the last run; where the
    // tokens are now is a question the stamps answer, and renaming a group is a thing people do.
    var derived = deriveSetGroup(stamps, manifest.domain, setId);
    var liveGroup = derived ? derived.group : manifest.group;
    var stampedTokens = {};
    for (var st = 0; st < stamps.length; st++) {
      if (stamps[st].domain !== manifest.domain) continue;
      if (setId && stamps[st].set && stamps[st].set !== setId) continue;
      stampedTokens[stamps[st].token] = true;
    }

    // A set somebody split across two groups. Worth saying — half a scale in one place and half in
    // another is not something the panel can show, and it is invisible in Figma until you go looking.
    if (derived && Object.keys(derived.counts).length > 1) {
      var elsewhere = [];
      for (var g in derived.counts) {
        if (g !== liveGroup) elsewhere.push((g || '(no group)') + ': ' + derived.counts[g]);
      }
      warnings.push(foundationWarning(
        'set-split',
        'The ' + manifest.domain + ' set in "' + record.collection + '" is spread across more than one group. Most of it is in "' +
        (liveGroup || '(no group)') + '"; also ' + elsewhere.join(', ') + '.',
        { collection: record.collection, domain: manifest.domain, groups: derived.counts }
      ));
    }

    var missing = [];
    var known = variableIndex[record.collection];
    if (known) {
      var prefix = namePrefix(liveGroup);
      for (var t = 0; t < manifest.tokens.length; t++) {
        // Stamp first, name second. A token whose leaf somebody renamed is still here, and reporting it
        // missing was a warning about a variable sitting in plain sight.
        if (stampedTokens[manifest.tokens[t]]) continue;
        if (known.indexOf(prefix + manifest.tokens[t]) !== -1) continue;
        missing.push(manifest.tokens[t]);
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
        collectionModes = (modeSets[ms].modes || []);
      }
    }
    var recordedIds = manifest.modeIds || {};
    var missingModes = [];
    for (var mm = 0; mm < manifest.modes.length; mm++) {
      var wantedKey = String(manifest.modes[mm]);
      var recordedId = recordedIds[wantedKey];
      var present = false;
      for (var cm = 0; cm < collectionModes.length; cm++) {
        // The id first. A mode renamed in Figma is the same mode, and matching on its name reports it
        // missing — which is a warning about something nobody broke.
        if (recordedId && collectionModes[cm].modeId === recordedId) { present = true; break; }
      }
      if (!present) {
        for (var cn = 0; cn < collectionModes.length; cn++) {
          var modeName = collectionModes[cn].name;
          if (modeName.toLowerCase() === wantedKey.toLowerCase() ||
              viewportKeyFromLabel(modeName) === viewportKeyFromLabel(wantedKey)) {
            present = true;
          }
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
      id: setId,
      domain: manifest.domain,
      group: liveGroup,
      // Only when it drifted, and it is not a warning: renaming a group is a normal thing to do, and
      // the next run brings the record up to date on its own.
      recordedGroup: liveGroup === manifest.group ? null : manifest.group,
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
    var stamps = [];
    for (var v = 0; v < collection.variableIds.length; v++) {
      var variable = await figma.variables.getVariableByIdAsync(collection.variableIds[v]);
      if (!variable) continue;
      names.push(variable.name);
      // The stamps come along with the names, because reconcile needs both to tell a token that moved
      // from a token that is gone — and this is the only loop that resolves every variable.
      var stamp = readStamp(variable);
      if (stamp) {
        stamps.push({
          name: variable.name,
          domain: stamp.domain,
          set: stamp.set || '',
          token: stamp.token
        });
      }
      if (isViewportWidthName(variable.name) && variable.resolvedType === 'FLOAT') {
        var byMode = {};
        for (var m2 = 0; m2 < collection.modes.length; m2++) {
          var value = variable.valuesByMode[collection.modes[m2].modeId];
          if (typeof value === 'number') byMode[collection.modes[m2].name] = value;
        }
        widths.push({ collection: collection.name, variable: variable.name, byMode: byMode });
      }
    }
    variables.push({ collection: collection.name, names: names, stamps: stamps });

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
 * The set living at a group, asked of the variables rather than of the record.
 *
 * `readManifest` matches on the group a manifest *says* it has, which is a label from the last run. This
 * asks the stamps where the tokens actually are, so a group somebody renamed in the variable table still
 * resolves to its config instead of falling through to defaults.
 *
 * Order: live group (derived from stamps) → recorded group → nothing. The last is a real answer — a
 * collection with no set at that address — not a failure.
 *
 * → `{ id, manifest, key, group, recordedGroup, collection }`; `manifest` is null when there is none.
 */
async function findFoundationSet(collection, domain, group) {
  var answer = {
    id: '', manifest: null, key: null,
    group: group == null ? '' : String(group), recordedGroup: null, collection: collection || null
  };
  if (!collection || !domain) return answer;

  var ns = foundationNamespace();
  var wanted = answer.group;
  var keys = collection.getSharedPluginDataKeys(ns) || [];

  var records = [];
  for (var k = 0; k < keys.length; k++) {
    if (keys[k].indexOf('set:') !== 0) continue;
    var read = parseManifest(collection.getSharedPluginData(ns, keys[k]));
    if (!read.manifest || read.manifest.domain !== String(domain)) continue;
    records.push({ key: keys[k], manifest: read.manifest, id: read.manifest.id || foundationSetIdFromKey(keys[k]) });
  }
  if (records.length === 0) return answer;

  var stamps = [];
  var all = await foundationVariablesOf(collection);
  for (var v = 0; v < all.length; v++) {
    var stamp = readStamp(all[v]);
    if (!stamp) continue;
    stamps.push({ name: all[v].name, domain: stamp.domain, set: stamp.set || '', token: stamp.token });
  }

  // Where each set's tokens are now. A set with nothing stamped has no live group and is matched on its
  // record, which is what a set generated before stamps existed has to fall back to.
  var fallback = null;
  for (var r = 0; r < records.length; r++) {
    var derived = deriveSetGroup(stamps, domain, records[r].id);
    if (derived && derived.group === wanted) {
      answer.id = records[r].id;
      answer.manifest = records[r].manifest;
      answer.key = records[r].key;
      answer.recordedGroup = records[r].manifest.group === wanted ? null : records[r].manifest.group;
      return answer;
    }
    // Only a set that is not living somewhere else can answer on its record alone: one whose tokens are
    // demonstrably in another group has been renamed away from here, and claiming it would hand the
    // panel a config for a set that moved out.
    if (!fallback && !derived && records[r].manifest.group === wanted) fallback = records[r];
  }

  if (fallback) {
    answer.id = fallback.id;
    answer.manifest = fallback.manifest;
    answer.key = fallback.key;
  }
  return answer;
}

/**
 * `findFoundationSet`, cheap first.
 *
 * A panel asks this on every edit to Collection or Group, and the overwhelming majority of those asks
 * are a clean cache hit — the group nobody renamed. `findFoundationSet` answers all of them correctly
 * already, by deriving where a set lives from its stamps, but it does that by reading every variable in
 * the collection every single time, which is a full document read the common case never needed. This
 * tries `readManifest` first — no document read at all — and only reaches for the stamps when that
 * misses, which is exactly the rename (or anything else that moved a set off its recorded address).
 *
 * → same shape as `findFoundationSet`. `recordedGroup` is the tell: null on the cache hit, the old
 * group name when the stamps had to find it.
 */
async function findFoundationSetCached(collection, domain, group) {
  var wanted = group == null ? '' : String(group);
  var cached = readManifest(collection, domain, wanted);
  if (cached.manifest) {
    return {
      id: cached.id, manifest: cached.manifest, key: cached.key,
      group: wanted, recordedGroup: null, collection: collection || null
    };
  }
  return findFoundationSet(collection, domain, wanted);
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
 * Three answers, in order:
 *   `recorded`   — a manifest CodeFig wrote at generation time. Exact, and only present on a set made
 *                  after manifests existed.
 *   `recognised` — the variables themselves, read by name and structure (`gridRecognise`). This is
 *                  what makes a set made before manifests — or by hand to the same scheme — come back.
 *                  Grid only for now: the ramp domains recognise through `adoptRamp`, which *records*
 *                  as it fits, and auto-import must not write. Splitting the fit from the record is
 *                  its own step.
 *   `none`       — the defaults stand, and the panel says so.
 */
/**
 * Other groups in this collection that hold a set for `domain`, excluding the group already asked for.
 * The panel lists these as links under Group so a person can switch without clearing the field first.
 */
async function foundationSiblingCandidates(collectionName, domain, group, knownGroups) {
  var groupNorm = group == null ? '' : group;
  var groups = knownGroups;
  if (!groups) {
    if (domain === 'grid') {
      groups = (await gridGroupsIn(collectionName)).groups;
    } else if (foundationTokensKey(domain)) {
      groups = (await rampGroupsIn(collectionName, domain)).groups;
    } else {
      groups = [];
    }
  }
  return (groups || []).filter(function (entry) {
    return entry.group !== groupNorm;
  });
}

async function foundationAutoImport(collectionName, group, domain) {
  var answer = {
    source: 'none', config: null, collection: collectionName || null,
    group: group == null ? null : group, tokens: [], modes: []
  };
  if (!collectionName || !domain) return answer;

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = collections.filter(function(c) { return c.name === collectionName; })[0];
  if (!collection) return answer;

  // The resolver, not plain `readManifest`: a group renamed in the variable table has to load the
  // config that belongs to it, which is the whole reason a panel opening on somebody's real collection
  // is worth anything. Cached: the cheap read first, so this only pays a document read on a set that
  // actually moved. Read-only either way — nothing here writes, so asking costs nothing.
  var read = await findFoundationSetCached(collection, domain, group == null ? '' : group);
  if (!read.manifest) {
    // Nothing recorded. For Grid, read the variables instead — a set that predates manifests is the
    // common case, not the exotic one.
    // **Every other domain loads its token names.** Not the scale — that is `adoptRamp`'s much larger
    // question, and a panel opening on somebody's collection is not asking it. It is asking "what are the
    // tokens", and answering only that lets a real set load without the panel claiming to know how it was
    // made. Without this, opening Typography on a file holding four tokens showed the shipped ten.
    if (domain !== 'grid') {
      var tokensKey = foundationTokensKey(domain);
      var rampScan = tokensKey ? await rampGroupsIn(collectionName, domain) : { groups: [] };
      var groupNorm = group == null ? '' : group;
      var groupQualifies = rampScan.groups.some(function (entry) {
        return entry.group === groupNorm && entry.tokens >= 2;
      });
      var found = tokensKey && groupQualifies
        ? await foundationTokensIn(collectionName, group, domain) : [];
      if (found.length) {
        answer.source = 'recognised';
        answer.tokens = found;
        // Only the token list. `fillConfigBlock` writes the keys a payload carries and leaves the rest, so
        // every scale setting in the block survives being pointed at a collection.
        answer.config = {};
        answer.config[tokensKey] = found;
        answer.modes = collection.modes.map(function (mode) { return mode.name; });
        // Siblings so the panel can switch without clearing Group.
        answer.candidates = await foundationSiblingCandidates(
          collectionName, domain, group, rampScan.groups
        );
      } else if (tokensKey) {
        // Nothing where the panel is pointing. Say where a ramp set *is*, the same way Grid does for
        // col-N — the default group and a real system's group rarely match.
        answer.candidates = rampScan.groups.filter(function (entry) {
          return entry.group !== groupNorm;
        });
      }
      return answer;
    }
    if (domain === 'grid') {
      var seen = await gridRecognise(collectionName, group == null ? '' : group);
      var gridScan = await gridGroupsIn(collectionName);
      if (!seen.found) {
        // Nothing where the panel is pointing. Say where a grid *is*, so the panel can offer to go
        // there — the whole reason this is worth doing is that the default group and a real system's
        // group rarely match.
        answer.candidates = gridScan.groups.filter(function (entry) {
          return entry.group !== (group == null ? '' : group);
        });
      }
      if (seen.found) {
        answer.source = 'recognised';
        answer.config = seen.config;
        answer.modes = (seen.config.modes || []).map(function (m) { return m.name; });
        answer.recognition = {
          checked: seen.checked,
          mismatched: seen.mismatched,
          missing: seen.missing,
          sources: seen.sources,
          extensionColumnsInferred: seen.extensionColumnsInferred
        };
        answer.candidates = await foundationSiblingCandidates(
          collectionName, domain, group, gridScan.groups
        );
      }
    }

    return answer;
  }

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
  answer.setId = read.id || '';
  // Set when the record's group is behind the file's. Not a problem to report — the next run brings it
  // up to date — but the panel is entitled to know it loaded a set that has moved.
  answer.recordedGroup = read.recordedGroup;
  answer.candidates = await foundationSiblingCandidates(collectionName, domain, group);
  return answer;
}

/**
 * A collection's modes as the file has them: `[{ modeId, name, valueCount }]`.
 *
 * The **only** place a `modeId` enters the panel. Mode chips are a 1:1 view of these, and a chip has
 * to carry the id it came from so that renaming its label can be a rename rather than an add-plus-orphan.
 * Ids never travel in a config — they are file-specific — so they live in panel session state and reach
 * a run through `window.codefigModeIntents`.
 *
 * `valueCount` is what makes the removal sentence true: *"removing mode Tablet — 12 variables hold
 * values there, and any binding to it is lost."* Counted here, with the mode list, because a chip
 * click cannot afford its own document read — `runSilentSnippet` allows one silent run at a time, so a
 * click landing during the preview's debounce would get no answer at all. Read once when the address
 * resolves; a panel with no count says so rather than inventing one.
 *
 * A count is variables that hold a value *of their own* in that mode. Figma gives every variable an
 * entry per mode, so "has a values-by-mode key" counts everything; what a person means by "holds
 * values there" is a value that differs from the collection's first mode, which is what disappears.
 */
async function foundationCollectionModes(collectionName, index) {
  // **Two identities, and neither is `figma.root.id`** — that is `0:0` in every file, which is how a
  // panel came to order Márton's five-viewport system against a throwaway file's three modes and call
  // it done. `figma.root.name` is the file, and the collection's own id is unique within it, so a
  // same-named collection somewhere else cannot pass for this one.
  var answer = {
    document: figma.root.name, collection: collectionName || null, collectionId: null,
    modes: [], found: false
  };
  if (!collectionName) return answer;

  // **`index`, optional: `{ byId, collections }`.** This function has a second, unindexed call site
  // (`src/ui.html`'s standalone mode-table read) that has no index to give it, so both the collection
  // lookup and the per-variable fetch below fall back to their original API-walking path when absent.
  var collections = index ? index.collections : await figma.variables.getLocalVariableCollectionsAsync();
  var collection = collections.filter(function (c) { return c.name === collectionName; })[0];
  if (!collection) return answer;
  answer.found = true;
  answer.collectionId = collection.id;

  var modes = collection.modes || [];
  var baseId = modes.length ? modes[0].modeId : null;
  var counts = {};
  for (var m = 0; m < modes.length; m++) counts[modes[m].modeId] = 0;

  var ids = collection.variableIds || [];
  for (var i = 0; i < ids.length; i++) {
    var variable = index ? index.byId[ids[i]] : await figma.variables.getVariableByIdAsync(ids[i]);
    if (!variable) continue;
    var byMode = variable.valuesByMode || {};
    // Hoisted out of the mode loop below: the base value is the same for every mode compared against
    // it, so this used to be stringified M times per variable for one answer.
    var baseValue = baseId != null ? JSON.stringify(byMode[baseId]) : undefined;
    for (var j = 0; j < modes.length; j++) {
      var id = modes[j].modeId;
      if (!Object.prototype.hasOwnProperty.call(byMode, id)) continue;
      if (id !== baseId && JSON.stringify(byMode[id]) === baseValue) continue;
      counts[id]++;
    }
  }

  answer.modes = modes.map(function (mode) {
    return { modeId: mode.modeId, name: mode.name, valueCount: counts[mode.modeId] || 0 };
  });
  return answer;
}

/**
 * Which groups in a list of variable names look like a grid.
 *
 * The signal is `col-1 … col-N`, and it is the same one `gridRecognise` refuses to work without —
 * a group can have something called `columns` or `gap` for a dozen reasons, but a numbered column
 * series is a grid. Pure, so the shape of this can be argued with in a test rather than in Figma.
 *
 * The group is **everything before** the `col-N`, so a nested `Foundations/Layout/col-1` reports
 * `Foundations/Layout` and a `col-1` at the collection root reports `""` — which is a real answer,
 * not a missing one.
 *
 * Returns `[{ group, columns }]`, ordered by how many columns each has, descending: on a tie the one
 * that appears first in the file wins, so the answer does not depend on object key order.
 */
function gridGroupCandidates(names) {
  var found = {};
  var order = [];
  (names || []).forEach(function (name) {
    var match = /^(.*?)(^|\/)col-(\d+)$/.exec(String(name));
    if (!match) {
      // `^(.*?)(^|\/)` is awkward about a bare `col-1`, so that case is handled plainly.
      var bare = /^col-(\d+)$/.exec(String(name));
      if (!bare) return;
      if (!Object.prototype.hasOwnProperty.call(found, '')) { found[''] = 0; order.push(''); }
      found[''] = Math.max(found[''], Number(bare[1]));
      return;
    }
    var group = match[1];
    var n = Number(match[3]);
    if (!Object.prototype.hasOwnProperty.call(found, group)) { found[group] = 0; order.push(group); }
    found[group] = Math.max(found[group], n);
  });

  return order.map(function (group) {
    return { group: group, columns: found[group] };
  }).sort(function (a, b) {
    if (b.columns !== a.columns) return b.columns - a.columns;
    return order.indexOf(a.group) - order.indexOf(b.group);
  });
}

/**
 * The groups in a collection that hold a grid, so the panel can point itself at one.
 *
 * Márton's observation, and it is the right one: the modes and the values are a strong indicator that
 * a file has a grid, so finding it is a search rather than a question. His system keeps its grid under
 * `Layout` while the script defaults to `Grid`, which means every fresh panel starts pointed at
 * nothing until somebody types the right word.
 *
 * Read-only, and it reads names rather than values — one pass over the collection's variables.
 */
async function gridGroupsIn(collectionName) {
  var answer = { collection: collectionName || null, groups: [] };
  if (!collectionName) return answer;

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = collections.filter(function (c) { return c.name === collectionName; })[0];
  if (!collection) return answer;

  var names = [];
  var ids = collection.variableIds || [];
  for (var i = 0; i < ids.length; i++) {
    var variable = await figma.variables.getVariableByIdAsync(ids[i]);
    if (variable && variable.resolvedType === 'FLOAT') names.push(variable.name);
  }
  answer.groups = gridGroupCandidates(names);
  return answer;
}

/** Grid layout names — not spacing/radius token leaves. */
function isGridStructureLeaf(seg) {
  return seg === 'columns' || seg === 'gap' || seg === 'padding' || seg === 'viewport-width' ||
    /^col-\d+$/.test(seg);
}

/** A spacing or radius token leaf — an identifier, not a label with spaces in it. */
function isRampTokenLeaf(token) {
  if (!token || isGridStructureLeaf(token)) return false;
  if (/\s/.test(String(token))) return false;
  return true;
}

/** Typography companions and size tokens — not flat spacing/radius tokens. */
function isTypographyVariableName(name) {
  var s = String(name);
  if (/\/font-size$/.test(s)) return true;
  if (/\/line-height$/.test(s)) return true;
  if (/\/letter-spacing$/.test(s)) return true;
  if (/\/font-weight(\/|$)/.test(s)) return true;
  if (/\/font-family(\/|$)/.test(s)) return true;
  return false;
}

/**
 * Whether a discovered group path looks like test scratch.
 * Domain membership for spacing vs radius is decided per variable (stamp / scopes /
 * description) — not by parsing group or token names.
 */
function rampGroupMatchesDomain(group, domain) {
  var g = String(group == null ? '' : group);
  if (g.indexOf('__codefig-test__') === 0) return false;
  return domain === 'spacing' || domain === 'radius' || domain === 'typography';
}

/**
 * Scopes that positively identify a ramp domain. `null` = no signal (empty / ALL_SCOPES).
 * `true` / `false` = belongs / does not belong.
 */
function rampScopesMatchDomain(scopes, domain) {
  var list = scopes || [];
  if (!list.length) return null;
  var set = {};
  for (var i = 0; i < list.length; i++) set[list[i]] = true;
  if (set.ALL_SCOPES) return null;

  if (domain === 'radius') {
    if (set.CORNER_RADIUS) return true;
    if (set.GAP || set.WIDTH_HEIGHT || set.FONT_SIZE || set.LINE_HEIGHT ||
        set.LETTER_SPACING || set.FONT_WEIGHT || set.FONT_STYLE || set.FONT_FAMILY) {
      return false;
    }
    return null;
  }
  if (domain === 'spacing') {
    if (set.CORNER_RADIUS) return false;
    if (set.FONT_SIZE || set.LINE_HEIGHT || set.LETTER_SPACING ||
        set.FONT_WEIGHT || set.FONT_STYLE || set.FONT_FAMILY) {
      return false;
    }
    if (set.GAP || set.WIDTH_HEIGHT) return true;
    return null;
  }
  return null;
}

/**
 * Neutral Description labels written on generate — same words as the script titles.
 * Exact match only (secondary net; humans edit Description freely).
 */
function rampDescriptionMatchesDomain(description, domain) {
  var want = foundationDomainScriptName(domain);
  if (!want || want === domain) return false;
  return String(description || '').trim().toLowerCase() === String(want).toLowerCase();
}

/**
 * Does this FLOAT belong to the domain being scanned?
 *
 * Order: stamp (authority) → scopes → Description. No name heuristics — unstamped,
 * unscored, undescribed floats are not claimed by either ramp panel.
 */
function rampVariableMatchesDomain(variable, domain) {
  if (!variable || (domain !== 'spacing' && domain !== 'radius')) return false;
  var stamp = readStamp(variable);
  if (stamp && stamp.domain) {
    return String(stamp.domain) === String(domain);
  }
  var scopeHit = rampScopesMatchDomain(variable.scopes, domain);
  if (scopeHit === true) return true;
  if (scopeHit === false) return false;
  return rampDescriptionMatchesDomain(variable.description, domain);
}

/**
 * One flat FLOAT token under a group prefix — the same shape `foundationTokensIn` reads for spacing
 * and radius. The group is everything before the last `/`; a bare name lives at the collection root.
 */
function rampFlatTokenGroup(name) {
  var parts = String(name).split('/');
  if (parts.length === 1) {
    var lone = parts[0];
    if (!isRampTokenLeaf(lone)) return null;
    return { group: '', token: lone };
  }
  var token = parts[parts.length - 1];
  if (!isRampTokenLeaf(token)) return null;
  return { group: parts.slice(0, -1).join('/'), token: token };
}

/** Flat token parse for spacing or radius — skips typography-shaped names. */
function rampFlatTokenGroupForDomain(name, domain) {
  if (domain !== 'spacing' && domain !== 'radius') return null;
  if (isTypographyVariableName(name)) return null;
  return rampFlatTokenGroup(name);
}

/** A typography size token — `Group/Token/font-size`, same leaf rule as `foundationTokenLeaf`. */
function rampTypographyTokenGroup(name) {
  var m = /^(.+)\/([^/]+)\/font-size$/.exec(String(name));
  if (!m) return null;
  return { group: m[1], token: m[2] };
}

/**
 * Which groups in a list of variable names look like a spacing, radius, or typography set.
 *
 * Names only — no values, no scale fit. Two tokens minimum so a lone float does not qualify.
 * Returns `[{ group, tokens }]`, most tokens first; ties keep file order.
 */
function rampGroupCandidates(names, domain) {
  if (domain !== 'spacing' && domain !== 'radius' && domain !== 'typography') return [];
  // Inlined: `@import` extraction follows function calls, not top-level `var`s beside them.
  var minTokens = 2;
  var tokensByGroup = {};
  var order = [];

  (names || []).forEach(function (name) {
    var parsed = domain === 'typography'
      ? rampTypographyTokenGroup(name)
      : rampFlatTokenGroupForDomain(name, domain);
    if (!parsed) return;
    var g = parsed.group;
    if (!rampGroupMatchesDomain(g, domain)) return;
    if (!tokensByGroup[g]) {
      tokensByGroup[g] = {};
      order.push(g);
    }
    tokensByGroup[g][parsed.token] = true;
  });

  return order.map(function (group) {
    return { group: group, tokens: Object.keys(tokensByGroup[group]).length };
  }).filter(function (entry) {
    return entry.tokens >= minTokens;
  }).sort(function (a, b) {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    return order.indexOf(a.group) - order.indexOf(b.group);
  });
}

/**
 * The groups in a collection that hold a ramp set, so the panel can point itself at one.
 * Read-only. Membership is stamp → scopes → Description (see `rampVariableMatchesDomain`),
 * never token-name guessing.
 */
async function rampGroupsIn(collectionName, domain) {
  var answer = { collection: collectionName || null, groups: [] };
  if (!collectionName || !domain) return answer;

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = collections.filter(function (c) { return c.name === collectionName; })[0];
  if (!collection) return answer;

  var names = [];
  var ids = collection.variableIds || [];
  for (var i = 0; i < ids.length; i++) {
    var variable = await figma.variables.getVariableByIdAsync(ids[i]);
    if (!variable || variable.resolvedType !== 'FLOAT') continue;
    if (domain === 'typography') {
      names.push(variable.name);
      continue;
    }
    if (!rampVariableMatchesDomain(variable, domain)) continue;
    names.push(variable.name);
  }
  answer.groups = rampGroupCandidates(names, domain);
  return answer;
}

/**
 * Read a Grid set out of the variables that are already there — **by name and structure, never by id**.
 *
 * This is auto-import's second answer, and the reason it exists: a manifest is only present on a set
 * CodeFig generated *after* manifests existed. Every grid made before that, and every grid made by
 * hand to the same scheme, has nothing recorded — so recognition matches on what is visible:
 *
 *     <group>/columns   <group>/gap   <group>/padding   <group>/viewport-width   <group>/col-1 … col-N
 *
 * per mode of the collection. Nothing about a variable id enters into it, which is what makes it
 * backward compatible: rename the collection, rename the modes, regenerate the variables — as long as
 * the names still read like a grid, it comes back.
 *
 * **Each of the four can also be derived**, because an older set may not have all of them and the
 * `col-N` series carries the same information:
 *
 *     colWidth = col-1                      gap = col-2 - 2·col-1
 *     content  = col-<columns>              columns = where col-N stops growing
 *     width    = content + 2·padding        padding = (width - content) / 2
 *
 * Every value says where it came from (`sources`), because "read from your file" and "worked out from
 * the other numbers" are different claims and the second one can be wrong.
 *
 * It then **checks itself**: the recognised config is used to recompute every `col-N` in every mode and
 * compared with what is actually stored. That is the difference between "this is your grid" and "this
 * is a grid that would overwrite yours" — the mismatches are what a run would change, and they are
 * reported rather than discovered afterwards.
 *
 * Writes nothing. Requires `calculateColumnWidth` from `@Core Library`.
 */
/**
 * Float noise off a derived value, and nothing else.
 *
 * Figma stores numbers as 32-bit floats, so a value that went in as `1440` can come back out of the
 * `col-N` series as `1439.9999694824219` once it has been through a division and an addition. Read
 * values are left exactly as the file has them; only **derived** ones are tidied, because the noise is
 * ours rather than the file's — and `containerWidth: 1439.9999694824219` in a config block a person
 * reads and pastes is not a recognition, it is a disfigurement.
 *
 * Within a hundredth of a whole number, take the whole number; otherwise keep two decimals. A grid
 * genuinely built on 1439.5 survives; one built on 1440 comes back as 1440.
 */
function tidyRecognisedNumber(n) {
  if (typeof n !== 'number' || !isFinite(n)) return n;
  var whole = Math.round(n);
  if (Math.abs(n - whole) < 0.01) return whole;
  return Math.round(n * 100) / 100;
}

async function gridRecognise(collectionName, group) {
  var answer = {
    found: false, collection: collectionName || null, group: group == null ? '' : group,
    config: null, checked: 0, mismatched: [], missing: [], notes: []
  };
  if (!collectionName) return answer;

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = collections.filter(function (c) { return c.name === collectionName; })[0];
  if (!collection) return answer;

  var prefix = namePrefix(answer.group);
  var byName = {};
  var ids = collection.variableIds || [];
  for (var i = 0; i < ids.length; i++) {
    var variable = await figma.variables.getVariableByIdAsync(ids[i]);
    if (!variable || variable.resolvedType !== 'FLOAT') continue;
    if (variable.name.indexOf(prefix) !== 0) continue;
    byName[variable.name.slice(prefix.length)] = variable;
  }

  // The `col-N` series is the load-bearing part: without it there is no grid to recognise, whatever
  // else happens to be named `columns`.
  var highestCol = 0;
  for (var key in byName) {
    var m = /^col-(\d+)$/.exec(key);
    if (m) highestCol = Math.max(highestCol, Number(m[1]));
  }
  if (highestCol === 0) {
    answer.notes.push('No ' + prefix + 'col-1 … col-N variables, so there is no grid here to read.');
    return answer;
  }

  function valueIn(name, modeId) {
    var variable = byName[name];
    if (!variable) return null;
    var v = variable.valuesByMode ? variable.valuesByMode[modeId] : undefined;
    return typeof v === 'number' ? v : null;
  }

  var modes = [];
  var maxColumns = 0;
  (collection.modes || []).forEach(function (mode) {
    var sources = {};
    var col1 = valueIn('col-1', mode.modeId);

    var columns = valueIn('columns', mode.modeId);
    if (columns !== null) sources.columns = 'variable';
    else {
      // Where the series stops growing: `col-N` is clamped to the content width once N passes the
      // column count, so the first repeat is the count itself.
      for (var n = 2; n <= highestCol; n++) {
        var here = valueIn('col-' + n, mode.modeId);
        var before = valueIn('col-' + (n - 1), mode.modeId);
        if (here !== null && before !== null && here === before) { columns = n - 1; break; }
      }
      if (columns === null) columns = highestCol;
      sources.columns = 'derived';
    }

    var gap = valueIn('gap', mode.modeId);
    if (gap !== null) sources.gap = 'variable';
    else {
      var col2 = valueIn('col-2', mode.modeId);
      gap = col1 !== null && col2 !== null ? tidyRecognisedNumber(col2 - 2 * col1) : 0;
      sources.gap = col1 !== null && col2 !== null ? 'derived' : 'default';
    }

    var content = col1 !== null && columns
      ? col1 * columns + gap * (columns - 1)
      : null;

    var padding = valueIn('padding', mode.modeId);
    var width = valueIn('viewport-width', mode.modeId);
    if (padding !== null) sources.padding = 'variable';
    if (width !== null) sources.containerWidth = 'variable';

    if (padding === null && width !== null && content !== null) {
      padding = tidyRecognisedNumber((width - content) / 2);
      sources.padding = 'derived';
    }
    if (width === null && padding !== null && content !== null) {
      width = tidyRecognisedNumber(content + padding * 2);
      sources.containerWidth = 'derived';
    }
    if (padding === null) { padding = 0; sources.padding = 'default'; }
    if (width === null) { width = content === null ? 0 : content; sources.containerWidth = 'default'; }

    if (columns > maxColumns) maxColumns = columns;
    modes.push({
      name: mode.name,
      containerWidth: width,
      columns: columns,
      gap: gap,
      padding: padding,
      sources: sources
    });
  });

  if (!modes.length) return answer;

  // Extra columns are not a variable of their own: they are the tail of the series past the widest
  // mode's column count. Inferred, and said to be — an inference presented as a reading is the
  // half-truth worth avoiding here.
  var extensionColumns = Math.max(0, highestCol - maxColumns);

  answer.found = true;
  answer.config = {
    collectionName: collectionName,
    group: answer.group,
    extensionColumns: extensionColumns,
    modes: modes.map(function (mode) {
      return {
        name: mode.name,
        containerWidth: mode.containerWidth,
        columns: mode.columns,
        gap: mode.gap,
        padding: mode.padding
      };
    })
  };
  answer.sources = {};
  modes.forEach(function (mode) { answer.sources[mode.name] = mode.sources; });
  answer.extensionColumnsInferred = true;

  // Nothing records these, so they cannot come back. Named rather than left at a default that implies
  // it was read.
  answer.missing.push('generateOverview');

  // Self-check: does this config reproduce what is stored?
  (collection.modes || []).forEach(function (mode, index) {
    var vc = modes[index];
    for (var n = 1; n <= highestCol; n++) {
      var actual = valueIn('col-' + n, mode.modeId);
      if (actual === null) continue;
      var expected = n > vc.columns && n <= maxColumns
        ? vc.containerWidth - vc.padding * 2
        : calculateColumnWidth(vc) * n + vc.gap * (n - 1);
      answer.checked++;
      if (Math.abs(expected - actual) > 0.01) {
        // Rounded for reading. Anything reported here already differs by more than the tolerance
        // above, so two decimals cannot hide a real difference — and eleven of them help nobody.
        answer.mismatched.push({
          mode: mode.name,
          name: prefix + 'col-' + n,
          stored: tidyRecognisedNumber(actual),
          wouldBe: tidyRecognisedNumber(expected)
        });
      }
    }
  });

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

/**
 * The manifest for a domain at a group, by the group the record itself names.
 *
 * **Scans rather than addresses.** The key is a minted id now, so it cannot be computed from the group;
 * and a legacy key is the group, so it can. Trying the legacy key first keeps a set made before ids
 * exactly one read away, and the scan picks up everything else.
 *
 * Sync, and by *recorded* group — this is the cache read. `findFoundationSet` is the one that asks the
 * variables where the set actually lives, and it costs a document read to do it.
 *
 * → `{ manifest, warnings, key, id }`
 */
function readManifest(collection, domain, group) {
  var ns = foundationNamespace();
  var wanted = group == null ? '' : String(group);

  var legacyKey = foundationSetKey(domain, wanted);
  var legacy = parseManifest(collection.getSharedPluginData(ns, legacyKey));
  if (legacy.manifest) {
    legacy.key = legacyKey;
    legacy.id = legacy.manifest.id || foundationSetIdFromKey(legacyKey);
    return legacy;
  }

  var keys = collection.getSharedPluginDataKeys(ns) || [];
  var warnings = [];
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('set:') !== 0) continue;
    var read = parseManifest(collection.getSharedPluginData(ns, keys[i]));
    warnings = warnings.concat(read.warnings);
    if (!read.manifest) continue;
    if (read.manifest.domain !== String(domain || '')) continue;
    if (read.manifest.group !== wanted) continue;
    return {
      manifest: read.manifest,
      warnings: warnings,
      key: keys[i],
      id: read.manifest.id || foundationSetIdFromKey(keys[i])
    };
  }
  return { manifest: null, warnings: warnings, key: null, id: '' };
}

/**
 * Merge one set's slice into its manifest. Merging rather than replacing so a domain never
 * clobbers a key it does not know about.
 */
function writeManifest(collection, set) {
  var s = set || {};
  // The set already at this address, whatever it is keyed by. Its id is kept — minting a second one
  // would file the same set twice and `readFoundation` would report it as two.
  var found = readManifest(collection, s.domain, s.group == null ? '' : s.group);
  var existing = found.manifest || {};
  var id = s.id || existing.id || found.id || foundationMintSetId();
  var key = found.key || foundationSetKey(s.domain, id);
  var merged = {
    id: id,
    domain: s.domain != null ? s.domain : existing.domain,
    group: s.group != null ? s.group : existing.group,
    modes: s.modes != null ? s.modes : existing.modes,
    modeIds: s.modeIds != null ? s.modeIds : existing.modeIds,
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

/**
 * `{ viewportKey: modeId }` for the modes a run wrote.
 *
 * A mode's identity is its `modeId` — the registry says so already, and it is why a mode renamed in
 * Figma used to be reported from both ends as one mode gone and one arrived. Recording the ids beside
 * the names means a manifest can tell a renamed mode from a missing one.
 *
 * Takes viewport keys or mode labels, because the domains disagree about which they record.
 */
function foundationModeIds(collection, viewportKeys) {
  var out = {};
  var modes = (collection && collection.modes) || [];
  (viewportKeys || []).forEach(function (key) {
    var label = viewportLabel(key);
    for (var i = 0; i < modes.length; i++) {
      if (modes[i].name === label || modes[i].name === key ||
          viewportKeyFromLabel(modes[i].name) === viewportKeyFromLabel(key)) {
        out[key] = modes[i].modeId;
        return;
      }
    }
  });
  return out;
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
//
// A name is a label; the stamp is the identity. That is how Figma's own bindings survive a rename, and
// it is the only reason a set stays one set after somebody reorganises the variable table — which they
// will, because reorganising the variable table is a normal thing to do to a design system.
//
// A run brackets its write with the two passes below: `alignStampedTokens` first, so identity is
// resolved before anything is matched by name, and `stampGeneratedTokens` after, so the next run can do
// the same. `adoptRamp` stamps as it fits, for the same reason.
// ============================================================================

/**
 * `set` is what tells two sets of the same domain in one collection apart — "Spacing A" and "Spacing B"
 * under one roof. Absent on a stamp written before ids, and then domain and token are all there is,
 * which is exact for the one-set case and the reason the field is optional rather than required.
 */
function stampValue(domain, tokenKey, rev, setId) {
  return JSON.stringify({
    owner: 'dsf',
    domain: String(domain || ''),
    set: setId == null ? '' : String(setId),
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
function stampToken(target, domain, tokenKey, rev, setId) {
  target.setSharedPluginData(foundationNamespace(), 'stamp', stampValue(domain, tokenKey, rev, setId));
}

function readStamp(target) {
  return readStampFrom(target.getSharedPluginData(foundationNamespace(), 'stamp'));
}

/**
 * Pure plan for stamp / manifest identity when CodeFig copies or moves variables.
 *
 * **Copy** → new set identity (mint); originals keep stamps. **Move** of a whole set → keep
 * the set id. **Partial Move** (some tokens of a set left behind) → mint for the moved
 * portion so one set id is never filed in two places. Unstamped sources stay unstamped. A
 * stamp whose set has no source manifest is left alone rather than guessed.
 *
 * `transfers`: [{ sourceStamp, destName, destCreated, destRef? }]
 * `manifestsBySetId`: { [setId]: { domain, group, modes, modeIds, tokens, config, key? } }
 * `isMove`: boolean
 * `partialSetIds`: optional `{ [setId]: true }` — Move treats these like Copy (mint).
 *
 * → `{ actions: [{ oldSetId, newSetId, mint, domain, targetGroup, tokens, config, modes,
 *   modeIds, sourceKey, stampTargets: [{ destRef, destName, domain, token, rev }] }] }`
 * When `mint` is true, `newSetId` is '' (caller calls `foundationMintSetId`).
 */
function planCopyMoveSetIdentity(transfers, manifestsBySetId, isMove, partialSetIds) {
  var bySet = {};
  var order = [];
  var partial = partialSetIds || {};
  for (var i = 0; i < (transfers || []).length; i++) {
    var t = transfers[i];
    if (!t) continue;
    var stamp = t.sourceStamp;
    if (!stamp || !stamp.set) continue;
    var sid = String(stamp.set);
    var mintLike = !isMove || !!partial[sid];
    // Copy / partial-move only stamps newly created variables; full Move relocates identity.
    if (mintLike && !t.destCreated) continue;
    if (!bySet[sid]) {
      bySet[sid] = [];
      order.push(sid);
    }
    bySet[sid].push(t);
  }

  var actions = [];
  var manifests = manifestsBySetId || {};
  for (var oi = 0; oi < order.length; oi++) {
    var oldSetId = order[oi];
    var group = bySet[oldSetId];
    var sourceManifest = manifests[oldSetId] || null;
    if (!sourceManifest) continue;

    var stampTargets = [];
    var destStampsForGroup = [];
    var tokenList = [];
    var tokenSeen = {};
    for (var gi = 0; gi < group.length; gi++) {
      var item = group[gi];
      var st = item.sourceStamp;
      var token = String(st.token || '');
      stampTargets.push({
        destRef: item.destRef,
        destName: item.destName,
        domain: st.domain,
        token: token,
        rev: typeof st.rev === 'number' ? st.rev : 1
      });
      destStampsForGroup.push({
        name: item.destName,
        domain: st.domain,
        set: oldSetId,
        token: token
      });
      if (token && !tokenSeen[token]) {
        tokenSeen[token] = true;
        tokenList.push(token);
      }
    }

    var derived = deriveSetGroup(destStampsForGroup, sourceManifest.domain, oldSetId);
    var targetGroup = derived && derived.group != null
      ? derived.group
      : (sourceManifest.group == null ? '' : String(sourceManifest.group));

    var mint = !isMove || !!partial[oldSetId];
    actions.push({
      oldSetId: oldSetId,
      newSetId: mint ? '' : oldSetId,
      mint: mint,
      domain: sourceManifest.domain,
      targetGroup: targetGroup,
      tokens: tokenList.length ? tokenList : (Array.isArray(sourceManifest.tokens) ? sourceManifest.tokens.slice() : []),
      config: sourceManifest.config && typeof sourceManifest.config === 'object' ? sourceManifest.config : {},
      modes: Array.isArray(sourceManifest.modes) ? sourceManifest.modes.slice() : [],
      modeIds: sourceManifest.modeIds && typeof sourceManifest.modeIds === 'object'
        ? sourceManifest.modeIds
        : {},
      sourceKey: sourceManifest.key || foundationSetKey(sourceManifest.domain, oldSetId),
      stampTargets: stampTargets
    });
  }
  return { actions: actions };
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

/**
 * Every local variable in a collection, resolved.
 *
 * Both stamp passes need the objects rather than the ids, and `getVariableByIdAsync` is the only way
 * from one to the other.
 */
async function foundationVariablesOf(collection) {
  var out = [];
  var ids = (collection && collection.variableIds) || [];
  for (var i = 0; i < ids.length; i++) {
    var variable = await figma.variables.getVariableByIdAsync(ids[i]);
    if (variable) out.push(variable);
  }
  return out;
}

/**
 * The token key a stamp carries for a variable in a set: its name with the group prefix taken off.
 *
 * The prefix is the mutable half — it is precisely what changes when someone renames a group — so it is
 * the half identity must not depend on. What is left is the slot: `xs` for a ramp, `Text-Large/font-size`
 * for typography, and the same string whichever group the set is sitting in this week.
 */
function foundationTokenKey(group, name) {
  var prefix = namePrefix(group);
  var full = String(name == null ? '' : name);
  return prefix && full.indexOf(prefix) === 0 ? full.slice(prefix.length) : full;
}

/**
 * Bring a set's existing variables to the names a run is about to write, matched by stamp.
 *
 * **Runs before the write, and the ordering is the whole point.** It is the same rule Grid already
 * applies to modes one level up: `processVariables` matches on names, so a set whose group was renamed
 * would read as one set gone and one arrived — eight new variables, eight orphans, and every binding in
 * the file still pointing at the orphans. Resolving identity first makes it eight renames instead, and a
 * rename keeps the id and the published key.
 *
 * Only stamp matches move. A variable found by name is already where it belongs, and a variable with no
 * stamp is not ours to move.
 *
 * → `{ renamed: [{ from, to, token }], warnings: [] }`
 */
async function alignStampedTokens(collection, domain, group, names, setId) {
  var report = { renamed: [], warnings: [] };
  if (!collection || !domain || !names || names.length === 0) return report;

  var candidates = await foundationVariablesOf(collection);
  if (candidates.length === 0) return report;

  var occupants = {};
  for (var c = 0; c < candidates.length; c++) occupants[candidates[c].name] = candidates[c];

  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var token = foundationTokenKey(group, name);
    // Inline, not a named helper passed by reference: `@import` extraction follows *calls*, and a
    // function handed over as a value is never called in this text — so a named getter here resolved
    // to `undefined` in the sandbox while validating clean, because `validateResolvedCalls` only sees
    // calls too.
    var match = findByStamp(candidates, domain, token, function (target) {
      var raw = target.getSharedPluginData(foundationNamespace(), 'stamp');
      // A set id on both sides has to agree. Without it every spacing token called `md` in the
      // collection is a candidate, and two sets under one roof would trade variables.
      if (setId) {
        var stamp = readStampFrom(raw);
        if (stamp && stamp.set && stamp.set !== String(setId)) return '';
      }
      return raw;
    }, name);
    if (!match || match.name === name) continue;

    if (match.remote) {
      report.warnings.push(foundationWarning(
        'stamp-remote',
        'The ' + domain + ' token "' + token + '" is stamped on "' + match.name + '", a library variable this file cannot rename.',
        { collection: collection.name, domain: domain, token: token, stamped: match.name, wanted: name }
      ));
      continue;
    }

    // Something else is already sitting at the target name. Which of the two the user meant is not a
    // decision this function gets to make, so both are named and neither is touched; the write that
    // follows updates whichever holds the name.
    var occupant = occupants[name];
    if (occupant && occupant !== match) {
      report.warnings.push(foundationWarning(
        'stamp-name-taken',
        'The ' + domain + ' token "' + token + '" is stamped on "' + match.name + '", but "' + name +
        '" already exists in "' + collection.name + '". Both were left alone.',
        { collection: collection.name, domain: domain, token: token, stamped: match.name, wanted: name }
      ));
      continue;
    }

    var from = match.name;
    try {
      match.name = name;
    } catch (e) {
      report.warnings.push(foundationWarning(
        'stamp-rename-failed',
        'Could not rename "' + from + '" to "' + name + '": ' + (e && e.message ? e.message : e),
        { collection: collection.name, from: from, to: name }
      ));
      continue;
    }
    delete occupants[from];
    occupants[name] = match;
    report.renamed.push({ from: from, to: name, token: token });
  }

  return report;
}

/**
 * Stamp what a run just wrote, so the next run finds it by identity rather than by name.
 *
 * Runs after the write, and reads the collection back rather than trusting the names it was given: a
 * name that is not there afterwards was skipped by `processVariables` for a type or scope mismatch, and
 * stamping a variable this run did not write would claim a token the set does not own.
 *
 * → `{ stamped: n, warnings: [] }`
 */
async function stampGeneratedTokens(collection, domain, group, names, setId) {
  var report = { stamped: 0, warnings: [] };
  if (!collection || !domain || !names || names.length === 0) return report;

  var byName = {};
  var all = await foundationVariablesOf(collection);
  for (var i = 0; i < all.length; i++) byName[all[i].name] = all[i];

  for (var n = 0; n < names.length; n++) {
    var variable = byName[names[n]];
    if (!variable || variable.remote) continue;
    try {
      stampToken(variable, domain, foundationTokenKey(group, names[n]), 1, setId);
      report.stamped++;
    } catch (e) {
      report.warnings.push(foundationWarning(
        'stamp-failed',
        'Could not stamp "' + names[n] + '": ' + (e && e.message ? e.message : e),
        { collection: collection.name, name: names[n] }
      ));
    }
  }
  return report;
}

/**
 * What the align pass moved, for the run summary. Silent when it moved nothing, which is the ordinary
 * case — a rename only happens when someone actually renamed something.
 */
function describeStampAlignment(report) {
  var lines = [];
  if (!report) return lines;
  if (report.renamed && report.renamed.length > 0) {
    lines.push('Moved ' + report.renamed.length + ' existing variable(s) in place, so their ids and every binding to them survive:');
    report.renamed.forEach(function (move) {
      lines.push('  ' + move.from + ' → ' + move.to);
    });
  }
  (report.warnings || []).forEach(function (w) { lines.push(w.message); });
  return lines;
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
    'styles', 'fontWeights', 'extensionColumns', 'extraValues'
  ];
  // A field in a shipped default block is declared by definition. Leaving these to `extra` meant
  // an untouched config warned about itself the first time anyone ran the script it came with,
  // which is how people learn that warnings are noise.
  // `createStyles`, `styleNaming` and `overviewPreviewText` joined when the panel gave them controls.
  // A field in a shipped default block is declared by definition — leave one out and the script warns
  // about its own untouched config the first time anyone runs it.
  if (domain === 'typography') {
    return keys.concat(['fontFamily', 'createStyles', 'styleNaming', 'textWrapStyle', 'overviewPreviewText']);
  }
  // `light` and `dark` are the old declarative block's; `colorModel`, `curve` and `lightness` are the
  // panel's. A field in a shipped default block is declared by definition — leave one out and the script
  // warns about its own untouched config the first time anyone runs it, which is how people learn that
  // warnings are noise.
  if (domain === 'colors') return keys.concat(['light', 'dark', 'colorModel', 'curve', 'chromaCurve', 'saturationCurve', 'hueCurve', 'hslHueCurve',
    'lower', 'upper', 'lightness', 'modes']);
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
  if (domain === 'typography') {
    return common.concat(['fontScale', 'fontWeights', 'styles', 'figmaStyles', 'createStyles',
      'styleNaming', 'textWrapStyle', 'overviewPreviewText']);
  }
  if (domain === 'grid') return common.concat(['extensionColumns', 'extraValues']);
  if (domain === 'colors') return common.concat(['light', 'dark', 'colorModel', 'curve', 'chromaCurve', 'saturationCurve', 'hueCurve', 'hslHueCurve',
    'lower', 'upper', 'lightness', 'modes']);
  return common;
}

/**
 * `spacing-{1,10}` → `spacing-1 … spacing-10`. One term of a token list, expanded.
 *
 * **The spelling is `{from,to}`**, which is the one already written down twice in the designs —
 * `spacing-{1,10}` in Márton's own Tokens helper and `heading-{1,6}` in the Typography frame — rather
 * than a second syntax for the same idea. `{10}` is shorthand for `{1,10}`.
 *
 * Two things fall out of taking the range from what is written rather than from a count:
 * - **it counts down as readily as up.** `heading-{6,1}` is `heading-6 … heading-1`, which is how a
 *   heading ramp is named smallest-to-largest without anyone having to reverse a list by hand.
 * - **a written leading zero is a width.** `{01,10}` pads to two digits, so `spacing-01` sorts beside
 *   `spacing-10` in Figma's variable list instead of after it.
 *
 * A term with no braces is itself, so `none, px, spacing-{1,10}` mixes literal names with a series —
 * which is the case the helper text promises and the reason this works per term rather than per field.
 */
function expandTokenTerm(term) {
  var text = String(term == null ? '' : term).trim();
  if (!text) return [];
  // Numbers only, deliberately: `{$step}` is the name-template placeholder this project already has,
  // and `{brand}` is somebody's token name. Neither is a series, and neither should warn about it.
  //
  // `{%10}` is accepted as `{10}` because it is the spelling in Márton's own frames — he left the syntax
  // to me and then drew `spacing-{%10}` in the Tokens helper, so somebody reading the panel will type it.
  // One alias costs nothing; a reader typing what the helper shows and getting a literal token named
  // `spacing-{%10}` costs a confused half hour.
  var brace = text.match(/\{\s*%?\s*(-?\d+)\s*(?:,\s*(-?\d+)\s*)?\}/);
  if (!brace) return [text];

  var fromText = brace[2] !== undefined ? brace[1] : '1';
  var toText = brace[2] !== undefined ? brace[2] : brace[1];
  var from = parseInt(fromText, 10);
  var to = parseInt(toText, 10);

  var width = /^0\d/.test(fromText) ? fromText.length : 0;
  var before = text.slice(0, brace.index);
  var after = text.slice(brace.index + brace[0].length);
  var out = [];
  var step = to >= from ? 1 : -1;
  for (var n = from; step > 0 ? n <= to : n >= to; n += step) {
    var digits = String(Math.abs(n));
    while (digits.length < width) digits = '0' + digits;
    out.push(before + (n < 0 ? '-' : '') + digits + after);
  }
  return out;
}

/**
 * Split a token list on its commas — the ones between terms, not the one inside `{1,10}`.
 *
 * A plain `split(',')` turns `none, spacing-{1,10}` into `spacing-{1` and `10}`, which then look like
 * two ordinary names and ship as two variables. The separator and the range separator are the same
 * character because both spellings are Márton's, so the split has to count braces.
 */
function splitTokenTerms(text) {
  var out = [];
  var current = '';
  var depth = 0;
  var s = String(text == null ? '' : text);
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === '{') depth++;
    if (ch === '}') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(current); current = ''; continue; }
    current += ch;
  }
  out.push(current);
  return out;
}

/**
 * A whole token list: an array, or one comma-separated string, with every term expanded.
 *
 * Both shapes because both are real — the config holds an array and the panel's field is one line of
 * text — and the answer has to be the same either way or a config means something different after a
 * round trip through the form.
 */
function expandTokenList(value) {
  var terms = [];
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      var entry = value[i];
      if (typeof entry === 'string' && entry.indexOf(',') !== -1) {
        terms = terms.concat(splitTokenTerms(entry));
      } else {
        terms.push(entry);
      }
    }
  } else if (typeof value === 'string') {
    terms = splitTokenTerms(value);
  } else {
    return [];
  }

  var out = [];
  for (var t = 0; t < terms.length; t++) out = out.concat(expandTokenTerm(terms[t]));
  return out;
}

/** Does this token list carry a series or a comma, so expanding it would change what it names? */
function tokenListHasSeries(value) {
  var list = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
  for (var i = 0; i < list.length; i++) {
    if (typeof list[i] !== 'string') continue;
    if (/\{\s*%?\s*-?\d+\s*(,\s*-?\d+\s*)?\}/.test(list[i])) return true;
    if (list[i].indexOf(',') !== -1) return true;
  }
  return false;
}

/** The array key each domain calls its token list. */
function foundationTokensKey(domain) {
  if (domain === 'spacing') return 'spacings';
  if (domain === 'radius') return 'radii';
  if (domain === 'typography') return 'fontScale';
  return null;
}

/**
 * The **leaf** a domain's real tokens carry, or null when its tokens are the leaf.
 *
 * Spacing and radius write one variable per token — `Spacing/md` — so the token *is* the name. Typography
 * writes three — `Typography/Text-Large/font-size` and its two companions — plus a couple of things that
 * are not tokens at all (`Typography/font-weight/600`, `Typography/font-family/primary`). Naming the leaf
 * is what tells those apart: a group under `Typography/` is a token only if it has a `font-size`.
 */
function foundationTokenLeaf(domain) {
  return domain === 'typography' ? 'font-size' : null;
}

/**
 * The token names a collection already holds under `group`, in the order the file has them.
 *
 * **Names only, deliberately.** Recognising the *scale* behind a set of numbers is a much larger question
 * — `adoptRamp` answers it, and answers it well — but it is not the question a panel is asking when it
 * opens on a collection somebody already has. That question is "what are the tokens", and answering only
 * that means the panel can load a real set without claiming to know how it was made. The scale controls
 * keep whatever they hold, and you adjust them.
 *
 * Márton: *"the point is to load existing configs and being able to alter them afterwards."*
 *
 * → `[]` when the address holds nothing, which reads as "nothing to load" rather than as an empty set.
 */
async function foundationTokensIn(collectionName, group, domain) {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = collections.filter(function (c) { return c.name === collectionName; })[0];
  if (!collection) return [];

  var prefix = namePrefix(group == null ? '' : group);
  var leaf = foundationTokenLeaf(domain);
  var seen = {};
  var tokens = [];

  for (var i = 0; i < collection.variableIds.length; i++) {
    var variable = await figma.variables.getVariableByIdAsync(collection.variableIds[i]);
    if (!variable) continue;
    if (prefix && variable.name.indexOf(prefix) !== 0) continue;
    var rest = prefix ? variable.name.slice(prefix.length) : variable.name;
    var parts = rest.split('/');
    var token = null;
    if (leaf) {
      if (parts.length === 2 && parts[1] === leaf) token = parts[0];
    } else if (parts.length === 1) {
      token = parts[0];
      if (domain !== 'typography' && !isRampTokenLeaf(token)) continue;
      if ((domain === 'spacing' || domain === 'radius') &&
          !rampVariableMatchesDomain(variable, domain)) continue;
    }
    if (!token || seen[token]) continue;
    seen[token] = true;
    tokens.push(token);
  }
  return tokens;
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

  // Colours, in two spellings. `light` / `dark` is the **old** declarative block, kept so a config written
  // before the panel still resolves. `colorModel` and `lightness` are the panel's: a colour model to
  // generate in, and the shared lightness ladder that is the whole point of the OKLCH one.
  if (inner.light !== undefined || inner.dark !== undefined) return 'colors';
  if (inner.colorModel !== undefined || inner.lightness !== undefined) return 'colors';

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
 * `{ "400": 400, "Semi Bold": "Semi Bold" }` → `[400, "Semi Bold"]`.
 * `{ Regular: 450 }` → `["450:Regular"]`.
 *
 * The panel's Font weights field is a comma list, and the generator promotes that list into a map
 * before it runs — so a map whose every key is its own value spelled out is a *list on its way home*,
 * not something anybody wrote. Handing it back as an object put `{ 400: 400 }` into a text field,
 * which came back out as a string and generated a text style per character.
 *
 * A map whose keys differ from its values is `number:Name` in that same list — `{ Regular: 450 }`
 * is what `450:Regular` becomes on a run, and it has to come back as the term the field accepts.
 */
function foundationFontWeightsForBlock(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return foundationClone(value);
  var keys = Object.keys(value);
  if (keys.length === 0) return foundationClone(value);
  var list = [];
  for (var i = 0; i < keys.length; i++) {
    var entry = value[keys[i]];
    if (typeof entry !== 'number' && typeof entry !== 'string') return foundationClone(value);
    if (String(entry) === keys[i]) {
      list.push(entry);
    } else if (typeof entry === 'number') {
      list.push(String(entry) + ':' + keys[i]);
    } else {
      return foundationClone(value);
    }
  }
  return list;
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
    // The panel's flat style fields and the specimen's copy. Kept beside `styles` rather than folded
    // into it: the nested object is what an older config carries, and merging the two spellings on the
    // way in would mean guessing which one the author meant when a config holds both.
    if (inner.createStyles !== undefined) slice.createStyles = !!inner.createStyles;
    if (typeof inner.styleNaming === 'string') slice.styleNaming = inner.styleNaming;
    if (typeof inner.textWrapStyle === 'string') slice.textWrapStyle = inner.textWrapStyle;
    if (typeof inner.overviewPreviewText === 'string') {
      slice.overviewPreviewText = inner.overviewPreviewText;
    }
  }
  if (domain === 'colors') {
    if (inner.light !== undefined) slice.light = foundationClone(inner.light);
    if (inner.dark !== undefined) slice.dark = foundationClone(inner.dark);
    if (inner.colorModel !== undefined) slice.colorModel = inner.colorModel;
    if (inner.curve !== undefined) slice.curve = foundationClone(inner.curve);
    if (inner.lightness !== undefined) slice.lightness = foundationClone(inner.lightness);
    if (Array.isArray(inner.modes)) slice.modes = foundationClone(inner.modes);
  }
  if (domain === 'grid') {
    if (typeof inner.extensionColumns === 'number') slice.extensionColumns = inner.extensionColumns;
    if (Array.isArray(inner.extraValues)) slice.extraValues = foundationClone(inner.extraValues);
    else if (typeof inner.extraValues === 'string') slice.extraValues = inner.extraValues;
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
  // As the block spells it — a list. This object is what a user pastes back into one, and the field
  // that reads it holds a comma list.
  if (config.fontWeights !== undefined) out.fontWeights = foundationFontWeightsForBlock(config.fontWeights);
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
  // Typography's panel gave text styles and the specimen's copy their own fields, so they are inputs
  // now and have to come back out. `styles` above is the older nested spelling and still wins where a
  // config carries it — these are the flat two the panel writes.
  if (config.createStyles !== undefined) out.createStyles = config.createStyles;
  if (config.styleNaming !== undefined) out.styleNaming = foundationClone(config.styleNaming);
  if (config.textWrapStyle !== undefined) out.textWrapStyle = foundationClone(config.textWrapStyle);
  if (config.overviewPreviewText !== undefined) {
    out.overviewPreviewText = foundationClone(config.overviewPreviewText);
  }
  if (config.light !== undefined) out.light = foundationClone(config.light);
  if (config.dark !== undefined) out.dark = foundationClone(config.dark);
  if (config.colorModel !== undefined) out.colorModel = config.colorModel;
  if (config.curve !== undefined) out.curve = foundationClone(config.curve);
  if (config.lightness !== undefined) out.lightness = foundationClone(config.lightness);
  if (Array.isArray(config.modes) && config.modes.length > 0 && domain === 'colors') {
    out.modes = foundationClone(config.modes);
  }
  if (config.extensionColumns !== undefined) out.extensionColumns = config.extensionColumns;
  if (config.extraValues !== undefined) out.extraValues = foundationClone(config.extraValues);
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
  // sets win as the *declared* shape.
  //
  // **The panel form is still `modes[]`.** Dropping modes here left auto-import writing `sets` into
  // the block while Mode settings stayed empty — token names loaded, Base/curve did not. Keep modes
  // for the form: prefer the perViewport rebuild above, otherwise unfold each set into a mode row.
  if (Array.isArray(config.sets) && config.sets.length > 0) {
    out.sets = foundationClone(config.sets);
    if (!out.modes || out.modes.length === 0) {
      out.modes = config.sets.map(function (set) {
        var mode = {};
        for (var sk in set) {
          if (!Object.prototype.hasOwnProperty.call(set, sk) || sk === 'appliesTo') continue;
          mode[sk] = foundationClone(set[sk]);
        }
        if (!mode.name) {
          var target = set.appliesTo;
          if (typeof target === 'string' && target && target !== '*') mode.name = target;
          else if (Array.isArray(target) && target.length === 1) mode.name = target[0];
        }
        return mode;
      }).filter(function (mode) { return mode.name; });
    }
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
 * Widest finite `containerWidth` among modes — the preview column is 100% of this, so every mode
 * fits and smaller viewports stay proportionally smaller when you switch tabs.
 */
function gridPreviewMaxWidth(modes) {
  var max = 0;
  if (!Array.isArray(modes)) return max;
  for (var i = 0; i < modes.length; i++) {
    var w = Number(modes[i] && modes[i].containerWidth);
    if (isFinite(w) && w > max) max = w;
  }
  return max;
}

/**
 * One mode's grid, as numbers.
 *
 * `calculateColumnWidth` is the generator's own function, so the preview and the run cannot disagree
 * about a column width — which is the whole point of a preview.
 *
 * `maxWidth` is the largest mode in the config (defaults to this mode's width). `scale` is
 * `width / maxWidth` — the fraction of the preview column this mode draws at.
 *
 * → { ok, width, columns, gap, margin, content, colWidth, spans: [{ n, span }], scale, maxWidth }
 */
function gridPreviewModel(mode, maxWidth) {
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
  var ref = Number(maxWidth);
  if (!isFinite(ref) || ref < width) ref = width;
  return {
    ok: true,
    width: width, columns: columns, gap: gap, margin: margin,
    content: content, colWidth: colWidth, spans: spans,
    maxWidth: ref,
    // Fraction of the preview column — largest mode is 1, everything else is smaller.
    scale: width / ref
  };
}

/** A number as a panel shows it: whole when it is whole, one decimal when it is not. */
function gridPreviewNumber(value) {
  return Math.abs(value - Math.round(value)) < 0.01 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
}

/** Percent of a reference width (4 dp) — enough that margin + columns + gaps still sum to ~100%. */
function gridPreviewPct(value, ref) {
  if (!isFinite(ref) || ref <= 0) return 0;
  return Math.round((value / ref) * 1000000) / 10000;
}

/**
 * Modes with a drawable width, sorted narrow → wide — the ruler's ticks.
 * → [{ name, width }]
 */
function gridPreviewRulerModes(modes) {
  var out = [];
  if (!Array.isArray(modes)) return out;
  for (var i = 0; i < modes.length; i++) {
    var w = Number(modes[i] && modes[i].containerWidth);
    if (!isFinite(w) || w <= 0) continue;
    out.push({
      name: modes[i] && typeof modes[i].name === 'string' ? modes[i].name : '',
      width: w
    });
  }
  out.sort(function (a, b) { return a.width - b.width; });
  return out;
}

/**
 * Longest Total / col-N line across every drawable mode — keeps the meta column from resizing
 * when switching tabs (which would squeeze the ruler and move every marker).
 */
function gridPreviewMetaMinCh(modes) {
  var longest = 10;
  if (!Array.isArray(modes)) return longest;
  for (var i = 0; i < modes.length; i++) {
    var model = gridPreviewModel(modes[i]);
    if (!model.ok) continue;
    var total = 'Total: ' + gridPreviewNumber(model.width);
    if (total.length > longest) longest = total.length;
    for (var s = 0; s < model.spans.length; s++) {
      var line = 'col-' + (s + 1) + ': ' + gridPreviewNumber(model.spans[s].span);
      if (line.length > longest) longest = line.length;
    }
  }
  return longest;
}

/**
 * The preview for one mode. Grey until there is somewhere to write — the Start and New frames are grey
 * even with modes set, so grey is about whether a collection has been chosen, not whether fields are
 * filled.
 *
 * Drawn in percentages of the largest mode's width, so the diagram always fits the preview column:
 * the widest viewport is 100%, and every other mode is proportionally smaller. A non-interactive
 * ruler marks every mode by name + width above the track; ticks cross the grey remainder and sit under
 * the active grid so they never paint over margins or columns.
 */
function gridPreviewHtml(config, domain, modeName) {
  var inner = (config && config.config) || config || {};
  if (!inner.collectionName || String(inner.collectionName).trim() === '') return '';

  var modes = Array.isArray(inner.modes) ? inner.modes : [];
  var mode = null;
  for (var i = 0; i < modes.length; i++) {
    if (!modeName || String(modes[i].name).toLowerCase() === String(modeName).toLowerCase()) {
      mode = modes[i];
      break;
    }
  }
  if (!mode) mode = modes[0] || null;

  var maxWidth = gridPreviewMaxWidth(modes);
  var model = gridPreviewModel(mode, maxWidth);
  // **Hide until width and columns are set** — a grey placeholder diagram reads as a result.
  if (!model.ok) return '';

  var metaCh = gridPreviewMetaMinCh(modes);
  var out = ['<div class="grid-preview" style="--grid-preview-meta-ch:' + metaCh + '">'];
  var columns = model.columns;
  // Of the mode (diagram children sum to 100% of the diagram).
  var ofMode = function (value) { return gridPreviewPct(value, model.width); };
  // Of the largest mode (bars, guides, and the ruler share the preview column).
  var ofMax = function (value) { return gridPreviewPct(value, model.maxWidth); };

  // Ruler: name + width above the track; through-ticks in the track sit under the active grid
  // so they show on grey only. The mark's own border is the line beside the label, ending at the bar.
  out.push('<div class="grid-preview-ruler">');

  var marks = gridPreviewRulerModes(modes);
  var openName = mode && typeof mode.name === 'string' ? String(mode.name).toLowerCase() : '';
  for (var n = 0; n < marks.length; n++) {
    var labeled = marks[n];
    var markClass = 'grid-preview-ruler-mark';
    if (openName && String(labeled.name).toLowerCase() === openName) markClass += ' is-active';
    out.push('<div class="' + markClass + '" style="left:' + ofMax(labeled.width) + '%">');
    out.push('<span class="grid-preview-ruler-label">');
    if (labeled.name) {
      out.push('<span class="grid-preview-ruler-name">' +
        foundationEscapeHtml(labeled.name) + '</span>');
    }
    out.push('<span class="grid-preview-ruler-size">' +
      gridPreviewNumber(labeled.width) + '</span>');
    out.push('</span></div>');
  }

  out.push('<div class="grid-preview-ruler-track">');
  for (var m = 0; m < marks.length; m++) {
    var mark = marks[m];
    var isActive = openName && String(mark.name).toLowerCase() === openName;
    var tickClass = 'grid-preview-ruler-tick' + (isActive ? ' is-active' : '');
    out.push('<div class="' + tickClass + '" style="left:' + ofMax(mark.width) + '%"></div>');
  }

  out.push('<div class="grid-preview-ruler-active" style="width:' + ofMax(model.width) + '%">');
  out.push('<div class="grid-preview-diagram">');
  out.push('<div class="grid-preview-margin" style="width:' + ofMode(model.margin) + '%"></div>');
  for (var c = 0; c < columns; c++) {
    if (c) out.push('<div class="grid-preview-gap" style="width:' + ofMode(model.gap) + '%"></div>');
    out.push('<div class="grid-preview-col" style="width:' + ofMode(model.colWidth) + '%"></div>');
  }
  out.push('<div class="grid-preview-margin" style="width:' + ofMode(model.margin) + '%"></div>');
  out.push('</div></div></div></div>');

  out.push('<div class="grid-preview-total">Total: <b>' +
    gridPreviewNumber(model.width) + '</b></div>');

  var inset = ofMax(model.margin);
  out.push('<div class="grid-preview-guides" style="margin-left:' + inset + '%;width:' +
    ofMax(model.content) + '%"></div>');

  for (var r = 0; r < columns; r++) {
    var span = model.spans[r];
    out.push('<div class="grid-preview-bar" style="margin-left:' + inset + '%;width:' +
      ofMax(span.span) + '%"></div>');
    out.push('<div class="grid-preview-value">col-' + (r + 1) + ': <b>' +
      gridPreviewNumber(span.span) + '</b></div>');
  }

  out.push('</div>');
  return out.join('');
}

/