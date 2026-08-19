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

const fs = require('fs');
const path = require('path');

const P = require('../src/config-ui/parser.js');

const ANNOTATION = '@rows: name:text|appliesTo:text|min:number|model:(metric|modular|endpoints)';
const LINE = 'var sets = [{ "name": "all", "appliesTo": "*", "min": 1, "model": "metric" }]; // ' + ANNOTATION;

const fieldOf = (source) => P.parse(source).rows.filter((r) => r.type === 'field')[0];

test('a column spec becomes typed columns', () => {
  const f = fieldOf(LINE);
  assert.equal(f.inputType, 'rows');
  assert.deepEqual(f.columns.map((c) => c.key), ['name', 'appliesTo', 'min', 'model']);
  assert.deepEqual(f.columns.map((c) => c.type), ['text', 'text', 'number', 'select']);
  // An option is a `{ value, label }` pair since the ratio select had to show *1.618 Golden ratio*
  // beside its number. A bare option is its own label, which is what these three are.
  assert.deepEqual(f.columns[3].options.map((o) => o.value), ['metric', 'modular', 'endpoints'],
    'a fixed set per column');
  assert.deepEqual(f.columns[3].options.map((o) => o.label), ['metric', 'modular', 'endpoints']);
  assert.equal(f.columns[0].label, 'Name', 'labelled like any other field');
});

