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

// ---------------------------------------------------------------------------
// The two commands that change things
// ---------------------------------------------------------------------------

/** The body of one `case` in handleUiCommand. */
function commandBody(name) {
  const start = UI.indexOf("case '" + name + "':");
  assert.notEqual(start, -1, 'no case for ' + name);
  const end = UI.indexOf("case '", start + 10);
  return UI.slice(start, end === -1 ? start + 4000 : end);
}

test('setField goes through the real event path, never a handler', () => {
  // A command that called `getValues` or an onChange directly would pass while the control stayed
  // broken, which is the whole reason these dispatch what a keystroke does
  // and let the existing listeners run.
  const body = commandBody('setField');
  assert.match(body, /dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(body, /dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
  assert.equal(body.indexOf('getValues('), -1, 'setField must not collect values itself');
  assert.equal(body.indexOf('syncUIToCode('), -1, 'nor call the handler the listeners call');
  assert.equal(body.indexOf('configUIInstance.setValues'), -1, 'nor set values behind the form');
});

test('clickControl dispatches a real click, and only on parts of a config control', () => {
  const body = commandBody('clickControl');
  assert.match(body, /dispatchEvent\(new MouseEvent\('click', \{ bubbles: true, cancelable: true \}\)\)/);
  // The membership of the list is asserted below, on its own. Here: that there *is* one.
  assert.match(body, /\]\.indexOf\(a\.part\) === -1/, 'the allowed parts are a closed list');
});

test('no command can reach Run, or anything else that writes to the document', () => {
  // The one real cost of widening the channel. A UI click on Run would bypass the codefig-test
  // filename guard `figma:run` carries — which is the only thing between a command and someone's
  // real document — so Run is not addressable at all rather than guarded twice.
  const start = UI.indexOf('function handleUiCommand(');
  const body = UI.slice(start, UI.indexOf('function _codefigUiReport', start));
  for (const forbidden of ['runBtn', 'runScript(', "post('RUN'", 'executeScript(']) {
    assert.equal(body.indexOf(forbidden), -1,
      'handleUiCommand references ' + forbidden + ' — a command must not be able to start a run');
  }
});

test('controls are addressed by name and identity, never by a selector from outside', () => {
  // A selector channel is a short step from an eval channel: it would let a command act on something
  // the UI does not regard as a control, Run included.
  const fn = UI.match(/function uiControlTarget\(name, part, index\)[\s\S]*?\n      \}/);
  assert.ok(fn, 'uiControlTarget not found');
  assert.equal(/querySelector\((?!['"])/.test(fn[0]), false,
    'a selector is being built from something other than a literal');
  assert.match(fn[0], /data-rows-field="' \+ name \+ '"/);
  assert.match(fn[0], /data-field="' \+ name \+ '"/);

  const setField = commandBody('setField');
  assert.equal(setField.indexOf('a.selector'), -1, 'no selector argument');
  assert.equal(setField.indexOf('querySelector'), -1, 'and no selecting of its own');
});

test('both commands wait for the change to land before answering', () => {
  // Otherwise a read straight after a write observes the state before the edit reached the config.
  for (const name of ['setField', 'clickControl']) {
    assert.match(commandBody(name), /return actAndSettle\(/, name + ' does not wait');
  }
  assert.match(UI, /function actAndSettle\(action\)/);
  // The settle point is the same one the form's own change path ends at.
  assert.match(UI, /\} finally \{\s*\n\s*\/\/[\s\S]{0,200}_codefigUiSettle\(\);/);
});

test('an index is coerced, and a bad one is refused rather than becoming zero', () => {
  // `index=1` reaches the plugin as the string "1". `typeof index === 'number' ? index : 0` sent it to
  // index 0, so a bridge-driven rename edited the *first* chip and reported success — a verification
  // that passes while doing the wrong thing is worse than one that fails. On `chip-remove` the same
  // slip would remove the wrong mode, and removals reach the document.
  const fn = UI.match(/function uiControlTarget\(name, part, index\)[\s\S]*?\n      \}/)[0];
  assert.equal(/typeof index === 'number' \? index : 0/.test(fn), false,
    'a string index is silently becoming 0 again');
  assert.match(fn, /at = Number\(index\)/);
  assert.match(fn, /throw new Error\('index must be a whole number/,
    'and a nonsense index is refused, not defaulted');
});

test('clickControl still cannot reach anything but a config control', () => {
  // The allow-list gained `chip-remove` when the mode chips became drivable. It must stay an
  // allow-list: the moment a part name is accepted because it is not recognised, this channel can
  // press things the UI does not regard as config — Run included.
  const body = commandBody('clickControl');
  const list = body.match(/\[([^\]]*)\]\.indexOf\(a\.part\) === -1/);
  assert.ok(list, 'the allow-list is gone — clickControl is accepting any part');
  const parts = list[1].split(',').map((p) => p.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(parts.slice().sort(), ['add', 'card', 'chip-remove', 'remove', 'tab'],
    'a part was added to the allow-list without being considered here');
  // `card` is a suggestion card. It applies margin and gap to the mode on screen — a config edit, the
  // same class as typing in the fields — and it cannot reach a run.
});

test('dragControl is an allow-list of exactly the curve editor\'s own draggable pieces', () => {
  const body = commandBody('dragControl');
  const guard = body.match(/if \(!(\/[^/]*\/)\.test\(String\(a\.part \|\| ''\)\)\) \{/);
  assert.ok(guard, 'the allow-list regex is gone — dragControl is accepting any part');
  const re = new RegExp(guard[1].slice(1, -1));
  ['zoom', 'end-from', 'end-to', 'handle-0', 'handle-9'].forEach((ok) => {
    assert.ok(re.test('curve:' + ok), '"' + ok + '" should be draggable and the allow-list rejects it');
  });
  // Nothing that is not one of the curve editor's own pieces — the same reason `clickControl`'s
  // allow-list stays one: a part accepted because it was not recognised is a part that can eventually
  // reach Run.
  ['add', 'remove', 'tab', 'chip-remove', 'card', 'shape', 'middle', 'handle', 'handle-'].forEach((bad) => {
    assert.ok(!re.test('curve:' + bad), '"' + bad + '" should not be draggable but the allow-list accepts it');
  });
});

test('dragControl reports the rect it measured and the curve state after, not just success', () => {
  // A drag that lands nowhere and a drag that was never dispatched onto real geometry look identical
  // from `{ settled }` alone — this is what turned "did the drag even reach the handle" from a guess
  // into a number worth reading, the first time this command was used against a real collection.
  const body = commandBody('dragControl');
  assert.match(body, /rect:\s*\{\s*left:\s*rect\.left/, 'the measured rect must come back, not just success');
  assert.match(body, /curveValue:/, 'the curve\'s own value after the gesture must come back');
  assert.match(body, /curveView:/, 'the zoom window after the gesture must come back');
});

test('a radio takes its option by value, not the first input of the group', () => {
  // `uiControlTarget` falls back to `flat[0]` when nothing matches `part`, and a radio's value was then
  // read as a boolean. So `setField name=colorModel value=oklch` unchecked HSL, selected nothing, and
  // answered `settled`. The panel previewed HSL while the terminal believed it was on OKLCH — the tool
  // reporting a state the plugin was not in, which is the one failure this instrument cannot have.
  const body = commandBody('setField');
  assert.match(body, /uiControlTarget\(a\.name, String\(a\.value\), a\.index\)/,
    'a radio no longer resolves its option from the value');
  assert.match(body, /has no option called/,
    'an option that does not exist is silently becoming another one again');
  assert.equal(/target\.checked = a\.value === true \|\| a\.value === 'true';/.test(body), false,
    'the boolean-only read is back, so a named option cannot be selected');
});
