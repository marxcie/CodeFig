// @Styles
// @DOC_START
// # @Styles
// Style finding, analysis, replacement, and operations.
//
// ## Overview
// Import to search styles by pattern/collection/type (findStyles, findStylesByPattern, getStyleById), analyze and categorize (analyzeStyles, categorizeStyle, getStyleProperties), replace on nodes (replaceStyles, applyStyleToNode, validateStyleMatch), and inspect usage (createStylePreview, getStyleUsage, getStyleHierarchy). No configuration; use via @import.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Finding | findStyles, findStylesByPattern, getStyleById, findStylesInCollection |
// | Analysis | analyzeStyles, categorizeStyle, getStyleProperties |
// | Replacement | replaceStyles, applyStyleToNode, validateStyleMatch |
// | Operations | createStylePreview, getStyleUsage, getStyleHierarchy |
// @DOC_END

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface StyleSearchOptions {
  pattern?: string;           // Wildcard pattern (e.g., "V4/*", "Brand/typography/*")
  collection?: string;        // Collection name filter
  type?: 'TEXT' | 'PAINT' | 'EFFECT' | 'GRID'; // Style type filter
  exact?: boolean;           // Exact match vs partial match
  caseSensitive?: boolean;   // Case sensitivity
}

interface StyleMatch {
  style: any;                // Figma style object
  name: string;              // Style name
  type: string;              // Style type
  collection: string;         // Collection name
  confidence: number;        // Match confidence (0-1)
  properties: any;           // Style properties
}

interface StyleReplacement {
  node: any;                 // Target node
  property: string;          // Property to replace (e.g., 'textStyleId')
  oldStyle: any;             // Current style
  newStyle: any;             // Replacement style
  success: boolean;          // Replacement success
  error?: string;            // Error message if failed
}

interface StyleAnalysisResult {
  matches: StyleMatch[];
  totalMatches: number;
  collections: Set<string>;
  types: Set<string>;
  nodesAffected: Set<string>;
}

// ============================================================================
// STYLE FINDING FUNCTIONS
// ============================================================================

/**
 * Find styles by pattern with advanced filtering (async for documentAccess: dynamic-page)
 */
