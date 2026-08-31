/**
 * `@PANEL_START` + `@UI_CONFIG_START` (`var name = …;`) values round-trip.
 *
 * Utility scripts keep live `var` statements (the script body reads those names). The panel
 * recipe moves to `@PANEL_START`; values must still parse and serialize as `var`, not as a
 * property list — otherwise a save would corrupt the runtime block.
 */
const test = require('node:test');
const assert = require('node:assert');

const parser = require('../src/config-ui/parser.js');
const { validatePanelKeyParity } = require('../validate-scripts.js');

const PANEL_SPEC = [
  '// {',
  '//   blocks: [',
  '//     { key: "caseStyle", type: "select", label: "Case style",',
  '//       options: { "lower case": "lower case", "Capital case": "Capital case" } },',
  '//     { key: "frames", type: "boolean", label: "Frames" },',
  '//     { key: "groups", type: "boolean", label: "Groups" }',
  '//   ]',
  '// }',
].join('\n');

const UI_CONFIG_VALUES = [
  '// # Change case',
  'var caseStyle = "lower case"; // @options: lower case|Capital case @label: Case style',
  'var frames = true; // @label: Frames',
  'var groups = true; // @label: Groups',
].join('\n');

const PROPERTY_VALUES = [
  '  caseStyle: "lower case",',
  '  frames: true,',
  '  groups: true,',
].join('\n');

test('parse: UI_CONFIG-style var values + PANEL → correct field values', () => {
  const parsed = parser.parse(UI_CONFIG_VALUES, PANEL_SPEC);
  assert.ok(!parsed.error, parsed.error);
  assert.ok(!parsed.driftWarning, parsed.driftWarning);
  assert.strictEqual(parsed.fromPanelSpec, true);

  const byName = {};
  parsed.rows.filter((r) => r.type === 'field').forEach((r) => { byName[r.name] = r; });
  assert.strictEqual(byName.caseStyle.value, 'lower case');
  assert.strictEqual(byName.frames.value, true);
  assert.strictEqual(byName.groups.value, true);
});

test('parseConfigBlockObject extracts keys from var assignments', () => {
  const values = parser.parseConfigBlockObject(UI_CONFIG_VALUES);
  assert.deepStrictEqual(values, {
    caseStyle: 'lower case',
    frames: true,
    groups: true,
  });
});

test('serialize change → still var name = …; not name: …,', () => {
  const parsed = parser.parse(UI_CONFIG_VALUES, PANEL_SPEC);
  const out = parser.serialize(parsed, {
    caseStyle: 'Capital case',
    frames: true,
    groups: true,
  });
  assert.match(out, /var caseStyle = "Capital case";/);
  assert.doesNotMatch(out, /caseStyle\s*:/);
  // Edited var line drops trailing annotations (they live in PANEL).
  assert.doesNotMatch(out, /var caseStyle = "Capital case";\s*\/\//);
  // Untouched neighbours keep their original lines, annotations and all.
  assert.ok(out.includes('var frames = true; // @label: Frames'));
  assert.ok(out.includes('var groups = true; // @label: Groups'));
});

test('unchanged value → byte-identical values block', () => {
  const parsed = parser.parse(UI_CONFIG_VALUES, PANEL_SPEC);
  const values = parser.parseConfigBlockObject(UI_CONFIG_VALUES);
  const out = parser.serialize(parsed, values);
  assert.strictEqual(out, UI_CONFIG_VALUES);
});

test('regression: property-list CONFIG + PANEL still round-trips', () => {
  const parsed = parser.parse(PROPERTY_VALUES, PANEL_SPEC);
  assert.ok(!parsed.error, parsed.error);
  assert.ok(!parsed.driftWarning, parsed.driftWarning);

  const byName = {};
  parsed.rows.filter((r) => r.type === 'field').forEach((r) => { byName[r.name] = r; });
  assert.strictEqual(byName.caseStyle.value, 'lower case');
  assert.strictEqual(byName.frames.value, true);

  const values = parser.parseConfigBlockObject(PROPERTY_VALUES);
  assert.strictEqual(parser.serialize(parsed, values), PROPERTY_VALUES);

  const edited = parser.serialize(parsed, {
    caseStyle: 'Capital case',
    frames: true,
    groups: true,
  });
  assert.match(edited, /caseStyle: "Capital case",/);
  assert.doesNotMatch(edited, /\bvar\s+caseStyle\b/);
  assert.ok(edited.includes('  frames: true,'));
});

test('multiline var array: parse + edit keeps var syntax', () => {
  const valuesText = [
    'var steps = [',
    '  25,',
    '  50,',
    '  100',
    '];',
    'var label = "ok";',
  ].join('\n');
  const panel = [
    '// { blocks: [',
    '//   { key: "steps", type: "list", label: "Steps" },',
    '//   { key: "label", type: "string", label: "Label" }',
    '// ] }',
  ].join('\n');

  const parsed = parser.parse(valuesText, panel);
  assert.deepStrictEqual(
    parsed.rows.find((r) => r.name === 'steps').value,
    [25, 50, 100]
  );

  const untouched = parser.serialize(parsed, parser.parseConfigBlockObject(valuesText));
  assert.strictEqual(untouched, valuesText);

  const edited = parser.serialize(parsed, { steps: [25, 50, 100, 200], label: 'ok' });
  assert.match(edited, /^var steps = /m);
  assert.doesNotMatch(edited, /steps\s*:/);
  assert.ok(edited.includes('var label = "ok";'));
});

test('validatePanelKeyParity accepts @UI_CONFIG_START as the values region', () => {
  const code = [
    '// @PANEL_START',
    PANEL_SPEC,
    '// @PANEL_END',
    '// @UI_CONFIG_START',
    UI_CONFIG_VALUES,
    '// @UI_CONFIG_END',
  ].join('\n');
  assert.deepStrictEqual(validatePanelKeyParity([{ name: 'Change case', code }]), []);
});

test('validatePanelKeyParity reports drift for @UI_CONFIG + @PANEL', () => {
  const code = [
    '// @PANEL_START',
    PANEL_SPEC,
    '// @PANEL_END',
    '// @UI_CONFIG_START',
    'var caseStyle = "lower case";',
    'var frames = true;',
    '// @UI_CONFIG_END',
  ].join('\n');
  const errors = validatePanelKeyParity([{ name: 'Change case', code }]);
  assert.ok(errors.some((e) => /"groups" is a field/.test(e.message) && /@UI_CONFIG_START/.test(e.message)));
});
