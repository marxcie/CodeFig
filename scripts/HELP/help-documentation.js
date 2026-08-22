// @Help & documentation
// @DOC_START
// Your JavaScript Figma scripting environment (scripts are plain JS files).
//
// ## Documentation tab
//
// Scripts can define a doc block between **// @DOC_START** and **// @DOC_END**. That block is rendered as **Markdown** in the Documentation tab.
//
// **Markdown supported:** headings (`#`, `##`, `###`), **bold**, *italic*, `code`, lists (`- item`), and more.
//
// **Spacing:** A single newline between comment lines = line break. A **blank line** or empty comment line (`//`) = new paragraph / extra vertical space.
//
// ## Script tab
//
// Main code editor: write **JavaScript** (must be valid JS at run time — no TypeScript-only syntax). Run with Cmd/Ctrl+R, auto-save as you type. Use the sidebar to open Utility Scripts or your saved scripts.
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
// ## Utility Scripts
//
// Browse **Utility Scripts** in the sidebar for ready-to-use scripts. They cover:
//
// - **Variables:** duplicate-variable-collection, replace-variables, rename-variables, variable-inspector
// - **Styles:** duplicate-styles, replace-styles, replace-style-variable-bindings, rename-styles, text-to-styles, render-styles-overview
// - **Layout:** frame-or-auto-layout-selected, scale-selection (see script titles: *Scale or resize elements*), remove-unnecessary-nesting
// - **Selection / detach:** select-by-styles-variables, detach styles & variables
// - **Design System Foundations:** grid, typography, spacing, corner-radius
// - **API:** comments-to-annotations (Figma REST API + personal access token)
//
// Files or folders whose names start with **`_`** are omitted from the plugin build (development-only).
//
// Scripts with a **Config** tab expose options (e.g. dropdowns, text inputs) defined via **// @UI_CONFIG_START** … **// @UI_CONFIG_END** in the script. See any utility script with a Config tab for the pattern.
//
// **Every control, live:** open this script's **Configuration UI** tab. It renders one of each, with the exact line that produces it written underneath — copy from there rather than from memory. The sizes, spacing and colours behind them are in **Style & UI reference** below.
//
// ## @import system
//
// Reuse code across scripts:
//
// ```
// @import { getAllStyles, generateScale } from "@Core Library"
// @import { getCollection, setVariableValue } from "@Variables"
// @import { displayResults } from "@InfoPanel"
// @import { myFunction } from "My Custom Script"
// ```
//
// **Libraries:** @Core Library, @Math Helpers, @Variables, @InfoPanel, @Pattern Matching, @Replacement Engine, @Styles, @codefig-ui
//
// **User libraries:** Name a script with an `@` prefix (e.g. `@My Utils`) to make it a library. Other scripts can `@import` from it; libraries are not run directly.
//
// **In your own docs:** the examples above are inside this script's doc block, so they are *not* executed. Outside a doc block, `@import` is matched as text — a commented-out `// @import` still imports.
//
// ## Common patterns
//
// - **Get data:** `figma.variables.getLocalVariableCollections()`, `figma.getLocalTextStyles()`
// - **User feedback:** `figma.notify('message')`, `console.log(...)`
// - **Selection:** `selection.forEach(node => { ... })`
//
// ## Style & UI reference
//
// Every text style and control the plugin can render. Two places to look:
//
// - **Configuration UI** — this script's own settings tab is the live specimen shelf. Each control
//   names the exact syntax under it, so a change can be asked for by pointing at the thing rather
//   than describing it.
// - **Here** — the values behind them: tokens, the heading ladder, and what is deliberately not
//   covered.
//
// There is also `artifacts/style-reference.html` in the repo, which loads the same `src/ui.css` in a
// browser and **prints every computed size next to the specimen**. Font sizes cannot be measured
// inside Figma, so that page is where a number gets checked rather than eyeballed.
//
// ### One heading ladder
//
// The Documentation tab and a settings form render the same markdown through the same parser, so a
// heading is **the same size in both**. There is one rule per level and one place to change it.
//
// | Source | Tag | Size | Notes |
// |---|---|---|---|
// | `// # Title` | `h1` | 16px, `--font-size-title` | a **section**. Carries the 48px section gap |
// | `// ## Title` | `h2` | 14px, `--font-size-subheadline` | a title inside a section. Half the gap |
// | `// ### Title` | `h3` | 12px, `--font-size-body` | semibold; weight is what separates it from body copy |
// | any other comment line | `p` | 12px, `--font-size-body` | |
//
// The rule names both surfaces: `.docs-rendered h1, h1.config-ui-heading`. A form's headings are **not**
// inside `.docs-rendered` — the renderer builds `h1.config-ui-heading` directly — so a rule naming one
// surface only is the shape of the bug this replaced. It is keyed on the **class** rather than on the
// `.config-ui-row--heading` wrapper because a heading nested in an `@rows` block has no wrapper, and
// keyed on the wrapper it fell through and had to restate its own size.
//
// **There is no `h1` at the top of a script's documentation, and none at the top of its config block.**
// The document title in the editor header names the script, once, at 20px. Every block that used to
// open by restating its own name had that line removed — most carried a *third* wording of it, so a
// script could be called three things on one screen.
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
// | `--bg-tertiary` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--bg-tertiary)"></span> | #f5f5f7 |
// | `--text-primary` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--text-primary)"></span> | #1d1d1f |
// | `--text-secondary` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--text-secondary)"></span> | #86868b |
// | `--text-muted` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--text-muted)"></span> | #666 |
// | `--text-link` / `--active-bg` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--text-link)"></span> | #0D99FF |
// | `--border-color` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--border-color)"></span> | #e1e5e9 |
// | `--border-light` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--border-light)"></span> | #e6e6e6 |
// | `--code-bg` | <span style="display:inline-block;width:32px;height:14px;border:1px solid #0003;vertical-align:-2px;background:var(--code-bg)"></span> | #f5f5f7 |
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
// ### Controls, and the line that makes each
//
// Every one of these is rendered live in this script's **Configuration UI** tab. The annotation goes
// in the trailing comment on a field's line.
//
// | Syntax | Control |
// |---|---|
// | `var x = "text";` | text input |
// | `var x = 12;` | number input, 96px |
// | `var x = true;` | checkbox |
// | `@placeholder="…"` | grey hint inside an empty input |
// | `@options: a\|b\|c` | dropdown |
// | `@options: a\|b\|c` + `@radio` | radio group |
// | `@options: a\|b\|c` + `@multi` | checkbox list |
// | `@options: variableCollections` | dropdown filled from this file's collections |
// | `@textarea` | multi-line input |
// | an array of names or numbers | one input holding a comma list; the config keeps the array |
// | `@label: Text` | the label, instead of the prettified variable name |
// | `@helper: Text` | what the control's ⓘ says. **Last on the line:** a note runs to the end of it, so it can mention an `@annotation` without being cut in half |
// | `@showWhen: field=value` | the row appears only when that field holds one of those values |
// | a comment line by itself | a paragraph, folded into the ⓘ of the control it sits against |
// | `@prose` | on its own line: this block's paragraphs are its content — leave them on the page |
// | `@collection` | collection picker: this file's collections, plus **New collection** |
// | `@mode: field` | mode picker: the modes of the collection that `field` holds, plus **New mode**. Written bare it follows the block's only `@collection`. Changing that collection resets it — the modes on offer are the new collection's |
// | `@collectionModes: Title` | the mode chips — a marker row of its own, reading names from the `modes` field |
// | `@rows: key:type=Label\|…` | a table, one line per array entry |
// | `@rows: …` + `@tabs` | the same array as one tab per entry, fields stacked and labelled |
// | `@rows: …` + `@blocks` | every entry in full, one under the next, each titled from its `name` |
// | `@group: key:type=Label\|…` | an **object** as one labelled row of captioned parts |
// | `@curve` | the bezier curve editor, on an **array**. Four numbers is one segment, ten is two, `[]` is none |
// | `@curve @allowOriginal` | the same, with *Original* — the empty curve — offered in its preset list |
// | `@curve @ends: a..b @range: lo..hi` | the same on a **value axis**: real numbers up the side, draggable ends that write `a` and `b`, and a zoom rail |
// | `#>Hue` inside `@rows` | a **channel tab**: a section of a row you can only see one of. Closed tabs are hidden, never dropped |
// | `@invert` on a charted curve | the axis counts **down** from the top of its range — lightness drawn as darkness. Display only; the field still holds what it held |
// | `key:curve=Label` inside `@rows` | the same editor as one column of a row. `key:curve(original)` to offer *Original* |
// | `key:curve(growth:other)` | the **open-ended** editor: log axis, a handle for the growth, written to the config as `other` |
// | `key:{…}=Label` inside `@rows` | the same group, nested as one column of a row |
// | `#Heading` inside `@rows` | a heading between an entry's rows, one level below the block title |
// | `key:(a\|b)` in a column | a dropdown in that cell. All-numeric options read back as numbers |
// | `key:number@unit="%"` | a unit printed inside the input at its right edge. Unlike a placeholder it stays when there is a value |
// | `key:(1.25:1.25 Major third)` | the same, with the words for the value. A bare option is its own label |
// | `key:radio(a:First\|b:Second)` | radio buttons in that cell instead of a dropdown |
// | `key:type{other=value}` in a column | that column appears only while another column **in the same row** holds one of those values, or — when no column is named that — the form field of that name. A cell nobody can see writes nothing |
// | `key:type@placeholder="…"` in a column | a grey example inside that cell, the same annotation a field spells |
// | `name-{1,10}` in a token list | a series: `name-1 … name-10`. `{10}` is short for it, `{6,1}` counts down, and `{01,10}` pads to the width you wrote |
// | an object or array with no `@rows` | the form says it cannot hold it and points at Configuration code |
//
// Marker rows, on their own line:
//
// | Syntax | Renders as |
// |---|---|
// | `// # Title` | section heading |
// | `// ## Title`, `// ### Title` | sub-headings |
// | `// text` | a paragraph — **bold**, *italic* and `code` all work |
// | `// ---` | a short rule |
// | `// --- @section` | a rule to both panel edges |
// | `//` | a blank line's worth of space |
// | `// @preview` | where the domain's live preview goes |
// | `// @suggestions` | where its suggestions list goes |
// | `// @fromFile: domains.x` | which slice of a file's config this block holds; renders as nothing |
//
// ### Not in here, on purpose
//
// - **`@preview` and `@suggestions`** render whatever the script's own `@PREVIEW:` / `@SUGGESTIONS:`
//   function returns, so they are that panel's markup rather than a style primitive. Grid is the live
//   example; critique them there, where the numbers are real.
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

