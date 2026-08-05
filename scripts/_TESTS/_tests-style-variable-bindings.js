// Tests: style variable bindings
// @DOC_START
// # Tests: style variable bindings
// In-Figma spec for the rebinding `replace-style-variable-bindings` performs, via the
// `@Styles` functions it delegates to. Not shipped (`_` prefix).
//
// This is the spec Node could never approximate: it binds a **real** variable to a **real**
// paint style, rebinds it to a same-named variable in another collection, and reads the
// `VARIABLE_ALIAS` back off the style's paints. `setBoundVariableForPaint` and the cloned-paint
// dance are exactly the parts that behave differently from any mock.
//
// Run with `npm run test:figma -- style-variable-bindings`. Everything here mutates, so it all
// needs a file whose name contains `codefig-test`.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { nameMatches } from "@Pattern Matching"
@import { buildTargetVariableLookup, rebindStyleVariableBindingsOnStyle } from "@Styles"

/** A collection with one COLOR variable of the given name. */
function makeColorCollection(collectionName, variableName, rgb) {
  var collection = figma.variables.createVariableCollection(collectionName);
  var variable = figma.variables.createVariable(variableName, collection, 'COLOR');
  variable.setValueForMode(collection.modes[0].modeId, rgb);
  return { collection: collection, variable: variable };
}

/**
 * The variable id bound to a paint style's first fill, or null.
 * Checks style.boundVariables.paints first because that is what rebindProcessPaintStyle
 * reads; the per-paint boundVariables is the fallback view of the same thing.
 */
function boundVariableIdOf(style) {
  var styleLevel = style.boundVariables && style.boundVariables.paints;
  if (Array.isArray(styleLevel) && styleLevel[0] && styleLevel[0].id) return styleLevel[0].id;
  var paints = style.paints;
  if (!paints || paints.length === 0) return null;
  var bound = paints[0].boundVariables;
  if (!bound || !bound.color) return null;
  return bound.color.id || null;
}

testBegin('style-variable-bindings');

(async function () {
  await it('the rebinding functions survive @import into the sandbox', function () {
    expect(typeof buildTargetVariableLookup).toBe('function');
    expect(typeof rebindStyleVariableBindingsOnStyle).toBe('function');
  });

  await itInTestFile('rebinds a paint style from the source collection to the target', async function () {
    var sourceName = testPrefix() + ' source';
    var targetName = testPrefix() + ' target';
    var varName = testPrefix() + '/brand/primary';

    var source = makeColorCollection(sourceName, varName, { r: 1, g: 0, b: 0 });
    var target = makeColorCollection(targetName, varName, { r: 0, g: 0, b: 1 });
    var style = figma.createPaintStyle();
    style.name = testPrefix() + '/V5/Brand/Primary';

    try {
      // Bind the style's fill to the source variable.
      var paint = figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: 1, g: 0, b: 0 } },
        'color',
        source.variable
      );
      style.paints = [paint];
      expect(boundVariableIdOf(style)).toBe(source.variable.id);

      var lookup = await buildTargetVariableLookup(targetName);
      expect(lookup.map.size > 0).toBe(true);

      var changed = await rebindStyleVariableBindingsOnStyle(style, sourceName, lookup, false);

      expect(changed).toBe(1);
      expect(boundVariableIdOf(style)).toBe(target.variable.id);
    } finally {
      try {
        style.remove();
      } catch (e) {}
      try {
        source.collection.remove();
      } catch (e) {}
      try {
        target.collection.remove();
      } catch (e) {}
    }
  });

  await itInTestFile('leaves a binding alone when the target has no same-named variable', async function () {
    var sourceName = testPrefix() + ' source2';
    var targetName = testPrefix() + ' target2';

    var source = makeColorCollection(sourceName, testPrefix() + '/only/in/source', { r: 1, g: 0, b: 0 });
    // Target exists but holds a different name, so there is nothing to rebind to.
    var target = makeColorCollection(targetName, testPrefix() + '/something/else', { r: 0, g: 1, b: 0 });
    var style = figma.createPaintStyle();
    style.name = testPrefix() + '/V5/Unmatched';

    try {
      style.paints = [
        figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 1, g: 0, b: 0 } },
          'color',
          source.variable
        )
      ];

      var lookup = await buildTargetVariableLookup(targetName);
      var changed = await rebindStyleVariableBindingsOnStyle(style, sourceName, lookup, false);

      expect(changed).toBe(0);
      expect(boundVariableIdOf(style)).toBe(source.variable.id);
    } finally {
      try {
        style.remove();
      } catch (e) {}
      try {
        source.collection.remove();
      } catch (e) {}
      try {
        target.collection.remove();
      } catch (e) {}
    }
  });

  await itInTestFile('breakUnmatchedBindings detaches instead of leaving the source binding', async function () {
    var sourceName = testPrefix() + ' source3';
    var targetName = testPrefix() + ' target3';

    var source = makeColorCollection(sourceName, testPrefix() + '/orphan', { r: 1, g: 0, b: 0 });
    var target = makeColorCollection(targetName, testPrefix() + '/unrelated', { r: 0, g: 1, b: 0 });
    var style = figma.createPaintStyle();
    style.name = testPrefix() + '/V5/Detach';

    try {
      style.paints = [
        figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 1, g: 0, b: 0 } },
          'color',
          source.variable
        )
      ];

      var lookup = await buildTargetVariableLookup(targetName);
      var changed = await rebindStyleVariableBindingsOnStyle(style, sourceName, lookup, true);

      expect(changed).toBe(1);
      expect(boundVariableIdOf(style)).toBe(null);
    } finally {
      try {
        style.remove();
      } catch (e) {}
      try {
        source.collection.remove();
      } catch (e) {}
      try {
        target.collection.remove();
      } catch (e) {}
    }
  });

  await itInTestFile('searchIn now selects styles by wildcard, not just substring', async function () {
    // The plan-10 change this script gained. Asserted against real style names rather than
    // strings, since that is what the script filters on.
    var a = figma.createPaintStyle();
    a.name = testPrefix() + '/V5/Text/3xs/SemiBold';
    var b = figma.createPaintStyle();
    b.name = testPrefix() + '/V4/Text/3xs/SemiBold';
    try {
      expect(nameMatches(a.name, 'V5')).toBe(true);
      expect(nameMatches(b.name, 'V5')).toBe(false);
      expect(nameMatches(a.name, 'V5/*/SemiBold')).toBe(true);
      expect(nameMatches(b.name, 'V5/*/SemiBold')).toBe(false);
      expect(nameMatches(a.name, 'v5')).toBe(true);
      expect(nameMatches(a.name, 'v5', { matchCase: true })).toBe(false);
    } finally {
      try {
        a.remove();
      } catch (e) {}
      try {
        b.remove();
      } catch (e) {}
    }
  });

  await itInTestFile('leaves nothing behind', async function () {
    expect(await cleanupTestArtifacts()).toBe(0);
  });

  testFinish();
})();
