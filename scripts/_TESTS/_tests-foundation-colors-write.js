// Tests: foundation colours write
// @DOC_START
// # Tests: foundation colours write
// In-Figma coverage for the Colors write path: create → stamp → shrink steps leaves orphans,
// aliased cells are not overwritten. Run with `npm run test:figma -- foundation-colors-write`.
// Needs a file whose name contains `codefig-test`.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { getCollection, getOrCreateCollection, setupModes, processVariables, getVariable } from "@Variables"
@import { namePrefix, resolveCollectionName, resolveGroup, writeManifest, findFoundationSet, foundationModeIds, alignStampedTokens, stampGeneratedTokens, describeStampAlignment, readManifest } from "@Foundation"
@import { bezierAt, bezierNormalise, bezierFromEase, bezierWithMiddle, bezierWithoutMiddle, bezierParse, bezierFormat, bezierEaseName, bezierJoin, bezierSplit, bezierThrough, bezierFitRamp } from "@Bezier"
@import { oklchFromHex, oklchHslFromHex, oklchNormaliseHex, oklchClamp01, oklchLadder, oklchNearestStep, oklchReanchor, oklchRamp, oklchCompare, oklchDistance, oklchToHex, oklchHslToHex } from "@OKLCH"
@import { colorsPlaceholderSteps, colorsParseSteps, colorsLightnessAnchors, colorsNumber, colorsMidIndex, colorsChannel, colorsCurve, colorsFitCurve, colorsFitChromaCurve, colorsFitHueCurve, colorsBestAnchor, colorsAnchorFits, colorsSharedLadder, colorsLightnessOf, colorsGenerateMode, colorsPreviewHtml, colorsAnchorStrip, colorsCard, colorsChangeCaption, colorsStrip, colorsAlignment, colorsTolerance, colorsEscapeHtml, colorsPct, colorsBuildVariableMap, colorsManifestSlice, colorsGroupPrefix } from "@Color Ramp"

function rgbNear(a, b) {
  if (!a || !b) return false;
  var eps = 1 / 512;
  return Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps;
}

function hexToRgb(hex) {
  var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255
  } : null;
}

async function writeColorsOnce(config) {
  var data = config;
  var collectionName = data.collectionName;
  var groupName = data.group || '';
  var built = colorsBuildVariableMap(data);
  var collection = await getOrCreateCollection(collectionName);
  setupModes(collection, built.modeNames);

  // Alias / alpha guard (same rules as colors.js).
  var variables = {};
  var names = Object.keys(built.variables);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var entry = built.variables[name];
    var existing = await getVariable(collection, name);
    var values = {};
    Object.keys(entry.values).forEach(function (modeName) {
      if (!existing) { values[modeName] = entry.values[modeName]; return; }
      var mode = collection.modes.filter(function (mm) { return mm.name === modeName; })[0];
      if (!mode) { values[modeName] = entry.values[modeName]; return; }
      var cell = existing.valuesByMode[mode.modeId];
      if (cell && cell.type === 'VARIABLE_ALIAS') return;
      if (cell && typeof cell.a === 'number' && cell.a < 1) return;
      values[modeName] = entry.values[modeName];
    });
    if (Object.keys(values).length) variables[name] = { type: 'COLOR', values: values };
  }

  var writeNames = Object.keys(variables);
  var setId = (await findFoundationSet(collection, 'colors', groupName)).id || '';
  await alignStampedTokens(collection, 'colors', groupName, writeNames, setId);
  var stats = await processVariables(collection, variables, data, built.modeNames);
  var manifest = writeManifest(collection, {
    id: setId,
    domain: 'colors',
    group: groupName,
    modes: built.modeNames.slice(),
    modeIds: foundationModeIds(collection, built.modeNames),
    tokens: built.steps.slice(),
    config: colorsManifestSlice(data)
  });
  await stampGeneratedTokens(
    collection, 'colors', groupName, writeNames,
    (manifest && manifest.manifest ? manifest.manifest.id : setId)
  );
  return { collection: collection, stats: stats, built: built, manifest: manifest };
}

