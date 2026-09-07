/**
 * Overview sections are addressed by collection + group — overwrite only on an exact match.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(
  path.join(__dirname, '../scripts/CODEFIG_LIBRARIES/@foundation-overview.js'),
  'utf8'
);

function loadNamingHelpers() {
  const names = [
    'foundationOverviewGroupLabel',
    'foundationOverviewSectionName',
    'foundationOverviewDisplayTitle',
    'foundationSectionMatchesDomain',
  ];
  const parts = [];
  for (const name of names) {
    const re = new RegExp(
      'function ' + name + '\\([\\s\\S]*?\\n\\}\\n'
    );
    const m = SRC.match(re);
    assert.ok(m, 'missing ' + name);
    parts.push(m[0]);
  }
  const sandbox = {};
  vm.runInNewContext(parts.join('\n'), sandbox);
  return sandbox;
}

test('section frame name includes domain, collection, and group', () => {
  const H = loadNamingHelpers();
  assert.equal(
    H.foundationOverviewSectionName('Colors — overview', 'color - lime', 'Blue'),
    'Colors — overview · color - lime · Blue'
  );
  assert.equal(
    H.foundationOverviewSectionName('Spacing — overview', 'Responsive System', 'Spacing'),
    'Spacing — overview · Responsive System · Spacing'
  );
  assert.equal(
    H.foundationOverviewSectionName('Colors — overview', '', ''),
    'Colors — overview · (no collection) · (no group)'
  );
});

test('different collection or group yields a different section name', () => {
  const H = loadNamingHelpers();
  const a = H.foundationOverviewSectionName('Colors — overview', 'A', 'Blue');
  const b = H.foundationOverviewSectionName('Colors — overview', 'B', 'Blue');
  const c = H.foundationOverviewSectionName('Colors — overview', 'A', 'Neutrals');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.equal(a, H.foundationOverviewSectionName('Colors — overview', 'A', 'Blue'));
});

test('domain match covers legacy bare names and addressed suffixes', () => {
  const H = loadNamingHelpers();
  assert.equal(H.foundationSectionMatchesDomain('Colors — overview', 'Colors — overview'), true);
  assert.equal(
    H.foundationSectionMatchesDomain('Colors — overview · A · Blue', 'Colors — overview'),
    true
  );
  assert.equal(
    H.foundationSectionMatchesDomain('Spacing — overview · A · B', 'Colors — overview'),
    false
  );
});

test('every DSF overview creator acquires an addressed section', () => {
  assert.match(SRC, /foundationAcquireAddressedSection\(wrapper, L\.sections\.colors/);
  assert.match(SRC, /foundationAcquireAddressedSection\(wrapper, L\.sections\.spacing/);
  assert.match(SRC, /foundationAcquireAddressedSection\(wrapper, L\.sections\.corner/);
  assert.match(SRC, /foundationAcquireAddressedSection\(wrapper, L\.sections\.grid/);
  assert.match(SRC, /foundationAcquireAddressedSection\(\s*wrapper, L\.sections\.renderStyles/);
  assert.match(SRC, /migrateLegacy:\s*false/);
  assert.match(SRC, /dropLegacyBare:\s*true/);
});
