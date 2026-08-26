/**
 * `requestConfigPreview` used to always call `currentConfigBlock()`, which flushes a pending live
 * edit into CodeMirror first — two `setValue()` calls on the largest config block in the plugin,
 * run up to 8 times a second while a curve handle is being dragged (the 120ms max-wait in
 * `scheduleConfigPreview`). Documented as a known cost in `DEFERRED.md`, "The preview flushes the
 * config text on every frame of a drag" — and confirmed live: dragging a Hue handle produced a
 * console log of the preview's silent-run cycle firing back to back, and the handle did not visibly
 * move, because the main thread was busy running it rather than idle for a frame.
 *
 * The fix DEFERRED.md itself named: overlay the form's live values onto the last real parse instead
 * of re-parsing the text a live drag holds out of the editor on purpose. Source-level, because this
 * lives in `src/ui.html`'s one inline script rather than a module a DOM-free test can import and run.
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

test('requestConfigPreview overlays getValues onto the last parse instead of flushing the editor', () => {
  const fn = extractFunction(UI, 'requestConfigPreview');
  assert.ok(fn, 'requestConfigPreview not found — did it get renamed?');
  assert.match(
    fn,
    /if \(_configSyncPending[\s\S]{0,60}\{[\s\S]*?getValues\(\)/,
    'a pending live edit must be read from configUIInstance.getValues(), not from a flushed config block'
  );
});

test('requestConfigPreview only calls currentConfigBlock() when there is no pending live edit', () => {
  const fn = extractFunction(UI, 'requestConfigPreview');
  assert.ok(fn, 'requestConfigPreview not found — did it get renamed?');
  // The actual call site, not a mention of it in prose above — `readBlock(currentConfigBlock())` is
  // how it is invoked, and it must sit in an else branch (or equivalent guard) keyed off
  // _configSyncPending, not run unconditionally, which is exactly the regression this guards against.
  const callIdx = fn.indexOf('readBlock(currentConfigBlock())');
  const guardIdx = fn.indexOf('if (_configSyncPending');
  assert.ok(callIdx !== -1, 'currentConfigBlock() call is gone entirely — check the non-drag path still works');
  assert.ok(guardIdx !== -1 && guardIdx < callIdx,
    'currentConfigBlock() is not gated behind a _configSyncPending check');
});

test('the overlaid config is cached only from a real parse, never from the overlay itself', () => {
  // Caching the overlay's own result would let one drag frame's overlay become the base the next
  // frame overlays onto — drifting from what the text actually says, with nothing to correct it
  // until the drag ends.
  const fn = extractFunction(UI, 'requestConfigPreview');
  assert.ok(fn, 'requestConfigPreview not found — did it get renamed?');
  assert.match(fn, /_lastParsedConfig = config/, 'no cache write on the real-parse path');
  const overlayBranch = fn.slice(fn.indexOf('_configSyncPending'), fn.indexOf('} else {'));
  assert.doesNotMatch(overlayBranch, /_lastParsedConfig = /,
    'the overlay branch writes to the cache it reads from — a drag would drift from the real text');
});
