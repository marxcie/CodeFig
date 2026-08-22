# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CodeFig is a Figma plugin that runs user-authored JavaScript inside the Figma plugin sandbox, aimed at Variables, Styles, and design-system automation. It ships a curated library of scripts plus importable helper libraries.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | `build:dev`, then watches `src/` + `scripts/` and starts the console bridge server on :8765. Reload the plugin in Figma to pick up changes. |
| `npm run build:dev` | `validate:soft` (**warns, never blocks** — you need to be able to build a half-written script) → `tsc` → `build-scripts.js --dev` (which inlines the config-ui bundle, the `@import` resolver, `src/ui.css` and vendors into `dist/ui.html`). Adds `http://localhost:8765` to `dist/manifest.json`. |
| `npm run build:production` | Same without `--dev`, and `validate` **blocks**: a validation error fails the build. Leaves `localhost` out of `dist/manifest.json`. |
| `npm run validate` | `validate-scripts.js` — parses every script through `new Function` exactly as the sandbox does, both before and after `@import` resolution, then checks imports resolve and the piecewise-scale fixtures still hold. Prints `N error(s), M warning(s)`; **the exit code tracks errors only**. |
| `npm run validate:soft` | Same, but always exits 0. Exists so `build:dev` can warn without dying; nothing else should use it. |
| `npm test` | `node --test tests/` — fixture tests for `src/import-resolver.js`, the shared find/replace matcher, the dev-bridge job queue, and the UI's dev-only guard. No dependencies, no watch mode. |
| `npm run test:figma` | Runs the in-Figma specs in `scripts/_TESTS/` and exits on the result. Needs `npm run dev` and the plugin open on a dev build. `-- <filter>` runs matching specs only; `--verbose` prints each run's console output. Cases that mutate the document skip unless the file's name contains `codefig-test`. |
| `npm run figma:sync` | Blocks until the open plugin reports the build id in `dist/build-id.txt`, and returns **within a second of the reload** — the UI announces itself to the bridge on boot (`POST /hello`), so this reads `GET /presence` rather than asking the iframe anything. **Figma cannot reload a plugin from outside it** — there is no self-relaunch API, and `figma_reload_plugin` in the MCP tooling refreshes a different plugin's iframe in a different file (both tried). So the reload click stays; this removes the waiting around it. Run it after every dev build and before verifying anything. |
| `npm run figma:ui -- <command>` | Drives the **plugin UI** from the terminal: `listScripts`, `selectScript`, `readConfig`, `writeConfig`, `readInfoPanel`, `readPreview`, `readTabs`, `readForm`, `switchTab`, `setField`, `clickControl`. Needs `npm run dev` and the plugin open on a dev build. Dev only, and **refuses** to print an answer from a stale build rather than warning and continuing — a result from the wrong build looks like a pass, which is how two things got "verified" against code no longer on disk. `--allow-stale` to override. |
| `npm run figma:run -- <script>` | Runs a script **inside the open plugin** from the terminal and exits on its result. Needs `npm run dev` running and the plugin open on a dev build — it cannot launch Figma. `--code "<js>"` / `--file <path>` run a snippet instead of a bundled script. |
| `npm run bench:colors` | `benchmarks/colour-reads.js` — how closely a read reproduces the file, across sixteen **real** colour scales, in both models. Prints worst and mean 8-bit channel per set and **exits non-zero** above 14. `--save NAME` stores a baseline, `--vs NAME` prints the change per set. Fifteen seconds, so it is not in `npm test`; run it whenever the colour maths moves. |
| `npm run build:style-reference` | Regenerates `artifacts/style-reference.html` — the Style & UI reference in a browser, where a font size can be **measured** rather than eyeballed. Renders the specimen shelf with the real `src/config-ui/renderer.js` through `tests/dom-shim.js`, so it is the plugin's own markup and the only thing in the repo that *executes* the renderer. Committed on purpose; `tests/style-reference.test.js` fails when it is stale. |
| `npm run preview:panel` | Writes `artifacts/panel-preview.html` — **a whole script's Configuration UI in a browser**, running the real `renderer.js` against the real `src/ui.css`. `-- "Spacing"` picks another script; `-- Colors collectionName="color - lime" steps="25, 50, 950"` overrides string keys in its config block first, which is usually necessary because a panel that hides itself until a collection is chosen otherwise renders as an empty *General*. **Not** the style reference: that is a shelf of one control of each kind, and it cannot answer "does this look like the design", which is a question about how controls sit *next to each other*. The Colors chart rendered 268px wide inside a 944px block for a week and neither the shelf nor any test could see it. Gitignored, regenerated, dev only. |
| `npm run pack` | production build + `codefig-plugin.zip` — the *contents* of `dist/` (`manifest.json`, `code.js`, `ui.html`) at the archive root, matching the zip step in `release.yml`. Needs the `zip` CLI. |
| `npm run build:release -- patch\|minor\|major` | `release.js`: requires clean tree, builds, packs, then one `npm version` call for the bump — single commit (package.json + lockfile) and annotated `v*` tag. Build and pack run first on purpose: `npm version` refuses a dirty tree, and a validation failure must stop the release before a tag exists. No push unless `--push`; `--dry-run` skips bump/tag. Pushing the tag triggers `.github/workflows/release.yml`, which builds the release zip from the committed tree. |

