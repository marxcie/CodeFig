// Replace styles
// @DOC_START
// # Replace styles
// Replaces style bindings on nodes by matching style names to patterns (rebinds nodes to a different style; does not rename style definitions).
//
// ## Overview
// Same config as batch-rename: searchIn (optional filter on current style name), searchFor/replaceWith for one replacement, batchReplacement for multiple. Style name matching is **partial** (substring, with * wildcards). Supports text, paint, and effect styles. **Replacement targets** resolve from **local file styles and remote/Team Library** (imports when needed). After find/replace on the name, **lookup variants** run (default: `✅ `→`🚫 ` plus slash spacing `a/b`↔`a / b`) so e.g. `V5`→`V4` can find `🚫 V4 / …` when the computed name was `✅ V4/…`. selectionOnly: selection vs whole page.
//
// ## Config options (UI)
// | Option | Description |
// |--------|--------------|
// | searchIn | Optional: only try to rebind when the current style name (partial) matches this; empty = all styles. |
// | searchFor / replaceWith | Single find/replace pair applied to style names. |
// | batchReplacement | Textarea (UI) or array (script): multiple "search, replace" pairs; when non-empty, overrides searchFor/replaceWith. |
// | selectionOnly | If true, process only selected nodes; if false, process whole page. |
//
// ## Script-only (edit in file, not in plugin UI)
// - **`replaceStylesDebug`** — `true` by default: `[ReplaceStyles]` logs, `[detail]` samples, inventory hints, and a run summary. Set **`false`** once behavior is verified (summary still prints when zero replacements).
// - **`localStylesOnly`** — `false` by default (local **and** remote/team library). Set **`true`** only while isolating local resolution issues.
// - **`replaceStylesNameFallbackRewrites`** — After `searchFor`/`replaceWith`, if the computed name is missing from the cache, try extra string variants (regex → replacement), e.g. `✅ `→`🚫 ` when V5 styles use ✅ and V4 styles use 🚫. See script body for default.
// @DOC_END

// Import memory management utilities and library functions
@import { processWithOptimization, cleanupMemory, traverseNodes, getAllStyles } from "@Core Library"
@import { escapeWildcards } from "@Pattern Matching"

// Fallback for escapeWildcards if import fails
if (typeof escapeWildcards === 'undefined') {
  var escapeWildcards = function(pattern) {
    // Escape regex special characters; * is handled separately in style-name matching
    return pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  };
}

// ========================================
// CONFIGURATION
// ========================================

// @UI_CONFIG_START
// # Replace styles
var searchIn = ""; // @placeholder="color/"
// Optional, only rebind when current style name contains this (e.g. "color/", "Typography/")
//
var searchFor = ""; // @placeholder="500"
var replaceWith = ""; // @placeholder="50"
// ---
var batchReplacement = ""; // @textarea
// Batch: one line per pair, "search, replace" (overrides searchFor/replaceWith when non-empty)
// @UI_CONFIG_END
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
 * After find/replace on the style name, if there is no exact cache hit, try these rewrites on the **computed** name (each adds a lookup candidate).
 * Default: `✅ …` → `🚫 …` so a rule `V5`→`V4` can resolve `✅ V5/…` → `✅ V4/…` → `🚫 V4/…` when your V4 styles use 🚫.
 * Set to `[]` to require exact names only.
 */
var replaceStylesNameFallbackRewrites = [
  { pattern: /^✅\s+/, replacement: '🚫 ' }
];

/** Max per-run detailed lines (avoid console flood on huge files). */
var REPLACE_STYLES_DEBUG_DETAIL_BUDGET = 80;

var _rsDebugDetailRemaining = 0;
var _rsStats = null;

function rsDebugEnabled() {
  return typeof replaceStylesDebug !== 'undefined' && replaceStylesDebug === true;
}

