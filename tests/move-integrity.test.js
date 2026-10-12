const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { extractFunctionMap } = require('../src/import-resolver');
const functions = extractFunctionMap(fs.readFileSync(
  require.resolve('../scripts/EXAMPLE_SCRIPTS/Variables/merge-variable-collections.js'), 'utf8'));

function load(extra = {}) {
  const ctx = vm.createContext({ console, ...extra });
  for (const name of ['assertMoveSourceUnpublished', 'copyOrMoveVariables', 'assertMoveBindingsReplaced']) {
    vm.runInContext(functions.get(name), ctx);
  }
  return ctx;
}

test('Move refuses published, unknown, missing and failed publish checks before any copy', async () => {
  let copies = 0;
  const ctx = load({ buildModePairs: () => { copies++; return []; } });
  for (const sourceCol of [
    {}, { getPublishStatusAsync: async () => 'PUBLISHED' },
    { getPublishStatusAsync: async () => 'UNKNOWN' },
    { getPublishStatusAsync: async () => { throw new Error('offline'); } }
  ]) {
    await assert.rejects(ctx.copyOrMoveVariables({sourceCol, targetCol: {}, isMove:true}));
  }
  assert.equal(copies, 0);
});

test('a failed destination value write aborts Move without deleting the source', async () => {
  let removed = 0;
  const source = { id:'source-var', name:'radius', resolvedType:'FLOAT', valuesByMode:{s:16}, remove(){removed++;} };
  const ctx = load({
    figma: {variables:{getVariableByIdAsync:async()=>source}},
    buildModePairs: () => [{sourceModeId:'s',targetModeId:'t'}],
    variableInSourceGroup: () => true,
    destVariableName: () => 'radius',
    normalizeVariableName: s => s,
    findVariableByNameInCollection: async () => ({resolvedType:'FLOAT',setValueForMode(){throw new Error('write failed');}})
  });
  await assert.rejects(ctx.copyOrMoveVariables({
    sourceCol:{id:'source',variableIds:['source-var'],getPublishStatusAsync:async()=>'UNPUBLISHED'},
    targetCol:{id:'target'},isMove:true
  }), /Source variables were kept/);
  assert.equal(removed, 0);
});

test('residual check detects an unsupported binding instead of silently deleting its source', async () => {
  const ctx = load({
    figma:{root:{children:[]}},
    collectAllNodes:()=>[{boundVariables:{layoutGrids:[{type:'VARIABLE_ALIAS',id:'old'}]}}]
  });
  await assert.rejects(ctx.assertMoveBindingsReplaced({old:{id:'new'}}), /Some bindings still use/);
});

test('a collection created by the run gets the source modes, not its default mode plus them', () => {
  const ctx = vm.createContext({ console });
  for (const name of ['findModeByName', 'ensureTargetMode', 'buildModePairs']) {
    vm.runInContext(functions.get(name), ctx);
  }
  const source = { modes: [{ modeId: 's1', name: 'Light' }, { modeId: 's2', name: 'Dark' }] };
  const target = {
    modes: [{ modeId: 't1', name: 'Mode 1' }],
    renameMode(id, name) { this.modes.find(m => m.modeId === id).name = name; },
    addMode(name) { const modeId = 't' + (this.modes.length + 1); this.modes.push({ modeId, name }); return modeId; }
  };
  const pairs = ctx.buildModePairs(source, target, '', '', { placeholderModeId: 't1' });
  assert.deepEqual(target.modes.map(m => m.name), ['Light', 'Dark']);
  assert.equal(pairs.map(p => p.targetModeId).join(), 't1,t2');
});

test('an existing target keeps its modes and only gains the missing ones', () => {
  const ctx = vm.createContext({ console });
  for (const name of ['findModeByName', 'ensureTargetMode', 'buildModePairs']) {
    vm.runInContext(functions.get(name), ctx);
  }
  const source = { modes: [{ modeId: 's1', name: 'Light' }] };
  const target = {
    modes: [{ modeId: 't1', name: 'Mode 1' }],
    renameMode() { throw new Error('must not rename'); },
    addMode(name) { this.modes.push({ modeId: 't2', name }); return 't2'; }
  };
  ctx.buildModePairs(source, target, '', '', { placeholderModeId: null });
  assert.deepEqual(target.modes.map(m => m.name), ['Mode 1', 'Light']);
});
