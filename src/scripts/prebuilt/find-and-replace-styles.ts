// FIND AND REPLACE LOCAL STYLES
const findPrefix = "V2/";
const replacePrefix = "V3/";

const styles = figma.getLocalTextStyles();

function swapTextStyles(node: TextNode) {
  const length = node.characters.length;

  for (let i = 0; i < length; i++) {
    const currentStyleId = node.getRangeTextStyleId(i, i + 1);

    if (typeof currentStyleId === "string") {
      const currentStyle = styles.find(s => s.id === currentStyleId);
      if (currentStyle && currentStyle.name.startsWith(findPrefix)) {
        const targetName = currentStyle.name.replace(findPrefix, replacePrefix);
        const newStyle = styles.find(s => s.name === targetName);
        if (newStyle) {
          node.setRangeTextStyleId(i, i + 1, newStyle.id);
        }
      }
    }
  }
}

figma.currentPage.selection.forEach(node => {
  if (node.type === "TEXT") swapTextStyles(node as TextNode);
  
  // Also check children recursively
  if ("children" in node) {
    node.findAll(n => n.type === "TEXT").forEach(textNode => swapTextStyles(textNode as TextNode));
  }
});

figma.notify('Replaced text styles in selection');
