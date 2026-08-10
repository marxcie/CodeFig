/**
 * The CLI's command list and the plugin's handler must agree.
 *
 * They run in different processes and cannot share a module: `figma-ui.js` is Node, the handler
 * lives in the iframe. So there are two lists — the shape that has produced five bugs here, most
 * recently `bridge.js` forwarding a hand-written set of names and missing two, which surfaced as
 * "could not read the config this file holds" about a config that parsed perfectly.
 *
 * Where the duplication cannot be removed, it gets compared.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { COMMANDS } = require('../figma-ui.js');
const UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');

/** The names `_codefigUiCommandNames()` declares. */
function declaredInUi() {
  const fn = UI.match(/function _codefigUiCommandNames\(\) \{[\s\S]*?\n      \}/);
  assert.ok(fn, '_codefigUiCommandNames not found — did it get renamed?');
  return (fn[0].match(/'([A-Za-z]+)'/g) || []).map((q) => q.slice(1, -1));
}

/** The names `handleUiCommand`'s switch actually implements. */
function implementedInUi() {
  const start = UI.indexOf('function handleUiCommand(');
  assert.notEqual(start, -1, 'handleUiCommand not found');
  const end = UI.indexOf('function _codefigUiReport', start);
  const body = UI.slice(start, end);
  return (body.match(/^\s+case '([A-Za-z]+)'/gm) || [])
    .map((line) => line.match(/'([A-Za-z]+)'/)[1]);
}

test('every command the CLI offers is implemented in the plugin', () => {
  const missing = Object.keys(COMMANDS).filter((name) => implementedInUi().indexOf(name) === -1);
  assert.deepEqual(missing, [],
    'figma-ui.js offers these and handleUiCommand has no case for them: ' + missing.join(', '));
});

test('every command the plugin implements is reachable from the CLI', () => {
  // The other direction. A handler nobody can call is dead code that looks like coverage.
  const unreachable = implementedInUi().filter(
    (name) => !Object.prototype.hasOwnProperty.call(COMMANDS, name)
  );
  assert.deepEqual(unreachable, [],
    'handleUiCommand implements these and figma-ui.js cannot send them: ' + unreachable.join(', '));
});

test('the declared list matches what is implemented', () => {
  // `_codefigUiCommandNames()` is what an unknown-command error prints. A name listed there but
  // not implemented would appear in the suggestion and then fail.
  assert.deepEqual(declaredInUi().slice().sort(), implementedInUi().slice().sort());
});

test('the unknown-command path throws rather than reporting success', () => {
  // A channel that quietly ignored a name would report ok:true and an empty answer, which reads
  // as "the UI did that and had nothing to say".
  const start = UI.indexOf('function handleUiCommand(');
  const body = UI.slice(start, UI.indexOf('function _codefigUiReport', start));
  assert.match(body, /default:\s*\n\s*throw new Error\('Unknown UI command/);
});

test('there is no way to send code for the iframe to evaluate', () => {
  // Named, not evaluated. An eval command would be a strictly larger hole for no extra reach,
  // and it would make the dev-only guard the only thing between a page and the plugin's DOM.
  for (const name of Object.keys(COMMANDS)) {
    assert.equal(/eval|run.*code|exec/i.test(name), false, 'suspicious command name: ' + name);
  }
  const start = UI.indexOf('function handleUiCommand(');
  const body = UI.slice(start, UI.indexOf('function _codefigUiReport', start));
  assert.equal(body.indexOf('eval('), -1, 'handleUiCommand must never evaluate its argument');
  assert.equal(body.indexOf('new Function'), -1, 'nor build a function from it');
});
