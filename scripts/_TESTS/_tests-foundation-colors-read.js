// Tests: foundation colours read
// @DOC_START
// # Tests: foundation colours read
// Golden test for `.plans/28-read-path-performance.md`. Captures `foundationColorsAutoImport`
// and `colorsRecognise`'s output against real `VariableCollection`/`Variable` objects before the
// (M+1)×V sequential-await fix lands, so the fix can be checked for exact equality rather than
// "looks right". Node cannot cover this: the whole thing is `figma.variables` calls with real
// mode-fallback and alias-resolution semantics.
//
// Covers the three cases the plan names: a mode the panel names that the collection does not
// have (the Moss/Ash bug at `@foundation.js:3410`), a group with aliased members, and a
// single-mode collection.
//
// Run with `npm run test:figma -- foundation-colors-read`. Everything here mutates, so it all
// needs a file whose name contains `codefig-test`.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { foundationColorsAutoImport, colorsRecognise } from "@Foundation"
// `foundationColorsAutoImport`/`colorsRecognise` call into `@Color Ramp` and `@OKLCH` (curve
// fitting, anchor finding) — cross-library calls resolve only in the *consumer's* context, so
// the production snippet in `src/ui.html` runs them alongside `colors.js`'s own import lines.
// This spec is the consumer here, so it needs the same closure `colors.js` declares, or these
// calls `ReferenceError` at run time despite validating clean (validateResolvedCalls only sees
// calls, and a library's own calls are exempt from it by design).
@import { bezierAt, bezierNormalise, bezierFromEase, bezierWithMiddle, bezierWithoutMiddle, bezierParse, bezierFormat, bezierEaseName, bezierJoin, bezierSplit, bezierThrough, bezierFitRamp } from "@Bezier"
@import { oklchFromHex, oklchHslFromHex, oklchNormaliseHex, oklchClamp01, oklchLadder, oklchNearestStep, oklchReanchor, oklchRamp, oklchCompare, oklchDistance } from "@OKLCH"
@import { colorsPlaceholderSteps, colorsParseSteps, colorsLightnessAnchors, colorsNumber, colorsMidIndex, colorsChannel, colorsCurve, colorsFitCurve, colorsFitChromaCurve, colorsFitHueCurve, colorsBestAnchor, colorsAnchorFits, colorsSharedLadder, colorsLightnessOf, colorsGenerateMode, colorsPreviewHtml, colorsAnchorStrip, colorsCard, colorsChangeCaption, colorsStrip, colorsAlignment, colorsTolerance, colorsEscapeHtml, colorsPct } from "@Color Ramp"

// CAPTURE_MODE: true logs the golden JSON instead of asserting it, for (re)capturing the fixture.
// Must be false before this spec is relied on as a regression gate.
var CAPTURE_MODE = false;

