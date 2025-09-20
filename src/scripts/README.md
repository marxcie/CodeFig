# CodeFig Scripts

This directory contains all scripts for the CodeFig plugin. The build system automatically discovers and loads scripts from subdirectories.

## Folder Structure

### `/HELP/`
Contains help and documentation scripts that appear in the "Help" category.
- **Type**: `help`
- **Purpose**: Documentation, tutorials, and help content

### `/EXAMPLE_SCRIPTS/`
Contains example scripts that demonstrate various Figma automation capabilities.
- **Type**: `prebuilt` 
- **Purpose**: Ready-to-use scripts for common tasks

### Custom Categories
You can create additional folders for custom categories:
- Folder names become category labels
- Scripts are automatically categorized based on their folder

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
4. **Run `npm run build`** to rebuild the plugin

The script will automatically appear in the plugin interface!

## Example Script Template

```typescript
// REPLACE TEXT STYLES
// or
// SCRIPT_NAME: My Custom Script Name

// Your script code here
console.log('Hello from my script!');
figma.notify('Script executed successfully!');
```

## Build Process

The build system (`build-scripts.js`) automatically:
- 🔍 **Discovers** all `.ts` files in subdirectories
- 📁 **Categorizes** scripts based on folder names
- 🏷️ **Names** scripts using comments or filenames
- 📦 **Bundles** everything into the plugin

No manual configuration needed - just add files and build!