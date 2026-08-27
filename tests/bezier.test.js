// The bezier curve library: the claims in its doc block, as assertions.
//
// Two things are worth pinning here and nothing else is. **The preset table is fitted numbers** — nine
// constants a search produced, not a formula anyone can check by reading — so each row is re-measured
// against the `applyEase` family it stands for. And **`bezierAt` has to be single-valued and monotonic**,
// because a scale that goes backwards at one step is the failure this whole control exists to make visible.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const LIB = path.join(__dirname, "..", "scripts", "CODEFIG_LIBRARIES");

// Loaded the way the sandbox loads it: concatenated and run through `new Function`, so a curve library that
// only works after a bundler would fail here rather than inside Figma.
function load() {
  // `@oklch.js` too, because the fitting tests read real published hexes rather than lightnesses somebody
  // typed in — the point of those numbers is that they came out of a real ramp.
  const src = ["@math-helpers.js", "@bezier.js", "@oklch.js"]
    .map((f) => fs.readFileSync(path.join(LIB, f), "utf8"))
    // `@import` lines are a marker the UI resolves, not JavaScript — the sandbox never sees one, and
    // `new Function` would stop at the `@`.
    .map((t) => t.replace(/^@import .*$/gm, ""))
    .join("\n");
  const box = {};
  new Function(
    src +
      "\nthis.E = { bezierAt, bezierNormalise, bezierIsEmpty, bezierAnchorCount, bezierSegments," +
      " bezierWithMiddle, bezierWithoutMiddle, bezierJoin, bezierSplit, bezierPlace," +
      " bezierFromEase, bezierEaseName, bezierEaseError, bezierThrough," +
      " bezierFitRamp, bezierFitSegment, bezierWorstError, bezierIsMonotone, bezierHandlesRise," +
      " bezierEaseNames, bezierEaseTable, bezierParse, bezierFormat, applyEase, oklchFromHex," +
      " bezierMonotoneOrLinear };"
  ).call(box);
  return box.E;
}
const B = load();

const FAMILIES = B.bezierEaseNames().types;
const EASES = ["in", "out", "inout", "outin"];

// The bounds from the table in `bezierEaseTable`'s comment. Written out rather than computed so that a
// fitted number drifting is a test failure with a name on it, which is the only reason the table is pinned.
/**
 * How far a preset may sit from the easing function it names.
 *
 * **`inout` has its own, looser row.** It used to be built as two segments — the in-curve then the
 * out-curve — which is exact for `quad` and `cubic` and close for the rest. It is one cubic now, because
 * two segments meant a *middle anchor*, and a colour channel travels through its middle anchor value: a
 * preset named for smoothness put a corner in a saturation ramp. Making the geometry honest costs
 * fidelity, and this is the bill: 0.0002 on `sine`, 0.036 at worst on `circ` and `exponential`, and the
 * exactness of `quad` and `cubic` gone.
 *
 * `outin` keeps both segments and its old accuracy, because no single cubic is within 0.04 of it and
 * several are 0.15 out — that is not an approximation, it is a different curve.
 */
const BOUND = {
  linear: 1e-6, quad: 1e-6, cubic: 1e-6,
  circ: 0.0006, sine: 0.0021, goldenRatio: 0.0023,
  quart: 0.0040, quint: 0.0077, exponential: 0.0099,
};
const INOUT_BOUND = {
  linear: 1e-6, sine: 0.0003, goldenRatio: 0.0040, quad: 0.0040, cubic: 0.0095,
  quart: 0.0210, circ: 0.0265, quint: 0.0310, exponential: 0.0330,
};

test("every preset stays within the error its doc block claims", () => {
  for (const type of FAMILIES) {
    for (const ease of EASES) {
      const err = B.bezierEaseError(type, ease, 1);
      const bound = ease === "inout" ? INOUT_BOUND[type] : BOUND[type];
      assert.ok(
        err <= bound + 1e-9,
        `${type}/${ease} is ${err.toFixed(6)} out, past the documented ${bound}`
      );
    }
  }
});

