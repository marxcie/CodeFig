/**
 * Library + script `@STYLE_START` gathering for the panel injector.
 * See `collectStyleSheets` in `src/import-resolver.js`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { collectStyleSheets, findImports } = require('../src/import-resolver');

function extractStyle(code) {
  const start = code.indexOf('// @STYLE_START');
  const end = code.indexOf('// @STYLE_END');
  if (start < 0 || end < 0 || end <= start) return '';
  const raw = code.slice(start + '// @STYLE_START'.length, end);
  return raw
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*\/\/\s?(.*)$/);
      return m ? m[1] : line;
    })
    .join('\n')
    .trim();
}

test('collectStyleSheets: library sheet then script sheet (script last)', () => {
  const scripts = [
    {
      name: '@Widget',
      code: '// @STYLE_START\n// .lib { color: red; }\n// @STYLE_END\n',
    },
    {
      name: 'My script',
      packageId: 'pkg',
      code:
        '// @STYLE_START\n// .mine { color: blue; }\n// @STYLE_END\n' +
        '@import { draw } from "@Widget"\n',
    },
  ];
  const parts = collectStyleSheets(scripts[1].code, scripts, 'pkg', extractStyle);
  assert.equal(parts.length, 2);
  assert.match(parts[0], /\.lib/);
  assert.match(parts[1], /\.mine/);
});

test('collectStyleSheets: skips libraries with no STYLE', () => {
  const scripts = [
    { name: '@Bare', code: 'function bare() {}\n' },
    {
      name: 'Runner',
      code: '// @STYLE_START\n// .only { }\n// @STYLE_END\n@import { bare } from "@Bare"\n',
    },
  ];
  const parts = collectStyleSheets(scripts[1].code, scripts, null, extractStyle);
  assert.equal(parts.length, 1);
  assert.match(parts[0], /\.only/);
});

test('collectStyleSheets: dependency-first across a library chain', () => {
  const scripts = [
    {
      name: '@Base',
      code: '// @STYLE_START\n// .base { }\n// @STYLE_END\n',
    },
    {
      name: '@Mid',
      code:
        '// @STYLE_START\n// .mid { }\n// @STYLE_END\n' +
        '@import { x } from "@Base"\n',
    },
    {
      name: 'Top',
      code: '@import { y } from "@Mid"\n',
    },
  ];
  const parts = collectStyleSheets(scripts[2].code, scripts, null, extractStyle);
  assert.deepEqual(
    parts.map((p) => (/\.base/.test(p) ? 'base' : /\.mid/.test(p) ? 'mid' : '?')),
    ['base', 'mid']
  );
});

test('DSF Colors gathers @Color Ramp sheet (no STYLE left on the script)', () => {
  const root = path.join(__dirname, '..');
  const colors = fs.readFileSync(
    path.join(root, 'scripts/EXAMPLE_SCRIPTS/Design System Foundations/colors.js'),
    'utf8'
  );
  const colorRamp = fs.readFileSync(
    path.join(root, 'scripts/CODEFIG_LIBRARIES/@color-ramp.js'),
    'utf8'
  );
  assert.equal(colors.includes('@STYLE_START'), false, 'Colors script should not keep STYLE');
  assert.ok(colorRamp.includes('@STYLE_START'), '@Color Ramp should carry the ramp sheet');
  assert.ok(findImports(colors).some((i) => /Color Ramp/i.test(i.scriptName)));

  const scripts = [
    { name: '@Color Ramp', code: colorRamp, packageId: 'design-system-foundations' },
    // Minimal stubs so other imports resolve without STYLE
    { name: '@InfoPanel', code: '', packageId: 'design-system-foundations' },
    { name: '@Variables', code: '' },
    { name: '@Foundation', code: '', packageId: 'design-system-foundations' },
  ];
  const parts = collectStyleSheets(colors, scripts, 'design-system-foundations', extractStyle);
  assert.equal(parts.length, 1);
  assert.match(parts[0], /\.color-ramp-preview\b/);
});
