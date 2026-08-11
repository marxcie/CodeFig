/**
 * `scripts/HELP/style-and-ui-reference.js` is a reference, which means its whole value is being
 * trustworthy: it gets quoted, and a wrong entry is worse than a missing one. So it is checked the
 * way the rest of this repo checks agreements — by deriving one side from the other rather than
 * asserting a copy.
 *
 * Two properties:
 *   1. **Coverage.** Every control the renderer can build appears in the reference's own config block,
 *      and every marker row the parser emits is demonstrated. A new control that nobody can see is
 *      the failure this file exists to make loud, because the heading bug that prompted the reference
 *      was invisible for exactly that reason.
 *   2. **Correctness.** Every token value the documentation states is read back out of `src/ui.css`.
 *      Changing a token now fails here until the reference is updated.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const REF = fs.readFileSync(path.join(root, 'scripts', 'HELP', 'style-and-ui-reference.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'src', 'ui.css'), 'utf8');
const RENDERER = fs.readFileSync(path.join(root, 'src', 'config-ui', 'renderer.js'), 'utf8');
const PARSER_SRC = fs.readFileSync(path.join(root, 'src', 'config-ui', 'parser.js'), 'utf8');
const parser = require('../src/config-ui/parser.js');

/** The block as the UI extracts it: comment rows keep their `//`, field lines are live JS. */
function configBlock() {
  const m = /@UI_CONFIG_START\n([\s\S]*?)\/\/ @UI_CONFIG_END/.exec(REF);
  assert.ok(m, 'the reference has no @UI_CONFIG block');
  return m[1];
}

function docBlock() {
  const m = /@DOC_START\n([\s\S]*?)\/\/ @DOC_END/.exec(REF);
  assert.ok(m, 'the reference has no @DOC block');
  return m[1];
}

const SCHEMA = parser.parse(configBlock());
const ROW_TYPES = new Set(SCHEMA.rows.map((r) => r.type));
const INPUT_TYPES = new Set(
  SCHEMA.rows.filter((r) => r.type === 'field').map((r) => r.inputType)
);

test('every control the renderer can build is shown in the reference', () => {
  // Derived from the renderer's own branches, so adding one and forgetting the reference fails here.
  const branches = new Set(
    [...RENDERER.matchAll(/\bt === "(\w+)"/g)].map((m) => m[1])
  );
  // `string` has no branch: it is the fallback every unclaimed value lands in.
  branches.add('string');

  const missing = [...branches].filter((t) => !INPUT_TYPES.has(t));
  assert.deepEqual(missing, [],
    'the renderer builds these and the reference shows none of them: ' + missing.join(', '));
});

