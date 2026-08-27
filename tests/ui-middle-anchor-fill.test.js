/**
 * Adding a middle point to a curve (`buildCurveControl`'s "Add middle point" toggle,
 * `src/config-ui/renderer.js`) gives the curve a shape corner but leaves the channel's own
 * `middle.<channel>` anchor cell — a sibling this control cannot see — untouched. Read as its
 * numeric fallback (0 for hue, ~0 for chroma/saturation) at generation time, that is grey right
 * under the point someone just asked to bend. `populateMiddleAnchorFromCurve` (`src/ui.html`) is
 * the host-side fill: it reads the curve's own progress at the new middle and interpolates the
 * row's bright/dark ends to get a real starting number.
 *
 * `hueLerp` is tested behaviourally (it is pure and self-contained, so it can be extracted and
 * run for real); `populateMiddleAnchorFromCurve` is DOM-heavy in a way this repo's other
 * `src/ui.html` tests do not attempt to execute, so it is checked the same way
 * `tests/ui-dev-guard.test.js` and `tests/ui-silent-run-watchdog.test.js` check the rest of that
 * file — at the source level, for the guards that make it safe.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
const RENDERER = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');

function extractFunction(source, name) {
  const match = source.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n      \\}'));
  return match ? match[0] : null;
}

test('hueLerp matches oklchLerpHue exactly, including the wrap-around case', () => {
  const src = extractFunction(UI, 'hueLerp');
  assert.ok(src, 'hueLerp not found — did it get renamed?');
  const hueLerp = new Function('a', 'b', 'u', src.replace(/^function hueLerp\([^)]*\)\s*\{/, '').replace(/\}$/, ''));
  // Straight case: no wrap, a plain lerp.
  assert.equal(hueLerp(100, 200, 0.5), 150);
  // Wrap-around: 350 to 10 is a 20-degree span the short way, not 340 the long way.
  assert.equal(Math.round(hueLerp(350, 10, 0.5) * 10) / 10, 0);
  assert.equal(Math.round(hueLerp(10, 350, 0.5) * 10) / 10, 0);
});

test('populateMiddleAnchorFromCurve never overwrites a middle anchor unless the toggle asked to replace', () => {
  const fn = extractFunction(UI, 'populateMiddleAnchorFromCurve');
  assert.ok(fn, 'populateMiddleAnchorFromCurve not found — did it get renamed?');
  assert.match(fn, /detail\.replace/, 'must honour replace from the add-middle toggle');
  assert.match(
    fn,
    /!replace[\s\S]{0,80}middleInput\.value[\s\S]{0,40}!==\s*['"]{2}[\s\S]{0,10}return/,
    'a non-empty middle without replace must stop before computing — same rule as before for ' +
      'ordinary fills; replace is only for Add middle point after an overshoot edit'
  );
});

test('populateMiddleAnchorFromCurve prefers detail.value from the pre-split curve when present', () => {
  const fn = extractFunction(UI, 'populateMiddleAnchorFromCurve');
  assert.ok(fn, 'populateMiddleAnchorFromCurve not found — did it get renamed?');
  assert.match(fn, /detail\.value/, 'must read the channel value computed before the split');
});

test('populateMiddleAnchorFromCurve is a no-op when the row has no matching sibling cells', () => {
  const fn = extractFunction(UI, 'populateMiddleAnchorFromCurve');
  assert.ok(fn, 'populateMiddleAnchorFromCurve not found — did it get renamed?');
  assert.match(
    fn,
    /!middleInput[\s\S]{0,200}return/,
    'no guard for a missing middle.<channel> cell — every curve outside Colors (Spacing, Radius, ' +
      'Typography, and Colors\' own collection-scope curve) has no such sibling and must be untouched'
  );
  assert.match(
    fn,
    /!brightInput \|\| !darkInput[\s\S]{0,40}return/,
    'no guard for missing bright/dark siblings'
  );
});

test('populateMiddleAnchorFromCurve reads the curve\'s own middle handle, index 5, not a fixed default', () => {
  const fn = extractFunction(UI, 'populateMiddleAnchorFromCurve');
  assert.ok(fn, 'populateMiddleAnchorFromCurve not found — did it get renamed?');
  assert.match(fn, /points\.length !== 10/, 'must require the 10-point (with-middle) shape');
  assert.match(fn, /points\[5\]/, 'must read index 5 — the middle handle\'s own y, per bezierWithMiddle');
});

test('hue and hslHue channels use the circular lerp; everything else uses a plain one', () => {
  const fn = extractFunction(UI, 'populateMiddleAnchorFromCurve');
  assert.ok(fn, 'populateMiddleAnchorFromCurve not found — did it get renamed?');
  assert.match(
    fn,
    /channel === 'hue' \|\| channel === 'hslHue'/,
    'hue is circular (350 to 10 is a short way round) — a plain lerp for it would be wrong exactly ' +
      'when a palette crosses 0/360, which is the case oklchLerpHue exists for'
  );
});

test('the middle field is filled from the curve\'s real height at the split, not the corner\'s margin-clamped one', () => {
  /**
   * **`bezierWithMiddle` holds the new corner to `[0.001, 0.999]` — sound for a division `oklchRamp`
   * does with it, and the wrong number for this fill on a curve already dragged into an overshoot.**
   * Reading `points[5]` (the corner's height *after* the split) instead of the curve's real height
   * *before* it always produces a tame, in-between value, even when the curve visibly overshot past
   * bright or dark at that x — "the middle point isn't added where it should be, and the field
   * proves it" was reported live. The fix: `bezierAt` on the pre-split curve, passed through the
   * `config-ui-middle-point-added` event so `populateMiddleAnchorFromCurve` (`src/ui.html`) never
   * needs to re-derive it from the already-clamped corner.
   */
  const match = RENDERER.match(/toggle\.addEventListener\("click", function \(\) \{[\s\S]*?\n {4}\}\);/);
  assert.ok(match, 'the middle-point toggle handler was not found in the shape this test expects');
  const body = match[0];
  const heightIdx = body.indexOf('B.bezierAt(pts, at)');
  const splitIdx = body.indexOf('B.bezierWithMiddle(pts, at)');
  const detailIdx = body.indexOf('detail = { fraction:');
  assert.ok(heightIdx !== -1, 'the curve\'s real height at the split must be read via bezierAt on the pre-split points');
  assert.ok(heightIdx < splitIdx,
    'the real height must be read before bezierWithMiddle runs — after it, the corner is already margin-clamped');
  assert.ok(detailIdx > splitIdx, 'the real height must be attached to the event fired after the split');
  assert.match(body, /value:\s*valueAtSplit/, 'must pass the pre-split channel value, not only a unit height');
  assert.match(body, /replace:\s*true/, 'must ask the host to overwrite a leftover middle field');
});

