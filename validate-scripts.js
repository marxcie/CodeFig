const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Single implementation of @import parsing and function extraction, shared with the
// UI at run time (inlined into dist/ui.html). Do not re-implement either here.
const { findImports, extractFunctionMap, resolveImports } = require('./src/import-resolver.js');

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
  // Remove .js extension
  const nameWithoutExt = filename.replace(/\.js$/, '');
  
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
    shared: false,
    // False until a SCRIPT_NAME or title comment supplies the name, i.e. the name above
    // is the prettified-filename fallback. validateMetadata warns on exactly that case,
    // so the warning tracks the real resolution instead of a second, stricter regex.
    nameFromSource: false
  };

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').slice(0, 20); // Check more lines for metadata
    
    for (const line of lines) {
      // Look for script name
      const nameMatch = line.match(/\/\/\s*SCRIPT_NAME:\s*(.+)/i);
      if (nameMatch) {
        metadata.name = nameMatch[1].trim();
        metadata.nameFromSource = true;
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
          metadata.nameFromSource = true;
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
/** Backups are never worth parsing, staging area or not. */
function isBackupFile(name) {
  return Boolean(name.match(/\.(bak\d*|backup|old|tmp)\.js$/i));
}

function shouldExclude(name) {
  // Exclude files/folders starting with _ or .
  if (name.startsWith('_') || name.startsWith('.')) {
    return true;
  }
  // Exclude backup files
  if (isBackupFile(name)) {
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

/**
 * Recursively find all .js files in the scripts directory.
 *
 * `options.includeStaging` also returns `_`-prefixed paths, which the build always excludes.
 * The validator uses it so `scripts/_TESTS/` specs are still parse-checked: a spec that does
 * not parse should fail here, not in Figma with a cryptic message. Every other caller wants
 * the shipped inventory, so it stays off by default.
 */
function findAllScripts(scriptsDir, options) {
  const scripts = [];
  const includeStaging = Boolean(options && options.includeStaging);
  const skip = (name) => (includeStaging ? isBackupFile(name) : shouldExclude(name));

  function scanDirectory(dir, relativePath = '') {
    if (!fs.existsSync(dir)) {
      return;
    }
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      // Skip excluded items
      if (skip(item) || item.startsWith('.')) {
        continue;
      }
      
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Recursively scan subdirectories
        const newRelativePath = relativePath ? `${relativePath}/${item}` : item;
        scanDirectory(itemPath, newRelativePath);
      } else if (item.endsWith('.js') && !skip(item)) {
        // Found a script
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
          code: scriptCode,
          nameFromSource: metadata.nameFromSource
        });
      }
    }
  }
  
  scanDirectory(scriptsDir);
  return scripts;
}

/**
 * Does this script parse the way the sandbox will parse it?
 *
 * src/code.ts runs user scripts through `new Function('figma', 'console', 'window', code)`,
 * so the source text reaches the JS parser verbatim: TypeScript annotations, `interface`
 * blocks and `as` casts are syntax errors, not types. Asking the engine is a positive
 * check and strictly better than grepping for TypeScript-shaped syntax.
 *
 * `@import` markers are not JS either, so they are removed first — via findImports from
 * the shared resolver, so this can never disagree with what the UI strips at run time.
 */
function validateParse(script) {
  let code = script.code;
  findImports(code).forEach(imp => {
    code = code.replace(imp.statement, '');
  });

  try {
    new Function('figma', 'console', 'window', code);
    return null;
  } catch (error) {
    return {
      type: 'parse',
      file: script.name,
      message: `Does not parse as plain JS: ${error.message}. Scripts run through new Function - no type annotations, interfaces or casts.`
    };
  }
}

/**
 * Does the script still parse once its imports are spliced in?
 *
 * Stronger than validateParse and the reason it exists: extraction is textual, so a
 * brace-counting slip truncates a library function and the corruption only appears in
 * the *resolved* text — which is what the sandbox runs. Both resolver bugs found while
 * de-annotating the libraries (a regex literal counted as braces, and `$`-patterns in
 * library source being read as replacement patterns) were invisible until this ran.
 */
