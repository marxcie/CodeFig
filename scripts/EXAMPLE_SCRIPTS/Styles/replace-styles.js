// Replace styles
// @DOC_START
// # Rebinds layers from one style to another by rewriting style names with search and replace
//
// ## Overview
//
// Does **not** rename style definitions. It finds style bindings on nodes, rewrites the current
// style name with **Search for** / **Replace with** (or **Batch replacement**), and rebinds to a
// style with that new name. Targets resolve from local styles and from team libraries when the
// document has already seen them.
//
// Figma caches styles per file, so a library style can only be rebound once the document has seen
// it. Run **Render styles overview** in the library file, then copy that frame into this one, so
// the styles become available. Local styles need none of that.
//
// After find/replace on the name, lookup also tries common variants (for example emoji prefix
// swaps and slash spacing) so a rewritten name can still find the published style. Matching is
// case-sensitive.
//
// ### Search patterns
//
// | Input | Meaning |
// | --- | --- |
// | text | Matches names containing that text (case-sensitive). |
// | `V4/*/Primary` | `*` matches any characters. |
// | `(\\w+)-(\\d+)` | A regular expression, only when **Use regular expression** is on. |
// | (blank) | Empty Search in matches every style; empty Search for replaces the entire name. |
//
// Brackets and parens are literal text unless regex mode is on. `$&` and capture groups work in
// the replacement; counters like `$n` are not useful here because each binding is rewritten on
// its own (the counter stays 1).
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Search in**<br>`searchIn` | Optional: only try to rebind when the current style name contains this. Empty = all styles. |
// | **Search for**<br>`searchFor` | Pattern applied to the current style name. Empty replaces the whole name. |
// | **Replace with**<br>`replaceWith` | Replacement string; may use `$&` and capture groups. |
// | **Use regular expression**<br>`useRegex` | Treat Search in and Search for as regular expressions rather than plain text with `*` wildcards. |
// | **Batch replacement**<br>`batchReplacement` | Many rebinds in one run: one pair per line, search then replace after the comma. Overrides Search for and Replace with. |
// @DOC_END

// Import memory management utilities and library functions
@import { processWithOptimization, cleanupMemory, traverseNodes, getAllStyles, collectNodesAsync, showProgress, codefigRunOpBegin, codefigRunOpEnd, finishCodefigRunProgress } from "@Core Library"
@import { nameMatches, renameByPattern, patternModeNote } from "@Pattern Matching"
@import { previewWouldWrite, previewRecord } from "@Rename Preview"

// ========================================
// CONFIGURATION
// ========================================

// @UI_CONFIG_START
var searchIn = "";
var searchFor = "";
var replaceWith = "";
var useRegex = false;
var batchReplacement = "";
// @UI_CONFIG_END

// @PANEL_START
// {
//   "blocks": [
//     {
//       "key": "searchIn",
//       "type": "string",
//       "placeholder": "color/*"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Rebinds only styles whose name contains this — `color/`, `Typography/`. Leave it empty for every style."
//     },
//     {
//       "type": "heading",
//       "text": "Library styles must already be in the file",
//       "level": 2
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Figma caches styles per file, so a library style can only be rebound once the document has seen it.\nRun **Render styles overview** in the library file, then copy the frame it makes into this one. The\nstyles become available and the rebind works. Local styles need none of this."
//     },
//     {
//       "key": "searchFor",
//       "type": "string",
//       "placeholder": "Text V1"
//     },
//     {
//       "key": "replaceWith",
//       "type": "string",
//       "placeholder": "Text V2"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Leave **Search for** empty to replace the whole name. In the replacement, `$&` is the text that\nmatched, and `$1` `$2` are capture groups when **Use regular expression** is on."
//     },
//     {
//       "key": "useRegex",
//       "type": "boolean",
//       "label": "Use regular expression"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Reads **Search in** and **Search for** as regular expressions rather than plain text with `*` wildcards."
//     },
//     {
//       "type": "divider"
//     },
//     {
//       "key": "batchReplacement",
//       "type": "textarea"
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "Many rebinds in one run: one pair per line, search first, replace after the comma. Overrides\n**Search for** and **Replace with**. No quotes, no trailing commas."
//     },
//     {
//       "type": "paragraph",
//       "attachTo": "previous",
//       "text": "```\nText V1, Text V2\nHeading V1, Heading V2\n```"
//     }
//   ]
// }
// @PANEL_END
//
// Script-only batch: var batchReplacement = [["500","50"],["4xl","3xl"]]; or [{ searchPattern: "500", replacePattern: "50" }];
//
var selectionOnly = typeof selectionOnly !== 'undefined' ? selectionOnly : true;

// ── Not exposed in UI (edit here only) ──
/** Verbose diagnostics + run summary while tuning. Set `false` when the script is stable. */
var replaceStylesDebug = true;
/** `false` = local styles + Team Library / imports (default). `true` = local-only (for isolating bugs). */
var localStylesOnly = false;

/**
 * If `true`, document scan for **cache** (finding replacement targets) is limited to the same roots as `selectionOnly`
 * (legacy / debugging). Default `false` = always scan **figma.currentPage** so targets on a pasted **Render styles** overview count.
 */
var replaceStylesLimitCacheScanToSelection = false;

/**
 * Cap how many connected library collections we pull metadata from. `0` = no cap (all collections).
 * Lower this only if the file has many libraries and cache build is too slow.
 */
var replaceStylesMaxLibraryCollections = 0;

/**
 * Timeout for the initial Team Library list call. `0` = no timeout (no Promise.race).
 * Increase if you see false "timeout" fallbacks on slow connections.
 */
var replaceStylesTeamLibraryTimeoutMs = 30000;

/**
 * After find/replace on the style name, if there is no exact cache hit, try these rewrites on the **computed** name (each adds a lookup candidate).
 * Default: `✅ …` → `🚫 …` so a rule `V5`→`V4` can resolve `✅ V5/…` → `✅ V4/…` → `🚫 V4/…` when your V4 styles use 🚫.
 * Set to `[]` to require exact names only.
 */
var replaceStylesNameFallbackRewrites = [
  { pattern: /^✅\s+/, replacement: '🚫 ' }
];

/**
 * When the computed target name still doesn’t match the **exact** name in the published library, map it here.
 * Keys: any candidate name after replace + variants (try the primary computed string first).
 * Example: `{ "✅ V4/3xl/SemiBold": "🚫 V4 / 3xl / SemiBold" }`
 */
var replaceStylesRemoteTargetAliases = {};

/**
 * Max nodes visited in the **main** page scan (after priority overview frames). Increase if summary shows scan truncated and targets missing.
 * Frames whose names match `replaceStylesPriorityScanFrameNameSubstrings` are fully traversed first.
 */
var replaceStylesScanMaxNodes = 40000;

/** Frame / section names containing any of these substrings get a full subtree scan before the capped page walk. */
var replaceStylesPriorityScanFrameNameSubstrings = [
  'render styles',
  'styles overview',
  'style overview',
  'warm-up',
  'style warm',
  'warm styles',
  'warmup',
  'cache warm',
];

/** Max per-run detailed lines (avoid console flood on huge files). */
var REPLACE_STYLES_DEBUG_DETAIL_BUDGET = 80;

var _rsDebugDetailRemaining = 0;
var _rsStats = null;

function rsDebugEnabled() {
  return typeof replaceStylesDebug !== 'undefined' && replaceStylesDebug === true;
}

/** Effective max library collections to process (`0` = all). */
function getReplaceStylesLibraryCollectionCap() {
  var n = typeof replaceStylesMaxLibraryCollections === 'number' ? replaceStylesMaxLibraryCollections : 0;
  return n > 0 ? n : 1e9;
}

