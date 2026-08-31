/**
 * dist/code.js must load sibling modules through `__codefigMainRequire`, not Node
 * `require`. Figma's JSVM has no require; a bare `tsc` overwrite without the build
 * shim is how boot logged "require is not defined" while the UI still looked fine.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const codePath = path.join(__dirname, '..', 'dist', 'code.js');
const { inlineMainRequireShim } = require('../build-scripts.js');

test('src/code.ts calls __codefigMainRequire, not require, for siblings', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'code.ts'), 'utf8');
  assert.match(src, /__codefigMainRequire\s*\(\s*['"]\.\/foundation-maintain['"]\s*\)/);
  assert.match(src, /__codefigMainRequire\s*\(\s*['"]\.\/script-storage['"]\s*\)/);
  assert.doesNotMatch(src, /\brequire\s*\(\s*['"]\.\/foundation-maintain['"]\s*\)/);
  assert.doesNotMatch(src, /\brequire\s*\(\s*['"]\.\/script-storage['"]\s*\)/);
});

test('dist/code.js (when present) has shim and no bare sibling require', () => {
  if (!fs.existsSync(codePath)) {
    // Fresh checkout before first build — skip rather than fail CI order.
    return;
  }
  // Repair a stray bare-tsc overwrite the same way build:dev does.
  inlineMainRequireShim();
  const code = fs.readFileSync(codePath, 'utf8');
  assert.match(
    code,
    /\/\* CodeFig: Figma main has no Node require/,
    'shim marker missing — ran tsc without build-scripts.js?'
  );
  assert.match(code, /var __codefigMainRequire\s*=/);
  assert.match(code, /__codefigMainRequire\s*\(\s*['"]\.\/foundation-maintain['"]\s*\)/);
  assert.doesNotMatch(
    code,
    /\brequire\s*\(\s*['"]\.\/(foundation-maintain|script-storage)['"]\s*\)/
  );
});

test('shim loads foundation-maintain and script-storage in a sandbox', () => {
  assert.ok(fs.existsSync(codePath), 'dist/code.js missing — run build:dev first');
  inlineMainRequireShim();
  const code = fs.readFileSync(codePath, 'utf8');
  const endMarker = '/* CodeFig: end main-require shim */';
  const endAt = code.indexOf(endMarker);
  assert.ok(endAt > 0, 'expected shim end marker');
  const shim = code.slice(0, endAt + endMarker.length);
  const sandbox = {};
  vm.runInNewContext(shim, sandbox);
  assert.equal(typeof sandbox.__codefigMainRequire, 'function');
  const maintain = sandbox.__codefigMainRequire('./foundation-maintain');
  assert.equal(typeof maintain.runFoundationMaintain, 'function');
  const storage = sandbox.__codefigMainRequire('./script-storage');
  assert.equal(storage.COLLECTION_NAME, 'CodeFig Scripts');
});

test('shim is idempotent — a second pass does not nest factories', () => {
  assert.ok(fs.existsSync(codePath), 'dist/code.js missing — run build:dev first');
  inlineMainRequireShim();
  const once = fs.readFileSync(codePath, 'utf8');
  inlineMainRequireShim();
  const twice = fs.readFileSync(codePath, 'utf8');
  assert.equal(once, twice);
  assert.equal(
    (twice.match(/\/\* CodeFig: Figma main has no Node require/g) || []).length,
    1
  );
});
