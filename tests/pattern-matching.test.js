/**
 * Fixture tests for the shared find/replace semantic in
 * scripts/CODEFIG_LIBRARIES/@pattern-matching.js.
 *
 * Wrong matching is silent — a pattern that matches too much renames the wrong styles and
 * a pattern that matches nothing looks like "the script did not run". Neither surfaces as
 * an error in Figma, which is why this file exists.
 *
 * The functions are pulled out of the library source and evaluated in a VM, the same way
 * validate-scripts.js exercises the piecewise-scale fixtures: scripts/ is plain JS that
 * never gets compiled or required, so there is nothing to import.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');

const LIBRARY = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@pattern-matching.js');

/** Evaluate the named functions (and their dependencies) out of the library source. */
function loadLibrary() {
  const source = fs.readFileSync(LIBRARY, 'utf8');
  const functions = resolver.extractFunctionMap(source);
  const wanted = [
    'escapeWildcards',
    'looksLikeRegex',
    'applyFigmaPlaceholders',
    'patternMode',
    'patternToRegex',
    'nameMatches',
    'renameByPattern',
    'patternModeNote',
    'compilePattern',
    'globToRegex',
    'wildcardMatch',
    'regexMatch',
    'fuzzyMatch',
    'globMatch',
    'calculateFuzzyScore',
    'levenshteinDistance',
    'matchPattern',
    'replaceWithPattern'
  ];
  const ctx = { console, Math, RegExp, String, Array, Object };
  vm.createContext(ctx);
  for (const name of wanted) {
    const code = functions.get(name);
    assert.ok(code, `${name} is not extractable from @pattern-matching.js`);
    vm.runInContext(code, ctx);
  }
  return ctx;
}

const lib = loadLibrary();
const { nameMatches, renameByPattern, patternToRegex, patternMode, patternModeNote, matchPattern, replaceWithPattern } = lib;

/** Rename one name with no counters in play. */
function rename(name, find, replace, opts) {
  return renameByPattern(name, find, replace, 0, 1, opts);
}

// ---------------------------------------------------------------------------
// 1-2. Literal mode: metacharacters in a name are text, not syntax
// ---------------------------------------------------------------------------

test('literal mode treats [Legacy] as text and leaves unrelated names alone', () => {
  // The regression this whole change exists for: auto-detection read [Legacy] as a
  // character class, so "Text Legacy Body" became "Textegacy Body".
  assert.equal(rename('Text [Legacy] Body', 'Text [Legacy]', 'Text'), 'Text Body');
  assert.equal(rename('Text Legacy Body', 'Text [Legacy]', 'Text'), 'Text Legacy Body');
  assert.equal(nameMatches('Text Legacy Body', 'Text [Legacy]'), false);
  assert.equal(nameMatches('Text [Legacy] Body', 'Text [Legacy]'), true);
});

test('literal mode does not let (2024) match 2024', () => {
  assert.equal(rename('Brand (2024)/Accent', 'Brand (2024)/', 'Brand/'), 'Brand/Accent');
  assert.equal(rename('Brand 2024/Accent', 'Brand (2024)/', 'Brand/'), 'Brand 2024/Accent');
  assert.equal(nameMatches('Brand 2024/Accent', 'Brand (2024)/'), false);
});

test('other metacharacters stay literal: + ? ^ $ | . { }', () => {
  assert.equal(nameMatches('size+1', 'size+1'), true);
  assert.equal(nameMatches('sizeee1', 'size+1'), false);
  assert.equal(nameMatches('a.b', 'a.b'), true);
  assert.equal(nameMatches('axb', 'a.b'), false);
  assert.equal(nameMatches('a|b', 'a|b'), true);
  assert.equal(nameMatches('spacing{2}', 'spacing{2}'), true);
  assert.equal(nameMatches('color?', 'color?'), true);
});

// ---------------------------------------------------------------------------
// 3. Wildcards
// ---------------------------------------------------------------------------

test('wildcards match in every position', () => {
  assert.equal(nameMatches('V4/Brand/Primary', 'V4/*/Primary'), true);
  assert.equal(nameMatches('V4/Brand/Deep/Primary', 'V4/*/Primary'), true);
  assert.equal(nameMatches('V5/Brand/Primary', 'V4/*/Primary'), false);
  assert.equal(nameMatches('color/pine', 'color/*'), true, 'trailing');
  assert.equal(nameMatches('color/pine', '*pine'), true, 'leading');
  assert.equal(nameMatches('a/b/c/d', 'a/*/c/*'), true, 'multiple');
  assert.equal(nameMatches('anything', '*'), true, 'bare * matches everything');
});

test('a wildcard pattern still escapes the rest of the pattern', () => {
  // Regression for the \\* correction in commit 55197f7: escaping first, then
  // un-escaping \* to .*, is what keeps both halves working at once.
  assert.equal(nameMatches('Brand (2024)/Accent', 'Brand (2024)/*'), true);
  assert.equal(nameMatches('Brand 2024/Accent', 'Brand (2024)/*'), false);
  assert.equal(patternToRegex('a*b').source, 'a.*b');
});