**Colour matching has a third layer, and it is the one that catches regressions.** `npm test` checks
properties of the maths and `npm run test:figma` checks the API; neither notices a read drifting away from
the file. Colour matching regressed three times in a row with the suite green — a middle anchor read at one
step and applied at another, a curve fitted in one space and used in another, and an idea that measured well
against a baseline that was itself broken. **`npm run bench:colors` is the check that sees those**, because
it goes through `colorsAlignment` — the call the panel makes — on real ramps rather than through the engine
underneath. Measuring the maths instead of the pipeline is exactly how one of those shipped and got reported
as a five-fold improvement.

**Two test layers.** `npm test` (Node, no Figma) covers the pieces whose failures are **silent** rather than loud: `tests/import-resolver.test.js` (an unresolvable import degrades to a comment), `tests/pattern-matching.test.js` (wrong matching renames the wrong things, or nothing), `tests/console-bridge-queue.test.js` (a broken queue looks like "Figma isn't open"), `tests/ui-dev-guard.test.js` (an ungated localhost path would ship), and `tests/job-script-resolution.test.js` (a script the CLI cannot address). `npm run test:figma` runs `scripts/_TESTS/` **inside the plugin**, which is the only place real variable scopes, real style binding and real async collection loading exist. Everything else is checked by `npm run validate`.

**What fails a build.** Since scripts cannot run outside Figma, the validator is the only automated correctness gate, so it is deliberately split:

- **Errors → exit 1, `build:production` (and therefore `pack` and `build:release`) fails:** a script does not parse as plain JS, before *or* after `@import` resolution; an `@import` names a script or function that does not exist; **a runnable script calls a function that nothing defines after resolution** (see below); a piecewise-scale fixture regresses.
- **Warnings → exit 0:** display name falls back to the prettified filename.

Keep it that way. If you find yourself wanting to reach for `|| true` on `build:production`, the check that provoked it is either a real error worth fixing or miscategorised — recategorise it rather than disabling the gate. `.github/workflows/ci.yml` runs `validate`, `test` and a production build on every push and PR; `release.yml` runs the same before building the release zip.

## Architecture

Standard two-context Figma plugin, with a script-runner layered on top.

**`src/code.ts` → `dist/code.js`** (sandbox / "backend", the only real TypeScript in the repo). Handles a message switch on `msg.type` (`RUN`, `SAVE`, `SAVE_BATCH`, `LIST`, `DELETE`, `GET_OPTIONS`, window/state persistence). User scripts are persisted in `figma.clientStorage` under `userScripts`; prebuilt scripts are baked into the bundle and read-only.

**`src/ui.html` → `dist/ui.html`** (iframe UI, ~3.2k lines: a short head of stubs, ~110 lines of markup, and one monolithic app `<script>`). Contains the CodeMirror editor, script list/search, import/export, and — importantly — the `@import` resolver. All script *sources* are embedded here at build time as base64 JSON in `<script id="scripts-data">`.

