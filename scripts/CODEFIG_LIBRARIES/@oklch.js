// @OKLCH
// @DOC_START
// # Converts and interpolates OKLCH and HSL colours, builds lightness ladders, and fits chroma to sRGB
//
// ## Overview
//
// Perceptual colour arithmetic only — no Figma API, no variables, no panel. Plain functions so tests can check numbers by hand; every colour a panel shows comes out of here.
//
// ### Decisions callers rely on
//
// **Chroma is reduced to fit sRGB, always.** `oklchToHex` bisects chroma downward so **L and H** stay put — required for a shared lightness ladder. It reports `{ clamped: true, chroma }` when it fitted.
//
// **Hue interpolates along the shortest arc** via `oklchLerpHue` (linear 0→255 would go the long way and teal the middle of a neutral ramp).
//
// **Lock seed re-anchors; it does not offset.** `oklchReanchor` replaces the middle anchor with the seed's lightness and recomputes both segments so the first and last steps stay on the ladder ends.
//
// ### Curves
//
// A curve is a list of bezier coordinates. `oklchCurveOf` also accepts older `{ type, ease, amount }` pairs and curve ids from `oklchCurves()`, converting both on the way in. Curve evaluation needs `bezierAt` from `@Bezier`.
//
// ## Exported functions
//
// | Area | Functions |
// |---|---|
// | sRGB ↔ linear | oklchSrgbToLinear, oklchLinearToSrgb |
// | hex ↔ channels | oklchHexToRgb, oklchRgbToHex, oklchNormaliseHex |
// | OKLab | oklchLinearRgbToLab, oklchLabToLinearRgb |
// | OKLCH | oklchFromHex, oklchFromRgb, oklchToHex |
// | HSL | oklchHslFromHex, oklchHslToHex |
// | Interpolation | oklchLerp, oklchLerpHue, oklchSegmentAt |
// | Ladders | oklchCurves, oklchCurveById, oklchLadder, oklchNearestStep, oklchReanchor |
// | Ramp / compare | oklchRamp, oklchDistance, oklchCompare |
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

  /**
   * **A channel bends at its middle anchor only if its curve has a middle point.**
   *
   * The two used to be independent, and that is a contradiction the ramp resolved in favour of the anchor.
   * Remove the middle point from a saturation curve and the curve becomes one monotone segment between its
   * ends — which for `100 … 90` *cannot reach* a middle of 83 — and the ramp dived to 83 anyway and came
   * back up. Márton: *"all curves smooth, no middle points, yet there is a huge bump at middle"*.
   *
   * So the curve decides. A three-anchor curve travels bright → middle → dark and the anchor is a real
   * corner; a one-segment curve travels bright → dark and the middle anchor is not consulted, which is what
   * "no middle point" has to mean if the words are to be worth anything. The panel disables the box to
   * match, so the number that stops counting also stops being editable.
   *
   * This is the *"a name is a label; the stamp is the identity"* rule in another coat: of two values that
   * describe one fact, exactly one may be authoritative, and here it is the curve.
   */
  /** A resolved curve's own coordinates, or `[]` for one named rather than given. */
  function oklchPointsOf(curve) {
    return (curve && Array.isArray(curve.points)) ? curve.points : [];
  }
  function oklchChannelSpan(index, hasMiddle) {
    if (hasMiddle) return oklchSegmentAt(index, middle, last);
    return { from: 'bright', to: 'dark', t: last === 0 ? 1 : index / last };
  }
  /** Progress within a channel's own span — renormalised per half only when there are halves. */
  // **Clamped to `[0,1]` unless the curve itself says otherwise.** `hueCurve`/`chromaCurve` carry
  // `overshoot` on their own `.points` (`bezierNormalise`, `@Bezier`) when the field that produced them
  // opted in — Colors' own Hue, Saturation and Chroma curves, never Lightness, which does not reach this
  // function at all (its ladder is built separately, in `oklchLadder`). A borrowed schedule (`ramCurve`,
  // when a channel has no curve of its own) is the lightness curve's, which never opts in — so a channel
  // without its own curve keeps the old, clamped pacing exactly as before.
  function oklchChannelAt(curve, index, hasMiddle, atMiddle) {
    var overshoot = !!(curve && curve.points && curve.points.overshoot);
    // Finite still matters even with overshoot allowed — a malformed curve should not hand NaN or
    // Infinity onward into a colour. Only the *range* restriction is what overshoot lifts.
    function clamp(v) {
      if (typeof v !== 'number' || !isFinite(v)) return 0;
      return overshoot ? v : (v < 0 ? 0 : v > 1 ? 1 : v);
    }
    var g = oklchEaseAt(curve, last === 0 ? 1 : index / last);
    if (!hasMiddle) return clamp(g);
    return clamp(index <= middle
      ? (atMiddle > 1e-9 ? g / atMiddle : 1)
      : (atMiddle < 1 - 1e-9 ? (g - atMiddle) / (1 - atMiddle) : 1));
  }

  /**
   * **Chroma may run on a schedule of its own.**
   *
   * Without one it borrows the lightness curve's, which is what the ramp has always done — and what makes a
   * read come back a third short of the file at its most saturated step. The colour of a palette is not
   * paced by its lightness; a designed set rises to a peak and falls on its own timing. Absent, everything
   * below falls through to `u` and nothing changes.
   */
  var chromaCurve = (spec.chromaCurve && spec.chromaCurve.length) ? oklchCurveOf(spec.chromaCurve) : null;
  var cgm = chromaCurve ? oklchEaseAt(chromaCurve, last === 0 ? 1 : middle / last) : 0;
  // Hue gets the same treatment, for the same reason: it is not paced by the lightness either. Worth least
  // of the three on cool palettes and most on warm ones — amber travels 49 degrees and was 10.2 out.
  var hueCurve = (spec.hueCurve && spec.hueCurve.length) ? oklchCurveOf(spec.hueCurve) : null;
  var hgm = hueCurve ? oklchEaseAt(hueCurve, last === 0 ? 1 : middle / last) : 0;
  var oklch = spec.model !== 'hsl';
  var rows = [];

  /**
   * **Saturation is carried across as saturation.**
   *
   * It was converted to an absolute colourfulness at each anchor's own lightness, interpolated, and
   * converted back — `S = C / (1 - |2L - 1|)`, a denominator that collapses towards white and black. The
   * conversion was introduced against a real overshoot and it did prevent that, but it also turned a flat
   * saturation into a cliff at the bright end and left the middle of a ramp duller than the file. S is
   * already the fraction of the colour a lightness can hold; there is nothing to convert.
   */
  /**
   * Which channels have a corner at the middle, decided once.
   *
   * **No curve is not the same as a smooth one — but it is also not the same as no anchor.** A channel
   * with no curve of its own has said nothing about its *shape*, so when it has a real, measured middle
   * anchor it keeps the three anchors it has always had — measured, dropping the middle there costs every
   * set in the library its accuracy, because a read leaves chroma empty precisely when the ramp is too
   * flat to fit and the three anchors are all it has. But a curve-less channel with no middle *anchor*
   * either — `skipFit` (`.plans/36-lazy-fit-on-demand.md`), where a fresh read leaves `middle` absent on
   * purpose rather than inventing one — has said nothing about a middle at all, and treating that silence
   * as three real anchors ran hue and chroma through zero: `spec.hue.middle`/`spec.chroma.middle` are
   * `colorsChannel`'s fallback numbers at that point, not a value from the file, and a "no curve, three
   * anchors" channel took the fallback for the third. `spec.hue.hasMiddle`/`spec.chroma.hasMiddle`
   * (`colorsChannel`, `@Color Ramp`) is the one place that still knows which case it is — checked before
   * the fallback ever ran — so this is the only thing that can tell them apart.
   *
   * An *explicit* one-segment curve is a third case, unchanged: it is a statement that the channel runs
   * smoothly from one end to the other, and it cannot pass through a middle outside its ends however much
   * the anchor insists.
   */
  // `oklchCurveOf` hands back `{ id, points, amount }`, so the coordinates are `.points` — reading `.length`
  // off the wrapper is `undefined`, which is not 10, which quietly took the middle away from *every*
  // channel that had a curve. The whole library went over the accuracy limit and the benchmark said so.
  var hueHasMiddle = hueCurve ? oklchPointsOf(hueCurve).length === 10 : !!(spec.hue && spec.hue.hasMiddle);
  var chromaHasMiddle = chromaCurve
    ? oklchPointsOf(chromaCurve).length === 10
    : !!(spec.chroma && spec.chroma.hasMiddle);

  for (var i = 0; i < steps.length; i++) {
    var hueSeg = oklchChannelSpan(i, hueHasMiddle);
    var chromaSeg = oklchChannelSpan(i, chromaHasMiddle);
    var uh = oklchChannelAt(hueCurve || ramCurve, i, hueHasMiddle, hueCurve ? hgm : gm);
    var H = oklchLerpHue(spec.hue[hueSeg.from], spec.hue[hueSeg.to], uh);
    var uc = oklchChannelAt(chromaCurve || ramCurve, i, chromaHasMiddle, chromaCurve ? cgm : gm);
    var seg = chromaSeg;
    var L = spec.ladder[i].L;
    var C, fit, thinned = false;
    if (oklch) {
      C = oklchLerp(spec.chroma[seg.from], spec.chroma[seg.to], uc);
      fit = oklchToHex(L, C, H);
    } else {
      // **Saturation travels, not colourfulness.**
      //
      // `S = C / (1 - |2L - 1|)`, so S is *already* the fraction of the colour a lightness can hold — that
      // is what it means. This used to multiply S out into an absolute colourfulness at each anchor's own
      // lightness, interpolate that, and divide back; the denominator collapses towards white and black, so
      // the round trip turned a flat saturation into a cliff. Measured on a real lime ramp it dropped 30 to
      // 18.2 in a single step, and left the middle of the ramp visibly duller than the file.
      //
      // Carrying S across directly is both simpler and closer, on every set measured (worst channel, of 255):
      //
      //     lime 40 -> 7    teal 72 -> 14    blue 28 -> 12    amber 17 -> 16    zinc 8 -> 6
      //
      // It also fixes a units mismatch by construction: `colorsFitChromaCurve` fits the curve to saturation,
      // which is now the quantity the curve shapes.
      //
      // **What this gives up.** The old model could not produce a step more colourful than its most colourful
      // anchor. That bound was introduced against a real overshoot — better than double the file's peak — but
      // it is stated against the *anchors*, and a ramp's most colourful step usually is not one: this lime
      // peaks at 208 against anchors of 168, so the bound was cutting off the file's own shape. What replaces
      // it is the real one — S cannot exceed 1, which is the most any lightness holds.
      C = oklchClamp01(oklchLerp(spec.chroma[seg.from], spec.chroma[seg.to], uc));
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
