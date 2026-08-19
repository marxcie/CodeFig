// @OKLCH
// @DOC_START
// Perceptual colour arithmetic, and nothing else: no Figma API, no variables, no panel. That boundary
// is what lets these be plain functions a test can check by hand, which matters because every number a
// colour panel shows comes out of here.
//
// Two consumers by design, the way `@Scale Models` has two: the **Colors** panel generates a ramp with
// it, and the cross-collection alignment report will measure existing ramps against a ladder with the
// same functions. Two implementations of one matrix drift the way spacing and radius did.
//
// ## What it owns
// | Area | Functions |
// |---|---|
// | sRGB ↔ linear | `oklchSrgbToLinear`, `oklchLinearToSrgb` |
// | hex ↔ channels | `oklchHexToRgb`, `oklchRgbToHex`, `oklchNormaliseHex` |
// | OKLab (Ottosson) | `oklchLinearRgbToLab`, `oklchLabToLinearRgb` |
// | OKLCH | `oklchFromHex`, `oklchFromRgb`, `oklchToHex` |
// | HSL, the other model the panel offers | `oklchHslFromHex`, `oklchHslToHex` |
// | Interpolation | `oklchLerp`, `oklchLerpHue`, `oklchSegmentAt` |
// | Ladders | `oklchCurves`, `oklchCurveById`, `oklchLadder`, `oklchNearestStep`, `oklchReanchor` |
// | A whole ramp | `oklchRamp` |
//
// ## Three things that are decisions, not details
//
// **Chroma is reduced to fit sRGB, always, and there is no other strategy.** It is the only fit that
// holds **L and H** still, and holding L still is the entire premise of a shared lightness ladder —
// clipping RGB or scaling lightness moves a step off the ladder to keep a colour it was never going to
// have. So `oklchToHex` fits by bisecting chroma downward and there is no option to turn it off. It
// **reports** every time: `{ clamped: true, chroma: <what fitted> }`, so a panel and a run log can both
// say so.
//
// **Hue interpolates along the shortest arc.** Linear interpolation from 0 to 255 goes the long way
// round and a neutral ramp comes out visibly teal in the middle. `oklchLerpHue` takes the short way.
//
// **Lock seed re-anchors; it does not offset.** `oklchReanchor` replaces the *middle* anchor with the
// seed's lightness and recomputes the two segments through it, so the first and last steps are still
// exactly the ladder's anchors. An offset moved them, which is what ruled it out.
//
// ## Curves
// **A curve is a list of bezier coordinates.** `oklchCurveOf` also accepts the two older spellings — the
// `{ type, ease, amount }` pair and a curve id from `oklchCurves()` — and converts both to coordinates on
// the way in, so there is one evaluator rather than one per era of config. The maths is `@Bezier`; import
// it too, or every ladder comes back linear.
//
// `oklchCurves()` remains the flattened list of `(type, ease)` pairs, now used only to read an old config.
// @DOC_END

@import { bezierAt, bezierNormalise, bezierFromEase } from "@Bezier"

// ========================================
// sRGB
// ========================================

function oklchClamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function oklchLerp(a, b, u) {
  return a + (b - a) * u;
}

function oklchSrgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function oklchLinearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** `#rrggbb` or `rrggbb`, case-insensitive → [r, g, b] in 0..1, or null. Three digits are not accepted:
 *  a config that says `#abc` is more likely a typo than shorthand, and guessing is worse than asking. */
