/**
 * A call in a comment is not a call.
 *
 * `validateResolvedCalls` is the build's only guard against the `@import` trap — a script calling a
 * library function it did not import, which fails at run time with a swallowed ReferenceError. It found
 * calls by scanning the resolved source for `name(`, comments included, and a config block's own
 * annotations are comments written to be read. Spacing's new `@rows` line contains
 * `scaleType:radio(modular|metric|fibonacci)`, so the build failed with *"Calls radio() but nothing
 * defines it"* — and helpfully named `@codefig-ui.js` to import it from.
 *
 * That is the shape of failure worth a test: a false error in the one automated correctness gate
 * pushes whoever hits it toward `|| true`, which is the thing CLAUDE.md tells you not to reach for.
 *
 * So both directions are pinned here. Blindness to comments, and **not** blindness to the real thing.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  validateScripts, findAllScripts, validateResolvedCalls, withoutComments,
} = require('../validate-scripts.js');

test('an annotation that reads like a call is blanked', () => {
  const line = '  ], // @rows: scaleType:radio(modular|metric)=Scale type|ratio:(1.2:1.2 Minor third)';
  const out = withoutComments(line);
  assert.equal(out.indexOf('radio('), -1);
  assert.equal(out.length, line.length, 'blanked, not deleted — the columns still line up');
  assert.match(out, /^ {2}\],/, 'and the code before it is untouched');
});

test('a comment opener inside a string is not a comment', () => {
  // `allowedDomains` holds `https://api.figma.com`, and cutting from `//` would drop the rest of the
  // line — including real calls, which is a *missed* error rather than a false one.
  const line = 'var url = "https://api.figma.com"; realCall(1);';
  assert.equal(withoutComments(line), line);
});

test('quote state stops at the newline, which is what survives a regex full of quotes', () => {
  // A character class like /[^.\w$'"]/ carries an unpaired quote — this repo has exactly that — and a
  // scanner carrying state across lines from there swallowed hundreds of following lines as one string,
  // leaving the comments in them intact. That is how the first version of this still failed the build.
  const code = [
    "var re = /[^.\\w$'\"]/;",
    'thing(); // radio(x)',
    'other();',
  ].join('\n');
  const out = withoutComments(code).split('\n');
  assert.equal(out[1].indexOf('radio('), -1, 'the comment on the next line is still blanked');
  assert.match(out[1], /^thing\(\);/);
  assert.match(out[2], /^other\(\);/);
});

test('a block comment spanning lines goes, and the line count does not change', () => {
  const code = ['a();', '/* radio(', ' still comment */ b();', 'c();'].join('\n');
  const out = withoutComments(code);
  assert.equal(out.split('\n').length, 4);
  assert.equal(out.indexOf('radio('), -1);
  assert.match(out.split('\n')[2], /b\(\);$/, 'and code after the closer survives');
});

test('the shipped scripts validate, annotations and all', () => {
  // Muted: `validateScripts` is the CLI entry point and narrates its five phases to stdout, which would
  // bury the rest of the suite's output.
  const said = console.log;
  console.log = function () {};
  let result;
  try {
    result = validateScripts();
  } finally {
    console.log = said;
  }
  assert.equal(result.errors.length, 0,
    result.errors.map((e) => e.file + ': ' + e.message).join('\n'));
});

test('a real missing import is still an error', () => {
  // The gate has to keep biting. Same mechanism as the shipped check, run against a script that calls a
  // library function it never imported — which is the run-time ReferenceError this exists to prevent.
  const scripts = findAllScripts(path.join(__dirname, '..', 'scripts'), { includeStaging: true });
  const spacing = scripts.filter((s) => /spacing\.js$/.test(s.path))[0];
  assert.ok(spacing, 'the fixture is a real shipped script');

  const broken = scripts.map((s) => (s === spacing
    ? Object.assign({}, s, {
      // Just the two names, not the tail of the line: pinning the whole import list made this fixture
      // fail every time a script gained an unrelated import.
      code: s.code.replace(', expandTokenList, tokenListHasSeries', ''),
    })
    : s));
  assert.notEqual(broken.filter((s) => /spacing\.js$/.test(s.path))[0].code, spacing.code,
    'the fixture actually removed the import');

  const unresolved = validateResolvedCalls(broken).filter((e) => e.type === 'unresolved-call');
  assert.ok(unresolved.length > 0, 'a call with no declaration after resolution is an error');
  assert.match(unresolved.map((e) => e.message).join('\n'), /expandTokenList|tokenListHasSeries/);
});
