// Stack or flatten color scale
// @DOC_START
// # Stack or flatten color scale
// Converts a horizontal color ramp into a top-left nested stack, or the reverse. Uses **layer order** only (not fill color).
//
// ## Vertical stack (`horizontalScale` = false)
// Input: swatches in a row (e.g. auto-layout frame, left → right). Rightmost swatch = smallest (`startingSize`), each swatch to the left grows by `increment`, all top-left aligned, smallest on top of the layer stack. The frame resizes to fit the largest swatch.
//
// ## Horizontal row (`horizontalScale` = true)
// Input: a top-left nested stack. Swatches are laid out left → right in **layer order** (back → front), each at `startingSize`. The frame resizes to fit the row.
// @DOC_END

// @UI_CONFIG_START
// # Color scale layout
var startingSize = 250;
var horizontalScale = false;
var increment = 50; // @showWhen: horizontalScale=false
// @UI_CONFIG_END

function hasBounds(node) {
  return "x" in node && "y" in node && "width" in node && "height" in node;
}

function isContainer(node) {
  return (
    node.type === "FRAME" ||
    node.type === "GROUP" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE"
  );
}

function isSwatch(node) {
  if (!hasBounds(node)) return false;
  if (node.type === "CONNECTOR" || node.type === "SLICE") return false;
  return true;
}

function removeAutoLayout(node) {
  if (!hasBounds(node) || !("layoutMode" in node) || node.layoutMode === "NONE") return;
  if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "INSTANCE") return;

  if (
    node.layoutMode === "HORIZONTAL" &&
    "layoutWrap" in node &&
    node.layoutWrap === "WRAP" &&
    "children" in node
  ) {
    var children = node.children.slice();
    var saved = [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (hasBounds(child)) saved.push({ node: child, x: child.x, y: child.y });
    }
    node.layoutWrap = "NO_WRAP";
    node.layoutMode = "NONE";
    for (var s = 0; s < saved.length; s++) {
      saved[s].node.x = saved[s].x;
      saved[s].node.y = saved[s].y;
    }
  } else {
    node.layoutMode = "NONE";
  }
}

/** Layer-panel order (bottom → top) within the same parent. */
function sortByChildIndex(swatches) {
  var parent = swatches[0] && swatches[0].parent;
  return swatches.slice().sort(function (a, b) {
    if (!parent) return 0;
    return parent.children.indexOf(a) - parent.children.indexOf(b);
  });
}

/** Visual left → right (for horizontal rows). */
function sortByX(swatches) {
  return swatches.slice().sort(function (a, b) {
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });
}

function collectDirectSwatches(container) {
  if (!("children" in container)) return [];
  var out = [];
  for (var i = 0; i < container.children.length; i++) {
    var child = container.children[i];
    if (isSwatch(child)) out.push(child);
  }
  return out;
}

function unwrapInnerContainer(container, swatches) {
  if (container.type === "INSTANCE") {
    throw new Error("Cannot unwrap an instance. Select the swatches or a group/frame instead.");
  }

  var parent = container.parent;
  if (!parent) return;

  removeAutoLayout(container);

  var indexInParent = parent.children.indexOf(container);
  if (indexInParent === -1) throw new Error("Could not unwrap the selected container.");

  var dx = container.x;
  var dy = container.y;
  var parentIsAutoLayout = "layoutMode" in parent && parent.layoutMode !== "NONE";

  for (var i = swatches.length - 1; i >= 0; i--) {
    var swatch = swatches[i];
    parent.insertChild(indexInParent, swatch);
    if (!parentIsAutoLayout) {
      swatch.x = swatch.x + dx;
      swatch.y = swatch.y + dy;
    }
  }

  if (container.parent) container.remove();
}

function flattenNestedWrappers(root) {
  while (true) {
    var direct = collectDirectSwatches(root);
    if (direct.length >= 2) {
      return { swatches: direct, wrapper: root };
    }
    if (direct.length === 1 && isContainer(direct[0])) {
      var inner = direct[0];
      var innerSwatches = collectDirectSwatches(inner);
      if (innerSwatches.length >= 2) {
        unwrapInnerContainer(inner, innerSwatches);
        continue;
      }
    }
    break;
  }

  return { swatches: [], wrapper: root };
}

function prepareSwatches() {
  var sel = figma.currentPage.selection.slice();
  if (!sel.length) throw new Error("Select a color scale");

  var swatches = [];
  var wrapper = null;

  if (sel.length === 1 && isContainer(sel[0])) {
    var flattened = flattenNestedWrappers(sel[0]);
    swatches = flattened.swatches;
    wrapper = flattened.wrapper;
  } else {
    swatches = sortByChildIndex(
      sel.filter(function (node) {
        return isSwatch(node);
      })
    );
  }

  if (swatches.length < 2) {
    throw new Error("Need at least 2 color swatches. Select the full scale or its group/frame.");
  }

  var wrapperOrigin = null;
  if (wrapper) {
    wrapperOrigin = { x: wrapper.x, y: wrapper.y };
    if ("layoutMode" in wrapper && wrapper.layoutMode !== "NONE") {
      removeAutoLayout(wrapper);
    }
  }

  return { swatches: swatches, wrapper: wrapper, wrapperOrigin: wrapperOrigin };
}

function resizeSquare(node, size) {
  if (!("resize" in node)) return;
  if (node.type === "LINE") {
    node.resize(size, 0);
    return;
  }
  node.resize(size, size);
}

function moveTo(node, x, y) {
  node.x = x;
  node.y = y;
}

function bringToTop(node) {
  var parent = node.parent;
  if (!parent || !("appendChild" in parent)) return;
  parent.appendChild(node);
}