test('populateMiddleAnchorFromCurve prefers detail.value, then detail.fraction, then the post-split corner', () => {
  const fn = extractFunction(UI, 'populateMiddleAnchorFromCurve');
  assert.ok(fn, 'populateMiddleAnchorFromCurve not found — did it get renamed?');
  const valueIdx = fn.indexOf('detail.value');
  const detailIdx = fn.indexOf('detail.fraction');
  const points5Idx = fn.indexOf('points[5]');
  assert.ok(valueIdx !== -1, 'must read detail.value — the channel value from the pre-split curve');
  assert.ok(detailIdx !== -1, 'must read detail.fraction as fallback');
  assert.ok(points5Idx > detailIdx,
    'points[5] must only be a fallback, tried after detail.fraction, for a caller that predates it');
});

test('the "Add middle point" toggle signals the host; "Remove middle point" does not', () => {
  const match = RENDERER.match(/toggle\.addEventListener\("click", function \(\) \{[\s\S]*?\n {4}\}\);/);
  assert.ok(match, 'the middle-point toggle handler was not found in the shape this test expects');
  const body = match[0];
  assert.match(body, /config-ui-middle-point-added/, 'adding a middle point must tell the host to fill its value');
  // The dispatch has to be inside the "else" (add) branch, not shared with bezierWithoutMiddle's.
  const removeIdx = body.indexOf('bezierWithoutMiddle');
  const dispatchIdx = body.indexOf('config-ui-middle-point-added');
  assert.ok(removeIdx !== -1 && dispatchIdx > removeIdx,
    'the event must not fire on the remove path — there is no new middle value to fill in that case');
});

