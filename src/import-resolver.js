/**
 * CodeFig @import resolver — the single implementation.
 *
 * Consumed by two callers:
 *   - the UI at run time (src/ui.html), where it is inlined into dist/ui.html by
 *     build-import-resolver.js and reached through the `CodeFigImports` global;
 *   - the validator at build time (validate-scripts.js), via require().
 *
 * `@import` is textual, not a module system: the resolver finds the source script by
 * fuzzy name match, extracts the named functions' source text by brace-counting, and
 * splices it in place of the `@import` line. Failures degrade to a comment plus a
 * notification, never an error.
 *
 * Covered by tests/import-resolver.test.js. Behaviour here is pinned deliberately —
 * see the note on findFunctionBodyRange before "improving" the extractor.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CodeFigImports = api;
})(typeof self !== 'undefined' ? self : this, function () {
  /**
   * The four supported import forms. Stored as canonical /g regexes but never used
   * directly — rx() clones them per scan so a stale lastIndex can never leak between
   * callers.
   */
  var PATTERNS = {
    withFrom: /@import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
    simple: /@import\s+\{([^}]+)\}(?!\s+from)/g,
    wildcardFrom: /@import\s+\*\s+from\s+['"]([^'"]+)['"]/g,
    wildcard: /@import\s+\*(?!\s+from)/g
  };

  /** Import forms with no `from` clause resolve against this library. */
  var DEFAULT_LIBRARY = '@Core Library';

  /** extractFunctions recursion limit for dependency chains. */
  var MAX_DEPENDENCY_DEPTH = 10;

  /** Identifiers never treated as an importable dependency. */
  var BUILT_INS = [
    'console', 'figma', 'if', 'for', 'while', 'switch', 'case', 'return',
    'var', 'let', 'const', 'function', 'typeof', 'instanceof', 'new',
    'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'JSON', 'Promise',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'
  ];

  function noop() {}

  function rx(key) {
    var pattern = PATTERNS[key];
    return new RegExp(pattern.source, pattern.flags);
  }

  function splitNames(list) {
    return list.split(',').map(function (name) {
      return name.trim();
    });
  }

  // ---------------------------------------------------------------------------
  // Parsing
  // ---------------------------------------------------------------------------

  /**
   * Parse every `@import` in `code` without resolving anything.
   *
   * Returns descriptors in pattern order (withFrom, simple, wildcardFrom, wildcard),
   * which is the order resolveImports splices them in. Each descriptor is
   * `{ kind, statement, index, functionNames, scriptName }`; `functionNames` is null
   * for the wildcard forms, which only know their names once the source is located.
   */
  function findImports(code) {
    var imports = [];
    ['withFrom', 'simple', 'wildcardFrom', 'wildcard'].forEach(function (kind) {
      var regex = rx(kind);
      var match;
      while ((match = regex.exec(code)) !== null) {
        if (kind === 'withFrom') {
          imports.push({
            kind: kind,
            statement: match[0],
            index: match.index,
            functionNames: splitNames(match[1]),
            scriptName: match[2]
          });
        } else if (kind === 'simple') {
          imports.push({
            kind: kind,
            statement: match[0],
            index: match.index,
            functionNames: splitNames(match[1]),
            scriptName: DEFAULT_LIBRARY
          });
        } else if (kind === 'wildcardFrom') {
          imports.push({
            kind: kind,
            statement: match[0],
            index: match.index,
            functionNames: null,
            scriptName: match[1]
          });
        } else {
          imports.push({
            kind: kind,
            statement: match[0],
            index: match.index,
            functionNames: null,
            scriptName: DEFAULT_LIBRARY
          });
        }
      }
    });
    return imports;
  }

  // ---------------------------------------------------------------------------
  // Source scanning
  // ---------------------------------------------------------------------------

  /** Skip "..." and '...' (handles escapes). Returns index after the closing quote. */
  function skipQuotedString(sourceCode, openQuoteIndex) {
    var quote = sourceCode[openQuoteIndex];
    var i = openQuoteIndex + 1;
    while (i < sourceCode.length) {
      var c = sourceCode[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === quote) return i + 1;
      i++;
    }
    return sourceCode.length;
  }

  /** Skip `...` including ${ ... } expressions (recurses for nested braces). */
  function skipTemplateLiteral(sourceCode, backtickIndex) {
    var i = backtickIndex + 1;
    while (i < sourceCode.length) {
      var c = sourceCode[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '`') return i + 1;
      if (c === '$' && sourceCode[i + 1] === '{') {
        var close = findMatchingBraceEndIndex(sourceCode, i + 1);
        if (close < 0) return sourceCode.length;
        i = close + 1;
        continue;
      }
      i++;
    }
    return sourceCode.length;
  }

  /**
   * Index of the `}` matching the `{` at openBraceIndex; -1 if unbalanced.
   * Skips strings, line/block comments and template literals.
   */
  function findMatchingBraceEndIndex(sourceCode, openBraceIndex) {
    if (sourceCode[openBraceIndex] !== '{') return -1;
    var i = openBraceIndex + 1;
    var depth = 1;
    while (i < sourceCode.length && depth > 0) {
      var c = sourceCode[i];
      if (c === '/' && sourceCode[i + 1] === '/') {
        i += 2;
        while (i < sourceCode.length && sourceCode[i] !== '\n' && sourceCode[i] !== '\r') i++;
        continue;
      }
      if (c === '/' && sourceCode[i + 1] === '*') {
        i += 2;
        while (i < sourceCode.length - 1) {
          if (sourceCode[i] === '*' && sourceCode[i + 1] === '/') {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }
      if (c === '"' || c === "'") {
        i = skipQuotedString(sourceCode, i);
        continue;
      }
      if (c === '`') {
        i = skipTemplateLiteral(sourceCode, i);
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    if (depth !== 0) return -1;
    return i - 1;
  }

  /**
   * Locate a function body given the index just past its opening `(`.
   * Returns { bodyStart, bodyEnd } — indices of `{` and its matching `}` — or null.
   *
   * `allowTypeAnnotation` skips a TypeScript return annotation between `)` and `{`
   * (`function name(): Type {`). It is deliberately OFF for the runtime extraction
   * path and ON for the validator's map:
   *
   *   Runtime-extracted source is spliced straight into `new Function(...)`, where a
   *   TypeScript annotation is a SyntaxError. So a TS-annotated library function is
   *   *not* runtime-importable, and several shipped scripts carry hand-written
   *   fallbacks for exactly that case. Making it extractable would turn those
   *   scripts from working-via-fallback into a hard parse error.
   *
   *   The validator only needs to know a function exists, so it tolerates the
   *   annotation and reports no error.
   */
  function findFunctionBodyRange(sourceCode, afterOpenParen, allowTypeAnnotation) {
    var i = afterOpenParen;
    var parenCount = 1;
    while (i < sourceCode.length && parenCount > 0) {
      if (sourceCode[i] === '(') parenCount++;
      else if (sourceCode[i] === ')') parenCount--;
      i++;
    }
    while (i < sourceCode.length && /\s/.test(sourceCode[i])) i++;
    if (allowTypeAnnotation && sourceCode[i] === ':') {
      i++;
      while (i < sourceCode.length && sourceCode[i] !== '{') i++;
    }
    if (i >= sourceCode.length || sourceCode[i] !== '{') return null;
    var bodyEnd = findMatchingBraceEndIndex(sourceCode, i);
    if (bodyEnd < 0) return null;
    return { bodyStart: i, bodyEnd: bodyEnd };
  }

  /**
   * Every declaration form recognised as a function *name*.
   *
   * Note the asymmetry with extractFunctions: wildcard imports expand through this
   * list, but only `function name()` declarations are actually extractable. A
   * `var f = () => {}` form is named here and then silently skipped downstream.
   */
  function listFunctionNames(code) {
    var functionNames = [];
    var patterns = [
      /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
      /var\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function\s*\(/g,
      /var\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\([^)]*\)\s*=>/g,
      /(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function\s*\(/g,
      /(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\([^)]*\)\s*=>/g
    ];
    patterns.forEach(function (regex) {
      var match;
      while ((match = regex.exec(code)) !== null) {
        functionNames.push(match[1]);
      }
    });
    return functionNames.filter(function (name, index) {
      return functionNames.indexOf(name) === index;
    });
  }

  /**
   * Map every named `function` / `async function` declaration to its source text.
   * Tolerates TypeScript return annotations — see findFunctionBodyRange.
   *
   * Used by the validator to check that imported names exist, and to run library
   * functions in a VM for its regression fixtures.
   */
  function extractFunctionMap(sourceCode) {
    var functions = new Map();
    var declaration = /(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    var match;
    while ((match = declaration.exec(sourceCode)) !== null) {
      var range = findFunctionBodyRange(sourceCode, match.index + match[0].length, true);
      if (!range) continue;
      functions.set(match[1], sourceCode.substring(match.index, range.bodyEnd + 1));
    }
    return functions;
  }

  /** Names called inside `code` that are also declared as functions in `sourceCode`. */
  function findFunctionCallsInCode(code, sourceCode) {
    var dependencies = [];
    var definedFunctions = {};
    var functionDefRegex = /(?:async\s+)?function\s+(\w+)\s*\(/g;
    var match;
    while ((match = functionDefRegex.exec(sourceCode)) !== null) {
      definedFunctions[match[1]] = true;
    }

    var functionCallRegex = /\b(\w+)\s*\(/g;
    while ((match = functionCallRegex.exec(code)) !== null) {
      var functionName = match[1];
      if (BUILT_INS.indexOf(functionName) !== -1) continue;
      if (!definedFunctions[functionName]) continue;
      if (dependencies.indexOf(functionName) === -1) dependencies.push(functionName);
    }
    return dependencies;
  }

  /**
   * Extract the named functions from `sourceCode` as a single string, pulling in the
   * functions they call recursively. Dependencies are emitted before their callers.
   *
   * Only `function name()` / `async function name()` declarations are extractable;
   * anything else in `functionNames` is skipped without comment. `extractedSet`
   * dedupes across the recursion, which is also what makes call cycles terminate.
   */
  function extractFunctions(sourceCode, functionNames, extractedSet, depth) {
    extractedSet = extractedSet || new Set();
    depth = depth || 0;

    if (depth > MAX_DEPENDENCY_DEPTH) {
      return '';
    }

    var extractedCode = '';
    var newFunctionsToExtract = [];

    functionNames.forEach(function (functionName) {
      if (extractedSet.has(functionName)) return;

      // Match "async function name(" as well as "function name(" so async survives
      // extraction — dropping it would break every await in the body.
      var functionStartPattern = new RegExp('(?:async\\s+)?function\\s+' + functionName + '\\s*\\(', 'g');
      var match;

      while ((match = functionStartPattern.exec(sourceCode)) !== null) {
        var startIndex = match.index;
        var range = findFunctionBodyRange(sourceCode, startIndex + match[0].length, false);
        if (!range) continue;

        var functionCode = sourceCode.substring(startIndex, range.bodyEnd + 1);
        var functionBody = sourceCode.substring(range.bodyStart + 1, range.bodyEnd);

        extractedSet.add(functionName);

        findFunctionCallsInCode(functionBody, sourceCode).forEach(function (dep) {
          if (!extractedSet.has(dep)) newFunctionsToExtract.push(dep);
        });

        extractedCode += functionCode + '\n\n';
        break; // Found the function, move to the next name
      }
    });

    if (newFunctionsToExtract.length > 0) {
      var dependencyCode = extractFunctions(sourceCode, newFunctionsToExtract, extractedSet, depth + 1);
      extractedCode = dependencyCode + extractedCode;
    }

    return extractedCode;
  }

  // ---------------------------------------------------------------------------
  // Script lookup
  // ---------------------------------------------------------------------------

  /**
   * Fuzzy-match an import target against the script list, best match first:
   * exact display name, filename, @-prefixed variants, " / "-suffix (case sensitive
   * then insensitive), and finally a bare substring match.
   */
  function findScript(scripts, scriptName) {
    var found = scripts.find(function (script) {
      // Exact match (highest priority)
      if (script.name === scriptName) return true;

      // Filename match (high priority)
      if (script.filename && script.filename === scriptName + '.ts') return true;

      // @-prefixed names (e.g. "@Variables" matches "Utility Scripts / @Variables")
      if (scriptName.charAt(0) === '@') {
        if (script.name.endsWith(' / ' + scriptName)) return true;
        if (script.name.indexOf(scriptName) !== -1) return true;
        if (script.filename && script.filename === scriptName.replace('@', '') + '.ts') return true;
      }

      // End-of-name match (e.g. "Replace Styles" matches "Utility Scripts / Replace Styles")
      if (script.name.endsWith(' / ' + scriptName)) return true;

      // Case insensitive end-of-name match
      if (script.name.toLowerCase().endsWith(' / ' + scriptName.toLowerCase())) return true;

      // Partial match (lowest priority)
      if (script.name.indexOf(scriptName) !== -1) return true;

      return false;
    });
    return found || null;
  }

  /** Looser lookup used only to expand `@import * from "X"` into a name list. */
  function findWildcardSourceScript(scripts, scriptName) {
    var found = scripts.find(function (script) {
      if (script.name === scriptName) return true;
      if (script.name.indexOf(scriptName) !== -1) return true;
      if (script.filename === scriptName + '.ts') return true;
      return false;
    });
    return found || null;
  }

  /** Lookup used only to expand bare `@import *`. */
  function findDefaultLibraryScript(scripts) {
    var found = scripts.find(function (script) {
      return script.name.indexOf(DEFAULT_LIBRARY) !== -1;
    });
    return found || null;
  }

  // ---------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------

  /** Splice one import statement, or replace it with a failure comment. */
  function spliceImport(code, statement, functionNames, scriptName, scripts, handlers) {
    var sourceScript = findScript(scripts, scriptName);

    if (!sourceScript) {
      handlers.warn('⚠️ Script not found for import: ' + scriptName);
      handlers.notify('Import failed: Script "' + scriptName + '" not found');
      return code.replace(statement, '// Import failed: ' + scriptName + ' not found');
    }

    handlers.log('🔗 Runtime import: ' + functionNames.join(', ') + ' from ' + sourceScript.name);

    // Use library source as-is. Do NOT run a global .replace(/\\n/g, '\n') here: it
    // corrupts valid code such as .split("\\r\\n") by turning the \\n inside string
    // literals into real newlines.
    var extractedFunctions = extractFunctions(sourceScript.code, functionNames);
    var injectedCode = '// Runtime imported from: ' + sourceScript.name + '\n' + extractedFunctions + '\n';

    return code.replace(statement, injectedCode);
  }

  /**
   * Replace every `@import` in `code` with the imported functions' source text.
   *
   * `scripts` is the full script list, each entry `{ name, filename, code }`.
   * `options` may carry `log`, `warn` and `notify` callbacks; all default to no-ops,
   * so a caller that only wants the resolved string can pass nothing.
   *
   * Unresolvable imports become a comment plus a notify() — never a throw.
   */
  function resolveImports(code, scripts, options) {
    options = options || {};
    var handlers = {
      log: options.log || noop,
      warn: options.warn || noop,
      notify: options.notify || noop
    };

    // Skip import processing for simple scripts to reduce overhead
    if (code.length < 500 && code.indexOf('@import') === -1) {
      return code;
    }

    // Imports are parsed from the original code but spliced into the accumulating
    // result, so an injected function body can never be rescanned for imports.
    var processedCode = code;

    findImports(code).forEach(function (imp) {
      if (imp.functionNames) {
        processedCode = spliceImport(
          processedCode, imp.statement, imp.functionNames, imp.scriptName, scripts, handlers
        );
        return;
      }

      // Wildcard forms: expand to every function name the source script declares.
      var sourceScript = imp.kind === 'wildcardFrom'
        ? findWildcardSourceScript(scripts, imp.scriptName)
        : findDefaultLibraryScript(scripts);

      if (!sourceScript) {
        if (imp.kind === 'wildcardFrom') {
          handlers.warn('Wildcard import: Script not found: ' + imp.scriptName);
          processedCode = processedCode.replace(imp.statement, '// Import failed: Script not found');
        } else {
          handlers.warn('Wildcard import: Core library not found');
          processedCode = processedCode.replace(imp.statement, '// Import failed: Core library not found');
        }
        return;
      }

      processedCode = spliceImport(
        processedCode, imp.statement, listFunctionNames(sourceScript.code), imp.scriptName, scripts, handlers
      );
    });

    return processedCode;
  }

  return {
    PATTERNS: PATTERNS,
    DEFAULT_LIBRARY: DEFAULT_LIBRARY,
    MAX_DEPENDENCY_DEPTH: MAX_DEPENDENCY_DEPTH,
    findImports: findImports,
    findScript: findScript,
    listFunctionNames: listFunctionNames,
    extractFunctions: extractFunctions,
    extractFunctionMap: extractFunctionMap,
    resolveImports: resolveImports
  };
});
