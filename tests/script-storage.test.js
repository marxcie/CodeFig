/**
 * Fixture tests for src/script-storage.js — path-named envelopes + legacy migrate.
 */
const test = require('node:test');
const assert = require('node:assert');

const S = require('../src/script-storage.js');

test('locked defaults: collection, chunk limit, empty scopes', () => {
  assert.equal(S.COLLECTION_NAME, 'CodeFig Scripts');
  assert.equal(S.INDEX_VARIABLE, '@index');
  assert.equal(S.CHUNK_CHAR_LIMIT, 90000);
  assert.equal(S.ENVELOPE_VERSION, 2);
  assert.deepEqual(S.SCRIPT_VARIABLE_SCOPES, []);
});

test('displayNameToVariablePath mirrors CodeFig groups', () => {
  assert.equal(
    S.displayNameToVariablePath('Custom scripts / Scale to print'),
    'Custom scripts/Scale to print'
  );
  assert.equal(S.displayNameToVariablePath('Scale to print'), 'Scale to print');
  assert.equal(
    S.displayNameToVariablePath('A / B / C'),
    'A/B/C'
  );
  // Figma-forbidden characters stripped from segments
  assert.equal(
    S.displayNameToVariablePath('Weird.Name / foo{bar}'),
    'Weird-Name/foo-bar'
  );
});

test('variablePathToDisplayName round-trips the slash form', () => {
  assert.equal(
    S.variablePathToDisplayName('Custom scripts/Scale to print'),
    'Custom scripts / Scale to print'
  );
  assert.equal(S.variablePathToDisplayName('Scale to print'), 'Scale to print');
  assert.equal(
    S.variablePathToDisplayName('Custom scripts/Scale to print/~2'),
    'Custom scripts / Scale to print'
  );
});

test('continuation paths', () => {
  assert.equal(S.isContinuationPath('A/B/~1'), true);
  assert.equal(S.isContinuationPath('A/B'), false);
  assert.equal(S.continuationPath('A/B', 1), 'A/B/~1');
  assert.equal(S.primaryVariablePath('A/B/~3'), 'A/B');
});

test('planScriptWrite: path + envelope, id inside the string', () => {
  const { entry, variables } = S.planScriptWrite({
    id: 's-abc',
    name: 'Custom scripts / Scale to print',
    code: 'hello()',
    type: 'user'
  });
  assert.equal(entry.path, 'Custom scripts/Scale to print');
  assert.deepEqual(entry.chunkKeys, ['Custom scripts/Scale to print']);
  assert.equal(variables.length, 1);
  assert.equal(variables[0].key, 'Custom scripts/Scale to print');
  const env = S.parseEnvelope(variables[0].value);
  assert.equal(env.id, 's-abc');
  assert.equal(env.code, 'hello()');
  assert.equal(env.v, 2);
});

test('planScriptWrite multi-chunk + listScriptsFromValues', () => {
  const { entry, variables } = S.planScriptWrite({
    id: 'big',
    name: 'Big',
    code: 'abcdefghij',
    limit: 4
  });
  assert.ok(entry.chunkKeys.length >= 2);
  assert.equal(entry.chunkKeys[0], 'Big');
  assert.equal(entry.chunkKeys[1], 'Big/~1');
  const map = Object.create(null);
  for (const v of variables) map[v.key] = v.value;
  const listed = S.listScriptsFromValues(map);
  assert.equal(listed.listItems.length, 1);
  assert.equal(listed.listItems[0].name, 'Big');
  assert.equal(listed.listItems[0].code, 'abcdefghij');
  assert.equal(listed.scripts[0].id, 'big');
});

test('listScriptsFromValues skips legacy @index / @script and empty values', () => {
  const map = {
    '@index': '{"v":1,"scripts":[]}',
    '@script/s-old/0': 'legacy',
    'Keep me': S.serializeEnvelope({ id: 'k1', code: 'ok', type: 'user' }),
    'Keep me/~1': '', // empty continuation ignored when parts=1
    '': ''
  };
  const listed = S.listScriptsFromValues(map);
  assert.equal(listed.listItems.length, 1);
  assert.equal(listed.listItems[0].name, 'Keep me');
  assert.equal(listed.listItems[0].code, 'ok');
});

test('planLegacyIndexToPathMigration rewrites @script keys into paths', () => {
  const index = [
    {
      id: 's1',
      name: 'Custom scripts / Scale to print',
      type: 'user',
      chunkKeys: ['@script/s1/0']
    }
  ];
  const values = { '@script/s1/0': 'console.log(1)' };
  const planned = S.planLegacyIndexToPathMigration(index, values);
  assert.equal(planned.count, 1);
  assert.equal(planned.writes[0].variables[0].key, 'Custom scripts/Scale to print');
  const env = S.parseEnvelope(planned.writes[0].variables[0].value);
  assert.equal(env.code, 'console.log(1)');
  assert.equal(env.id, 's1');
  assert.ok(planned.orphanedKeys.indexOf('@script/s1/0') !== -1);
  assert.ok(planned.orphanedKeys.indexOf('@index') !== -1);
});

test('chunkBody / joinChunks still work', () => {
  assert.deepEqual(S.chunkBody('abcdef', 3), ['abc', 'def']);
  assert.equal(S.joinChunks(['a', 'b']), 'ab');
});

test('export blob unchanged', () => {
  const one = S.parseExportBlob({ name: 'Foo', code: 'x', type: 'user' });
  assert.deepEqual(one.scripts, [{ name: 'Foo', code: 'x', type: 'user' }]);
});

