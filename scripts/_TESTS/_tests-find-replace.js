// Tests: find and replace semantics
// @DOC_START
// # Tests: find and replace semantics
// In-Figma spec for the shared matcher (plan 10) and the two rename scripts that use it.
//
// Not shipped (`_` prefix). Run with `npm run test:figma`, or on its own with
// `node figma-run.js _tests-find-replace`.
//
// `tests/pattern-matching.test.js` already covers the matcher in Node. What only this can
// prove: that the library's functions survive `@import` extraction into the sandbox, and that
// the shipped rename functions do the right thing to **real** Figma styles — including the
// regression that started plan 10, where `Text [Legacy]` mangled `Text Legacy Body`.
//
// Cases that create styles only run in a file whose name contains `codefig-test`.
// @DOC_END

@import { testBegin, it, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { hasRenameOperation, planRenameStyles, applyRenamePlan, toRenameOperations, filterBySearchIn } from "Rename styles"
@import { previewRow, flagPreviewCollisions, previewCounts, previewSignature } from "@Rename Preview"
@import { nameMatches, renameByPattern, patternMode, patternModeNote } from "@Pattern Matching"

// ============================================================================
// Fixtures
// ============================================================================

/** Style names that made plan 10 necessary. Prefixed so cleanup can always find them. */
function testStyleNames() {
  var p = testPrefix() + '/';
  return [
    p + 'Text [Legacy] Body',
    p + 'Text Legacy Body',
    p + 'Brand (2024)/Accent',
    p + 'Brand 2024/Accent',
    p + 'V4/Brand/Primary',
    p + 'V5/Brand/Primary'
  ];
}

/** Create the fixture paint styles and hand them back. */
function createTestStyles() {
  var names = testStyleNames();
  var styles = [];
  for (var i = 0; i < names.length; i++) {
    var style = figma.createPaintStyle();
    style.name = names[i];
    style.paints = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
    styles.push(style);
  }
  return styles;
}

function removeStyles(styles) {
  for (var i = 0; i < styles.length; i++) {
    try {
      styles[i].remove();
    } catch (e) {}
  }
}

/** A single find/replace operation, the shape planRenameStyles wants. */
function op(find, replace) {
  return toRenameOperations(null, find, replace);
}

function styleNamed(styles, suffix) {
  for (var i = 0; i < styles.length; i++) {
    if (styles[i].name === testPrefix() + '/' + suffix) return styles[i];
  }
  return null;
}

// ============================================================================
// Suite
// ============================================================================

testBegin('find-replace');

(async function () {
  // --- The library, running in the sandbox rather than in Node ---------------

  await it('the matcher survives @import into the sandbox', function () {
    expect(typeof nameMatches).toBe('function');
    expect(typeof renameByPattern).toBe('function');
    expect(nameMatches('Text/5xl/Regular', 'regular')).toBe(true);
  });

  await it('literal mode does not treat [Legacy] as a character class', function () {
    expect(nameMatches('Text [Legacy] Body', 'Text [Legacy]')).toBe(true);
    expect(nameMatches('Text Legacy Body', 'Text [Legacy]')).toBe(false);
    expect(renameByPattern('Text Legacy Body', 'Text [Legacy]', 'Text', 0, 1)).toBe('Text Legacy Body');
  });

  await it('wildcards work and regex needs the toggle', function () {
    expect(nameMatches('V4/Brand/Primary', 'V4/*/Primary')).toBe(true);
    expect(nameMatches('size-12', '(\\w+)-(\\d+)')).toBe(false);
    expect(nameMatches('size-12', '(\\w+)-(\\d+)', { useRegex: true })).toBe(true);
    expect(patternMode('a*b')).toBe('wildcard');
    expect(patternModeNote('(\\w+)-(\\d+)')).toContain('literal text');
  });

  await it('counters and $& expand', function () {
    expect(renameByPattern('x', 'x', '$nn', 4, 9)).toBe('05');
    expect(renameByPattern('color/pine', 'pine', '[$&]', 0, 1)).toBe('color/[pine]');
  });

  // --- The shipped script's own guard ---------------------------------------

  await it('an unconfigured rename is refused', function () {
    expect(hasRenameOperation('', '')).toBe(false);
    expect(hasRenameOperation('', 'Icon')).toBe(true);
    expect(hasRenameOperation('Regular', '')).toBe(true);
  });

  // --- Against real styles --------------------------------------------------

  await itInTestFile('renames only the bracketed style, leaving its neighbour alone', async function () {
    var styles = createTestStyles();
    try {
      var target = styleNamed(styles, 'Text [Legacy] Body');
      var bystander = styleNamed(styles, 'Text Legacy Body');
      expect(target).toBeTruthy();
      expect(bystander).toBeTruthy();

      var entries = planRenameStyles([target, bystander], op(testPrefix() + '/Text [Legacy]', testPrefix() + '/Text'));
      // The bystander does not even make it into the plan: it never matched.
      expect(entries).toHaveLength(1);
      expect(applyRenamePlan(entries)).toBe(1);

      expect(target.name).toBe(testPrefix() + '/Text Body');
      expect(bystander.name).toBe(testPrefix() + '/Text Legacy Body');
    } finally {
      removeStyles(styles);
    }
  });

  await itInTestFile('parenthesised names are literal against real styles too', async function () {
    var styles = createTestStyles();
    try {
      var target = styleNamed(styles, 'Brand (2024)/Accent');
      var bystander = styleNamed(styles, 'Brand 2024/Accent');
      var entries = planRenameStyles([target, bystander], op('Brand (2024)/', 'Brand/'));
      expect(applyRenamePlan(entries)).toBe(1);
      expect(target.name).toBe(testPrefix() + '/Brand/Accent');
      expect(bystander.name).toBe(testPrefix() + '/Brand 2024/Accent');
    } finally {
      removeStyles(styles);
    }
  });

  await itInTestFile('a preview run changes nothing at all', async function () {
    // Plan 11's first acceptance criterion, asserted rather than eyeballed.
    var styles = createTestStyles();
    try {
      var before = styles.map(function (style) { return style.name; });
      var entries = planRenameStyles(styles, op('V4', 'V5'));
      expect(entries.length > 0).toBe(true);
      var after = styles.map(function (style) { return style.name; });
      expect(after.join('|')).toBe(before.join('|'));
    } finally {
      removeStyles(styles);
    }
  });

  await itInTestFile('the plan lists exactly the changes the apply performs', async function () {
    // The other half of the criterion: capture the rows, apply, diff against reality.
    var styles = createTestStyles();
    try {
      var entries = planRenameStyles(styles, op('V4', 'V5'));
      var planned = entries.map(function (entry) {
        return { style: entry.style, from: entry.row.from, to: entry.row.to, changed: entry.row.changed };
      });

      applyRenamePlan(entries);

      for (var i = 0; i < planned.length; i++) {
        var expected = planned[i].changed ? planned[i].to : planned[i].from;
        expect(planned[i].style.name).toBe(expected);
      }
      // And nothing outside the plan moved.
      var untouched = styleNamed(styles, 'Text Legacy Body');
      expect(untouched.name).toBe(testPrefix() + '/Text Legacy Body');
    } finally {
      removeStyles(styles);
    }
  });

  await itInTestFile('a collision with an existing style name is flagged, not silently applied', async function () {
    var styles = createTestStyles();
    try {
      // V4/Brand/Primary → V5/Brand/Primary, which already exists in the fixture set.
      var entries = planRenameStyles([styleNamed(styles, 'V4/Brand/Primary')], op('V4', 'V5'));
      var rows = entries.map(function (entry) { return entry.row; });
      flagPreviewCollisions(rows, styles.map(function (style) { return style.name; }));
      expect(rows).toHaveLength(1);
      expect(rows[0].flags).toContain('collision');
      expect(previewCounts(rows).collision).toBe(1);
    } finally {
      removeStyles(styles);
    }
  });

  await itInTestFile('the signature changes when the plan changes', async function () {
    var styles = createTestStyles();
    try {
      var a = previewSignature(planRenameStyles(styles, op('V4', 'V5')).map(function (e) { return e.row; }));
      var b = previewSignature(planRenameStyles(styles, op('V4', 'V6')).map(function (e) { return e.row; }));
      expect(a === b).toBe(false);
    } finally {
      removeStyles(styles);
    }
  });

  await itInTestFile('searchIn filters real style names, wildcards included', async function () {
    var styles = createTestStyles();
    try {
      expect(filterBySearchIn(styles, 'V4/*/Primary')).toHaveLength(1);
      expect(filterBySearchIn(styles, testPrefix() + '/Brand')).toHaveLength(2);
      expect(filterBySearchIn(styles, 'nothing-matches-this')).toHaveLength(0);
      expect(filterBySearchIn(styles, '')).toHaveLength(styles.length);
    } finally {
      removeStyles(styles);
    }
  });

  await itInTestFile('a rename that would empty a name is flagged and skipped', async function () {
    var styles = createTestStyles();
    try {
      var one = styleNamed(styles, 'V4/Brand/Primary');
      var before = one.name;
      var entries = planRenameStyles([one], op('*', ''));
      expect(entries).toHaveLength(1);
      expect(entries[0].row.flags).toContain('empty');
      expect(applyRenamePlan(entries)).toBe(0);
      expect(one.name).toBe(before);
    } finally {
      removeStyles(styles);
    }
  });

  await itInTestFile('leaves nothing behind', async function () {
    var strays = await cleanupTestArtifacts();
    expect(strays).toBe(0);
  });

  testFinish();
})();