test('wildcard replace keeps the surrounding text', () => {
  assert.equal(rename('V4/Brand/Primary', 'V4/*/Primary', 'V5/Core/Primary'), 'V5/Core/Primary');
  assert.equal(rename('prefix V4/x/Primary suffix', 'V4/*/Primary', 'done'), 'prefix done suffix');
});

// ---------------------------------------------------------------------------
// 4. Regex only when asked for
// ---------------------------------------------------------------------------

test('regex applies only with useRegex, and the same input is literal without it', () => {
  const pattern = '(\\w+)-(\\d+)';
  assert.equal(nameMatches('size-12', pattern, { useRegex: true }), true);
  assert.equal(nameMatches('size-12', pattern), false, 'literal without the toggle');
  assert.equal(rename('size-12', pattern, '$1_$2', { useRegex: true }), 'size_12');
  assert.equal(rename('size-12', pattern, '$1_$2'), 'size-12', 'no match, so unchanged');
  assert.equal(patternMode(pattern), 'literal');
  assert.equal(patternMode(pattern, { useRegex: true }), 'regex');
  assert.equal(patternMode('a*b'), 'wildcard');
});

test('an unparseable regex falls back to the literal text rather than matching wildly', () => {
  assert.equal(nameMatches('a(b', 'a(b', { useRegex: true }), true);
  assert.equal(nameMatches('anything else', 'a(b', { useRegex: true }), false);
});

test('patternModeNote explains a metacharacter pattern left in literal mode', () => {
  assert.match(patternModeNote('(\\w+)-(\\d+)'), /treated as literal text/);
  assert.equal(patternModeNote('(\\w+)-(\\d+)', { useRegex: true }), '');
  assert.equal(patternModeNote('Text V1'), '', 'ordinary text needs no note');
  assert.equal(patternModeNote('V4/*'), '', 'a bare wildcard is not a regex near-miss');
  assert.equal(patternModeNote(''), '');
});

// ---------------------------------------------------------------------------
// 5. Case sensitivity
// ---------------------------------------------------------------------------

test('matchCase both ways', () => {
  assert.equal(nameMatches('Typography/Body', 'typography'), true);
  assert.equal(nameMatches('Typography/Body', 'typography', { matchCase: true }), false);
  assert.equal(nameMatches('Typography/Body', 'Typography', { matchCase: true }), true);
  assert.equal(rename('Text SemiBold', 'semibold', 'Regular'), 'Text Regular');
  assert.equal(rename('Text SemiBold', 'semibold', 'Regular', { matchCase: true }), 'Text SemiBold');
});

// ---------------------------------------------------------------------------
// 6. Blank find
// ---------------------------------------------------------------------------

test('a blank find replaces the entire name, like Figma', () => {
  assert.equal(rename('anything at all', '', 'Icon'), 'Icon');
  assert.equal(renameByPattern('a', '', 'Icon $nn', 4, 9), 'Icon 05');
  assert.equal(renameByPattern('keep', '', '$&-suffix', 0, 1), 'keep-suffix', '$& is the whole name');
});

test('a blank pattern is not a filter, but a blank find is not the same as a blank filter', () => {
  assert.equal(nameMatches('anything', ''), true);
  assert.equal(nameMatches('anything', '   '), true, 'whitespace in a filter box means nothing');
  // Deliberately asymmetric: a filter nobody filled in is no filter, but " " is a real
  // thing to search for, so find is only blank when it is truly empty.
  assert.equal(rename('a b', ' ', '-'), 'a-b');
  assert.equal(rename('anything', '   ', 'Icon'), 'anything', 'three spaces, not found');
});

// ---------------------------------------------------------------------------
// 7. Replacement tokens
// ---------------------------------------------------------------------------

test('$& inserts the whole match', () => {
  assert.equal(rename('color/pine', 'pine', '[$&]'), 'color/[pine]');
});

test('capture groups work in regex mode', () => {
  assert.equal(rename('font-24', '(\\w+)-(\\d+)', '$2-$1', { useRegex: true }), '24-font');
  assert.equal(rename('font-24', '(\\w+)-(\\d+)', '$1', { useRegex: true }), 'font');
});

test('ascending counters: $n $nn $nnn', () => {
  assert.equal(renameByPattern('x', 'x', '$n', 0, 3), '1');
  assert.equal(renameByPattern('x', 'x', '$n', 11, 20), '12');
  assert.equal(renameByPattern('x', 'x', '$nn', 0, 3), '01');
  assert.equal(renameByPattern('x', 'x', '$nnn', 0, 3), '001');
  assert.equal(renameByPattern('x', 'x', '$nnn', 123, 200), '124');
});

test('descending counters: $N $NN $NNN', () => {
  assert.equal(renameByPattern('x', 'x', '$N', 0, 3), '3');
  assert.equal(renameByPattern('x', 'x', '$NN', 0, 3), '03');
  assert.equal(renameByPattern('x', 'x', '$NNN', 0, 3), '003');
  assert.equal(renameByPattern('x', 'x', '$N', 2, 3), '1');
});

