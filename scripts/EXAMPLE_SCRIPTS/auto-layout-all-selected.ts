// Auto layout all selected
// @DOC_START
// # Auto layout all selected
// Wraps each selected node in its own auto layout frame.
//
// ## Overview
// For every selected node, creates a new horizontal auto layout frame, places it at the same position and size as the node, then moves the node inside the frame. No configuration; run on selection.
// @DOC_END

figma.currentPage.selection.forEach(function(node) {
  if (!("x" in node && "y" in node && "width" in node && "height" in node)) return;

  var parent = node.parent;
  var indexInParent = parent && parent.children.indexOf(node);

  // Create an individual auto layout frame
  var frame = figma.createFrame();
  frame.layoutMode = "HORIZONTAL"; // or "VERTICAL"
  frame.counterAxisSizingMode = "AUTO";
  frame.primaryAxisSizingMode = "AUTO";
  frame.itemSpacing = 8;
  frame.paddingLeft = 0;
  frame.paddingRight = 0;
  frame.paddingTop = 0;
  frame.paddingBottom = 0;
  frame.fills = [];

  // Position and size it like the original node
  frame.resizeWithoutConstraints(node.width, node.height);
  frame.x = node.x;
  frame.y = node.y;

  // Add the frame to the parent at the correct index
  if (parent) {
    parent.insertChild(indexInParent, frame);
  }

  // Move the node inside the frame
  frame.appendChild(node);
  node.x = 0;
  node.y = 0;
});

figma.notify("Added auto layout to " + figma.currentPage.selection.length + " items");