test('every marker row the parser emits is demonstrated, or exempt for a stated reason', () => {
  const emitted = new Set(
    [...PARSER_SRC.matchAll(/rows\.push\(\{\s*\n?\s*type: "(\w+)"/g)].map((m) => m[1])
  );
  [...PARSER_SRC.matchAll(/type: "(heading|divider|paragraph|chips|field)"/g)].forEach((m) =>
    emitted.add(m[1])
  );

  // Exemptions, each because the row is not a style primitive:
  //   preview/suggestions — render the *script's own* markup, so a specimen here would be a second
  //     copy of Grid's panel rather than a component. Grid is the live example, and the reference
  //     says so.
  //   directive (`@fromFile:`) — renders as nothing by design; there is no appearance to check.
  //   unparsed — a line the parser could not read. An error state, not something to author.
  const exempt = new Set(['preview', 'suggestions', 'directive', 'unparsed']);

  const missing = [...emitted].filter((t) => !ROW_TYPES.has(t) && !exempt.has(t));
  assert.deepEqual(missing, [],
    'the parser emits these row types and the reference shows none of them: ' + missing.join(', '));

  // And the exemptions are documented rather than silent.
  const doc = docBlock();
  assert.match(doc, /Not in here, on purpose/);
  assert.match(doc, /@preview` and `@suggestions/);
});

test('the reference reaches the plugin: it ships and it parses', () => {
  // A `_`-prefixed file or a parse error would make it invisible — the same failure it documents.
  assert.equal(path.basename('scripts/HELP/style-and-ui-reference.js').startsWith('_'), false);
  assert.doesNotThrow(() => new Function('figma', 'console', 'window', REF),
    'the reference does not parse the way the sandbox parses it');
  assert.match(REF, /\/\/ SCRIPT_NAME: Style & UI reference/);
});

test('every field in the reference names the syntax that produced it', () => {
  // The point of the thing: read the note, ask for the change. A field with no note is a control
  // nobody can name.
  const unnamed = SCHEMA.rows
    .filter((r) => r.type === 'field' && !r.helper && !r.label)
    .map((r) => r.name);
  assert.deepEqual(unnamed, [], 'these fields carry neither a label nor a note: ' + unnamed.join(', '));
});

test('a note may mention an annotation without being truncated', () => {
  // The reference found this: `@helper:` used to stop at the next ` @word`, so notes came back as
  // "the same" and "an object with no". In a config UI where every annotation starts with `@`, a note
  // that cannot say `@options` is not a note. Now it reads to end of line and must come last.
  const helpers = SCHEMA.rows.filter((r) => r.type === 'field').map((r) => r.helper).filter(Boolean);
  const quoting = helpers.filter((h) => /\s@[a-z]/.test(h));
  assert.ok(quoting.length >= 3,
    'the reference no longer quotes annotations in its notes, so this guards nothing');
  quoting.forEach((h) => {
    assert.ok(h.length > 20 && !/\b(the same|with no)$/.test(h),
      'a note looks truncated mid-sentence: ' + JSON.stringify(h));
  });
});

test('the token values the documentation states are the ones in ui.css', () => {
  const doc = docBlock();
  // `--radius-full: 9999px` is a "make it a pill" sentinel rather than a measurement, so the doc
  // names it without a number and this skips it.
  const skip = new Set(['--radius-full']);

  const tokens = [...CSS.matchAll(/(--(?:font-size|space|radius)-[a-z0-9]+|--panel-padding-x|--section-gap):\s*(\d+)px/g)];
  assert.ok(tokens.length > 10, 'no tokens found in ui.css — the regex has drifted');

  const missing = [];
  const wrong = [];
  tokens.forEach(([, name, px]) => {
    if (skip.has(name)) return;
    // Every line that names the token, not the first: a token appears in prose as well as in its
    // table row, and the prose is where the *reason* lives rather than the number.
    const lines = doc.split('\n').filter((l) => l.includes('`' + name + '`'));
    if (!lines.length) return missing.push(name);
    if (!lines.some((l) => new RegExp('\\b' + px + 'px\\b').test(l))) {
      wrong.push(name + ': ui.css says ' + px + 'px, the reference says ' + lines[0].trim());
    }
  });
  assert.deepEqual(missing, [], 'tokens the reference does not list: ' + missing.join(', '));
  assert.deepEqual(wrong, [], wrong.join('\n'));
});

test('the colour values the documentation states are the ones in ui.css', () => {
  const doc = docBlock();
  // The light values only — the `:root` block. Every colour has a dark-scheme counterpart further
  // down the sheet, and checking the doc's stated hex against both is a test that cannot pass.
  const lightBlock = /:root \{([\s\S]*?)\n      \}/.exec(CSS);
  assert.ok(lightBlock, 'the :root block is not where this test can read it');

  const wrong = [];
  [...lightBlock[1].matchAll(/(--(?:bg|text|border|code|input|active|hover)-[a-z-]+):\s*(#[0-9a-fA-F]{3,8})/g)]
    .forEach(([, name, hex]) => {
      // Listing every colour is not required; the ones listed must be right.
      const rows = doc.split('\n').filter((l) => /^\/\/\s*\|/.test(l) && l.includes('`' + name + '`'));
      if (!rows.length) return;
      if (!rows.some((l) => l.toLowerCase().includes(hex.toLowerCase()))) {
        wrong.push(name + ': ui.css says ' + hex + ', the reference says ' + rows[0].trim());
      }
    });
  assert.deepEqual(wrong, [], wrong.join('\n'));
});

test('the two heading ladders are described as they are actually styled', () => {
  // The bug that prompted the reference. The docs tab and the config form style headings with
  // separate rules, and the reference has to keep them apart — this asserts it says the right thing
  // about each, from the CSS rather than from memory.
  const docsH1 = CSS.match(/\.docs-rendered h1 \{[^}]*font-size: var\((--[a-z-]+)\)/)[1];
  const formH1 = CSS.match(
    /\.config-ui-form--rows \.config-ui-row--heading h1[\s\S]{0,120}?font-size: var\((--[a-z-]+)\)/
  )[1];
  assert.notEqual(docsH1, formH1,
    'the ladders agree now — the reference table needs rewriting, not this test deleting');

  const doc = docBlock();
  // A **table row**, not the first line that happens to mention the syntax — the paragraph explaining
  // why this table exists mentions it too, and matched first.
  const row = doc.split('\n').find(
    (l) => /^\/\/\s*\|/.test(l) && l.includes('`// # Title`') && l.includes('`h1`')
  );
  assert.ok(row, 'the heading ladder table has no `// # Title` row');
  assert.ok(row.includes(docsH1), 'the row does not name the docs tab token ' + docsH1);
  assert.ok(row.includes(formH1), 'the row does not name the config form token ' + formH1);

  // And it says which rule owns which, because that is the sentence that was missing.
  assert.match(doc, /\.docs-rendered h1\|h2\|h3/);
  assert.match(doc, /\.config-ui-form--rows \.config-ui-row--heading\s*\n?\/\/ h1\|h2\|h3/);
});
