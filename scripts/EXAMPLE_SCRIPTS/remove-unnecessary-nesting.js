// Remove unnecessary nesting
// @DOC_START
// # Removes or merges redundant frames and auto layouts that do nothing for their children
//
// ## Overview
//
// Targets frames, auto layouts, and groups that are redundant: a single child, no padding, and no
// effective gap. Optionally **Normalize** merges parent and child when one has padding and the
// other has gap, combining properties onto one container.
//
// ### Actions
//
// - **Remove**: Unwrap containers that do nothing (single child, no padding, no effective spacing).
// - **Normalize** (optional): When the parent has padding and only one child, and that child has
//   gap but no padding, merge gap onto the outer container, lift the grandchildren up, and remove
//   the inner one. The outer frame keeps its name, size, and place in the tree. Variable bindings
//   are preserved. Min/max width and height move onto the surviving container.
//
// ### Merge rules
//
// - Only merge when properties do not overlap (for example parent has padding, child has gap).
// - Do not merge when both have padding (values would add together).
// - Variable-based values are inherited when merging.
// - Min/max constraints on a removed container are copied onto the survivor (more restrictive
//   wins when both already have a number; an existing variable binding on the survivor is kept).
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Normalize (merge padding + gap when safe)**<br>`normalize` | When on, merges parent padding with child gap when that is safe. |
// | **Process descendants**<br>`recursive` | When on, walks nested containers under the selection. |
// @DOC_END

// @UI_CONFIG_START
var normalize = false;
var recursive = true;
// @UI_CONFIG_END

// @PANEL_START
var __codefigPanel = {
  blocks: [
    { key: "normalize", type: "boolean", label: "Normalize (merge padding + gap when safe)" },
    { key: "recursive", type: "boolean", label: "Process descendants" }
  ]
};
// @PANEL_END

var PADDING_PROPS = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'];
var MIN_MAX_PROPS = ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'];

function isContainer(node) {
  return node && 'children' in node && (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE' || node.type === 'GROUP');
}

function hasLayoutMode(node) {
  return node && 'layoutMode' in node && node.layoutMode !== 'NONE';
}

function isAlive(node) {
  return !!(node && !node.removed);
}

function getNumericValue(node, prop) {
  if (!node || !(prop in node)) return 0;
  var val = node[prop];
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object' && 'resolve' in val) return val.resolve();
  return 0;
}

function hasBoundVariable(node, prop) {
  if (!node || !node.boundVariables) return false;
  var b = node.boundVariables[prop];
  if (Array.isArray(b)) return b.length > 0 && b[0] && b[0].id;
  return b && b.id;
}

function getBoundVariableId(node, prop) {
  if (!node || !node.boundVariables) return null;
  var b = node.boundVariables[prop];
  if (Array.isArray(b) && b[0]) return b[0].id;
  return b && b.id ? b.id : null;
}

function hasConstraint(node, prop) {
  if (!node || !(prop in node)) return false;
  if (hasBoundVariable(node, prop)) return true;
  return typeof node[prop] === 'number';
}

function hasAnyPadding(node) {
  for (var i = 0; i < PADDING_PROPS.length; i++) {
    var v = getNumericValue(node, PADDING_PROPS[i]);
    if (hasBoundVariable(node, PADDING_PROPS[i]) || v !== 0) return true;
  }
  return false;
}

function hasAnySpacing(node) {
  var itemSp = getNumericValue(node, 'itemSpacing');
  if (hasBoundVariable(node, 'itemSpacing') || itemSp !== 0) return true;
  if ('counterAxisSpacing' in node) {
    var cas = getNumericValue(node, 'counterAxisSpacing');
    if (hasBoundVariable(node, 'counterAxisSpacing') || cas !== 0) return true;
  }
  return false;
}

function hasVisibleFills(node) {
  if (!node.fills || !Array.isArray(node.fills)) return false;
  for (var i = 0; i < node.fills.length; i++) {
    var f = node.fills[i];
    if (f && f.visible !== false && f.opacity !== 0) return true;
  }
  return false;
}

function hasVisibleStrokes(node) {
  if (!node.strokes || !Array.isArray(node.strokes)) return false;
  for (var i = 0; i < node.strokes.length; i++) {
    var s = node.strokes[i];
    if (s && s.visible !== false && s.opacity !== 0) return true;
  }
  return false;
}

function hasEffects(node) {
  return node.effects && Array.isArray(node.effects) && node.effects.length > 0;
}

function isRedundantContainer(node) {
  if (!isAlive(node) || !isContainer(node)) return false;
  if (node.children.length !== 1) return false;
  if (hasVisibleFills(node) || hasVisibleStrokes(node) || hasEffects(node)) return false;
  if (hasAnyPadding(node)) return false;
  return true;
}

function uniqueAlive(nodes) {
  var seen = {};
  var out = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (!isAlive(n) || seen[n.id]) continue;
    seen[n.id] = true;
    out.push(n);
  }
  return out;
}