test("linear, quad and cubic are the exact ones — they are cubics already", () => {
  // **Except `inout`, which is no longer two segments.** `0.5 x ease(2t)` is exactly a cubic when the
  // family is; one cubic across the whole range is not. That exactness was worth less than a preset that
  // does not silently corner a colour ramp.
  for (const type of ["linear", "quad", "cubic"]) {
    for (const ease of EASES.filter((e) => e !== "inout" || type === "linear")) {
      assert.ok(B.bezierEaseError(type, ease, 1) < 1e-6, `${type}/${ease} should be exact`);
    }
  }
});

test("inout and outin come back as three-point curves, the rest as two", () => {
  for (const type of FAMILIES) {
    for (const ease of EASES) {
      // `inout` is one cubic now; only `outin` still needs two segments.
      const want = type !== "linear" && ease === "outin" ? 10 : 4;
      assert.equal(B.bezierFromEase(type, ease, 1).length, want, `${type}/${ease}`);
    }
  }
});

test("amount blends to linear exactly, because the x handles do not move", () => {
  for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
    for (const type of ["linear", "quad", "cubic"]) {
      // `outin`, because `inout` is a fitted cubic now and carries its own small error at every amount.
      assert.ok(B.bezierEaseError(type, "outin", amount) < 1e-6, `${type} at amount ${amount}`);
    }
  }
  // Amount 0 is the straight ramp whatever the family.
  for (const type of FAMILIES) {
    const flat = B.bezierFromEase(type, "inout", 0);
    for (let i = 0; i <= 20; i++) {
      const x = i / 20;
      assert.ok(Math.abs(B.bezierAt(flat, x) - x) < 1e-6, `${type} at amount 0 should be straight`);
    }
  }
});

test("y never goes backwards, however the handles are placed", () => {
  const curves = [
    [0.95, 0.02, 0.05, 0.98],
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [0.9, 0, 0.9, 0.2, 0.4, 0.5, 0.1, 0.6, 0.2, 1],
    ...FAMILIES.flatMap((t) => EASES.map((e) => B.bezierFromEase(t, e, 1))),
  ];
  for (const curve of curves) {
    let prev = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const y = B.bezierAt(curve, i / 400);
      assert.ok(y >= prev - 1e-9, `went backwards on ${JSON.stringify(curve)} at x=${i / 400}`);
      assert.ok(y >= -1e-9 && y <= 1 + 1e-9, `left the unit square on ${JSON.stringify(curve)}`);
      prev = y;
    }
  }
});

test("adding the middle anchor does not move the curve", () => {
  for (const type of FAMILIES) {
    const two = B.bezierFromEase(type, "in", 1);
    for (const at of [0.2, 0.5, 0.85]) {
      const three = B.bezierWithMiddle(two, at);
      assert.equal(three.length, 10);
      for (let i = 0; i <= 200; i++) {
        const x = i / 200;
        assert.ok(
          Math.abs(B.bezierAt(two, x) - B.bezierAt(three, x)) < 1e-5,
          `${type} split at ${at} moved the curve at x=${x}`
        );
      }
    }
  }
});

test("removing the middle anchor keeps the curve pinned to its ends", () => {
  const three = B.bezierFromEase("quad", "inout", 1);
  const two = B.bezierWithoutMiddle(three);
  assert.equal(two.length, 4);
  assert.ok(Math.abs(B.bezierAt(two, 0) - 0) < 1e-9);
  assert.ok(Math.abs(B.bezierAt(two, 1) - 1) < 1e-9);
});

test("text round-trips every preset, in both shapes", () => {
  for (const type of FAMILIES) {
    for (const ease of EASES) {
      const curve = B.bezierFromEase(type, ease, 1);
      const back = B.bezierParse(B.bezierFormat(curve));
      assert.ok(back, `${type}/${ease} did not parse back`);
      assert.equal(back.length, curve.length, `${type}/${ease} changed shape`);
      for (let i = 0; i <= 100; i++) {
        const x = i / 100;
        assert.ok(
          Math.abs(B.bezierAt(curve, x) - B.bezierAt(back, x)) < 0.002,
          `${type}/${ease} drifted through text at x=${x}`
        );
      }
    }
  }
});

