// Tests: foundation maintain (boot cleanup)
// # Tests: foundation maintain
//
// Node covers the pure plan (`tests/foundation-maintain.test.js`). This skeleton is the
// live half: it needs real VariableCollections and shared plugin data. Run with
// `npm run test:figma -- foundation-maintain` in a file whose name contains `codefig-test`.
//
// Boot itself is not re-invoked here — that would require closing and reopening the plugin.
// Instead we call `runFoundationMaintain` through a require that only exists in the plugin
// main thread. Specs run as user scripts and cannot `require('../src/foundation-maintain')`,
// so this file documents the Figma-only cases and asserts the helpers we *can* reach via
// @Foundation until a dedicated export is wired.
//
// Figma-only cases to verify by hand (or when this spec gains a sandbox bridge):
// 1. Registry viewport with no mode → pruned after plugin reopen (check figma-console.log).
// 2. Orphan set:* key with no stamps → deleted on reopen.
// 3. Stamp whose set id has no manifest → stamp cleared on reopen.
// 4. Two groups, one set id, manifest present → left alone (DEFERRED §11).

@import { testBegin, it, itInTestFile, expect, testFinish, cleanupTestArtifacts } from "@Test Harness"
@import { foundationNamespace, foundationRegistryKey, writeRegistry, writeManifest, stampToken, readStamp, foundationMintSetId } from "@Foundation"

testBegin('foundation-maintain');

it('namespace and registry key match the boot maintainer', function () {
  // Guard against the src/ module and @Foundation drifting on the only strings that matter.
  expect(foundationNamespace()).toBe('codefig');
  expect(foundationRegistryKey()).toBe('registry');
});

itInTestFile('documents that apply runs on plugin open, not in this runner', async function () {
  // Intentionally no mutation: applying maintain from a script would blur the boot-only
  // contract. Reload the plugin on a file with planted orphans and read figma-console.log.
  expect(typeof writeRegistry).toBe('function');
  expect(typeof writeManifest).toBe('function');
  expect(typeof stampToken).toBe('function');
  expect(typeof readStamp).toBe('function');
  expect(typeof foundationMintSetId).toBe('function');
});

cleanupTestArtifacts();
testFinish();
