/**
 * Fixture tests for mode planning in scripts/CODEFIG_LIBRARIES/@variables.js.
 *
 * The failure this pins is silent and destructive: `setupModes` used to remove every mode
 * it did not recognise, and the four Design System Foundations scripts share one collection
 * while each carries its own list of viewport names. Running one deleted another's modes —
 * and every value stored in them. Nothing in Figma reports that; you notice a month later.
 *
 * `planModes` is pure on purpose, so the rule "nothing is ever removed" is testable here
 * rather than only in a file you have to remember to check. `setupModes` is driven against a
 * fake collection with the same surface Figma's `VariableCollection` exposes to it, which is
 * enough to prove it applies the plan and nothing else. Real modes, real mode budgets and
 * real value storage live in scripts/_TESTS/_tests-foundation-modes.js.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');

const VARIABLES = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@variables.js');

function loadModeFunctions() {
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, String, Array, Object, JSON };
  vm.createContext(ctx);
  const map = resolver.extractFunctionMap(fs.readFileSync(VARIABLES, 'utf8'));
  for (const name of ['planModes', 'setupModes', 'removeModes']) {
    const code = map.get(name);
    assert.ok(code, `${name} is not extractable from @variables.js`);
    vm.runInContext(code, ctx);
  }
  return ctx;
}

const { planModes, setupModes, removeModes } = loadModeFunctions();

/** The shape planModes reads: what a live collection looks like, flattened. */
function state(modeNames, hasVariables, name) {
  return {
    name: name || 'Responsive System',
    modes: modeNames.map((n, i) => ({ modeId: 'm' + i, name: n })),
    hasVariables: !!hasVariables
  };
}

/**
 * A stand-in for Figma's VariableCollection, covering only what setupModes touches.
 * `modeLimit` makes addMode throw the way Figma's does once the plan's budget is spent.
 */
function fakeCollection(modeNames, opts) {
  const options = opts || {};
  let next = modeNames.length;
  return {
    name: options.name || 'Responsive System',
    variableIds: options.hasVariables ? ['var:1'] : [],
    modes: modeNames.map((n, i) => ({ modeId: 'm' + i, name: n })),
    removed: [],
    addMode(name) {
      if (options.modeLimit && this.modes.length >= options.modeLimit) {
        throw new Error('Limit of ' + options.modeLimit + ' modes reached');
      }
      const modeId = 'added' + next++;
      this.modes.push({ modeId: modeId, name: name });
      return modeId;
    },
    removeMode(modeId) {
      const at = this.modes.findIndex((m) => m.modeId === modeId);
      if (at === -1) throw new Error('No such mode: ' + modeId);
      this.removed.push(this.modes[at].name);
      this.modes.splice(at, 1);
    },
    renameMode(modeId, name) {
      const mode = this.modes.find((m) => m.modeId === modeId);
      if (!mode) throw new Error('No such mode: ' + modeId);
      mode.name = name;
    }
  };
}

const names = (collection) => collection.modes.map((m) => m.name);

// ---------------------------------------------------------------------------
// planModes
// ---------------------------------------------------------------------------

test('a fresh collection renames Figma default Mode 1 instead of adding a fourth mode', () => {
  const plan = planModes(state(['Mode 1'], false), ['Mobile', 'Tablet', 'Desktop']);
  assert.deepEqual(plan.rename, { modeId: 'm0', from: 'Mode 1', to: 'Mobile' });
  assert.deepEqual(plan.add, ['Tablet', 'Desktop']);
  assert.deepEqual(plan.keep, ['Mobile'], 'the renamed mode is kept, not added');
  assert.deepEqual(plan.extra, []);
});

test('a collection that already has every wanted mode is left alone', () => {
  const plan = planModes(state(['Mobile', 'Tablet', 'Desktop'], true), ['Mobile', 'Tablet', 'Desktop']);
  assert.equal(plan.rename, null);
  assert.deepEqual(plan.add, []);
  assert.deepEqual(plan.keep, ['Mobile', 'Tablet', 'Desktop']);
  assert.deepEqual(plan.extra, []);
  assert.equal(plan.reorder, false);
});

test('a mode this script does not know about is extra, never removed', () => {
  // The bug: "Wide" was another script's viewport, or a mode the user added by hand.
  const plan = planModes(state(['Mobile', 'Tablet', 'Desktop', 'Wide'], true), ['Mobile', 'Tablet', 'Desktop']);
  assert.deepEqual(plan.extra, ['Wide']);
  assert.deepEqual(plan.add, []);
  assert.equal(plan.rename, null);
  assert.ok(!('remove' in plan), 'there is no removal path in a plan at all');
});

test('a single populated mode is added to, not renamed', () => {
  const plan = planModes(state(['Mobile'], true), ['Mobile', 'Tablet']);
  assert.equal(plan.rename, null);
  assert.deepEqual(plan.add, ['Tablet']);
  assert.deepEqual(plan.keep, ['Mobile']);
});

test('a single populated mode with an unrecognised name is kept as extra', () => {
  // Renaming here would silently relabel whatever the user already stored in it.
  const plan = planModes(state(['Legacy'], true), ['Mobile', 'Tablet']);
  assert.equal(plan.rename, null);
  assert.deepEqual(plan.add, ['Mobile', 'Tablet']);
  assert.deepEqual(plan.extra, ['Legacy']);
});

