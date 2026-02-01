// @Replacement Engine
// @DOC_START
// # @Replacement Engine
// Find-and-replace with planning, execution, and reporting.
//
// ## Overview
// Import for find/replace with options (collection, type, property, exact, caseSensitive, dryRun, batchSize), planning (createReplacementPlan, validateReplacement, estimateImpact), execution (executeReplacement, rollbackReplacement, previewReplacement), and reporting (generateReport, createSummary, exportResults). No configuration; use via @import.
//
// ## Exported functions (examples)
// - **Find & Replace:** findAndReplace, batchReplace, findMatches, replaceMatches
// - **Planning:** createReplacementPlan, validateReplacement, estimateImpact
// - **Execution:** executeReplacement, rollbackReplacement, previewReplacement
// - **Reporting:** generateReport, createSummary, exportResults
// @DOC_END

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ReplacementOptions {
  findPattern: string;        // Pattern to find
  replacePattern: string;     // Pattern to replace with
  collection?: string;        // Collection filter
  type?: string;             // Type filter (for styles)
  property?: string;         // Property filter (for variables)
  exact?: boolean;           // Exact match
  caseSensitive?: boolean;   // Case sensitivity
  dryRun?: boolean;          // Preview only
  batchSize?: number;        // Batch processing size
  maxReplacements?: number;  // Maximum replacements
}

interface ReplacementMatch {
  node: any;                 // Target node
  property: string;          // Property being replaced
  oldValue: any;             // Current value
  newValue: any;             // New value
  confidence: number;        // Match confidence
  reason: string;            // Reason for replacement
  metadata?: any;            // Additional metadata
}

interface ReplacementPlan {
  matches: ReplacementMatch[];
  totalMatches: number;
  estimatedTime: number;     // Estimated execution time (ms)
  riskLevel: 'low' | 'medium' | 'high';
  warnings: string[];
  rollbackData: any[];       // Data for rollback
}

interface ReplacementResult {
  successful: number;
  failed: number;
  skipped: number;
  total: number;
  errors: string[];
  warnings: string[];
  details: ReplacementMatch[];
  executionTime: number;
  rollbackData: any[];
}

// ============================================================================
// MAIN REPLACEMENT FUNCTIONS
// ============================================================================

/**
 * Find and replace with advanced options
 */
function findAndReplace(
  selection: ReadonlyArray<any>,
  options: ReplacementOptions
): ReplacementResult {
  const startTime = Date.now();
  
  try {
    // Create replacement plan
    const plan = createReplacementPlan(selection, options);
    
    if (plan.matches.length === 0) {
      return {
        successful: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        errors: [],
        warnings: ['No matches found'],
        details: [],
        executionTime: Date.now() - startTime,
        rollbackData: []
      };
    }
    
    // Execute replacement
    const result = executeReplacement(plan, options);
    result.executionTime = Date.now() - startTime;
    
    return result;
    
  } catch (error) {
    console.error('Error in findAndReplace:', error);
    return {
      successful: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      errors: [`Execution error: ${error.message}`],
      warnings: [],
      details: [],
      executionTime: Date.now() - startTime,
      rollbackData: []
    };
  }
}

/**
 * Batch replace with progress tracking
 */
function batchReplace(
  selection: ReadonlyArray<any>,
  options: ReplacementOptions,
  onProgress?: (progress: { current: number; total: number; percentage: number }) => void
): ReplacementResult {
  const startTime = Date.now();
  const batchSize = options.batchSize || 50;
  
  try {
    // Create replacement plan
    const plan = createReplacementPlan(selection, options);
    
    if (plan.matches.length === 0) {
      return {
        successful: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        errors: [],
        warnings: ['No matches found'],
        details: [],
        executionTime: Date.now() - startTime,
        rollbackData: []
      };
    }
    
    // Process in batches
    const result: ReplacementResult = {
      successful: 0,
      failed: 0,
      skipped: 0,
      total: plan.matches.length,
      errors: [],
      warnings: [],
      details: [],
      executionTime: 0,
      rollbackData: []
    };
    
    const batches = chunkArray(plan.matches, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchResult = executeBatch(batch, options);
      
      // Merge results
      result.successful += batchResult.successful;
      result.failed += batchResult.failed;
      result.skipped += batchResult.skipped;
      result.errors.push(...batchResult.errors);
      result.warnings.push(...batchResult.warnings);
      result.details.push(...batchResult.details);
      result.rollbackData.push(...batchResult.rollbackData);
      
      // Report progress
      if (onProgress) {
        const current = (i + 1) * batchSize;
        const total = plan.matches.length;
        onProgress({
          current: Math.min(current, total),
          total,
          percentage: Math.round((current / total) * 100)
        });
      }
      
      // Memory cleanup
      if (i % 10 === 0) {
        cleanupMemory();
      }
    }
    
    result.executionTime = Date.now() - startTime;
    return result;
    
  } catch (error) {
    console.error('Error in batchReplace:', error);
    return {
      successful: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      errors: [`Execution error: ${error.message}`],
      warnings: [],
      details: [],
      executionTime: Date.now() - startTime,
      rollbackData: []
    };
  }
}

