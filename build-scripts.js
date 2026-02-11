const fs = require('fs');
const path = require('path');
const { inlineVendors } = require('./bundle-ui.js');

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
console.log('🔨 Building...');
copyScripts();
updateUIHtml();
console.log('✅ Build completed successfully!');
