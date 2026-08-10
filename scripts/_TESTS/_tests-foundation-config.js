// Tests: foundation config
// @DOC_START
// # Tests: foundation config
// In-Figma spec for the portable v1 config on canvas. Not shipped (`_` prefix).
//
// Node covers the shape and the compat table (`tests/foundation-config.test.js`), including the
// property that matters most: a legacy blob and its v1 translation generate identical variables
// through spacing.js unchanged. What Node cannot cover is here — a **real** text layer, which
// needs a **real** font loaded before `.characters` can be set, and a real registry written from
// a config read back off canvas.
//
// Run with `npm run test:figma -- foundation-config`. Everything writes, so it all needs a file
// whose name contains `codefig-test`. The registry lives on `figma.root`, which cleanup cannot
// find, so every case that writes it puts back what was there.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { readFoundation, writeRegistry, writeManifest, toPortableConfig, normaliseConfig, toDomainConfig, serialisePortableConfig, parsePortableConfig, writeConfigToTextLayer, readConfigFromTextLayer, findConfigTextLayers, foundationNamespace, foundationRegistryKey } from "@Foundation"

function currentRegistryRaw() {
  return figma.root.getSharedPluginData(foundationNamespace(), foundationRegistryKey());
}

function restoreRegistryRaw(raw) {
  figma.root.setSharedPluginData(foundationNamespace(), foundationRegistryKey(), raw || '');
}

function scratchCollection(suffix, modeLabels) {
  var collection = figma.variables.createVariableCollection(testPrefix() + '/config' + (suffix || ''));
  var labels = modeLabels || [];
  if (labels.length > 0) {
    collection.renameMode(collection.modes[0].modeId, labels[0]);
    for (var i = 1; i < labels.length; i++) collection.addMode(labels[i]);
  }
  return collection;
}

/** The shipped spacing config, in the shape a user pastes today. */
function legacySpacingConfig() {
  return {
    collectionName: 'Responsive System',
    group: 'Spacing',
    spacings: ['px', 'xs', 'sm', 'md', 'lg', 'xl'],
    scaling: { type: 'sine', ease: 'in', roundTo: 2 },
    modes: [
      { name: 'desktop', min: 1, max: 200 },
      { name: 'tablet', min: 1, max: 120 },
      { name: 'mobile', min: 1, max: 80 }
    ]
  };
}

function removeConfigLayers() {
  return findConfigTextLayers().then(function (layers) {
    for (var i = 0; i < layers.length; i++) {
      try { layers[i].remove(); } catch (e) {}
    }
    return layers.length;
  });
}

testBegin('foundation-config');

