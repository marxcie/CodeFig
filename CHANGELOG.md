# Changelog

All notable changes to CodeFig. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/).

## How to add an entry

Add it to **`## [Unreleased]`** as you land the change, not at release time — the reason for a
change is easiest to write down while you still remember it. `npm run build:release -- <bump>`
does **not** update this file; rename the `[Unreleased]` heading to the new version yourself in
the same commit.

Group under **Added / Changed / Fixed / Removed / Developer**. Write for someone deciding
whether an upgrade will disturb their file: say what changes in behaviour, not which functions
moved. Anything that changes what a script *does to a document* belongs under **Changed** with
a plain statement of the new default.

---

## [Unreleased]

The find/replace scripts were the focus: they now agree on what a pattern means, and they show
you what they will do before they do it. The Design System Foundations scripts also stopped
deleting variable modes they did not recognise.

### Added

- **Foundation config** — a new Design System Foundations script that moves a config between
  files. It reads the viewports and generated sets a file already has and hands you the config
  **in the shape your scripts already use**: paste it straight between `// @CONFIG_START` and
  `// @CONFIG_END` in Grid, Spacing, Corner radius or Typography. It can also park the config in
  a text layer on canvas and read it back, and `check` tells you what a pasted config would mean
  without writing anything. Older configs load too — `structure.*`, `spacingScaling`,
  `fontScaling`, `figmaStyles`, `roundUpperValuesTo` — and every translation is listed, so a
  paste never quietly means something else. It never generates variables: reading a config writes
  the viewport list and nothing more.

### Changed

- **Find/replace now means one thing across the library.** Six scripts took a name pattern and
  no two agreed: contains vs prefix, case-sensitive vs not, wildcards in three of them, three
  separate replace implementations. All six now share one matcher.
  - Matching is **contains** and **case-insensitive** by default. Tick **Match case** for
    case-sensitive.
  - `*` is a wildcard in every field that takes a pattern. A CodeFig extension — Figma has no
    wildcard.
  - **Regex is an explicit toggle.** It used to be inferred from the presence of brackets or
    parens, which silently mangled ordinary names (see Fixed). Tick **Use regular expression**.
  - A **blank find replaces the entire name**, matching Figma's blank Match field.
  - `rename-variables` scoping works the way it reads: `Typography/Body` now scopes to that
    group. It previously matched a case-sensitive prefix against a spaced-slash path, so the
    obvious spelling matched nothing.
- **Preview is on by default** in `rename-styles`, `rename-variables`, `replace-styles`,
  `replace-variables` and `replace-style-variable-bindings`. A run lists what it *would* change
  and changes nothing; untick **Preview only** and run again to apply. Rows are flagged when the
  new name already exists, when two rows produce the same name, when a pattern matched but
  changed nothing, or when the result would be empty. `select-by-styles-variables` has no
  preview by design — it only changes the selection.
- **`$n` / `$N` counters are positional**, so they depend on the set of matches. Preview and
  apply are two runs; if the file changes in between, the numbering moves. The apply run now
  says so when the plan no longer matches what was previewed.
- Scripts that gained capability they did not have: `replace-styles` and `replace-variables` now
  support the `$&` / `$1` replacement tokens; `select-by-styles-variables` and
  `replace-style-variable-bindings` now support `*` wildcards.
- Figma's default `Mode 1` on a newly created collection is now renamed to your first viewport
  rather than deleted and replaced, which uses one fewer mode from your plan's budget.
- Grid now honours a nested `{ config: { collectionName, group } }` config the way Spacing,
  Corner radius and Typography always have. Previously it read only the top level, so a pasted
  config quietly wrote to `Responsive System`.
- **Import this file's config into a Design System Foundations script.** A button beside the
  results button fills the config block from what this file already has, in one click, and names
  where it came from — *imported from Responsive System · Spacing*. It appears only when this file
  actually has a config for that script. **Nothing is read from your file until you press it**, so
  a config you paste into the editor is always the config that runs, and Cmd-Z undoes an import.
  The imported values live in the editor, not in the script: switching scripts and back brings the
  shipped defaults again, and one click brings your file's settings back.
- `npm run figma:run -- <script>` still runs the script's own config. `--from-file` imports this
  file's config first, the way the button does; `--config <path>` supplies one explicitly. Every
  run prints which of the three it used.

### Fixed

- **Running a Design System Foundations script no longer deletes variable modes it does not
  recognise.** Previously, because all four scripts share one collection and each carried its own
  list of viewports, running one could remove another's modes — and every value stored in them.
  Renaming a viewport in one script, or adding a mode by hand, was enough. Modes are now only ever
  added; anything else in the collection is reported and left alone.
- **A token value of `0` is now written.** It was silently skipped, so a spacing or radius token
  could not be changed *to* zero: the old value stayed and nothing was logged.
- **`searchFor = "Text [Legacy]"` no longer mangles unrelated names.** Regex auto-detection read
  `[Legacy]` as a character class, so `Text Legacy Body` became `Textegacy Body` with no warning
  and no preview. Same class of bug: `Brand (2024)/` also renamed `Brand 2024/Accent`.