test("parse takes what people actually have, and refuses the rest", () => {
  assert.deepEqual(B.bezierParse("cubic-bezier(.37,0,.63,1)"), [0.37, 0, 0.63, 1]);
  assert.deepEqual(B.bezierParse("CUBIC-BEZIER( 0.37 , 0 , 0.63 , 1 )"), [0.37, 0, 0.63, 1]);
  assert.deepEqual(B.bezierParse("0.4 0 0.6 1"), [0.4, 0, 0.6, 1]);
  assert.deepEqual(B.bezierParse("0.4,0,0.6,1"), [0.4, 0, 0.6, 1]);
  // The form the config block holds, which is the one most likely to be pasted in — and the form the
  // editor stores between redraws, so this is load-bearing for the control as well as for a paste.
  assert.deepEqual(B.bezierParse("[0.37, 0, 0.63, 1]"), [0.37, 0, 0.63, 1]);
  assert.deepEqual(B.bezierParse("[]"), []);
  assert.equal(B.bezierParse(".1,.2,.3,.4,.5,.5,.6,.7,.8,.9").length, 10);
  assert.deepEqual(B.bezierParse(""), []);
  // Refused, not repaired. A field that filled in a missing fourth number would be guessing at a paste.
  assert.equal(B.bezierParse("1,2,3"), null);
  assert.equal(B.bezierParse("0.1,0.2,0.3,0.4,0.5"), null);
  assert.equal(B.bezierParse("nope"), null);
  assert.equal(B.bezierParse(null), null);
});

test("a preset knows its own name; one nudge off does not", () => {
  for (const type of FAMILIES) {
    for (const ease of EASES) {
      const found = B.bezierEaseName(B.bezierFromEase(type, ease, 1));
      assert.ok(found, `${type}/${ease} lost its name`);
      // linear collapses every ease onto one curve, so it is allowed to answer with any of them.
      if (type !== "linear") assert.equal(found.type, type, `${type}/${ease}`);
    }
  }
  assert.equal(B.bezierEaseName([0.38, 0, 0.63, 1]), null);
  assert.equal(B.bezierEaseName([]), null);
});

test("an unreadable curve is empty, and an empty curve is the identity", () => {
  for (const junk of [null, undefined, "x", [1, 2, 3], [1, 2, 3, 4, 5], {}]) {
    assert.deepEqual(B.bezierNormalise(junk), [], `${JSON.stringify(junk)}`);
  }
  assert.equal(B.bezierIsEmpty([]), true);
  assert.equal(B.bezierIsEmpty([0.1, 0.2, 0.3, 0.4]), false);
  for (const x of [0, 0.37, 0.5, 1]) assert.equal(B.bezierAt([], x), x);
});

test("out-of-range input is clamped rather than rejected", () => {
  assert.deepEqual(B.bezierNormalise([1.4, -0.2, -0.3, 5]), [1, 0, 0, 1]);
  // A handle dragged past the middle anchor is pulled back to it, which is what keeps x monotonic.
  const held = B.bezierNormalise([0.9, 0, 0.9, 0.2, 0.4, 0.5, 0.1, 0.6, 0.2, 1]);
  assert.equal(held[4], 0.4);
  assert.ok(held[0] <= 0.4 && held[2] <= 0.4, "lower handles held at or below the middle");
  assert.ok(held[6] >= 0.4 && held[8] >= 0.4, "upper handles held at or above the middle");
});

// ---------------------------------------------------------------------------
// Two halves and one curve are the same thing
// ---------------------------------------------------------------------------

