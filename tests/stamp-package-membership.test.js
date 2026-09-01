/**
 * Plan 32: `stampPackageMembership` marks DSF scripts and their nine package libraries.
 * `findAllScripts` is the production path that applies it, so membership is asserted on that list.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { stampPackageMembership } = require('../stamp-package-membership.js');
const { DSF_PACKAGE_LIBRARIES } = require('../packages-config.js');
const { findAllScripts } = require('../validate-scripts.js');

const PACKAGE_ID = 'design-system-foundations';
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

test('stampPackageMembership is the module findAllScripts uses to mark DSF members', () => {
  assert.equal(typeof stampPackageMembership, 'function');
  assert.equal(DSF_PACKAGE_LIBRARIES.length, 9);
});

test('Design System Foundations scripts and the 9 DSF libraries get packageId', () => {
  const scripts = findAllScripts(SCRIPTS_DIR);
  assert.ok(!(scripts._packageStampErrors && scripts._packageStampErrors.length),
    'package stamp errors: ' + JSON.stringify(scripts._packageStampErrors));

  const dsfScripts = scripts.filter((s) =>
    /Design System Foundations/.test(String(s.path || '')) && !String(s.filename || '').startsWith('@')
  );
  assert.ok(dsfScripts.length >= 5, 'expected DSF public scripts, got ' + dsfScripts.length);
  dsfScripts.forEach((s) => {
    assert.strictEqual(s.packageId, PACKAGE_ID, s.name + ' missing packageId');
    assert.strictEqual(s.packageVisibility, 'public', s.name + ' should be public');
  });

  const byShort = {};
  scripts.forEach((s) => {
    const base = path.basename(s.filename || '', '.js');
    // Library display names are "CodeFig Libraries / @Foundation"; match on the @-tail.
    const m = String(s.name || '').match(/\/\s*(@.+)$/);
    if (m) byShort[m[1]] = s;
  });

  DSF_PACKAGE_LIBRARIES.forEach((libName) => {
    const lib = byShort[libName];
    assert.ok(lib, 'library ' + libName + ' not in findAllScripts');
    assert.strictEqual(lib.packageId, PACKAGE_ID, libName + ' missing packageId');
    assert.strictEqual(lib.packageVisibility, 'package', libName + ' should be package-visibility');
  });
});

test('@Core Library has no packageId', () => {
  const scripts = findAllScripts(SCRIPTS_DIR);
  const core = scripts.find((s) => /@core-library\.js$/i.test(String(s.path || '')) ||
    /@Core Library$/.test(String(s.name || '')));
  assert.ok(core, '@Core Library not found');
  assert.strictEqual(core.packageId, undefined);
  assert.strictEqual(core.packageVisibility, undefined);
});