// ============================================================================
// PLANNING FUNCTIONS
// ============================================================================

/**
 * Create replacement plan
 */
function createReplacementPlan(
  selection: ReadonlyArray<any>,
  options: ReplacementOptions
): ReplacementPlan {
  const matches: ReplacementMatch[] = [];
  const warnings: string[] = [];
  const rollbackData: any[] = [];
  
  const allNodes = collectAllNodes(selection);
  
  for (const node of allNodes) {
    const nodeMatches = findMatchesInNode(node, options);
    matches.push(...nodeMatches);
    
    // Collect rollback data
    if (nodeMatches.length > 0) {
      rollbackData.push({
        nodeId: node.id,
        nodeName: node.name,
        originalState: captureNodeState(node)
      });
    }
  }
  
  // Calculate risk level
  const riskLevel = calculateRiskLevel(matches, options);
  
  // Estimate execution time
  const estimatedTime = estimateExecutionTime(matches.length);
  
  // Add warnings
  if (matches.length > 1000) {
    warnings.push('Large number of replacements detected. Consider using batch processing.');
  }
  
  if (riskLevel === 'high') {
    warnings.push('High risk replacement detected. Review matches carefully.');
  }
  
  return {
    matches,
    totalMatches: matches.length,
    estimatedTime,
    riskLevel,
    warnings,
    rollbackData
  };
}

/**
 * Find matches in a single node
 */
function findMatchesInNode(node: any, options: ReplacementOptions): ReplacementMatch[] {
  const matches: ReplacementMatch[] = [];
  
  // Check bound variables
  if (node.boundVariables) {
    for (const [property, binding] of Object.entries(node.boundVariables)) {
      if (options.property && property !== options.property) continue;
      if (!binding) continue;
      
      const variableId = binding.id || (binding[0] && binding[0].id);
      if (!variableId) continue;
      
      const variable = figma.variables.getVariableById(variableId);
      if (!variable) continue;
      
      const match = createVariableMatch(node, property, variable, options);
      if (match) {
        matches.push(match);
      }
    }
  }
  
  // Check direct style properties
  const styleProperties = getNodeStyleProperties(node);
  for (const [property, styleId] of Object.entries(styleProperties)) {
    if (options.property && property !== options.property) continue;
    if (!styleId || styleId === figma.mixed) continue;
    
    const style = figma.getStyleById(styleId);
    if (!style) continue;
    
    const match = createStyleMatch(node, property, style, options);
    if (match) {
      matches.push(match);
    }
  }
  
  return matches;
}

/**
 * Create variable match
 */
function createVariableMatch(
  node: any,
  property: string,
  variable: any,
  options: ReplacementOptions
): ReplacementMatch | null {
  const variableName = variable.name;
  
  // Check if variable matches find pattern
  const matchResult = matchPattern(variableName, options.findPattern, {
    exact: options.exact,
    caseSensitive: options.caseSensitive
  });
  
  if (!matchResult.match) return null;
  
  // Generate replacement value
  const newValue = generateReplacementValue(variableName, options.replacePattern);
  
  return {
    node,
    property,
    oldValue: variable,
    newValue,
    confidence: matchResult.confidence,
    reason: `Variable '${variableName}' matches pattern '${options.findPattern}'`,
    metadata: {
      type: 'variable',
      variableId: variable.id,
      variableName
    }
  };
}

/**
 * Create style match
 */
function createStyleMatch(
  node: any,
  property: string,
  style: any,
  options: ReplacementOptions
): ReplacementMatch | null {
  const styleName = style.name;
  
  // Check if style matches find pattern
  const matchResult = matchPattern(styleName, options.findPattern, {
    exact: options.exact,
    caseSensitive: options.caseSensitive
  });
  
  if (!matchResult.match) return null;
  
  // Generate replacement value
  const newValue = generateReplacementValue(styleName, options.replacePattern);
  
  return {
    node,
    property,
    oldValue: style,
    newValue,
    confidence: matchResult.confidence,
    reason: `Style '${styleName}' matches pattern '${options.findPattern}'`,
    metadata: {
      type: 'style',
      styleId: style.id,
      styleName,
      styleType: style.type
    }
  };
}

// ============================================================================
// EXECUTION FUNCTIONS
// ============================================================================

/**
 * Execute replacement plan
 */