test("joining two segment curves reproduces them exactly, and splits back", () => {
  // Colours describes its lightness ladder as a *lower* curve and an *upper* curve, each normalised into
  // its own half. That already **is** one curve with a middle anchor — the two halves are that curve
  // written in two pieces, because the three-point form did not exist when it was built.
  for (const lower of FAMILIES.map((t) => B.bezierFromEase(t, "in", 1))) {
    for (const upper of [B.bezierFromEase("circ", "out", 1), B.bezierFromEase("quad", "out", 1)]) {
      for (const [mx, my] of [[0.5, 0.5], [0.3, 0.65], [0.8, 0.2]]) {
        const joined = B.bezierJoin(lower, upper, mx, my);
        assert.equal(joined.length, 10);

        // The join lands where it was told to, which is what makes the middle anchor mean something.
        assert.ok(Math.abs(B.bezierAt(joined, mx) - my) < 1e-5, `the anchor moved at ${mx},${my}`);

        // Each half, read in its own square, is the curve it was built from.
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          assert.ok(
            Math.abs(B.bezierAt(joined, t * mx) - B.bezierAt(lower, t) * my) < 1e-4,
            `lower half drifted at ${t}`
          );
          assert.ok(
            Math.abs(B.bezierAt(joined, mx + t * (1 - mx)) - (my + B.bezierAt(upper, t) * (1 - my))) < 1e-4,
            `upper half drifted at ${t}`
          );
        }

        const back = B.bezierSplit(joined);
        assert.ok(back, "a three-point curve splits");
        assert.ok(Math.abs(back.mx - mx) < 1e-5 && Math.abs(back.my - my) < 1e-5);
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          assert.ok(Math.abs(B.bezierAt(back.lower, t) - B.bezierAt(lower, t)) < 1e-4, "lower round trip");
          assert.ok(Math.abs(B.bezierAt(back.upper, t) - B.bezierAt(upper, t)) < 1e-4, "upper round trip");
        }
      }
    }
  }
});

test("a two-point curve has no halves to split into", () => {
  // Not a failure — the whole reason for having one is that a ladder need not kink at its middle.
  assert.equal(B.bezierSplit(B.bezierFromEase("sine", "in", 1)), null);
  assert.equal(B.bezierSplit([]), null);
});

test("joining nothing gives the straight ladder through the anchor", () => {
  // Colours' *Original* is an empty curve on both halves. Joined, that has to be the straight line through
  // the middle anchor rather than a refusal, or a set on Original could not be described at all.
  const joined = B.bezierJoin([], [], 0.5, 0.6);
  assert.equal(joined.length, 10);
  assert.ok(Math.abs(B.bezierAt(joined, 0.5) - 0.6) < 1e-5);
  assert.ok(Math.abs(B.bezierAt(joined, 0.25) - 0.3) < 1e-4, "straight below the anchor");
  assert.ok(Math.abs(B.bezierAt(joined, 0.75) - 0.8) < 1e-4, "and straight above it");
});

// ============================================================
// Fitting a curve to a ramp that was not made by one
// ============================================================

test('a published ramp is fitted to within a lightness point, and stays monotone', () => {
  // **The claim that changed.** `colorsRecognise` used to report `missing: ['curve']` — an existing ramp is
  // a list of colours with no record of how it was made, so a read landed on *Original* and the curve
  // editor opened with nothing in it. That is true of *naming* a preset and false of *fitting* one.
  //
  // These are the numbers the recogniser is trusted on. If a change to the fitter makes one of them worse,
  // the panel starts proposing a ramp further from the file than it says it is.
  const SETS = {
    zinc: ['#FAFAFA', '#F4F4F5', '#E4E4E7', '#D4D4D8', '#A1A1AA', '#71717A',
           '#52525B', '#3F3F46', '#27272A', '#18181B', '#09090B'],
    slate: ['#F8FAFC', '#F1F5F9', '#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B',
            '#475569', '#334155', '#1E293B', '#0F172A', '#020617'],
    blue: ['#EFF6FF', '#DBEAFE', '#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6',
           '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A', '#172554'],
  };

  for (const [name, hexes] of Object.entries(SETS)) {
    const ladder = hexes.map((h) => B.oklchFromHex(h).L);
    const fit = B.bezierFitRamp(ladder);
    assert.ok(fit, name + ' produced no fit at all');

    const span = Math.abs(ladder[ladder.length - 1] - ladder[0]);
    const points = fit.error * span * 100;
    assert.ok(points < 1.0,
      name + ' fitted only to ' + points.toFixed(2) + ' lightness points — the recogniser claims under 1');

    // A ladder that doubles back is not a ladder, whatever its error.
    assert.ok(B.bezierIsMonotone(fit.curve), name + ' fitted a curve that reverses');

    // Well inside what the closest named preset manages, which is why fitting replaced naming.
    let preset = Infinity;
    for (const type of B.bezierEaseNames().types) {
      for (const ease of B.bezierEaseNames().eases) {
        const xs = ladder.map((_, i) => i / (ladder.length - 1));
        const ys = ladder.map((v) => (v - ladder[0]) / (ladder[ladder.length - 1] - ladder[0]));
        preset = Math.min(preset, B.bezierWorstError(B.bezierFromEase(type, ease, 1), xs, ys));
      }
    }
    assert.ok(fit.error < preset,
      name + ': the fit (' + fit.error.toFixed(4) + ') is no better than the closest preset (' +
      preset.toFixed(4) + ')');
  }
});