(async function () {
  await it('the config functions survive @import into the sandbox', function () {
    expect(typeof normaliseConfig).toBe('function');
    expect(typeof toDomainConfig).toBe('function');
    expect(typeof writeConfigToTextLayer).toBe('function');
    expect(typeof readConfigFromTextLayer).toBe('function');
  });

  await it('a legacy config normalises without touching the document', function () {
    var result = normaliseConfig(legacySpacingConfig());
    expect(result.config.v).toBe(1);
    expect(result.config.collection).toBe('Responsive System');
    expect(result.config.domains.spacing.tokens).toHaveLength(6);
    expect(result.config.viewports).toHaveLength(3);
  });

  await itInTestFile('a config written to canvas reads back identical', async function () {
    // The case that needs a real font: createText + .characters throws without loadFontAsync,
    // and there is no loadFontAsync anywhere else in the DSF scripts.
    var before = currentRegistryRaw();
    try {
      var config = normaliseConfig(legacySpacingConfig()).config;
      var written = await writeConfigToTextLayer(config, {});

      expect(written.ok).toBe(true);
      expect(written.node.type).toBe('TEXT');
      expect(written.node.characters.length > 0).toBe(true);

      var read = await readConfigFromTextLayer({ node: written.node });

      expect(read.warnings).toHaveLength(0);
      expect(read.config.collection).toBe('Responsive System');
      expect(read.config.domains.spacing.tokens).toEqual(config.domains.spacing.tokens);
      expect(read.config.viewports).toEqual(config.viewports);
    } finally {
      await removeConfigLayers();
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('writing twice updates the layer instead of adding a second', async function () {
    try {
      var config = normaliseConfig(legacySpacingConfig()).config;
      var first = await writeConfigToTextLayer(config, {});
      var second = await writeConfigToTextLayer(config, {});

      expect(second.node.id).toBe(first.node.id);
      expect(await findConfigTextLayers()).toHaveLength(1);
    } finally {
      await removeConfigLayers();
    }
  });

  await itInTestFile('a layer edited into invalid JSON reports where, and applies nothing', async function () {
    var before = currentRegistryRaw();
    try {
      var written = await writeConfigToTextLayer(normaliseConfig(legacySpacingConfig()).config, {});
      written.node.characters = '{ "v": 1, "collection": "C", }';

      var read = await readConfigFromTextLayer({ node: written.node });

      expect(read.config).toBe(null);
      expect(read.warnings[0].code).toBe('config-unparseable');
      expect(read.warnings[0].message).toContain('line');
      expect(currentRegistryRaw()).toBe(before, 'nothing was written');
    } finally {
      await removeConfigLayers();
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('a config parked in the old shape loads, and says what it translated', async function () {
    try {
      var written = await writeConfigToTextLayer(normaliseConfig(legacySpacingConfig()).config, {});
      written.node.characters = JSON.stringify({
        structure: { variableCollection: 'Old System', variableGroup: 'Sp' },
        spacings: ['xs', 'sm'],
        spacingScaling: { type: 'quad', ease: 'out', roundUpperValuesTo: 4 },
        modes: [{ name: 'mobile', min: 1, max: 40 }]
      });

      var read = await readConfigFromTextLayer({ node: written.node });

      expect(read.config.collection).toBe('Old System');
      // The curve survives because this mode declares no model, and absent means endpoints.
      expect(read.config.domains.spacing.scaling.type).toBe('quad');
      // `roundTo` has one home now, and it is not inside the curve — a deliberate correction, since
      // rounding applies to every model while `scaling` describes a curve only endpoints reads.
      expect(read.config.domains.spacing.roundTo).toBe(4);
      expect(read.config.domains.spacing.scaling.roundTo).toBe(undefined);
      expect(read.translations.length > 0).toBe(true);
    } finally {
      await removeConfigLayers();
    }
  });

  await itInTestFile('two config layers are an ambiguity, not a coin toss', async function () {
    try {
      var written = await writeConfigToTextLayer(normaliseConfig(legacySpacingConfig()).config, {});
      var second = written.node.clone();
      second.name = 'CodeFig config — Another';
      figma.currentPage.selection = [];

      var read = await readConfigFromTextLayer();

      expect(read.config).toBe(null);
      expect(read.warnings[0].code).toBe('config-ambiguous');
    } finally {
      await removeConfigLayers();
    }
  });

  await itInTestFile('the selection wins over the page search', async function () {
    try {
      var a = await writeConfigToTextLayer(normaliseConfig(legacySpacingConfig()).config, {});
      var b = a.node.clone();
      b.name = 'CodeFig config — Chosen';
      b.characters = serialisePortableConfig(normaliseConfig({
        collectionName: 'Chosen', group: 'Spacing', spacings: ['only'],
        modes: [{ name: 'mobile', min: 1, max: 8 }]
      }).config);
      figma.currentPage.selection = [b];

      var read = await readConfigFromTextLayer();

      expect(read.config.collection).toBe('Chosen');
    } finally {
      figma.currentPage.selection = [];
      await removeConfigLayers();
    }
  });

  await itInTestFile('a foundation round-trips into a config and back to a registry', async function () {
    var before = currentRegistryRaw();
    var collection = scratchCollection('-roundtrip', ['Mobile', 'Desktop']);
    try {
      writeRegistry([
        { key: 'mobile', label: 'Mobile', width: 375 },
        { key: 'desktop', label: 'Desktop', width: 1920 }
      ]);
      writeManifest(collection, {
        domain: 'spacing', group: 'Spacing', modes: ['mobile', 'desktop'], tokens: ['xs'],
        config: { tokens: ['xs'], perViewport: { mobile: { min: 1, max: 40 } } }
      });

      var foundation = await readFoundation({ collections: [collection.name] });
      var config = toPortableConfig(foundation);

      expect(config.viewports).toHaveLength(2);
      expect(config.domains.spacing.tokens).toEqual(['xs']);

      // Wipe the registry, then rebuild it from the config alone.
      restoreRegistryRaw('');
      var reread = parsePortableConfig(serialisePortableConfig(config));
      writeRegistry(reread.config.viewports);

      var after = await readFoundation({ collections: [collection.name] });
      expect(after.viewports.map(function (v) { return v.key; })).toEqual(['mobile', 'desktop']);
      expect(after.viewports[1].width).toBe(1920);
    } finally {
      try { collection.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('reading a config writes no variables and no modes', async function () {
    var before = currentRegistryRaw();
    var collection = scratchCollection('-untouched', ['Mobile']);
    try {
      var written = await writeConfigToTextLayer(normaliseConfig(legacySpacingConfig()).config, {});
      await readConfigFromTextLayer({ node: written.node });

      expect(collection.variableIds).toHaveLength(0);
      expect(collection.modes).toHaveLength(1);
    } finally {
      try { collection.remove(); } catch (e) {}
      await removeConfigLayers();
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('leaves nothing behind', async function () {
    expect(await removeConfigLayers()).toBe(0);
    expect(await cleanupTestArtifacts()).toBe(0);
  });

  testFinish();
})();
