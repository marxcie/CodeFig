/**
 * Seeing a scale, rather than reading it.
 *
 * A run's numbers arrive as one log line per token per mode. That is enough to check a value and
 * useless for judging one, because what a scale is judged on is **proportion**: whether the steps
 * grow the way a spacing scale should. `4, 8, 12, 16, 24` reads as regular until you see its gaps
 * — `4, 4, 4, 8` — and that is the number the eye is actually after.
 *
 * These tests pin the data behind the picture: the gaps, the bar ratios, and the fact that the
 * ratios are taken against the whole run rather than per column, so a tighter mode looks tighter
 * instead of looking identical to a wider one.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');
const LIBS = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');

function load() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, String, Array, Object, JSON, Date, isNaN, isFinite, parseInt, parseFloat, Number, RegExp
  };
  vm.createContext(ctx);
  for (const file of ['@foundation.js', '@math-helpers.js', '@bezier.js', '@scale-models.js', '@linear-ramp.js']) {
    const source = fs.readFileSync(path.join(LIBS, file), 'utf8');
    for (const table of source.match(/^var [A-Z][A-Z0-9_]* = \{[\s\S]*?\n\};/gm) || []) {
      vm.runInContext(table, ctx);
    }
    for (const [, code] of resolver.extractFunctionMap(source)) vm.runInContext(code, ctx);
  }
  return ctx;
}

const lib = load();

const VARIABLES = {
  'Spacing/px': { values: { Desktop: 1, Mobile: 1 } },
  'Spacing/xs': { values: { Desktop: 4, Mobile: 2 } },
  'Spacing/sm': { values: { Desktop: 8, Mobile: 4 } },
  'Spacing/md': { values: { Desktop: 12, Mobile: 6 } },
  'Spacing/lg': { values: { Desktop: 16, Mobile: 8 } },
  'Spacing/xl': { values: { Desktop: 24, Mobile: 12 } }
};

test('the gaps are the thing the values hide', () => {
  // The shipped default: four even steps and then a jump. Invisible in a column of numbers.
  assert.deepEqual(lib.rampGaps([1, 4, 8, 12, 16, 24]), [3, 4, 4, 4, 8]);
  assert.deepEqual(lib.rampGaps([4]), [], 'one value has no gaps, not a gap of zero');
  assert.deepEqual(lib.rampGaps([]), []);
});

test('a table is tokens down and modes across', () => {
  const table = lib.rampScaleTable(VARIABLES, 'Spacing');
  assert.deepEqual(table.tokens, ['px', 'xs', 'sm', 'md', 'lg', 'xl'], 'the group prefix is off');
  assert.deepEqual(table.modes, ['Desktop', 'Mobile']);
  assert.deepEqual(table.rows[1].cells.map((c) => c.value), [4, 2]);
  assert.deepEqual(table.gaps.Desktop, [3, 4, 4, 4, 8]);
  assert.deepEqual(table.gaps.Mobile, [1, 2, 2, 2, 4]);
});

test('bars are sized against the whole run, so a tighter mode looks tighter', () => {
  // Normalising each column to its own maximum would draw both modes identically, which is
  // exactly the comparison the picture exists to make.
  const table = lib.rampScaleTable(VARIABLES, 'Spacing');
  const xl = table.rows[5];
  assert.equal(table.max, 24);
  assert.equal(xl.cells[0].ratio, 1, 'the largest value anywhere fills its bar');
  assert.equal(xl.cells[1].ratio, 0.5, 'and mobile at 12 is half of it, not full');
});

test('a mode missing a value is a gap in the picture, not a zero', () => {
  const table = lib.rampScaleTable({
    'Spacing/xs': { values: { Desktop: 4 } },
    'Spacing/sm': { values: { Desktop: 8, Mobile: 4 } }
  }, 'Spacing');
  assert.equal(table.rows[0].cells[1].value, null);
  assert.equal(table.rows[0].cells[1].ratio, 0);
  assert.deepEqual(table.gaps.Mobile, [], 'and it is not counted as a step');
});

test('the caption is the model line, not a second description of it', () => {
  // Two sentences saying the same thing drift. The console line and the caption are one function.
  const spec = lib.spacingRampSpec();
  const config = {
    collectionName: 'C', group: 'Spacing', spacings: ['xs', 'sm', 'md'],
    modes: [{ name: 'desktop', model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4, mod: 3 }]
  };
  lib.ensureCompatRampConfig(config, spec);
  lib.materialiseRampTokens(config, spec);
  lib.materialiseRampSizes(config, spec);

  const captions = lib.rampCaptions(config, spec);
  assert.equal(captions.Desktop, 'metric, base 4, step 4, mod 3');
  assert.ok(
    lib.describeRampModels(config, spec).some((line) => line.indexOf(captions.Desktop) !== -1),
    'the console prints the same phrase'
  );
});

test('the html carries every value, gap and caption, and escapes what it is given', () => {
  const table = lib.rampScaleTable(VARIABLES, 'Spacing');
  const html = lib.rampScaleHtml(table, { Desktop: 'metric, base 4, step 4, mod 3' });

  assert.match(html, /metric, base 4, step 4, mod 3/);
  assert.match(html, /4, 4, 4, 8/, 'the gaps are on the page, not only in the data');
  for (const token of table.tokens) assert.match(html, new RegExp('>' + token + '<'));
  assert.match(html, /width:100\.00%/, 'the largest value fills its bar');

  const nasty = lib.rampScaleHtml(
    lib.rampScaleTable({ 'G/<img src=x>': { values: { 'A"B': 2 } } }, 'G'),
    { 'A"B': '<script>' }
  );
  assert.equal(nasty.indexOf('<img src=x>'), -1);
  assert.equal(nasty.indexOf('<script>'), -1);
});
