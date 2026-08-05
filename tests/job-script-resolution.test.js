/**
 * How `npm run figma:run -- <script>` finds a script.
 *
 * This looked obvious and was wrong on the first real run: display names are
 * "Utility Scripts / Variable inspector (WIP)" — a category prefix plus a free-form title —
 * so the only stable handle a CLI can use is the filename, and the UI was dropping it while
 * mapping scripts for display.
 *
 * The resolver lives in src/ui.html (it needs `allScripts`), so it is extracted and evaluated
 * here, and exercised against the names this build actually produces rather than invented ones.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { findAllScripts } = require('../validate-scripts.js');

const UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');

/** Pull the two resolver functions out of the UI and give them an allScripts to work on. */
function loadResolver(scripts) {
  const slug = UI.match(/function _codefigScriptSlug\(text\) \{[\s\S]*?\n      \}/);
  const resolve = UI.match(/function _codefigResolveJobScript\(name\) \{[\s\S]*?\n      \}/);
  assert.ok(slug, '_codefigScriptSlug not found in src/ui.html');
  assert.ok(resolve, '_codefigResolveJobScript not found in src/ui.html');
  const ctx = { String, allScripts: scripts };
  vm.createContext(ctx);
  vm.runInContext(slug[0], ctx);
  vm.runInContext(resolve[0], ctx);
  return ctx;
}

/** The real inventory, shaped the way the UI holds it (name + filename + code). */
function realScripts() {
  return findAllScripts(path.join(__dirname, '..', 'scripts')).map((s) => ({
    name: s.name,
    filename: s.filename,
    code: s.code,
    type: 'prebuilt'
  }));
}

test('the UI keeps filename when mapping scripts for display', () => {
  // The bug this file exists for: without filename, nothing resolves by its file handle.
  assert.match(
    UI,
    /prebuiltScripts = msg\.items\.map\(script => \(\{[\s\S]*?filename: script\.filename \|\| ''/,
    'the EXAMPLE_SCRIPTS mapper must carry filename through'
  );
});

test('a filename resolves, with or without .js', () => {
  const { _codefigResolveJobScript: resolve } = loadResolver(realScripts());
  for (const name of ['variable-inspector', 'variable-inspector.js', 'rename-styles', 'replace-variables']) {
    const got = resolve(name);
    assert.ok(got.script, `${name} did not resolve: ${got.error}`);
    assert.equal(got.script.filename, name.replace(/\.js$/, '') + '.js');
  }
});

test('the full display name resolves, prefix and free-form title included', () => {
  const scripts = realScripts();
  const { _codefigResolveJobScript: resolve } = loadResolver(scripts);
  const inspector = scripts.find((s) => s.filename === 'variable-inspector.js');
  assert.equal(inspector.name, 'Utility Scripts / Variable inspector (WIP)', 'name shape changed');
  assert.equal(resolve(inspector.name).script.filename, 'variable-inspector.js');
  assert.equal(resolve(inspector.name.toUpperCase()).script.filename, 'variable-inspector.js');
});

test('the title alone resolves, ignoring the category prefix', () => {
  const { _codefigResolveJobScript: resolve } = loadResolver(realScripts());
  assert.equal(resolve('Rename styles').script.filename, 'rename-styles.js');
  assert.equal(resolve('rename styles').script.filename, 'rename-styles.js');
  // A prefix is enough when it is unambiguous — "(WIP)" should not have to be typed.
  assert.equal(resolve('variable-inspector').script.filename, 'variable-inspector.js');
});

test('an ambiguous name is reported, never guessed', () => {
  const { _codefigResolveJobScript: resolve } = loadResolver([
    { name: 'Utility Scripts / Rename styles', filename: 'rename-styles.js', code: '' },
    { name: 'Utility Scripts / Rename styles v2', filename: 'rename-styles-v2.js', code: '' }
  ]);
  const got = resolve('rename-st');
  assert.ok(!got.script, 'a prefix hitting two scripts must not silently pick one');
  assert.match(got.error, /matches 2 scripts/);
  assert.match(got.error, /rename-styles\.js/);
  // The exact filename still wins over the ambiguous prefix.
  assert.equal(resolve('rename-styles').script.filename, 'rename-styles.js');
});

test('an unknown name suggests candidates and says what is matched', () => {
  const { _codefigResolveJobScript: resolve } = loadResolver(realScripts());
  const got = resolve('rename-everything');
  assert.ok(!got.script);
  assert.match(got.error, /No script named "rename-everything"/);
  assert.match(got.error, /Did you mean: .*rename/, 'should surface the rename-* scripts');
  assert.match(got.error, /matched against the filename/);
});

test('an empty name is an error, not a match on the first script', () => {
  const { _codefigResolveJobScript: resolve } = loadResolver(realScripts());
  for (const name of ['', '   ', null, undefined]) {
    const got = resolve(name);
    assert.ok(!got.script, `${JSON.stringify(name)} must not resolve`);
    assert.match(got.error, /did not name a script/);
  }
});

test('every shipped script is reachable by its filename', () => {
  // The guarantee that matters for the CLI: no script is unaddressable.
  const scripts = realScripts();
  const { _codefigResolveJobScript: resolve } = loadResolver(scripts);
  const unreachable = scripts
    .map((s) => ({ s, got: resolve(s.filename.replace(/\.js$/, '')) }))
    .filter(({ s, got }) => !got.script || got.script.filename !== s.filename)
    .map(({ s, got }) => s.filename + (got.error ? ' (' + got.error + ')' : ' (wrong match)'));
  assert.deepEqual(unreachable, [], 'these scripts cannot be run from the CLI');
});
