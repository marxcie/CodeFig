/**
 * Mode chips, from the click to the intent a run receives.
 *
 * A chip is a 1:1 view of a Figma mode, so every one of these is really a question about **what
 * happens to values and bindings**:
 *
 *   - a rename must be a rename, or the mode's values are orphaned on a mode nobody can see;
 *   - a removal must happen only when it was asked for, or a config pasted from another file deletes
 *     modes in this one;
 *   - the config's per-mode settings must follow the chips, or the Mode settings tabs describe modes
 *     that no longer exist.
 *
 * The renderer is **executed** here, through `tests/dom-shim.js`, rather than read as source. Every
 * other renderer test greps, which is how `if (field.tabs) return;` in a function with no `field` in
 * scope shipped and killed every form in the plugin.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const shim = require('../tests/dom-shim.js');
const { document } = shim.install();
const P = require('../src/config-ui/parser.js');
const R = require('../src/config-ui/renderer.js');

const BLOCK = [
  'collectionName: "Responsive System", // @collection @label: Collection',
  '// @collectionModes: Collection modes',
  'modes: [',
  '  { name: "Desktop", containerWidth: 1440, columns: 12 },',
  '  { name: "Tablet", containerWidth: 834, columns: 8 },',
  '  { name: "Mobile", containerWidth: 390, columns: 4 },',
  '], // @rows: name:text=Mode|containerWidth:number=Width|columns:number=Columns @tabs @label: Modes',
].join('\n');

const FILE_MODES = [
  { modeId: '1:0', name: 'Desktop', valueCount: 24 },
  { modeId: '1:1', name: 'Tablet', valueCount: 12 },
  { modeId: '1:2', name: 'Mobile', valueCount: 12 },
];

/** The form as the plugin builds it, plus the panel state the UI would hold. */
function renderForm(block) {
  const schema = P.parse(block || BLOCK);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  const chips = container.querySelector('[data-chips-field]');
  const entries = schema.rows.filter((r) => r.type === 'field' && r.name === 'modes')[0].value;
  const ids = entries.map((e) => (FILE_MODES.filter((m) => m.name === e.name)[0] || {}).modeId || null);
  return { schema, container, chips, entries, ids };
}

function chipNames(chips) {
  return R.readChipsControl(chips);
}

/** Click a chip's label, type, press Enter — the rename gesture, through the real listeners. */
function renameChip(chips, index, to) {
  const chip = chips.querySelectorAll('.config-ui-chip')[index];
  chip.querySelector('.config-ui-chip-label').dispatch('click');
  const input = chip.querySelector('.config-ui-chip-input');
  assert.ok(input, 'clicking a label did not open an input');
  input.value = to;
  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });
}

test('a rename is a rename: same mode, new name, values untouched', () => {
  const { chips, entries, ids } = renderForm();
  renameChip(chips, 1, 'Pad');

  assert.deepEqual(chipNames(chips), ['Desktop', 'Pad', 'Mobile']);
  const op = R.readChipOp(chips);
  assert.deepEqual(op, { op: 'rename', index: 1, from: 'Tablet', to: 'Pad' });

  const next = P.applyChipOp(entries, ids, op);
  assert.equal(next.entries[1].name, 'Pad');
  assert.equal(next.entries[1].containerWidth, 834, "the mode's own settings came with it");
  assert.deepEqual(next.ids, ['1:0', '1:1', '1:2'], 'and it is still the same Figma mode');

  const intents = P.modeIntents('Responsive System', next.entries, next.ids, FILE_MODES, []);
  assert.deepEqual(intents.renames, [{ modeId: '1:1', from: 'Tablet', to: 'Pad' }]);
  assert.deepEqual(intents.removals, [], 'a rename never removes');
  assert.deepEqual(intents.additions, [], 'nor adds');
});

test('renaming twice does not turn into an add', () => {
  // The failure this guards is subtle: after the first rename the config says `Pad` and the file still
  // says `Tablet`, so anything matching on names sees a mode it has never heard of. The id is what
  // makes the second rename still a rename, and it is positional because the name cannot be trusted.
  const { entries, ids } = renderForm();
  const once = P.applyChipOp(entries, ids, { op: 'rename', index: 1, from: 'Tablet', to: 'Pad' });
  const twice = P.applyChipOp(once.entries, once.ids, { op: 'rename', index: 1, from: 'Pad', to: 'Slate' });

  const intents = P.modeIntents('Responsive System', twice.entries, twice.ids, FILE_MODES, []);
  assert.deepEqual(intents.renames, [{ modeId: '1:1', from: 'Tablet', to: 'Slate' }]);
  assert.deepEqual(intents.additions, []);
  assert.deepEqual(intents.removals, []);
});

