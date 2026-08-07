/**
 * How a config reaches a run without rewriting anything.
 *
 * Every Design System Foundations script guards its config with
 * `var x = typeof x !== 'undefined' ? x : { … }`, which means a definition placed *ahead* of the
 * source wins over the literal — with no change to any script. That is what `--from-file` and
 * `--config` use, so the CLI never edits a buffer it cannot see and the paste workflow is
 * untouched: with no flag, no prelude is built and the script runs exactly as written.
 *
 * The prelude is generated text that gets evaluated inside Figma, so the tests here evaluate it
 * the same way the sandbox will.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { buildRunPrelude, findConfigVarName, findFromFilePath } = require('../run-prelude.js');

const SPACING = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'spacing.js');

/** The guard, exactly as every DSF script writes it. */
const GUARDED_SOURCE = [
  "var myConfig = typeof myConfig !== 'undefined' ? myConfig : { source: 'literal', n: 1 };",
  'result = myConfig;'
].join('\n');

function evaluate(code) {
  const ctx = { result: null };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.result;
}

test('with no config there is no prelude, and the source is untouched', () => {
  // The paste workflow in one assertion: no flag, nothing prepended, the literal runs.
  assert.equal(buildRunPrelude('myConfig', null), '');
  assert.equal(buildRunPrelude('myConfig', undefined), '');
  assert.equal(buildRunPrelude(null, { a: 1 }), '');
  assert.deepEqual(evaluate(buildRunPrelude('myConfig', null) + GUARDED_SOURCE), { source: 'literal', n: 1 });
});

test('a prelude beats the literal the guard would otherwise use', () => {
  const prelude = buildRunPrelude('myConfig', { source: 'file', n: 2 });
  assert.deepEqual(evaluate(prelude + GUARDED_SOURCE), { source: 'file', n: 2 });
});

test('the prelude parses the way the sandbox will run it', () => {
  const prelude = buildRunPrelude('myConfig', { a: 1 });
  assert.doesNotThrow(() => new Function('figma', 'console', 'window', prelude + GUARDED_SOURCE));
});

test('values that would break a naive serializer survive', () => {
  const config = {
    quote: 'a "quoted" value',
    backslash: 'C:\\path\\to',
    newline: 'line one\nline two',
    unicode: 'ø π 🎨',
    nested: { list: [1, 'two', false, null] },
    zero: 0,
    off: false
  };
  const prelude = buildRunPrelude('myConfig', config);
  assert.deepEqual(evaluate(prelude + GUARDED_SOURCE), config);
});

test('a config var name that is not an identifier is refused, not injected', () => {
  // The name comes from a script's own source, but it reaches this as a string either way.
  assert.equal(buildRunPrelude('my-config', { a: 1 }), '');
  assert.equal(buildRunPrelude('x = 1; evil()', { a: 1 }), '');
});

test('the config var is the one holding the @CONFIG block, not the wrapper', () => {
  // spacing.js declares two guarded objects: spacingConfigData (the @CONFIG block) and
  // spacingConfig (the wrapper built around it). Overriding the wrapper would skip the
  // compat and materialize steps entirely.
  const source = fs.readFileSync(SPACING, 'utf8');
  assert.equal(findConfigVarName(source), 'spacingConfigData');
});

test('a script with no config block has no config var', () => {
  assert.equal(findConfigVarName('function nothing() {}'), null);
  assert.equal(findConfigVarName(''), null);
});

test('the @fromFile path is read off the config block', () => {
  const source = [
    'var demoConfig = typeof demoConfig !== "undefined" ? demoConfig : {',
    '  // @CONFIG_START',
    '  // @fromFile: domains.spacing',
    '  collectionName: "Responsive System"',
    '  // @CONFIG_END',
    '};'
  ].join('\n');
  assert.equal(findFromFilePath(source), 'domains.spacing');
  assert.equal(findConfigVarName(source), 'demoConfig');
});

test('a script with no @fromFile annotation says so, rather than guessing a path', () => {
  assert.equal(findFromFilePath('var x = 1;'), null);
  assert.equal(findFromFilePath(''), null);
});

test('the shipped DSF scripts declare where their config comes from', () => {
  // Without the annotation the sync button never appears and --from-file has no path to
  // resolve, so this is what makes the feature reachable at all.
  const shipped = [
    ['spacing.js', 'domains.spacing'],
    ['grid.js', 'domains.grid'],
    ['corner-radius.js', 'domains.radius'],
    ['typography.js', 'domains.typography']
  ];
  for (const [file, expected] of shipped) {
    const source = fs.readFileSync(path.join(path.dirname(SPACING), file), 'utf8');
    assert.equal(findFromFilePath(source), expected, file);
    assert.ok(findConfigVarName(source), file + ' has a config variable to override');
  }
});

// ---------------------------------------------------------------------------
// The write guard
// ---------------------------------------------------------------------------

test('a named script may only run against a codefig-test file', () => {
  // `figma:run -- spacing` writes variables into whatever file is open — a two-word command
  // with a document-wide effect. This is the same substring the in-Figma harness gates
  // mutation on, so the CLI and the specs agree about which files are fair game.
  const { isTestFileName } = require('../run-prelude.js');
  assert.equal(isTestFileName('codefig-test'), true);
  assert.equal(isTestFileName('My codefig-test scratch'), true);
  assert.equal(isTestFileName('CODEFIG-TEST'), true, 'case does not decide whether data is safe');
  assert.equal(isTestFileName('Gigs brand refresh exploration'), false);
  assert.equal(isTestFileName('codefig'), false, 'the whole substring, not a prefix of it');
  assert.equal(isTestFileName(''), false);
  assert.equal(isTestFileName(null), false);
});
