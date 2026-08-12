/**
 * The mode picker: the collection picker one level down, and dependent on it.
 *
 * Two behaviours have no equivalent in any other control, and neither is visible to the form's own
 * change path — which is what makes them worth pinning here:
 *
 *   1. **Its list belongs to another field.** The modes shown are the modes of whatever the
 *      collection picker holds, so choosing a different collection has to re-address it. Nothing in
 *      `getValues` can notice that; it reports a string either way.
 *   2. **It hides when there is nothing to decide.** A collection with one mode has one answer, so
 *      the row goes away — but only while nothing disagrees with it. A config naming a mode this
 *      collection does not have keeps the row on screen, because hiding it would create that mode at
 *      Run with nobody having seen the name.
 *
 * The renderer is **executed**, through `tests/dom-shim.js`, rather than read as source.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const shim = require('../tests/dom-shim.js');
const { document } = shim.install();
const P = require('../src/config-ui/parser.js');
const R = require('../src/config-ui/renderer.js');

/** The value of the "New mode" option. Never a mode name — that is the point of it. */
const NEW = String.fromCharCode(0) + 'codefig-new-mode';

const BLOCK = [
  'var targetCollection = "Brand"; // @collection @label: Collection',
  'var targetMode = ""; // @mode: targetCollection @label: Mode',
].join('\n');

/**
 * The form as the plugin builds it, then one collection's modes as the backend answer delivers them.
 *
 * `state` is that answer's shape: which collection it is about, and whether that collection exists —
 * the difference between "no modes" and "no collection", which is what the control says when a new
 * collection is about to be created.
 */
function renderPicker(block, modes, state) {
  const schema = P.parse(block == null ? BLOCK : block);
  const container = document.createElement('div');
  R.buildForm(schema, container);
  let last = null;
  R.attachListeners(container, schema, (v) => {
    last = v;
  });

  const wrap = container.querySelector('[data-mode-field="targetMode"]');
  if (modes) {
    const value = R.currentModeValue(wrap);
    R.populateModeControl(wrap, modes, value, state || { collection: 'Brand', exists: true });
  }

  return {
    container,
    wrap,
    row: wrap.closest('.config-ui-row'),
    select: wrap.querySelector('.config-ui-mode-select'),
    input: wrap.querySelector('.config-ui-mode-new'),
    note: wrap.querySelector('.config-ui-mode-note'),
    options: () => wrap.querySelector('.config-ui-mode-select').children.map((o) => o.value),
    values: () => last,
  };
}

/** Pick an option the way a person does: set it, fire change, let the listeners run. */
function choose(picker, value) {
  picker.select.value = value;
  picker.select.dispatch('change', { bubbles: true });
}

test('a mode picker follows the collection field it names', () => {
  const picker = renderPicker(BLOCK, null);
  assert.equal(
    picker.wrap.getAttribute('data-mode-collection'),
    'Brand',
    'the picker never resolved which collection it is asking about'
  );
});

test('written bare, it follows the block’s only collection picker', () => {
  const picker = renderPicker(
    [
      'var targetCollection = "Brand"; // @collection',
      'var targetMode = ""; // @mode',
    ].join('\n'),
    null
  );
  assert.equal(picker.wrap.getAttribute('data-mode-collection'), 'Brand');
});

test('and stays unbound when there is more than one and it names neither', () => {
  // A guess between two targets is worse than the placeholder: one of them is somebody's variables.
  const picker = renderPicker(
    [
      'var sourceCollection = "Brand"; // @collection',
      'var targetCollection = "Web"; // @collection',
      'var targetMode = ""; // @mode',
    ].join('\n'),
    null
  );
  assert.equal(picker.wrap.getAttribute('data-mode-collection'), '');
  assert.equal(picker.select.disabled, true);
  assert.equal(picker.select.children[0].textContent, 'Pick a collection first');
});

