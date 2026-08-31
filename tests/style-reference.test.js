/**
 * The Style & UI reference — the `## Style & UI reference` section and the `@UI_CONFIG` specimen shelf
 * in `scripts/HELP/help-documentation.js`, plus the generated `artifacts/style-reference.html`.
 *
 * Its whole value is being trustworthy: it gets quoted, and a wrong entry is worse than a missing one.
 * So it is checked the way the rest of this repo checks agreements — by deriving one side from the
 * other rather than asserting a copy.
 *
 * Three properties:
 *   1. **Coverage.** Every control the renderer can build appears in the reference's own config block,
 *      and every marker row the parser emits is demonstrated. A new control that nobody can see is
 *      the failure this file exists to make loud, because the heading bug that prompted the reference
 *      was invisible for exactly that reason.
 *   2. **Correctness.** Every token value the documentation states is read back out of `src/ui.css`.
 *      Changing a token now fails here until the reference is updated.
 *   3. **Freshness.** The HTML page is generated, so it cannot be wrong — only stale. That is a
 *      comparison against a fresh build, not an assertion about its contents.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// The reference lives **inside** `@Help & documentation` rather than beside it: one Help script, its
// Documentation tab holding the values and its Configuration UI tab holding the live specimens.
const HELP = path.join(root, 'scripts', 'HELP', 'help-documentation.js');
const REF = fs.readFileSync(HELP, 'utf8');
const CSS = fs.readFileSync(path.join(root, 'src', 'ui.css'), 'utf8');
const RENDERER = fs.readFileSync(path.join(root, 'src', 'config-ui', 'renderer.js'), 'utf8');
const PARSER_SRC = fs.readFileSync(path.join(root, 'src', 'config-ui', 'parser.js'), 'utf8');
const parser = require('../src/config-ui/parser.js');

/**
 * A section, extracted the way `extractSection` in `src/ui.html` extracts it: **line-anchored**
 * markers.
 *
 * Not a stylistic choice. This file talks *about* the markers, so `// @DOC_END` appears in its own
 * prose — and a lazy `[\s\S]*?` stopped there, handing back nine lines and reporting that the
 * reference listed no tokens at all. The plugin was never fooled, because its extractor requires the
 * marker to be the whole line. Matching it here is the difference between testing the file and
 * testing a regex.
 */
function section(startMarker, endMarker) {
  const start = new RegExp('^\\s*//\\s*' + startMarker + '\\s*$', 'm').exec(REF);
  const end = new RegExp('^\\s*//\\s*' + endMarker + '\\s*$', 'm').exec(REF);
  assert.ok(start && end && end.index > start.index,
    'the reference has no ' + startMarker + ' … ' + endMarker + ' block');
  return REF.slice(start.index + start[0].length, end.index);
}

/** The block as the UI extracts it: comment rows keep their `//`, field lines are live JS. */
function configBlock() {
  return section('@UI_CONFIG_START', '@UI_CONFIG_END').replace(/^\n/, '');
}

function panelBlock() {
  return section('@PANEL_START', '@PANEL_END').replace(/^\n/, '');
}

function docBlock() {
  return section('@DOC_START', '@DOC_END');
}

const SCHEMA = parser.parse(configBlock(), panelBlock());
assert.ok(!SCHEMA.error, 'help panel parse error: ' + SCHEMA.error);
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
  //   blank / lineBreak — old-format spacer comments (`//` / wrap). `@PANEL_START` has no blank
  //     block; paragraph fold direction is `attachTo` instead. Documented under Not in here.
  const exempt = new Set(['preview', 'suggestions', 'directive', 'unparsed', 'blank', 'lineBreak']);

  const missing = [...emitted].filter((t) => !ROW_TYPES.has(t) && !exempt.has(t));
  assert.deepEqual(missing, [],
    'the parser emits these row types and the reference shows none of them: ' + missing.join(', '));

  // And the exemptions are documented rather than silent.
  const doc = docBlock();
  assert.match(doc, /Not in here, on purpose/);
  assert.match(doc, /@preview` and `@suggestions/);
  assert.match(doc, /blank|lineBreak|attachTo/);
});

