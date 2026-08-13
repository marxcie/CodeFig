// @Scale Models
// @DOC_START
// # @Scale Models
// Turns a description of a scale into a sequence of numbers. That is the whole boundary: no
// viewports, no rounding, no variables, no Figma. Two consumers by design — `@Linear Ramp` for
// spacing and corner radius, and typography — because the same four models are specified for
// both, and two implementations of one formula drift the way spacing and radius did.
//
// ## The four models
// | Model | What it is | Where the top comes from |
// |---|---|---|
// | `endpoints` | a ramp from `min` to `max` along a curve | `max` |
// | `modular` | each step a fixed ratio above the last | the ratio and the step count |
// | `metric` | a base plus a step that grows every `mod` steps | the step and the step count |
// | `explicit` | the numbers you typed | you |
//
// `min` is required in all four — it is the floor a scale starts from. `max` is only a limit in
// `endpoints`; in `modular` and `metric` the top is derived, so a `max` beside them is ignored and
// reported. Set `clamp` to be **told** when a scale passes a number, without it being squashed to
// fit: squashing a modular scale changes its ratio, which is the one property it promises to hold.
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
// `@import` does not follow calls across scripts. `endpoints` delegates to `generateScale`, so a
// consumer that uses it must import that too:
//
// ```js
// @import { scaleSequence, resolveModularRatio } from "@Scale Models"
// @import { generateScale, isPiecewiseScaleType, snapScaleGrid } from "@Math Helpers"
// ```
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Sequences | scaleSequence, scaleModelNames |
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
  return ['endpoints', 'modular', 'metric', 'fibonacci', 'explicit'];
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

  if (scaleModelNames().indexOf(name) === -1) {
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

  // modular, metric and fibonacci all walk outwards from a base, and all derive their top.
  if (typeof opts.max === 'number') {
    warnings.push(scaleWarning(
      'scale-max-ignored',
      '`max` does not apply to a ' + name + ' scale — its top comes from the ' +
      (name === 'modular' ? 'ratio' : 'step') + ' and the number of steps. Use `clamp` to be told when it goes past a number.'
    ));
  }

  var built = name === 'modular' ? modularSequence(steps, opts, warnings)
    : name === 'fibonacci' ? fibonacciSequence(steps, opts, warnings)
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

/** `size(n) = size(n-1) × r` above the base, `÷ r` below. */
function modularSequence(steps, opts, warnings) {
  var ratio = resolveModularRatio(opts.ratio);
  if (ratio === null || ratio <= 0) {
    warnings.push(scaleWarning(
      'scale-ratio-unknown',
      'Unknown ratio "' + opts.ratio + '". Use a number, or one of: ' + Object.keys(modularRatios()).join(', ') + '.'
    ));
    return null;
  }

  var baseIndex = scaleBaseIndex(steps, opts);
  var out = new Array(steps);
  out[baseIndex] = scaleBaseValue(opts);
  var i;
  for (i = baseIndex + 1; i < steps; i++) out[i] = out[i - 1] * ratio;
  for (i = baseIndex - 1; i >= 0; i--) out[i] = out[i + 1] / ratio;
  return out;
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

/** A named ratio when one matches exactly, so a recognised scale reads the way it was written. */
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

/** Modular's ratio, read off the first adjacent pair. */
function deriveModular(values, baseIndex, min) {
  if (values.length < 2) return null;
  if (!(values[0] > 0) || !(values[1] > 0)) return null;
  var ratio = values[1] / values[0];
  if (!(ratio > 1)) return null;
  return { model: 'modular', min: min, baseValue: values[0], baseIndex: baseIndex, ratio: nameForRatio(ratio) };
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
      deriveModular(tail, from, min),
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
