/**
 * Package-scoped resolution (`.plans/32-packages.md`, steps 3–4). Every case here is opt-in:
 * `findScript`'s third argument and `extractFunctions`'s fifth are both new and optional, so
 * `tests/import-resolver.test.js`'s full existing suite is the real regression net — it stays
 * green, unedited, proving single-file/global-list resolution is unchanged for every script that
 * exists today. These tests cover only the new, additive behaviour.
 *
 * Steps 1, 2, 5 and 6 (manifest compilation, hiding package members from the Libraries list,
 * trimming the five DSF scripts' import blocks) are not implemented in this pass — see the plan's
 * Status note. `scripts[].packageId` here is set by hand, standing in for what a compiled
 * manifest would attach; nothing produces it yet.
 */
const test = require('node:test');
const assert = require('node:assert');

const resolver = require('../src/import-resolver.js');
const { findScript, extractFunctions, packageSiblingLookup, resolveImports } = resolver;

function pkg(name, packageId, code) {
  return { name: name, filename: name + '.js', code: code, packageId: packageId };
}

test('findScript prefers a package member over a same-named global script', () => {
  const scripts = [
    pkg('@Helper', undefined, 'function helperFn() { return "global"; }'),
    pkg('@Helper', 'design-system', 'function helperFn() { return "package"; }'),
  ];
  const found = findScript(scripts, '@Helper', 'design-system');
  assert.strictEqual(found, scripts[1]);
});

test('findScript falls back to the global list when the package has no match', () => {
  const scripts = [
    pkg('@Core Library', undefined, 'function coreFn() {}'),
    pkg('@Foundation', 'design-system', 'function foundationFn() {}'),
  ];
  const found = findScript(scripts, '@Core Library', 'design-system');
  assert.strictEqual(found, scripts[0]);
});

test('findScript with no packageId behaves exactly as the two-argument call', () => {
  const scripts = [pkg('@Foundation', 'design-system', 'function foundationFn() {}')];
  assert.strictEqual(findScript(scripts, '@Foundation'), findScript(scripts, '@Foundation', undefined));
});

test('packageSiblingLookup is null with no packageId', () => {
  const scripts = [pkg('@Foundation', undefined, 'function f() {}')];
  assert.strictEqual(packageSiblingLookup(scripts, undefined), null);
});

test('packageSiblingLookup finds a function in a package member, not in an outside script', () => {
  const scripts = [
    pkg('@Foundation', 'design-system', 'function usesHelper() { return helperFn(); }'),
    pkg('@Helpers', 'design-system', 'function helperFn() { return 1; }'),
    pkg('@Unrelated', undefined, 'function helperFn() { return "wrong one"; }'),
  ];
  const lookup = packageSiblingLookup(scripts, 'design-system');
  assert.strictEqual(lookup('helperFn'), scripts[1]);
  assert.strictEqual(lookup('missingFn'), null);
});

test('packageSiblingLookup can find the script it was first asked about, for a call that loops back', () => {
  // The closure is keyed by package id, not "every member except the one I started from" — see
  // the doc comment on packageSiblingLookup for why that exclusion would break a lookback.
  const scripts = [
    pkg('@Foundation', 'design-system', 'function sharedUtil() { return 2; }'),
    pkg('@Helpers', 'design-system', 'function helperFn() {}'),
  ];
  const lookup = packageSiblingLookup(scripts, 'design-system');
  assert.strictEqual(lookup('sharedUtil'), scripts[0]);
});

test('extractFunctions with no siblingLookup is unaffected — a name absent from sourceCode stays absent', () => {
  const code = extractFunctions('function a() { return b(); }', ['a']);
  assert.match(code, /function a/);
  assert.doesNotMatch(code, /function b/);
});

test('extractFunctions follows a call into a sibling when siblingLookup is given', () => {
  const sourceA = 'function usesHelper() { return helperFn(); }';
  const sourceB = 'function helperFn() { return 1; }';
  const lookup = function (name) { return name === 'helperFn' ? { code: sourceB } : null; };
  const code = extractFunctions(sourceA, ['usesHelper'], undefined, undefined, lookup);
  assert.match(code, /function usesHelper/);
  assert.match(code, /function helperFn/);
});

