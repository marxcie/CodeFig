// @Help & documentation
// @DOC_START
// # CodeFig – Help & documentation
//
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
// - **Here** — the values behind them: tokens, the two heading ladders, and what is deliberately not
//   covered.
//
// There is also `artifacts/style-reference.html` in the repo, which loads the same `src/ui.css` in a
// browser and **prints every computed size next to the specimen**. Font sizes cannot be measured
// inside Figma, so that page is where a number gets checked rather than eyeballed.
//
// ### Two heading ladders, and they are not the same
//
// The Documentation tab and a settings form style headings with **separate rules**. Same markdown,
// different sizes. Check the one you mean to change.
//
// | Source | Tag | Documentation tab | Configuration UI form |
// |---|---|---|---|
// | `// # Title` | `h1` | 20px, `--font-size-display` | 16px, `--font-size-title`, carries the 48px section gap |
// | `// ## Title` | `h2` | 15px, `--font-size-headline` | 14px, `--font-size-subheadline`, half the section gap |
// | `// ### Title` | `h3` | 14px, `--font-size-subheadline` | 12px, `--font-size-body`, semibold |
// | any other comment line | `p` | 12px, `--font-size-body` | 12px, `--font-size-body` |
//
// Rules: `.docs-rendered h1|h2|h3` for this tab, `.config-ui-form--rows .config-ui-row--heading
// h1|h2|h3` for the form.
//
// The form's ladder is **even** — 16 / 14 / 12, two pixels a step, with weight rather than size
// separating the bottom of it from body copy. The Documentation tab's is not, and it is the older of
// the two: `--font-size-headline` (15px) now sits one pixel from `--font-size-title` and is used only
// by the script title, this tab's `h2` and the InfoPanel header. Two sizes a pixel apart read as an
// accident, so that is a live question rather than a decision.
//
// ### Type scale
//
// | Token | Value | Used for |
// |---|---|---|
// | `--font-size-display` | 20px | Documentation `h1` only |
// | `--font-size-title` | 16px | section titles in a settings form |
// | `--font-size-headline` | 15px | the script title, Documentation `h2`, the InfoPanel header |
// | `--font-size-subheadline` | 14px | sub-titles |
// | `--font-size-body` | 12px | labels, inputs, paragraphs, table cells |
// | `--font-size-helper` | 10px | the note under a field (`@helper:`), chip locks, notices |
// | `--font-size-caption` | 10px | buttons, tags, status text |
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
// `--radius-sm` 3px, `--radius-md` 6px (inputs, buttons), `--radius-lg` 12px, `--radius-full` for
// pills.
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
// | `@label: Text` | the label, instead of the prettified variable name |
// | `@helper: Text` | a 10px note under the control, not under the row. **Last on the line:** a note runs to the end of it, so it can mention an `@annotation` without being cut in half |
// | `@showWhen: field=value` | the row appears only when that field holds one of those values |
// | `@collection` | collection picker: this file's collections, plus **New collection** |
// | `@mode: field` | mode picker: the modes of the collection that `field` holds, plus **New mode**. Written bare it follows the block's only `@collection`. Changing that collection resets it — the modes on offer are the new collection's |
// | `@collectionModes: Title` | the mode chips — a marker row of its own, reading names from the `modes` field |
// | `@rows: key:type=Label\|…` | a table, one line per array entry |
// | `@rows: …` + `@tabs` | the same array as one tab per entry, fields stacked and labelled |
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
// # Table rows
// The same annotation without @tabs: one line per entry, with Add and Remove.
var breakpoints = [
  { label: "sm", min: 640 },
  { label: "md", min: 834 },
]; // @rows: label:text=Name|min:number=Min width @label: Breakpoints
//
// # What the form cannot hold
var nested = { outer: { inner: 1 } }; // @label: Nested object @helper: an object with no @rows — the form says so rather than dropping it
// @UI_CONFIG_END
