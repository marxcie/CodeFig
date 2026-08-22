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
      " bezierEaseNames, bezierEaseTable, bezierParse, bezierFormat, applyEase, oklchFromHex };"
  ).call(box);
  return box.E;
}
const B = load();

const FAMILIES = B.bezierEaseNames().types;
const EASES = ["in", "out", "inout", "outin"];

// The bounds from the table in `bezierEaseTable`'s comment. Written out rather than computed so that a
// fitted number drifting is a test failure with a name on it, which is the only reason the table is pinned.
const BOUND = {
  linear: 1e-6, quad: 1e-6, cubic: 1e-6,
  circ: 0.0006, sine: 0.0021, goldenRatio: 0.0023,
  quart: 0.0040, quint: 0.0077, exponential: 0.0099,
};

test("every preset stays within the error its doc block claims", () => {
  for (const type of FAMILIES) {
    for (const ease of EASES) {
      const err = B.bezierEaseError(type, ease, 1);
      assert.ok(
        err <= BOUND[type] + 1e-9,
        `${type}/${ease} is ${err.toFixed(6)} out, past the documented ${BOUND[type]}`
      );
    }
  }
});

test("linear, quad and cubic are the exact ones — they are cubics already", () => {
  for (const type of ["linear", "quad", "cubic"]) {
    for (const ease of EASES) {
      assert.ok(B.bezierEaseError(type, ease, 1) < 1e-6, `${type}/${ease} should be exact`);
    }
  }
});

test("inout and outin come back as three-point curves, the rest as two", () => {
  for (const type of FAMILIES) {
    for (const ease of EASES) {
      const want = type !== "linear" && (ease === "inout" || ease === "outin") ? 10 : 4;
      assert.equal(B.bezierFromEase(type, ease, 1).length, want, `${type}/${ease}`);
    }
  }
});

test("amount blends to linear exactly, because the x handles do not move", () => {
  for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
    for (const type of ["linear", "quad", "cubic"]) {
      assert.ok(B.bezierEaseError(type, "inout", amount) < 1e-6, `${type} at amount ${amount}`);
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