test('a sibling function\'s own dependency, back in the original file, is also pulled in', () => {
  const sourceA = 'function usesHelper() { return helperFn(); }\nfunction sharedUtil() { return 2; }';
  const sourceB = 'function helperFn() { return sharedUtil(); }'; // calls back into A
  // A real siblingLookup (packageSiblingLookup) is keyed by package, so it can find sharedUtil
  // back in A just as readily as it found helperFn in B — see that function's own tests for why
  // it must not exclude "the file I started from" from later, deeper lookups.
  const lookup = function (name) {
    if (name === 'helperFn') return { code: sourceB };
    if (name === 'sharedUtil') return { code: sourceA };
    return null;
  };
  const code = extractFunctions(sourceA, ['usesHelper'], undefined, undefined, lookup);
  assert.match(code, /function usesHelper/);
  assert.match(code, /function helperFn/);
  assert.match(code, /function sharedUtil/);
});

test('a three-member chain (A -> B -> C) resolves across two hops', () => {
  const sourceA = 'function top() { return middle(); }';
  const sourceB = 'function middle() { return bottom(); }';
  const sourceC = 'function bottom() { return 3; }';
  const lookup = function (name) {
    if (name === 'middle') return { code: sourceB };
    if (name === 'bottom') return { code: sourceC };
    return null;
  };
  const code = extractFunctions(sourceA, ['top'], undefined, undefined, lookup);
  assert.match(code, /function top/);
  assert.match(code, /function middle/);
  assert.match(code, /function bottom/);
});

test('own file wins over a sibling of the same name', () => {
  const sourceA = 'function shared() { return "own"; }\nfunction usesShared() { return shared(); }';
  const sourceB = 'function shared() { return "sibling"; }';
  const lookup = function (name) { return name === 'shared' ? { code: sourceB } : null; };
  const code = extractFunctions(sourceA, ['usesShared'], undefined, undefined, lookup);
  const occurrences = (code.match(/function shared/g) || []).length;
  assert.strictEqual(occurrences, 1, 'shared() should be extracted once, from the consumer\'s own file');
  assert.match(code, /return "own"/);
});

test('a cross-file cycle terminates rather than recursing forever', () => {
  const sourceA = 'function a() { return b(); }';
  const sourceB = 'function b() { return a(); }';
  const lookup = function (name) {
    if (name === 'a') return { code: sourceA };
    if (name === 'b') return { code: sourceB };
    return null;
  };
  const code = extractFunctions(sourceA, ['a'], undefined, undefined, lookup);
  assert.match(code, /function a/);
  // Does not throw, does not hang — the assertion is that this line was reached at all.
});

test('resolveImports end-to-end: package scope is preferred, and a cross-member call needs no import', () => {
  const scripts = [
    pkg('@Foundation', 'design-system',
      '@import { helperFn } from "@Helpers"\nfunction publicFn() { return helperFn(); }'),
    pkg('@Helpers', 'design-system', 'function helperFn() { return usesShared(); }\n' +
      'function usesShared() { return 1; }'),
    pkg('@Helpers', undefined, 'function helperFn() { return "wrong global"; }'),
  ];
  const consumer = '@import { publicFn } from "@Foundation"\nvar x = publicFn();';
  const resolved = resolveImports(consumer, scripts, { packageId: 'design-system' });
  assert.match(resolved, /function publicFn/);
  assert.doesNotMatch(resolved, /wrong global/);
});

test('resolveImports without a packageId option resolves exactly like plain findScript, no special casing', () => {
  // Two scripts sharing a display name is a degenerate case either way, package-aware or not —
  // the point here is only that omitting `packageId` does not change *which* result wins, not
  // which particular one that happens to be.
  const scripts = [
    pkg('@Helpers', 'design-system', 'function helperFn() { return "first"; }'),
    pkg('@Helpers', undefined, 'function helperFn() { return "second"; }'),
  ];
  const consumer = '@import { helperFn } from "@Helpers"';
  const resolved = resolveImports(consumer, scripts);
  const expected = findScript(scripts, '@Helpers');
  assert.match(resolved, expected === scripts[0] ? /"first"/ : /"second"/);
});
