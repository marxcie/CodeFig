/**
 * Fixture tests for scripts/CODEFIG_LIBRARIES/@foundation.js — the viewport registry, the
 * per-set manifests, and the helpers that were written five times.
 *
 * Reconciliation is where the silent failures live. The registry, the collection's modes and
 * the `viewport-width` variable are three records of the same thing, kept in three places that
 * can drift: pluginData is invisible in Figma, so a stale registry is undebuggable by looking.
 * The rule is that the file wins and every disagreement is reported — which is only worth
 * anything if the reporting is exhaustive, hence a case per rule here.
 *
 * `reconcileFoundation` takes plain objects and returns plain objects on purpose. Everything
 * that touches `figma` lives in readFoundation/writeRegistry and is covered by
 * scripts/_TESTS/_tests-foundation-registry.js.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');

const FOUNDATION = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js');

const PURE = [
  'foundationNamespace',
  'foundationRegistryKey',
  'foundationSetKey',
  'foundationWarning',
  'viewportLabel',
  'viewportKeyFromLabel',
  'namePrefix',
  'resolveCollectionName',
  'resolveGroup',
  'normaliseViewport',
  'sortViewports',
  'parseRegistry',
  'serialiseRegistry',
  'parseManifest',
  'serialiseManifest',
  'reconcileFoundation',
  'readStampFrom',
  'findByStamp',
  'stampValue'
];

function loadFoundation() {
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, String, Array, Object, JSON, Date, isNaN, isFinite };
  vm.createContext(ctx);
  const map = resolver.extractFunctionMap(fs.readFileSync(FOUNDATION, 'utf8'));
  for (const name of PURE) {
    const code = map.get(name);
    assert.ok(code, `${name} is not extractable from @foundation.js`);
    vm.runInContext(code, ctx);
  }
  return ctx;
}

const lib = loadFoundation();
const {
  viewportLabel, viewportKeyFromLabel, namePrefix, resolveCollectionName, resolveGroup,
  normaliseViewport, sortViewports, parseRegistry, serialiseRegistry, parseManifest,
  serialiseManifest, reconcileFoundation, foundationSetKey, findByStamp, stampValue
} = lib;

/** The three viewports every DSF script ships with today. */
function registry(viewports) {
  return { v: 1, viewports: viewports };
}

const MOBILE = { key: 'mobile', label: 'Mobile', width: 375 };
const TABLET = { key: 'tablet', label: 'Tablet', width: 768 };
const DESKTOP = { key: 'desktop', label: 'Desktop', width: 1920 };

function modesOf(collection, labels) {
  return { collection: collection, modes: labels.map((n, i) => ({ modeId: collection + ':m' + i, name: n })) };
}

function widthsOf(collection, byMode, variable) {
  return { collection: collection, variable: variable || 'Grid/viewport-width', byMode: byMode };
}

const codes = (result) => result.warnings.map((w) => w.code);
const byKey = (result, key) => result.viewports.find((v) => v.key === key);

// ---------------------------------------------------------------------------
// Helpers — the five that were duplicated
// ---------------------------------------------------------------------------

test('viewportLabel matches what the scripts computed inline in fourteen places', () => {
  assert.equal(viewportLabel('mobile'), 'Mobile');
  assert.equal(viewportLabel('desktop'), 'Desktop');
  assert.equal(viewportLabel(''), 'Default');
  assert.equal(viewportLabel(null), 'Default');
  assert.equal(viewportLabel(42), 'Default');
});

test('a label round-trips back to its key', () => {
  assert.equal(viewportKeyFromLabel(viewportLabel('mobile')), 'mobile');
  assert.equal(viewportKeyFromLabel('Handset'), 'handset');
  assert.equal(viewportKeyFromLabel('Extra Wide'), 'extra-wide');
  assert.equal(viewportKeyFromLabel('  Ultra  '), 'ultra');
  assert.equal(viewportKeyFromLabel(''), '');
});