function rsResetStats() {
  _rsStats = {
    // Inventory / cache
    localStylesAdded: 0,
    localByType: { TEXT: 0, PAINT: 0, EFFECT: 0, GRID: 0, OTHER: 0 },
    scanNodesPlanned: 0,
    scanNodesDone: 0,
    scanStylesAdded: 0,
    scanStylesHydrated: 0,
    libraryMetaAdded: 0,
    teamLibraryCollectionsLoaded: 0,
    librarySkippedLocalWins: 0,
    teamLibraryPathUsed: false,
    teamLibraryUnavailable: false,
    teamLibraryUnavailableReason: '',
    scanPriorityFrames: 0,
    scanPriorityNodes: 0,
    scanMaxNodesCap: 0,
    scanTruncated: false,
    // Traversal
    nodesVisited: 0,
    textNodesSeen: 0,
    textSegmentsTotal: 0,
    textSegmentsWithStyleId: 0,
    textStyleGetFailed: 0,
    textNoReplacement: 0,
    styleGetErrors: 0,
    fillBindings: 0,
    strokeBindings: 0,
    effectBindings: 0,
    fillNoReplacement: 0,
    strokeNoReplacement: 0,
    effectNoReplacement: 0,
    applyErrors: 0,
    // findReplacementStyle
    searchInFiltered: 0,
    skippedEmptyFindPattern: 0,
    patternNoMatch: 0,
    replaceNoNameChange: 0,
    cacheHitResolvedStyle: 0,
    cacheHitImportedLibrary: 0,
    cacheMissNoKey: 0,
    cacheWrongType: 0,
    blockedLocalOnlyLibraryPlaceholder: 0,
    blockedLocalOnlyLibraryLookup: 0,
    importStyleFailed: 0,
    detailLinesSuppressed: 0
  };
  _rsDebugDetailRemaining = REPLACE_STYLES_DEBUG_DETAIL_BUDGET;
}

function rsIncr(field, n) {
  if (!_rsStats) return;
  n = n == null ? 1 : n;
  _rsStats[field] = (_rsStats[field] || 0) + n;
}

function rsDetail(msg) {
  if (!rsDebugEnabled() || !_rsStats) return;
  if (_rsDebugDetailRemaining <= 0) {
    _rsStats.detailLinesSuppressed++;
    return;
  }
  _rsDebugDetailRemaining--;
  console.log('[ReplaceStyles][detail] ' + msg);
}

function rsLog(msg) {
  if (!rsDebugEnabled()) return;
  console.log('[ReplaceStyles] ' + msg);
}

function classifyStyleType(t) {
  if (t === 'TEXT' || t === 'PAINT' || t === 'EFFECT' || t === 'GRID') return t;
  return 'OTHER';
}

/** Frames/sections whose names match Render styles overview / user markers — scanned in full before the capped page walk. */
function findReplaceStylesPriorityScanFrameRoots(page) {
  page = page || figma.currentPage;
  var roots = [];
  var subs = typeof replaceStylesPriorityScanFrameNameSubstrings !== 'undefined' && Array.isArray(replaceStylesPriorityScanFrameNameSubstrings)
    ? replaceStylesPriorityScanFrameNameSubstrings
    : ['render styles', 'styles overview', 'warm-up'];
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    var t = n.type;
    if (t === 'FRAME' || t === 'COMPONENT' || t === 'COMPONENT_SET' || t === 'INSTANCE' || t === 'SECTION') {
      var nm = String(n.name || '').toLowerCase();
      for (var i = 0; i < subs.length; i++) {
        if (nm.indexOf(String(subs[i] || '').toLowerCase()) !== -1) {
          roots.push(n);
          return;
        }
      }
    }
    if ('children' in n && n.children) {
      for (var c = 0; c < n.children.length; c++) {
        walk(n.children[c]);
      }
    }
  }
  walk(page);
  return roots;
}

function dedupeNodeListsPriorityFirst(firstList, secondList) {
  var seen = {};
  var out = [];
  function addList(arr) {
    for (var i = 0; i < arr.length; i++) {
      var n = arr[i];
      if (!n || seen[n.id]) continue;
      seen[n.id] = true;
      out.push(n);
    }
  }
  addList(firstList || []);
  addList(secondList || []);
  return out;
}

function logReplaceStylesSummary(searchInVal, replacements, localStylesOnlyVal, totalReplacements) {
  var s = _rsStats;
  if (!s) return;
  if (!rsDebugEnabled() && totalReplacements > 0) {
    return;
  }
  console.log('');
  console.log('════════ [ReplaceStyles] RUN SUMMARY ════════');
  console.log('Config: searchIn=' + JSON.stringify(searchInVal || '') +
    ' | localStylesOnly=' + localStylesOnlyVal +
    ' | rules=' + replacements.length +
    ' | debug=' + rsDebugEnabled());
  console.log('── Inventory / cache ──');
  console.log('  Local styles in file: ' + s.localStylesAdded + ' (by type: TEXT=' + s.localByType.TEXT + ', PAINT=' + s.localByType.PAINT + ', EFFECT=' + s.localByType.EFFECT + ', GRID=' + s.localByType.GRID + ', other=' + s.localByType.OTHER + ')');
  console.log('  Document scan: nodes=' + s.scanNodesDone + '/' + s.scanNodesPlanned + ' | new keys from scan=' + s.scanStylesAdded + ' | placeholders hydrated from nodes=' + s.scanStylesHydrated);
  console.log('  Scan cap: maxNodes=' + s.scanMaxNodesCap + ' | priority overview frame(s) matched=' + s.scanPriorityFrames + ' | nodes in those subtrees=' + s.scanPriorityNodes + ' | main walk truncated=' + s.scanTruncated);
  if (s.scanTruncated) {
    console.log('  ⚠️ Main scan hit the node cap — layers after the ' + s.scanMaxNodesCap + 'th visited node were skipped. Raise replaceStylesScanMaxNodes or move the **Render styles** frame higher in the layer list.');
  }
  console.log('  Team library: collections loaded=' + s.teamLibraryCollectionsLoaded + ' | metadata entries added=' + s.libraryMetaAdded + ' | skipped (local wins)=' + s.librarySkippedLocalWins + ' | teamLibraryPathUsed=' + s.teamLibraryPathUsed);
  if (!localStylesOnlyVal && s.teamLibraryUnavailable) {
    console.log('── Remote: Team Library catalog ──');
    console.log('  ⚠️ NOT loaded: ' + (s.teamLibraryUnavailableReason || '(unknown)'));
    console.log('  → Run inside Figma (desktop/web) with libraries enabled; try replaceStylesTeamLibraryTimeoutMs=0; or rely on styles already on the canvas in scope.');
  }
  if (s.teamLibraryPathUsed && s.importStyleFailed > 0) {
    console.log('  ⚠️ importStyleByKeyAsync failed ' + s.importStyleFailed + 'x — check edit access, style still published, and team.');
  }
  console.log('── Nodes / bindings seen ──');
  console.log('  Nodes visited: ' + s.nodesVisited);
  console.log('  TEXT: nodes=' + s.textNodesSeen + ' | segments=' + s.textSegmentsTotal + ' | segments with textStyleId=' + s.textSegmentsWithStyleId);
  console.log('  Fill / stroke / effect bindings: ' + s.fillBindings + ' / ' + s.strokeBindings + ' / ' + s.effectBindings);
  console.log('── Bindings that stayed unchanged (after rules ran) ──');
  console.log('  TEXT: no replacement returned: ' + s.textNoReplacement + ' | getStyle failed: ' + s.textStyleGetFailed);
  console.log('  FILL / STROKE / EFFECT no replacement: ' + s.fillNoReplacement + ' / ' + s.strokeNoReplacement + ' / ' + s.effectNoReplacement);
  console.log('  Non-text style get errors: ' + s.styleGetErrors);
  console.log('── Why no replacement (findReplacementStyle) ──');
  console.log('  Excluded by searchIn filter: ' + s.searchInFiltered);
  console.log('  Skipped rule (empty find pattern): ' + s.skippedEmptyFindPattern);
  console.log('  Pattern did not match style name: ' + s.patternNoMatch);
  console.log('  Pattern matched but replace() left name unchanged: ' + s.replaceNoNameChange);
  console.log('  Target not in cache (cache miss): ' + s.cacheMissNoKey);
  console.log('  Cache entry wrong expectedType: ' + s.cacheWrongType);
  console.log('  Blocked: localStylesOnly + library-only placeholder: ' + s.blockedLocalOnlyLibraryPlaceholder);
  console.log('  Blocked: localStylesOnly + would library lookup: ' + s.blockedLocalOnlyLibraryLookup);
  console.log('  importStyleByKeyAsync failed: ' + s.importStyleFailed);
  console.log('── Success path ──');
  console.log('  Cache hit (resolved BaseStyle): ' + s.cacheHitResolvedStyle);
  console.log('  Cache hit (imported from library key): ' + s.cacheHitImportedLibrary);
  console.log('  Successful replacements applied: ' + totalReplacements);
  console.log('── Errors ──');
  console.log('  TEXT getStyle/segment failures: ' + s.textStyleGetFailed + ' | FILL/STROKE/EFFECT get failures: ' + s.styleGetErrors);
  console.log('  Apply API failures (setRange/setFill/setStroke/setEffect): ' + s.applyErrors);
  if (rsDebugEnabled() && s.detailLinesSuppressed > 0) {
    console.log('  (Detail lines suppressed after budget: ' + s.detailLinesSuppressed + ' — raise REPLACE_STYLES_DEBUG_DETAIL_BUDGET)');
  }
  console.log('════════════════════════════════════════════');
  if (totalReplacements === 0) {
    console.log('[ReplaceStyles] Hints if count is 0:');
    console.log('  • searchIn must partially match the **current** style name (substring).');
    console.log('  • searchFor must partially match; the target style must exist for **one of** the tried names (computed name + variants: see `replaceStylesNameFallbackRewrites` and slash spacing).');
    console.log('  • If summary shows "Target not in cache": add styles, edit `replaceStylesNameFallbackRewrites`, or use a longer search/replace (e.g. `✅ V5` → `🚫 V4`). Check [detail] for "HINT — existing …".');
    console.log('  • selectionOnly=false to scan whole page; select nodes that actually use the style.');
    console.log('  • Remote: if the summary shows Team Library catalog NOT loaded, only **local** + **styles already on nodes** can resolve targets—use `replaceStylesRemoteTargetAliases` or apply each target style once in the file.');
    console.log('  • Remote: exact published **style name** must match one of the lookup candidates (or an alias). Variables have richer APIs; styles do not.');
    console.log('  • **Render styles** overview: frame name should contain e.g. "Render styles" (default); include every **target** style in that file; if scan truncated, raise `replaceStylesScanMaxNodes`.');
  }
}

