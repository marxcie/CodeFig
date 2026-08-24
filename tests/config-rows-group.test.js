/**
 * A nested column, **run** rather than grepped.
 *
 * `config-rows.test.js` asserts on the renderer's source, and says why: this repo's renderer tests read the
 * file as text. That is also how `if (field.tabs) return;` landed in a function with no `field` in scope and
 * killed every form in the plugin — the source said the right thing and nothing ever called it.
 *
 * So the nested group gets the other kind of test. `tests/dom-shim.js` exists to run the renderer, and the
 * two things that can only be checked by running it are here:
 *
 * - **The collision.** Three anchors each holding a `hue` is the normal shape. A flat `data-row-field="hue"`
 *   lookup finds the first one three times and writes it into all three anchors — a wrong answer with no
 *   error anywhere. Only a read-back can show that it does not.
 * - **The round trip through the DOM.** Parse → render → edit → collect has to return the nesting it was
 *   given, or the block a user pastes comes back flattened.
 */
const test = require('node:test');
const assert = require('node:assert');

const fs = require('fs');
const path = require('path');

const shim = require('./dom-shim.js');
const { document } = shim.install();

const parser = require('../src/config-ui/parser.js');
const renderer = require('../src/config-ui/renderer.js');

const BLOCK = [
  'modes: [',
  '  { name: "Granite", bright: { hue: 250, chroma: 0.002 }, middle: { hue: 264, chroma: 0.012 },' +
    ' dark: { hue: 275, chroma: 0.006 } },',
  '  { name: "Moss", bright: { hue: 135, chroma: 0.004 }, middle: { hue: 145, chroma: 0.022 },' +
    ' dark: { hue: 155, chroma: 0.01 } }',
  '], // @rows: name:text=Mode|bright:{hue:number=Hue|chroma:number=Chroma}=Bright' +
    '|middle:{hue:number=Hue|chroma:number=Chroma}=Middle' +
    '|dark:{hue:number=Hue|chroma:number=Chroma}=Dark @tabs @label: Modes'
].join('\n');

function renderBlock(block) {
  const host = document.createElement('div');
  const schema = parser.parse(block);
  renderer.buildForm(schema, host);
  return { host, schema };
}

function rowsField(schema) {
  return schema.rows.filter((r) => r.type === 'field' && r.inputType === 'rows')[0];
}

test('a group renders as one cell: its label, and its parts captioned', () => {
  const { host } = renderBlock(BLOCK);
  // Both rows are built and the inactive one is hidden, so it is three anchors per mode.
  const cells = host.querySelectorAll('.config-ui-rows-cell--group');
  assert.equal(cells.length, 6, 'expected three group cells per mode, got ' + cells.length);

  const first = cells[0];
  assert.equal(first.querySelector('.config-ui-rows-cell-label').textContent, 'Bright');
  const parts = first.querySelectorAll('.config-ui-rows-group-part');
  assert.equal(parts.length, 2, 'a group should build one part per nested column');
  assert.deepEqual(
    [...parts].map((el) => el.querySelector('.config-ui-rows-group-label').textContent),
    ['Hue', 'Chroma']
  );
  // A group cell is not a `<label>`: it contains labels of its own, and clicking the group's caption would
  // otherwise focus its first input.
  assert.equal(first.tagName.toLowerCase(), 'div');
});

test('every part addresses itself by group.part, so three hues cannot collide', () => {
  const { host } = renderBlock(BLOCK);
  // Walked rather than queried with a descendant selector: `dom-shim.js` throws on those on purpose, so
  // that a test cannot quietly match nothing and pass.
  const keys = [...host.querySelectorAll('.config-ui-rows-group-part')]
    .map((part) => part.querySelector('[data-row-field]'))
    .filter(Boolean)
    .map((el) => el.getAttribute('data-row-field'));
  // Six per mode, twelve in all, and every one distinct within its row.
  assert.ok(keys.includes('bright.hue') && keys.includes('middle.hue') && keys.includes('dark.hue'),
    'the three hues are not distinguishable: ' + JSON.stringify(keys.slice(0, 6)));
  assert.equal(keys.filter((k) => k === 'hue').length, 0, 'a part still uses a bare key');
});