**`src/manifest.json` → `dist/manifest.json`** is a *template*, not the manifest Figma loads. `writeManifest()` in `build-scripts.js` reads it, guarantees `https://api.figma.com` in `allowedDomains` (scripts like `comments-to-annotations` need it), appends `http://localhost:8765` only when `--dev`, and writes the result into `dist/`. It never writes back to `src/`. `main`/`ui` are therefore bare filenames (`code.js`, `ui.html`) — relative to `dist/`, where the manifest ends up. **Import `dist/manifest.json` in Figma**, not anything in the repo root.

**`src/ui.css`** is the app stylesheet (~1.8k lines), split out of `src/ui.html` so the UI's JS is navigable on its own. `build-app-css.js` exports `inlineAppCSS(html)`, which drops it into the `<style id="app-css">` block — a one-line stub in `src/ui.html`, never written back to source, same pattern as config-ui. Source order matters: the transform runs *before* `inlineVendors`, so the CodeMirror `<style>` elements (which replace the head `<link>` tags) still precede the app CSS that overrides them. Section order inside the file matters too — it is specificity- and order-dependent, so append rather than reorder.

**CSS for a new control goes on new classes.** Appending a rule to a class the rest of the UI already uses silently restyles everything above it, and no test can see it — `@rows` reused `.config-ui-row`, which is the wrapper on every form row (headings, paragraphs, dividers, fields), and boxed every config form in the plugin. The tell to watch for is a follow-up rule *unsetting* what you just set, somewhere it looked wrong: that means the class is shared and the styling is on the wrong one. **The same mistake runs the other way too**: an existing rule leaking *into* a new control. `.config-ui-input--text` is `width: 70%`, which is right for the flat label/control layout and left 30% of every `@rows` cell empty — a gap that measured 37px where the CSS said 8px. Scope the correction to the new control's own class; do not change the shared rule. `tests/ui-css-shared-classes.test.js` fails when a rule whose selector is exactly a shared wrapper sets a box property, and keeps a control's parts under one namespace so `.config-ui-rows-cell` cannot be one hyphen away from `.config-ui-row--divider`.

**The Figma frames are the reference for UI, not `artifacts/ui-mockup.html`.** The mockup was inspiration and has boxes; Márton's designs do not. When they disagree, Figma wins; when Figma does not say, ask rather than reaching for the mockup.

**Script execution.** `RUN` builds a `new Function('figma', 'console', 'window', code)` and calls it with the real `figma`, a console that mirrors to `figma.notify` + the console bridge, and a **mock `window`** carrying InfoPanel/progress plumbing (`_infoPanelHandler`, `codefigRunComplete`, op counters). `selection` and `currentPage` are injected as consts. Consequences:
- Scripts are **plain ES2017 JavaScript** — `.js` files, never compiled. No `interface`, `type`, `as`, or annotations: they reach `new Function` verbatim and throw. `npm run validate` enforces this by parsing each script the same way, so it is not a convention you have to remember. (Everything under `scripts/` carried a `.ts` extension until Aug 2026, which is why editors and agents kept suggesting syntax that failed only in Figma.)
- `tsconfig.json` only includes `src/code.ts`; `scripts/**` is never type-checked or compiled.
- Completion is inferred: the backend polls for idle (`RUN_IDLE_MS`) unless the script sends `PROGRESS_COMPLETE` / calls `window.codefigRunComplete()`. `displayResults()` from `@InfoPanel` does this for you.

**`@import` is textual, resolved in the UI at run time — not a module system.** The resolver finds the source script by fuzzy name match, extracts the named functions' source text by brace-counting, and splices it in place of the `@import` line. So: only top-level `function f() {}` and `async function f() {}` declarations are actually extractable; top-level constants, objects, and classes in a library are *not*. (`var/const/let f = function|arrow` forms are recognised as *names* — a wildcard import lists them — but extraction then skips them silently.) A function declared with a TypeScript return annotation (`function f(): T {`) is also skipped, because the extracted text is spliced straight into `new Function` where an annotation is a SyntaxError. Import failures degrade to a comment plus a notification, not an error.