function oklchHexToRgb(hex) {
  var match = /^#?([0-9a-f]{6})$/i.exec(String(hex == null ? '' : hex).trim());
  if (!match) return null;
  var n = parseInt(match[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

function oklchRgbToHex(rgb) {
  var out = '#';
  for (var i = 0; i < 3; i++) {
    var byte = Math.round(oklchClamp01(rgb[i]) * 255);
    out += (byte < 16 ? '0' : '') + byte.toString(16);
  }
  return out.toUpperCase();
}

/** What a hex means, spelled the one way — so a message can quote a colour the user typed in lowercase
 *  without the quote and the swatch label disagreeing. */
function oklchNormaliseHex(hex) {
  var rgb = oklchHexToRgb(hex);
  return rgb ? oklchRgbToHex(rgb) : String(hex);
}

// ========================================
// OKLab — Björn Ottosson's matrices, both directions
// ========================================

function oklchLinearRgbToLab(r, g, b) {
  var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  var l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  ];
}

function oklchLabToLinearRgb(L, a, b) {
  var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ];
}

// ========================================
// OKLCH
// ========================================

/** [r, g, b] in 0..1 → `{ L, C, H }`. L and C are 0..1-ish, H is degrees. */
function oklchFromRgb(rgb) {
  var lab = oklchLinearRgbToLab(
    oklchSrgbToLinear(rgb[0]), oklchSrgbToLinear(rgb[1]), oklchSrgbToLinear(rgb[2])
  );
  var C = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
  // A grey has no hue. Reporting the `atan2` of two rounding errors would make two identical greys
  // disagree about a number the panel then puts in a field.
  var H = C < 1e-7 ? 0 : (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
  return { L: lab[0], C: C, H: H };
}

function oklchFromHex(hex) {
  var rgb = oklchHexToRgb(hex);
  return rgb ? oklchFromRgb(rgb) : null;
}

/**
 * `{ L, C, H }` → `{ hex, rgb, L, C, H, clamped, chroma }`, fitted into sRGB by reducing chroma.
 *
 * **L and H never move**, and they come back out so a caller can say so without re-deriving them. Maximum
 * chroma depends on both, so one chroma number cannot be honoured at every step of a ramp; bisecting it
 * down is the only fit that keeps a step on its ladder. 24 halvings take the interval below 1e-7, far
 * finer than eight bits of output can show.
 *
 * Returning `L` and `H` is not decoration. Reading them back out of `rgb` instead measures the final
 * safety clip as though it were the fit: the triple is clamped to 0..1 for callers that hand it to Figma,
 * and clipping a channel by the gamut test's own 1e-6 shifts a *re-derived* lightness by up to 9e-5 and a
 * re-derived hue by half a degree at near-grey chroma, where hue is barely a real quantity. Neither is
 * visible in eight bits, and neither is the engine moving anything.
 *
 * `clamped` is true only when the requested chroma did not fit, so a caller can mark that swatch and a
 * log can name the step.
 */
function oklchToHex(L, C, H) {
  var radians = H * Math.PI / 180;
  var cos = Math.cos(radians), sin = Math.sin(radians);
  var linear = oklchLabToLinearRgb(L, C * cos, C * sin);
  var clamped = false;
  var fitted = C;

  if (!oklchInGamut(linear)) {
    clamped = true;
    var low = 0, high = C;
    for (var i = 0; i < 24; i++) {
      var mid = (low + high) / 2;
      if (oklchInGamut(oklchLabToLinearRgb(L, mid * cos, mid * sin))) low = mid; else high = mid;
    }
    fitted = low;
    linear = oklchLabToLinearRgb(L, low * cos, low * sin);
  }

  var rgb = [
    oklchClamp01(oklchLinearToSrgb(linear[0])),
    oklchClamp01(oklchLinearToSrgb(linear[1])),
    oklchClamp01(oklchLinearToSrgb(linear[2]))
  ];
  return {
    hex: oklchRgbToHex(rgb), rgb: rgb,
    L: L, C: C, H: H, clamped: clamped, chroma: fitted
  };
}

/**
 * In sRGB, with only floating-point slack.
 *
 * **The slack has to be this tight.** An earlier version allowed 1e-4, on the reasoning that a colour
 * sitting exactly on the boundary should not be reported as clamped by an error in the seventh decimal.
 * But a linear channel of −5e-5 passed that test, came out of `oklchLinearToSrgb` at −6.4e-4, and was then
 * clamped to zero on the way to eight bits — which *does* move the colour. At L0.1, where every channel is
 * tiny, that clip shifted lightness by 0.0022: the exact failure the fit exists to prevent, reintroduced by
 * the tolerance meant to make it tidy.
 *
 * **1e-6, measured.** Sweeping every 17th value of each channel, the furthest a genuinely in-gamut colour's
 * linear round trip lands outside 0..1 is **1.98e-7**, at white — so anything tighter reports `#FFFFFF` as
 * clamped. 1e-6 clears that with room to spare and is still five orders of magnitude below one eight-bit
 * step, so a channel clipped by this much cannot change the byte that comes out.
 */
function oklchInGamut(linear) {
  for (var i = 0; i < 3; i++) {
    if (!(linear[i] >= -1e-6 && linear[i] <= 1 + 1e-6)) return false;
  }
  return true;
}

// ========================================
// HSL — the panel's other colour model
//
// Here rather than in the panel because the ramp builder below serves both models, and splitting it
// would put half of one ramp's arithmetic in a script and half in a library. `{ L, C, H }` in both, with
// `C` standing for saturation, so one builder and one set of tests cover the pair.
// ========================================

function oklchHslFromHex(hex) {
  var rgb = oklchHexToRgb(hex);
  if (!rgb) return null;
  var r = rgb[0], g = rgb[1], b = rgb[2];
  var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  var L = (max + min) / 2;
  var S = d === 0 ? 0 : d / (1 - Math.abs(2 * L - 1));
  var H = 0;
  if (d !== 0) {
    if (max === r) H = ((g - b) / d) % 6;
    else if (max === g) H = (b - r) / d + 2;
    else H = (r - g) / d + 4;
    H = (H * 60 + 360) % 360;
  }
  return { L: L, C: S, H: H };
}

/** The same shape `oklchToHex` answers in, so a caller reads one set of keys whichever model it asked
 *  for. HSL cannot fall out of sRGB, so `clamped` is always false and `chroma` is what was asked. */
function oklchHslToHex(L, S, H) {
  var a = S * Math.min(L, 1 - L);
  var rgb = [oklchHslChannel(H, L, a, 0), oklchHslChannel(H, L, a, 8), oklchHslChannel(H, L, a, 4)];
  return {
    hex: oklchRgbToHex(rgb), rgb: rgb,
    L: L, C: S, H: H, clamped: false, chroma: S
  };
}

function oklchHslChannel(H, L, a, n) {
  var k = (n + H / 30) % 12;
  return L - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
}

// ========================================
// Interpolation
// ========================================

/**
 * The **shortest arc** between two hues.
 *
 * Straight interpolation from 0 to 255 climbs through 120 and a ramp between two nearby reds comes out
 * green in the middle. `((b - a + 540) % 360) - 180` puts the difference in −180..180, so the walk is
 * always the short way and a two-degree hue shift stays a two-degree hue shift.
 */
function oklchLerpHue(a, b, u) {
  var delta = ((b - a + 540) % 360) - 180;
  return (a + delta * u + 360) % 360;
}

/**
 * Which segment a step is in, and how far along it — `twoSegment`, the shape `generateScale` already
 * uses for typography: `bright → middle → dark`, with the curve applied inside each half.
 *
 * The two halves need not be the same length. A middle anchor at index 8 of 10 gives a long shallow
 * first segment and a short steep second one, which is exactly what a seed placed at 800 asks for.
 */
function oklchSegmentAt(index, middleIndex, last) {
  if (index <= middleIndex) {
    return { from: 'bright', to: 'middle', t: middleIndex === 0 ? 1 : index / middleIndex };
  }
  return {
    from: 'middle', to: 'dark',
    t: last === middleIndex ? 1 : (index - middleIndex) / (last - middleIndex)
  };
}

// ========================================
// Ladders
// ========================================

/**
 * The flattened `(type, ease)` list. A function rather than a constant because `@import` extracts
 * function declarations and nothing else — a top-level array here would be unimportable, and the
 * failure mode is a `ReferenceError` swallowed by a caller's `try`.
 */
function oklchCurves() {
  return [
    { id: 'linear', label: 'Linear', type: 'linear', ease: 'none' },
    { id: 'sine-ease-in-out', label: 'Sine easeInOut', type: 'sine', ease: 'inout' },
    { id: 'sine-ease-in', label: 'Sine easeIn', type: 'sine', ease: 'in' },
    { id: 'sine-ease-out', label: 'Sine easeOut', type: 'sine', ease: 'out' },
    { id: 'quad-ease-in-out', label: 'Quad easeInOut', type: 'quad', ease: 'inout' },
    { id: 'cubic-ease-in-out', label: 'Cubic easeInOut', type: 'cubic', ease: 'inout' },
    { id: 'quart-ease-in-out', label: 'Quart easeInOut', type: 'quart', ease: 'inout' },
    { id: 'circ-ease-in-out', label: 'Circ easeInOut', type: 'circ', ease: 'inout' },
    { id: 'exponential-ease-in-out', label: 'Exponential easeInOut', type: 'exponential', ease: 'inout' }
  ];
}

/**
 * A curve, from either spelling: `{ type, ease }` or one of `oklchCurves()`'s flat ids.
 *
 * **The flat list is a menu, not the vocabulary.** `oklchCurves()` was built for a single dropdown and only
 * ever held the pairs that dropdown offered — sine in three easings, everything else in easeInOut alone. Once
 * the panel split family and easing into two controls it started composing ids like `quad-ease-in`, which the
 * list has never contained, so `oklchCurveById` returned its first entry and **13 of 20 combinations silently
 * generated a linear ramp**. `applyEase` has supported all of them all along; going through an id was the
 * bottleneck, and the fallback below is what made it invisible.
 *
 * So a caller that knows its family and easing passes them, and never has to hope a composed string is on a
 * list written for something else.
 */
/**
 * Whatever a caller has, as something `oklchEaseAt` can read.
 *
 * Three spellings arrive here now, and the newest wins where they overlap:
 *
 * - **an array of coordinates** — a bezier curve, which is what the panel writes today
 * - `{ type, ease, amount }` — the family pair, which every config written before the editor carries
 * - a curve id string — the original single dropdown
 *
 * The old two are **converted to coordinates on the way through** rather than kept as a second code path.
 * `bezierFromEase` is exact for `linear`, `quad` and `cubic` and within 0.01 for the rest, and one evaluator
 * cannot disagree with itself about what a config means — which two would, at exactly the boundary where a
 * file was written by an older panel and read by a newer one.
 */
function oklchCurveOf(curve) {
  if (Array.isArray(curve)) {
    return { id: null, points: bezierNormalise(curve), amount: 1 };
  }
  // **A `{ lower, upper }` pair joins rather than falling through.** `colorsCurve` converts every pair before
  // the engine sees one, so this should be unreachable — but the fall-through below ends at
  // `oklchCurveById`, which answers *linear* for anything it does not recognise. That is precisely the
  // failure this file already carries a warning about: 13 of 20 combinations silently generating a linear
  // ramp because an unrecognised spelling had a plausible-looking answer. A pair that never said where its
  // middle sat joins at the middle, which is what it meant.
  if (curve && typeof curve === 'object' && (curve.lower || curve.upper)) {
    return { id: null, amount: 1,
      points: bezierJoin(oklchCurveOf(curve.lower).points, oklchCurveOf(curve.upper).points, 0.5, 0.5) };
  }
  if (curve && typeof curve === 'object' && curve.type) {
    var amount = typeof curve.amount === 'number' ? oklchClamp01(curve.amount) : 1;
    return { id: null, points: bezierFromEase(curve.type, curve.ease || 'none', amount), amount: 1 };
  }
  var found = oklchCurveById(curve);
  return { id: found.id, points: bezierFromEase(found.type, found.ease, 1), amount: 1 };
}

/**
 * A curve at `t`, blended towards linear by `amount`.
 *
 * **The menu was 0% or 100% and the useful values are in between.** Márton, measuring his own ramp: the best
 * strengths were 88% on the lower segment and 81% on the upper, neither of which a named curve can express.
 * The reason is that an easing's departure from linear is a fraction of the *range* it spans — sine easeOut
 * leaves linear by about 21% of range at its midpoint, which is 5.5 lightness points across his 26.8-point
 * lower segment and 13.3 across his 64.1-point upper one. Same curve, 2.4x the visible effect. In motion the
 * range is a duration nobody measures; here it is lightness points sitting side by side.
 *
 * Safe by construction rather than by clamping: linear and every family share both endpoints, so a mix of the
 * two still passes through them exactly, and a convex combination of two monotone functions is monotone. So no
 * amount can put a step out of order or move an anchor.
 */
/**
 * The curve, read at `t`.
 *
 * One line, because `oklchCurveOf` has already turned every accepted spelling into coordinates. The blend
 * toward linear that `amount` used to apply here is gone from this function on purpose: `bezierFromEase`
 * folds it into the handles, where it is exact, instead of applying it to the output afterwards.
 */
function oklchEaseAt(curve, t) {
  return bezierAt(curve.points || [], t);
}

/** An unknown id falls back to linear rather than throwing: a config carrying a curve this build has
 *  never heard of should draw something and say so, not stop the panel. */
function oklchCurveById(id) {
  var all = oklchCurves();
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return all[0];
}

/**
 * A lightness ladder: three anchors, a curve, two segments. That is the whole of it — there is no pin,
 * no override and no per-step exception, because a ladder that can be edited step by step is not a
 * ladder any more and cannot be shared between modes.
 *
 * `middleIndex` defaults to the list's midpoint. A **shared** ladder always uses the midpoint, since it
 * is shared and cannot follow one mode's seed; `oklchReanchor` is the one caller that moves it.
 */
function oklchLadder(anchors, curveId, steps) {
  var last = steps.length - 1;
  // **One curve, across every step.** It used to be two — a *lower* shape for bright→middle and an *upper*
  // one for middle→dark — because a real neutral ramp is not one exponent end to end: measured on a
  // hand-made set the lower half fits 1.71 and the upper 0.84, and a single *two-anchor* curve forced across
  // both was 7.7% out where the tolerance is 0.5%.
  //
  // A *three-anchor* curve says the same thing without the second variable. Its middle anchor is the bend,
  // so the two halves still differ; they are just written down once. There is no `middleIndex` here any more
  // for the same reason — where the ladder turns is a property of the curve, and asking the caller for it as
  // well is how the two came to disagree.
  var curve = oklchCurveOf(curveId);
  var out = [];
  for (var i = 0; i < steps.length; i++) {
    // **The three anchor steps take their anchor's value, not an interpolation of it.** They *are* the
    // anchors, so interpolating to them is both pointless and lossy: `applyEase('sine', 'in', 1)` returns
    // `1 - cos(π/2)`, which is 1 short by 6e-17, and the dark end came out 0.18000000000000005. That is
    // invisible on screen and fatal to the re-anchoring invariant, which says the ends hold *exactly*.
    //
    // The middle wins a collision. Placing a seed on the first or last step makes it that step's colour —
    // the user pointed at it — so one segment has no length and re-anchoring collapses to replacing that
    // endpoint. The alternative is ignoring a placement the user made on purpose.
    var L;
    if (i === 0) L = anchors.bright;
    else if (i === last) L = anchors.dark;
    else L = oklchLerp(anchors.bright, anchors.dark, oklchEaseAt(curve, last === 0 ? 1 : i / last));
    out.push({ step: steps[i], L: oklchClamp01(L) });
  }
  return out;
}

/** Which step of a ladder a lightness is nearest. Ties go to the earlier step, so the answer does not
 *  depend on iteration order. */
function oklchNearestStep(ladder, L) {
  var best = 0, bestDistance = Infinity;
  for (var i = 0; i < ladder.length; i++) {
    var distance = Math.abs(ladder[i].L - L);
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  }
  return best;
}

/**
 * Lock seed: re-anchor a ladder through a colour, keeping its ends.
 *
 * → `{ ladder, base, drift: { step, delta } | null, moved }`
 *
 * The middle anchor becomes `seedL` and sits at `placementIndex`; `bright` and `dark` are untouched, so
 * `ladder[0]` and `ladder[last]` equal the unanchored ladder's **exactly**. That invariant is the whole
 * reason this replaced an offset, so it is a test rather than a comment.
 *
 * The one exception is a placement *on* an end, where the seed and that endpoint are the same step and the
 * seed wins — `collapsed` says so, because a caller that promises "endpoints unchanged" needs to know when
 * it cannot keep the promise.
 *
 * `drift` is the largest **interior** deviation from the unanchored ladder — the endpoints cannot move,
 * so including them would only ever report zero and hide the number that matters.
 */
function oklchReanchor(anchors, seedL, curveId, steps, placementIndex) {
  var last = steps.length - 1;
  var middle = typeof placementIndex === 'number' ? placementIndex : Math.floor(last / 2);
  var base = oklchLadder(anchors, curveId, steps);

  // **Re-anchoring moves the curve, not a second copy of the middle.** The ladder used to be rebuilt with
  // `middle: seedL` while the curve stayed where it was, so the middle lightness lived in the anchors *and*
  // in the curve's own anchor, and the two could disagree — which is exactly the "a variable does one job"
  // fault. One curve across the whole range leaves nowhere for a second answer: put its anchor on the seed
  // and the ladder passes through the seed by construction.
  //
  // **A seed on an end replaces that end.** An anchor cannot be placed at x=0 or x=1 — that is where the
  // endpoints already are — so the curve has nothing to move and the endpoint itself is what the user
  // pointed at. `collapsed` below already said so; this is the half of that promise that changes a number.
  var span = anchors.dark - anchors.bright;
  var ends = middle === 0 || middle === last;
  var seated = ends
    ? { bright: middle === 0 ? seedL : anchors.bright, middle: anchors.middle,
        dark: middle === last ? seedL : anchors.dark }
    : anchors;
  var at = last === 0 ? 1 : middle / last;
  var points = oklchCurveOf(curveId).points;
  var curve = (ends || Math.abs(span) < 1e-9) ? points
    : bezierThrough(points, at, (seedL - anchors.bright) / span);
  var moved = oklchLadder(seated, curve, steps);

  var drift = null;
  for (var i = 1; i < last; i++) {
    var delta = moved[i].L - base[i].L;
    if (!drift || Math.abs(delta) > Math.abs(drift.delta)) {
      drift = { step: steps[i], delta: delta };
    }
  }
  return {
    ladder: moved, base: base, curve: curve, drift: drift, moved: true,
    collapsed: middle === 0 || middle === last
  };
}

// ========================================
// A whole ramp
// ========================================

/**
 * One mode's ramp, in either colour model.
 *
 * ```
 * oklchRamp({
 *   steps: ['50', …],            // names, in order
 *   ladder: [{ step, L }, …],    // the lightness per step, already decided
 *   hue:    { bright, middle, dark },
 *   chroma: { bright, middle, dark },   // chroma in OKLCH, saturation 0..1 in HSL
 *   curve: 'sine-ease-in-out',
 *   middleIndex: 5,
 *   model: 'oklch' | 'hsl'
 * })
 * ```
 * → `[{ step, L, C, H, hex, clamped, chroma }]`
 *
 * Lightness arrives decided rather than computed here, because whether it came from a shared ladder or
 * from a re-anchored one is the caller's business and the ramp should not be able to disagree with what
 * the panel drew.
 */
function oklchRamp(spec) {
  var steps = spec.steps;
  var last = steps.length - 1;
  var middle = typeof spec.middleIndex === 'number' ? spec.middleIndex : Math.floor(last / 2);
  // Hue and chroma follow the *same* two curves the lightness does, or a split ramp eases its colour on one
  // schedule and its lightness on another.
  var ramCurve = oklchCurveOf(spec.curve);
  // Where the *curve* puts the middle step. Hue and chroma still travel bright → middle → dark between three
  // anchors, so they need a 0..1 within each half; the lightness now runs on one curve across the whole
  // range, and reading its progress at the middle step is what keeps the two on the same schedule. Deriving
  // it rather than storing it is the same rule the curve itself follows: the numbers are the answer.
  var gm = oklchEaseAt(ramCurve, last === 0 ? 1 : middle / last);
  var oklch = spec.model !== 'hsl';
  var rows = [];

  /**
   * **HSL saturation is not interpolatable across a lightness ramp.**
   *
   * `S = C / (1 - |2L - 1|)`. The denominator peaks at L = 0.5 and collapses towards white and black, so the
   * same S means a different amount of colour at every step — and interpolating it multiplies a rising S by a
   * rising denominator. Measured on a real ramp that came out at more than **double** the file's colourfulness
   * in the upper half, with a dip at the middle anchor and a lurch after it; the three anchors were read at
   * L 97.6, 70.8 and 6.7, which are three numbers that do not mean the same thing.
   *
   * So the *absolute* colourfulness is what travels: each anchor's S is converted at its **own** lightness,
   * the interpolation runs in C, and every step derives its own S from its own L. The anchor keeps its
   * meaning — an S is well defined at the step it was read from — and only the interpolation changes. OKLCH
   * needed none of this: its chroma is already absolute, which is why it never had the kink.
   */
  function hslDenominator(L) {
    return 1 - Math.abs(2 * L - 1);
  }
  var absolute = null;
  if (!oklch) {
    absolute = {
      bright: spec.chroma.bright * hslDenominator(spec.ladder[0].L),
      middle: spec.chroma.middle * hslDenominator(spec.ladder[middle].L),
      dark: spec.chroma.dark * hslDenominator(spec.ladder[last].L)
    };
  }

  for (var i = 0; i < steps.length; i++) {
    var seg = oklchSegmentAt(i, middle, last);
    var g = oklchEaseAt(ramCurve, last === 0 ? 1 : i / last);
    var u = seg.from === 'bright'
      ? (gm > 1e-9 ? g / gm : 1)
      : (gm < 1 - 1e-9 ? (g - gm) / (1 - gm) : 1);
    u = oklchClamp01(u);
    var H = oklchLerpHue(spec.hue[seg.from], spec.hue[seg.to], u);
    var L = spec.ladder[i].L;
    var C, fit, thinned = false;
    if (oklch) {
      C = oklchLerp(spec.chroma[seg.from], spec.chroma[seg.to], u);
      fit = oklchToHex(L, C, H);
    } else {
      var wanted = oklchLerp(absolute[seg.from], absolute[seg.to], u);
      var room = hslDenominator(L);
      // **A colourfulness this lightness cannot hold is reported, not hidden.** Near white and black the
      // denominator is small, so an S over 1 is asking for more colour than HSL has at that lightness — the
      // same situation OKLCH reports as a chroma reduction, and it is said the same way.
      C = room < 1e-6 ? 0 : Math.max(0, wanted) / room;
      if (C > 1) { C = 1; thinned = true; }
      fit = oklchHslToHex(L, C, H);
    }
    rows.push({
      step: steps[i], L: L, C: C, H: H,
      hex: fit.hex, rgb: fit.rgb,
      clamped: fit.clamped || thinned,
      chroma: thinned ? 1 : fit.chroma
    });
  }
  return rows;
}

/**
 * How different two colours are, as one number: Euclidean distance in OKLab.
 *
 * **Why a distance and not a per-channel comparison.** The question "are these the same colour" has to survive
 * float noise and answer for hue, chroma and lightness at once. Comparing channels separately needs three
 * tolerances and gets hue wrong: at near-zero chroma a 60° hue difference is no difference at all, and a
 * per-channel test would call it a change. In OKLab that falls out for free, because hue is weighted by
 * chroma by construction.
 *
 * Measured on this repo's own fixtures: **one 8-bit step is 0.0013 to 0.0020** across the range. So a
 * tolerance a little above that separates "the same colour, rounded differently" from any real change, and a
 * genuine difference in a ramp that does not sit on its curve measures around 0.1 — fifty times larger.
 *
 * Returns `Infinity` for a hex it cannot read, so an unreadable value is never mistaken for a match.
 */
function oklchDistance(hexA, hexB) {
  var a = oklchFromHex(hexA), b = oklchFromHex(hexB);
  if (!a || !b) return Infinity;
  var ra = a.H * Math.PI / 180, rb = b.H * Math.PI / 180;
  var dL = a.L - b.L;
  var da = a.C * Math.cos(ra) - b.C * Math.cos(rb);
  var db = a.C * Math.sin(ra) - b.C * Math.sin(rb);
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * How far an existing set sits from a ladder, step by step — the recogniser's self-check, which for
 * colours cannot live in the recogniser: verifying by regeneration needs a curve, and a curve is
 * exactly what a read set does not carry.
 *
 * → `{ deltas: [{ step, delta } | null], worst: { step, delta } | null }`
 *
 * `delta` is `existing − generated` in lightness, so a positive number reads as *lighter than the
 * ladder*. A step with no counterpart on one side is `null` rather than zero, because "no value" and
 * "no difference" are not the same answer.
 */
function oklchCompare(existingRows, generatedRows) {
  var deltas = [];
  var worst = null;
  var length = Math.max(existingRows.length, generatedRows.length);
  for (var i = 0; i < length; i++) {
    var a = existingRows[i], b = generatedRows[i];
    if (!a || !b) { deltas.push(null); continue; }
    var delta = a.L - b.L;
    deltas.push({ step: b.step, delta: delta });
    if (!worst || Math.abs(delta) > Math.abs(worst.delta)) worst = { step: b.step, delta: delta };
  }
  return { deltas: deltas, worst: worst };
}
