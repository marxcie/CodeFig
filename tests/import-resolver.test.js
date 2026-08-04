/**
 * Fixture tests for src/import-resolver.js.
 *
 * This module has no runtime error surface — an unresolvable import degrades to a
 * comment, so a resolver bug shows up in Figma as a script that silently does
 * nothing. These tests are the only place that behaviour is checked.
 *
 * Several tests below assert behaviour that is arguably wrong (TypeScript-annotated
 * functions are not runtime-importable; arrow forms are named but not extractable).
 * They are here to pin reality, not to endorse it — each says so.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const resolver = require('../src/import-resolver.js');
const { findAllScripts } = require('../validate-scripts.js');

/** Minimal stand-in for the UI's allScripts entries. */
function script(name, code, filename) {
  return { name: name, filename: filename || name.toLowerCase().replace(/\s+/g, '-') + '.ts', code: code };
}

const CORE = script(
  'CodeFig Libraries / @Core Library',
  [
    'function helperOne() {',
    '  return 1;',
    '}',
    'function helperTwo() {',
    '  return helperOne() + 1;',
    '}',
    'async function helperAsync() {',
    '  await Promise.resolve();',
    '}'
  ].join('\n'),
  '@core-library.ts'
);

const LIBRARY_SCRIPTS = [CORE];

// Padding keeps fixtures past the 500-char fast path in resolveImports, which is
// skipped only for short scripts that contain no "@import" at all.
const PAD = '\n// ' + 'x'.repeat(600) + '\n';

function resolve(code, scripts) {
  const notices = [];
  const out = resolver.resolveImports(code, scripts || LIBRARY_SCRIPTS, {
    notify: (m) => notices.push(m)
  });
  return { code: out, notices: notices };
}

// ---------------------------------------------------------------------------
// 1. The four import patterns
// ---------------------------------------------------------------------------

test('pattern: @import { a } from "Script"', () => {
  const { code } = resolve('@import { helperOne } from "@Core Library"' + PAD);
  assert.match(code, /function helperOne\(\)/);
  assert.doesNotMatch(code, /@import/);
});

test('pattern: @import { a } defaults to @Core Library', () => {
  const { code } = resolve('@import { helperOne }' + PAD);
  assert.match(code, /Runtime imported from: CodeFig Libraries \/ @Core Library/);
  assert.match(code, /function helperOne\(\)/);
});

test('pattern: @import * from "Script"', () => {
  const { code } = resolve('@import * from "@Core Library"' + PAD);
  assert.match(code, /function helperOne\(\)/);
  assert.match(code, /function helperTwo\(\)/);
  assert.match(code, /async function helperAsync\(\)/, 'async must survive extraction');
});

test('pattern: bare @import * resolves against @Core Library', () => {
  // The validator used to know only three of the four forms, so this pattern could
  // ship unchecked. Both sides parse it through findImports now.
  const { code } = resolve('@import *' + PAD);
  assert.match(code, /Runtime imported from: CodeFig Libraries \/ @Core Library/);
  assert.match(code, /function helperOne\(\)/);
  assert.doesNotMatch(code, /Import failed/);
});

test('findImports reports all four kinds with their targets', () => {
  const kinds = resolver.findImports(
    [
      '@import { a } from "Lib One"',
      '@import { b }',
      '@import * from "Lib Two"',
      '@import *'
    ].join('\n')
  );
  assert.deepStrictEqual(
    kinds.map((i) => [i.kind, i.scriptName]),
    [
      ['withFrom', 'Lib One'],
      ['simple', resolver.DEFAULT_LIBRARY],
      ['wildcardFrom', 'Lib Two'],
      ['wildcard', resolver.DEFAULT_LIBRARY]
    ]
  );
  assert.deepStrictEqual(kinds[0].functionNames, ['a']);
  assert.strictEqual(kinds[2].functionNames, null);
});

test('findImports does not double-count: named-with-from is not also a bare named import', () => {
  const kinds = resolver.findImports('@import { a } from "Lib"');
  assert.deepStrictEqual(kinds.map((i) => i.kind), ['withFrom']);
});

test('findImports does not treat wildcard-with-from as a bare wildcard', () => {
  const kinds = resolver.findImports('@import * from "Lib"');
  assert.deepStrictEqual(kinds.map((i) => i.kind), ['wildcardFrom']);
});

