// Tests: foundation registry
// @DOC_START
// # Tests: foundation registry
// In-Figma spec for `@Foundation` — the viewport registry, the per-set manifests, and the
// reconciliation between them and the document. Not shipped (`_` prefix).
//
// Node covers the rules (`tests/foundation-registry.test.js`) against plain objects. What it
// cannot cover is here: **real** shared plugin data on `figma.root` and on a real
// `VariableCollection`, real modes, and a real `viewport-width` variable. The first case is the
// one to watch — if shared plugin data does not work on the document node under
// `documentAccess: dynamic-page`, the storage layer changes and everything else here is moot.
//
// Run with `npm run test:figma -- foundation-registry`. Everything writes, so it all needs a
// file whose name contains `codefig-test`. The registry lives on `figma.root`, which is the one
// thing `cleanupTestArtifacts` cannot find — every case that writes it restores what was there.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { readFoundation, writeRegistry, writeManifest, readManifest, describeFoundation, reconcileFoundation, foundationNamespace, foundationRegistryKey, foundationSetKey, planFoundationModes, applyFoundationModes, viewportLabel, stampToken, readStamp } from "@Foundation"
@import { planModes, setupModes } from "@Variables"

/** A scratch collection with the given modes, named so cleanup can always find it. */
function scratchCollection(suffix, modeLabels) {
  var collection = figma.variables.createVariableCollection(testPrefix() + '/foundation' + (suffix || ''));
  var labels = modeLabels || [];
  if (labels.length > 0) {
    collection.renameMode(collection.modes[0].modeId, labels[0]);
    for (var i = 1; i < labels.length; i++) collection.addMode(labels[i]);
  }
  return collection;
}

/** Read the file's registry entry so a case can put it back exactly as it found it. */
function currentRegistryRaw() {
  return figma.root.getSharedPluginData(foundationNamespace(), foundationRegistryKey());
}

function restoreRegistryRaw(raw) {
  figma.root.setSharedPluginData(foundationNamespace(), foundationRegistryKey(), raw || '');
}

function modeIdByName(collection, name) {
  var mode = collection.modes.find(function (m) { return m.name === name; });
  return mode ? mode.modeId : null;
}

function warningCodes(foundation) {
  return foundation.warnings.map(function (w) { return w.code; });
}

function viewportByKey(foundation, key) {
  return foundation.viewports.find(function (v) { return v.key === key; }) || null;
}

testBegin('foundation-registry');

