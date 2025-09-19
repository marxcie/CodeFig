<div align="center">
  <img src="icon-16x16@512px.png" alt="CodeFig Icon" width="64" height="64">
  <h1>CodeFig</h1>
  <p><em>A powerful Figma plugin for running TypeScript/JavaScript scripts with advanced variable management capabilities, built for modern design systems and enterprise environments.</em></p>
</div>

## 🎯 What is CodeFig?

**CodeFig** is a script automation plugin for Figma, inspired by the beloved [Scripter plugin](https://www.figma.com/community/plugin/757836922707087381/Scripter) by **@rsms**. While Scripter pioneered script-based Figma automation, CodeFig was built from the ground up to address modern needs like **Figma Variables**, **design systems**, and **enterprise requirements**.

### Why CodeFig vs Original Scripter?

**Original Scripter** by @rsms is fantastic and pioneered the concept of script-based Figma automation. CodeFig was inspired by this vision but built independently to add capabilities that weren't possible when Scripter was created:

- 🆕 **Native Variable Support** - Built-in tools for managing Figma Variables
- 🏢 **Enterprise-Ready** - No network access required, passes security audits
- 📘 **TypeScript First** - Full type safety and modern development experience
- 🎨 **Design System Focus** - Tools specifically for design token workflows
- 🔄 **Variable Binding Management** - Replace, inspect, and manage variable connections
- 📋 **Organized Scripts** - Better script management and organization

**Use Original Scripter if:** You need a simple, lightweight script runner
**Use CodeFig if:** You work with Variables, design systems, or enterprise environments

## 🏢 Enterprise-Ready

This plugin is designed for enterprise environments and **requires no network access**:

- ✅ **No CDN dependencies** - All assets are bundled locally
- ✅ **`"networkAccess": "none"`** explicitly set in manifest
- ✅ **No external API calls** - Everything runs locally
- ✅ **Offline-first** - Works without internet connection

Perfect for companies with strict security policies!

## ✨ Features

### 🔧 Core Capabilities
- **Native TypeScript Support** - Write scripts with full type safety and IntelliSense
- **Professional Code Editor** - Syntax highlighting, auto-completion, error detection
- **Script Organization** - Organized into categories with search functionality
- **Import/Export** - Share individual scripts or entire script libraries
- **Keyboard Shortcuts** - Efficient workflow with Cmd/Ctrl shortcuts

### 🎨 Variable Management (Unique to CodeFig)
- **Variable Binding Replacement** - Replace variable connections across selections
- **Pattern-Based Updates** - Update "lg" to "xl" across all connected variables
- **Collection Management** - Duplicate collections with all metadata intact
- **Variable Inspection** - Debug and analyze variable connections
- **Broken Variable Detection** - Find and fix orphaned variables

### 🏗️ Design System Tools
- **Style Management** - Rename, replace, and organize styles systematically  
- **Token Migration** - Migrate design tokens between naming conventions
- **Bulk Operations** - Apply changes across hundreds of components at once
- **Auto Layout Tools** - Advanced layout automation scripts
- **Component Utilities** - Frame, scale, and organize design elements

## 🎯 Perfect For

- **Design System Teams** - Managing large-scale design token migrations
- **Enterprise Organizations** - Need security compliance and no network access
- **Advanced Users** - Want TypeScript support and professional tooling
- **Variable-Heavy Projects** - Extensive use of Figma Variables and design tokens
- **Teams** - Need to share and collaborate on custom automation scripts

## 🚀 Quick Start

1. **Install** the plugin from the Figma Community
2. **Open** the plugin in any Figma file
3. **Explore** pre-built scripts in the sidebar
4. **Run** any script with the "Run" button or Cmd/Ctrl + R
5. **Create** your own scripts with full TypeScript support

### Common Workflows

**🔄 Variable Migration Example:**
```typescript
// Replace all "lg" variables with "xl" in selection
const searchPattern = 'lg';
const replacePattern = 'xl';
// Script automatically finds and replaces variable bindings
```

**📋 Style Management Example:**
```typescript
// Rename all styles from "V2/" to "V3/"
const findPrefix = "V2/";
const replacePrefix = "V3/";
// Bulk rename across entire design system
```

**🏗️ Layout Automation Example:**
```typescript
// Wrap all selected elements in auto-layout frames
selection.forEach(node => {
  // Create frame, position, and configure auto-layout
});
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Watch mode for development
npm run dev

# Build only scripts
npm run build:scripts

# Bundle UI assets
npm run build:ui
```

## 📁 Project Structure

```
├── scripts/              # Individual script files (TypeScript)
│   ├── prebuilt/         # Pre-built utility scripts
│   └── examples/         # Help and documentation
├── code.ts               # Plugin backend (TypeScript)
├── ui.html               # Plugin UI (auto-generated)
├── manifest.json         # Figma plugin manifest
└── build-scripts.js      # Build system
```

## 🔒 Security & Privacy

- **No network access required**
- **No data collection**
- **All processing happens locally**
- **Scripts run in sandboxed environment**

## 📋 Available Scripts

### Pre-built Utilities
- Auto Layout All Selected
- Frame All Selected  
- Remove Auto Layout Recursively
- Detach Styles
- Scale Selection
- Find and Replace Styles
- Replace Variable Bindings
- Find Broken Variables
- Duplicate Variable Collection
- List All Variables/Styles
- Rename Styles
- Utility Functions

### Variable Management
- Pattern-based variable replacement
- Collection duplication with metadata
- Variable binding inspection
- Broken variable detection

## ⌨️ Keyboard Shortcuts

- `Cmd/Ctrl + R` - Run script
- `Cmd/Ctrl + S` - Save script  
- `Cmd/Ctrl + E` - Export script
- `Cmd/Ctrl + I` - Import script
- `Cmd/Ctrl + N` - New script

## 🙏 Credits

This plugin is inspired by the excellent work of:

- **[Scripter](https://www.figma.com/community/plugin/757836922707087381/Scripter)** by [@rsms](https://github.com/rsms) - The original and still fantastic script runner that pioneered Figma automation
- **Figma Plugin API** - For enabling powerful automation capabilities
- **CodeMirror** - For the professional code editing experience

## 🤝 Contributing

Found a bug or have a feature request? 
- Open an issue on GitHub
- Submit a pull request
- Share your custom scripts with the community

## 🛠️ Development

### Project Structure

```
codefig/
├── src/                    # Source files (edit these)
│   ├── code.ts            # Main plugin code
│   ├── ui.html            # UI template
│   └── scripts/           # Individual script files
│       ├── prebuilt/      # Built-in example scripts
│       └── examples/      # Help and documentation
├── dist/                  # Built files (auto-generated)
│   ├── code.js           # Compiled plugin code
│   └── ui.html           # Final UI with bundled scripts
├── build-scripts.js      # Build system
└── manifest.json         # Plugin manifest
```

### Development Workflow

**Quick Start:**
1. Run `npm run dev` to start development mode
2. Edit any files in `src/` folder
3. Changes are automatically rebuilt
4. Test in Figma (refresh plugin if needed)

**Manual Build:**
- `npm run build` - One-time build of everything

**What Gets Watched:**
- `src/code.ts` → `dist/code.js` (TypeScript compilation)
- `src/ui.html` → `dist/ui.html` (UI template processing)
- `src/scripts/**/*.ts` → bundled into `dist/ui.html` (Script bundling)

### Building the Plugin

```bash
npm run build
```

This compiles TypeScript and bundles all scripts into the `dist/` folder.

### Available Commands

```bash
npm run dev          # Development mode (watch all files)
npm run build        # Full build (TypeScript + scripts)
npm run build:scripts # Build scripts only
npm run clean        # Clean build output
```

## 📄 License

MIT License - Feel free to use in commercial projects!

## 🔗 Links

- **Original Scripter**: [Figma Community](https://www.figma.com/community/plugin/757836922707087381/Scripter) | [GitHub](https://github.com/rsms/scripter)
- **Figma Variables Documentation**: [Figma Help Center](https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma)
- **TypeScript Documentation**: [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Made with ❤️ for the Figma design community**
