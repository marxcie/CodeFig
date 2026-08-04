const fs = require('fs');
const path = require('path');
const { escapeScriptContent } = require('./build-utils.js');

const FILES = ['parser.js', 'renderer.js', 'controller.js', 'bridge.js'];
const BLOCK_RE = /<script id="config-ui-js">[\s\S]*?<\/script>/;

/**
 * Inline the config-ui bundle into HTML content (string).
 * Does NOT write to src - used by build to produce dist/ui.html only.
 * @param {string} htmlContent - Full HTML from src/ui.html
 * @returns {string} HTML with the config-ui bundle inlined
 */
function inlineConfigUI(htmlContent) {
  const dir = path.join(__dirname, 'src', 'config-ui');
  const bundle = FILES.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim()).join('\n');

  if (!BLOCK_RE.test(htmlContent)) {
    throw new Error('config-ui-js block not found in src/ui.html');
  }

  // Use function replacement so bundled code (e.g. "$&" in a regex) isn't interpreted as a pattern
  return htmlContent.replace(
    BLOCK_RE,
    () => '<script id="config-ui-js">\n' + escapeScriptContent(bundle) + '\n</script>'
  );
}

module.exports = { inlineConfigUI };
