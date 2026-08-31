/**
 * `spacing-{1,10}` — a series of token names from one field.
 *
 * Márton: *"I still need the N series generation for the tokens. Eg. spacing-0, spacing-px,
 * spacing-{%10}. It doesn't need to use the exact same term, Figma uses $nn for number, I leave that to
 * you."*
 *
 * **The spelling is `{from,to}`**, because it is the one already written down twice in his own designs —
 * `spacing-{1,10}` in the Tokens helper he wrote and `heading-{1,6}` in the Typography frame — and a
 * second syntax for the same idea is a thing to remember for no gain. `{10}` is shorthand for `{1,10}`.
 *
 * Taking the range from what is written rather than from a separate count buys two things that a `{%10}`
 * count cannot: it counts **down** as readily as up, and a written leading zero is a **width**.
 *
 * The one real trap: this project already uses braces for `{$step}` name templates, so a series is
 * numbers only. `{$step}` and `{brand}` are not series and must not warn about it.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const LIB = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');

function load() {
  const foundation = fs.readFileSync(path.join(LIB, '@foundation.js'), 'utf8');
  const ramp = fs.readFileSync(path.join(LIB, '@linear-ramp.js'), 'utf8');
  return new Function('figma', 'console', 'window',
    foundation + '\n' + ramp +
    '; return { expandTokenTerm: expandTokenTerm, expandTokenList: expandTokenList,' +
    ' tokenListHasSeries: tokenListHasSeries, materialiseRampTokens: materialiseRampTokens,' +
    ' spacingRampSpec: spacingRampSpec };'
  )({}, console, {});
}

const F = load();

test('a range names every step in it', () => {
  assert.deepEqual(F.expandTokenTerm('spacing-{1,4}'),
    ['spacing-1', 'spacing-2', 'spacing-3', 'spacing-4']);
  assert.deepEqual(F.expandTokenTerm('{1,3}'), ['1', '2', '3'], 'the prefix is optional');
  assert.deepEqual(F.expandTokenTerm('size-{2,4}-x'), ['size-2-x', 'size-3-x', 'size-4-x'],
    'and the number can sit in the middle');
});

test('one number is a count from 1', () => {
  assert.deepEqual(F.expandTokenTerm('spacing-{3}'), ['spacing-1', 'spacing-2', 'spacing-3']);
});

test('it counts down, which is how a heading ramp gets named smallest to largest', () => {
  // `heading-{6,1}` is heading-6 … heading-1: the Typography frame's own naming, without anyone having
  // to write a reversed list by hand.
  assert.deepEqual(F.expandTokenTerm('heading-{6,4}'), ['heading-6', 'heading-5', 'heading-4']);
});

test('a written leading zero is a width, so the names sort the way they read', () => {
  // `spacing-1 … spacing-10` sorts 1, 10, 2 in Figma's variable list. `{01,10}` is the fix, and it is
  // requested by writing it rather than by a flag.
  const padded = F.expandTokenTerm('spacing-{01,10}');
  assert.equal(padded[0], 'spacing-01');
  assert.equal(padded[9], 'spacing-10');
  assert.equal(padded.length, 10);
});

test('a brace that is not a number is a name, and says nothing about it', () => {
  // `{$step}` is this project's existing name template, resolved with `steps` by `materialiseRampTokens`
  // — reaching it here would turn a template into a literal and a working config into ten copies of one
  // name. `{brand}` is somebody's token. Neither is a series; neither is a mistake to warn about.
  assert.deepEqual(F.expandTokenTerm('spacings-{$step}'), ['spacings-{$step}']);
  assert.deepEqual(F.expandTokenTerm('{brand}-md'), ['{brand}-md']);
  assert.equal(F.tokenListHasSeries(['spacings-{$step}']), false);
  assert.equal(F.tokenListHasSeries(['spacing-{1,10}']), true);
});

test('a list mixes literal names with a series, which is the case the helper promises', () => {
  assert.deepEqual(F.expandTokenList('none, px, spacing-{1,3}'),
    ['none', 'px', 'spacing-1', 'spacing-2', 'spacing-3']);
  // The same answer from the array the config holds and from the one line of text the field is —
  // otherwise a config means something different after a round trip through the form.
  assert.deepEqual(F.expandTokenList(['none', 'px', 'spacing-{1,3}']),
    F.expandTokenList('none, px, spacing-{1,3}'));
  assert.deepEqual(F.expandTokenList(['none, px', 'spacing-{1,3}']),
    F.expandTokenList('none, px, spacing-{1,3}'), 'and from one cell holding two names');
});

test('nothing without a series is touched', () => {
  const plain = ['px', 'xs', 'sm', 'md'];
  assert.deepEqual(F.expandTokenList(plain), plain);
  assert.equal(F.tokenListHasSeries(plain), false);
  assert.deepEqual(F.expandTokenList(null), []);
  assert.deepEqual(F.expandTokenList(7), [], 'and a number is not a token list');
});

test('the generator expands the series before it counts steps', () => {
  // The point of doing it here: `steps` is not involved. The range says how many, so there is no second
  // field to keep in agreement with the first — which is what `steps` + a name template needs.
  const spec = F.spacingRampSpec();
  const config = { spacings: ['none', 'spacing-{1,4}'] };
  F.materialiseRampTokens(config, spec);
  assert.deepEqual(config.spacings, ['none', 'spacing-1', 'spacing-2', 'spacing-3', 'spacing-4']);

  const typed = { spacings: 'none, spacing-{1,3}' };
  F.materialiseRampTokens(typed, spec);
  assert.deepEqual(typed.spacings, ['none', 'spacing-1', 'spacing-2', 'spacing-3']);
});

test('the name template still needs its steps, and still works', () => {
  // The older mechanism, untouched: `{$step}` is not a series, so it falls through to the template path.
  const spec = F.spacingRampSpec();
  const config = { spacings: 'spacings-{$step}', steps: 3 };
  F.materialiseRampTokens(config, spec);
  assert.deepEqual(config.spacings, ['spacings-1', 'spacings-2', 'spacings-3']);
});

test('the field and the generator split a list the same way', () => {
  // Two implementations, because they run in different places: `textToList` is the iframe's parser and
  // `expandTokenList` is a sandbox library. They cannot import each other, so the seam gets pinned
  // instead: whatever the user types into Tokens has to survive the field and mean the same thing to
  // the generator. It did not — a plain `split(",")` in the field cut `spacing-{1,10}` in half, and two
  // halves of a range read as two perfectly ordinary token names.
  const P = require('../src/config-ui/parser.js');
  [
    'none, px, spacing-{1,10}',
    'spacing-{1,4}',
    'a, b, c',
    'heading-{6,1}',
  ].forEach((typed) => {
    assert.deepEqual(
      F.expandTokenList(P.textToList(typed)).map(String),
      F.expandTokenList(typed).map(String),
      typed + ' means the same through the field as it does typed straight into the config'
    );
  });
});

test('the Spacing panel tells the reader the series exists', () => {
  // A syntax nobody is told about is a syntax nobody uses. The helper is the only place it appears.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'spacing.js'),
    'utf8'
  );
  const P = require('../src/config-ui/parser.js');
  const config = /@CONFIG_START\n([\s\S]*?)\n\s*\/\/ @CONFIG_END/.exec(source)[1];
  const panel = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(source)[1];
  const schema = P.parse(config, panel);
  const tokens = schema.rows.filter((r) => r.type === 'field' && r.name === 'spacings')[0];
  assert.ok(tokens, 'the Tokens field is still there');
  assert.match(tokens.helper || '', /\{1,10\}/, 'and its helper shows the series form');
});
