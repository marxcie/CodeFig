// Relink local styles
// @DOC_START
// # Relink local styles
//
// **Problem:** After copy-paste between files, layers can stay bound to *different* local style definitions that share the same name (e.g. `xxlBold`). `replace-styles.ts` cannot help when search/replace leaves the name unchanged.
//
// **Approach:** Group **local** text / paint / effect / grid styles by `name` + type. When several definitions share one name, pick a **canonical** style (the id with the **highest usage count** in the chosen scope). Walk layers in that same scope and rebind any binding whose style id is not the canonical one for that name. When each name appears only once locally, still rebind stray ids to that local style, including remote → same-named local.
//
// ## Config options (UI)
// | Option | Description |
// |--------|-------------|
// | scope | **Selection** — selected layers only (requires a selection). **This page** — entire active page. **All pages** — entire file (loads every page first). |
// @DOC_END

@import { traverseNodes } from "@Core Library"

// @UI_CONFIG_START
// # Remap local styles
var scope = "Selection"; // @options: Selection|This page|All pages @radio
// @UI_CONFIG_END

function getScopeValue() {
  var sc = typeof scope !== "undefined" ? scope : "Selection";
  if (sc === "Everything") return "All pages";
  return sc;
}

function groupKey(kind, name) {
  return kind + "|" + String(name || "").trim();
}

function loadAllLocalStyles() {
  var loaders = [
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync()
  ];
  if (typeof figma.getLocalGridStylesAsync === "function") {
    loaders.push(figma.getLocalGridStylesAsync());
  } else {
    loaders.push(Promise.resolve([]));
  }
  return Promise.all(loaders).then(function (results) {
    return {
      TEXT: results[0],
      PAINT: results[1],
      EFFECT: results[2],
      GRID: results[3]
    };
  });
}

function groupLocalsByName(locals) {
  var map = {};
  function add(kind, arr) {
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      var k = groupKey(kind, s.name);
      if (!map[k]) map[k] = [];
      map[k].push(s);
    }
  }
  add("TEXT", locals.TEXT);
  add("PAINT", locals.PAINT);
  add("EFFECT", locals.EFFECT);
  add("GRID", locals.GRID);
  return map;
}

function getSelectionRoots() {
  if (!figma.currentPage.selection.length) {
    return [];
  }
  var out = [];
  for (var i = 0; i < figma.currentPage.selection.length; i++) {
    out.push(figma.currentPage.selection[i]);
  }
  return out;
}

function getTraversalRoots() {
  var sc = getScopeValue();
  if (sc === "All pages") {
    var roots = [];
    for (var p = 0; p < figma.root.children.length; p++) {
      roots.push(figma.root.children[p]);
    }
    return roots;
  }
  if (sc === "This page") {
    return [figma.currentPage];
  }
  return getSelectionRoots();
}

async function ensurePagesLoaded() {
  var sc = getScopeValue();
  if (sc === "All pages") {
    if (typeof figma.loadAllPagesAsync === "function") {
      await figma.loadAllPagesAsync();
    } else {
      for (var i = 0; i < figma.root.children.length; i++) {
        var pg = figma.root.children[i];
        if (pg && typeof pg.loadAsync === "function") {
          await pg.loadAsync();
        }
      }
    }
    return;
  }
  await figma.currentPage.loadAsync();
}

function collectStyleIdUsage(usageMap) {
  var roots = getTraversalRoots();
  traverseNodes(roots, function (node) {
    if (node.type === "TEXT" && node.getStyledTextSegments) {
      try {
        var segs = node.getStyledTextSegments(["textStyleId"]);
        for (var i = 0; i < segs.length; i++) {
          var sid = segs[i].textStyleId;
          if (sid && sid !== figma.mixed) {
            usageMap[sid] = (usageMap[sid] || 0) + 1;
          }
        }
      } catch (e) {}
    }
    if ("fillStyleId" in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
      usageMap[node.fillStyleId] = (usageMap[node.fillStyleId] || 0) + 1;
    }
    if ("strokeStyleId" in node && node.strokeStyleId && node.strokeStyleId !== figma.mixed) {
      usageMap[node.strokeStyleId] = (usageMap[node.strokeStyleId] || 0) + 1;
    }
    if ("effectStyleId" in node && node.effectStyleId && node.effectStyleId !== figma.mixed) {
      usageMap[node.effectStyleId] = (usageMap[node.effectStyleId] || 0) + 1;
    }
    if ("gridStyleId" in node && node.gridStyleId && node.gridStyleId !== figma.mixed) {
      usageMap[node.gridStyleId] = (usageMap[node.gridStyleId] || 0) + 1;
    }
    return 0;
  }, { maxNodes: null });
}

