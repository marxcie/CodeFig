// @Pattern Matching
// @DOC_START
// Pattern matching and wildcard processing for names and collections.
//
// ## Overview
// Import for matching text against patterns (exact, partial, regex, glob, fuzzy), escaping wildcards, filtering by collection, and normalizing patterns. Used by replace-styles and find-and-replace scripts. No configuration; use via @import.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | **Find/replace (use these)** | nameMatches, renameByPattern, patternToRegex, patternMode, patternModeNote |
// | Matching | matchPattern, compilePattern, expandWildcards, escapeWildcards |
// | Filtering | filterByCollection, getCollections, validateCollection |
// | Advanced | fuzzyMatch, regexMatch, globMatch, wildcardMatch |
// | Rename/Replace | applyFigmaPlaceholders, replaceWithPattern |
//
// ## Search patterns
// | Input | Meaning |
// |-------|---------|
// | text          | Matches names containing that text (case-insensitive). |
// | V4/*/Primary  | * matches any characters. CodeFig extension; Figma has no wildcard. |
// | (\w+)-(\d+)   | Regular expression — only when "Use regular expression" is ticked. |
// | (blank find)  | Replaces the entire name. |
//
// ## Replacement tokens
// $&  whole match      $1 $2  capture groups (regex mode only)
// $n $nn $nnn  ascending      $N $NN $NNN  descending
//
// The mode is never guessed from the text: brackets and parens in a name are literal
// unless useRegex is set. nameMatches and renameByPattern are the single semantic every
// find/replace script uses — do not write a local matcher.
// @DOC_END

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Shape of PatternOptions (documentation only — CodeFig scripts are plain JS).
 * exact?: boolean;           // Exact match vs partial match
 * caseSensitive?: boolean;   // Case sensitivity
 * fuzzy?: boolean;          // Enable fuzzy matching
 * regex?: boolean;          // Treat pattern as regex
 * glob?: boolean;           // Treat pattern as glob
 */

/**
 * Shape of MatchResult (documentation only — CodeFig scripts are plain JS).
 * match: boolean;           // Whether it matches
 * confidence: number;       // Match confidence (0-1)
 * groups?: string[];        // Captured groups
 * score?: number;          // Fuzzy match score
 */

/**
 * Shape of CollectionFilter (documentation only — CodeFig scripts are plain JS).
 * name?: string;            // Collection name pattern
 * id?: string;             // Collection ID
 * mode?: string;           // Collection mode
 * exact?: boolean;         // Exact match
 */

// ============================================================================
// SHARED FIND / REPLACE — one semantic for every find-replace script
// ============================================================================
//
// Three modes, never guessed:
//   literal   (default)         "V4/*/Primary" is that exact text
//   wildcard  (pattern has *)   "V4/" + anything + "/Primary"
//   regex     (opts.useRegex)   a full JS regular expression
//
// Auto-detection used to infer regex from metacharacters, which silently mangled
// ordinary names: searchFor "Text [Legacy]" treated [Legacy] as a character class and
// rewrote the unrelated "Text Legacy Body" to "Textegacy Body". A mode is now a choice.
//
// Options object, shared by all three functions:
//   useRegex   treat the pattern as a regular expression       (default false)
//   matchCase  case-sensitive                                  (default false)
//   wholeName  anchor to the whole name instead of a substring (default false)

/** Mode a pattern resolves to: 'regex' | 'wildcard' | 'literal'. */
function patternMode(pattern, opts) {
  var o = opts || {};
  if (o.useRegex) return 'regex';
  var p = pattern == null ? '' : String(pattern);
  return p.indexOf('*') !== -1 ? 'wildcard' : 'literal';
}

/**
 * The regex a pattern compiles to — for matching, for logging, and for previewing.
 * An unparseable regex falls back to the literal text: a typo in regex mode must not
 * turn into a pattern that matches something unintended.
 */
function patternToRegex(pattern, opts) {
  var o = opts || {};
  var p = pattern == null ? '' : String(pattern);
  var flags = o.matchCase ? 'g' : 'gi';
  var mode = patternMode(p, o);
  var source;

  if (mode === 'regex') {
    source = p;
  } else if (mode === 'wildcard') {
    // Un-escape \* rather than converting a bare *: escapeWildcards has already turned
    // * into \*, so /\*/ would match the escaped form and produce \.* ("zero or more
    // literal dots"), killing every wildcard. Same correction as commit 55197f7.
    source = escapeWildcards(p).replace(/\\\*/g, '.*');
  } else {
    source = escapeWildcards(p);
  }

  if (o.wholeName) source = '^(?:' + source + ')$';

  try {
    return new RegExp(source, flags);
  } catch (e) {
    var literal = escapeWildcards(p);
    return new RegExp(o.wholeName ? '^(?:' + literal + ')$' : literal, flags);
  }
}

