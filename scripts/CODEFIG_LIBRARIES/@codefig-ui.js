// @CodeFigUI
// @DOC_START
// # Builds run-time Configuration UI forms; author shipped panels with @PANEL_START and values blocks
//
// ## Overview
//
// **Shipped Configuration UI panels** use `@PANEL_START`…`@PANEL_END` (`var __codefigPanel = { blocks: […] }` with bare keys)
// plus a values block (`@UI_CONFIG_*` or `@CONFIG_*`). That is the authoring model for **runnable scripts** — see **Help & documentation** (Style & UI reference; three roles).
//
// This library's builder API (`section()`, `sendToUI()`, …) is for **forms built at run time**, not a replacement for `@PANEL_START`. A **library** (`@`-prefixed script) exports functions for `@import` and is not Run on its own.
//
// **Names:** **CodeFigUI** is the feature (this library and the Config tab form). **`@UI_CONFIG_*`** markers wrap **values** in a script.
//
// ### Builder API
//
// Build a schema with `section()`, `toggle()`, `number()`, `string()`, `textarea()`, `select()`, `radio()`, then `sendToUI()`:
//
// ```js
// section('Display').toggle('onlyUsed', true).number('maxNodes', 5);
// sendToUI();
// ```
//
// ### Values blocks
//
// With `@PANEL_START`, `@UI_CONFIG_START`…`@UI_CONFIG_END` and `@CONFIG_START`…`@CONFIG_END` hold **values only**. Without a PANEL block, trailing annotations on each `var` line still drive a simple form:
//
// | Annotation | Effect |
// |---|---|
// | `@options:` + static list | Dropdown — pipe-separated choices, e.g. `frame` / `autoLayout` |
// | `@options: variableCollections` | Dynamic collection list (local + remote, with “all”) |
// | `@options: localVariableCollections` | Local collections only (no “all”) |
// | `@options:` + `@radio` | Radio buttons |
// | `@options:` + `@multi` | Multiselect — value is a JSON array of strings |
// | `@collection` / `@mode` / `@mode: field` | Collection and mode pickers |
// | `@textarea` | Multiline text |
// | `@showWhen: field=…` | Show only when the controlling field matches (AND if repeated) |
// | `@label: …` | Override the auto-generated label |
// | `// ---` | Section divider |
// | `// ## Title` | Section heading (may take `@showWhen`) |
//
// Pipe in the `@options` token → static list; a single word → dynamic source. List `@options` first, then `@radio` / `@multi`, then `@showWhen`.
//
// ## Exported functions
//
// | Category | Functions |
// |----------|-----------|
// | Builder | section(title), toggle(name, value, opts?), number(name, value, opts?), string(name, value, opts?), textarea(name, value, opts?), select(name, value, options, opts?), radio(name, value, options, opts?) |
// | Schema | getSchema(), reset() |
// | Send | sendToUI() |
// @DOC_END

// Config block showcase (toggle, number, text, dropdown) — builder / annotation demo, not the
// `@PANEL_START` authoring model. Prefer Help & documentation for panel recipes.
// @UI_CONFIG_START
// # Built-in components
// One of each control type the config block supports.
var exampleToggle = true; // Boolean → toggle
var exampleNumber = 42; // Number → number input
var exampleText = 'Hello'; // String → text input
var exampleSelect = 'frame'; // @options: frame|autoLayout
var exampleRadio = 'scale'; // @options: scale|resize @radio
// @UI_CONFIG_END

var shared = true;

/**
 * Human-readable label from variable name (camelCase -> Title Case)
 */
function labelFromName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, function (s) { return s.toUpperCase(); })
    .trim();
}

var _sections = [];
var _currentSection = null;

/**
 * Start a new section (group of fields). Chain with toggle(), number(), string(), select().
 * @param {string} title - Section header text
 * @returns {Object} Builder for chaining
 */
function section(title) {
  _currentSection = { title: title || '', fields: [] };
  _sections.push(_currentSection);
  return builder;
}

/**
 * Add a boolean toggle. Chain more fields or call sendToUI().
 * @param {string} name - Variable name
 * @param {boolean} value - Initial value
 * @param {{ label?: string, tooltip?: string }} opts - Optional label and tooltip
 */
function toggle(name, value, opts) {
  if (!_currentSection) _currentSection = { title: '', fields: [] }; _sections.push(_currentSection);
  _currentSection.fields.push({
    name: name,
    type: 'boolean',
    value: !!value,
    label: (opts && opts.label) || labelFromName(name),
    tooltip: (opts && opts.tooltip) || ''
  });
  return builder;
}

