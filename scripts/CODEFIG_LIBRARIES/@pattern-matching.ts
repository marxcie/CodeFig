// @Pattern Matching
// @DOC_START
// # @Pattern Matching
// Pattern matching and wildcard processing for names and collections.
//
// ## Overview
// Import for matching text against patterns (exact, partial, regex, glob, fuzzy), escaping wildcards, filtering by collection, and normalizing patterns. Used by replace-styles and find-and-replace scripts. No configuration; use via @import.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Matching | matchPattern, compilePattern, expandWildcards, escapeWildcards |
// | Filtering | filterByCollection, getCollections, validateCollection |
// | Advanced | fuzzyMatch, regexMatch, globMatch, wildcardMatch |
// | Rename/Replace | applyFigmaPlaceholders, replaceWithPattern |
// @DOC_END

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface PatternOptions {
  exact?: boolean;           // Exact match vs partial match
  caseSensitive?: boolean;   // Case sensitivity
  fuzzy?: boolean;          // Enable fuzzy matching
  regex?: boolean;          // Treat pattern as regex
  glob?: boolean;           // Treat pattern as glob
}

interface MatchResult {
  match: boolean;           // Whether it matches
  confidence: number;       // Match confidence (0-1)
  groups?: string[];        // Captured groups
  score?: number;          // Fuzzy match score
}

interface CollectionFilter {
  name?: string;            // Collection name pattern
  id?: string;             // Collection ID
  mode?: string;           // Collection mode
  exact?: boolean;         // Exact match
}

// ============================================================================
// PATTERN MATCHING FUNCTIONS
// ============================================================================

/**
 * Match text against pattern with various matching strategies
 */
function matchPattern(text: string, pattern: string, options: PatternOptions = {}): MatchResult {
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
function compilePattern(pattern: string, options: PatternOptions = {}): RegExp {
  const { caseSensitive = false, regex = false, glob = false } = options;

  if (regex) {
    return new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  }

  if (glob) {
    return globToRegex(pattern, caseSensitive);
  }

  // Default wildcard pattern
  const escapedPattern = escapeWildcards(pattern);
  const regexPattern = escapedPattern.replace(/\*/g, '.*');
  return new RegExp(`^${regexPattern}$`, caseSensitive ? 'g' : 'gi');
}

/**
 * Expand wildcards in pattern
 */
function expandWildcards(pattern: string, candidates: string[]): string[] {
  const regex = compilePattern(pattern);
  return candidates.filter(candidate => regex.test(candidate));
}

// ============================================================================
// COLLECTION FILTERING FUNCTIONS
// ============================================================================

/**
 * Filter items by collection
 */
function filterByCollection<T extends { name: string }>(
  items: T[],
  filter: CollectionFilter
): T[] {
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
function getCollections<T extends { name: string }>(items: T[]): string[] {
  const collections = new Set<string>();

  for (const item of items) {
    const collection = extractCollection(item.name);
    collections.add(collection);
  }

  return Array.from(collections).sort();
}

/**
 * Validate collection exists
 */
function validateCollection(collectionName: string, availableCollections: string[]): boolean {
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
function processWildcards(pattern: string, options: { escape?: boolean; normalize?: boolean } = {}): string {
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
function escapeWildcards(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize pattern for consistent matching
 */
function normalizePattern(pattern: string): string {
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
function fuzzyMatch(text: string, pattern: string): MatchResult {
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
function regexMatch(text: string, pattern: string): MatchResult {
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
function globMatch(text: string, pattern: string): MatchResult {
  const regex = globToRegex(pattern);
  const match = regex.test(text);

  return {
    match,
    confidence: match ? 1.0 : 0.0
  };
}

/**
 * Wildcard match with confidence scoring
 */
function wildcardMatch(text: string, pattern: string): MatchResult {
  const regex = compilePattern(pattern);
  const match = regex.test(text);

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
function calculateFuzzyScore(text: string, pattern: string): number {
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
function levenshteinDistance(str1: string, str2: string): number {
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
function globToRegex(pattern: string, caseSensitive: boolean = false): RegExp {
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
function extractCollection(itemName: string): string {
  const parts = itemName.split('/');
  return parts[0] || 'Default';
}

/**
 * Create pattern from multiple parts
 */
function createPattern(parts: string[], separator: string = '/'): string {
  return parts.filter(part => part && part.trim()).join(separator);
}

/**
 * Split pattern into parts
 */
function splitPattern(pattern: string, separator: string = '/'): string[] {
  return pattern.split(separator).map(part => part.trim()).filter(part => part);
}

/**
 * Validate pattern syntax
 */
function validatePattern(pattern: string, type: 'wildcard' | 'regex' | 'glob' = 'wildcard'): boolean {
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
function getPatternStats(pattern: string): {
  wildcards: number;
  exactParts: number;
  complexity: number;
  length: number;
} {
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

interface FigmaPlaceholderContext {
  fullMatch: string;   // $&
  groups: string[];   // $1, $2, ...
  index: number;      // 0-based position
  total: number;      // total items
}

/**
 * Detect if pattern looks like regex (contains unescaped regex metacharacters)
 */
function looksLikeRegex(pattern: string): boolean {
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
  replacePattern: string,
  context: FigmaPlaceholderContext
): string {
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
 * Apply search/replace to text with optional Figma placeholders.
 * Auto-detects regex: if searchPattern contains regex metacharacters, treats as regex.
 * index and total are 0-based / count; used for $n, $nn, $nnn, $N, $NN, $NNN.
 */
function replaceWithPattern(
  text: string,
  searchPattern: string,
  replacePattern: string,
  index: number = 0,
  total: number = 1
): string {
  const useRegex = looksLikeRegex(searchPattern);
  let fullMatch = '';
  let groups: string[] = [];

  if (useRegex) {
    try {
      const regex = new RegExp(searchPattern, 'g');
      const match = regex.exec(text);
      if (match) {
        fullMatch = match[0];
        groups = match.slice(1);
        const context: FigmaPlaceholderContext = { fullMatch, groups, index, total };
        const replacement = applyFigmaPlaceholders(replacePattern, context);
        return text.replace(regex, replacement);
      }
    } catch (e) {
      // Fall back to literal
    }
  }

  // Literal replace (escape special regex chars, support * as wildcard)
  const escaped = escapeWildcards(searchPattern).replace(/\\\*/g, '.*');
  const literalRegex = new RegExp(escaped, 'gi');
  const match = literalRegex.exec(text);
  if (!match) {
    return text;
  }
  fullMatch = match[0];
  groups = match.slice(1);
  const context: FigmaPlaceholderContext = { fullMatch, groups, index, total };
  const replacement = applyFigmaPlaceholders(replacePattern, context);
  return text.replace(literalRegex, replacement);
}
