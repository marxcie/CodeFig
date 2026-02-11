// Frame or auto layout selected
// @DOC_START
// # Frame or auto layout selected
// Wrap selection in frame or auto-layout frame, unwrap such frames, or remove auto layout from frames.
//
// ## Overview
// Replaces "Frame all selected", "Auto layout all selected", and "Remove auto layout recursively".
// Choose container type (frame vs auto layout), whether to add or remove it, recursion, and which node types to target.
//
// ## Actions
// - **Wrap in frame**: targets that are not already a frame (e.g. group, shape) get a plain frame wrapper. Frames are left as-is.
// - **Wrap in auto layout**: targets that have layoutMode (frame/component/instance) are converted to auto layout in place; others are wrapped in a new auto-layout frame.
// - **Remove auto layout**: set layoutMode to NONE (recursive = selection only; recursive on = selection and all descendants).
// - **Unwrap frame**: remove wrapper frames (prefer those tagged by this script; optional fallback for single-child empty frames).
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | selectedType | frame or autoLayout (container kind). |
// | removeSelectedType | false = add/wrap, true = remove/unwrap. |
// | recursively | false = only top-level selection; true = include all descendants. |
// | frames, groups, otherNodes | Filtering: which node types to include as targets. |
// @DOC_END

// @UI_CONFIG_START
// # Frame or auto layout selected
// Action and scope.

var selectedType = 'frame'; // @options: frame|autoLayout
var removeSelectedType = false;
var recursively = true;
//
// ---
//
// ## Filtering
var frames = true;
var groups = true;
var otherNodes = false;
// @UI_CONFIG_END

var WRAPPER_PLUGIN_KEY = 'codefigWrapper';

function hasBounds(node) {
  return 'x' in node && 'y' in node && 'width' in node && 'height' in node;
}

function isFrameLike(node) {
  return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
}

function matchesFilter(node, opts) {
  if (!hasBounds(node)) return false;
  if (opts.frames && isFrameLike(node)) return true;
  if (opts.groups && node.type === 'GROUP') return true;
  if (opts.otherNodes && !isFrameLike(node) && node.type !== 'GROUP') return true;
  return false;
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

function collectCandidates(selection, recursively, opts) {
  var list = recursively ? collectDescendants(selection) : selection.slice();
  return list.filter(function (node) { return matchesFilter(node, opts); });
}

function topMostOnly(candidates) {
  var idSet = new Set();
  for (var i = 0; i < candidates.length; i++) idSet.add(candidates[i].id);
  return candidates.filter(function (node) {
    var p = node.parent;
    while (p && p.type !== 'DOCUMENT') {
      if (idSet.has(p.id)) return false;
      p = p.parent;
    }
    return true;
  });
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

function setAutoLayoutProps(node) {
  if (!('layoutMode' in node)) return;
  var alreadyAutoLayout = node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL';
  if (alreadyAutoLayout) return;
  node.layoutMode = 'HORIZONTAL';
  node.counterAxisSizingMode = 'AUTO';
  node.primaryAxisSizingMode = 'AUTO';
  node.itemSpacing = 8;
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
  if (frame.children.length !== 1) return false;
  if (('layoutMode' in frame && frame.layoutMode !== 'NONE')) return false;
  if (frame.fills && frame.fills.length > 0) return false;
  return true;
}

function removeAutoLayoutRecursive(nodes, opts) {
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (matchesFilter(n, opts) && 'layoutMode' in n && n.layoutMode !== 'NONE') {
      n.layoutMode = 'NONE';
    }
    if ('children' in n) removeAutoLayoutRecursive(n.children, opts);
  }
}

// --- Run

var sel = figma.currentPage.selection;
if (sel.length === 0) {
  figma.notify('Select at least one node');
} else {
  var opts = { frames: frames, groups: groups, otherNodes: otherNodes };
  var candidates = collectCandidates(sel, recursively, opts);
  var action = selectedType === 'frame' && !removeSelectedType ? 'wrapFrame' :
               selectedType === 'frame' && removeSelectedType ? 'unwrapFrame' :
               selectedType === 'autoLayout' && !removeSelectedType ? 'wrapAutoLayout' : 'removeAutoLayout';

  if (action === 'removeAutoLayout') {
    if (recursively) {
      removeAutoLayoutRecursive(sel, opts);
    } else {
      for (var r = 0; r < sel.length; r++) {
        var n = sel[r];
        if (matchesFilter(n, opts) && 'layoutMode' in n && n.layoutMode !== 'NONE') {
          n.layoutMode = 'NONE';
        }
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
