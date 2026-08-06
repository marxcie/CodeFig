// Tests: foundation modes
// @DOC_START
// # Tests: foundation modes
// In-Figma spec for the two silent bugs plan 15 fixes in `@Variables`. Not shipped (`_` prefix).
//
// Node covers the rules (`tests/foundation-modes.test.js`, `tests/variable-values.test.js`)
// against fixtures and a fake collection. What it cannot cover is here: a **real**
// `VariableCollection`, whose `addMode`/`removeMode` enforce a real mode budget, and a **real**
// FLOAT variable, where `valuesByMode` is the only honest answer to "was the value written".
// The zero case in particular is invisible to a mock — a freshly created FLOAT variable is
// already 0, so only an *update* from 8 to 0 shows the bug.
//
// Run with `npm run test:figma -- foundation-modes`. Everything that writes needs a file whose
// name contains `codefig-test`.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { planModes, setupModes, removeModes, processVariables, getVariable } from "@Variables"

/** A throwaway collection, named so cleanupTestArtifacts can always find it. */
function scratchCollection(suffix) {
  return figma.variables.createVariableCollection(testPrefix() + '/modes' + (suffix || ''));
}

function modeNamesOf(collection) {
  return collection.modes.map(function (m) { return m.name; });
}

function modeIdByName(collection, name) {
  var mode = collection.modes.find(function (m) { return m.name === name; });
  return mode ? mode.modeId : null;
}

/** What the variable actually holds for a mode, read back off the real object. */
async function readValue(collection, variableName, modeName) {
  var variable = await getVariable(collection, variableName);
  if (!variable) return undefined;
  return variable.valuesByMode[modeIdByName(collection, modeName)];
}

testBegin('foundation-modes');

(async function () {
  await it('the mode functions survive @import into the sandbox', function () {
    expect(typeof planModes).toBe('function');
    expect(typeof setupModes).toBe('function');
    expect(typeof removeModes).toBe('function');
  });

  await it('planModes never plans a removal', function () {
    // The imported copy, not the one Node loaded — worth one case in case extraction drifts.
    var plan = planModes({
      name: 'Responsive System',
      modes: [{ modeId: 'm0', name: 'Mobile' }, { modeId: 'm1', name: 'Wide' }],
      hasVariables: true
    }, ['Mobile', 'Tablet']);
    expect(plan.extra).toContain('Wide');
    expect(plan.add).toContain('Tablet');
    expect(plan.rename).toBe(null);
  });

  await itInTestFile('setupModes leaves a mode it did not create alone', async function () {
    // The bug this plan fixes: "Wide" is another script's viewport, or one the user added.
    // It used to be deleted, with every value stored in it, the first time any other
    // Design System Foundations script ran against the shared collection.
    var collection = scratchCollection('-extra');
    try {
      collection.addMode('Wide');
      expect(modeNamesOf(collection)).toContain('Wide');

      var result = setupModes(collection, ['Mobile', 'Tablet', 'Desktop']);

      // If this fails, the file's plan ran out of mode slots rather than the change regressing.
      expect(result.blocked).toHaveLength(0);

      var after = modeNamesOf(collection);
      expect(after).toContain('Wide');
      expect(after).toContain('Mobile');
      expect(after).toContain('Tablet');
      expect(after).toContain('Desktop');
      expect(result.extra).toContain('Wide');
      expect(result.extra).toContain('Mode 1');
    } finally {
      try { collection.remove(); } catch (e) {}
    }
  });

  await itInTestFile('setupModes renames Figma default mode on a fresh collection', async function () {
    var collection = scratchCollection('-fresh');
    try {
      expect(modeNamesOf(collection)).toContain('Mode 1');

      var result = setupModes(collection, ['Mobile', 'Tablet']);

      expect(result.blocked).toHaveLength(0);
      expect(modeNamesOf(collection)).toEqual(['Mobile', 'Tablet']);
      expect(result.applied.renamed).toBe(true);
      expect(result.extra).toHaveLength(0);
    } finally {
      try { collection.remove(); } catch (e) {}
    }
  });

  await itInTestFile('a token value of 0 is written', async function () {
    // Weak on its own — a new FLOAT variable is already 0 — but it proves the value reaches
    // the variable at all. The update below is the case the truthiness bug actually hid.
    var collection = scratchCollection('-zero');
    var name = testPrefix() + '/spacing/none';
    try {
      setupModes(collection, ['Mobile', 'Desktop']);
      var variables = {};
      variables[name] = { type: 'FLOAT', values: { Mobile: 8, Desktop: 0 } };

      var stats = await processVariables(collection, variables, {}, ['Mobile', 'Desktop']);

      expect(stats.created).toBe(1);
      expect(await readValue(collection, name, 'Mobile')).toBe(8);
      expect(await readValue(collection, name, 'Desktop')).toBe(0);
    } finally {
      try { collection.remove(); } catch (e) {}
    }
  });

  await itInTestFile('an existing token can be changed to 0', async function () {
    // The regression, exactly: values[mode] of 0 was dropped by a truthiness test one function
    // above createOrUpdateVariable, so the write never happened and 8 silently stayed.
    var collection = scratchCollection('-update');
    var name = testPrefix() + '/spacing/xs';
    try {
      setupModes(collection, ['Mobile', 'Desktop']);
      var variables = {};

      variables[name] = { type: 'FLOAT', values: { Mobile: 8, Desktop: 8 } };
      await processVariables(collection, variables, {}, ['Mobile', 'Desktop']);
      expect(await readValue(collection, name, 'Desktop')).toBe(8);

      variables[name] = { type: 'FLOAT', values: { Mobile: 8, Desktop: 0 } };
      var stats = await processVariables(collection, variables, {}, ['Mobile', 'Desktop']);

      expect(stats.updated).toBe(1);
      expect(await readValue(collection, name, 'Desktop')).toBe(0);
      expect(await readValue(collection, name, 'Mobile')).toBe(8);
    } finally {
      try { collection.remove(); } catch (e) {}
    }
  });

  await itInTestFile('removeModes removes on request and refuses the last mode', async function () {
    // The explicit path. Figma throws on removing a collection's only mode; the guard means a
    // caller gets a reason back instead of an exception.
    var collection = scratchCollection('-remove');
    try {
      setupModes(collection, ['Mobile', 'Tablet']);

      var removed = removeModes(collection, ['Tablet']);
      expect(removed.removed).toEqual(['Tablet']);
      expect(modeNamesOf(collection)).toEqual(['Mobile']);

      var refused = removeModes(collection, ['Mobile']);
      expect(refused.removed).toHaveLength(0);
      expect(refused.skipped[0].reason).toMatch(/last/i);
      expect(modeNamesOf(collection)).toEqual(['Mobile']);
    } finally {
      try { collection.remove(); } catch (e) {}
    }
  });

  await itInTestFile('leaves nothing behind', async function () {
    expect(await cleanupTestArtifacts()).toBe(0);
  });

  testFinish();
})();
