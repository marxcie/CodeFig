// SCRIPT_NAME: Style & UI reference
// @DOC_START
// # Style & UI reference
//
// Every text style and control the plugin can render, with the source line that produces each one.
// Two tabs, two jobs:
//
// - **Configuration UI** — the live specimens. Each control names the exact syntax under it, so a
//   change can be asked for by pointing at the thing rather than describing it.
// - **Documentation** (this tab) — the values behind them: tokens, the two heading ladders, and the
//   things that are *not* style primitives.
//
// This exists because a heading size and a section gap were both "applied" twice while styling
// nothing on screen: the rules named `h2`, and a config block's `// # Title` is level 1, so it
// renders as `h1`. Nobody could see that without a reference. Now the level is written next to the
// specimen, and asking for "H1 → H3" is a sentence rather than an investigation.
//
// ## Two heading ladders, and they are not the same
//
// The Documentation tab and the Configuration UI form style headings with **separate rules**. Same
// markdown, different sizes. Check the one you mean to change.
//
// | Source | Tag | Documentation tab | Configuration UI form |
// |---|---|---|---|
// | `// # Title` | `h1` | 20px, `--font-size-display` | 15px, `--font-size-headline`, carries the 48px section gap |
// | `// ## Title` | `h2` | 15px, `--font-size-headline` | 14px, `--font-size-subheadline`, half the section gap |
// | `// ### Title` | `h3` | 14px, `--font-size-subheadline` | 14px, `--font-size-subheadline`, tight margins |
// | any other comment line | `p` | 12px, `--font-size-body` | 12px, `--font-size-body` |
//
// Rules: `.docs-rendered h1|h2|h3` for this tab, `.config-ui-form--rows .config-ui-row--heading
// h1|h2|h3` for the form.
//
// **Open question for Márton:** in the form, `h2` and `h3` are both 14px and differ only in their
// margins. That is either fine (two spacings, one size) or a missing step. Nothing has been invented
// to close it — say which and it changes.
//
// ## Type scale
//
// | Token | Value | Used for |
// |---|---|---|
// | `--font-size-display` | 20px | Documentation `h1` only |
// | `--font-size-headline` | 15px | section titles in a config form; docs `h2` |
// | `--font-size-subheadline` | 14px | sub-titles |
// | `--font-size-body` | 12px | labels, inputs, paragraphs, table cells |
// | `--font-size-helper` | 10px | the note under a field (`@helper:`), chip locks, notices |
// | `--font-size-caption` | 10px | buttons, tags, status text |
//
// Weights: `--font-weight-normal` 400 (labels and body), `--font-weight-medium` 500,
// `--font-weight-semibold` 600 (headings, buttons), `--font-weight-bold` 700.
//
// ## Spacing scale
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
// ## Radii
//
// `--radius-sm` 3px, `--radius-md` 6px (inputs, buttons), `--radius-lg` 12px, `--radius-full` for
// pills.
//
// ## Colours
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
// ## Buttons
//
// Live, from the plugin's own classes — 32px tall, `--radius-md`, 10px semibold. Clicking them does
// nothing; they carry no handler.
//
// <span style="display:inline-flex;gap:8px;align-items:center"><button class="btn primary">Run</button><button class="btn secondary">Import</button><button class="btn danger">Delete</button><button class="btn secondary" disabled>Disabled</button></span>
//
// `.btn` plus one of `.primary`, `.secondary`, `.danger`. Primary is the only filled one, and there
// is one per panel.
//
// ## Controls, and the line that makes each
//
// Every one of these is rendered live in the **Configuration UI** tab. The annotation goes in the
// trailing comment on a field's line.
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
// | `@helper: Text` | a 10px note under the control, not under the row |
// | `@showWhen: field=value` | the row appears only when that field holds one of those values |
// | `@collection` | collection picker: this file's collections, plus **New collection** |
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
// ## Not in here, on purpose
//
// - **`@preview` and `@suggestions`** render whatever the script's own `@PREVIEW:` / `@SUGGESTIONS:`
//   function returns, so they are that panel's markup rather than a style primitive. Grid is the live
//   example; critique them there, where the numbers are real.
// - **InfoPanel and CodeFigUI** (`@InfoPanel`, `@codefig-ui`) style a script's *results*, which is a
//   different surface with its own classes. Worth its own reference — ask and it gets one.
// - **Sidebar, tab strip and footer** are panel chrome rather than anything a script can produce.
//
// ## Keeping this honest
//
// `tests/style-reference.test.js` fails when a control exists that this reference does not show, and
// when a token's value here disagrees with `src/ui.css`. A reference nobody can trust is worse than
// none, because it gets quoted.
// @DOC_END

// @UI_CONFIG_START
// # Heading level 1
// The level every panel uses for its section titles: `// # Heading level 1`. Renders as `h1`, and it
// carries the 48px gap that separates one section from the next.
//
// ## Heading level 2
// Two hashes. A title *inside* a section, at 14px with half the gap above it.
//
// ### Heading level 3
// Three hashes: 14px again, with tight margins.
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

// Nothing to run: this script exists to be looked at. It reads nothing and writes nothing.
figma.notify("Style & UI reference — open the Configuration UI and Documentation tabs.");
if (window.codefigRunComplete) window.codefigRunComplete();