test('choosing "New mode" reveals the name input, and the typed name is what it holds', () => {
  const picker = renderPicker(BLOCK, ['Light', 'Dark']);
  assert.equal(picker.input.style.display, 'none', 'nothing to type into before it is asked for');

  choose(picker, NEW);
  assert.equal(picker.input.style.display, 'block', 'picking "New mode" gave nowhere to type');

  picker.input.value = 'High contrast';
  assert.equal(R.readModeControl(picker.wrap), 'High contrast');
});

test('"New mode" is separated from the modes and is not one of them', () => {
  const picker = renderPicker(BLOCK, ['Light', 'Dark']);
  const options = picker.options();

  assert.deepEqual(options.slice(1, 3), ['Light', 'Dark']);
  assert.equal(options[options.length - 1], NEW, 'the create entry is last');
});

test('the modes are listed in the collection’s own order', () => {
  // Mode order is column order in Figma's variables panel, and it is not alphabetical. Sorting here
  // would show a list that does not match the file it came from.
  const picker = renderPicker(BLOCK, ['Desktop', 'Tablet', 'Mobile']);
  assert.deepEqual(picker.options().slice(1, 4), ['Desktop', 'Tablet', 'Mobile']);
});

test('a collection with one mode still offers it, and a way to add another', () => {
  // An earlier build hid the row here, on the grounds that one mode is not a choice. It is still the
  // only way to *name* that mode or reach "New mode", and a control that comes and goes reads as the
  // panel breaking.
  const picker = renderPicker(BLOCK, ['Mode 1']);

  assert.notEqual(picker.row.style.display, 'none');
  // The separator carries its dashes as text and no value, so this is placeholder, the one mode, the
  // rule, and New mode.
  assert.deepEqual(picker.options(), ['', 'Mode 1', '', NEW]);
  assert.equal(picker.select.children[0].textContent, 'Select mode or create a new one');
});

