/**
 * Grid Extra values: formula parse / eval (col-1+gap, col-1*2+gap, …).
 *
 * Loaded with calculateColumnWidth from @Core Library the same way grid.js uses it.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const resolver = require('../src/import-resolver.js');

const GRID = path.join(
  __dirname, '..', 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations', 'grid.js'
);
const CORE = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@core-library.js');

const HELPERS = [
  'normalizeGridExtraValueName',
  'resolveExtraValues',
  'tokenizeGridExtraValue',
  'parseGridExtraValue',
  'evalGridExtraValue',
  'calculateColumnVariable',
  'calculateExtensionColumnVariable',
];

function load() {
  const core = fs.readFileSync(CORE, 'utf8');
  const columnWidth = /function calculateColumnWidth[\s\S]*?\n}/.exec(core)[0];
  const grid = fs.readFileSync(GRID, 'utf8');
  const map = resolver.extractFunctionMap(grid);
  const ctx = { console: console };
  vm.createContext(ctx);
  vm.runInContext(columnWidth, ctx);
  HELPERS.forEach((name) => {
    const code = map.get(name);
    assert.ok(code, 'missing helper ' + name);
    vm.runInContext(code, ctx);
  });
  return {
    parseGridExtraValue: ctx.parseGridExtraValue,
    evalGridExtraValue: ctx.evalGridExtraValue,
    normalizeGridExtraValueName: ctx.normalizeGridExtraValueName,
    resolveExtraValues: ctx.resolveExtraValues,
    calculateColumnVariable: ctx.calculateColumnVariable,
  };
}

const G = load();

/** Desktop-ish: 1920 / 12 / gap 40 / pad 80 → col width 110. */
const DESKTOP = { containerWidth: 1920, columns: 12, gap: 40, padding: 80 };

function evalFormula(formula, vc, maxCols) {
  const parsed = G.parseGridExtraValue(formula);
  assert.equal(parsed.ok, true, parsed.error);
  const got = G.evalGridExtraValue(parsed.ast, vc || DESKTOP, maxCols == null ? 12 : maxCols);
  assert.equal(got.ok, true, got.error);
  return got.value;
}

test('normalize strips spaces so spellings collapse', () => {
  assert.equal(G.normalizeGridExtraValueName('col-1 + gap'), 'col-1+gap');
  assert.equal(G.normalizeGridExtraValueName('  margin-gap '), 'margin-gap');
});

test('resolveExtraValues dedupes normalized names and keeps order', () => {
  assert.deepEqual(
    G.resolveExtraValues({ extraValues: ['col-1+gap', 'col-1 + gap', 'margin-gap'] }),
    ['col-1+gap', 'margin-gap']
  );
  assert.deepEqual(G.resolveExtraValues({ extraValues: 'col-1+gap, col-1*2+gap' }), [
    'col-1+gap', 'col-1*2+gap'
  ]);
  assert.deepEqual(G.resolveExtraValues({ extraValues: [] }), []);
  assert.deepEqual(G.resolveExtraValues({}), []);
});

test('col-1+gap equals one column plus gap', () => {
  const col1 = G.calculateColumnVariable(1, DESKTOP);
  assert.equal(col1, 110);
  assert.equal(evalFormula('col-1+gap'), 150);
  assert.equal(evalFormula('col-1 + gap'), 150);
});

test('margin-gap is Margins minus Gap', () => {
  assert.equal(evalFormula('margin-gap'), 40);
});

test('col-1*2+gap uses * before +', () => {
  // (110 * 2) + 40 = 260, not 110 * (2+40)
  assert.equal(evalFormula('col-1*2+gap'), 260);
});

test('a+b*c precedence', () => {
  // margin + gap * 2 = 80 + 80 = 160
  assert.equal(evalFormula('margin+gap*2'), 160);
});

test('division works', () => {
  assert.equal(evalFormula('col-2/2'), 130); // col-2 = 260
});

test('rejects unknown tokens and bad syntax', () => {
  assert.equal(G.parseGridExtraValue('col-1+foo').ok, false);
  assert.equal(G.parseGridExtraValue('col-1++gap').ok, false);
  assert.equal(G.parseGridExtraValue('(col-1+gap)*2').ok, false);
  assert.equal(G.parseGridExtraValue('').ok, false);
  // Config key is still `padding`; formula language uses the panel label `margin`.
  assert.equal(G.parseGridExtraValue('padding-gap').ok, false);
});

test('division by zero fails at eval', () => {
  const parsed = G.parseGridExtraValue('col-1/0');
  assert.equal(parsed.ok, true);
  const got = G.evalGridExtraValue(parsed.ast, DESKTOP, 12);
  assert.equal(got.ok, false);
  assert.match(got.error, /division by zero/);
});

test('grid.js panel exposes Extra values', () => {
  const src = fs.readFileSync(GRID, 'utf8');
  assert.match(src, /key:\s*"extraValues"/);
  assert.match(src, /extraValues:\s*\[\]/);
  assert.match(src, /label:\s*"Extra values"/);
});