test('the values rendered into a group are the values the config held', () => {
  const { host } = renderBlock(BLOCK);
  const value = (row, key) => row.querySelector('[data-row-field="' + key + '"]').value;
  const rows = host.querySelectorAll('.config-ui-rows-item');
  assert.equal(value(rows[0], 'bright.hue'), '250');
  assert.equal(value(rows[0], 'middle.chroma'), '0.012');
  assert.equal(value(rows[1], 'bright.hue'), '135');
  assert.equal(value(rows[1], 'dark.chroma'), '0.01');
});

test('a group reads back nested, and an edit lands in the part that was edited', () => {
  const { host, schema } = renderBlock(BLOCK);
  const field = rowsField(schema);
  const wrap = host.querySelector('[data-rows-field="modes"]');

  // Nothing touched: the read-back is the config it was given.
  const before = renderer.collectRows(wrap, field);
  assert.deepEqual(before[0].bright, { hue: 250, chroma: 0.002 });
  assert.deepEqual(before[0].middle, { hue: 264, chroma: 0.012 });
  assert.deepEqual(before[1].dark, { hue: 155, chroma: 0.01 });

  // One edit, to the middle anchor's hue of the second mode — the case a flat lookup gets wrong.
  const rows = host.querySelectorAll('.config-ui-rows-item');
  rows[1].querySelector('[data-row-field="middle.hue"]').value = '200';
  const after = renderer.collectRows(wrap, field);

  assert.equal(after[1].middle.hue, 200, 'the edit did not land');
  assert.equal(after[1].bright.hue, 135, 'the edit leaked into Bright');
  assert.equal(after[1].dark.hue, 155, 'the edit leaked into Dark');
  assert.equal(after[0].middle.hue, 264, 'the edit leaked into the other mode');
  // A number reads back as a number, through the same reader a top-level column uses.
  assert.equal(typeof after[1].middle.hue, 'number');
  assert.equal(typeof after[1].middle.chroma, 'number');
});

test('a key the group does not render is carried through, not dropped', () => {
  // The same rule the flat collector has: the panel may only overwrite what it actually shows. A config
  // holding a key this build has no column for must survive a form interaction.
  const block = BLOCK.replace(
    '{ name: "Granite", bright: { hue: 250, chroma: 0.002 }',
    '{ name: "Granite", bright: { hue: 250, chroma: 0.002, alpha: 0.5 }'
  );
  const { host, schema } = renderBlock(block);
  const out = renderer.collectRows(host.querySelector('[data-rows-field="modes"]'), rowsField(schema));
  assert.equal(out[0].bright.alpha, 0.5, 'an unrendered nested key was dropped');
  assert.equal(out[0].bright.hue, 250);
});

test('a part carries its own helper, on the part rather than on the group', () => {
  const block = 'modes: [\n  { name: "a", seed: { hex: "", lock: false } }\n' +
    '], // @rows: name:text=Mode|seed:{hex:text=Seed color|lock:checkbox=Lock seed ' +
    '@helper: On. Keeps its value.\\nOff. Moves to the nearest step.}=Seed @tabs';
  const { host } = renderBlock(block);
  const parts = host.querySelectorAll('.config-ui-rows-group-part');
  assert.equal(parts.length, 2);
  // A part with nothing to say gets no button. That is the whole reason `attachInfo` decides rather
  // than the caller: a row of \u24d8 that mostly say nothing teaches people not to click them.
  assert.equal(parts[0].querySelector('.config-ui-info'), null, 'the hex part gained a helper');
  const info = parts[1].querySelector('.config-ui-info');
  assert.ok(info, 'the lock part has no helper');
  // Two lines, because a toggle's On./Off. pair is a table of two cases and not a paragraph. The
  // bubble is built on hover, so the text lives on the button — which is also where the specimen page
  // and everything else that never hovers can read it.
  assert.equal(info.getAttribute('data-info'),
    'On. Keeps its value.\nOff. Moves to the nearest step.');
  assert.equal(parts[1].querySelector('.config-ui-field-note'), null,
    'the old note under the part is back');
});

const BLOCKS = [
  'modes: [',
  '  { name: "Granite", seed: { hex: "", lock: false }, bright: { hue: 250, chroma: 0.002 } },',
  '  { name: "Moss", seed: { hex: "#717A71", lock: true }, bright: { hue: 135, chroma: 0.004 } }',
  '], // @rows: name:text=Mode|#Seed|seed:{hex:text=Seed color|lock:checkbox=Lock seed}=Seed' +
    '|#Palette|bright:{hue:number=Hue|chroma:number=Chroma}=Bright @blocks @label: Modes'
].join('\n');

