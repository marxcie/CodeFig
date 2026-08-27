// @Bezier
// @DOC_START
// A curve as **points you can drag**, rather than a family name and an easing word. One shape serves
// every consumer: `@Color Ramp`'s lightness ladder, and the scale models behind spacing, corner radius
// and typography.
//
// ## The shape
// A curve is a **flat array of numbers**, and its length says how many anchors it has:
//
// | Length | Anchors | Meaning |
// |---|---|---|
// | `[]` | none | no curve — the consumer decides what that means (Colors reads the file's own steps) |
// | 4 | two | `x1,y1, x2,y2` — the two handles of one cubic. Exactly CSS `cubic-bezier()`. |
// | 10 | three | `x1,y1, x2,y2, mx,my, x3,y3, x4,y4` — a middle anchor with a handle either side |
//
// The end anchors are always `(0,0)` and `(1,1)` and are never stored: a scale curve that did not start
// at the start would not be a scale curve. Everything in between is yours.
//
// **A three-point curve is not a luxury — it is what `easeInOut` always was.** `applyEase` defines
// `inout` as *the in-curve over the first half, the out-curve over the second*, which is a middle anchor
// at `(0.5, 0.5)` written as an `if`. Building it as two segments is the same curve with the anchor
// exposed, which is why `bezierFromEase` returns ten numbers for `inout` and `outin` and four for the rest.
//
// ## The handles either side of the middle are independent
// Drag one and the other stays put. There is no mirror mode and no smoothing flag, because a kink at the
// middle is a thing people want: Colors has shipped two independent segment curves since the ladder
// existed, on the evidence that a real neutral ramp fits an exponent of 1.71 below the middle and 0.84
// above. A smooth curve is one you can still draw; a mode that enforced it would be a setting that
// re-derives what the coordinates already say.
//
// ## Reading a curve
// `bezierAt(curve, x)` answers *"at this fraction along, what fraction of the range?"* — it solves
// `Bx(s) = x` for `s` and returns `By(s)`, the same way a browser reads `cubic-bezier()`. It is `y` as a
// function of `x`, not of the parameter, so a handle dragged sideways changes pacing rather than shape.
// That requires `x` to advance monotonically, which `bezierNormalise` enforces by clamping each handle's
// `x` into its own segment's span. A curve that doubled back would have two answers at one step.
//
// ## Presets are a starting point, not a second truth
// `bezierFromEase(type, ease, amount)` converts any `applyEase` pair into coordinates, and that is the
// only direction that exists. Once a curve is stored it is coordinates; `bezierEaseName` looks a curve
// back up in the table so a panel can *say* "Sine · easeInOut" without storing it. Nothing reads a family
// name at generation time, so a dragged curve and a chosen preset cannot disagree.
//
// **Where the conversion is exact, and where it is not.** `linear`, `quad` and `cubic` are cubics already,
// so their curves are the functions: pin the `x` handles at `1/3` and `2/3` and `Bx(s) = s`, leaving `y` to
// be read straight off. Nothing else is a cubic. `sine`, `circ`, `quart`, `quint`, `exponential` and
// `goldenRatio` are fitted, worst-gap-first, and carry between 0.0006 and 0.0099 — see the table on
// `bezierEaseTable`. `bezierEaseError` returns the real figure for a given pair, in the units of the value
// being eased, so a migration reports what it cost instead of claiming it was free.
//
// `amount` blends toward linear and survives exactly: with the `x` handles fixed, pulling each handle's
// `y` toward its own `x` is the same operation as `t + (eased - t) × amount` on the output.
//
// ## Companion imports
// `@import` does not follow calls across scripts. The fit reads `applyEaseBaseIn`, so a consumer that
// converts presets needs it too:
//
// ```js
// @import { bezierAt, bezierNormalise, bezierFromEase, bezierParse, bezierFormat } from "@Bezier"
// @import { applyEaseBaseIn, clamp01 } from "@Math Helpers"
// ```
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Reading | bezierAt, bezierNormalise, bezierIsEmpty, bezierAnchorCount |
// | Editing | bezierWithMiddle, bezierWithoutMiddle, bezierSegments, bezierJoin, bezierSplit |
// | Presets | bezierFromEase, bezierEaseName, bezierEaseError, bezierEaseNames, bezierEaseTable |
// | Text | bezierParse, bezierFormat |
// @DOC_END

// ============================================================================
// SHAPE
// ============================================================================

/** Nothing to draw. Distinct from a linear curve, which is a curve that happens to be straight. */
function bezierIsEmpty(curve) {
  return !Array.isArray(curve) || curve.length === 0;
}

/** 0 for empty, 2 for one segment, 3 for two. Anything else is not a curve. */
function bezierAnchorCount(curve) {
  if (!Array.isArray(curve)) return 0;
  if (curve.length === 4) return 2;
  if (curve.length === 10) return 3;
  return 0;
}

