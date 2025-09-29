// @Math Helpers
// Mathematical utility functions for calculations and number operations
//
// 📚 IMPORT THESE FUNCTIONS IN YOUR SCRIPTS:
// @import { add, average, roundToNearest } from "@Math Helpers"
//
// 🧮 AVAILABLE FUNCTIONS:
// • Basic Math: add, multiply, average
// • Utilities: roundToNearest, clamp, lerp

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

// Demo the functions
console.log('🧮 Math Helper Functions:');
console.log('  add(5, 3) =', add(5, 3));
console.log('  multiply(4, 7) =', multiply(4, 7));
console.log('  average([1, 2, 3, 4, 5]) =', average([1, 2, 3, 4, 5]));
console.log('  roundToNearest(23, 5) =', roundToNearest(23, 5));
console.log('  clamp(15, 0, 10) =', clamp(15, 0, 10));
console.log('  lerp(0, 100, 0.5) =', lerp(0, 100, 0.5));

console.log('');
console.log('✅ Math helpers ready for import!');
console.log('📝 Other scripts can use: @import { add, average, clamp } from "My Math Helpers"');

figma.notify('Math helpers library loaded - ready for sharing!');
