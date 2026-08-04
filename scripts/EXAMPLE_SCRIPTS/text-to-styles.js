// Text to styles
// @DOC_START
// # Text to styles
// Creates local text styles from selected text nodes and keeps variable bindings.
//
// ## Overview
// Reads typography (font, size, weight, line height, etc.) and variable bindings from each selected text node, then creates or updates a local text style using the layer name. No configuration; run on selection.
// @DOC_END

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Extract typography properties from text node
function extractTypographyProperties(node) {
  try {
    if (!node || node.type !== 'TEXT') {
      return null;
    }

    var properties = {
      fontSize: node.fontSize !== figma.mixed ? node.fontSize : null,
      fontWeight: node.fontWeight !== figma.mixed ? node.fontWeight : null,
      lineHeight: node.lineHeight !== figma.mixed ? node.lineHeight : null,
      letterSpacing: node.letterSpacing !== figma.mixed ? node.letterSpacing : null,
      fontName: node.fontName !== figma.mixed ? node.fontName : null,
      paragraphSpacing: node.paragraphSpacing !== figma.mixed ? node.paragraphSpacing : null,
      paragraphIndent: node.paragraphIndent !== figma.mixed ? node.paragraphIndent : null,
      textCase: node.textCase !== figma.mixed ? node.textCase : null,
      textDecoration: node.textDecoration !== figma.mixed ? node.textDecoration : null
    };

    return properties;
  } catch (error) {
    console.warn('Error extracting typography properties from ' + (node ? node.name : 'unknown') + ': ' + error.message);
    return null;
  }
}

// Extract variable bindings from node, filtering for local variables only
async function extractVariableBindings(node) {
  try {
    if (!node || !node.boundVariables || typeof node.boundVariables !== 'object') {
      return {};
    }

    var bindings = {};
    var properties = Object.keys(node.boundVariables);

    for (var i = 0; i < properties.length; i++) {
      var property = properties[i];
      var binding = node.boundVariables[property];

      if (!binding) continue;

      var variableId = binding.id || (Array.isArray(binding) && binding[0] && binding[0].id);
      if (!variableId) continue;

      try {
        var variable = await figma.variables.getVariableByIdAsync(variableId);
        if (!variable) continue;

        try {
          var collections = await figma.variables.getLocalVariableCollectionsAsync();
          var isLocal = false;

          for (var j = 0; j < collections.length; j++) {
            var collection = collections[j];
            if (collection.variableIds.indexOf(variableId) !== -1) {
              isLocal = true;
              break;
            }
          }

          if (isLocal) {
            bindings[property] = variable;
          } else {
            console.log('Skipping remote variable: ' + (variable.name || variableId) + ' for property: ' + property);
          }
        } catch (checkError) {
          bindings[property] = variable;
        }
      } catch (error) {
        console.warn('Could not access variable for property ' + property + ': ' + error.message);
      }
    }

    return bindings;
  } catch (error) {
    console.warn('Error extracting variable bindings from ' + (node ? node.name : 'unknown') + ': ' + error.message);
    return {};
  }
}

// Create or update text style with node name, applying numeric properties first
async function createOrUpdateTextStyle(styleName, properties) {
  try {
    // Check if style already exists (async for documentAccess: dynamic-page)
    var existingStyles = await figma.getLocalTextStylesAsync();
    var existingStyle = existingStyles.find(function(style) {
      return style.name === styleName;
    });

    var textStyle;
    var action;

    if (existingStyle) {
      textStyle = existingStyle;
      action = 'updated';
    } else {
      textStyle = figma.createTextStyle();
      textStyle.name = styleName;
      action = 'created';
    }

    // Load font FIRST before setting any properties
    // This is required - you cannot set properties on a text style without the font loaded
    if (properties.fontName !== null && properties.fontName !== undefined) {
      try {
        await figma.loadFontAsync(properties.fontName);
        textStyle.fontName = properties.fontName;
      } catch (fontError) {
        throw new Error('Font not available: ' + properties.fontName.family + ' ' + properties.fontName.style);
      }
    } else {
      // If no fontName, we still need to load a default font to set properties
      // Try to get font from existing style or use a default
      if (textStyle.fontName) {
        await figma.loadFontAsync(textStyle.fontName);
      } else {
        // If no font available, we can't set properties
        throw new Error('Font name is required to create text style');
      }
    }

    // Now apply numeric properties (font must be loaded first)
    if (properties.fontSize !== null && properties.fontSize !== undefined) {
      textStyle.fontSize = properties.fontSize;
    }
    if (properties.fontWeight !== null && properties.fontWeight !== undefined) {
      textStyle.fontWeight = properties.fontWeight;
    }
    if (properties.lineHeight !== null && properties.lineHeight !== undefined) {
      textStyle.lineHeight = properties.lineHeight;
    }
    if (properties.letterSpacing !== null && properties.letterSpacing !== undefined) {
      textStyle.letterSpacing = properties.letterSpacing;
    }
    if (properties.paragraphSpacing !== null && properties.paragraphSpacing !== undefined) {
      textStyle.paragraphSpacing = properties.paragraphSpacing;
    }
    if (properties.paragraphIndent !== null && properties.paragraphIndent !== undefined) {
      textStyle.paragraphIndent = properties.paragraphIndent;
    }
    if (properties.textCase !== null && properties.textCase !== undefined) {
      textStyle.textCase = properties.textCase;
    }
    if (properties.textDecoration !== null && properties.textDecoration !== undefined) {
      textStyle.textDecoration = properties.textDecoration;
    }

    return {
      style: textStyle,
      action: action
    };
  } catch (error) {
    console.error('Error creating/updating text style ' + styleName + ': ' + error.message);
    throw error;
  }
}

