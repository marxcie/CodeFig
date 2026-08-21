// Tests: adopt ramp
// @DOC_START
// # Tests: adopt ramp
// In-Figma spec for adoption — reading tokens a file already has, working out which model
// produced them, and recording it. Not shipped (`_` prefix).
//
// Node proves the recognition (`tests/recognise-scale.test.js`), including the closed loop:
// generate a set, recognise it, get back the config that made it. What is here is what Node
// cannot reach — real variables with real ids, real modes, real plugin data, and the property the
// whole plan rests on:
//
// **Adoption changes nothing you can see.** Ids, names, values, scopes and the registry are
// identical afterwards. Plugin data is not, and deliberately so: the manifest and the stamps are
// what adoption is for. Asserting only the first half would pass if adoption did nothing at all,
// which is the one way that test cannot fail for the reason it exists.
//
// Run with `npm run test:figma -- adopt-ramp`. Everything writes, so it needs a file whose name
// contains `codefig-test`.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { getCollection, getOrCreateCollection, setupModes, extractModes, processVariables } from "@Variables"
@import { viewportLabel, viewportKeyFromLabel, namePrefix, resolveCollectionName, resolveGroup, registryViewportLabels, readFoundation, writeManifest, readManifest, writeRegistry, normaliseConfig, toDomainConfig, readStamp, stampToken, foundationNamespace, foundationRegistryKey, expandTokenList, tokenListHasSeries, alignStampedTokens, stampGeneratedTokens, describeStampAlignment } from "@Foundation"
@import { generateScale, isPiecewiseScaleType, snapScaleGrid } from "@Math Helpers"
@import { scaleSequence, recogniseScale, resolveModularRatio } from "@Scale Models"
@import { bezierAt } from "@Bezier"
@import { spacingRampSpec, radiusRampSpec, adoptRamp, readRampGroup, ensureCompatRampConfig, materialiseRampTokens, materialiseRampSizes, validateRampScalingType, generateRampVariables, runLinearRamp } from "@Linear Ramp"

function currentRegistryRaw() {
  return figma.root.getSharedPluginData(foundationNamespace(), foundationRegistryKey());
}

function restoreRegistryRaw(raw) {
  figma.root.setSharedPluginData(foundationNamespace(), foundationRegistryKey(), raw || '');
}

async function removeCollection(name) {
  var cols = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < cols.length; i++) {
    if (cols[i].name === name) {
      try { cols[i].remove(); } catch (e) {}
    }
  }
}

/** A collection built by hand, the way a file made before CodeFig looks. */
function handBuiltCollection(name, modeLabels, group, tokenValues) {
  var collection = figma.variables.createVariableCollection(name);
  collection.renameMode(collection.modes[0].modeId, modeLabels[0]);
  for (var i = 1; i < modeLabels.length; i++) collection.addMode(modeLabels[i]);

  for (var tokenName in tokenValues) {
    if (!Object.prototype.hasOwnProperty.call(tokenValues, tokenName)) continue;
    var variable = figma.variables.createVariable(namePrefix(group) + tokenName, collection, 'FLOAT');
    for (var m = 0; m < collection.modes.length; m++) {
      variable.setValueForMode(collection.modes[m].modeId, tokenValues[tokenName][m]);
    }
  }
  return collection;
}

/** Everything about a collection that adoption must not touch. */
async function snapshotCollection(collection) {
  var out = [];
  for (var i = 0; i < collection.variableIds.length; i++) {
    var v = await figma.variables.getVariableByIdAsync(collection.variableIds[i]);
    if (!v) continue;
    var values = {};
    for (var m = 0; m < collection.modes.length; m++) {
      values[collection.modes[m].name] = v.valuesByMode[collection.modes[m].modeId];
    }
    out.push({ id: v.id, name: v.name, scopes: (v.scopes || []).slice().sort().join(','), values: values });
  }
  out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return JSON.stringify(out);
}

testBegin('adopt-ramp');

