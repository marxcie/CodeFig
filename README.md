<div align="center">
  <img src="icon-16x16@512px.png" alt="CodeFig Icon" width="64" height="64">
  <h1>CodeFig</h1>
  <p><em>Run JavaScript inside Figma. Built for interacting with Variables, Styles, Design Systems, and generally with Figma files, nodes programmatically. </em></p></br>
  <a href="https://www.buymeacoffee.com/codefig" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" style="height: 60px !important;width: 217px !important;" ></a>
</div>

## What is CodeFig?

**CodeFig** is a script runner for Figma, inspired by the [Scripter plugin](https://www.figma.com/community/plugin/757836922707087381/Scripter) by **@rsms**.  
It comes with a curated set of utility scripts covering framing and auto-layout, style and variable batch operations, design-system foundations (grid, typography, spacing, corner radius), and small workflow helpers (e.g. annotations from comments).

Variables are supported as a first-class use case, but CodeFig is intentionally broader than variable tooling.

Scripts run as plain JavaScript in the Figma plugin sandbox.

### Why CodeFig instead of Original Scripter?

**Original Scripter** introduced script-based automation in Figma and remains an excellent minimal tool.  
CodeFig builds on that idea and focuses on scale, structure, and reuse:

- **Broader example set** — layout, styles, variables, and design-system scripts
- **JavaScript scripts** — `.ts` filenames for IDE convenience; runtime is ES2017-style JS the Figma runtime accepts
- **Script organization** — categories, search, import/export
- **No external dependencies** — no CDNs or third-party services; Figma API used only for scripts that need it (e.g. comments-to-annotations)

## Features

**Core**
- Built-in code editor
- Script categories, search, import/export
- Keyboard shortcuts
- Prebuilt utility scripts and libraries
- User scripts with autosave (see note below)
- UI config support (variables, booleans → visual controls)
- Real-time console logging in dev mode

**Notes**
- Only user scripts are auto-saved. Prebuilt scripts are read-only by default — duplicate them to edit and persist changes.
- In dev mode, logs are written in real time to `figma-console.log`, allowing direct debugging without copying errors.


**Bundled examples**
- **Layout & frames:** frame or auto-layout selection, scale or resize, remove unnecessary nesting
- **Styles:** batch rename and replace, duplicate collections, text-to-styles, render-styles overview, detach
- **Variables:** find/replace bindings, batch rename, duplicate collections, inspector
- **Design-system foundations:** grid, typography, spacing, corner radius (responsive scale variables)
- **Other:** annotations generated from Figma comments (API-based)

## Perfect For

Designers and engineers who want repeatable automation for layout, styles, and variables; design-system setup scripts; and a self-contained plugin (no CDNs; Figma API only when needed).

## Quick Start

1. Install from the Figma Community.
2. Open the plugin in any file.
3. Browse the bundled scripts in the sidebar.
4. Run a script via the Run button or `Cmd/Ctrl + R`.
5. Create or extend scripts using **JavaScript** (syntax must be valid JS at run time).

## Development

**Local setup:**  
`npm install` → `npm run dev`

- Watches `src/code.ts`, `src/ui.html`, and `scripts/`
- Starts the local console log server (writes to `figma-console.log`)
- Reload the plugin in Figma to test

**Production build (releases, CI):** `npm run build:production` — runs `tsc` on **`src/code.ts`** only, embeds script **sources** into `dist/ui.html`, and keeps **`manifest.json` free of `localhost`** (enterprise-safe for submission).

**One-off dev build:** `npm run build:dev` — same as production, but adds `http://localhost:8765` to `manifest.json` so the console log bridge can run.

### Scripts

| Command | Description |
|-------|-------------|
| `npm run build:production` | Validation (non-blocking), `tsc`, then `build-scripts.js` without `--dev` — **removes** localhost from the manifest. Use before publishing. |
| `npm run build:dev` | Same, with `--dev` — **adds** localhost for local console forwarding to `figma-console.log`. |
| `npm run dev` | Runs `build:dev`, then watches `src/` and `scripts/`, rebuilds on change, starts the console log server. |
| `npm run validate` | Validate script syntax, imports, and metadata. |
| `npm run clean` | Remove `dist/`. |

**Console logging:**  
During `dev`, plugin and script logs are written to `figma-console.log`. The file is un-ignored so the agent can read it directly. The `prepare` script adds it to `.git/info/exclude` so it is not committed. If you used `npm run dev` or `build:dev`, run **`npm run build:production`** before committing or publishing so `manifest.json` does not retain localhost.

**Project structure**
- `src/` – plugin code and UI
- `scripts/` – utility scripts and shared libraries
- `dist/` – build output (`code.js`, `ui.html` with embedded script bundle)

**Shipped vs dev-only scripts:** The build skips any script file or folder whose name starts with `_` (for example `_auto-layout-all-selected.ts` or `_DEBUG_SCRIPTS/`). Those files stay in the repo for experiments and debugging but are not included in the published plugin.

## Network and Builds

CodeFig is self-contained:
- No CDNs or third-party services
- Uses Figma API only when needed
- No telemetry

`http://localhost:8765` is added only in dev mode for console logging.

## Security & Privacy

- No data collection
- No external dependencies
- Runs entirely in the Figma plugin sandbox

## Bundled Scripts

These are the utility and help scripts included in the build (see **Shipped vs dev-only scripts** under Development). Display names in the plugin follow each file’s title comment.

**Help**

| Name | Description |
|------|-------------|
| Help & documentation | In-plugin overview: editor, Documentation tab, `@import`, shortcuts |

**Layout & structure**

| Name | Description |
|------|-------------|
| Frame or auto layout selected | Wrap selection in new frames or auto-layout containers |
| Scale or resize elements | Scale or resize by factor, dimensions, or ratio |
| Remove unnecessary nesting | Remove redundant wrapper frames |

**Styles**

| Name | Description |
|------|-------------|
| Rename styles | Rename text, paint, and effect styles by pattern |
| Replace styles | Rebind nodes to different styles by name pattern (local and Team Library) |
| Duplicate styles collection | Duplicate a published styles collection |
| Text to styles | Create text styles from selected text layers |
| Render styles overview | Generate a “render styles” overview frame for library workflows |
| Replace style variable bindings | Replace variable bindings on style definitions |

**Variables**

| Name | Description |
|------|-------------|
| Rename variables | Rename variables in a collection |
| Replace variables | Replace variable bindings on layers by path pattern |
| Duplicate variable collection | Copy a variable collection with metadata |
| Variable inspector (WIP) | Inspect variable bindings and usage |

**Selection & utilities**

| Name | Description |
|------|-------------|
| Select by styles or variables | Select nodes that use given styles or variables |
| Detach styles & variables | Remove style and variable bindings from the selection |
| Comments to annotations | Create annotations from file comments (Figma REST API + token) |

**Design System Foundations**

| Name | Description |
|------|-------------|
| Grid | Grid system variables, layout grid style, preview frames |
| Typography | Responsive typography variables and optional text styles |
| Spacing | Responsive spacing scale variables (width, height, gap) |
| Corner radius | Responsive corner-radius scale variables |

**Libraries**  
Shared helpers used by scripts: `@core-library`, `@codefig-ui`, `@infopanel`, `@math-helpers`, `@pattern-matching`, `@replacement-engine`, `@styles`, `@variables`.

**User libraries**  
Create a script and name it with an `@` prefix (e.g. `@My Utils`) to treat it as a library. Libraries are imported by other scripts, not run directly.

## Keyboard Shortcuts

- `Cmd/Ctrl + R` — Run script
- `Cmd/Ctrl + /` — Toggle line comments in the editor
- `Cmd/Ctrl + E` — Export script
- `Cmd/Ctrl + I` — Import script
- `Cmd/Ctrl + N` — New script

User scripts **autosave** after you pause typing (there is no separate Save shortcut).

## Contributing

- Open issues for bugs or proposals
- Submit pull requests
- Share reusable scripts

## License

MIT — free for commercial and non-commercial use.

---

Built for the Figma community.