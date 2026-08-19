// @Scale Models
// @DOC_START
// Turns a description of a scale into a sequence of numbers. That is the whole boundary: no
// viewports, no rounding, no variables, no Figma. Two consumers by design — `@Linear Ramp` for
// spacing and corner radius, and typography — because the same four models are specified for
// both, and two implementations of one formula drift the way spacing and radius did.
//
// ## The models
// | Model | What it is | Where the top comes from |
// |---|---|---|
// | `endpoints` | a ramp from `min` to `max` along a named easing | `max` |
// | `bezier` | a base and a **growth ratio**, with a **curve** distributing the growth | the ratio and the step count |
// | `metric` | a base plus a step that grows every `mod` steps | the step and the step count |
// | `fibonacci` | each step the sum of the two before it | the step and the step count |
// | `explicit` | the numbers you typed | you |
//
// `min` is required in all of them — it is the floor a scale starts from. `max` is a real endpoint only in
// `endpoints`; everywhere else the top is derived, so a `max` beside those is ignored and reported. Set
// `clamp` to be **told** when a scale passes a number, without it being squashed to fit: squashing a ramp
// changes its shape, which is the one thing it promises to hold.
//
// ## `bezier` replaced `modular`, and generates the same numbers
// A modular scale is a constant ratio between steps. In **log space that is a straight line**, so `bezier`
// with a flat curve *is* a modular scale — the step count cancels out of the exponent, so it is exact and
// it is **append-safe**: add three tokens and the first six do not move. Bending the curve lets the ratio
// vary across the scale, which is what a real spacing set does and what one ratio could never say.
//
// **The top is derived, never typed.** A version of this briefly took a `max` instead, and that was wrong
// in the way that matters: with both ends pinned, adding a token re-subdivides the range and moves every
// value below it. Nobody knows the largest spacing in advance anyway — they know the base and roughly how
// fast it grows, which is what `ratio` is. `max` is still accepted and converted, for the configs written
// while that was the spelling.
//
// **`modular` is still accepted** and converts through `modularAsBezier`, exactly. That is not politeness:
// these scales have already been generated into people's files, and a token that comes back a different
// number on the next run breaks everything bound to it. It is left out of `scaleModelNames` so nothing
// offers it to anyone new.
//
// ## Two spellings of "base", on purpose
// A **config** names its base by token: `base: { level: "xs", size: 4 }` — that is what a user
// writes and what a manifest stores, and it cannot change without breaking every config in
// existence. This library names it by position: **`baseValue`** (a number) and **`baseIndex`**
// (where in the sequence it sits), which is also how `generateScale` in `@Math Helpers` has always
// spelled it.
//
// **Translating between them is the caller's job, in both directions.** `@Linear Ramp` does it in
// `buildRampScaleOpts` (config → here) and `rampModePayloadFor` (here → config). Getting only one
// direction is not a compile error and not a crash: an adopted metric scale regenerated as
// `4, 5, 6, 8, 12` because a `base` that was not an object was silently replaced with the middle
// token. Plan 20's typography ramps carry `base: { step, size, lineHeight, tracking }`, so the
// same split arrives with more fields to lose — wire both directions before wiring anything else.
//
// ## What is deliberately not here
// Rounding, and the monotonic guard that rounding makes necessary — both belong to the caller, so
// there is one grid ladder rather than four. Line height and letter spacing, which are reciprocal
// functions *of* a size rather than sequence generators; they stay in typography.
//
// ## Companion imports
// `@import` does not follow calls across scripts. `endpoints` delegates to `generateScale` and `bezier`
// reads its curve with `bezierAt`, so a consumer must import both:
//
// ```js
// @import { scaleSequence, resolveModularRatio } from "@Scale Models"
// @import { generateScale, isPiecewiseScaleType, snapScaleGrid } from "@Math Helpers"
// @import { bezierAt } from "@Bezier"
// ```
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Sequences | scaleSequence, scaleModelNames, scaleModelAliases |
// | Ratios | modularRatios, resolveModularRatio |
// @DOC_END

