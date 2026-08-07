/**
 * The facade the UI calls through is derived, not written down twice.
 *
 * `bridge.js` used to list the parser's functions by hand. Five failures in a row landed in joins
 * like that one, which is an argument about architecture rather than about diligence — a list that
 * exists to be forgotten will be, and a test only tells you after you already forgot. So the
 * bridge now copies whatever `parser.js` exports, and these tests are a backstop rather than the
 * mechanism: they check the derivation still holds and that nothing calls a name that does not
 * exist.
 *
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const bridge = fs.readFileSync(path.join(SRC, 'config-ui', 'bridge.js'), 'utf8');
const ui = fs.readFileSync(path.join(SRC, 'ui.html'), 'utf8');
const parser = require('../src/config-ui/parser.js');

/** Members `bridge.js` defines itself, rather than copying from the parser. */
function ownMembers() {
  const names = new Set();
  const re = /^\s*api\.([A-Za-z_$][\w$]*)\s*=/gm;
  let m;
  while ((m = re.exec(bridge)) !== null) names.add(m[1]);
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

/** The bridge as the UI runs it: a global root, with the renderer and controller stubbed. */
function buildBridge() {
  const root = {
    ConfigUIParser: parser,
    ConfigUIRenderer: {},
    ConfigUIFormController: { createForm: (container, schema, opts) => ({ container, schema, opts }) }
  };
  vm.runInNewContext(bridge, { self: root });
  return root.CodeFigConfigUI;
}

test('the facade is every function the parser exports', () => {
  // The whole point of the change: publishing a function is adding it to the parser's exports,
  // and there is no second place that has to agree.
  const api = buildBridge();
  const exported = Object.keys(parser).filter((k) => typeof parser[k] === 'function');
  for (const name of exported) {
    assert.equal(typeof api[name], 'function', name + ' is exported by the parser but not reachable');
    assert.equal(api[name], parser[name], name + ' is wrapped rather than copied');
  }
});

test('a function added to the parser needs no change here', () => {
  // The seam, tested by making the mistake that used to be possible: a new export with no
  // forwarder written for it.
  const root = {
    ConfigUIParser: Object.assign({}, parser, { somethingNewlyAdded: () => 'ok' }),
    ConfigUIRenderer: {},
    ConfigUIFormController: { createForm: () => ({}) }
  };
  vm.runInNewContext(bridge, { self: root });
  assert.equal(root.CodeFigConfigUI.somethingNewlyAdded(), 'ok');
});

test('render refuses to build a form with nowhere to put it', () => {
  const api = buildBridge();
  assert.throws(() => api.render({}, {}), /container is required/);
  assert.equal(api.render({}, { container: 'x' }).container, 'x');
});

test('the bridge copies the parser rather than listing it', () => {
  // The property that makes the seam gone rather than watched: no per-function forwarder.
  assert.match(bridge, /for \(var name in P\)/, 'the facade is no longer derived from the parser');
  assert.equal(/return P\.[A-Za-z_$][\w$]*\(/.test(bridge), false,
    'a hand-written forwarder is back — that list is what caused the import failure');
});

test('every CodeFigConfigUI call in the UI resolves to something real', () => {
  const own = ownMembers();
  const missing = [...uiCalls()].filter(
    (name) => !own.has(name) && typeof parser[name] !== 'function'
  );
  assert.deepEqual(missing, [],
    'ui.html calls these, and neither the parser nor the bridge provides them: ' + missing.join(', '));
});

test('the two functions whose absence caused the import failure are reachable', () => {
  // Not because they are special, but because the derivation is what makes them reachable and
  // this is the case that proves it rather than asserting it in the abstract.
  assert.equal(typeof parser.fillConfigBlock, 'function');
  assert.equal(typeof parser.parseConfigBlockObject, 'function');
  assert.equal(ownMembers().has('fillConfigBlock'), false, 'copied, not listed');
});

test('render is the one member the bridge builds itself', () => {
  assert.deepEqual([...ownMembers()], ['render'],
    'anything else defined here is a forwarder in disguise, and belongs in the parser');
});
