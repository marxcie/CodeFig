/**
 * `validatePackageStylesheets` — the two `package.css` build gates from
 * `.plans/30-scoped-stylesheets.md`. Uses temp fixture folders since the repo does not ship a real
 * `package.css` yet (moving the ~312 preview lines out of `src/ui.css` is gated on proving the
 * injector renders correctly with a live plugin, per that plan's own stop gate).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { validatePackageStylesheets } = require('../validate-scripts.js');

function withScripts(layout, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codefig-package-css-'));
  try {
    Object.keys(layout).forEach((relPath) => {
      const full = path.join(dir, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, layout[relPath]);
    });
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a folder with no package.css produces no errors', () => {
  const errors = withScripts({ 'EXAMPLE_SCRIPTS/foo.js': '// nothing' }, (dir) =>
    validatePackageStylesheets(dir));
  assert.deepStrictEqual(errors, []);
});

test('a clean package.css produces no errors', () => {
  const errors = withScripts({
    'EXAMPLE_SCRIPTS/Design System Foundations/package.css': '.color-preview { display: flex; }',
  }, (dir) => validatePackageStylesheets(dir));
  assert.deepStrictEqual(errors, []);
});

test('an unparseable package.css is a build error', () => {
  const errors = withScripts({
    'EXAMPLE_SCRIPTS/Design System Foundations/package.css': '.foo { color: red;',
  }, (dir) => validatePackageStylesheets(dir));
  assert.ok(errors.length > 0);
  assert.strictEqual(errors[0].type, 'package-css');
});

test('a non-data: url() in package.css is a build error', () => {
  const errors = withScripts({
    'EXAMPLE_SCRIPTS/Design System Foundations/package.css':
      '.foo { background-image: url(https://evil.example/a); }',
  }, (dir) => validatePackageStylesheets(dir));
  assert.ok(errors.some((e) => /url\(\)/.test(e.message)));
});

test('position: fixed in package.css is a build error', () => {
  const errors = withScripts({
    'EXAMPLE_SCRIPTS/Design System Foundations/package.css': '.foo { position: fixed; }',
  }, (dir) => validatePackageStylesheets(dir));
  assert.ok(errors.some((e) => /position: fixed/.test(e.message)));
});

test('the same selector in two packages is a build error pointing at ui.css', () => {
  const errors = withScripts({
    'EXAMPLE_SCRIPTS/Design System Foundations/package.css': '.shared-preview { display: flex; }',
    'EXAMPLE_SCRIPTS/Another Package/package.css': '.shared-preview { display: flex; }',
  }, (dir) => validatePackageStylesheets(dir));
  const dup = errors.find((e) => /more than one package/.test(e.message));
  assert.ok(dup, 'expected a cross-package duplicate error');
  assert.match(dup.message, /ui\.css/);
});

test('the same selector twice inside one package is not a cross-package error', () => {
  const errors = withScripts({
    'EXAMPLE_SCRIPTS/Design System Foundations/package.css':
      '.foo { color: red; }\n@media (min-width: 1px) { .foo { color: blue; } }',
  }, (dir) => validatePackageStylesheets(dir));
  assert.deepStrictEqual(errors, []);
});

test('a package.css in an ignored (underscore-prefixed) folder is skipped', () => {
  const errors = withScripts({
    '_STAGING/Draft/package.css': '.foo { position: fixed; }',
  }, (dir) => validatePackageStylesheets(dir));
  assert.deepStrictEqual(errors, []);
});
