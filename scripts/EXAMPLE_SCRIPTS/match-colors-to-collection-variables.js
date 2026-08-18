// Match colors to collection variables
// @DOC_START
// Recursively walks the selection and binds **raw** paint colors (fills, strokes, gradient stops, drop/inner shadows, and per-span text fills) to **COLOR** variables from one or more collections.
//
// ## Matching modes
// - **Exact (default):** 8-bit RGBA must match a token’s resolved value (after alias chains).
// - **Loose:** nearest token by **ΔE (CIE76)** in LAB, within a tolerance preset. Tolerance is **luminance-adaptive** (extra room for dark neutrals like `#191919` → `grey/900`, tighter for light greys). Near-ties pick the closest token (verbose log). Large alpha differences are skipped.
//
// ## Token scope (loose mode)
// 1. **Grey baseline:** `colors/grey`, `grey/*`, `black/*`, `white/*`
// 2. **Extended:** `colors/sage`, `colors/other` (only when grey baseline finds no match)
//
// ## Multi-collection
// All selected collections are merged into one candidate list. Loose mode picks the **nearest** token by ΔE (not collection order). When two tokens share the same resolved RGB, ties favor names like `white` / `black` over `grey/25` on near-white/near-black paints.
//
// ## Safety
// Select **every** collection that should supply candidates (e.g. grey scale + brand). Tolerance limits how far a raw color may drift; it does not stop a grey binding to green if **only** green collections are selected.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | collections | One or more variable collection names (`@multi`). |
// | looseMatching | When true, bind near-miss colors within tolerance. |
// | matchTolerance | `conservative` (ΔE≤2), `standard` (≤4), `aggressive` (≤6), or `custom` + `maxDeltaE`. |
// | verboseLogging | Extra console detail (duplicates, near-ties, palette stats). Off by default. |
//
// Results are listed in the **Info panel** (bound colors and skips). Click a row to select the layer.
// @DOC_END

@import { displayResults, createResult, createSelectableResult } from "@InfoPanel"
@import { collectNodesAsync, showProgress, codefigRunOpBegin, finishCodefigRunProgress } from "@Core Library"

// @UI_CONFIG_START
// # Palettes
var collections = []; // @options: variableCollections @multi
// Tick every collection that might hold a matching colour token.
// ---
// # Loose matching
var looseMatching = false; // @label: Match near misses
// Off, a colour has to match a token exactly. On, it binds to the closest token within the tolerance
// below — useful for finding colours that were nearly right.
//
var matchTolerance = "standard"; // @options: conservative|standard|aggressive|custom @showWhen: looseMatching=true
// How far a colour may sit from a token and still count, measured as LAB ΔE: conservative 2,
// standard 4, aggressive 6. Below about 2 the eye cannot tell them apart.
//
var maxDeltaE = 4; // @label: Custom tolerance (ΔE) @showWhen: looseMatching=true @showWhen: matchTolerance=custom
//
var verboseLogging = false; // @label: Verbose console output
// Duplicates, near-ties and palette statistics, in the console. The summary stays in the Info panel
// either way.
// @UI_CONFIG_END

var MAX_ALPHA_DELTA = 0.08;
/** Log when 2nd-best token is within this ΔE of the best (still binds best). */
var AMBIGUOUS_WARN_DELTA_E = 1.0;
/** Max bound-color rows in the Info panel (rest summarized). */
var MAX_INFO_BIND_ROWS = 120;

function matchLog() {
  if (typeof verboseLogging === "undefined" || !verboseLogging) return;
  console.log.apply(console, arguments);
}

