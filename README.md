<div align="center">
  <img src="icon-16x16@512px.png" alt="CodeFig Icon" width="64" height="64">
  <h1>CodeFig</h1>
  <p><em>Run JavaScript inside Figma. Built for working with Variables, Styles, Design Systems, and Figma files and nodes programmatically.</em></p></br>
  <img width="1920" height="1080" alt="file cover - 11" src="https://github.com/user-attachments/assets/3e03b215-4983-47c3-bdb4-0fa16deaf61f" />
</div>


## What is CodeFig?

CodeFig is a script runner for Figma, inspired by the [Scripter plugin](https://www.figma.com/community/plugin/757836922707087381/Scripter) by **@rsms**. It comes with a curated set of utility scripts covering framing and auto-layout, style and variable batch operations, design-system foundations (grid, typography, spacing, corner radius), and smaller workflow helpers like generating annotations from comments.

Variables are supported as a first-class use case, but CodeFig is intentionally broader than variable tooling. Scripts run as plain JavaScript in the Figma plugin sandbox.

### Why CodeFig instead of the original Scripter?

Scripter introduced script-based automation in Figma and remains an excellent minimal tool. CodeFig builds on that idea with a focus on scale, structure, and reuse:

- **A broader example set** — layout, styles, variables, and design-system scripts
- **JavaScript scripts** — `.ts` filenames for IDE convenience; the runtime is ES2017-style JS that the Figma sandbox accepts
- **Script organization** — categories, search, import/export
- **No external dependencies** — no CDNs or third-party services; the Figma API is only used where scripts specifically need it (e.g. comments-to-annotations)


## Features

**Core**
- Built-in code editor
- Script categories, search, import/export
- Keyboard shortcuts
- Prebuilt utility scripts and libraries
- User scripts with autosave (see note below)
- UI config support (variables, booleans → visual controls)
- Real-time console logging in dev mode

> **Notes:**
> - Only user scripts are auto-saved. Prebuilt scripts are read-only by default — duplicate them to edit and keep your changes.
> - In dev mode, logs are written in real time to `figma-console.log`, so you can debug without copying errors out of Figma.

**Bundled script examples**
- **Layout & frames:** frame or auto-layout selections, scale or resize, remove unnecessary nesting
- **Styles:** batch rename and replace, duplicate collections, text-to-styles, render a styles overview, detach
- **Variables:** find/replace bindings, batch rename, duplicate collections, inspector
- **Design-system foundations:** grid, typography, spacing, corner radius (responsive scale variables)
- **Other:** annotations generated from Figma comments (API-based)


## Perfect For

Designers and engineers who want repeatable automation for layout, styles, and variables; design-system setup scripts; and a self-contained plugin with no external dependencies.


## Quick Start

1. Install from the Figma Community, or open the [**latest GitHub release**](https://github.com/marxcie/codefig/releases/latest) and download **`codefig-vX.Y.Z-plugin.zip`** (the version in the filename matches the release tag, e.g. `codefig-v1.0.5-plugin.zip`).
2. Open the plugin in any Figma file.
3. Browse the bundled scripts in the sidebar.
4. Run a script with the Run button or `Cmd/Ctrl + R`.
5. Create or extend scripts using **JavaScript** (syntax must be valid JS at run time).


## Installing from GitHub

On each [release](https://github.com/marxcie/codefig/releases), download **`codefig-vX.Y.Z-plugin.zip`** (same version as the tag, e.g. v1.0.5 → `codefig-v1.0.5-plugin.zip`). Unzip it, then in Figma go to **Plugins → Development → Import plugin from manifest…** and select the **`manifest.json`** at the top of the unzipped folder (next to the `dist/` folder).

That `manifest.json` is the plugin manifest at the repo root. Running `npm run build:production` updates it in place with production network settings and fills `dist/` — it does not emit a second manifest or a zip. There is no separate “latest.zip” filename; pick the versioned asset on the release you want.

### Shipping a new release (for maintainers)

Run:

```
npm run build:release -- patch
```

Use `minor` or `major` instead of `patch` as appropriate. This command:
- Requires a **clean git working tree** before it starts
- Runs a production build (this may rewrite `manifest.json` for production network settings)
- Writes `codefig-plugin.zip` locally
- Bumps the version in `package.json`, syncs `package-lock.json`, then makes **one commit** that includes those files plus `manifest.json`, and creates the **`v*`** tag (it does not use `npm version`, because that command requires a clean tree *after* the build, which the manifest rewrite breaks)
- **Does not `git push` by default** — push from GitHub Desktop or the CLI when you're ready

Additional flags:
- `--push` — also pushes the branch and tag, which starts CI on GitHub
- `--dry-run` — build and pack only, no version bump or tag

**You do not commit or push the zip.** Local `npm run pack` writes `codefig-plugin.zip` at the repo root (gitignored), only for convenience. `dist/` is gitignored. When you push the tag, GitHub Actions builds **`codefig-vX.Y.Z-plugin.zip`** from the committed tree and attaches it to the release.

### Selective commits before a release

The script only checks for a clean tree **before** the build. If you have unfinished work you're not ready to ship, use `git stash` to hold it back temporarily, then commit what you want included before running `build:release`.

**Example: ship one script change while keeping other edits local**

1. **Stash** the files you're not shipping yet (nothing is lost — they're saved locally):

   ```
   git stash push -m "wip plugin ui" -- src/ui.html src/code.ts
   ```

2. **Commit** what you do want in this release:

   ```
   git add scripts/EXAMPLE_SCRIPTS/my-change.ts && git commit -m "fix: …"
   ```

3. Run `npm run build:release -- patch`. The production build uses the last committed versions of any stashed files.

4. **Pop your stash** when you want your WIP back:

   ```
   git stash pop
   ```

5. Push the branch and tag from GitHub Desktop, or add `--push` to the release command.

If the release script fails with **tag already exists**, a previous run may have created the tag without finishing. Remove it and retry:

```
git tag -d v1.0.1
```

Use the exact tag name from the error message.

**Local zip only (same contents as CI):** `npm run pack` (or use `--dry-run`).


## Development

**Local setup:**

```
npm install
npm run dev
```

This watches `src/code.ts`, `src/ui.html`, and `scripts/`, starts the local console log server (writing to `figma-console.log`), and rebuilds on change. Reload the plugin in Figma to test.

**Production build:** `npm run build:production` — runs `tsc` on `src/code.ts`, embeds script sources into `dist/ui.html`, and keeps `manifest.json` free of `localhost` (safe for enterprise submission and publishing).

**One-off dev build:** `npm run build:dev` — same as production, but adds `http://localhost:8765` to `manifest.json` so the console log bridge can run locally.

### Script reference

| Command | Description |
|---------|-------------|
| `npm run build:production` | Validation (non-blocking), `tsc`, then `build-scripts.js` without `--dev` — removes localhost from the manifest. Use before publishing. |
| `npm run build:dev` | Same as above, with `--dev` — adds localhost for local console forwarding to `figma-console.log`. |
| `npm run dev` | Runs `build:dev`, then watches `src/` and `scripts/`, rebuilds on change, and starts the console log server. |
| `npm run validate` | Validates script syntax, imports, and metadata. |
| `npm run clean` | Removes `dist/`. |
| `npm run pack` | Runs `build:production`, then writes `codefig-plugin.zip` (`manifest.json` + `dist/`). Same layout as the GitHub Release asset; requires the `zip` CLI. |
| `npm run build:release` | See **Shipping a new release** above. Build + pack + version bump + commit (`package.json`, lockfile, `manifest.json`) + tag. Optional `--push`; default is no push. `--dry-run` builds and packs only. |

**Console logging:** During `dev`, plugin and script logs are written to `figma-console.log`. The file is un-ignored so it can be read directly. The `prepare` script adds it to `.git/info/exclude` to prevent it from being committed. If you used `npm run dev` or `build:dev`, run `npm run build:production` before committing or publishing to ensure `manifest.json` doesn't retain the localhost entry.

### Project structure

- `src/` — plugin code and UI
- `scripts/` — utility scripts and shared libraries
- `dist/` — build output (`code.js`, `ui.html` with embedded script bundle)

**Shipped vs. dev-only scripts:** The build skips any script file or folder whose name starts with `_` (e.g. `_auto-layout-all-selected.ts` or `_DEBUG_SCRIPTS/`). Those files stay in the repo for experiments and local debugging but are never included in the published plugin.


## Network & Privacy

CodeFig is fully self-contained:
- No CDNs or third-party services
- Uses the Figma API only when a script requires it
- No telemetry or data collection
- Runs entirely in the Figma plugin sandbox

`http://localhost:8765` appears only in dev mode builds, for console log forwarding.


## Bundled Scripts

These are the utility and help scripts included in the build (see **Shipped vs. dev-only scripts** above). Display names in the plugin come from each file's title comment.

### Utility Scripts

| Script | Description |
|--------|-------------|
| **Comments to annotations** | Reads Figma comments via the REST API and converts them into annotations. Useful when duplicating designs across files, as comments don't carry over. The script preserves comment positions by creating hidden anchors (since comments are usually attached to the root frame, not individual elements). Requires a Read Comments API token. |
| **Detach styles & variables** | Removes style and/or variable bindings from the current selection. You can choose which types to detach (fill, stroke, effect, typography, etc.) or remove all bindings. |
| **Duplicate styles group** | Duplicate a styles group, with optionally rebinding its variable bindings to another collection. |
| **Duplicate variable collection** | Duplicates a variable collection with its metadata and values. |
| **Frame or auto layout selected** | Wraps (or unwraps) each selected layer in new frames or auto-layout containers individually. |
| **Remove unnecessary nesting** | Detects and removes redundant wrapper frames (e.g. wrappers with only one child). Optionally normalizes wrappers (e.g. combining padding-x on wrapper 1 and padding-y on wrapper 2 into a single wrapper). |
| **Rename styles** | Batch-renames styles using find/replace rules, similar to Figma's batch rename. |
| **Rename variables** | Batch-renames variables using find/replace rules, similar to Figma's batch rename. |
| **Render styles overview** | Generates a visual overview of a defined style group in a frame. Primarily used to support Replace Styles, which requires all styles to exist in the file. The easiest approach is to generate the overview in the library file and paste it into the target file. |
| **Replace style variable bindings** | Batch find and replaces variable bindings inside style definitions. |
| **Replace styles** | Batch finds and rebinds node style assignments to different styles based on name matching and the local style inventory. Style replacement is less smooth than with variables due to limited Figma styles API support, so it requires a two-step approach. |
| **Replace variables** | Batch finds and rebinds layer variable references or collections to another. |
| **Scale or resize elements** | Scales or resizes selected nodes by factor, ratio, or explicit dimensions (e.g. resize all selected to 16:9 with a width of 640px). |
| **Select by styles or variables** | Selects all nodes that use a specific style or variable. |
| **Text to styles** | Creates text styles from selected text layers, keeping variable bindings (if there are any). |
| **Variable inspector *(WIP)*** | Inspects variable bindings and usage details in the file or selection. The goal is to find broken or outdated bindings and disconnected library artifacts. Still in progress due to the complexity. |

---

### Design System Foundations

These scripts let you build a highly configurable design system foundation with as many breakpoints as needed, and tune spacing, grid, typography, and corner radius per breakpoint.

| Script | Description |
|--------|-------------|
| **Corner radius** | Creates or updates corner radius variables across breakpoint modes and sets their respective scopes. Highly configurable: set min–max values and define as many steps, increment types, and naming conventions as needed. |
| **Grid** | Creates or updates layout grid variables across breakpoint modes, sets their respective scopes, creates grid styles for the setup, and generates preview frames with the grid setup. |
| **Spacing** | Creates or updates spacing variables across breakpoint modes and sets their respective scopes. Highly configurable: set min–max values per breakpoint and define as many steps, increment types, and naming conventions as needed. |
| **Typography** | Creates or updates typography variables across breakpoint modes with their respective scopes, and optionally matching text styles. Highly configurable: set min–max values per breakpoint and define as many steps, increment types, and naming conventions as needed. |

---

### Importable Libraries

| Library | Description |
|---------|-------------|
| **@Core Library** | General utility helpers for node traversal, styles, colors, and shared low-level operations. |
| **@CodeFigUI** | Helpers for building script config UIs inside CodeFig. |
| **@InfoPanel** | Utilities for showing structured results in the plugin UI. |
| **@Math Helpers** | Math and scaling helpers for interpolation, easing, ratios, and generated scales. |
| **@Pattern Matching** | Shared pattern and wildcard matching utilities. |
| **@Replacement Engine** | Core logic for planning and applying find/replace operations. |
| **@Styles** | Helpers for discovering, analyzing, and replacing styles. |
| **@Variables** | Helpers for collections, variables, bindings, and value updates. |

**User libraries:** Create a script and name it with an `@` prefix (e.g. `@My Utils`) to treat it as a library. Libraries are imported by other scripts rather than run directly.

**User scripts:** Create a script and run it. :)


## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + R` | Run script |
| `Cmd/Ctrl + /` | Toggle line comments in the editor |
| `Cmd/Ctrl + E` | Export script |
| `Cmd/Ctrl + I` | Import script |
| `Cmd/Ctrl + N` | New script |

User scripts autosave after you pause typing — there's no separate Save shortcut.


## Contributing

- Open issues for bugs or proposals
- Submit pull requests
- Share reusable scripts


## License

MIT — free for commercial and non-commercial use.

---

Built for the Figma community.
