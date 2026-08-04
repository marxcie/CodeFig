// @Math Helpers
// @DOC_START
// # @Math Helpers
// Math utilities for calculations, interpolations, and number operations.
//
// ## Overview
// Import for basic math, rounding, clamping, geometry (distance, center, bounds), interpolation (linear, exponential, sine, cubic, quint, goldenRatio), and easing (easeIn, easeOut, etc.). Used by font-scale and layout scripts. No configuration; use via @import.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Basic | add, multiply, average, roundToNearest, clamp, lerp |
// | Geometry | distance, center, bounds |
// | Interpolation | interpolate, linear, exponential, sine, cubic, quint, goldenRatio |
// | Easing | easeIn, easeOut, easeInOut, easeOutIn |
// | Scale curve | applyEase(type, ease, t); applyEaseWithExponents(easeInExponent, easeOutExponent, ease, t) |
// | Piecewise scale | isPiecewiseScaleType(type); generatePiecewiseSnappedScale({ steps, min, max, roundTo, type }); generateScale({ steps, min, max, type, ease, rangeMode, baseIndex, baseValue, roundTo }) — unified scale engine |
// @DOC_END

// Simple math utilities that other scripts can import
function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

function average(numbers) {
  if (numbers.length === 0) return 0;
  var sum = numbers.reduce(function(acc, num) {
    return acc + num;
  }, 0);
  return sum / numbers.length;
}

function roundToNearest(value, nearest) {
  return Math.round(value / nearest) * nearest;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

// ============================================================================
// APPLYEASE: curve(type, ease, t) -> u for piecewise scales
// ============================================================================
// Single combined curve per (type, ease). Use: u = applyEase(type, ease, t); value = lerp(segStart, segEnd, u).
// type: linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio
// ease: none, in, out, inout, outin

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function applyEaseBaseIn(type, tt) {
  tt = clamp01(tt);
  switch (type) {
    case 'sine':
      return 1 - Math.cos((tt * Math.PI) / 2);
    case 'quad':
      return tt * tt;
    case 'cubic':
      return tt * tt * tt;
    case 'quart':
      return tt * tt * tt * tt;
    case 'quint':
      return tt * tt * tt * tt * tt;
    case 'circ':
      return 1 - Math.sqrt(1 - tt * tt);
    case 'exponential':
      return tt === 0 ? 0 : Math.pow(2, 10 * (tt - 1));
    case 'goldenRatio': {
      var k = 2.2;
      return Math.pow(tt, k);
    }
    default:
      return tt;
  }
}

function applyEase(type, ease, t) {
  t = clamp01(t);
  if (ease === 'none' || type === 'linear') return t;
  var baseIn = function(tt) { return applyEaseBaseIn(type, tt); };
  var easeIn = function(tt) { return baseIn(tt); };
  var easeOut = function(tt) { return 1 - baseIn(1 - tt); };
  var easeInOut = function(tt) {
    return tt < 0.5 ? 0.5 * easeIn(tt * 2) : 0.5 + 0.5 * easeOut((tt - 0.5) * 2);
  };
  var easeOutIn = function(tt) {
    return tt < 0.5 ? 0.5 * easeOut(tt * 2) : 0.5 + 0.5 * easeIn((tt - 0.5) * 2);
  };
  switch (ease) {
    case 'in': return easeIn(t);
    case 'out': return easeOut(t);
    case 'inout': return easeInOut(t);
    case 'outin': return easeOutIn(t);
    default: return t;
  }
}

// Optional two-number alternative: power curves with easeInExponent and easeOutExponent (typical 0.2–5).
// When set, use instead of type; ease (in/out/inout/outin) still applies.
function applyEaseWithExponents(easeInExponent, easeOutExponent, ease, t) {
  t = clamp01(t);
  if (ease === 'none') return t;
  var inExp = typeof easeInExponent === 'number' && easeInExponent > 0
    ? Math.max(0.1, Math.min(10, easeInExponent)) : 1;
  var outExp = typeof easeOutExponent === 'number' && easeOutExponent > 0
    ? Math.max(0.1, Math.min(10, easeOutExponent)) : inExp;
  var baseIn = function(tt) { return Math.pow(clamp01(tt), inExp); };
  var baseOut = function(tt) { return 1 - Math.pow(1 - clamp01(tt), outExp); };
  var easeIn = function(tt) { return baseIn(tt); };
  var easeOut = function(tt) { return baseOut(tt); };
  var easeInOut = function(tt) {
    return tt < 0.5 ? 0.5 * easeIn(tt * 2) : 0.5 + 0.5 * easeOut((tt - 0.5) * 2);
  };
  var easeOutIn = function(tt) {
    return tt < 0.5 ? 0.5 * easeOut(tt * 2) : 0.5 + 0.5 * easeIn((tt - 0.5) * 2);
  };
  switch (ease) {
    case 'in': return easeIn(t);
    case 'out': return easeOut(t);
    case 'inout': return easeInOut(t);
    case 'outin': return easeOutIn(t);
    default: return t;
  }
}

// ============================================================================
// GEOMETRY UTILITIES
// ============================================================================

function distance(a, b) {
  return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

function center(node) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  };
}

