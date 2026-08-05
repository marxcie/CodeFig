/**
 * Fixture tests for scripts/CODEFIG_LIBRARIES/@rename-preview.js.
 *
 * The preview is the mitigation for every silent-wrong-rename this repo has hit, so a preview
 * that lies is worse than no preview at all. What must hold: the rows say exactly what apply
 * would do, suspicious rows are flagged rather than hidden, and the signature notices when a
 * plan has drifted between the preview run and the apply run.
 *
 * The plan-building and presentation halves are pure functions precisely so they can be
 * asserted here; the clientStorage halves need Figma and are covered by the in-Figma spec.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');

const LIBRARY = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@rename-preview.js');

function loadLibrary() {
  const functions = resolver.extractFunctionMap(fs.readFileSync(LIBRARY, 'utf8'));
  const wanted = [
    'previewRow',
    'flagPreviewCollisions',
    'previewCounts',
    'previewFlagLabel',
    'previewPayload',
    'logPreviewPlan',
    'previewSignature',
    'previewStorageKey',
    'previewDriftMessage'
  ];
  const logged = [];
  const ctx = {
    console: { log: (...args) => logged.push(args.join(' ')) },
    Math,
    String,
    Array,
    Object,
    JSON
  };
  vm.createContext(ctx);
  for (const name of wanted) {
    const code = functions.get(name);
    assert.ok(code, `${name} is not extractable from @rename-preview.js`);
    vm.runInContext(code, ctx);
  }
  ctx.__logged = logged;
  return ctx;
}

const lib = loadLibrary();
const {
  previewRow,
  flagPreviewCollisions,
  previewCounts,
  previewPayload,
  logPreviewPlan,
  previewSignature,
  previewDriftMessage
} = lib;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

test('a row records the change and whether it is really a change', () => {
  const changed = previewRow('font-24', 'text-24');
  assert.equal(changed.from, 'font-24');
  assert.equal(changed.to, 'text-24');
  assert.equal(changed.changed, true);
  assert.deepEqual(changed.flags, []);
});

test('a name that matched but came out identical is flagged, not hidden', () => {
  // This is what a misunderstood pattern looks like: it matched, and did nothing.
  const row = previewRow('Text/5xl/Regular', 'Text/5xl/Regular');
  assert.equal(row.changed, false);
  assert.deepEqual(row.flags, ['unchanged']);
});

test('a replacement that would empty the name is flagged', () => {
  const row = previewRow('Text/5xl/Regular', '');
  assert.equal(row.changed, false, 'an empty name is never a change worth applying');
  assert.deepEqual(row.flags, ['empty']);
  assert.deepEqual(previewRow('x', '   ').flags, ['empty']);
});

// ---------------------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------------------

test('a new name that already exists is flagged as a collision', () => {
  const rows = [previewRow('color/pine', 'color/Pine')];
  flagPreviewCollisions(rows, ['color/pine', 'color/Pine', 'color/oak']);
  assert.deepEqual(rows[0].flags, ['collision']);
});

test('renaming something frees its own name, so a swap is not a false collision', () => {
  // a → b while b → c: b is being vacated, so a → b must not read as a clash.
  const rows = [previewRow('a', 'b'), previewRow('b', 'c')];
  flagPreviewCollisions(rows, ['a', 'b']);
  assert.deepEqual(rows[0].flags, [], 'b is vacated by the second row');
  assert.deepEqual(rows[1].flags, []);
});

test('renaming to a name nothing holds is not a collision', () => {
  const rows = [previewRow('a', 'brand-new')];
  flagPreviewCollisions(rows, ['a', 'b', 'c']);
  assert.deepEqual(rows[0].flags, []);
});

test('two rows producing the same new name are flagged as duplicates', () => {
  const rows = [previewRow('LG', 'Large'), previewRow('lg', 'Large')];
  flagPreviewCollisions(rows, ['LG', 'lg']);
  assert.equal(rows[1].flags.includes('duplicate'), true);
  assert.equal(rows[0].flags.includes('duplicate'), false, 'the first claim is not the clash');
});

test('unchanged rows are ignored by collision detection', () => {
  const rows = [previewRow('a', 'a')];
  flagPreviewCollisions(rows, ['a']);
  assert.deepEqual(rows[0].flags, ['unchanged'], 'no spurious collision with itself');
});

// ---------------------------------------------------------------------------
// Counts and payload
// ---------------------------------------------------------------------------

test('counts tally what would change and what needs checking', () => {
  const rows = [
    previewRow('a', 'b'),
    previewRow('c', 'c'),
    previewRow('d', ''),
    previewRow('e', 'f')
  ];
  flagPreviewCollisions(rows, ['a', 'c', 'd', 'e', 'f']);
  const counts = previewCounts(rows);
  assert.equal(counts.total, 4);
  assert.equal(counts.changed, 2, 'a→b and e→f');
  assert.equal(counts.unchanged, 1);
  assert.equal(counts.empty, 1);
  assert.equal(counts.collision, 1, 'e→f collides with the existing f');
  assert.equal(counts.flagged, 3);
});

test('the payload titles itself with the real numbers', () => {
  const rows = [previewRow('a', 'b'), previewRow('c', 'c')];
  const payload = previewPayload('Rename styles', rows);
  assert.match(payload.title, /1 of 2 would change/);
  assert.match(payload.title, /1 to check/);
  assert.equal(payload.type, 'warning', 'a flagged row makes the whole plan worth a warning');
  assert.equal(payload.results.length, 2);
  assert.match(payload.results[0].message, /a {2}→ {2}b/);
  assert.match(payload.results[1].message, /\(no change\)/);
  assert.match(payload.results[1].details, /matched but unchanged/);
  assert.equal(payload.results[0].severity, 'info');
  assert.equal(payload.results[1].severity, 'warning');
});

test('a clean plan is info, not warning', () => {
  const payload = previewPayload('Rename styles', [previewRow('a', 'b')]);
  assert.equal(payload.type, 'info');
  assert.doesNotMatch(payload.title, /to check/);
});

test('an empty plan explains why nothing matched instead of showing nothing', () => {
  const payload = previewPayload('Rename styles', []);
  assert.match(payload.title, /0 of 0 would change/);
  assert.equal(payload.results.length, 1);
  assert.match(payload.results[0].message, /Nothing matched/);
  assert.match(payload.results[0].details, /literal unless/);
  assert.equal(payload.results[0].severity, 'warning');
});

test('the console plan says outright that nothing has changed', () => {
  const logged = [];
  const isolated = loadLibrary();
  isolated.logPreviewPlan([isolated.previewRow('a', 'b')], { field: 'previewOnly' });
  const output = isolated.__logged.join('\n');
  assert.match(output, /nothing has been changed/i);
  assert.match(output, /"a" → "b"/);
  assert.match(output, /untick "Preview only" \(previewOnly\)/);
  assert.equal(logged.length, 0);
});

// ---------------------------------------------------------------------------
// Preview → apply drift
// ---------------------------------------------------------------------------

test('the signature is stable for the same plan and differs for a different one', () => {
  const a = [previewRow('x', 'y'), previewRow('p', 'q')];
  const b = [previewRow('x', 'y'), previewRow('p', 'q')];
  assert.equal(previewSignature(a), previewSignature(b));

  assert.notEqual(previewSignature(a), previewSignature([previewRow('x', 'z'), previewRow('p', 'q')]));
  assert.notEqual(previewSignature(a), previewSignature([previewRow('x', 'y')]), 'fewer rows');
  assert.notEqual(
    previewSignature(a),
    previewSignature([previewRow('p', 'q'), previewRow('x', 'y')]),
    'order matters, because $n numbering depends on it'
  );
  assert.match(previewSignature(a), /^2:/, 'the row count is visible in the signature');
});

test('drift is reported when the plan no longer matches the preview', () => {
  const rows = [previewRow('x', 'y')];
  const sig = previewSignature(rows);
  assert.equal(previewDriftMessage({ signature: sig }, sig), '', 'no message when they agree');

  const drifted = previewDriftMessage({ signature: 'stale:abc' }, sig);
  assert.match(drifted, /plan changed since the preview/);
  assert.match(drifted, /\$n \/ \$N numbering/, 'says why it matters, not just that it happened');
});

test('applying with no preview on record says so rather than staying silent', () => {
  const message = previewDriftMessage(null, previewSignature([previewRow('x', 'y')]));
  assert.match(message, /No preview on record/);
  assert.match(message, /Preview only/);
});

test('the storage key is namespaced per script', () => {
  assert.equal(lib.previewStorageKey('rename-styles'), 'codefigPreviewPlan:rename-styles');
  assert.equal(lib.previewStorageKey(), 'codefigPreviewPlan:unknown');
});
