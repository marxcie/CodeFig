/**
 * Fixture tests for the plan/apply split in scripts/EXAMPLE_SCRIPTS/rename-variables.js.
 *
 * The wrinkle rename-styles does not have: a variable name is only unique **within its
 * collection**, so both the rows and the collision check work on the qualified
 * `Collection/group/name` path. Get that wrong and the preview either invents collisions
 * between unrelated collections or misses real ones.
 *
 * Collections and variables are plain objects here; the planner never calls the Figma API.
 * The apply half does (getVariable), and is covered by scripts/_TESTS/.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');

const SCRIPTS = path.join(__dirname, '..', 'scripts');

function loadPlanner() {
  const read = (rel) => fs.readFileSync(path.join(SCRIPTS, rel), 'utf8');
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, String, Array, Object, JSON };
  vm.createContext(ctx);
  const sources = [
    ['CODEFIG_LIBRARIES/@pattern-matching.js', ['escapeWildcards', 'applyFigmaPlaceholders', 'patternMode', 'patternToRegex', 'nameMatches', 'renameByPattern']],
    ['CODEFIG_LIBRARIES/@rename-preview.js', ['previewRow', 'flagPreviewCollisions', 'previewCounts']],
    ['EXAMPLE_SCRIPTS/rename-variables.js', ['getMatchOpts', 'getScope', 'normalizeScopeSeparator', 'getScopePath', 'scopeMatchesSearchIn', 'toRenameOperations', 'applyOperationsToName', 'planRenameVariables', 'existingVariableNames']]
  ];
  for (const [rel, names] of sources) {
    const map = resolver.extractFunctionMap(read(rel));
    for (const name of names) {
      const code = map.get(name);
      assert.ok(code, `${name} is not extractable from ${rel}`);
      vm.runInContext(code, ctx);
    }
  }
  return ctx;
}

const lib = loadPlanner();
const { planRenameVariables, existingVariableNames, toRenameOperations, flagPreviewCollisions } = lib;

function item(collectionName, collectionId, variableName) {
  return {
    collection: { id: collectionId, name: collectionName },
    variable: { id: 'var:' + collectionId + ':' + variableName, name: variableName }
  };
}

const op = (find, replace) => toRenameOperations(null, find, replace);

test('rows are the qualified path, not the bare variable name', () => {
  const items = [item('Typography', 'c1', 'Body/Size')];
  const entries = planRenameVariables(items, op('Size', 'Scale'), false);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].row.from, 'Typography/Body/Size');
  assert.equal(entries[0].row.to, 'Typography/Body/Scale');
  assert.equal(entries[0].newName, 'Body/Scale', 'the rename itself is the unqualified name');
});

test('planning changes nothing', () => {
  const items = [item('Typography', 'c1', 'Body/Size')];
  planRenameVariables(items, op('Size', 'Scale'), false);
  assert.equal(items[0].variable.name, 'Body/Size');
  assert.equal(items[0].collection.name, 'Typography');
});

test('the same name in two collections is not a collision', () => {
  // The thing an unqualified check would get wrong.
  const items = [item('Light', 'c1', 'red/500'), item('Dark', 'c2', 'red/600')];
  const entries = planRenameVariables(items, op('600', '500'), false);
  const rows = entries.map((e) => e.row);
  flagPreviewCollisions(rows, existingVariableNames(items));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].to, 'Dark/red/500');
  assert.deepEqual(rows[0].flags, [], 'Light/red/500 exists, but that is a different collection');
});

test('a real collision inside one collection is flagged', () => {
  const items = [item('Light', 'c1', 'red/500'), item('Light', 'c1', 'red/600')];
  const entries = planRenameVariables(items, op('600', '500'), false);
  const rows = entries.map((e) => e.row);
  flagPreviewCollisions(rows, existingVariableNames(items));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].flags.includes('collision'), 'Light/red/500 is taken, in this collection');
});

test('collection renames are planned only when the scope is everything', () => {
  const items = [item('V4 Tokens', 'c1', 'red/500')];
  const scoped = planRenameVariables(items, op('V4', 'V5'), false);
  assert.deepEqual(scoped.map((e) => e.kind), [], 'searchIn set: the collection name is left alone');

  const all = planRenameVariables(items, op('V4', 'V5'), true);
  assert.deepEqual(all.map((e) => e.kind), ['collection'], 'only the collection name matched');
  assert.equal(all[0].row.from, 'V4 Tokens');
  assert.equal(all[0].row.to, 'V5 Tokens');
});

test('a collection is planned once even when it holds many variables', () => {
  const items = [item('V4', 'c1', 'a'), item('V4', 'c1', 'b'), item('V4', 'c1', 'c')];
  const entries = planRenameVariables(items, op('V4', 'V5'), true);
  assert.equal(entries.filter((e) => e.kind === 'collection').length, 1);
});

test('only matched variables enter the plan', () => {
  const items = [item('T', 'c1', 'Body/Size'), item('T', 'c1', 'Heading/Weight')];
  const entries = planRenameVariables(items, op('Size', 'Scale'), false);
  assert.deepEqual(entries.map((e) => e.row.from), ['T/Body/Size']);
});

test('a match that changes nothing is planned as unchanged, not dropped', () => {
  const items = [item('T', 'c1', 'Body/Size')];
  const entries = planRenameVariables(items, op('Size', 'Size'), false);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].row.flags, ['unchanged']);
});

test('a replacement that would empty the name is flagged', () => {
  const items = [item('T', 'c1', 'Body')];
  const entries = planRenameVariables(items, op('*', ''), false);
  assert.deepEqual(entries[0].row.flags, ['empty']);
  assert.equal(entries[0].row.changed, false);
});

test('batch operations chain, as they really apply', () => {
  const items = [item('T', 'c1', 'LG'), item('T', 'c1', 'MD')];
  const entries = planRenameVariables(items, toRenameOperations([['LG', 'XL'], ['MD', 'LG']], '', ''), false);
  const to = {};
  entries.forEach((e) => { to[e.row.from] = e.newName; });
  assert.equal(to['T/LG'], 'XL');
  assert.equal(to['T/MD'], 'LG', 'MD lands on LG and is not carried on into XL');
});

test('existing names cover both variables and collection names', () => {
  const items = [item('Typography', 'c1', 'Body/Size')];
  const names = existingVariableNames(items);
  assert.ok(names.includes('Typography/Body/Size'));
  assert.ok(names.includes('Typography'), 'so a collection rename can collide too');
});

test('the separator is normalised on both sides of the scope check', () => {
  // The plan-10 fix, still holding through the planner: both spellings scope the same way.
  const items = [item('Typography', 'c1', 'Body/Size')];
  assert.equal(lib.scopeMatchesSearchIn(lib.getScopePath(items[0].collection, items[0].variable), 'Typography/Body', {}), true);
  assert.equal(lib.scopeMatchesSearchIn(lib.getScopePath(items[0].collection, items[0].variable), 'Typography / Body', {}), true);
});