**Comments are not respected — with one exception.** A commented-out `// @import` still imports (`// ` stays put and the injected functions land on the lines below it). The exception is a `// @DOC_START` … `// @DOC_END` range: `findImports` skips anything inside one, so a script can document the import syntax without executing its own examples. Both markers are required — an unterminated `@DOC_START` is not treated as running to end of file, because a stray marker silently disabling every import below it reads as "the script does nothing". The rule lives in `findDocBlockRanges` in `src/import-resolver.js`, so the UI and the validator cannot disagree, and it is what lets `validate-scripts.js` carry no per-file exemption for `scripts/HELP/help-documentation.js`.

**Extraction follows calls, not references.** A function *called* in the extracted text is pulled in with it; a function handed over as a value — `findByStamp(candidates, domain, token, foundationStampData)` — never is, because it is never called there. It resolves to `undefined` in the sandbox, and `validateResolvedCalls` cannot see it either, since that only looks at calls. So it validates clean and fails in Figma. Inline the callback rather than naming it.

**Imports do not bring cross-script dependencies.** Extraction follows the functions a target calls only *within the same source script*. So importing `nodeUsesMatchingStyle` from a script does **not** bring `nameMatches` from `@Pattern Matching` — you must import that too. This fails at run time with a `ReferenceError`, usually swallowed by a caller's `try/catch` and seen as "nothing happened". `validateResolvedCalls()` in `validate-scripts.js` makes it a build error instead, for runnable scripts (a library's calls resolve in its consumer's context, so libraries are exempt by design).

**`src/import-resolver.js` is the single implementation**, consumed by the UI at run time and by `validate-scripts.js` at build time — there is no second copy to keep in sync. `build-import-resolver.js` inlines it into the `<script id="import-resolver-js">` block of `dist/ui.html` (a one-line stub in `src/ui.html`, never written back to source, same pattern as config-ui) and it must stay ahead of the main app script; `processRuntimeImports` throws if the `CodeFigImports` global is missing rather than letting every import silently degrade. Behaviour is pinned by `tests/import-resolver.test.js`, including the extraction limits above and a per-script check that shipped imports resolve to real injected source.

**Ask the question, don't store the answer.** Three times in the Colors build a piece of *derived* state was given a variable, and each time the variable became the bug: an `onLadder` flag for the Apply banner (deleted before it shipped), and an `untouched` flag to keep the preview quiet on load — which cost a flag, a snapshot, a clearing path and a fault in each, because the snapshot it compared against was reassigned before the comparison ran, so no edit ever registered and the whole panel looked dead. Both questions were answerable on demand: *is the config's output equal to the file's?* If a display decision can be re-derived from the config and the file, derive it on every render. State that exists only to remember what the user already did is state that will disagree with them.

**A variable does one job.** `configLastValues` was a copy of the form's values serving address detection *and* last-values-seen, and a third meaning was then assumed of it — "the values at projection time" — which it never was: it is reassigned on every change, before the change is handled. Reading the name instead of the writers cost a day. If you need a new fact, give it a new variable.

**A name is a label; the stamp is the identity.** Every generated token carries a `stamp` in shared plugin data — `{ owner, domain, set, token }` — and every set carries a minted id its manifest is keyed by. Nothing that identifies a set or a token is a name, because names are the thing users change: renaming a group, a token or a mode is ordinary design-system housekeeping, and each of those used to break the record. The token key in a stamp is the variable's name *minus the group prefix*, so the mutable half is exactly the half identity excludes. A run brackets its write with `alignStampedTokens` (before, so a regroup is a move rather than a duplicate) and `stampGeneratedTokens` (after, so the next run can do the same); `writeManifest` in between is what mints the id, which is why the stamping pass follows it. Where a set *currently* lives is derived from its stamps on every read (`deriveSetGroup`) rather than read out of the manifest — the manifest's `group` is last-known, and a disagreement is a drift to display, not a warning to raise. This is the *"ask the question, don't store the answer"* rule applied to the one field a user is most entitled to change. `readManifest` is the cheap sync read by recorded group; `findFoundationSet` is the one that costs a document read and gets it right.

**Two config formats, and the conversion lives in the UI.** A foundation config exists in two shapes, and mixing them up is the source of most of the churn in this area:

- **v1 JSON is the storage format.** Manifests on collections, the registry on `figma.root`, anything written through `setSharedPluginData`. It is versioned, whitelisted (`foundationSliceKeys`) and never shown to anyone.
- **The script's `@CONFIG_START` block is the human format.** Comments, key order and nesting are the point, not incidental — it is the thing a person reads, edits and pastes between files.

