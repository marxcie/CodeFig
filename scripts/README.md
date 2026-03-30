# CodeFig Scripts

This directory contains all scripts for the CodeFig plugin. The build system automatically discovers and loads scripts from subdirectories.

**Location**: This `scripts/` folder is at the root level of the project (not in `src/` or `dist/`). This is the single source of truth for all scripts. The build copies `.ts` files into `dist/scripts/` and embeds them as base64 JSON in `dist/ui.html` (see the `scripts-data` block in the built HTML). There is no separate `scripts-manifest.json` file.

**Language:** Files use a `.ts` extension, but the plugin runs script code as **plain JavaScript** (no TypeScript compile step). Avoid TypeScript-only syntax (`interface`, `type` aliases, `as` casts, etc.) so scripts run without errors.

## Folder Structure

### `/HELP/`
Contains help and documentation scripts that appear in the "Help" category.
- **Type**: `help`
- **Purpose**: Documentation, tutorials, and help content

### `/EXAMPLE_SCRIPTS/`
Contains utility scripts that demonstrate various Figma automation capabilities.
- **Type**: `prebuilt` 
- **Purpose**: Ready-to-use scripts for common tasks

### `/CODEFIG_LIBRARIES/`
Contains importable library scripts (prefixed with `@`) that provide reusable functions and utilities.
- **Type**: `prebuilt`
- **Purpose**: Core libraries and utilities that can be imported by other scripts
- **Files**: `@core-library.ts`, `@codefig-ui.ts`, `@infopanel.ts`, `@math-helpers.ts`, `@pattern-matching.ts`, `@replacement-engine.ts`, `@styles.ts`, `@variables.ts`

### Excluded Folders
Folders and files starting with `_` or `.` are automatically excluded from the build:
- `/_DEBUG_SCRIPTS/` - Debug scripts (excluded by `_` prefix)
- Any folder/file starting with `_` or `.` will be skipped

### Custom Categories
You can create additional folders for custom categories:
- Folder names become category labels
- Scripts are automatically categorized based on their folder
- Use `_` prefix to exclude folders from the build

## Script Exclusion

Scripts are automatically excluded from the build if they:
- Start with `_` or `.` (e.g., `_debug-script.ts`, `.hidden.ts`)
- Have backup extensions: `.bak`, `.bak2`, `.bak3`, `.backup`, `.old`, `.tmp`
- Are in folders starting with `_` or `.`

Examples:
- `_DEBUG_SCRIPTS/` - Entire folder excluded
- `script.ts.bak` - Backup file excluded
- `_experimental.ts` - Hidden script excluded

## Script Naming

Scripts are automatically named using this priority:

1. **Custom name comment**: Add `// SCRIPT_NAME: Your Custom Name` at the top of the file
2. **Title comment**: Use the first comment line as the title (e.g., `// REPLACE TEXT STYLES`)
3. **Filename**: Automatically convert filename to display name
   - `find-broken-variables.ts` → "Find Broken Variables"
   - `auto-layout-all.ts` → "Auto Layout All"

## Adding New Scripts

1. **Create a `.ts` file** in the appropriate folder
2. **Add your script code** 
3. **Optionally add a title comment** at the top
4. **Run `npm run build:production`** (or `build:dev` while developing) to rebuild the plugin

The script will automatically appear in the plugin interface!

## Utility script template

```javascript
// REPLACE TEXT STYLES
// or
// SCRIPT_NAME: My Custom Script Name

// Your script code here
console.log('Hello from my script!');
figma.notify('Script executed successfully!');
```

## Build Process

The build system (`build-scripts.js`) automatically:
- 🔍 **Discovers** all `.ts` files in subdirectories (excluding `_`/`.` prefixed files)
- 📁 **Categorizes** scripts based on folder names
- 🏷️ **Names** scripts using comments or filenames
- 🔗 **Processes** `@import` statements at build time
- 📦 **Embeds** processed scripts into `dist/ui.html` (no separate manifest file)

## @Import System

Scripts can import functions from library scripts using `@import` statements:

```javascript
// Import specific functions
@import { getAllStyles, generateScale } from "@Core Library"

// Import all functions (wildcard)
@import * from "@Variables"

// Import from any script
@import { myFunction } from "My Custom Script"
```

Available library scripts:
- `@core-library.ts` - Core utility functions (nodes, styles, memory, colors)
- `@codefig-ui.ts` - CodeFigUI config forms (section, toggle, number, string, select, sendToUI)
- `@infopanel.ts` - InfoPanel display (displayResults, createResult, etc.)
- `@math-helpers.ts` - Math, geometry, interpolation, easing
- `@pattern-matching.ts` - Pattern matching and wildcards
- `@replacement-engine.ts` - Find/replace with planning and reporting
- `@styles.ts` - Style finding, analysis, replacement
- `@variables.ts` - Variable and collection management

Imports are resolved at runtime when you run a script; user scripts can also import from other user scripts or user libraries (name with `@` prefix).

## Validation

Run `npm run validate` to check scripts for:
- Syntax errors
- Invalid `@import` references
- Missing metadata warnings

`build:production` and `build:dev` run validation first, but use `validate || true` so validation messages do not fail the build.