test('the fitted middle anchor sits on a step, not between two', () => {
  // The anchor means "the middle colour, and the step it sits on" everywhere else now, so a fit that put it
  // between two steps would be describing something the panel cannot show. Each interior index is tried as
  // the join and the halves are fitted either side of it, so the anchor lands on a real value.
  const hexes = ['#FAFAFA', '#F4F4F5', '#E4E4E7', '#D4D4D8', '#A1A1AA', '#71717A',
                 '#52525B', '#3F3F46', '#27272A', '#18181B', '#09090B'];
  const ladder = hexes.map((h) => B.oklchFromHex(h).L);
  const fit = B.bezierFitRamp(ladder);

  assert.equal(fit.curve.length, 10, 'a three-anchor fit is ten numbers');
  assert.ok(fit.anchorIndex > 0 && fit.anchorIndex < ladder.length - 1,
    'the anchor landed on an endpoint, where there is nothing to bend');

  const last = ladder.length - 1;
  const expectedX = fit.anchorIndex / last;
  const expectedY = (ladder[fit.anchorIndex] - ladder[0]) / (ladder[last] - ladder[0]);
  assert.ok(Math.abs(fit.curve[4] - expectedX) < 1e-6, 'the anchor is not on its step in x');
  assert.ok(Math.abs(B.bezierAt(fit.curve, expectedX) - expectedY) < 1e-5,
    'the curve does not pass through the value at its own anchor');
});

test('a ramp with nothing to fit comes back empty rather than inventing a shape', () => {
  assert.equal(B.bezierFitRamp([]), null);
  assert.equal(B.bezierFitRamp([0.5, 0.4]), null, 'two values cannot describe a curve');
  assert.equal(B.bezierFitRamp([0.5, 0.5, 0.5]), null, 'a flat run has no shape to recover');
});

test('overshoot lifts the y clamp but not x, and only when asked', () => {
  // Márton: a Hue curve should be able to peak above (or dip below) both its own ends, the way a plain
  // CSS `cubic-bezier()` can — the [0,1] height clamp had no mathematical reason to exist, only x does
  // (bezierAt has to stay single-valued). Confirmed live: a dragged Hue handle clamped at exactly y=1,
  // the ceiling, not wherever the pointer actually was.
  const raw = [0.5, 1.8, 0.5, -0.4];
  const clamped = B.bezierNormalise(raw);
  assert.deepEqual(Array.from(clamped), [0.5, 1, 0.5, 0], 'default (no overshoot) must clamp exactly as before');
  assert.equal(clamped.overshoot, undefined, 'the flag must not appear when it was not asked for');

  const allowed = B.bezierNormalise(raw, true);
  assert.deepEqual(Array.from(allowed), [0.5, 1.8, 0.5, -0.4], 'overshoot must preserve the real dragged height');
  assert.equal(allowed.overshoot, true, 'the array must say so, for every downstream re-normalisation');

  // x still clamps unconditionally — that is what keeps bezierAt single-valued, overshoot or not.
  const wildX = B.bezierNormalise([-0.5, 1.8, 1.5, -0.4], true);
  assert.ok(wildX[0] >= 0 && wildX[0] <= 1 && wildX[2] >= 0 && wildX[2] <= 1,
    'x must stay in range even with overshoot allowed: ' + JSON.stringify(wildX));
});

