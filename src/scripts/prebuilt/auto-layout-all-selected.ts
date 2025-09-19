// AUTO LAYOUT ALL SELECTED
// Wraps each selected node in its own auto layout frame

figma.currentPage.selection.forEach(node => {
  if (!("x" in node && "y" in node && "width" in node && "height" in node)) return;

  const parent = node.parent;
  const indexInParent = parent?.children.indexOf(node);

  // Create an individual auto layout frame
  const frame = figma.createFrame();
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
    parent.insertChild(indexInParent!, frame);
  }

  // Move the node inside the frame
  frame.appendChild(node);
  node.x = 0;
  node.y = 0;
});

figma.notify(`Added auto layout to ${figma.currentPage.selection.length} items`);
