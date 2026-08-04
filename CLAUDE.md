# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CodeFig is a Figma plugin that runs user-authored JavaScript inside the Figma plugin sandbox, aimed at Variables, Styles, and design-system automation. It ships a curated library of scripts plus importable helper libraries.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | `build:dev`, then watches `src/` + `scripts/` and starts the console bridge server on :8765. Reload the plugin in Figma to pick up changes. |
| `npm run build:dev` | validate (non-blocking) → `tsc` → `build-scripts.js --dev` (which inlines the config-ui bundle, the `@import` resolver and vendors into `dist/ui.html`). Adds `http://localhost:8765` to `manifest.json`. |
| `npm run build:production` | Same without `--dev`; strips `localhost` from `manifest.json`. Required before committing/publishing. |
| `npm run validate` | `validate-scripts.js` — parses every script through `new Function` exactly as the sandbox does, plus `@import` resolution and metadata warnings. Exits 1 on failure, but builds run it as `validate \|\| true` so it never blocks. |
| `npm test` | `node --test tests/` — fixture tests for `src/import-resolver.js`. No dependencies, no watch mode. |
| `npm run pack` | production build + `codefig-plugin.zip` (needs the `zip` CLI). |
| `npm run build:release -- patch\|minor\|major` | `release.js`: requires clean tree, builds, packs, bumps version, single commit (package.json + lockfile + manifest.json), creates `v*` tag. No push unless `--push`; `--dry-run` skips bump/tag. Pushing the tag triggers `.github/workflows/release.yml`, which builds the release zip from the committed tree. |

The only tests are `tests/import-resolver.test.js` (`npm test`), because the `@import` resolver is the one piece with no runtime error surface. Everything else is checked by `npm run validate`; there is no way to run a single script outside Figma — scripts must be exercised in the plugin.

## Architecture

Standard two-context Figma plugin, with a script-runner layered on top.

**`src/code.ts` → `dist/code.js`** (sandbox / "backend", the only real TypeScript in the repo). Handles a message switch on `msg.type` (`RUN`, `SAVE`, `SAVE_BATCH`, `LIST`, `DELETE`, `GET_OPTIONS`, window/state persistence). User scripts are persisted in `figma.clientStorage` under `userScripts`; prebuilt scripts are baked into the bundle and read-only.

**`src/ui.html` → `dist/ui.html`** (iframe UI, ~6k lines, monolithic on purpose). Contains the CodeMirror editor, script list/search, import/export, and — importantly — the `@import` resolver. All script *sources* are embedded here at build time as base64 JSON in `<script id="scripts-data">`.

**Script execution.** `RUN` builds a `new Function('figma', 'console', 'window', code)` and calls it with the real `figma`, a console that mirrors to `figma.notify` + the console bridge, and a **mock `window`** carrying InfoPanel/progress plumbing (`_infoPanelHandler`, `codefigRunComplete`, op counters). `selection` and `currentPage` are injected as consts. Consequences:
- Scripts are **plain ES2017 JavaScript**, despite the `.ts` extension (the extension is only for IDE convenience). No `interface`, `type`, `as`, or annotations — they reach `new Function` verbatim and throw. `npm run validate` enforces this by parsing each script the same way; it is not a convention you have to remember.
- `tsconfig.json` only includes `src/code.ts`; `scripts/**` is never type-checked or compiled.
- Completion is inferred: the backend polls for idle (`RUN_IDLE_MS`) unless the script sends `PROGRESS_COMPLETE` / calls `window.codefigRunComplete()`. `displayResults()` from `@InfoPanel` does this for you.

**`@import` is textual, resolved in the UI at run time — not a module system.** The resolver finds the source script by fuzzy name match, extracts the named functions' source text by brace-counting, and splices it in place of the `@import` line. So: only top-level `function f() {}` and `async function f() {}` declarations are actually extractable; top-level constants, objects, and classes in a library are *not*. (`var/const/let f = function|arrow` forms are recognised as *names* — a wildcard import lists them — but extraction then skips them silently.) A function declared with a TypeScript return annotation (`function f(): T {`) is also skipped, because the extracted text is spliced straight into `new Function` where an annotation is a SyntaxError. Import failures degrade to a comment plus a notification, not an error.