// The live specimen shelf: one of every control, each naming the syntax that produced it. This block
// is a reference rather than a setting — the script reads none of these values, and running it does
// nothing to your document.
// @UI_CONFIG_START
// @prose
// # Heading level 1
// The level every panel uses for its section titles: `// # Heading level 1`. Renders as `h1`, and it
// carries the 48px gap that separates one section from the next.
//
// ## Heading level 2
// Two hashes. A title *inside* a section, at 14px with half the gap above it.
//
// ### Heading level 3
// Three hashes: body size, told apart from a paragraph by its weight alone.
//
// This is a paragraph — any comment line that is not a marker. **Bold**, *italic* and `code` work.
// ---
// Above: a short rule, from `// ---`.
// --- @section
// Above: a rule reaching both panel edges, from `// --- @section`.
//
// # Text and numbers
var textField = "Sample"; // @label: Text @helper: var textField = "Sample";
var withPlaceholder = ""; // @placeholder="Shown while empty" @label: Text with a placeholder @helper: @placeholder="Shown while empty"
var numberField = 12; // @label: Number @helper: a numeric default makes it a number input, 96px wide
var longText = ""; // @textarea @placeholder="One per line" @label: Textarea @helper: @textarea
var nameList = ["sm", "md", "lg"]; // @label: List of names @helper: an array of strings or numbers — one input holding a comma list, and the config keeps the array
//
// # Choices
var toggle = true; // @label: Checkbox @helper: a true or false default
var dropdown = "medium"; // @options: small|medium|large @label: Dropdown @helper: @options: small|medium|large
var radioChoice = "replace"; // @options: replace|append @radio @label: Radio group @helper: the same @options, plus @radio
var multiChoice = ["small"]; // @options: small|medium|large @multi @label: Multi-select @helper: the same @options, plus @multi
var documentList = ""; // @options: variableCollections @label: From the document @helper: @options: variableCollections — filled with this file's collections
var dependent = ""; // @showWhen: toggle=true @label: Only while Checkbox is on @helper: @showWhen: toggle=true
//
// # Collections and modes
var collectionName = "Responsive System"; // @collection @label: Collection @helper: @collection — this file's collections, plus New collection
var collectionMode = "Desktop"; // @mode: collectionName @label: Mode @helper: @mode: collectionName — the modes of the collection above, plus New mode
// @collectionModes: Collection modes
// The chips read their names from the modes field below, so the two cannot disagree. Click a chip to
// rename it, drag to reorder, and the dash removes one. Nothing reaches the document until Run.
var modes = [
  { name: "Desktop", width: 1440, columns: 12 },
  { name: "Tablet", width: 834, columns: 8 },
  { name: "Mobile", width: 390, columns: 4 },
]; // @rows: name:text=Mode|width:number=Width|columns:number=Columns @tabs @label: Modes
//
// # One thing set by several numbers
// `@group:` on an **object** — one labelled row, each part captioned at a number's own width. Use it when
// the parts are one idea rather than a list: a lightness ladder is a bright, a middle and a dark, and three
// separate fields make you assemble that in your head. `@rows` cannot serve this, because that one needs an
// array — it is a *repeatable* group.
//
// The same control appears nested inside `@rows`, written the same way, so an anchor in a mode block and a
// shared ladder above it are the same shape rather than two lookalikes.
var lightness = { bright: 98.5, middle: 62, dark: 18 }; // @group: bright:number=Bright|middle:number=Middle|dark:number=Dark @label: Lightness @helper: 0 to 100 in the UI, 0 to 1 in the data
//
// `@unit="%"` prints a unit inside the input, at its right edge. It is **not** a placeholder — a
// placeholder disappears the moment you type, and the whole point of a unit is that a reader coming back
// to `-1.5` can tell whether that is pixels or percent.
var lineHeight = { base: 150, max: 110 }; // @group: base:number@unit="%"=Base|max:number@unit="%"=Largest @label: Line height
//
// # A column that depends on its row
// Radio buttons, options that carry their names, and cells that appear only when they apply. Switch the
// scale type and watch the fields change — each tab is judged on its own values, so two modes can be
// using different scale types at once.
var scales = [
  { name: "Desktop", scaleType: "modular", ratio: 1.25, step: 4, mod: 3 },
  { name: "Mobile", scaleType: "metric", ratio: 1.2, step: 2, mod: 3 },
]; // @rows: name:text=Mode|scaleType:radio(modular:Modular scale|metric:Metric scale|fibonacci:Fibonacci)=Scale type|ratio:(1.2:1.2 Minor third|1.25:1.25 Major third|1.618:1.618 Golden ratio){scaleType=modular}=Scaling method|step:number{scaleType=metric|fibonacci}=Step|mod:number{scaleType=metric}=Every N steps @tabs @label: Scale per mode
//
// # Table rows
// The same annotation without @tabs: one line per entry, with Add and Remove.
var breakpoints = [
  { label: "sm", min: 640 },
  { label: "md", min: 834 },
]; // @rows: label:text=Name|min:number=Min width @label: Breakpoints
//
// # A curve you can drag
// `@curve` on an **array** of four numbers — the two handles of one cubic, exactly what `cubic-bezier()`
// carries. Drag a handle, arrow-key it a percent at a time, pick a preset, or paste coordinates into the
// field underneath. All four are the same edit: the numbers are the value and everything on screen is a
// reading of them, which is why the dropdown says *Custom* the moment a curve stops being a preset.
var easing = [0.37, 0, 0.63, 1]; // @curve @label: Curve @helper: The dashed diagonal is the straight ramp — a curve is read as how far it departs from it.
//
// **Add middle point** makes it a three-point curve: ten numbers, a middle anchor you can drag in both
// directions, and a handle either side of it. The split is exact, so adding the point does not move the
// curve. It is also what `easeInOut` has always been — the in-curve over the first half and the out-curve
// over the second is a middle anchor at the centre, written as an `if`.
var twoSegment = [0.17, 0, 0.33, 0.23, 0.5, 0.5, 0.67, 0.77, 0.83, 1]; // @curve @label: Two-segment curve
//
// `@allowOriginal` adds *Original* to the preset list — the empty curve, for a script that has something
// to fall back on. Colors uses it to mean "leave the steps this file already has".
var maybeCurve = []; // @curve @allowOriginal @label: Curve or original @helper: Shown empty. Pick a preset to give it points.
//
// # A curve on a real axis
// `@ends:` names the two fields the curve runs **between**, and `@range:` the limits of the quantity
// itself. Together they turn the y axis from a unit square into the thing being edited: the labels are
// percentages of lightness, the dashed line joins the two ends rather than the corners of the box, and the
// two **square** handles are those ends — drag one and it types into its own field, because that is where
// the value lives. The round handles still only bend the shape between them.
//
// The plot shows a **window** on the channel — the two ends with a little air — and two columns sit beside
// it. The **triangle** is the zoom: drag it up to close in, down to pull back, or step it with the buttons
// above and below. The bar to its right is the channel's own colours across that window, and it is a
// picture: it takes no input at all. Neither column moves when you drag the curve, because where you are
// looking is not a property of the ramp — and to follow a ramp that runs off the top or bottom, drag the
// empty chart vertically.
//
// The ramp is clipped to the plot; the grips are clipped to the plot **plus their own radius**, so one on
// the boundary sits *on* the frame rather than being sliced in half by it. A drag stops at the edge of the
// window rather than pushing the curve out of sight.
var ladder = { bright: 98, dark: 19 }; // @group: bright:number=Bright|dark:number=Dark @label: Ends
var ladderCurve = [0.4, 0, 0.7, 0.55]; // @curve @ends: ladder.bright..ladder.dark @range: 0..100 @label: Lightness @helper: Bright at the left, dark at the right. The ends are draggable; the shape between them is not affected by moving one.
//
// # A scale with no far end
// `curve(growth:ratio)` inside `@rows` — the **open-ended** editor, for a scale whose largest value nobody
// knows in advance. The y axis is logarithmic, so a constant ratio is a straight line and its slope is the
// growth: one handle drags it, continuously, into the sibling cell named after the colon. Past the last
// token the line carries on faintly, because it does — adding a token extends the scale rather than
// squeezing what is already generated into the same range.
//
// **The dropdown is the shape control.** *Linear* means no shape and draws no handles; anything else
// reveals them, for when the growth should vary across the scale — tighter at the small end, looser at the
// top. The field underneath carries the whole scale, growth and shape together, so copying it out and
// pasting it back reproduces it.
//
// The growth has **no field of its own**: one idea, one control. It is still written to the config under
// the name after the colon, so the block reads `ratio: 1.5` beside `curve: []`.
var openScale = [
  { name: "Value", ratio: 1.5, curve: [] },
]; // @rows: name:text=Mode|curve:curve(growth:ratio)=Scale @tabs @label: Open-ended scale
//
// # What the form cannot hold
var nested = { outer: { inner: 1 } }; // @label: Nested object @helper: an object with no @rows — the form says so rather than dropping it
// @UI_CONFIG_END
