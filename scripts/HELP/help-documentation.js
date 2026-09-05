// @Help & documentation
// @DOC_START
// # Runs JavaScript in Figma for Variables, Styles, and design-system scripts you can customise
//
// ## Overview
//
// CodeFig is a plugin that runs plain JavaScript inside Figma. Use it to rename and rebind Styles
// and Variables at scale, generate Design System Foundations token sets, or write a small tool with
// a settings form.
//
// Open CodeFig from the plugin menu. The sidebar is the catalogue:
//
// - **Utility Scripts:** ready-to-run tools for selection, styles, and variables
// - **Design System Foundations:** Colors, Grid, Typography, Spacing, Corner radius
// - **Libraries:** shared functions you import into your own scripts (names start with `@`)
// - **Your scripts:** scripts you create, import, or save
//
// Each script has up to three tabs. **Configuration UI** is the settings form. **Documentation**
// explains what the script does. **Source** is the code. Run with the Run button or Cmd/Ctrl+R.
// Results land in the InfoPanel when the script shows them; some scripts also write to the canvas.
//
// This Help entry is the onboarding page: how to use CodeFig, how to write a script, which libraries
// and shipped scripts exist. Open this script's **Configuration UI** for a live specimen of every
// form control authors can build.
//
// ## Getting started
//
// 1. Pick a Utility Script or a Foundations script in the sidebar.
// 2. Fill **Configuration UI**, or leave the defaults.
// 3. Run. Read the InfoPanel or the canvas for what changed.
// 4. Export a copy with Cmd/Ctrl+E when you want a file; edits to your own scripts auto-save.
//
// New script: Cmd/Ctrl+N. Import someone else's JSON: Cmd/Ctrl+I. Code must be plain JavaScript at
// run time (no TypeScript-only syntax).
//
// To learn a shipped tool, open it and read its **Documentation** tab first. To learn how panels are
// built, stay on this Help script: Documentation for authoring rules, Configuration UI for the
// specimen shelf, Source for the recipe beside the values.
//
// ## Keyboard shortcuts
//
// | Shortcut | Action |
// |----------|--------|
// | Cmd/Ctrl + R | Run current script |
// | Cmd/Ctrl + / | Toggle line comments (in editor) |
// | Cmd/Ctrl + N | Create new script |
// | Cmd/Ctrl + E | Export current script as JSON |
// | Cmd/Ctrl + I | Import script from JSON file |
//
// ## Writing a script
//
// A runnable script is plain JS plus optional regions in Source:
//
// - **Body:** what runs when you press Run (`figma`, `console`, `selection`, `currentPage`)
// - **Documentation block:** Markdown for the Documentation tab (`@DOC_START` … `@DOC_END`)
// - **Values block:** what the form edits (two shapes below)
// - **Panel recipe:** `var __codefigPanel = { blocks: […] }` between `@PANEL_START` and `@PANEL_END`
//
// Values and recipe stay in Source next to each other. There is no Configuration code tab.
// Configuration UI is the form people fill in. This Help script's Configuration UI is a live
// specimen of every control. Token sizes and the full recipe list live under **Style & UI
// reference** at the end of this document.
//
// ### Two shapes for values
//
// The form reads either shape the same way. Pick from how the **body** uses the settings:
//
// | Use when | Marker | Shape in Source |
// |---|---|---|
// | A few flat settings the body reads as separate variables | `@UI_CONFIG_START` … `@UI_CONFIG_END` | `var searchIn = "";` one line per field |
// | One nested object the body takes as a unit (modes, curves, pasteable config) | `@CONFIG_START` … `@CONFIG_END` | Properties inside that object, e.g. `colorsConfigData = { … }` |
//
// Utilities almost always use `@UI_CONFIG`. Design System Foundations use `@CONFIG`. Start with
// `@UI_CONFIG` unless you already have a single object to hand around.
//
// Minimal idea (regions named in prose so examples here cannot confuse the real markers):
//
// ```
// // Documentation block: functional # title, then Overview
//
// // Values: e.g. var dryRun = true;
//
// // Panel recipe: var __codefigPanel = { blocks: [
// //   { key: "dryRun", type: "boolean", label: "Dry run" }
// // ] };
//
// @import { displayResults } from "@InfoPanel"
//
// displayResults({ title: "Done", results: [], type: "success" });
// ```
//
// Open a Utility script in Source for `@UI_CONFIG` plus a panel recipe. Open Colors (or another
// Foundations script) for `@CONFIG` inside an object. The panel recipe language is the same in both.
//
// ## Three roles (do not mix them)
//
// | Role | What it is | Configuration UI |
// |---|---|---|
// | **Runnable script** | A script you Run. Values in a values block; form recipe in `@PANEL_START` as `var __codefigPanel = { blocks: […] }` (bare keys, same shape as this Help specimen). | The form authors edit in Source |
// | **Library** | `@`-prefixed script. Export top-level `function`s for `@import`. Not run on its own. | Usually none. Helpers, not a product panel |
// | **CodeFigUI builder** | `@codefig-ui`'s `section()` / `sendToUI()` API | A form built while the script runs, not a Source panel recipe |
//
// Shipped panels and custom scripts with a real settings form use the **runnable** path.
//
// ## Libraries
//
// Reuse functions across scripts with `@import`. Import only top-level `function` declarations. If A
// calls B in the same library, import both (or the call fails at run time). Examples inside a
// Documentation block are not executed. Outside a doc block, a commented-out `// @import` still
// imports.
//
// ```
// @import { getAllStyles, processWithOptimization } from "@Core Library"
// @import { getCollection, setVariableValue } from "@Variables"
// @import { displayResults } from "@InfoPanel"
// @import { myFunction } from "My Custom Script"
// ```
//
// **Your own library:** name the script with an `@` prefix (for example `@My Utils`). Other scripts
// can import from it; you do not Run a library on its own.
//
// Open a library in the sidebar and read its **Documentation** tab for the exported API. What each
// shipped library is for:
//
// | Library | What it does |
// |---|---|
// | `@Core Library` | Traverses nodes, replaces styles by pattern, yields for long runs, and converts hex colours |
// | `@Variables` | Gets and creates Figma variable collections, modes, and variables without deleting them |
// | `@Styles` | Finds, analyses, and replaces Figma styles, including rebinding variable references |
// | `@InfoPanel` | Displays script results in the plugin InfoPanel with grouping, filters, and selectable rows |
// | `@Pattern Matching` | Matches and renames names with wildcards, regex, and Figma-style replacement tokens |
// | `@Replacement Engine` | Plans and executes find-and-replace across node styles and variables |
// | `@Rename Preview` | Previews find/replace renames with collision flags before writing |
// | `@Math Helpers` | Interpolates, eases, and generates number scales including piecewise snapped ladders |
// | `@Bezier` | Evaluates and edits cubic bezier curves as flat number arrays for scale and colour ladders |
// | `@Scale Models` | Turns bezier, metric, fibonacci, and endpoints descriptions into number sequences |
// | `@Foundation` | Stores Design System Foundations manifests, viewport registry, stamps, and portable config |
// | `@Foundation overview` | Builds Design System Foundations overview frames for typography, grid, spacing, and corner radius |
// | `@Linear Ramp` | Generates spacing and corner-radius variable ramps from a shared ramp spec |
// | `@Type Scale` | Builds typography size, line-height, and tracking ladders per mode for preview and Overview |
// | `@Color Ramp` | Generates colour ramp values from config and draws preview strips without calling the Figma API |
// | `@OKLCH` | Converts and interpolates OKLCH and HSL colours, builds lightness ladders, and fits chroma to sRGB |
// | `@codefig-ui` | Builds run-time Configuration UI forms; prefer `@PANEL_START` for new shipped panels |
// | `@Test Harness` | Runs in-Figma specs against the real API (development; used with `npm run test:figma`) |
//
// ## Common patterns
//
// - **Selection:** `selection.forEach(function (node) { ... })`
// - **Notify:** `figma.notify('Done')` for a toast; `displayResults(...)` from `@InfoPanel` for a list
// - **Long runs:** `processWithOptimization` / `yieldToUI` / `showProgress` from `@Core Library`
// - **Finish cleanly:** call `displayResults` or `codefigRunComplete` so the run does not time out
// - **Never delete** a variable, collection, or style to regenerate it. Update in place (rename is
//   safe). Deleting breaks bindings in this file and in published libraries.
//
// ## Shipped scripts
//
// Browse the sidebar. Purpose of each shipped script (from its Documentation title). Open the
// script for full Documentation and settings.
//
// ### Utility Scripts
//
// | Script | What it does |
// |---|---|
// | Change case | Renames canvas layers, components, variants, styles, and variables to a chosen case style |
// | Comments to annotations | Converts file comments into Figma annotations and optional invisible anchor frames |
// | Frame or auto layout selected | Wraps the selection in a frame or auto layout, unwraps such frames, or removes auto layout |
// | Relink local component instances | Relinks instances to the canonical local component when several definitions share the same name |
// | Remove unnecessary nesting | Removes or merges redundant frames and auto layouts that do nothing for their children |
// | Scale or resize elements | Scales or resizes top-level selected layers by factor, target size, or aspect ratio |
//
// ### Styles
//
// | Script | What it does |
// |---|---|
// | Duplicate styles collection | Duplicates local styles under a source path into a target path, optionally rebinding variables |
// | Relink local styles | Relinks layers to the canonical local style when several definitions share the same name |
// | Rename styles | Renames local paint, text, effect, and grid styles by search and replace patterns |
// | Render styles overview | Renders local text, paint, and effect styles as a structured overview of auto-layout frames |
// | Replace styles | Rebinds layers from one style to another by rewriting style names with search and replace |
// | Text to styles | Creates or updates local text styles from selected text layers, keeping variable bindings |
//
// ### Variables
//
// | Script | What it does |
// |---|---|
// | Duplicate variable collection | Clones a local variable collection including modes, values, metadata, and Design System Foundations sets |
// | Export/import variables | Copies local variable collections between files as JSON (export to clipboard or import from paste) |
// | Match colors to collection variables | Binds raw paint colors in the selection to COLOR variables from chosen collections |
// | Copy or move variables | Copies or moves variable definitions from a source collection into a target collection |
// | Rename variables | Renames variables by search and replace across collections and groups |
// | Replace variables | Rebinds variable bindings on layers and in the variables table by collection, group, and name |
// | Selection to variables | Creates or updates variables from selected layers' names and values |
// | Variable inspector (WIP) | Reports variables with values, health, and usage on the selection and in styles |
//
// ### Styles & Variables
//
// | Script | What it does |
// |---|---|
// | Check style and variable bindings | Audits the selection for style and variable bindings that are not available in this file |
// | Detach styles & variables | Removes style and variable bindings from selected nodes so they keep local values |
// | Replace variables in local styles | Rebinds variables on local style definitions from a source collection to same-named variables in a target |
// | Select by styles or variables | Selects layers that use styles or variables matching a search pattern |
//
// ### Design System Foundations
//
// | Script | What it does |
// |---|---|
// | Colors | Creates a colour ramp per Variable Mode: separate Hue, Saturation and Lightness curves in HSL; shared Lightness with separate Chroma and Hue in OKLCH |
// | Grid | Creates a layout grid per Variable Mode with column, gap and margin variables and one Layout Guide style |
// | Typography | Creates a type scale per Variable Mode with precise control of the font-size, line-height and letter-spacing ladder |
// | Spacing | Creates a spacing scale per Variable Mode with bezier, metric or fibonacci ladders and width and gap bindings |
// | Corner radius | Creates a corner radius scale per Variable Mode with CORNER_RADIUS bindings and bezier, metric or fibonacci ladders |
//
// Files or folders whose names start with `_` are development-only and do not ship in the plugin.
//
// ## Style & UI reference
//
// For authors building a Configuration UI. Two places to look:
//
// - **Configuration UI:** this script's settings tab is the live specimen shelf. Each control's ⓘ
//   quotes the `@PANEL_START` recipe that produced it.
// - **Here:** the values behind them: tokens, the heading ladder, and what is deliberately not
//   covered.
//
// In the repo, `artifacts/style-reference.html` loads the same `src/ui.css` in a browser and prints
// every computed size next to the specimen. Font sizes cannot be measured inside Figma, so that page
// is where a number gets checked rather than eyeballed.
//
// ### One heading ladder
//
// The Documentation tab and a settings form share one size ladder, but the **tags differ**:
//
// | Surface | Source | Tag | Size | Notes |
// |---|---|---|---|---|
// | Documentation | `# Title` | `h1` | 20px, `--font-size-display` | document lead-in (functional description) |
// | Documentation | `##` / `###` | `h2` / `h3` | 16px title / 12px subheadline | sections and subsections |
// | Configuration UI | `{ type: "heading", level: 1 }` / `# Title` in config | `h2` | 16px, `--font-size-title` | a **section**. Carries the 48px section gap. The form never emits `h1`. |
// | Configuration UI | `level: 2`+ / nested `#` in `@rows` | `h3` | 12px, `--font-size-subheadline` | a title inside a section |
// | Both | `{ type: "paragraph", text: "…" }` | `p` | 12px, `--font-size-body` | |
//
// The size rule names both surfaces: `.docs-rendered h2, h2.config-ui-heading`. A form's headings are
// **not** inside `.docs-rendered` — the renderer builds `h2.config-ui-heading` for sections — so a rule
// naming one surface only is the shape of the bug this replaced. It is keyed on the **class** rather than
// on the `.config-ui-row--heading` wrapper because a heading nested in a `type: "rows"` block has no
// wrapper, and keyed on the wrapper it fell through and had to restate its own size.
//
// **The Configuration UI does not open with `h1`.** The document title in the editor header names the
// script, once, at 20px. Form section titles are `h2` so they do not wear that display size.
//
// Spacing is the one thing stated per surface, and not by choice: the Documentation tab is a block
// container, where a heading's top margin **collapses** with the paragraph above it, so the gap is
// written whole. A form is a flex column, where margins **add** to the row's own 12px, so it writes
// the gap 12px short. Same 48px on screen, two arithmetics. If you change `--section-gap`, both follow.
//
// Two ladders shipped for months before this — 20/15/14 here against 16/14/12 in the form — which meant
// every heading question had to be asked twice, and a rule written for the wrong surface validated,
// shipped and changed nothing on screen. `tests/ui-css-shared-classes.test.js` now fails if a heading
// size is set for one surface only.
//
// ### Type scale
//
// Five sizes. The document title is the only thing above 16px; everything below it is 16 to 12, two
// pixels a step.
//
// | Token | Value | Used for |
// |---|---|---|
// | `--font-size-display` | 20px | the document title in the editor header — always present, one per script |
// | `--font-size-title` | 16px | `h1`, a section on either surface. Also the InfoPanel header |
// | `--font-size-subheadline` | 14px | `h2` |
// | `--font-size-body` | 12px | `h3` (semibold), paragraphs, labels, inputs, tabs, table cells |
// | `--font-size-small` | 10px | tooltips, state notes, captions, buttons, tags, status text |
// | `--font-size-code` | 11px | **monospace only** |
//
// `--font-size-code` is deliberately not a step on the ladder: a mono face set at the body's 12px reads
// larger than the prose beside it, so code steps down a single pixel. It is the only reason 11px exists.
// It was in eight rules before this and was not a token, and half of those were not monospace at all —
// those went to `--font-size-small` or to body.
//
// `--font-size-caption` and `--font-size-helper` are gone: they both held 10px and differed only in
// which section of the sheet used them. One name, `--font-size-small`. `--font-size-headline` (15px) is
// gone too — it sat one pixel from `--font-size-title`, which reads as an accident rather than a
// decision, and its three users are now the 20px document title or the 16px section size.
//
// Weights: `--font-weight-normal` 400 (labels and body), `--font-weight-medium` 500,
// `--font-weight-semibold` 600 (headings, buttons), `--font-weight-bold` 700.
//
// ### Spacing scale
//
// | Token | Value |
// |---|---|
// | `--space-xs` | 4px |
// | `--space-sm` | 8px |
// | `--space-md` | 12px |
// | `--space-lg` | 16px |
// | `--space-xl` | 20px |
// | `--space-2xl` | 24px |
//
// Two spacings are decisions rather than steps on the scale, and both are single variables because
// two numbers that happen to match are not the same as one number:
//
// | Token | Value | What it is |
// |---|---|---|
// | `--panel-padding-x` | 24px | the panel's left and right edge. The first tab and the first label sit on the same line because they read the same variable. A full-bleed rule is one that simply does not have it. |
// | `--section-gap` | 48px | content bottom to the next section's title. Carried by a heading, or by a rule when there is one — never both. |
//
// ### Radii
//
// Four, and **every corner in the plugin is one of them**.
//
// | Token | Value | Used for |
// |---|---|---|
// | `--radius-sm` | 3px | small inline marks: badges, tags, swatches, code spans, the progress bar |
// | `--radius-md` | 6px | anything you can click or type in: inputs, buttons, chips, note boxes |
// | `--radius-lg` | 12px | a panel |
// | `--radius-full` | 9999px | pills, and a round knob |
//
// There were 24 hardcoded radii before this, spending 2, 3, 4, 6, 9, 10px and `50%` — so "the same
// corner" was five different corners depending on which rule you landed in. They are folded into the
// four above: 2 and 4 went to `sm`, the 4px on fields and note boxes to `md`, 10 to `lg`, and the 9px
// toggle track and its `50%` knob to `full` (both were describing *fully round* in absolute units,
// which stops being true the moment the control's height changes).
//
// ### Colours
//
// Light values shown; each has a dark-scheme counterpart, so judge pairs rather than hexes.
//
// | Token | Swatch | Value |
// |---|---|---|
// | `--bg-primary` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--bg-primary)"></span> | #fff |
// | `--bg-secondary` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--bg-secondary)"></span> | #fafafa |
// | `--bg-tertiary` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--bg-tertiary)"></span> | #efefef |
// | `--text-primary` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--text-primary)"></span> | #1d1d1f |
// | `--text-secondary` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--text-secondary)"></span> | #86868b |
// | `--text-muted` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--text-muted)"></span> | #666 |
// | `--text-link` / `--active-bg` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--text-link)"></span> | #0D99FF |
// | `--border-color` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--border-color)"></span> | #e9e9e9 |
// | `--border-light` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--border-light)"></span> | #e6e6e6 |
// | `--code-bg` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--code-bg)"></span> | #f5f5f5 |
//
// ### Buttons
//
// Live, from the plugin's own classes — 32px tall, `--radius-md`, 10px semibold. Clicking them does
// nothing; they carry no handler.
//
// <span style="display:inline-flex;gap:8px;align-items:center"><button class="btn primary">Run</button><button class="btn secondary">Import</button><button class="btn danger">Delete</button><button class="btn secondary" disabled>Disabled</button></span>
//
// `.btn` plus one of `.primary`, `.secondary`, `.danger`. Primary is the only filled one, and there
// is one per panel.
//
// ### Controls, and the PANEL block that makes each
//
// Two regions in Source. **Values** use `@UI_CONFIG_*` (`var` lines) or `@CONFIG_*` (object
// properties). Which one: see **Two shapes for values** under Writing a script. The **recipe**
// lives in `@PANEL_START`…`@PANEL_END` as `var __codefigPanel = { blocks: […] }` so Source
// syntax-highlights it. Configuration UI is the form; Source holds both regions. There is no
// Configuration code tab.
//
// Every control below is rendered live in this script's **Configuration UI** tab. Shipped scripts
// and anything with a real panel use `@PANEL_START`. Trailing annotations on `var` lines still work
// for scripts *without* `@PANEL_START` (legacy / tiny utilities). Prefer `@PANEL_START` for new
// panels.
//
// | PANEL (short example) | Control |
// |---|---|
// | `{ key: "x", type: "string" }` | text input |
// | `{ key: "x", type: "number" }` | number input, 96px |
// | `{ key: "x", type: "boolean" }` | checkbox |
// | `placeholder: "…"` on a field | grey hint inside an empty input |
// | `{ key: "x", type: "select", options: ["a","b"] }` | dropdown |
// | `{ key: "x", type: "radio", options: ["a","b"] }` | radio group |
// | `{ key: "x", type: "multiselect", options: ["a","b"] }` | checkbox list |
// | `options: "variableCollections"` | dropdown filled from this file's collections |
// | `{ key: "x", type: "textarea" }` | multi-line input |
// | `{ key: "x", type: "list" }` | one input holding a comma list; the config keeps the array |
// | `label: "Text"` | the label, instead of the prettified key |
// | `helper: "…"` | what the control's ⓘ says |
// | `showWhen: { field: "value" }` | the row appears only when that field holds one of those values |
// | `{ type: "paragraph", attachTo: "previous", text: "…" }` | a paragraph, folded into the ⓘ of the control it sits against |
// | `{ type: "directive", name: "prose" }` | this block's paragraphs are its content — leave them on the page |
// | `{ key: "x", type: "collection" }` | collection picker: this file's collections, plus **New collection** |
// | `{ key: "x", type: "mode", collection: "field" }` | mode picker: the modes of the collection that `field` holds, plus **New mode**. Changing that collection resets it |
// | `{ type: "chips", label: "…", from: "modes" }` | the mode chips — a marker row of its own, reading names from the `modes` field |
// | `{ key: "x", type: "rows", columns: […] }` | a table, one line per array entry |
// | `layout: "tabs"` on `type: "rows"` | the same array as one tab per entry, fields stacked and labelled |
// | `copyToOthers: true` on `type: "rows"` with `layout: "tabs"` | **Copy these values to:** on the open tab — a text link per other mode; click one to copy this entry's settings onto it (names stay). Hidden with one mode; confirms when that target already differs |
// | `layout: "blocks"` on `type: "rows"` | every entry in full, one under the next, each titled from its `name` |
// | `{ key: "x", type: "group", fields: […] }` | an **object** as one labelled row of captioned parts |
// | `{ key: "x", type: "curve" }` | the bezier curve editor, on an **array**. Four numbers is one segment, ten is two, `[]` is none |
// | `allowOriginal: true` on a curve | the same, with *Original* — the empty curve — offered in its preset list |
// | `ends: "a..b", range: [lo, hi]` on a curve | the same on a **value axis**: real numbers up the side, draggable ends that write `a` and `b`, and a zoom rail |
// | `{ type: "tab", names: [{ text: "Hue" }], columns: […] }` inside `rows` | a **channel tab**: a section of a row you can only see one of. Closed tabs are hidden, never dropped |
// | `names: [{ text: "Saturation", showWhen: { colorModel: "hsl" } }, …]` | a tab may carry the same `showWhen` a column does. A tab with nothing visible left in it is **not drawn** |
// | two names on one `type: "tab"` | one tab under two names, captioned by the first whose condition holds. The panel keeps the first name as its key |
// | `ramp: "hsl($ ~a.sat% 50%)"` on a curve | the bar beside a charted curve: the **whole channel** in its own colours. `$` is the axis value, `~key` a sibling field |
// | `{ key: "c", type: "curve" }` inside `columns` | the same editor as one column of a row. `allowOriginal: true` to offer *Original* |
// | `{ key: "c", type: "curve", growth: "ratio" }` | the **open-ended** editor: log axis, a handle for the growth, written to the config as `ratio` |
// | `{ key: "g", type: "group", fields: […] }` inside `columns` | the same group, nested as one column of a row |
// | `{ type: "heading", text: "…" }` inside `columns` | a heading between an entry's rows, one level below the block title |
// | `options: ["a","b"]` or `[{ "1.25": "1.25 Major third" }]` in a column | a dropdown in that cell. All-numeric options read back as numbers; a bare option is its own label |
// | `unit: "%"` on a number | a unit printed inside the input at its right edge. Unlike a placeholder it stays when there is a value |
// | `type: "radio"` in a column | radio buttons in that cell instead of a dropdown |
// | `showWhen: { other: "value" }` on a column | that column appears only while another column **in the same row** (or a form field of that name) holds one of those values. A cell nobody can see writes nothing |
// | `placeholder: "…"` on a column | a grey example inside that cell |
// | `name-{1,10}` in a **values** token list | a series: `name-1 … name-10`. `{10}` is short for it, `{6,1}` counts down, and `{01,10}` pads to the width you wrote — this is config text, not a PANEL type |
// | a keyed object/array with no `type: "rows"` or `type: "group"` | the form says it cannot hold it and points at Source |
//
// Marker / structure blocks in `@PANEL_START` (not fields):
//
// | PANEL | Renders as |
// |---|---|
// | `{ type: "section", id?: "…", showWhen?: {…}, blocks: […] }` | a `<section class="config-ui-section">` wrapping its blocks. One readiness gate for the whole chunk. `id` becomes `config-ui-section--{id}` and `data-section` |
// | `{ type: "heading", level: 1, text: "Title" }` | section heading |
// | `level: 2` / `level: 3` | sub-headings |
// | `{ type: "paragraph", text: "…" }` | a paragraph — **bold**, *italic* and `code` all work |
// | `{ type: "divider" }` at the panel root | a rule to both panel edges (between sections) |
// | `{ type: "divider" }` inside a section | a short rule |
// | `{ type: "divider", section: true }` | legacy force of the edge-to-edge rule (prefer a root-level divider) |
// | `{ type: "spacer-s" }` / `spacer-m` / `spacer-l` | vertical gap (8 / 12 / 24px). Not a field row |
// | `{ type: "preview" }` | where the domain's live preview goes |
// | `{ type: "suggestions" }` | where its suggestions list goes |
// | `{ type: "directive", name: "fromFile", … }` / values `@fromFile: domains.x` | which slice of a file's config this block holds; renders as nothing |
//
// Scripts without `@PANEL_START` still use comment markers (`// # Title`, `// ---`, bare `//` for a
// gap). Prefer PANEL when you are writing a panel.
//
// ### Not in here, on purpose
//
// - **`type: "preview"` and `type: "suggestions"`** render whatever the script's own `@PREVIEW:` /
//   `@SUGGESTIONS:` function returns, so they are that panel's markup rather than a style primitive.
//   Grid is the live example; critique them there, where the numbers are real.
// - **`blank` / `lineBreak`** — spacer comment lines in the old one-line annotation format. Prefer
//   `{ type: "spacer-s" }` / `spacer-m` / `spacer-l` in a `@PANEL_START` recipe. Paragraph fold
//   direction is `attachTo: "next"` or `"previous"`. Bare `//` gaps still work on non-migrated
//   scripts; they are not something the specimen shelf can show once the panel is an object.
// - **InfoPanel and CodeFigUI** (`@InfoPanel`, `@codefig-ui`) style a script's *results*, which is a
//   different surface with its own classes. Worth its own reference — ask and it gets one.
// - **Sidebar, tab strip and footer** are panel chrome rather than anything a script can produce.
//
// ### Keeping this honest
//
// `tests/style-reference.test.js` fails when a control exists that this reference does not show, when
// a token's value here disagrees with `src/ui.css`, and when the HTML page drifts from the classes the
// renderer emits. A reference nobody can trust is worse than none, because it gets quoted.
// @DOC_END

