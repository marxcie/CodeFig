/**
 * The sync button's two pure halves: which field takes which value from the file, and the
 * `@fromFile:` annotation that says so surviving a trip through the form serializer.
 *
 * There is no precedence ladder here and no dirty tracking, on purpose. The form never fills
 * itself — a click is the only way the file is read — so the only question is what one press
 * changes, and the answer has to be reportable field by field.
 *
 * The serializer half matters more than it looks: `serialize()` emits only the rows `parse()`
 * recognised, so an annotation it does not know is deleted from the source the first time
 * anyone touches a control. That would silently remove the button from the script.
 */
const test = require('node:test');
const assert = require('node:assert');

const P = require('../src/config-ui/parser.js');

const names = (list) => list.map((c) => c.name);

/** parse() returns { rows }, which is also what serialize() takes back. */
function rowsOf(source) {
  return P.parse(source).rows;
}

// ---------------------------------------------------------------------------
// @fromFile: through parse and serialize
// ---------------------------------------------------------------------------

test('@fromFile names the path a field takes from the file', () => {
  const field = rowsOf('var collectionName = "Responsive System"; // @fromFile: collection')
    .find((r) => r.name === 'collectionName');
  assert.equal(field.fromFile, 'collection');
});

test('@fromFile survives parse → serialize, alone and beside @options', () => {
  for (const line of [
    'var collectionName = "Responsive System"; // @fromFile: collection',
    'var collectionName = "Responsive System"; // @options: variableCollections @fromFile: collection',
    'var group = "Spacing"; // @fromFile: domains.spacing.group @label: Variable group'
  ]) {
    const schema = P.parse(line);
    const out = P.serialize(schema, {});
    assert.ok(/@fromFile:/.test(out), 'the annotation is gone from: ' + out);
    assert.deepEqual(rowsOf(out).find((r) => r.type === 'field').fromFile,
      rowsOf(line).find((r) => r.type === 'field').fromFile, 'and means the same thing');
  }
});

test('a field with no @fromFile does not gain one', () => {
  const schema = P.parse('var plain = "x";');
  assert.equal(schema.rows.find((r) => r.name === 'plain').fromFile, undefined);
  assert.ok(!/@fromFile/.test(P.serialize(schema, {})));
});

test('serializing does not disturb the other annotations', () => {
  // A label matching the one derived from the field name is dropped by design, so this uses
  // one that does not.
  const line = 'var mode = "a"; // @options: a|b @radio @fromFile: domains.spacing.mode @label: Scaling curve';
  const out = P.serialize(P.parse(line), {});
  assert.ok(/@options: a\|b/.test(out), out);
  assert.ok(/@radio/.test(out), out);
  assert.ok(/@fromFile: domains\.spacing\.mode/.test(out), out);
  assert.ok(/@label: Scaling curve/.test(out), out);
});

// ---------------------------------------------------------------------------
// applyFileConfig — what one press changes
// ---------------------------------------------------------------------------

const SCHEMA = [
  { type: 'field', name: 'collectionName', value: 'Responsive System', inputType: 'text', fromFile: 'collection' },
  { type: 'field', name: 'group', value: 'Spacing', inputType: 'text', fromFile: 'group' },
  { type: 'field', name: 'tokens', value: '["px"]', inputType: 'text', fromFile: 'domains.spacing.tokens' },
  { type: 'field', name: 'notFromFile', value: 'left alone', inputType: 'text' }
];

const CURRENT = { collectionName: 'Responsive System', group: 'Spacing', tokens: '["px"]', notFromFile: 'left alone' };

test('an empty payload changes nothing, and says so', () => {
  const result = P.applyFileConfig(SCHEMA, CURRENT, {});
  assert.deepEqual(result.values, CURRENT);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(names(result.unchanged).sort(), ['collectionName', 'group', 'tokens']);
  assert.equal(result.summary.indexOf('Nothing'), 0, result.summary);
});

