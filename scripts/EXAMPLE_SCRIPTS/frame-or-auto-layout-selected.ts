// Frame or auto layout selected
// @DOC_START
// # Frame or auto layout selected
// Wrap selection in frame or auto-layout frame, unwrap such frames, or remove auto layout from frames.
//
// ## Overview
// Replaces "Frame all selected", "Auto layout all selected", and "Remove auto layout recursively".
// Choose container type (frame vs auto layout), whether to add or remove it, and recursion for remove.
//
// ## Actions
// - **Wrap in frame**: targets that are not already a frame (e.g. group, shape) get a plain frame wrapper. Frames are left as-is.
// - **Wrap in auto layout**: targets that have layoutMode (frame/component/instance) are converted to auto layout in place using Figma's inferred layout (direction, alignment, spacing) when available, or position-based inference; others are wrapped in a new auto-layout frame.
// - **Remove auto layout**: set layoutMode to NONE (recursive = selection only; recursive on = selection and all descendants).
// - **Unwrap frame**: remove wrapper frames (plain frames without auto layout or fills; always unwrap frames tagged by this script).
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | wrapperType | frame or autoLayout (container kind). |
// | removeSelectedType | false = add/wrap, true = remove/unwrap. |
// | recursively | false = only top-level selection; true = include all descendants (only for Remove). |
// @DOC_END

// @UI_CONFIG_START
// # Frame or auto layout selected
// Action and scope.

var wrapperType = 'frame'; // @options: frame|autoLayout
var removeSelectedType = false;
var recursively = true; // @showWhen: removeSelectedType=true
// @UI_CONFIG_END

var WRAPPER_PLUGIN_KEY = 'codefigWrapper';

function hasBounds(node) {
  return 'x' in node && 'y' in node && 'width' in node && 'height' in node;
}

function isFrameLike(node) {
  return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
}

function collectDescendants(nodes) {
  var out = [];
  function go(n) {
    out.push(n);
    if ('children' in n) {
      for (var i = 0; i < n.children.length; i++) go(n.children[i]);
    }
  }
  for (var i = 0; i < nodes.length; i++) go(nodes[i]);
  return out;
}

function collectCandidates(selection, recursively) {
  var list = recursively ? collectDescendants(selection) : selection.slice();
  return list.filter(hasBounds);
}

function nodeDepth(node) {
  var d = 0;
  var p = node.parent;
  while (p && p.type !== 'DOCUMENT') {
    d++;
    p = p.parent;
  }
  return d;
}

function sortDeepestFirst(nodes) {
  return nodes.slice().sort(function (a, b) { return nodeDepth(b) - nodeDepth(a); });
}

function sortShallowestFirst(nodes) {
  return nodes.slice().sort(function (a, b) { return nodeDepth(a) - nodeDepth(b); });
}

function inferLayoutDirection(node) {
  if (!('children' in node) || node.children.length < 2) return 'HORIZONTAL';
  var children = node.children.filter(hasBounds);
  if (children.length < 2) return 'HORIZONTAL';
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < children.length; i++) {
    var c = children[i];
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x + c.width);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y + c.height);
  }
  var spanX = maxX - minX;
  var spanY = maxY - minY;
  return spanY > spanX ? 'VERTICAL' : 'HORIZONTAL';
}

function applyInferredAutoLayout(node, inferred) {
  if (!inferred || inferred.layoutMode === 'NONE') return false;
  node.layoutMode = inferred.layoutMode;
  if ('primaryAxisSizingMode' in inferred) node.primaryAxisSizingMode = inferred.primaryAxisSizingMode;
  if ('counterAxisSizingMode' in inferred) node.counterAxisSizingMode = inferred.counterAxisSizingMode;
  if ('itemSpacing' in inferred) node.itemSpacing = inferred.itemSpacing;
  if ('paddingLeft' in inferred) node.paddingLeft = inferred.paddingLeft;
  if ('paddingRight' in inferred) node.paddingRight = inferred.paddingRight;
  if ('paddingTop' in inferred) node.paddingTop = inferred.paddingTop;
  if ('paddingBottom' in inferred) node.paddingBottom = inferred.paddingBottom;
  if (inferred.layoutMode === 'HORIZONTAL' && 'layoutWrap' in inferred) node.layoutWrap = inferred.layoutWrap;
  if ('primaryAxisAlignItems' in inferred) node.primaryAxisAlignItems = inferred.primaryAxisAlignItems;
  if ('counterAxisAlignItems' in inferred) node.counterAxisAlignItems = inferred.counterAxisAlignItems;
  if ('strokesIncludedInLayout' in inferred) node.strokesIncludedInLayout = inferred.strokesIncludedInLayout;
  if ('counterAxisSpacing' in inferred && inferred.counterAxisSpacing != null) node.counterAxisSpacing = inferred.counterAxisSpacing;
  return true;
}

