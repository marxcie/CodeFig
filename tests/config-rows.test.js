/**
 * `@rows`: one repeatable-group control, in two renderings.
 *
 * Critique §5.3 specced a second control type — a tab bar derived from the viewport list, with each
 * `@perViewport` field holding one value per viewport. Two things killed that shape: parameters now
 * live inside set objects, and a mode is not always a viewport. What is left is a list of objects
 * that needs editing, and a *display choice* about whether to stack them or give each a tab.
 *
 * A display choice cannot drift from the data it renders. A parallel control type would have its own
 * serialization and would drift the first time either side changed — which is the failure this
 * codebase has hit five times, so it is worth not building a sixth instance of it.
 *
 * These tests cover the parse and serialize halves, which is where a mistake is silent. The DOM half
 * is verified through the bridge (`npm run figma:ui -- readConfig` after editing) rather than a
 * simulated document.
 */
const test = require('node:test');
const assert = require('node:assert');

const P = require('../src/config-ui/parser.js');

const ANNOTATION = '@rows: name:text|appliesTo:text|min:number|model:(metric|modular|endpoints)';
const LINE = 'var sets = [{ "name": "all", "appliesTo": "*", "min": 1, "model": "metric" }]; // ' + ANNOTATION;

const fieldOf = (source) => P.parse(source).rows.filter((r) => r.type === 'field')[0];

test('a column spec becomes typed columns', () => {
  const f = fieldOf(LINE);
  assert.equal(f.inputType, 'rows');
  assert.deepEqual(f.columns.map((c) => c.key), ['name', 'appliesTo', 'min', 'model']);
  assert.deepEqual(f.columns.map((c) => c.type), ['text', 'text', 'number', 'select']);
  assert.deepEqual(f.columns[3].options, ['metric', 'modular', 'endpoints'], 'a fixed set per column');
  assert.equal(f.columns[0].label, 'Name', 'labelled like any other field');
});

test('options are parenthesised because the column separator is a pipe', () => {
  // `model:metric|modular` would be two columns, one of them called `modular`. The parens are what
  // let one mechanism serve both.
  const f = fieldOf('var s = [{}]; // @rows: a:text|m:(x|y|z)|b:number');
  assert.deepEqual(f.columns.map((c) => c.key), ['a', 'm', 'b']);
  assert.deepEqual(f.columns[1].options, ['x', 'y', 'z']);
});

test('@tabs is a flag on the same control, not a different one', () => {
  const stacked = fieldOf(LINE);
  const tabbed = fieldOf(LINE + ' @tabs');
  assert.equal(stacked.tabs, false);
  assert.equal(tabbed.tabs, true);
  assert.equal(tabbed.inputType, 'rows', 'same control');
  assert.deepEqual(tabbed.columns, stacked.columns, 'same columns');
  assert.deepEqual(tabbed.value, stacked.value, 'same values');
});

test('the value is the array, not a flattened string', () => {
  // The failure that used to happen to any array the form did not claim: it became a text input
  // holding "a,b" and the next interaction wrote that back over the real value.
  const f = fieldOf(LINE);
  assert.ok(Array.isArray(f.value));
  assert.equal(f.value[0].min, 1);
  assert.notEqual(f.inputType, 'unsupported', '@rows claims the array before the fallback does');
});

test('an array with no @rows is still unsupported, and still safe', () => {
  const f = fieldOf('var sets = [{ "name": "all" }];');
  assert.equal(f.inputType, 'unsupported');
});

test('@rows on something that is not an array is ignored', () => {
  // The annotation describes columns of a list. On a string it means nothing, and inventing a
  // one-row list would be the form deciding what the config says.
  const f = fieldOf('var sets = "all"; // ' + ANNOTATION);
  assert.notEqual(f.inputType, 'rows');
  assert.equal(f.inputType, 'string', 'it stays whatever the value actually is');
});

test('an untouched @rows line round-trips byte-identical', () => {
  for (const source of [LINE, LINE + ' @tabs']) {
    assert.equal(P.serialize(P.parse(source), {}), source);
  }
});