function resizeWrapperToFit(wrapper, width, height) {
  if (!wrapper || !("resize" in wrapper)) return;
  wrapper.resize(Math.max(1, width), Math.max(1, height));
}

function getLocalTopLeft(swatches) {
  var minX = Infinity;
  var minY = Infinity;
  for (var i = 0; i < swatches.length; i++) {
    minX = Math.min(minX, swatches[i].x);
    minY = Math.min(minY, swatches[i].y);
  }
  if (!isFinite(minX)) return { x: 0, y: 0 };
  return { x: minX, y: minY };
}

function getPagePosition(node) {
  var t = node.absoluteTransform;
  return { x: t[0][2], y: t[1][2] };
}

/**
 * Horizontal row → nested stack.
 * Order: left → right. Rightmost = smallest; each step left = larger; smallest on top.
 */
function buildVerticalStack(swatches, wrapper) {
  var leftToRight = sortByX(swatches);
  var step = typeof increment === "number" && !isNaN(increment) ? increment : 50;
  var base = typeof startingSize === "number" && !isNaN(startingSize) ? startingSize : 250;
  var count = leftToRight.length;
  var maxSize = base + (count - 1) * step;

  for (var i = 0; i < count; i++) {
    var node = leftToRight[count - 1 - i];
    var size = base + i * step;
    resizeSquare(node, size);
    moveTo(node, 0, 0);
  }

  for (var j = 0; j < count - 1; j++) {
    bringToTop(leftToRight[j]);
  }
  bringToTop(leftToRight[count - 1]);

  if (wrapper) resizeWrapperToFit(wrapper, maxSize, maxSize);
  return leftToRight;
}

/**
 * Nested stack → horizontal row.
 * Order: layer order (back → front), laid out left → right.
 * Preserves the frame's original canvas position.
 */
function buildHorizontalRow(swatches, wrapper, wrapperOrigin) {
  var ordered = sortByChildIndex(swatches);
  var size = typeof startingSize === "number" && !isNaN(startingSize) ? startingSize : 250;
  var count = ordered.length;
  var rowWidth = count * size;
  var topLeft = getLocalTopLeft(ordered);
  var pageAnchor = null;
  if (!wrapper && ordered.length) {
    pageAnchor = getPagePosition(ordered[0]);
    for (var p = 1; p < ordered.length; p++) {
      var pos = getPagePosition(ordered[p]);
      pageAnchor.x = Math.min(pageAnchor.x, pos.x);
      pageAnchor.y = Math.min(pageAnchor.y, pos.y);
    }
  }

  for (var i = 0; i < count; i++) {
    resizeSquare(ordered[i], size);
    if (wrapper) {
      moveTo(ordered[i], i * size, 0);
    } else if (pageAnchor) {
      moveTo(ordered[i], pageAnchor.x + i * size, pageAnchor.y);
    }
  }

  if (wrapper) {
    resizeWrapperToFit(wrapper, rowWidth, size);
    if (wrapperOrigin) {
      wrapper.x = wrapperOrigin.x + topLeft.x;
      wrapper.y = wrapperOrigin.y + topLeft.y;
    }
  }

  return ordered;
}

function groupSwatches(swatches) {
  if (!swatches.length) throw new Error("Nothing to group.");

  var parent = swatches[0].parent;
  if (!parent) throw new Error("Swatches must have a parent before grouping.");

  for (var i = 1; i < swatches.length; i++) {
    if (swatches[i].parent !== parent) {
      throw new Error("All swatches must share the same parent before grouping.");
    }
  }

  removeAutoLayout(parent);

  var indices = swatches
    .map(function (node) {
      return parent.children.indexOf(node);
    })
    .filter(function (idx) {
      return idx >= 0;
    })
    .sort(function (a, b) {
      return a - b;
    });

  if (indices.length !== swatches.length) {
    throw new Error("Could not find all swatches in the parent layer list.");
  }

  var insertAt = indices[0];
  var group =
    insertAt >= 0
      ? figma.group(swatches, parent, insertAt)
      : figma.group(swatches, parent);
  group.name = horizontalScale ? "Color scale (horizontal)" : "Color scale (stacked)";

  var base = typeof startingSize === "number" && !isNaN(startingSize) ? startingSize : 250;
  if (horizontalScale) {
    resizeWrapperToFit(group, swatches.length * base, base);
  } else {
    var step = typeof increment === "number" && !isNaN(increment) ? increment : 50;
    var maxSize = base + (swatches.length - 1) * step;
    resizeWrapperToFit(group, maxSize, maxSize);
  }
  return group;
}

function finishLayout(swatches, wrapper) {
  if (wrapper) {
    wrapper.name = horizontalScale ? "Color scale (horizontal)" : "Color scale (stacked)";
    return wrapper;
  }
  return groupSwatches(swatches);
}

function runColorScaleLayout() {
  var prepared = prepareSwatches();
  var samples = prepared.swatches;
  var result;

  if (horizontalScale) {
    result = buildHorizontalRow(samples, prepared.wrapper, prepared.wrapperOrigin);
    figma.currentPage.selection = [finishLayout(result, prepared.wrapper)];
    figma.notify("Flattened " + result.length + " swatches horizontally");
  } else {
    result = buildVerticalStack(samples, prepared.wrapper);
    figma.currentPage.selection = [finishLayout(result, prepared.wrapper)];
    figma.notify("Stacked " + result.length + " swatches vertically");
  }
}

try {
  if (typeof figma.currentPage.loadAsync === "function") {
    figma.currentPage.loadAsync().then(runColorScaleLayout).catch(function (error) {
      figma.notify("Error: " + error.message);
    });
  } else {
    runColorScaleLayout();
  }
} catch (error) {
  figma.notify("Error: " + error.message);
}