test('options are parenthesised because the column separator is a pipe', () => {
  // `model:metric|modular` would be two columns, one of them called `modular`. The parens are what
  // let one mechanism serve both.
  const f = fieldOf('var s = [{}]; // @rows: a:text|m:(x|y|z)|b:number');
  assert.deepEqual(f.columns.map((c) => c.key), ['a', 'm', 'b']);
  assert.deepEqual(f.columns[1].options.map((o) => o.value), ['x', 'y', 'z']);
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

test('every control kind reaches onChange, not only the ones with data-field', () => {
  // `@rows` shipped able to render and unable to save. The delegated listeners tested for
  // `data-field`, which the rows cells, its Add/Remove and the collection picker deliberately omit —
  // so the flat collector cannot mistake a cell for a top-level field. The consequence nobody checked
  // was that editing any of them never reached `onChange`, so the config was never written.
  //
  // Found by `setField` reporting it settled on the frame fallback rather than on a change: the
  // settle point exists precisely so a write that goes nowhere is visible.
  const fs2 = require('fs');
  const path2 = require('path');
  const renderer = fs2.readFileSync(
    path2.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );

  const fn = renderer.match(/function isControlEvent\(target\)[\s\S]*?\n    \}/);
  assert.ok(fn, 'isControlEvent not found — the listener is testing something narrower again');
  for (const attr of ['data-field', 'data-row-field', 'data-rows-field']) {
    assert.match(fn[0], new RegExp(attr), 'not treated as a control: ' + attr);
  }
  assert.match(fn[0], /config-ui-multiselect-cb/);
  assert.match(fn[0], /data-collection-field/);

  // And the listeners ask that question rather than re-deriving it. They are **named** functions now, so
  // `detach()` can take them off again — a delegated listener on the container outlives the form inside it,
  // and re-attaching without removing made every keystroke do the work of every render before it.
  assert.match(renderer, /function onChangeEvent\(e\) \{\s*\n\s*if \(isControlEvent\(e\.target\)\)/);
  assert.match(renderer,
    /function onInputEvent\(e\) \{\s*\n\s*if \(isControlEvent\(e\.target\) && e\.target\.type !== "checkbox"\)/);
  assert.match(renderer, /container\.addEventListener\("change", onChangeEvent\)/);
  assert.match(renderer, /container\.addEventListener\("input", onInputEvent\)/);
  assert.match(renderer, /container\.removeEventListener\("change", onChangeEvent\)/,
    'the change listener cannot be detached — it will accumulate on every re-render');
  assert.match(renderer, /container\.removeEventListener\("input", onInputEvent\)/,
    'the input listener cannot be detached — it will accumulate on every re-render');
});

test('the mode input replaces the plus, and never sits beside it', () => {
  // Márton's correction to the design: an input standing next to a still-visible `+` reads as two
  // ways to do the same thing at once. Pressing `+` *becomes* the input; Escape puts it back. There
  // is no state where both are offered.
  const fs2 = require('fs');
  const path2 = require('path');
  const renderer = fs2.readFileSync(
    path2.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );
  const fn = renderer.match(/function openChipInput\(wrap, names, commit\)[\s\S]*?\n  \}/);
  assert.ok(fn, 'openChipInput not found');

  assert.match(fn[0], /add\.style\.display = "none"/, 'the plus is hidden while the input is open');
  assert.match(fn[0], /if \(add\) add\.style\.display = ""/, 'and restored when it closes');
  assert.match(fn[0], /e\.key === "Enter"/);
  assert.match(fn[0], /e\.key === "Escape"/);

  // Escape must not commit, and a double close must not double-commit.
  assert.match(fn[0], /if \(settled\) return;/, 'close is idempotent, so blur after Escape does nothing');
  const escapeBranch = fn[0].slice(fn[0].indexOf('Escape'));
  assert.equal(escapeBranch.indexOf('accept()'), -1, 'Escape must cancel, not accept');
});

test('the mode input is a normal input, not a smaller one', () => {
  // The shorter padding made it a different kind of thing from every other field. The design shows it
  // the same height as the pills beside it, which is what a normal input already is.
  const fs2 = require('fs');
  const path2 = require('path');
  const css = fs2.readFileSync(path2.join(__dirname, '..', 'src', 'ui.css'), 'utf8');
  const rule = css.match(/\.config-ui-chip-input \{[^}]*\}/);
  assert.ok(rule, 'the chip input rule is missing');
  assert.equal(/padding/.test(rule[0]), false,
    'it overrides padding again, which is what made it the wrong height');
});

test('no function references a name from another function’s scope', () => {
  // `if (field.tabs) return;` went into `drawChips`, which has no `field` — the chips and the rows
  // control both build an add button, and the patch landed in the wrong one. The whole form died with
  // "Could not render configuration: field is not defined", which no test caught because nothing here
  // executes the renderer against a DOM.
  //
  // So this checks the property directly: the chips code must not mention `field`, and the rows code
  // must, since that is where the flag lives.
  const fs2 = require('fs');
  const path2 = require('path');
  const src = fs2.readFileSync(path2.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');

  const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));

  const chips = slice('function drawChips(', 'function openChipInput(');
  assert.ok(chips.length > 0, 'drawChips not found');
  assert.equal(/\bfield\b/.test(chips), false,
    'drawChips references `field`, which is not in its scope — the form will not render at all');

  const rowsDraw = slice('function draw(list, active)', 'function buildRowCell(');
  assert.ok(rowsDraw.length > 0, 'the rows draw function not found');
  assert.match(rowsDraw, /field\.tabs/, 'the tabs guard belongs here, where field is in scope');
});

