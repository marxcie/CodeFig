// Tests: Move preserves bindings and refuses published sources
@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, withScratchPage } from "@Test Harness"
@import { copyOrMoveVariables, assertMoveSourceUnpublished, assertMoveBindingsReplaced } from "Copy or move variables"

testBegin('move-integrity');
(async function () {
  try {
    await it('published and unknown sources are refused', async function () {
      for (var i = 0; i < 2; i++) {
        var refused = false;
        var status = i === 0 ? 'PUBLISHED' : 'UNKNOWN';
        try { await assertMoveSourceUnpublished({ getPublishStatusAsync: async function () { return status; } }); }
        catch (e) { refused = true; }
        expect(refused).toBe(true);
      }
    });
    await itInTestFile('Move rebinds both a corner and a direct blur effect', async function () {
      var source = figma.variables.createVariableCollection(testPrefix() + '/move-source');
      var target = figma.variables.createVariableCollection(testPrefix() + '/move-target');
      try {
        await withScratchPage(async function (page) {
          var variable = figma.variables.createVariable('radius', source, 'FLOAT');
          variable.setValueForMode(source.modes[0].modeId, 16);
          var rect = figma.createRectangle(); page.appendChild(rect);
          rect.setBoundVariable('topLeftRadius', variable);
          rect.effects = [figma.variables.setBoundVariableForEffect(
            { type: 'LAYER_BLUR', radius: 16, visible: true, blurType: 'NORMAL' }, 'radius', variable)];
          var result = await copyOrMoveVariables({ sourceCol: source, targetCol: target,
            sourceGroup: '', targetGroup: '', sourceMode: '', targetMode: '', isMove: true });
          expect(result.variablesRemoved).toBe(1);
          expect(rect.boundVariables.topLeftRadius.id).toBe(target.variableIds[0]);
          expect(rect.effects[0].boundVariables.radius.id).toBe(target.variableIds[0]);
        });
      } finally {
        try { source.remove(); } catch (e) {}
        target.remove();
      }
    });
    await itInTestFile('remaining bindings prevent source deletion', async function () {
      var source = figma.variables.createVariableCollection(testPrefix() + '/move-unresolved');
      try {
        await withScratchPage(async function (page) {
          var variable = figma.variables.createVariable('radius', source, 'FLOAT');
          variable.setValueForMode(source.modes[0].modeId, 8);
          var rect = figma.createRectangle(); page.appendChild(rect);
          rect.setBoundVariable('topLeftRadius', variable);
          var mapping = {}; mapping[variable.id] = { id: 'replacement' };
          var refused = false;
          try { await assertMoveBindingsReplaced(mapping); } catch (e) { refused = true; }
          expect(refused).toBe(true);
          expect(source.variableIds.length).toBe(1);
        });
      } finally { source.remove(); }
    });
  } finally {
    testFinish();
  }
})();
