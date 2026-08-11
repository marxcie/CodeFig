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

- **A Style & UI reference, inside Help & documentation.** Every control a script's settings form can
  render, live in that script's own Configuration UI tab, with the exact line that produces each one
  written underneath it — so a change can be asked for by pointing at the thing rather than describing
  it. Its Documentation tab holds the type scale, the spacing scale and the colours, and keeps the two
  heading ladders apart: the same `// # Title` is 20px in a Documentation tab and 16px as a form's
  section title, which is not obvious from either one alone.
- **A note under a field can mention an annotation.** `@helper:` text stopped at the next `@word`, so
  a note reading *"an object with no `@rows`"* was stored as *"an object with no"*. Notes now run to
  the end of the line, which means `@helper:` has to be the last annotation on it.
- **A panel fills itself from where it points.** When a collection and group name somewhere CodeFig
  has already generated, the settings load on their own and a line under Group says so — no button to
  find, and nothing to press. It never overwrites what you have typed: once you have edited anything,
  it stops filling and tells you a saved config is there instead.
- **Grid records what it generated**, the way Spacing and Corner radius already did. That is what
  lets the panel above fill itself, and what lets a config move between files. Plugin data only —
  no variable, name or binding is affected.
- **Pick a collection instead of typing its name.** The collection field is a list of the collections
  in your file, plus *Create a new one* for a name that is not there yet. It stays one setting — the
  name — because a collection whose name does not exist is created when you run, so there is nothing
  extra for a config to remember. Which of the two is about to happen is said before you run:
  *"Brand tokens" doesn't exist in this file — it will be created.* That also covers a config pasted
  from another file, where the collection genuinely may not be here.
- **Design System Foundations scripts have a form.** Their settings were only ever editable as code,
  because the form could not read the shape those blocks are written in. It can now, so every one of
  them opens on Configuration UI, and the config block is still exactly the thing you paste. Settings
  a form cannot represent yet stay editable in Configuration code and say so.
- **See the scale before you commit to it.** Spacing and Corner radius draw their scale in the
  Configuration tab and redraw it as you type — tokens down, modes across, each value as a bar,
  with the gaps under each column, because `1, 4, 8, 12, 16, 24` reads as regular until you see
  `3, 4, 4, 4, 8`. Nothing is written while you look: the preview generates in memory and cannot
  reach your document. The same picture appears in the results panel after a run, as the record of
  what was made.

- **Adopt a file CodeFig has never touched.** Point **Foundation config** at a group of spacing or
  corner-radius tokens in `adopt` mode and it works out how the scale was built — a base and a
  growing step, a fixed ratio, or a straight ramp — and records it, so the import button and
  `figma:run --from-file` work on a file made years before this plugin. **Nothing you can see
  changes**: no value, no name, no binding, nothing deleted or recreated. Where the numbers do not
  fit a model exactly it records them as they are and tells you what the closest fit would have
  changed, so switching is your decision and you see the cost first. A published collection is
  reported and left alone until you confirm, because recording writes plugin data and that shows
  subscribers a library update.
- **Foundation config** — a new Design System Foundations script that moves a config between
  files. It reads the viewports and generated sets a file already has and hands you the config
  **in the shape your scripts already use**: paste it straight between `// @CONFIG_START` and
  `// @CONFIG_END` in Grid, Spacing, Corner radius or Typography. It can also park the config in
  a text layer on canvas and read it back, and `check` tells you what a pasted config would mean
  without writing anything. Older configs load too — `structure.*`, `spacingScaling`,
  `fontScaling`, `figmaStyles`, `roundUpperValuesTo` — and every translation is listed, so a
  paste never quietly means something else. It never generates variables: reading a config writes
  the viewport list and nothing more.

### Removed

- **The import button is gone.** Auto-import replaced it: choose a Collection and a Group, and a
  recorded config loads itself with a line under Group saying so. The button only ever appeared when
  it had something to offer, which meant working out whether it *would* appear was a question you
  could not answer by looking — and it appeared a beat late after a run, which is now moot rather than
  fixed. Nothing else about loading changed: it still writes into the editor only, and your file is
  unchanged until you run.

### Changed

- **A settings form's heading sizes now step evenly:** 16 / 14 / 12, two pixels a level, with the
  smallest told apart from body copy by its weight. They were 20 / 14 / 14 — a jump, then no step at
  all.

- **Grid's config block lists its settings in the order the panel shows them** — collection, group,
  extra columns, then the per-viewport modes. A visible diff if you paste that block around, and no
  change to what any of it does.
- **Selects are the same height as text inputs.** They were two pixels taller everywhere, which only
  became obvious once a form put the two side by side. They also have a chevron of their own now
  instead of the browser's.