test('the reference reaches the plugin: it ships and it parses', () => {
  // A `_`-prefixed file or a parse error would make it invisible — the same failure it documents.
  assert.equal(path.basename(HELP).startsWith('_'), false);
  assert.doesNotThrow(() => new Function('figma', 'console', 'window', REF),
    'the reference does not parse the way the sandbox parses it');
  assert.match(REF, /## Style & UI reference/, 'the documentation section is gone');
  assert.match(REF, /^\/\/ @UI_CONFIG_START$/m, 'the specimen block is gone');
  assert.match(REF, /^\/\/ @PANEL_START$/m, 'the panel spec block is gone');

  // `hasSection` is an `indexOf`, so this file's *prose* about `// @UI_CONFIG_START` already made the
  // plugin think it had a config block. `extractSection` is line-anchored, so extraction is not
  // fooled — the block below is what gets read, and the mention above it stays inert.
  const anchored = /^\s*\/\/\s*@UI_CONFIG_START\s*$/m.exec(REF);
  const prose = REF.indexOf('**// @UI_CONFIG_START**');
  assert.ok(prose !== -1 && anchored && anchored.index > prose,
    'the prose mention now comes after the real marker, which changes which one extraction finds');
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

test('the one heading ladder is described as it is actually styled', () => {
  // The bug that prompted the reference: the docs tab and the config form styled the same markdown
  // with separate rules, and the reference had to keep two ladders apart. They are one ladder now, so
  // this asserts the *agreement* — read off the CSS rather than from memory, in case a future edit
  // splits them again and updates only the prose.
  //
  // The shared rule names both surfaces in one selector list, which is what makes a single match here
  // sufficient: there is no second place a heading size can come from.
  const ladder = ['h1', 'h2', 'h3'].map((tag) => {
    const rule = CSS.match(new RegExp(
      '\\.docs-rendered ' + tag + ',\\s*\\n\\s*' + tag +
      '\\.config-ui-heading \\{[^}]*font-size: var\\((--[a-z-]+)\\)'
    ));
    assert.ok(rule,
      tag + ' has no shared ladder rule — the Documentation tab and the config form have drifted ' +
      'apart again, and the reference table needs rewriting rather than this test deleting');
    return { tag, token: rule[1] };
  });

  // Distinct sizes, or it is not a ladder.
  const tokens = ladder.map((l) => l.token);
  assert.equal(new Set(tokens).size, tokens.length, 'two levels share a token: ' + tokens.join(', '));

  const doc = docBlock();
  // **Table rows**, not the first line that happens to mention the syntax — the paragraph explaining
  // why the table exists mentions it too, and matched first.
  const syntax = { h1: '`// # Title`', h2: '`// ## Title`', h3: '`// ### Title`' };
  ladder.forEach(({ tag, token }) => {
    const row = doc.split('\n').find(
      (l) => /^\/\/\s*\|/.test(l) && l.includes(syntax[tag]) && l.includes('`' + tag + '`')
    );
    assert.ok(row, 'the heading ladder table has no ' + syntax[tag] + ' row');
    assert.ok(row.includes(token),
      'the ' + tag + ' row does not name the token the CSS uses, ' + token + ': ' + row.trim());
  });

  // And it names the shared rule, because "which rule owns this" is the sentence that was missing.
  assert.match(doc, /`\.docs-rendered h1, h1\.config-ui-heading`/);

  // The document title is the one size above the ladder, and the reference has to say so — it is why
  // a script's DOC and config blocks no longer open with their own name.
  assert.match(doc, /--font-size-display[^\n]*document title/);
});

test('the committed HTML page is not stale', () => {
  // The page is built by the renderer from the config block and by reading ui.css, so it cannot
  // disagree with them — it can only be an older build of them. Comparing to a fresh one covers every
  // input at once: a new control, a renamed class, a changed token, an edited specimen.
  //
  // This is also the only place in the suite that **executes** `renderer.js` rather than reading it as
  // text. `if (field.tabs) return;` in a function with no `field` in scope killed every form in the
  // plugin while every renderer test passed, because they all grep. A crash here is that bug.
  const { buildPage, OUT } = require('../build-style-reference.js');
  const fresh = buildPage();
  const committed = fs.readFileSync(OUT, 'utf8');
  assert.equal(fresh, committed,
    'artifacts/style-reference.html is out of date — run `npm run build:style-reference`');
});