function inferItemSpacing(node, direction) {
  if (!('children' in node) || node.children.length < 2) return 8;
  var children = node.children.filter(hasBounds);
  if (children.length < 2) return 8;
  children.sort(function (a, b) { return (direction === 'HORIZONTAL' ? a.x - b.x : a.y - b.y); });
  var gaps = [];
  for (var i = 0; i < children.length - 1; i++) {
    var a = children[i];
    var b = children[i + 1];
    var gap = direction === 'HORIZONTAL' ? (b.x - (a.x + a.width)) : (b.y - (a.y + a.height));
    if (gap >= 0) gaps.push(gap);
  }
  if (gaps.length === 0) return 8;
  var sum = 0;
  for (var j = 0; j < gaps.length; j++) sum += gaps[j];
  return Math.round(sum / gaps.length);
}

function setAutoLayoutProps(node) {
  if (!('layoutMode' in node)) return;
  var alreadyAutoLayout = node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL';
  if (alreadyAutoLayout) return;
  var inferred = 'inferredAutoLayout' in node ? node.inferredAutoLayout : null;
  if (applyInferredAutoLayout(node, inferred)) return;
  var direction = inferLayoutDirection(node);
  node.layoutMode = direction;
  node.counterAxisSizingMode = 'AUTO';
  node.primaryAxisSizingMode = 'AUTO';
  node.itemSpacing = inferItemSpacing(node, direction);
}

function wrapInFrame(target, isAutoLayout) {
  var parent = target.parent;
  if (!parent) return;
  var indexInParent = parent.children.indexOf(target);
  var frame = figma.createFrame();
  frame.resizeWithoutConstraints(target.width, target.height);
  frame.x = target.x;
  frame.y = target.y;
  frame.fills = [];
  if (isAutoLayout) {
    frame.layoutMode = 'HORIZONTAL';
    frame.counterAxisSizingMode = 'AUTO';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.itemSpacing = 8;
    frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom = 0;
    frame.setPluginData(WRAPPER_PLUGIN_KEY, 'autoLayout');
  } else {
    frame.layoutMode = 'NONE';
    frame.setPluginData(WRAPPER_PLUGIN_KEY, 'frame');
  }
  if ('layoutAlign' in target && 'layoutAlign' in frame) frame.layoutAlign = target.layoutAlign;
  if ('layoutGrow' in target && 'layoutGrow' in frame) frame.layoutGrow = target.layoutGrow;
  if ('layoutPositioning' in target && 'layoutPositioning' in frame) frame.layoutPositioning = target.layoutPositioning;
  parent.insertChild(indexInParent, frame);
  frame.appendChild(target);
  target.x = 0;
  target.y = 0;
}

function unwrapFrame(frame) {
  var parent = frame.parent;
  if (!parent || !('children' in frame)) return;
  var indexInParent = parent.children.indexOf(frame);
  var children = frame.children.slice();
  var dx = frame.x;
  var dy = frame.y;
  var parentIsAutoLayout = 'layoutMode' in parent && parent.layoutMode !== 'NONE';
  for (var i = 0; i < children.length; i++) {
    var c = children[i];
    parent.insertChild(indexInParent + i, c);
    if (parentIsAutoLayout && 'layoutAlign' in frame && 'layoutAlign' in c) c.layoutAlign = frame.layoutAlign;
    if (parentIsAutoLayout && 'layoutGrow' in frame && 'layoutGrow' in c) c.layoutGrow = frame.layoutGrow;
    if (parentIsAutoLayout && 'layoutPositioning' in frame && 'layoutPositioning' in c) c.layoutPositioning = frame.layoutPositioning;
    if (!parentIsAutoLayout && hasBounds(c)) {
      c.x = c.x + dx;
      c.y = c.y + dy;
    }
  }
  frame.remove();
}

