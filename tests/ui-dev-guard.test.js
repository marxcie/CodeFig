/**
 * The UI's only localhost path must stay dev-only.
 *
 * The dev bridge has no auth by design — it is a localhost conduit that lets a terminal run
 * scripts inside the open plugin. A shipped build that could reach it would be a real
 * problem, not just noise. Two things keep that from happening:
 *
 *   1. every request goes through _codefigBridgeFetch, which returns early unless
 *      CODEFIG_BUILD_IS_DEV — asserted here, statically, so a future ungated fetch fails CI;
 *   2. `npm run build:production` leaves localhost out of manifest.json, so Figma blocks the
 *      request at the platform level even if (1) were defeated — asserted in the manifest
 *      test below.
 *
 * This is a source-level check on purpose: it runs in milliseconds and does not need a build.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'manifest.json'), 'utf8')
);

test('the localhost URL appears exactly once in the UI, as the bridge origin constant', () => {
  // Prose in comments is fine; what must stay singular is the URL literal itself.
  const hits = UI.match(/http:\/\/localhost/g) || [];
  assert.equal(
    hits.length,
    1,
    `Expected one localhost URL (CODEFIG_BRIDGE_ORIGIN), found ${hits.length}. ` +
      'Route new dev-bridge requests through _codefigBridgeFetch instead of calling fetch directly.'
  );
  assert.match(UI, /var CODEFIG_BRIDGE_ORIGIN = 'http:\/\/localhost:8765';/);
});

test('_codefigBridgeFetch refuses to run outside a dev build', () => {
  const fn = UI.match(/function _codefigBridgeFetch\(pathname, options\) \{[\s\S]*?\n      \}/);
  assert.ok(fn, '_codefigBridgeFetch not found — did it get renamed?');
  const body = fn[0];
  // The guard must be the first statement, before any fetch.
  const guardAt = body.indexOf('if (!CODEFIG_BUILD_IS_DEV) return');
  const fetchAt = body.indexOf('fetch(');
  assert.ok(guardAt !== -1, 'the dev guard is missing from _codefigBridgeFetch');
  assert.ok(guardAt < fetchAt, 'the dev guard must come before the fetch');
});

test('the bridge origin is only ever used inside the guarded helper', () => {
  const uses = UI.match(/CODEFIG_BRIDGE_ORIGIN/g) || [];
  assert.equal(uses.length, 2, 'CODEFIG_BRIDGE_ORIGIN should be declared once and used once');
});

test('the job poller only starts in a dev build', () => {
  assert.match(
    UI,
    /if \(CODEFIG_BUILD_IS_DEV\) \{\s*\n\s*setInterval\(_codefigQueuePoll, CODEFIG_JOB_POLL_MS\);/,
    'the queue poll interval must be behind CODEFIG_BUILD_IS_DEV'
  );
  // Second layer: the poll function itself bails out.
  const fn = UI.match(/function _codefigQueuePoll\(\) \{[\s\S]*?\n      \}/);
  assert.ok(fn, '_codefigQueuePoll not found');
  assert.match(fn[0], /if \(!CODEFIG_BUILD_IS_DEV\) return;/);
});

test('the build flag placeholder is still what build-scripts.js substitutes', () => {
  // If this drifts, every guard above silently becomes `"..." === "true"` → false in dev too,
  // which would look like "the bridge stopped working" rather than a build bug.
  assert.match(UI, /var CODEFIG_BUILD_IS_DEV = "__CODEFIG_BUILD_IS_DEV__" === "true";/);
  const build = fs.readFileSync(path.join(__dirname, '..', 'build-scripts.js'), 'utf8');
  assert.match(build, /__CODEFIG_BUILD_IS_DEV__/);
});

test('the committed manifest template has no localhost, so production cannot reach the bridge', () => {
  const domains = MANIFEST.networkAccess.allowedDomains;
  assert.ok(Array.isArray(domains));
  for (const domain of domains) {
    assert.doesNotMatch(
      domain,
      /localhost/i,
      'src/manifest.json is the production template — localhost belongs only in the generated dev manifest'
    );
  }
  assert.ok(
    domains.some((d) => /api\.figma\.com/.test(d)),
    'https://api.figma.com must stay: REST-using scripts depend on it'
  );
});

test('the UI-command poller is gated twice, and never registers in a production build', () => {
  // The bridge grew a second channel (plan 22): named commands that drive the iframe. It is a
  // remote control into the plugin, acceptable only because it cannot exist in a shipped build.
  // Two gates, both asserted, because one of them being enough is not a thing to rely on.
  const poll = UI.match(/function _codefigUiPoll\(\) \{[\s\S]*?\n      \}/);
  assert.ok(poll, '_codefigUiPoll not found — did it get renamed?');
  assert.match(poll[0], /^\s*function _codefigUiPoll\(\) \{\s*\n\s*if \(!CODEFIG_BUILD_IS_DEV\) return;/,
    'the dev guard must be the first statement in the poller');

  // And the interval is only ever installed on a dev build, so production does not even tick.
  assert.match(
    UI,
    /if \(CODEFIG_BUILD_IS_DEV\) \{\s*\n\s*setInterval\(_codefigUiPoll, CODEFIG_JOB_POLL_MS\);/,
    'the UI-command interval must be installed only under CODEFIG_BUILD_IS_DEV'
  );
});

test('every UI-command request goes through the guarded helper', () => {
  // The rule that keeps this channel dev-only: no direct fetch, so the guard cannot be bypassed
  // by adding a route. A handler reaching for fetch itself is the one way this ships.
  const start = UI.indexOf('function handleUiCommand(');
  const end = UI.indexOf('if (CODEFIG_BUILD_IS_DEV) {', UI.indexOf('function _codefigUiPoll('));
  const region = UI.slice(start, end);
  assert.equal(region.indexOf('fetch('), -1,
    'the UI-command code calls fetch directly — route it through _codefigBridgeFetch');
  assert.match(region, /_codefigBridgeFetch\('\/ui\/next'\)/);
  assert.match(region, /_codefigBridgeFetch\('\/ui\/' \+ id \+ '\/result'/);
});
