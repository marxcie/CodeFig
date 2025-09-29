// ✅ Detach styles
// Configuration - change these to control what gets detached
var detachFonts = true;    // Detach text styles
var detachFills = false;   // Detach fill styles
var detachStrokes = false; // Detach stroke styles
var detachEffects = false; // Detach effect styles
var detachGrids = false;   // Detach grid styles

function detachStyles(node) {
  // Detach text style if node is text and option enabled
  if (detachFonts && node.type === "TEXT" && "textStyleId" in node) {
    if (node.textStyleId) {
      node.textStyleId = ""; // Remove link to text style
      console.log("Detached font style from: " + node.name);
    }
  }

  // Detach fill style
  if (detachFills && "fillStyleId" in node) {
    if (node.fillStyleId) {
      node.fillStyleId = "";
      console.log("Detached fill style from: " + node.name);
    }
  }

  // Detach stroke style
  if (detachStrokes && "strokeStyleId" in node) {
    if (node.strokeStyleId) {
      node.strokeStyleId = "";
      console.log("Detached stroke style from: " + node.name);
    }
  }

  // Detach effect style (e.g., shadows)
  if (detachEffects && "effectStyleId" in node) {
    if (node.effectStyleId) {
      node.effectStyleId = "";
      console.log("Detached effect style from: " + node.name);
    }
  }

  // Detach grid style (only frames)
  if (detachGrids && "gridStyleId" in node) {
    if (node.gridStyleId) {
      node.gridStyleId = "";
      console.log("Detached grid style from: " + node.name);
    }
  }

  // Traverse children if any
  if ("children" in node) {
    node.children.forEach(detachStyles);
  }
}

// Apply to all selected nodes
figma.currentPage.selection.forEach(detachStyles);
figma.notify('Detached styles from selection');