function canUnwrap(frame) {
  var tag = frame.getPluginData(WRAPPER_PLUGIN_KEY);
  if (tag === 'frame' || tag === 'autoLayout') return true;
  if ('layoutMode' in frame && frame.layoutMode !== 'NONE') return false;
  if (frame.fills && frame.fills.length > 0) return false;
  return true;
}

function removeAutoLayoutFromNode(node) {
  if (!hasBounds(node) || !('layoutMode' in node) || node.layoutMode === 'NONE') return;
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return;
  if (node.layoutMode === 'HORIZONTAL' && 'layoutWrap' in node && node.layoutWrap === 'WRAP' && 'children' in node) {
    var children = node.children.slice();
    var saved = [];
    for (var c = 0; c < children.length; c++) {
      var child = children[c];
      if (hasBounds(child)) saved.push({ node: child, x: child.x, y: child.y });
    }
    node.layoutWrap = 'NO_WRAP';
    node.layoutMode = 'NONE';
    for (var s = 0; s < saved.length; s++) {
      saved[s].node.x = saved[s].x;
      saved[s].node.y = saved[s].y;
    }
  } else {
    node.layoutMode = 'NONE';
  }
}

function removeAutoLayoutRecursive(nodes) {
  var all = collectDescendants(nodes);
  var withLayout = all.filter(function (n) {
    return hasBounds(n) && 'layoutMode' in n && n.layoutMode !== 'NONE';
  });
  var sorted = sortShallowestFirst(withLayout);
  for (var i = 0; i < sorted.length; i++) {
    removeAutoLayoutFromNode(sorted[i]);
  }
}

// --- Run

var sel = figma.currentPage.selection;
if (sel.length === 0) {
  figma.notify('Select at least one node');
} else {
  var action = wrapperType === 'frame' && !removeSelectedType ? 'wrapFrame' :
               wrapperType === 'frame' && removeSelectedType ? 'unwrapFrame' :
               wrapperType === 'autoLayout' && !removeSelectedType ? 'wrapAutoLayout' : 'removeAutoLayout';
  var useRecursive = (action === 'unwrapFrame') ? true : (removeSelectedType ? recursively : false);
  var candidates = collectCandidates(sel, useRecursive);

  if (action === 'removeAutoLayout') {
    if (recursively) {
      removeAutoLayoutRecursive(sel);
    } else {
      for (var r = 0; r < sel.length; r++) {
        removeAutoLayoutFromNode(sel[r]);
      }
    }
    figma.notify('Removed auto layout from selection' + (recursively ? ' (recursive)' : ''));
  } else {
    var targets;
    if (action === 'wrapFrame' || action === 'wrapAutoLayout') {
      targets = sortDeepestFirst(candidates);
    } else if (action === 'unwrapFrame') {
      targets = candidates.filter(function (n) { return n.type === 'FRAME' && canUnwrap(n); });
      targets = sortDeepestFirst(targets);
    } else {
      targets = candidates;
    }
    var count = 0;
    for (var j = 0; j < targets.length; j++) {
      var target = targets[j];
      if (action === 'wrapFrame') {
        if (isFrameLike(target)) { /* already a frame, skip */ } else { wrapInFrame(target, false); count++; }
      } else if (action === 'wrapAutoLayout') {
        if ('layoutMode' in target) {
          setAutoLayoutProps(target);
          count++;
        } else {
          wrapInFrame(target, true);
          count++;
        }
      } else if (action === 'unwrapFrame') {
        unwrapFrame(target);
        count++;
      }
    }
    if (action === 'wrapFrame') figma.notify('Framed ' + count + ' item(s)');
    else if (action === 'wrapAutoLayout') figma.notify('Added auto layout to ' + count + ' item(s)');
    else if (action === 'unwrapFrame') figma.notify('Unwrapped ' + count + ' frame(s)');
  }
}
