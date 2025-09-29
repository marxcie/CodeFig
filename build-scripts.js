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

// Get script name and metadata from file content
function getScriptMetadata(filePath, filename) {
  const metadata = {
    name: filenameToDisplayName(filename),
    shared: false
  };
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').slice(0, 20); // Check more lines for metadata
    
    for (const line of lines) {
      // Look for script name
      const nameMatch = line.match(/\/\/\s*SCRIPT_NAME:\s*(.+)/i);
      if (nameMatch) {
        metadata.name = nameMatch[1].trim();
        continue;
      }
      
      // Look for shared flag (not commented out)
      const sharedMatch = line.match(/^\s*var\s+shared\s*=\s*(true|false)/);
      if (sharedMatch) {
        metadata.shared = sharedMatch[1] === 'true';
        continue;
      }
      
      // Look for title comment as first non-empty line
      const trimmed = line.trim();
      if (trimmed && trimmed.startsWith('//') && !metadata.nameFromComment) {
        const commentContent = trimmed.replace(/^\/\/\s*/, '').trim();
        // Skip section headers and common patterns
        if (!commentContent.includes('===') && !commentContent.includes('==') &&
            !commentContent.toLowerCase().includes('execute') && 
            !commentContent.toLowerCase().includes('import') && 
            !commentContent.toLowerCase().includes('function') &&
            !commentContent.toLowerCase().includes('collection of') &&
            commentContent.length > 0) {
          metadata.name = commentContent;
          metadata.nameFromComment = true;
        }
      }
    }
  } catch (error) {
    console.log(`Warning: Could not read file ${filePath}: ${error.message}`);
  }
  
  return metadata;
}

// Legacy function for backwards compatibility
function getScriptName(filePath, filename) {
  return getScriptMetadata(filePath, filename).name;
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
        const metadata = getScriptMetadata(itemPath, item);
        const scriptType = getCategoryType(folderName);
        
        // Add "Example Scripts / " prefix to prebuilt scripts to demonstrate grouping
        const displayName = scriptType === 'prebuilt' ? `Example Scripts / ${metadata.name}` : metadata.name;
        
        const scriptCode = fs.readFileSync(itemPath, 'utf8');
        
        scripts.push({
          name: displayName,
          code: scriptCode,
          type: scriptType,
          filename: item,
          folder: folderName,
          shared: metadata.shared,
          filePath: itemPath
        });
      }
    }
  }
  
  if (fs.existsSync(scriptsDir)) {
    scanDirectory(scriptsDir);
  }
  
  return scripts;
}

// Parse and extract functions from library scripts
function extractFunctions(code) {
  const functions = new Map();
  
  // Match function declarations: function name() { ... }
  const functionRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/g;
  let match;
  
  while ((match = functionRegex.exec(code)) !== null) {
    const functionName = match[1];
    const startIndex = match.index;
    
    // Find the complete function by counting braces
    let braceCount = 0;
    let i = startIndex;
    let inString = false;
    let stringChar = '';
    
    while (i < code.length) {
      const char = code[i];
      
      if (!inString) {
        if (char === '"' || char === "'" || char === '`') {
          inString = true;
          stringChar = char;
        } else if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            break;
          }
        }
      } else {
        if (char === stringChar && code[i-1] !== '\\') {
          inString = false;
        }
      }
      i++;
    }
    
    if (braceCount === 0) {
      const functionCode = code.substring(startIndex, i + 1);
      functions.set(functionName, functionCode);
    }
  }
  
  return functions;
}

// Process @import statements in scripts
function processImports(scripts) {
  // Build function library from all scripts
  const functionLibrary = new Map();
  const libraryScripts = scripts.filter(script => 
    script.filename === '@core-library.ts' || 
    script.filename === '@custom-helpers.ts' ||
    script.filename === '@math-helpers.ts'
  );
  
  libraryScripts.forEach(script => {
    console.log(`📚 Extracting functions from ${script.name}`);
    const functions = extractFunctions(script.code);
    console.log(`   Found functions: ${Array.from(functions.keys()).join(', ')}`);
    functions.forEach((code, name) => {
      functionLibrary.set(name, {
        code: code,
        source: script.name
      });
    });
  });
  
  console.log(`📋 Function library built with ${functionLibrary.size} functions`);
  
  // Process each script for @import statements
  const processedScripts = scripts.map(script => {
    let processedCode = script.code;
    const imports = [];
    
    // Find @import statements
    const importRegex = /@import\s+\{([^}]+)\}/g;
    let match;
    
    while ((match = importRegex.exec(script.code)) !== null) {
      const importList = match[1];
      const functionNames = importList.split(',').map(name => name.trim());
      
      functionNames.forEach(functionName => {
        if (functionLibrary.has(functionName)) {
          const func = functionLibrary.get(functionName);
          imports.push({
            name: functionName,
            code: func.code,
            source: func.source
          });
        } else {
          console.log(`⚠️ Function '${functionName}' not found in library`);
        }
      });
    }
    
    if (imports.length > 0) {
      console.log(`🔗 ${script.name}: importing ${imports.length} functions`);
      
      // Remove @import statements
      processedCode = processedCode.replace(/@import\s+\{[^}]+\}/g, '');
      
      // Add imported functions at the top
      const importedCode = imports.map(imp => 
        `// Imported from ${imp.source}\n${imp.code}\n`
      ).join('\n');
      
      processedCode = importedCode + '\n' + processedCode;
    }
    
    return {
      ...script,
      code: processedCode
    };
  });
  
  return processedScripts;
}

// Read all script files and generate the prebuiltScripts array
function buildScripts() {
  const scriptsDir = path.join(__dirname, 'src', 'scripts');
  const allScripts = findAllScripts(scriptsDir);
  
  if (allScripts.length === 0) {
    console.log('⚠️ No scripts found in', scriptsDir);
    return [];
  }
  
  // Skip build-time import processing - let runtime handle it
  const scripts = allScripts;
  
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
  
  console.log(`📦 Built ${scripts.length} scripts (${allScripts.filter(s => s.shared).length} shared libraries injected)`);
  scripts.forEach(script => {
    console.log(`✅ Built: ${script.name} (${script.filename}) [${script.type}]`);
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