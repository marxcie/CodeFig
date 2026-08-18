/**
 * Finding the group a grid lives in.
 *
 * Márton's system keeps its grid under `Layout` while the script defaults to `Grid`, so every fresh
 * panel started pointed at nothing. His observation is the design: a numbered column series *is* a
 * grid, so finding it is a search rather than a question.
 *
 * The name scan is pure and lives here. What the panel does with the answer — go there when there is
 * one, say so and touch nothing when there are several — is asserted against `src/ui.html`, because
 * the rule about when a panel may move a field you typed in is the part worth pinning.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function loadFoundation() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'
  );
  return new Function('figma', 'console', 'window',
    src + '; return { gridGroupCandidates: gridGroupCandidates };')({}, console, {});
}
const F = loadFoundation();

test('a numbered column series is what makes a group a grid', () => {
  // Not `columns` or `gap` — a group can have something called either for a dozen reasons. This is the
  // same signal `gridRecognise` refuses to work without, which is why the two agree by construction.
  const names = [
    'Layout/col-1', 'Layout/col-16', 'Layout/gap', 'Layout/columns',
    'Spacing/space-md', 'Spacing/columns', '@media/@min: tablet',
    'Typography/text/text-md/font-size',
  ];
  assert.deepEqual(F.gridGroupCandidates(names), [{ group: 'Layout', columns: 16 }]);
});

test('the group is everything before the col-N, nesting included', () => {
  assert.deepEqual(F.gridGroupCandidates(['Foundations/Layout/col-1', 'Foundations/Layout/col-12']),
    [{ group: 'Foundations/Layout', columns: 12 }]);
  // A series at the collection root is a real answer, not a missing one.
  assert.deepEqual(F.gridGroupCandidates(['col-1', 'col-4', 'gap']), [{ group: '', columns: 4 }]);
});

test('two grids are reported as two, most columns first', () => {
  // And the panel must not pick between them — see below.
  assert.deepEqual(F.gridGroupCandidates(['A/col-1', 'A/col-8', 'B/col-1', 'B/col-12']),
    [{ group: 'B', columns: 12 }, { group: 'A', columns: 8 }]);
});

test('nothing that looks like a grid yields nothing', () => {
  assert.deepEqual(F.gridGroupCandidates(['Spacing/space-md', 'Typography/x', 'colour/col']), []);
  assert.deepEqual(F.gridGroupCandidates([]), []);
  // `col-` with no number is not a column.
  assert.deepEqual(F.gridGroupCandidates(['X/col-', 'X/col-abc']), []);
});

test('the panel goes to one candidate and refuses to choose between two', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  const fn = ui.slice(ui.indexOf('function offerGridGroup'), ui.indexOf('function applyAutoImport'));

  // Several: a message, and no write. Picking the bigger one would be a guess dressed as help.
  const many = fn.slice(fn.indexOf('candidates.length > 1'), fn.indexOf('var target'));
  assert.match(many, /set Group to the one you want/);
  assert.equal(many.indexOf('writeConfigBlockText'), -1, 'it must not write when the choice is real');

  // One: change the address and let the ordinary load happen, rather than a second loading path.
  assert.match(fn, /writeConfigBlockText\(api\.serialize\(schema, \{ group: target \}\), 'group-detected'\)/);
  assert.match(fn, /scheduleAutoImport\(\)/);
  assert.match(fn, /so Group was set to it/, 'and it says it moved the field');
});

test('a group is never adopted twice, so this cannot loop', () => {
  // Adopting triggers a load at the new address; if that also came back empty, adopting again would be
  // a loop with a document read in it.
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  const fn = ui.slice(ui.indexOf('function offerGridGroup'), ui.indexOf('function applyAutoImport'));
  assert.match(fn, /if \(groupsAdopted\[key\]\) return false;/);
  assert.match(fn, /groupsAdopted\[key\] = true;/);
  assert.match(ui, /var groupsAdopted = \{\};/);
});

test('detection only runs when the address came back empty', () => {
  // It is a fallback, not an override: a group that resolves is an answer, and a panel that moved a
  // field you typed while it was working would be intolerable.
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  const apply = ui.slice(ui.indexOf('function applyAutoImport'), ui.indexOf('function recognitionNote'));
  const guard = apply.indexOf("found.source !== 'recognised'");
  const offer = apply.indexOf('offerGridGroup(found)');
  assert.ok(guard > 0 && offer > guard, 'the offer sits inside the "nothing found" branch');
});

test('the library only offers a group other than the one already asked for', () => {
  const foundation = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'
  );
  assert.match(foundation, /answer\.candidates = candidates\.groups\.filter/);
  assert.match(foundation, /entry\.group !== \(group == null \? '' : group\)/,
    'or it would offer to move you to where you already are');
});

test('opening a panel asks where the grid is, and asks read-only', () => {
  // Detection lived inside the fill, and the fill only runs on an address change — so finding the group
  // required changing the very field detection was meant to fill. Opening now asks, but asks the
  // read-only half: auto-import's whole safety property is that nothing fills over your values unless
  // you changed the address, and opening a script is not that instruction.
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');

  assert.match(ui, /function scheduleGroupDetection\(\)/);
  assert.match(ui, /requestAutoImport\(0, true\)/, 'and it asks in detect-only mode');
  // Wired to the render, which is the moment a panel opens on an address.
  const project = ui.slice(ui.indexOf('function projectConfigIntoForm'));
  assert.ok(project.indexOf('scheduleGroupDetection()') > 0 &&
    project.indexOf('scheduleGroupDetection()') < project.indexOf('let structureSyncTimeout'),
    'the render asks');

  // The detect-only reply must not fill.
  //
  // Asserted on the branch's *contents* rather than on a character distance from the `if`. The window
  // used to be 220 characters, which made a comment inside the branch a test failure — a bound that
  // measures prose is a bound that fails for the wrong reason, and the thing being pinned is which
  // functions this branch may call.
  const handler = ui.slice(ui.indexOf("if (data.autoImport !== undefined)"));
  const branch = handler.slice(0, handler.indexOf('return;'));
  const detectPart = branch.slice(branch.indexOf('if (data.detectOnly)'), branch.indexOf('} else {'));
  assert.match(detectPart, /offerGridGroup/, 'the detect-only half asks where the grid is');
  assert.equal(detectPart.indexOf('applyAutoImport'), -1,
    'a detect-only answer must never reach the fill');
});

test('one question per address, so a render cannot become a poll', () => {
  // Rendering asks, and applying the answer re-renders. The original loop was fill → re-render → fill;
  // this is bounded by two independent guards rather than by hoping the read is cheap.
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  const fn = ui.slice(ui.indexOf('function scheduleGroupDetection'), ui.indexOf('function offerGridGroup'));
  assert.match(fn, /if \(detectedFor\[key\]\) return;/);
  assert.match(fn, /detectedFor\[key\] = true;/);
  assert.match(fn, /collection \+ '\\u0000' \+ \(values\.group == null \? '' : values\.group\)/,
    'keyed by the whole address, so changing either field is a new question');
  assert.match(ui, /var detectedFor = \{\};/);
});