// Captured 2026-08-23 via `npm run test:figma -- foundation-colors-read`, pre-fix, on
// `dsf-foundations`, plugin build 1787493219620. This is the answer plan 28 must reproduce
// exactly after the (M+1)×V loop is replaced with an indexed read.
var GOLDEN_NEUTRAL_MODES_JSON = '{"source":"recognised","config":{"steps":"25, 500, 900","curve":[0.125,0.050976,0.375,0.458783,0.5,0.509759,0.625,0.558783,0.875,0.950976],"lightness":{"bright":97.7,"dark":21.5},"modes":[{"name":"Granite","bright":{"hue":286.3,"chroma":0.0034,"hslHue":240,"saturation":23.1,"lightness":97.5},"middle":{"hue":264.5,"chroma":0.0083,"hslHue":217.5,"saturation":3.2,"lightness":49.4},"dark":{"hue":248.1,"chroma":0.0064,"hslHue":204,"saturation":9.8,"lightness":10},"chromaCurve":[],"saturationCurve":[],"hueCurve":[],"hslHueCurve":[],"seed":{"placement":"500"},"curve":[]},{"name":"Moss"}]},"collection":"__codefig-test__/colours-read-neutral","group":"__codefig-test__/neutral","tokens":["25","500","900"],"modes":["Granite"],"existing":{"Granite":["#F7F7FA","#7A7D82","#171A1C"]},"recognition":{"modes":{"Granite":{"found":true,"skipped":[],"aliased":[],"duplicates":[],"notes":["Hue read from a near-grey: the lowest chroma here is 0.0034, where one 8-bit step moves hue by tens of degrees. The Hue anchors are rounding rather than a value — set them yourself if this ramp is meant to have a hue."],"hueUnreliable":true,"midStep":"500","midIndex":1},"Moss":{"found":false,"skipped":[],"aliased":[],"duplicates":[],"notes":["The collection has no mode called Moss, so there is nothing to read for it. Its values were left alone."],"hueUnreliable":false}},"declined":null,"lightnessFrom":["Granite"]},"missing":[],"modeSource":"panel"}';
var GOLDEN_ALIASED_JSON = '{"found":true,"collection":"__codefig-test__/colours-read-semantic","group":"__codefig-test__/sem","modeName":"Mode 1","steps":["25","50","90"],"existing":["#E5E5E5","#808080","#1A1A1A"],"anchors":{"bright":0.923423065035134,"middle":0.5981807266228486,"dark":0.21560726539375583},"hue":{"bright":0,"middle":0,"dark":0},"chroma":{"bright":3.4419667358128855e-8,"middle":2.2296585815985204e-8,"dark":8.03654428778583e-9},"config":null,"skipped":[],"aliased":["__codefig-test__/sem/25","__codefig-test__/sem/50","__codefig-test__/sem/90"],"duplicates":[],"declined":null,"notes":["Hue read from a near-grey: the lowest chroma here is 0, where one 8-bit step moves hue by tens of degrees. The Hue anchors are rounding rather than a value — set them yourself if this ramp is meant to have a hue."],"missing":[],"fits":{"index":1,"lightnessOklch":[],"lightnessHsl":[],"chromaCurve":[],"saturationCurve":[],"hueCurve":[],"hslHueCurve":[]},"midStep":"50","midIndex":1,"hsl":{"hue":{"bright":0,"middle":0,"dark":0},"saturation":{"bright":0,"middle":0,"dark":0},"lightness":{"bright":0.8980392156862745,"middle":0.5019607843137255,"dark":0.10196078431372549}},"hueUnreliable":true}';
var GOLDEN_SINGLE_MODE_JSON = '{"source":"recognised","config":{"steps":"25, 50, 90","curve":[0.125,0.046926,0.375,0.422331,0.5,0.469256,0.625,0.522331,0.875,0.946926],"lightness":{"bright":96.1,"dark":19.1},"modes":[{"name":"Mode 1","bright":{"hue":0,"chroma":0,"hslHue":0,"saturation":0,"lightness":94.9},"middle":{"hue":0,"chroma":0,"hslHue":0,"saturation":0,"lightness":50.2},"dark":{"hue":0,"chroma":0,"hslHue":0,"saturation":0,"lightness":7.8},"chromaCurve":[],"saturationCurve":[],"hueCurve":[],"hslHueCurve":[],"seed":{"placement":"50"},"curve":[]}]},"collection":"__codefig-test__/colours-read-single","group":"__codefig-test__/mono","tokens":["25","50","90"],"modes":["Mode 1"],"existing":{"Mode 1":["#F2F2F2","#808080","#141414"]},"recognition":{"modes":{"Mode 1":{"found":true,"skipped":[],"aliased":[],"duplicates":[],"notes":["Hue read from a near-grey: the lowest chroma here is 0, where one 8-bit step moves hue by tens of degrees. The Hue anchors are rounding rather than a value — set them yourself if this ramp is meant to have a hue."],"hueUnreliable":true,"midStep":"50","midIndex":1}},"declined":null,"lightnessFrom":["Mode 1"]},"missing":[],"modeSource":"collection"}';

function checkGolden(label, golden, actualObj) {
  var actual = JSON.stringify(actualObj);
  if (CAPTURE_MODE) {
    console.log('GOLDEN:' + label, actual);
    return;
  }
  expect(actual).toBe(golden);
}

function scratchCollection(suffix) {
  return figma.variables.createVariableCollection(testPrefix() + '/colours-read' + (suffix || ''));
}

function addColorStep(collection, groupPrefix, step, valuesByModeName) {
  var variable = figma.variables.createVariable(groupPrefix + '/' + step, collection, 'COLOR');
  collection.modes.forEach(function (mode) {
    var rgb = valuesByModeName[mode.name];
    if (rgb) variable.setValueForMode(mode.modeId, rgb);
  });
  return variable;
}

testBegin('foundation-colors-read');