// One matcher for every CodeFig find/replace script: see @Pattern Matching. This script used
// to carry its own copy, because the library's default was whole-name only; nameMatches is
// substring by default, so the copy is gone.
function getMatchOpts() {
  return {
    useRegex: typeof useRegex !== 'undefined' && useRegex === true,
    matchCase: true
  };
}

/** Style-name filter match. A blank pattern matches nothing here — callers guard for it. */
function matchStyleNamePartial(text, pattern) {
  if (pattern == null || String(pattern).trim() === '') return false;
  return nameMatches(text, pattern, getMatchOpts());
}

function styleCacheKey(name, type) {
  return (name || '') + "|" + (type || 'TEXT');
}

/** Style name segment of a cache key `name|TYPE` */
function cacheKeyNamePart(key) {
  var k = String(key || '');
  var i = k.lastIndexOf('|');
  return i >= 0 ? k.slice(0, i) : k;
}

/** Dedupe while keeping first-seen order. */
function uniqueStringList(arr) {
  var seen = {};
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var s = arr[i];
    if (s == null || s === '' || seen[s]) continue;
    seen[s] = true;
    out.push(s);
  }
  return out;
}

/**
 * Build lookup candidates: primary computed name + optional prefix/suffix rewrites + slash spacing variants (`a/b` vs `a / b`).
 */
function expandReplacementStyleNameCandidates(primaryName) {
  var base = String(primaryName);
  var list = [base];
  var rules = typeof replaceStylesNameFallbackRewrites !== 'undefined' && Array.isArray(replaceStylesNameFallbackRewrites)
    ? replaceStylesNameFallbackRewrites : [];
  for (var r = 0; r < rules.length; r++) {
    var rule = rules[r];
    var pat = rule && rule.pattern;
    var rep = rule && rule.replacement != null ? rule.replacement : '';
    if (!(pat instanceof RegExp)) continue;
    var alt = base.replace(pat, rep);
    if (alt !== base) list.push(alt);
  }
  var withSlashes = [];
  for (var i = 0; i < list.length; i++) {
    var n = list[i];
    withSlashes.push(n);
    var compact = n.replace(/\s*\/\s*/g, '/');
    if (compact !== n) withSlashes.push(compact);
    var spaced = n.replace(/\//g, ' / ');
    if (spaced !== n && spaced !== compact) withSlashes.push(spaced);
  }
  return uniqueStringList(withSlashes);
}

/**
 * Add explicit remote target names when published library names differ from computed replace strings.
 */
function expandCandidatesWithRemoteAliases(candidates) {
  if (!candidates || !candidates.length) return candidates || [];
  var aliasMap = typeof replaceStylesRemoteTargetAliases !== 'undefined' && replaceStylesRemoteTargetAliases && typeof replaceStylesRemoteTargetAliases === 'object'
    ? replaceStylesRemoteTargetAliases : null;
  if (!aliasMap) return candidates;
  var extra = [];
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var mapped = aliasMap[c];
    if (mapped != null && String(mapped).trim() !== '') {
      var sub = expandReplacementStyleNameCandidates(String(mapped));
      for (var j = 0; j < sub.length; j++) {
        extra.push(sub[j]);
      }
    }
  }
  return extra.length ? uniqueStringList(candidates.concat(extra)) : candidates;
}

function rsMarkTeamLibraryUnavailable(reason, localStylesOnlyFlag) {
  if (!_rsStats || localStylesOnlyFlag || !reason) return;
  _rsStats.teamLibraryUnavailable = true;
  _rsStats.teamLibraryUnavailableReason = String(reason);
}

/**
 * After a cache miss, show which styles of this type actually exist whose names contain the "replaceWith" fragment (e.g. V4).
 */
function rsLogCacheMissHints(styleCache, expectedType, replaceWithFragment) {
  if (!rsDebugEnabled() || !styleCache) return;
  var frag = String(replaceWithFragment || '').trim();
  if (frag.length < 1) return;
  var fl = frag.toLowerCase();
  var names = [];
  styleCache.forEach(function(entry, mapKey) {
    if (!entry || entry.type !== expectedType) return;
    var n = entry.style ? entry.style.name : entry.name;
    if (n == null || n === '') n = cacheKeyNamePart(mapKey);
    if (n && String(n).toLowerCase().indexOf(fl) !== -1) names.push(String(n));
  });
  names.sort();
  if (names.length) {
    rsDetail('HINT — existing ' + expectedType + ' styles containing "' + frag + '": ' + names.slice(0, 25).join(' | ') + (names.length > 25 ? ' … (+' + (names.length - 25) + ' more)' : ''));
  } else {
    rsDetail('HINT — no ' + expectedType + ' style in the cache contains "' + frag + '". Add/import styles, adjust `replaceStylesNameFallbackRewrites`, or use a longer search/replace that includes the prefix.');
  }
}

