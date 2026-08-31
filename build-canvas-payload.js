/**
 * Inline `src/canvas-script-payload.js` into `src/ui.html`'s canvas-payload stub
 * as `window.CodeFigCanvasPayload` — same pattern as build-bezier.js.
 */
const fs = require('fs');
const path = require('path');

const BLOCK_RE = /<script id="canvas-payload-js">[\s\S]*?<\/script>/;
const EXPORTS = [
  'docsTokensToBlocks',
  'schemaRowsToPanelRows',
  'markdownToDocsBlocks',
  'extractLeadingCommentDocs',
  'stringifyPanelValue',
  'MAX_DOC_BLOCKS',
  'MAX_PANEL_ROWS'
];

function escapeScriptContent(s) {
  return String(s).replace(/<\/script/gi, '<\\/script');
}

function inlineCanvasPayload(htmlContent) {
  const srcPath = path.join(__dirname, 'src', 'canvas-script-payload.js');
  if (!fs.existsSync(srcPath)) {
    throw new Error('src/canvas-script-payload.js missing');
  }
  if (!BLOCK_RE.test(htmlContent)) {
    throw new Error('canvas-payload-js block not found in src/ui.html');
  }
  const body = fs.readFileSync(srcPath, 'utf8');
  const wrapped =
    '(function () {\n' +
    '  var module = { exports: {} };\n' +
    '  var exports = module.exports;\n' +
    body +
    '\n  var api = module.exports;\n' +
    '  window.CodeFigCanvasPayload = {\n' +
    EXPORTS.map(function (name) {
      return '    ' + name + ': api.' + name;
    }).join(',\n') +
    '\n  };\n' +
    '})();';
  return htmlContent.replace(
    BLOCK_RE,
    () => '<script id="canvas-payload-js">\n' + escapeScriptContent(wrapped) + '\n</script>'
  );
}

module.exports = { inlineCanvasPayload };
