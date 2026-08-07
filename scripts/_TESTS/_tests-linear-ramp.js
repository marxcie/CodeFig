// Tests: linear ramp
// @DOC_START
// # Tests: linear ramp
// In-Figma spec for `@Linear Ramp` — the generator behind Spacing and Corner radius. Not shipped
// (`_` prefix).
//
// Node proves the collapse changed no value: `tests/linear-ramp.test.js` runs every case through
// the frozen originals in `tests/fixtures/` and the new library and compares variable by
// variable. What is here is what Node cannot reach — real collections, real modes, real variables,
// and the **parallel-sets** property this whole phase was built for: Spacing A and Spacing B in
// two collections, sharing one viewport registry, neither disturbing the other.
//
// Run with `npm run test:figma -- linear-ramp`. Everything writes, so it needs a file whose name
// contains `codefig-test`.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { getCollection, getOrCreateCollection, setupModes, extractModes, processVariables } from "@Variables"
@import { viewportLabel, namePrefix, resolveCollectionName, resolveGroup, registryViewportLabels, readFoundation, writeManifest, readManifest, writeRegistry, normaliseConfig, toDomainConfig, foundationNamespace, foundationRegistryKey } from "@Foundation"
@import { generateScale, isPiecewiseScaleType, snapScaleGrid } from "@Math Helpers"
@import { scaleSequence, resolveModularRatio } from "@Scale Models"
@import { spacingRampSpec, radiusRampSpec, ensureCompatRampConfig, materialiseRampTokens, materialiseRampSizes, validateRampScalingType, generateRampVariables, runLinearRamp, rampManifestSlice } from "@Linear Ramp"

function currentRegistryRaw() {
  return figma.root.getSharedPluginData(foundationNamespace(), foundationRegistryKey());
}

function restoreRegistryRaw(raw) {
  figma.root.setSharedPluginData(foundationNamespace(), foundationRegistryKey(), raw || '');
}

/** A spacing config targeting a named collection, with a distinguishable top value. */
function spacingConfigFor(collectionName, maxDesktop, tokens) {
  return {
    collectionName: collectionName,
    group: 'Spacing',
    config: {
      collectionName: collectionName,
      group: 'Spacing',
      spacings: tokens || ['xs', 'sm', 'md', 'lg'],
      scaling: { type: 'linear', ease: 'none', roundTo: 1 },
      modes: [
        { name: 'mobile', min: 1, max: Math.round(maxDesktop / 2) },
        { name: 'desktop', min: 1, max: maxDesktop }
      ]
    }
  };
}

function radiusConfigFor(collectionName) {
  return {
    collectionName: collectionName,
    group: 'Corner radius',
    config: {
      collectionName: collectionName,
      group: 'Corner radius',
      radii: ['none', 'sm', 'lg'],
      scaling: { type: 'linear', ease: 'none', roundTo: 1 },
      modes: [{ name: 'mobile', min: 0, max: 16 }]
    }
  };
}

/** Every variable in a collection whose name starts with the group, by mode label. */
async function readGroup(collection, group) {
  var out = {};
  for (var i = 0; i < collection.variableIds.length; i++) {
    var v = await figma.variables.getVariableByIdAsync(collection.variableIds[i]);
    if (!v || v.name.indexOf(group + '/') !== 0) continue;
    var per = {};
    for (var m = 0; m < collection.modes.length; m++) {
      per[collection.modes[m].name] = v.valuesByMode[collection.modes[m].modeId];
    }
    out[v.name] = per;
  }
  return out;
}

async function removeCollection(name) {
  var cols = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < cols.length; i++) {
    if (cols[i].name === name) {
      try { cols[i].remove(); } catch (e) {}
    }
  }
}

testBegin('linear-ramp');