/** Log cache shape: samples + which keys match each rule’s find pattern (on name part). */
function logInventoryHintsForReplaceStyles(styleCache, replacements) {
  if (!rsDebugEnabled() || !styleCache || !replacements || !replacements.length) return;
  var keys = [];
  styleCache.forEach(function(_entry, mapKey) {
    keys.push(mapKey);
  });
  rsLog('Inventory: total cache keys=' + keys.length);
  rsLog('Inventory: sample keys (up to 35): ' + keys.slice(0, 35).join(' · ') + (keys.length > 35 ? ' …' : ''));
  for (var r = 0; r < replacements.length; r++) {
    var fr = String(replacements[r].from || '').trim();
    if (!fr) continue;
    var matches = [];
    for (var ki = 0; ki < keys.length; ki++) {
      var nk = cacheKeyNamePart(keys[ki]);
      if (matchStyleNamePartial(nk, fr)) matches.push(keys[ki]);
    }
    rsLog('Rule #' + r + ' find "' + fr + '" matches ' + matches.length + ' cache name(s). Sample: ' + matches.slice(0, 20).join(' · ') + (matches.length > 20 ? ' …' : ''));
  }
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
      list.push({ from: from, to: to });
    }
    return list;
  }
  var searchForVal = typeof searchFor !== 'undefined' ? searchFor : '';
  var replaceWithVal = typeof replaceWith !== 'undefined' ? replaceWith : '';
  if (searchForVal || replaceWithVal) {
    return [{ from: searchForVal, to: replaceWithVal }];
  }
  return [];
}

// Collect nodes with yields so the progress UI can update during inventory.
function collectAllNodes(nodes) {
  var MAX_NODES = 8000;
  return collectNodesAsync(nodes, {
    maxNodes: MAX_NODES,
    operation: 'Collecting nodes',
    showProgress: true,
    yieldEvery: 350
  }).then(function (allNodes) {
    if (allNodes.length >= MAX_NODES) {
      console.log('⚠️ Node limit reached (' + MAX_NODES + '). Processing first ' + MAX_NODES + ' nodes.');
    }
    return allNodes;
  });
}

// Main function - can be called directly or imported
function replaceAllStyles(customReplacements, customSelectionOnly) {
  codefigRunOpBegin();
  try {
    var replacements = customReplacements || buildReplacementsFromConfig();
    var selectionOnlyVal = customSelectionOnly !== undefined ? customSelectionOnly : selectionOnly;
    var localStylesOnlyVal = typeof localStylesOnly !== 'undefined' ? !!localStylesOnly : false;
    
    console.log('🎨 Replace Styles');
    console.log('====================================');
    
    if (replacements.length === 0) {
      console.log('❌ No replacements configured');
      figma.notify('Configure searchFor/replaceWith or batchReplacement first');
      finishCodefigRunProgress();
      return Promise.resolve({ success: false, replacements: 0, error: 'No replacements configured' });
    }

    rsResetStats();
    var searchInVal = typeof searchIn !== 'undefined' ? searchIn : '';
    rsLog('Starting run | selectionOnly=' + selectionOnlyVal + ' | localStylesOnly=' + localStylesOnlyVal);
    rsLog('searchIn=' + JSON.stringify(String(searchInVal || '')) + ' | rules: ' + JSON.stringify(replacements));
    var searchInNote = patternModeNote(searchInVal, getMatchOpts());
    if (searchInNote) console.log('searchIn — ' + searchInNote);
    for (var rn = 0; rn < replacements.length; rn++) {
      var ruleNote = patternModeNote(replacements[rn].from, getMatchOpts());
      if (ruleNote) console.log('searchFor — ' + ruleNote);
    }
    rsLog(
      'Cache scan: ' +
        (typeof replaceStylesLimitCacheScanToSelection !== 'undefined' && replaceStylesLimitCacheScanToSelection
          ? 'same scope as replacement (legacy)'
          : 'full current page (Render styles overview may be outside selection)') +
        ' | replacement scope: ' +
        (selectionOnlyVal ? 'selection only' : 'whole page')
    );
    
    // Writes on every run. Plan still records what changed for console summary.
    var previewOnlyVal = false;
    var preview = { previewOnly: previewOnlyVal, plan: [] };

    var nodes = selectionOnlyVal ? figma.currentPage.selection : [figma.currentPage];
    
    if (selectionOnlyVal && nodes.length === 0) {
      console.log('❌ No elements selected');
      figma.notify('Please select elements to process');
      finishCodefigRunProgress();
      return Promise.resolve({ success: false, replacements: 0, error: 'No elements selected' });
    }
    
    console.log('🔍 Processing ' + nodes.length + ' root nodes');
    console.log('📋 Replacement patterns:');
    
    for (var i = 0; i < replacements.length; i++) {
      var repl = replacements[i];
      console.log('   "' + repl.from + '" → "' + repl.to + '"');
    }
    
    // Build comprehensive style cache and process nodes
    return buildStyleCache(nodes, selectionOnlyVal, localStylesOnlyVal).then(function(styleCache) {
      console.log('📋 Found ' + styleCache.size + ' styles (text + color + effect)');
      logInventoryHintsForReplaceStyles(styleCache, replacements);
      
      // Cleanup memory after building cache
      cleanupMemory();
      
      return collectAllNodes(nodes).then(function (allNodes) {
      console.log('📋 Collected ' + allNodes.length + ' nodes to process');
      
      if (allNodes.length === 0) {
        figma.notify('No nodes found to process');
        return { success: true, replacements: 0, error: null };
      }
      
      // Conservative chunk sizes to reduce memory with external libraries
      var adaptiveChunkSize = 8; // Default
      if (allNodes.length > 5000) {
        adaptiveChunkSize = 3; // Very small for large/deep trees
      } else if (allNodes.length > 2000) {
        adaptiveChunkSize = 5;
      } else if (allNodes.length > 500) {
        adaptiveChunkSize = 6;
      }
      
      console.log('📊 Using chunk size: ' + adaptiveChunkSize + ' (adaptive based on ' + allNodes.length + ' nodes)');
      
      return processWithOptimization(allNodes, async function(node) {
        rsIncr('nodesVisited');
        var replacementCount = 0;
        var nodeName = node.name || 'Unnamed';
        
        if (node.type === 'TEXT') {
          replacementCount += await processTextNode(node, styleCache, nodeName, replacements, searchInVal, localStylesOnlyVal, preview);
        }
        replacementCount += await processOtherStyles(node, styleCache, nodeName, replacements, searchInVal, localStylesOnlyVal, preview);
        
        return replacementCount;
      }, {
        chunkSize: adaptiveChunkSize,
        showProgress: true,
        operation: 'Replacing styles',
        maxNodes: undefined // Already capped at 8000 in collectAllNodes
      }).then(async function(resolved) {
        var totalReplacements = 0;
        var resultsArray = resolved && resolved.results ? resolved.results : (Array.isArray(resolved) ? resolved : []);
        for (var i = 0; i < resultsArray.length; i++) {
          totalReplacements += resultsArray[i] || 0;
        }
        
        // Final cleanup
        cleanupMemory();
        
        console.log('');
        console.log('📊 Results:');
        console.log('✅ Total replacements: ' + totalReplacements);

        logReplaceStylesSummary(searchInVal, replacements, localStylesOnlyVal, totalReplacements);

        if (totalReplacements > 0) {
          figma.notify('✅ Replaced ' + totalReplacements + ' styles');
        } else {
          figma.notify('No replacements — see console [ReplaceStyles] RUN SUMMARY');
        }
        
        return { success: true, replacements: totalReplacements, error: null };
      });
      });
    }).finally(function () {
      codefigRunOpEnd();
    });
    
  } catch (error) {
    console.log('❌ Script error: ' + error.message);
    figma.notify('Script error - check console');
    finishCodefigRunProgress();
    return Promise.resolve({ success: false, replacements: 0, error: error.message });
  }
}

