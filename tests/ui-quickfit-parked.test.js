/**
 * Opening a channel tab used to trigger an on-demand fit (`onChannelOpen: function (rowEl) {
 * requestQuickFit(rowEl); }`), alongside the dropdown's own "Estimated original" — parked in
 * `renderer.js` via `ESTIMATE_REQUEST_PARKED`. Hiding the dropdown option stopped a person from
 * *asking* for a fit; it did not stop the panel from asking automatically the moment a tab opened.
 *
 * Confirmed live, dragging a Hue handle on a real collection: `applyMove`'s own read of the
 * curve's stored value came back `[]` on every frame of the drag. A fit requested when the tab
 * opened had landed moments earlier and `applyQuickFit` wrote its answer in unconditionally — for
 * that channel, an empty curve — with no way to know a preset had since been picked or a handle
 * was already being dragged. The request itself was not slow or broken; it answered correctly.
 * The bug was that answering at all, unconditionally, some seconds after being asked, is a write
 * nobody consented to at the moment it lands.
 *
 * `onChannelOpen` is now a no-op. `requestQuickFit`, the tags, and the watchdog all stay — this is
 * the one-line revert alongside `ESTIMATE_REQUEST_PARKED`'s, once the dispatch bug (`DEFERRED.md`,
 * "The on-demand fit hangs, not always, and not fully explained") is understood well enough to
 * make landing late safe again.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');

test('onChannelOpen no longer calls requestQuickFit', () => {
  const match = UI.match(/onChannelOpen:\s*function\s*\([^)]*\)\s*\{[^}]*\}/);
  assert.ok(match, 'the onChannelOpen callback was not found in the shape this test expects');
  assert.doesNotMatch(
    match[0], /requestQuickFit/,
    'onChannelOpen still asks for a fit — confirmed live to overwrite a curve mid-interaction, ' +
      'the same reason the dropdown option is hidden'
  );
});

test('onRequestEstimate no longer calls requestQuickFit either', () => {
  // Unreachable via the UI now that the dropdown option is hidden, but kept honest anyway — a
  // future change that un-hides the option must not silently regain this call along with it.
  const match = UI.match(/onRequestEstimate:\s*function\s*\([^)]*\)\s*\{[\s\S]*?\n {14}\}/);
  assert.ok(match, 'the onRequestEstimate callback was not found in the shape this test expects');
  assert.doesNotMatch(match[0], /requestQuickFit\(/, 'onRequestEstimate still asks for a fit');
});
