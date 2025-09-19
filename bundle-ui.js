const fs = require('fs');
const path = require('path');

function bundleCodeMirror() {
  console.log('📦 Bundling CodeMirror for offline use...');
  
  // Read CodeMirror files from node_modules
  const codemirrorPath = path.join(__dirname, 'node_modules', 'codemirror');
  
  const codemirrorCSS = fs.readFileSync(path.join(codemirrorPath, 'lib', 'codemirror.css'), 'utf8');
  const codemirrorJS = fs.readFileSync(path.join(codemirrorPath, 'lib', 'codemirror.js'), 'utf8');
  const javascriptModeJS = fs.readFileSync(path.join(codemirrorPath, 'mode', 'javascript', 'javascript.js'), 'utf8');
  
  // Read the current ui.html
  let uiContent = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
  
  // Replace CDN links with inline content
  uiContent = uiContent.replace(
    /<link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/5\.65\.2\/codemirror\.min\.css">/,
    `<style>\n/* CodeMirror CSS */\n${codemirrorCSS}\n</style>`
  );
  
  uiContent = uiContent.replace(
    /<link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/5\.65\.2\/theme\/default\.min\.css">/,
    '<!-- Default theme is included in main CSS -->'
  );
  
  uiContent = uiContent.replace(
    /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/5\.65\.2\/codemirror\.min\.js"><\/script>/,
    `<script>\n/* CodeMirror JS */\n${codemirrorJS}\n</script>`
  );
  
  uiContent = uiContent.replace(
    /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/codemirror\/5\.65\.2\/mode\/javascript\/javascript\.min\.js"><\/script>/,
    `<script>\n/* CodeMirror JavaScript Mode */\n${javascriptModeJS}\n</script>`
  );
  
  // Write the updated ui.html
  fs.writeFileSync(path.join(__dirname, 'ui.html'), uiContent, 'utf8');
  
  console.log('✅ CodeMirror bundled successfully - no network access required!');
}

// Run if called directly
if (require.main === module) {
  bundleCodeMirror();
}

module.exports = { bundleCodeMirror };
