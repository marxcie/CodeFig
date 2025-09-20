const fs = require('fs');
const path = require('path');

// Convert filename to display name
function filenameToDisplayName(filename) {
  // Remove .ts extension
  const nameWithoutExt = filename.replace(/\.ts$/, '');
  
  // Replace hyphens and underscores with spaces
  const withSpaces = nameWithoutExt.replace(/[-_]/g, ' ');
  
  // Capitalize only the first letter
  const capitalized = withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
  
  return capitalized;
}

// Get script name from file content or generate from filename
function getScriptName(filePath, filename) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Look for a comment like "// SCRIPT_NAME: Custom Name" in the first few lines
    const lines = content.split('\n').slice(0, 10);
    for (const line of lines) {
      const match = line.match(/\/\/\s*SCRIPT_NAME:\s*(.+)/i);
      if (match) {
        return match[1].trim();
      }
    }
    
    // Look for a comment like "// CUSTOM SCRIPT NAME" as the first non-empty line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.startsWith('//')) {
        const commentContent = trimmed.replace(/^\/\/\s*/, '').trim();
        // Skip if it contains equals signs (section headers like === GEOMETRY ===)
        if (commentContent.includes('===') || commentContent.includes('==')) {
          continue;
        }
        // If it looks like a title (not a regular comment), use it as-is
        if (commentContent.length > 0 && !commentContent.toLowerCase().includes('execute') && 
            !commentContent.toLowerCase().includes('import') && 
            !commentContent.toLowerCase().includes('function') &&
            !commentContent.toLowerCase().includes('collection of')) {
          return commentContent;
        }
      }
    }
  } catch (error) {
    console.log(`Warning: Could not read file ${filePath}: ${error.message}`);
  }
  
  // Fall back to filename-based name
  return filenameToDisplayName(filename);
}

// Get category type from folder name
function getCategoryType(folderName) {
  const folderLower = folderName.toLowerCase();
  if (folderLower === 'help') {
    return 'help';
  } else if (folderLower === 'example_scripts' || folderLower === 'examples') {
    return 'prebuilt';
  } else {
    return 'user'; // Default for any other folders
  }
}

// Recursively find all .ts files in the scripts directory
function findAllScripts(scriptsDir) {
  const scripts = [];
  
  function scanDirectory(dir, relativePath = '') {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Recursively scan subdirectories
        const newRelativePath = relativePath ? `${relativePath}/${item}` : item;
        scanDirectory(itemPath, newRelativePath);
      } else if (item.endsWith('.ts')) {
        // Found a TypeScript file
        const folderName = relativePath.split('/')[0] || 'EXAMPLE_SCRIPTS'; // Default category
        const scriptName = getScriptName(itemPath, item);
        const scriptType = getCategoryType(folderName);
        
        scripts.push({
          name: scriptName,
          code: fs.readFileSync(itemPath, 'utf8'),
          type: scriptType,
          filename: item,
          folder: folderName
        });
      }
    }
  }
  
  if (fs.existsSync(scriptsDir)) {
    scanDirectory(scriptsDir);
  }
  
  return scripts;
}

// Read all script files and generate the prebuiltScripts array
function buildScripts() {
  const scriptsDir = path.join(__dirname, 'src', 'scripts');
  const scripts = findAllScripts(scriptsDir);
  
  if (scripts.length === 0) {
    console.log('⚠️ No scripts found in', scriptsDir);
    return [];
  }
  
  // Sort scripts by type and name
  scripts.sort((a, b) => {
    // Help scripts first, then prebuilt, then user
    const typeOrder = { help: 0, prebuilt: 1, user: 2 };
    const aOrder = typeOrder[a.type] || 3;
    const bOrder = typeOrder[b.type] || 3;
    
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    
    // Within same type, sort by name
    return a.name.localeCompare(b.name);
  });
  
  console.log(`📦 Loaded ${scripts.length} scripts`);
  scripts.forEach(script => {
    console.log(`✅ Loaded: ${script.name} (${script.filename}) [${script.type}]`);
  });
  
  return scripts;
}

// Update ui.html with the built scripts
function updateUIHtml() {
  const scripts = buildScripts();
  const uiTemplatePath = path.join(__dirname, 'src', 'ui.html');
  const uiDistPath = path.join(__dirname, 'dist', 'ui.html');
  
  if (!fs.existsSync(uiTemplatePath)) {
    console.error('❌ ui.html template not found');
    return;
  }
  
  console.log('📋 Using template for ui.html');
  
  let uiContent = fs.readFileSync(uiTemplatePath, 'utf8');
  
  // Generate the scripts array
  const scriptsArrayString = JSON.stringify(scripts, null, 2);
  
  // Replace the placeholder
  const placeholder = '// PLACEHOLDER_FOR_SCRIPTS';
  if (uiContent.includes(placeholder)) {
    uiContent = uiContent.replace(placeholder, scriptsArrayString.slice(1, -1)); // Remove outer brackets
    console.log('✅ Replaced scripts placeholder');
  } else {
    console.log('⚠️ Scripts placeholder not found in ui.html');
  }
  
  // Ensure dist directory exists
  const distDir = path.dirname(uiDistPath);
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  // Write the updated ui.html to dist
  fs.writeFileSync(uiDistPath, uiContent);
  console.log('✅ Updated ui.html with bundled scripts');
}

// Run the build
console.log('🔨 Building scripts...');
updateUIHtml();
console.log('✅ Build completed successfully!');