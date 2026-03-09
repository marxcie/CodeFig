// @CodeFigUI
// @DOC_START
// # CodeFigUI
// Build and send native UI (toggles, inputs, sections) to the plugin so it can be shown in real time.
//
// **Nomenclature:** **CodeFigUI** is this feature (the library and the form rendered in the Config tab). The **@UI_CONFIG** block is the section in your script: wrap config variables between **// @UI_CONFIG_START** and **// @UI_CONFIG_END**. So: use “CodeFigUI” when referring to the feature; use “@UI_CONFIG” when referring to the config block markers.
//
// ## Overview
// Import to define config or custom forms in code. Build a schema with section(), toggle(), number(), string(), select(), then send it to the plugin UI with sendToUI(). You can edit this library to add more component types (e.g. createColorPicker, createSlider).
//
// ## @UI_CONFIG block in scripts
// Wrap config variables between **// @UI_CONFIG_START** and **// @UI_CONFIG_END**. The Config tab will show the native form only (no code view). Use **// @CONFIG_START** / **// @CONFIG_END** if you want the Config tab to show editable code instead of the form.
//
// ## Components (built-in)
// - **Toggle** (boolean) – checkbox-style on/off.
// - **Number** – numeric input.
// - **Text** (string) – single-line text input.
// - **Textarea** – multiline text (e.g. batch replacement: one line per "search, replace"). **Builder:** textarea(name, value, opts?). **@UI_CONFIG block:** add `// @textarea` on the var line. Same width as text input, max 5 lines by default.
// - **Select** (dropdown) – choice from a list of options. **Builder API:** section().select(name, value, options, opts?). In the **@UI_CONFIG block**, add `// @options:` on the var line (see **Dropdown** and **Dropdown options** below).
// - **Radio** – single choice from options shown as radio buttons (use when all options should be visible). **Builder API:** section().radio(name, value, options, opts?). In the **@UI_CONFIG block**, add `// @options: a|b|c @radio` on the var line.
//
// **Conditional visibility (`@showWhen`):** Add `@showWhen: fieldName=value1|value2` so a field is only shown when the controlling field has one of the listed values. Use for parameters that depend on a previous choice (e.g. show `scaledFactor` only when `scaleMode=uniform`).
//
// **In the @UI_CONFIG block:** only `var name = value; // optional hint` is supported. Inferred types: `true`/`false` → toggle, number → number input, string → text. For a **dropdown**, use `// @options: <value>` (static list or dynamic source). For **radio buttons**, use `// @options: a|b|c @radio`. For **conditional visibility** use `// @showWhen: fieldName=val1|val2`. The variable value is always a string; in script/code mode it is edited as text.
//
// ## Dropdown (use in @UI_CONFIG)
// Use a **dropdown** when the value must be one of a fixed or runtime-defined set (e.g. action type, collection name). In the Config tab the control is a `<select>`; in script mode the line stays editable as `var name = 'value';`.
//
// **Static choices** – e.g. action or mode: `var selectedType = 'frame'; // @options: frame|autoLayout`  
// **Dynamic choices** – e.g. pick a variable collection: `var sourceCollectionName = 'website V3'; // @options: variableCollections`  
// The script reads the var like any other string; run uses the current selection. See **Dropdown options** for syntax and edge cases.
//
// ## Dropdown options (`// @options:`)
// On a var line, `// @options: <value>` accepts either a **dynamic source** or a **static list**:
//
// - **Static list (pipe-separated):** e.g. `var selectedType = 'frame'; // @options: frame|autoLayout`  
//   The token after `@options:` contains `|`, so it is split by `|`, trimmed, and used as the option list. The Config tab shows a dropdown with those options; script mode keeps the line as editable code. Round-trip serialization preserves the list as `opt1|opt2|...`.
// - **Dynamic source (single word):** e.g. `var sourceCollectionName = 'website V3'; // @options: variableCollections`  
//   The token is a single word (no `|`), so the plugin fills the dropdown at runtime. Supported dynamic sources: **variableCollections**.
//
// **Rule:** If the token after `@options:` contains a pipe (`|`), it is treated as a static list; otherwise as a dynamic source name.
//
// **Edge cases:** Empty or single-option lists are valid (field.options is still set). If the current var value is not in the option list, the current value is still shown and serialized. Existing scripts using `// @options: variableCollections` (no pipe) continue to use dynamic loading unchanged.
//
// ## Scope and filtering (config patterns)
// Many scripts use **scope** and **filtering** vars inside the @UI_CONFIG block. These are normal CodeFigUI fields (no special directive):
//
// - **searchIn** (string) – Optional scope filter: which items to process. Empty = all; when set, the script restricts to items whose name or path matches (partial). Examples: variable scripts use "collection / variable path"; style scripts use style name (e.g. `"color/"`, `"Typography/"`). Use a text input or leave empty for "all".
// - **selectionOnly** (boolean) – When true, process only the current selection; when false, process the whole page (or a full set). Use a toggle in the @UI_CONFIG block. Scripts that support it (e.g. replace-styles) read the var and pass it into the processing logic.
//
// These are not CodeFigUI-specific features—they are config variables that your script logic interprets. CodeFigUI only provides the controls (text, toggle, dropdown); the script decides how to apply scope and filtering.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Builder | section(title), toggle(name, value, opts?), number(name, value, opts?), string(name, value, opts?), textarea(name, value, opts?), select(name, value, options, opts?), radio(name, value, options, opts?) |
// | Send | sendToUI() – sends the built schema to the plugin UI (Config / Visual or custom panel) |
//
// ## Example (builder)
// section('Display').toggle('onlyUsed', true).number('maxNodes', 5);
// sendToUI();
// @DOC_END

// Config block showcase (toggle, number, text, dropdown). Select is also available via the builder API (section().select(...)).
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