test('@blocks shows every row in full, with no tab strip and one Add', () => {
  const { host } = renderBlock(BLOCKS);
  const wrap = host.querySelector('[data-rows-field="modes"]');
  assert.ok(/config-ui-rows--blocks/.test(wrap.getAttribute('class')), 'the display modifier is missing');
  assert.equal(host.querySelectorAll('.config-ui-rows-tabs').length, 0, 'blocks built a tab strip');
  assert.equal(host.querySelectorAll('.config-ui-rows-item').length, 2);
  // Nothing is hidden: both rows are on screen, which is the point of the display.
  host.querySelectorAll('.config-ui-rows-item').forEach((item) => {
    assert.notEqual(item.style.display, 'none', 'a block was hidden');
  });
  // Add stays, because there are no chips here to manage the modes instead — and so does Remove, one per
  // block. **The frames show Add and no Remove**, but they also never show the state where you added a block
  // by mistake: Add without Remove is a one-way door. Safe to keep, because removing a block removes a
  // mode's *config* and nothing reaches the document until Run.
  assert.equal(host.querySelectorAll('.config-ui-rows-add').length, 1);
  assert.equal(host.querySelectorAll('.config-ui-rows-remove--block').length, 2,
    'a block cannot be removed');
});

test('a block is titled from the name column’s own label, not by depluralising the field’s', () => {
  // `name:text=Mode` says "Mode". Chopping a trailing `s` off *Modes* works and off *Radius* does not, and
  // the right word is already written down one line away.
  const { host } = renderBlock(BLOCKS);
  const titles = [...host.querySelectorAll('.config-ui-rows-item-title')];
  assert.equal(titles.length, 2);
  // The remove affordance lives in the title row now — no frame has a full-width Remove, and a bar the width
  // of the panel competes with Add for attention. So the title's *text* is read from its own span rather than
  // from the row, which now holds two children.
  const named = (t) => t.querySelector('.config-ui-rows-item-title-name').textContent;
  assert.equal(named(titles[0]), 'Granite');
  assert.equal(named(titles[1]), 'Moss');
  assert.match(titles[0].textContent, /^Mode Granite/);
  // This fixture has no chips row, so the block keeps its own \u00d7 — that is the fallback, and it is only
  // when chips own the mode list that removal moves to them. The chevron is there either way.
  assert.equal(titles[0].querySelector('.config-ui-rows-remove--block').textContent, '\u00d7');
  assert.ok(titles[0].querySelector('.config-ui-rows-collapse'), 'no collapse chevron on the title row');

});

test('a heading among the columns is the form’s own heading, one level down', () => {
  // `#Seed` parses to the same `{ type: "heading", level }` a `// ## Heading` line does, and renders as the
  // same element — so the two size ladders cannot drift. That is the reuse, rather than a third layout.
  const { host, schema } = renderBlock(BLOCKS);
  const field = rowsField(schema);
  assert.deepEqual(
    field.columns.filter((c) => c.type === 'heading').map((c) => [c.text, c.level]),
    [['Seed', 2], ['Palette', 2]]
  );

  const first = host.querySelectorAll('.config-ui-rows-item')[0];
  const headings = first.querySelectorAll('.config-ui-heading');
  assert.equal(headings.length, 2, 'the headings did not render inside the block');
  assert.deepEqual([...headings].map((h) => h.tagName.toLowerCase()), ['h2', 'h2']);
  assert.deepEqual([...headings].map((h) => h.textContent), ['Seed', 'Palette']);
  // Not wrapped in a form row: that would bring the panel's inline padding and indent the heading past the
  // fields it names.
  assert.equal(first.querySelectorAll('.config-ui-row--heading').length, 0);
});

test('a heading is not a value, so it writes nothing on read-back', () => {
  const { host, schema } = renderBlock(BLOCKS);
  const out = renderer.collectRows(host.querySelector('[data-rows-field="modes"]'), rowsField(schema));
  assert.deepEqual(Object.keys(out[0]).sort(), ['bright', 'name', 'seed']);
  assert.equal(out[0].seed.hex, '');
  assert.equal(out[1].seed.lock, true);
  assert.deepEqual(out[1].bright, { hue: 135, chroma: 0.004 });
});

test('@blocks round-trips, headings and display flag included', () => {
  assert.equal(parser.serialize(parser.parse(BLOCKS)).trim(), BLOCKS.trim());
});

