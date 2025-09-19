// CODEFIG - HELP & DOCUMENTATION
// Welcome to CodeFig! Your TypeScript-powered Figma scripting environment.

// === GETTING STARTED ===
// 1. Browse "Example Scripts" in the sidebar for ready-to-use scripts
// 2. Click "New Script" to create your own custom script
// 3. Write TypeScript or JavaScript code in the editor
// 4. Click "Run" or press Cmd/Ctrl+R to execute
// 5. Save your scripts for future use

// === KEYBOARD SHORTCUTS ===
// 🔍 Cmd/Ctrl + /: Search scripts (focus search bar)
// ▶️ Cmd/Ctrl + R: Run current script
// 💾 Cmd/Ctrl + S: Save current script
// ⤵️ Cmd/Ctrl + E: Export current script as JSON file
// ⤴️ Cmd/Ctrl + I: Import script from JSON file
// ➕ Cmd/Ctrl + N: Create new script

// === TYPESCRIPT SUPPORT ===
// ✨ This plugin supports TypeScript natively!
// Write modern TypeScript with full type safety:
// - Type annotations: node: TextNode, variable: Variable
// - Non-null assertions: indexInParent!
// - Interface definitions and generics
// - All modern TypeScript features
// - Auto-completion and error checking

// === AVAILABLE APIs ===
// - figma: Full Figma API (with TypeScript types!)
// - selection: Current selection (auto-available)
// - currentPage: Current page (auto-available)
// - variables: Variables API (figma.variables)
// - styles: Styles API (paint, text, effect, grid)

// === SCRIPT MANAGEMENT ===
// 📁 Example Scripts: Pre-built scripts for common tasks
// 📝 User Scripts: Your custom saved scripts
// 🔄 Figcode remember your last opened script
// 📤 Export/Import: Share scripts as JSON files
// ✏️ Rename: Click script titles to rename (user scripts only)

// === COMMON PATTERNS ===
// Get data:
// figma.variables.getLocalVariables() - Get all variables
// figma.variables.getLocalVariableCollections() - Get collections
// figma.getLocalTextStyles() - Get text styles
// figma.getLocalPaintStyles() - Get paint styles

// Interact with user:
// figma.notify('message') - Show notification
// console.log(...args) - Log to console (check dev tools)

// Work with selection:
// selection.forEach(node => { ... }) - Process each selected node
// selection.length - Number of selected items

// === VARIABLE OPERATIONS ===
// Get variable by name (with TypeScript):
const variable = figma.variables.getLocalVariables()
  .find(v => v.name === 'typography/scale/lg/font-size');

// Bind variable to node property:
if (variable) {
  selection.forEach((node: TextNode) => {
    if (node.type === 'TEXT') {
      node.setBoundVariable('fontSize', variable);
    }
  });
}

// === TIPS & TRICKS ===
// 🔍 Use search (Cmd//) to quickly find scripts
// 💡 Check Example Scripts for inspiration and ready-to-use code
// 🐛 Use console.log() and check browser dev tools for debugging
// 📋 Copy useful code snippets from examples to your scripts
// 🔄 Scripts auto-save your progress - no need to worry about losing work
// 📱 Use figma.notify() instead of alert() for better UX

// === EXAMPLE: TypeScript-powered variable listing ===
const variables = figma.variables.getLocalVariables();
console.log('Variables found:', variables.length);
variables.forEach((v: Variable) => console.log(`- ${v.name} (${v.resolvedType})`));
figma.notify(`Found ${variables.length} variables`);

// === QUICK START EXAMPLES ===
// Select all text nodes:
// const textNodes = currentPage.findAll(node => node.type === 'TEXT');

// Get current selection info:
// console.log(`Selected ${selection.length} items`);
// selection.forEach(node => console.log(`- ${node.name} (${node.type})`));

// Create a simple frame:
// const frame = figma.createFrame();
// frame.name = 'My Frame';
// frame.resize(200, 100);
// currentPage.appendChild(frame);

// 🎉 Ready to start scripting? Check out the Example Scripts!