Neither is derived from a printer that renders the other. **The block is the format**: importing a config fills values into the pristine block the UI already holds, so comments and key order survive by construction rather than by a round-trip test. That conversion is UI-side, because the UI is the only context with every script's source embedded — the sandbox runs user scripts through `new Function` and cannot reach another script's text.

**`scripts/CODEFIG_LIBRARIES/@bezier.js` is inlined into the UI as well as shipped.** It is the single implementation of the curve maths — a user script `@import`s it and the sandbox runs that text, and the config UI needs the same arithmetic to *draw* the editor. `build-bezier.js` exports `inlineBezier(html)`, which wraps it into the `<script id="bezier-js">` block as `window.CodeFigBezier`, ahead of config-ui because `renderer.js` reads that global. It also exports `loadBezierGlobal()`, the same object for Node — used by `build-style-reference.js` (so the reference page draws real curves rather than nine empty boxes) and by `tests/config-ui-curve.test.js`. One export list, three consumers; a function renamed out from under the editor fails the build instead of drifting. A second copy of the maths in `src/config-ui/` would be two answers to "where does this handle sit", which is the one question the editor exists to answer.

**A curve is a flat array of numbers**: 4 for one cubic segment, 10 for two with a middle anchor, `[]` for no curve. The coordinates are the whole value — no family name is stored beside them, so the preview cannot show one curve while a run generates another, and the preset caption is looked up from the numbers on every redraw rather than remembered. That is the *"ask the question, don't store the answer"* rule, applied to the thing most likely to want a flag.

**`bezier` replaced `modular` as a scale model, and generates identical numbers.** A constant ratio is a straight line in log space, so a straight bezier between the ends a ratio implies reproduces it term for term (pinned in `tests/scale-models.test.js` to 1e-12). `modular` is still accepted and converts through `modularAsBezier` — not politeness: those scales are already variables in people's files, and a token that comes back a different number breaks every binding to it. It is kept out of `scaleModelNames()` so nothing offers it to anyone new.

**`src/config-ui/`** (`parser.js`, `renderer.js`, `controller.js`, `bridge.js`) turns a script's config comment block into a rendered form. `build-config-ui.js` exports `inlineConfigUI(html)`, a pure string transform that concatenates these four files into the `<script id="config-ui-js">` block on the way to `dist/ui.html`. In `src/ui.html` that block is a one-line stub and stays that way — the bundle is never written back to source.

**`bundle-ui.js`** inlines vendors (CodeMirror, marked) into `dist/ui.html`, and `__CODEFIG_BUILD_IS_DEV__` is substituted with `true`/`false` so the production UI never reaches for localhost.

**In-Figma tests.** `scripts/CODEFIG_LIBRARIES/@test-harness.js` is a `describe`-less runner (`testBegin`, `it`, `itInTestFile`, `expect`, `testFinish`, `withScratchPage`, `cleanupTestArtifacts`) for specs that need the **real** Figma API — real variable scopes, real style binding, real async collection loading. It **ships** (no `_`), because a spec resolves its imports against the *embedded* scripts at run time, so an unshipped library would be unimportable. Its state lives on the mock `window`, since `@import` cannot extract a top-level `const`.

Specs live in `scripts/_TESTS/` and are **not** embedded, so the plugin cannot resolve them by name — `figma-test.js` reads each from disk and sends it to the queue as raw `code`, which is also why aggregation lives in the CLI rather than in a runner script inside Figma. A spec may `@import` from a *shipped script*, not just a library (`@import { renameStylesSingle } from "Rename styles"`), so specs exercise shipped code rather than a copy of it.

Two rules a spec must follow: call `testFinish()` (completion is inferred, so silence reads as a timeout), and put anything that mutates the document in `itInTestFile`, which only runs in a file whose name contains `codefig-test`. Test-created objects are named `__codefig-test__/…` and removed in a `finally`.

## Script authoring conventions (`scripts/`)

