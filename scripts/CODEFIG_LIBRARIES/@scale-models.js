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
  return table[ratio] !== undefined ? table[ratio] : null;
}

function scaleModelNames() {
  return ['endpoints', 'modular', 'metric', 'explicit'];
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

  // modular and metric both walk outwards from a base, and both derive their top.
  if (typeof opts.max === 'number') {
    warnings.push(scaleWarning(
      'scale-max-ignored',
      '`max` does not apply to a ' + name + ' scale — its top comes from the ' +
      (name === 'modular' ? 'ratio' : 'step') + ' and the number of steps. Use `clamp` to be told when it goes past a number.'
    ));
  }

  var built = name === 'modular'
    ? modularSequence(steps, opts, warnings)
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

/** The old code path, unchanged: a ramp between two endpoints along a curve. */
function endpointsSequence(steps, opts, warnings) {
  var passed = {};
  for (var k in opts) {
    if (Object.prototype.hasOwnProperty.call(opts, k)) passed[k] = opts[k];
  }
  passed.steps = steps;
  return { values: generateScale(passed), warnings: warnings };
}

function scaleBaseIndex(steps, opts) {
  var baseIndex = typeof opts.baseIndex === 'number' ? Math.floor(opts.baseIndex) : Math.floor((steps - 1) / 2);
  if (baseIndex < 0) return 0;
  if (baseIndex > steps - 1) return steps - 1;
  return baseIndex;
}

function scaleBaseValue(opts) {
  if (typeof opts.base === 'number' && isFinite(opts.base)) return opts.base;
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
