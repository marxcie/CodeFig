const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Single implementation of @import parsing and function extraction, shared with the
// UI at run time (inlined into dist/ui.html). Do not re-implement either here.
const { findImports, stripImports, extractFunctionMap, resolveImports, listFunctionNames, findScript } = require('./src/import-resolver.js');
// Single implementation of CSS scoping, shared with the UI at run time. See
// .plans/30-scoped-stylesheets.md.
const { scopeStylesheet, topLevelSelectors } = require('./src/style-scoper.js');
// @PANEL_START reader, shared with the UI at run time. See .plans/31-panel-spec-json.md.
const configUIParser = require('./src/config-ui/parser.js');

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
  const { stampPackageMembership } = require('./stamp-package-membership.js');
  const stamped = stampPackageMembership(scripts);
  if (stamped.errors.length) {
    stamped.errors.forEach((e) => {
      // Surfaced as validate errors by the caller that checks package stamps — keep findAllScripts
      // itself free of process.exit so tests can assert on the list.
      scripts._packageStampErrors = (scripts._packageStampErrors || []).concat(e);
    });
  }
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
 * `@import` markers are not JS either, so they are removed first — via stripImports from
 * the shared resolver, so this can never disagree with what the UI strips at run time.
 */
function validateParse(script) {
  const code = stripImports(script.code);

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

  // A soft-failed import leaves a comment; any surviving marker is prose, not code.
  const resolved = stripImports(resolveImports(script.code, scripts, {
    packageId: script.packageId || undefined
  }));

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

/**
 * Every function a runnable script calls must exist after `@import` resolution.
 *
 * This catches the one gap the parse checks cannot see: `@import` follows dependencies only
 * *within* the source script it extracts from, so importing a function that calls a helper
 * from a **different** script silently leaves that helper undefined. The call then throws
 * ReferenceError at run time — and since callers often wrap work in try/catch, it usually
 * surfaces as "nothing happened" rather than an error. Two real cases:
 *
 *   - corner-radius.js and spacing.js called roundToGrid(), declared only in typography.js,
 *     so a run with gridSize > 0 threw on a config path nobody had exercised.
 *   - a spec importing nodeUsesMatchingStyle did not get nameMatches, and the predicate
 *     reported "no match" for every node.
 *
 * Scope and precision, both deliberate:
 *   - Only **runnable** scripts. A library's calls resolve in its consumer's context, so
 *     checking libraries produces false positives by design.
 *   - Only names some script declares as a function. That filters method calls (`.push(`)
 *     and prose without needing to parse, which is what keeps this regex-based check honest.
 *   - Only `name(` with no space, since prose writes `roundToGrid (see below)`.
 *
 * Measured at 0 false positives across all 35 runnable scripts when added.
 */
/**
 * Blank out comments, leaving every other character where it was.
 *
 * Not a regex: `"https://api.figma.com"` is a string containing a comment opener, and cutting from
 * there would drop real calls on that line — a build gate that misses is worse than one that shouts.
 * Whitespace replaces the comment rather than deleting it, so nothing after it joins what came before.
 *
 * **Quote state resets at each newline**, which is what makes this survive a library full of regex
 * literals. A character class like `/[^.\w$'"]/` — one of these files has exactly that — carries an
 * unpaired quote, and a scanner that carried state across lines from there treated the next several
 * hundred lines as one string. The known limit, stated rather than papered over: a line holding both
 * such a regex *and* a trailing comment keeps that comment, so that one line reads as it did before.
 */
function withoutComments(code) {
  let inBlock = false;
  return code.split('\n').map((line) => {
    let out = '';
    let i = 0;
    let quote = null;
    while (i < line.length) {
      const ch = line[i];
      const next = line[i + 1];
      if (inBlock) {
        if (ch === '*' && next === '/') { inBlock = false; out += '  '; i += 2; continue; }
        out += ' ';
        i++;
        continue;
      }
      if (quote) {
        out += ch;
        if (ch === '\\') { out += next === undefined ? '' : next; i += 2; continue; }
        if (ch === quote) quote = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i++; continue; }
      if (ch === '/' && next === '/') {
        while (i < line.length) { out += ' '; i++; }
        continue;
      }
      if (ch === '/' && next === '*') { inBlock = true; out += '  '; i += 2; continue; }
      out += ch;
      i++;
    }
    return out;
  }).join('\n');
}

function validateResolvedCalls(scripts) {
  const errors = [];

  const declaredSomewhere = new Map();
  scripts.forEach((script) => {
    extractFunctionMap(script.code).forEach((_code, name) => {
      if (!declaredSomewhere.has(name)) declaredSomewhere.set(name, []);
      declaredSomewhere.get(name).push(script.filename);
    });
  });

  scripts.forEach((script) => {
    if (script.filename.startsWith('@')) return;

    let resolved;
    try {
      resolved = resolveImports(script.code, scripts, {
        packageId: script.packageId || undefined
      });
    } catch (e) {
      return; // validateResolvedParse already reports resolution failures
    }

    const declaredHere = new Set(listFunctionNames(resolved));
    const called = new Set();
    const callRe = /(^|[^.\w$'"])([A-Za-z_$][\w$]*)\(/g;
    let match;
    // Comments stripped first: text in a comment is not a call. A config block's own annotations are
    // comments and they are written to be read, so they contain parentheses —
    // `scaleType:radio(modular|metric)` in Spacing's `@rows` line was reported as a call to `radio()`,
    // which is declared in `@codefig-ui.js`, so the error even named a file to import it from. A
    // validator that has to be worked around is one nobody trusts the next time.
    while ((match = callRe.exec(withoutComments(resolved))) !== null) called.add(match[2]);

    [...called]
      .filter((name) => declaredSomewhere.has(name) && !declaredHere.has(name))
      .forEach((name) => {
        errors.push({
          type: 'unresolved-call',
          file: script.name,
          path: script.path,
          message:
            `Calls ${name}() but nothing defines it after @import resolution. It is declared in ` +
            `${declaredSomewhere.get(name).join(', ')} — import it explicitly. Dependency ` +
            `extraction only follows functions declared in the same source script, so this ` +
            `would throw ReferenceError at run time (often silently, inside a try/catch).`
        });
      });
  });

  return errors;
}

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
    // No per-file exemptions. help-documentation.js needed one until findImports learned
    // to skip `// @DOC_START` … `// @DOC_END` ranges: its four example imports parsed as
    // real ones, so checking them meant rejecting `from "My Custom Script"`. Now they are
    // not imports at all, and a second HELP script documenting the syntax needs nothing.

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
/** A folder name as a stable, non-empty owner id for `scopeStylesheet` at validation time. */
function packageIdFromFolder(folderName) {
  return String(folderName || 'package').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'package';
}

/**
 * Every `package.css` under `scripts/`, scoped and cross-checked the way `.plans/30-scoped-stylesheets.md`
 * describes. Two gates, both build errors:
 *
 * 1. A stylesheet `scopeStylesheet` cannot safely rewrite — an unparseable selector, a non-`data:`
 *    `url()`, `position: fixed` — fails here rather than shipping and failing silently at injection
 *    time in the iframe.
 * 2. The same raw selector declared in two different packages' `package.css` is an error pointing at
 *    `ui.css`, so the split this plan makes does not rot back within six months: the second package
 *    copying the first's rule instead of promoting it to the shared stylesheet is exactly this.
 *
 * `@STYLE_START` (the user-script carrier) has no build step, so it cannot be checked here — its
 * `url()`/`position: fixed` rejection has to run again at injection time, in the same rewriter pass
 * that does the selector prefixing. This function is the `package.css` half only.
 */
function validatePackageStylesheets(scriptsDir) {
  const errors = [];
  const selectorOwners = {}; // selector text -> [{ folder, file }]

  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      if (item.startsWith('.') || item.startsWith('_')) continue;
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        scan(itemPath);
        continue;
      }
      if (item !== 'package.css') continue;

      // The package is the file's own immediate parent — "Design System Foundations", not the
      // category folder ("EXAMPLE_SCRIPTS") several levels up. Two packages under the same
      // category must still be told apart.
      const folderName = path.basename(dir);
      const css = fs.readFileSync(itemPath, 'utf8');
      const ownerId = packageIdFromFolder(folderName);
      const result = scopeStylesheet(css, ownerId);
      if (!result.ok) {
        result.errors.forEach((message) => {
          errors.push({ type: 'package-css', file: itemPath, message: message, line: 'unknown' });
        });
        continue; // an unparseable sheet has nothing reliable to extract selectors from
      }

      topLevelSelectors(css).forEach((selector) => {
        (selectorOwners[selector] = selectorOwners[selector] || []).push({ folder: folderName, file: itemPath });
      });
    }
  }

  scan(scriptsDir);

  Object.keys(selectorOwners).forEach((selector) => {
    const owners = selectorOwners[selector];
    const distinctFolders = new Set(owners.map((o) => o.folder));
    if (distinctFolders.size < 2) return;
    errors.push({
      type: 'package-css',
      file: owners.map((o) => o.file).join(', '),
      message: `Selector "${selector}" is declared in more than one package's package.css ` +
        `(${Array.from(distinctFolders).join(', ')}). Promote it to src/ui.css instead of copying it.`,
      line: 'unknown'
    });
  });

  return errors;
}

