/**
 * Finding the group a spacing / radius / typography set lives in.
 *
 * Spacing vs radius membership is stamp → scopes → Description (not token names).
 * `rampGroupCandidates` only shapes groups from names already filtered for the domain.
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
    src + '; return {' +
    ' rampGroupCandidates: rampGroupCandidates,' +
    ' rampVariableMatchesDomain: rampVariableMatchesDomain,' +
    ' rampScopesMatchDomain: rampScopesMatchDomain,' +
    ' stampValue: stampValue,' +
    ' readStampFrom: readStampFrom' +
    ' };')({}, console, {});
}
const F = loadFoundation();

function mockVar(name, opts) {
  opts = opts || {};
  return {
    id: opts.id || ('v-' + name),
    name: name,
    resolvedType: 'FLOAT',
    scopes: opts.scopes || [],
    description: opts.description || '',
    getSharedPluginData: function (ns, key) {
      if (key === 'stamp' && opts.stamp) return opts.stamp;
      return '';
    }
  };
}

function stamp(domain, token) {
  return F.stampValue(domain, token, 1, 'set1');
}

test('spacing: flat FLOAT tokens under a group qualify (names already domain-filtered)', () => {
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

test('test scratch groups are ignored', () => {
  assert.deepEqual(
    F.rampGroupCandidates([
      'Spacing/px', 'Spacing/xs', 'Spacing/sm',
      '__codefig-test__/probe/x', '__codefig-test__/probe/y',
    ], 'spacing'),
    [{ group: 'Spacing', tokens: 3 }]
  );
});

test('stamp domain is authoritative', () => {
  const radiusStamp = stamp('radius', '1');
  const v = mockVar('radius-1', { stamp: radiusStamp, scopes: ['WIDTH_HEIGHT', 'GAP'] });
  assert.equal(F.rampVariableMatchesDomain(v, 'radius'), true);
  assert.equal(F.rampVariableMatchesDomain(v, 'spacing'), false);
});

test('CORNER_RADIUS scope matches radius, not spacing', () => {
  const v = mockVar('r1', { scopes: ['CORNER_RADIUS'] });
  assert.equal(F.rampVariableMatchesDomain(v, 'radius'), true);
  assert.equal(F.rampVariableMatchesDomain(v, 'spacing'), false);
});

test('GAP / WIDTH_HEIGHT scopes match spacing, not radius', () => {
  const v = mockVar('s1', { scopes: ['WIDTH_HEIGHT', 'GAP'] });
  assert.equal(F.rampVariableMatchesDomain(v, 'spacing'), true);
  assert.equal(F.rampVariableMatchesDomain(v, 'radius'), false);
});

test('Description is a secondary net when stamp and scopes are silent', () => {
  const v = mockVar('token-1', { description: 'Corner radius' });
  assert.equal(F.rampVariableMatchesDomain(v, 'radius'), true);
  assert.equal(F.rampVariableMatchesDomain(v, 'spacing'), false);
  const s = mockVar('token-2', { description: 'Spacing' });
  assert.equal(F.rampVariableMatchesDomain(s, 'spacing'), true);
  assert.equal(F.rampVariableMatchesDomain(s, 'radius'), false);
});

test('no stamp, scopes, or Description → not claimed', () => {
  const v = mockVar('radius-1', {});
  assert.equal(F.rampVariableMatchesDomain(v, 'spacing'), false);
  assert.equal(F.rampVariableMatchesDomain(v, 'radius'), false);
});

test('ALL_SCOPES alone is not a domain signal', () => {
  assert.equal(F.rampScopesMatchDomain(['ALL_SCOPES'], 'spacing'), null);
  assert.equal(F.rampScopesMatchDomain(['ALL_SCOPES'], 'radius'), null);
  const v = mockVar('x', { scopes: ['ALL_SCOPES'] });
  assert.equal(F.rampVariableMatchesDomain(v, 'spacing'), false);
});

async function withCollection(vars, fn) {
  const collection = {
    name: 'Responsive',
    variableIds: vars.map((v) => v.id),
    modes: [{ modeId: 'm0', name: 'Desktop' }, { modeId: 'm1', name: 'Tablet' }, { modeId: 'm2', name: 'Mobile' }],
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
  return fn(ctx);
}

test('auto-import offers ramp candidates other than the group already asked for', () => {
  const foundation = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'
  );
  assert.match(foundation, /var rampScan = tokensKey \? await rampGroupsIn\(collectionName, domain\)/);
  assert.match(foundation, /answer\.candidates = rampScan\.groups\.filter/);
  assert.match(foundation, /function foundationSiblingCandidates/);
  assert.match(foundation, /function rampVariableMatchesDomain/);
  assert.doesNotMatch(foundation, /function rampTokenMatchesDomain/);
});

test('a successful ramp read still lists sibling groups for switching', async () => {
  const vars = [
    mockVar('Spacing/px', { id: 'v0', scopes: ['GAP', 'WIDTH_HEIGHT'] }),
    mockVar('Spacing/xs', { id: 'v1', scopes: ['GAP', 'WIDTH_HEIGHT'] }),
    mockVar('Spacing/sm', { id: 'v2', scopes: ['GAP', 'WIDTH_HEIGHT'] }),
    mockVar('Alt/a', { id: 'v3', scopes: ['GAP', 'WIDTH_HEIGHT'] }),
    mockVar('Alt/b', { id: 'v4', scopes: ['GAP', 'WIDTH_HEIGHT'] }),
  ];
  await withCollection(vars, async (ctx) => {
    const found = await ctx.foundationAutoImport('Responsive', 'Spacing', 'spacing');
    assert.equal(found.source, 'recognised');
    assert.deepEqual(found.candidates, [{ group: 'Alt', tokens: 2 }]);
  });
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
  const vars = [
    mockVar('Spacing/px', { id: 'v0', scopes: ['GAP', 'WIDTH_HEIGHT'] }),
    mockVar('Spacing/xs', { id: 'v1', scopes: ['GAP', 'WIDTH_HEIGHT'] }),
    mockVar('Spacing/sm', { id: 'v2', scopes: ['GAP', 'WIDTH_HEIGHT'] }),
  ];
  await withCollection(vars, async (ctx) => {
    const found = await ctx.foundationAutoImport('Responsive', 'Typography', 'spacing');
    assert.equal(found.source, 'none');
    assert.deepEqual(found.candidates, [{ group: 'Spacing', tokens: 3 }]);
  });
});

test('foundationAutoImport does not treat spaced root floats as a spacing set', async () => {
  const vars = ['Scale to print', 'Distribute spacing', 'Select only', 'Untitled'].map((name, i) =>
    mockVar(name, { id: 'v' + i })
  );
  await withCollection(vars, async (ctx) => {
    ctx.figma.variables.getLocalVariableCollectionsAsync = async () => [{
      name: 'CodeFig Scripts',
      variableIds: vars.map((v) => v.id),
      modes: [{ modeId: 'm0', name: 'Value' }],
      getSharedPluginData: () => '',
      getSharedPluginDataKeys: () => [],
    }];
    const found = await ctx.foundationAutoImport('CodeFig Scripts', '', 'spacing');
    assert.equal(found.source, 'none');
    assert.equal(found.config, null);
  });
});

test('foundationAutoImport does not load ungrouped radius tokens as spacing', async () => {
  const names = ['radius-1', 'radius-2', 'radius-3', 'radius-4', 'radius-5', 'radius-6'];
  const asRadius = names.map((name, i) =>
    mockVar(name, { id: 'v' + i, scopes: ['CORNER_RADIUS'], description: 'Corner radius' })
  );
  await withCollection(asRadius, async (ctx) => {
    const spacing = await ctx.foundationAutoImport('Responsive', '', 'spacing');
    assert.equal(spacing.source, 'none');
    assert.deepEqual(spacing.tokens || [], []);

    const radius = await ctx.foundationAutoImport('Responsive', '', 'radius');
    assert.equal(radius.source, 'recognised');
    assert.deepEqual(radius.tokens, names);
    assert.deepEqual(radius.config.radii, names);
  });
});

test('ungrouped floats with no evidence are not loaded as spacing or radius', async () => {
  const names = ['radius-1', 'radius-2', 'radius-3', 'radius-4', 'radius-5', 'radius-6'];
  const bare = names.map((name, i) => mockVar(name, { id: 'v' + i }));
  await withCollection(bare, async (ctx) => {
    const spacing = await ctx.foundationAutoImport('Responsive', '', 'spacing');
    assert.equal(spacing.source, 'none');
    const radius = await ctx.foundationAutoImport('Responsive', '', 'radius');
    assert.equal(radius.source, 'none');
  });
});
