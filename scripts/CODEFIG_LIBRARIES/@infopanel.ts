// @InfoPanel
var shared = true;

/**
 * Display results in the info panel with advanced grouping and filtering
 * @param {Object} data - The data to display
 * @param {string} data.title - Title for the results
 * @param {Array} data.results - Array of result items
 * @param {string} data.type - Type of results (info, error, warning, success)
 * @param {Object} data.grouping - Grouping configuration
 * @param {Array} data.grouping.modes - Available grouping modes (e.g., ['property', 'node'])
 * @param {string} data.grouping.default - Default grouping mode
 * @param {Function} data.grouping.getGroupKey - Function to extract group key from result
 * @param {Function} data.grouping.getGroupTitle - Function to format group title
 */
function displayResults(data) {
  // Check if we have a custom message handler (set by backend)
  if (typeof window !== 'undefined' && window._infoPanelHandler) {
    window._infoPanelHandler({
      type: 'INFO_PANEL_RESULTS',
      title: data.title || 'Results',
      results: data.results || [],
      severity: data.type || 'info',
      grouping: data.grouping || null,
      showFilters: data.showFilters !== false // Default to true
    });
  } else {
    // Fallback: try direct postMessage (might not work in sandboxed context)
    try {
      figma.ui.postMessage({
        type: 'INFO_PANEL_RESULTS',
        title: data.title || 'Results',
        results: data.results || [],
        severity: data.type || 'info',
        grouping: data.grouping || null,
        showFilters: data.showFilters !== false
      });
    } catch (e) {
      console.log('InfoPanel: Could not send message to UI:', e.message);
    }
  }
}

/**
 * Create grouping configuration for results
 * @param {Array} modes - Available grouping modes
 * @param {string} defaultMode - Default grouping mode
 * @param {Object} groupFunctions - Object with grouping functions for each mode
 */
function createGrouping(modes, defaultMode, groupFunctions) {
  return {
    modes: modes,
    default: defaultMode,
    functions: groupFunctions
  };
}

/**
 * Group results by a specified key
 * @param {Array} results - Array of results to group
 * @param {Function} getGroupKey - Function to extract group key from result
 * @param {Function} getGroupTitle - Function to format group title
 */
function groupResults(results, getGroupKey, getGroupTitle) {
  var groups = {};
  var groupOrder = [];
  
  for (var i = 0; i < results.length; i++) {
    var result = results[i];
    var groupKey = getGroupKey(result);
    
    if (!groups[groupKey]) {
      groups[groupKey] = {
        title: getGroupTitle ? getGroupTitle(groupKey, result) : groupKey,
        results: [],
        count: 0
      };
      groupOrder.push(groupKey);
    }
    
    groups[groupKey].results.push(result);
    groups[groupKey].count++;
  }
  
  return {
    groups: groups,
    order: groupOrder
  };
}

/**
 * Display a simple message in the info panel
 * @param {string} title - Title for the message
 * @param {string} message - The message to display
 * @param {string} type - Type of message (info, error, warning, success)
 */
function displayMessage(title, message, type) {
  displayResults({
    title: title,
    results: [{
      message: message,
      severity: type || 'info'
    }],
    type: type || 'info'
  });
}

/**
 * Display an error in the info panel
 * @param {string} title - Title for the error
 * @param {string} message - The error message
 */
function displayError(title, message) {
  displayMessage(title, message, 'error');
}

/**
 * Display a warning in the info panel
 * @param {string} title - Title for the warning
 * @param {string} message - The warning message
 */
function displayWarning(title, message) {
  displayMessage(title, message, 'warning');
}

/**
 * Display a success message in the info panel
 * @param {string} title - Title for the success
 * @param {string} message - The success message
 */
function displaySuccess(title, message) {
  displayMessage(title, message, 'success');
}

/**
 * Create a result item that can be clicked to select a node
 * @param {string} message - The message to display
 * @param {string} nodeId - The ID of the node to select when clicked
 * @param {string} details - Additional details (optional)
 * @param {string} severity - Severity level (error, warning, info, success)
 */
