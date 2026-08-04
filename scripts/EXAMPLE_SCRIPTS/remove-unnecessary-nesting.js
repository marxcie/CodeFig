// Remove unnecessary nesting
// @DOC_START
// # Remove unnecessary nesting
// Removes or merges nesting containers (frames, auto layouts) that have no effect on their children.
//
// ## Overview
// Targets frames, auto layouts, and groups that are redundant: single child, no padding, no gap (or gap irrelevant with one child). Optionally **normalizes** by merging parent and child when one has padding and the other has gap—combining properties onto one container.
//
// ## Actions
// - **Remove**: Unwrap containers that do nothing (single child, no padding, no effective spacing).
// - **Normalize** (optional): When parent has padding and only one child, and that child has gap but no padding, merge padding + gap onto the inner container and remove the outer one. Variable bindings are preserved.
//
// ## Merge rules
// - Only merge when properties don't overlap: e.g. parent has padding, child has gap → safe.
// - Do NOT merge when both have padding (values would add together).
// - Variable-based values are inherited when merging.
// @DOC_END

// @UI_CONFIG_START
// # Remove unnecessary nesting
var normalize = false; // @label: Normalize (merge padding + gap when safe)
var recursive = true; // @label: Process descendants
// @UI_CONFIG_END

var PADDING_PROPS = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'];

function isContainer(node) {
  return node && 'children' in node && (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE' || node.type === 'GROUP');
}

function hasLayoutMode(node) {
  return node && 'layoutMode' in node && node.layoutMode !== 'NONE';
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
  if (!isContainer(node)) return false;
  if (node.children.length !== 1) return false;
  if (hasVisibleFills(node) || hasVisibleStrokes(node) || hasEffects(node)) return false;
  if (hasAnyPadding(node)) return false;
  return true;
}

function collectDescendants(nodes) {
  var out = [];
  var stack = nodes.slice();
  while (stack.length > 0) {
    var n = stack.pop();
    out.push(n);
    if ('children' in n) {
      for (var i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
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

function unwrapContainer(container) {
  var parent = container.parent;
  if (!parent || !('children' in container)) return;
  var idx = parent.children.indexOf(container);
  var children = container.children.slice();
  var dx = 'x' in container ? container.x : 0;
  var dy = 'y' in container ? container.y : 0;
  var parentIsAutoLayout = hasLayoutMode(parent);
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
  var varIds = [];
  if (hasAnyPadding(parent)) {
    for (var i = 0; i < PADDING_PROPS.length; i++) {
      var p = PADDING_PROPS[i];
      if (p in child && p in parent) {
        var vid = copyLayoutPropSync(parent, child, p);
        if (vid) varIds.push({ prop: p, id: vid });
      }
    }
  }
  if (hasAnySpacing(parent) && !hasAnySpacing(child) && 'itemSpacing' in child) {
    var vid = copyLayoutPropSync(parent, child, 'itemSpacing');
    if (vid) varIds.push({ prop: 'itemSpacing', id: vid });
    if ('counterAxisSpacing' in parent && 'counterAxisSpacing' in child)
      copyLayoutPropSync(parent, child, 'counterAxisSpacing');
  }

  for (var j = 0; j < varIds.length; j++) {
    var v = await figma.variables.getVariableByIdAsync(varIds[j].id);
    if (v && child.setBoundVariable) child.setBoundVariable(varIds[j].prop, v);
  }

  var grandparent = parent.parent;
  if (!grandparent) return;
  var idx = grandparent.children.indexOf(parent);
  if (hasLayoutMode(grandparent) && 'layoutAlign' in parent && 'layoutAlign' in child) {
    child.layoutAlign = parent.layoutAlign;
    if ('layoutGrow' in parent && 'layoutGrow' in child) child.layoutGrow = parent.layoutGrow;
    if ('layoutPositioning' in parent && 'layoutPositioning' in child) child.layoutPositioning = parent.layoutPositioning;
  }
  grandparent.insertChild(idx, child);
  parent.remove();
}

async function runNormalize(selection) {
  var nodes = recursive ? collectDescendants(selection) : selection.slice();
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
    if (p.parent && p.children.length === 1 && canMerge(p, p.children[0]))
      toMerge.push({ parent: p, child: p.children[0] });
  }

  for (var k = 0; k < toMerge.length; k++) {
    var pair = toMerge[k];
    if (!pair.parent.parent || pair.parent.children.length !== 1) continue;
    await mergeContainersAsync(pair.parent, pair.child);
  }

  return runRemove(selection);
}

function runRemove(selection) {
  var nodes = recursive ? collectDescendants(selection) : selection.slice();
  var redundant = nodes.filter(isRedundantContainer);
  var targets = sortDeepestFirst(redundant);
  var count = 0;
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (t.parent && isRedundantContainer(t)) {
      unwrapContainer(t);
      count++;
    }
  }
  return count;
}

var sel = figma.currentPage.selection;
if (sel.length === 0) {
  figma.notify('Select at least one node');
} else {
  try {
    if (normalize) {
      runNormalize(sel).then(function (count) {
        figma.notify('Normalized and removed ' + count + ' redundant container(s)');
      }).catch(function (err) {
        figma.notify('Error: ' + (err && err.message ? err.message : String(err)));
        console.error('remove-unnecessary-nesting:', err);
      });
    } else {
      var count = runRemove(sel);
      figma.notify('Removed ' + count + ' redundant container(s)');
    }
  } catch (err) {
    figma.notify('Error: ' + (err && err.message ? err.message : String(err)));
    console.error('remove-unnecessary-nesting:', err);
  }
}