- **Rounding is spelled one way.** `roundTo` sits beside the other settings instead of inside
  `scaling`, because it applies whatever model a scale uses, while `scaling` describes a curve that
  only the `endpoints` model reads. Spacing and Corner radius shipped with
  `scaling: { type: "sine", ease: "in", roundTo: 2 }` above sets that all said `model: "metric"` —
  two descriptions of one scale, two of the three fields inert, and nothing to tell you which was
  live. Every old spelling still works and is promoted for you: `scaling.roundTo`,
  `roundUpperValuesTo` and the `fontScaling` alias all mean the same thing. A curve is only
  recorded when something reads it.
- **A mode that is not a viewport is left alone.** If a collection's modes are a density axis —
  `tight` / `relaxed` — rather than breakpoints, CodeFig says so and does not add them to your
  viewport list. Previously it adopted any mode it did not recognise as a viewport, which meant the
  tool decided which axis your collection used. Figma gives a collection one mode axis, so that is
  your decision. The message carries the way in: *"The registry is untouched — add them in Grid if
  they're breakpoints."* A file that has no viewport list yet gets one sentence pointing at Grid
  rather than a complaint per collection.
- **A scale can be described once instead of once per breakpoint.** Spacing and Corner radius take
  a list of parameter sets, each saying which modes it applies to. `appliesTo: "*"` means every
  mode the collection already has — the common case, which previously had to be written out once
  per viewport. Add a second set naming one mode and it overrides the wildcard there; the run says
  which set won for which mode. Two sets naming the same mode outright is a contradiction nobody
  can resolve from the config, so the run says so and writes **nothing at all** — no collection, no
  variable, no recorded set — rather than applying part of it. Configs written the old way keep
  working and are read as one set per mode.
- **A wildcard never creates a mode; naming one does.** `appliesTo: "*"` describes the modes a
  collection has, so it cannot add to them — otherwise a collection would gain modes whenever your
  viewport list grew. Naming a mode is a request, and a named mode missing from the collection is
  created. A collection that is new, or still has only Figma's default *Mode 1*, is seeded from the
  file's viewport list, and the run says which of the two happened, because only one of them
  changes the shape of your collection. With neither, the run says so and points at Grid.
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
- **The shipped Spacing and Corner radius defaults now generate a metric scale, not an endpoint
  range.** A metric scale is a base plus a step that grows every few tokens — 4, 8, 12, 16, 24, 32
  — which is how a spacing scale is normally written down. The previous default ran a curve
  between a minimum and a maximum, which meant working backwards from the numbers you wanted to a
  curve that happened to pass through them.

  **Your own configs are untouched.** A config with no `model` is read as `endpoints`, so anything
  you have configured produces exactly what it always did. What changes is the *starting point* in
  the shipped script — and because prebuilt scripts reload from the embedded source, that reaches
  you on upgrade if you have been running the shipped block as-is.

  Two things make that visible and reversible. Every run now prints the model and its parameters
  next to the created/updated counts — *"Desktop: metric, base 4, step 4, mod 3"* — so if the
  numbers move, the reason is in the output that reports the move. And if the file already has a
  recorded set, the **import button** hands your previous config straight back into the config
  block: that only works because the config shape and the import landed first.
- **Spacing and Corner radius record what they generated**, so the import button and
  `figma:run --from-file` can offer it back. Nothing about the variables they produce changes —
  the two scripts now share one generator, and a test proves the collapse value for value against
  frozen copies of the code it replaced.
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

- **The import button works again.** It reported that the config could not be read, on every file,
  whatever the config said. The text was fine — the button was calling something the UI had no way
  to reach.
- **Importing a config keeps your comments.** The import button used to replace the whole config
  block, so every note you had written in it was gone and Cmd-Z was the only way back. It now fills
  values into the block that is already there: anything the file does not have a value for comes
  out byte-identical, including comments, blank lines and the order you put things in. Where the
  shapes differ it says so — a viewport the file has and your block does not is added in the style
  of the entry above it, and one your block has and the file does not is removed **along with the
  comments written for it**, named in the summary so a deleted annotation is something you are told
  about rather than something you find later.
- **Your config no longer comes back with CodeFig's working notes in it.** A recorded set carried
  the resolver's own intermediate state — the sizes it worked out, which set overrode which — and
  handed it back as though you had written it. Only fields the config format declares are stored
  now. The same fix restored two things that were being quietly lost: parameter sets vanished from
  a recorded set entirely (so importing one fell back to the older per-viewport form), and
  Typography's `fontFamily` and Colors' themes were being kept in a bucket for unrecognised
  settings, which meant an untouched default config warned about itself the first time you ran it.

- **CodeFig no longer suggests deleting a variable collection, and will not delete a published
  one.** A variable's id and its published key are created with the variable: delete and recreate
  it and every layer bound to it loses its binding, while every file subscribing to your library
  gets a "missing variable" it cannot relink. Renaming is safe. Two places got this wrong. When a
  collection's modes matched your config but sat in a different order, the run told you to delete
  the collection and start again — it now recommends living with the order, says what deleting
  would cost, and says when your collection is published so the cost would land in other files
  too. And `merge-variable-collections` removed the source collection unconditionally; it now
  refuses when that collection is published, and no longer falls back to deleting its variables
  one by one.