function pickCanonical(styles, usageMap) {
  var best = styles[0];
  var bestCount = usageMap[best.id] || 0;
  for (var i = 1; i < styles.length; i++) {
    var s = styles[i];
    var c = usageMap[s.id] || 0;
    if (c > bestCount) {
      best = s;
      bestCount = c;
    } else if (c === bestCount && String(s.id) < String(best.id)) {
      best = s;
    }
  }
  return best;
}

function buildCanonicalMap(localsGrouped, usageMap) {
  var canonicalByKey = {};
  for (var key in localsGrouped) {
    if (!localsGrouped.hasOwnProperty(key)) continue;
    var list = localsGrouped[key];
    if (!list || list.length < 2) continue;
    canonicalByKey[key] = pickCanonical(list, usageMap);
  }
  return canonicalByKey;
}

function buildSingleNameFallback(locals) {
  var fallback = {};
  function one(kind, arr) {
    var byName = {};
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      var k = groupKey(kind, s.name);
      if (!byName[k]) byName[k] = [];
      byName[k].push(s);
    }
    for (var key in byName) {
      if (!byName.hasOwnProperty(key)) continue;
      if (byName[key].length === 1) {
        fallback[key] = byName[key][0];
      }
    }
  }
  one("TEXT", locals.TEXT);
  one("PAINT", locals.PAINT);
  one("EFFECT", locals.EFFECT);
  one("GRID", locals.GRID);
  return fallback;
}

async function remapTextNode(node, canonicalByKey, singleFallback, stats) {
  try {
    var segments = node.getStyledTextSegments(["textStyleId"]);
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (!seg.textStyleId || seg.textStyleId === figma.mixed) continue;
      var cur = await figma.getStyleByIdAsync(seg.textStyleId);
      if (!cur || cur.type !== "TEXT") continue;
      var key = groupKey("TEXT", cur.name);
      var target = canonicalByKey[key] || singleFallback[key];
      if (!target) continue;
      if (target.id === cur.id) continue;
      await node.setRangeTextStyleIdAsync(seg.start, seg.end, target.id);
      stats.text++;
    }
  } catch (e) {}
}

async function remapStyleBinding(node, prop, kind, applyAsync, canonicalByKey, singleFallback, stats) {
  if (!(prop in node)) return;
  var bid = node[prop];
  if (!bid || bid === figma.mixed) return;
  var cur = await figma.getStyleByIdAsync(bid);
  if (!cur) return;
  var key = groupKey(kind, cur.name);
  var target = canonicalByKey[key] || singleFallback[key];
  if (!target) return;
  if (target.id === cur.id) return;
  try {
    await applyAsync(target.id);
    stats[kind.toLowerCase()]++;
  } catch (e) {}
}

async function run() {
  var sc = getScopeValue();
  if (sc === "Selection" && getSelectionRoots().length === 0) {
    figma.notify("Select layers to remap");
    return;
  }

  await ensurePagesLoaded();
  var roots = getTraversalRoots();
  if (roots.length === 0) {
    figma.notify("Nothing to remap in this scope");
    return;
  }

  var locals = await loadAllLocalStyles();
  var grouped = groupLocalsByName(locals);
  var usageMap = {};
  collectStyleIdUsage(usageMap);
  var canonicalByKey = buildCanonicalMap(grouped, usageMap);
  var singleFallback = buildSingleNameFallback(locals);

  var stats = { text: 0, paint: 0, effect: 0, grid: 0 };
  var nodes = [];
  traverseNodes(roots, function (n) {
    nodes.push(n);
    return 0;
  }, { maxNodes: null });

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.type === "TEXT") {
      await remapTextNode(node, canonicalByKey, singleFallback, stats);
    }
    await remapStyleBinding(node, "fillStyleId", "PAINT", function (tid) { return node.setFillStyleIdAsync(tid); }, canonicalByKey, singleFallback, stats);
    await remapStyleBinding(node, "strokeStyleId", "PAINT", function (tid) { return node.setStrokeStyleIdAsync(tid); }, canonicalByKey, singleFallback, stats);
    await remapStyleBinding(node, "effectStyleId", "EFFECT", function (tid) { return node.setEffectStyleIdAsync(tid); }, canonicalByKey, singleFallback, stats);
    if (typeof node.setGridStyleIdAsync === "function") {
      await remapStyleBinding(node, "gridStyleId", "GRID", function (tid) { return node.setGridStyleIdAsync(tid); }, canonicalByKey, singleFallback, stats);
    }
  }

  var total = stats.text + stats.paint + stats.effect + stats.grid;
  console.log("Remap local styles: " + total + " replacement(s) (text " + stats.text + ", paint " + stats.paint + ", effect " + stats.effect + ", grid " + stats.grid + ")");
  figma.notify(total ? "Remapped " + total + " style binding(s)" : "No style bindings remapped");
}

run().catch(function (err) {
  console.error("Remap local styles: " + (err && err.message ? err.message : err));
  figma.notify("Remap failed — see console");
});
