/**
 * The colour engine: perceptual arithmetic, checkable by hand.
 *
 * `@OKLCH` has no Figma API in it, which is what makes these tests possible at all — every number the
 * Colors panel puts on screen comes out of these functions, and until now the only way to check one was
 * to look at a swatch and agree with it.
 *
 * Four of these pin properties rather than values, because the values are the easy part:
 *
 * - **Round trip.** A hex that survives hex → OKLCH → hex is the precondition for reading an existing
 *   collection at all: the recogniser reads variables into OKLCH and the panel writes them back, and a
 *   conversion that loses a byte would show up as a whole file drifting one shade per run.
 * - **Gamut fit.** L and H must not move. That is not an implementation detail — holding L still is the
 *   entire premise of a shared lightness ladder, so a fit that adjusted lightness to keep a chroma would
 *   quietly break the thing the panel exists to guarantee.
 * - **Shortest arc.** 0 → 255 through green is the bug that looks like a design decision.
 * - **The re-anchoring invariant.** Lock seed replaced an offset *because* an offset moved the endpoints.
 *   Márton's instruction: "This is the property an offset violated, so it should be a test rather than a
 *   manual check." Checked at every placement, on an even and an odd step count, so the uneven-segment
 *   case is covered rather than assumed.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');
const LIBS = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');

/** The library as the sandbox sees it: its function declarations, spliced into a bare context. */
function loadEngine() {
  const ctx = { Math, String, Number, Array, Object, JSON, isNaN, isFinite, parseInt, parseFloat, RegExp };
  vm.createContext(ctx);
  // `@OKLCH` calls `applyEase`, which lives in `@Math Helpers` — a library's calls resolve in its
  // consumer's context, so the consumer here has to supply it too.
  for (const file of ['@math-helpers.js', '@bezier.js', '@oklch.js']) {
    const source = fs.readFileSync(path.join(LIBS, file), 'utf8');
    for (const [, code] of resolver.extractFunctionMap(source)) vm.runInContext(code, ctx);
  }
  return ctx;
}

const E = loadEngine();

/** A spread that covers the greys, the primaries, the corners and a few real brand colours. */
const HEXES = [
  '#000000', '#FFFFFF', '#7F7F7F', '#FAFAFA', '#09090B',
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF',
  '#717A71', '#71717A', '#1D4ED8', '#B04A2F', '#0F172A', '#F4F4F5',
  '#2E5C4A', '#C8A96E', '#3B82F6'
];

test('the engine loads with every function the panel needs', () => {
  for (const name of ['oklchFromHex', 'oklchToHex', 'oklchLerpHue', 'oklchLadder', 'oklchReanchor',
                      'oklchRamp', 'oklchCurves', 'oklchNearestStep', 'oklchCompare',
                      'oklchHslFromHex', 'oklchHslToHex', 'oklchNormaliseHex']) {
    assert.equal(typeof E[name], 'function', name + ' is missing from @OKLCH');
  }
});

test('hex → OKLCH → hex comes back byte-identical', () => {
  for (const hex of HEXES) {
    const c = E.oklchFromHex(hex);
    assert.ok(c, hex + ' did not parse');
    const back = E.oklchToHex(c.L, c.C, c.H);
    assert.equal(back.hex, hex.toUpperCase(), hex + ' round-tripped to ' + back.hex);
  }
});

test('a colour that came out of sRGB is never reported as clamped', () => {
  // Every hex above is by definition inside sRGB, so a `clamped` here would mean the gamut test is
  // tighter than the space it is testing — which would put a spurious note under a swatch.
  for (const hex of HEXES) {
    const c = E.oklchFromHex(hex);
    assert.equal(E.oklchToHex(c.L, c.C, c.H).clamped, false, hex + ' was reported as clamped');
  }
});

test('a hex the engine cannot read is null rather than a guess', () => {
  for (const bad of ['', '#12345', '#GGGGGG', 'rebeccapurple', null, undefined]) {
    assert.equal(E.oklchFromHex(bad), null, JSON.stringify(bad) + ' should not parse');
  }
  // And a hex it can read is normalised one way, so a message and a swatch label cannot disagree.
  assert.equal(E.oklchNormaliseHex('#717a71'), '#717A71');
  assert.equal(E.oklchNormaliseHex('717a71'), '#717A71');
  assert.equal(E.oklchNormaliseHex('#abc'), '#AABBCC');
  assert.equal(E.oklchNormaliseHex('nonsense'), 'nonsense');
});

