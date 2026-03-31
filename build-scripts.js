const fs = require('fs');
const path = require('path');
const { inlineVendors } = require('./bundle-ui.js');

const isDev = process.argv.includes('--dev') || process.env.BUILD_DEV === '1';
const DEV_LOCALHOST = 'http://localhost:8765';
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

// No-op: CodeFigUI lib (@codefig-ui.ts) is copied with other scripts by copyScripts()
function copyConfigUILib() {}

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

// Recursively copy all .ts files from scripts/ to dist/scripts/
function copyScripts() {
  const scriptsDir = path.join(__dirname, 'scripts');
  const distScriptsDir = path.join(__dirname, 'dist', 'scripts');
  
  if (!fs.existsSync(scriptsDir)) {
    console.log('⚠️ Scripts directory not found:', scriptsDir);
    return;
  }
  
  // Ensure dist/scripts directory exists
  if (!fs.existsSync(distScriptsDir)) {
    fs.mkdirSync(distScriptsDir, { recursive: true });
  }
  
  let copiedCount = 0;
  
  function copyDirectory(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) {
      return;
    }
    
    const items = fs.readdirSync(srcDir);
    
    for (const item of items) {
      // Skip excluded items
      if (shouldExclude(item)) {
        continue;
      }
      
      const srcPath = path.join(srcDir, item);
      const stat = fs.statSync(srcPath);
      
      if (stat.isDirectory()) {
        // Recursively copy subdirectories, preserving structure
        const destSubDir = path.join(destDir, item);
        
        if (!fs.existsSync(destSubDir)) {
          fs.mkdirSync(destSubDir, { recursive: true });
        }
        
        copyDirectory(srcPath, destSubDir);
      } else if (item.endsWith('.ts') && !shouldExclude(item)) {
        // Copy TypeScript file to same relative location
        const destPath = path.join(destDir, item);
        
        fs.copyFileSync(srcPath, destPath);
        copiedCount++;
      }
    }
  }
  
  // Clean dist/scripts directory first
  if (fs.existsSync(distScriptsDir)) {
    const existingItems = fs.readdirSync(distScriptsDir);
    for (const item of existingItems) {
      const itemPath = path.join(distScriptsDir, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        fs.rmSync(itemPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(itemPath);
      }
    }
  }
  
  // Copy all scripts
  copyDirectory(scriptsDir, distScriptsDir);
  
  console.log(`✅ Copied ${copiedCount} scripts to dist/scripts/`);
}

// Update ui.html (embed scripts as base64-encoded JSON)
function updateUIHtml() {
  const uiTemplatePath = path.join(__dirname, 'src', 'ui.html');
  const uiDistPath = path.join(__dirname, 'dist', 'ui.html');
  const distScriptsDir = path.join(__dirname, 'dist', 'scripts');
  
  if (!fs.existsSync(uiTemplatePath)) {
    console.error('❌ ui.html template not found');
    return;
  }
  
  // Ensure dist directory exists
  const distDir = path.dirname(uiDistPath);
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  // Read all scripts from dist/scripts
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
        
        // Determine type from folder path
        let type = 'prebuilt';
        if (filePath.includes('/HELP/')) {
          type = 'help';
        } else if (filePath.includes('/EXAMPLE_SCRIPTS/') || filePath.includes('/CODEFIG_LIBRARIES/')) {
          type = 'prebuilt';
        }
        
        scripts.push({
          filePath: `scripts/${filePath}`,
          code: code,
          type: type,
          filename: item
        });
      }
    }
  }
  
  readScripts(distScriptsDir);

  // Read src only; inline vendors (CodeMirror, marked) into string; write result only to dist
  let uiContent = fs.readFileSync(uiTemplatePath, 'utf8');
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

// Run the build (vendors inlined only into dist, src/ui.html never modified)
console.log('🔨 Building...' + (isDev ? ' (dev: localhost allowed)' : ' (build: localhost not allowed)'));
writeManifest();
copyScripts();
updateUIHtml();
console.log('✅ Build completed successfully!');