/**
 * Every key `@PANEL_START` declares a field for must exist in the values region, and every key
 * the values region holds must be declared somewhere in `@PANEL_START` — otherwise the two drift
 * the way `spacing.js`'s `@DOC_START` table already has (see `DEFERRED.md`). The values region is
 * `@CONFIG_START` (property list, DSF) or `@UI_CONFIG_START` (`var` assignments, utility scripts)
 * when `@PANEL_START` is present. Scoped to top-level keys: a `@rows` field's own value is an
 * array of row objects, and those keys are already the columns spec's job to declare, not this
 * gate's.
 *
 * A no-op for scripts with no `@PANEL_START` — but scans every script so it starts working the
 * moment one does, rather than needing to be remembered and wired in later.
 */
function validatePanelKeyParity(scripts) {
  const errors = [];
  scripts.forEach((script) => {
    const panelMatch = /\/\/ @PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(script.code);
    if (!panelMatch) return; // old-format script, or no panel at all

    const configMatch = /@CONFIG_START\n([\s\S]*?)\/\/ @CONFIG_END/.exec(script.code);
    const uiConfigMatch = /@UI_CONFIG_START\n([\s\S]*?)\/\/ @UI_CONFIG_END/.exec(script.code);
    const valuesMatch = configMatch || uiConfigMatch;
    if (!valuesMatch) return; // panel without a values region — not this gate's job
    const valuesLabel = configMatch ? '@CONFIG_START' : '@UI_CONFIG_START';

    const panel = configUIParser.parsePanelSpec(panelMatch[1], {});
    if (panel.error) {
      errors.push({ type: 'panel-key-parity', file: script.name, message: panel.error, line: 'unknown' });
      return;
    }
    const panelKeys = new Set(panel.rows.filter((r) => r.type === 'field').map((r) => r.name));

    const values = configUIParser.parseConfigBlockObject(valuesMatch[1]);
    if (!values) {
      errors.push({
        type: 'panel-key-parity', file: script.name,
        message: valuesLabel + ' does not parse as a plain values object', line: 'unknown'
      });
      return;
    }
    const valueKeys = new Set(Object.keys(values));

    valueKeys.forEach((key) => {
      if (!panelKeys.has(key)) {
        errors.push({
          type: 'panel-key-parity', file: script.name,
          message: `"${key}" has a value in ${valuesLabel} but no field in @PANEL_START`, line: 'unknown'
        });
      }
    });
    panelKeys.forEach((key) => {
      if (!valueKeys.has(key)) {
        errors.push({
          type: 'panel-key-parity', file: script.name,
          message: `"${key}" is a field in @PANEL_START but has no value in ${valuesLabel}`, line: 'unknown'
        });
      }
    });
  });
  return errors;
}