(async function () {
  await it('the ramp survives @import into the sandbox', function () {
    expect(typeof runLinearRamp).toBe('function');
    expect(typeof generateRampVariables).toBe('function');
    expect(typeof spacingRampSpec).toBe('function');
    expect(typeof radiusRampSpec).toBe('function');
  });

  await it('the two specs differ only where they are supposed to', function () {
    var spacing = spacingRampSpec();
    var radius = radiusRampSpec();
    expect(spacing.scopes).toEqual(['WIDTH_HEIGHT', 'GAP']);
    expect(radius.scopes).toEqual(['CORNER_RADIUS']);
    expect(spacing.scalingAliases).toContain('spacingScaling');
    expect(radius.scalingAliases).toContain('cornerRadiusScaling');
    expect(spacing.scalingAliases.indexOf('cornerRadiusScaling')).toBe(-1);
  });

  await itInTestFile('a run writes the variables and records the set', async function () {
    var name = testPrefix() + '/ramp-basic';
    var before = currentRegistryRaw();
    try {
      var result = await runLinearRamp(spacingConfigFor(name, 40), spacingRampSpec());

      expect(result.stats.created).toBe(4);
      expect(result.manifest.ok).toBe(true);

      var values = await readGroup(result.collection, 'Spacing');
      expect(Object.keys(values)).toHaveLength(4);
      expect(values['Spacing/lg'].Desktop).toBe(40);

      // The record, read back the way the import button reads it.
      var manifest = readManifest(result.collection, 'spacing', 'Spacing').manifest;
      expect(manifest.tokens).toEqual(['xs', 'sm', 'md', 'lg']);
      expect(manifest.config.perViewport.desktop.max).toBe(40);
    } finally {
      await removeCollection(name);
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('running twice updates in place rather than duplicating', async function () {
    var name = testPrefix() + '/ramp-twice';
    var before = currentRegistryRaw();
    try {
      await runLinearRamp(spacingConfigFor(name, 40), spacingRampSpec());
      var second = await runLinearRamp(spacingConfigFor(name, 80), spacingRampSpec());

      expect(second.stats.created).toBe(0, 'nothing new the second time');
      expect(second.stats.updated).toBe(4);

      var values = await readGroup(second.collection, 'Spacing');
      expect(Object.keys(values)).toHaveLength(4);
      expect(values['Spacing/lg'].Desktop).toBe(80, 'the second run wins');
    } finally {
      await removeCollection(name);
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('Spacing A and Spacing B: two collections, one registry, neither disturbed', async function () {
    // The property this whole phase was built for.
    var nameA = testPrefix() + '/Spacing A';
    var nameB = testPrefix() + '/Spacing B';
    var before = currentRegistryRaw();
    try {
      writeRegistry([
        { key: 'mobile', label: 'Mobile', width: 375 },
        { key: 'desktop', label: 'Desktop', width: 1920 }
      ]);
      var registryBefore = currentRegistryRaw();

      var a = await runLinearRamp(spacingConfigFor(nameA, 40, ['xs', 'sm', 'md', 'lg']), spacingRampSpec());
      var b = await runLinearRamp(spacingConfigFor(nameB, 400, ['tiny', 'huge']), spacingRampSpec());

      var valuesA = await readGroup(a.collection, 'Spacing');
      var valuesB = await readGroup(b.collection, 'Spacing');

      expect(Object.keys(valuesA)).toHaveLength(4);
      expect(Object.keys(valuesB)).toHaveLength(2);
      expect(valuesA['Spacing/lg'].Desktop).toBe(40);
      expect(valuesB['Spacing/huge'].Desktop).toBe(400);
      expect(valuesA['Spacing/huge']).toBe(undefined, 'B did not leak into A');
      expect(valuesB['Spacing/lg']).toBe(undefined, 'A did not leak into B');

      // One registry, untouched by either run.
      expect(currentRegistryRaw()).toBe(registryBefore);

      // Two sets, each recorded against its own collection.
      var foundation = await readFoundation({ collections: [nameA, nameB] });
      expect(foundation.sets).toHaveLength(2);
      expect(foundation.viewports).toHaveLength(2, 'still one viewport list for the file');
      expect(readManifest(a.collection, 'spacing', 'Spacing').manifest.tokens).toEqual(['xs', 'sm', 'md', 'lg']);
      expect(readManifest(b.collection, 'spacing', 'Spacing').manifest.tokens).toEqual(['tiny', 'huge']);

      // Re-running A must not move B.
      await runLinearRamp(spacingConfigFor(nameA, 60, ['xs', 'sm', 'md', 'lg']), spacingRampSpec());
      var valuesBAfter = await readGroup(b.collection, 'Spacing');
      expect(valuesBAfter['Spacing/huge'].Desktop).toBe(400, 'B is where it was');
    } finally {
      await removeCollection(nameA);
      await removeCollection(nameB);
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('spacing and radius in one collection do not collide', async function () {
    var name = testPrefix() + '/ramp-both';
    var before = currentRegistryRaw();
    try {
      var s = await runLinearRamp(spacingConfigFor(name, 40, ['xs', 'lg']), spacingRampSpec());
      var r = await runLinearRamp(radiusConfigFor(name), radiusRampSpec());

      expect(s.collection.id).toBe(r.collection.id, 'the same collection');
      expect(Object.keys(await readGroup(r.collection, 'Spacing'))).toHaveLength(2);
      expect(Object.keys(await readGroup(r.collection, 'Corner radius'))).toHaveLength(3);

      var foundation = await readFoundation({ collections: [name] });
      expect(foundation.sets).toHaveLength(2, 'two sets, two manifests, one collection');
      expect(readManifest(r.collection, 'radius', 'Corner radius').manifest.tokens).toEqual(['none', 'sm', 'lg']);
    } finally {
      await removeCollection(name);
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('a radius token of 0 is written', async function () {
    // Plan 15's fix, now on the shared path.
    var name = testPrefix() + '/ramp-zero';
    try {
      var result = await runLinearRamp(radiusConfigFor(name), radiusRampSpec());
      var values = await readGroup(result.collection, 'Corner radius');
      expect(values['Corner radius/none'].Mobile).toBe(0);
    } finally {
      await removeCollection(name);
    }
  });

  await itInTestFile('the scopes are the domain\'s own, on a real variable', async function () {
    var name = testPrefix() + '/ramp-scopes';
    try {
      var s = await runLinearRamp(spacingConfigFor(name, 40, ['xs']), spacingRampSpec());
      var r = await runLinearRamp(radiusConfigFor(name), radiusRampSpec());
      var spacingVar = null;
      var radiusVar = null;
      for (var i = 0; i < r.collection.variableIds.length; i++) {
        var v = await figma.variables.getVariableByIdAsync(r.collection.variableIds[i]);
        if (v.name === 'Spacing/xs') spacingVar = v;
        if (v.name === 'Corner radius/none') radiusVar = v;
      }
      expect(spacingVar.scopes).toEqual(['WIDTH_HEIGHT', 'GAP']);
      expect(radiusVar.scopes).toEqual(['CORNER_RADIUS']);
      expect(s.collection.id).toBe(r.collection.id);
    } finally {
      await removeCollection(name);
    }
  });

  await itInTestFile('a run that records nothing still reports its variables', async function () {
    // The manifest is written last and cannot fail the run: the tokens are real whether or not
    // the record of them is. Forced by a config slice too large for a pluginData entry.
    var name = testPrefix() + '/ramp-bigmanifest';
    try {
      var config = spacingConfigFor(name, 40, ['xs', 'lg']);
      // Comfortably past Figma's 100 kB entry cap. The first version of this spec used 100,000
      // characters and the manifest came to 100,332 against a limit of 101,888 — it fitted, the
      // write succeeded, and the spec failed for being wrong rather than the code being wrong.
      var filler = '';
      for (var i = 0; i < 8000; i++) filler += 'xxxxxxxxxxxxxxxxxxxxxxxxx';
      config.config.notes = filler;

      var result = await runLinearRamp(config, spacingRampSpec());

      expect(result.stats.created).toBe(2, 'the variables were written');
      expect(result.manifest.ok).toBe(false, 'and the record was refused, not thrown');
      expect(result.manifest.warnings[0].code).toBe('manifest-too-large', 'refused for the reason we forced');
      expect(Object.keys(await readGroup(result.collection, 'Spacing'))).toHaveLength(2);
    } finally {
      await removeCollection(name);
    }
  });

  await itInTestFile('what a run records is what the import button would give back', async function () {
    var name = testPrefix() + '/ramp-import';
    var before = currentRegistryRaw();
    try {
      var config = spacingConfigFor(name, 40, ['xs', 'sm', 'md']);
      var result = await runLinearRamp(config, spacingRampSpec());
      var firstValues = await readGroup(result.collection, 'Spacing');

      var foundation = await readFoundation({ collections: [name] });
      var v1 = { v: 1, collection: name, group: 'Spacing', viewports: foundation.viewports, domains: {} };
      v1.domains.spacing = foundation.sets[0].config;
      var imported = toDomainConfig(v1, 'spacing');

      // Running the imported config reproduces the same variables.
      await removeCollection(name);
      var again = await runLinearRamp({ collectionName: name, group: 'Spacing', config: imported }, spacingRampSpec());
      expect(await readGroup(again.collection, 'Spacing')).toEqual(firstValues);
    } finally {
      await removeCollection(name);
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('leaves nothing behind', async function () {
    expect(await cleanupTestArtifacts()).toBe(0);
  });

  testFinish();
})();
