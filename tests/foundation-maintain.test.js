/**
 * Fixture tests for src/foundation-maintain.js — pure plan decisions for clear-case
 * foundation plugin-data repair (plan 39) and ambiguous-set-groups fork (DEFERRED §11).
 *
 * The Figma apply path (getLocalVariableCollectionsAsync, setSharedPluginData) is exercised
 * only inside the plugin; see scripts/_TESTS/_tests-foundation-maintain.js for a live skeleton.
 */
const test = require('node:test');
const assert = require('node:assert');
const maintain = require('../src/foundation-maintain.js');

const {
  planFoundationMaintenance,
  planIsEmpty,
  looksLikeFigmaCopySuffix,
  pickKeepGroupForAmbiguousSet
} = maintain;

function stamp(variableId, domain, set, token, name) {
  return { variableId, domain, set, token, name };
}

test('registry viewport with no matching mode is removed', () => {
  const plan = planFoundationMaintenance({
    registry: {
      v: 1,
      viewports: [
        { key: 'mobile', label: 'Mobile', width: 375 },
        { key: 'ghost', label: 'Ghost', width: 999 }
      ]
    },
    modes: [{ name: 'Mobile' }],
    collections: []
  });
  assert.deepEqual(plan.removeRegistryKeys, ['ghost']);
  assert.equal(plan.keepRegistryViewports.length, 1);
  assert.equal(plan.keepRegistryViewports[0].key, 'mobile');
});

test('registry viewport matches mode by key slug', () => {
  const plan = planFoundationMaintenance({
    registry: {
      v: 1,
      viewports: [{ key: 'extra-wide', label: 'Extra Wide', width: 1600 }]
    },
    modes: [{ name: 'Extra Wide' }],
    collections: []
  });
  assert.deepEqual(plan.removeRegistryKeys, []);
  assert.equal(plan.keepRegistryViewports.length, 1);
});

test('manifest with no stamped tokens for its set id is deleted', () => {
  const plan = planFoundationMaintenance({
    registry: null,
    modes: [],
    collections: [
      {
        id: 'col1',
        name: 'Spacing',
        manifests: [{ key: 'set:spacing:abc', id: 'abc', domain: 'spacing' }],
        stamps: []
      }
    ]
  });
  assert.equal(plan.deleteManifestKeys.length, 1);
  assert.equal(plan.deleteManifestKeys[0].key, 'set:spacing:abc');
  assert.equal(plan.deleteManifestKeys[0].setId, 'abc');
});

test('manifest kept when at least one stamp still claims the set id', () => {
  const plan = planFoundationMaintenance({
    registry: null,
    modes: [],
    collections: [
      {
        id: 'col1',
        name: 'Spacing',
        manifests: [{ key: 'set:spacing:abc', id: 'abc', domain: 'spacing' }],
        stamps: [stamp('v1', 'spacing', 'abc', 'xs', 'Spacing/xs')]
      }
    ]
  });
  assert.deepEqual(plan.deleteManifestKeys, []);
  assert.deepEqual(plan.clearStamps, []);
});

test('stamp with set id and no matching manifest is cleared', () => {
  const plan = planFoundationMaintenance({
    registry: null,
    modes: [],
    collections: [
      {
        id: 'col1',
        name: 'Spacing',
        manifests: [],
        stamps: [stamp('v1', 'spacing', 'orphan-set', 'xs', 'Spacing/xs')]
      }
    ]
  });
  assert.equal(plan.clearStamps.length, 1);
  assert.equal(plan.clearStamps[0].variableId, 'v1');
  assert.equal(plan.clearStamps[0].reason, 'no-manifest');
});

test('legacy stamp without set id is left alone', () => {
  const plan = planFoundationMaintenance({
    registry: null,
    modes: [],
    collections: [
      {
        id: 'col1',
        name: 'Spacing',
        manifests: [],
        stamps: [stamp('v1', 'spacing', '', 'xs', 'Spacing/xs')]
      }
    ]
  });
  assert.deepEqual(plan.clearStamps, []);
  assert.deepEqual(plan.deleteManifestKeys, []);
});

test('looksLikeFigmaCopySuffix recognises numbered and Copy suffixes', () => {
  assert.equal(looksLikeFigmaCopySuffix('probe-group 2'), true);
  assert.equal(looksLikeFigmaCopySuffix('probe-group 12'), true);
  assert.equal(looksLikeFigmaCopySuffix('probe-group Copy'), true);
  assert.equal(looksLikeFigmaCopySuffix('probe-group copy'), true);
  assert.equal(looksLikeFigmaCopySuffix('probe-group'), false);
  assert.equal(looksLikeFigmaCopySuffix('color-2'), false);
});

