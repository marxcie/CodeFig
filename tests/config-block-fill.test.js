/**
 * Filling a config block from a file.
 *
 * The block is the human format: comments, key order and nesting are the point, not incidental.
 * So import does not print a new block — it fills values into the one the script already ships,
 * and everything it did not have a value for comes out byte-identical.
 *
 * Values are the easy half. **Shape is the hard half**, and it has three directions:
 *
 * 1. **The shapes match** — three modes in the file, three in the block. Substitute in place.
 * 2. **The file has entries the block does not** — five viewports, three in the block. There is no
 *    line to fill, so one is inserted, modelled on the nearest sibling: its indentation, its key
 *    order, its quoting. An inserted entry carries no comments, because a comment was written for
 *    the entry it sits above and copying it onto a different entry would make it a false claim.
 * 3. **The block has entries the file does not** — the block has tablet, the file has two
 *    viewports. The entry is removed **and so are the comments attached to it**, because a comment
 *    left behind describes something that is no longer there.
 *
 * Direction 3 is the one worth being loud about: quietly deleting an annotated tablet block
 * because an imported config had two viewports is a loss you find a week later. Every removal is
 * reported by name, with the comment lines that went with it.
 *
 * A key the payload does not mention at all is **not** direction 3. "The file does not say" and
 * "the file says there are two of these" are different statements, and only the second is a
 * statement about shape. A top-level key the payload omits keeps whatever the block had.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const P = require('../src/config-ui/parser.js');

const DSF = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');

/** The `@CONFIG_START` body of a shipped script, as text. */
function shippedBlock(file) {
  const source = fs.readFileSync(path.join(DSF, file), 'utf8');
  const start = source.indexOf('// @CONFIG_START');
  const end = source.indexOf('// @CONFIG_END');
  return source.slice(source.indexOf('\n', start) + 1, source.lastIndexOf('\n', end) + 1);
}

const BLOCK = [
  '  collectionName: "Responsive System",',
  '  group: "Spacing",',
  '',
  '  // Snap every value to a multiple of this.',
  '  roundTo: 2,',
  '',
  '  modes: [',
  '    {',
  '      name: "desktop",',
  '      model: "metric",',
  '      min: 1,',
  '      step: 4',
  '    },',
  '    // Tablet is deliberately tighter — see the density note in the spec.',
  '    {',
  '      name: "tablet",',
  '      model: "metric",',
  '      min: 1,',
  '      step: 3',
  '    }',
  '  ]',
  ''
].join('\n');

const modes = (list) => ({ modes: list });

// ---------------------------------------------------------------------------
// 1. The shapes match
// ---------------------------------------------------------------------------

test('a scalar is substituted and nothing else moves', () => {
  const out = P.fillConfigBlock(BLOCK, { roundTo: 4 });

  assert.equal(out.text.indexOf('roundTo: 4,') !== -1, true);
  assert.deepEqual(out.removed, []);
  assert.deepEqual(out.inserted, []);

  // Every line except the one that changed is untouched, including the comment above it.
  const before = BLOCK.split('\n');
  const after = out.text.split('\n');
  assert.equal(after.length, before.length);
  const differing = before.map((l, i) => (l === after[i] ? null : i)).filter((i) => i !== null);
  assert.deepEqual(differing.map((i) => after[i].trim()), ['roundTo: 4,']);
});

test('values inside a matched entry are substituted, and its comment stays put', () => {
  const out = P.fillConfigBlock(BLOCK, modes([
    { name: 'desktop', model: 'metric', min: 1, step: 8 },
    { name: 'tablet', model: 'metric', min: 1, step: 6 }
  ]));

  assert.match(out.text, /name: "desktop",[\s\S]*?step: 8/);
  assert.match(out.text, /name: "tablet",[\s\S]*?step: 6/);
  assert.match(out.text, /\/\/ Tablet is deliberately tighter/, 'the annotation survives');
  assert.deepEqual(out.inserted, []);
  assert.deepEqual(out.removed, []);
});

test('a payload that changes nothing returns the block byte-identical', () => {
  const out = P.fillConfigBlock(BLOCK, modes([
    { name: 'desktop', model: 'metric', min: 1, step: 4 },
    { name: 'tablet', model: 'metric', min: 1, step: 3 }
  ]));
  assert.equal(out.text, BLOCK);
  assert.equal(out.substituted.length, 0, 'a value equal to the one already there is not a change');
});