/** In range. Nothing else — see `bezierStore` for the part that rounds. */
function bezierClamp01(v) {
  if (typeof v !== 'number' || !isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Finite, full stop — the height half of `bezierStore` when overshoot is allowed for this curve. */
function bezierFinite(v) {
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

/**
 * A **coordinate**, in range and settled at six decimals — unless it is a handle's own height and this
 * curve allows overshoot, in which case only finite matters.
 *
 * The rounding is not cosmetic: it is what makes a stored curve, the preset table and `bezierEaseName`
 * agree. A handle dragged across a 200px canvas carries about three useful digits, `1/3` carries infinitely
 * many, and comparing the two without a shared precision means a curve chosen from the dropdown reads back
 * as "Custom" the moment it has been through the config once.
 *
 * **Coordinates only, which is why it is not `bezierClamp01`.** The two were one function, so `bezierAt`
 * rounded the `x` it was *asked about* as well as the handles it was drawing — and a scale of eight steps
 * asks at `3/7`, which is not a six-decimal number. That put a 5e-6 kink in what was meant to be a constant
 * ratio: a straight curve stopped being exactly a modular scale, in the one property the replacement was
 * sold on. Found by `tests/scale-models.test.js` measuring the spread of the ratios rather than eyeballing
 * the numbers, which all still looked right.
 *
 * **`isY` only matters when `overshoot` is set.** `x` stays clamped regardless — see the comment on
 * `bezierNormalise` for why that one is load-bearing rather than a preference.
 */
function bezierStore(v, isY, overshoot) {
  var c = (isY && overshoot) ? bezierFinite(v) : bezierClamp01(v);
  return Math.round(c * 1e6) / 1e6;
}

/**
 * A curve that can be read: every number finite, every handle's `x` inside the span of the segment it
 * belongs to, and — for most curves — every handle's `y` in range too.
 *
 * The `x` clamp is what makes `bezierAt` single-valued. A handle dragged past its own end anchor folds the
 * curve back on itself, and `y` at that `x` becomes a question with two answers — which shows up not as an
 * error but as a scale that jumps backwards at one step. Nothing about overshoot changes this: `x` clamps
 * unconditionally, on every curve.
 *
 * **`y` is a separate question, and `overshoot` (default off) is the answer.** A cubic bezier has no
 * mathematical reason for its height to stay in `[0,1]` — only `x` needs it — and a channel whose two ends
 * can be equal or close (Hue, Saturation, Chroma) has real ramps that peak or dip past both: hue 50 at each
 * end with a real 100 in the middle is not expressible any other way on a plain two-anchor curve, because
 * `oklchLerpHue`/`oklchLerp` interpolate `bright` to `dark` linearly and a straight line between two equal
 * numbers is that number, regardless of how the curve paces getting there. Confirmed live: dragging a Hue
 * handle toward such a peak clamped at exactly `y = 1`, the ceiling, not wherever the pointer actually was.
 *
 * **Off by default, because the same shape is shared by Spacing, Radius and Typography's own scale
 * curves** (`@scale-models.js`'s `Math.pow(ratio, span * bezierAt(curve, i / span))`), where an overshoot
 * would let an interior step exceed the scale's own defined ends — a real behaviour change nobody asked
 * for. Colors' own Hue, Saturation and Chroma curve fields opt in (`field.overshoot`, from the panel
 * spec); Lightness and every curve outside Colors does not, and keeps exactly the range it always had.
 *
 * Returns a **new** array. Anything unrecognised returns `[]` rather than a guess: a curve nobody can read
 * is a thing to report, and the consumers all have a defined behaviour for no curve.
 */
function bezierNormalise(curve, overshoot) {
  // **Explicit wins; otherwise inherited from the array handed in.** `bezierAt`/`bezierSegments`/
  // `oklchCurveOf` all re-normalise a curve that has already been through here once — a curve control
  // reads its own stored attribute back on every redraw, and generation re-normalises the same array a
  // second time inside `oklchCurveOf`. None of those callers know or need to know a field's own
  // `overshoot` setting; they only have the array this function already produced, so the flag rides on
  // it (`n.overshoot`, set below) rather than needing to be threaded through every intermediate call.
  var wants = overshoot !== undefined ? overshoot : !!(curve && curve.overshoot);
  var anchors = bezierAnchorCount(curve);
  if (anchors === 0) return [];

  // **Called, not passed.** `curve.map(bezierStore)` is a bare *reference*, and `@import` finds a
  // function's dependencies with `\b(\w+)\s*\(` — so the callee was never injected and the whole Spacing
  // preview died on "bezierStore is not defined", in Figma only. `npm run validate` shares the blind spot.
  //
  // **Index 5 (the middle anchor's own height) never overshoots, even when the field asked for it.**
  // Every other Y is a tangent handle — it bends the curve *between* anchors and nothing downstream reads
  // it as a value. The middle anchor is not a handle: `oklchRamp` divides by the curve's height *at* it
  // (`atMiddle`, read via `oklchEaseAt` at the anchor's own x) to turn each half into a 0..1 progress —
  // `g / atMiddle` for the first half, `(g - atMiddle) / (1 - atMiddle)` for the second. That division
  // is sound only while `atMiddle` sits in a sane, away-from-zero span of [0,1]; once overshoot let it
  // land at exactly 0 (confirmed live: a dragged Hue handle solved to `my = 0`), the first half collapsed
  // to a single repeated hue and the second produced hues in the hundreds of degrees — a curve that drew
  // a smooth bulge and generated a swatch strip with no relationship to it. `mx` was already exempted for
  // the same reason (every consumer needs it monotonic); `my` is exempted for the reason the whole
  // per-half scheme exists: it is *pacing*, not a hue or a chroma. The actual value a user wants there —
  // beyond the ends, past 0 or past 1 — is what `middle.<channel>` is for, a plain number with no such
  // constraint. `bezierAt`, drawing, and dragging the handle on screen are all unaffected: they only ever
  // see this returned array, so a handle dragged past the plot's own edge still settles back at [0,1].
  var n = curve.map(function (v, i) { return bezierStore(v, i % 2 === 1, wants && i !== 5); });
  if (anchors === 2) {
    // One segment spanning the whole width: both handles live in [0,1] unless overshoot said otherwise.
    if (wants) n.overshoot = true;
    return n;
  }

  // The middle anchor's `x` — it is what the two spans are measured against. Held off both ends so each
  // segment keeps a width to solve across; a zero-width segment has no `x` to invert.
  var mx = n[4];
  if (mx < 0.001) mx = 0.001;
  if (mx > 0.999) mx = 0.999;
  n[4] = mx;

  // The middle anchor's `y` gets the same margin, for the same reason: `oklchRamp` divides by it (or by
  // `1 - it`), and a value sitting exactly on 0 or 1 is a division that returns a constant for the whole
  // half rather than a progress. `bezierStore` above already held it to [0,1]; this holds it off the two
  // ends of that range the same way `mx` is held off the ends of its own.
  var my = n[5];
  if (my < 0.001) my = 0.001;
  if (my > 0.999) my = 0.999;
  n[5] = my;

  n[0] = bezierSpanClamp(n[0], 0, mx);
  n[2] = bezierSpanClamp(n[2], 0, mx);
  n[6] = bezierSpanClamp(n[6], mx, 1);
  n[8] = bezierSpanClamp(n[8], mx, 1);

  /**
   * **A tangent handle's own overshoot is bounded to its segment's own span, not the full [0,1] box,
   * once there is a middle anchor to divide by — and a segment that cannot hold its inherited handles
   * within that bound *and stay monotone* starts over as a plain linear pace, rather than settling for
   * whatever clamping each handle independently produces.** `oklchRamp` turns each half into a 0..1
   * progress by dividing the curve's raw height by the corner's — `g / my` below the corner,
   * `(g - my) / (1 - my)` above it — and that division amplifies whatever a handle overshoots by by
   * `1 / my` (or `1 / (1 - my)`). Two things can go wrong once `my` sits somewhere small, like 0.001:
   *
   * 1. A handle bounded to a full [0,1] swing means nothing: a modest-looking bulge (`y = 1` at one
   *    control point, the same magnitude the two-anchor case draws every day) divides out to a
   *    progress of 1000. `bezierClamp` below holds every handle to two spans past the corner either
   *    way, bounding the *ratio* a division can produce to `[-2, 3]` regardless of how small the
   *    segment is.
   * 2. Bounding the ratio is not the same as bounding the *chaos*. Clamping each handle to that range
   *    independently can still land both of a segment's handles on the same boundary — confirmed
   *    live: a segment inherited from an already-wild curve settled at `[-0.002, -0.002]`, both
   *    handles pinned below the segment's own starting anchor. That is not a bulge, it is a dip before
   *    a rise — non-monotone — and a non-monotone `g` divided by a `my` this small does not read as
   *    "the curve went a bit further than expected", it reads as the hue wheel spun past and landed
   *    somewhere unrelated. `bezierMonotoneOrLinear` checks the *clamped* segment for monotonicity —
   *    scale-invariant, so it is exactly as sensitive whether `my` is 0.5 or 0.001 — and gives up on
   *    preserving the inherited shape in favour of the same plain linear third-and-two-thirds a fresh
   *    split without a fixture like this one already shows, rather than a value clamped to a boundary
   *    that turned out not to describe a real curve.
   *
   * One function, checked on every normalise — not only the moment a middle point is added. A curve
   * that passed this check once and is later dragged further still comes back through here on the very
   * next frame, so a drag that would produce the same dip-then-rise gets the same correction, not just
   * the original split.
   *
   * Skipped when overshoot was not asked for — those Y's are already in [0,1] from the per-element
   * store above, a tighter bound than this one, so re-checking them here would only ever be a no-op.
   */
  if (wants) {
    var seg1 = bezierMonotoneOrLinear(n[0], n[1], n[2], n[3], 0, 0, mx, my);
    n[0] = seg1[0]; n[1] = seg1[1]; n[2] = seg1[2]; n[3] = seg1[3];
    var seg2 = bezierMonotoneOrLinear(n[6], n[7], n[8], n[9], mx, my, 1, 1);
    n[6] = seg2[0]; n[7] = seg2[1]; n[8] = seg2[2]; n[9] = seg2[3];
  }
  if (wants) n.overshoot = true;
  return n;
}

/**
 * **One segment, held to a safe span and checked for monotonicity — the shared decision both halves of
 * `bezierNormalise` make.** `(x1,y1)` and `(x2,y2)` are the segment's own tangent handles; `(x0,y0)` and
 * `(x3,y3)` are its anchors (always `(0,0)` and `(mx,my)`, or `(mx,my)` and `(1,1)`). Returns the
 * handles unchanged when they already fit — two spans past the anchor's own height each way, `[y0 -
 * 2·(y3-y0), y0 + 3·(y3-y0)]` — *and* the resulting segment is monotone; a plain linear pace between
 * the two anchors otherwise, which is always both.
 *
 * Scale-invariant on purpose: rescaling the segment into its own `[0,1]` unit square before checking —
 * `bezierIsMonotone` — is what makes this exactly as strict for a corner at `my = 0.001` as for one at
 * `my = 0.5`, rather than a margin that happens to bound the ratio without ever asking whether the ratio
 * it allows still traces a sane curve.
 */
function bezierMonotoneOrLinear(x1, y1, x2, y2, x0, y0, x3, y3) {
  var spanX = x3 - x0, spanY = y3 - y0;
  var loY = y0 + -2 * spanY, hiY = y0 + 3 * spanY;
  var withinMargin = y1 >= Math.min(loY, hiY) && y1 <= Math.max(loY, hiY) &&
    y2 >= Math.min(loY, hiY) && y2 <= Math.max(loY, hiY);
  var local = [(x1 - x0) / spanX, (y1 - y0) / spanY, (x2 - x0) / spanX, (y2 - y0) / spanY];
  local.overshoot = true;
  var n = bezierNormalise(local, true);
  // The largest drop below any height already reached, sampled the same way `bezierIsMonotone` does —
  // 0 for a curve that never backtracks, and otherwise how far it backtracks, in units of the
  // segment's own local span (which is why the anchors are always `(0,0)` and `(1,1)` here: this is
  // scale-invariant, not a distance in real coordinates).
  //
  // **A tolerance, not a strict gate — the easing families this whole feature exists to allow
  // (`easeOutBack` among them) are non-monotone by design, and `bezierIsMonotone`'s own zero-tolerance
  // rejects every one of them.** Checked against both fixtures directly: `easeOutBack`'s own bounce
  // backtracks by about a third of the segment's height (0.33) and is exactly the shape this margin
  // exists to let through; the reported chaotic segment backtracks by more than the segment's *entire*
  // height (1.39) — not a gentle overshoot settling back, but the curve reversing across most of its own
  // span. One span is the line between them: a backtrack that never exceeds what the segment climbed in
  // the first place reads as an ordinary easing; a backtrack larger than the climb itself is a different
  // kind of shape, one this division was never going to make sense of.
  var previous = -Infinity, violation = 0;
  for (var i = 0; i <= 64; i++) {
    var v = bezierAt(n, i / 64);
    if (v < previous) violation = Math.max(violation, previous - v);
    previous = Math.max(previous, v);
  }
  if (withinMargin && violation <= 1) return [x1, y1, x2, y2];
  return [x0 + spanX / 3, y0 + spanY / 3, x0 + spanX * 2 / 3, y0 + spanY * 2 / 3];
}

function bezierSpanClamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The curve as segments, each `{ x0, y0, x1, y1, x2, y2, x3, y3 }` in absolute coordinates.
 *
 * Absolute rather than per-segment-normalised on purpose: the editor draws in this space, `bezierAt`
 * solves in it, and a segment that carried its own 0-to-1 frame would need converting at both.
 *
 * No `overshoot` parameter of its own — `bezierNormalise(curve)` inherits it from `curve.overshoot`,
 * which is already set correctly by whoever produced this array (see the comment there).
 */
function bezierSegments(curve) {
  var n = bezierNormalise(curve);
  if (n.length === 4) {
    return [{ x0: 0, y0: 0, x1: n[0], y1: n[1], x2: n[2], y2: n[3], x3: 1, y3: 1 }];
  }
  if (n.length === 10) {
    return [
      { x0: 0, y0: 0, x1: n[0], y1: n[1], x2: n[2], y2: n[3], x3: n[4], y3: n[5] },
      { x0: n[4], y0: n[5], x1: n[6], y1: n[7], x2: n[8], y2: n[9], x3: 1, y3: 1 }
    ];
  }
  return [];
}

// ============================================================================
// READING
// ============================================================================

function bezierCubic(a, b, c, d, s) {
  var m = 1 - s;
  return a * m * m * m + 3 * b * m * m * s + 3 * c * m * s * s + d * s * s * s;
}

function bezierCubicSlope(a, b, c, d, s) {
  var m = 1 - s;
  return 3 * m * m * (b - a) + 6 * m * s * (c - b) + 3 * s * s * (d - c);
}

/**
 * `s` such that `Bx(s) = x`, by Newton-Raphson with a bisection fallback.
 *
 * Newton alone is not enough: on a handle pinned to its end anchor the slope reaches zero, and a division
 * by it walks off the curve. Bisection cannot fail on a monotonic `x` — which `bezierNormalise` is what
 * guarantees — so it is the floor rather than the first resort.
 */
function bezierSolve(seg, x) {
  var span = seg.x3 - seg.x0;
  if (span <= 0) return 0;
  var s = (x - seg.x0) / span;
  var i;
  for (i = 0; i < 8; i++) {
    var err = bezierCubic(seg.x0, seg.x1, seg.x2, seg.x3, s) - x;
    if (Math.abs(err) < 1e-9) return s;
    var slope = bezierCubicSlope(seg.x0, seg.x1, seg.x2, seg.x3, s);
    if (Math.abs(slope) < 1e-9) break;
    s -= err / slope;
    if (s < 0) s = 0;
    else if (s > 1) s = 1;
  }
  var lo = 0;
  var hi = 1;
  s = (x - seg.x0) / span;
  for (i = 0; i < 40; i++) {
    var at = bezierCubic(seg.x0, seg.x1, seg.x2, seg.x3, s);
    if (Math.abs(at - x) < 1e-9) return s;
    if (at < x) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return s;
}

/**
 * `y` at `x`: the fraction of the range reached at this fraction along.
 *
 * An empty curve is the identity, so a consumer that has not been given a curve produces the straight
 * ramp rather than nothing. That is the same answer `applyEase` gives for `ease: 'none'`.
 */
function bezierAt(curve, x) {
  var t = bezierClamp01(x);
  var segs = bezierSegments(curve);
  if (!segs.length) return t;
  var seg = segs.length === 1 || t <= segs[0].x3 ? segs[0] : segs[1];
  return bezierCubic(seg.y0, seg.y1, seg.y2, seg.y3, bezierSolve(seg, t));
}

// ============================================================================
// EDITING
//
// Adding and removing the middle anchor. Both are shape changes the editor makes on a click, and both
// have one job: **do not move the curve**. An anchor that appears and bends the ramp under it reads as a
// bug in the generator rather than a click that added a point.
// ============================================================================

/**
 * Two anchors becomes three, splitting at `x` and leaving the curve exactly where it was.
 *
 * De Casteljau's subdivision, which is the only construction that holds that promise: it produces the two
 * cubics whose union *is* the original cubic, rather than two curves fitted near it.
 */
function bezierWithMiddle(curve, at) {
  var segs = bezierSegments(curve);
  if (segs.length !== 1) return bezierNormalise(curve);
  var seg = segs[0];
  var s = bezierSolve(seg, bezierClamp01(typeof at === 'number' ? at : 0.5));
  if (s < 0.001) s = 0.001;
  if (s > 0.999) s = 0.999;

  function split(a, b, c, d) {
    var ab = a + (b - a) * s;
    var bc = b + (c - b) * s;
    var cd = c + (d - c) * s;
    var abc = ab + (bc - ab) * s;
    var bcd = bc + (cd - bc) * s;
    var mid = abc + (bcd - abc) * s;
    return { l1: ab, l2: abc, m: mid, r1: bcd, r2: cd };
  }
  var X = split(seg.x0, seg.x1, seg.x2, seg.x3);
  var Y = split(seg.y0, seg.y1, seg.y2, seg.y3);
  // A fresh array literal, not derived from `curve` by reference — `overshoot` has to be threaded
  // through explicitly here or the split loses it, however the original curve was normalised.
  //
  // De Casteljau reproduces the original curve exactly, tangent handles included — sound for an
  // ordinary curve, and not for a segment whose inherited handle sits far outside what the new corner
  // can safely divide by. Nothing special-cased here for that: `bezierNormalise` checks every segment
  // it is handed for exactly this on every call, split or otherwise (`bezierMonotoneOrLinear`), so a
  // half that cannot survive the split gets the same plain linear reset a direct drag would.
  return bezierNormalise([X.l1, Y.l1, X.l2, Y.l2, X.m, Y.m, X.r1, Y.r1, X.r2, Y.r2],
    !!(curve && curve.overshoot));
}

/**
 * Three anchors becomes two. The middle goes and the outer handles are kept, scaled back up to the full
 * width — the closest single cubic to what was on screen, which is as much as two handles can hold.
 *
 * Lossy by nature, and the editor says so before it does it. There is no way to store the discarded
 * middle for an undo that would not be state disagreeing with the coordinates.
 */
/**
 * **Is the middle anchor a smooth node or a corner?**
 *
 * A three-anchor curve stores two segments whose inner handles are independent, so they meet at the point
 * but need not meet at the tangent. Collinear through the anchor is a smooth node; anything else is a
 * corner. Nothing records which — the coordinates already say, and asking them is what keeps a second,
 * disagreeable copy from existing.
 *
 * **The stored form is absolute**, in one unit square across the whole curve: `bezierAt` normalises each
 * half as it evaluates, so collinearity here *is* collinearity in the ramp. There is no local-to-global
 * conversion to get wrong.
 *
 * The tolerance is on the sine of the angle between the two arms — a direction test, so it does not tighten
 * as the handles get shorter.
 */
function bezierNodeIsSmooth(curve) {
  var c = bezierNormalise(curve);
  if (c.length !== 10) return false;
  var inX = c[4] - c[2], inY = c[5] - c[3];
  var outX = c[6] - c[4], outY = c[7] - c[5];
  var inLen = Math.sqrt(inX * inX + inY * inY);
  var outLen = Math.sqrt(outX * outX + outY * outY);
  // A zero-length arm has no direction to disagree with, so it cannot be a corner.
  if (inLen < 1e-9 || outLen < 1e-9) return true;
  var cross = (inX * outY - inY * outX) / (inLen * outLen);
  return Math.abs(cross) < 1e-3;
}

/**
 * **Move one inner handle and bring the other with it**, collinear through the middle anchor.
 *
 * `moved` is the index of the handle that was just dragged — 2 for the one before the anchor, 6 for the one
 * after. The other keeps its own distance from the anchor and takes the opposite direction, which is how
 * every vector tool behaves and is the only thing that removes the kink: the two segments then share a
 * tangent as well as a point.
 *
 * Called only when the node was *already* smooth. A curve fitted to a real ramp may have a genuine corner
 * — lime's file is a plateau with a knee at each end — and mirroring on touch would destroy exactly the
 * fits the recogniser works to produce.
 */
function bezierMirrorNode(curve, moved) {
  // Captured before `.slice()`, which copies the ten numbers but not properties riding on the array —
  // `c.overshoot` would otherwise read `undefined` on every line below, however `curve` was normalised.
  var overshoot = curve && curve.overshoot;
  var c = bezierNormalise(curve).slice();
  if (c.length !== 10) return c;
  var other = moved === 2 ? 6 : 2;
  var mx = c[4], my = c[5];
  var dx = c[moved] - mx, dy = c[moved + 1] - my;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return c;
  var otherLen = Math.sqrt(Math.pow(c[other] - mx, 2) + Math.pow(c[other + 1] - my, 2));
  c[other] = mx - (dx / len) * otherLen;
  c[other + 1] = my - (dy / len) * otherLen;
  return bezierNormalise(c, overshoot);
}

function bezierWithoutMiddle(curve) {
  var segs = bezierSegments(curve);
  if (segs.length !== 2) return bezierNormalise(curve);
  var first = segs[0];
  var second = segs[1];

  // Each end keeps the **direction** it left on, so the curve still starts and finishes the way it looked.
  // Scaling a handle's offset from its anchor by the same factor in x and y is what preserves a direction;
  // the factor is the segment's share of the full width, so a handle that reached a third of the way across
  // its segment reaches a third of the way across the whole curve.
  var lead = first.x3 - first.x0;
  var tail = second.x3 - second.x0;
  var k1 = lead > 0 ? 1 / lead : 1;
  var k2 = tail > 0 ? 1 / tail : 1;

  // A fresh array literal — same reason `bezierWithMiddle` threads `overshoot` explicitly rather than
  // relying on it riding along by reference.
  return bezierNormalise([
    first.x1 * k1,
    first.y1 * k1,
    1 + (second.x2 - 1) * k2,
    1 + (second.y2 - 1) * k2
  ], curve && curve.overshoot);
}

// ============================================================================
// PRESETS
//
// One direction only: a family and an easing become coordinates. Nothing converts back, because a stored
// curve is coordinates and a name beside them would be a second truth about the same shape.
// ============================================================================

function bezierEaseNames() {
  return {
    types: ['linear', 'sine', 'quad', 'cubic', 'quart', 'quint', 'circ', 'exponential', 'goldenRatio'],
    eases: ['none', 'in', 'out', 'inout', 'outin']
  };
}

/**
 * The best cubic for each of `applyEase`'s families, over its `in` direction, as `[x1,y1,x2,y2]`.
 *
 * **These are fitted numbers, not derived ones**, and they are shipped rather than computed because the
 * fit is a minimax search — the thing being minimised is the *largest* gap, which is not smooth and needs
 * multiple starts to find. Running that on every preview render to rediscover nine constants would be
 * silly; `tests/bezier.test.js` re-measures each row against the function it stands for and fails if one
 * drifts past the bound in the table below, which is the part worth pinning.
 *
 * | Family | Worst gap | |
 * |---|---|---|
 * | `linear`, `quad`, `cubic` | 3e-7 | **exact** — these *are* cubics, so the curve is the function, and
 * all that is left is the six-place rounding every stored curve gets |
 * | `circ` | 0.0006 | |
 * | `sine`, `goldenRatio` | 0.0021 | |
 * | `quart` | 0.0040 | |
 * | `quint` | 0.0077 | |
 * | `exponential` | 0.0099 | the steepest, and the least cubic-shaped |
 *
 * The gap is in the units of the value being eased, so 0.0099 on a 0-to-1 lightness ladder is 1% of the
 * range at one point on the curve. `bezierEaseError` returns the real number for a given pair, so a
 * migration reports what it did rather than asserting it was free.
 */
function bezierEaseTable() {
  return {
    linear: [1 / 3, 1 / 3, 2 / 3, 2 / 3],
    sine: [0.346167, 0, 0.665779, 0.464762],
    quad: [1 / 3, 0, 2 / 3, 1 / 3],
    cubic: [1 / 3, 0, 2 / 3, 0],
    quart: [0.502468, 0, 0.747187, 0],
    quint: [0.63252, 0, 0.789992, 0],
    circ: [0.553217, 0, 1, 0.45],
    exponential: [0.785593, 0, 0.856653, 0.116237],
    goldenRatio: [0.349362, 0, 0.666654, 0.261833]
  };
}

/**
 * **The `easeInOut` of each family, as one cubic.**
 *
 * It used to be built — the in-curve over the first half, the out-curve over the second — which is what the
 * name says and which stored it as *two segments joined by a middle anchor*. That is a storage detail and
 * it leaked: a colour channel travels through its middle anchor value when its curve has a middle point,
 * so `Sine · easeInOut` on a saturation ramp routed it through a middle of 83 while its ends were 100 and
 * 90. A preset named for smoothness put a corner in, twice, and the heuristic that would have let both
 * coexist — "an anchor at dead centre is not a real corner" — is wrong for any ramp whose peak lands on the
 * exact middle step. Amber's does.
 *
 * So the geometry is made honest: ten numbers now means a corner somebody put there, with no exception to
 * remember.
 *
 * **Fitted, not hand-picked.** Least squares against `applyEase` on 65 samples, so a change to
 * `bezierEaseTable` can be carried through by re-running the fit rather than by taste. Minimax — what
 * `bezierFitSegment` uses — sits on a plateau here: reaching `0.36 / 0.64` from `0.42 / 0.58` needs both
 * handles to move at once while either alone makes the far side worse, and eight families collapsed into
 * three identical curves when it was tried.
 *
 * The cost, measured: `sine` is 0.0002 out, `goldenRatio` and `quad` under 0.004, `circ` and `exponential`
 * the worst at 0.036. **`quad` and `cubic` stop being exact**, which they were as two segments, and that is
 * the price of the trade.
 *
 * **`outin` is not here, because a single cubic cannot do it.** Out-then-in is steep at both ends and flat
 * in the middle; the best cubic is 0.04 out on `sine` and 0.15 on `exponential`, which is not an
 * approximation, it is a different curve. It stays two-segment and keeps its middle anchor.
 */
function bezierEaseInOutTable() {
  return {
    linear: [1 / 3, 1 / 3, 2 / 3, 2 / 3],
    sine: [0.3644, 0, 0.6356, 1],
    quad: [0.4759, 0.0352, 0.5249, 0.9659],
    cubic: [0.654, 0, 0.346, 1],
    quart: [0.7682, 0, 0.2318, 1],
    quint: [0.8389, 0, 0.1611, 1],
    circ: [0.8737, 0.1276, 0.1263, 0.8724],
    exponential: [0.8986, 0, 0.1014, 1],
    goldenRatio: [0.5124, 0.0153, 0.4876, 0.9847]
  };
}

/** The same curve run backwards: `easeOut(t) = 1 - easeIn(1 - t)` is a 180° rotation about the centre. */
function bezierReflect(quad) {
  return [1 - quad[2], 1 - quad[3], 1 - quad[0], 1 - quad[1]];
}

/** A unit-square cubic placed into a sub-rectangle — the `0.5 × ease(2t)` construction, as geometry. */
function bezierPlace(quad, x0, y0, x1, y1) {
  var w = x1 - x0;
  var h = y1 - y0;
  return [x0 + quad[0] * w, y0 + quad[1] * h, x0 + quad[2] * w, y0 + quad[3] * h];
}

/**
 * `applyEase(type, ease, ·)` as coordinates.
 *
 * `inout` and `outin` come back as **ten** numbers, because that is what they are: `applyEase` splits them
 * at the halfway point and runs a different direction either side, which is a middle anchor at `(0.5,0.5)`.
 * Writing them as one cubic would be an approximation of something that has an exact form.
 *
 * `amount` (1 by default, and 0 to 100 in a panel divided by 100) blends toward linear by pulling each
 * handle's `y` toward its own `x`. With the `x` handles fixed that is exactly `t + (eased - t) × amount`
 * on the output, so a config carrying an amount converts without residue.
 */
function bezierFromEase(type, ease, amount) {
  var t = typeof type === 'string' && type ? type : 'linear';
  var e = typeof ease === 'string' && ease ? ease : 'none';
  var a = typeof amount === 'number' && isFinite(amount) ? bezierClamp01(amount) : 1;

  var out;
  if (t === 'linear' || e === 'none') {
    out = [1 / 3, 1 / 3, 2 / 3, 2 / 3];
  } else {
    var base = bezierEaseTable()[t] || bezierEaseTable().linear;
    if (e === 'in') out = base;
    else if (e === 'out') out = bezierReflect(base);
    else {
      if (e === 'inout') {
        out = (bezierEaseInOutTable()[t] || bezierEaseInOutTable().linear).slice();
      } else {
        // `outin` stays two segments: no single cubic is within 0.04 of it, and several are 0.15 out.
        var lo = bezierPlace(bezierReflect(base), 0, 0, 0.5, 0.5);
        var hi = bezierPlace(base, 0.5, 0.5, 1, 1);
        out = [lo[0], lo[1], lo[2], lo[3], 0.5, 0.5, hi[0], hi[1], hi[2], hi[3]];
      }
    }
  }
  return bezierNormalise(bezierBlendToLinear(out, a));
}

/** Toward the straight line, by moving each handle's `y` to its own `x`. Anchors do not move. */
function bezierBlendToLinear(curve, amount) {
  if (amount >= 1) return curve.slice();
  var a = bezierClamp01(amount);
  var out = curve.slice();
  var pairs = out.length === 10 ? [0, 2, 6, 8] : [0, 2];
  for (var i = 0; i < pairs.length; i++) {
    var xi = pairs[i];
    out[xi + 1] = out[xi] + (out[xi + 1] - out[xi]) * a;
  }
  // A middle anchor sits on the line it is blending toward, so it slides to `(mx, mx)` rather than staying
  // put — otherwise an amount of 0 leaves a kink in what is meant to be a straight ramp.
  if (out.length === 10) out[5] = out[4] + (out[5] - out[4]) * a;
  return out;
}

/**
 * How far a converted preset actually is from the function it replaces, as the largest gap in `y` over the
 * curve — the same units as the value it eases, so 0.004 on a 0-to-1 lightness ladder is 0.4% of the range.
 *
 * Exists so a migration can print the number. "Converted to a bezier" with nothing beside it is the kind of
 * claim that is right for `quad` and wrong for `circ`, and the difference is not visible in the config.
 */
function bezierEaseError(type, ease, amount) {
  var curve = bezierFromEase(type, ease, amount);
  var a = typeof amount === 'number' && isFinite(amount) ? bezierClamp01(amount) : 1;
  var worst = 0;
  for (var i = 0; i <= 64; i++) {
    var x = i / 64;
    var want = applyEase(type, ease, x);
    if (a < 1) want = x + (want - x) * a;
    var got = bezierAt(curve, x);
    var gap = Math.abs(want - got);
    if (gap > worst) worst = gap;
  }
  return worst;
}

/**
 * The preset this curve came from, or null for one that has been dragged.
 *
 * For display only — a panel showing "Sine · easeInOut" instead of four numbers. Nothing generation-side
 * reads it, so a curve one nudge away from a preset says "Custom" and still produces exactly the curve on
 * screen. Matching is on the coordinates to six places, which is equality for a stored curve, not a
 * tolerance for a nearby one.
 */
function bezierEaseName(curve) {
  var n = bezierNormalise(curve);
  if (!n.length) return null;
  var names = bezierEaseNames();
  for (var t = 0; t < names.types.length; t++) {
    for (var e = 0; e < names.eases.length; e++) {
      var candidate = bezierFromEase(names.types[t], names.eases[e], 1);
      if (candidate.length !== n.length) continue;
      var same = true;
      for (var i = 0; i < n.length; i++) {
        if (Math.round(candidate[i] * 1e6) !== Math.round(n[i] * 1e6)) { same = false; break; }
      }
      if (same) return { type: names.types[t], ease: names.eases[e] };
    }
  }
  return null;
}

/**
 * Two segment curves and the anchor between them, as one three-point curve.
 *
 * **This is not a conversion so much as a spelling change.** A ladder described by a *lower* curve and an
 * *upper* curve — each normalised into its own half — already *is* a single curve with a middle anchor;
 * the two halves are that curve written in two pieces. Colours had it the long way round because the
 * three-point form did not exist when it was built.
 *
 * `mx` and `my` are where the join sits in the whole curve's own square: for a lightness ladder that is
 * the step the middle anchor lands on, and how far the middle lightness is from bright towards dark.
 *
 * Exact, and exactly reversible — checked against the real `oklchLadder` to 3e-7, which is the six-decimal
 * storage rounding and nothing else. It is the same construction `bezierFromEase` uses for `inout`, which
 * is itself two halves pretending to be one curve.
 */
function bezierJoin(lower, upper, mx, my) {
  var x = bezierClamp01(mx);
  var y = bezierClamp01(my);
  var lo = bezierPlace(bezierHalf(lower), 0, 0, x, y);
  var hi = bezierPlace(bezierHalf(upper), x, y, 1, 1);
  return bezierNormalise([lo[0], lo[1], lo[2], lo[3], x, y, hi[0], hi[1], hi[2], hi[3]]);
}

/**
 * One half of a join, as the single cubic a half has to be.
 *
 * **A three-point half does not survive, and cannot.** Two halves that each have a middle anchor are five
 * anchors between them; a curve holds three. So a half like that is collapsed with `bezierWithoutMiddle`.
 * Every `easeInOut` and `easeOutIn` is three-point, so this is the case a colour config written before the
 * editor actually hits.
 *
 * The loss is **inherent, not a weak collapse** — fitting the closest single cubic instead of matching the
 * tangents was tried and converged on the same answer, because a curve that leaves and arrives flat pins
 * both handles to the axes whatever family it came from. `quad · easeInOut` and `cubic · easeInOut`
 * therefore land on the same ladder. That is the price of one curve instead of two, and it is the shape
 * that was asked for: a middle, and a custom bend either side of it.
 *
 * Nothing (`[]`) is the straight line, which is what makes a ladder on *Original* joinable at all.
 */
/**
 * The same curve, with its middle anchor moved **to** `(mx, my)`.
 *
 * `bezierWithMiddle` *adds* an anchor without changing the shape; this one *places* it, which is the
 * operation a ladder needs. Both halves keep their shape and are re-fitted either side of the new join, so
 * asking for the anchor the curve already has returns the curve unchanged.
 *
 * A curve with no middle anchor grows one at `mx` first — de Casteljau, so that step alone moves nothing —
 * and only then is the anchor placed. That is why locking a seed onto a two-point curve does not have to be
 * a different code path from locking it onto a three-point one.
 *
 * This is the whole of re-anchoring now. A ladder used to be re-anchored by rebuilding it with a different
 * `middle` *lightness* while the curve stayed put, which is how the middle came to be stored in two places
 * that could disagree. The curve carries it, so there is one place to move it.
 */
/**
 * The worst distance between a curve and a set of points, which is the number a fit is judged on.
 *
 * **Worst, not average.** A ramp is looked at all at once: one step that sits wrong is visible next to its
 * neighbours however well the other ten fit. Least-squares would trade that step away to improve nine that
 * were already right.
 */
function bezierWorstError(curve, xs, ys) {
  var worst = 0;
  for (var i = 0; i < xs.length; i++) {
    var d = Math.abs(bezierAt(curve, xs[i]) - ys[i]);
    if (d > worst) worst = d;
  }
  return worst;
}

/**
 * Is this curve monotone over the samples? A ladder that doubles back is not a ladder.
 *
 * Checked on a fixed grid rather than solved for: the fit only has to *reject* a shape, and a curve that
 * reverses anywhere a ramp is read will reverse on 64 evenly spaced points.
 */
/**
 * **Monotone by construction, in four comparisons.**
 *
 * For a cubic from (0,0) to (1,1) the derivative is
 * `3[y1(1-t)^2 + 2(y2-y1)(1-t)t + (1-y2)t^2]`, so `0 <= y1 <= y2 <= 1` makes all three coefficients
 * non-negative and the whole thing cannot turn back. The same holds of x, which keeps the curve a
 * function of x rather than a loop.
 *
 * This is a *sufficient* condition, not a necessary one — some monotone curves fail it — and that is the
 * trade it exists for. `bezierIsMonotone` costs 65 evaluations, each a Newton solve, and the fit asks the
 * question once per trial: with the exact test a single ramp took **1.8 seconds**, which is not a thing
 * that can run while a collection loads. The search is narrowed slightly and the answer arrives in
 * milliseconds. The exact test still gates the finished curve.
 */
function bezierHandlesRise(quad) {
  return quad[0] >= 0 && quad[0] <= quad[2] && quad[2] <= 1 &&
         quad[1] >= 0 && quad[1] <= quad[3] && quad[3] <= 1;
}

function bezierIsMonotone(curve) {
  var previous = -Infinity;
  for (var i = 0; i <= 64; i++) {
    var v = bezierAt(curve, i / 64);
    if (v < previous - 1e-9) return false;
    previous = v;
  }
  return true;
}

/**
 * One cubic segment fitted to `(xs, ys)`, by coordinate descent from several starts.
 *
 * **Started from the presets, because real ramps look like them.** A hand-made ladder is usually somebody
 * approximating an easing by eye, so the named curves are close to the answer and descending from them
 * lands in the right basin. Starting from one place — or from random points, which a workflow cannot do
 * reproducibly anyway — is how a fitter returns a plausible shape that is 10% out.
 *
 * The step halves until it stops paying, which is enough for a value that is drawn at a few hundred pixels
 * and stored to six decimals.
 */
function bezierFitSegment(xs, ys) {
  var starts = [[0.25, 0.1, 0.75, 0.9], [0.42, 0, 0.58, 1], [0.1, 0.5, 0.9, 0.5],
                [0.6, 0.05, 0.4, 0.95], [0.33, 0.33, 0.67, 0.67]];
  var best = null;
  for (var s = 0; s < starts.length; s++) {
    var c = starts[s].slice();
    // **Measured on the trial itself, not on a normalised copy of it.** `c` is four numbers already inside
    // [0,1] — `bezierClamp01` put them there — so normalising is a fresh array and four roundings per
    // evaluation, of which there are several hundred per fit. The winner is normalised once, below, which
    // is where the stored form has to be right.
    var err = bezierWorstError(c, xs, ys);
    // **The floor is 8e-3, not smaller.** Below it the descent keeps working and stops improving: measured
    // across sixteen real ramps, dropping from 2e-3 to 8e-3 leaves the worst fit at exactly 1.39 lightness
    // points and takes 28% off the time. A control point is drawn at a few hundred pixels and stored to six
    // decimals; refining it past a thousandth is arithmetic nobody can see.
    for (var step = 0.25; step > 8e-3; step *= 0.5) {
      var moved = true;
      while (moved) {
        moved = false;
        for (var k = 0; k < c.length; k++) {
          for (var d = 0; d < 2; d++) {
            var delta = d === 0 ? step : -step;
            var trial = c.slice();
            trial[k] = bezierClamp01(trial[k] + delta);
            if (!bezierHandlesRise(trial)) continue;
            var v = bezierWorstError(trial, xs, ys);
            if (v < err - 1e-12) { c = trial; err = v; moved = true; }
          }
        }
      }
    }
    if (!best || err < best.error) best = { curve: bezierNormalise(c), error: err };
  }
  return best;
}

/**
 * **The curve an existing ramp was drawn with**, recovered from the ramp itself.
 *
 * `values` are read in order, lightest to darkest or smallest to largest — whatever the ladder's own
 * direction is. They are normalised into the unit square against their own ends, so what comes back
 * describes the *shape* and carries none of the range: the same curve fits a ramp from 98 to 4 and one
 * from 0.98 to 0.04.
 *
 * → `{ curve, error, anchorIndex }`, or `null` for fewer than three values or a flat run. `error` is in
 * normalised units — multiply by the span to read it in the ladder's own numbers.
 *
 * **Three anchors are found by putting the middle one *on a step*.** Every interior index is tried as the
 * join, each half is fitted over its own range, and the halves are joined there. So the anchor lands on a
 * real value rather than between two, which is also what the anchor means everywhere else now: the middle
 * colour, and the step it sits on. A two-anchor fit is returned when it is no worse, because a curve with
 * a middle point it does not need is a control with a handle that does nothing.
 */
function bezierFitRamp(values, maxAnchors) {
  if (!values || values.length < 3) return null;
  var last = values.length - 1;
  var span = values[last] - values[0];
  if (!(Math.abs(span) > 1e-9)) return null;

  var xs = [], ys = [];
  for (var i = 0; i <= last; i++) {
    xs.push(i / last);
    ys.push((values[i] - values[0]) / span);
  }

  var flat = bezierFitSegment(xs, ys);
  var best = flat ? { curve: flat.curve, error: flat.error, anchorIndex: null } : null;
  if (maxAnchors === 2) return best;

  /**
   * **At most sixteen anchor positions tried, then refined around the winner.**
   *
   * Every candidate costs two half-fits and every half-fit's error is measured over the whole ramp, so
   * trying all of them is quadratic: a 40-step scale spent 1.9 seconds here against 0.15 for an 11-step
   * one. A ramp is a smooth thing, so the best anchor is not hiding between two adjacent steps — sampling
   * the range and then walking the neighbourhood of the winner finds the same one.
   *
   * When there are sixteen or fewer interior steps the stride is 1 and the refinement adds nothing, so
   * every real scale in the library takes exactly the path it took before.
   */
  var stride = Math.max(1, Math.ceil((last - 1) / 16));
  var coarse = [];
  for (var c = 1; c < last; c += stride) coarse.push(c);
  if (coarse[coarse.length - 1] !== last - 1 && last - 1 >= 1) coarse.push(last - 1);

  var tried = {};
  function consider(k) {
    if (k < 1 || k > last - 1 || tried[k]) return;
    tried[k] = true;
    // Each half over its own range, normalised into its own unit square — which is exactly the shape
    // `bezierJoin` places back either side of the anchor.
    var loX = [], loY = [], hiX = [], hiY = [];
    var mx = xs[k], my = ys[k];
    if (!(mx > 1e-6) || !(mx < 1 - 1e-6)) return;
    if (!(Math.abs(my) > 1e-9) || !(Math.abs(1 - my) > 1e-9)) return;
    for (var a = 0; a <= k; a++) { loX.push(xs[a] / mx); loY.push(ys[a] / my); }
    for (var b = k; b <= last; b++) {
      hiX.push((xs[b] - mx) / (1 - mx));
      hiY.push((ys[b] - my) / (1 - my));
    }
    var lo = bezierFitSegment(loX, loY);
    var hi = bezierFitSegment(hiX, hiY);
    if (!lo || !hi) return;
    var joined = bezierJoin(lo.curve, hi.curve, mx, my);
    if (!bezierIsMonotone(joined)) return;
    var error = bezierWorstError(joined, xs, ys);
    if (!best || error < best.error - 1e-9) best = { curve: joined, error: error, anchorIndex: k };
  }

  for (var ci = 0; ci < coarse.length; ci++) consider(coarse[ci]);
  if (stride > 1 && best && best.anchorIndex !== null) {
    for (var r = best.anchorIndex - stride + 1; r <= best.anchorIndex + stride - 1; r++) consider(r);
  }
  return best;
}

function bezierThrough(curve, mx, my) {
  var x = bezierClamp01(mx);
  var y = bezierClamp01(my);
  var n = bezierNormalise(curve);
  if (bezierIsEmpty(n)) return n;
  if (bezierAnchorCount(n) < 3) n = bezierWithMiddle(n, x);
  var parts = bezierSplit(n);
  if (!parts) return n;
  return bezierJoin(parts.lower, parts.upper, x, y);
}

function bezierHalf(curve) {
  var points = bezierNormalise(curve);
  if (points.length === 4) return points;
  if (points.length === 10) return bezierWithoutMiddle(points);
  return bezierFromEase('linear', 'none', 1);
}

/**
 * The inverse: a three-point curve as the two halves it is made of, each back in its own unit square.
 *
 * → `{ lower, upper, mx, my }`, or `null` for a curve that has no middle anchor to split at. A two-point
 * curve is not two halves — that is the whole point of being able to have one.
 */
function bezierSplit(curve) {
  var n = bezierNormalise(curve);
  if (n.length !== 10) return null;
  var mx = n[4];
  var my = n[5];
  function unplace(x1, y1, x2, y2, x0, y0, w, h) {
    var dx = w - x0;
    var dy = h - y0;
    return bezierNormalise([
      dx ? (x1 - x0) / dx : 0, dy ? (y1 - y0) / dy : 0,
      dx ? (x2 - x0) / dx : 1, dy ? (y2 - y0) / dy : 1
    ]);
  }
  return {
    mx: mx,
    my: my,
    lower: unplace(n[0], n[1], n[2], n[3], 0, 0, mx, my),
    upper: unplace(n[6], n[7], n[8], n[9], mx, my, 1, 1)
  };
}

// ============================================================================
// TEXT
//
// The paste target. A curve is four or ten numbers and people already have them in that form — from a
// browser's dev tools, from cubic-bezier.com, from another config — so the field takes what they have
// rather than a spelling invented here.
// ============================================================================

/**
 * Numbers out of text. Accepts `cubic-bezier(.37,0,.63,1)`, the bare list `.37, 0, .63, 1`, the JSON array
 * `[0.37, 0, 0.63, 1]` a config block holds, and the ten-number form of any of them, with any mix of commas
 * and spaces.
 *
 * → an array, or `null` for anything that is not a curve. Null rather than a partial read: a field that
 * accepted three numbers and filled in the fourth would be guessing at the shape of someone's paste.
 *
 * `overshoot`, explicit — the numbers parsed here are a fresh array with nothing to inherit it from, so
 * unlike `bezierNormalise`'s own default this cannot fall back to a property already on the input.
 */
function bezierParse(text, overshoot) {
  if (Array.isArray(text)) return bezierAnchorCount(text) ? bezierNormalise(text, overshoot) : null;
  if (typeof text !== 'string') return null;
  var body = text.trim();
  if (!body) return [];
  // Every `cubic-bezier(` and `)` comes out, rather than one wrapper being unwrapped: the three-point form
  // `bezierFormat` writes is *two* calls with the middle anchor between them, and a regex anchored to the
  // whole string matched the two-point form and returned null for its own output.
  //
  // Square brackets go too, so `[0.37, 0, 0.63, 1]` reads — which is the form the config block itself holds
  // and therefore the one most likely to be pasted here. It is also how the editor stores its own value
  // between redraws, so without this the control could not read back what it had just written.
  body = body.replace(/cubic-bezier/gi, ' ').replace(/[()[\]]/g, ' ');
  var parts = body.split(/[\s,]+/).filter(function (p) { return p !== ''; });
  // Brackets and nothing else — `[]`, the empty curve, written the way the config block writes it. Checked
  // after the strip rather than before, because `''` and `'[]'` mean the same thing and only one of them
  // survives to here.
  if (!parts.length) return [];
  var nums = [];
  for (var i = 0; i < parts.length; i++) {
    var v = Number(parts[i]);
    if (!isFinite(v)) return null;
    nums.push(v);
  }
  if (!bezierAnchorCount(nums)) return null;
  return bezierNormalise(nums, overshoot);
}

/**
 * Text out of numbers, at three decimals — enough that `bezierParse` reads back the curve it was given,
 * which two places was not: a fitted preset lost 0.006 on the way through, more than the fit error it was
 * carrying in the first place.
 *
 * A three-point curve is two `cubic-bezier()` calls with the middle anchor between them, which `bezierParse`
 * reads back because it only ever collects numbers.
 */
function bezierFormat(curve) {
  var n = bezierNormalise(curve);
  if (!n.length) return '';
  // Three places, not two. This field is a paste target as much as a readout, so what it shows has to be
  // what `bezierParse` can turn back into the same curve; at two places a fitted preset came back 0.006 out,
  // which is larger than the fit error it was meant to be carrying.
  function num(v) {
    return String(Math.round(v * 1000) / 1000);
  }
  if (n.length === 4) {
    return 'cubic-bezier(' + n.slice(0, 4).map(num).join(', ') + ')';
  }
  return 'cubic-bezier(' + n.slice(0, 4).map(num).join(', ') + ') ' +
    num(n[4]) + ', ' + num(n[5]) + ' ' +
    'cubic-bezier(' + n.slice(6, 10).map(num).join(', ') + ')';
}