test('the annotation survives the form changing the value', () => {
  // The whole control depends on this: serialize re-emits `@rows` and `@tabs`, or the second
  // interaction renders the field as an unsupported array.
  const out = P.serialize(P.parse(LINE + ' @tabs'), {
    sets: [
      { name: 'all', appliesTo: '*', min: 1, model: 'metric' },
      { name: 'tight', appliesTo: 'Mobile', min: 1, model: 'modular' }
    ]
  });
  assert.match(out, /@rows: name:text\|appliesTo:text\|min:number\|model:\(metric\|modular\|endpoints\)/);
  assert.match(out, /@tabs/);

  const again = fieldOf(out);
  assert.equal(again.inputType, 'rows', 'and it parses as rows the second time');
  assert.equal(again.tabs, true);
  assert.equal(again.value.length, 2);
  assert.equal(again.value[1].name, 'tight');
});

test('@rows sits beside @fromFile and @options without either being lost', () => {
  const source = 'var sets = [{ "name": "all" }]; // ' + ANNOTATION + ' @tabs @fromFile: domains.spacing.sets';
  const f = fieldOf(source);
  assert.equal(f.inputType, 'rows');
  assert.equal(f.fromFile, 'domains.spacing.sets');
  assert.equal(P.serialize(P.parse(source), {}), source, 'untouched, so verbatim');

  const changed = P.serialize(P.parse(source), { sets: [{ name: 'x' }] });
  assert.match(changed, /@fromFile: domains\.spacing\.sets/, 'the sync path survives an edit');
  assert.match(changed, /@rows:/);
});

test('a rows field is no longer carried as an unknown annotation', () => {
  // Before the control existed, `@rows` survived only by being unrecognised. Now it is understood,
  // and being in both places would emit it twice.
  const f = fieldOf(LINE + ' @tabs');
  assert.equal((f.unknownAnnotations || []).join(' ').indexOf('@rows'), -1);
  assert.equal((f.unknownAnnotations || []).join(' ').indexOf('@tabs'), -1);
  assert.equal(P.serialize(P.parse(LINE + ' @tabs'), { sets: [{ name: 'x' }] }).match(/@rows:/g).length, 1);
});

// ---------------------------------------------------------------------------
// What the renderer is handed
// ---------------------------------------------------------------------------

test('the renderer is handed the whole field, not a list of ten property names', () => {
  // `@rows` shipped with `columns` and `tabs` dropped here, so rows rendered with no cells and
  // `@tabs` produced no tabs — invisible to every parser test, because the parser was right.
  // Found by putting every row type in one form and reading it back through the bridge.
  const fs2 = require('fs');
  const path2 = require('path');
  const renderer = fs2.readFileSync(
    path2.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );
  const buildRow = renderer.slice(renderer.indexOf('if (r.type === "field")'));
  assert.match(buildRow, /for \(var key in r\) \{/, 'the field is copied');
  assert.equal(/var f = \{\s*\n\s*name: r\.name,/.test(renderer), false,
    'the hand-written whitelist is back — it will drop the next property the parser learns');
});

test('a static @multi list is a multiselect, not a text input', () => {
  // Pre-existing, found by the same sweep: the multiselect branch required a dynamic
  // `optionSource`, so `@options: a|b|c @multi` fell through and rendered the array as "a,b".
  const fs2 = require('fs');
  const path2 = require('path');
  const renderer = fs2.readFileSync(
    path2.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );
  assert.match(
    renderer,
    /t === "multiselect" && field\.options && field\.options\.length && !field\.optionSource/,
    'a static option list has no branch, so it falls through to the text input'
  );

  // And the parser calls it a multiselect, which is what makes the branch reachable.
  const f = P.parse('var picked = ["gap"]; // @options: gap|margin|padding @multi')
    .rows.filter((r) => r.type === 'field')[0];
  assert.equal(f.inputType, 'multiselect');
  assert.deepEqual(f.options, ['gap', 'margin', 'padding']);
});