test('namePrefix trims slashes — the behaviour grid and colors did not have', () => {
  assert.equal(namePrefix('Spacing'), 'Spacing/');
  assert.equal(namePrefix('/Spacing/'), 'Spacing/');
  assert.equal(namePrefix('Design/Spacing'), 'Design/Spacing/');
  assert.equal(namePrefix(''), '');
  assert.equal(namePrefix(null), '');
  assert.equal(namePrefix(7), '');
});

test('resolveCollectionName reads all three config layers', () => {
  assert.equal(resolveCollectionName({ collectionName: 'Top' }), 'Top');
  assert.equal(resolveCollectionName({ config: { collectionName: 'Nested' } }), 'Nested');
  assert.equal(resolveCollectionName({ structure: { variableCollection: 'Legacy' } }), 'Legacy');
  assert.equal(resolveCollectionName({ config: { structure: { variableCollection: 'Both' } } }), 'Both');
  assert.equal(resolveCollectionName({}), 'Responsive System');
  assert.equal(resolveCollectionName({ collectionName: '' }), 'Responsive System', 'empty is not a name');
});

test('resolveGroup reads all three config layers, and an empty group is a choice', () => {
  assert.equal(resolveGroup({ group: 'Grid' }), 'Grid');
  assert.equal(resolveGroup({ config: { group: 'Spacing' } }), 'Spacing');
  assert.equal(resolveGroup({ structure: { variableGroup: 'Legacy' } }), 'Legacy');
  assert.equal(resolveGroup({ group: '' }), '', 'an explicit empty group means no prefix');
  assert.equal(resolveGroup({}), '');
});

test('a set key is unique per domain and group inside one collection', () => {
  assert.equal(foundationSetKey('spacing', 'Spacing'), 'set:spacing:Spacing');
  assert.notEqual(foundationSetKey('spacing', 'Spacing A'), foundationSetKey('spacing', 'Spacing B'));
  assert.equal(foundationSetKey('spacing', ''), 'set:spacing:');
});

// ---------------------------------------------------------------------------
// Registry shape
// ---------------------------------------------------------------------------

test('a viewport is normalised to key, label and width — and nothing else', () => {
  assert.deepEqual(
    normaliseViewport({ key: 'mobile', label: 'Mobile', width: 375, columns: 4, gap: 16 }),
    { key: 'mobile', label: 'Mobile', width: 375 }
  );
  assert.deepEqual(normaliseViewport({ key: 'mobile' }), { key: 'mobile', label: 'Mobile', width: null });
  assert.deepEqual(normaliseViewport({ label: 'Handset' }), { key: 'handset', label: 'Handset', width: null });
  assert.deepEqual(normaliseViewport({ key: 'x', width: 'wide' }), { key: 'x', label: 'X', width: null });
  assert.equal(normaliseViewport({}), null);
  assert.equal(normaliseViewport(null), null);
});

test('viewports order by width ascending, unknown widths last in insertion order', () => {
  const unknownA = { key: 'a', label: 'A', width: null };
  const unknownB = { key: 'b', label: 'B', width: null };
  const sorted = sortViewports([DESKTOP, unknownA, MOBILE, unknownB, TABLET]);
  assert.deepEqual(sorted.map((v) => v.key), ['mobile', 'tablet', 'desktop', 'a', 'b']);
});

test('a registry round-trips through its serialised form', () => {
  const parsed = parseRegistry(serialiseRegistry([DESKTOP, MOBILE]));
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.registry.viewports.map((v) => v.key), ['mobile', 'desktop'], 'written in order');
});

test('garbage in pluginData parses to null and warns, and never throws', () => {
  for (const text of ['', '   ', '{', 'null', '[]', '{"viewports":"nope"}']) {
    const parsed = parseRegistry(text);
    assert.equal(parsed.registry, null, `for ${JSON.stringify(text)}`);
  }
  assert.deepEqual(parseRegistry('').warnings, [], 'an empty entry is absence, not corruption');
  assert.deepEqual(parseRegistry('{').warnings.map((w) => w.code), ['registry-unreadable']);
  assert.deepEqual(parseRegistry('{"v":99,"viewports":[]}').warnings.map((w) => w.code), ['registry-version']);
});