test('the toggle asks the host where the real middle step is before splitting, and honours it', () => {
  /**
   * The toggle used to split every curve at a flat 0.5, but generation paces each half against
   * `index / last` up to the channel's real middle step (`colorsMidIndex`, or a named placement) —
   * which for an even step count is essentially never 0.5 exactly. A 16-step ramp turns at step 7 of
   * 15, 0.467, so a flat 0.5 split put the curve's own corner past the step generation was still
   * pacing toward the middle from — a discontinuity in the generated ramp the drawn curve never
   * shows. This checks the toggle actually asks, and uses a real, non-default answer rather than the
   * 0.5 fallback.
   */
  const match = RENDERER.match(/toggle\.addEventListener\("click", function \(\) \{[\s\S]*?\n {4}\}\);/);
  assert.ok(match, 'the middle-point toggle handler was not found in the shape this test expects');
  const body = match[0];
  assert.match(body, /config-ui-middle-point-position/,
    'the toggle must ask the host where the real middle step is before splitting');
  const askIdx = body.indexOf('config-ui-middle-point-position');
  const splitIdx = body.indexOf('bezierWithMiddle');
  const addedIdx = body.indexOf('config-ui-middle-point-added');
  assert.ok(askIdx !== -1 && splitIdx > askIdx,
    'the split must happen after asking, not before — an answer that arrives too late cannot be honoured');
  assert.ok(addedIdx > splitIdx, 'the host must be told to fill the value after the (correctly split) curve exists');
});

test('middlePlacementFraction answers the real middle step, not a flat half', () => {
  const match = UI.match(/function middlePlacementFraction\(rowEl\) \{[\s\S]*?\n {6}\}/);
  assert.ok(match, 'middlePlacementFraction not found — did it get renamed?');
  const body = match[0].replace(/^function middlePlacementFraction\(rowEl\)\s*\{/, '').replace(/\}$/, '');
  const fn = new Function('configUIContainer', 'rowEl', body);

  const steps16 = ['25', '50', '75', '100', '150', '200', '250', '300',
    '350', '400', '500', '600', '700', '800', '900', '950'];
  const container = {
    querySelector(sel) {
      return sel === '[data-field="steps"]' ? { value: steps16.join(', ') } : null;
    },
  };

  // No seed placement: falls back to colorsMidIndex — floor((16-1)/2) = 7, of last=15.
  const unplaced = { querySelector(sel) { return sel === '[data-row-field="seed.placement"]' ? { value: '' } : null; } };
  const fallback = fn(container, unplaced);
  assert.ok(Math.abs(fallback - 7 / 15) < 1e-9, 'expected the colorsMidIndex fallback (7/15), got ' + fallback);
  assert.notEqual(fallback, 0.5, 'a flat 0.5 is exactly the bug this exists to avoid');

  // A named placement in the step list overrides the fallback.
  const placed = { querySelector(sel) { return sel === '[data-row-field="seed.placement"]' ? { value: '700' } : null; } };
  const named = fn(container, placed);
  assert.ok(Math.abs(named - steps16.indexOf('700') / 15) < 1e-9,
    'a real seed placement should win over the colorsMidIndex fallback');

  // A blank step list (nothing to split against) answers null rather than dividing by zero.
  const emptyContainer = { querySelector() { return { value: '' }; } };
  assert.equal(fn(emptyContainer, unplaced), null);
});
