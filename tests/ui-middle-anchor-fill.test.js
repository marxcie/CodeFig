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

test('populateMiddleAnchorFromCurve never overwrites a middle anchor that already has a value', () => {
  const fn = extractFunction(UI, 'populateMiddleAnchorFromCurve');
  assert.ok(fn, 'populateMiddleAnchorFromCurve not found — did it get renamed?');
  assert.match(
    fn,
    /middleInput\.value[\s\S]{0,40}!==\s*['"]{2}[\s\S]{0,10}return/,
    'a non-empty middle anchor must stop this before it computes anything, the same rule ' +
      'applyQuickFit follows for a value a person already gave it'
  );
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
