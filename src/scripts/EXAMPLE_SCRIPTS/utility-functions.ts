// Utility functions
// Collection of helpful utility functions for Figma scripting

// === GEOMETRY UTILITIES ===
function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function center(node: { x: number; y: number; width: number; height: number }) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  };
}

function bounds(nodes: Array<{ x: number; y: number; width: number; height: number }>) {
  if (nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

// === NODE UTILITIES ===
function findByName(name: string, parent: BaseNode & ChildrenMixin = figma.currentPage) {
  return parent.findOne(node => node.name === name);
}

function findAllByName(name: string, parent: BaseNode & ChildrenMixin = figma.currentPage) {
  return parent.findAll(node => node.name === name);
}

function findByType(type: NodeType, parent: BaseNode & ChildrenMixin = figma.currentPage) {
  return parent.findAll(node => node.type === type);
}

function clone(node: SceneNode, parent: BaseNode & ChildrenMixin = node.parent as BaseNode & ChildrenMixin) {
  const cloned = node.clone();
  if (parent) parent.appendChild(cloned);
  return cloned;
}

// === VARIABLE UTILITIES ===
function getVariableByName(name: string) {
  return figma.variables.getLocalVariables().find(v => v.name === name);
}

function getVariablesByPattern(pattern: string) {
  const regex = new RegExp(pattern);
  return figma.variables.getLocalVariables().filter(v => regex.test(v.name));
}

function bindVariable(node: any, property: string, variableName: string) {
  const variable = getVariableByName(variableName);
  if (variable) {
    node.setBoundVariable(property, variable);
    return true;
  }
  return false;
}

// === STYLE UTILITIES ===
function getStyleByName(name: string, type: 'TEXT' | 'PAINT' = 'TEXT') {
  const styles = type === 'TEXT' ? figma.getLocalTextStyles() : figma.getLocalPaintStyles();
  return styles.find(s => s.name === name);
}

function applyTextStyle(node: TextNode, styleName: string) {
  if (node.type !== 'TEXT') return false;
  const style = getStyleByName(styleName, 'TEXT') as TextStyle;
  if (style) {
    node.textStyleId = style.id;
    return true;
  }
  return false;
}

// === ARRAY UTILITIES ===
function groupBy<T>(array: T[], keyFn: (item: T) => string) {
  return array.reduce((groups: Record<string, T[]>, item) => {
    const key = keyFn(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function unique<T>(array: T[], keyFn: (item: T) => any = item => item) {
  const seen = new Set();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// === EXAMPLE USAGE ===
console.log('Utility functions loaded!');
console.log('Try: findByName("My Frame"), getVariableByName("spacing/lg"), etc.');
figma.notify('Utility functions ready to use');