test('a key the payload never mentions keeps whatever the block had', () => {
  // "The file does not say" is not "the file says this should not exist".
  const out = P.fillConfigBlock(BLOCK, { roundTo: 2 });
  assert.equal(out.text, BLOCK);
  assert.deepEqual(out.removed, [], 'modes and group were not mentioned, so they are not removals');
});

// ---------------------------------------------------------------------------
// 2. The file has entries the block does not
// ---------------------------------------------------------------------------

test('an extra entry is inserted in the style of its nearest sibling', () => {
  const out = P.fillConfigBlock(BLOCK, modes([
    { name: 'desktop', model: 'metric', min: 1, step: 4 },
    { name: 'tablet', model: 'metric', min: 1, step: 3 },
    { name: 'mobile', model: 'metric', min: 1, step: 2 }
  ]));

  assert.equal(out.inserted.length, 1);
  assert.equal(out.inserted[0].name, 'mobile');

  // Same indentation and same key order as the sibling it was modelled on.
  const inserted = out.text.slice(out.text.indexOf('name: "mobile"'));
  assert.match(out.text, /\n    \{\n      name: "mobile",\n      model: "metric",\n      min: 1,\n      step: 2\n    \}/);
  assert.equal(inserted.indexOf('//'), -1, 'and no comments, because none were written for it');

  // The entries that already existed are untouched.
  assert.match(out.text, /\/\/ Tablet is deliberately tighter/);
  assert.match(out.text, /name: "desktop",\n      model: "metric",\n      min: 1,\n      step: 4/);
});

test('the run says what it inserted', () => {
  const out = P.fillConfigBlock(BLOCK, modes([
    { name: 'desktop', model: 'metric', min: 1, step: 4 },
    { name: 'tablet', model: 'metric', min: 1, step: 3 },
    { name: 'wide', model: 'metric', min: 1, step: 6 }
  ]));
  assert.match(out.summary, /Added 1 entry to modes: wide/);
});

test('an insert into an empty list still gets the block’s indentation', () => {
  const empty = '  group: "Spacing",\n  modes: []\n';
  const out = P.fillConfigBlock(empty, modes([{ name: 'desktop', min: 1 }]));
  assert.match(out.text, /modes: \[\n    \{\n      name: "desktop",\n      min: 1\n    \}\n  \]/);
  assert.equal(out.inserted.length, 1);
});

// ---------------------------------------------------------------------------
// 3. The block has entries the file does not
// ---------------------------------------------------------------------------

test('an entry the file does not have is removed, with the comments attached to it', () => {
  const out = P.fillConfigBlock(BLOCK, modes([{ name: 'desktop', model: 'metric', min: 1, step: 4 }]));

  assert.equal(out.text.indexOf('tablet'), -1, 'the entry is gone');
  assert.equal(out.text.indexOf('deliberately tighter'), -1,
    'and so is the comment, which described something that is no longer there');
  assert.match(out.text, /name: "desktop"/, 'the one the file does have is untouched');
});

test('a removal is reported by name, with the comment lines that went with it', () => {
  const out = P.fillConfigBlock(BLOCK, modes([{ name: 'desktop', model: 'metric', min: 1, step: 4 }]));

  assert.equal(out.removed.length, 1);
  assert.equal(out.removed[0].name, 'tablet');
  assert.equal(out.removed[0].path, 'modes');
  assert.equal(out.removed[0].comments.length, 1);
  assert.match(out.removed[0].comments[0], /deliberately tighter/);

  // Loud enough to notice a week earlier than you otherwise would.
  assert.match(out.summary, /Removed 1 entry from modes: tablet/);
  assert.match(out.summary, /1 comment line/);
});

test('removing the last entry leaves a valid empty list', () => {
  const out = P.fillConfigBlock(BLOCK, modes([]));
  assert.match(out.text, /modes: \[\]/);
  assert.equal(out.removed.length, 2);
});

// ---------------------------------------------------------------------------
// All three at once, and the order the block chose
// ---------------------------------------------------------------------------

test('substitute, insert and remove in one pass', () => {
  const out = P.fillConfigBlock(BLOCK, modes([
    { name: 'desktop', model: 'metric', min: 1, step: 9 },
    { name: 'mobile', model: 'metric', min: 1, step: 2 }
  ]));

  assert.match(out.text, /name: "desktop",[\s\S]*?step: 9/, 'substituted');
  assert.match(out.text, /name: "mobile"/, 'inserted');
  assert.equal(out.text.indexOf('tablet'), -1, 'removed');
  assert.equal(out.removed.length, 1);
  assert.equal(out.inserted.length, 1);
  assert.equal(out.substituted.length, 1);
});