test('$n next to $nn keeps its own meaning', () => {
  // The negative lookaheads that separate $n from $nn are easy to break; pin the order.
  assert.equal(renameByPattern('x', 'x', '$n-$nn', 4, 9), '5-05');
  assert.equal(renameByPattern('x', 'x', '$nn-$n', 4, 9), '05-5');
  assert.equal(renameByPattern('x', 'x', '$nnn/$nn/$n', 4, 9), '005/05/5');
  assert.equal(renameByPattern('x', 'x', '$N-$NN-$NNN', 0, 9), '9-09-009');
  assert.equal(renameByPattern('x', 'x', '$n$N', 0, 9), '19');
});

test('every occurrence in one name is replaced, with the same counter value', () => {
  assert.equal(rename('a/x/a', 'a', 'b'), 'b/x/b');
  assert.equal(renameByPattern('a-a', 'a', '$n', 2, 5), '3-3');
});

test('a $ in the matched name is not re-expanded', () => {
  // Hand-splicing rather than String.replace is what makes this safe.
  assert.equal(rename('cost$&value', 'cost$&', 'price'), 'pricevalue');
  assert.equal(rename('a$1b', '$1', 'X'), 'aXb');
});

// ---------------------------------------------------------------------------
// 9. Scope strings — the rename-variables separator fix
// ---------------------------------------------------------------------------

test('a group path matches once the separator is normalised to /', () => {
  const scope = 'Typography/Body/Size';
  assert.equal(nameMatches(scope, 'Typography/Body'), true, 'the obvious way to scope to a group');
  assert.equal(nameMatches(scope, 'Typography'), true);
  assert.equal(nameMatches(scope, 'Typography/'), true);
  assert.equal(nameMatches(scope, 'Body'), true, 'contains, so a group name alone works');
  assert.equal(nameMatches(scope, 'typography'), true, 'case-insensitive, like its sibling scripts');
  assert.equal(nameMatches('Typography-serif/Body', 'Typography/'), false);
});

test('wildcards give back the precision that anchoring would have provided', () => {
  assert.equal(nameMatches('Color/typography/Accent', 'Typography/*'), true, 'contains, so a nested group hits');
  assert.equal(nameMatches('Color/typography/Accent', 'Color/*/Accent'), true);
  assert.equal(nameMatches('Color/typography/Accent', 'Color/*', { matchCase: true }), true);
});

// ---------------------------------------------------------------------------
// 10. Legacy wrappers stay put
// ---------------------------------------------------------------------------

test('matchPattern keeps its whole-name default and agrees with nameMatches when anchored', () => {
  // Legacy: the default is whole-name, which is why callers wrapped patterns in *…*.
  assert.equal(matchPattern('color/pine', 'pine').match, false, 'not a substring matcher');
  assert.equal(matchPattern('color/pine', '*pine*').match, true);
  assert.equal(matchPattern('color/pine', 'color/*').match, true);
  assert.equal(matchPattern('color/pine', 'COLOR/*').match, true, 'case-insensitive by default');
  // Pinning a legacy bug, not endorsing it: caseSensitive only ever suppressed the
  // pre-lowercasing, while the compiled wildcard kept its i flag, so the flag does
  // nothing in the default mode. Use nameMatches({ matchCase: true }), which works.
  assert.equal(matchPattern('color/pine', 'COLOR/*', { caseSensitive: true }).match, true);
  assert.equal(nameMatches('color/pine', 'COLOR/*', { matchCase: true, wholeName: true }), false);

  for (const [name, pattern] of [['color/pine', '*pine*'], ['color/pine', 'color/*'], ['a/b', 'a/*']]) {
    assert.equal(
      matchPattern(name, pattern).match,
      nameMatches(name, pattern, { wholeName: true }),
      `matchPattern and nameMatches disagree on ${name} / ${pattern}`
    );
  }
  assert.equal(matchPattern('', '').match, true, 'blank pattern still matches only a blank name');
  assert.equal(matchPattern('x', '').match, false);
  assert.equal(matchPattern('color/pine', 'color/pine', { exact: true }).match, true);
});

test('replaceWithPattern delegates to renameByPattern and no longer guesses regex', () => {
  assert.equal(replaceWithPattern('font-24', 'font', 'text'), 'text-24');
  assert.equal(replaceWithPattern('color/pine', 'pine', '[$&]'), 'color/[pine]');
  assert.equal(replaceWithPattern('x', 'x', '$nn', 4, 9), '05');
  assert.equal(
    replaceWithPattern('Text Legacy Body', 'Text [Legacy]', 'Text'),
    'Text Legacy Body',
    'the old auto-detection mangled this'
  );
  assert.equal(
    replaceWithPattern('font-24', '(\\w+)-(\\d+)', '$2-$1', 0, 1, { useRegex: true }),
    '24-font'
  );
});