(async function () {
  await it('the read-path functions survive @import into the sandbox', function () {
    expect(typeof foundationColorsAutoImport).toBe('function');
    expect(typeof colorsRecognise).toBe('function');
  });

  await itInTestFile(
    'a mode the panel names that the collection does not have comes back empty, not filled from another mode',
    async function () {
      // Three visibly different modes (Ash/Granite/Bark), so a wrong fallback is detectable rather
      // than lucky — this is the exact shape of the bug recorded at @foundation.js:3410, where
      // "Granite, Moss" against a collection whose real modes were Ash/Granite/Bark filled Moss's
      // block with Ash's anchors.
      var collection = scratchCollection('-neutral');
      var group = testPrefix() + '/neutral';
      try {
        collection.renameMode(collection.modes[0].modeId, 'Ash');
        collection.addMode('Granite');
        collection.addMode('Bark');
        var byStep = {
          25: { Ash: { r: 0.98, g: 0.98, b: 0.98 }, Granite: { r: 0.97, g: 0.97, b: 0.98 }, Bark: { r: 0.98, g: 0.97, b: 0.96 } },
          500: { Ash: { r: 0.50, g: 0.50, b: 0.50 }, Granite: { r: 0.48, g: 0.49, b: 0.51 }, Bark: { r: 0.52, g: 0.49, b: 0.47 } },
          900: { Ash: { r: 0.10, g: 0.10, b: 0.10 }, Granite: { r: 0.09, g: 0.10, b: 0.11 }, Bark: { r: 0.11, g: 0.10, b: 0.09 } }
        };
        Object.keys(byStep).forEach(function (step) { addColorStep(collection, group, step, byStep[step]); });

        var found = await foundationColorsAutoImport(collection.name, group, ['Granite', 'Moss'], 'oklch');

        expect(found.recognition.modes.Granite.found).toBe(true);
        expect(found.recognition.modes.Moss.found).toBe(false);
        expect(found.modes.indexOf('Granite') > -1).toBe(true);
        expect(found.modes.indexOf('Moss')).toBe(-1);

        // The full snapshot: any other field drifting after the plan 28 fix is caught too, not
        // just the two fields asserted above. Fill in from a real `test:figma` run before this
        // spec is relied on as the fix's regression gate — see the note above the constant.
        //
        // GOLDEN_NEUTRAL_MODES_JSON captured 2026-08-23, pre-fix, on `dsf-foundations` @ current
        // HEAD, from this exact spec.
        checkGolden('NEUTRAL_MODES', GOLDEN_NEUTRAL_MODES_JSON, found);
      } finally {
        try { collection.remove(); } catch (e) {}
      }
    }
  );

  await itInTestFile('an aliased member resolves through colorsResolveAlias', async function () {
    var primitives = scratchCollection('-primitives');
    var semantic = scratchCollection('-semantic');
    try {
      // Three real steps, so the group clears "fewer than three steps is not recognisable".
      var prim25 = addColorStep(primitives, testPrefix() + '/prim', '25', { 'Mode 1': { r: 0.9, g: 0.9, b: 0.9 } });
      var prim50 = addColorStep(primitives, testPrefix() + '/prim', '50', { 'Mode 1': { r: 0.5, g: 0.5, b: 0.5 } });
      var prim90 = addColorStep(primitives, testPrefix() + '/prim', '90', { 'Mode 1': { r: 0.1, g: 0.1, b: 0.1 } });

      var group = testPrefix() + '/sem';
      var sem25 = figma.variables.createVariable(group + '/25', semantic, 'COLOR');
      var sem50 = figma.variables.createVariable(group + '/50', semantic, 'COLOR');
      var sem90 = figma.variables.createVariable(group + '/90', semantic, 'COLOR');
      sem25.setValueForMode(semantic.modes[0].modeId, figma.variables.createVariableAlias(prim25));
      sem50.setValueForMode(semantic.modes[0].modeId, figma.variables.createVariableAlias(prim50));
      sem90.setValueForMode(semantic.modes[0].modeId, figma.variables.createVariableAlias(prim90));

      var seen = await colorsRecognise(semantic.name, group, semantic.modes[0].name);

      expect(seen.found).toBe(true);
      expect(seen.aliased.length).toBe(3);
      expect(seen.skipped.length).toBe(0);
      expect(seen.anchors !== null).toBe(true);
      checkGolden('ALIASED', GOLDEN_ALIASED_JSON, seen);
    } finally {
      try { semantic.remove(); } catch (e) {}
      try { primitives.remove(); } catch (e) {}
    }
  });

  await itInTestFile('a single-mode collection reads its one mode when the panel names none', async function () {
    var collection = scratchCollection('-single');
    var group = testPrefix() + '/mono';
    try {
      addColorStep(collection, group, '25', { 'Mode 1': { r: 0.95, g: 0.95, b: 0.95 } });
      addColorStep(collection, group, '50', { 'Mode 1': { r: 0.5, g: 0.5, b: 0.5 } });
      addColorStep(collection, group, '90', { 'Mode 1': { r: 0.08, g: 0.08, b: 0.08 } });

      // No modeNames: foundationColorsAutoImport reads the collection's own modes when the panel
      // has named none (an unnamed panel "adopts what is there").
      var found = await foundationColorsAutoImport(collection.name, group, [], 'hsl');

      expect(found.modeSource).toBe('collection');
      expect(found.modes.length).toBe(1);
      expect(found.modes[0]).toBe('Mode 1');
      expect(found.recognition.modes['Mode 1'].found).toBe(true);
      checkGolden('SINGLE_MODE', GOLDEN_SINGLE_MODE_JSON, found);
    } finally {
      try { collection.remove(); } catch (e) {}
    }
  });

  await itInTestFile('leaves nothing behind', async function () {
    expect(await cleanupTestArtifacts()).toBe(0);
  });

  testFinish();
})();