// ============================================================================
// RATIOS
// ============================================================================

/**
 * The named ratios, as shipped. These are typescale's rounded numbers rather than equal
 * temperament's `2^(n/12)` — `majorThird` is 1.25, not 1.2599 — for two reasons: revaluing names
 * already in use would move scales people have, and the rounded table produces the numbers
 * designers recognise (16 → 20 → 25 → 31.25). Most of the difference evaporates into the rounding
 * grid anyway. A plain number is accepted wherever a name is, which is how to get an exact value.
 *
 * These must stay equal to `getModularScaleRatio` in `@Math Helpers`, which the endpoints path
 * reads. A test pins the two together.
 */
function modularRatios() {
  return {
    minorSecond: 1.067,
    majorSecond: 1.125,
    minorThird: 1.2,
    majorThird: 1.25,
    perfectFourth: 1.333,
    augmentedFourth: 1.414,
    perfectFifth: 1.5,
    phi: 1.618
  };
}

/** A name from the table, or a number as given. Null when it is neither. */
function resolveModularRatio(ratio) {
  if (typeof ratio === 'number' && isFinite(ratio) && ratio > 0) return ratio;
  if (typeof ratio !== 'string') return null;
  var table = modularRatios();
  if (table[ratio] !== undefined) return table[ratio];
  // `"1.25"` means 1.25. A config arrives from a paste, a text layer or a `<select>` — all of which
  // carry strings — and answering "unknown ratio" to a number that is right there produces an empty
  // scale rather than a wrong one, which is harder to read back to a cause.
  var trimmed = ratio.trim();
  if (!trimmed) return null;
  var parsed = Number(trimmed);
  return isFinite(parsed) && parsed > 0 ? parsed : null;
}

function scaleModelNames() {
  return ['endpoints', 'bezier', 'metric', 'fibonacci', 'explicit'];
}

/**
 * `modular` is still accepted and is **not** in the list above.
 *
 * It generates exactly what it always generated — see `modularAsBezier` — but nothing offers it any more,
 * so a panel that lists the models does not advertise a spelling that is on its way out. Kept separate from
 * `scaleModelNames` rather than filtered out of it: the list is what a message prints when it does not
 * recognise a model, and suggesting `modular` to someone whose config just failed would be advice to write
 * the old thing.
 */
function scaleModelAliases() {
  return ['modular'];
}

function scaleWarning(code, message, detail) {
  var warning = { code: code, message: message };
  if (detail) {
    for (var k in detail) {
      if (Object.prototype.hasOwnProperty.call(detail, k)) warning[k] = detail[k];
    }
  }
  return warning;
}

function scaleTokenName(options, index) {
  var tokens = options && options.tokens;
  if (Array.isArray(tokens) && typeof tokens[index] === 'string') return tokens[index];
  return 'step ' + (index + 1);
}

// ============================================================================
// THE MODELS
// ============================================================================

/**
 * A sequence of `steps` numbers.
 *
 * → { values: [number], warnings: [{ code, message }] }
 *
 * Refusals return an empty sequence and say why. Nothing here throws: a scale nobody can
 * generate is a thing to report, not a thing to crash on.
 */