test('overshoot survives re-normalisation, the same way bezierAt and oklchCurveOf re-normalise', () => {
  // `bezierSegments` (and therefore `bezierAt`) re-normalises whatever it is handed, and so does
  // `oklchCurveOf` on the generation side — both without an explicit second argument. If the flag did
  // not ride on the array itself, an overshoot curve would draw correctly once and then be silently
  // clamped away the moment anything evaluated it, which is indistinguishable from never having fixed
  // the storage clamp at all.
  const n = B.bezierNormalise([0.34, 1.56, 0.64, 1], true);
  const again = B.bezierNormalise(n); // no explicit flag — must inherit from n.overshoot
  assert.deepEqual(Array.from(again), [0.34, 1.56, 0.64, 1], 're-normalising an overshoot curve must not clamp it');

  // And bezierAt, which normalises internally via bezierSegments, must reach the real overshoot value —
  // not whatever a clamped curve would produce at the same x, which is what a lost flag reads as. Checked
  // across the whole curve rather than at one x, since a single sample could coincidentally agree.
  const clampedN = B.bezierNormalise([0.34, 1.56, 0.64, 1]);
  let sawADifference = false;
  let sawAboveOne = false;
  for (let i = 1; i < 20; i++) {
    const x = i / 20;
    if (Math.abs(B.bezierAt(n, x) - B.bezierAt(clampedN, x)) > 1e-6) sawADifference = true;
    if (B.bezierAt(n, x) > 1) sawAboveOne = true;
  }
  assert.ok(sawADifference,
    'bezierAt agreed with the clamped curve at every sampled x — the overshoot flag was lost somewhere');
  assert.ok(sawAboveOne, 'no sampled x read above 1, even with a handle dragged past it');
});

test('adding or removing a middle point keeps the overshoot flag, without moving the curve', () => {
  const n = B.bezierNormalise([0.34, 1.56, 0.64, 1], true);
  // 0.2, not the curve's own peak — `bezierAt(n, 0.2)` is 0.70, safely inside the range the middle anchor
  // is held to (see the next test for what happens when the split point does not stay inside it).
  const split = B.bezierWithMiddle(n, 0.2);
  assert.equal(split.length, 10);
  assert.equal(split.overshoot, true, 'splitting a fresh array literal must not silently drop overshoot');
  // "Do not move the curve" still holds — checked the same way the existing middle-point test does.
  for (let i = 0; i <= 20; i++) {
    const x = i / 20;
    assert.ok(Math.abs(B.bezierAt(n, x) - B.bezierAt(split, x)) < 1e-4, `moved at x=${x}`);
  }

  const rejoined = B.bezierWithoutMiddle(split);
  assert.equal(rejoined.overshoot, true, 'collapsing back to two anchors must not drop overshoot either');
});

test('splitting where the curve already overshoots holds the new anchor to a safe range, and bends the curve to it', () => {
  /**
   * **The middle anchor's own height cannot be a real value AND a safe divisor at once, when the curve it
   * is being read off already overshoots there.** `oklchRamp` divides by it (`atMiddle`) to turn each half
   * into a 0..1 progress — confirmed live, Márton's own Hue curve: a dragged handle put the split at
   * `my = 0`, exactly the boundary, and every step in the first half read the same repeated hue while the
   * second produced hues in the hundreds of degrees. So `bezierNormalise` (`@Bezier`) now holds `my` to
   * `[0.001, 0.999]` regardless of overshoot — the same margin `mx` already had, for the same division.
   *
   * The trade-off this test exists to state plainly: **"adding a middle point does not move the curve"**,
   * true everywhere else, cannot also hold here. De Casteljau's subdivision is computed against the
   * split's real, unclamped height (`bezierAt(n, 0.4)` is 1.03, past the ceiling), and the segment past
   * `my = 0.999` — spanning only 0.001 of the curve's height — inherited tangent handles built for the
   * *original* span rather than this new sliver of one, so `bezierWithMiddle` (`@Bezier`) now resets a
   * half whose inherited handles would not survive the margin instead of clamping them into it: a plain
   * linear third-and-two-thirds between the corner and the far anchor, the same clean shape a fresh
   * split without a fixture like this one shows. Bounded, and visibly not the shape it was — a real,
   * non-negligible move, not the pixel-level rounding "moved the curve" ordinarily means, and not the
   * unbounded corruption dividing by an unclamped `my` was producing either.
   */
  const n = B.bezierNormalise([0.34, 1.56, 0.64, 1], true);
  assert.ok(B.bezierAt(n, 0.4) > 1, 'the fixture must actually overshoot at the chosen split point');
  const split = B.bezierWithMiddle(n, 0.4);
  assert.equal(split[5], 0.999, 'the middle anchor\'s own height must never leave the safe range');
  // Bounded, not unbounded — the point of this whole exercise.
  for (let i = 0; i <= 20; i++) {
    const x = i / 20;
    assert.ok(Math.abs(B.bezierAt(n, x) - B.bezierAt(split, x)) < 0.15, `shift too large at x=${x}`);
  }
  // The reset itself: linear thirds between the corner and the far anchor, not a value clamped to
  // the boundary of a margin it was never going to fit inside.
  assert.ok(Math.abs(split[7] - (0.999 + (1 - 0.999) / 3)) < 1e-6, 'segment past the corner did not reset to linear');
  assert.ok(Math.abs(split[9] - (0.999 + (1 - 0.999) * 2 / 3)) < 1e-6, 'segment past the corner did not reset to linear');
});