test('the dash removes the mode it was clicked on, and only because it was clicked', () => {
  const { chips, entries, ids } = renderForm();
  const chip = chips.querySelectorAll('.config-ui-chip')[2];
  chip.querySelector('.config-ui-chip-remove').dispatch('click');

  assert.deepEqual(chipNames(chips), ['Desktop', 'Tablet']);
  const op = R.readChipOp(chips);
  assert.deepEqual(op, { op: 'remove', index: 2, name: 'Mobile' });

  const next = P.applyChipOp(entries, ids, op);
  assert.equal(next.entries.length, 2);
  assert.deepEqual(next.removed, { modeId: '1:2', name: 'Mobile' });

  // With the record, a removal. Without it, nothing — same config, same file, same lists.
  const asked = P.modeIntents('Responsive System', next.entries, next.ids, FILE_MODES, ['1:2']);
  assert.deepEqual(asked.removals, [{ modeId: '1:2', name: 'Mobile' }]);
  const notAsked = P.modeIntents('Responsive System', next.entries, next.ids, FILE_MODES, []);
  assert.deepEqual(notAsked.removals, [], 'a mode missing from the config is not evidence of intent');
});

test('a config pasted from another file adds and never removes', () => {
  // The standing invariant. This file has Desktop/Tablet/Mobile; the pasted config names Phone, which
  // matches nothing, so it has no ids at all. Three modes are unaccounted for and none may be touched.
  const pasted = [{ name: 'Phone', containerWidth: 390, columns: 4 }];
  const intents = P.modeIntents('Responsive System', pasted, [null], FILE_MODES, []);
  assert.deepEqual(intents.additions, ['Phone']);
  assert.deepEqual(intents.removals, []);
  assert.deepEqual(intents.renames, []);
});

test('the + adds a mode whose settings are the neighbour it was added beside', () => {
  const { chips, entries, ids } = renderForm();
  chips.querySelector('.config-ui-chip-add').dispatch('click');
  const input = chips.querySelector('.config-ui-chip-input');
  assert.ok(input, 'pressing + did not open an input');
  // And it replaces the `+` rather than standing beside it.
  assert.equal(chips.querySelector('.config-ui-chip-add').style.display, 'none');
  input.value = 'Watch';
  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });

  assert.deepEqual(chipNames(chips), ['Desktop', 'Tablet', 'Mobile', 'Watch']);
  const next = P.applyChipOp(entries, ids, R.readChipOp(chips));
  assert.equal(next.entries.length, 4);
  assert.equal(next.entries[3].name, 'Watch');
  assert.equal(next.entries[3].columns, 4, 'seeded from the last mode, so its tab has real fields');
  assert.equal(next.ids[3], null, 'and it is not any mode in the file yet');

  const intents = P.modeIntents('Responsive System', next.entries, next.ids, FILE_MODES, []);
  assert.deepEqual(intents.additions, ['Watch']);
  assert.deepEqual(intents.removals, []);
});

test('a name the chips already hold is refused rather than duplicated', () => {
  const { chips } = renderForm();
  chips.querySelector('.config-ui-chip-add').dispatch('click');
  const input = chips.querySelector('.config-ui-chip-input');
  input.value = 'Tablet';
  input.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.deepEqual(chipNames(chips), ['Desktop', 'Tablet', 'Mobile']);
  assert.equal(R.readChipOp(chips), null, 'and nothing was announced');
});

test('Escape leaves everything as it was', () => {
  const { chips } = renderForm();
  chips.querySelector('.config-ui-chip-add').dispatch('click');
  const input = chips.querySelector('.config-ui-chip-input');
  input.value = 'Watch';
  input.dispatch('keydown', { key: 'Escape', preventDefault() {} });
  assert.deepEqual(chipNames(chips), ['Desktop', 'Tablet', 'Mobile']);
  assert.equal(R.readChipOp(chips), null);
  assert.ok(chips.querySelector('.config-ui-chip-add'), 'and the + is back');
});

