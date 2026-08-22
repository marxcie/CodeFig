/**
 * **The form's listeners live on the container, which outlives the form.**
 *
 * `buildForm` replaces the container's *children*, and a child's listeners go with it. The two delegated
 * listeners — `change` and `input` — are on the container itself, and nothing removed them. So every
 * re-render added another pair to the same element and a single keystroke ran the whole change pipeline
 * once per render that had ever happened: visibility, every curve control, the mode pickers, and a full
 * read-serialise-write of the config editor's document.
 *
 * It does not look like a leak. It looks like the panel getting slower the longer you work in it — Márton,
 * on Colours: *"the more I edit the colors the more the editor becomes sluggish… deleting a number takes a
 * second"*. Colours rebuilds the form more than anything else does (mode chips, auto-import fills, a
 * collection change, a model switch), so it degraded fastest.
 *
 * A source-text check that `removeEventListener` appears somewhere would pass while the wiring was wrong.
 * These two count **calls**, which is the thing that was growing.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const shim = require('./dom-shim.js');
const { loadBezierGlobal } = require('../build-bezier.js');
shim.install({ CodeFigBezier: loadBezierGlobal() });

const parser = require('../src/config-ui/parser.js');
const renderer = require('../src/config-ui/renderer.js');

// `controller.js` is a UMD that binds to `root.ConfigUIParser` / `root.ConfigUIRenderer`, and in CommonJS
// its `root` is the module's own exports — which is why requiring it directly hands back an empty object.
// Publishing the two globals first is what the browser does, so it is what this does.
global.self = global;
global.ConfigUIParser = parser;
global.ConfigUIRenderer = renderer;
delete require.cache[require.resolve('../src/config-ui/controller.js')];
require('../src/config-ui/controller.js');
const controller = global.ConfigUIFormController;

// The block is the *inside* of the config object — the markers wrap the properties, not a declaration.
const BLOCK = [
  '// @CONFIG_START',
  '  name: "", // @label: Name',
  '  amount: 1, // @label: Amount',
  '// @CONFIG_END',
].join('\n');

/** A container that survives re-renders, the way `#configUIContainer` survives the life of the panel. */
function mount(onChange) {
  return document.createElement('div');
}

