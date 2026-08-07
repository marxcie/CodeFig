/**
 * Everything the UI reaches for through `CodeFigConfigUI` has to be on the bridge.
 *
 * `bridge.js` is a hand-written allow-list of forwarders onto `window.CodeFigConfigUI`. Adding a
 * function to `parser.js` and calling it from `ui.html` is not enough — if nobody adds the third
 * line, the call is `undefined` at run time and the failure surfaces as whatever the caller's
 * fallback says. That is exactly how "could not read the config this file holds" came to be
 * reported for a block that parses perfectly: `fillConfigBlock` was never on the list.
 *
 * A facade is worth keeping — it is the one place that says what the UI may touch. What is not
 * worth keeping is the facade and its callers disagreeing silently, so this compares them.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const bridge = fs.readFileSync(path.join(SRC, 'config-ui', 'bridge.js'), 'utf8');
const ui = fs.readFileSync(path.join(SRC, 'ui.html'), 'utf8');
const parser = require('../src/config-ui/parser.js');

/** The keys `bridge.js` puts on `CodeFigConfigUI`. */
function bridgeSurface() {
  const body = bridge.slice(bridge.indexOf('root.CodeFigConfigUI = {'));
  const names = new Set();
  const re = /^\s{4}([A-Za-z_$][\w$]*):\s*function/gm;
  let m;
  while ((m = re.exec(body)) !== null) names.add(m[1]);
  return names;
}

/** Every `CodeFigConfigUI.foo` the UI calls. */
function uiCalls() {
  const names = new Set();
  const re = /CodeFigConfigUI\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(ui)) !== null) names.add(m[1]);
  return names;
}

test('every CodeFigConfigUI call in the UI is on the bridge', () => {
  const surface = bridgeSurface();
  const missing = [...uiCalls()].filter((name) => !surface.has(name));
  assert.deepEqual(missing, [],
    'ui.html calls these, and bridge.js does not forward them: ' + missing.join(', '));
});

test('the bridge only forwards functions the parser actually has', () => {
  // The other direction: a forwarder for a function that was renamed away throws on call rather
  // than being absent, which is harder to read than a missing key.
  const own = ['parse', 'serialize', 'createForm', 'render'];
  const missing = [...bridgeSurface()].filter(
    (name) => !own.includes(name) && typeof parser[name] !== 'function'
  );
  assert.deepEqual(missing, [],
    'bridge.js forwards these, and parser.js does not export them: ' + missing.join(', '));
});

test('the two functions whose absence caused the import failure are reachable', () => {
  const surface = bridgeSurface();
  assert.ok(surface.has('fillConfigBlock'));
  assert.ok(surface.has('parseConfigBlockObject'));
});