/** Roots for traversing the file to discover styles on nodes (overview frame, etc.). Default = whole current page. */
function getReplaceStylesCacheScanRoots(scopeNodes) {
  if (typeof replaceStylesLimitCacheScanToSelection !== 'undefined' && replaceStylesLimitCacheScanToSelection === true) {
    return scopeNodes && scopeNodes.length ? scopeNodes : [figma.currentPage];
  }
  return [figma.currentPage];
}

// Build comprehensive style cache for all style types (local + library)
// Document scan for cache uses getReplaceStylesCacheScanRoots (usually full page), not only the replacement selection.
function buildStyleCache(scopeNodes, selectionOnly, localStylesOnly) {
  scopeNodes = scopeNodes || [figma.currentPage];
  selectionOnly = !!selectionOnly;
  localStylesOnly = !!localStylesOnly;
  return getAllStyles().then(function(allLocalStyles) {
    var cache = new Map();
    console.log('🔍 Building comprehensive style cache with Team Library API...');
    for (var i = 0; i < allLocalStyles.length; i++) {
      var style = allLocalStyles[i];
      var styleType = style.type || 'TEXT';
      if (_rsStats) {
        _rsStats.localStylesAdded++;
        var bucket = classifyStyleType(styleType);
        _rsStats.localByType[bucket] = (_rsStats.localByType[bucket] || 0) + 1;
      }
      cache.set(styleCacheKey(style.name, styleType), {
        style: style,
        type: styleType,
        key: null,
        isLibrary: false
      });
    }
    console.log('📋 Added ' + allLocalStyles.length + ' local styles');
    rsLog('Cache phase: loaded local file styles=' + allLocalStyles.length + ' | by type ' + JSON.stringify(_rsStats ? _rsStats.localByType : {}));
    return new Promise(function(resolve, reject) {
  var skipTeamLibrary = localStylesOnly;
  var teamLibSkipReason = '';
  if (localStylesOnly) {
    console.log('📋 localStylesOnly: skipping Team Library (local replacement targets only)');
  }

  // More robust check for Team Library API availability
  try {
    if (!skipTeamLibrary && !figma.teamLibrary) {
      skipTeamLibrary = true;
      teamLibSkipReason = 'figma.teamLibrary is undefined (run in Figma with team libraries; not all plugin hosts expose this API).';
    } else if (!skipTeamLibrary) {
      // Check if the method exists and is callable
      var method = figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync;
      if (typeof method !== 'function') {
        skipTeamLibrary = true;
        teamLibSkipReason = 'getAvailableLibraryStyleCollectionsAsync is missing (update Figma / plugin manifest).';
      }
    }
  } catch (e) {
    console.log('⚠️ Team Library API check failed: ' + e.message);
    skipTeamLibrary = true;
    teamLibSkipReason = 'Team Library API check failed: ' + e.message;
  }
  
  if (skipTeamLibrary) {
    // Skip Team Library and just use local styles + document scanning
    console.log('📋 Using local styles only (Team Library skipped)');
    if (teamLibSkipReason) {
      rsMarkTeamLibraryUnavailable(teamLibSkipReason, localStylesOnly);
    }
    scanDocumentForLibraryStyles(cache, getReplaceStylesCacheScanRoots(scopeNodes)).then(function() {
      console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
      cleanupMemory();
      resolve(cache);
    });
    return;
  }
  
  try {
    console.log('🌐 Accessing Team Library styles...');
    var startTime = Date.now();
    
    // Get all available library style collections with timeout protection
    // Use try-catch around the actual call to handle any runtime errors
    var libraryPromise;
    try {
      libraryPromise = figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync();
      
      // Verify it's actually a Promise
      if (!libraryPromise || typeof libraryPromise.then !== 'function') {
        throw new Error('getAvailableLibraryStyleCollectionsAsync did not return a Promise');
      }
    } catch (apiError) {
      console.log('⚠️ Team Library API call failed: ' + apiError.message);
      rsMarkTeamLibraryUnavailable('getAvailableLibraryStyleCollectionsAsync: ' + apiError.message, localStylesOnly);
      scanDocumentForLibraryStyles(cache, getReplaceStylesCacheScanRoots(scopeNodes)).then(function() {
        console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
        cleanupMemory();
        resolve(cache);
      });
      return;
    }
    
    var timeoutMs = typeof replaceStylesTeamLibraryTimeoutMs === 'number' ? replaceStylesTeamLibraryTimeoutMs : 30000;
    var listPromise = libraryPromise;
    if (timeoutMs > 0) {
      var timeoutPromise = new Promise(function(resolve, reject) {
        setTimeout(function() {
          reject(new Error('Team Library access timeout (' + timeoutMs + 'ms)'));
        }, timeoutMs);
      });
      listPromise = Promise.race([libraryPromise, timeoutPromise]);
    }
    
    listPromise.then(function(libraryCollections) {
      if (_rsStats) _rsStats.teamLibraryPathUsed = true;
      console.log('📚 Found ' + libraryCollections.length + ' library style collections');
      
      var cap = getReplaceStylesLibraryCollectionCap();
      if (libraryCollections.length > cap) {
        console.log('⚠️ Processing first ' + cap + ' of ' + libraryCollections.length + ' library collections (replaceStylesMaxLibraryCollections)');
        libraryCollections = libraryCollections.slice(0, cap);
      } else {
        rsLog('Team Library: loading metadata from all ' + libraryCollections.length + ' collection(s)');
      }
      
      // Process collections sequentially to avoid Promise complexity
      var processedCollections = 0;
      var totalCollections = libraryCollections.length;
      
      function processNextCollection() {
        if (processedCollections >= totalCollections) {
          console.log('📄 Merging in-document library styles into cache (after Team Library metadata)...');
          scanDocumentForLibraryStyles(cache, getReplaceStylesCacheScanRoots(scopeNodes)).then(function() {
            var endTime = Date.now();
            console.log('⏱️ Team Library + document scan took: ' + (endTime - startTime) + 'ms');
            console.log('📋 Total styles in cache: ' + cache.size + ' (local + library + scanned)');
            cleanupMemory();
            resolve(cache);
          });
          return;
        }
        
        var libraryCollection = libraryCollections[processedCollections];
        processedCollections++;
        
        figma.teamLibrary.getStylesInLibraryCollectionAsync(libraryCollection.key).then(function(libraryStyles) {
          if (_rsStats) _rsStats.teamLibraryCollectionsLoaded++;
          console.log('📋 Collection "' + libraryCollection.name + '": ' + libraryStyles.length + ' styles');
          
          for (var styleIndex = 0; styleIndex < libraryStyles.length; styleIndex++) {
            var libraryStyle = libraryStyles[styleIndex];
            var libType = libraryStyle.type || 'TEXT';
            var libKey = styleCacheKey(libraryStyle.name, libType);
            var existing = cache.get(libKey);
            // Prefer **local** file styles: Team Library metadata must not overwrite a style already defined in this document.
            if (existing && existing.style && existing.style.remote !== true) {
              rsIncr('librarySkippedLocalWins');
              continue;
            }
            rsIncr('libraryMetaAdded');
            cache.set(libKey, {
              style: null,
              key: libraryStyle.key,
              isLibrary: true,
              name: libraryStyle.name,
              type: libType
            });
          }
          
          // Process next collection
          processNextCollection();
        }).catch(function(e) {
          console.log('⚠️ Could not access collection: ' + libraryCollection.name);
          // Continue with next collection even if this one fails
          processNextCollection();
        });
      }
      
      // Start processing collections
      processNextCollection();
      
    }).catch(function(error) {
      console.log('⚠️ Team Library access failed: ' + error.message);
      console.log('📋 Falling back to document scanning...');
      rsMarkTeamLibraryUnavailable(error.message || 'Team Library list failed', localStylesOnly);
      
      scanDocumentForLibraryStyles(cache, getReplaceStylesCacheScanRoots(scopeNodes)).then(function() {
        console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
        
        // Cleanup memory after building cache
        cleanupMemory();
        
        resolve(cache);
      });
    });
      
    } catch (error) {
      console.log('⚠️ Team Library access failed: ' + error.message);
      console.log('📋 Falling back to document scanning...');
      rsMarkTeamLibraryUnavailable(error.message || 'Team Library sync error', localStylesOnly);
      
      scanDocumentForLibraryStyles(cache, getReplaceStylesCacheScanRoots(scopeNodes)).then(function() {
        console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
        
        // Cleanup memory after building cache
        cleanupMemory();
        
        resolve(cache);
      });
    }
    });
  });
}