function scaleSequence(model, options) {
  var opts = options || {};
  var warnings = [];
  var name = typeof model === 'string' && model ? model : 'endpoints';

  if (scaleModelNames().indexOf(name) === -1 && scaleModelAliases().indexOf(name) === -1) {
    return {
      values: [],
      warnings: [scaleWarning('scale-model-unknown', 'Unknown scale model "' + name + '". Use one of: ' + scaleModelNames().join(', ') + '.')]
    };
  }

  if (typeof opts.min !== 'number' || !isFinite(opts.min)) {
    return {
      values: [],
      warnings: [scaleWarning('scale-min-required', 'A scale needs a `min` — it is the floor every model starts from.')]
    };
  }

  var steps = typeof opts.steps === 'number' ? Math.floor(opts.steps) : 0;
  if (steps <= 0) return { values: [], warnings: warnings };

  if (name === 'explicit') return explicitSequence(steps, opts, warnings);
  if (name === 'endpoints') return endpointsSequence(steps, opts, warnings);

  // **`modular` is `bezier` with a straight curve.** Converted here rather than kept as a second generator,
  // because the two are the same arithmetic: see `modularAsBezier`.
  if (name === 'modular') {
    opts = modularAsBezier(steps, opts, warnings);
    if (!opts) return { values: [], warnings: warnings };
    name = 'bezier';
  }

  if (name === 'bezier') {
    var ramp = bezierScaleSequence(steps, opts, warnings);
    if (!ramp) return { values: [], warnings: warnings };
    return { values: applyScaleFloor(ramp, opts, warnings), warnings: reportClamp(ramp, opts, warnings) };
  }

  // metric and fibonacci both walk outwards from a base, and both derive their top.
  if (typeof opts.max === 'number') {
    warnings.push(scaleWarning(
      'scale-max-ignored',
      '`max` does not apply to a ' + name + ' scale — its top comes from the step and the number of steps. ' +
      'Use `clamp` to be told when it goes past a number.'
    ));
  }

  var built = name === 'fibonacci' ? fibonacciSequence(steps, opts, warnings)
    : metricSequence(steps, opts, warnings);
  if (!built) return { values: [], warnings: warnings };

  return { values: applyScaleFloor(built, opts, warnings), warnings: reportClamp(built, opts, warnings) };
}

/** The numbers as typed: never rounded, never floored, never reordered. */
function explicitSequence(steps, opts, warnings) {
  var given = Array.isArray(opts.values) ? opts.values.slice() : null;
  if (!given || given.length !== steps) {
    warnings.push(scaleWarning(
      'scale-explicit-length',
      'An explicit scale needs one value per token: ' + steps + ' expected, ' +
      (given ? given.length : 0) + ' given.'
    ));
    return { values: [], warnings: warnings };
  }
  for (var i = 1; i < given.length; i++) {
    if (given[i] < given[i - 1]) {
      warnings.push(scaleWarning(
        'scale-not-monotonic',
        'This explicit scale goes down at ' + scaleTokenName(opts, i) + ' (' + given[i - 1] + ' → ' + given[i] + '). Left as written.'
      ));
      break;
    }
  }
  return { values: given, warnings: warnings };
}

/**
 * The old code path, unchanged: a ramp between two endpoints along a curve.
 *
 * `generateScale` edits its own output — it keeps the scale ascending and pins the ends to `min`
 * and `max` — so a report goes in with it and whatever it moved comes back out. Silence there is
 * what let three separate bugs hide.
 */
function endpointsSequence(steps, opts, warnings) {
  var passed = {};
  for (var k in opts) {
    if (Object.prototype.hasOwnProperty.call(opts, k)) passed[k] = opts[k];
  }
  passed.steps = steps;
  var report = {};
  passed.report = report;
  return { values: generateScale(passed), warnings: warnings, adjustments: report.adjustments || [] };
}

function scaleBaseIndex(steps, opts) {
  var baseIndex = typeof opts.baseIndex === 'number' ? Math.floor(opts.baseIndex) : Math.floor((steps - 1) / 2);
  if (baseIndex < 0) return 0;
  if (baseIndex > steps - 1) return steps - 1;
  return baseIndex;
}

/** By position, never by token: a caller hands in a number, not a `{ level, size }`. */
function scaleBaseValue(opts) {
  if (typeof opts.baseValue === 'number' && isFinite(opts.baseValue)) return opts.baseValue;
  return opts.min;
}