function rsResetStats() {
  _rsStats = {
    // Inventory / cache
    localStylesAdded: 0,
    localByType: { TEXT: 0, PAINT: 0, EFFECT: 0, GRID: 0, OTHER: 0 },
    scanNodesPlanned: 0,
    scanNodesDone: 0,
    scanStylesAdded: 0,
    libraryMetaAdded: 0,
    librarySkippedLocalWins: 0,
    teamLibraryPathUsed: false,
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
  console.log('  Document scan: nodes=' + s.scanNodesDone + '/' + s.scanNodesPlanned + ' | styles newly added to cache from scan=' + s.scanStylesAdded);
  console.log('  Team library metadata entries added=' + s.libraryMetaAdded + ' | skipped (local wins)=' + s.librarySkippedLocalWins + ' | teamLibraryPathUsed=' + s.teamLibraryPathUsed);
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
    console.log('  • If Team Library is skipped in logs, remote styles won’t resolve until the library API is available in your environment.');
  }
}

/**
 * Partial style-name match (* = wildcard, case-insensitive).
 * (Avoids @Pattern Matching default here: its wildcard mode is full-string ^…$ only.)
 */
function matchStyleNamePartial(text, pattern) {
  if (pattern == null) return false;
  var p = String(pattern);
  if (p.trim() === '') return false;
  var searchText = String(text || '').toLowerCase();
  var searchPattern = p.toLowerCase();
  var escapedPattern = escapeWildcards(searchPattern);
  var regexPattern = escapedPattern.replace(/\*/g, '.*');
  try {
    return new RegExp(regexPattern, 'i').test(searchText);
  } catch (e) {
    return searchText.indexOf(searchPattern) !== -1;
  }
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

// Helper function to collect all nodes using library function
// Uses iterative traverseNodes with maxNodes to prevent memory overload
function collectAllNodes(nodes) {
  var allNodes = [];
  var MAX_NODES = 8000; // Conservative limit to prevent memory overload with external libs
  
  traverseNodes(nodes, function(node) {
    allNodes.push(node);
    return 0;
  }, { maxNodes: MAX_NODES });
  
  if (allNodes.length >= MAX_NODES) {
    console.log('⚠️ Node limit reached (' + MAX_NODES + '). Processing first ' + MAX_NODES + ' nodes.');
  }
  
  return allNodes;
}

// Main function - can be called directly or imported
function replaceAllStyles(customReplacements, customSelectionOnly) {
  try {
    var replacements = customReplacements || buildReplacementsFromConfig();
    var selectionOnlyVal = customSelectionOnly !== undefined ? customSelectionOnly : selectionOnly;
    var localStylesOnlyVal = typeof localStylesOnly !== 'undefined' ? !!localStylesOnly : false;
    
    console.log('🎨 Replace Styles');
    console.log('====================================');
    
    if (replacements.length === 0) {
      console.log('❌ No replacements configured');
      figma.notify('Configure searchFor/replaceWith or batchReplacement first');
      return Promise.resolve({ success: false, replacements: 0, error: 'No replacements configured' });
    }

    rsResetStats();
    var searchInVal = typeof searchIn !== 'undefined' ? searchIn : '';
    rsLog('Starting run | selectionOnly=' + selectionOnlyVal + ' | localStylesOnly=' + localStylesOnlyVal);
    rsLog('searchIn=' + JSON.stringify(String(searchInVal || '')) + ' | rules: ' + JSON.stringify(replacements));
    
    var nodes = selectionOnlyVal ? figma.currentPage.selection : [figma.currentPage];
    
    if (selectionOnlyVal && nodes.length === 0) {
      console.log('❌ No elements selected');
      figma.notify('Please select elements to process');
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
      
      // Collect all nodes into a flat array
      var allNodes = collectAllNodes(nodes);
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
          replacementCount += await processTextNode(node, styleCache, nodeName, replacements, searchInVal, localStylesOnlyVal);
        }
        replacementCount += await processOtherStyles(node, styleCache, nodeName, replacements, searchInVal, localStylesOnlyVal);
        
        return replacementCount;
      }, {
        chunkSize: adaptiveChunkSize,
        showProgress: true,
        operation: 'Replacing styles',
        maxNodes: undefined // Already capped at 8000 in collectAllNodes
      }).then(function(resolved) {
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
    
  } catch (error) {
    console.log('❌ Script error: ' + error.message);
    figma.notify('Script error - check console');
    return Promise.resolve({ success: false, replacements: 0, error: error.message });
  }
}

// Build comprehensive style cache for all style types (local + library)
// scopeNodes/selectionOnly limit fallback scan scope to reduce memory
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
  if (localStylesOnly) {
    console.log('📋 localStylesOnly: skipping Team Library (local replacement targets only)');
  }

  // More robust check for Team Library API availability
  try {
    if (!skipTeamLibrary && !figma.teamLibrary) {
      skipTeamLibrary = true;
    } else if (!skipTeamLibrary) {
      // Check if the method exists and is callable
      var method = figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync;
      if (typeof method !== 'function') {
        skipTeamLibrary = true;
      }
    }
  } catch (e) {
    console.log('⚠️ Team Library API check failed: ' + e.message);
    skipTeamLibrary = true;
  }
  
  if (skipTeamLibrary) {
    // Skip Team Library and just use local styles + document scanning
    console.log('📋 Using local styles only (Team Library skipped)');
    scanDocumentForLibraryStyles(cache, scopeNodes, selectionOnly).then(function() {
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
      skipTeamLibrary = true;
      scanDocumentForLibraryStyles(cache, scopeNodes, selectionOnly).then(function() {
        console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
        cleanupMemory();
        resolve(cache);
      });
      return;
    }
    
    // Add timeout to prevent hanging
    var timeoutPromise = new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new Error('Team Library access timeout (10s)'));
      }, 10000); // 10 second timeout
    });
    
    Promise.race([libraryPromise, timeoutPromise]).then(function(libraryCollections) {
      if (_rsStats) _rsStats.teamLibraryPathUsed = true;
      console.log('📚 Found ' + libraryCollections.length + ' library style collections');
      rsLog('Team Library: loading metadata from up to N collections (see logs above)');
      
      // Performance optimization: Limit collections to prevent memory overflow
      var maxCollections = selectionOnly ? 5 : 8; // Fewer when only selection
      if (libraryCollections.length > maxCollections) {
        console.log('⚠️ Processing first ' + maxCollections + ' library collections');
        libraryCollections = libraryCollections.slice(0, maxCollections);
      }
      
      // Process collections sequentially to avoid Promise complexity
      var processedCollections = 0;
      var totalCollections = libraryCollections.length;
      
      function processNextCollection() {
        if (processedCollections >= totalCollections) {
          var endTime = Date.now();
          console.log('⏱️ Team Library access took: ' + (endTime - startTime) + 'ms');
          console.log('📋 Total styles in cache: ' + cache.size + ' (local + library)');
          // Cleanup memory after building cache
          cleanupMemory();
          resolve(cache);
          return;
        }
        
        var libraryCollection = libraryCollections[processedCollections];
        processedCollections++;
        
        figma.teamLibrary.getStylesInLibraryCollectionAsync(libraryCollection.key).then(function(libraryStyles) {
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
      
      scanDocumentForLibraryStyles(cache, scopeNodes, selectionOnly).then(function() {
        console.log('📋 Total styles in cache: ' + cache.size + ' (local + scanned)');
        
        // Cleanup memory after building cache
        cleanupMemory();
        
        resolve(cache);
      });
    });
      
    } catch (error) {
      console.log('⚠️ Team Library access failed: ' + error.message);
      console.log('📋 Falling back to document scanning...');
      
      scanDocumentForLibraryStyles(cache, scopeNodes, selectionOnly).then(function() {
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
    var maxCollections = 15; // Limit to avoid long scan in files with many libs
    for (var c = 0; c < Math.min(collections.length, maxCollections); c++) {
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

// Fallback: scan nodes for library styles. When selectionOnly, scans only scopeNodes.
// Limits nodes to avoid memory overflow with large files.
function scanDocumentForLibraryStyles(cache, scopeNodes, selectionOnly) {
  scopeNodes = scopeNodes || [figma.currentPage];
  var MAX_SCAN_NODES = 5000; // Cap to prevent memory overflow
  var nodesToProcess = [];
  traverseNodes(scopeNodes, function(node) {
    nodesToProcess.push(node);
    return 0;
  }, { maxNodes: MAX_SCAN_NODES });

  if (_rsStats) _rsStats.scanNodesPlanned = nodesToProcess.length;
  
  if (nodesToProcess.length >= MAX_SCAN_NODES) {
    nodesToProcess = nodesToProcess.slice(0, MAX_SCAN_NODES);
    console.log('⚠️ Style scan limited to ' + MAX_SCAN_NODES + ' nodes');
  }
  
  return new Promise(function(resolve) {
    var chunkStartIndex = 0;
    var totalNodesScanned = 0;
    var CHUNK_SIZE = 300; // Smaller chunks for memory
    var YIELD_DELAY = 10;
    
    console.log('📄 Scanning ' + nodesToProcess.length + ' nodes for styles...');
    
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
                    if (!cache.has(key)) {
                      cache.set(key, {
                        style: style,
                        type: 'TEXT',
                        key: style.key || null,
                        isLibrary: style.remote || false
                      });
                      rsIncr('scanStylesAdded');
                    }
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
              if (!cache.has(key)) {
                cache.set(key, {
                  style: style,
                  type: scanType,
                  key: style.key || null,
                  isLibrary: style.remote || false
                });
                rsIncr('scanStylesAdded');
              }
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

async function processTextNode(node, styleCache, nodeName, replacements, searchInVal, localStylesOnlyVal) {
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
            try {
              await node.setRangeTextStyleIdAsync(segment.start, segment.end, newStyle.id);
              totalReplacements++;
              console.log('✅ Text: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
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

async function processOtherStyles(node, styleCache, nodeName, replacements, searchInVal, localStylesOnlyVal) {
  var totalReplacements = 0;

  if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
    rsIncr('fillBindings');
    try {
      var currentStyle = await figma.getStyleByIdAsync(node.fillStyleId);
      if (currentStyle) {
        var ctxF = 'FILL «' + nodeName + '» (' + node.type + ') | "' + currentStyle.name + '"';
        var newStyle = await findReplacementStyle(currentStyle, styleCache, 'PAINT', replacements, searchInVal, localStylesOnlyVal, ctxF);
        if (newStyle) {
          try {
            await node.setFillStyleIdAsync(newStyle.id);
            totalReplacements++;
            console.log('✅ Fill: "' + currentStyle.name + '" → "' + newStyle.name + '" in "' + nodeName + '"');
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
          try {
            await node.setStrokeStyleIdAsync(newStyleS.id);
            totalReplacements++;
            console.log('✅ Stroke: "' + currentStyleS.name + '" → "' + newStyleS.name + '" in "' + nodeName + '"');
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
          try {
            await node.setEffectStyleIdAsync(newStyleE.id);
            totalReplacements++;
            console.log('✅ Effect: "' + currentStyleE.name + '" → "' + newStyleE.name + '" in "' + nodeName + '"');
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

    var newStyleName = currentStyle.name;
    var escapedForReplace = escapeWildcards(String(findPattern));
    var regexSrc = escapedForReplace.replace(/\*/g, '.*');
    var patternRegex = new RegExp(regexSrc, 'gi');
    newStyleName = newStyleName.replace(patternRegex, replacement.to);

    if (newStyleName === currentStyle.name) {
      rsIncr('replaceNoNameChange');
      rsDetail(ctxLabel + ' | rule #' + replIndex + ': pattern matched but .replace() did not change name — still "' + currentStyle.name + '" | find="' + findPattern + '" → to="' + replacement.to + '"');
      continue;
    }

    var candidates = expandReplacementStyleNameCandidates(newStyleName);
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