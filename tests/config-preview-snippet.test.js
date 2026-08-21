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
  // Colors joined with two strips rather than one: what a run would write, and — when the panel has read a
  // set out of the file — what is there now, with the lightness gap per step. The second strip is the
  // recogniser's self-check, which for colours cannot live in the recogniser: verifying by regeneration
  // needs a curve, and a curve is exactly what a read set does not carry.
  assert.deepEqual(declaring.sort(),
    ['colors.js', 'corner-radius.js', 'grid.js', 'spacing.js', 'typography.js']);
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

test('a programmatic block write refreshes the preview, not just the form', () => {
  // `writeConfigBlockText` is the only place that writes the config block behind the form's back, and it
  // already re-projects the form for exactly that reason. The preview is the third thing that has to agree
  // with that text and was not brought along. Every *other* caller pairs its write with
  // `scheduleConfigPreview()`; auto-import — the one write nobody asks for — did not, so reading a
  // collection filled every field and left the strip drawing the pristine block: eleven placeholder steps
  // in neutral grey, under a palette full of the file's own numbers. It caught up on the next keystroke,
  // which is what made it look like the palette only loaded once you edited it.
  const start = ui.indexOf('function writeConfigBlockText(');
  assert.notEqual(start, -1, 'writeConfigBlockText not found — did it get renamed?');
  const end = ui.indexOf('\n      function ', start + 10);
  const body = ui.slice(start, end);

  assert.match(body, /projectConfigIntoForm\(\);/, 'the form is no longer brought along');
  assert.match(body, /scheduleConfigPreview\(\);/,
    'a programmatic block write no longer refreshes the preview, so the strip can show a config the ' +
    'fields do not');

  // The refresh has to come after the write actually lands, or it renders the text it replaced.
  assert.ok(body.indexOf('code.setValue(next);') < body.indexOf('scheduleConfigPreview();'),
    'the preview is refreshed before the block is written');
});

test('a form is only written back over the block it was projected from', () => {
  // The revert that made auto-import look like it never happened. `mergeConfigIntoMain` serialises the
  // form's values over the block whenever the Configuration UI tab is the view you are in — which is right
  // about *which view* is authoritative and says nothing about *when*. A programmatic write replaces the
  // block behind the form's back, and any merge before the re-projection puts the form's previous values
  // straight back. The trace read `before: 4686, filled: 5115, afterWrite: 4686`, with a nameless one-entry
  // form landing on top of three named modes.
  const start = ui.indexOf('function mergeConfigIntoMain(');
  assert.notEqual(start, -1, 'mergeConfigIntoMain not found — did it get renamed?');
  const body = ui.slice(start, ui.indexOf('\n      function getFullCode(', start));

  assert.match(body, /configProjectedFrom !== null && blockNow\.trim\(\) !== configProjectedFrom\.trim\(\)/,
    'the merge no longer checks that the form is a projection of the current block');
  assert.match(body, /merge:refused@/, 'a refused merge is no longer recorded, so a revert is invisible');

  // And it claims the text it writes, or typing stops after one character: a form edit deliberately does
  // not re-project, so the next keystroke would find the block changed and refuse itself.
  assert.match(body, /configProjectedFrom = trimmed;/,
    'the merge does not claim the block it just wrote — the next form edit will be refused');
  assert.ok(body.indexOf('code.setValue(newCode);') < body.indexOf('configProjectedFrom = trimmed;'),
    'the claim is made before the write lands');

  // The marker is set where the form is actually built, not somewhere that merely runs nearby.
  const project = ui.slice(ui.indexOf('function projectConfigIntoForm('),
    ui.indexOf('\n      function restoreActiveMode('));
  assert.ok(project.indexOf('initConfigUI(block') < project.indexOf('configProjectedFrom = block'),
    'the projection marker is recorded before the form is built from that text');
});

test('an address change leaves no trace of the previous one', () => {
  // Symptom 3. Pointing the panel at a different collection fired a read, the read returned `source: "none"`,
  // and the previous collection's modes, curves, anchors and steps stayed on screen — the difference between
  // "this collection has no ramp" and "here is someone else's ramp", with the panel saying the second.
  const start = ui.indexOf('function requestAutoImport(');
  assert.notEqual(start, -1);
  const body = ui.slice(start, ui.indexOf('\n      function ', start + 10));

  // **The defaults are prepared before the read and applied when it answers.** They used to be *written*
  // before the read, which reached the same end state by two writes — and because pristine clears the token
  // list, the first one collapsed every section gated on it and the second expanded them again. That was
  // the layout jump. What has to hold is the end state, not the route.
  const prep = body.indexOf('pristineConfigForAddress(collection, group)');
  assert.notEqual(prep, -1, 'an address change no longer prepares defaults for the new address');
  assert.match(body, /pendingPristine = detectOnly \? null : pristineConfigForAddress/,
    'the group-detection probe must not reset — it asks about the address the panel is already on');

  const asks = body.indexOf('runSilentSnippet');
  assert.ok(prep < asks, 'the defaults must be prepared from the block as it stands before the read');

  // Defaults come from the script as opened, not from the block on screen — which by then holds the
  // previous collection's values, so resetting to it would clear nothing.
  const fn = ui.slice(ui.indexOf('function pristineConfigForAddress('),
    ui.indexOf('\n      /** The collection the last real read was for'));
  assert.match(fn, /extractConfigSection\(originalCode/,
    'the defaults no longer come from the script as it was opened');
  assert.match(fn, /collectionName: collection/, 'the address is not carried through');
  assert.doesNotMatch(fn, /writeConfigBlockText/,
    'preparing the defaults must not write — that is the second rebuild this removed');

  // And the rule itself: a read that finds nothing leaves an empty panel rather than the last one's values.
  const apply = ui.slice(ui.indexOf('function applyAutoImport'), ui.indexOf('function recognitionNote'));
  assert.match(apply, /writeConfigBlockText\(pendingPristine/,
    'a read that finds nothing no longer clears the panel');
  assert.match(apply, /var base = pendingPristine \|\| currentConfigBlock\(\)/,
    'a read that finds something must fill onto the defaults, or the previous address survives in every ' +
    'key the payload does not mention');
});