// The live specimen shelf: one of every control, each ⓘ quoting the PANEL JSON that produced it.
// This block is a reference rather than a setting — the script reads none of these values, and
// running it does nothing to your document.
// @UI_CONFIG_START
var textField = "Sample";
var withPlaceholder = "";
var numberField = 12;
var longText = "";
var nameList = ["sm", "md", "lg"];
var toggle = true;
var dropdown = "medium";
var radioChoice = "replace";
var multiChoice = ["small"];
var documentList = "";
var dependent = "";
var collectionName = "Responsive System";
var collectionMode = "Desktop";
var modes = [
  { name: "Desktop", width: 1440, columns: 12 },
  { name: "Tablet", width: 834, columns: 8 },
  { name: "Mobile", width: 390, columns: 4 },
];
var lightness = { bright: 98.5, middle: 62, dark: 18 };
var lineHeight = { base: 150, max: 110 };
var scales = [
  { name: "Desktop", scaleType: "bezier", ratio: 1.25, step: 4, mod: 3 },
  { name: "Mobile", scaleType: "metric", ratio: 1.2, step: 2, mod: 3 },
];
var breakpoints = [
  { label: "sm", min: 640 },
  { label: "md", min: 834 },
];
var easing = [0.37, 0, 0.63, 1];
var twoSegment = [0.17, 0, 0.33, 0.23, 0.5, 0.5, 0.67, 0.77, 0.83, 1];
var maybeCurve = [];
var ladder = { bright: 98, dark: 19 };
var ladderCurve = [0.4, 0, 0.7, 0.55];
var openScale = [
  { name: "Value", ratio: 1.5, curve: [] },
];
var nested = { outer: { inner: 1 } };
// @UI_CONFIG_END