function createSelectableResult(message, nodeId, details, severity) {
  return {
    message: message,
    details: details,
    severity: severity || 'error',
    nodeId: nodeId
  };
}

/**
 * Create a simple result item
 * @param {string} message - The message to display
 * @param {string} details - Additional details (optional)
 * @param {string} severity - Severity level (error, warning, info, success)
 */
function createResult(message, details, severity) {
  return {
    message: message,
    details: details,
    severity: severity || 'info'
  };
}

/**
 * Create a result with custom HTML structure
 * @param {string} html - Custom HTML content for the entry
 * @param {string|Array} nodeIds - Node ID(s) for selection (optional)
 * @param {string} severity - Severity level (error, warning, info, success)
 */
function createHtmlResult(html, nodeIds, severity) {
  var result = {
    html: html,
    severity: severity || 'error'
  };
  
  if (nodeIds) {
    if (Array.isArray(nodeIds)) {
      result.nodeIds = nodeIds;
    } else {
      result.nodeId = nodeIds;
    }
  }
  
  return result;
}

/**
 * Clear the info panel
 */
function clearResults() {
  displayResults({
    title: 'Results cleared',
    results: [],
    type: 'info'
  });
}

// ============================================================================
// DISPLAY HELPER FUNCTIONS
// ============================================================================

/**
 * Get category icon for display
 */
function getCategoryIcon(category) {
  var icons = {
    typography: '📝',
    color: '🎨',
    dimensions: '📏',
    effects: '✨',
    grid: '📐'
  };
  return icons[category] || '📋';
}

/**
 * Get category name for display
 */
function getCategoryName(category) {
  var names = {
    typography: 'Typography',
    color: 'Color',
    dimensions: 'Dimensions & Spacing',
    effects: 'Grid & Effects',
    grid: 'Grid System'
  };
  return names[category] || category;
}

/**
 * Convert property name to readable format
 */
function getPropertyDisplay(property) {
  if (property === 'fills') return 'Fill';
  if (property === 'strokes') return 'Stroke';
  if (property === 'effects') return 'Effects';
  if (property === 'fontSize') return 'Font Size';
  if (property === 'fontWeight') return 'Font Weight';
  if (property === 'fontFamily') return 'Font Family';
  if (property === 'lineHeight') return 'Line Height';
  if (property === 'letterSpacing') return 'Letter Spacing';
  if (property === 'paragraphSpacing') return 'Paragraph Spacing';
  if (property === 'paragraphIndent') return 'Paragraph Indent';
  if (property === 'textCase') return 'Text Case';
  if (property === 'textDecoration') return 'Text Decoration';
  if (property === 'characters') return 'Text Content';
  if (property === 'width') return 'Width';
  if (property === 'height') return 'Height';
  if (property === 'minWidth') return 'Min Width';
  if (property === 'maxWidth') return 'Max Width';
  if (property === 'minHeight') return 'Min Height';
  if (property === 'maxHeight') return 'Max Height';
  if (property === 'paddingTop') return 'Padding Top';
  if (property === 'paddingRight') return 'Padding Right';
  if (property === 'paddingBottom') return 'Padding Bottom';
  if (property === 'paddingLeft') return 'Padding Left';
  if (property === 'itemSpacing') return 'Gap';
  if (property === 'cornerRadius') return 'Corner Radius';
  if (property === 'topLeftRadius') return 'Top Left Radius';
  if (property === 'topRightRadius') return 'Top Right Radius';
  if (property === 'bottomLeftRadius') return 'Bottom Left Radius';
  if (property === 'bottomRightRadius') return 'Bottom Right Radius';
  if (property === 'strokeWeight') return 'Stroke Weight';
  if (property === 'strokeTopWeight') return 'Stroke Top Weight';
  if (property === 'strokeRightWeight') return 'Stroke Right Weight';
  if (property === 'strokeBottomWeight') return 'Stroke Bottom Weight';
  if (property === 'strokeLeftWeight') return 'Stroke Left Weight';
  if (property === 'opacity') return 'Opacity';
  if (property === 'visible') return 'Visibility';
  if (property === 'layoutGrids') return 'Layout Grids';
  if (property === 'textRangeFills') return 'Text Range Fill';
  return property;
}