Layout drives behavior: `EXAMPLE_SCRIPTS/` and `CODEFIG_LIBRARIES/` → type `prebuilt`, `HELP/` → type `help`. Library files are `@`-prefixed (`@core-library.js`, `@variables.js`, `@styles.js`, `@pattern-matching.js`, `@replacement-engine.js`, `@math-helpers.js`, `@bezier.js`, `@infopanel.js`, `@codefig-ui.js`, `@foundation-overview.js`). New folders become new categories.

**Excluded from the build:** anything whose file or folder name starts with `_` or `.`, and `.bak*`/`.backup`/`.old`/`.tmp` files (`shouldExclude()`, duplicated in `build-scripts.js` and `validate-scripts.js`). `_` means **"never shipped"**, which covers two different things:

- **Work in progress** — a staging area, not a parking lot: graduate it or archive it. `scripts/EXAMPLE_SCRIPTS/` is kept empty of `_` files by convention; every `.js` there today ships. Superseded scripts were evicted in Aug 2026 and live outside the repo at `~/codefig-archive/` (local only, never committed).
- **`scripts/_TESTS/`** — the one standing exception, added Aug 2026. In-Figma specs run through `npm run test:figma`; they are never shipped but are not going anywhere either. `validate-scripts.js` passes `{ includeStaging: true }` to `findAllScripts` so specs are still parse- and import-checked — a spec that does not parse must fail `npm run validate`, not fail cryptically inside Figma. Every other caller of `findAllScripts` wants the shipped inventory, so the flag defaults to off.

**Display name** resolves in order: `// SCRIPT_NAME: Foo` → first title comment line → prettified filename.

