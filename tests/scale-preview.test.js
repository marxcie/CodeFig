/**
 * The preview, and the one property that makes it safe to run on a keystroke: it cannot write.
 *
 * The InfoPanel answers "what did that do". It cannot answer "what happens if I change this to 3",
 * because it appears after a run and covers the UI — and judging a scale is iterative. So the
 * Configuration tab gets the same picture, redrawn as you type.
 *
 * "Run the script with writes disabled" would mean auditing every write path and trusting the
 * audit. Instead the preview is a declared function that composes the pure half of the pipeline,
 * and a source-level test says so — the same guard `resolveRampSets` carries.
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
  for (const file of ['@foundation.js', '@math-helpers.js', '@scale-models.js', '@linear-ramp.js']) {
    const source = fs.readFileSync(path.join(LIBS, file), 'utf8');
    for (const table of source.match(/^var [A-Z][A-Z0-9_]* = \{[\s\S]*?\n\};/gm) || []) {
      vm.runInContext(table, ctx);
    }
    for (const [, code] of resolver.extractFunctionMap(source)) vm.runInContext(code, ctx);
  }
  return ctx;
}

const lib = load();
const rampSource = fs.readFileSync(path.join(LIBS, '@linear-ramp.js'), 'utf8');

const SPACING = {
  collectionName: 'Responsive System', group: 'Spacing',
  spacings: ['px', 'xs', 'sm', 'md', 'lg', 'xl'], roundTo: 2,
  modes: [
    { name: 'desktop', model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4, mod: 3 },
    { name: 'mobile', model: 'metric', min: 1, base: { level: 'xs', size: 2 }, step: 2, mod: 3 }
  ]
};

test('a preview cannot write, by construction', () => {
  const map = resolver.extractFunctionMap(rampSource);
  const source = map.get('rampPreviewHtml');
  assert.ok(source, 'rampPreviewHtml is not extractable, so it cannot be imported either');
  assert.equal(source.indexOf('figma.'), -1, 'a preview that can touch Figma is not a preview');
  assert.equal(source.indexOf('await'), -1, 'and it is synchronous, so it cannot wait on one');
});

test('the preview draws the scale the run would write', () => {
  // One renderer. If these could differ, the preview would be a second opinion rather than a look
  // ahead, and the whole point is to judge the thing you are about to make.
  const spec = lib.spacingRampSpec();
  const run = JSON.parse(JSON.stringify(SPACING));
  lib.ensureCompatRampConfig(run, spec);
  lib.materialiseRampTokens(run, spec);
  lib.materialiseRampSizes(run, spec, ['Desktop', 'Mobile']);
  const expected = lib.rampScaleHtml(
    lib.rampScaleTable(lib.generateRampVariables(run, spec), 'Spacing'),
    lib.rampCaptions(run, spec)
  );

  assert.equal(lib.rampPreviewHtml(SPACING, 'spacing'), expected);
});

test('the numbers in it are the numbers', () => {
  const html = lib.rampPreviewHtml(SPACING, 'spacing');
  assert.match(html, /3, 4, 4, 4, 8/, 'desktop gaps');
  assert.match(html, /1, 2, 2, 2, 4/, 'mobile gaps');
  assert.match(html, /metric, base 4, step 4, mod 3/);
});

test('a wildcard set says what a preview cannot know, rather than drawing nothing', () => {
  const html = lib.rampPreviewHtml({
    collectionName: 'C', group: 'Spacing', spacings: ['xs', 'sm'],
    sets: [{ name: 'all', appliesTo: '*', model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4 }]
  }, 'spacing');
  assert.match(html, /takes its modes from the collection/);
  assert.equal(html.indexOf('<table'), -1);
});

test('a wildcard with modeNames draws, because then it knows', () => {
  const html = lib.rampPreviewHtml({
    collectionName: 'C', group: 'Spacing', spacings: ['xs', 'sm'], modeNames: ['Desktop', 'Mobile'],
    sets: [{ name: 'all', appliesTo: '*', model: 'metric', min: 1, base: { level: 'xs', size: 4 }, step: 4 }]
  }, 'spacing');
  assert.match(html, /<table/);
  assert.match(html, />Desktop</);
});

test('a config that cannot resolve explains itself where the picture would be', () => {
  const conflicted = lib.rampPreviewHtml({
    collectionName: 'C', group: 'Spacing', spacings: ['xs'], modeNames: ['Mobile'],
    sets: [
      { name: 'tight', appliesTo: 'Mobile', model: 'metric', min: 1, base: { level: 'xs', size: 2 }, step: 2 },
      { name: 'compact', appliesTo: 'Mobile', model: 'metric', min: 1, base: { level: 'xs', size: 3 }, step: 3 }
    ]
  }, 'spacing');
  assert.match(conflicted, /tight/);
  assert.match(conflicted, /compact/);

  assert.match(lib.rampPreviewHtml(null, 'spacing'), /no config to preview/);
  assert.match(lib.rampPreviewHtml({ collectionName: 'C' }, 'spacing'), /Nothing to draw|no config/);
});

test('corner radius previews through the same function', () => {
  const html = lib.rampPreviewHtml({
    collectionName: 'C', group: 'Corner radius', radii: ['none', 'xs', 'sm'],
    modes: [{ name: 'desktop', model: 'metric', min: 0, base: { level: 'xs', size: 2 }, step: 2, mod: 2 }]
  }, 'radius');
  assert.match(html, /<table/);
  assert.match(html, />none</);
});
