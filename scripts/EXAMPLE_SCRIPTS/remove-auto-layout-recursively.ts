// Remove auto layout recursively
// @DOC_START
// # Remove auto layout recursively
// Turns off auto layout on selected nodes and all descendants.
//
// ## Overview
// Sets layoutMode to NONE on each selected node and every child that has a layout mode. No configuration; run on selection.
// @DOC_END

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