// A **table**, on purpose. Under `@blocks` — and under `@tabs` — a `name` column is not rendered at all,
// because the block's title and the tab strip already carry it; see the test below. The picker itself is
// still a control, so it is exercised where it still draws.
const MODE_COLUMN = [
  'modes: [',
  '  { name: "Granite", seed: { hex: "#717A71" } },',
  '  { name: "", seed: { hex: "" } }',
  '], // @rows: name:mode=Mode|seed:{hex:text=Seed color}=Seed @label: Modes'
].join('\n');

const MODE_BLOCKS = MODE_COLUMN.replace('=Seed @label: Modes', '=Seed @blocks @label: Modes');

test('a mode column is the picker, addressable, and readable — all three', () => {
  // Two of three is the failure this panel has produced twice: a control that renders, accepts a choice, and
  // saves nothing. So each part is asserted separately.
  const { host, schema } = renderBlock(MODE_COLUMN);
  const field = rowsField(schema);
  assert.equal(field.columns[0].type, 'mode', 'the column did not parse as a picker');

  // Built: a real mode picker per row, not a text input.
  const pickers = [...host.querySelectorAll('[data-mode-field]')];
  assert.equal(pickers.length, 2);
  pickers.forEach((p) => assert.ok(p.querySelector('.config-ui-mode-select'), 'no select in the picker'));

  // Addressable: `collectRows` finds it by the row key, which `buildModeControl` does not set on its own.
  assert.deepEqual(pickers.map((p) => p.getAttribute('data-row-field')), ['name', 'name']);

  // Readable, and showing what the config says before the collection's list has arrived.
  assert.deepEqual([...host.querySelectorAll('.config-ui-mode-select')].map((s) => s.value),
    ['Granite', '']);
  const out = renderer.collectRows(host.querySelector('[data-rows-field="modes"]'), field);
  assert.deepEqual(out.map((r) => r.name), ['Granite', '']);
  assert.equal(out[0].seed.hex, '#717A71', 'the rest of the row survived');
});

test('an empty picker never overwrites a mode name', () => {
  // The mode list arrives a beat after render. Any form change in that window read the picker as empty, and an
  // unguarded write would blank every mode name in the block — the panel overwriting what it cannot yet show.
  const { host, schema } = renderBlock(MODE_COLUMN);
  const field = rowsField(schema);
  const wrap = host.querySelector('[data-rows-field="modes"]');

  // Simulate the pre-population state: a picker with nothing selected.
  host.querySelectorAll('.config-ui-mode-select').forEach((sel) => { sel.value = ''; });
  const out = renderer.collectRows(wrap, field);
  assert.equal(out[0].name, 'Granite', 'an empty picker blanked a name it had not shown');

  const renderSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');
  assert.match(renderSource, /var picked = readModeControl\(el\);\s*\n\s*if \(picked\) target\[column\.key\]/,
    'the mode reader writes an empty answer again');
});

test('a mode column round-trips as `mode`, not as text', () => {
  assert.equal(parser.serialize(parser.parse(MODE_COLUMN)).trim(), MODE_COLUMN.trim());
});

test('under @blocks a name column draws no control, and keeps its name anyway', () => {
  // Márton: *"I'm reconsidering if we need the mode select for the individual modes. It doesn't make sense,
  // remove it."* The block already says *Mode  Granite* across its top, so a dropdown underneath repeating
  // it is the second place — and it let a block point at a mode the file does not have, or two blocks point
  // at one mode, states the name-keyed fill has no answer for.
  //
  // The dangerous half is the read: `collectRows` writes a row from the controls it finds, so a column with
  // no control has to fall through to the value the row already had rather than to nothing. Blanking every
  // mode name is exactly how this went wrong once already, from the other direction.
  const { host, schema } = renderBlock(MODE_BLOCKS);
  const field = rowsField(schema);

  assert.equal(host.querySelectorAll('[data-mode-field]').length, 0, 'the mode select is still drawn');
  assert.equal(host.querySelectorAll('[data-row-field="name"]').length, 0,
    'the name column still renders some other control');

  // The title still names the mode, and still says what kind of thing it is — the word comes from the
  // column's own label, which is why the column stays in the spec rather than being deleted from it.
  // The `×` is the remove control, which lives in the title row.
  const titles = [...host.querySelectorAll('.config-ui-rows-item-title')]
    .map((t) => t.textContent.replace('\u25be', '').replace('\u25b4', '').replace('\u00d7', '').trim());
  assert.deepEqual(titles, ['Mode Granite', 'Mode Row 2']);

  const out = renderer.collectRows(host.querySelector('[data-rows-field="modes"]'), field);
  assert.deepEqual(out.map((r) => r.name), ['Granite', ''], 'a name was lost with its control');
  assert.equal(out[0].seed.hex, '#717A71', 'the rest of the row survived');

  // And it is still the data: serialize writes it back.
  assert.match(parser.serialize(parser.parse(MODE_BLOCKS)), /name: "Granite"/);
});

