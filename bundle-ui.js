const fs = require('fs');
const path = require('path');

/**
 * Escape script content for safe embedding inside <script> in HTML.
 * </script> -> <\/script> so the HTML parser doesn't close the tag.
 */
function escapeScriptContent(js) {
  return js.replace(/<\/script>/gi, '<\\/script>');
}

/**
 * Inline CodeMirror and marked into HTML content (string).
 * Does NOT write to src - used by build to produce dist/ui.html only.
 * @param {string} htmlContent - Full HTML from src/ui.html
 * @returns {string} HTML with vendors inlined
 */
function inlineVendors(htmlContent) {
  const codemirrorPath = path.join(__dirname, 'node_modules', 'codemirror');
  let out = htmlContent;

  // CodeMirror CSS
  const codemirrorCSS = fs.readFileSync(path.join(codemirrorPath, 'lib', 'codemirror.css'), 'utf8');
  const midnightCSS = fs.readFileSync(path.join(codemirrorPath, 'theme', 'midnight.css'), 'utf8');

  out = out.replace(
    /<link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/5\.65\.2\/codemirror\.min\.css">/,
    '<style>\n/* CodeMirror base */\n' + codemirrorCSS + '\n</style>'
  );
  out = out.replace(
    /<link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/5\.65\.2\/theme\/default\.min\.css">/,
    '<!-- default theme: light -->'
  );
  out = out.replace(
    /<link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/5\.65\.2\/theme\/midnight\.min\.css">/,
    '<style>\n/* CodeMirror midnight */\n' + midnightCSS + '\n</style>'
  );

  // CodeMirror JS (escape </script> so it doesn't close the script tag in HTML)
  const codemirrorJS = escapeScriptContent(fs.readFileSync(path.join(codemirrorPath, 'lib', 'codemirror.js'), 'utf8'));
  const javascriptModeJS = escapeScriptContent(fs.readFileSync(path.join(codemirrorPath, 'mode', 'javascript', 'javascript.js'), 'utf8'));

  // Use function replacement so inlined code (e.g. "cm-$&" in CodeMirror) isn't interpreted as $&
  out = out.replace(
    /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/5\.65\.2\/codemirror\.min\.js"><\/script>/,
    () => '<script>\n/* CodeMirror */\n' + codemirrorJS + '\n</script>'
  );
  out = out.replace(
    /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/5\.65\.2\/mode\/javascript\/javascript\.min\.js"><\/script>/,
    () => '<script>\n/* CodeMirror JS mode */\n' + javascriptModeJS + '\n</script>'
  );

  // marked.js (optional - if placeholder exists and package installed)
  const markedPath = path.join(__dirname, 'node_modules', 'marked', 'lib', 'marked.umd.js');
  if (fs.existsSync(markedPath) && out.includes('<!-- INLINE_MARKED -->')) {
    const markedJS = escapeScriptContent(fs.readFileSync(markedPath, 'utf8'));
    out = out.replace('<!-- INLINE_MARKED -->', () => '<script>\n/* marked */\n' + markedJS + '\n</script>');
  }

  return out;
}

if (require.main === module) {
  const srcPath = path.join(__dirname, 'src', 'ui.html');
  const distPath = path.join(__dirname, 'dist', 'ui.html');
  if (!fs.existsSync(srcPath)) {
    console.error('src/ui.html not found');
    process.exit(1);
  }
  const distDir = path.dirname(distPath);
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  const html = fs.readFileSync(srcPath, 'utf8');
  fs.writeFileSync(distPath, inlineVendors(html), 'utf8');
  console.log('Wrote dist/ui.html with inlined vendors');
}

module.exports = { inlineVendors };