test('the gamut fit reduces chroma and moves neither lightness nor hue', () => {
  // Chroma far past anything sRGB holds, at lightnesses from near-black to near-white, all round the hue
  // circle. Every one of these has to clamp, and every one has to come back at the L and H asked for.
  let clampedCount = 0;
  for (let H = 0; H < 360; H += 30) {
    for (const L of [0.1, 0.3, 0.5, 0.7, 0.9, 0.98]) {
      const fit = E.oklchToHex(L, 0.4, H);
      assert.equal(fit.clamped, true, 'C=0.4 at L' + L + ' H' + H + ' should not fit sRGB');
      clampedCount++;
      assert.ok(fit.chroma < 0.4, 'chroma was not reduced at L' + L + ' H' + H);
      assert.ok(fit.chroma >= 0, 'chroma went negative at L' + L + ' H' + H);

      // **Asserted on what the fit reports, exactly.** L and H are held by construction — the bisection only
      // ever touches chroma — so this is `===`, not a tolerance. Re-deriving them from `fit.rgb` instead
      // would be measuring the final 0..1 safety clip, which shifts a re-derived L by up to 9e-5 and a
      // re-derived hue by half a degree at near-grey chroma. Both invisible in eight bits, and neither is
      // the engine moving anything — but a tolerance loose enough to absorb them is loose enough to hide a
      // real drift, which is why `oklchToHex` reports its own L and H.
      assert.equal(fit.L, L, 'the fit did not report the lightness it was given at L' + L + ' H' + H);
      assert.equal(fit.H, H, 'the fit did not report the hue it was given at L' + L + ' H' + H);

      // And the eight-bit result is still the colour it claims to be, within a byte.
      const quantised = E.oklchFromHex(fit.hex);
      assert.ok(Math.abs(quantised.L - L) < 0.01,
        'the hex drifted in lightness at L' + L + ' H' + H + ': ' + quantised.L.toFixed(4));
    }
  }
  assert.ok(clampedCount > 60, 'the sweep did not actually run (' + clampedCount + ' cases)');
});

test('the fitted chroma is the largest that fits, not merely one that does', () => {
  // A fit that returned zero would pass "in gamut" and be useless. Just past what it returned must not
  // fit, which is what makes it the boundary.
  for (let H = 0; H < 360; H += 45) {
    const fit = E.oklchToHex(0.6, 0.4, H);
    const past = E.oklchToHex(0.6, fit.chroma + 0.01, H);
    assert.equal(past.clamped, true, 'C just past the fitted value still fit at H' + H);
    assert.ok(fit.chroma > 0.02, 'the fit collapsed to nothing at H' + H + ': ' + fit.chroma);
  }
});

test('hue interpolation takes the short way round', () => {
  // 0 → 255 the long way climbs through 120, which is green, and a neutral ramp between two nearby reds
  // comes out visibly teal in the middle. The short way goes *down* through magenta — 105 degrees of travel
  // rather than 255 — so the test is "never enters green", not a window around a number I guessed.
  const GREEN = [45, 200];
  let travelled = 0, previous = 0;
  for (let u = 0; u <= 1.0001; u += 0.02) {
    const h = E.oklchLerpHue(0, 255, Math.min(1, u));
    assert.ok(h <= GREEN[0] || h >= GREEN[1],
      'the walk from 0 to 255 passed through ' + h.toFixed(1) + ', which is green');
    if (u > 0) travelled += Math.abs(((h - previous + 540) % 360) - 180);
    previous = h;
  }
  assert.ok(travelled > 104 && travelled < 106, 'the walk covered ' + travelled.toFixed(1) + ' degrees');
  // The ordinary cases still behave.
  assert.equal(Math.round(E.oklchLerpHue(10, 50, 0.5)), 30);
  assert.equal(Math.round(E.oklchLerpHue(350, 10, 0.5)), 0);
  assert.equal(Math.round(E.oklchLerpHue(100, 140, 0.25)), 110);
});