test('a single empty mode already named correctly is not renamed', () => {
  const plan = planModes(state(['Mobile'], false), ['Mobile', 'Tablet']);
  assert.equal(plan.rename, null);
  assert.deepEqual(plan.add, ['Tablet']);
});

test('reorder is planned only when the modes match and nothing is stored in them', () => {
  const empty = planModes(state(['Desktop', 'Mobile', 'Tablet'], false), ['Mobile', 'Tablet', 'Desktop']);
  assert.equal(empty.reorder, true);
  assert.deepEqual(empty.add, []);
  assert.deepEqual(empty.extra, []);

  const populated = planModes(state(['Desktop', 'Mobile', 'Tablet'], true), ['Mobile', 'Tablet', 'Desktop']);
  assert.equal(populated.reorder, false, 'Figma cannot reorder modes once variables exist');
});

test('modes already in the wanted order are not reordered', () => {
  const plan = planModes(state(['Mobile', 'Tablet'], false), ['Mobile', 'Tablet']);
  assert.equal(plan.reorder, false);
});

test('an empty wanted list plans nothing and reports everything as extra', () => {
  const plan = planModes(state(['Mobile'], false), []);
  assert.deepEqual(plan.add, []);
  assert.deepEqual(plan.extra, ['Mobile']);
  assert.equal(plan.rename, null);
  assert.equal(plan.reorder, false);
});

// ---------------------------------------------------------------------------
// setupModes
// ---------------------------------------------------------------------------

test('setupModes never removes a mode it was not asked about', () => {
  const collection = fakeCollection(['Mobile', 'Tablet', 'Desktop', 'Wide'], { hasVariables: true });
  const result = setupModes(collection, ['Mobile', 'Tablet', 'Desktop']);
  assert.deepEqual(collection.removed, [], 'this is the whole point of the change');
  assert.deepEqual(names(collection), ['Mobile', 'Tablet', 'Desktop', 'Wide']);
  assert.deepEqual(result.extra, ['Wide']);
});

test('setupModes renames a fresh collection default and appends the rest', () => {
  const collection = fakeCollection(['Mode 1']);
  const result = setupModes(collection, ['Mobile', 'Tablet', 'Desktop']);
  assert.deepEqual(names(collection), ['Mobile', 'Tablet', 'Desktop']);
  assert.deepEqual(collection.removed, []);
  assert.equal(result.applied.renamed, true);
  assert.deepEqual(result.applied.added, ['Tablet', 'Desktop']);
});

test('setupModes reports the mode budget instead of throwing', () => {
  // Figma's addMode throws once the plan's per-collection limit is reached, and the number
  // is not discoverable up front — so it is caught and reported with the count at failure.
  const collection = fakeCollection(['Mobile', 'Tablet'], { hasVariables: true, modeLimit: 3 });
  const result = setupModes(collection, ['Mobile', 'Tablet', 'Desktop', 'Wide', 'Ultra']);
  assert.deepEqual(names(collection), ['Mobile', 'Tablet', 'Desktop'], 'existing modes intact');
  assert.deepEqual(result.applied.added, ['Desktop']);
  assert.deepEqual(result.blocked, ['Wide', 'Ultra']);
  assert.equal(result.modeLimit, 3);
});

test('setupModes reorders an empty collection and leaves a populated one alone', () => {
  const empty = fakeCollection(['Desktop', 'Mobile', 'Tablet']);
  const reordered = setupModes(empty, ['Mobile', 'Tablet', 'Desktop']);
  assert.deepEqual(names(empty), ['Mobile', 'Tablet', 'Desktop']);
  assert.equal(reordered.applied.reordered, true);

  const populated = fakeCollection(['Desktop', 'Mobile', 'Tablet'], { hasVariables: true });
  const kept = setupModes(populated, ['Mobile', 'Tablet', 'Desktop']);
  assert.deepEqual(names(populated), ['Desktop', 'Mobile', 'Tablet']);
  assert.equal(kept.applied.reordered, false);
  assert.deepEqual(populated.removed, []);
});

// ---------------------------------------------------------------------------
// removeModes — the explicit path, so the capability is not lost
// ---------------------------------------------------------------------------

test('removeModes removes only what it is named', () => {
  const collection = fakeCollection(['Mobile', 'Tablet', 'Wide'], { hasVariables: true });
  const result = removeModes(collection, ['Wide']);
  assert.deepEqual(result.removed, ['Wide']);
  assert.deepEqual(names(collection), ['Mobile', 'Tablet']);
});

test('removeModes refuses to remove the last mode', () => {
  const collection = fakeCollection(['Mobile']);
  const result = removeModes(collection, ['Mobile']);
  assert.deepEqual(result.removed, []);
  assert.equal(result.skipped[0].name, 'Mobile');
  assert.match(result.skipped[0].reason, /last/i);
  assert.deepEqual(names(collection), ['Mobile']);
});

test('removeModes reports a mode that is not there rather than failing', () => {
  const collection = fakeCollection(['Mobile', 'Tablet']);
  const result = removeModes(collection, ['Wide']);
  assert.deepEqual(result.removed, []);
  assert.equal(result.skipped[0].name, 'Wide');
  assert.match(result.skipped[0].reason, /not found/i);
  assert.deepEqual(names(collection), ['Mobile', 'Tablet']);
});
