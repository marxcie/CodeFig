/**
 * Finding COLOR ramp groups in a collection for Group candidate links.
 *
 * Names only — same policy as Grid / Spacing. The panel already loads a ramp unchanged
 * (`skipFit`); this only answers "which other groups look like a lightness ramp".
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const LIBS = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');
const resolver = require('../src/import-resolver.js');

function loadFoundationFns() {
  const src = fs.readFileSync(path.join(LIBS, '@foundation.js'), 'utf8');
  return new Function(
    'figma',
    'console',
    'window',
    src +
      '; return {' +
      ' colorsGroupCandidates: colorsGroupCandidates,' +
      ' colorsTokenGroup: colorsTokenGroup,' +
      ' colorsStepNameOk: colorsStepNameOk' +
      ' };'
  )({}, console, {});
}
const F = loadFoundationFns();

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a: 1,
  };
}

function colorVar(name, opts) {
  opts = opts || {};
  const modeId = opts.modeId || 'm0';
  return {
    id: opts.id || ('v-' + name),
    name: name,
    resolvedType: 'COLOR',
    valuesByMode: opts.valuesByMode || {
      [modeId]: opts.rgb || rgb('#808080'),
    },
    getSharedPluginData: function () {
      return '';
    },
  };
}

async function withColors(vars, fn) {
  const collection = {
    name: 'Colors',
    id: 'c0',
    variableIds: vars.map((v) => v.id),
    modes: [{ modeId: 'm0', name: 'Value' }],
    defaultModeId: 'm0',
    getSharedPluginData: () => '',
    getSharedPluginDataKeys: () => [],
  };
  const byId = {};
  vars.forEach((v) => {
    byId[v.id] = v;
  });
  const ctx = {
    figma: {
      variables: {
        getLocalVariableCollectionsAsync: async () => [collection],
        getVariableByIdAsync: async (id) => byId[id] || null,
        getLocalVariablesAsync: async () => vars,
      },
    },
    console: { log() {}, warn() {}, error() {} },
    Math,
    String,
    Array,
    Object,
    JSON,
    Date,
    isNaN,
    isFinite,
    parseInt,
    parseFloat,
    Number,
    RegExp,
    Boolean,
    Promise,
    Set,
  };
  vm.createContext(ctx);
  for (const file of ['@math-helpers.js', '@bezier.js', '@oklch.js', '@color-ramp.js', '@foundation.js']) {
    const source = fs.readFileSync(path.join(LIBS, file), 'utf8');
    for (const [, code] of resolver.extractFunctionMap(source)) {
      try {
        vm.runInContext(code, ctx);
      } catch (e) {
        /* unused helper */
      }
    }
  }
  return fn(ctx);
}

test('colorsGroupCandidates: three steps under a group qualify', () => {
  assert.deepEqual(
    F.colorsGroupCandidates(['lime/25', 'lime/50', 'lime/100', 'other/x']),
    [{ group: 'lime', tokens: 3 }]
  );
});

test('colorsGroupCandidates: nested group prefix is kept', () => {
  assert.deepEqual(
    F.colorsGroupCandidates([
      'Foundations/moss/25',
      'Foundations/moss/50',
      'Foundations/moss/100',
    ]),
    [{ group: 'Foundations/moss', tokens: 3 }]
  );
});

test('colorsGroupCandidates: fewer than three steps is not enough', () => {
  assert.deepEqual(F.colorsGroupCandidates(['lime/25', 'lime/50']), []);
});

test('colorsGroupCandidates: two groups, most tokens first', () => {
  assert.deepEqual(
    F.colorsGroupCandidates([
      'a/1',
      'a/2',
      'a/3',
      'b/1',
      'b/2',
      'b/3',
      'b/4',
    ]),
    [
      { group: 'b', tokens: 4 },
      { group: 'a', tokens: 3 },
    ]
  );
});

test('colorsGroupCandidates: test scratch is ignored', () => {
  assert.deepEqual(
    F.colorsGroupCandidates([
      '__codefig-test__/x/1',
      '__codefig-test__/x/2',
      '__codefig-test__/x/3',
      'lime/1',
      'lime/2',
      'lime/3',
    ]),
    [{ group: 'lime', tokens: 3 }]
  );
});

test('foundationColorsAutoImport lists siblings after a successful load', async () => {
  const lime = ['25', '50', '100'].map((s, i) =>
    colorVar('lime/' + s, { id: 'l' + i, rgb: rgb(['#EEFFEE', '#88CC88', '#113311'][i]) })
  );
  const moss = ['25', '50', '100', '200'].map((s, i) =>
    colorVar('moss/' + s, { id: 'm' + i, rgb: rgb(['#EEFFEE', '#88CC88', '#446644', '#113311'][i]) })
  );
  await withColors(lime.concat(moss), async (ctx) => {
    const found = await ctx.foundationColorsAutoImport('Colors', 'lime', ['Value'], 'oklch', null, true);
    assert.equal(found.source, 'recognised');
    assert.deepEqual(found.candidates, [{ group: 'moss', tokens: 4 }]);
  });
});

test('foundationColorsAutoImport returns candidates when the group is wrong', async () => {
  const lime = ['25', '50', '100'].map((s, i) =>
    colorVar('lime/' + s, { id: 'l' + i, rgb: rgb(['#EEFFEE', '#88CC88', '#113311'][i]) })
  );
  await withColors(lime, async (ctx) => {
    const found = await ctx.foundationColorsAutoImport('Colors', 'nope', ['Value'], 'oklch', null, true);
    assert.equal(found.source, 'none');
    assert.deepEqual(found.candidates, [{ group: 'lime', tokens: 3 }]);
  });
});

test('auto-import wires colorsGroupsIn for candidates', () => {
  const foundation = fs.readFileSync(path.join(LIBS, '@foundation.js'), 'utf8');
  assert.match(foundation, /function colorsGroupCandidates/);
  assert.match(foundation, /function colorsGroupsIn/);
  assert.match(foundation, /var colorScan = await colorsGroupsIn\(collectionName, readIndex\)/);
  assert.match(foundation, /answer\.candidates = colorSiblingCandidates/);
});

test('the panel still uses the shared group offer for Colors', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  assert.match(ui, /function offerDetectedGroup/);
  assert.match(ui, /renderGroupCandidates\(found\.candidates/);
  assert.match(ui, /foundationColorsAutoImport/);
});
