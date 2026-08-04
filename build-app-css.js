const fs = require('fs');
const path = require('path');

const BLOCK_RE = /<style id="app-css">[\s\S]*?<\/style>/;

/**
 * Inline the app stylesheet into HTML content (string).
 * Does NOT write to src - used by build to produce dist/ui.html only.
 * @param {string} htmlContent - Full HTML from src/ui.html
 * @returns {string} HTML with src/ui.css inlined
 */
function inlineAppCSS(htmlContent) {
  const css = fs.readFileSync(path.join(__dirname, 'src', 'ui.css'), 'utf8');

  if (!BLOCK_RE.test(htmlContent)) {
    throw new Error('app-css block not found in src/ui.html');
  }

  // Use function replacement so the CSS (e.g. a "$&" in a content property) isn't interpreted as a pattern
  return htmlContent.replace(BLOCK_RE, () => '<style id="app-css">\n' + css + '\n</style>');
}

module.exports = { inlineAppCSS };