test('a manifest round-trips and a broken one is reported, not thrown', () => {
  const set = { domain: 'spacing', group: 'Spacing', modes: ['mobile'], tokens: ['xs'], config: { roundTo: 2 } };
  const parsed = parseManifest(serialiseManifest(set));
  assert.equal(parsed.manifest.domain, 'spacing');
  assert.deepEqual(parsed.manifest.tokens, ['xs']);
  assert.deepEqual(parsed.manifest.config, { roundTo: 2 });
  assert.ok(parsed.manifest.updated, 'stamped so a human can see how old it is');
  assert.deepEqual(parseManifest('{{').warnings.map((w) => w.code), ['manifest-unreadable']);
  assert.equal(parseManifest('').manifest, null);
});

// ---------------------------------------------------------------------------
// reconcileFoundation — one case per rule
// ---------------------------------------------------------------------------

test('a registry that agrees with the file produces no warnings', () => {
  const result = reconcileFoundation({
    registry: registry([MOBILE, TABLET, DESKTOP]),
    modes: [modesOf('Responsive System', ['Mobile', 'Tablet', 'Desktop'])],
    widths: [widthsOf('Responsive System', { Mobile: 375, Tablet: 768, Desktop: 1920 })]
  });
  assert.deepEqual(result.viewports.map((v) => v.key), ['mobile', 'tablet', 'desktop']);
  assert.deepEqual(codes(result), []);
  assert.deepEqual(byKey(result, 'mobile').materialisedIn, ['Responsive System']);
});

test('a mode with no registry entry is adopted, not ignored', () => {
  const result = reconcileFoundation({
    registry: registry([MOBILE]),
    modes: [modesOf('Responsive System', ['Mobile', 'Ultra Wide'])]
  });
  const discovered = byKey(result, 'ultra-wide');
  assert.ok(discovered, 'keyed from its label');
  assert.equal(discovered.label, 'Ultra Wide');
  assert.equal(discovered.width, null);
  assert.ok(codes(result).includes('viewport-discovered'));
});

test('a label that drifted from the registry stays one viewport, matched on its key', () => {
  const result = reconcileFoundation({
    registry: registry([{ key: 'handset', label: 'Mobile', width: 375 }]),
    modes: [modesOf('Responsive System', ['Handset'])]
  });
  assert.equal(result.viewports.length, 1);
  assert.equal(byKey(result, 'handset').label, 'Handset', 'the file names it');
  assert.deepEqual(byKey(result, 'handset').materialisedIn, ['Responsive System']);
  assert.ok(codes(result).includes('viewport-relabelled'));
});

test('a mode genuinely renamed in Figma is reported from both ends, not silently merged', () => {
  // Mobile → Handset, with the registry still saying `mobile`. Nothing ties the two together
  // — a mode's identity is its modeId, which the registry does not record — so guessing would
  // be guessing. Both halves are reported and no width is invented.
  const result = reconcileFoundation({
    registry: registry([MOBILE]),
    modes: [modesOf('Responsive System', ['Handset'])]
  });
  assert.deepEqual(result.viewports.map((v) => v.key).sort(), ['handset', 'mobile']);
  assert.ok(codes(result).includes('viewport-discovered'), 'Handset is adopted');
  assert.ok(codes(result).includes('viewport-not-materialised'), 'Mobile is left, not deleted');
  assert.equal(byKey(result, 'handset').width, null, 'and no width is carried over on a guess');
});

test('a width variable overrides a stale registry width, and says so', () => {
  const result = reconcileFoundation({
    registry: registry([{ key: 'desktop', label: 'Desktop', width: 1440 }]),
    modes: [modesOf('Responsive System', ['Desktop'])],
    widths: [widthsOf('Responsive System', { Desktop: 1920 })]
  });
  assert.equal(byKey(result, 'desktop').width, 1920, 'the file wins');
  assert.equal(byKey(result, 'desktop').widthSource.collection, 'Responsive System');
  assert.ok(codes(result).includes('width-from-file'));
});