/**
 * An **open-ended** ramp: a base, a growth ratio, and a curve saying how that growth is distributed.
 *
 * `value(i) = base × ratio ^ ( (steps-1) × curve(i / (steps-1)) )`
 *
 * **The top is derived, never typed.** For spacing and typography nobody knows the largest value in
 * advance — they know where the scale starts and roughly how fast it should grow, which is exactly what a
 * modular scale always asked for. An earlier version of this took a `max` instead, and that was wrong in a
 * way that mattered: with both ends pinned, **adding a token re-subdivides the range and moves every value
 * below it**. Six spacing tokens already bound to things in a file, silently changed, because somebody
 * added a seventh.
 *
 * Deriving the top from the ratio fixes that, and the `steps - 1` in the exponent is why:
 *
 * - **Flat curve → `base × ratio^i`.** The step count cancels out entirely, so the sequence does not
 *   depend on how long it is. Add three tokens and the first six are untouched. That is a modular scale,
 *   term for term, which is what every config in existence already holds.
 * - **Both ends stay exact.** `curve(0)` is 0 and `curve(1)` is 1, so bending moves the interior and can
 *   never move the base or the top.
 *
 * A bent curve *is* still length-dependent in its interior — the shape is spread over however many tokens
 * there are — and that is inherent: a curve is a shape over an interval, so a longer interval redistributes
 * it. The case that matters for existing files is the flat one, and that is exact.
 *
 * `max` is accepted as an alternative spelling and converted: `ratio = (max / base) ^ (1 / (steps-1))`.
 */
function bezierScaleSequence(steps, opts, warnings) {
  var from = scaleBaseValue(opts);

  if (!(from > 0)) {
    warnings.push(scaleWarning(
      'scale-bezier-positive',
      'A bezier scale multiplies its base by a ratio, so the base has to be above zero (got ' + from + '). ' +
      'Put a 0 in Extra values instead — an extra fills the smallest token name and the scale takes over ' +
      'above it.'
    ));
    return null;
  }
  if (steps === 1) return [from];

  var ratio = bezierScaleRatio(steps, from, opts, warnings);
  if (ratio === null) return null;

  var curve = Array.isArray(opts.curve) ? opts.curve : [];
  var span = steps - 1;
  var top = from * Math.pow(ratio, span);
  var out = new Array(steps);
  for (var i = 0; i < steps; i++) {
    // The ends by identity rather than by `Math.pow(ratio, 0)` and `Math.pow(ratio, span)`, which are 1 and
    // the top to within an ulp and not exactly. The same reason `oklchLadder` takes its anchors by index: a
    // top that comes out 30.374999999999996 is invisible until something compares it.
    out[i] = i === 0 ? from
      : i === span ? top
      : from * Math.pow(ratio, span * bezierAt(curve, i / span));
  }
  return out;
}

/**
 * The per-step growth, however the caller spelled it.
 *
 * `ratio` is the spelling that keeps a scale open — it is a rate, so the sequence continues rather than
 * being squeezed into a range. `max` is accepted because configs were briefly written that way, and it is
 * converted rather than kept as a second code path: two ways to reach the same number is how they end up
 * disagreeing.
 */
function bezierScaleRatio(steps, from, opts, warnings) {
  var named = resolveModularRatio(opts.ratio);
  if (named !== null) {
    // **A scale that shrinks is not a scale.** Tokens are named smallest to largest, so a ratio at or below
    // 1 contradicts the list it is filling — and it does not fail, it quietly generates `0, 0, 0, 1, 2, 4`
    // and rounds most of it to nothing. Found by typing a curve's coordinates into the growth field, where
    // `0.42` was read as the growth and the panel drew a descending ladder without comment.
    if (named <= 1) {
      warnings.push(scaleWarning(
        'scale-ratio-not-growing',
        'A growth of ' + named + ' makes each step smaller than the last, and these tokens are named ' +
        'smallest to largest. Use a number above 1 — 1.25 is a major third, 1.5 a perfect fifth.'
      ));
      return null;
    }
    return named;
  }

  if (typeof opts.max === 'number' && isFinite(opts.max)) {
    if (!(opts.max > 0)) {
      warnings.push(scaleWarning(
        'scale-bezier-positive',
        'A bezier scale needs a largest value above zero to ramp towards (got ' + opts.max + ').'
      ));
      return null;
    }
    return Math.pow(opts.max / from, 1 / (steps - 1));
  }

  warnings.push(scaleWarning(
    'scale-ratio-required',
    'A bezier scale needs a `ratio` — the growth from one step to the next. The largest value comes out of ' +
    'it and the number of tokens, so the scale keeps going when you add one instead of being squeezed to fit.'
  ));
  return null;
}

