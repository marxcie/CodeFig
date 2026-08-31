const test = require('node:test');
const assert = require('node:assert');
const { marked } = require('marked');
const P = require('../src/canvas-script-payload.js');

test('docsTokensToBlocks maps headings, paragraphs, lists, code, tables, hr', () => {
  const md = [
    '# Title',
    '',
    'Hello **bold** and `code`.',
    '',
    '- one',
    '- two',
    '',
    '```js',
    'foo()',
    '```',
    '',
    '| A | **B** |',
    '| - | - |',
    '| 1 | **2** |',
    '',
    '> quote',
    '',
    '---'
  ].join('\n');
  const blocks = P.docsTokensToBlocks(marked.lexer(md));
  const types = blocks.map((b) => b.type);
  assert.deepEqual(types, [
    'heading',
    'paragraph',
    'list',
    'code',
    'table',
    'blockquote',
    'hr'
  ]);
  assert.equal(blocks[0].depth, 1);
  assert.ok(blocks[1].segments.some((s) => s.bold && s.text === 'bold'));
  assert.ok(blocks[1].segments.some((s) => s.code && s.text === 'code'));
  assert.equal(blocks[2].ordered, false);
  assert.equal(blocks[2].items.length, 2);
  assert.equal(blocks[3].lang, 'js');
  assert.equal(blocks[3].text, 'foo()');
  assert.deepEqual(blocks[4].header[0], [{ text: 'A', bold: false, italic: false, code: false, link: undefined, strike: false }]);
  assert.ok(blocks[4].header[1].some((s) => s.bold && s.text === 'B'));
  assert.ok(blocks[4].rows[0][1].some((s) => s.bold && s.text === '2'));
  assert.ok(!String(JSON.stringify(blocks[4])).includes('**'));
});

test('markdownToDocsBlocks uses marked.lexer', () => {
  const blocks = P.markdownToDocsBlocks('## Sub\n\nBody', marked);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].depth, 2);
  assert.equal(blocks[1].type, 'paragraph');
});

test('docsTokensToBlocks respects MAX_DOC_BLOCKS', () => {
  const lines = [];
  for (let i = 0; i < P.MAX_DOC_BLOCKS + 20; i++) lines.push('# H' + i, '', 'p');
  const blocks = P.docsTokensToBlocks(marked.lexer(lines.join('\n')));
  assert.ok(blocks.length <= P.MAX_DOC_BLOCKS);
});

test('schemaRowsToPanelRows maps common row types and collapses curve', () => {
  const rows = P.schemaRowsToPanelRows([
    { type: 'heading', level: 1, text: 'General' },
    { type: 'paragraph', text: 'Help text' },
    { type: 'divider', section: true },
    { type: 'chips', label: 'Modes', value: ['Light', 'Dark'] },
    {
      type: 'field',
      name: 'steps',
      label: 'Steps',
      inputType: 'text',
      value: '4, 8, 16'
    },
    {
      type: 'field',
      name: 'kind',
      label: 'Kind',
      inputType: 'radio',
      radio: true,
      options: ['a', 'b'],
      value: 'a'
    },
    {
      type: 'field',
      name: 'curve',
      label: 'OKLCH',
      inputType: 'curve',
      value: []
    },
    { type: 'field', name: 'table', label: 'Tokens', inputType: 'rows', value: {} }
  ]);
  assert.equal(rows[0].type, 'heading');
  assert.equal(rows[1].type, 'paragraph');
  assert.equal(rows[2].type, 'divider');
  assert.equal(rows[3].type, 'chips');
  assert.deepEqual(rows[3].chips, ['Light', 'Dark']);
  assert.equal(rows[4].type, 'field');
  assert.equal(rows[4].value, '4, 8, 16');
  assert.equal(rows[5].type, 'field');
  assert.equal(rows[5].radio, true);
  assert.equal(rows[6].type, 'placeholder');
  assert.equal(rows[6].hint, 'Curve editor');
  assert.equal(rows[7].type, 'placeholder');
  assert.equal(rows[7].hint, 'Rows table');
});

test('schemaRowsToPanelRows caps at MAX_PANEL_ROWS', () => {
  const many = [];
  for (let i = 0; i < P.MAX_PANEL_ROWS + 10; i++) {
    many.push({ type: 'heading', level: 2, text: 'H' + i });
  }
  assert.equal(P.schemaRowsToPanelRows(many).length, P.MAX_PANEL_ROWS);
});

test('extractLeadingCommentDocs reads // and /* before config/code', () => {
  const code = [
    '// Distribute spacing (percentage ramp)',
    '// Redistributes gaps between selected siblings.',
    '',
    '// @UI_CONFIG_START',
    'var x = 1;',
    '// @UI_CONFIG_END'
  ].join('\n');
  const docs = P.extractLeadingCommentDocs(code);
  assert.match(docs, /Distribute spacing/);
  assert.match(docs, /Redistributes gaps/);
  assert.doesNotMatch(docs, /@UI_CONFIG/);
});

test('extractLeadingCommentDocs reads block comments', () => {
  const code = '/* Hello\n * world\n */\nfunction f() {}\n';
  assert.equal(P.extractLeadingCommentDocs(code).replace(/\s+/g, ' ').trim(), 'Hello world');
});

test('markdownToDocsBlocks falls back to a paragraph when lexer yields nothing useful', () => {
  const blocks = P.markdownToDocsBlocks('plain line', {
    lexer: function () { return []; }
  });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'paragraph');
});