test('two collections disagreeing about a width is a conflict, with both values named', () => {
  const result = reconcileFoundation({
    registry: registry([DESKTOP]),
    modes: [modesOf('Spacing A', ['Desktop']), modesOf('Spacing B', ['Desktop'])],
    widths: [widthsOf('Spacing A', { Desktop: 1920 }), widthsOf('Spacing B', { Desktop: 1440 })]
  });
  const conflict = result.warnings.find((w) => w.code === 'width-conflict');
  assert.ok(conflict);
  assert.equal(byKey(result, 'desktop').width, 1920, 'first collection wins, deterministically');
  assert.ok(conflict.message.includes('1440'));
  assert.ok(conflict.message.includes('1920'));
});

test('a viewport with no width anywhere is unknown, not guessed', () => {
  const result = reconcileFoundation({
    registry: registry([{ key: 'watch', label: 'Watch' }]),
    modes: [modesOf('Responsive System', ['Watch'])]
  });
  assert.equal(byKey(result, 'watch').width, null);
  assert.ok(codes(result).includes('width-unknown'));
});

test('a registry width with no variable to confirm it is kept, and marked unconfirmed', () => {
  // Deviation from the plan's bullet, which said to discard it: Grid may never have run, and
  // the registry is then the only record a viewport editor has. Discarding it would lose the
  // width the moment you reopened the file. It is still not "the file", so it is labelled.
  const result = reconcileFoundation({
    registry: registry([MOBILE]),
    modes: [modesOf('Responsive System', ['Mobile'])]
  });
  assert.equal(byKey(result, 'mobile').width, 375);
  assert.equal(byKey(result, 'mobile').widthSource.kind, 'registry');
  assert.deepEqual(codes(result), [], 'not a disagreement — nothing contradicts it');
});

test('a registry viewport no collection materialises is kept and reported', () => {
  // Legitimate: the mode budget is per collection, so a file can define more viewports than
  // any one collection carries (critique §5.1).
  const result = reconcileFoundation({
    registry: registry([MOBILE, DESKTOP]),
    modes: [modesOf('Responsive System', ['Mobile'])]
  });
  assert.equal(result.viewports.length, 2);
  assert.deepEqual(byKey(result, 'desktop').materialisedIn, []);
  assert.ok(codes(result).includes('viewport-not-materialised'));
});

test('a manifest token with no variable behind it is reported', () => {
  const result = reconcileFoundation({
    registry: registry([MOBILE]),
    modes: [modesOf('Responsive System', ['Mobile'])],
    variables: [{ collection: 'Responsive System', names: ['Spacing/xs'] }],
    manifests: [{
      collection: 'Responsive System',
      key: 'set:spacing:Spacing',
      manifest: { v: 1, domain: 'spacing', group: 'Spacing', modes: ['mobile'], tokens: ['xs', 'sm'] }
    }]
  });
  assert.deepEqual(result.sets[0].missing, ['sm']);
  assert.ok(codes(result).includes('manifest-token-missing'));
});

test('a manifest mode the collection does not have is reported', () => {
  const result = reconcileFoundation({
    registry: registry([MOBILE]),
    modes: [modesOf('Responsive System', ['Mobile'])],
    manifests: [{
      collection: 'Responsive System',
      key: 'set:spacing:Spacing',
      manifest: { v: 1, domain: 'spacing', group: 'Spacing', modes: ['mobile', 'wide'], tokens: [] }
    }]
  });
  const warning = result.warnings.find((w) => w.code === 'manifest-mode-missing');
  assert.ok(warning);
  assert.ok(warning.message.includes('wide'));
});

