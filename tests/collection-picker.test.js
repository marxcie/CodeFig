/**
 * The collection picker, from the click to the string a run receives.
 *
 * One field with two ways to fill it — choose a collection in this file, or choose "New collection"
 * and type a name — and both write the same string, because `getOrCreateCollection` creates a name
 * it cannot find. That makes the *reveal* the whole of the second way: with the input hidden there
 * is nowhere to type, so "New collection" is a menu entry that does nothing, and the control looks
 * broken rather than absent.
 *
 * Nothing on the form's own change path can see it. `readCollectionControl` reports the text input,
 * not the chosen option, so `onChange` receives `""` whether somebody picked "New collection" or
 * cleared the field — which is exactly why this shipped unnoticed and why it is tested here.
 *
 * The renderer is **executed**, through `tests/dom-shim.js`, rather than read as source.
 */
const { test } = require('node:test');
const assert = require('node:assert');

const shim = require('../tests/dom-shim.js');
const { document } = shim.install();
const P = require('../src/config-ui/parser.js');
const R = require('../src/config-ui/renderer.js');

/** The value of the "New collection" option. Never a collection name — that is the point of it. */
const NEW = String.fromCharCode(0) + 'codefig-new';

const BLOCK = 'var targetCollection = ""; // @collection @label: Collection';
const IN_FILE = ['Brand', 'Responsive System'];

/**
 * The form as the plugin builds it, then the option list as the backend answer delivers it.
 *
 * `known` is the second argument to `populateCollectionControl`'s note: before the backend answers,
 * a value that is not in the list is not evidence that it does not exist.
 */
function renderPicker(value, names) {
  const schema = P.parse(
    value == null ? BLOCK : 'var targetCollection = ' + JSON.stringify(value) + '; // @collection'
  );
  const container = document.createElement('div');
  R.buildForm(schema, container);
  let last = null;
  R.attachListeners(container, schema, (v) => {
    last = v;
  });

  const wrap = container.querySelector('[data-collection-field="targetCollection"]');
  if (names) R.populateCollectionControl(wrap, names, value || '', true);

  return {
    wrap,
    select: wrap.querySelector('.config-ui-collection-select'),
    input: wrap.querySelector('.config-ui-collection-new'),
    note: wrap.querySelector('.config-ui-collection-note'),
    options: () => wrap.querySelector('.config-ui-collection-select').children.map((o) => o.value),
    values: () => last,
  };
}

/** Pick an option the way a person does: set it, fire change, let the listeners run. */
function choose(picker, value) {
  picker.select.value = value;
  picker.select.dispatch('change', { bubbles: true });
}

test('choosing "New collection" reveals the name input', () => {
  const picker = renderPicker('', IN_FILE);
  assert.equal(picker.input.style.display, 'none', 'nothing to type into before it is asked for');

  choose(picker, NEW);
  assert.equal(picker.input.style.display, 'block', 'picking "New collection" gave nowhere to type');
});

test('choosing a collection that exists puts the input away again', () => {
  const picker = renderPicker('', IN_FILE);
  choose(picker, NEW);
  picker.input.value = 'Half typed';

  choose(picker, 'Brand');
  assert.equal(picker.input.style.display, 'none');
  assert.equal(
    R.readCollectionControl(picker.wrap),
    'Brand',
    'an abandoned half-typed name must not survive as the answer'
  );
});

test('the typed name is what the picker holds', () => {
  const picker = renderPicker('', IN_FILE);
  choose(picker, NEW);
  picker.input.value = 'Colour primitives';

  assert.equal(R.readCollectionControl(picker.wrap), 'Colour primitives');
});

test('a list arriving late does not undo the choice', () => {
  // The backend answer is a round trip, and the control is usable before it lands. Re-populating
  // with a value of `""` — which is what an empty name input reads as — used to reset the select to
  // its initial value and hide the input under whoever was about to type in it.
  const picker = renderPicker('', null);
  choose(picker, NEW);

  R.populateCollectionControl(picker.wrap, IN_FILE, '', true);

  assert.equal(picker.select.value, NEW, 'the select went back on its own');
  assert.equal(picker.input.style.display, 'block');
});

test('a name this file does not have is the create case, and says so', () => {
  // The pasted-config case: nobody chose "New collection", the config simply names something that is
  // not here. The note is the only warning before Run that a collection is about to be made.
  const picker = renderPicker('Colour primitives', IN_FILE);

  assert.equal(picker.select.value, NEW);
  assert.equal(picker.input.style.display, 'block');
  assert.equal(picker.input.value, 'Colour primitives');
  assert.equal(picker.note.style.display, 'block');
  assert.match(picker.note.textContent, /doesn't exist in this file/);
});

test('the note does not repeat what the input already says', () => {
  const picker = renderPicker('', IN_FILE);
  choose(picker, NEW);

  assert.equal(picker.note.style.display, 'none');
  assert.equal(picker.note.textContent, '');
});

test('"New collection" is separated from the collections and is not one of them', () => {
  const picker = renderPicker('', IN_FILE);
  const options = picker.options();

  assert.deepEqual(options.slice(1, 3), IN_FILE);
  assert.equal(options[options.length - 1], NEW, 'the create entry is last');
  assert.equal(IN_FILE.indexOf(NEW), -1, 'and the sentinel can never collide with a real name');
});

test('a script ships no collection name, so the picker opens on the prompt', () => {
  // **The complaint this fixes.** A shipped default of `"Responsive System"` is a *suggestion*, and the
  // picker cannot tell one from a pasted config — so opening Typography in a file without that
  // collection landed on "New collection" with the name already typed in, and the first thing the panel
  // said was that it was about to create something. An empty default is the plain dropdown: pick a
  // collection in this file, or ask for a new one.
  const fs = require('fs');
  const path = require('path');
  const DSF = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');

  const shipped = [];
  for (const file of fs.readdirSync(DSF).filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(DSF, file), 'utf8');
    for (const line of source.split('\n')) {
      if (!/^\s*\w+:.*@collection\b/.test(line)) continue;
      shipped.push(file);
      assert.match(line, /:\s*""\s*,/, file + ' ships a collection name: ' + line.trim());
    }
  }
  assert.ok(shipped.length >= 5, 'the pickers were not found: ' + shipped.join(', '));

  const picker = renderPicker('', IN_FILE);
  assert.equal(picker.select.value, '', 'the prompt, not a choice');
  assert.equal(picker.input.style.display, 'none', 'and nothing to type into yet');
  assert.equal(picker.note.style.display, 'none');
});