test('pickKeepGroup prefers manifest group, else unique non-copy name', () => {
  assert.equal(
    pickKeepGroupForAmbiguousSet(['probe-group', 'probe-group 2'], 'probe-group'),
    'probe-group'
  );
  assert.equal(
    pickKeepGroupForAmbiguousSet(['probe-group 2', 'probe-group'], 'missing'),
    'probe-group'
  );
  assert.equal(
    pickKeepGroupForAmbiguousSet(['a 2', 'b 2'], ''),
    null
  );
  assert.equal(
    pickKeepGroupForAmbiguousSet(['alpha', 'beta'], ''),
    null
  );
});

test('two groups claiming one set id: fork the copy, keep the original', () => {
  const plan = planFoundationMaintenance({
    registry: null,
    modes: [],
    collections: [
      {
        id: 'col1',
        name: 'Spacing',
        manifests: [
          { key: 'set:spacing:shared', id: 'shared', domain: 'spacing', group: 'probe-group' }
        ],
        stamps: [
          stamp('v1', 'spacing', 'shared', 'xs', 'probe-group/xs'),
          stamp('v2', 'spacing', 'shared', 'xs', 'probe-group 2/xs')
        ]
      }
    ]
  });
  assert.deepEqual(plan.deleteManifestKeys, []);
  assert.deepEqual(plan.clearStamps, []);
  assert.deepEqual(plan.skippedAmbiguous, []);
  assert.equal(plan.forkSetGroups.length, 1);
  const job = plan.forkSetGroups[0];
  assert.equal(job.keepGroup, 'probe-group');
  assert.equal(job.oldSetId, 'shared');
  assert.equal(job.forks.length, 1);
  assert.equal(job.forks[0].group, 'probe-group 2');
  assert.ok(job.forks[0].newSetId);
  assert.notEqual(job.forks[0].newSetId, 'shared');
  assert.deepEqual(job.forks[0].stamps.map((s) => s.variableId), ['v2']);
  assert.equal(planIsEmpty(plan), false);
});

test('two groups claiming one set id with no clear original is still skipped', () => {
  const plan = planFoundationMaintenance({
    registry: null,
    modes: [],
    collections: [
      {
        id: 'col1',
        name: 'Spacing',
        manifests: [{ key: 'set:spacing:shared', id: 'shared', domain: 'spacing', group: '' }],
        stamps: [
          stamp('v1', 'spacing', 'shared', 'xs', 'alpha/xs'),
          stamp('v2', 'spacing', 'shared', 'xs', 'beta/xs')
        ]
      }
    ]
  });
  assert.equal(plan.forkSetGroups.length, 0);
  assert.equal(plan.skippedAmbiguous.length, 1);
  assert.equal(plan.skippedAmbiguous[0].code, 'ambiguous-set-groups');
});

test('set id derived from key when manifest blob has no id', () => {
  const plan = planFoundationMaintenance({
    registry: null,
    modes: [],
    collections: [
      {
        id: 'col1',
        name: 'Spacing',
        manifests: [{ key: 'set:spacing:legacy-key', id: '', domain: 'spacing' }],
        stamps: []
      }
    ]
  });
  assert.equal(plan.deleteManifestKeys.length, 1);
  assert.equal(plan.deleteManifestKeys[0].setId, 'legacy-key');
});

test('planIsEmpty ignores ambiguous skips but not forks', () => {
  const empty = planFoundationMaintenance({
    registry: null,
    modes: [],
    collections: []
  });
  assert.equal(planIsEmpty(empty), true);

  const withWork = planFoundationMaintenance({
    registry: {
      v: 1,
      viewports: [{ key: 'gone', label: 'Gone', width: 1 }]
    },
    modes: [],
    collections: []
  });
  assert.equal(planIsEmpty(withWork), false);
});

test('collection deleted outside CodeFig: modes gone → registry viewport pruned', () => {
  // Case 4 in the plan: collection node (and its modes) are already gone; only registry remains.
  const plan = planFoundationMaintenance({
    registry: {
      v: 1,
      viewports: [
        { key: 'mobile', label: 'Mobile', width: 375 },
        { key: 'desktop', label: 'Desktop', width: 1920 }
      ]
    },
    modes: [], // no local collections left with modes
    collections: []
  });
  assert.deepEqual(plan.removeRegistryKeys.sort(), ['desktop', 'mobile']);
  assert.deepEqual(plan.keepRegistryViewports, []);
});