/**
 * A package member name that also resolves in the global (non-package) script list — the risk
 * `.plans/32-packages.md` calls out explicitly: "make the collision a hard validator failure
 * rather than letting resolution order decide silently." `findScript`'s package-scoped lookup
 * always prefers the package member, so a collision is not a crash — it is a script quietly
 * getting the wrong one of two same-named things, which is worse.
 *
 * Uses the same fuzzy match `findScript` resolves with, not exact-name equality: a package member
 * called "Foo" and a global library ending " / Foo" collide under `findScript`'s rules just as
 * much as two scripts named "Foo" outright, and a validator using a narrower check than the
 * resolver it is guarding would pass exactly the case it exists to catch.
 *
 * Validates that a package member name does not also resolve outside the package
 * via the same fuzzy match `findScript` uses.
 */
function validatePackageImportCollisions(scripts) {
  const errors = [];
  const packageIds = new Set(scripts.filter((s) => s.packageId).map((s) => s.packageId));
  packageIds.forEach((packageId) => {
    const members = scripts.filter((s) => s.packageId === packageId);
    const outside = scripts.filter((s) => s.packageId !== packageId);
    members.forEach((member) => {
      const collision = findScript(outside, member.name);
      if (collision) {
        errors.push({
          type: 'package-collision', file: member.name,
          message: `"${member.name}" is a member of package "${packageId}" and also resolves to ` +
            `"${collision.name}" outside it. Package-scoped resolution would prefer the package ` +
            'member silently; rename one of them.',
          line: 'unknown'
        });
      }
    });
  });
  return errors;
}

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

  // Every called function must exist after resolution (see validateResolvedCalls).
  console.log(`${colors.cyan}📞 Checking imported functions resolve their own calls...${colors.reset}`);
  allErrors.push(...validateResolvedCalls(scripts));

  // Piecewise scale regression (Carbon-like anchors @ max=160, min=0, roundTo=2)
  console.log(`${colors.cyan}📐 Checking piecewise scale fixtures...${colors.reset}`);
  const piecewiseFixtureErrors = validatePiecewiseScaleFixtures();
  allErrors.push(...piecewiseFixtureErrors);

  // Scoped stylesheets: package.css must rewrite cleanly, and no selector may be copied
  // across two packages instead of promoted to ui.css. See .plans/30-scoped-stylesheets.md.
  console.log(`${colors.cyan}🎨 Checking package stylesheets...${colors.reset}`);
  allErrors.push(...validatePackageStylesheets(scriptsDir));

  // @PANEL_START / @CONFIG_START key parity. See .plans/31-panel-spec-json.md.
  console.log(`${colors.cyan}🔑 Checking panel spec key parity...${colors.reset}`);
  allErrors.push(...validatePanelKeyParity(scripts));

  // A package member name must not also resolve outside its package. See .plans/32-packages.md.
  console.log(`${colors.cyan}📦 Checking package import collisions...${colors.reset}`);
  allErrors.push(...validatePackageImportCollisions(scripts));
  
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

// `validateResolvedCalls` and `withoutComments` are exported so the gate itself is testable: it is
// the only automated check standing between an unimported library call and a swallowed
// ReferenceError in Figma, and it has now been wrong in both directions — once blind to a real
// missing import, once shouting about a call that was only ever text in a comment.
module.exports = {
  validateScripts, shouldExclude, findAllScripts, validateResolvedCalls, withoutComments,
  validatePackageStylesheets, validatePanelKeyParity, validatePackageImportCollisions
};