test('PATTERNS are stateless across calls', () => {
  const code = '@import { helperOne } from "@Core Library"';
  assert.strictEqual(resolver.findImports(code).length, 1);
  assert.strictEqual(resolver.findImports(code).length, 1, 'a stale lastIndex would drop this');
});

// ---------------------------------------------------------------------------
// 2. Recursive dependencies
// ---------------------------------------------------------------------------

test('recursive dependency: importing a caller pulls its callee in exactly once', () => {
  const { code } = resolve('@import { helperTwo } from "@Core Library"' + PAD);
  const occurrences = code.match(/function helperOne\(\)/g) || [];
  assert.strictEqual(occurrences.length, 1);
  // Dependencies are emitted before the function that needs them.
  assert.ok(code.indexOf('function helperOne()') < code.indexOf('function helperTwo()'));
});

test('mutually recursive functions terminate without stack overflow', () => {
  const cyclic = script(
    'CodeFig Libraries / @Cycle',
    [
      'function ping(n) {',
      '  return pong(n - 1);',
      '}',
      'function pong(n) {',
      '  return n <= 0 ? 0 : ping(n);',
      '}'
    ].join('\n'),
    '@cycle.ts'
  );
  const { code } = resolve('@import { ping } from "@Cycle"' + PAD, [cyclic]);
  assert.strictEqual((code.match(/function ping\(/g) || []).length, 1);
  assert.strictEqual((code.match(/function pong\(/g) || []).length, 1);
});

test('extractFunctions stops at the dependency depth limit', () => {
  const chainLength = resolver.MAX_DEPENDENCY_DEPTH + 5;
  const links = [];
  for (let i = 0; i < chainLength; i++) {
    links.push('function link' + i + '() { return link' + (i + 1) + '(); }');
  }
  links.push('function link' + chainLength + '() { return 0; }');
  const out = resolver.extractFunctions(links.join('\n'), ['link0']);
  const extracted = (out.match(/function link\d+\(/g) || []).length;
  assert.ok(extracted > 1, 'should follow at least some of the chain');
  assert.ok(extracted <= chainLength, 'must not run away past the depth guard');
});

// ---------------------------------------------------------------------------
// 3. Soft failure
// ---------------------------------------------------------------------------

test('unknown script name soft-fails to a comment and notifies', () => {
  const { code, notices } = resolve('@import { helperOne } from "No Such Script"' + PAD);
  assert.match(code, /\/\/ Import failed: No Such Script not found/);
  assert.deepStrictEqual(notices, ['Import failed: Script "No Such Script" not found']);
});

test('unknown function in a known script soft-fails: the marker goes, nothing is injected', () => {
  const { code, notices } = resolve('@import { noSuchFunction } from "@Core Library"' + PAD);
  assert.doesNotMatch(code, /@import/);
  assert.match(code, /Runtime imported from: CodeFig Libraries \/ @Core Library/);
  assert.doesNotMatch(code, /function noSuchFunction/);
  assert.deepStrictEqual(notices, [], 'a missing function is not reported at run time — only the validator catches it');
});

test('unknown wildcard target soft-fails to a comment', () => {
  const { code } = resolve('@import * from "No Such Script"' + PAD);
  assert.match(code, /\/\/ Import failed: Script not found/);
});

test('bare @import * with no core library present soft-fails to a comment', () => {
  const other = script('Utility Scripts / Something', 'function unrelated() {}', 'something.ts');
  const { code } = resolve('@import *' + PAD, [other]);
  assert.match(code, /\/\/ Import failed: Core library not found/);
});

test('resolveImports never throws on malformed input', () => {
  assert.doesNotThrow(() => resolve('@import { unclosed from "@Core Library"' + PAD));
  assert.doesNotThrow(() => resolve('@import {}' + PAD));
});

// ---------------------------------------------------------------------------
// 4. Extraction limits — documenting reality, not endorsing it
// ---------------------------------------------------------------------------

test('a top-level const object is NOT importable', () => {
  // Textual extraction only understands function declarations. Library constants,
  // object literals and classes cannot be imported; this is a real limitation.
  const lib = script(
    'CodeFig Libraries / @Consts',
    'const SETTINGS = {\n  a: 1\n};\nfunction readSetting() {\n  return SETTINGS.a;\n}',
    '@consts.ts'
  );
  const { code } = resolve('@import { SETTINGS } from "@Consts"' + PAD, [lib]);
  assert.doesNotMatch(code, /SETTINGS = \{/);
});

test('arrow and function-expression forms are NAMED but not extractable', () => {
  // listFunctionNames recognises them, so a wildcard import puts them on the
  // extraction list — and extractFunctions then skips them silently. CLAUDE.md's
  // "importable forms" list describes what is named, not what is extracted.
  const lib = script(
    'CodeFig Libraries / @Arrows',
    [
      'var oldStyle = function (a) { return a; };',
      'const arrowFn = (a) => { return a; };',
      'function plainFn(a) { return a; }'
    ].join('\n'),
    '@arrows.ts'
  );
  assert.deepStrictEqual(
    resolver.listFunctionNames(lib.code).sort(),
    ['arrowFn', 'oldStyle', 'plainFn']
  );

  const { code } = resolve('@import * from "@Arrows"' + PAD, [lib]);
  assert.match(code, /function plainFn\(a\)/);
  assert.doesNotMatch(code, /oldStyle = function/);
  assert.doesNotMatch(code, /arrowFn = \(a\)/);
});

test('a TypeScript return annotation makes a function un-extractable at run time', () => {
  // Extracted text is spliced into `new Function(...)`, where `: MatchResult` is a
  // SyntaxError — so the resolver refuses these rather than injecting code that
  // cannot parse. Shipped scripts that import from @Pattern Matching and @Styles
  // carry hand-written fallbacks for exactly this case.
  const lib = script(
    'CodeFig Libraries / @Typed',
    'function typedFn(a: string): number {\n  return 1;\n}\nfunction plainFn() {\n  return 2;\n}',
    '@typed.ts'
  );
  const { code } = resolve('@import { typedFn, plainFn } from "@Typed"' + PAD, [lib]);
  assert.doesNotMatch(code, /function typedFn/);
  assert.match(code, /function plainFn\(\)/);
});

test('extractFunctionMap DOES see TypeScript-annotated functions, so the validator does not flag them', () => {
  const map = resolver.extractFunctionMap(
    'function typedFn(a: string): number {\n  return 1;\n}\nasync function asyncFn() {\n  return 2;\n}'
  );
  assert.ok(map.has('typedFn'));
  assert.ok(map.has('asyncFn'));
  assert.match(map.get('asyncFn'), /^async function/, 'async prefix must be kept for the VM fixtures');
});

test('braces inside strings, comments and template literals do not truncate a function', () => {
  const lib = script(
    'CodeFig Libraries / @Braces',
    [
      'function trickyFn() {',
      '  const brace = "}";',
      '  const other = \'{\';',
      '  // a stray } in a comment',
      '  /* and a } in a block comment */',
      '  const tpl = `nested ${ { a: 1 }.a } done`;',
      '  return brace + other + tpl;',
      '}',
      'function afterTricky() { return 1; }'
    ].join('\n'),
    '@braces.ts'
  );
  const { code } = resolve('@import { trickyFn } from "@Braces"' + PAD, [lib]);
  assert.match(code, /return brace \+ other \+ tpl;/, 'whole body must survive');
  assert.doesNotMatch(code, /function afterTricky/, 'must not over-run into the next function');
});

test('a regex literal containing an unbalanced brace DOES truncate extraction', () => {
  // Known bug: the brace scanner has no regex-literal state, so /}/ reads as a real
  // closing brace. No shipped library hits this. Asserted so a fix is a visible
  // test change rather than a silent behaviour shift.
  const lib = script(
    'CodeFig Libraries / @Regex',
    'function regexFn() {\n  const re = /}/;\n  return re.test("}");\n}',
    '@regex.ts'
  );
  const { code } = resolve('@import { regexFn } from "@Regex"' + PAD, [lib]);
  assert.doesNotMatch(code, /return re\.test/, 'body is cut short at the brace inside the regex');
});

// ---------------------------------------------------------------------------
// 5. Script-name matching
// ---------------------------------------------------------------------------

test('findScript matches display name, " / " suffix, filename and @-prefix', () => {
  const scripts = [
    script('Utility Scripts / Replace Styles', 'function a() {}', 'replace-styles.ts'),
    CORE
  ];
  assert.strictEqual(resolver.findScript(scripts, 'Replace Styles').filename, 'replace-styles.ts');
  assert.strictEqual(resolver.findScript(scripts, 'replace styles').filename, 'replace-styles.ts');
  assert.strictEqual(resolver.findScript(scripts, 'replace-styles').filename, 'replace-styles.ts');
  assert.strictEqual(resolver.findScript(scripts, '@Core Library').filename, '@core-library.ts');
  assert.strictEqual(resolver.findScript(scripts, 'Nothing Like This'), null);
});

// ---------------------------------------------------------------------------
// 6. Pin against the real shipped script tree
// ---------------------------------------------------------------------------

test('every @import in the shipped script tree resolves to a real script', () => {
  const scripts = findAllScripts(path.join(__dirname, '..', 'scripts'));
  assert.ok(scripts.length > 0, 'expected to find shipped scripts');

  const unresolved = [];
  scripts.forEach((s) => {
    // HELP/ documents the syntax with deliberately fictional targets.
    if (s.folder === 'HELP') return;
    resolver.findImports(s.code).forEach((imp) => {
      if (imp.scriptName === 'My Custom Script') return; // documented placeholder
      if (!resolver.findScript(scripts, imp.scriptName)) {
        unresolved.push(s.name + ' -> ' + imp.scriptName);
      }
    });
  });

  assert.deepStrictEqual(unresolved, []);
});

/**
 * Named imports in shipped scripts that do NOT resolve to injected source today,
 * because the library declares them with TypeScript annotations. Each consuming
 * script carries a hand-written `if (typeof fn !== 'function')` fallback.
 *
 * Shrinking this list is a fix; growing it is a regression. It is keyed by
 * "script name :: function" so a new gap names itself in the failure output.
 */
const KNOWN_UNINJECTED = [
  'Utility Scripts / Rename styles :: matchPattern',
  'Utility Scripts / Rename styles :: replaceWithPattern',
  'Utility Scripts / Rename variables :: matchPattern',
  'Utility Scripts / Rename variables :: replaceWithPattern',
  'Utility Scripts / Replace styles :: escapeWildcards',
  'Utility Scripts / Replace variables :: matchPattern'
];

test('every shipped script resolves its imports into real injected source', () => {
  // The anti-silent-no-op check: an @import that resolves to nothing leaves a script
  // that runs and does nothing, which is invisible without this assertion.
  const scripts = findAllScripts(path.join(__dirname, '..', 'scripts'));
  const softFailures = [];
  const uninjected = [];

  scripts.forEach((s) => {
    if (s.folder === 'HELP') return;
    const imports = resolver.findImports(s.code);
    if (!imports.length) return;

    const out = resolver.resolveImports(s.code, scripts, {});
    if (out.includes('// Import failed')) softFailures.push(s.name);

    imports.forEach((imp) => {
      if (!imp.functionNames) return;
      if (imp.scriptName === 'My Custom Script') return; // documented placeholder
      imp.functionNames.forEach((name) => {
        const declared = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').test(out);
        if (!declared) uninjected.push(s.name + ' :: ' + name);
      });
    });
  });

  assert.deepStrictEqual(softFailures, [], 'no shipped script may soft-fail an import');
  assert.deepStrictEqual(uninjected.sort(), KNOWN_UNINJECTED.slice().sort());
});

test('shipped @import targets resolve to the expected library file', () => {
  const scripts = findAllScripts(path.join(__dirname, '..', 'scripts'));
  const expected = {
    '@Core Library': '@core-library.ts',
    '@Variables': '@variables.ts',
    '@InfoPanel': '@infopanel.ts',
    '@Math Helpers': '@math-helpers.ts',
    '@Pattern Matching': '@pattern-matching.ts',
    '@Styles': '@styles.ts',
    '@Foundation overview': '@foundation-overview.ts',
    'Replace Styles': 'replace-styles.ts'
  };
  Object.keys(expected).forEach((target) => {
    const found = resolver.findScript(scripts, target);
    assert.ok(found, target + ' should resolve');
    assert.strictEqual(found.filename, expected[target], target + ' resolved to the wrong file');
  });
});
