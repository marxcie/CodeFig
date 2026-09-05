const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { extractFunctions } = require('../src/import-resolver');

test('a suite holds the run open while an async case is awaiting Figma', async () => {
  let pending = 0, completed = false, release;
  const window = {
    _infoPanelHandler: msg => { pending += msg.type === 'CODEFIG_RUN_OP_BEGIN' ? 1 : -1; },
    codefigRunComplete: () => { completed = true; }
  };
  const ctx = vm.createContext({window, figma:{root:{name:'codefig-test'}}, console:{log(){},error(){}}});
  const source = fs.readFileSync(require.resolve('../scripts/CODEFIG_LIBRARIES/@test-harness.js'), 'utf8');
  vm.runInContext(extractFunctions(source, ['testBegin','it','testFinish']), ctx);
  ctx.testBegin('async');
  const work = ctx.it('waits', () => new Promise(resolve => { release = resolve; }));
  assert.equal(pending, 1);
  assert.equal(completed, false);
  release(); await work;
  const summary = ctx.testFinish();
  assert.equal(summary.pass, 1);
  assert.equal(pending, 0);
  assert.equal(completed, true);
});

test('testFinish is idempotent for the run-op counter', async () => {
  let pending = 0;
  const window = {
    _infoPanelHandler: msg => { pending += msg.type === 'CODEFIG_RUN_OP_BEGIN' ? 1 : -1; },
    codefigRunComplete: () => {}
  };
  const ctx = vm.createContext({window, figma:{root:{name:'codefig-test'}}, console:{log(){},error(){}}});
  const source = fs.readFileSync(require.resolve('../scripts/CODEFIG_LIBRARIES/@test-harness.js'), 'utf8');
  vm.runInContext(extractFunctions(source, ['testBegin','testFinish']), ctx);
  ctx.testBegin('once');
  assert.equal(pending, 1);
  ctx.testFinish();
  ctx.testFinish();
  assert.equal(pending, 0);
});
