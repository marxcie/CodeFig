// Detach styles & variables
// @DOC_START
// # Detach styles & variables
// Removes style and variable bindings from selected nodes (and optionally their children).
//
// ## Overview
// Clears text/fill/stroke/effect/grid style IDs and variable bindings on selected nodes so they use local values. Can run recursively on children.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | recursive | If true, processes children as well. |
// | allStyles | If true, detaches all style types; otherwise use per-type flags (fontStyles, fillStyles, etc.). |
// | allVariables | If true, detaches all variable bindings; otherwise use typographicVariables, numericVariables, colorVariables. |
// | colorVariables | Fills, strokes, opacity (used when allVariables is false). |
// @DOC_END

// @UI_CONFIG_START
// # Detach styles & variables
var recursive = true;
// ---
// ## Styles
var allStyles = true;
//
var fontStyles = true;
var fillStyles = true;
var strokeStyles = true;
var effectStyles = true;
var gridStyles = true;
// ---
// ## Variables
var allVariables = true;
//
var typographicVariables = true;
var numericVariables = true;
var colorVariables = true;
// @UI_CONFIG_END

// Helper function to check if a property is typographic
function isTypographicProperty(property) {
  var typographicProps = ['fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 
                          'paragraphSpacing', 'paragraphIndent', 'textCase', 'textDecoration', 
                          'characters', 'textRangeFills'];
  return typographicProps.indexOf(property) !== -1;
}

// Helper function to check if a property is numeric/dimension
function isNumericProperty(property) {
  var numericProps = ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 
                      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 
                      'itemSpacing', 'cornerRadius', 'topLeftRadius', 'topRightRadius', 
                      'bottomLeftRadius', 'bottomRightRadius', 'strokeWeight', 
                      'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 
                      'strokeLeftWeight'];
  return numericProps.indexOf(property) !== -1;
}

// Helper function to check if a property is color-related
function isColorProperty(property) {
  var colorProps = ['fills', 'strokes', 'opacity'];
  return colorProps.indexOf(property) !== -1;
}

async function detachStyles(node) {
  if ((allStyles || (typeof fontStyles !== 'undefined' && fontStyles === true)) && node.type === "TEXT" && "setTextStyleIdAsync" in node) {
    try {
      var textStyleId = node.textStyleId;
      if (textStyleId && textStyleId !== figma.mixed) {
        await node.setTextStyleIdAsync("");
        console.log("Detached font style from: " + node.name);
      }
    } catch (e) { console.warn("Could not detach text style: " + e.message); }
  }

  if ((allStyles || (typeof fillStyles !== 'undefined' && fillStyles === true)) && "setFillStyleIdAsync" in node) {
    try {
      var fillId = node.fillStyleId;
      if (fillId && fillId !== figma.mixed) {
        await node.setFillStyleIdAsync("");
        console.log("Detached fill style from: " + node.name);
      }
    } catch (e) { console.warn("Could not detach fill style: " + e.message); }
  }

  if ((allStyles || (typeof strokeStyles !== 'undefined' && strokeStyles === true)) && "setStrokeStyleIdAsync" in node) {
    try {
      var strokeId = node.strokeStyleId;
      if (strokeId && strokeId !== figma.mixed) {
        await node.setStrokeStyleIdAsync("");
        console.log("Detached stroke style from: " + node.name);
      }
    } catch (e) { console.warn("Could not detach stroke style: " + e.message); }
  }

  if ((allStyles || (typeof effectStyles !== 'undefined' && effectStyles === true)) && "setEffectStyleIdAsync" in node) {
    try {
      var effectId = node.effectStyleId;
      if (effectId && effectId !== figma.mixed) {
        await node.setEffectStyleIdAsync("");
        console.log("Detached effect style from: " + node.name);
      }
    } catch (e) { console.warn("Could not detach effect style: " + e.message); }
  }

  if ((allStyles || (typeof gridStyles !== 'undefined' && gridStyles === true)) && "setGridStyleIdAsync" in node) {
    try {
      var gridId = node.gridStyleId;
      if (gridId && gridId !== figma.mixed) {
        await node.setGridStyleIdAsync("");
        console.log("Detached grid style from: " + node.name);
      }
    } catch (e) { console.warn("Could not detach grid style: " + e.message); }
  }
}

