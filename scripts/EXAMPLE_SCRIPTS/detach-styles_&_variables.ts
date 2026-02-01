// Detach styles & variables
// @DOC_START
// # Detach styles & variables
// Removes style and variable bindings from selected nodes (and optionally their children).
//
// ## Overview
// Clears text/fill/stroke/effect/grid style IDs and variable bindings on selected nodes so they use local values. Can run recursively on children.
//
// ## Config options
// - **recursive** – If true, processes children as well.
// - **detachAllStyles** – If true, detaches all style types; otherwise use per-type flags (detachFontStyles, detachFillStyles, etc.).
// - **detachAllVariables** – If true, detaches all variable bindings; otherwise use detachTypographicVariables, detachNumericVariables, or detachExactVariables (array of property names).
// @DOC_END

// @CONFIG_START
// Configuration - change these to control what gets detached
var recursive = true;
var detachAllStyles = true;
var detachAllVariables = true;

// Detailed config
// Uncomment the lines below to enable granular control:

//var detachFontStyles = true;
//var detachFillStyles = false;
//var detachStrokeStyles = false;
//var detachEffectStyles = false;
//var detachGridStyles = false;

//var detachTypographicVariables = true;
//var detachNumericVariables = true;
//var detachExactVariables = ["width", "height"];

// Variable properties that can be called:
// Typography: fontSize, fontWeight, fontFamily, lineHeight, letterSpacing, paragraphSpacing, paragraphIndent, textCase, textDecoration, characters, textRangeFills
// Dimensions & Spacing: width, height, minWidth, maxWidth, minHeight, maxHeight, paddingTop, paddingRight, paddingBottom, paddingLeft, itemSpacing, cornerRadius, topLeftRadius, topRightRadius, bottomLeftRadius, bottomRightRadius, strokeWeight, strokeTopWeight, strokeRightWeight, strokeBottomWeight, strokeLeftWeight
// Color: fills, strokes, opacity
// Grid & Effects: layoutGrids, effects, visible
// @CONFIG_END

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

function detachStyles(node) {
  // Detach text style if node is text and option enabled
  if ((detachAllStyles || (typeof detachFontStyles !== 'undefined' && detachFontStyles === true)) && node.type === "TEXT" && "textStyleId" in node) {
    if (node.textStyleId) {
      node.textStyleId = ""; // Remove link to text style
      console.log("Detached font style from: " + node.name);
    }
  }

  // Detach fill style
  if ((detachAllStyles || (typeof detachFillStyles !== 'undefined' && detachFillStyles === true)) && "fillStyleId" in node) {
    if (node.fillStyleId) {
      node.fillStyleId = "";
      console.log("Detached fill style from: " + node.name);
    }
  }

  // Detach stroke style
  if ((detachAllStyles || (typeof detachStrokeStyles !== 'undefined' && detachStrokeStyles === true)) && "strokeStyleId" in node) {
    if (node.strokeStyleId) {
      node.strokeStyleId = "";
      console.log("Detached stroke style from: " + node.name);
    }
  }

  // Detach effect style (e.g., shadows)
  if ((detachAllStyles || (typeof detachEffectStyles !== 'undefined' && detachEffectStyles === true)) && "effectStyleId" in node) {
    if (node.effectStyleId) {
      node.effectStyleId = "";
      console.log("Detached effect style from: " + node.name);
    }
  }

  // Detach grid style (only frames)
  if ((detachAllStyles || (typeof detachGridStyles !== 'undefined' && detachGridStyles === true)) && "gridStyleId" in node) {
    if (node.gridStyleId) {
      node.gridStyleId = "";
      console.log("Detached grid style from: " + node.name);
    }
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
        if (detachAllVariables) {
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
        if (detachAllVariables) {
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
      if (detachAllVariables) {
        shouldDetach = true;
      } else if (typeof detachExactVariables !== 'undefined' && Array.isArray(detachExactVariables) && detachExactVariables.indexOf(property) !== -1) {
        shouldDetach = true;
      } else if (typeof detachTypographicVariables !== 'undefined' && detachTypographicVariables === true && isTypographicProperty(property)) {
        shouldDetach = true;
      } else if (typeof detachNumericVariables !== 'undefined' && detachNumericVariables === true && isNumericProperty(property)) {
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

function processNode(node) {
  if (!node) {
    return;
  }

  console.log("Processing node: " + node.name + " (type: " + node.type + ")");
  
  // Detach styles and variables from this node
  detachStyles(node);
  detachVariables(node);

  // Traverse children if recursive is enabled
  if (recursive && "children" in node && node.children && node.children.length > 0) {
    console.log("  → Recursively processing " + node.children.length + " children");
    for (var i = 0; i < node.children.length; i++) {
      processNode(node.children[i]);
    }
  } else if (recursive && "children" in node) {
    console.log("  → Node has children property but no children array or empty");
  } else if (!recursive) {
    console.log("  → Recursive mode disabled, skipping children");
  }
}

// Apply to all selected nodes
if (figma.currentPage.selection.length === 0) {
  figma.notify('No selection found');
} else {
  console.log("=== Starting detach process ===");
  console.log("Selected " + figma.currentPage.selection.length + " node(s)");
  console.log("Recursive mode: " + (recursive ? "enabled" : "disabled"));
  console.log("Detach all styles: " + detachAllStyles);
  console.log("Detach all variables: " + detachAllVariables);
  
  for (var i = 0; i < figma.currentPage.selection.length; i++) {
    processNode(figma.currentPage.selection[i]);
  }
  
  console.log("=== Detach process complete ===");
  
  var message = 'Detached';
  var hasStyleDetach = detachAllStyles || 
                       (typeof detachFontStyles !== 'undefined' && detachFontStyles === true) ||
                       (typeof detachFillStyles !== 'undefined' && detachFillStyles === true) ||
                       (typeof detachStrokeStyles !== 'undefined' && detachStrokeStyles === true) ||
                       (typeof detachEffectStyles !== 'undefined' && detachEffectStyles === true) ||
                       (typeof detachGridStyles !== 'undefined' && detachGridStyles === true);
  var hasVariableDetach = detachAllVariables || 
                          (typeof detachTypographicVariables !== 'undefined' && detachTypographicVariables === true) ||
                          (typeof detachNumericVariables !== 'undefined' && detachNumericVariables === true) ||
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
}
