// @Test Harness
// @DOC_START
// # Runs in-Figma specs against the real API with scratch pages and assertions
//
// ## Overview
//
// Minimal runner for specs that must exercise the **real** Figma API — variable scopes, style binding, async collection loading. Specs live in `scripts/_TESTS/` (the `_` prefix keeps them out of the shipped build) and are driven with `npm run test:figma` while `npm run dev` is running and the plugin is open.
//
// ### Writing a spec
//
// ```js
// @import { testBegin, it, itInTestFile, expect, testFinish, withScratchPage } from "@Test Harness"
//
// testBegin('my-suite');
// (async function () {
//   await it('adds up', function () { expect(1 + 1).toBe(2); });
//   await itInTestFile('touches the document', async function () {
//     await withScratchPage(async function (page) { expect(page.name).toContain('codefig-test'); });
//   });
//   testFinish();
// })();
// ```
//
// ### Two rules
//
// 1. **Call `testFinish()`.** Completion is inferred from idleness; without it the suite times out. `testFinish()` calls `window.codefigRunComplete()`.
// 2. **Mutating cases go in `itInTestFile`.** Those only run in a file whose name contains `codefig-test`. Read-only cases use `it` anywhere.
//
// State lives on the mock `window` — `@import` extracts only top-level function declarations.
//
// ## Exported functions
//
// | Category | Functions |
// |----------|-----------|
// | Suite | testBegin, it, itInTestFile, testFinish |
// | Assertions | expect (toBe, toEqual, toContain, toMatch, toBeTruthy, toBeFalsy, toThrow) |
// | Fixtures | withScratchPage, testPrefix, isTestFile, cleanupTestArtifacts |
// @DOC_END

// ============================================================================
// SUITE STATE (on window — see the note above)
// ============================================================================

/** Everything a test-created object is named with, so strays are always identifiable. */
function testPrefix() {
  return '__codefig-test__';
}

/**
 * Is this a file where the suite may create and delete things?
 * Deliberately conservative: name the file so it is obvious, or mutation cases skip.
 */
function isTestFile() {
  var name = '';
  try {
    name = String(figma.root.name || '');
  } catch (e) {
    return false;
  }
  return name.toLowerCase().indexOf('codefig-test') !== -1;
}

function testBegin(suiteName) {
  window.__codefigTests = {
    suite: suiteName || 'unnamed',
    cases: [],
    pass: 0,
    fail: 0,
    skip: 0
  };
  console.log('=== ' + window.__codefigTests.suite + ' ===');
  if (!isTestFile()) {
    console.log(
      'Read-only mode: this file is not named "*codefig-test*", so cases that touch the ' +
        'document will be skipped. Open a scratch file with that in its name to run them.'
    );
  }
}

function testState() {
  if (!window.__codefigTests) testBegin('unnamed');
  return window.__codefigTests;
}

// ============================================================================
// CASES
// ============================================================================

/** Run one case. Works for sync and async functions; a throw is a failure, not a crash. */
async function it(name, fn) {
  var state = testState();
  try {
    await fn();
    state.pass++;
    state.cases.push({ name: name, status: 'pass' });
    console.log('  ✅ ' + name);
  } catch (e) {
    var message = e && e.message ? e.message : String(e);
    state.fail++;
    state.cases.push({ name: name, status: 'fail', message: message });
    console.error('  ❌ ' + name + ' — ' + message);
  }
}

/** A case that mutates the document: runs only in a file named for testing. */
async function itInTestFile(name, fn) {
  if (!isTestFile()) {
    var state = testState();
    state.skip++;
    state.cases.push({ name: name, status: 'skip', message: 'not a codefig-test file' });
    console.log('  ⏭  ' + name + ' (skipped: not a codefig-test file)');
    return;
  }
  await it(name, fn);
}

/**
 * Emit one machine-readable line and signal completion.
 * The CODEFIG_TEST_RESULT prefix is the contract figma-run.js and _run-all-tests.js read.
 */
