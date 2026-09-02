/**
 * Plan 37 / 2.0: `@PANEL_START` as `var __codefigPanel = {…}` (and legacy `//` JSON).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const parser = require('../src/config-ui/parser.js');

const COMMENT_BODY = [
  '// {',
  '//   blocks: [',
  '//     { type: "heading", text: "General" },',
  '//     { key: "group", type: "string", label: "Group" }',
  '//   ]',
  '// }',
].join('\n');

const OBJECT_BODY = [
  'var __codefigPanel = {',
  '  blocks: [',
  '    { type: "heading", text: "General" },',
  '    { key: "group", type: "string", label: "Group" }',
  '  ]',
  '};',
].join('\n');

test('normalizePanelSpecText strips comment prefixes (legacy)', () => {
  const out = parser.normalizePanelSpecText(COMMENT_BODY);
  assert.match(out, /^\{\s*blocks:/);
  assert.doesNotMatch(out, /\/\//);
});

test('normalizePanelSpecText unwraps var __codefigPanel = …', () => {
  const out = parser.normalizePanelSpecText(OBJECT_BODY);
  assert.match(out, /^\{\s*blocks:/);
  assert.doesNotMatch(out, /__codefigPanel/);
  assert.doesNotMatch(out, /;$/);
});

test('parsePanelSpec yields the same rows for comment and object forms', () => {
  const values = { group: '' };
  const fromComment = parser.parsePanelSpec(COMMENT_BODY, values);
  const fromObject = parser.parsePanelSpec(OBJECT_BODY, values);
  assert.ok(!fromComment.error, fromComment.error);
  assert.ok(!fromObject.error, fromObject.error);
  assert.strictEqual(fromComment.rows.length, fromObject.rows.length);
  assert.deepStrictEqual(
    fromComment.rows.map((r) => ({ type: r.type, name: r.name, text: r.text })),
    fromObject.rows.map((r) => ({ type: r.type, name: r.name, text: r.text }))
  );
});

test('const and let bindings are accepted too', () => {
  const body = OBJECT_BODY.replace('var __codefigPanel', 'const __codefigPanel');
  const parsed = parser.parsePanelSpec(body, { group: '' });
  assert.ok(!parsed.error, parsed.error);
  assert.ok(parsed.rows.some((r) => r.type === 'field' && r.name === 'group'));
});

function walkScripts(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    if (ent.name.startsWith('_') || ent.name.startsWith('.')) return;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkScripts(p, out);
    else if (ent.name.endsWith('.js')) out.push(p);
  });
}

function shippedPanelFiles() {
  const root = path.join(__dirname, '..', 'scripts');
  const files = [];
  walkScripts(root, files);
  return files.filter((f) => /\/\/ @PANEL_START\b/.test(fs.readFileSync(f, 'utf8')));
}

function panelInner(file) {
  return /\/\/ @PANEL_START\n([\s\S]*?)\n\/\/ @PANEL_END/.exec(fs.readFileSync(file, 'utf8'));
}

test('shipped scripts with @PANEL_START use var __codefigPanel (after migration)', () => {
  const withPanel = shippedPanelFiles();
  assert.ok(withPanel.length > 0, 'expected shipped panels');
  const stillComment = withPanel.filter((f) => {
    const m = panelInner(f);
    return m && !/__codefigPanel\s*=/.test(m[1]);
  });
  assert.deepStrictEqual(
    stillComment.map((f) => path.relative(path.join(__dirname, '..'), f)),
    [],
    'every @PANEL_START must use var __codefigPanel'
  );
});

test('shipped @PANEL_START recipes use bare blocks: (Help style, not JSON-quoted)', () => {
  // Exit #8: one print dialect so Rename styles and Spacing teach the same language.
  const quoted = shippedPanelFiles().filter((f) => {
    const m = panelInner(f);
    return m && /"blocks"\s*:/.test(m[1]);
  });
  assert.deepStrictEqual(
    quoted.map((f) => path.relative(path.join(__dirname, '..'), f)),
    [],
    'every panel must use blocks: not "blocks": — run node devtools/normalize-panel-object-form.js'
  );
});
