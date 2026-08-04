const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Single implementation of @import parsing and function extraction, shared with the
// UI at run time (inlined into dist/ui.html). Do not re-implement either here.
const { findImports, extractFunctionMap } = require('./src/import-resolver.js');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

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
        const isDocOrConfigMarker =
          commentContent.startsWith('@DOC_') || commentContent.startsWith('@UI_CONFIG');
        // Skip doc/config markers (@Variables / @Core Library titles are OK)
        if (commentContent.length > 0 &&
            !isDocOrConfigMarker &&
            !commentContent.startsWith('#') &&
            !commentContent.includes('===') && !commentContent.includes('==') &&
            !commentContent.toLowerCase().includes('execute') &&
            !commentContent.toLowerCase().includes('function') &&
            !commentContent.toLowerCase().includes('collection of')) {
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

// Get category type from folder name
function getCategoryType(folderName) {
  const folderLower = folderName.toLowerCase();
  if (folderLower === 'help') {
    return 'help';
  } else if (folderLower === 'example_scripts' || folderLower === 'examples' || folderLower === 'codefig_libraries') {
    return 'prebuilt';
  } else {
    return 'user'; // Default for any other folders
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

/** Match src/code.ts extractScriptMetadata: nested EXAMPLE_SCRIPTS subfolders become their own group name. */
function getPrebuiltDisplayName(relativePath, scriptType, metadataName) {
  if (scriptType !== 'prebuilt') {
    return metadataName;
  }
  if (relativePath === 'EXAMPLE_SCRIPTS' || relativePath.startsWith('EXAMPLE_SCRIPTS/')) {
    if (relativePath === 'EXAMPLE_SCRIPTS') {
      return `Utility Scripts / ${metadataName}`;
    }
    const rest = relativePath.slice('EXAMPLE_SCRIPTS/'.length);
    if (!rest) {
      return `Utility Scripts / ${metadataName}`;
    }
    const groupLabel = rest.includes('/') ? rest.split('/').join(' · ') : rest;
    return `${groupLabel} / ${metadataName}`;
  }
  if (relativePath.includes('CODEFIG_LIBRARIES')) {
    return `CodeFig Libraries / ${metadataName}`;
  }
  return `Utility Scripts / ${metadataName}`;
}

// Recursively find all .ts files in the scripts directory
function findAllScripts(scriptsDir) {
  const scripts = [];
  
  function scanDirectory(dir, relativePath = '') {
    if (!fs.existsSync(dir)) {
      return;
    }
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      // Skip excluded items
      if (shouldExclude(item)) {
        continue;
      }
      
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Recursively scan subdirectories
        const newRelativePath = relativePath ? `${relativePath}/${item}` : item;
        scanDirectory(itemPath, newRelativePath);
      } else if (item.endsWith('.ts') && !shouldExclude(item)) {
        // Found a TypeScript file
        const folderName = relativePath.split('/')[0] || 'EXAMPLE_SCRIPTS';
        const scriptCode = fs.readFileSync(itemPath, 'utf8');
        
        // Get script metadata (same logic as build-scripts.js)
        const metadata = getScriptMetadata(itemPath, item);
        const scriptType = getCategoryType(folderName);
        const displayName = getPrebuiltDisplayName(relativePath, scriptType, metadata.name);
        
        scripts.push({
          name: displayName,
          filename: item,
          path: itemPath,
          folder: folderName,
          code: scriptCode
        });
      }
    }
  }
  
  scanDirectory(scriptsDir);
  return scripts;
}

// Validate JavaScript syntax (lenient for TypeScript)
function validateSyntax(code, filePath) {
  const warnings = [];
  
  // Skip syntax validation for TypeScript files - too many false positives
  // TypeScript-specific syntax will fail JS parsing but is valid TS
  // We'll only check for obvious syntax errors that would break execution
  
  // Check for common issues that would break execution
  const issues = [];
  
  // Check for unmatched braces (basic check)
  const openBraces = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    issues.push('Unmatched braces');
  }
  
  // Check for unmatched parentheses
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    issues.push('Unmatched parentheses');
  }
  
  if (issues.length > 0) {
    warnings.push({
      type: 'syntax',
      message: issues.join(', '),
      line: 'unknown'
    });
  }
  
  return warnings;
}

