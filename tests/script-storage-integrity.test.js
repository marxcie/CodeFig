const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const S = require('../src/script-storage');
const { extractFunctionMap } = require('../src/import-resolver');

function maps(plan) {
  return {
    values: Object.fromEntries(plan.variables.map(v => [v.key, v.value])),
    descriptions: Object.fromEntries(plan.variables.map(v => [v.key, v.description]))
  };
}
function plan(name, id = 'one', code = 'abcdef') {
  return S.planScriptWrite({ name, id, code, limit: 3 });
}

test('sanitized names round-trip and cannot overwrite a distinct script', () => {
  const first = plan('Theme.v1');
  const m = maps(first);
  assert.equal(S.listScriptsFromValues(m.values, m.descriptions).listItems[0].name, 'Theme.v1');
  assert.throws(() => S.assertScriptWritesSafe(plan('Theme-v1', 'two').variables, m.values, m.descriptions), /already used/);
  S.assertScriptWritesSafe(plan('Theme.v1').variables, m.values, m.descriptions);
  assert.throws(() => S.assertScriptWritesSafe(first.variables.concat(plan('Theme-v1', 'two').variables), {}, {}), /already used/);
});

test('reserved storage paths are refused before creating unreadable scripts', () => {
  for (const name of ['@index', '@script/Hello', '@lib/Hello', 'Tools/~1', 'Tools/~2/Hello']) {
    assert.throws(() => plan(name), /reserved/);
  }
  assert.equal(plan('@Useful library').entry.name, '@Useful library');
});

test('missing or foreign chunks stay out of inventory so a complete backup can surface', () => {
  for (const corrupt of ['missing', 'foreign', 'empty', 'count']) {
    const m = maps(plan('Big'));
    if (corrupt === 'missing') delete m.values['Big/~1'];
    if (corrupt === 'count') m.descriptions.Big = 'codefig-id:one;parts:1e99;i:0';
    if (corrupt === 'empty') m.values['Big/~1'] = '';
    if (corrupt === 'foreign') m.descriptions['Big/~1'] = S.serializeScriptDescription({ id: 'other', parts: 2, i: 1 });
    const listed = S.listScriptsFromValues(m.values, m.descriptions);
    assert.equal(listed.listItems.length, 0);
    assert.equal(listed.scripts.length, 1, 'keep identity available for explicit repair');
    assert.match(listed.errors[0], /incomplete/);
    const merged = S.mergeScriptInventory(listed.listItems, [{name:'Big',code:'complete backup'}], []);
    assert.equal(merged[0].code, 'complete backup');
  }
});

test('legacy migration refuses a collision without discarding its index', () => {
  const entries = [{id:'a',name:'A.B',chunkKeys:['old-a']},{id:'b',name:'A-B',chunkKeys:['old-b']}];
  assert.throws(() => S.planLegacyIndexToPathMigration(entries, {'old-a':'one','old-b':'two'}), /two names/);
});

test('backend batch writer checks every path before its first mutation', async () => {
  const compiled = ts.transpileModule(fs.readFileSync(require.resolve('../src/code.ts'), 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2017}}).outputText;
  const functions = extractFunctionMap(compiled);
  let mutations = 0;
  const existing = maps(plan('Theme.v1'));
  const context = vm.createContext({
    valueMapFromCollection: () => existing.values,
    descriptionMapFromCollection: () => existing.descriptions,
    setStringVariableValue: async () => { mutations++; },
    clearOrphanedChunkValues: async () => { mutations++; }
  });
  vm.runInContext(functions.get('writeScriptVariables'), context);
  await assert.rejects(context.writeScriptVariables(S, {}, new Map(), 'mode',
    plan('New').variables.concat(plan('Theme-v1', 'two').variables), []), /already used/);
  assert.equal(mutations, 0);
});
