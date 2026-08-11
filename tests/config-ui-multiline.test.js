/**
 * A config value may span lines.
 *
 * `parser.js` matched `var x = …;` on **one line**, and `serialize()` emits only the rows
 * `parse()` recognised — so a value the parser could not read was deleted from the source the
 * first time anyone touched a control. That is the whole reason the Design System Foundations
 * configs live in a code editor rather than a form, and the reason phase 2 has been a standing
 * threat to the paste workflow.
 *
 * The load-bearing case is the last one here: the content of every shipped config block, run
 * through `parse → serialize` **as if** it were a `@UI_CONFIG` block. Nothing migrates anything —
 * the property is "this content survives the serializer", which is what the later per-script
 * switches depend on. The files are read only.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const P = require('../src/config-ui/parser.js');

const DSF = path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');

const rowsOf = (source) => P.parse(source).rows;
const fieldsOf = (source) => rowsOf(source).filter((r) => r.type === 'field');
const valuesOf = (source) => {
  const out = {};
  for (const f of fieldsOf(source)) out[f.name] = f.value;
  return out;
};

/** parse → serialize → parse, which is what one touch of any control does. */
function roundTrip(source) {
  const schema = P.parse(source);
  const out = P.serialize(schema, {});
  return { text: out, values: valuesOf(out), before: valuesOf(source) };
}

// ---------------------------------------------------------------------------
// Reading a value that spans lines
// ---------------------------------------------------------------------------

test('an object spanning lines parses to the same value as the one-line form', () => {
  const multi = [
    'var base = {',
    '  "level": "xs",',
    '  "size": 4',
    '};'
  ].join('\n');
  const single = 'var base = {"level":"xs","size":4};';
  assert.deepEqual(valuesOf(multi), valuesOf(single));
  assert.deepEqual(valuesOf(multi).base, { level: 'xs', size: 4 });
});

test('an array of objects spanning lines parses', () => {
  const source = [
    'var sets = [',
    '  {',
    '    "name": "all",',
    '    "appliesTo": "*",',
    '    "step": 4',
    '  },',
    '  {',
    '    "name": "tight",',
    '    "appliesTo": "mobile",',
    '    "step": 2',
    '  }',
    '];'
  ].join('\n');
  const sets = valuesOf(source).sets;
  assert.equal(sets.length, 2);
  assert.deepEqual(sets[1], { name: 'tight', appliesTo: 'mobile', step: 2 });
});

test('an annotation follows the semicolon, on the closing line', () => {
  const source = [
    'var sets = [',
    '  { "name": "all" }',
    ']; // @rows: name:text @label: Parameter sets'
  ].join('\n');
  const field = fieldsOf(source)[0];
  assert.deepEqual(field.value, [{ name: 'all' }]);
  assert.equal(field.label, 'Parameter sets');
});

test('a bracket inside a string does not end the value early', () => {
  const source = [
    'var labels = {',
    '  "a": "] not the end",',
    '  "b": "}; also not"',
    '};'
  ].join('\n');
  assert.deepEqual(valuesOf(source).labels, { a: '] not the end', b: '}; also not' });
});

