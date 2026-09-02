/**
 * Fixture tests for the plan/apply split in scripts/EXAMPLE_SCRIPTS/Styles/rename-styles.js.
 *
 * Plan 11 turned "rename as you go" into "compute a plan, then apply it", because that is the
 * only way a preview and the apply pass cannot disagree. The property worth pinning is exactly
 * that: applying a plan produces the names the plan said it would, and nothing else moves.
 *
 * A style is just `{ name, type }` here — the plan logic never touches the Figma API, which is
 * what makes this testable in Node. The parts that do are covered by scripts/_TESTS/.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');

const SCRIPTS = path.join(__dirname, '..', 'scripts');

/** Evaluate the plan functions plus the library functions they depend on. */
function loadPlanner() {
  const read = (rel) => fs.readFileSync(path.join(SCRIPTS, rel), 'utf8');
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, String, Array, Object, JSON };
  vm.createContext(ctx);

  const sources = [
    ['CODEFIG_LIBRARIES/@pattern-matching.js', ['escapeWildcards', 'applyFigmaPlaceholders', 'patternMode', 'patternToRegex', 'nameMatches', 'renameByPattern']],
    ['CODEFIG_LIBRARIES/@rename-preview.js', ['previewRow', 'flagPreviewCollisions', 'previewCounts', 'previewSignature']],
    ['EXAMPLE_SCRIPTS/Styles/rename-styles.js', ['getMatchOpts', 'toRenameOperations', 'planRenameStyles', 'applyRenamePlan', 'hasRenameOperation', 'filterBySearchIn']]
  ];
  for (const [rel, names] of sources) {
    const map = resolver.extractFunctionMap(read(rel));
    for (const name of names) {
      const code = map.get(name);
      assert.ok(code, `${name} is not extractable from ${rel}`);
      vm.runInContext(code, ctx);
    }
  }
  return ctx;
}

const lib = loadPlanner();
const { planRenameStyles, applyRenamePlan, toRenameOperations, filterBySearchIn } = lib;

/** Stand-in for a Figma style: the plan only ever reads .name and .type. */
function style(name) {
  return { name, type: 'PAINT' };
}

const FIXTURE = () => [
  style('V4/Brand/Primary'),
  style('V4/Brand/Secondary'),
  style('V5/Brand/Primary'),
  style('Text [Legacy] Body'),
  style('Text Legacy Body')
];

const op = (find, replace) => toRenameOperations(null, find, replace);

test('only matched styles enter the plan', () => {
  const styles = FIXTURE();
  const entries = planRenameStyles(styles, op('V4', 'V5'));
  assert.deepEqual(
    entries.map((e) => e.row.from),
    ['V4/Brand/Primary', 'V4/Brand/Secondary'],
    'unmatched styles are not findings and must not appear as rows'
  );
});

test('planning changes nothing', () => {
  const styles = FIXTURE();
  const before = styles.map((s) => s.name);
  planRenameStyles(styles, op('V4', 'V5'));
  assert.deepEqual(styles.map((s) => s.name), before);
});

test('applying a plan produces exactly the names the plan predicted', () => {
  // Plan 11's central criterion, as a property rather than an example.
  const styles = FIXTURE();
  const entries = planRenameStyles(styles, op('V4', 'V6'));
  const predicted = entries.map((e) => ({ style: e.style, expected: e.row.changed ? e.row.to : e.row.from }));

  applyRenamePlan(entries);

  for (const { style: target, expected } of predicted) {
    assert.equal(target.name, expected);
  }
  assert.equal(styles[4].name, 'Text Legacy Body', 'a style outside the plan is untouched');
});

test('applying returns the number of names it actually changed', () => {
  const entries = planRenameStyles(FIXTURE(), op('V4', 'V6'));
  assert.equal(applyRenamePlan(entries), 2);
});

test('a row that would empty the name is flagged and not applied', () => {
  const styles = [style('V4/Brand/Primary')];
  const entries = planRenameStyles(styles, op('*', ''));
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].row.flags, ['empty']);
  assert.equal(applyRenamePlan(entries), 0);
  assert.equal(styles[0].name, 'V4/Brand/Primary', 'left alone');
});

test('a pattern that matches but does not change is planned as unchanged', () => {
  // The shape of a misunderstood pattern: it matched, and did nothing.
  const entries = planRenameStyles([style('V4/Brand/Primary')], op('V4', 'V4'));
  assert.equal(entries.length, 1, 'it matched, so it belongs in the plan');
  assert.deepEqual(entries[0].row.flags, ['unchanged']);
  assert.equal(applyRenamePlan(entries), 0);
});

test('brackets stay literal through the plan', () => {
  const styles = [style('Text [Legacy] Body'), style('Text Legacy Body')];
  const entries = planRenameStyles(styles, op('Text [Legacy]', 'Text'));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].row.to, 'Text Body');
  applyRenamePlan(entries);
  assert.equal(styles[1].name, 'Text Legacy Body');
});

test('batch operations are simulated in sequence, as they really apply', () => {
  // Each op sees the previous op's output, so the preview has to chain them or it lies
  // about the end state. LG→XL then MD→LG must not turn MD into XL.
  const styles = [style('Size/LG'), style('Size/MD')];
  const entries = planRenameStyles(styles, toRenameOperations([['LG', 'XL'], ['MD', 'LG']], '', ''));
  const byFrom = {};
  entries.forEach((e) => { byFrom[e.row.from] = e.row.to; });
  assert.equal(byFrom['Size/LG'], 'Size/XL');
  assert.equal(byFrom['Size/MD'], 'Size/LG', 'MD becomes LG, and is not then swept into XL');

  applyRenamePlan(entries);
  assert.deepEqual(styles.map((s) => s.name), ['Size/XL', 'Size/LG']);
});

test('a batch chain that collapses two names into one is visible in the plan', () => {
  const styles = [style('a'), style('b')];
  const entries = planRenameStyles(styles, toRenameOperations([['a', 'b'], ['b', 'c']], '', ''));
  const rows = entries.map((e) => e.row);
  // a → b → c in one run, because the second op sees the first op's output.
  assert.equal(rows[0].to, 'c');
  assert.equal(rows[1].to, 'c');
  lib.flagPreviewCollisions(rows, styles.map((s) => s.name));
  assert.ok(rows[1].flags.includes('duplicate'), 'both landing on c is worth flagging');
});

test('counters are positional over the filtered set, unchanged by the refactor', () => {
  const styles = [style('a-1'), style('a-2'), style('a-3')];
  const entries = planRenameStyles(styles, op('a', '$n'));
  assert.deepEqual(entries.map((e) => e.row.to), ['1-1', '2-2', '3-3']);
});

test('searchIn filtering feeds the plan the scope it should see', () => {
  const styles = FIXTURE();
  const scoped = filterBySearchIn(styles, 'V4/*');
  assert.equal(scoped.length, 2);
  const entries = planRenameStyles(scoped, op('Brand', 'Core'));
  assert.deepEqual(entries.map((e) => e.row.to), ['V4/Core/Primary', 'V4/Core/Secondary']);
});

test('toRenameOperations accepts both batch shapes and the single pair', () => {
  assert.deepEqual(toRenameOperations(null, 'a', 'b'), [{ find: 'a', replace: 'b' }]);
  assert.deepEqual(toRenameOperations([['a', 'b']], '', ''), [{ find: 'a', replace: 'b' }]);
  assert.deepEqual(
    toRenameOperations([{ searchPattern: 'a', replacePattern: 'b' }], '', ''),
    [{ find: 'a', replace: 'b' }]
  );
});