test('a matched entry keeps the block’s position, and a different order is reported not applied', () => {
  // Reordering a block would move comments away from what they describe. The file's order is
  // worth knowing about, so it is said rather than silently imposed.
  const out = P.fillConfigBlock(BLOCK, modes([
    { name: 'tablet', model: 'metric', min: 1, step: 3 },
    { name: 'desktop', model: 'metric', min: 1, step: 4 }
  ]));

  assert.ok(out.text.indexOf('"desktop"') < out.text.indexOf('"tablet"'), 'the block keeps its order');
  assert.match(out.summary, /different order/);
});

// ---------------------------------------------------------------------------
// The shipped blocks, which is what this is actually for
// ---------------------------------------------------------------------------

test('every shipped block survives a fill that changes nothing', () => {
  // The property the import button rests on: filling with what is already there is a no-op, so
  // any diff a user sees afterwards is a diff they asked for.
  for (const file of ['spacing.js', 'corner-radius.js', 'grid.js', 'typography.js', 'colors.js']) {
    const block = shippedBlock(file);
    const parsed = P.parseConfigBlockObject(block);
    const out = P.fillConfigBlock(block, parsed);
    assert.equal(out.text, block, file + ' changed when filled with its own values');
    assert.deepEqual(out.removed, [], file);
    assert.deepEqual(out.inserted, [], file);
  }
});

test('a filled block still parses to the values that were put in', () => {
  const payload = modes([
    { name: 'desktop', model: 'metric', min: 2, step: 8 },
    { name: 'mobile', model: 'metric', min: 1, step: 2 }
  ]);
  const out = P.fillConfigBlock(BLOCK, payload);
  const back = P.parseConfigBlockObject(out.text);

  assert.equal(back.modes.length, 2);
  assert.deepEqual(back.modes.map((m) => m.name), ['desktop', 'mobile']);
  assert.equal(back.modes[0].step, 8);
  assert.equal(back.modes[1].step, 2);
  assert.equal(back.collectionName, 'Responsive System', 'and everything it did not touch');
});

test('an inserted entry copies the sibling’s inline nesting, not a printer’s idea of it', () => {
  // `base: { level: "xs", size: 4 }` on one line beside `base: {\n level...\n}` on four reads as
  // two different kinds of thing. An insert that looks foreign is a diff you read twice.
  const block = [
    '  modes: [',
    '    {',
    '      name: "desktop",',
    '      base: { level: "xs", size: 4 },',
    '      step: 4',
    '    }',
    '  ]',
    ''
  ].join('\n');

  const out = P.fillConfigBlock(block, modes([
    { name: 'desktop', base: { level: 'xs', size: 4 }, step: 4 },
    { name: 'mobile', base: { level: 'xs', size: 2 }, step: 2 }
  ]));

  assert.match(out.text, /name: "mobile",\n      base: \{ level: "xs", size: 2 \},\n      step: 2/);
});

test('the summary counts in English', () => {
  const out = P.fillConfigBlock(BLOCK, modes([
    { name: 'desktop', model: 'metric', min: 1, step: 4 },
    { name: 'tablet', model: 'metric', min: 1, step: 3 },
    { name: 'wide', min: 1 },
    { name: 'ultra', min: 1 }
  ]));
  assert.match(out.summary, /Added 2 entries to modes: wide, ultra\./);
  assert.equal(out.summary.indexOf('entry entries'), -1);
});

test('a comma before a trailing comment is punctuation, not part of the value', () => {
  // `key: value, // note` puts the comma inside the item, because the comment is reattached to the
  // line it sits on. Treating it as part of the value made every annotated line count as changed
  // and then wrote the new value over the comma — found the moment Grid's block gained annotations.
  const block = [
    '  collectionName: "Responsive System", // @collection @label: Collection',
    '  group: "Grid", // @label: Group within collection',
    '  extensionColumns: 0 // no comma on the last one',
    ''
  ].join('\n');

  const unchanged = P.fillConfigBlock(block, P.parseConfigBlockObject(block));
  assert.equal(unchanged.text, block, 'nothing changed, so nothing moved');
  assert.deepEqual(unchanged.substituted, [], 'and nothing counted as a change');

  const changed = P.fillConfigBlock(block, { collectionName: 'Other', group: 'Grid', extensionColumns: 4 });
  assert.match(changed.text, /collectionName: "Other", \/\/ @collection @label: Collection/);
  assert.match(changed.text, /extensionColumns: 4 \/\/ no comma on the last one/, 'and none is invented');
  assert.deepEqual(changed.substituted.sort(), ['collectionName', 'extensionColumns']);
});

