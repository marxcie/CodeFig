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
  return { name: name, filename: filename || name.toLowerCase().replace(/\s+/g, '-') + '.js', code: code };
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
  '@core-library.js'
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
    '@cycle.js'
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
  const other = script('Utility Scripts / Something', 'function unrelated() {}', 'something.js');
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
    '@consts.js'
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
    '@arrows.js'
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
  // cannot parse. No shipped library is annotated any more (`npm run validate`
  // enforces that), but user scripts in clientStorage may still be.
  const lib = script(
    'CodeFig Libraries / @Typed',
    'function typedFn(a: string): number {\n  return 1;\n}\nfunction plainFn() {\n  return 2;\n}',
    '@typed.js'
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
    '@braces.js'
  );
  const { code } = resolve('@import { trickyFn } from "@Braces"' + PAD, [lib]);
  assert.match(code, /return brace \+ other \+ tpl;/, 'whole body must survive');
  assert.doesNotMatch(code, /function afterTricky/, 'must not over-run into the next function');
});

test('a regex literal with unbalanced braces does not truncate extraction', () => {
  // @pattern-matching.js has /\\\{([^}]+)\\\}/g — one `{`, two `}`. Without regex
  // state in the brace scanner that closes the function a brace early and the
  // extraction is unparseable.
  const lib = script(
    'CodeFig Libraries / @Regex',
    [
      'function regexFn(pattern) {',
      '  let out = pattern.replace(/\\\\\\{([^}]+)\\\\\\}/g, "($1)");',
      '  const re = /}/;',
      '  return re.test(out);',
      '}',
      'function afterRegexFn() { return 1; }'
    ].join('\n'),
    '@regex.js'
  );
  const { code } = resolve('@import { regexFn } from "@Regex"' + PAD, [lib]);
  assert.match(code, /return re\.test\(out\);/, 'whole body must survive');
  assert.doesNotMatch(code, /function afterRegexFn/, 'must not over-run into the next function');
});

test('division is not mistaken for a regex literal', () => {
  const lib = script(
    'CodeFig Libraries / @Div',
    [
      'function divFn(a, b) {',
      '  const half = (a + b) / 2;',
      '  const ratio = a / b / 2;',
      '  return half + ratio;',
      '}',
      'function afterDivFn() { return 1; }'
    ].join('\n'),
    '@div.js'
  );
  const { code } = resolve('@import { divFn } from "@Div"' + PAD, [lib]);
  assert.match(code, /return half \+ ratio;/);
  assert.doesNotMatch(code, /function afterDivFn/);
});

test('a regex literal after the return keyword is recognised', () => {
  // @variables.js has `return v.description && /(\w+)\s*\([^)]*\)/.test(...)`.
  const lib = script(
    'CodeFig Libraries / @Ret',
    'function retFn(s) {\n  return s && /[{](\\w+)[}]/.test(s);\n}\nfunction afterRetFn() { return 1; }',
    '@ret.js'
  );
  const { code } = resolve('@import { retFn } from "@Ret"' + PAD, [lib]);
  assert.match(code, /return s && /);
  assert.doesNotMatch(code, /function afterRetFn/);
});

test('$-patterns in library source are spliced literally, not as replacement patterns', () => {
  // String.replace treats $&, $`, $' and $1 in a *string* replacement as patterns.
  // @pattern-matching.js's `` `^${p}$` `` ends in $` — "everything before the match" —
  // which would paste the consuming script's header into a template literal.
  const lib = script(
    'CodeFig Libraries / @Dollars',
    [
      'function dollarFn(p, s) {',
      '  const re = new RegExp(`^${p}$`, "g");',
      '  const escaped = s.replace(/[.*+?]/g, "\\\\$&");',
      '  return re.test(escaped) ? "$1" : "none";',
      '}'
    ].join('\n'),
    '@dollars.js'
  );
  const header = '// UNIQUE-HEADER-MARKER\n';
  const { code } = resolve(header + '@import { dollarFn } from "@Dollars"' + PAD, [lib]);

  assert.match(code, /new RegExp\(`\^\$\{p\}\$`, "g"\)/, 'the $` sequence must survive verbatim');
  assert.match(code, /"\\\\\$&"/, '$& must survive verbatim');
  assert.strictEqual(
    (code.match(/UNIQUE-HEADER-MARKER/g) || []).length, 1,
    'the header must not be pasted into the injected code by a $-pattern'
  );
  assert.doesNotThrow(() => new Function(code.replace(/^.*@import.*$/gm, '')), 'result must parse');
});

// ---------------------------------------------------------------------------
// 5. Script-name matching
// ---------------------------------------------------------------------------

test('findScript matches display name, " / " suffix, filename and @-prefix', () => {
  const scripts = [
    script('Utility Scripts / Replace Styles', 'function a() {}', 'replace-styles.js'),
    CORE
  ];
  assert.strictEqual(resolver.findScript(scripts, 'Replace Styles').filename, 'replace-styles.js');
  assert.strictEqual(resolver.findScript(scripts, 'replace styles').filename, 'replace-styles.js');
  assert.strictEqual(resolver.findScript(scripts, 'replace-styles').filename, 'replace-styles.js');
  assert.strictEqual(resolver.findScript(scripts, '@Core Library').filename, '@core-library.js');
  assert.strictEqual(resolver.findScript(scripts, 'Nothing Like This'), null);
});

test('filename matching ignores the extension, so pre-rename .ts entries still resolve', () => {
  // Shipped scripts became .js in Aug 2026. Matching on the basename keeps scripts a
  // user exported from an older build — and any future extension — resolvable.
  const legacy = [script('Utility Scripts / Replace Styles', 'function a() {}', 'replace-styles.ts')];
  assert.strictEqual(resolver.findScript(legacy, 'replace-styles').filename, 'replace-styles.ts');
  assert.ok(resolver.findScript(legacy, 'Replace Styles'), 'display-name match is unaffected');
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
 * Named imports in shipped scripts that do NOT resolve to injected source.
 *
 * Empty, and it should stay that way. It held six entries until the three libraries
 * written in real TypeScript were de-annotated — a TypeScript-annotated declaration
 * is not extractable, so those imports silently injected nothing and the consuming
 * scripts ran hand-written fallbacks instead. `npm run validate` now rejects a script
 * that does not parse as plain JS, so this list is the second line of defence.
 *
 * Keyed by "script name :: function" so a new gap names itself in the failure output.
 */
const KNOWN_UNINJECTED = [];

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
    '@Core Library': '@core-library.js',
    '@Variables': '@variables.js',
    '@InfoPanel': '@infopanel.js',
    '@Math Helpers': '@math-helpers.js',
    '@Pattern Matching': '@pattern-matching.js',
    '@Styles': '@styles.js',
    '@Foundation overview': '@foundation-overview.js',
    'Replace Styles': 'replace-styles.js'
  };
  Object.keys(expected).forEach((target) => {
    const found = resolver.findScript(scripts, target);
    assert.ok(found, target + ' should resolve');
    assert.strictEqual(found.filename, expected[target], target + ' resolved to the wrong file');
  });
});
