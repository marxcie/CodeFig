const fs = require('fs');
const path = require('path');
const { inlineVendors } = require('./bundle-ui.js');
const { inlineConfigUI } = require('./build-config-ui.js');
const { inlineImportResolver } = require('./build-import-resolver.js');
const { inlineAppCSS } = require('./build-app-css.js');

const isDev = process.argv.includes('--dev') || process.env.BUILD_DEV === '1';
const DEV_LOCALHOST = 'http://localhost:8765';
const FIGMA_CONSOLE_LOG = path.join(__dirname, 'figma-console.log');

function clearFigmaConsoleLog() {
  try {
    fs.writeFileSync(FIGMA_CONSOLE_LOG, '', 'utf8');
  } catch {
    // ignore if log file can't be cleared
  }
}
/** Required for bundled scripts that call the Figma REST API (e.g. comments-to-annotations). */
const FIGMA_API = 'https://api.figma.com';

function hasFigmaApiDomain(domains) {
  const norm = (d) => String(d).replace(/\/$/, '').toLowerCase();
  const target = norm(FIGMA_API);
  return domains.some((d) => norm(d) === target);
}

// dist/manifest.json from the src/manifest.json template: dev adds localhost, production strips
// it, and https://api.figma.com is guaranteed either way. src/manifest.json is never written to —
// that is the whole point, so builds leave the git tree clean.
function writeManifest() {
  const srcPath = path.join(__dirname, 'src', 'manifest.json');
  const distPath = path.join(__dirname, 'dist', 'manifest.json');
  if (!fs.existsSync(srcPath)) {
    // Without it there is no dist/manifest.json and the plugin cannot be imported at all,
    // so fail loudly rather than shipping a dist/ that Figma refuses to load.
    console.error('❌ src/manifest.json not found — cannot generate dist/manifest.json');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  if (manifest.networkAccess && Array.isArray(manifest.networkAccess.allowedDomains)) {
    let domains = manifest.networkAccess.allowedDomains.filter((d) => !/localhost/i.test(d));
    if (!hasFigmaApiDomain(domains)) {
      domains = [FIGMA_API, ...domains];
    }
    if (isDev) {
      domains = [...domains, DEV_LOCALHOST];
    }
    manifest.networkAccess.allowedDomains = domains;
  }
  fs.mkdirSync(path.dirname(distPath), { recursive: true });
  fs.writeFileSync(distPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    isDev
      ? `✅ dist/manifest.json: dev mode (Figma API + ${DEV_LOCALHOST})`
      : '✅ dist/manifest.json: production (Figma API, no localhost)'
  );
}

// Check if a file/folder should be excluded
function shouldExclude(name) {
  // Exclude files/folders starting with _ or .
  if (name.startsWith('_') || name.startsWith('.')) {
    return true;
  }
  // Exclude backup files
  if (name.match(/\.(bak\d*|backup|old|tmp)\.js$/i)) {
    return true;
  }
  return false;
}

// Update ui.html (embed scripts as base64-encoded JSON)
function updateUIHtml() {
  const uiTemplatePath = path.join(__dirname, 'src', 'ui.html');
  const uiDistPath = path.join(__dirname, 'dist', 'ui.html');
  const scriptsDir = path.join(__dirname, 'scripts');

  if (!fs.existsSync(uiTemplatePath)) {
    console.error('❌ ui.html template not found');
    return;
  }
  
  // Ensure dist directory exists
  const distDir = path.dirname(uiDistPath);
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  // Read all scripts straight from the source tree. The plugin never reads loose
  // .js files (no filesystem in the sandbox) — this base64 blob is their only
  // consumer, so nothing is copied into dist/.
  const scripts = [];
  
  function readScripts(dir, relativePath = '') {
    if (!fs.existsSync(dir)) {
      return;
    }
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      if (shouldExclude(item)) {
        continue;
      }
      
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        const newRelativePath = relativePath ? `${relativePath}/${item}` : item;
        readScripts(itemPath, newRelativePath);
      } else if (item.endsWith('.js') && !shouldExclude(item)) {
        const filePath = relativePath ? `${relativePath}/${item}` : item;
        const code = fs.readFileSync(itemPath, 'utf8');
        
        // Determine type from the top-level folder under scripts/. filePath is
        // relative to scripts/, so it has no leading slash to match on; matching
        // the folder name is also what validate-scripts.js getCategoryType() does.
        // Everything that is not HELP/ is prebuilt, so new folders become
        // prebuilt categories.
        const topFolder = filePath.split('/')[0].toLowerCase();
        const type = topFolder === 'help' ? 'help' : 'prebuilt';

        scripts.push({
          filePath: `scripts/${filePath}`,
          code: code,
          type: type,
          filename: item
        });
      }
    }
  }
  
  readScripts(scriptsDir);

  // Read src only; inline the config-ui bundle, the @import resolver, the app
  // stylesheet and vendors (CodeMirror, marked) into the string; write result only
  // to dist. Vendors go last: inlineVendors injects CodeMirror, which carries
  // </script>-like strings and turns the head <link> tags into <style> elements, so
  // the other regexes stay on a small document with exactly one match each.
  let uiContent = fs.readFileSync(uiTemplatePath, 'utf8');
  uiContent = inlineConfigUI(uiContent);
  uiContent = inlineImportResolver(uiContent);
  uiContent = inlineAppCSS(uiContent);
  uiContent = inlineVendors(uiContent);
  
  // Inject build flags (dev vs production) into the UI bundle.
  // In dev builds, localhost console forwarding is allowed (dist/manifest.json includes it).
  // In production builds, localhost is absent from dist/manifest.json and the UI must not reach for it.
  uiContent = uiContent.replace(/__CODEFIG_BUILD_IS_DEV__/g, isDev ? 'true' : 'false');

  // Inline Buy Me a Coffee brand SVG (src/bmc-button.svg) into footer button
  const bmcSvgPath = path.join(__dirname, 'src', 'bmc-button.svg');
  if (fs.existsSync(bmcSvgPath) && uiContent.includes('<!-- INLINE_BMC_SVG -->')) {
    let bmcSvg = fs.readFileSync(bmcSvgPath, 'utf8').trim();
    bmcSvg = bmcSvg.replace(
      /<svg(\s)/,
      '<svg class="bmc-btn__svg" focusable="false" aria-hidden="true"$1'
    );
    bmcSvg = bmcSvg.replace(/\s*width="[^"]*"/, '').replace(/\s*height="[^"]*"/, '');
    uiContent = uiContent.replace('<!-- INLINE_BMC_SVG -->', bmcSvg);
  }

  // Embed scripts as base64-encoded JSON in a script tag (imports will be processed at runtime)
  const scriptsJson = JSON.stringify(scripts);
  const scriptsBase64 = Buffer.from(scriptsJson, 'utf8').toString('base64');
  const scriptsScript = `<script id="scripts-data" type="application/json" data-encoding="base64">${scriptsBase64}</script>`;
  
  // Insert the scripts script before the closing </body> tag or at the end of <head>
  if (uiContent.includes('</head>')) {
    uiContent = uiContent.replace('</head>', `${scriptsScript}\n</head>`);
  } else if (uiContent.includes('</body>')) {
    uiContent = uiContent.replace('</body>', `${scriptsScript}\n</body>`);
  } else {
    // If no body tag, append at the end
    uiContent += scriptsScript;
  }
  
  // Write the updated ui.html to dist
  fs.writeFileSync(uiDistPath, uiContent);
  console.log(`✅ dist/ui.html (${scripts.length} scripts, vendors inlined)`);
}

// Run the build (vendors inlined into dist/ui.html from src/ui.html)
console.log('🔨 Building...' + (isDev ? ' (dev: localhost allowed)' : ' (build: localhost not allowed)'));
clearFigmaConsoleLog();
writeManifest();
updateUIHtml();
console.log('✅ Build completed successfully!');