// On-demand: search connected library collections for a style by name (not in cache).
// Used when replacement target exists in a library but isn't used in the document.
async function findLibraryStyleByNameAsync(name, expectedType, styleCache) {
  if (!figma.teamLibrary || typeof figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync !== 'function') {
    return null;
  }
  try {
    var collections = await figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync();
    var cap = getReplaceStylesLibraryCollectionCap();
    var collLimit = Math.min(collections.length, cap);
    for (var c = 0; c < collLimit; c++) {
      var libStyles = await figma.teamLibrary.getStylesInLibraryCollectionAsync(collections[c].key);
      for (var s = 0; s < libStyles.length; s++) {
        var lib = libStyles[s];
        if (lib.name === name && (lib.type || 'TEXT') === expectedType) {
          var imported = await figma.importStyleByKeyAsync(lib.key);
          if (imported && styleCache) {
            styleCache.set(styleCacheKey(imported.name, expectedType), {
              style: imported,
              type: expectedType,
              key: lib.key,
              isLibrary: true
            });
          }
          return imported;
        }
      }
    }
  } catch (e) {
    console.log('⚠️ Library style lookup failed for "' + name + '": ' + (e && e.message));
  }
  return null;
}

// Discover styles used on nodes (library + local) and merge into cache. `traverseRoots` is usually [currentPage].
// Priority overview frames (name matches) are fully traversed first; then a capped walk of the page (see replaceStylesScanMaxNodes).
function scanDocumentForLibraryStyles(cache, traverseRoots) {
  var scopeNodes = traverseRoots && traverseRoots.length ? traverseRoots : [figma.currentPage];
  var maxScan =
    typeof replaceStylesScanMaxNodes === 'number' && replaceStylesScanMaxNodes > 0 ? replaceStylesScanMaxNodes : 40000;

  var priorityScanRoots = findReplaceStylesPriorityScanFrameRoots(figma.currentPage);
  var priorityNodes = [];
  for (var wi = 0; wi < priorityScanRoots.length; wi++) {
    traverseNodes([priorityScanRoots[wi]], function(node) {
      priorityNodes.push(node);
      return 0;
    }, { maxNodes: null });
  }

  var mainNodes = [];
  traverseNodes(scopeNodes, function(node) {
    mainNodes.push(node);
    return 0;
  }, { maxNodes: maxScan });

  var truncated = mainNodes.length >= maxScan;
  var nodesToProcess = dedupeNodeListsPriorityFirst(priorityNodes, mainNodes);

  if (_rsStats) {
    _rsStats.scanNodesPlanned = nodesToProcess.length;
    _rsStats.scanPriorityFrames = priorityScanRoots.length;
    _rsStats.scanPriorityNodes = priorityNodes.length;
    _rsStats.scanMaxNodesCap = maxScan;
    _rsStats.scanTruncated = truncated;
  }

  if (priorityScanRoots.length > 0) {
    console.log('🔥 Priority style-overview scan: ' + priorityScanRoots.length + ' frame(s), ' + priorityNodes.length + ' nodes (full subtree)');
  }
  if (truncated) {
    console.log('⚠️ Style scan: main page walk hit cap (' + maxScan + ' nodes) — raise replaceStylesScanMaxNodes if targets are missing');
  }
  rsLog('Style scan plan: priority overview subtrees=' + priorityNodes.length + ' nodes | main walk≤' + maxScan + ' → unique total=' + nodesToProcess.length + (truncated ? ' (main truncated)' : ''));
  
  return new Promise(function(resolve) {
    var chunkStartIndex = 0;
    var totalNodesScanned = 0;
    var CHUNK_SIZE = 300; // Smaller chunks for memory
    var YIELD_DELAY = 10;
    
    console.log('📄 Scanning ' + nodesToProcess.length + ' nodes for styles...');
    if (typeof showProgress === 'function' && nodesToProcess.length > 0) {
      showProgress('Scanning styles', 0, nodesToProcess.length);
    }
    
    /** Add or upgrade cache entry from a resolved BaseStyle on a node (hydrates Team Library placeholders). */
    function mergeScannedStyleIntoCache(key, scanType, style) {
      if (!style) return;
      var existing = cache.get(key);
      if (!existing) {
        cache.set(key, {
          style: style,
          type: scanType,
          key: style.key || null,
          isLibrary: style.remote || false
        });
        rsIncr('scanStylesAdded');
        return;
      }
      if (!existing.style) {
        cache.set(key, {
          style: style,
          type: scanType,
          key: style.key || existing.key || null,
          isLibrary: !!(style.remote || existing.isLibrary)
        });
        rsIncr('scanStylesHydrated');
      }
    }
    
    // Helper function to extract styles from a node (async for getStyleByIdAsync)
    async function extractStylesFromNode(node) {
      if (!node || typeof node !== 'object') {
        return;
      }
      
      // Handle text nodes
      if (node.type === 'TEXT' && typeof node.getStyledTextSegments === 'function') {
        try {
          var segments = node.getStyledTextSegments(['textStyleId']);
          if (Array.isArray(segments)) {
            for (var segIndex = 0; segIndex < segments.length; segIndex++) {
              var segment = segments[segIndex];
              if (segment && segment.textStyleId && segment.textStyleId !== figma.mixed) {
                try {
                  var style = await figma.getStyleByIdAsync(segment.textStyleId);
                  if (style) {
                    var key = styleCacheKey(style.name, 'TEXT');
                    mergeScannedStyleIntoCache(key, 'TEXT', style);
                  }
                } catch (e) {
                  // Style might be inaccessible
                }
              }
            }
          }
        } catch (e) {
          // Node might not support text segments
        }
      }
      
      // Check other style types
      var styleProps = ['fillStyleId', 'strokeStyleId', 'effectStyleId'];
      for (var propIndex = 0; propIndex < styleProps.length; propIndex++) {
        var prop = styleProps[propIndex];
        if (prop in node && node[prop] && node[prop] !== figma.mixed) {
          try {
            var style = await figma.getStyleByIdAsync(node[prop]);
            if (style) {
              var scanType = 'PAINT';
              if (prop === 'effectStyleId') scanType = 'EFFECT';
              var key = styleCacheKey(style.name, scanType);
              mergeScannedStyleIntoCache(key, scanType, style);
            }
          } catch (e) {
            // Style might be inaccessible
          }
        }
      }
    }
    
    // Process nodes in chunks with yields (async for getStyleByIdAsync)
    function processChunk() {
      var chunkEnd = Math.min(chunkStartIndex + CHUNK_SIZE, nodesToProcess.length);
      (async function runChunk() {
        for (var i = chunkStartIndex; i < chunkEnd; i++) {
          await extractStylesFromNode(nodesToProcess[i]);
          totalNodesScanned++;
        }
        chunkStartIndex = chunkEnd;

        if (typeof showProgress === 'function') {
          showProgress('Scanning styles', totalNodesScanned, nodesToProcess.length);
        }
        
        if (chunkStartIndex >= nodesToProcess.length) {
          if (_rsStats) _rsStats.scanNodesDone = totalNodesScanned;
          console.log('✅ Scanned ' + totalNodesScanned + ' nodes, found ' + cache.size + ' unique styles');
          rsLog('Scan done: nodesScanned=' + totalNodesScanned + ' | cache size now=' + cache.size + ' | new keys from scan=' + (_rsStats ? _rsStats.scanStylesAdded : '?'));
          nodesToProcess = []; // Release reference
          cleanupMemory();
          resolve();
        } else {
          setTimeout(processChunk, YIELD_DELAY);
        }
      })().catch(function(e) {
        console.log('⚠️ Error during style scan: ' + (e && e.message));
        resolve();
      });
    }
    
    if (nodesToProcess.length > 0) {
      setTimeout(processChunk, YIELD_DELAY);
    } else {
      console.log('⚠️ No nodes to scan');
      resolve();
    }
  });
}

