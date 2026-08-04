const fs = require('fs');
const path = require('path');
const { inlineVendors } = require('./bundle-ui.js');
const { inlineConfigUI } = require('./build-config-ui.js');

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

// Write manifest.json: dev adds localhost; production strips localhost and keeps https://api.figma.com
function writeManifest() {
  const manifestPath = path.join(__dirname, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.networkAccess || !Array.isArray(manifest.networkAccess.allowedDomains)) return;
  const domains = manifest.networkAccess.allowedDomains;
  if (isDev) {
    let next = [...domains];
    if (!hasFigmaApiDomain(next)) {
      next = [FIGMA_API, ...next];
    }
    if (!next.includes(DEV_LOCALHOST)) {
      next = [...next, DEV_LOCALHOST];
    }
    if (JSON.stringify(next) !== JSON.stringify(domains)) {
      manifest.networkAccess.allowedDomains = next;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      console.log('✅ manifest.json: dev mode (Figma API +', DEV_LOCALHOST + ')');
    }
  } else {
    let next = domains.filter((d) => !/localhost/i.test(d));
    if (!hasFigmaApiDomain(next)) {
      next = [FIGMA_API, ...next];
    }
    if (JSON.stringify(next) !== JSON.stringify(domains)) {
      manifest.networkAccess.allowedDomains = next;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      console.log('✅ manifest.json: production (Figma API, no localhost)');
    }
  }
}

// Check if a file/folder should be excluded
function shouldExclude(name) {
  // Exclude files/folders starting with _ or .
  if (name.startsWith('_') || name.startsWith('.')) {
    return true;
  }
  // Exclude backup files
  if (name.match(/\.(bak\d*|backup|old|tmp)\.ts$/i)) {
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
  // .ts files (no filesystem in the sandbox) — this base64 blob is their only
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
      } else if (item.endsWith('.ts') && !shouldExclude(item)) {
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

  // Read src only; inline the config-ui bundle and vendors (CodeMirror, marked) into the
  // string; write result only to dist. config-ui goes first: inlineVendors injects CodeMirror,
  // which carries </script>-like strings, so the config-ui regex stays on a small document.
  let uiContent = fs.readFileSync(uiTemplatePath, 'utf8');
  uiContent = inlineConfigUI(uiContent);
  uiContent = inlineVendors(uiContent);
  
  // Inject build flags (dev vs production) into the UI bundle.
  // In dev builds, localhost console forwarding is allowed (manifest.json includes it).
  // In production builds, localhost is removed from manifest.json and UI must not try to reach it.
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