/**
 * A modular scale's parameters as a bezier ramp's — which is now almost nothing, because they are the same
 * model. A modular scale is a constant ratio; a bezier scale is a ratio with a curve on it; a flat curve is
 * a constant ratio. The only translation left is where the base sits.
 *
 * `modular` walks outwards from a base that may be part-way up the token list; `bezier` starts at its base
 * and climbs. So the base is moved down to step 0 — `base / ratio^baseIndex` — which is the same sequence
 * read from its bottom instead of from its middle.
 */
function modularAsBezier(steps, opts, warnings) {
  var ratio = resolveModularRatio(opts.ratio);
  if (ratio === null || ratio <= 0) {
    warnings.push(scaleWarning(
      'scale-ratio-unknown',
      'Unknown ratio "' + opts.ratio + '". Use a number, or one of: ' + Object.keys(modularRatios()).join(', ') + '.'
    ));
    return null;
  }
  var baseIndex = scaleBaseIndex(steps, opts);
  var baseValue = scaleBaseValue(opts);
  if (!(baseValue > 0)) {
    warnings.push(scaleWarning(
      'scale-bezier-positive',
      'A modular scale multiplies its base by a ratio, so the base has to be above zero (got ' + baseValue + ').'
    ));
    return null;
  }

  // **A `max` beside a ratio is still ignored, and still says so.** The top comes out of the ratio, which is
  // the whole point of the model, and a `max` sitting next to it describes a scale nobody is generating.
  if (typeof opts.max === 'number') {
    warnings.push(scaleWarning(
      'scale-max-ignored',
      '`max` does not apply to a modular scale — its top comes from the ratio and the number of steps. ' +
      'Use `clamp` to be told when it goes past a number.'
    ));
  }

  var next = {};
  for (var k in opts) {
    if (Object.prototype.hasOwnProperty.call(opts, k)) next[k] = opts[k];
  }
  next.baseValue = baseValue / Math.pow(ratio, baseIndex);
  next.baseIndex = 0;
  next.ratio = ratio;
  next.max = undefined;
  // A straight curve, which is what makes it modular. An `opts.curve` alongside a `ratio` would be two
  // descriptions of one shape, so the ratio wins and the curve is dropped.
  next.curve = [];
  return next;
}

/**
 * `size(n) = size(n-1) + (INT((n-1)/mod) + 1) × step` above the base, `− step` below.
 * A base of 4 with a step of 4 growing every 3 gives 4, 8, 12, 16, 24, 32 — the sequence a
 * design system doc actually writes down.
 */
function metricSequence(steps, opts, warnings) {
  var step = typeof opts.step === 'number' && isFinite(opts.step) ? opts.step : 0;
  if (step <= 0) {
    warnings.push(scaleWarning('scale-step-required', 'A metric scale needs a positive `step`.'));
    return null;
  }
  var mod = typeof opts.mod === 'number' && opts.mod >= 1 ? Math.floor(opts.mod) : 1;

  var baseIndex = scaleBaseIndex(steps, opts);
  var out = new Array(steps);
  out[baseIndex] = scaleBaseValue(opts);
  var i;
  for (i = baseIndex + 1; i < steps; i++) {
    var above = i - baseIndex;
    out[i] = out[i - 1] + (Math.floor((above - 1) / mod) + 1) * step;
  }
  for (i = baseIndex - 1; i >= 0; i--) out[i] = out[i + 1] - step;
  return out;
}

