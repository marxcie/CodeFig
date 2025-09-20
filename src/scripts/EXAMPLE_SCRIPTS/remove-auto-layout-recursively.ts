// Remove auto layout recursively
// Removes auto layout from selected nodes and all children

function removeAutoLayout(node) {
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    node.layoutMode = "NONE"; // remove auto layout
    console.log("Removed Auto Layout from: " + node.name);
  }

  if ("children" in node) {
    node.children.forEach(removeAutoLayout);
  }
}

// Apply to all selected nodes
figma.currentPage.selection.forEach(removeAutoLayout);
figma.notify('Removed auto layout from selection');