(async function () {
  await it('adoption survives @import into the sandbox', function () {
    expect(typeof adoptRamp).toBe('function');
    expect(typeof recogniseScale).toBe('function');
    expect(typeof readRampGroup).toBe('function');
  });

  await itInTestFile('a hand-built metric scale is recognised, recorded and stamped', async function () {
    var name = testPrefix() + '/adopt-metric';
    var before = currentRegistryRaw();
    try {
      // 4, 8, 12, 16, 24, 32 on Desktop — metric, base 4, step 4, mod 3 — halved on Mobile.
      var collection = handBuiltCollection(name, ['Desktop', 'Mobile'], 'Spacing', {
        xs: [4, 2], sm: [8, 4], md: [12, 6], lg: [16, 8], xl: [24, 12], '2xl': [32, 16]
      });
      var snapshotBefore = await snapshotCollection(collection);

      var adopted = await adoptRamp(collection, 'Spacing', spacingRampSpec(), {});

      // --- the positive half: something was written, and it matches what was fitted
      expect(adopted.written).toBe(true);
      expect(adopted.tokens).toHaveLength(6);
      expect(adopted.fits.Desktop.recognised.model).toBe('metric');
      expect(adopted.fits.Desktop.recognised.exact).toBe(true);
      expect(adopted.fits.Desktop.recognised.options.step).toBe(4);
      expect(adopted.fits.Mobile.recognised.options.step).toBe(2);

      var manifest = readManifest(collection, 'spacing', 'Spacing').manifest;
      expect(manifest.tokens).toEqual(['xs', 'sm', 'md', 'lg', 'xl', '2xl']);
      expect(manifest.config.perViewport.desktop.model).toBe('metric');
      expect(manifest.config.perViewport.desktop.step).toBe(4);

      expect(adopted.stamped).toBe(6);
      for (var i = 0; i < collection.variableIds.length; i++) {
        var v = await figma.variables.getVariableByIdAsync(collection.variableIds[i]);
        expect(readStamp(v).domain).toBe('spacing');
      }

      // --- the negative half: ids, names, values and scopes are exactly as they were
      expect(await snapshotCollection(collection)).toBe(snapshotBefore);
      expect(currentRegistryRaw()).toBe(before, 'and the registry was not touched');
    } finally {
      await removeCollection(name);
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('what was adopted regenerates the numbers that were already there', async function () {
    var name = testPrefix() + '/adopt-regen';
    try {
      var collection = handBuiltCollection(name, ['Desktop'], 'Spacing', {
        xs: [4], sm: [8], md: [12], lg: [16], xl: [24]
      });
      var adopted = await adoptRamp(collection, 'Spacing', spacingRampSpec(), {});
      expect(adopted.written).toBe(true);

      // The recorded config, put back through the generator, produces the file's own values.
      var v1 = { v: 1, collection: name, group: 'Spacing', viewports: [{ key: 'desktop', label: 'Desktop', width: null }], domains: { spacing: adopted.slice } };
      var config = toDomainConfig(v1, 'spacing');
      var spec = spacingRampSpec();
      ensureCompatRampConfig(config, spec);
      materialiseRampTokens(config, spec);
      // The modes come from the run, as they come from the collection in `runLinearRamp`: adoption
      // collapses value-identical fits into one `appliesTo: "*"` set, which names no modes itself.
      materialiseRampSizes(config, spec, ['Desktop']);
      var generated = generateRampVariables(config, spec);

      expect(generated['Spacing/xs'].values.Desktop).toBe(4);
      expect(generated['Spacing/xl'].values.Desktop).toBe(24);
      expect(Object.keys(generated)).toHaveLength(5);
    } finally {
      await removeCollection(name);
    }
  });

  await itInTestFile('a hand-nudged scale records as explicit, with the near-miss offered', async function () {
    var name = testPrefix() + '/adopt-nudged';
    try {
      var collection = handBuiltCollection(name, ['Desktop'], 'Spacing', {
        xs: [4], sm: [8], md: [12], lg: [16], xl: [25]
      });
      var adopted = await adoptRamp(collection, 'Spacing', spacingRampSpec(), {});

      expect(adopted.written).toBe(true);
      expect(adopted.fits.Desktop.recognised.model).toBe('explicit');
      expect(adopted.fits.Desktop.recognised.options.values).toEqual([4, 8, 12, 16, 25]);
      expect(adopted.fits.Desktop.recognised.suggestion.model).toBe('metric');
      // The values it would change, in the report, before anyone chooses.
      expect(adopted.lines.join('\n')).toContain('25 vs 24');
    } finally {
      await removeCollection(name);
    }
  });

  await itInTestFile('nested groups, aliases and non-numbers are skipped and named', async function () {
    var name = testPrefix() + '/adopt-skips';
    var other = testPrefix() + '/adopt-source';
    try {
      var source = figma.variables.createVariableCollection(other);
      var sourceVar = figma.variables.createVariable('Spacing/aliased', source, 'FLOAT');
      sourceVar.setValueForMode(source.modes[0].modeId, 99);

      var collection = handBuiltCollection(name, ['Desktop'], 'Spacing', { xs: [4], sm: [8], md: [12] });
      figma.variables.createVariable('Spacing/inset/sm', collection, 'FLOAT')
        .setValueForMode(collection.modes[0].modeId, 6);
      figma.variables.createVariable('Spacing/enabled', collection, 'BOOLEAN')
        .setValueForMode(collection.modes[0].modeId, true);
      figma.variables.createVariable('Spacing/linked', collection, 'FLOAT')
        .setValueForMode(collection.modes[0].modeId, figma.variables.createVariableAlias(sourceVar));

      var adopted = await adoptRamp(collection, 'Spacing', spacingRampSpec(), {});

      expect(adopted.tokens).toEqual(['xs', 'sm', 'md']);
      var reasons = adopted.skipped.map(function (sk) { return sk.name + ': ' + sk.why; }).join(' | ');
      expect(reasons).toContain('Spacing/inset/sm');
      expect(reasons).toContain('nested group');
      expect(reasons).toContain('Spacing/enabled');
      expect(reasons).toContain('Spacing/linked');
    } finally {
      await removeCollection(name);
      await removeCollection(other);
    }
  });

  await itInTestFile('the publish status is fetched and carried into the decision', async function () {
    // The rule itself — which statuses may be written to, and what it says when they may not —
    // is a pure function tested in tests/linear-ramp.test.js. There is no Figma in that rule, and
    // stubbing getPublishStatusAsync on a real collection to reach the other branch would be
    // fighting the environment: plugin objects are proxies and do not take a patched method.
    // What only Figma can prove is that the status is read at all and reaches the gate.
    var name = testPrefix() + '/adopt-publish';
    try {
      var collection = handBuiltCollection(name, ['Desktop'], 'Spacing', { xs: [4], sm: [8], md: [12] });
      expect(typeof collection.getPublishStatusAsync).toBe('function');

      var adopted = await adoptRamp(collection, 'Spacing', spacingRampSpec(), {});

      expect(adopted.publishStatus).toBe('UNPUBLISHED', 'a scratch collection is unpublished');
      expect(adopted.written).toBe(true, 'so it records without asking');
      expect(adopted.stamped).toBe(3);
    } finally {
      await removeCollection(name);
    }
  });

  await itInTestFile('a run over an adopted collection updates in place, keeping every id', async function () {
    // The point of adopting rather than recreating: regeneration touches values, never identity.
    var name = testPrefix() + '/adopt-then-run';
    var before = currentRegistryRaw();
    try {
      var collection = handBuiltCollection(name, ['Desktop'], 'Spacing', {
        xs: [4], sm: [8], md: [12], lg: [16], xl: [24]
      });
      var idsBefore = collection.variableIds.slice().sort().join(',');
      await adoptRamp(collection, 'Spacing', spacingRampSpec(), {});

      var adoptedManifest = readManifest(collection, 'spacing', 'Spacing').manifest;
      var v1 = { v: 1, collection: name, group: 'Spacing', viewports: [{ key: 'desktop', label: 'Desktop', width: null }], domains: { spacing: adoptedManifest.config } };
      await runLinearRamp({ collectionName: name, group: 'Spacing', config: toDomainConfig(v1, 'spacing') }, spacingRampSpec());

      expect(collection.variableIds.slice().sort().join(',')).toBe(idsBefore, 'not one variable was recreated');
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