test('reordering carries each mode and its id to the new position', () => {
  const { entries, ids } = renderForm();
  const next = P.applyChipOp(entries, ids, { op: 'reorder', from: 2, to: 0 });
  assert.deepEqual(next.entries.map((e) => e.name), ['Mobile', 'Desktop', 'Tablet']);
  assert.deepEqual(next.ids, ['1:2', '1:0', '1:1']);
  // Nothing to do to the document: order is order.
  const intents = P.modeIntents('Responsive System', next.entries, next.ids, FILE_MODES, []);
  assert.deepEqual(intents, { collection: 'Responsive System', renames: [], removals: [], additions: [] });
});

test('an operation is consumed as it is read, so it cannot be applied twice', () => {
  // `getValues` is called again by every visibility pass. An op left lying around would add two modes.
  const { chips } = renderForm();
  chips.querySelector('.config-ui-chip-remove') // Desktop's
    ? null : null;
  renameChip(chips, 0, 'Wide');
  assert.ok(R.readChipOp(chips), 'the first read has it');
  assert.equal(R.readChipOp(chips), null, 'the second does not');
});

test('remove then add the same name is a replacement, and the order makes it one', () => {
  // Márton's spec: "remove-then-add is how you replace a mode". So the removal stands — the old mode
  // goes with its values and a fresh one is created under the same name.
  //
  // This test caught the ordering being wrong. Removals used to run *after* `setupModes`, which found
  // the name still present, did nothing, and then the removal took the mode away: a deletion, not a
  // replacement. Removals now run before anything is written.
  const { entries, ids } = renderForm();
  const gone = P.applyChipOp(entries, ids, { op: 'remove', index: 1, name: 'Tablet' });
  const back = P.applyChipOp(gone.entries, gone.ids, { op: 'add', name: 'Tablet' });

  const intents = P.modeIntents('Responsive System', back.entries, back.ids, FILE_MODES, ['1:1']);
  assert.deepEqual(intents.removals, [{ modeId: '1:1', name: 'Tablet' }], 'the old mode still goes');
  assert.deepEqual(intents.additions, ['Tablet'], 'and a fresh one is created');

  const lib = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@variables.js'), 'utf8'
  );
  const renameAt = lib.indexOf('collection.renameMode(r.modeId');
  const removeAt = lib.indexOf('var out = removeModes(collection, names);');
  assert.ok(renameAt > 0 && removeAt > renameAt, 'renames still come before removals');

  const grid = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'grid.js'),
    'utf8'
  );
  assert.ok(grid.indexOf('applyModeIntents(collection, intents)') <
    grid.indexOf('setupModes(collection, modes)'),
    'and the whole of it runs before setupModes, or a replacement is a deletion');

  // And the panel says which of the two it is about to do, because the outcomes differ.
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  assert.match(ui, /Replacing mode ' \+ mode\.name \+ ' at Run/);
  assert.match(ui, /it is recreated empty/);
});

test('chips carry the mode ids by position, never by name', () => {
  const { chips, entries, ids } = renderForm();
  R.populateChipsControl(chips, ids);
  assert.deepEqual(
    [].map.call(chips.querySelectorAll('.config-ui-chip'), (c) => c.getAttribute('data-mode-id')),
    ['1:0', '1:1', '1:2']
  );

  // After a rename the name no longer matches the file, and the id must still be on the chip. The
  // rename gesture redraws the chips, which drops the ids — putting them back is the panel's job, and
  // it does it by position for exactly this reason.
  renameChip(chips, 1, 'Pad');
  const next = P.applyChipOp(entries, ids, R.readChipOp(chips));
  assert.equal(chips.querySelectorAll('.config-ui-chip')[1].getAttribute('data-mode-id'), null,
    'the redraw dropped them, which is why the panel re-populates after every render');
  R.populateChipsControl(chips, next.ids);
  const chip = chips.querySelectorAll('.config-ui-chip')[1];
  assert.equal(chip.getAttribute('data-chip-name'), 'Pad');
  assert.equal(chip.getAttribute('data-mode-id'), '1:1', 'and by position, not by name');
});

