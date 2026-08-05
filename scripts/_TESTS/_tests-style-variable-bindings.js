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

  await itInTestFile('a dry run reports the rebind and writes nothing', async function () {
    // Plan 11's core property for this script: the same walk, in dry-run mode, must leave the
    // binding exactly where it was while still describing what it would do.
    var sourceName = testPrefix() + ' source4';
    var targetName = testPrefix() + ' target4';
    var varName = testPrefix() + '/dry/run';

    var source = makeColorCollection(sourceName, varName, { r: 1, g: 0, b: 0 });
    var target = makeColorCollection(targetName, varName, { r: 0, g: 0, b: 1 });
    var style = figma.createPaintStyle();
    style.name = testPrefix() + '/V5/DryRun';

    try {
      style.paints = [
        figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 1, g: 0, b: 0 } },
          'color',
          source.variable
        )
      ];
      var before = boundVariableIdOf(style);
      expect(before).toBe(source.variable.id);

      var lookup = await buildTargetVariableLookup(targetName);
      var plan = [];
      var reported = await rebindStyleVariableBindingsOnStyle(
        style, sourceName, lookup, false, { dryRun: true, plan: plan }
      );

      expect(reported).toBe(1);
      expect(boundVariableIdOf(style)).toBe(before, 'the dry run must not touch the binding');
      expect(plan).toHaveLength(1);
      expect(plan[0].action).toBe('rebind');
      expect(plan[0].fromName).toBe(varName);
      expect(plan[0].toName).toBe(varName);
      expect(plan[0].styleName).toBe(style.name);

      // And the same call without dryRun does what the dry run described.
      var applied = await rebindStyleVariableBindingsOnStyle(style, sourceName, lookup, false);
      expect(applied).toBe(1);
      expect(boundVariableIdOf(style)).toBe(target.variable.id);
    } finally {
      try { style.remove(); } catch (e) {}
      try { source.collection.remove(); } catch (e) {}
      try { target.collection.remove(); } catch (e) {}
    }
  });

  await itInTestFile('a dry-run detach is reported without detaching', async function () {
    var sourceName = testPrefix() + ' source5';
    var targetName = testPrefix() + ' target5';
    var source = makeColorCollection(sourceName, testPrefix() + '/lonely', { r: 1, g: 0, b: 0 });
    var target = makeColorCollection(targetName, testPrefix() + '/other', { r: 0, g: 1, b: 0 });
    var style = figma.createPaintStyle();
    style.name = testPrefix() + '/V5/DryDetach';

    try {
      style.paints = [
        figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: 1, g: 0, b: 0 } },
          'color',
          source.variable
        )
      ];
      var lookup = await buildTargetVariableLookup(targetName);
      var plan = [];
      await rebindStyleVariableBindingsOnStyle(style, sourceName, lookup, true, { dryRun: true, plan: plan });

      expect(plan).toHaveLength(1);
      expect(plan[0].action).toBe('detach');
      expect(boundVariableIdOf(style)).toBe(source.variable.id, 'still bound after a dry run');
    } finally {
      try { style.remove(); } catch (e) {}
      try { source.collection.remove(); } catch (e) {}
      try { target.collection.remove(); } catch (e) {}
    }
  });

  await itInTestFile('leaves nothing behind', async function () {
    expect(await cleanupTestArtifacts()).toBe(0);
  });

  testFinish();
})();
