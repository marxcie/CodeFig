const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'typography.js'),
  'utf8'
);
const start = src.indexOf('function typographyStyleNameKey');
const end = src.indexOf('// Function to create or update text styles using the variables');
assert.ok(start !== -1 && end > start, 'helper is in typography.js');
const key = new Function(src.slice(start, end) + '\nreturn typographyStyleNameKey;')();

test('spaced and compact slash spellings are one name', () => {
  assert.strictEqual(key('heading-ENGINEERED V2 / heading-md / Semibold'), 'heading-ENGINEERED V2/heading-md/Semibold');
  assert.strictEqual(key('heading-ENGINEERED V2/heading-md/Semibold'), 'heading-ENGINEERED V2/heading-md/Semibold');
});

test('spaces inside a segment are kept, case is not folded', () => {
  assert.strictEqual(key('Heading ENGINEERED V2 /heading-md'), 'Heading ENGINEERED V2/heading-md');
  assert.notStrictEqual(key('a/Semibold'), key('a/SemiBold'));
});

test('empty and missing names do not throw', () => {
  assert.strictEqual(key(''), '');
  assert.strictEqual(key(undefined), '');
});

test('the style lookup tries the exact name first, then the normalised one', () => {
  assert.ok(/existingStyles\.find\(function\(style\) \{\s*return style\.name === styleName;\s*\}\) \|\| existingStyles\.find\(function\(style\) \{\s*return typographyStyleNameKey\(style\.name\) === wantKey;/.test(src));
});
