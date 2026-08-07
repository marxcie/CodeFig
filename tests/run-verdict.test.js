/**
 * What makes a queued run fail.
 *
 * A warning must never fail a run. It did: a script's `console.warn` was routed through
 * `debugError`, which forwards to the bridge at level `error`, so every warning arrived twice —
 * once as `[WARN]` and once as `[ERROR]` — and this function keys on `[ERROR]`. A run that wrote
 * everything it was asked to and warned about one thing exited non-zero.
 *
 * Every spec run, every `figma:run`, and any future CI gate reads that verdict, so it has to mean
 * what it says. The capture lives in src/ui.html because it needs the job state, so it is
 * extracted and exercised here the same way the script resolver is.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');

function loadCapture() {
  const match = /function _codefigQueueCaptureLine\(level, payload\) \{[\s\S]*?\n      \}/.exec(UI);
  assert.ok(match, '_codefigQueueCaptureLine not found in src/ui.html');
  const ctx = { codefigJob: { active: true, lines: [], firstError: null }, String };
  vm.createContext(ctx);
  vm.runInContext(match[0], ctx);
  return ctx;
}

test('a warning does not fail a run', () => {
  const ctx = loadCapture();
  ctx._codefigQueueCaptureLine('warn', 'Spacing: px held at the minimum of 1');
  ctx._codefigQueueCaptureLine('log', 'Variables created: 6');
  assert.equal(ctx.codefigJob.firstError, null, 'a run that warned still succeeded');
  assert.equal(ctx.codefigJob.lines.length, 2, 'and the warning is still in the output');
  assert.match(ctx.codefigJob.lines[0], /^\[WARN\]/);
});

test('an error fails a run, and the first one is the reason', () => {
  const ctx = loadCapture();
  ctx._codefigQueueCaptureLine('warn', 'a warning first');
  ctx._codefigQueueCaptureLine('error', 'the real problem');
  ctx._codefigQueueCaptureLine('error', 'a later one');
  assert.equal(ctx.codefigJob.firstError, 'the real problem');
});

test('nothing is captured when no job is running', () => {
  const ctx = loadCapture();
  ctx.codefigJob.active = null;
  ctx._codefigQueueCaptureLine('error', 'from a run the user started by hand');
  assert.deepEqual(ctx.codefigJob.lines, []);
  assert.equal(ctx.codefigJob.firstError, null);
});

test("a script's warnings reach the bridge as warnings, once", () => {
  // The routing itself, read off src/code.ts: console.warn must not travel through a helper that
  // forwards at error level, and the forward must stay behind the silent-run gate.
  const backend = fs.readFileSync(path.join(__dirname, '..', 'src', 'code.ts'), 'utf8');
  const warnHandler = /warn: \(\.\.\.args: any\[\]\) => \{[\s\S]*?\n        \}/.exec(backend);
  assert.ok(warnHandler, "the script console's warn handler was not found");
  assert.ok(
    !/debugError/.test(warnHandler[0]),
    'a script warning is routed through debugError again, which forwards it as an error'
  );
  assert.match(warnHandler[0], /if \(!silentRun\) forwardToConsoleBridge\('warn'/);
});