- **An array or object value in a script's config form is no longer replaced with text when you
  edit another field.** A value like `var tags = ["a", "b"];` had no form control of its own, so it
  was shown as an editable text box holding `a,b` — and because the whole config block is written
  back whenever any field changes, touching an unrelated control replaced the list with the string
  `"a,b"`. These values are now shown read-only, with their own formatting kept exactly as you
  wrote it, until a control exists that can edit them; edit them in the Script tab meanwhile. No
  script that ships with CodeFig had such a field, so this only ever affected config forms you
  wrote yourself.
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

- **`distributeToMaxColumns` is gone from Grid.** It could make `col-6` mean "the same fraction of the
  grid as 6 of 12" rather than "six columns", by rounding the span for modes with fewer columns. The
  rounding made tokens collide: on an eight-column mode `col-1` and `col-2` were both one column, and
  `col-4` and `col-5` were both three — twelve variables holding eight distinct widths, with `col-6`
  measuring four columns. `col-s` is now always the width of `s` columns of that mode. If your config
  still sets it, the run says so and ignores it; if it was `true`, your `col-*` values change on any
  mode whose column count differs from the largest.

- 42 scripts that never shipped. Everything under `scripts/` now ships, apart from `_TESTS/`.

### Developer

- **`@rows`** — a repeatable-group control for a config field holding a list of objects. Add and
  remove rows; `@tabs` renders one tab per row using its `name` instead of stacking them, which is a
  display choice on the same control rather than a second control with its own serialization. A
  column can carry a fixed set of options: `model:(metric|modular|endpoints)`, parenthesised because
  the column separator is already a pipe. An untouched `@rows` line round-trips byte-identical, and
  the annotation survives the form changing the value — without that, the second interaction would
  render the field as an uneditable array.

- **One canonical config shape.** A single v1 shape now covers paste, the per-set manifest and
  export, with one compat reader in `@Foundation` that accepts every earlier shape and reports
  what it translated — replacing the four half-overlapping readers the DSF scripts each carried.
  `toDomainConfig(v1, domain)` converts back to the shape today's scripts read, so a v1 config
  works with them unchanged; each generator drops its branch of that bridge as it is rewritten.
  v1 carries **declared inputs only**: a run mutates its config in place, and exporting a
  derivation would freeze it.
- **Scales say when something moved their numbers.** Keeping a generated scale ascending can push
  colliding steps apart and pins its ends to the minimum and maximum — quietly, until now. Every
  value that changes is named in the run summary with what it was and why.
- **`@Scale Models`**: four ways to describe a scale — `endpoints` (a curve between a minimum and
  a maximum, what every earlier config is), `modular` (a fixed ratio per step), `metric` (a base
  plus a growing step) and `explicit` (your own numbers). Size sequences only: rounding, the
  monotonic guard, line height and letter spacing all stay with their callers. `max` is a limit
  only in `endpoints` — elsewhere the top comes out of the model, so a `max` beside it is ignored
  and an optional `clamp` warns rather than squashing. The ratio names keep their shipped values;
  a plain number is accepted for an exact one.
- **`@Linear Ramp`**: one generator behind Spacing and Corner radius, which were ~30 near-identical
  functions apart — 88 differing lines out of 916 once the domain words were normalised away, and
  seven values that genuinely differed. Both are now thin wrappers parameterised by tokens, name
  template, scopes and domain, so a fix to the scale maths lands in both. 916 lines became 232 plus
  a 455-line library.
- `createCopyResult` and `requestClipboardCopy` in `@InfoPanel`, replacing the copy plumbing
  written twice in `export-import-variables` and `copy-simple-variables-json`.
- **`npm run figma:run -- <script>` refuses a file that is not a `codefig-test` file**, and prints
  which file it is about to write to. Running a bundled script writes variables into whatever
  document happens to be open — a two-word command with a document-wide effect, and one that has
  already put six variables into a real brand file. `--force` overrides. Snippets through `--code`
  and `--file` are not gated; their author can see what they do.
- Importing a config is a **script run flagged silent**, not a backend feature: the button, the
  run and the CLI all read the file through `readFoundation`, so there is one implementation and
  nothing to keep in sync. A config reaches a run as a prepended `var` that each script's existing
  `typeof x !== 'undefined' ? x : {…}` guard picks up, so no script needed changing. The dev
  bridge's `args` field, carried end to end and used by nothing, now carries it.
- The import button's state is **one derived function** — `configImportState(configBlock, probe)`,
  pure and covered by Node tests — rather than three cached booleans computed at three different
  moments. The file is re-read on script open and after every completed run, including runs the
  CLI started, so a manifest written behind the UI's back cannot leave the button claiming
  something stale.
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
