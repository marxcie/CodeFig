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
 * Comments are not respected — a commented-out `@import` still imports — with exactly
 * one exception: an `@import` inside a `// @DOC_START` … `// @DOC_END` block is
 * documentation, and findImports skips it. See findDocBlockRanges.
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
  // Doc blocks
  // ---------------------------------------------------------------------------

  /**
   * Doc-block delimiters, line-anchored to match the UI's extractSection exactly, so
   * the range skipped here is the range rendered in the Documentation tab.
   */
  var DOC_START_LINE = /^[ \t]*\/\/[ \t]*@DOC_START[ \t]*$/;
  var DOC_END_LINE = /^[ \t]*\/\/[ \t]*@DOC_END[ \t]*$/;

  /**
   * Character ranges covered by `// @DOC_START` … `// @DOC_END` blocks, so an `@import`
   * written as an *example* in a script's documentation is not executed as a real one.
   * `scripts/HELP/help-documentation.js` documents the syntax with four examples; before
   * this, three of them injected library code into every run and the fourth showed the
   * user an "Import failed" notification. It also forced validate-scripts.js to exempt
   * that file, which silenced every import check for it.
   *
   * A block needs **both** markers: an unterminated `// @DOC_START` is not treated as
   * running to end of file. That is the safe direction — a stray marker then leaves the
   * imports below it working rather than silently disabling all of them, which reads as
   * "the script does nothing" and is the failure mode this whole file is careful about.
   * The UI is equally strict: extractSection renders no docs at all without both.
   */
  function findDocBlockRanges(code) {
    var ranges = [];
    var openIndex = -1;
    var lineStart = 0;
    while (lineStart <= code.length) {
      var newlineIndex = code.indexOf('\n', lineStart);
      var lineEnd = newlineIndex === -1 ? code.length : newlineIndex;
      var line = code.slice(lineStart, lineEnd).replace(/\r$/, '');
      if (openIndex === -1) {
        if (DOC_START_LINE.test(line)) openIndex = lineStart;
      } else if (DOC_END_LINE.test(line)) {
        ranges.push({ start: openIndex, end: lineEnd });
        openIndex = -1;
      }
      if (newlineIndex === -1) break;
      lineStart = newlineIndex + 1;
    }
    return ranges;
  }

  function isInsideDocBlock(ranges, index) {
    for (var i = 0; i < ranges.length; i++) {
      if (index >= ranges[i].start && index < ranges[i].end) return true;
    }
    return false;
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
   *
   * Occurrences inside a doc block are skipped — the single place that rule lives, so
   * the UI and the validator can never disagree about what counts as an import.
   */
  function findImports(code) {
    var imports = [];
    var docRanges = findDocBlockRanges(code);
    ['withFrom', 'simple', 'wildcardFrom', 'wildcard'].forEach(function (kind) {
      var regex = rx(kind);
      var match;
      while ((match = regex.exec(code)) !== null) {
        if (isInsideDocBlock(docRanges, match.index)) continue;
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

  /** Punctuation after which a `/` opens a regex literal rather than dividing. */
  var REGEX_PRECEDERS = '(,=:[!&|?{};+-*%~^<>';

  /** Keywords after which a `/` opens a regex literal, e.g. `return /re/.test(s)`. */
  var REGEX_KEYWORDS = [
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
    'case', 'do', 'else', 'yield', 'await'
  ];

  /**
   * Could the `/` at slashIndex start a regex literal, given the last significant
   * code character before it? Ambiguous in JS without a full parser; this is the
   * standard heuristic — punctuation that cannot end an expression, or a keyword.
   */
  function slashStartsRegex(sourceCode, slashIndex, prevSignificant, prevSignificantIndex) {
    if (!prevSignificant) return true; // start of the scanned region
    if (REGEX_PRECEDERS.indexOf(prevSignificant) !== -1) return true;
    if (!/[A-Za-z0-9_$]/.test(prevSignificant)) return false;
    // Identifier-ish: a regex only follows if it is one of the keywords above.
    var end = prevSignificantIndex + 1;
    var start = end;
    while (start > 0 && /[A-Za-z0-9_$]/.test(sourceCode[start - 1])) start--;
    return REGEX_KEYWORDS.indexOf(sourceCode.slice(start, end)) !== -1;
  }

  /** Skip /.../flags including char classes. Returns index after the literal. */
  function skipRegexLiteral(sourceCode, slashIndex) {
    var i = slashIndex + 1;
    var inClass = false;
    while (i < sourceCode.length) {
      var c = sourceCode[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '\n' || c === '\r') return slashIndex + 1; // unterminated: treat as division
      if (inClass) {
        if (c === ']') inClass = false;
      } else if (c === '[') {
        inClass = true;
      } else if (c === '/') {
        i++;
        while (i < sourceCode.length && /[dgimsuvy]/.test(sourceCode[i])) i++;
        return i;
      }
      i++;
    }
    return slashIndex + 1;
  }

  /**
   * Index of the `}` matching the `{` at openBraceIndex; -1 if unbalanced.
   * Skips strings, line/block comments, template literals and regex literals.
   *
   * Regex literals matter: `/\\\{([^}]+)\\\}/g` in @pattern-matching.js holds one `{`
   * and two `}`, which without this closes the enclosing function an entire brace
   * early and yields a truncated, unparseable extraction.
   */
  function findMatchingBraceEndIndex(sourceCode, openBraceIndex) {
    if (sourceCode[openBraceIndex] !== '{') return -1;
    var i = openBraceIndex + 1;
    var depth = 1;
    var prevSignificant = '{';
    var prevSignificantIndex = openBraceIndex;
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
      if (c === '/' && slashStartsRegex(sourceCode, i, prevSignificant, prevSignificantIndex)) {
        var afterRegex = skipRegexLiteral(sourceCode, i);
        if (afterRegex > i + 1) {
          prevSignificant = '/';
          prevSignificantIndex = afterRegex - 1;
          i = afterRegex;
          continue;
        }
      }
      if (c === '"' || c === "'") {
        i = skipQuotedString(sourceCode, i);
        prevSignificant = c;
        prevSignificantIndex = i - 1;
        continue;
      }
      if (c === '`') {
        i = skipTemplateLiteral(sourceCode, i);
        prevSignificant = '`';
        prevSignificantIndex = i - 1;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      if (!/\s/.test(c)) {
        prevSignificant = c;
        prevSignificantIndex = i;
      }
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
   * Filename minus its extension, for comparing an import target against a filename.
   *
   * Extension-agnostic on purpose: repo scripts are `.js`, but scripts the user saved
   * in clientStorage under an older build — and the fixtures in
   * tests/import-resolver.test.js — still carry `.ts`, and both must keep resolving.
   */
  function basenameWithoutExtension(filename) {
    return String(filename).replace(/\.[^.]+$/, '');
  }

  /**
   * Fuzzy-match an import target against the script list, best match first:
   * exact display name, filename, @-prefixed variants, " / "-suffix (case sensitive
   * then insensitive), and finally a bare substring match.
   *
   * Each rule is tried across **every** script before the next rule is tried. That ordering is
   * the whole point: this used to be one `find` over the OR of all the rules, so the winner was
   * whichever script the build happened to read first (`readdirSync`, unsorted) — and
   * `"@Foundation"` is a substring of `"@Foundation overview"`. An import resolving to the
   * wrong library is a `ReferenceError` at run time, or a build error if you are lucky.
   */
  function findScript(scripts, scriptName) {
    var lower = String(scriptName).toLowerCase();
    var isAtName = scriptName.charAt(0) === '@';

    var rules = [
      // Exact display name.
      function (script) { return script.name === scriptName; },
      // Filename, extension-agnostic.
      function (script) { return !!script.filename && basenameWithoutExtension(script.filename) === scriptName; },
      // "@Variables" matching "Utility Scripts / @Variables".
      function (script) { return script.name.endsWith(' / ' + scriptName); },
      // "@Variables" matching a file called variables.js.
      function (script) {
        return isAtName && !!script.filename &&
          basenameWithoutExtension(script.filename) === scriptName.replace('@', '');
      },
      // Case-insensitive end-of-name.
      function (script) { return script.name.toLowerCase().endsWith(' / ' + lower); },
      // Substring, the loosest thing we accept.
      function (script) { return script.name.indexOf(scriptName) !== -1; }
    ];

    for (var i = 0; i < rules.length; i++) {
      var found = scripts.find(rules[i]);
      if (found) return found;
    }
    return null;
  }

  /** Looser lookup used only to expand `@import * from "X"` into a name list. */
  function findWildcardSourceScript(scripts, scriptName) {
    var found = scripts.find(function (script) {
      if (script.name === scriptName) return true;
      if (script.name.indexOf(scriptName) !== -1) return true;
      if (script.filename && basenameWithoutExtension(script.filename) === scriptName) return true;
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

  /**
   * Replace the first occurrence of `statement` *outside any doc block* with `text`.
   *
   * Two things are load-bearing. Splicing by index keeps the replacement literal:
   * String.replace with a string replacement treats `$&`, `` $` ``, `$'` and `$1` in
   * the *replacement* as patterns, and library sources are full of them —
   * `` `^${pattern}$` `` in @pattern-matching.js ends in `` $` ``, which as a pattern
   * means "everything before the match" and silently pastes the consuming script's own
   * header into the middle of a template literal.
   *
   * And skipping doc blocks keeps the splice on the import that asked for it: findImports
   * ignores a documented example, but the example's text is still there to be matched, so
   * a script whose docs show the same line it really imports would otherwise get the
   * functions injected into its documentation and leave the live `@import` in place.
   */
  function spliceAt(code, statement, text) {
    var docRanges = findDocBlockRanges(code);
    var from = 0;
    var at;
    while ((at = code.indexOf(statement, from)) !== -1) {
      if (!isInsideDocBlock(docRanges, at)) {
        return code.slice(0, at) + text + code.slice(at + statement.length);
      }
      from = at + 1;
    }
    return code;
  }

  /**
   * Remove every `@import` statement, leaving documented examples in place.
   *
   * `@import` is not JavaScript, so validate-scripts.js strips the markers before asking
   * `new Function` whether a script parses. That belongs here so both sides share one
   * rule: a text-first strip would delete a documented example and leave the real import
   * in the code, failing the parse check on a script that is fine.
   */
  function stripImports(code) {
    var stripped = code;
    findImports(code).forEach(function (imp) {
      stripped = spliceAt(stripped, imp.statement, '');
    });
    return stripped;
  }

  /** Splice one import statement, or replace it with a failure comment. */
  function spliceImport(code, statement, functionNames, scriptName, scripts, handlers) {
    var sourceScript = findScript(scripts, scriptName);

    if (!sourceScript) {
      handlers.warn('⚠️ Script not found for import: ' + scriptName);
      handlers.notify('Import failed: Script "' + scriptName + '" not found');
      return spliceAt(code, statement, '// Import failed: ' + scriptName + ' not found');
    }

    handlers.log('🔗 Runtime import: ' + functionNames.join(', ') + ' from ' + sourceScript.name);

    // Use library source as-is. Do NOT run a global .replace(/\\n/g, '\n') here: it
    // corrupts valid code such as .split("\\r\\n") by turning the \\n inside string
    // literals into real newlines.
    var extractedFunctions = extractFunctions(sourceScript.code, functionNames);
    var injectedCode = '// Runtime imported from: ' + sourceScript.name + '\n' + extractedFunctions + '\n';

    return spliceAt(code, statement, injectedCode);
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
          processedCode = spliceAt(processedCode, imp.statement, '// Import failed: Script not found');
        } else {
          handlers.warn('Wildcard import: Core library not found');
          processedCode = spliceAt(processedCode, imp.statement, '// Import failed: Core library not found');
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
    findDocBlockRanges: findDocBlockRanges,
    stripImports: stripImports,
    findScript: findScript,
    listFunctionNames: listFunctionNames,
    extractFunctions: extractFunctions,
    extractFunctionMap: extractFunctionMap,
    resolveImports: resolveImports
  };
});
