<div align="center">
  <img src="icon-16x16@512px.png" alt="CodeFig Icon" width="64" height="64">
  <h1>CodeFig</h1>
  <p><em>A Figma plugin for running TypeScript/JavaScript scripts, with practical examples for layout, styles, variables, and design-system tooling.</em></p>
</div>

## What is CodeFig?

**CodeFig** is a script runner for Figma, inspired by the [Scripter plugin](https://www.figma.com/community/plugin/757836922707087381/Scripter) by **@rsms**.  
It comes with a curated set of example scripts covering frame and auto-layout utilities, style and variable batch operations, design-system foundations (grid, color, typography), and small workflow helpers (e.g. annotations from comments).

Variables are supported as a first-class use case, but CodeFig is intentionally broader than variable tooling.

### Why CodeFig instead of Original Scripter?

**Original Scripter** introduced script-based automation in Figma and remains an excellent minimal tool.  
CodeFig builds on that idea and focuses on scale, structure, and reuse:

- **Broader example set** — layout, styles, variables, and design-system scripts
- **TypeScript support** — scripts with typing and editor assistance
- **Script organization** — categories, search, import/export
- **Configurable networking** — optional Comments API and dev console bridge; no-network builds supported

## Features

**Core**
- TypeScript support
- Built-in code editor (syntax highlighting, completion)
- Script categories, search, import/export
- Keyboard shortcuts

**Bundled examples**
- **Layout & frames:** auto-layout helpers, framing selections, scaling/resizing
- **Styles:** batch rename, replace, create from nodes, detach
- **Variables:** find/replace, batch rename, duplicate collections, detach, interactive workflows
- **Design-system foundations:** grid, colors, typography, font scale utilities
- **Other:** annotations generated from Figma comments (API-based)

## Perfect For

Designers and engineers who want repeatable automation for layout, styles, and variables; design-system setup scripts; and the option to run everything without network access.

## Quick Start

1. Install from the Figma Community.
2. Open the plugin in any file.
3. Browse the bundled scripts in the sidebar.
4. Run a script via the Run button or `Cmd/Ctrl + R`.
5. Create or extend scripts using TypeScript.

**Typical workflows**
- Variable replacement via `searchPattern` / `replacePattern`
- Batch renaming styles with pattern rules
- Applying or removing auto layout across selections

## Development

**Local setup:**  
`npm install` → `npm run dev`

- Builds once, then watches `src/code.ts`, `src/ui.html`, and `scripts/`
- Starts the local console log server
- Reload the plugin in Figma to test

**One-off build:** `npm run build`

### Scripts

| Command | Description |
|-------|-------------|
| `npm run build` | Full build: validate, compile TypeScript, embed scripts into `dist/`. |
| `npm run build:scripts` | Rebuild scripts + UI embed only (skip `tsc`). |
| `npm run build:ui` | Bundle CodeMirror into UI for offline/no-network use. |
| `npm run dev` | Build + watch code, UI, and scripts; start console log server. Agent can read `figma-console.log` directly. |
| `npm run validate` | Validate script syntax, imports, and metadata. |
| `npm run clean` | Remove `dist/`. |

**Console logging:**  
During `dev`, plugin and script logs are written to `figma-console.log`. The file is un-ignored so the agent can read it directly. The `prepare` script adds it to `.git/info/exclude` so it is not committed. For locked-down environments, use a manifest without `http://localhost:8765`.

**Project structure**
- `src/` – plugin code and UI
- `scripts/` – example scripts and shared libraries
- `dist/` – build output

## Network and Builds

The default manifest allows limited network access:
- CDN (CodeMirror)
- Figma API (comments → annotations)
- Localhost (dev console bridge)

For restricted environments, use a no-network manifest (empty `allowedDomains`) and bundle CodeMirror into the UI via `npm run build:ui`.

No telemetry. Scripts run entirely in the plugin sandbox.

## Security & Privacy

- No data collection
- Network access is explicit and optional
- Fully functional in offline / no-network mode

## Bundled Scripts

**Help**

| Name | Description |
|------|-------------|
| Help & documentation | Plugin overview and usage notes |

**Example scripts**

| Name | Description |
|------|-------------|
| Auto layout all selected | Wrap each selected node in its own auto-layout frame |
| Frame all selected | Wrap each selected node in a frame |
| Remove auto layout recursively | Remove auto layout from selection and descendants |
| Scale selection | Scale or resize by factor, dimensions, or ratio |
| Batch rename styles | Rename text/color/effect styles by pattern |
| Replace styles | Replace styles with partial matching |
| Create styles from nodes | Generate text styles from selected text nodes |
| Detach styles & variables | Remove bindings from selection |
| Find and replace variables | Replace variable bindings by name pattern |
| Batch rename variables | Rename variables in a collection |
| Duplicate variable collection | Copy a variable collection with metadata |
| Replace variables workflow | Interactive variable replacement |
| DS Foundation: Grid | Create/update grid system variables |
| DS Foundation: Colors | Create/update color system variables |
| DS Foundation: Typography | Responsive typography variables and styles |
| Font scale calculator | Generate font sizes from scales |
| Create annotations from comments | Convert file comments to annotations (API) |

**Libraries**  
Shared helpers used by scripts: `@core-library`, `@infopanel`, `@math-helpers`, `@pattern-matching`, `@replacement-engine`, `@styles`, `@variables`.

## Keyboard Shortcuts

- `Cmd/Ctrl + R` — Run script
- `Cmd/Ctrl + S` — Save script  
- `Cmd/Ctrl + E` — Export script
- `Cmd/Ctrl + I` — Import script
- `Cmd/Ctrl + N` — New script

## Credits

- **Scripter** by [@rsms](https://github.com/rsms) — the original Figma script runner  
- **Figma Plugin API**
- **CodeMirror**

## Contributing

- Open issues for bugs or proposals
- Submit pull requests
- Share reusable scripts

## License

MIT — free for commercial and non-commercial use.

## Links

- **Original Scripter**: [Figma Community](https://www.figma.com/community/plugin/757836922707087381/Scripter) · [GitHub](https://github.com/rsms/scripter)  
- **Figma Variables**: [Figma Help Center](https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma)  
- **TypeScript**: [Handbook](https://www.typescriptlang.org/docs/)

---

Built for the Figma automation community.