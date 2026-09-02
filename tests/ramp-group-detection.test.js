/**
 * Finding the group a spacing / radius / typography set lives in.
 *
 * Same idea as grid group detection: names only, no scale fit. The scan is pure and lives in
 * `@foundation.js`; the panel offer is asserted against `src/ui.html`.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function loadFoundation() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'
  );
  return new Function('figma', 'console', 'window',
    src + '; return { rampGroupCandidates: rampGroupCandidates };')({}, console, {});
}
const F = loadFoundation();

test('spacing: flat FLOAT tokens under a group qualify', () => {
  const names = [
    'Spacing/space-none', 'Spacing/space-xs', 'Spacing/space-md', 'Spacing/space-lg',
    'Layout/col-1', 'Layout/col-12', 'Layout/gap',
    'Typography/Heading-1/font-size',
  ];
  assert.deepEqual(F.rampGroupCandidates(names, 'spacing'), [{ group: 'Spacing', tokens: 4 }]);
});

test('spacing: nested group prefix is kept', () => {
  assert.deepEqual(
    F.rampGroupCandidates([
      'Foundations/Spacing/space-xs',
      'Foundations/Spacing/space-md',
      'Foundations/Spacing/space-lg',
    ], 'spacing'),
    [{ group: 'Foundations/Spacing', tokens: 3 }]
  );
});

test('radius: same flat-token rule as spacing', () => {
  assert.deepEqual(
    F.rampGroupCandidates(['Corner radius/none', 'Corner radius/sm', 'Corner radius/lg'], 'radius'),
    [{ group: 'Corner radius', tokens: 3 }]
  );
});

test('typography: only font-size leaves count', () => {
  assert.deepEqual(
    F.rampGroupCandidates([
      'Typography/Text-Large/font-size',
      'Typography/Heading-1/font-size',
      'Typography/font-weight/600',
      'Typography/font-family/primary',
    ], 'typography'),
    [{ group: 'Typography', tokens: 2 }]
  );
});

test('typography: nested group before token name', () => {
  assert.deepEqual(
    F.rampGroupCandidates([
      'Foundations/Typography/Text-Small/font-size',
      'Foundations/Typography/Text-Large/font-size',
    ], 'typography'),
    [{ group: 'Foundations/Typography', tokens: 2 }]
  );
});

test('a lone token is not enough', () => {
  assert.deepEqual(F.rampGroupCandidates(['Spacing/space-md'], 'spacing'), []);
});

test('grid col-N names are not spacing tokens', () => {
  assert.deepEqual(F.rampGroupCandidates(['Layout/col-1', 'Layout/col-2'], 'spacing'), []);
});

test('two groups are reported separately, most tokens first', () => {
  assert.deepEqual(
    F.rampGroupCandidates([
      'A/xs', 'A/sm',
      'B/one', 'B/two', 'B/three',
    ], 'spacing'),
    [{ group: 'B', tokens: 3 }, { group: 'A', tokens: 2 }]
  );
});

test('labels with spaces are not spacing or radius tokens', () => {
  assert.deepEqual(
    F.rampGroupCandidates([
      'Scale to print', 'Distribute spacing', 'Select only', 'Untitled',
      'Spacing/px', 'Spacing/xs', 'Spacing/sm',
    ], 'spacing'),
    [{ group: 'Spacing', tokens: 3 }]
  );
});

test('spacing ignores corner radius, typography, and test scratch groups', () => {
  assert.deepEqual(
    F.rampGroupCandidates([
      'Spacing/px', 'Spacing/xs', 'Spacing/sm',
      'Corner radius/none', 'Corner radius/sm', 'Corner radius/lg',
      'Typography/Text-Large/font-size', 'Typography/Heading-1/font-size',
      'Typography/font-weight/600', 'Typography/font-weight/400',
      '__codefig-test__/probe/x', '__codefig-test__/probe/y',
    ], 'spacing'),
    [{ group: 'Spacing', tokens: 3 }]
  );
});

test('radius ignores spacing and typography groups', () => {
  assert.deepEqual(
    F.rampGroupCandidates([
      'Spacing/px', 'Spacing/xs', 'Spacing/sm',
      'Corner radius/none', 'Corner radius/sm', 'Corner radius/lg',
      'Typography/Text-Large/font-size', 'Typography/Heading-1/font-size',
    ], 'radius'),
    [{ group: 'Corner radius', tokens: 3 }]
  );
});

test('auto-import offers ramp candidates other than the group already asked for', () => {
  const foundation = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'
  );
  assert.match(foundation, /var rampScan = tokensKey \? await rampGroupsIn\(collectionName, domain\)/);
  assert.match(foundation, /answer\.candidates = rampScan\.groups\.filter/);
});

test('extracted `@import` can run rampGroupCandidates', () => {
  const { resolveImports } = require('../src/import-resolver.js');
  const foundation = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'
  );
  const scripts = [{ name: '@Foundation', filename: '@foundation.js', code: foundation }];
  const resolved = resolveImports(
    "// @import { foundationAutoImport } from '@Foundation'\n", scripts
  );
  const vm = require('node:vm');
  const ctx = { console, Math, String, Array, Object, JSON, Date, isNaN, isFinite, parseInt, parseFloat, Number, RegExp };
  vm.createContext(ctx);
  vm.runInContext(resolved, ctx);
  assert.deepEqual(
    ctx.rampGroupCandidates(['Spacing/a', 'Spacing/b'], 'spacing'),
    [{ group: 'Spacing', tokens: 2 }]
  );
});

test('the panel uses the shared group offer for ramps and grid', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  assert.match(ui, /function offerDetectedGroup/);
  assert.match(ui, /foundationGroupDetail/);
  assert.match(ui, /offerDetectedGroup\(found\)/);
  assert.match(ui, /offerDetectedGroup\(data\.autoImport\)/);
  assert.doesNotMatch(ui, /offerGridGroup/);
});

test('foundationAutoImport returns ramp candidates when the group is wrong', async () => {
  const names = ['Spacing/px', 'Spacing/xs', 'Spacing/sm'];
  const vars = names.map((name, i) => ({ id: 'v' + i, name, resolvedType: 'FLOAT' }));
  const collection = {
    name: 'Responsive System',
    variableIds: vars.map((v) => v.id),
    modes: [{ modeId: 'm0', name: 'Desktop' }],
    getSharedPluginData: () => '',
    getSharedPluginDataKeys: () => [],
  };
  const vm = require('node:vm');
  const ctx = {
    figma: {
      variables: {
        getLocalVariableCollectionsAsync: async () => [collection],
        getVariableByIdAsync: async (id) => vars.find((v) => v.id === id) || null,
      },
    },
    console: { log() {}, warn() {}, error() {} },
    Math, String, Array, Object, JSON, Date, isNaN, isFinite, parseInt, parseFloat, Number, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'),
    ctx
  );
  const found = await ctx.foundationAutoImport('Responsive System', 'Typography', 'spacing');
  assert.equal(found.source, 'none');
  assert.deepEqual(found.candidates, [{ group: 'Spacing', tokens: 3 }]);
});

test('foundationAutoImport does not treat spaced root floats as a spacing set', async () => {
  const names = ['Scale to print', 'Distribute spacing', 'Select only', 'Untitled'];
  const vars = names.map((name, i) => ({ id: 'v' + i, name, resolvedType: 'FLOAT' }));
  const collection = {
    name: 'CodeFig Scripts',
    variableIds: vars.map((v) => v.id),
    modes: [{ modeId: 'm0', name: 'Value' }],
    getSharedPluginData: () => '',
    getSharedPluginDataKeys: () => [],
  };
  const vm = require('node:vm');
  const ctx = {
    figma: {
      variables: {
        getLocalVariableCollectionsAsync: async () => [collection],
        getVariableByIdAsync: async (id) => vars.find((v) => v.id === id) || null,
      },
    },
    console: { log() {}, warn() {}, error() {} },
    Math, String, Array, Object, JSON, Date, isNaN, isFinite, parseInt, parseFloat, Number, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'),
    ctx
  );
  const found = await ctx.foundationAutoImport('CodeFig Scripts', '', 'spacing');
  assert.equal(found.source, 'none');
  assert.equal(found.config, null);
});
