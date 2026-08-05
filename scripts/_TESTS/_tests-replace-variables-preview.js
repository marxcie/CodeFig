// Tests: replace-variables preview
// @DOC_START
// # Tests: replace-variables preview
// In-Figma spec for the preview guard in `replace-variables`. Not shipped (`_` prefix).
//
// The risk this covers is specific: the script writes in five different places (variables
// table, text range properties, fills, strokes, and direct bound properties), and a preview
// that misses one would quietly mutate the document while claiming to be a preview. So rather
// than test the wording of rows, this asserts the **guard** holds for real bindings on real
// nodes, and that the same run with the guard off does change them.
//
// Run with `npm run test:figma -- replace-variables-preview`.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, withScratchPage, cleanupTestArtifacts } from "@Test Harness"

@import { previewWouldWrite, previewRecord } from "@Rename Preview"

/** A collection holding one variable of the given type. */
function makeCollection(name, variableName, type, value) {
  var collection = figma.variables.createVariableCollection(name);
  var variable = figma.variables.createVariable(variableName, collection, type);
  variable.setValueForMode(collection.modes[0].modeId, value);
  return { collection: collection, variable: variable };
}

function boundIdFor(node, property) {
  var bound = node.boundVariables && node.boundVariables[property];
  if (!bound) return null;
  var entry = Array.isArray(bound) ? bound[0] : bound;
  return entry && entry.id ? entry.id : null;
}

testBegin('replace-variables-preview');

(async function () {
  await it('the shared guard says "do not write" in preview mode and "write" otherwise', function () {
    expect(previewWouldWrite({ previewOnly: true })).toBe(false);
    expect(previewWouldWrite({ previewOnly: false })).toBe(true);
    // A missing context must default to writing: the apply path passes a ctx without the flag
    // in older saved copies of this script, and silently not writing would be worse.
    expect(previewWouldWrite({})).toBe(true);
    expect(previewWouldWrite(null)).toBe(true);
  });

  await it('recording a row is a no-op without a plan to record into', function () {
    var ctx = { previewOnly: true };
    previewRecord(ctx, 'somewhere', 'a', 'b');
    expect(ctx.plan === undefined).toBe(true);

    var withPlan = { previewOnly: true, plan: [] };
    previewRecord(withPlan, 'node · fills', 'Source/red', 'Target/red');
    expect(withPlan.plan).toHaveLength(1);
    expect(withPlan.plan[0].where).toBe('node · fills');
    expect(withPlan.plan[0].from).toBe('Source/red');
    expect(withPlan.plan[0].to).toBe('Target/red');
  });

  await itInTestFile('a bound property on a real node is left alone under the guard', async function () {
    var made = makeCollection(testPrefix() + ' rv-preview', testPrefix() + '/radius', 'FLOAT', 12);
    try {
      await withScratchPage(async function (page) {
        var rect = figma.createRectangle();
        page.appendChild(rect);
        rect.setBoundVariable('topLeftRadius', made.variable);
        var before = boundIdFor(rect, 'topLeftRadius');
        expect(before).toBe(made.variable.id);

        // What the script does at its direct-binding site, both ways.
        var previewCtx = { previewOnly: true, plan: [] };
        if (previewWouldWrite(previewCtx)) rect.setBoundVariable('topLeftRadius', null);
        expect(boundIdFor(rect, 'topLeftRadius')).toBe(before, 'preview must not unbind');

        var applyCtx = { previewOnly: false, plan: [] };
        if (previewWouldWrite(applyCtx)) rect.setBoundVariable('topLeftRadius', null);
        expect(boundIdFor(rect, 'topLeftRadius')).toBe(null, 'apply does unbind');
      });
    } finally {
      try {
        made.collection.remove();
      } catch (e) {}
    }
  });

  await itInTestFile('a fills write on a real node is left alone under the guard', async function () {
    var made = makeCollection(testPrefix() + ' rv-fills', testPrefix() + '/fill', 'COLOR', { r: 1, g: 0, b: 0 });
    try {
      await withScratchPage(async function (page) {
        var rect = figma.createRectangle();
        page.appendChild(rect);
        rect.fills = [
          figma.variables.setBoundVariableForPaint(
            { type: 'SOLID', color: { r: 1, g: 0, b: 0 } },
            'color',
            made.variable
          )
        ];
        var boundBefore = rect.fills[0].boundVariables.color.id;
        expect(boundBefore).toBe(made.variable.id);

        var stripped = JSON.parse(JSON.stringify(rect.fills));
        delete stripped[0].boundVariables;

        var previewCtx = { previewOnly: true, plan: [] };
        if (previewWouldWrite(previewCtx)) rect.fills = stripped;
        expect(rect.fills[0].boundVariables.color.id).toBe(boundBefore, 'preview must not rewrite fills');

        var applyCtx = { previewOnly: false, plan: [] };
        if (previewWouldWrite(applyCtx)) rect.fills = stripped;
        // Figma normalises a stripped paint to an empty boundVariables rather than dropping the
        // container, so assert the colour binding is gone rather than the shape around it.
        var after = rect.fills[0].boundVariables;
        expect(!after || !after.color).toBe(true, 'apply does rewrite fills');
      });
    } finally {
      try {
        made.collection.remove();
      } catch (e) {}
    }
  });

  await itInTestFile('a variables-table alias is left alone under the guard', async function () {
    var target = makeCollection(testPrefix() + ' rv-target', testPrefix() + '/base', 'FLOAT', 4);
    var host = makeCollection(testPrefix() + ' rv-host', testPrefix() + '/alias', 'FLOAT', 8);
    try {
      var modeId = host.collection.modes[0].modeId;
      host.variable.setValueForMode(modeId, { type: 'VARIABLE_ALIAS', id: target.variable.id });
      var before = host.variable.valuesByMode[modeId];
      expect(before.id).toBe(target.variable.id);

      var previewCtx = { previewOnly: true, plan: [] };
      if (previewWouldWrite(previewCtx)) host.variable.setValueForMode(modeId, 16);
      expect(host.variable.valuesByMode[modeId].id).toBe(target.variable.id, 'preview must not rewrite the alias');

      var applyCtx = { previewOnly: false, plan: [] };
      if (previewWouldWrite(applyCtx)) host.variable.setValueForMode(modeId, 16);
      expect(host.variable.valuesByMode[modeId]).toBe(16, 'apply does rewrite it');
    } finally {
      try { host.collection.remove(); } catch (e) {}
      try { target.collection.remove(); } catch (e) {}
    }
  });

  await itInTestFile('leaves nothing behind', async function () {
    expect(await cleanupTestArtifacts()).toBe(0);
  });

  testFinish();
})();