test('under @tabs the name column is the tab, not also a field', () => {
  // The tab label comes from the row's `name`, so rendering a `name` cell as well put a "Mode" text
  // input under the tab strip — a second place to rename, which could disagree with the chips.
  const fs2 = require('fs');
  const path2 = require('path');
  const src = fs2.readFileSync(path2.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');
  // `@blocks` joined the guard: its title carries the name the same way the tab strip does, so a control
  // underneath would be the second place to rename from — and the two could disagree.
  assert.match(src, /if \(\(field\.tabs \|\| field\.blocks\) && column\.key === "name"\) return;/);

  // The column stays in the parsed spec — it is still the data, and serialize still writes it.
  const f = P.parse(
    'var m = [{ "name": "desktop", "gap": 24 }]; // @rows: name:text=Mode|gap:number=Gap @tabs'
  ).rows.filter((r) => r.type === 'field')[0];
  assert.deepEqual(f.columns.map((c) => c.key), ['name', 'gap'], 'the name column is still declared');
  assert.equal(f.value[0].name, 'desktop', 'and still carried');
});

/**
 * A column carries its own helper.
 *
 * The gap `119d1bc` recorded and left open: "a `@rows` column cannot carry a helper, so Spacing's *Extra
 * spacings* note has no way to be produced by the renderer today". The Colors panel is what forced it —
 * *Lock seed* has two lines of copy explaining what the toggle chooses between, and until now the only
 * place that copy could live was the mockup.
 */
test('a column helper parses, renders under its control, and round-trips', () => {
  const block = [
    'modes: [',
    '  { name: "desktop", lock: false }',
    '], // @rows: name:text=Mode|lock:checkbox=Lock seed @helper: On. Keeps its value.\\nOff. Moves to the nearest step. @tabs @label: Modes'
  ].join('\n');

  const schema = P.parse(block);
  const field = schema.rows.filter((r) => r.type === 'field' && r.inputType === 'rows')[0];
  assert.ok(field, 'the rows field did not parse');

  const lock = field.columns.filter((c) => c.key === 'lock')[0];
  assert.equal(lock.label, 'Lock seed', 'the helper swallowed the label');
  assert.equal(lock.type, 'checkbox', 'the helper swallowed the type');
  assert.equal(lock.helper, 'On. Keeps its value.\\nOff. Moves to the nearest step.');
  // The column before it is untouched — a helper runs to the end of its own segment, not the line.
  assert.equal(field.columns.filter((c) => c.key === 'name')[0].helper, undefined);

  // Round trip: the block a user pastes comes back the way they wrote it.
  assert.match(P.serialize(schema), /@helper: On\. Keeps its value\.\\nOff\. Moves to the nearest step\./);
});

test('a column helper hangs off its caption, not off the cell', () => {
  // A cell is the narrowest thing in the panel, and a note drawn *under* one used to set the width of
  // the whole column — the reason a column helper needed a rule about which grid column it landed in
  // at all. On the caption's \u24d8 it takes no width, so the question stops existing.
  //
  // Checked at the source rather than through a shimmed document: one assertion is not worth a second
  // rendering path that could disagree with the first.
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');
  assert.match(renderer, /caption\.className = "config-ui-rows-cell-label";[\s\S]{0,300}attachInfo\(caption, column, null\)/,
    'a column helper is no longer attached to its caption');
  assert.equal(/columnNote/.test(renderer), false, 'the old note under the cell is back');
  // `\n` in the source is still a real line break: a toggle's On./Off. pair is two lines, not a
  // paragraph. The rule moved with the text, onto the tooltip block that carries a helper.
  assert.match(renderer, /function helperBlock\(text\) \{[^}]*replace\(\/\\\\n\/g, "\\n"\)/,
    'a helper written as two lines will render as one');
});

/**
 * A nested column: `bright:{hue:number=Hue|chroma:number=Chroma}=Bright`.
 *
 * An anchor is one thing you set and two numbers you set it with, so the config says so rather than
 * carrying six flat keys with an annotation explaining which belong together. Márton chose the nesting
 * over the flat-plus-grouping alternative, and this is the seam that makes it work: parse, serialize and
 * read-back have to agree about one level of objects inside a row.
 *
 * The load-bearing case is the **collision**. Two groups both holding a `hue` are the normal shape here —
 * three anchors, each with a hue — so a flat `data-row-field="hue"` lookup would read the first one three
 * times and write it to all three anchors, which is a silent wrong answer rather than an error.
 */
test('a nested column parses into a group, one level deep', () => {
  const f = fieldOf('var m = [{}]; // @rows: name:text=Mode|bright:{hue:number=Hue|chroma:number=Chroma}=Bright');
  assert.deepEqual(f.columns.map((c) => c.key), ['name', 'bright']);
  assert.equal(f.columns[1].type, 'group');
  assert.equal(f.columns[1].label, 'Bright');
  assert.deepEqual(f.columns[1].columns.map((c) => c.key), ['hue', 'chroma']);
  assert.deepEqual(f.columns[1].columns.map((c) => c.type), ['number', 'number']);
  assert.deepEqual(f.columns[1].columns.map((c) => c.label), ['Hue', 'Chroma']);
});

test("a group's braces are told from a condition's by position, not by content", () => {
  // Both use braces. A condition follows a *type*; a group's braces **are** the type. Sniffing the
  // contents instead would break on a one-column group, or on a condition whose value contains a colon.
  const grouped = fieldOf('var m = [{}]; // @rows: a:{x:number=X}=A');
  assert.equal(grouped.columns[0].type, 'group');
  assert.equal(grouped.columns[0].showWhen, undefined);

  const conditional = fieldOf('var m = [{}]; // @rows: t:radio(a|b)=T|r:text{t=a}=R');
  assert.equal(conditional.columns[1].type, 'text');
  assert.deepEqual(conditional.columns[1].showWhen, [{ field: 't', values: ['a'] }]);
  assert.equal(conditional.columns[1].columns, undefined);
});

test('a nested column round-trips byte-identical, helper and all', () => {
  const line = 'var m = [{ name: "Granite", bright: { hue: 250, chroma: 0.002 } }]; ' +
    '// @rows: name:text=Mode|bright:{hue:number=Hue|chroma:number=Chroma @helper: 0 to 0.4.}=Bright @blocks @label: Modes';
  const schema = P.parse(line);
  assert.equal(P.serialize(schema).trim(), line.trim());
  // The part's helper survived the nesting rather than being swallowed by the group's label.
  const bright = fieldOf(line).columns[1];
  assert.equal(bright.columns[1].helper, '0 to 0.4.');
  assert.equal(bright.label, 'Bright');
});

test("a group's parts address themselves by group.part, so two hues cannot collide", () => {
  // Three anchors each holding a `hue` is the normal shape. A flat `data-row-field="hue"` lookup would find
  // the first one three times and write it into all three anchors — a wrong answer with no error.
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');
  assert.match(renderer, /var fieldKey = \(keyPrefix \|\| ""\) \+ column\.key;/,
    'buildRowCell does not prefix a part key');
  // `key` on a column, `name` on a field — one builder serves both, so the prefix falls back. Without the
  // fallback a field-level group prefixed its parts with the literal string "undefined." and saved nothing.
  assert.match(renderer, /var owner = column\.key \|\| column\.name;/,
    'buildRowGroup no longer resolves the owning key for both a column and a field');
  assert.match(renderer, /buildRowCell\(part, held\[part\.key\], groupName \+ "-" \+ part\.key, owner \+ "\."\)/,
    'buildRowGroup does not pass the group key as the prefix');
  assert.match(renderer, /'\[data-row-field="' \+ column\.key \+ "\." \+ part\.key \+ '"\]'/,
    'collectRows does not look a part up by its compound key');
  assert.equal(/setAttribute\("data-row-field", column\.key\)/.test(renderer), false,
    'a cell still addresses itself by the bare column key, so a group part will collide');
});

test('the reader is one implementation, shared by columns and by group parts', () => {
  // "A select over numbers reads back a number" is a rule that has already cost a bug. A second copy of it
  // for group parts would be the fifth place in this codebase where two implementations of one rule drifted.
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');
  assert.match(renderer, /function readRowCellInto\(target, column, el\)/);
  assert.equal((renderer.match(/column\.type === "select" && allNumericOptions/g) || []).length, 1,
    'the numeric-select rule appears more than once');
  assert.match(renderer, /readRowCellInto\(collected, part, partEl\)/, 'group parts do not use the reader');
  assert.match(renderer, /readRowCellInto\(row, column, el\)/, 'plain columns do not use the reader');
});
