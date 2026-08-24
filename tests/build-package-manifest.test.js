/**
 * `compilePackageManifest` — steps 1–2 of `.plans/32-packages.md`. Not wired into a real build
 * yet (see that file's Status note), so tested against synthetic script lists.
 */
const test = require('node:test');
const assert = require('node:assert');

const { compilePackageManifest } = require('../build-package-manifest.js');

test('builds the shape from the plan: scripts, libraries, a stylesheet', () => {
  const allScripts = [
    { name: 'Colors' }, { name: 'Spacing' },
    { name: '@Foundation' }, { name: '@OKLCH' },
    { name: '@Core Library' }, // a global library, not part of this package
  ];
  const result = compilePackageManifest(
    'design-system-foundations', 'Design System Foundations',
    [{ name: 'Colors' }, { name: 'Spacing' }],
    ['@Foundation', '@OKLCH'],
    allScripts,
    'package.css'
  );
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.manifest, {
    id: 'design-system-foundations',
    name: 'Design System Foundations',
    members: [
      { kind: 'script', name: 'Colors', visibility: 'public' },
      { kind: 'script', name: 'Spacing', visibility: 'public' },
      { kind: 'library', name: '@Foundation', visibility: 'package' },
      { kind: 'library', name: '@OKLCH', visibility: 'package' },
      { kind: 'stylesheet', name: 'package.css' },
    ],
  });
});

test('a library name that does not resolve to a real script is an error, not a silent member', () => {
  const result = compilePackageManifest(
    'design-system-foundations', 'Design System Foundations',
    [], ['@Nonexistent'], [{ name: '@Foundation' }]
  );
  assert.strictEqual(result.ok, false);
  assert.match(result.errors[0], /@Nonexistent/);
});

test('no stylesheet name means no stylesheet member', () => {
  const result = compilePackageManifest('p', 'P', [], [], []);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.manifest.members, []);
});

test('a global library (@Core Library) is never implicitly a member', () => {
  const allScripts = [{ name: 'Colors' }, { name: '@Core Library' }];
  const result = compilePackageManifest(
    'design-system-foundations', 'Design System Foundations',
    [{ name: 'Colors' }], [], allScripts
  );
  assert.strictEqual(result.ok, true);
  assert.ok(!result.manifest.members.some((m) => m.name === '@Core Library'));
});

test('a short library name resolves against a category-prefixed display name, the real shape', () => {
  // The bug this pins: findAllScripts reports "CodeFig Libraries / @Foundation", not "@Foundation"
  // — an exact-string lookup against the short name a script's own @import line would use found
  // nothing against real data. Caught before shipping by running this against the actual repo.
  const allScripts = [{ name: 'CodeFig Libraries / @Foundation' }];
  const result = compilePackageManifest('p', 'P', [], ['@Foundation'], allScripts);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.manifest.members, [
    { kind: 'library', name: 'CodeFig Libraries / @Foundation', visibility: 'package' },
  ]);
});

test('missing id or name is an error', () => {
  assert.strictEqual(compilePackageManifest('', 'P', [], [], []).ok, false);
  assert.strictEqual(compilePackageManifest('p', '', [], [], []).ok, false);
});