**`src/import-resolver.js` is the single implementation**, consumed by the UI at run time and by `validate-scripts.js` at build time — there is no second copy to keep in sync. `build-import-resolver.js` inlines it into the `<script id="import-resolver-js">` block of `dist/ui.html` (a one-line stub in `src/ui.html`, never written back to source, same pattern as config-ui) and it must stay ahead of the main app script; `processRuntimeImports` throws if the `CodeFigImports` global is missing rather than letting every import silently degrade. Behaviour is pinned by `tests/import-resolver.test.js`, including the extraction limits above and a per-script check that shipped imports resolve to real injected source.

**`src/config-ui/`** (`parser.js`, `renderer.js`, `controller.js`, `bridge.js`) turns a script's config comment block into a rendered form. `build-config-ui.js` exports `inlineConfigUI(html)`, a pure string transform that concatenates these four files into the `<script id="config-ui-js">` block on the way to `dist/ui.html`. In `src/ui.html` that block is a one-line stub and stays that way — the bundle is never written back to source.

**`bundle-ui.js`** inlines vendors (CodeMirror, marked) into `dist/ui.html`, and `__CODEFIG_BUILD_IS_DEV__` is substituted with `true`/`false` so the production UI never reaches for localhost.

## Script authoring conventions (`scripts/`)

Layout drives behavior: `EXAMPLE_SCRIPTS/` and `CODEFIG_LIBRARIES/` → type `prebuilt`, `HELP/` → type `help`. Library files are `@`-prefixed (`@core-library.ts`, `@variables.ts`, `@styles.ts`, `@pattern-matching.ts`, `@replacement-engine.ts`, `@math-helpers.ts`, `@infopanel.ts`, `@codefig-ui.ts`, `@foundation-overview.ts`). New folders become new categories.

**Excluded from the build:** anything whose file or folder name starts with `_` or `.`, and `.bak*`/`.backup`/`.old`/`.tmp` files (`shouldExclude()`, duplicated in `build-scripts.js` and `validate-scripts.js`). The `_` prefix marks work in progress, and `scripts/` is **kept empty of it by convention** — every `.ts` under `scripts/` today ships. A `_`-prefixed script is a staging area, not a parking lot: graduate it or archive it. Superseded and abandoned scripts were evicted in Aug 2026 and live outside the repo at `~/codefig-archive/` (local only, never committed).

**Display name** resolves in order: `// SCRIPT_NAME: Foo` → first title comment line → prettified filename.

**Marker blocks** (all line comments, parsed by the UI):
- `// @DOC_START` … `// @DOC_END` — markdown docs tab.
- `// @UI_CONFIG_START` … `// @UI_CONFIG_END` — rendered as a **form**; annotations on each `var` line: `@options: a|b|c` (or `@options: variableCollections` for dynamic lists), `@radio`, `@multi`, `@label:`, `@placeholder:`, `@textarea`, `@showWhen: field=value|value`. `// # Heading`, `// ---`, and plain comments become headings/dividers/paragraphs.
- `// @CONFIG_START` … `// @CONFIG_END` — config shown in a code editor instead (used for object-literal configs the form parser can't represent).

**Long-running work:** use `collectNodesAsync`, `processWithOptimization`, `yieldToUI`, `showProgress` from `@Core Library`. Fully synchronous loops block the main thread and starve the progress bar.

## Gotchas

- **Builds mutate one tracked file.** `build-scripts.js` rewrites `manifest.json` (`networkAccess.allowedDomains`). After any `dev`/`build:dev`, run `npm run build:production` before committing or publishing so `localhost:8765` doesn't ship.
- **`figma-console.log`** (repo root) is where plugin and script logs land during `npm run dev`, via the bridge server in `figma-console-server.js`. It is deliberately un-gitignored (`!figma-console.log`) so agents can read it; the `prepare` script adds it to `.git/info/exclude`. Per `.cursor/rules/figma-console-log.mdc`: **read this log when working on anything under `scripts/`**, and when debugging plugin errors.
- `dist/` and the zips are gitignored; the GitHub release asset is built by CI from the tag.
