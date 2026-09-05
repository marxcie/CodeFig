/**
 * Helpers for DSF panel tests: apply address + modes so `@showWhen` gated sections render.
 */
function applyConfigToSchema(schema, config) {
  const parser = require('../src/config-ui/parser.js');
  const rows = parser.flattenPanelRows
    ? parser.flattenPanelRows(schema.rows)
    : schema.rows;
  rows.forEach(function (r) {
    if (r.type === 'field' && Object.prototype.hasOwnProperty.call(config, r.name)) {
      r.value = config[r.name];
    }
  });
  return schema;
}

/**
 * Build a panel with Collection chosen and optional config overrides.
 * `parsePanel` is the test file's () => P.parse(BLOCK, PANEL).
 */
function buildPanelWithCollection(R, parsePanel, config) {
  const schema = parsePanel();
  const values = Object.assign({ collectionName: 'Test Collection' }, config || {});
  applyConfigToSchema(schema, values);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  R.attachListeners(container, schema, function () {});
  return { schema, container, values, items: container.querySelectorAll('.config-ui-rows-item') };
}

module.exports = {
  applyConfigToSchema,
  buildPanelWithCollection,
};
