// @Math Helpers
// @DOC_START
// # @Math Helpers
// Math utilities for calculations, interpolations, and number operations.
//
// ## Overview
// Import for basic math, rounding, clamping, geometry (distance, center, bounds), interpolation (linear, exponential, sine, cubic, quint, goldenRatio), and easing (easeIn, easeOut, etc.). Used by font-scale and layout scripts. No configuration; use via @import.
//
// ## Exported functions (examples)
// - **Basic:** add, multiply, average, roundToNearest, clamp, lerp
// - **Geometry:** distance, center, bounds
// - **Interpolation:** interpolate, linear, exponential, sine, cubic, quint, goldenRatio
// - **Easing:** easeIn, easeOut, easeInOut, easeOutIn
// - **Scale curve:** applyEase(type, ease, t) returns u in [0,1] for piecewise scales (type-specific ease-in/out). Use with lerp: size = lerp(min, max, applyEase(type, ease, t)). Types: linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio. Eases: none, in, out, inout, outin.
// - **Custom exponents:** applyEaseWithExponents(easeInExponent, easeOutExponent, ease, t) uses power curves t^in and 1-(1-t)^out instead of a named type. Ease still in/out/inout/outin. Exponents in (0, 10], typical 0.2–5.
// @DOC_END

console.log('📚 @Math Helpers Library');

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

// Demo the functions
console.log('🧮 Math Helper Functions:');
console.log('  add(5, 3) =', add(5, 3));
console.log('  multiply(4, 7) =', multiply(4, 7));
console.log('  average([1, 2, 3, 4, 5]) =', average([1, 2, 3, 4, 5]));
console.log('  roundToNearest(23, 5) =', roundToNearest(23, 5));
console.log('  clamp(15, 0, 10) =', clamp(15, 0, 10));
console.log('  lerp(0, 100, 0.5) =', lerp(0, 100, 0.5));

console.log('');
console.log('📐 Geometry Functions:');
console.log('  distance({x:0, y:0}, {x:3, y:4}) =', distance({x:0, y:0}, {x:3, y:4}));
console.log('  center({x:10, y:20, width:100, height:50}) =', center({x:10, y:20, width:100, height:50}));

console.log('');
console.log('📈 Interpolation Functions:');
console.log('  linear(0, 100, 0.5) =', linear(0, 100, 0.5));
console.log('  exponential(1, 100, 0.5) =', exponential(1, 100, 0.5));
console.log('  sine(0, 100, 0.5) =', sine(0, 100, 0.5));
console.log('  cubic(0, 100, 0.5) =', cubic(0, 100, 0.5));
console.log('  quint(0, 100, 0.5) =', quint(0, 100, 0.5));
console.log('  goldenRatio(0, 100, 0.5) =', goldenRatio(0, 100, 0.5));

console.log('');
console.log('🎭 Easing Functions:');
console.log('  interpolate(0, 100, 0.5, "linear", "easeIn") =', interpolate(0, 100, 0.5, 'linear', 'easeIn'));
console.log('  interpolate(0, 100, 0.5, "cubic", "easeOut") =', interpolate(0, 100, 0.5, 'cubic', 'easeOut'));
console.log('  interpolate(0, 100, 0.5, "sine", "easeInOut") =', interpolate(0, 100, 0.5, 'sine', 'easeInOut'));

console.log('');
console.log('✅ Math helpers ready for import!');
console.log('📝 Other scripts can use: @import { add, average, clamp, distance, center, interpolate, linear, exponential } from "@Math Helpers"');

figma.notify('Math helpers library loaded with interpolation functions!');