test('a ladder starts and ends on its anchors, whatever the curve', () => {
  const steps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  const anchors = { bright: 0.985, middle: 0.62, dark: 0.18 };
  for (const curve of E.oklchCurves()) {
    const ladder = E.oklchLadder(anchors, curve.id, steps);
    assert.equal(ladder[0].L, anchors.bright, curve.id + ' moved the bright end');
    assert.equal(ladder[ladder.length - 1].L, anchors.dark, curve.id + ' moved the dark end');
    // **No middle assertion any more, on purpose.** The ladder runs on one curve across every step, so where
    // it sits at the middle is the curve's answer rather than a third anchor's. A `middle` in `anchors` is
    // read only by the legacy pair-join in `colorsCurve`; asserting it here is asserting the model that
    // let the middle lightness and the curve's own anchor disagree.
    assert.equal(ladder.length, steps.length);
  }
});


test('a ladder is monotone now that nothing can pin a step', () => {
  // The 15-step bug was two `overrides` written for an 11-step list. With pins gone there is nothing that
  // can put a step out of order, and this is the check that says so.
  const lists = [
    ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'],
    ['25', '50', '75', '100', '125', '150', '200', '300', '400', '500', '600', '700', '800', '900', '950'],
    ['a', 'b', 'c', 'd'],
    ['only', 'two']
  ];
  for (const steps of lists) {
    for (const curve of E.oklchCurves()) {
      const ladder = E.oklchLadder({ bright: 0.985, middle: 0.62, dark: 0.18 }, curve.id, steps);
      for (let i = 1; i < ladder.length; i++) {
        assert.ok(ladder[i].L <= ladder[i - 1].L + 1e-9,
          steps.length + ' steps / ' + curve.id + ': ' + ladder[i].step + ' is lighter than ' +
          ladder[i - 1].step);
      }
    }
  }
});