function findStyles(options: StyleSearchOptions = {}): Promise<StyleMatch[]> {
  const {
    pattern = '*',
    collection,
    type,
    exact = false,
    caseSensitive = false
  } = options;

  return Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync()
  ]).then(([text, paint, effect, grid]) => {
    const allStyles = [...text, ...paint, ...effect, ...grid];
    const matches: StyleMatch[] = [];

    for (const style of allStyles) {
      if (!style.name) continue;

      if (type && style.type !== type) continue;
      if (collection && !style.name.toLowerCase().includes(collection.toLowerCase())) continue;

      const match = matchPattern(style.name, pattern, { exact, caseSensitive });
      if (match) {
        matches.push({
          style,
          name: style.name,
          type: style.type,
          collection: extractCollection(style.name),
          confidence: match.confidence,
          properties: getStyleProperties(style)
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  });
}

/**
 * Find styles by wildcard pattern
 */
function findStylesByPattern(pattern: string, options: Omit<StyleSearchOptions, 'pattern'> = {}): Promise<StyleMatch[]> {
  return findStyles({ ...options, pattern });
}

/**
 * Find styles in specific collection
 */
function findStylesInCollection(collection: string, options: Omit<StyleSearchOptions, 'collection'> = {}): Promise<StyleMatch[]> {
  return findStyles({ ...options, collection });
}

/**
 * Get style by ID with error handling (async for documentAccess: dynamic-page)
 */
async function getStyleById(styleId: string): Promise<any | null> {
  try {
    return await figma.getStyleByIdAsync(styleId);
  } catch (error) {
    console.warn(`Failed to get style by ID ${styleId}:`, error);
    return null;
  }
}

// ============================================================================
// STYLE ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze styles in selection (async for documentAccess: dynamic-page)
 */
async function analyzeStyles(selection: ReadonlyArray<any>): Promise<StyleAnalysisResult> {
  const matches: StyleMatch[] = [];
  const collections = new Set<string>();
  const types = new Set<string>();
  const nodesAffected = new Set<string>();

  const allNodes = collectAllNodes(selection);

  for (const node of allNodes) {
    if (!node.boundVariables && !hasStyleProperties(node)) continue;

    if (node.boundVariables) {
      for (const [property, binding] of Object.entries(node.boundVariables)) {
        if (!binding) continue;
        const variableId = binding.id || (binding[0] && binding[0].id);
        if (!variableId) continue;
        const variable = await figma.variables.getVariableByIdAsync(variableId);
        if (!variable) continue;
        const styleMatches = await findMatchingStylesForVariable(variable, property);
        matches.push(...styleMatches);
        styleMatches.forEach(match => {
          collections.add(match.collection);
          types.add(match.type);
        });
      }
    }

    const styleProperties = getNodeStyleProperties(node);
    for (const [property, styleId] of Object.entries(styleProperties)) {
      if (!styleId || styleId === figma.mixed) continue;
      const style = await getStyleById(styleId);
      if (!style) continue;
      matches.push({
        style,
        name: style.name,
        type: style.type,
        collection: extractCollection(style.name),
        confidence: 1.0,
        properties: getStyleProperties(style)
      });
      collections.add(extractCollection(style.name));
      types.add(style.type);
    }

    nodesAffected.add(node.id);
  }

  return {
    matches: uniqueBy(matches, 'style.id'),
    totalMatches: matches.length,
    collections,
    types,
    nodesAffected
  };
}

/**
 * Categorize style by name and properties
 */
function categorizeStyle(style: any): string {
  const name = style.name.toLowerCase();
  
  if (name.includes('typography') || name.includes('text') || name.includes('font')) {
    return 'Typography';
  } else if (name.includes('color') || name.includes('fill') || name.includes('background')) {
    return 'Colors';
  } else if (name.includes('spacing') || name.includes('margin') || name.includes('padding')) {
    return 'Spacing';
  } else if (name.includes('shadow') || name.includes('blur') || name.includes('effect')) {
    return 'Effects';
  } else if (name.includes('grid') || name.includes('layout')) {
    return 'Layout';
  } else {
    return 'Other';
  }
}

/**
 * Get style properties for analysis
 */
function getStyleProperties(style: any): any {
  const properties: any = {
    type: style.type,
    name: style.name,
    id: style.id
  };

  if (style.type === 'TEXT') {
    properties.fontFamily = style.fontName?.family;
    properties.fontSize = style.fontSize;
    properties.fontWeight = style.fontWeight;
    properties.lineHeight = style.lineHeight;
  } else if (style.type === 'PAINT') {
    properties.paints = style.paints;
  } else if (style.type === 'EFFECT') {
    properties.effects = style.effects;
  } else if (style.type === 'GRID') {
    properties.layoutGrids = style.layoutGrids;
  }

  return properties;
}

// ============================================================================
// STYLE REPLACEMENT FUNCTIONS
// ============================================================================

/**
 * Replace styles in selection (async for documentAccess: dynamic-page)
 */
async function replaceStyles(
  selection: ReadonlyArray<any>,
  findPattern: string,
  replacePattern: string,
  options: {
    property?: string;
    collection?: string;
    type?: string;
    dryRun?: boolean;
  } = {}
): Promise<StyleReplacement[]> {
  const {
    property,
    collection,
    type,
    dryRun = false
  } = options;

  const replacements: StyleReplacement[] = [];
  const allNodes = collectAllNodes(selection);

  const styleMatches = await findStylesByPattern(findPattern, { collection, type });

  for (const node of allNodes) {
    const nodeReplacements = await replaceStylesInNode(node, styleMatches, replacePattern, { property, dryRun });
    replacements.push(...nodeReplacements);
  }

  return replacements;
}

/**
 * Replace styles in a single node (async for findStyleByName)
 */
async function replaceStylesInNode(
  node: any,
  styleMatches: StyleMatch[],
  replacePattern: string,
  options: { property?: string; dryRun?: boolean } = {}
): Promise<StyleReplacement[]> {
  const { property, dryRun = false } = options;
  const replacements: StyleReplacement[] = [];

  if (node.boundVariables) {
    for (const [prop, binding] of Object.entries(node.boundVariables)) {
      if (property && prop !== property) continue;
      if (!binding) continue;
      const variableId = binding.id || (binding[0] && binding[0].id);
      if (!variableId) continue;
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) continue;
      const matchingStyle = findMatchingStyleForVariable(variable, styleMatches);
      if (matchingStyle) {
        const newStyleName = generateReplacementName(matchingStyle.name, replacePattern);
        const newStyle = await findStyleByName(newStyleName);
        if (newStyle) {
          const replacement: StyleReplacement = {
            node,
            property: prop,
            oldStyle: matchingStyle.style,
            newStyle,
            success: false
          };

          if (!dryRun) {
            replacement.success = await applyStyleToNode(node, prop, newStyle);
          } else {
            replacement.success = true; // Assume success for dry run
          }

          replacements.push(replacement);
        }
      }
    }
  }

  const styleProperties = getNodeStyleProperties(node);
  for (const [prop, styleId] of Object.entries(styleProperties)) {
    if (property && prop !== property) continue;
    if (!styleId || styleId === figma.mixed) continue;
    const currentStyle = await getStyleById(styleId);
    if (!currentStyle) continue;
    const matchingStyle = styleMatches.find(match => match.style.id === styleId);
    if (matchingStyle) {
      const newStyleName = generateReplacementName(currentStyle.name, replacePattern);
      const newStyle = await findStyleByName(newStyleName);
      if (newStyle) {
        const replacement: StyleReplacement = {
          node,
          property: prop,
          oldStyle: currentStyle,
          newStyle,
          success: false
        };

        if (!dryRun) {
          replacement.success = await applyStyleToNode(node, prop, newStyle);
        } else {
          replacement.success = true; // Assume success for dry run
        }

        replacements.push(replacement);
      }
    }
  }

  return replacements;
}

/**
 * Apply style to node (async for documentAccess: dynamic-page)
 */
async function applyStyleToNode(node: any, property: string, style: any): Promise<boolean> {
  try {
    if (property === 'textStyleId' && style.type === 'TEXT') {
      await node.setTextStyleIdAsync(style.id);
      return true;
    } else if (property === 'fillStyleId' && style.type === 'PAINT') {
      await node.setFillStyleIdAsync(style.id);
      return true;
    } else if (property === 'strokeStyleId' && style.type === 'PAINT') {
      await node.setStrokeStyleIdAsync(style.id);
      return true;
    } else if (property === 'effectStyleId' && style.type === 'EFFECT') {
      await node.setEffectStyleIdAsync(style.id);
      return true;
    } else if (property === 'layoutGrids' && style.type === 'GRID') {
      node.layoutGrids = style.layoutGrids;
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Failed to apply style to ${node.name}:`, error);
    return false;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if node has style properties
 */
function hasStyleProperties(node: any): boolean {
  return 'textStyleId' in node || 'fillStyleId' in node || 'strokeStyleId' in node || 'effectStyleId' in node;
}

/**
 * Get node style properties
 */
function getNodeStyleProperties(node: any): { [key: string]: any } {
  const properties: { [key: string]: any } = {};
  
  if ('textStyleId' in node) properties.textStyleId = node.textStyleId;
  if ('fillStyleId' in node) properties.fillStyleId = node.fillStyleId;
  if ('strokeStyleId' in node) properties.strokeStyleId = node.strokeStyleId;
  if ('effectStyleId' in node) properties.effectStyleId = node.effectStyleId;
  if ('layoutGrids' in node) properties.layoutGrids = node.layoutGrids;
  
  return properties;
}

/**
 * Find matching styles for variable (async for documentAccess: dynamic-page)
 */
function findMatchingStylesForVariable(variable: any, property: string): Promise<StyleMatch[]> {
  return Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync()
  ]).then(([text, paint, effect, grid]) => {
    const allStyles = [...text, ...paint, ...effect, ...grid];
    const matches: StyleMatch[] = [];
    const variableName = variable.name.toLowerCase();

    for (const style of allStyles) {
      if (!style.name) continue;
      const styleName = style.name.toLowerCase();
      if (styleName.includes(variableName) || variableName.includes(styleName)) {
        matches.push({
          style,
          name: style.name,
          type: style.type,
          collection: extractCollection(style.name),
          confidence: 0.5,
          properties: getStyleProperties(style)
        });
      }
    }
    return matches;
  });
}

/**
 * Find matching style for variable
 */
function findMatchingStyleForVariable(variable: any, styleMatches: StyleMatch[]): StyleMatch | null {
  const variableName = variable.name.toLowerCase();
  
  for (const match of styleMatches) {
    const styleName = match.name.toLowerCase();
    if (styleName.includes(variableName) || variableName.includes(styleName)) {
      return match;
    }
  }
  
  return null;
}

/**
 * Generate replacement name from pattern
 */
function generateReplacementName(originalName: string, replacePattern: string): string {
  // Simple wildcard replacement
  // In practice, you'd want more sophisticated pattern matching
  return replacePattern.replace('*', originalName);
}

/**
 * Find style by name (async for documentAccess: dynamic-page)
 */
function findStyleByName(name: string): Promise<any | null> {
  return Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync()
  ]).then(([text, paint, effect, grid]) => {
    const allStyles = [...text, ...paint, ...effect, ...grid];
    let style = allStyles.find(s => s.name === name);
    if (style) return style;
    style = allStyles.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (style) return style;
    style = allStyles.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
    return style || null;
  });
}

/**
 * Extract collection name from style name
 */
function extractCollection(styleName: string): string {
  const parts = styleName.split('/');
  return parts[0] || 'Default';
}

/**
 * Match pattern with wildcards
 */
function matchPattern(text: string, pattern: string, options: { exact?: boolean; caseSensitive?: boolean } = {}): { confidence: number } | null {
  const { exact = false, caseSensitive = false } = options;
  
  let searchText = text;
  let searchPattern = pattern;
  
  if (!caseSensitive) {
    searchText = text.toLowerCase();
    searchPattern = pattern.toLowerCase();
  }
  
  if (exact) {
    return searchText === searchPattern ? { confidence: 1.0 } : null;
  }
  
  // Convert wildcard pattern to regex
  const regexPattern = searchPattern.replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);
  
  if (regex.test(searchText)) {
    // Calculate confidence based on how well it matches
    const wildcardCount = (pattern.match(/\*/g) || []).length;
    const exactParts = pattern.split('*').filter(part => part.length > 0);
    
    let score = 0;
    for (const part of exactParts) {
      if (searchText.includes(part)) {
        score += part.length;
      }
    }
    
    const confidence = Math.min(score / text.length, 1);
    return { confidence };
  }
  
  return null;
}

/**
 * Collect all nodes recursively
 */
function collectAllNodes(selection: ReadonlyArray<any>): any[] {
  const nodes: any[] = [];
  
  function traverse(node: any) {
    nodes.push(node);
    
    if ('children' in node) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  
  for (const node of selection) {
    traverse(node);
  }
  
  return nodes;
}

/**
 * Remove duplicates by property
 */
function uniqueBy<T>(array: T[], property: keyof T): T[] {
  const seen = new Set();
  return array.filter(item => {
    const value = item[property];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}