/** Grey baseline: colors/grey, grey/*, black/*, white/* */
function tokenScope(variableName) {
  var n = String(variableName || "").toLowerCase();
  if (/^colors\/grey\b/.test(n) || /^grey\//.test(n) || /\/grey\//.test(n)) return "grey";
  if (/^black\//.test(n) || /\bblack\b/.test(n)) return "grey";
  if (/^white\//.test(n) || /\bwhite\b/.test(n)) return "grey";
  if (/^colors\/sage\b/.test(n) || /^sage\//.test(n) || /\/sage\//.test(n)) return "sage";
  if (/^colors\/other\b/.test(n) || /^other\//.test(n) || /\/other\//.test(n)) return "other";
  return null;
}

function isGreyScopeVariable(variable) {
  return tokenScope(variable && variable.name) === "grey";
}

function isExtendedOnlyScopeVariable(variable) {
  var s = tokenScope(variable && variable.name);
  return s === "sage" || s === "other";
}

function trimCollectionArg(v) {
  var s = v != null ? String(v).trim() : "";
  if (!s) return "";
  var low = s.toLowerCase();
  if (low === "(all collections)" || low === "all collections") return "";
  return s;
}

function parseCollectionNames() {
  var names = [];
  if (typeof collections !== "undefined") {
    if (Array.isArray(collections)) {
      for (var i = 0; i < collections.length; i++) {
        var t = trimCollectionArg(collections[i]);
        if (t && names.indexOf(t) === -1) names.push(t);
      }
    } else {
      var single = trimCollectionArg(collections);
      if (single) names.push(single);
    }
  }
  if (!names.length && typeof collection !== "undefined") {
    var legacy = trimCollectionArg(collection);
    if (legacy) names.push(legacy);
  }
  return names;
}

function pickMode(collectionLike) {
  if (!collectionLike || !collectionLike.modes || !collectionLike.modes.length) return null;
  if (collectionLike.defaultModeId) return collectionLike.defaultModeId;
  return collectionLike.modes[0].modeId;
}

function modeIdCandidates(collectionLike) {
  var out = [];
  if (!collectionLike || !collectionLike.modes) return out;
  var def = pickMode(collectionLike);
  if (def) out.push(def);
  for (var i = 0; i < collectionLike.modes.length; i++) {
    var id = collectionLike.modes[i].modeId;
    if (id && out.indexOf(id) === -1) out.push(id);
  }
  return out;
}

function rgbaQuantKey(rgbInner, multiplyOpacityOuter) {
  var r = rgbInner && typeof rgbInner.r === "number" ? rgbInner.r : 0;
  var g = rgbInner && typeof rgbInner.g === "number" ? rgbInner.g : 0;
  var b = rgbInner && typeof rgbInner.b === "number" ? rgbInner.b : 0;
  var innerA =
    rgbInner && typeof rgbInner.a === "number" && rgbInner.a === rgbInner.a ? rgbInner.a : 1;
  var outer =
    multiplyOpacityOuter != null &&
    multiplyOpacityOuter !== undefined &&
    multiplyOpacityOuter === multiplyOpacityOuter
      ? multiplyOpacityOuter
      : 1;
  var a = innerA * outer;
  function q(x) {
    return Math.round(Math.min(255, Math.max(0, x * 255)));
  }
  return q(r) + "|" + q(g) + "|" + q(b) + "|" + q(a);
}

/** RGB only (ignore alpha) — paints often use opacity on the paint, not in `color`. */
function rgbOnlyQuantKey(rgbInner) {
  var r = rgbInner && typeof rgbInner.r === "number" ? rgbInner.r : 0;
  var g = rgbInner && typeof rgbInner.g === "number" ? rgbInner.g : 0;
  var b = rgbInner && typeof rgbInner.b === "number" ? rgbInner.b : 0;
  function q(x) {
    return Math.round(Math.min(255, Math.max(0, x * 255)));
  }
  return q(r) + "|" + q(g) + "|" + q(b);
}

function variablePreferenceScore(variable) {
  var name = String(variable && variable.name ? variable.name : "");
  var score = name.length;
  if (name.indexOf("(test)") !== -1) score += 50;
  if (/\/\d+\/\d+/.test(name)) score += 30;
  var depth = name.split("/").length;
  if (depth > 2) score += (depth - 2) * 8;
  return score;
}

function isNearWhiteRgb(rgb01) {
  if (!rgb01) return false;
  return rgb01.r >= 0.92 && rgb01.g >= 0.92 && rgb01.b >= 0.92;
}

function isNearBlackRgb(rgb01) {
  if (!rgb01) return false;
  return rgb01.r <= 0.08 && rgb01.g <= 0.08 && rgb01.b <= 0.08;
}

/** Lower score wins ties. Uses paint color to prefer white/black tokens over grey scale steps. */
function semanticTieScore(variable, paintRgb01) {
  var base = variablePreferenceScore(variable);
  var n = String(variable && variable.name ? variable.name : "").toLowerCase();
  if (!paintRgb01) return base;
  if (isNearWhiteRgb(paintRgb01)) {
    if (/\bwhite\b/.test(n) || /\/white$/.test(n) || n === "white") base -= 80;
    if (/\bgrey\b|\bgray\b/.test(n)) base += 60;
  }
  if (isNearBlackRgb(paintRgb01)) {
    if (/\bblack\b/.test(n) || /\/black$/.test(n) || n === "black") base -= 80;
    if (/\bgrey\b|\bgray\b/.test(n)) base += 40;
  }
  return base;
}

function rgb01FromRgbaQuantKey(key) {
  if (!key) return null;
  var parts = String(key).split("|");
  if (parts.length < 3) return null;
  return {
    r: Number(parts[0]) / 255,
    g: Number(parts[1]) / 255,
    b: Number(parts[2]) / 255,
    a: parts.length > 3 ? Number(parts[3]) / 255 : 1,
  };
}

function preferCanonicalVariable(a, b, paintRgb01) {
  if (!b) return a;
  if (!a) return b;
  var sa = semanticTieScore(a, paintRgb01);
  var sb = semanticTieScore(b, paintRgb01);
  if (sa !== sb) return sa < sb ? a : b;
  return String(a.name).localeCompare(String(b.name)) <= 0 ? a : b;
}

function normalizeRGBA01(obj) {
  if (!obj || typeof obj.r !== "number" || typeof obj.g !== "number" || typeof obj.b !== "number")
    return null;
  var r = obj.r;
  var g = obj.g;
  var b = obj.b;
  var a = typeof obj.a === "number" && obj.a === obj.a ? obj.a : 1;
  if (r > 1 || g > 1 || b > 1) {
    r = r / 255;
    g = g / 255;
    b = b / 255;
  }
  if (a > 1) a = a / 255;
  return { r: r, g: g, b: b, a: a };
}

function effectiveAlpha(rgb01, opacity) {
  var a = rgb01 && typeof rgb01.a === "number" ? rgb01.a : 1;
  var o = opacity != null && opacity === opacity ? opacity : 1;
  return a * o;
}

function rgba01ToHex(rgb01) {
  if (!rgb01) return "?";
  function q(x) {
    return Math.round(Math.min(255, Math.max(0, x * 255)));
  }
  var r = q(rgb01.r);
  var g = q(rgb01.g);
  var b = q(rgb01.b);
  var a = typeof rgb01.a === "number" ? rgb01.a : 1;
  if (a < 0.999) {
    return "rgba(" + r + "," + g + "," + b + "," + a.toFixed(2) + ")";
  }
  function h(n) {
    var s = n.toString(16);
    return s.length === 1 ? "0" + s : s;
  }
  return ("#" + h(r) + h(g) + h(b)).toUpperCase();
}

function nodeSiteMeta(node, propertyLabel) {
  return {
    nodeId: node.id,
    nodeName: node.name || node.type,
    nodeType: node.type,
    propertyLabel: propertyLabel,
  };
}

function recordBind(ctx, meta, match, rgb01) {
  if (!ctx.bindLog || !meta || !match || !match.variable) return;
  ctx.bindLog.push({
    nodeId: meta.nodeId,
    nodeName: meta.nodeName,
    nodeType: meta.nodeType,
    property: meta.propertyLabel,
    fromHex: rgba01ToHex(rgb01),
    tokenName: match.variable.name,
    mode: match.mode,
    deltaE: match.deltaE,
  });
}

function recordSkip(ctx, meta, rgb01, closestDeltaE) {
  if (!ctx.skipLog || !meta) return;
  ctx.skipLog.push({
    nodeId: meta.nodeId,
    nodeName: meta.nodeName,
    nodeType: meta.nodeType,
    property: meta.propertyLabel,
    fromHex: rgba01ToHex(rgb01),
    closestDeltaE: closestDeltaE != null && closestDeltaE === closestDeltaE ? closestDeltaE : null,
  });
}

function showMatchColorsInfoPanel(ctx, collectionNames, looseOn, maxDE) {
  if (typeof displayResults === "undefined") return;

  var results = [];
  var total = ctx.counters.strictHits + ctx.counters.looseHits;
  var collList = collectionNames.length ? collectionNames.join(", ") : "(none)";

  results.push(
    createResult(
      total + " bound · " + ctx.counters.strictHits + " exact · " + ctx.counters.looseHits + " loose",
      "Collections: " +
        collList +
        (looseOn ? " · tolerance ΔE ≤ " + maxDE + " (luminance-adaptive)" : " · exact match only") +
        (looseOn ? " · grey first, then sage/other" : "") +
        (ctx.counters.skippedNoMatch ? " · " + ctx.counters.skippedNoMatch + " skipped" : "") +
        (ctx.counters.nearTieWarnings ? " · " + ctx.counters.nearTieWarnings + " close ties" : ""),
      total > 0 ? "success" : ctx.counters.skippedNoMatch ? "warning" : "info"
    )
  );

  var bindLog = ctx.bindLog || [];
  var bindShow = Math.min(bindLog.length, MAX_INFO_BIND_ROWS);
  for (var i = 0; i < bindShow; i++) {
    var b = bindLog[i];
    var modeLabel = b.mode === "loose" ? "loose" + (b.deltaE != null ? " · ΔE " + b.deltaE.toFixed(2) : "") : "exact";
    var row = createSelectableResult(
      b.fromHex + " → " + b.tokenName,
      b.nodeId,
      b.property + " · " + b.nodeName + " · " + modeLabel,
      "success"
    );
    row.variableName = b.tokenName;
    row.nodeName = b.nodeName;
    row.nodeType = b.nodeType;
    row.property = b.property;
    results.push(row);
  }
  if (bindLog.length > bindShow) {
    results.push(
      createResult(
        "… and " + (bindLog.length - bindShow) + " more bindings (see console summary)",
        "",
        "info"
      )
    );
  }

  var skipCap = 80;
  var skipLog = ctx.skipLog || [];
  for (var j = 0; j < skipLog.length && j < skipCap; j++) {
    var s = skipLog[j];
    var detail =
      s.property +
      " · " +
      s.nodeName +
      (s.closestDeltaE != null ? " · nearest token ΔE " + s.closestDeltaE.toFixed(2) : "");
    var skipRow = createSelectableResult(s.fromHex + " — no match", s.nodeId, detail, "warning");
    skipRow.nodeName = s.nodeName;
    skipRow.nodeType = s.nodeType;
    results.push(skipRow);
  }
  if (skipLog.length > skipCap) {
    results.push(
      createResult("… and " + (skipLog.length - skipCap) + " more skipped colors (see console)", "", "info")
    );
  }

  displayResults({
    title: "Match colors to tokens",
    results: results,
    type: "info",
    grouping: {
      modes: ["node", "property"],
      default: "node",
    },
    showFilters: true,
  });
}

function rgb01ToLab(r, g, b) {
  function lin(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  var R = lin(r);
  var G = lin(g);
  var B = lin(b);
  var x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  var y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  var z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  x /= 0.95047;
  z /= 1.08883;
  function f(t) {
    return t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116;
  }
  var L = 116 * f(y) - 16;
  var a = 500 * (f(x) - f(y));
  var bStar = 200 * (f(y) - f(z));
  return { L: L, a: a, b: bStar };
}

function deltaE76(lab1, lab2) {
  var dL = lab1.L - lab2.L;
  var da = lab1.a - lab2.a;
  var db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

function toleranceToMaxDeltaE() {
  if (typeof looseMatching === "undefined" || !looseMatching) return 0;
  var preset =
    typeof matchTolerance !== "undefined" ? String(matchTolerance).toLowerCase() : "standard";
  if (preset === "conservative") return 2;
  if (preset === "aggressive") return 6;
  if (preset === "custom") {
    var n = typeof maxDeltaE !== "undefined" ? Number(maxDeltaE) : 4;
    return Number.isNaN(n) || n < 0 ? 4 : n;
  }
  return 4;
}

/** Widen tolerance for dark neutrals; tighten for light greys so sage/other cannot steal near-whites. */
function effectiveMaxDeltaE(baseMax, rgb01) {
  if (!rgb01 || baseMax <= 0) return baseMax;
  var lab = rgb01ToLab(rgb01.r, rgb01.g, rgb01.b);
  var L = lab.L;
  var chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  var out = baseMax;
  if (L <= 15) out = baseMax + 1.5;
  else if (L <= 35) out = baseMax + 1.0;
  else if (chroma < 12 && L > 35 && L < 72) out = baseMax + 1.5;
  if (L >= 92) out = Math.min(out, Math.max(1.25, baseMax - 0.75));
  else if (L >= 85) out = Math.min(out, Math.max(1.5, baseMax - 0.5));
  return out;
}

async function findCollection(displayName) {
  var lc = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < lc.length; i++) {
    if (lc[i].name === displayName) return { origin: "local", collection: lc[i] };
  }
  if (!figma.teamLibrary || typeof figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync !== "function")
    return null;
  var remote = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  for (var k = 0; k < remote.length; k++) {
    if (remote[k].name === displayName) return { origin: "libraryMeta", meta: remote[k] };
  }
  return null;
}

async function resolveVariableFromAlias(alias) {
  if (!alias) return null;
  if (typeof alias.id === "string") {
    try {
      return await figma.variables.getVariableByIdAsync(alias.id);
    } catch (e) {
      return null;
    }
  }
  if (typeof alias.key === "string") {
    try {
      return await figma.variables.importVariableByKeyAsync(alias.key);
    } catch (e2) {
      return null;
    }
  }
  return null;
}

function rawValueForVariable(variable, collection) {
  if (!variable || !variable.valuesByMode) return null;
  var candidates = modeIdCandidates(collection);
  for (var i = 0; i < candidates.length; i++) {
    var mid = candidates[i];
    if (variable.valuesByMode[mid] !== undefined && variable.valuesByMode[mid] !== null)
      return variable.valuesByMode[mid];
  }
  var keys = Object.keys(variable.valuesByMode);
  for (var j = 0; j < keys.length; j++) {
    var v = variable.valuesByMode[keys[j]];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

async function resolveColorToRGBA01(variable, visited) {
  if (!variable) return null;
  if (String(variable.resolvedType).toUpperCase() !== "COLOR") return null;
  visited = visited || {};
  if (visited[variable.id]) return null;
  visited[variable.id] = true;
  try {
    var coll = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    var raw = rawValueForVariable(variable, coll);
    if (!raw) {
      matchLog("[match-colors] No value for variable:", variable.name, variable.id);
      return null;
    }
    if (raw.type === "VARIABLE_ALIAS") {
      var next = await resolveVariableFromAlias(raw);
      if (!next) {
        matchLog("[match-colors] Unresolved alias on", variable.name, raw);
        return null;
      }
      return resolveColorToRGBA01(next, visited);
    }
    return normalizeRGBA01(raw);
  } catch (err) {
    matchLog("[match-colors] resolveColorToRGBA01", variable && variable.name, err && err.message);
    return null;
  }
}

function gradientKind(t) {
  return (
    t === "GRADIENT_LINEAR" ||
    t === "GRADIENT_RADIAL" ||
    t === "GRADIENT_ANGULAR" ||
    t === "GRADIENT_DIAMOND"
  );
}

function aliasBindColor(variable) {
  return { type: "VARIABLE_ALIAS", id: variable.id };
}

function promoteUniqueWinners(mapDuplicateLists) {
  var winners = new Map();
  mapDuplicateLists.forEach(function (list, kk) {
    if (!list || !list.length) return;
    var paintRgb01 = rgb01FromRgbaQuantKey(kk);
    var pick = list[0];
    for (var i = 1; i < list.length; i++) {
      pick = preferCanonicalVariable(pick, list[i], paintRgb01);
    }
    winners.set(kk, pick);
    if (list.length > 1) {
      matchLog(
        "[match-colors] Duplicate exact RGB key " +
          kk +
          " (" +
          list.length +
          ' vars)—using "' +
          pick.name +
          '"'
      );
    }
  });
  return winners;
}

async function buildPalette(colorVariables) {
  var varMapRGBA = new Map();
  var looseList = [];
  var greyLooseList = [];
  var extendedLooseList = [];
  var seenIds = {};
  var unresolved = [];

  async function ingest(v, collectionName) {
    if (!v || String(v.resolvedType).toUpperCase() !== "COLOR") return;
    if (seenIds[v.id]) return;
    var rgb = await resolveColorToRGBA01(v, {});
    if (!rgb) {
      unresolved.push(v.name || v.id);
      return;
    }
    seenIds[v.id] = true;
    var kk = rgbaQuantKey(rgb, null);
    var arr = varMapRGBA.get(kk);
    if (!arr) {
      arr = [];
      varMapRGBA.set(kk, arr);
    }
    arr.push(v);
    var entry = { variable: v, rgb01: rgb, collectionName: collectionName || "", scope: tokenScope(v.name) };
    looseList.push(entry);
    if (isGreyScopeVariable(v)) greyLooseList.push(entry);
    else if (isExtendedOnlyScopeVariable(v)) extendedLooseList.push(entry);
  }

  for (var i = 0; i < colorVariables.length; i++) {
    await ingest(colorVariables[i].variable, colorVariables[i].collectionName);
  }

  if (unresolved.length) {
    matchLog(
      "[match-colors] " + unresolved.length + " COLOR vars had no resolved RGB (enable verboseLogging for details)."
    );
    matchLog("[match-colors] Examples:", unresolved.slice(0, 12).join(", "));
  }

  var strictMap = promoteUniqueWinners(varMapRGBA);

  return {
    strictMap: strictMap,
    looseList: looseList,
    greyLooseList: greyLooseList,
    extendedLooseList: extendedLooseList,
  };
}

async function loadColorVariables(collEntry) {
  var vars = [];
  if (collEntry.origin === "local") {
    for (var i = 0; i < collEntry.collection.variableIds.length; i++) {
      var vv = await figma.variables.getVariableByIdAsync(collEntry.collection.variableIds[i]);
      if (vv && String(vv.resolvedType).toUpperCase() === "COLOR") vars.push(vv);
    }
    return vars;
  }
  var descriptors = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collEntry.meta.key);
  for (var k = 0; k < descriptors.length; k++) {
    var d = descriptors[k];
    var rType = d.resolvedType || d.type;
    if (String(rType).toUpperCase() !== "COLOR") continue;
    try {
      var imp = await figma.variables.importVariableByKeyAsync(d.key);
      if (imp && String(imp.resolvedType).toUpperCase() === "COLOR") vars.push(imp);
    } catch (eImp) {}
  }
  return vars;
}

async function loadVariablesForCollectionNames(collectionNames) {
  var combined = [];
  var seen = {};
  for (var c = 0; c < collectionNames.length; c++) {
    var collName = collectionNames[c];
    var hit = await findCollection(collName);
    if (!hit) {
      console.warn('[match-colors] Collection not found: "' + collName + '"');
      continue;
    }
    var vars = await loadColorVariables(hit);
    matchLog('[match-colors] "' + collName + '" — COLOR variables:', vars.length);
    for (var i = 0; i < vars.length; i++) {
      var v = vars[i];
      if (seen[v.id]) continue;
      seen[v.id] = true;
      combined.push({ variable: v, collectionName: collName });
    }
  }
  return combined;
}

function findBestLooseMatch(rgb01, opacity, looseList, baseMaxDeltaE, scopeLabel) {
  var maxDE = effectiveMaxDeltaE(baseMaxDeltaE, rgb01);
  var labPaint = rgb01ToLab(rgb01.r, rgb01.g, rgb01.b);
  var effA = effectiveAlpha(rgb01, opacity);
  var best = null;
  var second = null;
  var tieEps = 1e-4;
  for (var i = 0; i < looseList.length; i++) {
    var entry = looseList[i];
    var dA = Math.abs(effA - entry.rgb01.a);
    if (dA > MAX_ALPHA_DELTA) continue;
    var labT = rgb01ToLab(entry.rgb01.r, entry.rgb01.g, entry.rgb01.b);
    var dE = deltaE76(labPaint, labT);
    var tieScore = semanticTieScore(entry.variable, rgb01);
    var beatsBest =
      !best ||
      dE < best.deltaE - tieEps ||
      (Math.abs(dE - best.deltaE) <= tieEps && tieScore < best.tieScore);
    if (beatsBest) {
      second = best;
      best = {
        variable: entry.variable,
        deltaE: dE,
        name: entry.variable.name,
        tieScore: tieScore,
        scope: scopeLabel || entry.scope || tokenScope(entry.variable.name),
      };
    } else if (!second || dE < second.deltaE - tieEps) {
      second = { variable: entry.variable, deltaE: dE, name: entry.variable.name };
    } else if (second && Math.abs(dE - second.deltaE) <= tieEps) {
      var secondTie = semanticTieScore(entry.variable, rgb01);
      if (secondTie < semanticTieScore(second.variable, rgb01)) {
        second = { variable: entry.variable, deltaE: dE, name: entry.variable.name };
      }
    }
  }
  if (!best || best.deltaE > maxDE) {
    return { variable: null, reason: "noMatch", deltaE: best ? best.deltaE : null, maxDeltaE: maxDE };
  }
  if (second && second.deltaE - best.deltaE < AMBIGUOUS_WARN_DELTA_E) {
    matchLog(
      "[match-colors] Close tie (" +
        (scopeLabel || "match") +
        ", ΔE " +
        best.deltaE.toFixed(2) +
        ', gap ' +
        (second.deltaE - best.deltaE).toFixed(2) +
        ', limit ' +
        maxDE.toFixed(2) +
        '): using "' +
        best.name +
        '" over "' +
        second.name +
        '"'
    );
    return { variable: best.variable, deltaE: best.deltaE, reason: "nearTie", scope: best.scope };
  }
  return { variable: best.variable, deltaE: best.deltaE, reason: "ok", scope: best.scope };
}

function lookupStrictVariable(ctx, normalized, opacity) {
  var keys = [];
  keys.push(rgbaQuantKey(normalized, opacity));
  keys.push(rgbaQuantKey(normalized, 1));
  keys.push(rgbaQuantKey(normalized, null));
  for (var ki = 0; ki < keys.length; ki++) {
    var hit = ctx.strictMap.get(keys[ki]);
    if (hit) return hit;
  }
  return null;
}

function lookupVariable(ctx, normalized, opacity, skipMeta) {
  if (!normalized) return null;
  var strictVar = lookupStrictVariable(ctx, normalized, opacity);
  if (strictVar) {
    ctx.counters.strictHits++;
    return { variable: strictVar, mode: "exact", deltaE: null };
  }
  if (!ctx.looseMatching || ctx.maxDeltaE <= 0) {
    ctx.counters.skippedNoMatch++;
    if (skipMeta) recordSkip(ctx, skipMeta, normalized, null);
    return null;
  }

  var greyList = ctx.greyLooseList && ctx.greyLooseList.length ? ctx.greyLooseList : ctx.looseList;
  var greyMatch = findBestLooseMatch(normalized, opacity, greyList, ctx.maxDeltaE, "grey");
  if (greyMatch.variable) {
    if (greyMatch.reason === "nearTie") ctx.counters.nearTieWarnings++;
    ctx.counters.looseHits++;
    ctx.looseAudit.push({ token: greyMatch.variable.name, deltaE: greyMatch.deltaE, scope: "grey" });
    return { variable: greyMatch.variable, mode: "loose", deltaE: greyMatch.deltaE };
  }

  if (ctx.extendedLooseList && ctx.extendedLooseList.length) {
    var extMatch = findBestLooseMatch(normalized, opacity, ctx.extendedLooseList, ctx.maxDeltaE, "extended");
    if (extMatch.variable) {
      if (extMatch.reason === "nearTie") ctx.counters.nearTieWarnings++;
      ctx.counters.looseHits++;
      ctx.looseAudit.push({ token: extMatch.variable.name, deltaE: extMatch.deltaE, scope: "extended" });
      return { variable: extMatch.variable, mode: "loose", deltaE: extMatch.deltaE };
    }
    ctx.counters.skippedNoMatch++;
    if (skipMeta) {
      var closest =
        greyMatch.deltaE != null && extMatch.deltaE != null
          ? Math.min(greyMatch.deltaE, extMatch.deltaE)
          : greyMatch.deltaE != null
            ? greyMatch.deltaE
            : extMatch.deltaE;
      recordSkip(ctx, skipMeta, normalized, closest);
    }
    return null;
  }

  ctx.counters.skippedNoMatch++;
  if (skipMeta) recordSkip(ctx, skipMeta, normalized, greyMatch.deltaE);
  return null;
}

function bindSolidIfMatch(pClone, ctx, siteMeta) {
  if (pClone.type !== "SOLID") return false;
  if (pClone.visible === false) return false;
  if (pClone.boundVariables && pClone.boundVariables.color && pClone.boundVariables.color.id) return false;
  var normalized = normalizeRGBA01(
    Object.assign({}, pClone.color || { r: 0, g: 0, b: 0 }, {
      a: pClone.color && typeof pClone.color.a === "number" ? pClone.color.a : 1,
    })
  );
  if (!normalized) return false;
  var match = lookupVariable(ctx, normalized, pClone.opacity, siteMeta);
  if (!match) return false;
  pClone.boundVariables = pClone.boundVariables || {};
  pClone.boundVariables.color = aliasBindColor(match.variable);
  ctx.counters.paintBinds++;
  if (siteMeta) recordBind(ctx, siteMeta, match, normalized);
  return true;
}

function bindGradientIfMatch(fillClone, ctx, siteMeta) {
  if (!gradientKind(fillClone.type) || !fillClone.gradientStops) return false;
  var swapped = false;
  for (var s = 0; s < fillClone.gradientStops.length; s++) {
    var st = fillClone.gradientStops[s];
    if (st.boundVariables && st.boundVariables.color && st.boundVariables.color.id) continue;
    var norm = normalizeRGBA01(st.color || { r: 0, g: 0, b: 0, a: 1 });
    if (!norm) continue;
    var gradMeta = siteMeta
      ? {
          nodeId: siteMeta.nodeId,
          nodeName: siteMeta.nodeName,
          nodeType: siteMeta.nodeType,
          propertyLabel: siteMeta.propertyLabel + " (gradient stop)",
        }
      : null;
    var match = lookupVariable(ctx, norm, null, gradMeta);
    if (!match) continue;
    st.boundVariables = st.boundVariables || {};
    st.boundVariables.color = aliasBindColor(match.variable);
    ctx.counters.paintBinds++;
    if (gradMeta) recordBind(ctx, gradMeta, match, norm);
    swapped = true;
  }
  return swapped;
}

function bindPaintsArray(sourcePaints, ctx, siteMeta) {
  var next = [];
  var changed = false;
  for (var i = 0; i < sourcePaints.length; i++) {
    var piece = JSON.parse(JSON.stringify(sourcePaints[i]));
    var hitSolid = bindSolidIfMatch(piece, ctx, siteMeta);
    var hitGrad = gradientKind(piece.type) ? bindGradientIfMatch(piece, ctx, siteMeta) : false;
    changed = changed || hitSolid || hitGrad;
    next.push(piece);
  }
  return { changed: changed, paints: next };
}

function bindEffectsArray(sourceFx, ctx, siteMeta) {
  if (!Array.isArray(sourceFx) || !sourceFx.length) return { changed: false, effects: sourceFx };
  var next = [];
  var changed = false;
  for (var e = 0; e < sourceFx.length; e++) {
    var fx = JSON.parse(JSON.stringify(sourceFx[e]));
    if ((fx.type === "DROP_SHADOW" || fx.type === "INNER_SHADOW") && fx.visible) {
      var col = sourceFx[e].color || fx.color;
      if (!(fx.boundVariables && fx.boundVariables.color && fx.boundVariables.color.id) && col && typeof col.r === "number") {
        var norm = normalizeRGBA01(col);
        if (norm) {
          var match = lookupVariable(ctx, norm, typeof fx.opacity === "number" ? fx.opacity : 1, siteMeta);
          if (match) {
            fx.boundVariables = fx.boundVariables || {};
            fx.boundVariables.color = aliasBindColor(match.variable);
            ctx.counters.fx++;
            if (siteMeta) recordBind(ctx, siteMeta, match, norm);
            changed = true;
          }
        }
      }
    }
    next.push(fx);
  }
  return { changed: changed, effects: next };
}

async function loadAllFontsForText(node) {
  if (!node.characters.length) return;
  try {
    if (typeof node.getRangeAllFontNames === "function") {
      var fams = node.getRangeAllFontNames(0, node.characters.length);
      for (var i = 0; i < fams.length; i++) await figma.loadFontAsync(fams[i]);
    } else {
      await figma.loadFontAsync(node.fontName !== figma.mixed ? node.fontName : { family: "Inter", style: "Regular" });
    }
  } catch (fontErr) {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  }
}

async function processNodeForColors(node, ctx) {
  if (node.type === "TEXT") {
    await processMixedText(node, ctx);
    return;
  }

  var fillStyleLocks = node.fillStyleId && node.fillStyleId !== figma.mixed;
  if ("fills" in node && node.fills !== figma.mixed && Array.isArray(node.fills) && !fillStyleLocks) {
    try {
      var bundleFills = bindPaintsArray(node.fills, ctx, nodeSiteMeta(node, "Fill"));
      if (bundleFills.changed) node.fills = bundleFills.paints;
    } catch (errFills) {}
  }

  var strokeStyleLocks = node.strokeStyleId && node.strokeStyleId !== figma.mixed;
  if ("strokes" in node && node.strokes !== figma.mixed && Array.isArray(node.strokes) && !strokeStyleLocks) {
    try {
      var bundleStrokes = bindPaintsArray(node.strokes, ctx, nodeSiteMeta(node, "Stroke"));
      if (bundleStrokes.changed) {
        node.strokes = bundleStrokes.paints;
        ctx.counters.strokeLayers++;
      }
    } catch (errStrokes) {}
  }

  var effectStyleLocks = node.effectStyleId && node.effectStyleId !== figma.mixed;
  if ("effects" in node && node.effects !== figma.mixed && Array.isArray(node.effects) && !effectStyleLocks) {
    try {
      var bundleFx = bindEffectsArray(node.effects, ctx, nodeSiteMeta(node, "Shadow"));
      if (bundleFx.changed) node.effects = bundleFx.effects;
    } catch (errFx) {}
  }
}

function processNodesInChunks(nodes, ctx) {
  return new Promise(function (resolve) {
    var idx = 0;
    var CHUNK_SIZE = 20;

    function step() {
      var end = Math.min(idx + CHUNK_SIZE, nodes.length);
      (async function runChunk() {
        for (var i = idx; i < end; i++) {
          await processNodeForColors(nodes[i], ctx);
        }
        idx = end;
        if (typeof showProgress === "function") {
          showProgress("Binding colors", idx, nodes.length);
        }
        if (idx < nodes.length) {
          setTimeout(step, 0);
        } else {
          resolve();
        }
      })().catch(function (chunkErr) {
        console.warn("[match-colors] chunk error:", chunkErr && chunkErr.message);
        idx = end;
        if (idx < nodes.length) {
          setTimeout(step, 0);
        } else {
          resolve();
        }
      });
    }

    if (typeof showProgress === "function" && nodes.length > 0) {
      showProgress("Binding colors", 0, nodes.length);
    }
    if (nodes.length === 0) {
      resolve();
      return;
    }
    setTimeout(step, 0);
  });
}

async function processMixedText(node, ctx) {
  if (node.type !== "TEXT" || !node.characters.length) return;
  await loadAllFontsForText(node);
  if (typeof node.getStyledTextSegments !== "function") return;
  try {
    var spans = node.getStyledTextSegments(["fills", "fillStyleId"]);
    if (!spans || !spans.length) return;
    for (var s = 0; s < spans.length; s++) {
      var sp = spans[s];
      if (sp.fillStyleId && sp.fillStyleId !== "" && sp.fillStyleId !== figma.mixed) continue;
      var fillsSlice = sp.fills;
      if (!fillsSlice || fillsSlice === figma.mixed) continue;
      var textMeta = nodeSiteMeta(node, "Text fill");
      var clone = bindPaintsArray(JSON.parse(JSON.stringify(fillsSlice)), ctx, textMeta);
      if (!clone.changed) continue;
      node.setRangeFills(sp.start, sp.end, clone.paints);
      ctx.counters.textSpans++;
    }
  } catch (segmentErr) {
    console.warn("[match-colors]", node.name, segmentErr.message);
  }
}

function printLooseAudit(looseAudit) {
  if (!looseAudit.length || (typeof verboseLogging !== "undefined" && !verboseLogging)) return;
  var sorted = looseAudit.slice().sort(function (a, b) {
    return b.deltaE - a.deltaE;
  });
  matchLog("[match-colors] Loose binds (top ΔE):");
  for (var i = 0; i < Math.min(5, sorted.length); i++) {
    matchLog(
      "  ΔE " +
        sorted[i].deltaE.toFixed(2) +
        " → " +
        sorted[i].token +
        (sorted[i].scope ? " (" + sorted[i].scope + ")" : "")
    );
  }
}

async function attachColorsWorkflow() {
  codefigRunOpBegin();
  var collectionNames = parseCollectionNames();
  if (!collectionNames.length) {
    figma.notify("Select at least one variable collection.");
    if (typeof displayResults !== "undefined") {
      displayResults({
        title: "Match colors to tokens",
        results: [createResult("Select at least one collection in the config.", "", "warning")],
        type: "warning",
      });
    }
    finishCodefigRunProgress();
    return;
  }
  if (!figma.currentPage.selection.length) {
    figma.notify("Select at least one layer.");
    if (typeof displayResults !== "undefined") {
      displayResults({
        title: "Match colors to tokens",
        results: [createResult("Select layers to process.", "", "warning")],
        type: "warning",
      });
    }
    finishCodefigRunProgress();
    return;
  }

  var colorVarEntries = await loadVariablesForCollectionNames(collectionNames);
  if (!colorVarEntries.length) {
    figma.notify("No COLOR variables found in the selected collection(s).");
    if (typeof displayResults !== "undefined") {
      displayResults({
        title: "Match colors to tokens",
        results: [
          createResult("No COLOR variables in selected collection(s).", collectionNames.join(", "), "warning"),
        ],
        type: "warning",
      });
    }
    finishCodefigRunProgress();
    return;
  }

  var built = await buildPalette(colorVarEntries);
  matchLog(
    "[match-colors] Strict palette keys:",
    built.strictMap.size,
    "· grey loose:",
    built.greyLooseList.length,
    "· extended loose:",
    built.extendedLooseList.length
  );

  if (!built.strictMap.size && !built.looseList.length) {
    figma.notify(
      "No resolvable RGB values in selected collection(s). Check the plugin console for alias/mode warnings."
    );
    if (typeof displayResults !== "undefined") {
      displayResults({
        title: "Match colors to tokens",
        results: [
          createResult(
            "Could not resolve any token colors.",
            "Check the console for alias or mode warnings.",
            "warning"
          ),
        ],
        type: "warning",
      });
    }
    finishCodefigRunProgress();
    return;
  }

  var looseOn = typeof looseMatching !== "undefined" && !!looseMatching;
  var maxDE = toleranceToMaxDeltaE();

  var ctx = {
    strictMap: built.strictMap,
    looseList: built.looseList,
    greyLooseList: built.greyLooseList,
    extendedLooseList: built.extendedLooseList,
    looseMatching: looseOn,
    maxDeltaE: maxDE,
    looseAudit: [],
    bindLog: [],
    skipLog: [],
    counters: {
      strictHits: 0,
      looseHits: 0,
      paintBinds: 0,
      strokeLayers: 0,
      fx: 0,
      textSpans: 0,
      skippedNoMatch: 0,
      nearTieWarnings: 0,
    },
  };

  var every = await collectNodesAsync(figma.currentPage.selection, {
    operation: "Collecting nodes",
    showProgress: true,
    yieldEvery: 400,
    maxNodes: 15000,
  });

  await processNodesInChunks(every, ctx);

  printLooseAudit(ctx.looseAudit);

  try {
    showMatchColorsInfoPanel(ctx, collectionNames, looseOn, maxDE);
  } catch (panelErr) {
    console.warn("[match-colors] Info panel:", panelErr && panelErr.message);
  }

  var total = ctx.counters.strictHits + ctx.counters.looseHits;
  var msg =
    "Bound " +
    total +
    " (" +
    ctx.counters.strictHits +
    " exact, " +
    ctx.counters.looseHits +
    " loose)";
  if (ctx.counters.skippedNoMatch) {
    msg += "; skipped " + ctx.counters.skippedNoMatch + " (no match within tolerance)";
  }
  figma.notify(msg);
  matchLog("[match-colors] SUMMARY", JSON.stringify(ctx.counters));

  finishCodefigRunProgress();
}

attachColorsWorkflow().catch(function (topLevelErr) {
  figma.notify("Match colors failed: " + (topLevelErr && topLevelErr.message));
  try {
    finishCodefigRunProgress();
  } catch (completeErr) {
    console.warn("[match-colors] run complete on error:", completeErr && completeErr.message);
  }
});
