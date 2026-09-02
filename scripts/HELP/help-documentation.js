// @Help & documentation
// @DOC_START
// # Documents CodeFig scripting: Documentation and Script tabs, imports, shortcuts, and the Style and UI reference
//
// ## Overview
//
// CodeFig runs plain JavaScript in the Figma plugin sandbox. Use the sidebar for Utility Scripts,
// Design System Foundations, libraries, and your saved scripts.
//
// Scripts can ship a Documentation tab (`@DOC_START`…`@DOC_END`, Markdown) and a Configuration UI
// (`@PANEL_START` recipe plus `@UI_CONFIG_*` / `@CONFIG_*` values). Open this script's **Configuration UI**
// for a live specimen of every control; sizes and tokens are under **Style & UI reference** below.
//
// ## Documentation tab
//
// The block between `// @DOC_START` and `// @DOC_END` renders as Markdown.
//
// Supported: headings (`#`, `##`, `###`), **bold**, *italic*, `code`, lists (`- item`), and more.
//
// Spacing: one newline between comment lines is a line break. A blank line or empty `//` starts a new
// paragraph.
//
// ## Script tab
//
// The main editor. Code must be valid JavaScript at run time (no TypeScript-only syntax). Run with
// Cmd/Ctrl+R; changes auto-save. Use the sidebar to open scripts.
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
// Browse **Utility Scripts** in the sidebar for ready-to-use scripts. They are grouped as:
//
// - **Utility Scripts:** change-case, comments-to-annotations, frame-or-auto-layout-selected,
//   remove-unnecessary-nesting, relink-local-instances, scale-selection
// - **Styles:** duplicate-styles, rename-styles, replace-styles, text-to-styles,
//   render-styles-overview, relink-local-styles
// - **Variables:** duplicate-variable-collection, export-import-variables,
//   merge-variable-collections, rename-variables, replace-variables, selection-to-variables,
//   variable-inspector, match-colors-to-collection-variables
// - **Styles & Variables:** check-style-variable-bindings, detach-styles_&_variables,
//   replace-style-variable-bindings, select-by-styles-variables
// - **Design System Foundations:** colors, grid, typography, spacing, corner-radius
// - **API (Utility Scripts):** comments-to-annotations (Figma REST API + personal access token)
//
// Files or folders whose names start with **`_`** are omitted from the plugin build (development-only).
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
// ### Three roles (do not mix them)
//
// | Role | What it is | Configuration UI |
// |---|---|---|
// | **Runnable script** | A script you Run. Values in `@UI_CONFIG_*` or `@CONFIG_*`; form recipe in `@PANEL_START` as `var __codefigPanel = { blocks: […] }` (bare keys, same shape as this Help specimen). | The form authors edit in Source |
// | **Library** | `@`-prefixed script. Export top-level `function`s for `@import`. Not run on its own. | Usually none — helpers, not a product panel |
// | **CodeFigUI builder** | `@codefig-ui`'s `section()` / `sendToUI()` API | A form **built while the script runs**, not a Source `@PANEL_START` recipe |
//
// Shipped panels and custom scripts with a real settings form use the **runnable** path. Open any utility or Design System Foundations script in Source: the recipe language is the same.
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
// - **Configuration UI** — this script's own settings tab is the live specimen shelf. Each control's
//   ⓘ quotes the `@PANEL_START` recipe that produced it, so a change can be asked for by pointing at
//   the thing rather than describing it.
// - **Here** — the values behind them: tokens, the heading ladder, and what is deliberately not
//   covered.
//
// There is also `artifacts/style-reference.html` in the repo, which loads the same `src/ui.css` in a
// browser and **prints every computed size next to the specimen**. Font sizes cannot be measured
// inside Figma, so that page is where a number gets checked rather than eyeballed.
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
// Two regions in Source. **Values** live in `@UI_CONFIG_START`…`@UI_CONFIG_END` (`var` lines) or
// `@CONFIG_START`…`@CONFIG_END` (object literal — Design System Foundations style). The **recipe**
// lives in `@PANEL_START`…`@PANEL_END` as a live object (`var __codefigPanel = { blocks: […] }`)
// so Source syntax-highlights it. Configuration UI is the form;
// Source holds both regions. There is no Configuration code tab.
//
// Every control below is rendered live in this script's **Configuration UI** tab. Shipped scripts
// and anything with a real panel use `@PANEL_START`. Trailing annotations on `var` lines still work
// for scripts *without* `@PANEL_START` (legacy / tiny utilities) — the annotation parser path is
// kept, not the authoring model for new panels.
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
// | `{ type: "heading", level: 1, text: "Title" }` | section heading |
// | `level: 2` / `level: 3` | sub-headings |
// | `{ type: "paragraph", text: "…" }` | a paragraph — **bold**, *italic* and `code` all work |
// | `{ type: "divider" }` | a short rule |
// | `{ type: "divider", section: true }` | a rule to both panel edges |
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
// - **`blank` / `lineBreak`** — spacer comment lines in the old one-line annotation format. A
//   `@PANEL_START` recipe has no blank block; paragraph fold direction is `attachTo: "next"` or
//   `"previous"` instead. Bare `//` gaps still work on non-migrated scripts; they are not something
//   the specimen shelf can show once the panel is JSON.
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
      text: "Above: a short rule, from `{ type: \"divider\" }`." },
    { type: "divider", section: true },
    { type: "paragraph", attachTo: "previous",
      text: "Above: a rule reaching both panel edges, from `{ type: \"divider\", section: true }`." },
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
    { key: "nested", type: "unsupported", label: "Nested object", helper: "an object with no type: \"rows\" or type: \"group\"" },
  ]
};
// @PANEL_END

