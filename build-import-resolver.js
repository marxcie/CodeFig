const fs = require('fs');
const path = require('path');
const { escapeScriptContent } = require('./build-utils.js');

const BLOCK_RE = /<script id="import-resolver-js">[\s\S]*?<\/script>/;

/**
 * Inline src/import-resolver.js into HTML content (string).
 * Does NOT write to src - used by build to produce dist/ui.html only.
 *
 * The block must stay ahead of the main app script: the UI reaches the resolver
 * through the CodeFigImports global, and runCurrentScript() throws if it is missing.
 * @param {string} htmlContent - Full HTML from src/ui.html
 * @returns {string} HTML with the resolver inlined
 */
function inlineImportResolver(htmlContent) {
  const source = fs.readFileSync(path.join(__dirname, 'src', 'import-resolver.js'), 'utf8').trim();

  if (!BLOCK_RE.test(htmlContent)) {
    throw new Error('import-resolver-js block not found in src/ui.html');
  }

  // Use function replacement so the resolver's regexes (e.g. "$&") aren't read as patterns
  return htmlContent.replace(
    BLOCK_RE,
    () => '<script id="import-resolver-js">\n' + escapeScriptContent(source) + '\n</script>'
  );
}

module.exports = { inlineImportResolver };