test('a payload replaces the fields it has, and lists them', () => {
  const result = P.applyFileConfig(SCHEMA, CURRENT, { collection: 'Tokens', group: 'Space' });
  assert.equal(result.values.collectionName, 'Tokens');
  assert.equal(result.values.group, 'Space');
  assert.equal(result.values.notFromFile, 'left alone', 'a field with no @fromFile is never touched');
  assert.deepEqual(names(result.changes).sort(), ['collectionName', 'group']);
  assert.equal(result.changes[0].from, 'Responsive System');
  assert.equal(result.changes[0].to, 'Tokens');
  assert.ok(/collectionName/.test(result.summary), result.summary);
});

test('a path the payload does not have leaves the field alone', () => {
  // Grid-only file, spacing form: `domains.spacing.tokens` resolves to nothing.
  const result = P.applyFileConfig(SCHEMA, CURRENT, { collection: 'Tokens', domains: { grid: {} } });
  assert.equal(result.values.tokens, '["px"]');
  assert.ok(names(result.unchanged).includes('tokens'));
  assert.deepEqual(result.mismatches, []);
});

test('a value of the wrong type for its control is refused, and the rest still applies', () => {
  const result = P.applyFileConfig(SCHEMA, CURRENT, { collection: { not: 'a string' }, group: 'Space' });
  assert.equal(result.values.collectionName, 'Responsive System', 'refused');
  assert.equal(result.values.group, 'Space', 'and the rest of the load went through');
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.mismatches[0].name, 'collectionName');
});

test('a value equal to what is already there is not reported as a change', () => {
  const result = P.applyFileConfig(SCHEMA, CURRENT, { collection: 'Responsive System' });
  assert.deepEqual(result.changes, []);
  assert.ok(names(result.unchanged).includes('collectionName'));
});

test('applying the same payload twice is a no-op the second time', () => {
  const payload = { collection: 'Tokens', group: 'Space' };
  const first = P.applyFileConfig(SCHEMA, CURRENT, payload);
  const second = P.applyFileConfig(SCHEMA, first.values, payload);
  assert.deepEqual(second.values, first.values);
  assert.deepEqual(second.changes, []);
});

test('a list or object from the file lands as the text the control holds', () => {
  const result = P.applyFileConfig(SCHEMA, CURRENT, { domains: { spacing: { tokens: ['xs', 'sm'] } } });
  assert.equal(result.values.tokens, '["xs","sm"]');
  assert.ok(names(result.changes).includes('tokens'));
});

test('booleans and numbers keep their type rather than becoming text', () => {
  const schema = [
    { type: 'field', name: 'generateOverview', value: false, inputType: 'boolean', fromFile: 'domains.spacing.generateOverview' },
    { type: 'field', name: 'roundTo', value: 2, inputType: 'number', fromFile: 'domains.spacing.scaling.roundTo' }
  ];
  const result = P.applyFileConfig(schema, { generateOverview: false, roundTo: 2 }, {
    domains: { spacing: { generateOverview: true, scaling: { roundTo: 4 } } }
  });
  assert.strictEqual(result.values.generateOverview, true);
  assert.strictEqual(result.values.roundTo, 4);
});

test('a payload of null or nonsense changes nothing and does not throw', () => {
  for (const payload of [null, undefined, 'nope', 42, []]) {
    const result = P.applyFileConfig(SCHEMA, CURRENT, payload);
    assert.deepEqual(result.values, CURRENT, 'for ' + JSON.stringify(payload));
    assert.deepEqual(result.changes, []);
  }
});

test('the summary says where the values live, because they do not persist', () => {
  // DSF scripts are prebuilt: autoSaveCurrentScript bails unless type === 'user', so a loaded
  // config lives in the buffer and is discarded on the next script switch.
  const result = P.applyFileConfig(SCHEMA, CURRENT, { collection: 'Tokens' });
  assert.ok(/editor/.test(result.summary), result.summary);
});
