// Relink local component instances
// @DOC_START
// # Relinks instances to the canonical local component when several definitions share the same name
//
// ## Overview
//
// After copy-paste between files, instances can stay bound to different local component
// definitions that share the same name (for example `Button/Primary`). Swapping by name in the
// UI does not fix stray ids when the name already matches.
//
// This script groups **local** components by name. When several definitions share one name, it
// picks a canonical component (the id with the highest usage count in the chosen scope). It then
// walks instances in that same scope and swaps any instance whose main component id is not the
// canonical one. When each name appears only once locally, it still swaps stray ids to that local
// component, including remote to same-named local.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Scope**<br>`scope` | **Selection** (requires a selection), **This page**, or **All pages** (loads every page first). |
// @DOC_END

@import { traverseNodes } from "@Core Library"

// @UI_CONFIG_START
var scope = "Selection";
// @UI_CONFIG_END

// @PANEL_START
// {
//   blocks: [
//     { key: "scope", type: "radio", options: ["Selection", "This page", "All pages"] }
//   ]
// }
// @PANEL_END

function getScopeValue() {
  var sc = typeof scope !== "undefined" ? scope : "Selection";
  if (sc === "Everything") return "All pages";
  return sc;
}

function groupKey(name) {
  return String(name || "").trim();
}

async function loadAllLocalComponents() {
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
  if (typeof figma.root.findAllWithCriteria === "function") {
    return figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
  }
  return figma.root.findAll(function (n) {
    return n.type === "COMPONENT";
  });
}

function groupLocalsByName(components) {
  var map = {};
  for (var i = 0; i < components.length; i++) {
    var c = components[i];
    var k = groupKey(c.name);
    if (!map[k]) map[k] = [];
    map[k].push(c);
  }
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

async function collectComponentIdUsage(usageMap, roots) {
  var instances = [];
  traverseNodes(roots, function (node) {
    if (node.type === "INSTANCE") {
      instances.push(node);
    }
    return 0;
  }, { maxNodes: null });

  for (var i = 0; i < instances.length; i++) {
    try {
      var main = await instances[i].getMainComponentAsync();
      if (main) {
        usageMap[main.id] = (usageMap[main.id] || 0) + 1;
      }
    } catch (e) {}
  }
}

function pickCanonical(components, usageMap) {
  var best = components[0];
  var bestCount = usageMap[best.id] || 0;
  for (var i = 1; i < components.length; i++) {
    var c = components[i];
    var count = usageMap[c.id] || 0;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    } else if (count === bestCount && String(c.id) < String(best.id)) {
      best = c;
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

function buildSingleNameFallback(localsGrouped) {
  var fallback = {};
  for (var key in localsGrouped) {
    if (!localsGrouped.hasOwnProperty(key)) continue;
    if (localsGrouped[key].length === 1) {
      fallback[key] = localsGrouped[key][0];
    }
  }
  return fallback;
}

async function remapInstance(instance, canonicalByKey, singleFallback, stats) {
  try {
    var main = await instance.getMainComponentAsync();
    if (!main) return;
    var key = groupKey(main.name);
    var target = canonicalByKey[key] || singleFallback[key];
    if (!target) return;
    if (target.id === main.id) return;
    instance.swapComponent(target);
    stats.instances++;
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

  var localComponents = await loadAllLocalComponents();
  var grouped = groupLocalsByName(localComponents);
  var usageMap = {};
  await collectComponentIdUsage(usageMap, roots);
  var canonicalByKey = buildCanonicalMap(grouped, usageMap);
  var singleFallback = buildSingleNameFallback(grouped);

  var stats = { instances: 0 };
  var instances = [];
  traverseNodes(roots, function (node) {
    if (node.type === "INSTANCE") {
      instances.push(node);
    }
    return 0;
  }, { maxNodes: null });

  for (var i = 0; i < instances.length; i++) {
    await remapInstance(instances[i], canonicalByKey, singleFallback, stats);
  }

  console.log("Remap local component instances: " + stats.instances + " swap(s)");
  figma.notify(stats.instances ? "Remapped " + stats.instances + " instance(s)" : "No instances remapped");
}

run().catch(function (err) {
  console.error("Remap local component instances: " + (err && err.message ? err.message : err));
  figma.notify("Remap failed — see console");
});