/**
 * Add a number input.
 * @param {string} name - Variable name
 * @param {number} value - Initial value
 * @param {{ label?: string, tooltip?: string }} opts - Optional label and tooltip
 */
function number(name, value, opts) {
  if (!_currentSection) _currentSection = { title: '', fields: [] }; _sections.push(_currentSection);
  _currentSection.fields.push({
    name: name,
    type: 'number',
    value: typeof value === 'number' ? value : 0,
    label: (opts && opts.label) || labelFromName(name),
    tooltip: (opts && opts.tooltip) || ''
  });
  return builder;
}

/**
 * Add a text input.
 * @param {string} name - Variable name
 * @param {string} value - Initial value
 * @param {{ label?: string, tooltip?: string }} opts - Optional label and tooltip
 */
function string(name, value, opts) {
  if (!_currentSection) _currentSection = { title: '', fields: [] }; _sections.push(_currentSection);
  _currentSection.fields.push({
    name: name,
    type: 'string',
    value: value != null ? String(value) : '',
    label: (opts && opts.label) || labelFromName(name),
    tooltip: (opts && opts.tooltip) || ''
  });
  return builder;
}

/**
 * Add a textarea (multiline text). Same width as string input; default max 5 lines.
 * @param {string} name - Variable name
 * @param {string} value - Initial value (can contain newlines)
 * @param {{ label?: string, tooltip?: string, rows?: number }} opts - Optional label, tooltip, and row count (default 5)
 */
function textarea(name, value, opts) {
  if (!_currentSection) _currentSection = { title: '', fields: [] }; _sections.push(_currentSection);
  _currentSection.fields.push({
    name: name,
    type: 'textarea',
    value: value != null ? String(value) : '',
    label: (opts && opts.label) || labelFromName(name),
    tooltip: (opts && opts.tooltip) || '',
    rows: (opts && opts.rows != null) ? opts.rows : 5
  });
  return builder;
}

/**
 * Add a select (dropdown). Options are an array of strings.
 * @param {string} name - Variable name
 * @param {string} value - Selected value (must be one of options)
 * @param {string[]} options - List of option strings
 * @param {{ label?: string, tooltip?: string }} opts - Optional label and tooltip
 */
function select(name, value, options, opts) {
  if (!_currentSection) _currentSection = { title: '', fields: [] }; _sections.push(_currentSection);
  _currentSection.fields.push({
    name: name,
    type: 'select',
    value: value != null ? String(value) : (options && options[0]) || '',
    options: Array.isArray(options) ? options : [],
    label: (opts && opts.label) || labelFromName(name),
    tooltip: (opts && opts.tooltip) || ''
  });
  return builder;
}

/**
 * Add a radio group (single choice from options). Use for small option sets where all choices should be visible.
 * @param {string} name - Variable name
 * @param {string} value - Selected value (must be one of options)
 * @param {string[]} options - List of option strings
 * @param {{ label?: string, tooltip?: string }} opts - Optional label and tooltip
 */
function radio(name, value, options, opts) {
  if (!_currentSection) _currentSection = { title: '', fields: [] }; _sections.push(_currentSection);
  _currentSection.fields.push({
    name: name,
    type: 'radio',
    value: value != null ? String(value) : (options && options[0]) || '',
    options: Array.isArray(options) ? options : [],
    label: (opts && opts.label) || labelFromName(name),
    tooltip: (opts && opts.tooltip) || ''
  });
  return builder;
}

var builder = {
  section: section,
  toggle: toggle,
  number: number,
  string: string,
  textarea: textarea,
  select: select,
  radio: radio,
  sendToUI: sendToUI,
  getSchema: getSchema,
  reset: reset
};

/**
 * Get the current schema without sending. Useful for inspection or merging.
 * @returns {{ sections: Array<{ title: string, fields: Array }> }}
 */
function getSchema() {
  return { sections: _sections.slice() };
}

/**
 * Reset the builder state (clear sections). Call before building a new form.
 */
function reset() {
  _sections = [];
  _currentSection = null;
}

/**
 * Send the built schema to the plugin UI. The UI will render toggles, inputs, etc.
 * Call this after building with section(), toggle(), number(), string(), select().
 */
function sendToUI() {
  var schema = getSchema();
  var payload = {
    type: 'CONFIG_UI_RENDER',
    schema: schema
  };
  if (typeof window !== 'undefined' && window._infoPanelHandler) {
    window._infoPanelHandler(payload);
  } else {
    try {
      figma.ui.postMessage(payload);
    } catch (e) {
      console.log('CodeFigUI: Could not send to UI:', e.message);
    }
  }
}