test('an unterminated value is left alone, not half-parsed', () => {
  // The one-line regex failed loudly by not matching. A reader that guesses at the end would
  // fail quietly by matching the wrong thing, which is worse.
  const source = [
    'var broken = {',
    '  "level": "xs"',
    'var after = 4;'
  ].join('\n');
  const values = valuesOf(source);
  assert.equal(values.broken, undefined, 'nothing invented from an unfinished value');

  // And it is not deleted either: emitting only what parsed is exactly how this serializer has
  // always lost things, so an unparsed span comes back out verbatim.
  const out = P.serialize(P.parse(source), {});
  assert.match(out, /var broken = \{/, 'the text the parser could not read survives it');
});

test('single-line values still parse exactly as they did', () => {
  const source = [
    'var name = "Spacing";',
    'var count = 6;',
    'var on = true;',
    'var tokens = ["px", "xs"];',
    'var nested = {"a":1};'
  ].join('\n');
  assert.deepEqual(valuesOf(source), {
    name: 'Spacing', count: 6, on: true, tokens: ['px', 'xs'], nested: { a: 1 }
  });
});

// ---------------------------------------------------------------------------
// Writing it back
// ---------------------------------------------------------------------------

test('a value that spans lines survives parse → serialize', () => {
  const source = [
    'var sets = [',
    '  {',
    '    "name": "all",',
    '    "step": 4',
    '  }',
    '];'
  ].join('\n');
  const trip = roundTrip(source);
  assert.deepEqual(trip.values, trip.before);
  assert.ok(/\n/.test(trip.text), 'and comes back out spanning lines rather than collapsed');
});

test('serializing keeps the annotations, headings, spacers and comments around it', () => {
  const source = [
    '// # Scale',
    '//',
    '// How each viewport is generated.',
    'var sets = [',
    '  { "name": "all", "step": 4 }',
    ']; // @rows: name:text|step:number',
    '//',
    'var group = "Spacing"; // @label: Variable group'
  ].join('\n');
  const out = P.serialize(P.parse(source), {});

  assert.match(out, /# Scale/);
  assert.match(out, /How each viewport is generated\./);
  assert.match(out, /@rows: name:text\|step:number/);
  assert.match(out, /@label: Variable group/);
  assert.deepEqual(valuesOf(out), valuesOf(source));
});

test('an empty array and an empty object round-trip', () => {
  const source = 'var none = [];\nvar blank = {};';
  const trip = roundTrip(source);
  assert.deepEqual(trip.values, { none: [], blank: {} });
});

test('a form edit rewrites one value and leaves the rest alone', () => {
  const source = [
    'var group = "Spacing";',
    'var sets = [',
    '  { "name": "all", "step": 4 }',
    '];'
  ].join('\n');
  const out = P.serialize(P.parse(source), { sets: [{ name: 'all', step: 8 }] });
  const values = valuesOf(out);
  assert.equal(values.group, 'Spacing', 'untouched');
  assert.deepEqual(values.sets, [{ name: 'all', step: 8 }], 'and the edited one is the edit');
});

// ---------------------------------------------------------------------------
// The load-bearing one: every shipped config's content survives
// ---------------------------------------------------------------------------

/** The `@CONFIG_START` block of a shipped script, evaluated as the object it is. */
function shippedConfig(file) {
  const source = fs.readFileSync(path.join(DSF, file), 'utf8');
  const start = source.indexOf('// @CONFIG_START');
  const end = source.indexOf('// @CONFIG_END');
  assert.ok(start !== -1 && end > start, file + ' has a config block');
  return vm.runInNewContext('({' + source.slice(start + '// @CONFIG_START'.length, end) + '})');
}

/** The same content, written the way a `@UI_CONFIG` block writes it. */
function asUiConfigBlock(config) {
  return Object.keys(config)
    .map((key) => 'var ' + key + ' = ' + JSON.stringify(config[key], null, 2) + ';')
    .join('\n');
}

test('the content of every shipped config block survives the serializer', () => {
  // Read only. This does not migrate anything and no file changes — it asserts the property the
  // later per-script switches to @UI_CONFIG depend on, before any of them is attempted.
  for (const file of ['grid.js', 'spacing.js', 'corner-radius.js', 'typography.js', 'colors.js']) {
    const config = shippedConfig(file);
    const block = asUiConfigBlock(config);
    const trip = roundTrip(block);

    assert.deepEqual(trip.before, config, file + ': the fixture itself must parse first');
    assert.deepEqual(trip.values, config, file + ': content lost through parse → serialize');

    // Twice, because a serializer that is stable only on the first pass is not stable.
    assert.deepEqual(valuesOf(P.serialize(P.parse(trip.text), {})), config, file + ': not idempotent');
  }
});

test('the deepest nesting a shipped config has survives', () => {
  // spacing's modes carry `base: { level, size }` — an object inside an object inside an array,
  // which is exactly the shape the one-line reader could never have held.
  const spacing = shippedConfig('spacing.js');
  const trip = roundTrip(asUiConfigBlock(spacing));
  assert.deepEqual(trip.values.modes, spacing.modes);
  assert.deepEqual(trip.values.modes[0].base, spacing.modes[0].base);
});

// ---------------------------------------------------------------------------
// Read tolerantly; write back only what changed
// ---------------------------------------------------------------------------

test('a value written the way a person writes it parses', () => {
  // Bare keys, single quotes, a trailing comma, and comments explaining the options — which is
  // what every shipped config block looks like, and what JSON has nowhere to put.
  const source = [
    'var scaling = {',
    '  type: "sine",',
    "  // Range curve: linear, sine, quad, cubic. Piecewise: piecewise, piecewise2.",
    "  ease: 'in',",
    '  roundTo: 2,',
    '};'
  ].join('\n');
  assert.deepEqual(valuesOf(source).scaling, { type: 'sine', ease: 'in', roundTo: 2 });
});

test('tolerance stops at the string boundary', () => {
  const source = [
    'var tricky = {',
    '  a: "http://example.com // not a comment",',
    "  b: 'it\\'s fine',",
    '  c: "a { brace } and a , comma"',
    '};'
  ].join('\n');
  assert.deepEqual(valuesOf(source).tricky, {
    a: 'http://example.com // not a comment',
    b: "it's fine",
    c: 'a { brace } and a , comma'
  });
});

test('config text is never executed', () => {
  // It arrives from pastes, from colleagues and from canvas text layers, and the parser runs in
  // the iframe. An expression is text, not arithmetic.
  const source = 'var sneaky = { size: "4 * 2" };';
  assert.equal(valuesOf(source).sneaky.size, '4 * 2', 'read as written, not evaluated');
  assert.doesNotThrow(() => P.parse('var x = { a: (function(){ throw new Error("ran"); })() };'));
});

test('an untouched block comes back byte-identical', () => {
  // The serializer re-emits only what the form actually edited. Everything else is written back
  // as written — so a hand-written block keeps its bare keys, its single quotes and its comments
  // unless someone edits that specific field.
  const source = [
    'var group = "Spacing";',
    'var scaling = {',
    '  type: "sine",',
    '  // One grid for every step.',
    '  roundTo: 2',
    '};',
    'var tokens = ["px", "xs"];'
  ].join('\n');
  assert.equal(P.serialize(P.parse(source), {}), source);

  // Even when the form hands back every value, as a real form does — they are all unchanged.
  const schema = P.parse(source);
  const everything = {};
  for (const row of schema.rows) if (row.type === 'field') everything[row.name] = row.value;
  assert.equal(P.serialize(schema, everything), source);
});

test('editing one field rewrites that field and nothing else', () => {
  const source = [
    'var group = "Spacing";',
    'var scaling = {',
    '  type: "sine",',
    '  // One grid for every step.',
    '  roundTo: 2',
    '};'
  ].join('\n');
  const out = P.serialize(P.parse(source), { group: 'Space' });

  assert.match(out, /var group = "Space";/, 'the edit landed');
  assert.match(out, /\/\/ One grid for every step\./, 'and the comment beside the other field did not');
  assert.match(out, /type: "sine"/, 'nor its bare keys');
  assert.deepEqual(valuesOf(out).scaling, { type: 'sine', roundTo: 2 });
});

test('an edited field is reprinted in the block\'s own style, not JSON', () => {
  // This test used to assert the opposite — that an edited object came back as `"type": "quad"` — and
  // called that "the canonical form". It is not: the canonical form is whatever a person would have
  // written, and every one of these blocks writes bare keys. Editing one value in Grid's `modes`
  // reformatted 19 lines of 51 under the old rule.
  const source = 'var scaling = {\n  type: "sine",\n  roundTo: 2\n};';
  const out = P.serialize(P.parse(source), { scaling: { type: 'quad', roundTo: 2 } });
  assert.match(out, /type: "quad"/, 'the edit landed');
  assert.doesNotMatch(out, /"type"/, 'and did not quote a key that does not need it');
  assert.deepEqual(valuesOf(out).scaling, { type: 'quad', roundTo: 2 });

  // A key JavaScript would not accept bare still gets quotes, because correctness is not a style.
  const odd = P.serialize(P.parse('var m = {};'), { m: { 'font-size': 12 } });
  assert.match(odd, /"font-size": 12/);
  assert.deepEqual(valuesOf(odd).m, { 'font-size': 12 });
});

/**
 * A `@CONFIG_START` property list, rewritten as the `var` rows a `@UI_CONFIG` block holds —
 * keeping every character of every value, including its comments and its bare keys.
 *
 * Top-level properties only: a property's value may span lines, so depth is tracked rather than
 * guessed at, and comment lines between properties pass through untouched.
 */
/**
 * Kept for the tests below that specifically exercise `var`-row syntax on real content. The
 * byte-for-byte test above no longer needs it: the parser reads property lists directly.
 */
function blockAsRows(block) {
  const lines = block.split('\n');
  const out = [];
  let pending = null;
  let depth = 0;

  const track = (line) => {
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line.charAt(i);
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '/' && line.charAt(i + 1) === '/') break;
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
    }
  };

  const flush = () => {
    if (!pending) return;
    const text = pending.lines.join('\n').replace(/,\s*$/, '');
    out.push('var ' + pending.name + ' = ' + text + ';');
    pending = null;
  };

  for (const line of lines) {
    const opener = depth === 0 && !pending ? line.match(/^\s*([A-Za-z_$][\w$]*):\s*([\s\S]*)$/) : null;
    if (opener) {
      pending = { name: opener[1], lines: [opener[2]] };
      track(line);
      if (depth === 0) flush();
      continue;
    }
    if (pending) {
      pending.lines.push(line);
      track(line);
      if (depth === 0) flush();
      continue;
    }
    track(line);
    out.push(line);
  }
  flush();
  return out.join('\n');
}