test('the last mode has no dash, because a collection cannot have none', () => {
  const one = renderForm(BLOCK.replace(
    /modes: \[[\s\S]*?\], \/\//,
    'modes: [{ name: "Desktop", containerWidth: 1440, columns: 12 }], //'
  ));
  const chip = one.chips.querySelectorAll('.config-ui-chip')[0];
  assert.equal(chip.querySelector('.config-ui-chip-remove'), null);
  assert.ok(one.chips.querySelector('.config-ui-chip-add'), 'but a mode can still be added');
});

test('intents recorded for one collection are refused by another', () => {
  // The panel's Collection field can change after a chip was removed. `applyModeIntents` checks the
  // name rather than trusting it, so a removal cannot land on whatever is there now.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@variables.js'), 'utf8'
  );
  assert.match(source, /if \(intents\.collection && intents\.collection !== collection\.name\)/);
  assert.match(source, /this run writes to/, 'and says which two disagreed');
  // And it is a refusal rather than a partial application: nothing has run by that point.
  const guard = source.indexOf('intents.collection !== collection.name');
  assert.ok(guard > 0 && guard < source.indexOf('collection.renameMode(r.modeId'));
});

test('a run with no panel sends no intents, and grid falls back to matching names', () => {
  const grid = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'grid.js'),
    'utf8'
  );
  assert.match(grid, /window\.codefigModeIntents/, 'the script reads the channel');
  assert.match(grid, /applyModeIntents\(collection, intents\)/);
  assert.match(grid, /@import \{[^}]*applyModeIntents[^}]*\} from "@Variables"/,
    'and imports it, or the call resolves to nothing at run time');

  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'code.ts'), 'utf8');
  assert.match(code, /codefigModeIntents: msg\.modeIntents \|\| null/,
    'the sandbox passes them through, and null is the CLI case');
});

test('an edit anywhere in the form keeps what the form does not show', () => {
  // Found in the plugin, not here: the config block had lost `name` from every mode, so the chips had
  // nothing to show and no id could be matched. One cause, three symptoms.
  //
  // Under `@tabs` the `name` column is deliberately not rendered — the chips above own the name — and
  // `collectRows` built each entry from the rendered cells alone. So the first edit to *any* field in
  // the form deleted every mode's name from the config. A cell that is not rendered is not a cell
  // whose value is empty.
  const schema = P.parse(BLOCK);
  const container = document.createElement('div');
  R.buildForm(schema, container);

  let values = null;
  R.attachListeners(container, schema, (v) => { values = v; });

  // An edit to a cell that *is* rendered, in one mode.
  const gap = container.querySelectorAll('[data-row-field="containerWidth"]')[1];
  gap.value = '900';
  gap.dispatchEvent(new shim.Event('change', { bubbles: true }));

  assert.deepEqual(values.modes.map((m) => m.name), ['Desktop', 'Tablet', 'Mobile'],
    'the names the tabs never render must survive the tabs being read');
  assert.equal(values.modes[1].containerWidth, 900, 'and the edit still lands');
  assert.equal(values.modes[1].columns, 8, 'and its neighbours in the same row are untouched');
});

test('a key no column claims survives too, not just name', () => {
  // The rule is general: the panel may overwrite what it shows and nothing else. A per-mode setting a
  // future panel adds must not be deleted by this one.
  const block = BLOCK.replace(
    '{ name: "Tablet", containerWidth: 834, columns: 8 },',
    '{ name: "Tablet", containerWidth: 834, columns: 8, density: "compact" },'
  );
  const schema = P.parse(block);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  let values = null;
  R.attachListeners(container, schema, (v) => { values = v; });

  const cell = container.querySelectorAll('[data-row-field="columns"]')[0];
  cell.value = '16';
  cell.dispatchEvent(new shim.Event('change', { bubbles: true }));

  assert.equal(values.modes[1].density, 'compact');
  assert.equal(values.modes[0].columns, 16);
});

test('the note calls a replacement a replacement, whatever the casing', () => {
  // Found in the plugin. The config writes `mobile`, the file holds `Mobile` (the generator
  // capitalises), so a case-sensitive check read the re-added chip as a different mode and the note
  // said "Removing" for a replacement — understating the outcome in the one place that exists to
  // state it. One definition of "the same mode name", used by both the intents and the wording.
  assert.equal(P.sameModeName('mobile', 'Mobile'), true);
  assert.equal(P.sameModeName(' Mobile ', 'mobile'), true);
  assert.equal(P.sameModeName('Mobile', 'Desktop'), false);

  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  assert.match(ui, /sameModeName\(chipName, mode\.name\)/,
    'the note is comparing names some other way again');
});