function sampleConfig(collectionName, group, steps) {
  return {
    collectionName: collectionName,
    group: group,
    steps: steps,
    colorModel: 'hsl',
    curve: [0.37, 0, 0.63, 1],
    lightness: { bright: 98, dark: 8 },
    modes: [{
      name: 'Mode 1',
      curve: [0.37, 0, 0.63, 1],
      chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],
      seed: { hex: '', placement: '', lock: false },
      bright: { hue: 120, hslHue: 120, chroma: 0.1, saturation: 60, lightness: 95 },
      middle: { hue: 120, hslHue: 120, chroma: 0.12, saturation: 50 },
      dark: { hue: 120, hslHue: 120, chroma: 0.04, saturation: 30, lightness: 10 }
    }]
  };
}

testBegin('foundation-colors-write');

(async function () {
  await it('the write helpers survive @import into the sandbox', function () {
    expect(typeof colorsBuildVariableMap).toBe('function');
    expect(typeof colorsManifestSlice).toBe('function');
  });

  await itInTestFile('a colors write creates COLOR variables and records the set', async function () {
    var collectionName = testPrefix() + '/colours-write';
    var group = testPrefix() + '/ramp';
    try {
      var result = await writeColorsOnce(sampleConfig(collectionName, group, '50, 500, 900'));
      expect(result.stats.created).toBe(3);
      expect(result.manifest.ok).toBe(true);
      var v50 = await getVariable(result.collection, group + '/50');
      expect(!!v50).toBe(true);
      expect(v50.resolvedType).toBe('COLOR');
      var modeId = result.collection.modes[0].modeId;
      var want = hexToRgb(result.built.variables[group + '/50'].values['Mode 1']);
      expect(rgbNear(v50.valuesByMode[modeId], want)).toBe(true);
      var read = readManifest(result.collection, 'colors', group);
      expect(!!read.manifest).toBe(true);
      expect(read.manifest.domain).toBe('colors');
      expect((read.manifest.tokens || []).join(',')).toBe('50,500,900');
    } finally {
      await cleanupTestArtifacts();
    }
  });

  await itInTestFile('shrinking the step list leaves orphans in the file', async function () {
    var collectionName = testPrefix() + '/colours-write-orphan';
    var group = testPrefix() + '/orphan';
    try {
      await writeColorsOnce(sampleConfig(collectionName, group, '50, 500, 900'));
      var second = await writeColorsOnce(sampleConfig(collectionName, group, '50, 900'));
      var orphan = await getVariable(second.collection, group + '/500');
      expect(!!orphan).toBe(true);
      expect(orphan.resolvedType).toBe('COLOR');
    } finally {
      await cleanupTestArtifacts();
    }
  });

  await itInTestFile('an aliased cell is not overwritten', async function () {
    var collectionName = testPrefix() + '/colours-write-alias';
    var group = testPrefix() + '/alias';
    try {
      var collection = await getOrCreateCollection(collectionName);
      setupModes(collection, ['Mode 1']);
      var source = figma.variables.createVariable(group + '/source', collection, 'COLOR');
      source.setValueForMode(collection.modes[0].modeId, { r: 1, g: 0, b: 0 });
      var aliased = figma.variables.createVariable(group + '/50', collection, 'COLOR');
      aliased.setValueForMode(collection.modes[0].modeId, {
        type: 'VARIABLE_ALIAS',
        id: source.id
      });

      await writeColorsOnce(sampleConfig(collectionName, group, '50, 500, 900'));
      var after = await getVariable(collection, group + '/50');
      var cell = after.valuesByMode[collection.modes[0].modeId];
      expect(cell.type).toBe('VARIABLE_ALIAS');
      expect(cell.id).toBe(source.id);
    } finally {
      await cleanupTestArtifacts();
    }
  });

  testFinish();
})().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  testFinish();
});
