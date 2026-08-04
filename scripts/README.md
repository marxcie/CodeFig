# CodeFig Scripts

This directory contains all scripts for the CodeFig plugin. The build system automatically discovers and loads scripts from subdirectories.

**Location**: This `scripts/` folder is at the root level of the project (not in `src/` or `dist/`). This is the single source of truth for all scripts. The build reads `.js` files from here and embeds them as base64 JSON in `dist/ui.html` (see the `scripts-data` block in the built HTML) — nothing is copied into `dist/`, since the plugin sandbox has no filesystem and that blob is the only consumer. There is no separate `scripts-manifest.json` file.

**Language:** Plain JavaScript, in `.js` files, with no compile step — the source text reaches `new Function` verbatim, so TypeScript-only syntax (`interface`, `type` aliases, `as` casts, parameter and return annotations) is a runtime SyntaxError, not a type. `npm run validate` rejects it. Files carried a `.ts` extension until Aug 2026, which only misled editors into suggesting the syntax that breaks.

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
- **Files**: `@core-library.js`, `@codefig-ui.js`, `@infopanel.js`, `@math-helpers.js`, `@pattern-matching.js`, `@replacement-engine.js`, `@styles.js`, `@variables.js`

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
- Start with `_` or `.` (e.g., `_debug-script.js`, `.hidden.js`)
- Have backup extensions: `.bak`, `.bak2`, `.bak3`, `.backup`, `.old`, `.tmp`
- Are in folders starting with `_` or `.`

Examples:
- `_DEBUG_SCRIPTS/` - Entire folder excluded
- `script.bak.js` - Backup file excluded
- `_experimental.js` - Hidden script excluded

## Script Naming

Scripts are automatically named using this priority:

1. **Custom name comment**: Add `// SCRIPT_NAME: Your Custom Name` at the top of the file
2. **Title comment**: Use the first comment line as the title (e.g., `// REPLACE TEXT STYLES`)
3. **Filename**: Automatically convert filename to display name
   - `find-broken-variables.js` → "Find Broken Variables"
   - `auto-layout-all.js` → "Auto Layout All"

## Adding New Scripts

1. **Create a `.js` file** in the appropriate folder
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
- 🔍 **Discovers** all `.js` files in subdirectories (excluding `_`/`.` prefixed files)
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
- `@core-library.js` - Core utility functions (nodes, styles, memory, colors)
- `@codefig-ui.js` - CodeFigUI config forms (section, toggle, number, string, select, sendToUI)
- `@infopanel.js` - InfoPanel display (displayResults, createResult, etc.)
- `@math-helpers.js` - Math, geometry, interpolation, easing
- `@pattern-matching.js` - Pattern matching and wildcards
- `@replacement-engine.js` - Find/replace with planning and reporting
- `@styles.js` - Style finding, analysis, replacement
- `@variables.js` - Variable and collection management

Imports are resolved at runtime when you run a script; user scripts can also import from other user scripts or user libraries (name with `@` prefix).

## Long-running scripts and progress

The plugin UI shows a footer progress bar automatically:

- **Runs longer than ~2 seconds** show an indeterminate “Running script…” bar even if the script never calls `showProgress`.
- **Determinate progress** appears when the script (or `@Core Library`) sends updates via `showProgress(operation, processed, total)`.

For work that walks large trees or scans many nodes, **yield to the UI** so Figma stays responsive and the bar can update:

```javascript
@import { collectNodesAsync, showProgress, processWithOptimization, yieldToUI } from "@Core Library"

// Collect selection subtree with periodic yields + progress
var nodes = await collectNodesAsync(figma.currentPage.selection, {
  operation: 'Collecting nodes',
  maxNodes: 15000,
  yieldEvery: 400,
});

// Process in chunks with progress (uses setTimeout between chunks)
await processWithOptimization(nodes, function (node) { /* ... */ }, {
  operation: 'Processing',
  showProgress: true,
});

// Optional: one-off yield between heavy synchronous steps
await yieldToUI();
```

**Async scripts** that finish without `processWithOptimization` (which sends `PROGRESS_COMPLETE`) should clear the bar when done:

```javascript
if (typeof window !== 'undefined' && typeof window.codefigRunComplete === 'function') {
  window.codefigRunComplete();
}
```

`displayResults()` from `@InfoPanel` calls `codefigRunComplete()` automatically when the script did not report determinate progress.

Avoid long **fully synchronous** loops without `setTimeout` / `await`—the main thread cannot deliver progress messages until it yields.

## Validation

Run `npm run validate` to check scripts. It reports two kinds of finding, and only the first kind fails a build:

**Errors** — every script is parsed exactly as the sandbox parses it (`new Function`), both as written and again with its `@import`s spliced in:
- does not parse as plain JS (a stray type annotation, `interface`, or `as` cast)
- does not parse *after* `@import` resolution, which means a library function was truncated during extraction
- an `@import` names a script or a function that does not exist
- a piecewise-scale fixture in `@math-helpers.js` regressed

**Warnings** — cosmetic, exit code unaffected:
- no `SCRIPT_NAME` or title comment, so the display name falls back to the filename

`npm run build:production` runs validation as a **blocking** step: an error fails the build, and therefore fails `npm run pack` and `npm run build:release` too. `npm run build:dev` runs `validate:soft`, which prints the same report but always succeeds — so a half-written script does not kill the dev watcher.

Since scripts cannot run outside Figma, this is the only automated check they get. If a validation error is blocking you, fix the script rather than routing around the gate.