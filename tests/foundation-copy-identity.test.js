/**
 * Pure plan for Copy / Move stamp identity (`planCopyMoveSetIdentity` in @foundation.js).
 * Copy mints; full Move keeps set id; partial Move mints the moved portion.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const resolver = require('../src/import-resolver.js');

const FOUNDATION = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js');

const NEEDED = [
  'foundationSetKey',
  'foundationWarning',
  'namePrefix',
  'deriveSetGroup',
  'planCopyMoveSetIdentity'
];

function load() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math,
    String,
    Array,
    Object,
    JSON,
    Date,
    isNaN,
    isFinite
  };
  vm.createContext(ctx);
  const map = resolver.extractFunctionMap(fs.readFileSync(FOUNDATION, 'utf8'));
  for (const name of NEEDED) {
    const code = map.get(name);
    assert.ok(code, `${name} is not extractable from @foundation.js`);
    vm.runInContext(code, ctx);
  }
  return ctx;
}

const { planCopyMoveSetIdentity } = load();

function stamp(domain, set, token, rev) {
  return { domain, set, token, rev: rev == null ? 1 : rev };
}

function manifest(id, domain, group) {
  return {
    key: 'set:' + domain + ':' + id,
    id,
    domain,
    group,
    modes: ['Mobile'],
    modeIds: { mobile: 'm1' },
    tokens: ['xs', 'sm'],
    config: { base: 4 }
  };
}

test('Copy mints a new set id and only stamps newly created dests', () => {
  const planned = planCopyMoveSetIdentity(
    [
      {
        sourceStamp: stamp('spacing', 'abc', 'xs'),
        destName: 'Spacing/xs',
        destCreated: true,
        destRef: 'new-v1'
      },
      {
        sourceStamp: stamp('spacing', 'abc', 'sm'),
        destName: 'Spacing/sm',
        destCreated: false,
        destRef: 'existing'
      }
    ],
    { abc: manifest('abc', 'spacing', 'Spacing') },
    false
  );
  assert.equal(planned.actions.length, 1);
  assert.equal(planned.actions[0].mint, true);
  assert.equal(planned.actions[0].newSetId, '');
  assert.equal(planned.actions[0].oldSetId, 'abc');
  assert.equal(planned.actions[0].stampTargets.length, 1);
  assert.equal(planned.actions[0].stampTargets[0].destRef, 'new-v1');
  assert.equal(planned.actions[0].targetGroup, 'Spacing');
});

test('full Move keeps the set id', () => {
  const planned = planCopyMoveSetIdentity(
    [
      {
        sourceStamp: stamp('spacing', 'abc', 'xs'),
        destName: 'Brand/xs',
        destCreated: true,
        destRef: 'moved-v1'
      },
      {
        sourceStamp: stamp('spacing', 'abc', 'sm'),
        destName: 'Brand/sm',
        destCreated: true,
        destRef: 'moved-v2'
      }
    ],
    { abc: manifest('abc', 'spacing', 'Spacing') },
    true
  );
  assert.equal(planned.actions.length, 1);
  assert.equal(planned.actions[0].mint, false);
  assert.equal(planned.actions[0].newSetId, 'abc');
  assert.equal(planned.actions[0].targetGroup, 'Brand');
  assert.equal(planned.actions[0].stampTargets.length, 2);
});

test('partial Move mints for the moved portion', () => {
  const planned = planCopyMoveSetIdentity(
    [
      {
        sourceStamp: stamp('spacing', 'abc', 'xs'),
        destName: 'Other/xs',
        destCreated: true,
        destRef: 'partial'
      }
    ],
    { abc: manifest('abc', 'spacing', 'Spacing') },
    true,
    { abc: true }
  );
  assert.equal(planned.actions.length, 1);
  assert.equal(planned.actions[0].mint, true);
  assert.equal(planned.actions[0].newSetId, '');
});

test('unstamped transfers and stamps without a source manifest are ignored', () => {
  const planned = planCopyMoveSetIdentity(
    [
      { sourceStamp: null, destName: 'A/x', destCreated: true },
      { sourceStamp: stamp('spacing', 'ghost', 'xs'), destName: 'A/xs', destCreated: true }
    ],
    {},
    false
  );
  assert.deepEqual(planned.actions, []);
});