test('a value naming a mode the collection does not have says so', () => {
  const picker = renderPicker(
    [
      'var targetCollection = "Brand"; // @collection',
      'var targetMode = "Dark"; // @mode: targetCollection',
    ].join('\n'),
    ['Light']
  );

  assert.equal(picker.select.value, NEW);
  assert.equal(picker.input.value, 'Dark');
  assert.match(picker.note.textContent, /isn't a mode of Brand/);
});

test('a collection that does not exist yet offers only New mode, and says when it is created', () => {
  const picker = renderPicker(
    [
      'var targetCollection = "Colour primitives"; // @collection',
      'var targetMode = "Light"; // @mode: targetCollection',
    ].join('\n'),
    [],
    { collection: 'Colour primitives', exists: false }
  );

  assert.deepEqual(picker.options(), ['', NEW], 'there are no modes to list, only one to make');
  assert.equal(picker.input.style.display, 'block');
  assert.equal(picker.input.value, 'Light');
  assert.match(picker.note.textContent, /Created with the collection at Run/);
});

test('choosing "New mode" on a collection that is itself new says so straight away', () => {
  // Found from the terminal, not here: the line only appeared when an *answer* redrew the control, so
  // a config that arrived naming a mode got it and somebody choosing "New mode" and typing never did
  // — which is the case it was written for. Nothing repopulates on a click.
  const picker = renderPicker(BLOCK, [], { collection: 'Brand', exists: false });
  assert.equal(picker.note.style.display, 'none', 'nothing is being created yet');

  choose(picker, NEW);
  assert.match(picker.note.textContent, /Created with the collection at Run/);
});

test('and choosing "New mode" on a collection that exists does not repeat the input', () => {
  const picker = renderPicker(BLOCK, ['Light', 'Dark']);
  choose(picker, NEW);

  assert.equal(picker.note.style.display, 'none');
  assert.equal(picker.note.textContent, '');
});

test('picking a real mode clears a note about one that was not', () => {
  const picker = renderPicker(
    [
      'var targetCollection = "Brand"; // @collection',
      'var targetMode = "Dark"; // @mode: targetCollection',
    ].join('\n'),
    ['Light']
  );
  assert.match(picker.note.textContent, /isn't a mode of Brand/);

  choose(picker, 'Light');
  assert.equal(picker.note.textContent, '', 'the warning outlived the value it was about');
});

test('an answer arriving late does not undo the choice', () => {
  // The list is a round trip, and the control is usable before it lands. Repopulating with the empty
  // name input's value must not reset the select under whoever is about to type in it.
  const picker = renderPicker(BLOCK, ['Light', 'Dark']);
  choose(picker, NEW);

  R.populateModeControl(picker.wrap, ['Light', 'Dark'], R.currentModeValue(picker.wrap), {
    collection: 'Brand',
    exists: true,
  });

  assert.equal(picker.select.value, NEW, 'the select went back on its own');
  assert.equal(picker.input.style.display, 'block');
});

test('changing collection resets the mode, rather than carrying it into the next one', () => {
  // The bug this exists for: pick Mobile in a three-mode collection, switch to a one-mode collection,
  // and Mobile came along as a *new mode about to be created there*. Switching collection quietly
  // queued up a mode nobody asked for — and the name on screen was the previous collection's.
  const picker = renderPicker(BLOCK, ['Desktop', 'Pad', 'Mobile']);
  choose(picker, 'Mobile');
  assert.equal(R.readModeControl(picker.wrap), 'Mobile');

  const collection = picker.container.querySelector('.config-ui-collection-select');
  collection.value = 'test';
  collection.dispatch('change', { bubbles: true });

  assert.equal(picker.select.value, '', 'the mode survived a change of collection');
  assert.equal(picker.input.value, '');
  assert.equal(picker.input.style.display, 'none');
  assert.equal(picker.note.textContent, '');
  assert.equal(R.readModeControl(picker.wrap), '');
  assert.equal(picker.values().targetMode, '', 'and the config kept it');
});

test('a half-typed new mode does not survive a change of collection either', () => {
  const picker = renderPicker(BLOCK, ['Desktop', 'Pad']);
  choose(picker, NEW);
  picker.input.value = 'High contrast';

  const collection = picker.container.querySelector('.config-ui-collection-select');
  collection.value = 'test';
  collection.dispatch('change', { bubbles: true });

  assert.equal(picker.select.value, '');
  assert.equal(picker.input.value, '');
});

test('the config’s own mode is not thrown away on the first look at a collection', () => {
  // The reset is for a *change*. On the first pass the value came from the config, which is the
  // answer — not something carried over from a collection somebody just left.
  const picker = renderPicker(
    [
      'var targetCollection = "Brand"; // @collection',
      'var targetMode = "Dark"; // @mode: targetCollection',
    ].join('\n'),
    null
  );
  assert.equal(R.currentModeValue(picker.wrap), 'Dark');
});

test('a differently-cased config value selects the mode that exists', () => {
  // Figma refuses two modes differing only in case, so treating these as different would ask for a
  // mode it will not create.
  const picker = renderPicker(
    [
      'var targetCollection = "Brand"; // @collection',
      'var targetMode = "light"; // @mode: targetCollection',
    ].join('\n'),
    ['Light', 'Dark']
  );

  assert.equal(picker.select.value, 'Light');
  assert.equal(picker.input.style.display, 'none');
});

test('the picker’s value reaches the form’s values, under the field’s own name', () => {
  const picker = renderPicker(BLOCK, ['Light', 'Dark']);
  choose(picker, 'Dark');

  assert.equal(picker.values().targetMode, 'Dark');
  assert.equal(picker.values().targetCollection, 'Brand', 'and the collection it follows is intact');
});

test('@mode round-trips as it was written', () => {
  // A bare `@mode` that came back as `@mode: targetCollection` would rewrite somebody's block on the
  // first keystroke in an unrelated field — the whole block is re-serialised on every change.
  const bare = 'var targetMode = ""; // @mode @label: Mode';
  const named = 'var targetMode = ""; // @mode: targetCollection @label: Mode';
  [bare, named].forEach((line) => {
    const schema = P.parse(line);
    const out = P.serialize(schema, { targetMode: 'Dark' });
    assert.match(out, /@mode\b/);
    assert.equal(/@mode: targetCollection/.test(out), line === named,
      'the annotation changed shape: ' + out);
  });
});
