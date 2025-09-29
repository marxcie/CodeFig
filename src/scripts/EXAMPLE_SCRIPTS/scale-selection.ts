// ✅ Scale elements in selection
var scaleFactor = 0.8; // Change this to any factor you want

function scaleIndividually(node) {
  if ("children" in node) {
    node.children.forEach(function(child) {
      scaleIndividually(child);
    });
  }

  if ("resize" in node && "absoluteTransform" in node && node.type !== "GROUP") {
    var bbox = node.absoluteBoundingBox;
    if (!bbox) return;

    var centerX = bbox.x + bbox.width / 2;
    var centerY = bbox.y + bbox.height / 2;

    var newWidth = node.width * scaleFactor;
    var newHeight = node.height * scaleFactor;

    var dx = (newWidth - node.width) / 2;
    var dy = (newHeight - node.height) / 2;

    node.resize(newWidth, newHeight);
    node.x -= dx;
    node.y -= dy;
  }
}

figma.currentPage.selection.forEach(function(node) {
  scaleIndividually(node);
});
figma.notify('Scaled ' + figma.currentPage.selection.length + ' items by ' + scaleFactor + 'x');
