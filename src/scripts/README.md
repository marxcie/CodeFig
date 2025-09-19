# Scripts Directory

This directory contains all the individual script files that get bundled into the plugin.

## Structure

```
scripts/
├── prebuilt/          # Pre-built utility scripts
│   ├── *.ts          # TypeScript script files
└── examples/          # Help and documentation scripts
    └── *.ts          # TypeScript script files
```

## How It Works

1. **Individual Files**: Each script is maintained in its own TypeScript file for better organization and maintainability.

2. **Build Process**: The `build-scripts.js` file reads all these individual scripts and bundles them into the `ui.html` file.

3. **Configuration**: The script configuration in `build-scripts.js` maps filenames to display names and types.

## Adding New Scripts

1. Create a new `.ts` file in the appropriate directory (`prebuilt/` or `examples/`)
2. Add the filename and configuration to `build-scripts.js`
3. Run `npm run build:scripts` to bundle the scripts into `ui.html`

## Building

- `npm run build:scripts` - Bundle scripts into ui.html
- `npm run build` - Build TypeScript + bundle scripts

## Benefits

- ✅ **Better organization** - Each script in its own file
- ✅ **TypeScript support** - Full type checking for scripts
- ✅ **Easy maintenance** - Edit individual files instead of one huge file
- ✅ **Version control friendly** - Better diffs and history
- ✅ **Code reuse** - Scripts can be easily shared or extracted