/**
 * Does `name` match `pattern`? Substring by default, like Figma's Match field.
 * A blank pattern matches everything — a filter nobody filled in is not a filter.
 */
function nameMatches(name, pattern, opts) {
  var p = pattern == null ? '' : String(pattern);
  if (p.trim() === '') return true;
  return patternToRegex(p, opts).test(name == null ? '' : String(name));
}

/**
 * Apply find/replace to one name, replacing every occurrence.
 * A blank `find` replaces the entire name, which is what Figma's blank Match does.
 * `index` (0-based) and `total` drive the $n / $N counters; they are per item, so every
 * occurrence within one name gets the same counter value.
 */
function renameByPattern(name, find, replace, index, total, opts) {
  var text = name == null ? '' : String(name);
  var replacePattern = replace == null ? '' : String(replace);
  var findPattern = find == null ? '' : String(find);
  var i = typeof index === 'number' ? index : 0;
  var t = typeof total === 'number' ? total : 1;

  if (findPattern === '') {
    return applyFigmaPlaceholders(replacePattern, {
      fullMatch: text,
      groups: [],
      index: i,
      total: t
    });
  }

  var regex = patternToRegex(findPattern, opts);
  var out = '';
  var lastEnd = 0;
  var matched = false;
  var match;

  // Spliced by hand rather than via String.replace: the replacement text is already
  // expanded, so handing it to .replace() would let a $ inside a matched name trigger a
  // second round of substitution.
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    matched = true;
    out += text.slice(lastEnd, match.index);
    out += applyFigmaPlaceholders(replacePattern, {
      fullMatch: match[0],
      groups: match.slice(1),
      index: i,
      total: t
    });
    lastEnd = match.index + match[0].length;
    if (match[0] === '') regex.lastIndex++; // zero-length match: step forward or loop forever
  }

  if (!matched) return text;
  return out + text.slice(lastEnd);
}

/**
 * Note to log when a pattern contains regex metacharacters but regex mode is off, or ''.
 * Turns the silent no-op ("my (\w+)-(\d+) pattern renames nothing") into an explanation.
 */
function patternModeNote(pattern, opts) {
  var o = opts || {};
  if (o.useRegex) return '';
  var p = pattern == null ? '' : String(pattern);
  if (p === '' || !looksLikeRegex(p.replace(/\*/g, ''))) return '';
  return 'Note: "' + p + '" is treated as literal text' +
    (p.indexOf('*') !== -1 ? ' with * wildcards' : '') +
    '. Tick "Use regular expression" to treat it as a pattern.';
}

// ============================================================================
// PATTERN MATCHING FUNCTIONS
// ============================================================================
//
// Legacy surface below. Kept for user scripts that already call it; shipped scripts use
// nameMatches / renameByPattern instead. Unused by any shipped script, and removable
// once nothing references them: fuzzyMatch, globMatch, globToRegex, calculateFuzzyScore,
// levenshteinDistance, expandWildcards, filterByCollection, getCollections,
// getPatternStats, createPattern, splitPattern, validatePattern, processWildcards,
// normalizePattern. Still used directly: escapeWildcards, applyFigmaPlaceholders.

/**
 * Match text against pattern with various matching strategies.
 * Legacy entry point. Its default (no options) is a **whole-name** wildcard match, which
 * is why callers wanting "contains" had to wrap the pattern in asterisks — use
 * nameMatches instead, which is substring by default.
 */
function matchPattern(text, pattern, options = {}) {
  const {
    exact = false,
    caseSensitive = false,
    fuzzy = false,
    regex = false,
    glob = false
  } = options;

  let searchText = text;
  let searchPattern = pattern;

  // Normalize case
  if (!caseSensitive) {
    searchText = text.toLowerCase();
    searchPattern = pattern.toLowerCase();
  }

  // Exact match
  if (exact) {
    return {
      match: searchText === searchPattern,
      confidence: searchText === searchPattern ? 1.0 : 0.0
    };
  }

  // Regex match
  if (regex) {
    return regexMatch(searchText, searchPattern);
  }

  // Glob match
  if (glob) {
    return globMatch(searchText, searchPattern);
  }

  // Fuzzy match
  if (fuzzy) {
    return fuzzyMatch(searchText, searchPattern);
  }

  // Default wildcard match
  return wildcardMatch(searchText, searchPattern);
}

/**
 * Compile pattern for efficient matching
 */