// Helper function to detach variables from fills
function detachFillsVariables(node) {
  try {
    if (!node.fills || !Array.isArray(node.fills) || node.fills.length === 0) {
      return false;
    }

    var hasDetached = false;
    var modifiedFills = [];

    for (var i = 0; i < node.fills.length; i++) {
      var fill = node.fills[i];
      var modifiedFill = JSON.parse(JSON.stringify(fill)); // Clone the fill
      
      // Remove boundVariables from the paint object
      if (modifiedFill.boundVariables) {
        delete modifiedFill.boundVariables;
        hasDetached = true;
      }
      
      modifiedFills.push(modifiedFill);
    }

    if (hasDetached) {
      node.fills = modifiedFills;
      console.log("✅ Detached variable from fills on: " + node.name);
      return true;
    }
    return false;
  } catch (error) {
    console.warn("❌ Could not detach variable from fills on " + node.name + ": " + error.message);
    return false;
  }
}

// Helper function to detach variables from strokes
function detachStrokesVariables(node) {
  try {
    if (!node.strokes || !Array.isArray(node.strokes) || node.strokes.length === 0) {
      return false;
    }

    var hasDetached = false;
    var modifiedStrokes = [];

    for (var i = 0; i < node.strokes.length; i++) {
      var stroke = node.strokes[i];
      var modifiedStroke = JSON.parse(JSON.stringify(stroke)); // Clone the stroke
      
      // Remove boundVariables from the paint object
      if (modifiedStroke.boundVariables) {
        delete modifiedStroke.boundVariables;
        hasDetached = true;
      }
      
      modifiedStrokes.push(modifiedStroke);
    }

    if (hasDetached) {
      node.strokes = modifiedStrokes;
      console.log("✅ Detached variable from strokes on: " + node.name);
      return true;
    }
    return false;
  } catch (error) {
    console.warn("❌ Could not detach variable from strokes on " + node.name + ": " + error.message);
    return false;
  }
}

function detachVariables(node) {
  try {
    if (!node) {
      return;
    }

    // Handle fills and strokes specially - they need to be detached from paint objects
    if (node.boundVariables && typeof node.boundVariables === 'object') {
      var properties = Object.keys(node.boundVariables);
      
      // Check if fills or strokes are in boundVariables
      if (properties.indexOf('fills') !== -1) {
        var shouldDetachFills = false;
        if (allVariables) {
          shouldDetachFills = true;
        } else if ((typeof colorVariables !== 'undefined' && colorVariables === true)) {
          shouldDetachFills = true;
        } else if (typeof detachExactVariables !== 'undefined' && Array.isArray(detachExactVariables) && detachExactVariables.indexOf('fills') !== -1) {
          shouldDetachFills = true;
        }
        
        if (shouldDetachFills) {
          detachFillsVariables(node);
        }
      }
      
      if (properties.indexOf('strokes') !== -1) {
        var shouldDetachStrokes = false;
        if (allVariables) {
          shouldDetachStrokes = true;
        } else if ((typeof colorVariables !== 'undefined' && colorVariables === true)) {
          shouldDetachStrokes = true;
        } else if (typeof detachExactVariables !== 'undefined' && Array.isArray(detachExactVariables) && detachExactVariables.indexOf('strokes') !== -1) {
          shouldDetachStrokes = true;
        }
        
        if (shouldDetachStrokes) {
          detachStrokesVariables(node);
        }
      }
    }

    // Check if node has boundVariables for other properties
    if (!node.boundVariables || typeof node.boundVariables !== 'object') {
      return;
    }

    var properties = Object.keys(node.boundVariables);
    
    // If no properties, nothing to detach
    if (properties.length === 0) {
      return;
    }

    console.log("Checking variables on node: " + node.name + " (type: " + node.type + "), found " + properties.length + " bound properties: " + properties.join(", "));
    
    for (var i = 0; i < properties.length; i++) {
      var property = properties[i];
      
      // Skip fills and strokes - we handle them separately above
      if (property === 'fills' || property === 'strokes') {
        continue;
      }
      
      var shouldDetach = false;

      // Check if we should detach this property
      if (allVariables) {
        shouldDetach = true;
      } else if (typeof detachExactVariables !== 'undefined' && Array.isArray(detachExactVariables) && detachExactVariables.indexOf(property) !== -1) {
        shouldDetach = true;
      } else if (typeof typographicVariables !== 'undefined' && typographicVariables === true && isTypographicProperty(property)) {
        shouldDetach = true;
      } else if (typeof numericVariables !== 'undefined' && numericVariables === true && isNumericProperty(property)) {
        shouldDetach = true;
      } else if (typeof colorVariables !== 'undefined' && colorVariables === true && isColorProperty(property)) {
        shouldDetach = true;
      }

      if (shouldDetach) {
        try {
          if (node.setBoundVariable && typeof node.setBoundVariable === 'function') {
            node.setBoundVariable(property, null);
            console.log("✅ Detached variable from property '" + property + "' on: " + node.name);
          } else {
            console.warn("⚠️  Node " + node.name + " does not have setBoundVariable function for property: " + property);
          }
        } catch (error) {
          console.warn("❌ Could not detach variable from property '" + property + "' on " + node.name + ": " + error.message);
        }
      } else {
        console.log("⏭️  Skipping property '" + property + "' on " + node.name + " (not configured to detach)");
      }
    }
  } catch (error) {
    console.warn("❌ Error detaching variables from " + (node ? node.name : 'unknown') + ": " + error.message);
  }
}