// @PANEL_START
var __codefigPanel = {
  blocks: [
    { type: "directive", name: "prose" },
    { type: "section", id: "specimen-intro", blocks: [
      { type: "heading", level: 1, text: "Configuration UI specimen" },
      { type: "paragraph", attachTo: "previous",
        text: "This tab shows every control a CodeFig Configuration UI can render. It is a specimen shelf, not a\nsettings form for a run. Running Help does nothing to your document." },
      { type: "paragraph", attachTo: "previous",
        text: "Build your own panels with a values block plus a `@PANEL_START` recipe in Source. Utilities use\n`@UI_CONFIG` (`var` lines); Foundations use `@CONFIG` inside an object. See **Two shapes for values**\nin this script's Documentation. Token sizes and the full recipe table are under **Style & UI\nreference**. Each ⓘ below quotes the recipe that made that control. Shipped Foundations panels wrap\nchunks in `{ type: \"section\", blocks: […] }` so readiness `showWhen` applies once." }
    ]},
    { type: "divider" },
    { type: "section", id: "markers", blocks: [
      { type: "heading", level: 1, text: "Heading level 1" },
      { type: "paragraph", attachTo: "previous",
        text: "The level every panel uses for its section titles: `{ type: \"heading\", level: 1, text: \"…\" }`. The Configuration UI renders it as `h2` (never `h1`), and it\ncarries the 48px gap that separates one section from the next." },
      { type: "heading", level: 2, text: "Heading level 2" },
      { type: "paragraph", attachTo: "previous",
        text: "`level: 2`. A title *inside* a section. On the form this renders as `h3`." },
      { type: "heading", level: 3, text: "Heading level 3" },
      { type: "paragraph", attachTo: "previous",
        text: "`level: 3`: also `h3` on the form — body size, told apart from a paragraph by its weight alone." },
      { type: "paragraph", attachTo: "previous",
        text: "This is a paragraph — `{ type: \"paragraph\", text: \"…\" }`. **Bold**, *italic* and `code` work." },
      { type: "divider" },
      { type: "paragraph", attachTo: "previous",
        text: "Above: a short rule, from `{ type: \"divider\" }` inside a section." },
      { type: "spacer-s" },
      { type: "paragraph", attachTo: "previous",
        text: "`{ type: \"spacer-s\" }` (8px). Also `spacer-m` (12px) and `spacer-l` (24px)." },
      { type: "spacer-m" },
      { type: "spacer-l" }
    ]},
    { type: "divider" },
    { type: "paragraph", attachTo: "previous",
      text: "Above: a rule to both panel edges — `{ type: \"divider\" }` between top-level sections (same look as the old `section: true`)." },
    { type: "heading", level: 1, text: "Text and numbers" },
    { key: "textField", type: "string", label: "Text", helper: "{ key: \"textField\", type: \"string\" }" },
    { key: "withPlaceholder", type: "string", label: "Text with a placeholder", helper: "placeholder: \"Shown while empty\"", placeholder: "Shown while empty" },
    { key: "numberField", type: "number", label: "Number", helper: "{ key: \"numberField\", type: \"number\" }" },
    { key: "longText", type: "textarea", label: "Textarea", helper: "{ key: \"longText\", type: \"textarea\" }", placeholder: "One per line" },
    { key: "nameList", type: "list", label: "List of names", helper: "{ key: \"nameList\", type: \"list\" }" },
    { type: "heading", level: 1, text: "Choices" },
    { key: "toggle", type: "boolean", label: "Checkbox", helper: "{ key: \"toggle\", type: \"boolean\" }" },
    { key: "dropdown", type: "select", label: "Dropdown", helper: "{ key: \"dropdown\", type: \"select\", options: […] }", options: ["small","medium","large"] },
    { key: "radioChoice", type: "radio", label: "Radio group", helper: "{ key: \"radioChoice\", type: \"radio\", options: […] }", options: ["replace","append"] },
    { key: "multiChoice", type: "multiselect", label: "Multi-select", helper: "{ key: \"multiChoice\", type: \"multiselect\", options: […] }", options: ["small","medium","large"] },
    { key: "documentList", type: "select", label: "From the document", helper: "options: \"variableCollections\"", options: "variableCollections" },
    { key: "dependent", type: "string", label: "Only while Checkbox is on", helper: "showWhen: { toggle: true }", showWhen: { toggle: true } },
    { type: "heading", level: 1, text: "Collections and modes" },
    { key: "collectionName", type: "collection", label: "Collection", helper: "{ key: \"collectionName\", type: \"collection\" }" },
    { type: "spacer-m" },
    { key: "collectionMode", type: "mode", label: "Mode", helper: "{ key: \"collectionMode\", type: \"mode\", collection: \"collectionName\" }", collection: "collectionName" },
    { type: "chips", label: "Collection modes", from: "modes" },
    { type: "paragraph", attachTo: "next",
      text: "The chips read their names from the modes field below, so the two cannot disagree. Click a chip to\nrename it, drag to reorder, and the dash removes one. Nothing reaches the document until Run." },
    { key: "modes", type: "rows", label: "Modes", layout: "tabs", columns: [
        { key: "name", type: "text", label: "Mode" },
        { key: "width", type: "number", label: "Width" },
        { key: "columns", type: "number", label: "Columns" },
      ] },
    { type: "heading", level: 1, text: "One thing set by several numbers" },
    { type: "paragraph", attachTo: "next",
      text: "`type: \"group\"` on an **object** — one labelled row, each part captioned at a number's own width. Use it when\nthe parts are one idea rather than a list: a lightness ladder is a bright, a middle and a dark, and three\nseparate fields make you assemble that in your head. `type: \"rows\"` cannot serve this, because that one needs an\narray — it is a *repeatable* group." },
    { type: "paragraph", attachTo: "next",
      text: "The same control appears nested inside `type: \"rows\"`, written the same way, so an anchor in a mode block and a\nshared ladder above it are the same shape rather than two lookalikes." },
    { key: "lightness", type: "group", label: "Lightness", helper: "{ key: \"lightness\", type: \"group\", fields: […] }", fields: [
        { key: "bright", type: "number", label: "Bright" },
        { key: "middle", type: "number", label: "Middle" },
        { key: "dark", type: "number", label: "Dark" },
      ] },
    { type: "paragraph", attachTo: "previous",
      text: "`unit: \"%\"` prints a unit inside the input, at its right edge. It is **not** a placeholder — a\nplaceholder disappears the moment you type, and the whole point of a unit is that a reader coming back\nto `-1.5` can tell whether that is pixels or percent." },
    { key: "lineHeight", type: "group", label: "Line height", fields: [
        { key: "base", type: "number", label: "Base", unit: "%" },
        { key: "max", type: "number", label: "Largest", unit: "%" },
      ] },
    { type: "heading", level: 1, text: "A column that depends on its row" },
    { type: "paragraph", attachTo: "next",
      text: "Radio buttons, options that carry their names, and cells that appear only when they apply. Switch the\nscale type and watch the fields change — each tab is judged on its own values, so two modes can be\nusing different scale types at once." },
    { key: "scales", type: "rows", label: "Scale per mode", layout: "tabs", columns: [
        { key: "name", type: "text", label: "Mode" },
        { key: "scaleType", type: "radio", label: "Scale type", options: [{"bezier":"Bezier scale"},{"metric":"Metric scale"},{"fibonacci":"Fibonacci"}] },
        { key: "ratio", type: "select", label: "Scaling method", options: [{"1.2":"1.2 Minor third"},{"1.25":"1.25 Major third"},{"1.618":"1.618 Golden ratio"}], showWhen: { scaleType: "bezier" } },
        { key: "step", type: "number", label: "Step", showWhen: { scaleType: ["metric","fibonacci"] } },
        { key: "mod", type: "number", label: "Every N steps", showWhen: { scaleType: "metric" } },
      ] },
    { type: "heading", level: 1, text: "Table rows" },
    { type: "paragraph", attachTo: "next",
      text: "The same `type: \"rows\"` without `layout: \"tabs\"`: one line per entry, with Add and Remove." },
    { key: "breakpoints", type: "rows", label: "Breakpoints", columns: [
        { key: "label", type: "text", label: "Name" },
        { key: "min", type: "number", label: "Min width" },
      ] },
    { type: "heading", level: 1, text: "A curve you can drag" },
    { type: "paragraph", attachTo: "next",
      text: "`type: \"curve\"` on an **array** of four numbers — the two handles of one cubic, exactly what `cubic-bezier()`\ncarries. Drag a handle, arrow-key it a percent at a time, pick a preset, or paste coordinates into the\nfield underneath. All four are the same edit: the numbers are the value and everything on screen is a\nreading of them, which is why the dropdown says *Custom* the moment a curve stops being a preset." },
    { key: "easing", type: "curve", label: "Curve", helper: "{ key: \"easing\", type: \"curve\" }" },
    { type: "paragraph", attachTo: "previous",
      text: "**Add middle point** makes it a three-point curve: ten numbers, a middle anchor you can drag in both\ndirections, and a handle either side of it. The split is exact, so adding the point does not move the\ncurve. It is also what `easeInOut` has always been — the in-curve over the first half and the out-curve\nover the second is a middle anchor at the centre, written as an `if`." },
    { key: "twoSegment", type: "curve", label: "Two-segment curve" },
    { type: "paragraph", attachTo: "previous",
      text: "`allowOriginal: true` adds *Original* to the preset list — the empty curve, for a script that has something\nto fall back on. Colors uses it to mean \"leave the steps this file already has\"." },
    { key: "maybeCurve", type: "curve", label: "Curve or original", helper: "{ key: \"maybeCurve\", type: \"curve\", allowOriginal: true }", allowOriginal: true },
    { type: "heading", level: 1, text: "A curve on a real axis" },
    { type: "paragraph", attachTo: "next",
      text: "`ends: \"a..b\"` names the two fields the curve runs **between**, and `range: [lo, hi]` the limits of the quantity\nitself. Together they turn the y axis from a unit square into the thing being edited: the labels are\npercentages of lightness, the dashed line joins the two ends rather than the corners of the box, and the\ntwo **square** handles are those ends — drag one and it types into its own field, because that is where\nthe value lives. The round handles still only bend the shape between them." },
    { type: "paragraph", attachTo: "next",
      text: "The plot shows a **window** on the channel — the two ends with a little air — and two columns sit beside\nit. The **triangle** is the zoom: drag it up to close in, down to pull back, or step it with the buttons\nabove and below. The bar to its right is the channel's own colours across that window, and it is a\npicture: it takes no input at all. Neither column moves when you drag the curve, because where you are\nlooking is not a property of the ramp — and to follow a ramp that runs off the top or bottom, drag the\nempty chart vertically." },
    { type: "paragraph", attachTo: "next",
      text: "The ramp is clipped to the plot; the grips are clipped to the plot **plus their own radius**, so one on\nthe boundary sits *on* the frame rather than being sliced in half by it. A drag stops at the edge of the\nwindow rather than pushing the curve out of sight." },
    { key: "ladder", type: "group", label: "Ends", fields: [
        { key: "bright", type: "number", label: "Bright" },
        { key: "dark", type: "number", label: "Dark" },
      ] },
    { key: "ladderCurve", type: "curve", label: "Lightness", helper: "{ key: \"ladderCurve\", type: \"curve\", ends: \"ladder.bright..ladder.dark\", range: [0,100] }", ends: "ladder.bright..ladder.dark", range: [0,100] },
    { type: "heading", level: 1, text: "A scale with no far end" },
    { type: "paragraph", attachTo: "next",
      text: "`growth: \"ratio\"` on a curve inside `type: \"rows\"` — the **open-ended** editor, for a scale whose largest value nobody\nknows in advance. The y axis is logarithmic, so a constant ratio is a straight line and its slope is the\ngrowth: one handle drags it, continuously, into the sibling cell named after the colon. Past the last\ntoken the line carries on faintly, because it does — adding a token extends the scale rather than\nsqueezing what is already generated into the same range." },
    { type: "paragraph", attachTo: "next",
      text: "**The dropdown is the shape control.** *Linear* means no shape and draws no handles; anything else\nreveals them, for when the growth should vary across the scale — tighter at the small end, looser at the\ntop. The field underneath carries the whole scale, growth and shape together, so copying it out and\npasting it back reproduces it." },
    { type: "paragraph", attachTo: "next",
      text: "The growth has **no field of its own**: one idea, one control. It is still written to the config under\nthe name after the colon, so the block reads `ratio: 1.5` beside `curve: []`." },
    { key: "openScale", type: "rows", label: "Open-ended scale", layout: "tabs", columns: [
        { key: "name", type: "text", label: "Mode" },
        { key: "curve", type: "curve", label: "Scale", growth: "ratio" },
      ] },
    { type: "heading", level: 1, text: "What the form cannot hold" },
    { type: "paragraph", attachTo: "next",
      text: "An arbitrary nested object is not a control. The form cannot edit it. Source keeps the value; the\npanel shows a note that it is only editable in Source. Use `type: \"rows\"` for a list of entries, or\n`type: \"group\"` for one object made of labelled parts." },
    { key: "nested", type: "unsupported", label: "Nested object",
      helper: "Shown when a value is an object with no type: \"rows\" or type: \"group\". Edit it in Source." },
  ]
};
// @PANEL_END

