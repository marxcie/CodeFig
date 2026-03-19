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
// | Variable rebind (definitions) | buildTargetVariableLookup, rebindStyleVariableBindingsOnStyle |
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

// ============================================================================
// VARIABLE REBINDING ON STYLE DEFINITIONS (text / paint / effect)
// ============================================================================
//
// Remap VARIABLE_ALIAS bindings on **local** styles to same-named variables in a target collection.
// Pass non-empty sourceCollectionName to only touch bindings whose variable lives in that collection; pass "" to consider every binding.

function bindingMatchesSourceCollectionFilter(colName, sourceCollectionName) {
  var s = sourceCollectionName != null ? String(sourceCollectionName).trim() : "";
  if (!s) return true;
  return colName === s;
}

async function resolveVariableFromAliasForStyleRebind(alias) {
  if (!alias) return null;
  if (typeof alias.id === "string") {
    try {
      return await figma.variables.getVariableByIdAsync(alias.id);
    } catch (e) {
      return null;
    }
  }
  if (typeof alias.key === "string") {
    try {
      return await figma.variables.importVariableByKeyAsync(alias.key);
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function collectionNameForVariableForStyleRebind(variable) {
  if (!variable) return "";
  try {
    var col = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    return col ? col.name : "";
  } catch (e) {
    return "";
  }
}

/**
 * Build lookup: variableName + tab + resolvedType -> replacement Variable (local or imported from library).
 */
async function buildTargetVariableLookup(targetCollectionName) {
  var name = String(targetCollectionName || "").trim();
  var map = new Map();

  var localCols = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < localCols.length; i++) {
    if (localCols[i].name !== name) continue;
    for (var j = 0; j < localCols[i].variableIds.length; j++) {
      var v = await figma.variables.getVariableByIdAsync(localCols[i].variableIds[j]);
      if (v) {
        map.set(v.name + "\t" + v.resolvedType, { variable: v });
      }
    }
  }

  if (map.size === 0 && figma.teamLibrary && typeof figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync === "function") {
    try {
      var libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      for (var c = 0; c < libs.length; c++) {
        if (libs[c].name !== name) continue;
        var lvars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libs[c].key);
        for (var k = 0; k < lvars.length; k++) {
          var lv = lvars[k];
          var ty = lv.resolvedType || "COLOR";
          map.set(lv.name + "\t" + ty, { key: lv.key, resolvedType: ty });
        }
        break;
      }
    } catch (e) {
      console.log("⚠️ Library target lookup: " + (e && e.message));
    }
  }

  var imported = new Map();
  async function getReplacement(variableName, resolvedType) {
    var key = variableName + "\t" + resolvedType;
    var entry = map.get(key);
    if (!entry) return null;
    if (entry.variable) return entry.variable;
    if (entry.key) {
      if (imported.has(key)) return imported.get(key);
      try {
        var imp = await figma.variables.importVariableByKeyAsync(entry.key);
        if (imp && imp.resolvedType === resolvedType) {
          imported.set(key, imp);
          return imp;
        }
      } catch (e) {}
    }
    return null;
  }

  return { map: map, getReplacement: getReplacement };
}

async function rebindProcessTextStyle(style, sourceName, lookup, breakUnmatched) {
  if (!style.boundVariables || style.remote) return 0;
  var n = 0;
  var props = Object.keys(style.boundVariables);
  for (var f = 0; f < props.length; f++) {
    var prop = props[f];
    var binding = style.boundVariables[prop];
    if (!binding) continue;
    var alias = Array.isArray(binding) ? binding[0] : binding;
    var current = await resolveVariableFromAliasForStyleRebind(alias);
    if (!current) continue;
    var colName = await collectionNameForVariableForStyleRebind(current);
    if (!bindingMatchesSourceCollectionFilter(colName, sourceName)) continue;
    var repl = await lookup.getReplacement(current.name, current.resolvedType);
    if (repl && repl.id !== current.id) {
      try {
        style.setBoundVariable(prop, repl);
        n++;
        console.log('  ✅ Text style "' + style.name + '" · ' + prop + " · " + current.name + " → target collection");
      } catch (e) {
        console.log("  ❌ " + style.name + " · " + prop + ": " + (e && e.message));
      }
    } else if (breakUnmatched && !repl) {
      try {
        style.setBoundVariable(prop, null);
        n++;
        console.log('  🔓 Text style "' + style.name + '" · ' + prop + " · detached (no target match)");
      } catch (e) {
        console.log("  ❌ detach " + style.name + " · " + prop + ": " + (e && e.message));
      }
    }
  }
  return n;
}

async function rebindProcessPaintStyle(style, sourceName, lookup, breakUnmatched) {
  if (!style.boundVariables || !style.boundVariables.paints || style.remote) return 0;
  var bv = style.boundVariables.paints;
  if (!Array.isArray(bv) || !style.paints || !style.paints.length) return 0;

  var paints = JSON.parse(JSON.stringify(style.paints));
  var changed = false;
  var n = 0;

  for (var j = 0; j < paints.length && j < bv.length; j++) {
    var alias = bv[j];
    if (!alias || (!alias.id && !alias.key)) continue;
    var current = await resolveVariableFromAliasForStyleRebind(alias);
    if (!current) continue;
    var colName = await collectionNameForVariableForStyleRebind(current);
    if (!bindingMatchesSourceCollectionFilter(colName, sourceName)) continue;
    if (current.resolvedType !== "COLOR") continue;
    var repl = await lookup.getReplacement(current.name, current.resolvedType);
    if (repl && repl.id !== current.id) {
      if (paints[j].type === "SOLID" || paints[j].boundVariables) {
        if (!paints[j].boundVariables) paints[j].boundVariables = {};
        paints[j].boundVariables.color = { type: "VARIABLE_ALIAS", id: repl.id };
        changed = true;
        n++;
      }
    } else if (breakUnmatched && !repl) {
      if (paints[j].boundVariables && paints[j].boundVariables.color) {
        delete paints[j].boundVariables.color;
        if (Object.keys(paints[j].boundVariables).length === 0) {
          delete paints[j].boundVariables;
        }
        changed = true;
        n++;
      }
    }
  }

  if (changed) {
    try {
      style.paints = paints;
      console.log('  ✅ Paint style "' + style.name + '" · ' + n + " color binding(s)");
    } catch (e) {
      console.log('  ❌ Paint "' + style.name + '": ' + (e && e.message));
      return 0;
    }
  }
  return n;
}

async function rebindProcessEffectStyle(style, sourceName, lookup, breakUnmatched) {
  if (style.remote || !style.effects || !style.effects.length) return 0;
  var effects = JSON.parse(JSON.stringify(style.effects));
  var ebv = style.boundVariables && style.boundVariables.effects;
  var n = 0;

  for (var j = 0; j < effects.length; j++) {
    if (ebv && Array.isArray(ebv) && ebv[j] && (ebv[j].id || ebv[j].key)) {
      var current = await resolveVariableFromAliasForStyleRebind(ebv[j]);
      if (current) {
        var colName = await collectionNameForVariableForStyleRebind(current);
        if (bindingMatchesSourceCollectionFilter(colName, sourceName)) {
          var repl = await lookup.getReplacement(current.name, current.resolvedType);
          if (repl && repl.id !== current.id) {
            var eff = effects[j];
            if (!eff.boundVariables) eff.boundVariables = {};
            var hit = false;
            for (var k in eff.boundVariables) {
              if (eff.boundVariables.hasOwnProperty(k) && eff.boundVariables[k] && eff.boundVariables[k].id === current.id) {
                eff.boundVariables[k] = { type: "VARIABLE_ALIAS", id: repl.id };
                hit = true;
                n++;
              }
            }
            if (!hit) {
              eff.boundVariables.color = { type: "VARIABLE_ALIAS", id: repl.id };
              n++;
            }
          } else if (breakUnmatched && !repl) {
            var eff2 = effects[j];
            var hit2 = false;
            if (eff2.boundVariables) {
              for (var k2 in eff2.boundVariables) {
                if (eff2.boundVariables.hasOwnProperty(k2) && eff2.boundVariables[k2] && eff2.boundVariables[k2].id === current.id) {
                  delete eff2.boundVariables[k2];
                  hit2 = true;
                  n++;
                }
              }
              if (eff2.boundVariables && Object.keys(eff2.boundVariables).length === 0) {
                delete eff2.boundVariables;
              }
            }
            if (!hit2) {
              var ev = JSON.parse(JSON.stringify(eff2));
              if (ev.boundVariables) delete ev.boundVariables;
              effects[j] = ev;
              n++;
            }
          }
        }
      }
    }
    if (!effects[j].boundVariables) continue;
    var keysToDelete = [];
    for (var key in effects[j].boundVariables) {
      if (!effects[j].boundVariables.hasOwnProperty(key)) continue;
      var ent = effects[j].boundVariables[key];
      if (!ent || typeof ent.id !== "string") continue;
      var cur2 = await resolveVariableFromAliasForStyleRebind(ent);
      if (!cur2) continue;
      var cn2 = await collectionNameForVariableForStyleRebind(cur2);
      if (!bindingMatchesSourceCollectionFilter(cn2, sourceName)) continue;
      var rep2 = await lookup.getReplacement(cur2.name, cur2.resolvedType);
      if (rep2 && rep2.id !== cur2.id) {
        effects[j].boundVariables[key] = { type: "VARIABLE_ALIAS", id: rep2.id };
        n++;
      } else if (breakUnmatched && !rep2) {
        keysToDelete.push(key);
        n++;
      }
    }
    for (var kd = 0; kd < keysToDelete.length; kd++) {
      delete effects[j].boundVariables[keysToDelete[kd]];
    }
    if (effects[j].boundVariables && Object.keys(effects[j].boundVariables).length === 0) {
      delete effects[j].boundVariables;
    }
  }

  if (n > 0) {
    try {
      style.effects = effects;
      console.log('  ✅ Effect style "' + style.name + '" · ' + n + " binding(s)");
    } catch (e) {
      console.log('  ❌ Effect "' + style.name + '": ' + (e && e.message));
      return 0;
    }
  }
  return n;
}

/**
 * Rebind variables on one style to matching names in `lookup` (from buildTargetVariableLookup).
 * @param sourceCollectionName If non-empty, only bindings in that collection are updated. If empty, every binding is eligible.
 */
async function rebindStyleVariableBindingsOnStyle(style, sourceCollectionName, lookup, breakUnmatched) {
  var t = style.type;
  var n = 0;
  if (t === "TEXT") n += await rebindProcessTextStyle(style, sourceCollectionName, lookup, breakUnmatched);
  else if (t === "PAINT") n += await rebindProcessPaintStyle(style, sourceCollectionName, lookup, breakUnmatched);
  else if (t === "EFFECT") n += await rebindProcessEffectStyle(style, sourceCollectionName, lookup, breakUnmatched);
  return n;
}