**Marker blocks** (all line comments, parsed by the UI):
- `// @DOC_START` … `// @DOC_END` — markdown docs tab.
- `// @UI_CONFIG_START` … `// @UI_CONFIG_END` — rendered as a **form**; annotations on each `var` line: `@options: a|b|c` (or `@options: variableCollections` for dynamic lists), `@radio`, `@multi`, `@label:`, `@placeholder:`, `@textarea`, `@showWhen: field=value|value`. `// # Heading`, `// ---`, and plain comments become headings/dividers/paragraphs.
- `// @CONFIG_START` … `// @CONFIG_END` — config shown in a code editor instead (used for object-literal configs the form parser can't represent).

**The annotation list above is not the whole list, deliberately.** The **Style & UI reference** *is* the list, and it lives in two places that are one thing: the `## Style & UI reference` section and the `@UI_CONFIG` specimen shelf in `scripts/HELP/help-documentation.js` (in the plugin: that script's Documentation and Configuration UI tabs), and **`artifacts/style-reference.html`**, generated by `build-style-reference.js` from the same config block via the real `renderer.js`. Use the page when a *number* is in question — it loads `src/ui.css` in a browser and prints every computed size, weight and box value, which is the one thing a Figma panel cannot show you. `tests/style-reference.test.js` derives coverage from `renderer.js` and `parser.js` and reads the stated token values back out of `src/ui.css`, so a control that exists without a specimen, a documented value that has drifted, and a stale HTML page are all build failures. Copying the list into a second place here would be the seam that reference exists to close — send people there instead.

Two rules that only bite when authoring one:

- **`@helper:` runs to the end of the line and must be last.** It is prose, and prose about this plugin says things like "an object with no `@rows`" — so it cannot stop at the next `@word`. Anything written after a note becomes part of it, which is why `serialize` emits it last.
- **`// # Title` is level 1**, so a config form's section headings are `h1`, styled by `.config-ui-form--rows .config-ui-row--heading h1` — *not* by the `.docs-rendered h1` the Documentation tab uses. The two ladders are different sizes on purpose. A rule written for the wrong one is silent: it validates, it ships, and nothing on screen changes.

**Long-running work:** use `collectNodesAsync`, `processWithOptimization`, `yieldToUI`, `showProgress` from `@Core Library`. Fully synchronous loops block the main thread and starve the progress bar.

## Where things are written down

- **`CHANGELOG.md`** — user-facing changes. Add to `[Unreleased]` as you land a change, not at
  release time; `build:release` does not touch it.
- **`DEFERRED.md`** — known issues and work deliberately not done, each with how it was found and
  what fixing it involves. Add to it whenever you decide *not* to chase something.
- **`.plans/`** — the numbered plan files (gitignored, local only). All of 01–12 are done.

## Gotchas

- **Never delete a variable, a collection or a style.** A variable's id and its published key are
  minted at creation. Delete and recreate and every node bound to it in this file loses its
  binding, and every file subscribing to the published library gets a "missing variable" it cannot
  relink. **Rename is safe** — id and key survive it — so **update-in-place is the only
  regeneration strategy that keeps a library alive**. Applies to generators, to adoption, to
  cleanup passes and to anything that "tidies". Orphaned tokens are *reported*, never removed
  unless the user asks, and the wording tells them what breaks. `merge-variable-collections` is the
  one script that removes a collection, by design, and it refuses when the collection is published
  (`getPublishStatusAsync`). Test scratch under `__codefig-test__/` is exempt: it is neither
  published nor consumed.
- **Builds write only to `dist/`.** No tracked file changes as a result of any build, so `git status` stays clean after `dev`/`build:dev` and you never need a production build before committing. If a build ever dirties the tree again, that is a bug — fix the build, don't add a warning here.
- **The two zip paths must change together.** `pack-plugin.js` and the zip step in `.github/workflows/release.yml` produce what is supposed to be the same archive by separate code, and CI's is the one users download.
- **Restart `npm run dev` after changing `figma-console-server.js`.** The watcher covers `src/` and `scripts/`, not the bridge itself, so a route you just added does not exist in the running process. An old bridge treats any POST as a log append, so a new route silently succeeds and writes your request into `figma-console.log` — `figma-ui.js` detects that and says so rather than failing on a JSON parse.
- **The reload loop: build, say so once, wait in the background.** The click cannot be automated, so
  the shape that works is `npm run build:dev` → *tell whoever is at the keyboard to reload, once* →
  start `npm run figma:sync` **in the background** and carry on with something else until it returns.
  It returns within about a second of the reload, because the plugin announces itself (`POST /hello`)
  rather than being asked. Do **not** run sync in the foreground with a short timeout and then poll
  its output file: that was the old failure mode, and it made a one-second reload look like a
  three-minute stall. `GET /presence` is also readable directly when you just want to know which
  build is out there — it carries `lastSeen`, so a build id left behind by a closed Figma is
  distinguishable from a plugin that is actually running.
- **The dev bridge does three things.** `figma-console-server.js` serves the console log, a job queue (`POST /jobs`, `GET /jobs/next`, `POST /jobs/:id/result`) — the only way to start a real in-Figma run from outside Figma, since the plugin polls, runs and reports back — and a **UI command queue** (`POST /ui`, `GET /ui/next`, `POST /ui/:id/result`), the same trick for the iframe. `npm run figma:ui -- <command>` presses buttons, reads the config editor and reads the InfoPanel, so a UI bug is diagnosable from the terminal instead of by describing it to whoever has Figma open. Both queues are one implementation (`createQueue`). **Commands are named, not evaluated** — there is deliberately no way to send JavaScript for the iframe to run, and `tests/ui-command-surface.test.js` fails if one appears. In-memory, no auth, **dev builds only**: every request goes through `_codefigBridgeFetch` in `src/ui.html`, the single guarded place the UI touches localhost. `tests/ui-dev-guard.test.js` fails if an ungated path appears, so add new bridge calls through that helper rather than calling `fetch` directly.
- **Reload the plugin after a dev build.** The open plugin keeps running the bundle it loaded, so a newly added library looks like a broken import. Builds now stamp `dist/build-id.txt` and the UI reports its id with every job result, so `figma:run` and `test:figma` say "the plugin is running an older build" instead of leaving you to guess.
- **A queued script must signal completion.** Completion is inferred (`RUN_IDLE_MS`), so a job waits for `window.codefigRunComplete()` or `displayResults()` and otherwise reports a timeout after 120s.
- **`figma-console.log`** (repo root) is where plugin and script logs land during `npm run dev`, via the bridge server in `figma-console-server.js`. It is deliberately un-gitignored (`!figma-console.log`) so agents can read it; the `prepare` script adds it to `.git/info/exclude`. Per `.cursor/rules/figma-console-log.mdc`: **read this log when working on anything under `scripts/`**, and when debugging plugin errors.
- `dist/` and the zips are gitignored; the GitHub release asset is built by CI from the tag.
