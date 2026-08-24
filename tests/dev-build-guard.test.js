/**
 * `manifestAllowsLocalhost` in figma-console-server.js is what `assertDevBuild` uses to refuse a
 * job against a production `dist/` instead of leaving it to time out 120s later with no signal
 * why. Same distinction `build-scripts.js`'s `writeManifest` writes: dev keeps localhost in
 * `allowedDomains`, production strips it.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { manifestAllowsLocalhost } = require('../figma-console-server.js');

function writeManifest(domains) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codefig-manifest-')), 'manifest.json');
  fs.writeFileSync(file, JSON.stringify({ networkAccess: { allowedDomains: domains } }));
  return file;
}

test('a dev manifest (localhost present) reads as dev', () => {
  const file = writeManifest(['https://api.figma.com', 'http://localhost:8765']);
  assert.strictEqual(manifestAllowsLocalhost(file), true);
});

test('a production manifest (no localhost) reads as production', () => {
  const file = writeManifest(['https://api.figma.com']);
  assert.strictEqual(manifestAllowsLocalhost(file), false);
});

test('a manifest with no networkAccess block reads as production', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codefig-manifest-')), 'manifest.json');
  fs.writeFileSync(file, JSON.stringify({}));
  assert.strictEqual(manifestAllowsLocalhost(file), false);
});

test('a missing manifest throws rather than reading as either', () => {
  assert.throws(() => manifestAllowsLocalhost('/nonexistent/manifest.json'));
});