test('the manifest is never believed over the file', () => {
  // Everything the manifest claims is absent. The load still succeeds and describes the file.
  const result = reconcileFoundation({
    registry: null,
    modes: [modesOf('Responsive System', ['Mobile'])],
    variables: [{ collection: 'Responsive System', names: [] }],
    manifests: [{
      collection: 'Responsive System',
      key: 'set:spacing:Spacing',
      manifest: { v: 1, domain: 'spacing', group: 'Spacing', modes: ['tablet'], tokens: ['xs'] }
    }]
  });
  assert.deepEqual(result.viewports.map((v) => v.key), ['mobile'], 'from the modes, not the manifest');
  assert.deepEqual(result.sets[0].missing, ['xs']);
  assert.ok(codes(result).includes('manifest-mode-missing'));
});

test('parallel sets in two collections share one registry', () => {
  const result = reconcileFoundation({
    registry: registry([MOBILE, DESKTOP]),
    modes: [modesOf('Spacing A', ['Mobile', 'Desktop']), modesOf('Spacing B', ['Mobile'])],
    manifests: [
      { collection: 'Spacing A', key: 'set:spacing:Spacing', manifest: { v: 1, domain: 'spacing', group: 'Spacing', modes: ['mobile', 'desktop'], tokens: [] } },
      { collection: 'Spacing B', key: 'set:spacing:Spacing', manifest: { v: 1, domain: 'spacing', group: 'Spacing', modes: ['mobile'], tokens: [] } }
    ]
  });
  assert.equal(result.viewports.length, 2, 'one registry, not one per collection');
  assert.deepEqual(byKey(result, 'mobile').materialisedIn, ['Spacing A', 'Spacing B']);
  assert.deepEqual(byKey(result, 'desktop').materialisedIn, ['Spacing A']);
  assert.equal(result.sets.length, 2);
  assert.deepEqual(result.sets.map((s) => s.collection), ['Spacing A', 'Spacing B']);
});

test('two viewports with the same label, or the same key, do not shadow each other', () => {
  const dupLabel = reconcileFoundation({
    registry: registry([{ key: 'mobile', label: 'Mobile', width: 375 }, { key: 'handset', label: 'Mobile', width: 390 }])
  });
  assert.equal(dupLabel.viewports.length, 1);
  assert.ok(codes(dupLabel).includes('duplicate-label'));

  const dupKey = reconcileFoundation({
    registry: registry([{ key: 'mobile', label: 'Mobile', width: 375 }, { key: 'mobile', label: 'Phone', width: 390 }])
  });
  assert.equal(dupKey.viewports.length, 1);
  assert.ok(codes(dupKey).includes('duplicate-key'));
});

test('an empty file reconciles to nothing, without warnings or throwing', () => {
  const result = reconcileFoundation({});
  assert.deepEqual(result.viewports, []);
  assert.deepEqual(result.sets, []);
  assert.deepEqual(result.warnings, []);
});

test('reconciling does not mutate what it was given', () => {
  const source = registry([DESKTOP, MOBILE]);
  const before = JSON.stringify(source);
  reconcileFoundation({ registry: source, modes: [modesOf('RS', ['Desktop'])] });
  assert.equal(JSON.stringify(source), before);
});

// ---------------------------------------------------------------------------
// Stamps — primitives only; nothing applies them yet
// ---------------------------------------------------------------------------

test('a stamp survives a rename, which a name match cannot', () => {
  const stamped = { name: 'Spacing/extra-small', pluginData: stampValue('spacing', 'xs') };
  const other = { name: 'Spacing/sm', pluginData: stampValue('spacing', 'sm') };
  const candidates = [other, stamped];
  assert.equal(findByStamp(candidates, 'spacing', 'xs', (t) => t.pluginData), stamped);
  assert.equal(findByStamp(candidates, 'radius', 'xs', (t) => t.pluginData), null, 'domain is part of identity');
});

test('two candidates sharing a stamp fall back to the exact name, and are reported', () => {
  // What a user duplicating a variable in Figma produces.
  const a = { name: 'Spacing/xs', pluginData: stampValue('spacing', 'xs') };
  const b = { name: 'Spacing/xs copy', pluginData: stampValue('spacing', 'xs') };
  const found = findByStamp([b, a], 'spacing', 'xs', (t) => t.pluginData, 'Spacing/xs');
  assert.equal(found, a, 'the exact name breaks the tie');
});
