/**
 * `validatePackageImportCollisions` — the collision gate `.plans/32-packages.md` calls for
 * explicitly: a package member name that also resolves outside the package must fail the build,
 * not silently prefer the package member. A no-op today (no shipped script has a `packageId`),
 * so exercised here against synthetic script objects.
 */
const test = require('node:test');
const assert = require('node:assert');

const { validatePackageImportCollisions } = require('../validate-scripts.js');

function script(name, packageId) {
  return { name: name, filename: name.replace(/[^\w]/g, '') + '.js', code: 'function f() {}', packageId: packageId };
}

test('no packages present is a no-op', () => {
  assert.deepStrictEqual(validatePackageImportCollisions([script('@Core Library')]), []);
});

test('a package member with no name collision outside is fine', () => {
  const scripts = [
    script('@Foundation', 'design-system'),
    script('@Core Library'),
  ];
  assert.deepStrictEqual(validatePackageImportCollisions(scripts), []);
});

test('an exact-name collision with a global script is an error', () => {
  const scripts = [
    script('@Helpers', 'design-system'),
    script('@Helpers'),
  ];
  const errors = validatePackageImportCollisions(scripts);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].message, /"@Helpers" is a member of package "design-system"/);
});

test('two members of the same package do not collide with each other', () => {
  const scripts = [
    script('@Foundation', 'design-system'),
    script('@Helpers', 'design-system'),
  ];
  assert.deepStrictEqual(validatePackageImportCollisions(scripts), []);
});

test('a fuzzy match ("Utility Scripts / Foo" vs "Foo") is still a collision', () => {
  const scripts = [
    script('Foo', 'design-system'),
    script('Utility Scripts / Foo'),
  ];
  const errors = validatePackageImportCollisions(scripts);
  assert.strictEqual(errors.length, 1);
});

test('two separate packages sharing a name each collide with the other', () => {
  const scripts = [
    script('@Shared', 'package-a'),
    script('@Shared', 'package-b'),
  ];
  const errors = validatePackageImportCollisions(scripts);
  assert.strictEqual(errors.length, 2);
});