// Validate @import statements
function validateImports(scripts) {
  const errors = [];
  const warnings = [];
  
  // Build function library from library scripts
  const functionLibrary = new Map();
  const scriptLibrary = new Map();
  
  const libraryScripts = scripts.filter(script => 
    script.filename === '@core-library.ts' ||
    script.filename === '@codefig-ui.ts' ||
    script.filename === '@math-helpers.ts' ||
    script.filename === '@variables.ts' ||
    script.filename === '@infopanel.ts' ||
    script.filename === '@pattern-matching.ts' ||
    script.filename === '@replacement-engine.ts' ||
    script.filename === '@styles.ts'
  );
  
  libraryScripts.forEach(script => {
    const functions = extractFunctionMap(script.code);
    
    // Store in global library
    functions.forEach((code, name) => {
      functionLibrary.set(name, {
        code: code,
        source: script.name
      });
    });
    
    // Store script-specific library for wildcard imports
    scriptLibrary.set(script.name, functions);
    scriptLibrary.set(script.name.replace('.ts', ''), functions);
    
    // Map common name variations (check by filename, not display name)
    if (script.filename === '@core-library.ts') {
      scriptLibrary.set('@Core Library', functions);
      scriptLibrary.set('@core-library', functions);
    } else if (script.filename === '@variables.ts') {
      scriptLibrary.set('@Variables', functions);
      scriptLibrary.set('@variables', functions);
    } else if (script.filename === '@math-helpers.ts') {
      scriptLibrary.set('@Math Helpers', functions);
      scriptLibrary.set('@math-helpers', functions);
    } else if (script.filename === '@infopanel.ts') {
      scriptLibrary.set('@InfoPanel', functions);
      scriptLibrary.set('@infopanel', functions);
    } else if (script.filename === '@pattern-matching.ts') {
      scriptLibrary.set('@Pattern Matching', functions);
      scriptLibrary.set('@pattern-matching', functions);
    } else if (script.filename === '@replacement-engine.ts') {
      scriptLibrary.set('@Replacement Engine', functions);
      scriptLibrary.set('@replacement-engine', functions);
    } else if (script.filename === '@styles.ts') {
      scriptLibrary.set('@Styles', functions);
      scriptLibrary.set('@styles', functions);
    } else if (script.filename === '@codefig-ui.ts') {
      scriptLibrary.set('CodeFigUI', functions);
      scriptLibrary.set('@codefig-ui', functions);
    }
  });
  
  // Fallback lookup for import targets that aren't one of the known libraries.
  // Deliberately stricter than the resolver's fuzzy matcher: the resolver has to
  // resolve *something* at run time, this only has to decide whether to report.
  function findScriptByName(scripts, scriptName) {
    let foundScript = scripts.find(s =>
      s.name === scriptName + '.ts' ||
      s.name === scriptName ||
      s.filename === scriptName + '.ts' ||
      s.filename === scriptName
    );

    // If not found, try with "Utility Scripts / " or legacy "Example Scripts / " prefix
    if (!foundScript) {
      foundScript = scripts.find(s =>
        s.name === `Utility Scripts / ${scriptName}` ||
        s.name === `Example Scripts / ${scriptName}` ||
        s.name.endsWith(` / ${scriptName}`)
      );
    }

    return foundScript;
  }

  // Validate imports in each script. Parsing comes from the shared resolver, so the
  // validator can never fall behind on a syntax the UI accepts.
  scripts.forEach(script => {
    // Skip validation for help-documentation.ts (contains example imports)
    if (script.filename === 'help-documentation.ts' || script.name.includes('help & documentation')) {
      return;
    }

    // Skip validation for library files themselves (they are the source, not consumers)
    if (libraryScripts.some(lib => lib.filename === script.filename)) {
      return;
    }

    findImports(script.code).forEach(imp => {
      const scriptName = imp.scriptName;

      // Wildcard forms (`@import * from "X"` and bare `@import *`) import whatever the
      // target declares, so only the target's existence can be checked here.
      if (!imp.functionNames) {
        if (scriptLibrary.has(scriptName) || findScriptByName(scripts, scriptName)) {
          return;
        }
        errors.push({
          type: 'import',
          file: script.name,
          message: `Script '${scriptName}' not found for wildcard import`,
          script: scriptName
        });
        return;
      }

      // `@import { a, b }` with no `from` resolves against the whole embedded library.
      if (imp.kind === 'simple') {
        imp.functionNames.forEach(functionName => {
          if (!functionLibrary.has(functionName)) {
            errors.push({
              type: 'import',
              file: script.name,
              message: `Function '${functionName}' not found in library`,
              function: functionName
            });
          }
        });
        return;
      }

      // `@import { a, b } from "X"`: X must exist and must declare every name.
      let sourceFunctions = scriptLibrary.get(scriptName);
      if (!sourceFunctions) {
        const foundScript = findScriptByName(scripts, scriptName);
        if (!foundScript) {
          errors.push({
            type: 'import',
            file: script.name,
            message: `Script '${scriptName}' not found for import`,
            script: scriptName
          });
          return;
        }
        sourceFunctions = extractFunctionMap(foundScript.code);
      }

      imp.functionNames.forEach(functionName => {
        if (!sourceFunctions.has(functionName)) {
          errors.push({
            type: 'import',
            file: script.name,
            message: `Function '${functionName}' not found in ${scriptName}`,
            function: functionName
          });
        }
      });
    });
  });

  return { errors, warnings };
}