(async function () {
  await it('the foundation functions survive @import into the sandbox', function () {
    expect(typeof readFoundation).toBe('function');
    expect(typeof writeRegistry).toBe('function');
    expect(typeof reconcileFoundation).toBe('function');
    expect(typeof describeFoundation).toBe('function');
    // The companion imports the doc block promises are required — proven by them being here.
    expect(typeof planModes).toBe('function');
    expect(typeof setupModes).toBe('function');
  });

  await it('describeFoundation says something useful about an empty foundation', function () {
    var text = describeFoundation({ viewports: [], sets: [], warnings: [] });
    expect(text).toContain('no registry yet');
  });

  await itInTestFile('shared plugin data round-trips on figma.root under dynamic-page', async function () {
    // Run this first. Everything else assumes it.
    var before = currentRegistryRaw();
    try {
      figma.root.setSharedPluginData(foundationNamespace(), '__probe', 'hello');
      expect(figma.root.getSharedPluginData(foundationNamespace(), '__probe')).toBe('hello');
      expect(figma.root.getSharedPluginDataKeys(foundationNamespace())).toContain('__probe');
      figma.root.setSharedPluginData(foundationNamespace(), '__probe', '');
    } finally {
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('a registry written to the file reads back through readFoundation', async function () {
    var before = currentRegistryRaw();
    var collection = scratchCollection('-read', ['Mobile', 'Desktop']);
    try {
      var written = writeRegistry([
        { key: 'desktop', label: 'Desktop', width: 1920 },
        { key: 'mobile', label: 'Mobile', width: 375 }
      ]);
      expect(written.ok).toBe(true);

      var foundation = await readFoundation({ collections: [collection.name] });

      expect(foundation.hasRegistry).toBe(true);
      expect(foundation.viewports.map(function (v) { return v.key; })).toEqual(['mobile', 'desktop']);
      expect(viewportByKey(foundation, 'mobile').materialisedIn).toEqual([collection.name]);
      expect(describeFoundation(foundation)).toContain('Mobile');
    } finally {
      try { collection.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('two collections share one registry — the parallel-sets property', async function () {
    var before = currentRegistryRaw();
    var a = scratchCollection('-A', ['Mobile', 'Desktop']);
    var b = scratchCollection('-B', ['Mobile']);
    try {
      writeRegistry([
        { key: 'mobile', label: 'Mobile', width: 375 },
        { key: 'desktop', label: 'Desktop', width: 1920 }
      ]);
      writeManifest(a, { domain: 'spacing', group: 'Spacing', modes: ['mobile', 'desktop'], tokens: [] });
      writeManifest(b, { domain: 'spacing', group: 'Spacing', modes: ['mobile'], tokens: [] });

      var foundation = await readFoundation({ collections: [a.name, b.name] });

      expect(foundation.viewports).toHaveLength(2);
      expect(viewportByKey(foundation, 'mobile').materialisedIn).toHaveLength(2);
      expect(viewportByKey(foundation, 'desktop').materialisedIn).toEqual([a.name]);
      expect(foundation.sets).toHaveLength(2);
      // Same domain and group in two collections: two sets, no collision.
      expect(readManifest(a, 'spacing', 'Spacing').manifest.modes).toEqual(['mobile', 'desktop']);
      expect(readManifest(b, 'spacing', 'Spacing').manifest.modes).toEqual(['mobile']);
    } finally {
      try { a.remove(); } catch (e) {}
      try { b.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('a real viewport-width variable beats a stale registry width', async function () {
    var before = currentRegistryRaw();
    var collection = scratchCollection('-width', ['Desktop']);
    try {
      var variable = figma.variables.createVariable('Grid/viewport-width', collection, 'FLOAT');
      variable.setValueForMode(modeIdByName(collection, 'Desktop'), 1920);
      writeRegistry([{ key: 'desktop', label: 'Desktop', width: 1440 }]);

      var foundation = await readFoundation({ collections: [collection.name] });

      expect(viewportByKey(foundation, 'desktop').width).toBe(1920);
      expect(viewportByKey(foundation, 'desktop').widthSource.kind).toBe('file');
      expect(warningCodes(foundation)).toContain('width-from-file');
    } finally {
      try { collection.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('a mode renamed in Figma is reported from both ends, and nothing is deleted', async function () {
    // A mode's identity is its modeId, which the registry does not record, so a rename cannot
    // be tracked — only reported. The honest outcome: the new name is adopted, the old entry
    // stays put, and the user decides.
    var before = currentRegistryRaw();
    var collection = scratchCollection('-rename', ['Mobile']);
    try {
      writeRegistry([{ key: 'mobile', label: 'Mobile', width: 375 }]);
      collection.renameMode(modeIdByName(collection, 'Mobile'), 'Handset');

      var foundation = await readFoundation({ collections: [collection.name] });

      expect(warningCodes(foundation)).toContain('viewport-discovered');
      expect(warningCodes(foundation)).toContain('viewport-not-materialised');
      expect(viewportByKey(foundation, 'mobile').width).toBe(375, 'the old entry keeps its width');
      expect(viewportByKey(foundation, 'handset')).toBeTruthy();
    } finally {
      try { collection.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('a manifest whose token was deleted by hand reports, and the load succeeds', async function () {
    var before = currentRegistryRaw();
    var collection = scratchCollection('-manifest', ['Mobile']);
    try {
      writeRegistry([{ key: 'mobile', label: 'Mobile', width: 375 }]);
      figma.variables.createVariable('Spacing/xs', collection, 'FLOAT');
      writeManifest(collection, { domain: 'spacing', group: 'Spacing', modes: ['mobile'], tokens: ['xs', 'sm'] });

      var foundation = await readFoundation({ collections: [collection.name] });

      expect(foundation.sets).toHaveLength(1);
      expect(foundation.sets[0].missing).toEqual(['sm']);
      expect(warningCodes(foundation)).toContain('manifest-token-missing');
      expect(foundation.viewports).toHaveLength(1, 'the load still describes the file');
    } finally {
      try { collection.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('applyFoundationModes adds from the registry and reports what it did not create', async function () {
    // The mode-budget branch is covered against a fake collection in
    // tests/foundation-modes.test.js — reaching a real budget would mean adding ten modes.
    // What is worth proving here is that a real collection's own modes survive.
    var before = currentRegistryRaw();
    var collection = scratchCollection('-modes', ['Wide']);
    try {
      // A variable, so "Wide" is a populated mode: plan 15 renames a collection's only mode
      // only while it is empty, and here the point is that Wide survives untouched.
      figma.variables.createVariable('Spacing/xs', collection, 'FLOAT');
      writeRegistry([
        { key: 'mobile', label: 'Mobile', width: 375 },
        { key: 'desktop', label: 'Desktop', width: 1920 }
      ]);
      var foundation = await readFoundation({ collections: [collection.name] });

      var planned = planFoundationModes(foundation, collection, ['mobile', 'desktop']);
      expect(planned.labels).toEqual(['Mobile', 'Desktop']);
      expect(planned.plan.add).toEqual(['Mobile', 'Desktop']);
      expect(planned.plan.extra).toEqual(['Wide']);

      var applied = applyFoundationModes(foundation, collection, ['mobile', 'desktop']);
      var names = collection.modes.map(function (m) { return m.name; });
      expect(names).toContain('Wide');
      expect(names).toContain('Mobile');
      expect(names).toContain('Desktop');
      expect(applied.warnings.map(function (w) { return w.code; })).toContain('modes-not-ours');
    } finally {
      try { collection.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('a stamp round-trips on a real variable', async function () {
    // Nothing applies stamps yet; this proves the storage works where it will be used.
    var collection = scratchCollection('-stamp', ['Mobile']);
    try {
      var variable = figma.variables.createVariable('Spacing/xs', collection, 'FLOAT');
      stampToken(variable, 'spacing', 'xs');
      var stamp = readStamp(variable);
      expect(stamp.owner).toBe('dsf');
      expect(stamp.domain).toBe('spacing');
      expect(stamp.token).toBe('xs');

      variable.name = 'Spacing/extra-small';
      expect(readStamp(variable).token).toBe('xs', 'a rename does not touch the stamp');
    } finally {
      try { collection.remove(); } catch (e) {}
    }
  });

  await itInTestFile('leaves nothing behind', async function () {
    expect(await cleanupTestArtifacts()).toBe(0);
  });

  testFinish();
})();
