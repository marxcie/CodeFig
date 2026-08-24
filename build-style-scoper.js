const fs = require('fs');
const path = require('path');
const { escapeScriptContent } = require('./build-utils.js');

const BLOCK_RE = /<script id="style-scoper-js">[\s\S]*?<\/script>/;

/**
 * Inline src/style-scoper.js into HTML content (string).
 * Does NOT write to src - used by build to produce dist/ui.html only.
 *
 * Ahead of the main app script: the injector reaches the scoper through the
 * CodeFigStyleScoper global. See .plans/30-scoped-stylesheets.md.
 * @param {string} htmlContent - Full HTML from src/ui.html
 * @returns {string} HTML with the scoper inlined
 */
function inlineStyleScoper(htmlContent) {
  const source = fs.readFileSync(path.join(__dirname, 'src', 'style-scoper.js'), 'utf8').trim();

  if (!BLOCK_RE.test(htmlContent)) {
    throw new Error('style-scoper-js block not found in src/ui.html');
  }

  return htmlContent.replace(
    BLOCK_RE,
    () => '<script id="style-scoper-js">\n' + escapeScriptContent(source) + '\n</script>'
  );
}

module.exports = { inlineStyleScoper };