test('every shipped config block survives as written, byte for byte', () => {
  // The real artifact, not a reconstruction of it: each block exactly as it sits in the file —
  // bare keys, single quotes, the comments explaining each option — through parse → serialize
  // with nothing edited. Read only; no file changes.
  for (const file of ['grid.js', 'spacing.js', 'corner-radius.js', 'typography.js', 'colors.js']) {
    const source = fs.readFileSync(path.join(DSF, file), 'utf8');
    const start = source.indexOf('// @CONFIG_START') + '// @CONFIG_START'.length;
    const block = source.slice(start, source.indexOf('// @CONFIG_END'));
    // **The block itself, not a rewrite of it.** This used to go through `blockAsRows`, which
    // converted the property list into `var` rows because the parser could only read those — the gap
    // that left every Design System Foundations script formless. The parser reads both syntaxes now,
    // so the test reads the real artifact and is stronger for it.
    assert.deepEqual(valuesOf(block), shippedConfig(file), file + ': the block lost content');

    // Trailing whitespace only. The blank lines *after* a block belong to `mergeConfigIntoMain`,
    // which writes its own newlines; the indentation *before* the first key belongs to the block, and
    // trimming it left the first line flush while every other line kept its indent.
    assert.equal(
      P.serialize(P.parse(block), {}),
      block.replace(/\s+$/, ''),
      file + ': the block came back changed'
    );
  }
});