async function processTextNode(node, styleCache, nodeName, replacements, searchInVal, localStylesOnlyVal, preview) {
  var totalReplacements = 0;
  rsIncr('textNodesSeen');

  try {
    var segments = node.getStyledTextSegments(['textStyleId']);

    for (var segIndex = 0; segIndex < segments.length; segIndex++) {
      rsIncr('textSegmentsTotal');
      var segment = segments[segIndex];
      if (segment.textStyleId && segment.textStyleId !== figma.mixed) {
        rsIncr('textSegmentsWithStyleId');
        try {
          var currentStyle = await figma.getStyleByIdAsync(segment.textStyleId);
          if (!currentStyle) {
            rsIncr('textStyleGetFailed');
            rsDetail('TEXT "' + nodeName + '" [' + segment.start + '-' + segment.end + '] getStyleByIdAsync returned null id=' + segment.textStyleId);
            continue;
          }
          var ctx = 'TEXT «' + nodeName + '» chars ' + segment.start + '-' + segment.end + ' | current="' + currentStyle.name + '"';
          var newStyle = await findReplacementStyle(currentStyle, styleCache, 'TEXT', replacements, searchInVal, localStylesOnlyVal, ctx);
          if (newStyle) {
            previewRecord(preview, 'TEXT «' + nodeName + '» chars ' + segment.start + '-' + segment.end, currentStyle.name, newStyle.name);
            try {
              if (previewWouldWrite(preview)) {
                await node.setRangeTextStyleIdAsync(segment.start, segment.end, newStyle.id);
                console.log('✅ Text: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
              }
              totalReplacements++;
            } catch (applyErr) {
              rsIncr('applyErrors');
              console.log('⚠️ setRangeTextStyleIdAsync: ' + (applyErr && applyErr.message));
              rsDetail(ctx + ' | APPLY ERROR: ' + (applyErr && applyErr.message));
            }
          } else {
            rsIncr('textNoReplacement');
          }
        } catch (e) {
          rsIncr('textStyleGetFailed');
          console.log('⚠️ Could not access text style: ' + e.message);
          rsDetail('TEXT "' + nodeName + '": ' + (e && e.message));
        }
      } else if (segment.textStyleId === figma.mixed) {
        rsDetail('TEXT «' + nodeName + '» [' + segment.start + '-' + segment.end + '] textStyleId is MIXED — skipped');
      }
    }
  } catch (e) {
    console.log('⚠️ Could not process text segments: ' + e.message);
    rsDetail('TEXT «' + nodeName + '» getStyledTextSegments failed: ' + (e && e.message));
  }

  return totalReplacements;
}

async function processOtherStyles(node, styleCache, nodeName, replacements, searchInVal, localStylesOnlyVal, preview) {
  var totalReplacements = 0;

  if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
    rsIncr('fillBindings');
    try {
      var currentStyle = await figma.getStyleByIdAsync(node.fillStyleId);
      if (currentStyle) {
        var ctxF = 'FILL «' + nodeName + '» (' + node.type + ') | "' + currentStyle.name + '"';
        var newStyle = await findReplacementStyle(currentStyle, styleCache, 'PAINT', replacements, searchInVal, localStylesOnlyVal, ctxF);
        if (newStyle) {
          previewRecord(preview, ctxF, currentStyle.name, newStyle.name);
          try {
            if (previewWouldWrite(preview)) {
              await node.setFillStyleIdAsync(newStyle.id);
              console.log('✅ Fill: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
            }
            totalReplacements++;
          } catch (ae) {
            rsIncr('applyErrors');
            rsDetail(ctxF + ' | setFillStyleIdAsync: ' + (ae && ae.message));
          }
        } else {
          rsIncr('fillNoReplacement');
        }
      } else {
        rsIncr('styleGetErrors');
        rsDetail('FILL «' + nodeName + '»: getStyleByIdAsync null');
      }
    } catch (e) {
      rsIncr('styleGetErrors');
      console.log('⚠️ Could not access fill style: ' + e.message);
    }
  }

  if ('strokeStyleId' in node && node.strokeStyleId && node.strokeStyleId !== figma.mixed) {
    rsIncr('strokeBindings');
    try {
      var currentStyleS = await figma.getStyleByIdAsync(node.strokeStyleId);
      if (currentStyleS) {
        var ctxS = 'STROKE «' + nodeName + '» (' + node.type + ') | "' + currentStyleS.name + '"';
        var newStyleS = await findReplacementStyle(currentStyleS, styleCache, 'PAINT', replacements, searchInVal, localStylesOnlyVal, ctxS);
        if (newStyleS) {
          previewRecord(preview, ctxS, currentStyleS.name, newStyleS.name);
          try {
            if (previewWouldWrite(preview)) {
              await node.setStrokeStyleIdAsync(newStyleS.id);
              console.log('✅ Stroke: "' + currentStyleS.name + '" → "' + newStyleS.name + '" in "' + nodeName + '"');
            }
            totalReplacements++;
          } catch (ae2) {
            rsIncr('applyErrors');
            rsDetail(ctxS + ' | setStrokeStyleIdAsync: ' + (ae2 && ae2.message));
          }
        } else {
          rsIncr('strokeNoReplacement');
        }
      } else {
        rsIncr('styleGetErrors');
      }
    } catch (e) {
      rsIncr('styleGetErrors');
      console.log('⚠️ Could not access stroke style: ' + e.message);
    }
  }

  if ('effectStyleId' in node && node.effectStyleId && node.effectStyleId !== figma.mixed) {
    rsIncr('effectBindings');
    try {
      var currentStyleE = await figma.getStyleByIdAsync(node.effectStyleId);
      if (currentStyleE) {
        var ctxE = 'EFFECT «' + nodeName + '» (' + node.type + ') | "' + currentStyleE.name + '"';
        var newStyleE = await findReplacementStyle(currentStyleE, styleCache, 'EFFECT', replacements, searchInVal, localStylesOnlyVal, ctxE);
        if (newStyleE) {
          previewRecord(preview, ctxE, currentStyleE.name, newStyleE.name);
          try {
            if (previewWouldWrite(preview)) {
              await node.setEffectStyleIdAsync(newStyleE.id);
              console.log('✅ Effect: "' + currentStyleE.name + '" → "' + newStyleE.name + '" in "' + nodeName + '"');
            }
            totalReplacements++;
          } catch (ae3) {
            rsIncr('applyErrors');
            rsDetail(ctxE + ' | setEffectStyleIdAsync: ' + (ae3 && ae3.message));
          }
        } else {
          rsIncr('effectNoReplacement');
        }
      } else {
        rsIncr('styleGetErrors');
      }
    } catch (e) {
      rsIncr('styleGetErrors');
      console.log('⚠️ Could not access effect style: ' + e.message);
    }
  }

  if (rsDebugEnabled() && 'gridStyleId' in node && node.gridStyleId && node.gridStyleId !== figma.mixed) {
    rsDetail('GRID «' + nodeName + '» has gridStyleId — this script does not replace grid styles');
  }

  return totalReplacements;
}

async function findReplacementStyle(currentStyle, styleCache, expectedType, replacements, searchInVal, localStylesOnlyVal, ctxLabel) {
  ctxLabel = ctxLabel || '(context n/a)';
  var nm = currentStyle && currentStyle.name;
  var apiType = currentStyle && currentStyle.type;
  if (apiType && expectedType && apiType !== expectedType) {
    rsDetail(ctxLabel + ' | WARN: binding resolved as type ' + apiType + ' but slot expects ' + expectedType + ' — name="' + nm + '"');
  }

  if (searchInVal != null && String(searchInVal).trim() !== '') {
    var sIn = String(searchInVal).trim();
    if (!matchStyleNamePartial(currentStyle.name, sIn)) {
      rsIncr('searchInFiltered');
      rsDetail(ctxLabel + ' | OUT: searchIn — name does not match partial "' + sIn + '" | current="' + currentStyle.name + '"');
      return null;
    }
  }

  for (var replIndex = 0; replIndex < replacements.length; replIndex++) {
    var replacement = replacements[replIndex];
    var findPattern = replacement.from;
    if (findPattern == null || String(findPattern).trim() === '') {
      rsIncr('skippedEmptyFindPattern');
      rsDetail(ctxLabel + ' | skip rule #' + replIndex + ': empty find pattern');
      continue;
    }

    if (!matchStyleNamePartial(currentStyle.name, findPattern)) {
      rsIncr('patternNoMatch');
      rsDetail(ctxLabel + ' | rule #' + replIndex + ': pattern "' + findPattern + '" does not match (partial) "' + currentStyle.name + '"');
      continue;
    }

    // index 0 / total 1: bindings are visited as they are encountered, so the $n and $N
    // counters have no ordered list to count through. $& and capture groups work.
    var newStyleName = renameByPattern(currentStyle.name, findPattern, replacement.to, 0, 1, getMatchOpts());

    if (newStyleName === currentStyle.name) {
      rsIncr('replaceNoNameChange');
      rsDetail(ctxLabel + ' | rule #' + replIndex + ': pattern matched but .replace() did not change name — still "' + currentStyle.name + '" | find="' + findPattern + '" → to="' + replacement.to + '"');
      continue;
    }

    var candidates = expandCandidatesWithRemoteAliases(expandReplacementStyleNameCandidates(newStyleName));
    if (rsDebugEnabled() && candidates.length > 1) {
      rsDetail(ctxLabel + ' | rule #' + replIndex + ': lookup tries ' + candidates.length + ' name variant(s); primary after replace="' + newStyleName + '"');
    }

    var anyWrongType = false;
    var ci = 0;
    for (ci = 0; ci < candidates.length; ci++) {
      var tryName = candidates[ci];
      var cacheKey = styleCacheKey(tryName, expectedType);
      var styleInfo = styleCache.get(cacheKey);

      if (styleInfo && styleInfo.type !== expectedType) {
        if (!anyWrongType) {
          anyWrongType = true;
          rsIncr('cacheWrongType');
          rsDetail(ctxLabel + ' | FAIL rule #' + replIndex + ': cache has "' + tryName + '" as ' + styleInfo.type + ', need ' + expectedType);
        }
        continue;
      }

      if (styleInfo && styleInfo.type === expectedType) {
        if (styleInfo.style) {
          rsIncr('cacheHitResolvedStyle');
          if (tryName !== newStyleName) {
            rsDetail(ctxLabel + ' | OK rule #' + replIndex + ': matched via name variant "' + tryName + '" (computed was "' + newStyleName + '")');
          } else {
            rsDetail(ctxLabel + ' | OK rule #' + replIndex + ': "' + nm + '" → "' + tryName + '" (' + expectedType + ') id=' + styleInfo.style.id);
          }
          return styleInfo.style;
        }

        if (!localStylesOnlyVal && styleInfo.isLibrary && styleInfo.key) {
          try {
            var imported = await figma.importStyleByKeyAsync(styleInfo.key);
            if (imported) {
              rsIncr('cacheHitImportedLibrary');
              styleCache.set(styleCacheKey(imported.name, expectedType), {
                style: imported,
                type: expectedType,
                key: styleInfo.key,
                isLibrary: true
              });
              rsDetail(ctxLabel + ' | OK rule #' + replIndex + ': imported by key → "' + imported.name + '" (tried "' + tryName + '")');
              return imported;
            }
          } catch (importError) {
            rsIncr('importStyleFailed');
            console.log('❌ Failed to import style: ' + (importError && importError.message));
            rsDetail(ctxLabel + ' | importStyleByKeyAsync for "' + tryName + '": ' + (importError && importError.message));
          }
        } else if (localStylesOnlyVal && styleInfo.isLibrary && styleInfo.key) {
          rsIncr('blockedLocalOnlyLibraryPlaceholder');
          rsDetail(ctxLabel + ' | skip variant "' + tryName + '": localStylesOnly + library placeholder only');
        }
      }
    }

    if (!localStylesOnlyVal) {
      for (ci = 0; ci < candidates.length; ci++) {
        var tryNameLib = candidates[ci];
        var libStyle = await findLibraryStyleByNameAsync(tryNameLib, expectedType, styleCache);
        if (libStyle) {
          rsIncr('cacheHitImportedLibrary');
          rsDetail(ctxLabel + ' | OK rule #' + replIndex + ': library by name "' + tryNameLib + '" → "' + libStyle.name + '"');
          return libStyle;
        }
      }
      rsIncr('cacheMissNoKey');
      rsDetail(ctxLabel + ' | FAIL rule #' + replIndex + ': no cache/library match for any of: ' + candidates.slice(0, 6).join(' | ') + (candidates.length > 6 ? ' …' : ''));
      rsLogCacheMissHints(styleCache, expectedType, replacement.to);
    } else {
      rsIncr('blockedLocalOnlyLibraryLookup');
      rsIncr('cacheMissNoKey');
      rsDetail(ctxLabel + ' | FAIL rule #' + replIndex + ': localStylesOnly — skipped library scan; tried names: ' + candidates.slice(0, 6).join(' | ') + (candidates.length > 6 ? ' …' : ''));
      rsLogCacheMissHints(styleCache, expectedType, replacement.to);
    }
  }

  return null;
}

// Run the script (only when not imported)
// Check if this is being imported by looking for import markers
var isImported = false;
try {
  // This will be true if the script is being imported
  isImported = typeof window !== 'undefined' && window._importedScripts && window._importedScripts.includes('Comprehensive Style Replacement');
} catch (e) {
  isImported = false;
}

if (!isImported) {
  replaceAllStyles();
}