function collectDescendants(nodes) {
  var out = [];
  var stack = uniqueAlive(nodes);
  while (stack.length > 0) {
    var n = stack.pop();
    if (!isAlive(n)) continue;
    out.push(n);
    if (!('children' in n)) continue;
    try {
      var kids = n.children;
      for (var i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    } catch (e) {
      // Node was removed between the alive check and the children read.
    }
  }
  return out;
}

function nodeDepth(node) {
  var d = 0, p = node.parent;
  while (p && p.type !== 'DOCUMENT') { d++; p = p.parent; }
  return d;
}

function sortDeepestFirst(nodes) {
  return nodes.slice().sort(function (a, b) { return nodeDepth(b) - nodeDepth(a); });
}

function isMinProp(prop) {
  return prop === 'minWidth' || prop === 'minHeight';
}

/** Copy min/max from source onto target. More restrictive number wins; target bindings stay. */
async function transferMinMaxAsync(source, target) {
  if (!isAlive(source) || !isAlive(target)) return;
  var varIds = [];
  for (var i = 0; i < MIN_MAX_PROPS.length; i++) {
    var prop = MIN_MAX_PROPS[i];
    if (!(prop in source) || !(prop in target)) continue;
    if (!hasConstraint(source, prop)) continue;

    var sourceBound = getBoundVariableId(source, prop);
    var targetBound = getBoundVariableId(target, prop);
    var sourceNum = typeof source[prop] === 'number' ? source[prop] : null;
    var targetNum = typeof target[prop] === 'number' ? target[prop] : null;
    var targetHas = hasConstraint(target, prop);

    if (targetBound) continue;

    if (!targetHas) {
      if (sourceBound) varIds.push({ prop: prop, id: sourceBound });
      else if (sourceNum !== null) target[prop] = sourceNum;
      continue;
    }

    if (sourceBound) continue;
    if (sourceNum === null || targetNum === null) continue;
    var next = isMinProp(prop) ? Math.max(sourceNum, targetNum) : Math.min(sourceNum, targetNum);
    if (next !== targetNum) target[prop] = next;
  }

  for (var j = 0; j < varIds.length; j++) {
    var v = await figma.variables.getVariableByIdAsync(varIds[j].id);
    if (v && target.setBoundVariable) target.setBoundVariable(varIds[j].prop, v);
  }
}

async function unwrapContainerAsync(container) {
  var parent = container.parent;
  if (!parent || !('children' in container)) return;
  var idx = parent.children.indexOf(container);
  var children = container.children.slice();
  var dx = 'x' in container ? container.x : 0;
  var dy = 'y' in container ? container.y : 0;
  var parentIsAutoLayout = hasLayoutMode(parent);

  if (children.length === 1) await transferMinMaxAsync(container, children[0]);

  for (var i = 0; i < children.length; i++) {
    var c = children[i];
    parent.insertChild(idx + i, c);
    if (parentIsAutoLayout && 'layoutAlign' in container && 'layoutAlign' in c) c.layoutAlign = container.layoutAlign;
    if (parentIsAutoLayout && 'layoutGrow' in container && 'layoutGrow' in c) c.layoutGrow = container.layoutGrow;
    if (parentIsAutoLayout && 'layoutPositioning' in container && 'layoutPositioning' in c) c.layoutPositioning = container.layoutPositioning;
    if (!parentIsAutoLayout && 'x' in c && 'y' in c) {
      c.x = c.x + dx;
      c.y = c.y + dy;
    }
  }
  container.remove();
}

function canMerge(parent, child) {
  if (!isAlive(parent) || !isAlive(child)) return false;
  if (!isContainer(parent) || !isContainer(child)) return false;
  if (parent.children.length !== 1 || parent.children[0] !== child) return false;
  if (child.children.length < 2) return false;
  if (hasVisibleFills(parent) || hasVisibleStrokes(parent) || hasEffects(parent)) return false;

  var parentHasPadding = hasAnyPadding(parent);
  var parentHasSpacing = hasAnySpacing(parent);
  var childHasPadding = hasAnyPadding(child);
  var childHasSpacing = hasAnySpacing(child);

  if (parentHasPadding && childHasPadding) return false;
  if (parentHasSpacing && childHasSpacing) return false;

  var parentIsAL = hasLayoutMode(parent);
  var childIsAL = hasLayoutMode(child);
  if (!parentIsAL || !childIsAL) return false;
  if (parent.layoutMode !== child.layoutMode) return false;

  return (parentHasPadding && !childHasPadding && childHasSpacing) ||
         (parentHasPadding && !childHasPadding && !parentHasSpacing) ||
         (parentHasSpacing && !childHasSpacing && childHasPadding) ||
         (parentHasSpacing && !childHasSpacing && !childHasPadding);
}

function copyLayoutPropSync(source, target, prop) {
  if (!(prop in target)) return;
  var bound = getBoundVariableId(source, prop);
  if (bound) return bound;
  var val = getNumericValue(source, prop);
  target[prop] = val;
  return null;
}

async function mergeContainersAsync(parent, child) {
  // Keep the outer frame: absorb the inner's padding/gap, lift its children, remove the inner.
  // Promoting the inner used to drop a FILL/HUG frame onto the page and delete the selected outer.
  var varIds = [];
  if (hasAnyPadding(child) && !hasAnyPadding(parent)) {
    for (var i = 0; i < PADDING_PROPS.length; i++) {
      var p = PADDING_PROPS[i];
      if (p in child && p in parent) {
        var vid = copyLayoutPropSync(child, parent, p);
        if (vid) varIds.push({ prop: p, id: vid });
      }
    }
  }
  if (hasAnySpacing(child) && !hasAnySpacing(parent) && 'itemSpacing' in parent) {
    var vidSp = copyLayoutPropSync(child, parent, 'itemSpacing');
    if (vidSp) varIds.push({ prop: 'itemSpacing', id: vidSp });
    if ('counterAxisSpacing' in child && 'counterAxisSpacing' in parent)
      copyLayoutPropSync(child, parent, 'counterAxisSpacing');
  }

  for (var j = 0; j < varIds.length; j++) {
    var v = await figma.variables.getVariableByIdAsync(varIds[j].id);
    if (v && parent.setBoundVariable) parent.setBoundVariable(varIds[j].prop, v);
  }

  await transferMinMaxAsync(child, parent);

  var idx = parent.children.indexOf(child);
  var grandkids = child.children.slice();
  for (var g = 0; g < grandkids.length; g++) {
    parent.insertChild(idx + g, grandkids[g]);
  }
  child.remove();
}

function resolveRoots(selection, survivorByRemovedId) {
  var roots = [];
  for (var i = 0; i < selection.length; i++) {
    var n = selection[i];
    if (isAlive(n)) {
      roots.push(n);
      continue;
    }
    var survivor = survivorByRemovedId[n && n.id];
    while (survivor && survivor.removed && survivorByRemovedId[survivor.id]) {
      survivor = survivorByRemovedId[survivor.id];
    }
    if (isAlive(survivor)) roots.push(survivor);
  }
  return uniqueAlive(roots);
}

async function runNormalize(selection) {
  var nodes = recursive ? collectDescendants(selection) : uniqueAlive(selection);
  var toMerge = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (isContainer(n) && n.children.length === 1) {
      var child = n.children[0];
      if (canMerge(n, child)) toMerge.push({ parent: n, child: child });
    }
  }
  var sorted = sortDeepestFirst(toMerge.map(function (x) { return x.parent; }));
  toMerge = [];
  for (var s = 0; s < sorted.length; s++) {
    var p = sorted[s];
    if (isAlive(p) && p.parent && p.children.length === 1 && canMerge(p, p.children[0]))
      toMerge.push({ parent: p, child: p.children[0] });
  }

  var survivorByRemovedId = {};
  for (var k = 0; k < toMerge.length; k++) {
    var pair = toMerge[k];
    if (!isAlive(pair.parent) || !pair.parent.parent || pair.parent.children.length !== 1) continue;
    var survivor = pair.parent;
    var removedId = pair.child.id;
    await mergeContainersAsync(pair.parent, pair.child);
    survivorByRemovedId[removedId] = survivor;
  }

  return runRemove(resolveRoots(selection, survivorByRemovedId));
}

async function runRemove(selection) {
  var nodes = recursive ? collectDescendants(selection) : uniqueAlive(selection);
  var redundant = nodes.filter(isRedundantContainer);
  var targets = sortDeepestFirst(redundant);
  var count = 0;
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (isAlive(t) && t.parent && isRedundantContainer(t)) {
      await unwrapContainerAsync(t);
      count++;
    }
  }
  return count;
}

var sel = figma.currentPage.selection;
if (sel.length === 0) {
  figma.notify('Select at least one node');
} else {
  var work = normalize ? runNormalize(sel) : runRemove(sel);
  work.then(function (count) {
    figma.notify(
      (normalize ? 'Normalized and removed ' : 'Removed ') +
      count + ' redundant container(s)'
    );
  }).catch(function (err) {
    figma.notify('Error: ' + (err && err.message ? err.message : String(err)));
    console.error('remove-unnecessary-nesting:', err);
  });
}