// ---------------------------------------------------------------------------
// Values no control can edit
// ---------------------------------------------------------------------------

/**
 * What `getValues` collects: every field with a `data-field` attribute.
 *
 * A control rendered without one is not collected, so its value comes back `undefined` and
 * `serialize` writes the line as it was written. That is the whole mechanism protecting a value
 * no control can represent — mirrored here because the renderer needs a DOM and this does not.
 */
function simulateGetValues(schema) {
  const out = {};
  for (const row of schema.rows) {
    if (row.type !== 'field' || row.inputType === 'unsupported') continue;
    out[row.name] = row.value;
  }
  return out;
}

test('an object value is marked as one no control can edit', () => {
  const schema = P.parse('var scaling = {"type":"sine"};');
  assert.equal(schema.rows[0].inputType, 'unsupported');
});

test('an array is unsupported unless a control claims it', () => {
  assert.equal(P.parse('var tokens = ["px","xs"];').rows[0].inputType, 'unsupported');
  assert.equal(P.parse('var tokens = ["px","xs"]; // @multi @options: px|xs').rows[0].inputType, 'multiselect');
});

test('editing one field leaves an object field byte-identical', () => {
  // The way it actually happens: mergeConfigIntoMain serialises the *whole block* on every
  // change, so an object field was destroyed by editing something else entirely. It rendered as
  // a text input holding "[object Object]", getValues collected that string, and the untouched
  // check then saw a difference and rewrote the line.
  const source = [
    'var group = "Spacing";',
    'var scaling = {',
    '  type: "sine",',
    '  // One grid for every step.',
    '  roundTo: 2',
    '};',
    'var tokens = ["px", "xs"];'
  ].join('\n');

  const schema = P.parse(source);
  const values = simulateGetValues(schema);
  values.group = 'Space';

  const out = P.serialize(schema, values);
  assert.match(out, /var group = "Space";/, 'the edit landed');
  assert.ok(!/\[object Object\]/.test(out), 'and nothing was stringified into nonsense');
  assert.match(out, /  type: "sine",\n  \/\/ One grid for every step\.\n  roundTo: 2/, out);
  assert.match(out, /var tokens = \["px", "xs"\];/, 'the array is intact too');
  assert.deepEqual(valuesOf(out).scaling, { type: 'sine', roundTo: 2 });
});