function compilePattern(pattern, options = {}) {
  const { caseSensitive = false, regex = false, glob = false } = options;

  if (regex) {
    return new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  }

  if (glob) {
    return globToRegex(pattern, caseSensitive);
  }

  // Default wildcard pattern. Un-escape \* rather than converting a bare * —
  // escapeWildcards has already turned * into \*, so /\*/ would match the escaped
  // form and produce \.* ("zero or more literal dots"), killing every wildcard.
  // globToRegex below has always done this correctly; this line did not.
  const escapedPattern = escapeWildcards(pattern);
  const regexPattern = escapedPattern.replace(/\\\*/g, '.*');
  return new RegExp(`^${regexPattern}$`, caseSensitive ? 'g' : 'gi');
}

/**
 * Expand wildcards in pattern
 */
function expandWildcards(pattern, candidates) {
  const regex = compilePattern(pattern);
  return candidates.filter(candidate => regex.test(candidate));
}

// ============================================================================
// COLLECTION FILTERING FUNCTIONS
// ============================================================================

/**
 * Filter items by collection
 */
function filterByCollection(
  items,
  filter
) {
  const { name, exact = false } = filter;

  if (!name) return items;

  return items.filter(item => {
    const itemName = item.name;
    const filterName = name;

    if (exact) {
      return itemName === filterName;
    }

    // Check if collection name is contained in item name
    return itemName.toLowerCase().includes(filterName.toLowerCase());
  });
}

/**
 * Get all collections from items
 */
function getCollections(items) {
  const collections = new Set();

  for (const item of items) {
    const collection = extractCollection(item.name);
    collections.add(collection);
  }

  return Array.from(collections).sort();
}

/**
 * Validate collection exists
 */
function validateCollection(collectionName, availableCollections) {
  return availableCollections.some(collection => 
    collection.toLowerCase().includes(collectionName.toLowerCase())
  );
}

// ============================================================================
// WILDCARD PROCESSING FUNCTIONS
// ============================================================================

/**
 * Process wildcards in pattern
 */
function processWildcards(pattern, options = {}) {
  let processed = pattern;

  if (options.escape) {
    processed = escapeWildcards(processed);
  }

  if (options.normalize) {
    processed = normalizePattern(processed);
  }

  return processed;
}

/**
 * Escape special characters in pattern
 */
function escapeWildcards(pattern) {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize pattern for consistent matching
 */
function normalizePattern(pattern) {
  return pattern
    .trim()
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/\/+/g, '/')  // Normalize path separators
    .replace(/\/$/, '');   // Remove trailing slash
}

// ============================================================================
// ADVANCED MATCHING FUNCTIONS
// ============================================================================

/**
 * Fuzzy match with scoring
 */
function fuzzyMatch(text, pattern) {
  const score = calculateFuzzyScore(text, pattern);
  const threshold = 0.6; // Minimum score for match

  return {
    match: score >= threshold,
    confidence: score,
    score
  };
}

/**
 * Regex match with groups
 */
function regexMatch(text, pattern) {
  try {
    const regex = new RegExp(pattern, 'g');
    const match = regex.exec(text);

    if (match) {
      return {
        match: true,
        confidence: 1.0,
        groups: match.slice(1) // Exclude full match
      };
    }

    return {
      match: false,
      confidence: 0.0
    };
  } catch (error) {
    console.warn('Invalid regex pattern:', pattern, error);
    return {
      match: false,
      confidence: 0.0
    };
  }
}

/**
 * Glob match with pattern expansion
 */
function globMatch(text, pattern) {
  const regex = globToRegex(pattern);
  const match = regex.test(text);

  return {
    match,
    confidence: match ? 1.0 : 0.0
  };
}

/**
 * Wildcard match with confidence scoring.
 * Whole-name, via patternToRegex, so there is one wildcard implementation.
 */
function wildcardMatch(text, pattern) {
  const p = pattern == null ? '' : String(pattern);
  // A blank pattern anchored to the whole name matched only an empty name here, whereas
  // nameMatches reads blank as "no filter". Keep the legacy answer for this entry point.
  const match = p === '' ? String(text || '') === '' : nameMatches(text, p, { wholeName: true });

  if (!match) {
    return {
      match: false,
      confidence: 0.0
    };
  }

  // Calculate confidence based on pattern complexity
  const wildcardCount = (pattern.match(/\*/g) || []).length;
  const exactParts = pattern.split('*').filter(part => part.length > 0);
  
  let score = 0;
  for (const part of exactParts) {
    if (text.includes(part)) {
      score += part.length;
    }
  }
  
  const confidence = Math.min(score / text.length, 1);
  
  return {
    match: true,
    confidence
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate fuzzy match score
 */
function calculateFuzzyScore(text, pattern) {
  if (pattern.length === 0) return 1.0;
  if (text.length === 0) return 0.0;

  const textLower = text.toLowerCase();
  const patternLower = pattern.toLowerCase();

  // Simple Levenshtein distance-based scoring
  const distance = levenshteinDistance(textLower, patternLower);
  const maxLength = Math.max(text.length, pattern.length);
  
  return 1 - (distance / maxLength);
}

/**
 * Calculate Levenshtein distance
 */
function levenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Convert glob pattern to regex
 */
function globToRegex(pattern, caseSensitive = false) {
  // Escape special regex characters
  let regex = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Convert glob patterns
  regex = regex.replace(/\\\*/g, '.*');           // * -> .*
  regex = regex.replace(/\\\?/g, '.');            // ? -> .
  regex = regex.replace(/\\\[([^\]]+)\\\]/g, '[$1]'); // [abc] -> [abc]
  regex = regex.replace(/\\\{([^}]+)\\\}/g, '($1)');  // {a,b} -> (a|b)
  
  return new RegExp(`^${regex}$`, caseSensitive ? 'g' : 'gi');
}