/** Regression anchors for piecewise scale (min=0, max=160, roundTo=2, type=piecewise). */
function validatePiecewiseScaleFixtures() {
  const errors = [];
  const mathPath = path.join(__dirname, 'scripts', 'CODEFIG_LIBRARIES', '@math-helpers.ts');
  if (!fs.existsSync(mathPath)) {
    return errors;
  }
  const code = fs.readFileSync(mathPath, 'utf8');
  const functions = extractFunctionMap(code);
  const deps = [
    'clamp01',
    'applyEaseBaseIn',
    'applyEase',
    'applyEaseWithExponents',
    'lerp',
    'isPiecewiseScaleType',
    'snapScaleGrid',
    'piecewiseSnapGridForType',
    'resampleSpineArray',
    'mapSpineValueToRange',
    'enforceMonotonicScale',
    'usesPiecewiseRegressionPath',
    'generatePiecewiseSnappedScale',
    'mapScaleTypeToLibrary',
    'parseScaleRangeMode',
    'resolveScaleRangeMode',
    'getModularScaleRatio',
    'getEasedScaleFactor',
    'generateScale'
  ];
  const genCode = functions.get('generatePiecewiseSnappedScale');
  if (!genCode) {
    errors.push({
      type: 'piecewise',
      file: 'CodeFig Libraries / Math helpers',
      message: 'generatePiecewiseSnappedScale not found in @math-helpers.ts'
    });
    return errors;
  }
  const ctx = { console, Math };
  vm.createContext(ctx);
  try {
    deps.forEach((name) => {
      const fnCode = functions.get(name);
      if (fnCode) vm.runInContext(fnCode, ctx);
    });
    const fn = ctx.generatePiecewiseSnappedScale;
    const genScale = ctx.generateScale;
    if (typeof fn !== 'function') {
      errors.push({
        type: 'piecewise',
        file: 'CodeFig Libraries / Math helpers',
        message: 'generatePiecewiseSnappedScale did not bind in VM'
      });
      return errors;
    }
    function arraysEqual(a, b) {
      if (!a || !b || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) > 1e-6) return false;
      }
      return true;
    }
    function isMonotonic(arr) {
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] < arr[i - 1]) return false;
      }
      return true;
    }
    const cases = [
      { steps: 8, expected: [0, 2, 8, 16, 32, 48, 80, 160] },
      { steps: 10, expected: [0, 2, 4, 8, 16, 24, 40, 64, 96, 160] },
      { steps: 12, expected: [0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 160] }
    ];
    for (const c of cases) {
      const got = fn({ steps: c.steps, min: 0, max: 160, roundTo: 2, type: 'piecewise' });
      if (!arraysEqual(got, c.expected)) {
        errors.push({
          type: 'piecewise',
          file: 'CodeFig Libraries / Math helpers',
          message: `piecewise fixture steps=${c.steps}: expected [${c.expected.join(', ')}], got [${got.join(', ')}]`
        });
      }
    }
    if (typeof genScale === 'function') {
      const proportional = genScale({ steps: 6, min: 24, max: 128, roundTo: 4, type: 'piecewise' });
      if (proportional.length !== 6 || proportional[0] !== 24 || proportional[5] !== 128) {
        errors.push({
          type: 'piecewise',
          file: 'CodeFig Libraries / Math helpers',
          message: `proportional piecewise 6×24–128: expected endpoints 24/128, got [${proportional.join(', ')}]`
        });
      }
      if (!isMonotonic(proportional)) {
        errors.push({
          type: 'piecewise',
          file: 'CodeFig Libraries / Math helpers',
          message: `proportional piecewise 6×24–128 not monotonic: [${proportional.join(', ')}]`
        });
      }
    }
  } catch (e) {
    errors.push({
      type: 'piecewise',
      file: 'CodeFig Libraries / Math helpers',
      message: `piecewise fixture run failed: ${e.message}`
    });
  }
  return errors;
}