function validateResolvedParse(script, scripts) {
  if (findImports(script.code).length === 0) return null;

  let resolved = resolveImports(script.code, scripts, {});
  // A soft-failed import leaves a comment; any surviving marker is prose, not code.
  findImports(resolved).forEach(imp => {
    resolved = resolved.replace(imp.statement, '');
  });

  try {
    new Function('figma', 'console', 'window', resolved);
    return null;
  } catch (error) {
    return {
      type: 'parse',
      file: script.name,
      message: `Does not parse after @import resolution: ${error.message}. A library function was probably truncated during extraction.`
    };
  }
}

// There is deliberately no brace/parenthesis counting pass. Counting characters cannot
// tell code from string and regex literals, so it reported "Unmatched braces" against
// library files that the JS parser accepts — and validateParse above asks that parser
// directly, which is both stricter and free of false positives.

// Validate @import statements
function validateImports(scripts) {
  const errors = [];
  const warnings = [];
  
  // Build function library from library scripts
  const functionLibrary = new Map();
  const scriptLibrary = new Map();
  
  const libraryScripts = scripts.filter(script =>
    script.filename === '@core-library.js' ||
    script.filename === '@codefig-ui.js' ||
    script.filename === '@math-helpers.js' ||
    script.filename === '@variables.js' ||
    script.filename === '@infopanel.js' ||
    script.filename === '@pattern-matching.js' ||
    script.filename === '@replacement-engine.js' ||
    script.filename === '@styles.js'
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

    // Map common name variations (check by filename, not display name)
    if (script.filename === '@core-library.js') {
      scriptLibrary.set('@Core Library', functions);
      scriptLibrary.set('@core-library', functions);
    } else if (script.filename === '@variables.js') {
      scriptLibrary.set('@Variables', functions);
      scriptLibrary.set('@variables', functions);
    } else if (script.filename === '@math-helpers.js') {
      scriptLibrary.set('@Math Helpers', functions);
      scriptLibrary.set('@math-helpers', functions);
    } else if (script.filename === '@infopanel.js') {
      scriptLibrary.set('@InfoPanel', functions);
      scriptLibrary.set('@infopanel', functions);
    } else if (script.filename === '@pattern-matching.js') {
      scriptLibrary.set('@Pattern Matching', functions);
      scriptLibrary.set('@pattern-matching', functions);
    } else if (script.filename === '@replacement-engine.js') {
      scriptLibrary.set('@Replacement Engine', functions);
      scriptLibrary.set('@replacement-engine', functions);
    } else if (script.filename === '@styles.js') {
      scriptLibrary.set('@Styles', functions);
      scriptLibrary.set('@styles', functions);
    } else if (script.filename === '@codefig-ui.js') {
      scriptLibrary.set('CodeFigUI', functions);
      scriptLibrary.set('@codefig-ui', functions);
    }
  });
  
  // Fallback lookup for import targets that aren't one of the known libraries.
  // Deliberately stricter than the resolver's fuzzy matcher: the resolver has to
  // resolve *something* at run time, this only has to decide whether to report.
  function findScriptByName(scripts, scriptName) {
    let foundScript = scripts.find(s =>
      s.name === scriptName + '.js' ||
      s.name === scriptName ||
      s.filename === scriptName + '.js' ||
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
    // Skip validation for help-documentation.js (contains example imports)
    if (script.filename === 'help-documentation.js' || script.name.includes('help & documentation')) {
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
  const mathPath = path.join(__dirname, 'scripts', 'CODEFIG_LIBRARIES', '@math-helpers.js');
  // Report a missing file instead of returning clean: this path is hardcoded, so a
  // rename or move would otherwise switch the whole fixture check off in silence.
  if (!fs.existsSync(mathPath)) {
    errors.push({
      type: 'piecewise',
      file: 'CodeFig Libraries / Math helpers',
      message: `Fixture source not found: ${path.relative(__dirname, mathPath)}`
    });
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
      message: 'generatePiecewiseSnappedScale not found in @math-helpers.js'
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

/**
 * Warn when a script's display name is only the prettified filename.
 *
 * This reads getScriptMetadata's own verdict rather than re-testing the source. An
 * earlier version matched /^\/\/\s+[A-Z]/, which rejected every `// @Core Library`
 * title because of the leading `@` — so it warned about ten library files whose names
 * plainly came from those very comments.
 */
function validateMetadata(scripts) {
  const warnings = [];

  scripts.forEach(script => {
    if (!script.nameFromSource) {
      warnings.push({
        type: 'metadata',
        file: script.name,
        message: 'No SCRIPT_NAME or title comment found; display name falls back to the filename'
      });
    }
  });

  return warnings;
}

/**
 * Main validation function.
 *
 * The exit code tracks *errors* only, and the split is deliberate — build:production
 * gates on this, so anything cosmetic in here would get the gate switched back off:
 *
 *   Errors (exit 1):  a script does not parse as plain JS, before or after @import
 *                     resolution; an @import names a script or function that does not
 *                     exist; a piecewise-scale fixture regresses.
 *   Warnings (exit 0): display name falls back to the filename.
 */
function validateScripts() {
  console.log(`${colors.cyan}🔍 Validating scripts...${colors.reset}\n`);
  
  const scriptsDir = path.join(__dirname, 'scripts');
  
  if (!fs.existsSync(scriptsDir)) {
    console.log(`${colors.yellow}⚠️  Scripts directory not found: ${scriptsDir}${colors.reset}`);
    console.log(`${colors.blue}ℹ️  This is expected if you haven't moved scripts yet.${colors.reset}\n`);
    return { valid: true, errors: [], warnings: [] };
  }
  
  // includeStaging: `_TESTS/` specs never ship, but they do run in Figma, so they get the
  // same parse and import checks. Otherwise a broken spec fails at run time in the plugin
  // with a cryptic message instead of here.
  const scripts = findAllScripts(scriptsDir, { includeStaging: true });
  
  if (scripts.length === 0) {
    console.log(`${colors.yellow}⚠️  No scripts found in ${scriptsDir}${colors.reset}\n`);
    return { valid: true, errors: [], warnings: [] };
  }
  
  const staged = scripts.filter((s) => s.folder.startsWith('_') || s.filename.startsWith('_'));
  console.log(
    `${colors.blue}📋 Found ${scripts.length} scripts to validate` +
      (staged.length ? ` (${staged.length} unshipped, from _-prefixed paths)` : '') +
      `${colors.reset}\n`
  );
  
  const allErrors = [];
  const allWarnings = [];
  
  // Parse every script the way the sandbox will, before and after @import resolution
  console.log(`${colors.cyan}🧩 Checking scripts parse as plain JS...${colors.reset}`);
  scripts.forEach(script => {
    const parseError = validateParse(script);
    if (parseError) {
      allErrors.push({ ...parseError, path: script.path });
      return; // a resolved-parse error would just repeat this one
    }
    const resolvedError = validateResolvedParse(script, scripts);
    if (resolvedError) {
      allErrors.push({ ...resolvedError, path: script.path });
    }
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
  
  // Report results. Both lists are always printed — warnings used to be counted but
  // never shown on a clean run, which made them impossible to act on.
  console.log('');

  if (allErrors.length > 0) {
    console.log(`${colors.red}❌ Errors (these fail the build):${colors.reset}\n`);
    allErrors.forEach(error => {
      console.log(`${colors.red}  ✗ ${error.file}${colors.reset}`);
      console.log(`    ${error.message}`);
      if (error.line && error.line !== 'unknown') {
        console.log(`    Line: ${error.line}`);
      }
    });
    console.log('');
  }

  if (allWarnings.length > 0) {
    console.log(`${colors.yellow}⚠️  Warnings (these do not fail the build):${colors.reset}\n`);
    allWarnings.forEach(warning => {
      console.log(`${colors.yellow}  ⚠ ${warning.file}${colors.reset}`);
      console.log(`    ${warning.message}`);
    });
    console.log('');
  }

  const summary = `${allErrors.length} error(s), ${allWarnings.length} warning(s)`;
  if (allErrors.length === 0) {
    console.log(`${colors.green}✅ ${summary} — scripts validated.${colors.reset}\n`);
  } else {
    console.log(`${colors.red}❌ ${summary} — validation failed.${colors.reset}\n`);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings
  };
}

// Run validation if called directly. The exit code tracks errors only; see the
// error/warning split documented on validateScripts.
if (require.main === module) {
  const result = validateScripts();
  process.exit(result.valid ? 0 : 1);
}

module.exports = { validateScripts, shouldExclude, findAllScripts };