function typeInto(container) {
  const input = container.querySelector('input');
  assert.ok(input, 'the fixture rendered no input to type into');
  input.value = 'x';
  // The shim fills `target` in on dispatch, the way a browser does.
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

test('one keystroke is one onChange, however many times the form has been rebuilt', () => {
  const container = mount();
  let calls = 0;
  let form = null;

  for (let renders = 1; renders <= 6; renders++) {
    if (form) form.destroy();
    form = controller.createForm(container, parser.parse(BLOCK), {
      container: container,
      onChange: function () { calls++; },
    });

    calls = 0;
    typeInto(container);
    assert.equal(calls, 1,
      'after ' + renders + ' render(s) a single keystroke reached onChange ' + calls + ' times — the ' +
      'container listeners are accumulating, so every edit costs as much as every render before it');
  }
});

test('re-rendering in place does not stack a second set of listeners', () => {
  // **The path `destroy` does not cover.** `updateFromCode` re-renders the same form on the same container
  // without anyone calling `destroy` — an auto-import fill and a chip edit both land here. It calls the
  // controller's own `render`, which called `attachListeners` again on a container that already had them.
  // This is the shape the panel actually degrades through, so it is the one worth pinning.
  const container = mount();
  let calls = 0;
  const form = controller.createForm(container, parser.parse(BLOCK), {
    container: container,
    onChange: function () { calls++; },
  });

  for (let round = 1; round <= 6; round++) {
    form.updateFromCode(BLOCK);
    calls = 0;
    typeInto(container);
    assert.equal(calls, 1,
      'after ' + round + ' in-place re-render(s) one keystroke reached onChange ' + calls + ' times');
  }
});

test('destroy takes the listeners off, so a dead form cannot answer', () => {
  const container = mount();
  let calls = 0;
  const form = controller.createForm(container, parser.parse(BLOCK), {
    container: container,
    onChange: function () { calls++; },
  });

  // The input has to survive `destroy` emptying the container for this to be a real test, so it is held
  // and re-attached — the question is whether the *container's* listeners still fire, not whether the
  // child is still there.
  const input = container.querySelector('input');
  form.destroy();
  container.appendChild(input);

  calls = 0;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(calls, 0, 'a destroyed form still answered a change');
});

test('a change is committed, an input is not', () => {
  // **What the Group field turns on.** Typing fires `input` per keystroke; leaving the field or pressing
  // Enter fires `change`. Auto-import reads the collection and group *from the file*, so running it per
  // keystroke looks up `m`, then `mo`, then `mos` — misses that rewrite the panel under the cursor before
  // the word is finished. Only `committed` may drive it.
  const container = mount();
  const seen = [];
  controller.createForm(container, parser.parse(BLOCK), {
    container: container,
    onChange: function (values, opts) { seen.push(opts && opts.committed); },
  });

  const input = container.querySelector('input');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  assert.deepEqual(seen, [false, true],
    'typing and settling are indistinguishable — auto-import cannot tell a half-typed group from a named one');
});

test('onChange receives the live flag, not just the values', () => {
  // The controller wrapped the host's callback as `function (v) { onCh(v) }`, which silently dropped the
  // second argument. That argument is what says a change is mid-drag — drawn, but not yet written through
  // to the config editor — so dropping it made every frame of a drag a committed edit and undid the whole
  // point of deferring. Nothing failed; it was just slow again.
  const container = mount();
  const seen = [];
  controller.createForm(container, parser.parse(BLOCK), {
    container: container,
    onChange: function (values, opts) { seen.push(opts); },
  });

  const input = container.querySelector('input');
  const live = new Event('input', { bubbles: true });
  live.codefigLive = true;
  input.dispatchEvent(live);

  input.dispatchEvent(new Event('input', { bubbles: true }));

  assert.deepEqual(seen.map(function (o) { return o && o.live; }), [true, false],
    'the second argument did not survive the controller — a live change is indistinguishable from a ' +
    'settled one, so the drag deferral does nothing');
});

// ============================================================
// Estimated original
// ============================================================

const CURVE_BLOCK = [
  '// @CONFIG_START',
  '  curve: [0.333333, 0.333333, 0.666667, 0.666667], // @curve @allowOriginal @label: Curve',
  '  modes: [',
  '    { name: "A", curve: [] },',
  '  ], // @rows: name:text=Mode|curve:curve(original)=Curve @blocks @label: Modes',
  '// @CONFIG_END',
].join('\n');

/** The options a curve control offers, in order. */
function presetOptions(container, nth) {
  const sels = [...container.querySelectorAll('select')]
    .filter((s) => (s.className || '').indexOf('curve__preset') !== -1);
  const sel = sels[nth || 0];
  assert.ok(sel, 'no curve preset dropdown was rendered');
  return { sel: sel, values: [...sel.children].map((o) => o.value) };
}

test('Estimated original is offered only when there is an estimate', () => {
  const bare = mount();
  controller.createForm(bare, parser.parse(CURVE_BLOCK), { container: bare, onChange: function () {} });
  assert.equal(presetOptions(bare).values.indexOf('estimated'), -1,
    'a collection with no ramp was offered an estimate of nothing');

  const withFit = mount();
  const fit = [0.2, 0.05, 0.4, 0.3, 0.5, 0.5, 0.6, 0.7, 0.9, 0.95];
  controller.createForm(withFit, parser.parse(CURVE_BLOCK), {
    container: withFit, onChange: function () {},
    curveBaselines: { curve: fit },
  });
  assert.ok(presetOptions(withFit).values.indexOf('estimated') !== -1,
    'the fitted curve was not offered');
});

test('the caption reads Estimated original while the curve is the fit, and Custom once it is not', () => {
  // **Looked up, not remembered.** The label comes from comparing coordinates, so an edit falls through to
  // Custom on its own and choosing the option again puts the fit back — no flag to set, none to clear.
  const container = mount();
  const fit = [0.2, 0.05, 0.4, 0.3, 0.5, 0.5, 0.6, 0.7, 0.9, 0.95];
  controller.createForm(container, parser.parse(CURVE_BLOCK), {
    container: container, onChange: function () {},
    curveBaselines: { curve: fit },
  });
  const { sel } = presetOptions(container);
  const wrap = container.querySelector('[data-curve-field]');

  sel.value = 'estimated';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  assert.deepEqual(JSON.parse(wrap.getAttribute('data-curve-value')), fit,
    'choosing the estimate did not put its coordinates back');
  assert.equal(sel.value, 'estimated', 'the caption did not settle on the estimate');

  // Move one handle: the numbers stop matching and the caption has to give way.
  const nudged = fit.slice();
  nudged[0] = 0.31;
  sel.value = 'linear|none';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  assert.notEqual(sel.value, 'estimated', 'the caption still claimed the estimate after a change');

  // And back again — the values survive, because they are the collection's, not the control's.
  sel.value = 'estimated';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  assert.deepEqual(JSON.parse(wrap.getAttribute('data-curve-value')), fit,
    'the estimate did not survive being navigated away from');
});

test('each mode block gets its own estimate, not the collection\'s', () => {
  // HSL fits one curve per mode and every one of them is called `curve`. The row cell's own key is bare for
  // an unrelated reason — the flat value sweep must not mistake a cell for a top-level field — so a
  // baseline addressed by it would hand every mode the same curve, or the collection's.
  const container = mount();
  const mine = [0.1, 0.02, 0.3, 0.2, 0.5, 0.5, 0.7, 0.8, 0.95, 0.99];
  const collection = [0.9, 0.9, 0.95, 0.95];
  controller.createForm(container, parser.parse(CURVE_BLOCK), {
    container: container, onChange: function () {},
    curveBaselines: { 'curve': collection, 'modes[0].curve': mine },
  });

  const sels = [...container.querySelectorAll('select')]
    .filter((s) => (s.className || '').indexOf('curve__preset') !== -1);
  assert.equal(sels.length, 2, 'expected a collection curve and one mode curve');

  sels[1].value = 'estimated';
  sels[1].dispatchEvent(new Event('change', { bubbles: true }));
  const cell = container.querySelector('[data-row-field]');
  assert.deepEqual(JSON.parse(cell.getAttribute('data-curve-value')), mine,
    "the mode's curve was filled with the collection's estimate");
});
