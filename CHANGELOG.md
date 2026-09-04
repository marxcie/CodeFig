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

### Added

- **Colors: seed rebuilds the full scale.** Entering a seed hex writes bright / middle / dark hue and
  chroma (or saturation), lightness ends, and Linear curves for that mode — tints.dev-shaped UX on
  CodeFig's own model. Changing the hex again re-applies. **Lock seed color** keeps the exact hex on
  the seed step; unlock lets later edits move it. Shared OKLCH lightness ends follow the seed that
  was applied (other modes' hue/chroma stay put).
- **Colors: Token count.** A count control fills **Color tokens** with N names on the Tailwind
  50…950 rail (half-weighted end gaps). `11` is the exact Tailwind list; edit names freely after.
- **Copy these values to: Mode…** on Spacing, Corner radius, and Typography. On a mode tab when
  there are two or more modes, each other mode is a text link; click one to copy this mode's
  scale settings onto it (names stay). Asks before replacing settings that already differ. Grid
  and Colors stay unchanged.
- **DSF Group candidates as links.** When Collection holds more than one Grid / Spacing /
  Radius / Typography / Colors set (or the current Group points at none of them), their names
  appear as text links directly under the Group input. Click one to fill Group and load that
  set; after a load, sibling sets stay listed so you can switch without clearing the field. One
  candidate still auto-fills Group as before. Colors loads the scale unchanged (Original /
  `skipFit`); curve fit stays on demand when a channel tab opens.
- **Grid: Extra values.** Shared Mode-settings list for CSS-calc-style formulas
  (`col-1+gap`, `col-1*2+gap`, `margin-gap`, …) using `col-N`, `gap`, `margin` (the Margins
  field), and numbers with `+ - * /`. Each entry becomes a FLOAT variable with that name, valued
  per mode. Separate from Extra columns.

### Fixed

- **Colors seed write-back.** Applying a seed rebuilt the strip in memory, then crashed writing
  anchors into Source (`fillConfigBlock` returns `{ text }`, not a string). Fingerprints still
  latched, so later previews stayed greyscale except a locked pin on one step. Write-back uses
  `.text`, and fingerprints only latch after a successful write. Hex without `#` (and 3-digit) is
  accepted and normalised to `#RRGGBB`.
- **Colors seed middle on the curve.** Seed apply wrote middle hue/sat but left channel curves as
  empty Linear, which generation treats as ends-only — so the strip stayed muted and lock only
  pinned one vibrant step. Apply now writes Linear-with-middle channel curves so the scale peaks
  at the seed.
- **New-collection Group no longer clears on blur.** Address reset wiped Group whenever the
  collection was not the last one read, including after typing a group name on a new collection.
- **Hue curve chart: Linear across 0° is a straight line again.** Short-arc ramps (e.g. 60°→280°,
  or a middle at 290° between ends near 100°) were plotted as wrapped 0…360° samples, so the blue
  path wrapped around the wheel while the dashed guide took the long chord — start and end did not
  connect. Chart Y now follows the continuous short arc (same walk generation uses); tick labels
  stay ordinary degrees.
- **Typography Generate overview** now finds the text styles it just created. It used the
  variable Group (`Typography/`) as a style-name filter, but Style naming defaults to
  `{$fontScale}/{$fontWeight}` with no group folder — so the overview warned and drew nothing.
  It now matches the style names from Style naming × tokens × weights.
- **Typography** refuses to run when required fields are empty (Collection, Tokens, Font
  family; Font weights when Create text styles is on; at least one mode with a Base unit).
  Missing Font family used to write an empty `FONT_FAMILY` string, hit Figma's "unloaded
  font" error, and could move stamped variables first. The Info panel lists what to fill;
  nothing is written until the form is complete.

## [2.0.0] - TBD

**Foundations.** Generational config UX: `@PANEL_START` as live `var __codefigPanel = {…}` (values stay in `@CONFIG_*` / `@UI_CONFIG_*`); Configuration code tab removed. Script storage in Figma Variables with LocalStorage backup, settings gear, and canvas paste-share. Foundation maintain on open; copy/duplicate → new stamp identity. Design System Foundations open empty until a collection is chosen; ramp scripts scan for the group when none is recorded. Scoped preview CSS on DSF libraries (plans 29–32). Help rewritten as onboarding; utilities regrouped; Change case and nesting cleanup expanded.

### Added

- **Spacing / Corner radius / Typography Scale chart tip.** Hovering or dragging the growth
  handle (or a shape handle) shows the stored growth ratio and the open mode’s generated sizes as
  a number list — e.g. `1.5` above `0, 2, 4, 8, 16, 24, 40, 80, 120`. Tip sits right-centre of the
  handle.

### Changed

- **Typography** now creates and updates text styles by default, with **Style naming** filled as
  `{$fontScale}/{$fontWeight}` (add a folder prefix if you want). **Font weights** accept
  `450:Regular` so a variable-font number can keep a Regular / Semibold name. The panel adds a
  **Text wrap style** radio (`Auto`, `Balance`, `Pretty`); the font is loaded before wrap style is
  applied, so a run no longer stops after the first style.
- **Help: when to use `@UI_CONFIG` vs `@CONFIG`.** Writing a script now says: flat `var`s for a few
  separate settings; an object under `@CONFIG` when the body takes one nested config (Foundations).
  The form treats both the same.
- **Sidebar default width is 280px** (was 240px). Search + script list still resize between 200–400px.
- **Change case** panel is Target (canvas / styles-and-variables / optional collection) then General
  (case style, scope, recursive). Recursive stays visible for every target mix.
- **Change case** expands beyond frames and groups. Tick Canvas targets (component names, variant
  labels/values, layer names) and/or Styles and variables (variable names, style groups, style
  names). Scope is Selection / This page / All pages for canvas only. Case style adds hyphenated
  and ALL CAPS forms; the camelCase label is `camelCase`. Variables use one collection, optional
  group, and Recursive (target + children). Collisions are skipped and reported.
- **Help & documentation is CodeFig onboarding.** Overview, getting started, writing a script,
  three roles, library catalogue (each library’s DOC title), shipped-script catalogue (display name
  + DOC title), and common patterns come first. Style & UI reference stays last. Configuration UI
  opens with a specimen intro; the unsupported nested-object demo explains what that empty control
  means. Library API detail stays on each library’s Documentation tab.
- **`@PANEL_START` is a live JS object.** Shipped panels use `var __codefigPanel = { blocks: […] }`
  between the markers so Source syntax-highlights the recipe. The old `//`-commented JSON form
  still parses (saved scripts). Panel regions sit at top level — not inside the `@CONFIG` object.
  Utility panels that still looked like JSON (`"blocks":`) are reprinted in the same bare-key
  Help style as Design System Foundations, so every shipped recipe teaches one language.

### Fixed

- **Config block blank lines.** Editing a Configuration UI field no longer stacks empty lines
  under `// @CONFIG_START` on every save (Colors and other object-config scripts).
- **Change case** Collection / Group only appear when **Variable names** is ticked (not for Style
  groups / Style names). Multiselect `@showWhen` now tests membership in the ticked list.
- **Change case** Variant labels now rename every component property name (BOOLEAN / TEXT /
  INSTANCE_SWAP as well as VARIANT). `Icon: False` was left alone before because only VARIANT
  properties were edited; boolean true/false display casing is still Figma's and not renameable.
- **Change case** missed component sets on dense pages. The layer scan stopped at 15 000 nodes
  (mostly instances), before any `COMPONENT_SET` was reached. It now keeps only rename targets
  while walking, so Component names / Variant labels / values work on pages like a DS inventory.
- **Change case** multiselect ticks no longer snap back. The Collection field was named
  `collectionName`, which the Configuration UI treats as a Design System Foundations address — the
  first tick looked like a collection change and rebuilt the form from defaults.
- **Help Configuration UI no longer lists every specimen field as blank.** Docs examples that
  contained `// // @UI_CONFIG_START` fooled `extractSection` via `indexOf`; extraction now uses the
  line-anchored regex match index. Marker position finds for DOC/CONFIG splice use the same rule.
- **Remove unnecessary nesting no longer crashes after Normalize.** Merging the selected frame
  away left a dead node in the selection; the follow-up Remove pass then threw
  `get_children: The node … does not exist`. Survivors are tracked and min/max width/height
  (including variable bindings) move onto the remaining container when unwrapping or merging.
- **Normalize keeps the outer frame.** It used to delete the outer and promote the inner, which
  could drop a `FILL` child onto the page and make the section vanish. Gap/padding now merge onto
  the outer; the inner wrapper is removed.
- **InfoPanel clears when you open another script.** Results belong to the script that produced
  them; switching no longer leaves the last run open under a "from …" note.
- **Spacing no longer loads ungrouped radius tokens as spacing.** Discovery uses stamp domain
  first, then Figma scopes (`CORNER_RADIUS` vs `GAP`/`WIDTH_HEIGHT`), then an exact Description
  match (`Corner radius` / `Spacing`). No token-name guessing. Generate writes that Description
  only when empty (human edits are left alone).
- **Spacing / Corner radius seed empty sibling modes from the first filled mode.** When Desktop
  (or the first mode written) has a value and Tablet/Mobile are still empty or `0` — typical when
  those mode blocks were left incomplete and skipped — they receive the first mode's value. Modes
  that already hold a non-zero value are not overwritten.
- **Colors: new collection no longer clears Color tokens on blur.** Naming a new collection
  starts a read that finds nothing; when that miss landed it re-applied empty defaults and wiped
  steps typed (or committed) while the read was in flight — ramp appeared, then vanished on click
  away. Miss wipe is skipped when Collection/Group settle already reset the address.
- **DSF Mode settings gates differ by script.** Spacing / Typography / Corner radius / Colors
  open Mode settings only with a **named collection** (existing or New collection + name) **and
  Tokens**. Grid opens Mode settings, suggestions, and Preview once a collection is named —
  choosing *New collection* alone no longer pre-fills Width/Columns or shows suggestions.
  Collection modes chips can still unlock earlier via a seeded Value mode.
- **New collection unlocks Collection modes on every DSF panel.** Choosing *New collection*
  (even before typing a name) seeds a renameable **Value** mode. Colors chips no longer wait on
  Color tokens (Mode settings still do). Address reset no longer writes empty `modes: []` back
  over that starter.
- **Preview-snippet test slice** updated so New-collection unlock helpers after
  `pristineConfigForAddress` do not fail the “address change leaves no trace” guard.

### Removed

- **Copy simple variables JSON** — superseded by Export/import variables.
- **Stack or flatter color scale** (`color-scale-layout`) — moved to a personal user script.
- **Preview only** and **Match case** controls on Rename styles/variables, Replace styles,
  Replace style variable bindings, and Select by styles/variables. Matching is always
  case-sensitive; runs always apply.

### Changed

- **Utility script sidebar groups.** Shipped utilities are grouped under **Styles** (6),
  **Variables** (12), **Styles & Variables** (4), and **Utility Scripts** (6 general tools).
  Design System Foundations is unchanged. Script filenames and `@import` targets are the same;
  only the display prefix changed (e.g. `Styles / Rename styles` instead of
  `Utility Scripts / Rename styles`). Resolve by filename or title as before.

- **Grid, Spacing, Corner radius, and Typography** open with empty General fields (placeholders
  only). **Mode settings** still wait on a collection; **Preview / Overview / Suggestions** stay
  hidden until their HTML has something to show (content-reveal — not `@showWhen` alone), so an
  empty collection no longer flashes placeholder copy. Ramp scripts **scan the collection for the
  group that holds a set** when the current group has no manifest (same offer Grid already had for
  `col-N` series). Auto-import still fills token names or the manifest once Group points at the
  right place. **Fix:** the group scan no longer throws in the sandbox — the minimum-token
  threshold lived in a top-level `var` that `@import` extraction does not carry. **Domain-aware:**
  spacing and radius scans no longer treat each other's groups (or typography companions) as
  candidates, so a collection with one of each can auto-set Group again.
- **Content-reveal for DSF previews.** Preview and suggestions slots start `display: none` and
  open only through `fillContentReveal` when the silent run returns non-empty HTML. Paired
  section headings (Preview / Overview / Suggested…) follow the same gate. Fixes Colors strips
  that stayed invisible after tokens were typed (empty slots had been left at `display: none`).
  Typography no longer emits “Pick a scale type…” placeholders — incomplete scales return `''`.
- **Spacing / Corner radius Run skips incomplete modes.** Collection alignment fills every mode;
  a bezier base of 0 on Pad/Mobile no longer aborts the whole run when Desktop is ready. Skipped
  modes are listed in the results; the run still fails only when *no* mode can generate.
- **Collection modes on DSF panels.** Choosing a collection while Group is still empty left mode
  chips in placeholder ("Modes locked by Collection scope") when group detection returned early or
  when the address reset wrote `modes: []` after alignment. Modes from the file are written before
  any group offer short-circuits now.
- **Multi-collection pickers** show “No Collections available” when the file has none
  (was an empty bordered box).
- **DSF copy pass (helpers + Documentation).** All five Design System Foundations scripts
  (Colors, Spacing, Corner radius, Typography, Grid): panel `@helper` text and `@DOC_START`
  rewritten for a general audience. Docs open with a functional `#` title (core capability,
  ≤~160 characters), list Configuration UI controls only (label primary, code key secondary),
  and keep a full h1–h3 ladder. Configuration UI form headings demote one step (`h2`/`h3`, never `h1`).
- **Full Documentation copy pass.** Utility EXAMPLE_SCRIPTS, all CODEFIG_LIBRARIES, and Help &
  documentation: same functional-title / Overview / UI-only options rules. Standing instructions
  in `.claude/skills/ux-copy/SKILL.md`. `@codefig-ui` keeps teaching `@PANEL_START` as the shipped
  panel language.

### Developer

- **Plan 32 step 6 (DSF import trim).** Spacing / Corner radius import lists 37→13 names; Colors
  65→19; Typography 40→35 (Grid already minimal). Package sibling extraction pulls the rest.
  `extractFunctions` now increments depth only on cross-file hops so Bezier’s tree survives
  Linear Ramp → Scale Models → Bezier.
- **Plan 29 (field identity, in-rows).** `@rows` tabpanels carry `data-section`; curves and
  cells carry `data-key` / `data-type` (and `data-group` where applicable), so panel CSS can
  select `[data-section="hue"] [data-type="curve"]`.
- **Plan 30 (scoped stylesheets).** Opening a script injects a scoped
  `<style data-style-owner>` from `@STYLE_START` on **imported libraries** (shared components)
  plus the open script (overrides), scoped on the Configuration form **and** the side Preview.
  Design System Foundations teach the three tiers: CodeFig `ui.css`, library sheets next to
  markup (`@Color Ramp`, `@Linear Ramp`, `@Type Scale`, grid/suggestions on `@Foundation`),
  and optional script-only sheets. `package.css` is not the product path.
- **Plan 32 (packages, wiring).** Build stamps `packageId` / `packageVisibility` on Design
  System Foundations (5 scripts + 9 libraries). Package libraries stay listed in CodeFig
  Libraries (openable as examples); `@import` resolution still passes `packageId` for sibling
  extraction.
### Fixed

- **Preview no longer bleeds across script switches.** Cached preview HTML from the previous
  panel was redrawn into the next one's slot and forced visible, overriding `@showWhen`; switching
  scripts now clears that cache and defers row visibility to the form's condition sweep.
  **Follow-up:** the cache clear ran *after* the new form restored `_previewLastHtml`, so Grid
  still flashed on Spacing (and Colors on Corner radius) until the next silent run. Clear now
  runs before the form build, restores only for the same script, and wipes preview DOM immediately.
- **Libraries that only mention `@CONFIG_START` in Docs/comments no longer open an empty
  Configuration UI.** Section markers must sit alone on a `//` line (same rule as extraction).
  The Configuration UI tab appears only when the config block yields form fields — no more
  “no settings a form can show” dead end (e.g. `@Foundation`).

### Changed

- **Colors / config typing: keystrokes no longer rewrite Source or force a preview.** `input`
  events hold the form values (same as a curve drag); Source merge and auto-import wait for
  `change` (blur / Enter / select). Preview’s 120ms “max wait” bypass applies only to live curve
  drags — typing keeps the 400ms quiet debounce. Collection select still runs a full auto-import
  (one-shot cost).
- **Collection switch resets the form immediately.** Choosing a new collection (or committing a
  new Group) writes pristine defaults for that address before the silent read returns (~0.9s),
  so the previous collection’s modes/curves do not linger. Auto-import no longer waits an extra
  350ms debounce after a settled select. Import resolution for silent runs (auto-import, preview,
  quick-fit) is cached per open script so a collection switch does not re-expand Colors’ package
  graph on the UI thread (~1s) every time; the first open still pays once. The import kick is
  deferred with `setTimeout(0)` so the pristine reset can paint before that work.
- **Collection load no longer loses to a stale detectOnly import.** Address reset claims the
  address before reprojecting (so `scheduleGroupDetection` does not queue a rival), and
  `requestAutoImport` clears its timer with `clearTimeout` instead of orphaning it.

### Fixed

- **Foundation stamps: Copy / duplicate create new identity; Move keeps it.** CodeFig **Copy**
  (and Duplicate variable collection) mint a new set id, restamp the new variables, and write a
  forked manifest — originals keep their stamps. **Move** of a whole set keeps the same set id
  and updates the manifest group; a partial Move of a set mints for the moved portion. On plugin
  open, clear native group-duplicate collisions (`ambiguous-set-groups`) are forked the same way
  (silent); tied collisions stay skipped.
- **Style & UI reference / authoring docs teach `@PANEL_START` as the shipped panel language.**
  Help & documentation, CLAUDE.md, and `@codefig-ui` point authors at PANEL JSON for form recipes;
  values stay in `@UI_CONFIG_*` / `@CONFIG_*`. Annotation syntax remains for scripts without PANEL.
- **Copy or move variables** (was Merge variable collections): Source/Target sections with
  collection, group, and mode; **Move** or **Copy**. Matching names in the target overwrite.
  Move rebinds this file and removes the source variables (collection too when empty and
  unpublished). Copy leaves the source alone. Collection fields use the collection picker
  (so Mode can follow them); a missing target collection is created.
- **Replace variables** panel: Rebind scope, then Search for / Replace with (collection, group,
  variables). Match case and Preview only removed — runs apply immediately, always case-sensitive.
  Still rebinds only; does not move definitions.

### Fixed

- **Foundation maintain runs again on LIST**, not only at plugin open. Open could finish
  before Figma’s variable graph was ready, so a native group-duplicate collision was planned
  empty and left alone; the first sidebar LIST re-runs the same quiet repair.


- **Colors loads again when Collection and Group point at an existing set.** Renaming the
  shipped starter mode to `Value` (so a fresh collection can run) made auto-import ask the
  file for a mode many collections do not have — Figma's other default is still `Mode 1`.
  When none of the panel's mode names exist in the collection, the read adopts the
  collection's modes instead of returning empty.
- **Colors on a new collection no longer locks modes and refuses to run.** The shipped starter
  mode was `name: ""`, so the chips stayed in placeholder ("Value" + *Modes locked by Collection
  scope*) and Run answered *Add at least one mode*. It now ships `Value`, same as the other
  Design System Foundations scripts — leave it, rename it, or add more with `+`; a fresh
  collection gets that mode on write.
- **Delete is local user scripts only.** The Delete control is hidden for `@` libraries and
  for scripts loaded from a remote `"CodeFig Scripts"` library; the handler refuses those too.
- **Sidebar no longer rebuilds on every autosave.** `updateScriptList` skips `innerHTML` when
  the visible inventory is unchanged (name / type / origin / selection / collapse / search) —
  only script bodies changing no longer thrash DevTools inspection.
- **"Local scripts" means this file’s Variables only.** `clientStorage` scripts (per machine,
  not the open `.fig`) show under **LocalStorage**, not Local. Remote folders still come from
  enabled libraries that publish a `"CodeFig Scripts"` collection — if a script appears there,
  Figma’s library catalog still has that STRING var even when the library source file looks empty.
- **Import shows in the same session.** Batch save now tags imported scripts as `origin: local`
  and forces a sidebar rebuild (they were written to Variables but missing an origin, so the list
  filter hid them until reopen).
- **Settings gear** (left of the export menus) opens stores prefs: Variables / LocalStorage on or
  off, and dual-write vs preferred-store SAVE behaviour. Stored in `clientStorage`.
- **Render on canvas** (This script / All user scripts): builds page `CodeFig Scripts` with
  instances of a shared `{Script name}` component (Config/Docs slots + SRC). SRC binds to the
  script’s STRING variable (**raw source**, real newlines); id lives on the variable
  **description** (`codefig-id:…`). Paste the instance into another file → Figma’s “add local
  variables” → script shows in CodeFig. Root is **fixed 1728px**; columns Fill equally. Docs use
  structured markdown (table cells keep bold/italic; lists are bulleted text layers; TR / field
  CONTROL Fill). Scripts without `@DOC_START` still show leading `//` / `/*` comments as docs.
- **Script variable values are raw source** (not JSON envelope on the wire). Export JSON uses the
  envelope shape `{ v, id?, name, code, type }` for Sync/backup identity; legacy envelopes in
  variable values still read.
- **Foundation housekeeping actually runs on plugin open.** The boot path called
  `require('./foundation-maintain')`, but Figma's main JSVM has no Node `require`, so every
  open logged `foundationMaintain unavailable` and did nothing. The build inlines those
  sibling modules as `__codefigMainRequire` in `dist/code.js` (same for `script-storage.js`).
  Do not run bare `tsc` against `dist/` — it overwrites the shim; use `npm run build:dev`.
  Quiet clear-case repairs work as documented.

### Removed

- **Foundation config** — the Design System Foundations script that copied / parked / read a
  portable config between files is gone. Generators already write manifests; paste between
  `@CONFIG` blocks (and future script storage) covers sharing. Portable helpers in
  `@Foundation` remain for tests.

### Changed

- **Footer export menus open upward.** **This script** and **All user scripts** each offer
  Export to JSON and Sync to variables (or Sync all). Sync pushes into the path-named
  `"CodeFig Scripts"` collection and dual-writes `clientStorage`. ⌘E still exports the open
  script as JSON. Import stays its own button.
- **User scripts: read-only LIST, explicit Sync.** Opening the plugin no longer gap-fills
  `clientStorage` into a local `"CodeFig Scripts"` collection (that was creating silent local
  copies). LIST merges local Variables + `clientStorage` + enabled library collections named
  `"CodeFig Scripts"` for display only. Sidebar: **Local scripts** folder, then one folder per
  remote library name (not a library label on every row). Bodies import when you open a remote
  script. Autosave never writes remotes — use **Save as local copy** (Sync). SAVE / DELETE /
  Sync still dual-write local Variables + `clientStorage`.
- **User scripts sync in parallel** between path-named `"CodeFig Scripts"` STRING variables
  and `clientStorage` on SAVE / Sync (not on open). Variables win on name collision for
  display. Scopes stay empty so script vars are not bindable text tokens. Local vs Library
  banner / navigate-away still pending.
- **Configuration code tab removed.** Configuration UI is the only config surface (Documentation
  + Source still available). Panel recipes live in Source `@PANEL_START`; values in `@CONFIG_*`.
  Unsupported / empty-form notes point at Source. Form edits write into `@CONFIG_START`.
  `figma:ui writeConfig` splices Source directly (no second editor).
- **Quiet foundation housekeeping on every plugin open.** Clear-case CodeFig plugin-data drift
  is repaired with no toast or InfoPanel: orphan registry viewports, manifest keys with no
  stamped tokens left, stamps whose set id has no manifest on that collection. Variables,
  collections and styles are never deleted. Ambiguous stamp collisions (two groups, one set id)
  are left alone until the locked copy=new-identity repair lands.

### Added

- **Script-storage helpers (developer).** Pure chunk / index / export helpers for the planned
  `"CodeFig Scripts"` STRING-variable store (`src/script-storage.js`, `CHUNK_CHAR_LIMIT` 90_000).
- **`figma:ui` `saveScript` / `deleteScript`.** Drive SAVE / DELETE from the terminal for storage
  verification (delete skips the confirm dialog).
- **Script-storage sandbox dual-read.** LIST / SAVE / SAVE_BATCH / DELETE prefer the local
  `"CodeFig Scripts"` STRING collection (with one-shot migrate from `clientStorage` and dual-write
  back). `SCRIPT_STORAGE_VARIABLES` is true after Figma verify.
- **Help & documentation Configuration UI uses `@PANEL_START`.** The Style & UI reference
  specimen shelf keeps values in `@UI_CONFIG_START` and moves control specs into `@PANEL_START`.
  Same live controls (including the intentional unsupported nested object); `artifacts/style-reference.html`
  regenerates from the new split.
- **Every other shipped EXAMPLE_SCRIPT with a config form uses `@PANEL_START` too.** Values stay
  as `var` lines in `@UI_CONFIG_START` (runtime needs those names); the form recipe is JSON in
  `@PANEL_START`. Find/replace, rename, merge, scale-selection, and the smaller utilities all
  match this shape — same architecture as DSF, without rewriting how each script reads its knobs.
- **Spacing and Corner radius Configuration UIs use `@PANEL_START`.** Same split as Colors:
  `@CONFIG_START` holds values only (still with `// @fromFile: domains.spacing` /
  `domains.radius`), and the panel recipe is JSON in `@PANEL_START`. Behaviour is unchanged —
  collection chips, token lists, scale-type tabs, bezier/metric/fibonacci fields, and the preview
  all match the previous panels.
- **Typography's Configuration UI uses `@PANEL_START`.** Same split as Colors: `@CONFIG_START`
  holds values only (still with `// @fromFile: domains.typography`), and the panel recipe is JSON
  in `@PANEL_START`. Behaviour is unchanged — list tokens/weights, letter-spacing and line-height
  percent groups, overview suggestions, and the preview textarea all match the previous panel.
- **Grid's Configuration UI uses `@PANEL_START`.** Same split as Colors: `@CONFIG_START` holds
  values only (still with `// @fromFile: domains.grid`), and the panel recipe is JSON in
  `@PANEL_START`. Behaviour is unchanged — collection chips, mode tabs, suggestions, and the
  preview all match the previous panel. The `variables` function stays a sibling after the panel
  region.
- **Colors Run writes colour variables.** The panel strip is the preview; Run creates or updates
  the group's COLOR tokens in place, skips aliases and non-opaque cells, reports orphans when the
  step list shrinks, and records the set with the same stamp bracket Spacing and Radius use. The
  hexes come from the same `colorsGenerateMode` path the panel already showed.
- **A Hue, Saturation or Chroma curve can now peak above or dip below both of its own ends** — a
  Hue that reads the same at both ends with a real, different hue in the middle, for instance,
  which cannot be expressed any other way: `oklchLerpHue`/`oklchLerp` interpolate the two ends
  linearly, and a straight line between two equal numbers is that number regardless of how the
  curve paces getting there. Dragging a handle past the edge of the plot used to clamp its height
  to exactly the ceiling or floor, wherever the pointer actually went — confirmed live, a dragged
  Hue handle landed at exactly `y = 1`. The overshoot protection that stops a handle leaving the
  *plot box* is unchanged and still applies; only the restriction to the *range between the two
  ends* is lifted, and only for these three channels — Lightness and every curve outside Colors
  (Spacing, Radius, Typography's own scale curves, which share the same underlying shape) keep
  exactly the range they always had. Also fixes the generation-side half of the same limitation: a
  curve's pacing was clamped a second time when it was turned into a colour, so even a display that
  correctly showed the overshoot would not have reached the swatch.
- **Configuration code shows a migrated script's `@PANEL_START` spec, read-only, above the values
  it explains** — a script with no `@PANEL_START` shows exactly what it always has. A second,
  genuinely non-editable pane rather than one shared buffer: the values editor still writes back
  exactly as before, so nothing about saving a config changed.
- **A tab can be named for the model it is showing, and can take itself off the bar.** `#>Hue{colorModel=hsl}`
  carries the same `{…}` condition a column does, and **two tab markers written next to each other are one
  tab under two names** — captioned by the first whose condition holds, sharing one panel. A tab with nothing
  visible left in it is not drawn at all.
- **Channel tabs in a `@rows` block.** `#>Hue` starts a tab where `#Hue` starts a section — the columns
  after it are shown only when that tab is open. Closed tabs are hidden rather than dropped, so every
  channel is still read; switching one is not an edit and does not touch the config.
- **The three anchor boxes sit under the chart**, left, centre and right. The two ends are the row's own
  cells, moved into place rather than rebuilt, so they keep their captions and their keys. The **Middle**
  box depends on the channel. Lightness has no middle anchor of its own, so its box **is** the curve's
  middle handle read in lightness — type in it and the handle moves, drag the handle and it follows, and it
  is disabled with an em dash when the curve has no middle point. Hue and Saturation do have one, and their
  box is that anchor: the engine interpolates bright to middle to dark and paces it with the curve, which
  are two different numbers, so showing the handle there would show neither.
- **A curve can be drawn on a real axis.** `@ends: a..b` names the two fields a curve runs between and
  `@range: lo..hi` the limits of the quantity, and together they turn the plot's y axis from a unit
  square into the thing being edited — labelled at round values, with the dashed guide joining the two
  ends rather than the corners of the box. The ends become **square** handles you can drag, and dragging
  one types into its own field, drawn **filled** where a shape handle is hollow. Two columns sit beside the
  plot: a **zoom** — a triangle you drag, with step buttons above and below — and a bar showing the
  collection's own token colours across the window, which takes no input. Zoom in between two steps and
  the bar is the blend between those two, because it is a picture of that ramp rather than of the channel. Neither moves when you drag the curve;
  drag the empty chart vertically to follow a ramp that runs off the top or bottom. The ramp is clipped to
  the plot, grips to the plot plus their radius so one on the boundary sits *on* the frame, and a drag
  stops at the window's edge instead of pushing the curve out of sight. Curves without `@ends` — the scale
  editors in Spacing, Radius and Typography — are unchanged.
- **Every step is a dot on the curve, in its own colour, with a ring on the seed.** Drawn from the same
  published colours as the bar beside the chart, so a step cannot appear at one value in one place and a
  different one in the other. Small deliberately — a dot that competes with a handle makes the thing you
  can drag harder to find.
- **The Lightness chart is drawn as darkness** — 0 at the bottom is white, 100 at the top is black — so a
  ramp climbs left to right the way its swatches darken. Display only: the config still holds lightness, a
  drag still writes lightness, and a run still generates from it. Hue, chroma and saturation plot as
  stored.
- **Colors' Mode settings are three channel tabs over one chart** — Hue, Saturation and Lightness — with
  Seed color above them, because a seed belongs to the mode rather than to a channel. Each tab holds that
  channel's curve and its two ends, and every curve is now on a real axis: hue in degrees, chroma 0 to 0.4,
  saturation and lightness as percentages. The five stacked curve editors are gone.
- **Colors' lightness curves are drawn on that axis.** The OKLCH collection ladder reads against its
  Bright and Dark, and each HSL mode's curve against its own — so the chart says what lightness a step
  lands on rather than how far the shape sits from straight, and the ends are draggable. Chroma, hue
  and saturation are unchanged for now: each of those still keeps a separate Middle field, and an axis
  would put a second answer to that question on screen beside the first.

### Changed

- **On OKLCH the channels are Hue and Chroma, and there is no Lightness tab.** Chroma and saturation are
  different quantities in different units, so the tab is named for the one you are editing rather than for
  HSL's. Lightness is the collection's shared ladder in this model, not a mode's, so the tab held nothing —
  it now goes rather than opening an empty panel. Switch to HSL and all three come back.
- **The collapse chevron is dark.** It inherited the title row's secondary grey and then dimmed itself to
  0.55 of it, which left the control paler than the label beside it — the look of something disabled.
- **OKLCH's shared ladder gets the same curve editor a mode has.** The collection-scope curve was still the
  old narrow control — 268px of chart in a full-width block, two unlabelled number boxes and no colour bar.
  It is now the charted layout: full width, a greyscale bar beside it showing the whole 0-100 channel with
  the zoomed window marked, and **Bright / Middle / Dark** captioned under the plot. The bar is greyscale
  because the ladder *is* greyscale — one lightness sequence every mode shares, which is what makes them
  match.
- **A collapsed mode block hides its curve as well as its seed.** The chevron left the channel tabs and the
  chart in place, so collapsing a block saved a line and a half. Collapsed now means the mode name and its
  colour strip, nothing else.
- **The Documentation tab says which model to generate in, and why.** OKLCH to generate, HSL to read what
  is already there. HSL's colourfulness envelope, `C = S x (1 - |2L - 1|)`, has a corner at 50% lightness
  that every full ramp crosses: measured with the colour flat and the lightness on one smooth cubic, the
  second difference of chroma runs ±4 across the ramp and **-25 and -20 either side of the crossing**. The
  same measurement in OKLCH is ±3 with no crossing artefact.

- **The Lightness chart plots lightness, not darkness.** Its numbers now match the anchor boxes, the
  config and the variable: bright at the top, dark at the bottom. The inverted axis read the other way
  round from every number beside it.
- **The coordinate field sits on the preset row** — which shape, how many points, and the shape as text
  are one thought. Scale editors keep theirs under the plot, where the column is too narrow for three
  controls on a line.
- **The bar beside a chart shows the whole channel, with the window bracketed on it.** It showed only the
  slice the plot shows, which on a hue ramp travelling one degree is a solid block of one colour — it said
  nothing about where that degree sits on the wheel. The bar answers *where in the channel am I*; the chart
  answers *what happens across it*.
- **A swatch caption is the token and the colour it will be.** The struck-through old value and the
  per-step lightness delta are gone; the caption above each strip already says how many steps change and
  by how much.
  The token is bold and full-strength, because it is the label.
- **Reading a colour collection is about a third faster.** Selecting a collection and typing a group took
  2.9 seconds for a two-mode collection and 3.7 for a three-mode one, almost all of it arithmetic rather
  than reading the file — a second read of the same collection was no quicker. The anchor search already
  fits every curve it needs and the caller was fitting the same six again; it hands them back now. Measured
  in Figma: **2.9s to 2.1s** and **3.7s to 2.6s**, with every read landing on identical numbers.

### Fixed

- **Colors curve toolbar order is type → coordinates → add/remove middle**, matching how you think
  about the shape before you change how many points it has.
- **Add/remove middle uses the same secondary button chrome as the footer** — stroke darkens on
  hover, background does not.
- **A Lightness middle handle drags vertically again** (HSL and OKLCH). Typing already wrote the
  curve's corner height; the drag only moved X and left the grip stuck on one height.
- **The Middle marker above the swatch strip follows the curve bend**, not the list midpoint / seed
  column.
- **OKLCH Bright / Dark under the shared ladder stack caption over input** again. Adopting the
  field-scope group part had tagged it with the curve-anchor class that forces `display: block` and
  flattened the column.
- **Swatch hex colours under changed steps:** file hex struck through in `--text-secondary`, new hex
  in `--text-primary`. Split swatches and the change caption are unchanged — only the label styling moved.
- **OKLCH preview strips show the same file/run comparison as HSL** — split swatch (file on top,
  run below) and struck-through / new hex labels. Only the hex text styling changed, not the preview chrome.
- **Chroma clamp notes (`C→…`) no longer print under each swatch** — the banner already summarises drift.
- **A changed step's swatch and its hex label agree again.** The bar splits file-on-top / run-below
  when a step would change, but the card under it had dropped the struck-through file hex — so
  sampling the vivid top half never matched the single "now" code underneath.
- **Switching Colors to OKLCH no longer greys the ramp out.** HSL and OKLCH keep separate hue /
  colourfulness fields; a panel that lived in HSL often still had `chroma: 0` while saturation held the
  real colour, so the shared lightness curve applied on top of empty chroma. Generation now borrows
  OKLCH hue and chroma from the HSL anchors (or from the file's own ends) when chroma was never set —
  only the lightness ladder changes on the switch.
- **Switching HSL ↔ OKLCH keeps each mode's hue and colourfulness.** Untouched colour channels take
  the file's per-step H and C onto the new lightness ladder — even when that ladder is the shared
  OKLCH curve (not Original). Empty colour curves no longer re-interpolate from three anchors, which
  is what turned Lime-3 blue and desaturated its neighbours on a model switch. Also stops treating
  recognition-vs-hex quantization noise (~0.6° / ~0.0005 C on real Lime ends) as a colour edit, which
  had marked every interior step "touched" and greyed the strip the same way.
- **Typing Hue start / end (and any charted Bright / Dark) moves the grip on the chart.** The fields
  already lived under the curve after adoption, so the shared refresh skipped that control on every
  keystroke — the number changed and the path stayed put. Same listener the middle field already had.
- **A successful Colors write no longer opens the InfoPanel.** Results still land there (and the
  button still shows they exist); only error runs take over the window. Also fixes the shared UI
  reading the message type instead of the script's severity, which had been opening the panel on
  every `displayResults({ type: 'success' })`.
- **Colors has no Preview only checkbox.** The strip already shows what would change; Run writes.
- **Adding a Colors mode chip deep-clones the previous mode**, so the new block opens with real
  hue / chroma / seed values instead of empty nested fields, and edits do not rewrite the neighbour.
  When that mode is still on *Original*, the held file hexes are copied under the new name too —
  otherwise the strip correctly had nothing to substitute and said "Original has no colours…".
- **Hue start / middle / end stay editable.** They used to disable whenever both hue curves were still
  on *Original* (the default empty state), which left the colour inputs greyed out on every fresh mode.
- **A Hue / Saturation / Chroma middle above or below both ends finally agrees across chart, field,
  and swatch.** The chart used a single-span `bright → dark` map for every handle height; generation
  already used two spans (`bright → middle → dark`) with the middle *field* as a real colour. Typing
  200° with ends near 100° updated the field and spiked the preview, while the handle stayed flat at
  ~100°. The shared curve control now draws and drags through `valueAlongRamp` — the same two-segment
  pacing `oklchChannelAt` uses — so the middle handle sits on the typed colour, the path arches through
  it, and `pts[5]` stays pacing-only. Adding a middle after a 2-point overshoot writes the pre-split
  channel value into the field (and replaces a leftover) instead of `hueLerp`ing a unit height between
  equal ends. Equal ends with no middle draw a **horizontal** line at the pin on the full channel
  range (Saturation 100…100 at the top of 0…100), and end grips sit on the field values — not on a
  synthetic 90→110 diagonal from `effectiveGap`. **Zoom on equal ends no longer resets every redraw**
  (a latched narrow window was discarded whenever it showed less than 75% of the channel), and
  **dragging an end off a pinned channel no longer reopens a tight window** — zoom and endpoints are
  independent again. Hue value mapping on two-anchor curves uses the short arc (`axisHueDelta`) like
  generation, not a raw degree subtraction. **Equal ends on the flat Linear preset** stay
  horizontal until a handle bends the curve, then `effectiveGap` mapping draws a two-point overshoot
  arch (100 → 50 → 100) with handles always visible; the disabled middle field shows a **derived
  estimate** from `valueAlongRamp`, not a stale leftover value.   **Zoom centres on the pin**, uses
  **whole-number ticks**, and caps at roughly two step spacings on Colors channels. Zoom on equal ends
  with a real middle anchor (lime saturation `100 … 83 … 100`) centres on the dip, not the pin alone.
- **Dragging a Hue / Saturation / Chroma handle no longer jumps the curve mid-gesture.** Overshoot
  channels always map drags on the value axis; switching out of shape-space the moment a handle left
  `[0, 1]` rewrote the same pointer position as channel hundreds in storage (`cubic-bezier(…, 125, …)`).
- **Linear / Original (`[]`) channel curves no longer consult a leftover middle anchor at generation.**
  The panel drew a straight line while the preview greyed out the placement step — a middle field left at
  0 from an earlier explore drove saturation there even though the curve had no middle point.
- **Dragging a Hue middle across the short arc no longer draws vertical spikes on the chart.** The
  path wrapped every sample into [0, 360) and connected across the 0° discontinuity (100° → 290°
  short-way) — a polyline spike the swatch strip never showed. Adjacent samples that jump more than
  180° now start a new subpath instead of drawing a vertical line.
- **A curve could visibly drag to a dramatic value and the swatch would barely move — the axis and the
  colour math were reading two different scales for the same stored number.** `axisView` (the window a
  curve is drawn against) and `effectiveGap` (the drag-sensitivity floor two fixes above this one)
  both widen for a middle value on `field.ends.mid` — a property of the *field definition*, present
  for Hue whether or not the curve currently has a third anchor. A plain two-anchor curve with a
  "Hue middle" field still holding a value from an earlier, since-removed middle point had that stale
  value pulled into the window and the drag floor regardless — stretching the axis and the handle's
  own readout to include it, while `oklchRamp` never reads that field for a curve this shape at all
  (`hueHasMiddle`/`chromaHasMiddle` is `false` the moment the curve has no real middle anchor,
  independent of what the field says). Reproduced directly from a live trace: a drag that read as
  reaching 360° on the axis generated a ramp that moved by 15°, because the axis used the leftover
  field and generation did not. Both now ask `curveHasRealMiddle` — the curve's own length, the same
  question generation asks — before including the field at all; three existing tests whose fixtures
  paired a two-anchor curve with a middle *field* (testing the axis, not this distinction) were
  updated to use a real middle *point*, and a new test pins the leftover-field case directly.
- **Adding a middle point to a curve already dragged into a real overshoot bulge looked like it reset
  the curve instead of splitting it.** De Casteljau's subdivision reproduces the original curve
  exactly, tangent handles included — sound for an ordinary curve, and the wrong answer for a handle
  built for the curve's full width landing in a segment the split just narrowed to a sliver: the
  margin `bezierNormalise` (`@Bezier`) holds a tangent handle to, around a corner that split can land
  almost anywhere, held the inherited handle regardless, so it settled on the margin's own edge —
  indistinguishable from a curve drawn that way on purpose. Confirmed against the exact reported
  shape: a two-handle Hue curve dragged to `[0.157, -9.969, 0.709, -9.969]`, split at the real
  16-step middle fraction, landed both new handles precisely on their clamp boundaries. `bezierWithMiddle`
  now checks each half against that same margin before committing to it, and gives a half that would
  not survive a plain linear pace between the corner and its far anchor instead of a value clamped to
  the margin's edge — the same clean shape a fresh split already shows on a curve with no handles yet.
  Two tests cover it: the existing "splits an already-overshooting curve" fixture, re-verified against
  the reset rather than the clamp, and a new one reproducing the exact reported curve directly; both
  confirmed failing against the old clamp-in-place behaviour.
- **An overshoot curve could drag, draw and evaluate exactly right and still never reach the swatch
  or the config block — the root of "the chart doesn't change" across several rounds of this
  investigation.** Every fix above this one corrected something real, and none of them could have
  worked on their own, because the curve widget and the code that *saves* what it holds read two
  different functions. `buildCurveControl` shadows `curveValueOf` with a copy that already threads
  `field.overshoot` through — confirmed by a live trace, this half was always correct, which is why
  the chart itself looked right while dragging. `getValues()`/`collectRows()` — what actually runs
  when the config block is written and, via the same call during a live drag, what the preview is
  built from — read a curve's value back out through the *module-level* `curveValueOf` instead,
  outside any one control's closure and with no `field.overshoot` to default to, so it silently
  clamped every Y coordinate back into `[0,1]` the instant the curve was collected. A curve could
  overshoot beautifully on screen and write a flattened, ordinary shape into both the live preview
  and the eventual `RUN`. Both collection paths — a `@rows` cell (`readRowCellInto`, colors.js's own
  Hue/Saturation/Chroma curves) and a field-level curve (`getValues()`'s own `data-curve-field`
  sweep, Lightness's collection-scope curve) — now pass their column's own `overshoot` through
  explicitly. Two new tests reproduce each path directly and pin the collected value to the curve's
  real, unclamped shape; both confirmed failing before this fix.
- **A curve handle on a near-equal-ends channel with a middle set far from both ends read as frozen
  for most of a drag and then jumped — reproduced directly from a live trace and fixed at the pixel
  conversion, not the generation math.** `unitToValue`/`valueToUnit` (`renderer.js`) scale a drag
  against `bright − dark`; sound while the two are a normal distance apart, and the one place it broke
  down is a small gap under a window that still has to widen to show a middle far from both — Lime's
  own Hue, 100° and 99.2°, with a middle explored out to 200°. The window and the gap are then divided
  through the same handful of pixels, and nearly every pointer position landed past the range
  `bezierNormalise`'s own margins hold a curve to — only a hairline band near the ends read as
  anything else, which is exactly "can't move it, then it resets." Fixed with one function,
  `effectiveGap`, reused by both conversions: the gap is floored to `spread ÷ 10` — the same three
  anchors' own spread, not a fixed worst case — so a channel with no middle, or one whose middle sits
  close to its ends (every Lightness, Chroma and ordinary Saturation curve checked against
  `bench:colors`' own real sets), has a spread equal to its own gap and gets that gap back unchanged.
  Confirmed on both sides: three new tests pin Lightness, Chroma and a plain near-equal Hue curve to
  their exact pre-fix drag numbers, and a fourth reproduces the reported curve directly and asserts
  the drag it produces is bounded rather than the ≈140× amplification the same numbers hand-derive to
  without the floor. Also absorbs the old "equal ends divide by zero" case for free — a spread of
  exactly 0 falls back to the field's own declared range instead of needing a separate check.
- **Clicking into a field, right after picking a collection, lost focus a moment later on its own.**
  Auto-import resolves asynchronously and writes whatever it read the moment it lands —
  `writeConfigBlockText` is the one place that happens, and it rebuilds the whole Configuration UI
  form from scratch on every write so the two never disagree. That rebuild empties and re-creates
  every field's DOM node, focused one included, and the browser has no way to know the freshly-built
  Group field is "the same" one the caret was just in. Márton: *"I click into the field, see the
  blinking cursor, then the focus disappears."* Removing the auto-import note that used to render
  under Group (above) looked related because both fire from the same write, but the note was never
  the cause. `projectConfigIntoForm` now remembers which field had the caret by name — `data-field`,
  or `data-row-field` plus its row — the same way it already remembers which mode tab was open by
  name rather than by element, and returns focus (and the caret's own position) to the rebuilt
  field's equivalent once the rebuild finishes.
- **An overshoot Hue curve could look right on the chart and never reach the swatch.** The channel
  the overshoot fix above landed for was still being ignored in one real case: a mode whose
  `bright`/`dark` anchor values happened to still equal the file's own — auto-import had filled
  them and nobody had retyped either end — read as untouched by the anchor-only check that decides
  whether Original substitutes the file's colour or the curve's, so the whole channel fell back to
  the file's verbatim per-step hue regardless of how dramatically the curve itself had been
  reshaped. Confirmed live: a Hue curve dragged into a large overshoot bulge, swatch unchanged.
  `hueTouched`/`chromaTouched` now also treat a real, non-empty curve as touched in its own right,
  not only a retyped anchor.
- **A curve with a middle point could generate a ramp with one flat half and the other reading
  hues in the hundreds of degrees, with no sharp corner anywhere on the chart to explain it.**
  `oklchRamp` paces each half by dividing the curve's own height by its height *at* the middle
  anchor (`atMiddle`) — sound only while that height sits away from 0 and 1, since a value right on
  either boundary turns the division into a constant or a near-infinite ratio. Two paths could land
  it there once curves could overshoot: typing a value into a Hue/Saturation/Chroma middle field
  that the curve had no on-curve position for used to force the anchor to the nearest boundary
  instead of leaving it alone (confirmed live: typing 293.5° with both ends near 100° pinned the
  curve's own corner to `y = 0`), and splitting an already-overshooting curve inherited whatever
  height the original curve happened to have at the split point, unclamped. `bezierNormalise`
  (`@Bezier`) now holds the middle anchor's own height to `[0.001, 0.999]` regardless of overshoot —
  the same margin its `x` already had, and for the same reason — and the renderer leaves the curve's
  shape untouched when a typed value has nowhere on it to go, since that is exactly what the
  `middle.<channel>` field is for. A curve already corrupted by the old behaviour needs reshaping by
  hand; the fix stops new corruption, not undoes what a prior session already stored.
- **A curve with a middle point could still generate a swatch strip of unrelated pinks, blues and
  greens with no corner on the chart to explain it, even on a curve that had never touched 0 or 1.**
  The margin above stops the *corner* from landing exactly on a boundary; it does nothing about a
  *tangent* handle several times taller than the tiny segment it bends — and `oklchRamp`'s division
  amplifies a handle's height by `1 / atMiddle`, so a handle at `y = 1` next to a corner at
  `y = 0.01` reads as a progress of 100, a hundred-fold loop around the hue wheel from one step to
  the next. Reproduced and fixed at the unit level directly against the reported curve: `bezierAt`
  read a smooth, single bulge as the wild oscillation the swatch strip showed. `bezierNormalise`
  (`@Bezier`) now holds each tangent handle to two spans' worth beyond its own segment's edges —
  generous enough that no ordinary overshoot curve (the "easeOutBack" shape used throughout this
  file's own tests, checked directly) is affected — which bounds what the division can produce to
  `[-2, 3]` regardless of how small the segment is, in place of the unbounded ratio an untouched
  handle could reach. `bench:colors` unchanged; every set already fits well inside that range.
- **A curve's own middle anchor read as disabled but dimmed like it wasn't, or the other way
  round, whenever the channel's Hue and hslHue (or Chroma and Saturation) curves shared a
  bright/middle/dark cell.** `@showWhen` shows one model's curve at a time, and both share the same
  cell — `refreshCurveControls` redraws every *other* curve right after the one just edited, so
  clicking *Add middle point* correctly enabled the field and then the hidden twin's own redraw
  (still two anchors, no middle of its own) immediately dimmed the shared cell back down. The field
  itself was genuinely usable throughout; only the dimming disagreed with it. The write that dims a
  curve's shared anchor cell now only happens while that curve is the one actually on screen, the
  same guard `adoptEnds` already uses to decide which of the two gets to touch the cell at all.
- **A curve with a middle point could generate a ramp that jumped, even with no sharp corners on
  screen.** "Add middle point" split every curve at a flat 0.5 — but generation paces each half
  against `index / last` up to the channel's real middle *step* (the seed's placement, or
  `colorsMidIndex`), which for an even step count is essentially never 0.5 exactly: a 16-step ramp
  turns at step 7 of 15, 0.467. Between the two positions, the drawn curve had already crossed into
  its second segment while generation was still pacing the first half's approach to the middle — a
  discontinuity nowhere visible in the chart, which only draws the shape that was actually stored.
  The toggle now asks the host for the real middle step before splitting (`config-ui-middle-point-position`,
  a synchronous, mutable-detail event — the same pattern `onChannelOpen`/`onRequestEstimate` use for
  anything only the host's row context can answer) and falls back to 0.5 when nothing answers, which
  is exactly right for a channel with no seed placement to disagree with it.
- **Dragging a handle on an untouched curve did nothing, on every fresh Hue, Saturation or Chroma
  field.** `draw()` positions every handle from the *implied* Linear shape when nothing is stored
  yet (`effectivePoints`), but the drag itself read the raw, empty stored value and indexed straight
  into it — a one- or two-number result is not a curve `bezierNormalise` recognises, so it was
  discarded back to empty on every frame, settle included. The handle visibly moved for exactly one
  frame and the drag wrote nothing, which is indistinguishable from a handle that does not drag at
  all. Reading `effectivePoints` the same way `draw()` already does fixes it; a new test drags a
  handle on a field that starts empty and checks the result is a real, stored four-number curve —
  every existing drag test started from a curve with real points already, which is why none of them
  caught this.
- **The Middle label above the generated swatches read the same as Bright and Dark even when the
  curve had no middle point** — a seed always lands on a nearest step, whether or not the curve bends
  there. Dimmed now, the same 0.45 opacity the curve editor's own middle box already uses when its
  curve has none, so the label still says where the seed landed without claiming a shape that is not
  there.
- **Editing a mode's Hue or Saturation had no visible effect at all, as long as its Lightness curve
  was still Original** — which is every freshly-read mode today, since the on-demand fit that would
  replace it is parked. `colorsGenerateMode` substituted the *whole* per-step colour with the file's
  own hex whenever Lightness was Original, hue and chroma included, so no edit to either could ever
  reach the swatch: confirmed live, driving the real plugin, moving a mode's hue anchors to blue and
  pink left the preview unchanged lime green until Lightness alone was moved off Original. Each
  channel now decides for itself: Original substitutes only the lightness a step actually measures
  in the file, and Hue/Saturation keep whatever their own curve and anchors generated — but only once
  those differ from the file's own bright and dark, so an untouched mode still reproduces the file
  byte for byte and a fresh load stays quiet. `oklchToHex`/`oklchHslToHex` recompose the hex from the
  blend; `oklchNormaliseHex` still handles the fully-untouched case verbatim, avoiding a colour-maths
  round trip where none is needed. Measured against all sixteen real sets in `bench:colors`: no
  change, because every one of them already carries a fitted curve rather than sitting on Original.
- **Dragging a curve handle could do nothing, or undo itself, because opening the channel tab had
  already asked for an on-demand fit that landed later, mid-drag, and overwrote the curve
  unconditionally.** Confirmed live: the request itself was not hung — it answered correctly, empty
  for that channel — but nothing checked whether the row had been touched since it was asked.
  Opening a channel tab no longer starts a fit request, alongside the dropdown's own "Estimated
  original" option already being parked; `requestQuickFit` and its safeguards are untouched and
  come back with a one-line revert once the dispatch bug behind the hang (`DEFERRED.md`) is found.
- **Dragging a curve handle looked unresponsive, and could snap back to the preset it started on.**
  Every frame of the drag re-ran the live preview, which flushed the pending edit into the config
  editor first — two CodeMirror rewrites of the largest config block in the plugin, up to eight
  times a second (`DEFERRED.md`, "The preview flushed the config text on every frame of a drag").
  The preview now overlays the form's own live values onto the last real parse instead, and never
  touches the editor during a drag at all.
- **A channel with no middle anchor of its own generated through zero instead of running bright to
  dark.** Fitting a lightness curve gives a mode a middle *position*; hue and saturation, still
  unfitted after plan 36's on-demand fit, read that absent middle through the same numeric fallback
  a genuinely-measured near-zero would use — 0° hue, ~0 saturation — which is grey, generated right
  under the fitted lightness curve's own middle step. `colorsChannel` now reports whether a middle
  was actually present, checked before the fallback substitution, and `oklchRamp` consults that
  instead of assuming one exists whenever no curve does (safe before the on-demand fit existed,
  wrong after it). Verified against the live preview: a real 10-point middle-anchored lightness
  curve with hue and saturation left empty now generates a healthy saturated green through the
  middle step rather than a grey one.
- **The middle anchor's placeholder text (`eg. 12`) read as a value in an empty field.** Suppressed
  for the middle position only — bright and dark keep theirs, since those already hold something
  by the time a curve exists to bend.
- **Hue's start and end anchors stayed disabled in HSL mode no matter which curve was picked.** The
  anchors block disabled itself on `hueCurve` alone; that curve is OKLCH's, sits hidden and untouched
  while the panel is in HSL, and so never held anything but "no curve yet" — which is what the block
  read regardless of what `hslHueCurve`, the one actually showing, held. Naming both models' curves
  fixes it: the anchors disable only while neither has a shape.
- **Adding a middle point left its input empty and its own reading (added last round) an em dash.**
  It now shows the curve's own value at that position — a real number, not an invented one, since
  the split point `bezierWithMiddle` creates is exactly `bezierAt(pts, 0.5)` — as a placeholder, never
  a value, so nothing here can be mistaken for an anchor nobody set. Applies to Lightness's own
  middle box and to Hue/Saturation/Chroma's adopted one.
- **Picking *Custom* on an untouched preset undid itself.** The label is derived from the curve's own
  coordinates on every redraw, so choosing it without changing anything left the points matching the
  preset they already were, and the dropdown snapped straight back. *Custom* is now hidden from the
  list until a real edit makes it true — dragging a handle still switches to it automatically, the
  same as before.
- **The Lightness curve's own middle box read as caption and input side by side instead of
  stacked**, unlike Hue and Saturation's adopted middle box beside it. Not a missing class: the
  first fix added `.config-ui-rows-group-part`'s flex-column styling to the *same* element that
  already carries `.config-ui-curve__anchor`, and `.config-ui-curve__anchors .config-ui-curve__anchor
  { display: block }`'s two-class selector always wins over a one-class `display: flex` on the same
  element, whichever order the rules are written in. The adopted anchors avoid this because their
  stacker is a separate inner element that never also carries `.config-ui-curve__anchor` — found by
  comparing the two boxes' real DOM live in a browser. Lightness's own middle box now nests the same
  way.
- **The range/gradient strip beside a curve showed the whole channel, compressed toward the edges
  once zoomed, instead of the zoomed slice.** `rangeStops` kept every token's colour on the strip and
  clamped an out-of-window one to whichever edge it was nearest, so the full spectrum stayed visible
  at every zoom level. It now drops a token outside the window, and interpolates the colour exactly
  at each edge between whichever two tokens bracket it — the strip shows only what the window
  actually contains, stretched to fill it, matching the chart's own axis at every zoom level. The
  bracket that used to mark the window on top of the whole-channel bar (`.config-ui-curve__range-window`)
  is gone along with it — there is nothing left for it to mark once the strip *is* the window.
- **The range scale next to a curve could show the whole channel instead of the zoomed range, and
  zooming past a certain point made it jump back to the wide view on every redraw** — not only the
  gradient strip above, but the tick labels and the zoom mark itself, since all three read the same
  latched window. `axisView`'s safety net (`rampIsOffscreen`) reopens the window when a read makes
  the whole ramp fall outside it — necessary, since recognition can refill both ends far from the old
  view. Its three samples went through `unitToValue`, which collapses to one constant when a
  channel's two ends are equal, *regardless of the curve's real shape* — an ordinary case (Lightness
  aside, most channels pin both ends and put the movement in the middle). Zoom to a window that
  excludes that constant, which is the legitimate point of a middle the ends don't hold, and every
  sample reads as off screen — discarding the window on every single draw, not only while dragging.
  Falls back to the actual ends and middle field for that case, the same three anchors the window
  opens on in the first place, so the two can no longer disagree.
- **Zooming a curve's range stuttered and occasionally jumped**, because the zoom mark's own drag
  handler had no `requestAnimationFrame` coalescing — unlike shape and pan dragging, which got this
  exact fix earlier for the same reason (a trackpad's `pointermove` outruns the screen's paint rate).
  Every raw pointer event forced a synchronous `draw()` — a full SVG teardown and rebuild plus a
  layout read — on top of its own extra `getBoundingClientRect()` call per event. The rect is now
  read once, on `pointerdown`, and the last position wins per animation frame, same as the other drag.
- **A curve control that gave up after 6 seconds gave up on the interface, not the request.** The
  fit it started kept running and could still write into whichever tab was open when it eventually
  landed — so a slow estimate looked like it failed twice, then silently wrote into the wrong
  place. Each request is now tagged, and a timed-out control's tag is marked abandoned so a late
  answer is dropped rather than applied.
- **A lost silent-run answer used to disable every future on-demand fit, live preview refresh and
  auto-import for the rest of the session.** They share one dispatch lock that only cleared on that
  answer's own arrival; a request that never answered left it claimed forever. It now self-releases
  after 20 seconds, and a fit that throws (rather than never answering) now fails its own row
  instead of claiming it permanently. Neither makes a hung estimate land — see `DEFERRED.md`, "The
  on-demand fit hangs, not always, and not fully explained," for what is still unresolved.
- **Selecting a collection in the Colors panel took about three seconds.** The read walked every variable in
  the collection with its own Figma API call, once per panel mode, plus a second full walk to count mode
  differences for the mode chips — `(M+1)×V` sequential round trips for `M` modes and `V` variables. It now
  reads the file's variables once, indexed, and shares that index across both reads. Guarded by a new golden
  test (`scripts/_TESTS/_tests-foundation-colors-read.js`) and the existing `tests/colors-recognise.test.js`;
  pending a plugin reload to confirm the call-count drop in Figma itself — see `.plans/28-read-path-performance.md`.
- **Setting OKLCH's lightness ends did nothing.** The two anchor boxes move under the chart — that is the
  layout working — but the collector still asked the field they came *from* for them, and found it empty.
  So the collection's Lightness rendered, accepted typing and saved `{}`, and every ramp was generated from
  the fallback anchors whatever was on screen.
- **A group with nothing left in it no longer draws its captions.** On OKLCH a mode's Lightness tab showed
  "Bright" and "Dark" above two boxes that were not there — every part of that cell belongs to HSL, because
  in OKLCH the ladder is the collection's. The same rule clears the empty *Lightness* label the collection's
  own ladder used to leave behind.
- **The two ends of a charted curve keep their captions**, so they read Bright and Dark rather than sitting
  as bare number boxes beside a captioned Middle.
- **Switching channel tabs no longer nudges the panel.** The curve's own Middle caption was 12px where the
  two adopted ends are 10px, which made the Lightness tab 9px taller than Hue and Saturation.
- **Grid, Spacing, Radius and Typography paid for a full document read on every panel open, even
  when nothing had moved.** The read already resolved a renamed group correctly, through
  `findFoundationSet`'s stamp lookup — but it asked the stamps unconditionally instead of trying
  the cheap recorded-address read first. `findFoundationSetCached` (`@foundation.js`) tries that
  cache read first and only reaches for the stamps on a miss, same result, cost paid only when a
  set has actually moved.
- **A renamed or duplicated collection's panel says so when it recovers a set from its previous
  group name**, instead of silently reporting it as a clean load. Recovery itself already worked;
  the panel just never said which happened. A genuinely duplicated collection has no manifest and
  no stamps to recover from — see `DEFERRED.md` #10.
- **An unfitted mode's middle anchor wrote as zeros, not as absent, and generated wrong colours.**
  Plan 36 leaves `middle` out of a fresh read on purpose, so the curve editor's own em-dash
  mechanism has something to disable. `collectRows` (`renderer.js`) collected it anyway: every
  number part still renders (blank, not zeroed), and reading each part back regardless turned an
  unparsable `""` into `0` — so a mode nobody had fitted came back
  `middle: {hue: 0, hslHue: 0, chroma: 0, saturation: 0}`, and a lightness curve interpolating
  bright → that "anchor" → dark read as grey through the middle of a real ramp. A group with no
  pre-existing value and every part still blank is no longer collected at all; a group that already
  had one, or that someone has actually typed into, still is. New tests cover both the group-level
  regression and a real form built from a post-read state end to end, the class of test — read,
  then serialize what the form collects — that was missing.
- **Selecting *Estimated original* could disable the curve control forever** if the fit it asked
  for never answered. It now gives up after 6 seconds, re-enables itself, and says so (a status,
  not help, per the `ux-copy` skill) rather than leaving the dropdown looking broken.
- **Adding a middle point, or dragging a curve that already had one, could still generate a rainbow
  of unrelated hues with no sharp corner on the chart to explain it — the margin above bounds a
  tangent handle's own *magnitude*, and says nothing about a segment that is not *monotone*.**
  Clamping each of a segment's two handles independently, each to its own safe span, can still leave
  both sitting on the same boundary — confirmed live: a segment inherited from an already-wild
  two-anchor curve settled at `[-0.002, -0.002]`, both handles below the segment's own starting
  anchor, a dip before a rise rather than a bulge. `oklchRamp` turns that segment's own height into a
  0..1 progress by dividing by the corner's; a non-monotone height divided this way does not read as
  "went a bit further than expected", it reads as the hue wheel spinning past and landing somewhere
  unrelated. Reproduced against the exact reported curve — a two-handle Hue curve dragged to `[0.157,
  -9.969, 0.709, -9.969]`, split at the real 16-step fraction — which previously generated
  `100° → 327.6° → 240.2° → … → 275.9° → 99.2°` and now generates a smooth
  `100° → 125.4° → … → 277.9° (the anchor, exactly) → … → 99.2°`. `bezierNormalise` (`@Bezier`) now
  checks each segment for monotonicity on every call, not only at the moment a middle point is
  first added, so a curve that passes once and is dragged further on a later frame gets the same
  correction. The first attempt used a strict, zero-tolerance check and broke a legitimate,
  pre-existing shape: "easeOutBack"-style curves intentionally overshoot past their target and
  settle back, which is non-monotone by design — caught by the project's own regression suite
  (1121/1122, not by further live testing) the moment the strict version landed. Replaced with a
  scale-invariant tolerance: the largest backtrack below any height already reached, measured in the
  segment's own local unit square, has to exceed one full local span before the segment gives up on
  its inherited shape in favour of a plain linear pace between its two real anchors — the working
  overshoot bounces at about a third of a span, the reported chaotic segment at close to one and a
  half.
- **A channel pinned exactly at its own range ceiling (or floor) — equal ends, no middle point —
  drew its plain, untouched default preset completely off the chart, no dragging needed; and once
  moved on screen, read as an impossible value.** Márton, live: Saturation at 100…100, nothing
  edited yet, the curve line out of the frame entirely, and then — after a first attempt widened
  the window to fit it — "still outside of range, 110 saturation?" The reason a value axis produces
  either symptom: with equal ends and no real middle, `oklchLerp`/`oklchLerpHue` interpolate the
  two ends linearly, and a straight line between two identical numbers is that number regardless of
  how the curve paces getting there (the same fact the equal-ends overshoot feature already rests
  on) — there is no real value for a handle's height to mean here, so any scale invented for it
  produces a number nothing downstream can produce and the field's own declared range cannot hold.
  `toView`/`fromView` (`renderer.js`) now draw and drag this one shape — a two-anchor curve with
  equal, middle-less ends — in the curve's own `[0,1]` square instead (`axisIsFlat`), the same space
  a curve with no axis at all already uses, rather than inventing a value scale for it. Every other
  shape (real values, or a real middle) is unchanged.
- **Dragging a curve's middle anchor could write a wildly wrong number into its own "middle"
  field, while the chart's own corner settled somewhere sane a moment later.** Márton, live:
  dragging a Hue middle anchor wrote 87.13°/86.39°/87.06° to the "Hue middle" field. The drag
  handler (`applyMove`, `renderer.js`) read the field straight off the raw pointer conversion —
  `pts[5]` before `bezierNormalise`'s own `[0.001, 0.999]` margin on the middle anchor's height had
  run on it — so the field and the curve could disagree about the very drag that just happened.
  That field feeds `axisView`, `effectiveGap` and `rampIsOffscreen` everywhere else in the control,
  so one drag frame seeding it with a number the curve never actually stored corrupted every
  window and drag-sensitivity calculation after it — very likely the largest single cause of
  three-point curves reading as "a mess" through this investigation. `pts` is now normalised
  through the control's own `curveValueOf` one line earlier, before the field write rather than
  after, so the field can never read a number the curve itself does not hold.
- **Adding a middle point to a curve already dragged into an overshoot never placed it where the
  curve visibly was — confirmed by Márton, live: "even though we have the data, the middle point
  field proves that."** `populateMiddleAnchorFromCurve` (`src/ui.html`) filled the new "middle"
  field from `points[5]`, the split corner's own height — always held to `[0.001, 0.999]` by
  `bezierNormalise` because generation divides by it — so the fill always read as a tame,
  in-between value, even when the curve had clearly overshot past bright or dark right at that x.
  The toggle's click handler (`renderer.js`) now reads the curve's real, unclamped height at the
  chosen split point with `bezierAt` *before* calling `bezierWithMiddle`, and passes it through the
  `config-ui-middle-point-added` event, so the field reflects where the curve actually was rather
  than where the split's own safety margin left the corner. `points[5]` remains as a fallback for a
  caller that predates this.

### Developer

- **`window.codefigProbe(tag, data)`, a generic, opt-in trace for chasing a UI discrepancy live.**
  Off unless `window.CODEFIG_PROBE` is set (on for now, while the Colors curve editor investigation
  below is active); every call is one `[PROBE][tag]` JSON line in `figma-console.log`. Added because
  several rounds of screenshot-and-report on the curve editor's overshoot/middle-point bugs cost more
  turns than the bugs themselves — a screenshot shows the symptom, never the sequence of internal
  state that produced it. Four call sites tagged `// PROBE:` — `curve:setPoints` and `curve:drag`/
  `curve:midInput` in `renderer.js`'s curve control, `preview:request`/`preview:result` around the
  config preview's own sequence-numbered round trip in `ui.html` — are what exists today; the utility
  itself is generic, so another panel with the same kind of "looks wrong and is hard to catch
  mid-change" problem can call it directly. Meant to leave cleanly: delete the `codefigProbe`
  definition and every `// PROBE:`-tagged line once whatever it was chasing is confirmed fixed.
- **`src/import-resolver.js` can resolve and extract across a package's members, opt-in.**
  `findScript`'s new third argument and `extractFunctions`'s new fifth argument are both no-ops
  when omitted — every existing script keeps resolving exactly as before, confirmed by the full
  pre-existing `tests/import-resolver.test.js` suite passing unedited. `build-package-manifest.js`
  compiles a package's manifest from its scripts and an explicit library list, verified against
  this repo's real Design System Foundations scripts. See `.plans/32-packages.md` — no shipped
  script has a package id yet, so none of this changes anything a user can see.
- **`src/config-ui/parser.js`'s `parse()` accepts an optional second argument, `panelSpecText`.**
  When given, the config form is read from a `@PANEL_START` JSON block instead of the one-line
  annotation syntax — see `.plans/31-panel-spec-json.md`. `src/ui.html` now looks for this region
  alongside `@CONFIG_START` at every real call site and passes it through; a script without one
  (every shipped script except Colors and Typography) takes exactly the old path. **Colors and
  Typography have migrated** — their specs live in `@PANEL_START`, `@CONFIG_START` holds only
  values, and the panel renders, edits and saves identically to before (Colors proved twice: a DOM
  diff against the old parser's own render, and a live Figma session against a throwaway copy of
  the script, before the real one was touched; Typography against its pre-migration rows dump). A
  paragraph in the new format states which neighbouring field it explains
  (`attachTo: "next" | "previous"`, required, no default) — the one thing a blank comment line
  could say that JSON otherwise couldn't, and the gap a DOM-level render comparison
  (`npm run devtools:dom-diff-panel`, new) found before anything shipped. Spacing, Corner Radius
  and Grid stay on the old path for now.
- **A CSS scoping module (`src/style-scoper.js`) is inlined into the build, unused.** Rewrites a
  stylesheet's selectors under an owner attribute, namespaces `@keyframes`, and rejects any
  non-`data:` `url()` and `position: fixed` outright rather than stripping them silently. Nothing
  calls it yet — it is groundwork for letting a script own its panel's styling, not a user-facing
  change; see `.plans/30-scoped-stylesheets.md` and `DEFERRED.md`.
- **A plain config field's DOM wrapper carries `data-key`, `data-type` and `data-section`; the form
  root carries `data-package`.** Additive — no class changed, no user script's rendering changes —
  so a stylesheet can finally address "everything in the General section" or "this one field"
  without editing `renderer.js`. Does not yet reach inside an `@rows` table (a mode's cells, an
  anchor group); see `DEFERRED.md`.

### Removed

- **The auto-import status note under Group within collection.** It reported what a read did or
  did not find, updating on every address change; Márton asked for it to go. `readAutoImport`
  (`npm run figma:ui`) still carries the same text — nothing about diagnosing a stalled or empty
  read from the terminal changed, only the on-screen copy.
- **The "OKLCH scale not applied to ..." banner.** Its *Apply OKLCH scale* button had no handler and had not
  had one for some time: pressing it did nothing. Each mode's own strip already names what changes and by
  how much, which is the same fact at a grain you can act on.

- **Dragging one inner handle brings the other with it**, collinear through the middle anchor — a smooth
  node, the way every vector tool behaves — so the two halves of a curve meet at the tangent and not only
  at the point. Only when the node was *already* smooth when the drag began: a curve fitted to a real ramp
  may hold a genuine corner, and mirroring on touch would destroy it. **Alt** inverts either way. Nothing
  is stored — collinear or not, the coordinates already say which kind of node it is.
- **The colour strip redraws while you drag a curve handle**, instead of waiting for you to stop. Its
  400ms debounce was reset by every frame of the drag, so it never fired until the pointer settled. There
  is a 120ms maximum wait now — the drawing itself measures 0.6ms, so what is being paced is the round
  trip, not the work.
- **The three anchor boxes and the three chart points are one set of values, both ways.** Dragging the
  middle anchor writes its field and typing in the field moves the anchor — the ends already worked, the
  middle did not, because the anchor lives in the curve and the value in a field.
- **An anchor drag no longer rounds a chroma to nothing.** It rounded to one decimal, which is right for a
  lightness or a hue and turns 0.044 on a `0..0.4` channel into 0. The precision comes from the channel's
  own range now.

- **`easeInOut` presets are one curve, not two halves joined at a middle point.** Two segments meant a
  *middle anchor*, and a colour channel travels through its middle anchor value — so choosing
  *Sine · easeInOut* for a saturation ramp routed it through a middle of 83 while its ends were 100 and 90.
  A preset named for smoothness put a corner in. They are single cubics now, fitted to the easing function
  they name: `sine` is 0.0002 out, the worst (`circ`, `exponential`) 0.033, and `quad` and `cubic` stop
  being exact — that is the price. **`outin` is unchanged**, because no single cubic comes within 0.04 of
  it and several are 0.15 out.
- **The anchor boxes no longer vanish when you let go of a handle.** Each channel declares two curves —
  one per colour model — and both were bound to the same group cell, because a group holds both models'
  parts. Releasing a drag refreshes every curve *except* the one being dragged, so the hidden twin was the
  only one to redraw, and it took the boxes into a panel nobody can see.
- **A colour channel bends at its middle anchor only if its curve has a middle point.** The two were
  independent, and the ramp resolved the contradiction in favour of the anchor — so removing the middle
  point from a saturation curve left a corner the curve could not possibly draw. On lime that was a dive
  to 83 and back in a ramp running 100 to 90. The curve decides now, and the Middle box is greyed when it
  is not consulted, keeping its value for when the middle point comes back.
- **The bar beside each chart shows that channel, not the tokens.** It was drawn from the collection's
  token colours — a lightness ramp — so it looked right on Lightness and showed a light-to-dark sweep on
  Hue and Saturation, and it could not follow a drag because those colours are the file's. Each curve now
  carries a CSS colour template: a hue wheel, a saturation fade, a lightness fade, mixed by the browser
  and re-read on every redraw.
- **A colour channel whose two ends match now has a chart.** Lime's saturation is `100 … 83 … 100` —
  both ends pinned, all the movement in the middle — and the axis bailed on the equal ends, taking the
  ticks, the zoom, the colour bar and the draggable ends with it. The whole Saturation tab looked
  unimplemented. The window now opens on all three anchors, not two.
- **The zoom reads as how much of the channel is on screen**, so a chart showing all of it sits at the
  bottom of its track instead of half way up. It was reported as a multiple of the view the channel opened
  on, which meant a full-range chart claimed to be half zoomed in.
- **Colors: an OKLCH collection's lightness ladder is now averaged across its modes** instead of
  taken from whichever one was read first. The ladder is shared — that is what makes the modes match
  in greyscale — so one mode used to get a ladder fitted to itself and the rest got someone else's.
  On a two-mode lime that was worth thirteen 8-bit levels of accuracy for the mode that lost the
  toss (21 from the file against 11); both now read 15. Collections whose modes already agree pay at
  most one level.

The find/replace scripts were the focus: they now agree on what a pattern means, and they show
you what they will do before they do it. The Design System Foundations scripts also stopped
deleting variable modes they did not recognise.

### Added

- **Change case** — recursively renames frame and group layers, component variant labels and values,
  and optionally instance names, in lower case, title case, or camelCase.
- **Selection to variables takes a group.** A **Group within collection** field says once where the
  variables go inside the collection, instead of every layer having to repeat it in its own name.
  It is a prefix, so it composes with the slashes already in a layer name rather than replacing
  them: group `bark` over a layer called `900` and no group over a layer called `bark/900` both
  write `bark/900`, and group `primitives` over `bark/900` writes `primitives/bark/900`. Left empty,
  nothing changes about how the script behaved before.
- **A bezier curve editor, for curves you draw rather than curves you pick from a list.** Two anchors and
  two handles: drag them, nudge them a percent at a time with the arrow keys (ten with shift), choose a
  starting point from the preset list, or paste `cubic-bezier(0.37, 0, 0.63, 1)` into the field underneath.
  **Add middle point** turns it into a three-anchor, two-segment curve so the top half can bend differently
  from the bottom — the split is exact, so adding the point does not move the curve. The coordinates *are*
  the setting: there is no family name stored beside them, so the preview can never show one curve while a
  run generates another, and the dropdown reads *Custom* the moment a curve stops matching a preset.


- **A Colors panel that reads a colour set and shows you where it stands — it does not write yet.**
  Three lightness anchors and a curve make a **ladder shared by every mode in the script**, so two modes
  land on the same tone with different hue and chroma; that is what makes them match under a greyscale
  filter. Each mode block carries its own seed, its own hue and chroma per anchor, and **its own palette
  strip**. In HSL the curve stays per mode, because an HSL curve legitimately belongs to a hue.
  - **Point it at a collection and group and the panel fills itself** from the variables: the steps from
    their names, and hue, chroma and the three anchors from the real first, middle and last values. It
    does **not** guess a curve — an existing ramp is a list of colours with no record of how it was made
    — so it draws what is in the file *underneath* what it would generate, each changed step's old hex
    struck through beside the new one.
  - **"OKLCH scale not applied" is a question, not a stored flag.** It is re-asked on every edit by
    comparing the file's values against the config's own output, so it cannot go stale, and the banner
    and the strips are driven from one comparison rather than two — they cannot disagree about how many
    steps would change.
  - **Lock seed re-anchors, it does not offset.** The middle anchor becomes the seed's own lightness and
    the ladder is recomputed through it; bright and dark are untouched, so the endpoints still match the
    shared ladder exactly. Interior steps drift, and the largest deviation is reported beside the field,
    because that number is the whole decision.
  - What it will not read: **an aliased variable is read through and never written** — an alias is a
    deliberate indirection and replacing it with a raw value breaks a link silently. A **non-opaque
    variable is reported and skipped**, never composited over an assumed background to invent a
    lightness. A group where **more than half** the variables are non-opaque is an alpha ramp, not a
    lightness ramp, and is declined in one line rather than itemised skip by skip.
  - **Run writes nothing.** It says so, and says why: the write path is gated on its dry run being
    reviewed first. A Run that half-wrote a colour set would be worse than one that refuses, because
    what it would be half-writing is a collection other files subscribe to.
- **HSL modes are per mode again.** A mode block in HSL now carries its own **Saturation** and
  **Lightness** beside Hue, and Chroma appears only in OKLCH. This was not cosmetic: HSL has no shared
  ladder, so a mode's own three lightness values *are* its ladder, and with nowhere to put them every
  HSL mode fell back to the same 98/46/4 and generated an identical ramp whatever you typed. Reading a
  collection now fills whichever set the panel is on, from readings taken in that model — a hue in
  OKLCH is a perceptual angle and a hue in HSL is where the maximum channel sits, and putting one in
  the other's field is a plausible-looking wrong number in every cell.
- **A `@rows` column can carry `@placeholder="…"`**, the same annotation a field spells, so a cell can
  show a grey example. A numeric cell labelled *Chroma* gives a first-time reader nothing otherwise:
  `0.012` and `12` are both plausible guesses and only one of them is a colour.
- **A column's condition can name a form field**, not only another column in the same row. It still
  prefers the row — two modes on two tabs can be on different scale types at once — and falls back to
  the form, which is what lets a mode's fields depend on a setting that sits above the whole table.
- **A settings panel fills itself from a set CodeFig never made.** Point Grid at a collection and group
  holding a grid — one built years before this plugin, or by hand — and the settings load from the
  **variables themselves**, matched by name and structure: `columns`, `gap`, `padding`,
  `viewport-width` and the `col-1…N` series. No id, no record, nothing CodeFig had to have written
  first. A value the set does not carry is worked out from the ones it does, and the panel says which
  of the two happened. It then checks itself and tells you whether running would change any of your
  values — and names what could not come back rather than leaving it at a default that implies it was
  read: *Generate overview* is not a variable, and *Extra columns* is inferred from how many `col-*`
  variables there are.
- **Grid suggests margin and gap pairs that divide into whole numbers.** The Suggested whole number
  divisions section is live: it searches whole margins and gaps around what you have, keeps the pairs
  where every column comes out a whole number, and ranks them by how many of your modes they are clean
  for, then by how little they move your values, then towards round numbers — a 79px margin is
  arithmetically as good as 80 and nobody wants one. Your current pair is always the first card when it
  divides cleanly. **Clicking a card changes the mode you are looking at and no other**: the badges say
  where else the pair would work, they are not a promise to write it. Nothing is applied by looking —
  only by clicking. When nothing in range divides, it says so and says what it searched, and when there
  are more results than cards it says how many.
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
- **Pick a mode the same way you pick a collection.** A settings form can now offer the modes of
  whichever collection it is pointed at, plus *New mode* and a name — created on Run, exactly as a
  new collection is. It follows the collection picker above it, so changing collection changes the
  modes on offer — and empties it, because a mode you picked in one collection is not a mode of the
  next one. Left empty, values go to the collection's default mode. A config that arrives naming a
  mode this file does not have says so before you run, rather than creating it quietly.
  **Selection to variables** uses it; any script can, with `// @mode: targetCollection` on a var line
  and `getOrCreateMode` from `@Variables`.
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

- **The mode chips do something.** They were a view; now they are the control. Click a chip's label to
  rename that mode — a **rename**, so its values and every binding to it survive. The dash removes one,
  and says what that costs before it happens: *"Removing mode Tablet at Run — 12 variables hold values
  there, and any binding to it is lost."* The `+` adds one, seeded from the mode beside it so its
  settings tab has real numbers to edit. Drag to reorder. **Nothing reaches your file until you press
  Run**, and removing a mode then adding one with the same name is how you replace it — the panel says
  *"Replacing…"* when that is what you have set up.
- **A config pasted from another file still never deletes a mode.** A mode this config has not heard of
  is left exactly where it is, values and all. The only thing that removes a mode is clicking its dash.
- **Name a series of tokens instead of typing it out.** `spacing-{1,10}` in the Tokens field is ten
  tokens, `spacing-1` through `spacing-10`, and it mixes with names you write yourself:
  `none, px, spacing-{1,10}`. `{10}` is short for `{1,10}`. Two details worth knowing because they are
  requested by writing them rather than by a setting: it counts **down** as readily as up, so
  `heading-{6,1}` names a heading ramp smallest-to-largest, and a written leading zero is a width, so
  `{01,10}` gives `spacing-01 … spacing-10` — which sorts the way it reads in Figma's variables list.
- **Corner radius has its panel**, and its preview draws the thing you are judging: a 200×120 box per
  token with the radius applied at its real size, the name beside it and the value past it. Same skeleton
  as the others — General, a tab per mode, Preview — with each mode carrying its own scale and its own
  rounding. `none` is no longer a special case in the maths: it is an extra value of `0` that fills the
  smallest token name.

  **A radius past 60 says so.** The corners of a 200×120 box meet there, so 60 and 600 draw the identical
  pill — and the shipped design's own largest token is 96. Without the note, two different numbers look
  like the same picture.

  **The numbers are unchanged** in all three modes: desktop still generates `0, 4, 8, 12, 16, 24`. Only the
  spelling moved.
- **Typography has its panel.** The same skeleton as Grid and Spacing — General, a tab per mode, then
  two sections of its own: an **Overview** table listing every step with its size, line height, ratio,
  tracking and the variable a run will write, and a **specimen** setting your own preview copy at the
  real sizes, largest last. Each mode carries its own scale (Modular, Metric or Fibonacci) and its own
  rounding, and **Base unit is the size of the first token**, so tokens read smallest to largest and
  nothing has to say where the base sits.

  **Line height and letter spacing take two numbers each** — the value at the smallest step and,
  optionally, the value at the largest. Both are in px, and what runs between them is the *relative*
  quantity: line height as a ratio, tracking as a share of the size. That is what makes absolute line
  height rise while its ratio falls, and tracking tighten as type grows, which is the interaction the
  type-scale tools chart and none of them computes. **Fill in only the first and nothing changes from
  before**: line height keeps the base ratio and tracking stays flat.

  Two smaller things came with it: font weights are a list where a number is a weight and a word is a
  Figma font style name (`400, Semi Bold`), and text styles have their own two fields — whether to create
  them, and their naming — instead of being edited as an object in the code tab.

  **Configs written before this keep working and generate exactly what they generated**, pinned by a
  test: per-mode `minFont`/`baseFont`/`maxFont` with a top-level curve and easing still run, they simply
  have no controls. The default block's token *names* are unchanged, so a run updates the variables you
  already have — but its numbers are new, because a per-mode ratio has no min, max or easing with which
  to reproduce a sine ramp from 8 to 200.
- **Scale type is a set of radio buttons, and every ratio says what it is.** *Modular scale / Metric
  scale / Fibonacci* are visible at once instead of hidden in a dropdown, and the Scaling method list
  reads *1.25 Major third*, *1.618 Golden ratio* rather than bare numbers. The dropdown is now as wide as
  its longest option instead of a fixed share of the row.

- **A config form explains itself in one place: the ⓘ beside a label.** Helper text under the control,
  the descriptive comment lines between fields, and a control's leftover comment prose were three kinds
  of grey text in one form — and the third had never appeared at all, because it set a browser tooltip
  whose only styling hook had no rule behind it. They are one thing now. Hover the ⓘ, or reach it with
  Tab and press Enter to pin the bubble open; nothing that used to be written down has been thrown away.
  - **What a script's config block looks like has not changed**, and neither has what it means. A
    paragraph is still a comment line and `@helper:` is still `@helper:` — the panel decides where to
    show them, and writes your block back exactly as you wrote it, comments and all.
  - **A paragraph belongs to the control it sits against**, above it or below it, whichever it is
    touching — a blank or bare `//` line is the separator that decides. All 68 in the shipped scripts
    were checked one by one; two blocks whose spacing disagreed with their intent were given the
    spacer that says what they mean.
  - **A block that is meant to be read says so**, with `@prose` on a line of its own — its paragraphs
    stay on the page. *Help & documentation*'s specimen shelf is the one that uses it.
  - **Notes that report what is about to happen stay where they are**: why a field is disabled, that a
    collection will be created, that a mode will be removed at Run. A description moves behind a hover;
    a consequence does not.

- **Every field label is sentence case, the way Figma writes one.** 87 of the plugin's 123 labels had
  never been written by anyone: with no `@label:` set, the name of the variable was split at its
  capitals and left there, so `fileKeyOrUrl` read as *File Key Or Url* while the 36 hand-written labels
  beside it were sentence case. The plugin disagreed with itself on the first thing anyone reads. Your
  config blocks are untouched by this — nothing starts writing `@label:` into them.

- **Helper text explains the control it is attached to, in plain words.** A pass over every explanation
  in the shipped scripts: the ones that named a variable in the source rather than the field on screen
  ("leave `searchFor` empty" where the label says **Search for**), the ones that only repeated their
  own label, and three broken sentences. Notes that had been parked under a section heading now sit on
  the control they describe — *Amount* and *Hue* in Colors, the collection and payload fields in
  Export/import.

### Fixed

- **"New mode" adds a mode; it no longer renames the one you had and writes through it.** A collection
  that has been in the file for months, whose single mode nobody ever bothered to rename, is still
  called *Mode 1* — and `getOrCreateMode` treated that name alone as proof the mode was a placeholder
  Figma had just made. Choosing **New mode** and typing a name renamed it instead of adding one, so
  every value in the only mode the collection had was overwritten by the run. Found on a colour
  collection with sixteen variables in it: *New mode / Lime-2* came back as sixteen updated variables
  and no new mode. The placeholder rename is still there, because a collection created seconds ago
  should not be left with a stray *Mode 1* column beside the mode you named — but it now asks the
  question that actually decides whether renaming is safe: **is there anything in this collection to
  lose?** An empty collection cannot lose a value to a rename. A collection with variables in it gets
  a real second mode. Affects **Selection to variables**, the only script that uses the mode picker.
- **Renaming a variable group no longer loses the config behind it, or duplicates the tokens.** A
  generated set was found by name, and the name was in three places at once: the manifest's storage key,
  its group field, and its list of modes. So renaming a group — reorganising the variable table, which
  is a normal thing to do to a design system — produced both halves of the same failure at once. The
  panel found no config and offered its defaults over a set sitting right there, and the overview
  reported every one of that set's tokens as missing. Running it again then wrote a *second* set beside
  the first: new variables under the new name, the originals orphaned, and every binding in the file
  still pointing at the orphans.

  Each generated variable now carries a stamp saying which token of which set it is, so a set is found
  by identity and a name is just a label — the same way a Figma binding survives a rename. What this
  changes in practice:

  - **Rename a group in Figma and reopen the panel**: your config comes back, at the new name.
  - **Rename a group in the panel and run**: the tokens *move*. Same variables, same ids, same published
    keys, so nothing bound to them breaks — instead of a duplicate set and a pile of orphans.
  - **Rename a single token, or a mode**: the run finds it and no longer reports it missing. A token or
    mode that is genuinely deleted is still reported, exactly as before.
  - **Move half a set into another group** and the load says so, naming where the other half went —
    something that was previously invisible outside the variable table.

  Sets made before this keep working and are adopted on the next run; nothing is rewritten or deleted to
  migrate them. Colors is unaffected, since it does not write variables yet.

- **Loading a Typography config no longer turns the font weights into a text style per character.** A run
  promotes the panel's `400, 600` into the map it names styles from, and that map is what the collection
  records — so loading it back put `{ 400: 400, 600: 600 }` into a field that holds a comma list, where it
  became a *string*, and the next run enumerated that string's characters: `Text-Tiny/0` through
  `Text-Tiny/28`, under every token in the scale. The weights come back as the list they were written as.
  A map that names its weights (`{ Regular: 400 }`) is a different statement and still comes back as one,
  read-only in the form and editable in Configuration code — where before it silently degraded to text.

- **A foundation script no longer opens on "New collection".** The picker cannot tell a shipped default
  from a name somebody pasted, so a default of `Responsive System` in a file without that collection landed
  on *New collection* with the name already filled in — the panel's first statement being that it was about
  to create something. Typography, Spacing, Corner radius and Grid now ship no collection name, so the
  field opens as the plain dropdown Colors already was: pick one of this file's collections, or ask for a
  new one.

- **Pointing a panel at a collection and group now loads the tokens that are there**, whether or not a set
  was ever recorded. Only Grid read the file's variables when nothing was recorded; every other domain gave
  up, so opening Typography on a file holding four tokens showed the shipped ten. It reads the **names**
  only — recognising *how* a set was built is a much larger question, and a panel opening on somebody's
  collection is not asking it. Every scale control keeps what it holds, so a real set loads and you adjust
  it from there.

- **`figma:ui readAutoImport` now says *why* a set was not loaded.** Every refusal used to look identical
  from outside — the panel simply showed defaults. It reports the reason (`edited: spacings`, `no parser`,
  `current block did not parse`), which is how the stale-source race above was found. Dev-only.

- **Opening a foundation script now loads the set the file already has.** Auto-import only ever filled when
  you *changed* the collection or group — opening a script ran a read-only pass, so a file with a recorded
  set still showed the shipped defaults. The guard was a proxy for the thing that matters: nothing should
  fill over values you typed. That is now asked directly — a block still equal to the script's own source,
  bar the address, has nothing in it anybody typed, so the set loads into it; an edited block is left alone.

- **Typography never recorded the set it wrote, so its panel could not load one.** Spacing, Corner radius
  and Grid all write a manifest onto the collection when they run; Typography was the last domain that did
  not. The read half had been built — the block carries `@fromFile: domains.typography` and auto-import
  knows how to fill from it — so opening the script in a file that already had a typography set showed the
  shipped ten token names over the four the file actually holds. A test now fails if any foundation script
  writes variables without recording what it wrote.

- **Clicking anywhere in a cell opened its ⓘ explanation and pinned it there.** A `<button>` is a labelable
  element and the cells were `<label>`s with no `for`, so the explanation became the cell's control and every
  click in the row was forwarded to it. It read as the whole row being a hover target, which is why nothing
  in the hover handling touched it. Cells carrying an ⓘ — and every curve, whose dropdown had the same
  problem — are now plain elements.

- **The curve's ⓘ tooltip stayed open while you worked in the row.** Dragging a handle calls
  `preventDefault`, which stops focus moving — so once the button had focus its bubble never dismissed, and
  it read as the whole row being a hover target. Grabbing a handle now takes focus, which also means the
  arrow keys work straight after a drag.

- **Large typography specimens were cut off top and bottom.** A line height below the font size is a real
  choice, but it puts the glyphs outside their own line box and the horizontal clip took the rest. The row
  now reserves the height it needs and clips sideways only.

- **The curve editor overlapped the field below it.** Its height came from `aspect-ratio` on the canvas, so
  the row was sized from a width the grid had not finished resolving — measured at 304.88px, painted at 320,
  and the control hung 15px into the next row. Stating the height removes the dependency. The label also sat
  halfway down a 400px control; it now lines up with the row of buttons at the top.

- **`setField` could not reach a radio inside a mode's fields, and said it had.** The cell carries the field
  name on a wrapper, so the command set a property on a `<div>`, changed nothing, and reported success —
  which made every *Scale type* in Spacing, Corner radius and Typography undrivable from the terminal. The
  curve editor had the same shape, and `readForm` reported a curve as `null`. Dev-only tooling.

- **A scale the generator refused now says so, instead of drawing plausible numbers.** A mode whose model
  could not produce a sequence — a bezier ramp with no largest value, a metric one with no step — fell back
  to the minimum for every missing step, and the monotonic guard then walked those apart by the rounding
  grid. The result was a complete-looking ladder of invented numbers and a console warning nobody reads.
  Spacing, Corner radius and Typography now print the reason where the preview would be, and a run stops
  rather than writing.

- **A base of `0` is a base.** `!sizes.base` read it as a mode that had declared nothing, so the viewport
  silently produced no values — and the path it took was missing a field the caller used unconditionally, so
  it crashed with `Cannot read properties of undefined` rather than reporting anything.

- **The batch rename and rebind examples now work if you type them.** Every one of the five scripts
  showed its example as `"50, 050",` — quoted, comma-terminated — and the parser splits each line at
  its **first** comma and keeps the rest verbatim. Pasted in as shown, that renamed `"50` to `050",`,
  quote and comma included. The examples are bare pairs now, and the note says so: no quotes, no
  trailing commas.

- **A helper no longer breaks its lines wherever the source file happened to wrap.** Every newline in a
  config block's comment became a hard line break on screen, so an explanation wrapped at the `.js`
  file's margin arrived with breaks mid-sentence — 18 of them across the shipped scripts. A line break
  in a paragraph is a wrap now, as it is everywhere else in markdown; a blank line still starts a new
  paragraph, and a list is still a list.

- **Picking a ratio in the panel now generates a scale.** A dropdown's value is text, so choosing
  *1.25 Major third* wrote `ratio: "1.25"` — quoted — and the generator, which accepts a number or a
  ratio's name, answered "unknown ratio" and produced nothing for that mode. Numeric dropdowns read back
  as numbers, and a quoted number is understood wherever a ratio is accepted, so a config typed by hand
  behaves the same way.
- **The Design System Foundations scripts no longer ship a three-viewport system.** `desktop`,
  `tablet` and `mobile` were an example of one Figma file, and shipping them in `grid`, `spacing`,
  `typography` and `corner-radius` made them the plugin's opinion about every file — running any of
  the four on a new collection created those three modes. Each block now ships **one starter mode**,
  named `Value`, which is what Figma's variables panel shows for a single-mode collection; a
  collection cannot exist with no modes, so one is the floor rather than none. Point a panel at a
  collection and its real modes replace the starter. **If you relied on a fresh run producing three
  viewports, it now produces one** — add the rest with `+`, or point the panel at a collection that
  already has them.
- **A panel no longer proposes creating a mode your collection does not have — and a run no longer
  creates one.** The shipped Spacing block names `desktop, tablet, mobile`; point it at a collection
  whose modes are `Desktop / Pad / Mobile` and `tablet` matched nothing, so it sat there as a fourth
  tab. It was not cosmetic: mode setup takes the config's mode list literally, so **running created a
  `Tablet` mode nobody asked for**, in any file whose viewports are named differently from the
  script's defaults. A mode block the collection has no mode for is now removed and **named** in the
  line under Group, so it is never a silent deletion. Pressing **+** still creates a mode: that is now
  recorded as an intent, which is what tells a mode you typed apart from one the template shipped —
  the two are identical in the config, and treating them the same is what caused this. One caveat, by
  design: pasting a config written for a different collection now drops the mode blocks this
  collection has no modes for, each one named.
- **A panel now shows every mode the collection has, not only the ones its config knew about.**
  Pointing Spacing at a five-mode collection — Desktop-large, Desktop, Tablet, Tablet-small, Mobile —
  left the panel on the script's three, correctly spelled and in the file's order, with two of the
  collection's modes silently missing. The collection's modes were already being read; that read was
  used to reorder, re-spell and report, and never to add. A mode with no settings here now gets a
  block, in its position, **written like the mode next to it** — so the values on a new tab are a
  copy of its neighbour and a starting point, not a reading of your file, and a line under Group says
  so. A mode you removed with the dash is never put back. Previously this alignment also ran only when
  a script opened, so *choosing a collection from the dropdown* — the obvious way to ask the question —
  did less than opening the script did; both paths now do the same thing.
- **Modes are shown in the collection's order.** A loaded config listed its modes in whatever order it
  had been stored in, which on a five-viewport system — Desktop-large, Desktop, Tablet, Tablet-small,
  Mobile — reads as no order at all. The chips and the Mode settings tabs now follow the order Figma
  has for that collection, which is the order you see in the variables panel and the one the plugin
  cannot change. A mode the file does not have yet follows the ones it does, rather than being dropped
  or setting the order itself.
- **Applying a suggestion or editing a mode chip keeps you in the mode you were editing.** The panel
  rebuilt itself after either and landed back on the first tab, so a change made in Tablet looked like
  it had gone to Desktop — the preview and the suggestions followed the jump too.
- **Loading a config no longer gets undone a moment later.** When settings loaded from a file, the form
  had not caught up with the text, and the next thing that touched the panel wrote the old values back
  over the new ones. Affected every automatic load, not just the recognised ones.
- **Selection to variables shows its results.** The Info panel it promises had never appeared: the
  call that opens it carried two functions, which cannot cross into the panel, so it threw before
  drawing anything and took the rest of the run's reporting with it. Variables were still created —
  only the list of what happened was missing.

- **"New collection" now gives you somewhere to type the name.** Choosing it from any collection
  picker left the select sitting on an option that appeared to do nothing: the name field only ever
  revealed itself for a collection name that arrived in the config already, which is the pasted-config
  case rather than the one you click. It also no longer disappears from under you when the file's
  collection list finishes loading a moment after you picked.

- **Editing a settings form no longer drops a mode's name.** Under the mode tabs the name is not shown
  — the chips above it are the name — and reading the tabs back rebuilt each mode from the fields it
  could see, so the first edit to *any* setting deleted every mode's name from the config. Nothing in
  your file was affected; the config in the editor was. A panel now only overwrites what it actually
  shows, so a setting it has no field for survives being read.

### Removed

- **Two type tokens that held the same value, and one that was a pixel from another.**
  `--font-size-caption` and `--font-size-helper` were both 10px and differed only in which part of the
  stylesheet used them; they are one token, `--font-size-small`. `--font-size-headline` (15px) sat one
  pixel from `--font-size-title` (16px) — two sizes that close read as an accident rather than a
  decision — and is gone, its three users now either the 20px document title or the 16px section size.
  `--font-size-code` (11px) is new and monospace-only: a mono face at the body's 12px reads larger than
  the prose beside it, which is the one reason an 11 belongs in the sheet.

- **The import button is gone.** Auto-import replaced it: choose a Collection and a Group, and a
  recorded config loads itself with a line under Group saying so. The button only ever appeared when
  it had something to offer, which meant working out whether it *would* appear was a question you
  could not answer by looking — and it appeared a beat late after a run, which is now moot rather than
  fixed. Nothing else about loading changed: it still writes into the editor only, and your file is
  unchanged until you run.

### Fixed

- **The configuration panel no longer gets slower the longer you work in it.** The form's `change` and
  `input` listeners sit on a container that outlives the form inside it, and nothing removed them — so
  every rebuild of the form added another pair, and one keystroke ran the whole pipeline once per rebuild
  that had ever happened. Colors rebuilds the form most (mode chips, auto-import, a collection change, a
  model switch), so it degraded fastest: deleting a digit came to take about a second.

- **Dragging a curve handle is smooth.** Moves are coalesced to one per animation frame instead of one
  per pointer event, the config editor is no longer rewritten mid-drag — the text is committed when you
  let go, and flushed before anything reads it — and dragging one curve no longer redraws every other
  curve on the page.

### Changed

- **Selection to variables writes its results down without opening the panel over your file.** The Info
  panel still holds the whole run — every variable, its value, and whether it was created or updated,
  each row still clickable to select the layer — and the button still shows there is something in it.
  It just stays where you left it. The notification is the outcome; a panel that takes over the window
  to say the same thing in more words is the plugin talking over the work. Scripts can ask for this
  with `autoOpen: false` on `displayResults`; the default is unchanged, so every other script still
  opens the panel for anything that is not a plain success.

- **The preview says how far a change is, not only how many steps it touches.** Now that a read reproduces
  a collection closely, an untouched one reports ten of sixteen steps "changed" — every one by a few levels
  out of 255, which nobody can see. It now reads *"10 of 16 steps would change, by up to 4 of 255"*, and a
  difference too small to see is named as one.

- **A read now lands within 10 of 255 in either colour model, on every scale.** It was 49 in HSL and 37 in
  OKLCH, and the cause was that *where a ramp turns* was being decided twice: recognition read its three
  anchors at the middle of the step list, while the generated ramp bent at its own midpoint. Those are one
  fact. Real sets mostly turn at 400 while the midpoint of a sixteen-step list is 300, so the anchors were
  read at one step and applied at another.
  It is now found by measuring — generating at each candidate step and keeping the one closest to the file
  — and recorded, so generation bends where the anchors were read. Two properties of the colours were tried
  as a rule first and both failed: anchoring on the peak of OKLCH chroma is right for OKLCH and leaves HSL
  at 60, anchoring on the peak of HSL saturation is the reverse at 67.

- **Hue can carry its own curve.** Worth little on a cool palette (under 6°) and a lot on a warm one — an
  amber ramp travelling 49° came back 10° out and is now within 1.2°. Only fitted where there is enough
  chroma for a measured hue to be a value rather than rounding, which on a greyscale it is not.

- **Colour has its own curve, not the lightness curve's timing.** Chroma used to be rebuilt by
  interpolating three anchors on the *lightness* curve's schedule, so a palette was paced by its ladder
  rather than by itself — Tailwind blue came back a third less colourful than the file at its most
  saturated step. A read now fits a chroma curve too, and the worst-step error drops from 0.026–0.067 to
  0.002–0.007. It is the same kind of curve as the lightness one, in the same editor: chroma is not
  monotone, but each half of it is, and two half-fits joined at the peak is exactly a three-anchor curve.
  Leaving it empty keeps the old behaviour, so nothing already made moves.

- **A read recognises the curve the collection was already drawn with.** Opening a colour set used to land
  on *Original* — the file's values and an empty curve editor — because a ramp carries no record of how it
  was made. That is true of naming a preset and false of fitting one: a fitted three-anchor curve lands
  within about a lightness point of published sets (Tailwind zinc 0.86, slate 0.64, blue 0.52, Radix gray
  0.94) against 4.0–6.8 for the closest named curve. The dropdown calls it **Estimated original**, and
  selecting it again restores it after you have bent it elsewhere.

- **Colors opens empty, and fills in as you answer it.** Nothing below *General* until a collection is
  chosen, and no preview until the colour tokens are named — it used to draw a full ramp over a placeholder
  list, which reads as a result rather than as an invitation. A new scale starts on **Linear** rather than
  *Original*, which names nothing on a collection that has no ramp yet.

- **Steps is now called Color tokens.**

- **Colors has one curve, not two.** *Lower* and *Upper* are gone; a colour ramp is described by a single
  curve running bright to dark, and *Add middle point* is what bends the two halves differently. In **HSL**
  that is one curve per mode; in **OKLCH** it is one curve for the whole collection, which is what makes
  every mode land on the same lightness ladder and match in greyscale.

  The curve's middle anchor now *is* the middle lightness and the step it sits on, so the separate **Middle**
  lightness field is gone — it was a second answer to a question the curve already answered, and the two
  could disagree. Existing configs written with a *Lower* and an *Upper* curve are joined into the single
  curve they always described, reproducing their ladders to under 1e-6; nothing you have made moves.

  One capability goes with it: a half on *Original* while the other half was a curve. A curve is now either
  *Original* — the file's own colours, untouched — or a shape spanning every step.

- **Bezier is the default scale everywhere.** Spacing and Corner radius ship it now too, so a fresh panel
  opens on the model the whole thing is built around rather than the one you have to switch to. The starter
  numbers change with it — a geometric ramp does not land on a flat 4/8/12/16 grid, and that is the model
  showing what it is.

- **The curve dropdown is the shape control, and *Custom* is a real state.** Picking Custom on a straight
  line now gives you handles to drag; it used to do nothing, because "is there a shape" was derived from
  "is the curve bent" and a straight line is not bent. *Linear* clears them again. An untouched curve still
  stores `[]`, so an unrelated edit does not write coordinates nobody chose.

- **Typography: a rounded size says so beside itself** — `Font size: 218 (218.37)` rather than a separate
  *Rounded from* line at the bottom of the block, which left you matching it back to whichever value it
  belonged to.

- **Typography: line height and letter spacing are one row each, in percent.** `[Base][Max]` with the unit
  drawn inside the field, and the numbers are percentages of the font size — Figma's own unit for both, and
  unlike a pixel value a percentage still means the same thing after the scale grows. The variables are
  still written in pixels, computed per token, so nothing downstream changes. A config from before this
  spells them as bare numbers and keeps generating exactly what it always did; the two are told apart by
  **shape** rather than by range, because `-1.2` is equally plausible as −1.2px or −1.2%.

- **The script log is for errors and warnings.** A successful run used to fill it with a summary of what it
  had just done, which buried the one case the block exists for. The lines are still captured and still
  reach the dev bridge. Spacing and Corner radius also stopped repeating the scale table into the results
  panel — the Configuration tab already draws it, live, and the copy went stale on the first edit.

- **The scale editor is one control.** The growth has no field of its own, the *Add shape* button is gone,
  and the dropdown does that job — *Linear* means no shape and draws no handles, anything else reveals them.
  The field underneath always carries the whole scale, `1.5 cubic-bezier(0.333, 0.333, 0.667, 0.667)`, so
  copying it out and pasting it back reproduces it; it takes a growth alone, a curve alone, or both. The
  growth is still written to the config under its own name, so a block reads `ratio: 1.5` beside `curve: []`.

- **The scale curve is open-ended again: a base, a growth ratio, and a shape — no largest value.** The first
  version of this asked for both ends and distributed the tokens between them, which was wrong twice over.
  Nobody knows the largest spacing in advance; and pinning both ends meant **adding a token re-subdivided
  the range and moved every value below it** — six variables already bound to things in a file, silently
  changed because somebody added a seventh. The top is now derived from the ratio, so the step count cancels
  out: a flat curve is a modular scale exactly, and appending a token leaves everything before it alone.

  The **named ratio dropdown is gone**. It was a closed list of eight, and the complaint was that nothing
  sat between 1.25 and 1.333. Growth is a plain number now, and the curve's y axis is **logarithmic** — so a
  constant ratio is a straight line whose slope *is* the ratio, and you drag it. **Add shape** reveals the
  bezier handles for when the growth should vary across the scale. Past the last token the line continues
  faintly, because the scale does.

  Colours are unchanged: lightness is bounded, both ends are known, and the two-anchor editor is right there.

- **Spacing, Corner radius and Typography: *Modular scale* is now *Bezier scale*, and generates the same
  numbers.** A modular scale is a constant ratio between steps, which in log space is a straight line — so
  the curve model with a straight curve *is* a modular scale, checked term for term. What it adds is the
  ability to bend it: the ratio can vary across the scale, so a spacing set can stay tight at 4, 8, 12 and
  still open out at the top, which one ratio could never say. A bezier mode takes **Largest value** and a
  **Curve** where it used to take a *Scaling method* ratio.

  **Configs that say `modular` keep working and keep generating exactly what they generated before** — the
  ratio is converted to the equivalent ramp. Nothing in an existing file is regenerated to a different
  number, which matters because these values are already bound to as variables. Typography's shipped default
  moved from `modular`/`1.25` to `bezier` with a largest size of 60, and produces the identical ten sizes.

- **Colors: the Family, Easing and Amount dropdowns are now the curve editor.** The lightness ladder's lower
  and upper segments each get one. *Original* — the ramp already in the file — is still there, spelled as a
  curve with no points. Configs carrying the old `{ family, easing, amount }` are converted on read;
  `linear`, `quad` and `cubic` convert exactly, and the rest are within 0.01 of the range, which is
  documented per family in `@Bezier`.

- **One heading ladder, and one title per script.** The Documentation tab and a script's settings form
  render the same markdown, and until now they styled it with separate rules — `## Overview` was 15px in
  one tab and 14px in the other, and every heading question had to be asked twice. There is now a single
  ladder both read: **`#` 16px, `##` 14px, `###` 12px semibold**, with body copy at 12px. The **document
  title in the editor header is the only text above that, at 20px** (it was 15px), and it is where a
  script's name lives.
  - **The duplicated titles are gone from the scripts themselves.** Every doc block used to open by
    repeating the script's own name, and most config blocks opened by repeating it a *third* time in a
    third wording — "Rename variables" in the sidebar, "Rename variables" again as the first heading,
    "Batch rename variables" over the settings. 70 of those lines were removed across 49 scripts. If you
    write your own scripts, you no longer need a `# Title` line at the top of a doc or config block; the
    header names the script. Existing user scripts are untouched and still render their title if they
    have one — it will simply be a 16px section heading rather than a 20px page title.
  - Genuine section titles were kept, including the ones that only *look* like a repeat: `@codefig-ui`'s
    "Built-in components", match-colors' "Palettes", and export/import's `# Export` / `# Import` pair.

- **Sizes and corners come from tokens now, so the same thing looks the same everywhere.** Seventeen
  font sizes and twenty-four corner radii were written as raw pixel values, which is how "the same
  corner" came to mean 2, 3, 4, 6, 9 or 10px depending on which control you were looking at. Every one
  is now one of four radii and one of five sizes. Two things visibly change: **11px text that was not
  code is now 10px** (status pills, dropdown group headers, stale-config notices), and **the `@rows` tab
  strip is 12px, matching the Documentation/Configuration/Script tabs it was always meant to match.**

- **Selection to variables picks its collection the same way every other script does.** The dropdown
  now lists this file's collections with a **New collection** entry that reveals a name field, instead
  of a *New collection* mode that took the collection name off the front of each layer name. **This
  changes what your layer names mean:** a layer called `color - bark/bark/350` used to make collection
  `color - bark` and variable `bark/350`, and now makes variable `color - bark/bark/350` in whichever
  collection you picked. Name layers by the variable path alone — `bark/350` — and choose the
  collection above. The old rule was also inconsistent with itself: picking an existing collection
  already treated the whole layer name as the path, so the same layers landed in two different places
  depending on a dropdown.

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