// Bind variables to text style using setBoundVariable for each typography property
function bindVariablesToStyle(textStyle, bindings) {
  try {
    var boundCount = 0;
    var typographyProperties = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontFamily', 'paragraphSpacing', 'paragraphIndent'];

    for (var property in bindings) {
      // Only bind typography-related properties
      if (typographyProperties.indexOf(property) === -1) {
        continue;
      }

      var variable = bindings[property];
      if (!variable) continue;

      try {
        textStyle.setBoundVariable(property, variable);
        boundCount++;
        console.log('Bound variable ' + (variable.name || variable.id) + ' to property ' + property);
      } catch (bindError) {
        console.warn('Could not bind variable to property ' + property + ': ' + bindError.message);
      }
    }

    return boundCount;
  } catch (error) {
    console.warn('Error binding variables to style: ' + error.message);
    return 0;
  }
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

async function createStylesFromNodes() {
  try {
    var selection = figma.currentPage.selection;

    if (selection.length === 0) {
      figma.notify('No selection found');
      return;
    }

    var textNodes = [];
    for (var i = 0; i < selection.length; i++) {
      var node = selection[i];
      if (node.type === 'TEXT') {
        textNodes.push(node);
      } else {
        console.log('Skipping non-text node: ' + node.name + ' (type: ' + node.type + ')');
      }
    }

    if (textNodes.length === 0) {
      figma.notify('No text nodes found in selection');
      return;
    }

    var stats = {
      created: 0,
      updated: 0,
      errors: 0,
      totalVariablesBound: 0
    };

    // Process each text node
    for (var j = 0; j < textNodes.length; j++) {
      var textNode = textNodes[j];
      var nodeName = textNode.name || 'Unnamed';

      try {
        // Extract typography properties
        var properties = extractTypographyProperties(textNode);
        if (!properties) {
          console.warn('Could not extract properties from: ' + nodeName);
          stats.errors++;
          continue;
        }

        // Extract variable bindings
        var bindings = await extractVariableBindings(textNode);

        // Create or update text style (async for font loading)
        var result = await createOrUpdateTextStyle(nodeName, properties);
        var textStyle = result.style;
        var action = result.action;

        if (action === 'created') {
          stats.created++;
        } else {
          stats.updated++;
        }

        // Bind variables to style
        var variablesBound = bindVariablesToStyle(textStyle, bindings);
        stats.totalVariablesBound += variablesBound;

        // Connect the text node to the newly created/updated style
        try {
          textNode.textStyleId = textStyle.id;
          console.log('Text style ' + action + ': ' + nodeName + (variablesBound > 0 ? ' (' + variablesBound + ' variables bound)' : '') + ' - node connected to style');
        } catch (connectError) {
          console.warn('Could not connect node ' + nodeName + ' to style: ' + connectError.message);
        }
      } catch (error) {
        console.error('Error processing node ' + nodeName + ': ' + error.message);
        stats.errors++;
      }
    }

    // Show success message
    var message = '';
    if (stats.created > 0 && stats.updated > 0) {
      message = 'Created ' + stats.created + ' and updated ' + stats.updated + ' text style(s)';
    } else if (stats.created > 0) {
      message = 'Created ' + stats.created + ' text style(s)';
    } else if (stats.updated > 0) {
      message = 'Updated ' + stats.updated + ' text style(s)';
    } else {
      message = 'No styles created or updated';
    }

    if (stats.totalVariablesBound > 0) {
      message += ' with ' + stats.totalVariablesBound + ' variable binding(s)';
    }

    if (stats.errors > 0) {
      message += ' (' + stats.errors + ' error(s))';
    }

    figma.notify(message);
  } catch (error) {
    console.error('Error in createStylesFromNodes: ' + error.message);
    figma.notify('Error: ' + error.message);
  }
}

// ============================================================================
// EXECUTION
// ============================================================================

createStylesFromNodes();