/**
 * Each step the sum of the two before it: `4, 8, 12, 20, 32, 52, 84, 136 …`
 *
 * **Márton's own frame is why this exists.** Its spacing values are labelled *1.618 Golden ratio* and
 * are exactly this sequence — a golden-ratio geometric from 4 gives `4, 6.47, 10.47, 16.94 …`, which is
 * not what he drew. The ratios of a Fibonacci sequence converge on φ (2.0, 1.5, 1.667, 1.6, 1.625,
 * 1.615, 1.619, 1.618), which is why it reads as golden while behaving better: **it stays whole**. A
 * true φ scale needs rounding at every step, which is where the *"Rounded from 10.9"* notes beside half
 * those rows come from.
 *
 * Seeded by `baseValue` and `step`: the base, then the base plus the step, then sums. Below the base it
 * walks down by `step`, the same as a metric scale — a sequence defined by addition has nothing to say
 * about what comes before its start.
 */
function fibonacciSequence(steps, opts, warnings) {
  var step = typeof opts.step === 'number' && isFinite(opts.step) ? opts.step : 0;
  if (step <= 0) {
    warnings.push(scaleWarning(
      'scale-step-required',
      'A fibonacci scale needs a positive `step` — it is the first increment, and the sequence is the ' +
      'base, the base plus the step, then each value the sum of the two before it.'
    ));
    return null;
  }

  var baseIndex = scaleBaseIndex(steps, opts);
  var out = new Array(steps);
  out[baseIndex] = scaleBaseValue(opts);
  var i;
  for (i = baseIndex + 1; i < steps; i++) {
    out[i] = i === baseIndex + 1 ? out[baseIndex] + step : out[i - 1] + out[i - 2];
  }
  for (i = baseIndex - 1; i >= 0; i--) out[i] = out[i + 1] - step;
  return out;
}

/**
 * `min` is the floor, in every derived model.
 *
 * One step held at the floor is the config doing what it says — a base part-way up the token list
 * means the step below it lands under the minimum, and the minimum is there to catch it. That is
 * a line in the summary, not a warning. **Several** steps held is different: the model and the
 * token list disagree about how many steps there are below the base, and flattening three tokens
 * onto one number is worth interrupting for.
 */
function applyScaleFloor(sequence, opts, warnings) {
  var held = [];
  var out = sequence.map(function(v, i) {
    if (v < opts.min) {
      held.push(scaleTokenName(opts, i));
      return opts.min;
    }
    return v;
  });

  if (held.length === 1) {
    warnings.push(scaleWarning(
      'scale-floor-held',
      held[0] + ' held at the minimum of ' + opts.min + '.',
      { held: held }
    ));
  } else if (held.length > 1) {
    warnings.push(scaleWarning(
      'scale-floored',
      held.length + ' steps land below the minimum of ' + opts.min + ' and were flattened onto it (' +
      held.join(', ') + '). Move the base up the token list, or drop the steps below it.',
      { held: held }
    ));
  }
  return out;
}

/** Told, not squashed: honouring a clamp would change the ratio the scale promises to hold. */
function reportClamp(sequence, opts, warnings) {
  if (typeof opts.clamp !== 'number' || !isFinite(opts.clamp)) return warnings;
  var firstOver = -1;
  var topIndex = 0;
  for (var i = 0; i < sequence.length; i++) {
    if (firstOver === -1 && sequence[i] > opts.clamp) firstOver = i;
    if (sequence[i] > sequence[topIndex]) topIndex = i;
  }
  if (firstOver === -1) return warnings;

  // Both numbers, because they answer different questions: where it left the budget tells you
  // which step to drop, and where it ends up tells you what you would have to raise the clamp to.
  var round = function(v) { return Math.round(v * 100) / 100; };
  var message = 'This scale passes the clamp of ' + opts.clamp + ' at ' + scaleTokenName(opts, firstOver) +
    ' (' + round(sequence[firstOver]) + ')';
  if (topIndex !== firstOver) {
    message += ' and reaches ' + round(sequence[topIndex]) + ' at ' + scaleTokenName(opts, topIndex);
  }
  message += '. Nothing was squashed — raise the clamp, ease the growth, or drop a step.';

  warnings.push(scaleWarning('scale-clamp-exceeded', message, {
    at: scaleTokenName(opts, firstOver),
    value: sequence[firstOver],
    top: sequence[topIndex],
    clamp: opts.clamp
  }));
  return warnings;
}