- **An unconfigured rename no longer empties every name.** With the new blank-find rule, running
  `rename-styles` or `rename-variables` on an untouched form renamed everything in scope to an
  empty string. Both now refuse a run with nothing configured, and skip any rename that would
  produce an empty name.
- **`corner-radius` and `spacing` no longer crash when a grid size is set.** Both called
  `roundToGrid()`, which was declared only in `typography`, so the call threw `ReferenceError`
  on that path. All three now use `snapScaleGrid()` from `@Math Helpers`.
- **A documented `@import` example no longer runs as a real import.** `@import` inside a
  `// @DOC_START` … `// @DOC_END` block is now treated as documentation. Opening **Help &
  documentation** showed an "Import failed" notification for the placeholder
  `@import { myFunction } from "My Custom Script"`, and its other three examples were injecting
  library source into the script for no reason. Write examples in your own doc blocks freely;
  outside a doc block, a commented-out `// @import` still imports, unchanged.
- Wildcards work in the default match path again (`compilePattern` produced "zero or more
  literal dots" from every `*`).
- Three libraries were real TypeScript, which made 60 of their 71 functions impossible to
  import; imports that appeared to work were resolving to nothing.
- `scripts/HELP/` is typed as `help`, not `prebuilt`.

### Removed

- 42 scripts that never shipped. Everything under `scripts/` now ships, apart from `_TESTS/`.

### Developer

- **One canonical config shape.** A single v1 shape now covers paste, the per-set manifest and
  export, with one compat reader in `@Foundation` that accepts every earlier shape and reports
  what it translated — replacing the four half-overlapping readers the DSF scripts each carried.
  `toDomainConfig(v1, domain)` converts back to the shape today's scripts read, so a v1 config
  works with them unchanged; each generator drops its branch of that bridge as it is rewritten.
  v1 carries **declared inputs only**: a run mutates its config in place, and exporting a
  derivation would freeze it.
- `createCopyResult` and `requestClipboardCopy` in `@InfoPanel`, replacing the copy plumbing
  written twice in `export-import-variables` and `copy-simple-variables-json`.
- Importing a config is a **script run flagged silent**, not a backend feature: the button, the
  run and the CLI all read the file through `readFoundation`, so there is one implementation and
  nothing to keep in sync. A config reaches a run as a prepended `var` that each script's existing
  `typeof x !== 'undefined' ? x : {…}` guard picks up, so no script needed changing. The dev
  bridge's `args` field, carried end to end and used by nothing, now carries it.
- `@fromFile:` in a config block declares where a field's value comes from, and survives the form
  serializer's `parse → serialize` round trip — an annotation it dropped would silently remove the
  button from the script.
- **New `@Foundation` library.** One viewport registry per file, one manifest per generated token
  set, and one copy of the helpers that had been written five times across the Design System
  Foundations scripts. Two collections can hold two sets — "Spacing A" and "Spacing B" — while
  sharing the file's viewports. Reading it back reconciles the registry against the collections'
  modes and the `viewport-width` variable, and where they disagree the file wins and the
  disagreement is reported. Nothing generates tokens through it yet; the four scripts adopt it as
  they are rewritten.
- `@import` now prefers an exact script-name match over a substring one. Every rule used to be
  tried at once and the winner was whichever script the build read first, so
  `@import … from "@X"` could resolve to `@X something else`.
- **Run scripts in Figma from a terminal.** `npm run figma:run -- <script>` hands a job to the
  open plugin and exits on its result; `npm run test:figma` runs the in-Figma specs in
  `scripts/_TESTS/`. Both need `npm run dev` and the plugin open — Figma has no headless mode.
  The dev bridge and its queue are localhost-only and unreachable from a production build.
- **In-Figma test harness** (`@Test Harness`) for specs that need the real API. Cases that mutate
  a document only run in a file whose name contains `codefig-test`.
- `npm test` grew from 30 to 130+ Node tests, covering the pieces whose failures are silent:
  the `@import` resolver, the shared matcher, the preview library, the plan/apply split, the
  bridge queue, script-name resolution and the dev-only guard.
- `npm run validate` now fails a build when a runnable script calls a function nothing defines
  after `@import` resolution — the gap that hid the `roundToGrid` crash.
- `validate-scripts.js` carries no per-file exemptions. The doc-block rule above removed the last
  one (`help-documentation.js`), which had been silencing every import check for that file.
- `build:release` bumps with a single `npm version` call instead of bumping, syncing the lockfile,
  staging and committing by hand. That dance existed because builds used to rewrite a tracked
  `manifest.json`; they no longer touch a tracked file. Same commit message, same annotated `v`
  tag, and build + pack still run before the bump so a validation failure stops the release
  before a tag exists.
- Builds no longer touch a tracked file. `manifest.json` moved to `src/manifest.json` as a
  template and the build generates `dist/manifest.json`. **Import `dist/manifest.json` in
  Figma**; existing dev setups must re-import once.
- Builds stamp a build id, so the tooling can tell a stale plugin from a broken one and say
  "reload CodeFig" instead of leaving you guessing.
- `src/ui.css` split out of `src/ui.html`; every script renamed `.ts` → `.js`, which is what
  they always were.

---

## [1.0.6] and earlier

Released before this changelog existed. See `git log` and the GitHub releases; `v1.0.6` is the
last tag that predates the find/replace work above.