/**
 * Extract collection name from item name
 */
function extractCollection(itemName) {
  const parts = itemName.split('/');
  return parts[0] || 'Default';
}

/**
 * Create pattern from multiple parts
 */
function createPattern(parts, separator = '/') {
  return parts.filter(part => part && part.trim()).join(separator);
}

/**
 * Split pattern into parts
 */
function splitPattern(pattern, separator = '/') {
  return pattern.split(separator).map(part => part.trim()).filter(part => part);
}

/**
 * Validate pattern syntax
 */
function validatePattern(pattern, type = 'wildcard') {
  try {
    switch (type) {
      case 'regex':
        new RegExp(pattern);
        return true;
      case 'glob':
        globToRegex(pattern);
        return true;
      case 'wildcard':
      default:
        compilePattern(pattern);
        return true;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Get pattern statistics
 */
function getPatternStats(pattern) {
  const wildcards = (pattern.match(/\*/g) || []).length;
  const exactParts = pattern.split('*').filter(part => part.length > 0).length;
  const complexity = wildcards + exactParts;
  const length = pattern.length;

  return {
    wildcards,
    exactParts,
    complexity,
    length
  };
}

// ============================================================================
// FIGMA PLACEHOLDER SUPPORT (for batch rename)
// ============================================================================

/**
 * Shape of FigmaPlaceholderContext (documentation only — CodeFig scripts are plain JS).
 * fullMatch: string;   // $&
 * groups: string[];   // $1, $2, ...
 * index: number;      // 0-based position
 * total: number;      // total items
 */

/**
 * Detect if pattern looks like regex (contains unescaped regex metacharacters)
 */
function looksLikeRegex(pattern) {
  const regexMeta = /[()[\]{}*+?^$|\\.]/;
  let escaped = false;
  for (let i = 0; i < pattern.length; i++) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (pattern[i] === '\\') {
      escaped = true;
      continue;
    }
    if (regexMeta.test(pattern[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Apply Figma-style placeholders to a replace pattern.
 * Placeholders: $& (full match), $1 $2 (groups), $n $nn $nnn (ascending), $N $NN $NNN (descending)
 */
function applyFigmaPlaceholders(
  replacePattern,
  context
) {
  let result = replacePattern;
  const { fullMatch, groups, index, total } = context;

  // $& - full match
  result = result.replace(/\$&/g, fullMatch);

  // $1, $2, ... - capture groups
  for (let i = 0; i < groups.length; i++) {
    const re = new RegExp('\\$' + (i + 1) + '(?![0-9])', 'g');
    result = result.replace(re, groups[i] || '');
  }

  // Ascending: $nnn, $nn, $n (replace longest first)
  const ascVal = index + 1;
  result = result.replace(/\$nnn/g, String(ascVal).padStart(3, '0'));
  result = result.replace(/\$nn/g, String(ascVal).padStart(2, '0'));
  result = result.replace(/\$n(?![nN0-9])/g, String(ascVal));

  // Descending: $NNN, $NN, $N
  const descVal = total - index;
  result = result.replace(/\$NNN/g, String(descVal).padStart(3, '0'));
  result = result.replace(/\$NN(?![0-9])/g, String(descVal).padStart(2, '0'));
  result = result.replace(/\$N(?![nN0-9])/g, String(descVal));

  return result;
}

/**
 * Apply search/replace to text with Figma placeholders.
 * index and total are 0-based / count; used for $n, $nn, $nnn, $N, $NN, $NNN.
 *
 * Thin wrapper over renameByPattern, kept for scripts that already call it. The one
 * behaviour change: regex is **no longer auto-detected** from metacharacters — pass
 * `{ useRegex: true }` for a pattern. Auto-detection is what let "Text [Legacy]" mangle
 * "Text Legacy Body"; see the SHARED FIND / REPLACE header.
 */
function replaceWithPattern(
  text,
  searchPattern,
  replacePattern,
  index = 0,
  total = 1,
  opts = {}
) {
  return renameByPattern(text, searchPattern, replacePattern, index, total, opts);
}
