// Scale every element in selection
const scaleFactor = 0.8; // Change this to any factor you want

function scaleIndividually(node: SceneNode) {
  if ("children" in node) {
    node.children.forEach(scaleIndividually);
  }

  if ("resize" in node && "absoluteTransform" in node && node.type !== "GROUP") {
    const bbox = node.absoluteBoundingBox;
    if (!bbox) return;

    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;

    const newWidth = node.width * scaleFactor;
    const newHeight = node.height * scaleFactor;

    const dx = (newWidth - node.width) / 2;
    const dy = (newHeight - node.height) / 2;

    node.resize(newWidth, newHeight);
    node.x -= dx;
    node.y -= dy;
  }
}

figma.currentPage.selection.forEach(scaleIndividually);
figma.notify(`Scaled ${figma.currentPage.selection.length} items by ${scaleFactor}x`);
