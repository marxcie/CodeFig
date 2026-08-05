// Tests: replace-styles and replace-variables helpers
// @DOC_START
// # Tests: replace-styles and replace-variables helpers
// In-Figma spec for the two large replace scripts. Not shipped (`_` prefix).
//
// Both scripts are mostly orchestration around a cache and a live document, so the parts worth
// pinning are the name computations that decide **which** style or variable gets looked up —
// exactly where plan 10 changed behaviour, and where a silent mistake means "nothing was
// replaced" with no error.
//
// Read-only apart from the last two cases. Run with `npm run test:figma -- replace-scripts`.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { matchStyleNamePartial, expandReplacementStyleNameCandidates, styleCacheKey, cacheKeyNamePart, uniqueStringList } from "Replace styles"
@import { normalizeVariablePath, findPatternForPath, parseFullPath, getScope, bindingInSourceCollection } from "Replace variables"
@import { nameMatches, renameByPattern } from "@Pattern Matching"

testBegin('replace-scripts');

(async function () {
  // --- replace-styles: which style name gets looked up ----------------------

  await it('matchStyleNamePartial is substring, case-insensitive, with wildcards', function () {
    expect(matchStyleNamePartial('V5 / Text / 3xs / SemiBold', 'V5')).toBe(true);
    expect(matchStyleNamePartial('V5 / Text / 3xs / SemiBold', 'v5')).toBe(true);
    expect(matchStyleNamePartial('V4 / Text / 3xs / SemiBold', 'V5')).toBe(false);
    expect(matchStyleNamePartial('V5/Text/3xs/SemiBold', 'V5/*/SemiBold')).toBe(true);
    // A blank pattern matches nothing here on purpose: the callers treat "no filter"
    // separately, and a blank rule must never match every style in the file.
    expect(matchStyleNamePartial('anything', '')).toBe(false);
    expect(matchStyleNamePartial('anything', '   ')).toBe(false);
  });

  await it('brackets and parens in a style name stay literal', function () {
    expect(matchStyleNamePartial('Text [Legacy] Body', 'Text [Legacy]')).toBe(true);
    expect(matchStyleNamePartial('Text Legacy Body', 'Text [Legacy]')).toBe(false);
    expect(matchStyleNamePartial('Brand 2024/Accent', 'Brand (2024)/')).toBe(false);
  });

  await it('lookup candidates cover the slash-spacing both ways', function () {
    // The reason this exists: Figma files disagree about "a/b" vs "a / b", and a lookup that
    // only tries one spelling silently finds nothing.
    var candidates = expandReplacementStyleNameCandidates('V4/Text/3xs');
    expect(candidates.length > 1).toBe(true);
    expect(candidates).toContain('V4/Text/3xs');
    expect(candidates).toContain('V4 / Text / 3xs');

    var spaced = expandReplacementStyleNameCandidates('V4 / Text / 3xs');
    expect(spaced).toContain('V4 / Text / 3xs');
    expect(spaced).toContain('V4/Text/3xs');
  });

  await it('cache keys round-trip a name that contains the separator', function () {
    var key = styleCacheKey('V4 | Text', 'PAINT');
    expect(cacheKeyNamePart(key)).toBe('V4 | Text');
    expect(styleCacheKey('a', 'TEXT')).toBe('a|TEXT');
    expect(uniqueStringList(['a', 'b', 'a', '', null, 'b'])).toEqual(['a', 'b']);
  });

  // --- replace-variables: which variable path gets looked up ----------------

  await it('a variable path normalises to a single slash', function () {
    expect(normalizeVariablePath('color 2 / red')).toBe('color 2/red');
    expect(normalizeVariablePath('color 2/red')).toBe('color 2/red');
    expect(normalizeVariablePath('  a / b / c  ')).toBe('a/b/c');
    expect(normalizeVariablePath(null)).toBe('');
  });

  await it('a find pattern is normalised in literal mode and left alone in regex mode', function () {
    // Normalising a regex would corrupt it, so regex mode passes the user's syntax through.
    expect(findPatternForPath('color 2 / red', {})).toBe('color 2/red');
    expect(findPatternForPath('color 2 / red', { useRegex: false })).toBe('color 2/red');
    expect(findPatternForPath('a\\s*/\\s*b', { useRegex: true })).toBe('a\\s*/\\s*b');
  });

  await it('a normalised path is what searchFor matches against', function () {
    var path = normalizeVariablePath(getScope('Color', 'red/500'));
    expect(path).toBe('Color/red/500');
    expect(nameMatches(path, findPatternForPath('Color / red', {}))).toBe(true);
    expect(nameMatches(path, findPatternForPath('color/red', {}))).toBe(true);
    expect(nameMatches(path, findPatternForPath('Color/*/500', {}))).toBe(true);
    expect(renameByPattern(path, 'Color', 'Brand', 0, 1)).toBe('Brand/red/500');
  });

  await it('a full path parses back into collection and variable', function () {
    var parsed = parseFullPath('Color / red/500');
    expect(parsed.collectionName).toBe('Color');
    expect(parsed.variableName).toBe('red/500');
  });

  await it('an empty source collection means all collections', function () {
    expect(bindingInSourceCollection('Anything', '')).toBe(true);
    expect(bindingInSourceCollection('Color', 'Color')).toBe(true);
    expect(bindingInSourceCollection('Color', 'Spacing')).toBe(false);
  });

  // --- against real objects -------------------------------------------------

  await itInTestFile('the computed path matches a real variable in a real collection', async function () {
    var collection = figma.variables.createVariableCollection(testPrefix() + ' color 2');
    try {
      var variable = figma.variables.createVariable('red/500', collection, 'COLOR');
      variable.setValueForMode(collection.modes[0].modeId, { r: 1, g: 0, b: 0 });

      var path = normalizeVariablePath(getScope(collection.name, variable.name));
      expect(path).toBe(testPrefix() + ' color 2/red/500');
      expect(nameMatches(path, findPatternForPath(collection.name + ' / red', {}))).toBe(true);

      // The rename that a "color 2 → color 1" rule would compute, on a real name.
      var renamed = renameByPattern(path, 'color 2', 'color 1', 0, 1);
      expect(renamed).toBe(testPrefix() + ' color 1/red/500');
    } finally {
      try {
        collection.remove();
      } catch (e) {}
    }
  });

  await itInTestFile('a real style name survives candidate expansion', async function () {
    var style = figma.createPaintStyle();
    style.name = testPrefix() + '/V4/Text/3xs';
    try {
      var candidates = expandReplacementStyleNameCandidates(style.name);
      expect(candidates).toContain(style.name);
      expect(matchStyleNamePartial(style.name, testPrefix() + '/V4/*')).toBe(true);
    } finally {
      try {
        style.remove();
      } catch (e) {}
      expect(await cleanupTestArtifacts()).toBe(0);
    }
  });

  testFinish();
})();