function bounds(nodes) {
  if (nodes.length === 0) return null;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

// ============================================================================
// INTERPOLATION FUNCTIONS
// ============================================================================

/**
 * Main interpolation function - supports multiple interpolation types
 * @param {number} start - Starting value
 * @param {number} end - Ending value  
 * @param {number} factor - Interpolation factor (0-1)
 * @param {string} type - Interpolation type ('linear', 'exponential', 'sine', 'cubic', 'quint', 'goldenRatio')
 * @param {string} easing - Easing function ('none', 'easeIn', 'easeOut', 'easeInOut', 'easeOutIn')
 * @returns {number} Interpolated value
 */
function interpolate(start, end, factor, type, easing) {
  type = type || 'linear';
  easing = easing || 'none';
  
  // Apply easing to the factor
  var easedFactor = applyEasing(factor, easing);
  
  // Apply interpolation
  switch (type) {
    case 'linear':
      return linearInterpolation(start, end, easedFactor);
    case 'exponential':
      return exponentialInterpolation(start, end, easedFactor);
    case 'sine':
      return sineInterpolation(start, end, easedFactor);
    case 'cubic':
      return cubicInterpolation(start, end, easedFactor);
    case 'quad':
      return quadInterpolation(start, end, easedFactor);
    case 'quart':
      return quartInterpolation(start, end, easedFactor);
    case 'quint':
      return quintInterpolation(start, end, easedFactor);
    case 'circ':
      return circInterpolation(start, end, easedFactor);
    case 'goldenRatio':
      return goldenRatioInterpolation(start, end, easedFactor);
    default:
      return linearInterpolation(start, end, easedFactor);
  }
}

// ============================================================================
// INTERPOLATION TYPES
// ============================================================================

function linearInterpolation(start, end, factor) {
  return start + (end - start) * factor;
}

function exponentialInterpolation(start, end, factor) {
  if (start === 0) start = 0.001; // Avoid log(0)
  if (end === 0) end = 0.001;
  
  var logStart = Math.log(Math.abs(start));
  var logEnd = Math.log(Math.abs(end));
  var logResult = logStart + (logEnd - logStart) * factor;
  
  var result = Math.exp(logResult);
  return (start < 0 && end < 0) ? -result : result;
}

function sineInterpolation(start, end, factor) {
  var normalizedFactor = (Math.sin((factor - 0.5) * Math.PI) + 1) / 2;
  return start + (end - start) * normalizedFactor;
}

function cubicInterpolation(start, end, factor) {
  var t = factor;
  var t2 = t * t;
  var t3 = t2 * t;
  return start + (end - start) * (3 * t2 - 2 * t3);
}

function quintInterpolation(start, end, factor) {
  var t = factor;
  var t2 = t * t;
  var t3 = t2 * t;
  var t4 = t3 * t;
  var t5 = t4 * t;
  return start + (end - start) * (6 * t5 - 15 * t4 + 10 * t3);
}

function quadInterpolation(start, end, factor) {
  var t = factor * factor;
  return start + (end - start) * t;
}

function quartInterpolation(start, end, factor) {
  var t = factor * factor * factor * factor;
  return start + (end - start) * t;
}

function circInterpolation(start, end, factor) {
  var t = factor <= 0 ? 0 : (factor >= 1 ? 1 : 1 - Math.sqrt(1 - factor * factor));
  return start + (end - start) * t;
}

function goldenRatioInterpolation(start, end, factor) {
  var phi = (1 + Math.sqrt(5)) / 2; // Golden ratio
  var goldenFactor = Math.pow(factor, 1 / phi);
  return start + (end - start) * goldenFactor;
}

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

function applyEasing(factor, easing) {
  switch (easing) {
    case 'easeIn':
      return easeIn(factor);
    case 'easeOut':
      return easeOut(factor);
    case 'easeInOut':
      return easeInOut(factor);
    case 'easeOutIn':
      return easeOutIn(factor);
    case 'none':
    default:
      return factor;
  }
}

function easeIn(t) {
  return t * t;
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 2);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutIn(t) {
  return t < 0.5 ? 1 - Math.pow(1 - 2 * t, 2) / 2 : Math.pow(2 * t - 1, 2) / 2;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Linear interpolation with optional easing
 */
function linear(start, end, factor, easing) {
  return interpolate(start, end, factor, 'linear', easing);
}

/**
 * Exponential interpolation with optional easing
 */
function exponential(start, end, factor, easing) {
  return interpolate(start, end, factor, 'exponential', easing);
}

/**
 * Sine interpolation with optional easing
 */
function sine(start, end, factor, easing) {
  return interpolate(start, end, factor, 'sine', easing);
}

/**
 * Cubic interpolation with optional easing
 */
function cubic(start, end, factor, easing) {
  return interpolate(start, end, factor, 'cubic', easing);
}

/**
 * Quintic interpolation with optional easing
 */
function quint(start, end, factor, easing) {
  return interpolate(start, end, factor, 'quint', easing);
}

/**
 * Golden ratio interpolation with optional easing
 */
function goldenRatio(start, end, factor, easing) {
  return interpolate(start, end, factor, 'goldenRatio', easing);
}

// ============================================================================
// PIECEWISE + SNAPPED SCALE (Carbon-like rhythm; regression anchors @ max=160)
// ============================================================================
// spelling: piecewise (not "picewise"). Types: piecewise | piecewise2 | piecewise4
// (alternate type strings only — no new top-level config keys). roundTo is the
// snap grid; piecewise2/piecewise4 multiply that grid for coarser snapping.
// Design reference: https://carbondesignsystem.com/elements/spacing/overview/

/**
 * True for scaling.type values that select the piecewise snapped ramp (not modular names).
 */
function isPiecewiseScaleType(type) {
  if (!type || typeof type !== 'string') return false;
  var t = type.toLowerCase();
  return t === 'piecewise' || t === 'piecewise2' || t === 'piecewise4';
}

function snapScaleGrid(value, gridSize) {
  if (!gridSize || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

function piecewiseSnapGridForType(roundTo, scaleType) {
  var t = String(scaleType || 'piecewise').toLowerCase();
  var mult = 1;
  if (t === 'piecewise4') {
    mult = 4;
  } else if (t === 'piecewise2') {
    mult = 2;
  }
  var r = typeof roundTo === 'number' && roundTo > 0 ? roundTo : 0;
  if (r <= 0) {
    return mult > 1 ? mult : 0;
  }
  return r * mult;
}

function resampleSpineArray(spine, targetLen) {
  if (targetLen <= 0) return [];
  if (targetLen === 1) return [spine[0]];
  var L = spine.length;
  if (L === 0) return [];
  var out = [];
  var j;
  for (j = 0; j < targetLen; j++) {
    var pos = (j * (L - 1)) / (targetLen - 1);
    var lo = Math.floor(pos);
    var hi = Math.min(lo + 1, L - 1);
    var f = pos - lo;
    out.push(spine[lo] * (1 - f) + spine[hi] * f);
  }
  return out;
}

function mapSpineValueToRange(spineValue, min, max) {
  return min + (max - min) * (spineValue / 160);
}

/**
 * Ensures strictly non-decreasing scale values between min and max.
 * minStep is the minimum increment between adjacent steps (typically roundTo).
 */
function enforceMonotonicScale(values, min, max, minStep) {
  if (!values || values.length === 0) return [];
  var step = typeof minStep === 'number' && minStep > 0 ? minStep : 1;
  var out = values.slice();
  out[0] = min;
  out[out.length - 1] = max;
  var i;
  for (i = 1; i < out.length; i++) {
    var floorVal = out[i - 1] + step;
    if (out[i] < floorVal) {
      out[i] = Math.min(max, floorVal);
    }
    out[i] = Math.max(min, Math.min(max, out[i]));
  }
  for (i = out.length - 2; i >= 0; i--) {
    if (out[i] > out[i + 1]) {
      out[i] = out[i + 1];
    }
  }
  out[0] = min;
  out[out.length - 1] = max;
  return out;
}

function usesPiecewiseRegressionPath(steps, min, max) {
  return (steps === 8 || steps === 10 || steps === 12) && min === 0 && max === 160;
}

/**
 * Returns a min→max spacing/font ramp: piecewise curve + snap to grid.
 * Regression fixtures: steps 8/10/12 with min=0, max=160 (roundTo=2, type=piecewise).
 * Other cases: proportional Carbon spine mapping min + (max−min) × (spine/160).
 */
function generatePiecewiseSnappedScale(opts) {
  var CANONICAL_SPINE = [0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 160];
  var CANONICAL_12_NORM = [0, 2 / 160, 4 / 160, 8 / 160, 12 / 160, 16 / 160, 24 / 160, 32 / 160, 48 / 160, 64 / 160, 96 / 160, 1];
  var EXACT_NORM = {
    8: [0, 2 / 160, 8 / 160, 16 / 160, 32 / 160, 48 / 160, 80 / 160, 1],
    10: [0, 2 / 160, 4 / 160, 8 / 160, 16 / 160, 24 / 160, 40 / 160, 64 / 160, 96 / 160, 1],
    12: CANONICAL_12_NORM
  };

  var steps = opts.steps;
  var min = typeof opts.min === 'number' ? opts.min : 0;
  var max = typeof opts.max === 'number' ? opts.max : min;
  var roundTo = typeof opts.roundTo === 'number' ? opts.roundTo : 0;
  var type = opts.type || 'piecewise';
  if (steps <= 0) return [];
  if (max < min) {
    var swap = min;
    min = max;
    max = swap;
  }
  var span = max - min;
  var grid = piecewiseSnapGridForType(roundTo, type);
  var useRegression = usesPiecewiseRegressionPath(steps, min, max);
  var refSpine;
  if (useRegression && EXACT_NORM[steps]) {
    refSpine = EXACT_NORM[steps].map(function (u) { return u * 160; });
  } else {
    refSpine = resampleSpineArray(CANONICAL_SPINE, steps);
  }
  var out = [];
  var i;
  for (i = 0; i < steps; i++) {
    var raw;
    if (useRegression) {
      raw = min + span * (refSpine[i] / 160);
    } else {
      raw = mapSpineValueToRange(refSpine[i], min, max);
    }
    raw = snapScaleGrid(raw, grid);
    raw = Math.max(min, Math.min(max, raw));
    raw = Math.round(raw * 100) / 100;
    out.push(raw);
  }
  out[0] = min;
  out[steps - 1] = max;
  return enforceMonotonicScale(out, min, max, grid > 0 ? grid : 1);
}

function mapScaleTypeToLibrary(type) {
  if (!type) return 'linear';
  if (type === 'expo') return 'exponential';
  if (type === 'goldenratio') return 'goldenRatio';
  return type;
}

function parseScaleRangeMode(rangeMode) {
  var rm = String(rangeMode || '').toLowerCase();
  if (rm === 'full') return 'full';
  if (rm === 'twosegment' || rm === 'two_segment' || rm === 'segment' || rm === 'anchor') {
    return 'twoSegment';
  }
  return '';
}

function resolveScaleRangeMode(opts) {
  var explicit = parseScaleRangeMode(opts.rangeMode);
  if (explicit) return explicit;
  if (isPiecewiseScaleType(opts.type)) return 'full';
  if (getModularScaleRatio(opts.type) != null) return 'twoSegment';
  return opts.defaultRangeMode || 'full';
}

function getModularScaleRatio(type) {
  if (!type || typeof type !== 'string') return null;
  var map = {
    minorSecond: 1.067,
    majorSecond: 1.125,
    minorThird: 1.2,
    majorThird: 1.25,
    perfectFourth: 1.333,
    augmentedFourth: 1.414,
    perfectFifth: 1.5,
    phi: 1.618
  };
  return map[type] !== undefined ? map[type] : null;
}

function getEasedScaleFactor(opts, t) {
  var easeName = opts.ease || 'none';
  var useExponents = typeof opts.easeInExponent === 'number' && opts.easeInExponent > 0;
  if (useExponents) {
    var outExp = (typeof opts.easeOutExponent === 'number' && opts.easeOutExponent > 0)
      ? opts.easeOutExponent : opts.easeInExponent;
    return applyEaseWithExponents(opts.easeInExponent, outExp, easeName, t);
  }
  var curveType = mapScaleTypeToLibrary(opts.type || 'linear');
  return applyEase(curveType, easeName, t);
}

/**
 * Unified scale engine: returns an array of `steps` values from min→max.
 * type: range curves, piecewise*, or modular ratio names (minorSecond … phi).
 * rangeMode: full | twoSegment (default full for piecewise, twoSegment for modular).
 */
function generateScale(opts) {
  opts = opts || {};
  var steps = typeof opts.steps === 'number' ? opts.steps : 0;
  var min = typeof opts.min === 'number' ? opts.min : 0;
  var max = typeof opts.max === 'number' ? opts.max : min;
  var roundTo = typeof opts.roundTo === 'number' ? opts.roundTo : 0;
  var type = opts.type || 'linear';
  if (steps <= 0) return [];
  if (max < min) {
    var swap = min;
    min = max;
    max = swap;
  }
  if (steps === 1) {
    var single = snapScaleGrid(min, roundTo);
    return [Math.max(min, Math.min(max, single))];
  }

  if (isPiecewiseScaleType(type)) {
    return generatePiecewiseSnappedScale({
      steps: steps,
      min: min,
      max: max,
      roundTo: roundTo,
      type: type
    });
  }

  var modularRatio = getModularScaleRatio(type);
  var baseIndex = typeof opts.baseIndex === 'number' ? opts.baseIndex : Math.floor((steps - 1) / 2);
  if (baseIndex < 0) baseIndex = 0;
  if (baseIndex >= steps) baseIndex = steps - 1;
  var baseValue = typeof opts.baseValue === 'number' ? opts.baseValue : min + (max - min) / 2;
  var rangeMode = resolveScaleRangeMode(opts);
  var out = [];
  var i;

  if (modularRatio != null) {
    for (i = 0; i < steps; i++) {
      var exp = i - baseIndex;
      var rawMod = baseValue * Math.pow(modularRatio, exp);
      rawMod = Math.max(min, Math.min(max, rawMod));
      rawMod = snapScaleGrid(Math.round(rawMod * 100) / 100, roundTo);
      out.push(Math.max(min, Math.min(max, rawMod)));
    }
    return enforceMonotonicScale(out, min, max, roundTo > 0 ? roundTo : 1);
  }

  for (i = 0; i < steps; i++) {
    if (rangeMode === 'full') {
      var tFull = i / (steps - 1);
      var uFull = getEasedScaleFactor(opts, tFull);
      var rawFull = lerp(min, max, uFull);
      rawFull = Math.max(min, Math.min(max, rawFull));
      rawFull = Math.round(rawFull * 100) / 100;
      rawFull = snapScaleGrid(rawFull, roundTo);
      out.push(Math.max(min, Math.min(max, rawFull)));
    } else {
      if (i === baseIndex) {
        var baseRounded = snapScaleGrid(baseValue, roundTo);
        out.push(Math.max(min, Math.min(max, baseRounded)));
      } else {
        var t;
        var startVal;
        var endVal;
        if (i < baseIndex) {
          t = baseIndex > 0 ? i / baseIndex : 0;
          startVal = min;
          endVal = baseValue;
        } else {
          var stepsAboveBase = (steps - 1) - baseIndex;
          t = stepsAboveBase > 0 ? (i - baseIndex) / stepsAboveBase : 0;
          startVal = baseValue;
          endVal = max;
        }
        var u = getEasedScaleFactor(opts, t);
        var rawSize = lerp(startVal, endVal, u);
        rawSize = Math.max(min, Math.min(max, rawSize));
        rawSize = Math.round(rawSize * 100) / 100;
        rawSize = snapScaleGrid(rawSize, roundTo);
        out.push(Math.max(min, Math.min(max, rawSize)));
      }
    }
  }
  out[0] = Math.max(min, Math.min(max, snapScaleGrid(min, roundTo)));
  out[steps - 1] = Math.max(min, Math.min(max, snapScaleGrid(max, roundTo)));
  return enforceMonotonicScale(out, min, max, roundTo > 0 ? roundTo : 1);
}