test('splitting a curve dragged into a real overshoot bulge resets, rather than clamps, the half that cannot survive it', () => {
  /**
   * The exact shape reported live: a two-anchor Hue curve dragged to `[0.157, -9.969, 0.709, -9.969]`
   * — a real, deliberate overshoot bulge, both handles at the same height — split at the real 16-step
   * middle fraction. Clamping the inherited handles into the tiny margin around the resulting corner
   * (`my = 0.001`, since the split lands the corner almost exactly on the curve's own near-flat
   * middle) used to leave both new handles sitting on their clamp boundaries — indistinguishable from
   * a curve that had been drawn that way, which is why it read as "the point wasn't added to the
   * curve I made, it reset." This is the fix: both halves reset to a plain linear pace instead,
   * because both inherited handles land outside the margin either would need to fit.
   */
  const wild = [0.157246, -9.969325, 0.709472, -9.969325];
  wild.overshoot = true;
  const split = B.bezierWithMiddle(wild, 0.4667);
  assert.equal(split.length, 10);
  const mx = split[4], my = split[5];
  assert.deepEqual(
    [split[0], split[1], split[2], split[3]].map((v) => Math.round(v * 1e6) / 1e6),
    [Math.round(mx / 3 * 1e6) / 1e6, Math.round(my / 3 * 1e6) / 1e6,
      Math.round(mx * 2 / 3 * 1e6) / 1e6, Math.round(my * 2 / 3 * 1e6) / 1e6],
    'the first half did not reset to a linear pace: ' + JSON.stringify(split)
  );
  const rx1 = mx + (1 - mx) / 3, ry1 = my + (1 - my) / 3;
  const rx2 = mx + (1 - mx) * 2 / 3, ry2 = my + (1 - my) * 2 / 3;
  assert.ok(Math.abs(split[6] - rx1) < 1e-4 && Math.abs(split[7] - ry1) < 1e-4 &&
    Math.abs(split[8] - rx2) < 1e-4 && Math.abs(split[9] - ry2) < 1e-4,
    'the second half did not reset to a linear pace: ' + JSON.stringify(split));
});

test('bezierMonotoneOrLinear leaves a gentle, intentional overshoot bounce alone', () => {
  /**
   * The exact segment a strict, zero-tolerance monotonicity check broke: `easeOutBack`'s second half
   * after a split at x=0.2 (see the "without moving the curve" test above), which climbs to `y=1.3584`
   * before settling back to `y=1` — a real bounce, not a bug. Its violation (the largest backtrack below
   * a height already reached, in the segment's own local unit square) is about a third of the segment's
   * own span, safely under the one-span tolerance, so the handles must come back exactly as given.
   */
  const out = B.bezierMonotoneOrLinear(0.4624, 1.3584, 0.712, 1, 0.2, 0.70304, 1, 1);
  assert.deepEqual(out, [0.4624, 1.3584, 0.712, 1],
    'a gentle overshoot bounce must survive unchanged, not reset to linear');
});

