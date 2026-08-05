// Tests: select by styles or variables
// @DOC_START
// # Tests: select by styles or variables
// In-Figma spec for `select-by-styles-variables`. Not shipped (`_` prefix).
//
// What only this can prove: that the node predicates find a style through a **real**
// `fillStyleId` and a variable through a **real** `boundVariables` entry. Node tests can check
// the matcher, but they cannot apply a style to a rectangle.
//
// Run with `npm run test:figma -- select-by`. Cases that create anything need a file whose
// name contains `codefig-test`.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, withScratchPage, cleanupTestArtifacts } from "@Test Harness"
@import { nodeMatches, nodeUsesMatchingStyle, nodeUsesMatchingVariable } from "Select by styles or variables"
// nameMatches must be imported explicitly: dependency extraction only follows functions
// declared in the *same* source script, and the predicates above call it across scripts.
// Without it they throw ReferenceError inside their own try/catch and quietly report "no match".
@import { nameMatches } from "@Pattern Matching"

/** Apply a paint style to a node, preferring the async setter dynamic-page files require. */
async function applyFillStyle(node, style) {
  if (typeof node.setFillStyleIdAsync === 'function') {
    await node.setFillStyleIdAsync(style.id);
    return;
  }
  node.fillStyleId = style.id;
}

testBegin('select-by');

(async function () {
  await it('the predicates survive @import into the sandbox', function () {
    expect(typeof nodeMatches).toBe('function');
    expect(typeof nodeUsesMatchingStyle).toBe('function');
    expect(typeof nodeUsesMatchingVariable).toBe('function');
  });

  await it('an empty search term matches nothing, rather than everything', async function () {
    // The library treats a blank pattern as "no filter"; these predicates must not, or
    // running the script with an empty field would select the whole page.
    var fake = { type: 'RECTANGLE', fillStyleId: '' };
    expect(await nodeUsesMatchingStyle(fake, '', false)).toBe(false);
    expect(await nodeUsesMatchingStyle(fake, '   ', false)).toBe(false);
    expect(await nodeUsesMatchingVariable(fake, '')).toBe(false);
  });

  await itInTestFile('finds a style by substring and by wildcard through a real fillStyleId', async function () {
    var style = figma.createPaintStyle();
    style.name = testPrefix() + '/Brand/Primary/Fill';
    style.paints = [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.8 } }];
    try {
      await withScratchPage(async function (page) {
        var rect = figma.createRectangle();
        page.appendChild(rect);
        await applyFillStyle(rect, style);

        expect(await nodeUsesMatchingStyle(rect, 'Primary', false)).toBe(true);
        expect(await nodeUsesMatchingStyle(rect, 'primary', false)).toBe(true);
        expect(await nodeUsesMatchingStyle(rect, testPrefix() + '/*/Primary/*', false)).toBe(true);
        expect(await nodeUsesMatchingStyle(rect, 'Secondary', false)).toBe(false);
        // Brackets stay literal: this is the plan-10 rule reaching a real node.
        expect(await nodeUsesMatchingStyle(rect, 'Brand [Primary]', false)).toBe(false);
        expect(await nodeMatches(rect, 'Primary', false)).toBe(true);
      });
    } finally {
      try {
        style.remove();
      } catch (e) {}
    }
  });

  await itInTestFile('finds a variable through a real bound property', async function () {
    var collection = figma.variables.createVariableCollection(testPrefix() + ' select-by');
    try {
      var radius = figma.variables.createVariable(testPrefix() + '/radius/lg', collection, 'FLOAT');
      radius.setValueForMode(collection.modes[0].modeId, 16);

      await withScratchPage(async function (page) {
        var rect = figma.createRectangle();
        page.appendChild(rect);
        rect.setBoundVariable('topLeftRadius', radius);

        expect(await nodeUsesMatchingVariable(rect, 'radius/lg')).toBe(true);
        expect(await nodeUsesMatchingVariable(rect, 'RADIUS/LG')).toBe(true);
        expect(await nodeUsesMatchingVariable(rect, testPrefix() + '/radius/*')).toBe(true);
        expect(await nodeUsesMatchingVariable(rect, 'radius/sm')).toBe(false);
        expect(await nodeMatches(rect, 'radius/lg', false)).toBe(true);
      });
    } finally {
      try {
        collection.remove();
      } catch (e) {}
    }
  });

  await itInTestFile('a node with no style or variable never matches', async function () {
    await withScratchPage(async function (page) {
      var rect = figma.createRectangle();
      page.appendChild(rect);
      expect(await nodeMatches(rect, 'anything', false)).toBe(false);
    });
  });

  await itInTestFile('leaves nothing behind', async function () {
    expect(await cleanupTestArtifacts()).toBe(0);
  });

  testFinish();
})();
