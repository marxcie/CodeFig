// @ConfigUI
// @DOC_START
// # @ConfigUI
// Build and send native UI (toggles, inputs, sections) to the plugin so it can be shown in real time.
//
// ## Overview
// Import to define config or custom forms in code. Build a schema with section(), toggle(), number(), string(), select(), then send it to the plugin UI with sendToUI(). The plugin renders native controls (Figma-style toggles, inputs) that users can interact with. You can edit this library to add more component types (e.g. createColorPicker, createSlider).
//
// ## UI Config block in scripts (no builder)
// In a script, wrap config variables between **// @UI_CONFIG_START** and **// @UI_CONFIG_END**. The Config tab will show the native form only (no code view). Use **// @CONFIG_START** / **// @CONFIG_END** if you want the Config tab to show editable code instead of the form.
//
// ## Markdown in comments
// Section titles (comment lines like `// # Section`) and inline hints (the comment after `var x = value; // hint`) are rendered as **Markdown**. Supported:
// - **Headings:** `# H1`, `## H2`, `### H3`
// - **Bold:** `**text**`
// - **Italic:** `*text*`
// - **Code:** `` `code` ``
// - **List:** `- item` (renders as unordered list)
//
// **Spacing:** A single newline between comment lines = line break (no extra gap). A **blank line** or an **empty comment line** (`//`) = new paragraph / extra vertical space between blocks. So: no blank line between `// # Title` and `// Subtitle` gives a line break only; a blank line or `//` between two sections gives extra space in the rendered form.
//
// ## Exported functions
// - **Builder:** section(title), toggle(name, value, opts?), number(name, value, opts?), string(name, value, opts?), select(name, value, options, opts?)
// - **Send:** sendToUI() – sends the built schema to the plugin UI (Config / Visual or custom panel)
//
// ## Example
// section('Display').toggle('onlyUsed', true).number('maxNodes', 5);
// sendToUI();
// @DOC_END
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

var builder = {
  section: section,
  toggle: toggle,
  number: number,
  string: string,
  select: select,
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
      console.log('ConfigUI: Could not send to UI:', e.message);
    }
  }
}