test('bezierMonotoneOrLinear resets a segment whose handles backtrack past the tolerance', () => {
  /**
   * The reported shape reproduced at the single-segment level: both handles sitting at the same height,
   * below the segment's own starting anchor — a dip before a rise, the exact non-monotone pattern that
   * reads as chaos once `oklchRamp` divides by a corner this close to it. Its violation is well over one
   * full local span, so this must give up on the inherited shape and return a plain linear third and
   * two-thirds between the two real anchors instead.
   */
  const out = B.bezierMonotoneOrLinear(0.0005, -0.002, 0.0007, -0.002, 0, 0, 0.001, 0.001);
  const linear = [0.001 / 3, 0.001 / 3, (0.001 * 2) / 3, (0.001 * 2) / 3];
  assert.ok(
    out.every((v, i) => Math.abs(v - linear[i]) < 1e-9),
    'a severely backtracking segment did not reset to a linear pace: ' + JSON.stringify(out)
  );
});

test('a tangent handle cannot out-amplify a tiny segment when generation divides by its height', () => {
  /**
   * **Márton, live, step by step: a curve with a real middle anchor near one end still generated a
   * swatch strip of unrelated pinks, blues and greens with no corner on the chart to blame.** The middle
   * anchor's own height (`my`) was already held off 0 and 1 (the test above) — the fixture here is a
   * curve whose corner sits close to an end (`my` small) but whose *tangent* handles still swing across
   * the segment's full historical [0,1] range, the same magnitude the two-anchor case draws every day.
   * `oklchRamp` turns that segment's progress into `g / my`: dividing a handle at `y = 1` by `my = 0.01`
   * reads as a progress of 100, a hundred-fold trip around the hue wheel from one adjacent step to the
   * next, which is exactly the reported symptom reproduced at the unit level for the first time — every
   * existing middle-point test up to now used a curve whose tangent handles already sat close to its own
   * corner, which is why none of them caught this.
   *
   * `bezierAt` is exercised directly here (not `oklchChannelAt`, `@OKLCH`) because the amplification is a
   * property of the *stored numbers*, not of the colour maths reading them — bounding it at the source
   * means every consumer inherits the fix, this one included.
   */
  const wild = [0.2, 0, 0.4, 1, 0.5, 0.05, 0.6, 1, 0.8, 0];
  const n = B.bezierNormalise(wild, true);
  const mid = n[5];
  assert.ok(mid > 0.001 && mid < 0.2, 'fixture must keep a real, off-centre corner: ' + mid);
  // The curve's own height anywhere in the first half must stay within the bounded amplification the
  // division can produce — `[-2, 3]` of the corner's own height, never the unclamped handle value.
  for (let i = 1; i < 20; i++) {
    const x = (i / 20) * n[4];
    const g = B.bezierAt(n, x);
    assert.ok(g > -2 * mid - 1e-9 && g < 3 * mid + 1e-9,
      `x=${x.toFixed(3)} read ${g.toFixed(3)}, outside a bounded multiple of the corner's own height ${mid.toFixed(3)}`);
  }
});

test('bezierParse takes overshoot explicitly — a freshly parsed array has nothing to inherit it from', () => {
  const text = 'cubic-bezier(0.5, 1.8, 0.5, -0.4)';
  assert.deepEqual(Array.from(B.bezierParse(text)), [0.5, 1, 0.5, 0], 'default must still clamp a pasted overshoot');
  assert.deepEqual(Array.from(B.bezierParse(text, true)), [0.5, 1.8, 0.5, -0.4],
    'explicit overshoot must be honoured');
});

test('the cheap monotone gate never passes a curve the exact one rejects', () => {
  // `bezierHandlesRise` is what makes fitting fast enough to run while a collection loads — the exact check
  // costs 65 Newton solves and the fit asks per trial, which took 1.8 seconds a ramp. It is *sufficient*,
  // not necessary, and this is the direction that has to hold: anything it accepts really is monotone.
  for (let i = 0; i < 3000; i++) {
    const q = [(i * 7) % 100 / 100, (i * 13) % 100 / 100, (i * 29) % 100 / 100, (i * 41) % 100 / 100];
    if (!B.bezierHandlesRise(q)) continue;
    assert.ok(B.bezierIsMonotone(B.bezierNormalise(q)),
      'the cheap gate accepted a curve that reverses: ' + JSON.stringify(q));
  }
});
