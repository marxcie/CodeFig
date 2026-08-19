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
// | Editing | bezierWithMiddle, bezierWithoutMiddle, bezierSegments |
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

/**
 * A **coordinate**, in range and settled at six decimals.
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
 */
function bezierStore(v) {
  var c = bezierClamp01(v);
  return Math.round(c * 1e6) / 1e6;
}

/**
 * A curve that can be read: every number finite and in range, and every handle's `x` inside the span of
 * the segment it belongs to.
 *
 * The `x` clamp is what makes `bezierAt` single-valued. A handle dragged past its own end anchor folds the
 * curve back on itself, and `y` at that `x` becomes a question with two answers — which shows up not as an
 * error but as a scale that jumps backwards at one step.
 *
 * Returns a **new** array. Anything unrecognised returns `[]` rather than a guess: a curve nobody can read
 * is a thing to report, and the consumers all have a defined behaviour for no curve.
 */
function bezierNormalise(curve) {
  var anchors = bezierAnchorCount(curve);
  if (anchors === 0) return [];

  // **Called, not passed.** `curve.map(bezierStore)` is a bare *reference*, and `@import` finds a
  // function's dependencies with `\b(\w+)\s*\(` — so the callee was never injected and the whole Spacing
  // preview died on "bezierStore is not defined", in Figma only. `npm run validate` shares the blind spot.
  var n = curve.map(function (v) { return bezierStore(v); });
  if (anchors === 2) {
    // One segment spanning the whole width: both handles live in [0,1], which the clamp already did.
    return n;
  }

  // The middle anchor first — it is what the two spans are measured against. Held off both ends so each
  // segment keeps a width to solve across; a zero-width segment has no `x` to invert.
  var mx = n[4];
  if (mx < 0.001) mx = 0.001;
  if (mx > 0.999) mx = 0.999;
  n[4] = mx;

  n[0] = bezierSpanClamp(n[0], 0, mx);
  n[2] = bezierSpanClamp(n[2], 0, mx);
  n[6] = bezierSpanClamp(n[6], mx, 1);
  n[8] = bezierSpanClamp(n[8], mx, 1);
  return n;
}

function bezierSpanClamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The curve as segments, each `{ x0, y0, x1, y1, x2, y2, x3, y3 }` in absolute coordinates.
 *
 * Absolute rather than per-segment-normalised on purpose: the editor draws in this space, `bezierAt`
 * solves in it, and a segment that carried its own 0-to-1 frame would need converting at both.
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
  return bezierNormalise([X.l1, Y.l1, X.l2, Y.l2, X.m, Y.m, X.r1, Y.r1, X.r2, Y.r2]);
}

/**
 * Three anchors becomes two. The middle goes and the outer handles are kept, scaled back up to the full
 * width — the closest single cubic to what was on screen, which is as much as two handles can hold.
 *
 * Lossy by nature, and the editor says so before it does it. There is no way to store the discarded
 * middle for an undo that would not be state disagreeing with the coordinates.
 */
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

  return bezierNormalise([
    first.x1 * k1,
    first.y1 * k1,
    1 + (second.x2 - 1) * k2,
    1 + (second.y2 - 1) * k2
  ]);
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
      var first = e === 'inout' ? base : bezierReflect(base);
      var second = e === 'inout' ? bezierReflect(base) : base;
      var lo = bezierPlace(first, 0, 0, 0.5, 0.5);
      var hi = bezierPlace(second, 0.5, 0.5, 1, 1);
      out = [lo[0], lo[1], lo[2], lo[3], 0.5, 0.5, hi[0], hi[1], hi[2], hi[3]];
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
 */
function bezierParse(text) {
  if (Array.isArray(text)) return bezierAnchorCount(text) ? bezierNormalise(text) : null;
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
  return bezierNormalise(nums);
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