test('a group part can depend on a field outside its row', () => {
  // HSL has no shared ladder, so a mode's own Lightness *is* its ladder and Chroma is spelled Saturation;
  // OKLCH shares the ladder, so Lightness is not a mode's to hold. Same anchor, different parts, decided by
  // *Color model* — a radio above the whole table that no row holds. Column conditions were read against the
  // row alone, where that name is `undefined` and matches nothing, so every conditional part in every mode
  // disappeared at once.
  const schema = parser.parse([
    'model: "hsl", // @options: hsl:HSL|oklch:OKLCH @radio',
    'modes: [',
    '  { bright: { hue: 0, chroma: 0, saturation: 0 } }',
    '], // @rows: bright:{hue:number=Hue|chroma:number=Chroma{model=oklch}' +
      '|saturation:number=Saturation{model=hsl}}=Bright @blocks @label: Modes'
  ].join('\n'));

  const rows = schema.rows.filter((r) => r.type === 'field' && r.inputType === 'rows')[0];
  const parts = rows.columns.filter((c) => c.key === 'bright')[0].columns;
  assert.deepEqual(parts.map((p) => p.key), ['hue', 'chroma', 'saturation']);
  assert.equal(parts[0].showWhen, undefined, 'an unconditional part gained a condition');
  assert.deepEqual(parts[1].showWhen, [{ field: 'model', values: ['oklch'] }]);
  assert.deepEqual(parts[2].showWhen, [{ field: 'model', values: ['hsl'] }]);

  // And the renderer puts the condition on the part, not on the cell: the two that swap are inside one group,
  // so hiding the cell would take the whole anchor with them.
  const R = fs.readFileSync(path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');
  const group = R.match(/function buildRowGroup\([\s\S]*?\n  \}/)[0];
  assert.match(group, /part\.showWhen/, 'buildRowGroup ignores a part condition again');
  // Nearest scope wins — group, then row, then form — so a part can name a sibling part, a cell can name a
  // sibling cell, and either can name a setting above the whole table.
  assert.match(R, /function applyConditions\(root, scopes\)/,
    'the scope chain is gone, so a condition resolves against one place again');
  // The fallback, in the spelling it has now: the row scopes first, then the form. `conditionValueOf` is
  // the form-level reader rather than a raw `vals[field]`, because a **curve** field answers `original` or
  // `curve` — its coordinates match no condition anyone would write.
  assert.match(R, /found \? showWhenValueStr\(seen\) : conditionValueOf\(field\)/,
    'a condition no longer falls back to the form');
  assert.match(R, /config-ui-rows-group"\)\.forEach\(function \(group\)/,
    'field-level groups are no longer swept, so a part condition inside one never evaluates');
});

test('a column carries its own placeholder, and an edit does not lose it', () => {
  // Frame 2065:4154 is the panel as it opens and every cell in it holds a grey example. Without them a
  // numeric cell labelled *Chroma* gives a first-time reader nothing: 0.012 and 12 are both plausible and
  // only one of them is a colour. Field-level `@placeholder="…"` already existed; a column had no way to
  // say it, which is why the empty state could not be reproduced.
  const block = [
    'modes: [',
    '  { bright: { hue: 0, chroma: 0 } }',
    '], // @rows: bright:{hue:number@placeholder="eg. 264"=Hue' +
      '|chroma:number@placeholder="eg. 0.012"=Chroma}=Bright @blocks @label: Modes'
  ].join('\n');

  const schema = parser.parse(block);
  const parts = schema.rows.filter((r) => r.inputType === 'rows')[0]
    .columns.filter((c) => c.key === 'bright')[0].columns;
  assert.deepEqual(parts.map((c) => c.placeholder), ['eg. 264', 'eg. 0.012']);
  assert.deepEqual(parts.map((c) => c.label), ['Hue', 'Chroma'],
    'the placeholder was swallowed into the label — it holds an "=" and the label splits at the first one');

  // It reaches the input, rather than being parsed and dropped.
  const host = document.createElement('div');
  renderer.buildForm(schema, host);
  const hue = host.querySelector('[data-row-field="bright.hue"]');
  assert.equal(hue.placeholder, 'eg. 264');

  // And it survives a reprint, or the first keystroke in any cell deletes every example in the block.
  assert.match(parser.serialize(schema, null), /@placeholder="eg\. 0\.012"/);
});

test('hiding a cell keeps the block\'s value, not the one the form was built with', () => {
  // Symptom 5. A cell nobody can see writes nothing — right — but its fallback was `field.value`, the schema
  // the *form* was built from. The form is only rebuilt on a projection, and every edit in between goes
  // through the merge, which writes the block and deliberately does not re-project. So the fallback was
  // frozen at load time: editing a mode's Curve and then switching to OKLCH, which hides Curve, put the
  // load-time `original` back over it. The same shape undoes any edit to any conditional cell.
  const block = [
    'model: "hsl", // @options: hsl:HSL|oklch:OKLCH @radio',
    'modes: [',
    '  { name: "Ash", curve: "original", hue: 10 }',
    '], // @rows: name:text=Mode|curve:(original:Original|linear:Linear){model=hsl}=Curve' +
      '|hue:number=Hue @blocks @label: Modes'
  ].join('\n');

  const host = document.createElement('div');
  const schema = parser.parse(block);
  renderer.buildForm(schema, host);
  const api = renderer.attachListeners(host, schema, function () {});

  // The edit the merge would already have written to the block, without re-projecting the form.
  const cell = host.querySelector('[data-row-field="curve"]');
  cell.value = 'linear';
  const current = parser.parse(block.replace('"original"', '"linear"'));

  // Now the condition hides it, exactly as switching model does.
  host.querySelector('input[data-field="model"][value="oklch"]').checked = true;
  api.applyVisibility();
  const hidden = cell.closest('.config-ui-rows-cell');
  assert.equal(hidden.style.display, 'none', 'the fixture did not actually hide the cell');

  assert.equal(api.getValues().modes[0].curve, 'original',
    'the stale fallback is gone — this test no longer reproduces the bug it exists for');
  assert.equal(api.getValues(current).modes[0].curve, 'linear',
    'a hidden cell still falls back to the value the form was built with, overwriting the block');

  // And it is only the unread cells that come from the base: what is on screen still wins.
  host.querySelector('[data-row-field="hue"]').value = '42';
  assert.equal(api.getValues(current).modes[0].hue, 42);
});

test('chips take over removal, and a named block starts collapsed', () => {
  // Item 3 and 4 together: where a chips row owns the mode list, a block carries neither an Add nor a \u00d7 —
  // two controls for one action is the shape that has already bitten twice. And collapse starts *derived*:
  // a mode that already has a name came from the collection, so it opens closed; the one you are filling in
  // has no name yet and stays open. No flag, and nothing about it reaches the config block.
  const block = [
    '// @collectionModes: Collection modes',
    'modes: [',
    '  { name: "Ash", hue: 1 },',
    '  { name: "", hue: 2 }',
    '], // @rows: name:text=Mode|hue:number=Hue @blocks @label: Modes'
  ].join('\n');

  const host = document.createElement('div');
  const schema = parser.parse(block);
  renderer.buildForm(schema, host);

  assert.ok(host.querySelector('[data-chips-field="modes"]'), 'the chips row did not render');
  assert.equal(host.querySelectorAll('.config-ui-rows-add').length, 0, 'Add survived the chips');
  assert.equal(host.querySelectorAll('.config-ui-rows-remove').length, 0, 'a block kept its own remove');

  const items = [...host.querySelectorAll('.config-ui-rows-item')];
  assert.equal(items.length, 2);
  assert.equal(items[0].classList.contains('is-collapsed'), true, 'a named mode did not start collapsed');
  assert.equal(items[1].classList.contains('is-collapsed'), false, 'an unnamed block started collapsed');
  assert.equal(items[0].querySelector('.config-ui-rows-collapse').getAttribute('aria-expanded'), 'false');

  // The state is the class and nothing else — serialize must not gain a key for it.
  assert.equal(/collaps/i.test(parser.serialize(schema, null)), false,
    'collapse leaked into the config block');
});