function testFinish() {
  var state = testState();
  var summary = {
    suite: state.suite,
    pass: state.pass,
    fail: state.fail,
    skip: state.skip,
    cases: state.cases
  };
  console.log('CODEFIG_TEST_RESULT ' + JSON.stringify(summary));
  console.log(
    '=== ' + state.suite + ': ' + state.pass + ' passed, ' + state.fail + ' failed, ' +
      state.skip + ' skipped ==='
  );
  // A failing suite must fail the run, and an error log is what figma-run.js keys on.
  if (state.fail > 0) {
    console.error(state.suite + ': ' + state.fail + ' test(s) failed');
  }
  try {
    window.codefigRunComplete();
  } catch (e) {
    // Not fatal: the backend falls back to its idle heuristic.
  }
  return summary;
}

// ============================================================================
// ASSERTIONS
// ============================================================================

function testStringify(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

/** Matchers throw on failure; `it` turns that into a recorded failure. */
function expect(actual) {
  return {
    toBe: function (expected) {
      if (actual !== expected) {
        throw new Error('expected ' + testStringify(expected) + ', got ' + testStringify(actual));
      }
    },
    toEqual: function (expected) {
      var a = testStringify(actual);
      var b = testStringify(expected);
      if (a !== b) throw new Error('expected ' + b + ', got ' + a);
    },
    toContain: function (needle) {
      var haystack = actual == null ? '' : actual;
      var ok = typeof haystack === 'string'
        ? haystack.indexOf(needle) !== -1
        : Array.isArray(haystack) && haystack.indexOf(needle) !== -1;
      if (!ok) throw new Error(testStringify(actual) + ' does not contain ' + testStringify(needle));
    },
    toMatch: function (pattern) {
      var re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
      if (!re.test(String(actual))) {
        throw new Error(testStringify(actual) + ' does not match ' + String(re));
      }
    },
    toBeTruthy: function () {
      if (!actual) throw new Error('expected a truthy value, got ' + testStringify(actual));
    },
    toBeFalsy: function () {
      if (actual) throw new Error('expected a falsy value, got ' + testStringify(actual));
    },
    toHaveLength: function (n) {
      var len = actual == null ? -1 : actual.length;
      if (len !== n) throw new Error('expected length ' + n + ', got ' + len);
    },
    toThrow: function () {
      var threw = false;
      try {
        actual();
      } catch (e) {
        threw = true;
      }
      if (!threw) throw new Error('expected the function to throw');
    }
  };
}

// ============================================================================
// FIXTURES
// ============================================================================

/**
 * Run `fn` with a throwaway page, removed afterwards even if the spec throws.
 * The current page is never switched, so the viewport does not jump.
 */
async function withScratchPage(fn) {
  var page = figma.createPage();
  page.name = testPrefix() + ' scratch';
  try {
    return await fn(page);
  } finally {
    try {
      page.remove();
    } catch (e) {
      console.error('Could not remove the scratch page — remove "' + page.name + '" by hand.');
    }
  }
}

/**
 * Remove every local style and variable collection named with the test prefix.
 * Belt and braces for a spec that died before its own cleanup ran.
 */
async function cleanupTestArtifacts() {
  var removed = 0;
  var prefix = testPrefix();
  var i;

  var styleGroups = [
    await figma.getLocalPaintStylesAsync(),
    await figma.getLocalTextStylesAsync(),
    await figma.getLocalEffectStylesAsync(),
    await figma.getLocalGridStylesAsync()
  ];
  for (var g = 0; g < styleGroups.length; g++) {
    var styles = styleGroups[g];
    for (i = 0; i < styles.length; i++) {
      if (String(styles[i].name || '').indexOf(prefix) === 0) {
        try {
          styles[i].remove();
          removed++;
        } catch (e) {}
      }
    }
  }

  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (i = 0; i < collections.length; i++) {
    if (String(collections[i].name || '').indexOf(prefix) === 0) {
      try {
        collections[i].remove();
        removed++;
      } catch (e) {}
    }
  }

  var pages = figma.root.children;
  for (i = pages.length - 1; i >= 0; i--) {
    if (String(pages[i].name || '').indexOf(prefix) === 0 && pages[i].id !== figma.currentPage.id) {
      try {
        pages[i].remove();
        removed++;
      } catch (e) {}
    }
  }

  if (removed > 0) console.log('Cleaned up ' + removed + ' leftover test artifact(s)');
  return removed;
}
