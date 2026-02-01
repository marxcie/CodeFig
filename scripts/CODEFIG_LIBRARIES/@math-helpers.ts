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
    case 'quint':
      return quintInterpolation(start, end, easedFactor);
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