test('shouldMigrateFromClient / planClientStorageMigration use paths', () => {
  assert.equal(S.shouldMigrateFromClient([], [{ name: 'A', code: '1' }]), true);
  assert.equal(
    S.shouldMigrateFromClient(
      [{ id: '1', name: 'A', type: 'user', chunkKeys: ['A'], path: 'A' }],
      [{ name: 'B', code: '2' }]
    ),
    false
  );
  const planned = S.planClientStorageMigration(
    [{ name: 'Custom scripts / Foo', code: 'aaa' }],
    () => 'id-1'
  );
  assert.equal(planned.count, 1);
  assert.equal(planned.writes[0].variables[0].key, 'Custom scripts/Foo');
  assert.equal(S.parseEnvelope(planned.writes[0].variables[0].value).id, 'id-1');
});

test('planParallelSync gap-fills both ways without overwriting', () => {
  const vars = [
    { name: 'Scale to print', code: 'from-var', type: 'user' },
    { name: 'Only in vars', code: 'v-only', type: 'user' }
  ];
  const client = [
    { name: 'Scale to print', code: 'from-client', type: 'user' },
    { name: 'Distribute spacing', code: 'client-extra', type: 'user' }
  ];
  const planned = S.planParallelSync(vars, client, () => 'new-id');
  assert.equal(planned.toVariablesCount, 1);
  assert.equal(planned.toVariables[0].name, 'Distribute spacing');
  assert.equal(planned.writes[0].variables[0].key, 'Distribute spacing');
  assert.equal(planned.toClientCount, 1);
  assert.equal(planned.toClient[0].name, 'Only in vars');
  assert.equal(planned.toClient[0].code, 'v-only');
  // Existing name on both sides is left alone (no overwrite).
  assert.ok(!planned.toVariables.some((s) => s.name === 'Scale to print'));
  assert.ok(!planned.toClient.some((s) => s.name === 'Scale to print'));
});

test('shouldParallelSync', () => {
  assert.equal(S.shouldParallelSync([], [{ name: 'A', code: '1' }]), true);
  assert.equal(
    S.shouldParallelSync(
      [{ name: 'A', code: '1', type: 'user' }],
      [{ name: 'A', code: '1', type: 'user' }]
    ),
    false
  );
});

test('mergeScriptsByName unchanged', () => {
  assert.deepEqual(
    S.mergeScriptsByName(
      [{ name: 'A', code: 'v', type: 'user' },],
      [{ name: 'A', code: 'c', type: 'user' }, { name: 'B', code: 'b', type: 'user' }]
    ),
    [
      { name: 'A', code: 'v', type: 'user' },
      { name: 'B', code: 'b', type: 'user' }
    ]
  );
});

test('listRemoteScriptStubs groups continuations without values', () => {
  const stubs = S.listRemoteScriptStubs(
    [
      { name: 'Custom scripts/Scale to print', key: 'k0', resolvedType: 'STRING' },
      { name: 'Custom scripts/Scale to print/~1', key: 'k1', resolvedType: 'STRING' },
      { name: 'Ignore me', key: 'k2', resolvedType: 'FLOAT' },
      { name: '@index', key: 'k3', resolvedType: 'STRING' }
    ],
    'Team DS',
    'col-key'
  );
  assert.equal(stubs.length, 1);
  assert.equal(stubs[0].name, 'Custom scripts / Scale to print');
  assert.equal(stubs[0].origin, 'remote');
  assert.equal(stubs[0].libraryName, 'Team DS');
  assert.equal(stubs[0].storageId, 'remote:Team DS:Custom scripts / Scale to print');
  assert.equal(stubs[0].code, '');
  assert.equal(stubs[0].remote.variables.length, 2);
  assert.equal(stubs[0].remote.collectionKey, 'col-key');
});

test('mergeScriptInventory prefers local, skips remote duplicate names', () => {
  const merged = S.mergeScriptInventory(
    [{ name: 'Scale to print', code: 'local', type: 'user' }],
    [{ name: 'Only client', code: 'c', type: 'user' }],
    [
      {
        name: 'Scale to print',
        code: '',
        type: 'user',
        origin: 'remote',
        libraryName: 'Lib',
        storageId: 'remote:Lib:Scale to print',
        remote: { collectionKey: 'x', libraryName: 'Lib', variables: [] }
      },
      {
        name: 'From lib',
        code: '',
        type: 'user',
        origin: 'remote',
        libraryName: 'Lib',
        storageId: 'remote:Lib:From lib',
        remote: { collectionKey: 'x', libraryName: 'Lib', variables: [] }
      }
    ]
  );
  assert.equal(merged.length, 3);
  assert.equal(merged[0].name, 'Scale to print');
  assert.equal(merged[0].origin, 'local');
  assert.equal(merged[0].code, 'local');
  assert.equal(merged[1].name, 'Only client');
  assert.equal(merged[1].origin, 'client');
  assert.equal(merged[2].name, 'From lib');
  assert.equal(merged[2].origin, 'remote');
  assert.equal(merged[2].libraryName, 'Lib');
});

test('mintScriptId is path-safe kebab', () => {
  assert.match(S.mintScriptId(), /^[a-z0-9-]+$/);
});

test('orphanedKeysFor', () => {
  assert.deepEqual(S.orphanedKeysFor(['A', 'A/~1'], ['A']), ['A/~1']);
  assert.deepEqual(S.orphanedKeysFor(['Old'], ['New']), ['Old']);
});
