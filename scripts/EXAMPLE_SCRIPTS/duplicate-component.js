// Duplicate component
// @DOC_START
// # Duplicates selected components and component sets beside the originals
//
// ## Overview
//
// Select one or more **components** or **component sets**, then Run. Each gets a new
// definition (not an instance) as a sibling of the original, placed to its right with a
// fixed gap. Variants selected inside a set become new variants in that set.
//
// Instances and other layer types in the selection are skipped. The new nodes become the
// selection when the run finishes.
// @DOC_END

var GAP = 40;

function isComponentLike(node) {
  return node && (node.type === "COMPONENT" || node.type === "COMPONENT_SET");
}

function parentIsAutoLayout(parent) {
  return !!(parent && "layoutMode" in parent && parent.layoutMode && parent.layoutMode !== "NONE");
}

function duplicateBeside(node) {
  var parent = node.parent;
  if (!parent || !("insertChild" in parent)) {
    throw new Error("Cannot place a duplicate of \"" + node.name + "\" (no parent)");
  }
  var index = parent.children.indexOf(node);
  if (index < 0) {
    throw new Error("Cannot place a duplicate of \"" + node.name + "\" (not in parent)");
  }
  var clone = node.clone();
  parent.insertChild(index + 1, clone);
  if (!parentIsAutoLayout(parent) && "x" in clone && "x" in node) {
    clone.x = node.x + node.width + GAP;
    clone.y = node.y;
  }
  return clone;
}

(function main() {
  var selection = figma.currentPage.selection;
  if (!selection || selection.length === 0) {
    figma.notify("Select one or more components");
    return;
  }

  var targets = [];
  for (var i = 0; i < selection.length; i++) {
    if (isComponentLike(selection[i])) targets.push(selection[i]);
  }

  if (targets.length === 0) {
    figma.notify("Selection has no components or component sets");
    return;
  }

  var created = [];
  var failed = 0;
  for (var t = 0; t < targets.length; t++) {
    try {
      created.push(duplicateBeside(targets[t]));
    } catch (err) {
      failed++;
      console.error(err);
    }
  }

  if (created.length > 0) {
    figma.currentPage.selection = created;
    figma.viewport.scrollAndZoomIntoView(created);
  }

  if (created.length === 0) {
    figma.notify("Could not duplicate any components");
  } else if (failed > 0) {
    figma.notify("Duplicated " + created.length + ", skipped " + failed);
  } else if (created.length === 1) {
    figma.notify("Duplicated \"" + created[0].name + "\"");
  } else {
    figma.notify("Duplicated " + created.length + " components");
  }
})();
