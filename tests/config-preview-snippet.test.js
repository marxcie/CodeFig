/**
 * The snippet the Configuration tab runs to draw a preview.
 *
 * It reuses the script's own `@import` lines rather than composing its own. `@import` follows
 * calls only within one source file, so a snippet importing just the preview function would
 * `ReferenceError` on its first library call — while the script's import list already covers
 * everything it needs and is already checked by `validateResolvedCalls`. One list, and it is not
 * the snippet builder's.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const resolver = require('../src/import-resolver.js');
const DSF = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');
const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');

/** The UI's own rule for reading the marker, applied here so the two cannot drift. */
const PREVIEW_RE = /^[^\S\n]*\/\/[^\S\n]*@PREVIEW:[^\S\n]*([A-Za-z_$][\w$]*)/m;

test('the scripts that declare a preview name a function their imports provide', () => {
  // The failure this prevents: a preview function that is not importable, which shows up as an
  // empty region rather than as an error.
  const declaring = [];
  for (const file of fs.readdirSync(DSF).filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(DSF, file), 'utf8');
    const match = PREVIEW_RE.exec(source);
    if (!match) continue;
    declaring.push(file);

    const imported = new Set();
    for (const imp of resolver.findImports(source)) {
      for (const name of imp.functionNames || []) imported.add(name);
    }
    assert.ok(imported.has(match[1]),
      file + ' declares @PREVIEW: ' + match[1] + ' but never imports it');
  }
  // Grid joined when its preview arithmetic went live — the one thing kept live through the layout
  // pass, because a preview drawn from invented numbers is what nobody can judge.
  // Typography joined with its panel: a specimen set at the real sizes, plus the Overview table in the
  // second computed slot. Both read the numbers a run would write, which is the rule for every one here.
  assert.deepEqual(declaring.sort(), ['corner-radius.js', 'grid.js', 'spacing.js', 'typography.js']);
});

test('the UI reads the marker the same way this test does', () => {
  // Two regexes for one marker is the seam that keeps producing bugs here, so this asserts the
  // UI's is the one written above rather than something that merely agrees today.
  assert.ok(ui.indexOf('@PREVIEW:') !== -1, 'the UI does not look for the marker at all');
  const inUi = /@PREVIEW:\[\^\\S\\n\]\*\(\[A-Za-z_\$\]\[\\w\$\]\*\)/.test(ui);
  assert.ok(inUi, 'the marker pattern in ui.html changed — update PREVIEW_RE here to match');
});

test('a preview declaration is not inside a doc block', () => {
  // `findImports` skips doc blocks so a script can document import syntax. A `@PREVIEW:` line
  // written as an example would silently turn a preview on.
  for (const file of ['spacing.js', 'corner-radius.js', 'grid.js', 'typography.js']) {
    const source = fs.readFileSync(path.join(DSF, file), 'utf8');
    const at = source.indexOf('// @PREVIEW:');
    const docEnd = source.indexOf('// @DOC_END');
    assert.ok(at > docEnd, file + ': the marker is inside the doc block');
  }
});