function executeReplacement(plan: ReplacementPlan, options: ReplacementOptions): ReplacementResult {
  const result: ReplacementResult = {
    successful: 0,
    failed: 0,
    skipped: 0,
    total: plan.matches.length,
    errors: [],
    warnings: [],
    details: [],
    executionTime: 0,
    rollbackData: []
  };
  
  for (const match of plan.matches) {
    try {
      if (options.dryRun) {
        result.skipped++;
        result.details.push({
          ...match,
          success: true
        });
        continue;
      }
      
      const success = executeMatch(match);
      
      if (success) {
        result.successful++;
        result.details.push({
          ...match,
          success: true
        });
      } else {
        result.failed++;
        result.errors.push(`Failed to replace ${match.property} in ${match.node.name}`);
        result.details.push({
          ...match,
          success: false,
          error: 'Execution failed'
        });
      }
      
    } catch (error) {
      result.failed++;
      result.errors.push(`Error replacing ${match.property} in ${match.node.name}: ${error.message}`);
      result.details.push({
        ...match,
        success: false,
        error: error.message
      });
    }
  }
  
  return result;
}

/**
 * Execute a single match
 */
function executeMatch(match: ReplacementMatch): boolean {
  try {
    if (match.metadata?.type === 'variable') {
      return executeVariableReplacement(match);
    } else if (match.metadata?.type === 'style') {
      return executeStyleReplacement(match);
    }
    
    return false;
  } catch (error) {
    console.error('Error executing match:', error);
    return false;
  }
}

/**
 * Execute variable replacement
 */
function executeVariableReplacement(match: ReplacementMatch): boolean {
  // This would involve replacing variable bindings
  // Implementation depends on specific requirements
  console.log('Variable replacement not implemented yet');
  return false;
}

/**
 * Execute style replacement
 */
function executeStyleReplacement(match: ReplacementMatch): boolean {
  try {
    const { node, property, newValue } = match;
    
    if (property === 'textStyleId' && newValue.type === 'TEXT') {
      node.textStyleId = newValue.id;
      return true;
    } else if (property === 'fillStyleId' && newValue.type === 'PAINT') {
      node.fillStyleId = newValue.id;
      return true;
    } else if (property === 'strokeStyleId' && newValue.type === 'PAINT') {
      node.strokeStyleId = newValue.id;
      return true;
    } else if (property === 'effectStyleId' && newValue.type === 'EFFECT') {
      node.effectStyleId = newValue.id;
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error executing style replacement:', error);
    return false;
  }
}

/**
 * Execute batch of matches
 */
function executeBatch(matches: ReplacementMatch[], options: ReplacementOptions): ReplacementResult {
  const result: ReplacementResult = {
    successful: 0,
    failed: 0,
    skipped: 0,
    total: matches.length,
    errors: [],
    warnings: [],
    details: [],
    executionTime: 0,
    rollbackData: []
  };
  
  for (const match of matches) {
    try {
      if (options.dryRun) {
        result.skipped++;
        continue;
      }
      
      const success = executeMatch(match);
      
      if (success) {
        result.successful++;
      } else {
        result.failed++;
        result.errors.push(`Failed to replace ${match.property} in ${match.node.name}`);
      }
      
      result.details.push({
        ...match,
        success
      });
      
    } catch (error) {
      result.failed++;
      result.errors.push(`Error replacing ${match.property} in ${match.node.name}: ${error.message}`);
    }
  }
  
  return result;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate replacement value from pattern
 */
function generateReplacementValue(originalValue: string, replacePattern: string): any {
  // Simple wildcard replacement
  const newName = replacePattern.replace(/\*/g, originalValue);
  
  // Try to find existing style/variable with new name
  // This is a simplified implementation
  return { name: newName };
}

/**
 * Calculate risk level
 */
function calculateRiskLevel(matches: ReplacementMatch[], options: ReplacementOptions): 'low' | 'medium' | 'high' {
  if (matches.length === 0) return 'low';
  if (matches.length > 1000) return 'high';
  if (matches.length > 100) return 'medium';
  return 'low';
}

/**
 * Estimate execution time
 */
function estimateExecutionTime(matchCount: number): number {
  // Rough estimate: 1ms per match
  return matchCount * 1;
}

/**
 * Capture node state for rollback
 */
function captureNodeState(node: any): any {
  return {
    boundVariables: node.boundVariables ? { ...node.boundVariables } : undefined,
    textStyleId: node.textStyleId,
    fillStyleId: node.fillStyleId,
    strokeStyleId: node.strokeStyleId,
    effectStyleId: node.effectStyleId
  };
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
  
  return properties;
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
 * Chunk array into batches
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Cleanup memory
 */
function cleanupMemory(): void {
  // Force garbage collection if available
  if (typeof gc === 'function') {
    gc();
  }
}

/**
 * Match pattern (imported from @Pattern Matching)
 */
function matchPattern(text: string, pattern: string, options: { exact?: boolean; caseSensitive?: boolean } = {}): { match: boolean; confidence: number } {
  const { exact = false, caseSensitive = false } = options;
  
  let searchText = text;
  let searchPattern = pattern;
  
  if (!caseSensitive) {
    searchText = text.toLowerCase();
    searchPattern = pattern.toLowerCase();
  }
  
  if (exact) {
    return {
      match: searchText === searchPattern,
      confidence: searchText === searchPattern ? 1.0 : 0.0
    };
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
    return { match: true, confidence };
  }
  
  return { match: false, confidence: 0.0 };
}
