/**
 * Section markers (@CONFIG_*, @DOC_*, @PANEL_*) must be alone on a // line.
 * Prose that quotes the marker (libraries teaching the format) must not invent a section.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');

function loadHasSection() {
  const start = UI.indexOf('function sectionMarkerRe(marker)');
  const end = UI.indexOf('function extractConfigSection');
  assert.ok(start > 0 && end > start, 'section helpers not found in ui.html');
  const src = UI.slice(start, end);
  const sandbox = {};
  vm.runInNewContext(src + '\nthis.hasSection = hasSection;\nthis.extractSection = extractSection;', sandbox);
  return sandbox;
}

test('a JSDoc mention of // @CONFIG_START is not a config section', () => {
  const { hasSection, extractSection } = loadHasSection();
  const foundation = fs.readFileSync(
    path.join(__dirname, '..', 'scripts/CODEFIG_LIBRARIES/@foundation.js'),
    'utf8'
  );
  assert.equal(hasSection(foundation, '@CONFIG_START'), false);
  assert.equal(hasSection(foundation, '@DOC_START'), true);
  assert.equal(extractSection(foundation, '@CONFIG_START', '@CONFIG_END'), '');
});

test('a real marker on its own line still counts', () => {
  const { hasSection, extractSection } = loadHasSection();
  const code = [
    '// @CONFIG_START',
    'foo: 1,',
    '// @CONFIG_END',
    '',
    '// Mentions // @CONFIG_START in a comment elsewhere',
  ].join('\n');
  assert.equal(hasSection(code, '@CONFIG_START'), true);
  assert.match(extractSection(code, '@CONFIG_START', '@CONFIG_END'), /foo: 1/);
});

test('a Docs example with // // @UI_CONFIG_START does not steal the real values region', () => {
  // Help used to embed a minimal sample that nested `// @UI_CONFIG_START` as a substring of
  // `// // @UI_CONFIG_START`. indexOf(match[0]) sliced that example; every specimen field opened blank.
  const { extractSection } = loadHasSection();
  const code = [
    '// @DOC_START',
    '// Minimal shape:',
    '// ```',
    '// // @UI_CONFIG_START',
    '// var dryRun = true;',
    '// // @UI_CONFIG_END',
    '// ```',
    '// @DOC_END',
    '',
    '// @UI_CONFIG_START',
    'var textField = "Sample";',
    'var toggle = true;',
    '// @UI_CONFIG_END',
    '',
    '// @PANEL_START',
    'var __codefigPanel = { blocks: [] };',
    '// @PANEL_END',
  ].join('\n');
  const values = extractSection(code, '@UI_CONFIG_START', '@UI_CONFIG_END');
  assert.match(values, /textField/);
  assert.match(values, /toggle/);
  assert.doesNotMatch(values, /dryRun/);
});