// Check for SCRIPT_NAME metadata
function validateMetadata(scripts) {
  const warnings = [];
  
  scripts.forEach(script => {
    const hasScriptName = /\/\/\s*SCRIPT_NAME:/i.test(script.code);
    const hasTitleComment = /^\/\/\s+[A-Z]/.test(script.code.trim());
    
    if (!hasScriptName && !hasTitleComment) {
      warnings.push({
        type: 'metadata',
        file: script.name,
        message: 'No SCRIPT_NAME or title comment found'
      });
    }
  });
  
  return warnings;
}

// Main validation function
function validateScripts() {
  console.log(`${colors.cyan}🔍 Validating scripts...${colors.reset}\n`);
  
  const scriptsDir = path.join(__dirname, 'scripts');
  
  if (!fs.existsSync(scriptsDir)) {
    console.log(`${colors.yellow}⚠️  Scripts directory not found: ${scriptsDir}${colors.reset}`);
    console.log(`${colors.blue}ℹ️  This is expected if you haven't moved scripts yet.${colors.reset}\n`);
    return { valid: true, errors: [], warnings: [] };
  }
  
  const scripts = findAllScripts(scriptsDir);
  
  if (scripts.length === 0) {
    console.log(`${colors.yellow}⚠️  No scripts found in ${scriptsDir}${colors.reset}\n`);
    return { valid: true, errors: [], warnings: [] };
  }
  
  console.log(`${colors.blue}📋 Found ${scripts.length} scripts to validate${colors.reset}\n`);
  
  const allErrors = [];
  const allWarnings = [];
  
  // Validate syntax (returns warnings, not errors)
  console.log(`${colors.cyan}🔎 Checking syntax...${colors.reset}`);
  scripts.forEach(script => {
    const syntaxWarnings = validateSyntax(script.code, script.path);
    syntaxWarnings.forEach(warning => {
      allWarnings.push({
        ...warning,
        file: script.name,
        path: script.path
      });
    });
  });
  
  // Validate imports
  console.log(`${colors.cyan}🔗 Checking @import statements...${colors.reset}`);
  const importValidation = validateImports(scripts);
  allErrors.push(...importValidation.errors);
  allWarnings.push(...importValidation.warnings);

  // Piecewise scale regression (Carbon-like anchors @ max=160, min=0, roundTo=2)
  console.log(`${colors.cyan}📐 Checking piecewise scale fixtures...${colors.reset}`);
  const piecewiseFixtureErrors = validatePiecewiseScaleFixtures();
  allErrors.push(...piecewiseFixtureErrors);
  
  // Validate metadata
  console.log(`${colors.cyan}📝 Checking metadata...${colors.reset}`);
  const metadataWarnings = validateMetadata(scripts);
  allWarnings.push(...metadataWarnings);
  
  // Report results
  console.log('\n');
  
  if (allErrors.length === 0) {
    if (allWarnings.length === 0) {
      console.log(`${colors.green}✅ All scripts validated successfully!${colors.reset}\n`);
    } else {
      console.log(`${colors.green}✅ Scripts validated with ${allWarnings.length} warning(s)${colors.reset}\n`);
    }
    return { valid: true, errors: [], warnings: allWarnings };
  }
  
  if (allErrors.length > 0) {
    console.log(`${colors.red}❌ Found ${allErrors.length} error(s):${colors.reset}\n`);
    allErrors.forEach(error => {
      console.log(`${colors.red}  ✗ ${error.file}${colors.reset}`);
      console.log(`    ${error.message}`);
      if (error.line !== 'unknown') {
        console.log(`    Line: ${error.line}`);
      }
    });
    console.log('');
  }
  
  if (allWarnings.length > 0) {
    console.log(`${colors.yellow}⚠️  Found ${allWarnings.length} warning(s):${colors.reset}\n`);
    allWarnings.forEach(warning => {
      console.log(`${colors.yellow}  ⚠ ${warning.file}${colors.reset}`);
      console.log(`    ${warning.message}`);
    });
    console.log('');
  }
  
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings
  };
}

// Run validation if called directly
if (require.main === module) {
  const result = validateScripts();
  process.exit(result.valid ? 0 : 1);
}

module.exports = { validateScripts, shouldExclude, findAllScripts };

