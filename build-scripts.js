const fs = require('fs');
const path = require('path');

// Script configuration - maps file names to display names and types
const scriptConfig = {
  'prebuilt': {
    'rename-styles.ts': { name: 'Rename Styles', type: 'prebuilt' },
    'auto-layout-all-selected.ts': { name: 'Auto Layout All Selected', type: 'prebuilt' },
    'frame-all-selected.ts': { name: 'Frame All Selected', type: 'prebuilt' },
    'remove-auto-layout-recursively.ts': { name: 'Remove Auto Layout Recursively', type: 'prebuilt' },
    'detach-styles.ts': { name: 'Detach Styles', type: 'prebuilt' },
    'scale-selection.ts': { name: 'Scale Selection', type: 'prebuilt' },
    'find-and-replace-styles.ts': { name: 'Find and Replace Styles', type: 'prebuilt' },
    'replace-variable-bindings.ts': { name: 'Replace Variable Bindings', type: 'prebuilt' },
    'find-broken-variables.ts': { name: 'Find Broken Variables', type: 'prebuilt' },
    'duplicate-variable-collection.ts': { name: 'Duplicate Variable Collection', type: 'prebuilt' },
    'list-all-variables.ts': { name: 'List All Variables', type: 'prebuilt' },
    'list-all-styles.ts': { name: 'List All Styles', type: 'prebuilt' },
    'utility-functions.ts': { name: 'Utility Functions', type: 'prebuilt' },
  },
  'examples': {
    'help-documentation.ts': { name: 'Help & Documentation', type: 'help' },
  }
};

// Read all script files and generate the prebuiltScripts array
function buildScripts() {
  const scripts = [];
  
  // Process each category
  Object.entries(scriptConfig).forEach(([category, files]) => {
    const categoryPath = path.join(__dirname, 'scripts', category);
    
    if (!fs.existsSync(categoryPath)) {
      console.log(`Warning: Directory ${categoryPath} does not exist`);
      return;
    }
    
    Object.entries(files).forEach(([filename, config]) => {
      const filePath = path.join(categoryPath, filename);
      
      if (fs.existsSync(filePath)) {
        const code = fs.readFileSync(filePath, 'utf8');
        scripts.push({
          name: config.name,
          type: config.type,
          code: code
        });
        console.log(`✅ Loaded: ${config.name} (${filename})`);
      } else {
        console.log(`⚠️  Missing: ${filename} in ${category}/`);
      }
    });
  });
  
  return scripts;
}

// Generate JavaScript code for the prebuiltScripts array
function generateScriptsJS(scripts) {
  const scriptsJS = scripts.map(script => {
    // Escape backticks and ${} in the code
    const escapedCode = script.code
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\${/g, '\\${');
    
    return `        {
          name: "${script.name}",
          type: "${script.type}",
          code: \`${escapedCode}\`
        }`;
  }).join(',\n');
  
  return `      // Pre-built scripts
      const prebuiltScripts = [
${scriptsJS}
      ];`;
}

// Update ui.html with the generated scripts
function updateUIHtml(scriptsJS) {
  const templatePath = path.join(__dirname, 'ui-template.html');
  const uiHtmlPath = path.join(__dirname, 'ui.html');
  
  // Use template if ui.html is corrupted or missing
  let content;
  try {
    content = fs.readFileSync(uiHtmlPath, 'utf8');
    // Check if ui.html is corrupted (starts with weird content)
    if (!content.startsWith('<!doctype html>')) {
      throw new Error('ui.html appears to be corrupted');
    }
  } catch (error) {
    console.log('⚠️  Using template due to corrupted ui.html');
    content = fs.readFileSync(templatePath, 'utf8');
  }
  
  // Find the scripts placeholder and replace it
  const placeholder = '        // PLACEHOLDER_FOR_SCRIPTS';
  
  if (content.includes(placeholder)) {
    // Replace placeholder with actual scripts
    content = content.replace(placeholder, scriptsJS.trim());
  } else {
    // Fallback: try to find the prebuiltScripts array
    const startMarker = '      // Pre-built scripts';
    const endMarker = '      ];';
    
    const startIndex = content.indexOf(startMarker);
    if (startIndex === -1) {
      throw new Error('Could not find scripts placeholder or marker in ui.html');
    }
    
    const endIndex = content.indexOf(endMarker, startIndex);
    if (endIndex === -1) {
      throw new Error('Could not find prebuiltScripts end marker in ui.html');
    }
    
    // Replace the section
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex + endMarker.length);
    content = before + scriptsJS + '\n' + after;
  }
  
  fs.writeFileSync(uiHtmlPath, content, 'utf8');
  console.log('✅ Updated ui.html with bundled scripts');
}

// Main build function
function build() {
  console.log('🔨 Building scripts...');
  
  try {
    const scripts = buildScripts();
    console.log(`📦 Loaded ${scripts.length} scripts`);
    
    const scriptsJS = generateScriptsJS(scripts);
    updateUIHtml(scriptsJS);
    
    console.log('✅ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run build if called directly
if (require.main === module) {
  build();
}

module.exports = { build };