async function processNode(node) {
  if (!node) {
    return;
  }

  console.log("Processing node: " + node.name + " (type: " + node.type + ")");

  await detachStyles(node);
  detachVariables(node);

  if (recursive && "children" in node && node.children && node.children.length > 0) {
    console.log("  → Recursively processing " + node.children.length + " children");
    for (var i = 0; i < node.children.length; i++) {
      await processNode(node.children[i]);
    }
  } else if (recursive && "children" in node) {
    console.log("  → Node has children property but no children array or empty");
  } else if (!recursive) {
    console.log("  → Recursive mode disabled, skipping children");
  }
}

// Apply to all selected nodes
(async function () {
  if (figma.currentPage.selection.length === 0) {
    figma.notify('No selection found');
    return;
  }
  console.log("=== Starting detach process ===");
  console.log("Selected " + figma.currentPage.selection.length + " node(s)");
  console.log("Recursive mode: " + (recursive ? "enabled" : "disabled"));
  console.log("All styles: " + allStyles);
  console.log("All variables: " + allVariables);

  for (var i = 0; i < figma.currentPage.selection.length; i++) {
    await processNode(figma.currentPage.selection[i]);
  }

  console.log("=== Detach process complete ===");

  var message = 'Detached';
  var hasStyleDetach = allStyles ||
    (typeof fontStyles !== 'undefined' && fontStyles === true) ||
    (typeof fillStyles !== 'undefined' && fillStyles === true) ||
    (typeof strokeStyles !== 'undefined' && strokeStyles === true) ||
    (typeof effectStyles !== 'undefined' && effectStyles === true) ||
    (typeof gridStyles !== 'undefined' && gridStyles === true);
  var hasVariableDetach = allVariables ||
    (typeof typographicVariables !== 'undefined' && typographicVariables === true) ||
    (typeof numericVariables !== 'undefined' && numericVariables === true) ||
    (typeof colorVariables !== 'undefined' && colorVariables === true) ||
    (typeof detachExactVariables !== 'undefined' && detachExactVariables && detachExactVariables.length > 0);

  if (hasStyleDetach) {
    message += ' styles';
  }
  if (hasStyleDetach && hasVariableDetach) {
    message += ' and';
  }
  if (hasVariableDetach) {
    message += ' variables';
  }
  message += ' from selection';

  figma.notify(message);
})();