test('re-anchoring keeps the first and last steps exactly, at every placement', () => {
  // The invariant an offset violated. Both an odd and an even step count, so the uneven-segment case is
  // covered rather than assumed — and every placement including the ends, where one segment has no length
  // at all.
  const lists = [
    ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'],
    ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']
  ];
  const anchors = { bright: 0.985, middle: 0.62, dark: 0.18 };
  let checked = 0;

  for (const steps of lists) {
    for (const curve of E.oklchCurves()) {
      const base = E.oklchLadder(anchors, curve.id, steps);
      const last = steps.length - 1;
      for (let placement = 1; placement < last; placement++) {
        for (const seedL of [0.05, 0.3, 0.569, 0.8, 0.99]) {
          const out = E.oklchReanchor(anchors, seedL, curve.id, steps, placement);
          const where = steps.length + ' steps, ' + curve.id + ', placement ' + steps[placement] +
            ', seed L' + seedL;
          assert.equal(out.collapsed, false, 'an interior placement reported a collapse: ' + where);
          assert.equal(out.ladder[0].L, base[0].L, 'bright end moved: ' + where);
          assert.equal(out.ladder[last].L, base[last].L, 'dark end moved: ' + where);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 700, 'the sweep did not actually run (' + checked + ' cases)');
});

test('a seed placed on an end replaces that end, and the engine says so', () => {
  // The one case where "endpoints unchanged" cannot hold: the seed and the endpoint are the same step. The
  // seed wins, because the user pointed at that step on purpose — and `collapsed` is how a caller that
  // promises the endpoints hold finds out that it cannot.
  const steps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  const anchors = { bright: 0.985, middle: 0.62, dark: 0.18 };
  const last = steps.length - 1;

  const atBright = E.oklchReanchor(anchors, 0.9, 'sine-ease-in-out', steps, 0);
  assert.equal(atBright.collapsed, true);
  assert.equal(atBright.ladder[0].L, 0.9, 'the seed did not take the first step');
  assert.equal(atBright.ladder[last].L, anchors.dark, 'the far end moved as well, which it should not');

  const atDark = E.oklchReanchor(anchors, 0.25, 'sine-ease-in-out', steps, last);
  assert.equal(atDark.collapsed, true);
  assert.equal(atDark.ladder[last].L, 0.25, 'the seed did not take the last step');
  assert.equal(atDark.ladder[0].L, anchors.bright, 'the far end moved as well, which it should not');
});

test('re-anchoring puts the seed on its step, and reports the interior drift', () => {
  const steps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  const anchors = { bright: 0.985, middle: 0.62, dark: 0.18 };

  // Placed at 600 with the seed's own lightness, the step holds the seed.
  //
  // **To 1e-6, not exactly.** Re-anchoring now moves the *curve's* middle anchor onto the seed rather than
  // rebuilding the ladder around a second copy of the middle lightness, and a curve's coordinates are stored
  // to six decimals (`bezierStore`). So the seed comes back 1.5e-7 out — four orders of magnitude below one
  // eight-bit level, and the price of there being exactly one place the middle is written down. The
  // endpoints are still exact, because they are read from the anchors and never travel through a curve.
  const out = E.oklchReanchor(anchors, 0.569, 'sine-ease-in-out', steps, 6);
  assert.ok(Math.abs(out.ladder[6].L - 0.569) < 1e-6, 'the seed missed its step: ' + out.ladder[6].L);
  assert.equal(out.ladder[0].L, anchors.bright, 'the bright end moved');
  assert.equal(out.ladder[10].L, anchors.dark, 'the dark end moved');
  assert.ok(out.drift, 'no drift was reported');
  assert.ok(out.drift.step !== '50' && out.drift.step !== '950',
    'the drift was reported at an endpoint, which cannot move: ' + out.drift.step);

  // A seed that already sits on the ladder moves nothing. **Read from the ladder, not from `anchors.middle`**
  // — the middle is no longer a rung the ladder is pinned to, so the value that "already sits on it" is the
  // one the curve puts there.
  const resting = E.oklchLadder(anchors, 'sine-ease-in-out', steps);
  const flat = E.oklchReanchor(anchors, resting[5].L, 'sine-ease-in-out', steps, 5);
  for (let i = 0; i < steps.length; i++) {
    assert.ok(Math.abs(flat.ladder[i].L - flat.base[i].L) < 1e-6,
      'a seed already on the ladder moved step ' + steps[i]);
  }
  assert.ok(!flat.drift || Math.abs(flat.drift.delta) < 1e-6);
});

test('a ramp is one row per step, in order, with the seed step exact', () => {
  const steps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  const ladder = E.oklchLadder({ bright: 0.985, middle: 0.62, dark: 0.18 }, 'sine-ease-in-out', steps);
  const rows = E.oklchRamp({
    steps: steps, ladder: ladder, curve: 'sine-ease-in-out', middleIndex: 5, model: 'oklch',
    hue: { bright: 135, middle: 145, dark: 155 },
    chroma: { bright: 0.004, middle: 0.022, dark: 0.01 }
  });
  assert.equal(rows.length, steps.length);
  rows.forEach((row, i) => {
    assert.equal(row.step, steps[i]);
    assert.equal(row.L, ladder[i].L, 'the ramp disagreed with the ladder it was given at ' + row.step);
    assert.match(row.hex, /^#[0-9A-F]{6}$/);
  });
  // The anchors land on their own values rather than near them.
  assert.equal(Math.round(rows[0].H), 135);
  assert.equal(Math.round(rows[5].H), 145);
  assert.equal(Math.round(rows[10].H), 155);
});

test('an HSL ramp uses the same builder and never clamps', () => {
  const steps = ['50', '500', '950'];
  const ladder = E.oklchLadder({ bright: 0.98, middle: 0.46, dark: 0.04 }, 'linear', steps);
  const rows = E.oklchRamp({
    steps: steps, ladder: ladder, curve: 'linear', middleIndex: 1, model: 'hsl',
    hue: { bright: 120, middle: 120, dark: 120 },
    chroma: { bright: 0.04, middle: 0.04, dark: 0.04 }
  });
  rows.forEach((row) => assert.equal(row.clamped, false, 'HSL reported a gamut clamp'));
  // HSL round-trips too, which is what lets the model radio be lossless.
  const read = E.oklchHslFromHex('#717A71');
  const back = E.oklchHslToHex(read.L, read.C, read.H);
  assert.equal(back.hex, '#717A71');
});

test('the comparison says how far an existing set sits from a ladder', () => {
  // Tailwind zinc against a ladder through its own first, middle and last values: the anchors match and
  // the interior does not, which is the case the comparison strip exists for. 300 is the worst, by ~6.5.
  //
  // It was ~17 while the ladder was two curves pinned to three anchors. One curve *bent through* the middle
  // fits zinc more than twice as closely — the same reason a three-anchor curve replaced the pair rather
  // than losing to it: the bend is still there, it is just written down once and can sit anywhere.
  const steps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  const zinc = ['#FAFAFA', '#F4F4F5', '#E4E4E7', '#D4D4D8', '#A1A1AA', '#71717A',
                '#52525B', '#3F3F46', '#27272A', '#18181B', '#09090B'];
  const existing = zinc.map((hex, i) => Object.assign({ step: steps[i] }, E.oklchFromHex(hex)));
  const anchors = { bright: existing[0].L, middle: existing[5].L, dark: existing[10].L };
  // **Through the middle by moving the curve's anchor onto it**, which is the only way a ladder passes
  // through a middle value now. It used to be pinned as a third anchor while the curve went its own way;
  // one curve across every step means the curve has to be the thing that carries it.
  const shape = E.bezierThrough(E.bezierFromEase('sine', 'inout', 1), 0.5,
    (anchors.middle - anchors.bright) / (anchors.dark - anchors.bright));
  const ladder = E.oklchLadder(anchors, shape, steps);
  const generated = E.oklchRamp({
    steps: steps, ladder: ladder, curve: shape, middleIndex: 5, model: 'oklch',
    hue: { bright: existing[0].H, middle: existing[5].H, dark: existing[10].H },
    chroma: { bright: existing[0].C, middle: existing[5].C, dark: existing[10].C }
  });

  const cmp = E.oklchCompare(existing, generated);
  assert.equal(cmp.deltas.length, steps.length);
  for (const i of [0, 5, 10]) {
    // 1e-6, not 1e-9: the middle now arrives through a curve whose coordinates are stored to six decimals.
    assert.ok(Math.abs(cmp.deltas[i].delta) < 1e-6,
      'an anchor step differed: ' + steps[i] + ' by ' + cmp.deltas[i].delta);
  }
  assert.equal(cmp.worst.step, '300');
  assert.ok(cmp.worst.delta > 0.055 && cmp.worst.delta < 0.075,
    'zinc 300 should be about 6.5 lighter than the ladder, got ' + (cmp.worst.delta * 100).toFixed(1));

  // A missing counterpart is null, not zero: "no value" and "no difference" are different answers.
  const short = E.oklchCompare(existing.slice(0, 3), generated);
  assert.equal(short.deltas[5], null);
});

test('every family and easing the panel offers produces its own ramp', () => {
  // **13 of 20 combinations silently generated a linear ramp.** `oklchCurves()` is a flat list built for a
  // single dropdown and only ever held sine in three easings and everything else in easeInOut. Splitting the
  // panel's control into family + easing made it compose ids like `quad-ease-in`, which that list has never
  // contained, and `oklchCurveById` answers an unknown id with its *first entry* — linear. `applyEase` had
  // supported all of them all along; the id was the bottleneck and the fallback is what hid it.
  //
  // Márton found it by using the panel: "quad cubic and circ easein changes nothing."
  const anchors = { bright: 0.98, middle: 0.5, dark: 0.05 };
  const steps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  const families = ['sine', 'quad', 'cubic', 'circ'];
  const easings = ['in', 'out', 'inout', 'outin'];

  // **One curve now, so the check is on the curve the panel writes.** Passing the same family twice as a
  // `{ lower, upper }` pair no longer distinguishes these: joining two identical three-anchor halves needs
  // five anchors and a curve holds three, so `quad/inout` and `cubic/inout` land on one ladder through that
  // path. That is a real and known limit of the legacy join — not of the panel, which writes a single curve
  // where all sixteen stay distinct.
  const seen = new Map();
  families.forEach((type) => easings.forEach((ease) => {
    const ladder = E.oklchLadder(anchors, E.bezierFromEase(type, ease, 1), steps);
    const key = ladder.map((row) => Math.round(row.L * 1e6)).join(',');
    const label = type + '/' + ease;
    assert.equal(seen.has(key), false,
      label + ' generates the same ladder as ' + seen.get(key) + ' — a combination is falling back');
    seen.set(key, label);
  }));
  assert.equal(seen.size, 16);

  // And none of them is linear, which is what the fallback produced.
  const linear = E.oklchLadder(anchors, 'linear', steps).map((r) => Math.round(r.L * 1e6)).join(',');
  assert.equal(seen.has(linear), false, 'a family/easing pair still resolves to a linear ramp');

  // Linear ignores its easing, which is correct — linear *is* the identity, so all four are one ramp.
  easings.forEach((ease) => {
    const ladder = E.oklchLadder(anchors, E.bezierFromEase('linear', ease, 1), steps)
      .map((r) => Math.round(r.L * 1e6)).join(',');
    assert.equal(ladder, linear, 'linear stopped being the identity under easing ' + ease);
  });

  // **A stray pair joins; it never falls through to linear.** `colorsCurve` converts every pair before the
  // engine sees one, so this path should be unreachable — but the fall-through under it answers *linear* for
  // anything unrecognised, which is the exact shape of the bug this test was written for.
  const strayed = E.oklchCurveOf({ lower: E.bezierFromEase('quad', 'in', 1),
    upper: E.bezierFromEase('circ', 'out', 1) }).points;
  assert.notDeepEqual(strayed, E.bezierFromEase('linear', 'none', 1), 'a stray pair fell back to linear');
  assert.equal(strayed.length, 10, 'a joined pair is one curve with a middle anchor');

  // A pair passed as `{ type, ease }` must never be looked up on the flat list. It is now **converted to
  // coordinates** on the way in rather than carried as a pair, so the check is that the curve it produces is
  // the one that family and easing describe — which is a stronger statement than the id being right, and the
  // one that survives the panel no longer storing a family at all.
  const direct = E.oklchCurveOf({ type: 'quad', ease: 'in' });
  assert.deepEqual(direct.points, E.bezierFromEase('quad', 'in', 1));
  assert.notDeepEqual(direct.points, E.bezierFromEase('linear', 'none', 1), 'it fell back to linear');

  // And coordinates passed straight in are used as given — the shape the panel writes today.
  const dragged = [0.9, 0.05, 0.1, 0.95];
  assert.deepEqual(E.oklchCurveOf(dragged).points, dragged);
});

test('HSL carries saturation, and cannot ask a lightness for more colour than it holds', () => {
  // **The bug this replaces, and the bound that replaces it.**
  //
  // `S = C / (1 - |2L - 1|)`, a denominator that collapses towards white and black. The ramp used to
  // multiply S out into an absolute colourfulness at each anchor's own lightness, interpolate *that*, and
  // divide back. It was introduced against a real overshoot — measured on Márton's own ramp the
  // colourfulness dipped to 29/255 at the middle anchor and then reached 60, over double his file's peak —
  // and it did prevent that. It also turned a flat saturation into a cliff at the bright end and left the
  // middle of a ramp visibly duller than the file it was read from.
  //
  // The old bound was *"no step is more colourful than the most colourful anchor"*. That is not a property
  // of ramps: a set's most colourful step is usually **between** anchors, not on one. His lime peaks at
  // 208/255 against anchors of 168, so the bound was cutting off the file's own shape.
  //
  // What is pinned instead is the real bound — S cannot exceed 1, which is the most any lightness holds —
  // and that the original overshoot cannot come back.
  const steps = ['25', '50', '75', '100', '150', '200', '250', '300',
    '350', '400', '500', '600', '700', '800', '900', '950'];
  const shape = E.bezierJoin(E.bezierFromEase('sine', 'in', 1), E.bezierFromEase('sine', 'out', 1),
    7 / (steps.length - 1), 0.5);
  const ladder = E.oklchLadder({ bright: 0.976, middle: 0.708, dark: 0.067 }, shape, steps);
  const rows = E.oklchRamp({
    steps: steps, ladder: ladder, curve: shape,
    middleIndex: 7, model: 'hsl',
    // `hasMiddle: true` — a real, measured middle anchor, same as `colorsChannel` reports for one.
    // Without it `oklchRamp` now reads a curve-less channel's middle as absent rather than assumes
    // it, which is the whole point of the flag; this fixture wants the three-anchor behaviour it
    // was already asserting on.
    hue: { bright: 97.5, middle: 105.5, dark: 145, hasMiddle: true },
    chroma: { bright: 0.667, middle: 0.195, dark: 0.353, hasMiddle: true }
  });

  // The real ceiling: a saturation over 1 is asking a lightness for more colour than it has.
  rows.forEach((row, i) => {
    assert.ok(row.C >= 0 && row.C <= 1,
      'step ' + steps[i] + ' asked for saturation ' + row.C.toFixed(3) + ', which is not a saturation');
  });

  // Every step is between its neighbouring anchors' saturations, which is what interpolating S means and
  // what the round trip through colourfulness destroyed.
  const anchors = { bright: 0.667, middle: 0.195, dark: 0.353 };
  rows.forEach((row, i) => {
    const lo = i <= 7 ? Math.min(anchors.bright, anchors.middle) : Math.min(anchors.middle, anchors.dark);
    const hi = i <= 7 ? Math.max(anchors.bright, anchors.middle) : Math.max(anchors.middle, anchors.dark);
    assert.ok(row.C >= lo - 1e-9 && row.C <= hi + 1e-9,
      'step ' + steps[i] + ' left the saturation range its two anchors span');
  });
  assert.ok(Math.abs(rows[7].C - anchors.middle) < 1e-9, 'the middle step is not the middle anchor');
  assert.ok(Math.abs(rows[0].C - anchors.bright) < 1e-9, 'the bright end is not its anchor');

  // And the overshoot that motivated the old model stays gone: nothing reaches double the anchors' own peak.
  const colourfulness = (hex) => {
    const rgb = E.oklchHexToRgb(hex);
    return Math.max.apply(null, rgb) - Math.min.apply(null, rgb);
  };
  const anchorPeak = Math.max(colourfulness(rows[0].hex), colourfulness(rows[7].hex),
    colourfulness(rows[15].hex));
  const worst = Math.max.apply(null, rows.map((r) => colourfulness(r.hex)));
  assert.ok(worst < anchorPeak * 1.5,
    'colourfulness reached ' + Math.round(worst * 255) + '/255 against an anchor peak of ' +
    Math.round(anchorPeak * 255) + ' — the overshoot the absolute model was written for is back');

  // OKLCH is untouched: its chroma is already absolute, which is why it never had this.
  const okl = E.oklchRamp({
    steps: steps, ladder: ladder, curve: 'linear', middleIndex: 7, model: 'oklch',
    hue: { bright: 97.5, middle: 105.5, dark: 145, hasMiddle: true },
    chroma: { bright: 0.01, middle: 0.05, dark: 0.02, hasMiddle: true }
  });
  assert.equal(Math.round(okl[7].C * 1000) / 1000, 0.05, 'the OKLCH middle stopped being its chroma anchor');
});

test('an explicit empty channel curve ignores the middle anchor at the placement step', () => {
  // Linear / Original stores `[]` on the mode. The panel draws a straight line; generation must not read
  // a leftover middle field of 0 — the curve has no middle *point*.
  const steps = ['25', '50', '75', '100', '150', '200', '250', '300',
    '350', '400', '500', '600', '700', '800', '900', '950'];
  const shape = E.bezierJoin(E.bezierFromEase('sine', 'in', 1), E.bezierFromEase('sine', 'out', 1),
    7 / (steps.length - 1), 0.5);
  const ladder = E.oklchLadder({ bright: 0.976, middle: 0.708, dark: 0.067 }, shape, steps);
  const rows = E.oklchRamp({
    steps: steps, ladder: ladder, curve: shape,
    middleIndex: 7, model: 'hsl', chromaCurve: [], hueCurve: [],
    hue: { bright: 100, middle: 0, dark: 99.2, hasMiddle: false },
    chroma: { bright: 1, middle: 0, dark: 0.984, hasMiddle: false }
  });
  assert.ok(rows[7].C > 0.9,
    'middle step saturation must stay near the ends, not drop to the leftover anchor: ' + rows[7].C);
});

test('a blend amount moves between linear and the curve, and cannot break the ramp', () => {
  // **The menu was 0% or 100% and the useful values are in between.** An easing's departure from linear is a
  // fraction of the range it spans, so sine easeOut is 5.5 lightness points across a 27-point segment and 13.3
  // across a 64-point one — the same curve with 2.4x the visible effect. Márton's own ramp fits best at 55%
  // and 80%, neither of which a named curve can say.
  // The blend is now folded into the **handles** rather than applied to the output: `bezierFromEase` pulls
  // each handle's `y` toward its own `x`, which with the `x` handles fixed is the same operation. Exactly the
  // same, not nearly — see the amount test in `tests/bezier.test.js`.
  const at = (amount, t) => E.oklchEaseAt(E.oklchCurveOf({ type: 'sine', ease: 'out', amount: amount }), t);

  // 0 is exactly linear and 1 is exactly the curve — not approximately.
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    assert.ok(Math.abs(at(0, t) - t) < 1e-9, 'amount 0 is not linear at t=' + t);
    assert.equal(at(1, t), E.bezierAt(E.bezierFromEase('sine', 'out', 1), t),
      'amount 1 is not the curve at t=' + t);
  }

  // **The curve is a fitted cubic, not the trigonometric function**, and how far apart those are is a
  // published number rather than something to discover here: `bezierEaseTable` says sine is within 0.0021.
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    assert.ok(Math.abs(at(1, t) - E.applyEase('sine', 'out', t)) <= 0.0021 + 1e-9,
      'the fitted sine has drifted past its documented error at t=' + t);
  }

  // Endpoints hold at every amount — that is what makes it safe without clamping: linear and every family
  // share both ends, so a mix of the two passes through them and no anchor can move. A bezier's ends are its
  // anchors rather than a function evaluated at 0 and 1, so the 6.1e-17 `applyEase` used to leave here is
  // gone; the tolerance stays because `oklchLadder` still takes its anchors *by index*, and that is the
  // invariant worth pinning rather than the noise.
  for (let a = 0; a <= 100; a += 5) {
    assert.ok(Math.abs(at(a / 100, 0)) < 1e-15, 'the start moved at ' + a + '%');
    assert.ok(Math.abs(at(a / 100, 1) - 1) < 1e-15, 'the end moved at ' + a + '%');
  }

  // The ladder's own anchors hold *exactly* at every amount, which is the invariant re-anchoring depends on.
  // **Two anchors, not three.** The ladder runs on one curve across every step, so only the ends are
  // anchors it must reproduce; where it sits at the middle is the curve's answer. The middle assertion that
  // used to live here was pinning the model that let a stored middle lightness and the curve's own anchor
  // give two answers to one question.
  for (let a = 0; a <= 100; a += 20) {
    const rungs = E.oklchLadder({ bright: 0.976, middle: 0.708, dark: 0.067 },
      E.bezierFromEase('sine', 'out', a / 100),
      ['50', '100', '200', '300', '400', '500', '950']);
    assert.equal(rungs[0].L, 0.976, 'bright moved at ' + a + '%');
    assert.equal(rungs[6].L, 0.067, 'dark moved at ' + a + '%');
  }

  // Monotone at every amount: a convex combination of two monotone functions is monotone, so no amount can
  // put a step out of order.
  for (let a = 0; a <= 100; a += 10) {
    let previous = -Infinity;
    for (let i = 0; i <= 50; i++) {
      const v = at(a / 100, i / 50);
      assert.ok(v >= previous - 1e-12, 'not monotone at ' + a + '%, t=' + (i / 50));
      previous = v;
    }
  }

  // And an intermediate amount sits between the two, rather than being one of them.
  const half = at(0.5, 0.35);
  assert.ok(half > Math.min(0.35, E.applyEase('sine', 'out', 0.35)));
  assert.ok(half < Math.max(0.35, E.applyEase('sine', 'out', 0.35)));

  // A ladder built at 80% differs from both the linear and the full-curve ladder.
  const steps = ['50', '300', '950'];
  const anchors = { bright: 0.976, middle: 0.708, dark: 0.067 };
  const ladderAt = (amount) => E.oklchLadder(anchors, E.bezierFromEase('sine', 'out', amount),
    ['50', '100', '200', '300', '400', '500', '950']).map((r) => Math.round(r.L * 1e6));
  assert.notDeepEqual(ladderAt(0.8), ladderAt(1));
  assert.notDeepEqual(ladderAt(0.8), ladderAt(0));
  assert.deepEqual(steps.length, 3);
});
