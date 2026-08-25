/**
 * `runSilentSnippet` is the one gate in front of every on-demand fit, live preview refresh and
 * auto-import — all three post an `(async function () { await ...; window.codefigConfigLoadResult(...);
 * })()` snippet with no `catch`, so a rejection inside it never reaches the outer `try/catch` in
 * `code.ts` (that only wraps the synchronous call that builds the promise). Confirmed live: a fresh
 * on-demand fit, right after a plugin reload, on a mode nothing had touched yet, never returned in
 * over ninety seconds, while the identical call finished in 1.16s run directly — so whatever is wrong
 * is not the fit taking a long time, it is an answer that never arrives. Before this fix, one lost
 * answer wedged `silentRunInFlight` true forever, which then refused every later preview, auto-import
 * and fit for the rest of the session. This is a source-level check, in the same style as
 * `tests/ui-dev-guard.test.js`, because the function lives in `src/ui.html`'s one inline script rather
 * than a module a DOM-free test can import and call.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');

function extractFunction(source, name) {
  const match = source.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n      \\}'));
  return match ? match[0] : null;
}

test('runSilentSnippet arms a watchdog that releases silentRunInFlight if nothing answers', () => {
  const fn = extractFunction(UI, 'runSilentSnippet');
  assert.ok(fn, 'runSilentSnippet not found — did it get renamed?');
  assert.match(fn, /setTimeout\(/, 'no timeout armed after posting the silent run — a lost answer wedges the lock forever');
  assert.match(fn, /silentRunInFlight = false/, 'the watchdog callback must be able to release the lock');
});

test('the watchdog is token-guarded, so it cannot release a later run\'s lock', () => {
  const fn = extractFunction(UI, 'runSilentSnippet');
  assert.ok(fn, 'runSilentSnippet not found — did it get renamed?');
  assert.match(
    fn,
    /token === _silentRunToken/,
    'the timeout callback must check its own token before clearing silentRunInFlight — otherwise a ' +
      'watchdog armed for a stale run can clear the flag out from under a run that started normally after it'
  );
});

test('SILENT_RUN_TIMEOUT_MS is a real ceiling above the normal case, not effectively infinite', () => {
  const match = UI.match(/const SILENT_RUN_TIMEOUT_MS = (\d+);/);
  assert.ok(match, 'SILENT_RUN_TIMEOUT_MS not found');
  const ms = Number(match[1]);
  // Measured baseline for a real collection is ~1.2s; the per-control estimate timeout is 6s. This
  // only exists to recover from a lost answer, so it should sit above both rather than race either.
  assert.ok(ms >= 10000, `SILENT_RUN_TIMEOUT_MS is ${ms}ms — too close to normal run times to be a safety net`);
  assert.ok(ms <= 60000, `SILENT_RUN_TIMEOUT_MS is ${ms}ms — a user staring at a wedged panel for that long is the bug this exists to prevent`);
});

test('requestQuickFit\'s dispatched snippet catches its own rejection rather than letting it vanish', () => {
  const fn = extractFunction(UI, 'requestQuickFit');
  assert.ok(fn, 'requestQuickFit not found — did it get renamed?');
  assert.match(
    fn,
    /try\s*\{[\s\S]*catch\s*\(e\)\s*\{[\s\S]*codefigConfigLoadResult\(\{ error:/,
    'the dispatched (async function(){...})() has no catch, so a rejection after its first await ' +
      'never reaches the outer try/catch in code.ts — it just vanishes, and the row waits forever'
  );
});

test('a failed quick fit releases its row instead of leaving it claimed forever', () => {
  const match = UI.match(/if \(data\.error\) \{[\s\S]*?\n {14}\}/);
  assert.ok(match, 'the CONFIG_LOAD_RESULT error branch was not found in the shape this test expects');
  assert.match(
    match[0],
    /quickFitRowIndex[\s\S]*delete _modeFitted\[|delete _modeFitted\[[\s\S]*quickFitRowIndex/,
    '_modeFitted must be released on a quick-fit error, or the row can never be retried without a reload'
  );
});
