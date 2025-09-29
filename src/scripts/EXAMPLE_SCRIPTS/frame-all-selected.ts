// ✅ Frame all selected
// Wraps each selected node in a frame

figma.currentPage.selection.forEach(function(node) {
  var parent = node.parent;
  if (!("x" in node && "y" in node && "width" in node && "height" in node)) return;

  var frame = figma.createFrame();
  frame.resizeWithoutConstraints(node.width, node.height);
  frame.x = node.x;
  frame.y = node.y;
  frame.layoutMode = "NONE"; // avoid auto-layout interference
  frame.fills = []; // transparent background

  parent.appendChild(frame); // add frame before moving node
  frame.appendChild(node);   // move node into frame

  node.x = 0;
  node.y = 0;
});

figma.notify('Framed ' + figma.currentPage.selection.length + ' items');