// ============================================================================
// RECOGNITION
//
// The inverse: numbers in, a description of the scale that would produce them out.
//
// Every candidate is **derived** from the values and then **verified by generating** — fed back
// through scaleSequence and accepted only on an exact match. That is what makes it impossible for
// this to claim something the generator will not honour. A recogniser with its own arithmetic is
// a recogniser that can lie about what it found.
// ============================================================================

/** Comparison to a fixed number of decimals: a representation detail, not a tolerance. */
function scaleValuesMatch(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  return Math.round(a * 1e6) === Math.round(b * 1e6);
}

function scaleSequencesMatch(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (!scaleValuesMatch(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Where a candidate differs from the numbers it is meant to explain.
 *
 * `expected` is what the model would produce and `found` is what the file has — the direction a
 * user reads a suggestion in: "metric would give 24 here; your file has 25."
 */
function scaleDeviations(actual, produced) {
  var out = [];
  for (var i = 0; i < produced.length; i++) {
    if (!scaleValuesMatch(actual[i], produced[i])) {
      out.push({
        index: i,
        expected: Math.round(produced[i] * 1e6) / 1e6,
        found: Math.round(actual[i] * 1e6) / 1e6
      });
    }
  }
  return out;
}

/**
 * A named ratio when one matches exactly, so a scale reads the way it was written.
 *
 * No longer used by the recogniser — a recognised ramp is endpoints and a curve now, and has no ratio to
 * name. Kept because a config may still *carry* a ratio through the `modular` alias, and printing 1.618 as
 * `phi` is the difference between a message someone recognises and one they have to decode.
 */
function nameForRatio(ratio) {
  var table = modularRatios();
  for (var name in table) {
    if (Object.prototype.hasOwnProperty.call(table, name) && scaleValuesMatch(table[name], ratio)) return name;
  }
  return ratio;
}

/** Metric's parameters, read off the differences rather than searched for. */
function deriveMetric(values, baseIndex, min) {
  if (values.length < 2) return null;
  var step = values[1] - values[0];
  if (!(step > 0)) return null;

  // `mod` is where the increment first grows. A constant increment means it never does inside
  // this range, which any mod at least as large as the range expresses.
  var mod = values.length;
  for (var i = 2; i < values.length; i++) {
    if (!scaleValuesMatch(values[i] - values[i - 1], step)) {
      mod = i - 1;
      break;
    }
  }
  return { model: 'metric', min: min, baseValue: values[0], baseIndex: baseIndex, step: step, mod: mod };
}

/**
 * A bezier ramp between the ends, with a straight curve.
 *
 * **The straight curve is the only one worth deriving.** A ramp with a bend has four free numbers and a
 * sequence of six values does not pin them — several curves fit, and picking one would be this function
 * inventing a shape the file never claimed. Straight is the case that *is* determined: it means a constant
 * ratio, which is what a modular scale is, so every scale the old recogniser could name is still named.
 * Anything else comes back `explicit` with this as the near-fit, which is where a bend belongs — offered in
 * front of the numbers it would change, not recorded silently.
 */
function deriveBezier(values, baseIndex, min) {
  if (values.length < 2) return null;
  if (!(values[0] > 0) || !(values[values.length - 1] > 0)) return null;
  // The *average* growth across the whole run, not the first pair. They are the same number for a scale
  // that really is geometric — which is the only kind this recognises — and the average is the one that
  // reproduces the last value exactly, so verification is not left chasing a rounding error at the top.
  var ratio = Math.pow(values[values.length - 1] / values[0], 1 / (values.length - 1));
  if (!(ratio > 1)) return null;
  return {
    model: 'bezier', min: min, baseValue: values[0], baseIndex: baseIndex,
    ratio: nameForRatio(ratio), curve: []
  };
}

/** A straight ramp between the ends. The curve is not derivable, so only the even case. */
function deriveEndpoints(values, min) {
  if (values.length < 2) return null;
  return {
    model: 'endpoints',
    min: min,
    max: values[values.length - 1],
    type: 'linear',
    ease: 'none',
    rangeMode: 'full'
  };
}

/** Build a candidate's full option set and run it back through the generator. */
function verifyScaleCandidate(candidate, steps, values) {
  if (!candidate) return null;
  var options = {};
  for (var k in candidate) {
    if (Object.prototype.hasOwnProperty.call(candidate, k) && k !== 'model') options[k] = candidate[k];
  }
  options.steps = steps;
  var produced = scaleSequence(candidate.model, options).values;
  return {
    model: candidate.model,
    options: options,
    produced: produced,
    exact: scaleSequencesMatch(values, produced),
    deviations: scaleDeviations(values, produced)
  };
}

function explicitRecognition(values, note, suggestion) {
  var result = {
    model: 'explicit',
    options: { values: values.slice(), min: values.length ? values[0] : 0 },
    exact: false,
    deviations: []
  };
  if (note) result.note = note;
  if (suggestion) result.suggestion = suggestion;
  return result;
}

/**
 * What scale would produce these numbers?
 *
 * → { model, options, exact, deviations, note?, suggestion? }
 *
 * `explicit` unless a model reproduces the values exactly — a near-fit recorded as metric means
 * the next regeneration silently moves a token, which is a value change by a tool that said it was
 * only recording. A near-miss comes back as `explicit` with the closest fit as a `suggestion`, so
 * switching is a choice made in front of the numbers it would change.
 */
function recogniseScale(values) {
  if (!Array.isArray(values)) return explicitRecognition([], 'Not a list of numbers.');
  for (var n = 0; n < values.length; n++) {
    if (typeof values[n] !== 'number' || isNaN(values[n])) {
      return explicitRecognition([], 'Not every value is a number.');
    }
  }
  if (values.length < 2) return explicitRecognition(values);

  var note = null;
  var i;
  for (i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) note = 'This scale goes down at step ' + (i + 1) + '; no model produces that.';
    else if (scaleValuesMatch(values[i], values[i - 1])) {
      note = i === values.length - 1 || scaleValuesMatch(values[values.length - 1], values[values.length - 2])
        ? 'The top of this scale repeats, which no generator produces — a clamp only warns, and the ramp\'s guard is not part of a model.'
        : 'Two steps share a value, so no model explains all of them.';
    }
    if (note) break;
  }

  // Two passes: the whole list, then the list with its floor-held head removed. The shipped
  // spacing default is 1, 4, 8, 12, 16, 24 — deriving the step from the first difference gives 3
  // and fails, and a textbook metric scale would record as explicit. Verification is against the
  // *full* list either way, so the retry only changes how parameters are guessed at.
  var held = 0;
  while (held + 1 < values.length && scaleValuesMatch(values[held + 1], values[0])) held++;

  var attempts = [{ from: 0, min: values[0] }];
  if (values.length > held + 2) attempts.push({ from: held + 1, min: values[0] });

  var best = null;
  for (var a = 0; a < attempts.length; a++) {
    var from = attempts[a].from;
    var min = attempts[a].min;
    var tail = values.slice(from);
    var candidates = [
      deriveMetric(tail, from, min),
      deriveBezier(tail, from, min),
      from === 0 ? deriveEndpoints(tail, min) : null
    ];
    for (var c = 0; c < candidates.length; c++) {
      var verified = verifyScaleCandidate(candidates[c], values.length, values);
      if (!verified) continue;
      if (verified.exact) return verified;
      if (!best || verified.deviations.length < best.deviations.length) best = verified;
    }
  }

  return explicitRecognition(values, note, best && best.deviations.length > 0 ? best : null);
}
