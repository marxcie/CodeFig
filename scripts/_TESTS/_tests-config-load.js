// Tests: config load
// @DOC_START
// # Tests: config load
// In-Figma spec for what the sync button and `figma:run --from-file` actually run: the
// `foundationConfigPayload` read. Not shipped (`_` prefix).
//
// Node covers the two pure halves — `applyFileConfig` in `tests/config-load.test.js` and
// `buildRunPrelude` in `tests/run-prelude.test.js`. What is here is the part that only exists
// inside Figma: reading a real registry and real manifests through the same call the button
// makes, and proving that reading writes nothing.
//
// The button itself cannot be driven from here — it lives in the iframe, and this runs in the
// sandbox. Pressing it, and Cmd-Z after it, are manual checks.
//
// Run with `npm run test:figma -- config-load`. Everything writes, so it needs a file whose name
// contains `codefig-test`. The registry lives on `figma.root`, which cleanup cannot find, so
// every case that writes it puts back what was there.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { foundationConfigPayload, writeRegistry, writeManifest, formatConfigBlock, foundationNamespace, foundationRegistryKey } from "@Foundation"

function currentRegistryRaw() {
  return figma.root.getSharedPluginData(foundationNamespace(), foundationRegistryKey());
}

function restoreRegistryRaw(raw) {
  figma.root.setSharedPluginData(foundationNamespace(), foundationRegistryKey(), raw || '');
}

function scratchCollection(suffix, modeLabels) {
  var collection = figma.variables.createVariableCollection(testPrefix() + '/load' + (suffix || ''));
  var labels = modeLabels || [];
  if (labels.length > 0) {
    collection.renameMode(collection.modes[0].modeId, labels[0]);
    for (var i = 1; i < labels.length; i++) collection.addMode(labels[i]);
  }
  return collection;
}

testBegin('config-load');

(async function () {
  await it('the load functions survive @import into the sandbox', function () {
    expect(typeof foundationConfigPayload).toBe('function');
    expect(typeof formatConfigBlock).toBe('function');
  });

  await itInTestFile('the payload carries this file\'s viewports', async function () {
    var before = currentRegistryRaw();
    var collection = scratchCollection('-viewports', ['Mobile', 'Desktop']);
    try {
      writeRegistry([
        { key: 'mobile', label: 'Mobile', width: 375 },
        { key: 'desktop', label: 'Desktop', width: 1920 }
      ]);

      var payload = await foundationConfigPayload(null, { collections: [collection.name] });

      expect(payload.v1.v).toBe(1);
      expect(payload.v1.viewports).toHaveLength(2);
      expect(payload.v1.viewports[0].key).toBe('mobile');
      expect(payload.config).toBe(null, 'no domain asked for, no bridged config');
    } finally {
      try { collection.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('asking for a domain gets the shape that script reads', async function () {
    var before = currentRegistryRaw();
    var collection = scratchCollection('-domain', ['Mobile']);
    try {
      writeRegistry([{ key: 'mobile', label: 'Mobile', width: 375 }]);
      writeManifest(collection, {
        domain: 'spacing', group: 'Spacing', modes: ['mobile'], tokens: ['xs', 'sm'],
        config: { tokens: ['xs', 'sm'], perViewport: { mobile: { min: 1, max: 80 } } }
      });

      var payload = await foundationConfigPayload('spacing', { collections: [collection.name] });

      expect(payload.domain).toBe('spacing');
      expect(payload.config.collectionName).toBe(collection.name);
      expect(payload.config.spacings).toEqual(['xs', 'sm']);
      expect(payload.config.modes[0].name).toBe('mobile');
      expect(payload.config.modes[0].max).toBe(80);

      // And it prints as a block that would go straight into the script's config.
      var block = formatConfigBlock(payload.config);
      expect(block).toContain('spacings: ["xs", "sm"]');
      expect(block).toContain('name: "mobile"');
    } finally {
      try { collection.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('a file with nothing saved returns an empty payload rather than throwing', async function () {
    var before = currentRegistryRaw();
    var collection = scratchCollection('-empty', ['Mobile']);
    try {
      restoreRegistryRaw('');

      var payload = await foundationConfigPayload('spacing', { collections: [collection.name] });

      expect(payload.v1.v).toBe(1);
      expect(payload.config).toBe(null, 'nothing to bridge, and that is not an error');
    } finally {
      try { collection.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('reading a config writes nothing at all', async function () {
    // The property the whole design rests on: the file is only ever read.
    var before = currentRegistryRaw();
    var collection = scratchCollection('-readonly', ['Mobile']);
    try {
      writeRegistry([{ key: 'mobile', label: 'Mobile', width: 375 }]);
      var registryBefore = currentRegistryRaw();

      await foundationConfigPayload('spacing', { collections: [collection.name] });

      expect(currentRegistryRaw()).toBe(registryBefore);
      expect(collection.variableIds).toHaveLength(0);
      expect(collection.modes).toHaveLength(1);
    } finally {
      try { collection.remove(); } catch (e) {}
      restoreRegistryRaw(before);
    }
  });

  await itInTestFile('a config prelude beats the literal a script would otherwise use', async function () {
    // What `--from-file` does, evaluated the way the sandbox evaluates a queued job.
    var source = "var demoConfig = typeof demoConfig !== 'undefined' ? demoConfig : { source: 'literal' };\n" +
      "window.__codefigLoadSpec = demoConfig;";
    var prelude = "var demoConfig = {\"source\":\"file\"};\n";

    new Function('figma', 'console', 'window', source)(figma, console, window);
    expect(window.__codefigLoadSpec.source).toBe('literal');

    new Function('figma', 'console', 'window', prelude + source)(figma, console, window);
    expect(window.__codefigLoadSpec.source).toBe('file');

    delete window.__codefigLoadSpec;
  });

  await itInTestFile('leaves nothing behind', async function () {
    expect(await cleanupTestArtifacts()).toBe(0);
  });

  testFinish();
})();
