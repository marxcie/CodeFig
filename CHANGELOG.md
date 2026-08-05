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
you what they will do before they do it.

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

### Fixed

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
- Wildcards work in the default match path again (`compilePattern` produced "zero or more
  literal dots" from every `*`).
- Three libraries were real TypeScript, which made 60 of their 71 functions impossible to
  import; imports that appeared to work were resolving to nothing.
- `scripts/HELP/` is typed as `help`, not `prebuilt`.

### Removed

- 42 scripts that never shipped. Everything under `scripts/` now ships, apart from `_TESTS/`.

### Developer

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