test('an unsupported control carries no data-field, which is what protects it', () => {
  // getValues collects `[data-field]`. Read off the renderer, because the contract lives across
  // two files and only one of them is testable here.
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');
  const branch = /if \(t === "unsupported"\)[\s\S]*?\n    \}/.exec(renderer);
  assert.ok(branch, 'the renderer has no branch for values it cannot edit');
  assert.ok(
    !/setAttribute\(\s*["']data-field/.test(branch[0]),
    'an unsupported control must not be collected: ' + branch[0]
  );
});

// ---------------------------------------------------------------------------
// Escaping, and finding the end
// ---------------------------------------------------------------------------

test('an escaped quote inside a value survives', () => {
  const source = 'var labels = {\n  label: "say \\"hi\\"",\n  path: "C:\\\\tmp"\n};';
  assert.deepEqual(valuesOf(source).labels, { label: 'say "hi"', path: 'C:\\tmp' });
});

test('a semicolon and comment inside a string do not end the value', () => {
  const source = [
    'var tricky = {',
    '  a: "ends with; // not really",',
    '  b: 2',
    '};'
  ].join('\n');
  assert.deepEqual(valuesOf(source).tricky, { a: 'ends with; // not really', b: 2 });
});

test('a value whose last line holds a semicolon in a string still ends correctly', () => {
  const source = [
    'var tricky = {',
    '  a: "trailing; // here"',
    '}; // @label: Tricky'
  ].join('\n');
  const field = fieldsOf(source)[0];
  assert.deepEqual(field.value, { a: 'trailing; // here' });
  assert.equal(field.label, 'Tricky');
});