test('a block that ends with a comment still parses', () => {
  // `"{" + text + "}"` put the closing brace on the trailing comment's own line, where the comment skip
  // swallowed it. Grid's block ends with `// @suggestions` and `serialize` trims trailing whitespace, so
  // every form interaction produced an unparseable config — the preview read "Waiting for a config this
  // can read", which is true and explains nothing.
  assert.ok(P.parseConfigBlockObject('a: 1, // a trailing note'), 'a one-line block ending in a comment');
  assert.ok(P.parseConfigBlockObject('  a: 1,\n  // @suggestions'), 'a marker row last');
  assert.deepEqual(P.parseConfigBlockObject('a: 1, // note'), { a: 1 });

  // And the round trip a form interaction actually makes: parse → serialize → parse.
  const fs2 = require('fs');
  const path2 = require('path');
  const src = fs2.readFileSync(
    path2.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'grid.js'), 'utf8'
  );
  const block = src.slice(src.indexOf('// @CONFIG_START') + 16, src.indexOf('// @CONFIG_END'));
  const schema = P.parse(block);
  const values = {};
  for (const r of schema.rows) if (r.type === 'field') values[r.name] = r.value;
  assert.ok(P.parseConfigBlockObject(P.serialize(schema, values)),
    'what the editor holds after one form interaction must still parse');
});

test('an object the block leaves empty is filled, not skipped', () => {
  // `lightness: {}` is the block saying "three anchors, shape not known yet". Filling only keys that were
  // already written meant it gained nothing, so reading a collection loaded the steps and left every anchor
  // empty — and then appeared to work on the second attempt, because by then the form had written the keys
  // in. That is what "the palette only loads after I edit it" was.
  const block = [
    'group: "", // @label: Group',
    'lightness: {}, // @group: bright:number=Bright|middle:number=Middle|dark:number=Dark @label: Lightness'
  ].join('\n');

  const out = P.fillConfigBlock(block, { lightness: { bright: 98.5, middle: 78.5, dark: 19.4 } });
  assert.match(out.text, /lightness: \{ bright: 98\.5, middle: 78\.5, dark: 19\.4 \},/);
  assert.deepEqual(out.substituted, ['lightness.bright', 'lightness.middle', 'lightness.dark']);
  assert.match(out.summary, /Filled 3 values/);

  // The annotation is untouched, which is what makes this a fill rather than a reprint.
  assert.match(out.text, /@group: bright:number=Bright\|middle:number=Middle\|dark:number=Dark @label: Lightness/);
  assert.match(out.text, /group: "", \/\/ @label: Group/);

  // A partly-written object gains only what it lacks, and keeps what it had.
  const partial = 'lightness: { bright: 1 }, // @group: bright:number=Bright|dark:number=Dark';
  const two = P.fillConfigBlock(partial, { lightness: { bright: 98.5, dark: 19.4 } });
  assert.match(two.text, /lightness: \{ bright: 98\.5, dark: 19\.4 \},/);
});

test('the last property of an inserted entry is written like its siblings', () => {
  // An entry's last property runs to the entry's own closing brace, so its text carries the line break that
  // *closes the object*. Read as "written across lines", every inserted entry came out with its final key
  // expanded and the rest inline — a three-line `dark:` beside a one-line `bright:`, from a sibling where
  // all three are written identically.
  const block = [
    'modes: [',
    '  { name: "Ash", bright: { hue: 1, sat: 2 }, dark: { hue: 3, sat: 4 } }',
    '], // @rows: name:text=Mode @label: Modes'
  ].join('\n');

  const out = P.fillConfigBlock(block, {
    modes: [
      { name: 'Ash', bright: { hue: 1, sat: 2 }, dark: { hue: 3, sat: 4 } },
      { name: 'Bark', bright: { hue: 5, sat: 6 }, dark: { hue: 7, sat: 8 } }
    ]
  });
  assert.match(out.text, /\{ name: "Bark", bright: \{ hue: 5, sat: 6 \}, dark: \{ hue: 7, sat: 8 \} \}|dark: \{ hue: 7, sat: 8 \}/);
  assert.equal(/dark: \{\n/.test(out.text), false,
    'the inserted entry expanded its last property while its sibling wrote it inline');
});