// ---------------------------------------------------------------------------
// Chip and tab order
// ---------------------------------------------------------------------------

test('the config follows the collection\'s mode order, not the order it was stored in', () => {
  // Márton's file has Desktop-large · Desktop · Tablet · Tablet-small · Mobile, and a loaded config
  // showed them in no order at all — a manifest's write order, or a paste's. The chips and the Mode
  // settings tabs are drawn from this array, so this *is* "chip order is mode order".
  const file = [
    { modeId: '1', name: 'Desktop-large' }, { modeId: '2', name: 'Desktop' },
    { modeId: '3', name: 'Tablet' }, { modeId: '4', name: 'Tablet-small' },
    { modeId: '5', name: 'Mobile' },
  ];
  const stored = [
    { name: 'Mobile', gap: 16 }, { name: 'Desktop', gap: 40 }, { name: 'Tablet-small', gap: 20 },
    { name: 'Desktop-large', gap: 48 }, { name: 'Tablet', gap: 24 },
  ];
  const ids = P.matchModeIds(stored, file);
  const out = P.orderModesByFile(stored, ids, file);

  assert.equal(out.changed, true);
  assert.deepEqual(out.entries.map((e) => e.name),
    ['Desktop-large', 'Desktop', 'Tablet', 'Tablet-small', 'Mobile']);
  assert.deepEqual(out.ids, ['1', '2', '3', '4', '5'], 'and the ids move with them');
  // Each mode keeps its own settings — this is a reorder, not a rewrite.
  assert.equal(out.entries[4].gap, 16);
  assert.equal(out.entries[0].gap, 48);
});

test('reordering is idempotent, so it cannot become a rebuild loop', () => {
  // It writes the block, which re-projects the form, which is where auto-import once looped.
  const file = [{ modeId: '1', name: 'A' }, { modeId: '2', name: 'B' }];
  const once = P.orderModesByFile([{ name: 'B' }, { name: 'A' }], ['2', '1'], file);
  assert.equal(once.changed, true);
  assert.equal(P.orderModesByFile(once.entries, once.ids, file).changed, false);
});

test('a renamed chip keeps its position, because the match is by id first', () => {
  // The file still calls it Tablet; the config calls it Pad. Matching on names would drop it to the
  // end as an unknown mode, which is the same class of mistake as treating a rename as an add.
  const file = [{ modeId: '1', name: 'Desktop' }, { modeId: '2', name: 'Tablet' },
    { modeId: '3', name: 'Mobile' }];
  const renamed = P.applyChipOp(
    [{ name: 'Desktop' }, { name: 'Tablet' }, { name: 'Mobile' }], ['1', '2', '3'],
    { op: 'rename', index: 1, from: 'Tablet', to: 'Pad' }
  );
  const out = P.orderModesByFile(renamed.entries, renamed.ids, file);
  assert.deepEqual(out.entries.map((e) => e.name), ['Desktop', 'Pad', 'Mobile']);
  assert.equal(out.changed, false);
});

test('a mode the file does not have follows the ones it does, and is never dropped', () => {
  // A pasted config, or a mode added and not yet run. It is not evidence of an order, so it does not
  // set one — but losing it would be the loss class this whole area exists to avoid.
  const file = [{ modeId: '1', name: 'Desktop' }, { modeId: '2', name: 'Mobile' }];
  const out = P.orderModesByFile(
    [{ name: 'Watch' }, { name: 'Mobile' }, { name: 'Desktop' }], [null, '2', '1'], file
  );
  assert.deepEqual(out.entries.map((e) => e.name), ['Desktop', 'Mobile', 'Watch']);
  assert.equal(out.ids[2], null);
});

test('the reorder runs after the fill, not before it', () => {
  // `fillConfigBlock` inserts entries in the *incoming* config's order, so reordering first would be
  // undone by the fill that follows — and the symptom would be "sometimes it is sorted".
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  const handler = ui.slice(ui.indexOf("if (data.autoImport !== undefined)"));
  const fillAt = handler.indexOf('applyAutoImport(data.autoImport)');
  const orderAt = handler.indexOf('orderConfigModesToFile()');
  assert.ok(fillAt > 0 && orderAt > fillAt, 'the reorder must come after the fill');
});
