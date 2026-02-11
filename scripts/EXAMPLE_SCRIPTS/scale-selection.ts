// Scale or resize elements
// @DOC_START
// # Scale or resize elements
// Scale or resize selected elements with uniform or independent dimensions, optional aspect ratio, and random ranges.
//
// ## Overview
// Applies either **scale** (transform; content scales) or **resize** (change size only) to each selected node. Use one set of parameters: uniform factor, X/Y factors, width/height, or single dimension with aspect ratio.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | method | "scale" or "resize". |
// | scaledFactor | Uniform scale (number or { min, max } for per-element random). |
// | scaledFactorX / scaledFactorY | Per-axis scale factors. |
// | scaledWidth / scaledHeight | Target dimensions in px (number or { min, max }). |
// | aspectRatio | Target ratio, e.g. "16:9", "1:1"; use with one dimension or one factor. |
// @DOC_END

// CONFIGURATION OPTIONS
// Choose your scaling method and parameters below. Uncomment the options you want to use.
// 
// SCALING METHODS:
// - SCALE: Transforms elements while maintaining their visual appearance (like scaling in Figma)
// - RESIZE: Changes dimensions without scaling content (like resizing a frame)
//
// SCALING PARAMETERS (choose ONE group):
// 1. Uniform scaling: scaledFactor
// 2. Independent scaling: scaledFactorX + scaledFactorY  
// 3. Dimension-based: scaledWidth + scaledHeight
// 4. Single dimension + aspect ratio: scaledWidth + aspectRatio OR scaledHeight + aspectRatio
// 5. Single factor + aspect ratio: scaledFactorX + aspectRatio OR scaledFactorY + aspectRatio
//
// ASPECT RATIO: Use "3:4", "16:9", "1:1" format to force target aspect ratio
// NOTE: scaledWidth/scaledHeight cannot be combined with scaledFactor/scaledFactorX/scaledFactorY
//
// RANDOM RANGES: Use { min: X, max: Y } to apply a different random value to each element
// Examples:
//   var scaledFactor = { min: 0.5, max: 1.5 };
//   var scaledWidth = { min: 200, max: 500 };
//   var scaledFactorX = { min: 0.8, max: 1.2 };

// method = "scale" or "resize" - how to transform the elements
// scaledFactor = Uniform scaling factor (number or { min, max })
// scaledFactorX = X-axis scaling factor (number or { min, max })
// scaledFactorY = Y-axis scaling factor (number or { min, max })
// scaledWidth = Target width in pixels (number or { min, max })
// scaledHeight = Target height in pixels (number or { min, max })
// aspectRatio = Target aspect ratio (e.g., "3:4", "16:9", "1:1") - scales to this ratio

// @CONFIG_START
var method = "scale";
var scaledFactor = 0.8;
// var scaledFactorX = 0.8;
// var scaledFactorY = 0.8;
// var scaledWidth = 320;
// var scaledHeight = 240;
// var aspectRatio = "16:9";

// Examples with random ranges:
// var scaledFactor = { min: 0.5, max: 1.5 }; // Each element gets a random scale between 0.5x and 1.5x
// var scaledWidth = { min: 200, max: 500 }; // Each element gets a random width between 200px and 500px
// @CONFIG_END

// Random range helper function
function random(min, max) {
  return Math.random() * (max - min) + min;
}

// Resolve value (handles numbers and random ranges)
function resolveValue(value) {
  // If it's a number, return it as-is
  if (typeof value === 'number') {
    return value;
  }
  // If it's an object with min/max, it's a random range marker
  if (value && typeof value === 'object' && 'min' in value && 'max' in value) {
    return random(value.min, value.max);
  }
  return value;
}

// Parse aspect ratio string (e.g., "3:4", "16:9", "1:1")
function parseAspectRatio(ratioString) {
  if (!ratioString || typeof ratioString !== 'string') return null;
  
  var parts = ratioString.split(':');
  if (parts.length !== 2) return null;
  
  var width = parseFloat(parts[0]);
  var height = parseFloat(parts[1]);
  
  if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) return null;
  
  return { width: width, height: height, ratio: width / height };
}

// Break down variables and styles to numeric values
function breakDownVariablesAndStyles(node) {
  try {
    // Break down width/height variables
    if (node.width && typeof node.width === 'object' && 'resolve' in node.width) {
      node.width = node.width.resolve();
    }
    if (node.height && typeof node.height === 'object' && 'resolve' in node.height) {
      node.height = node.height.resolve();
    }
    
    // Break down x/y position variables
    if (node.x && typeof node.x === 'object' && 'resolve' in node.x) {
      node.x = node.x.resolve();
    }
    if (node.y && typeof node.y === 'object' && 'resolve' in node.y) {
      node.y = node.y.resolve();
    }
    
    // Break down corner radius variables
    if (node.cornerRadius && typeof node.cornerRadius === 'object' && 'resolve' in node.cornerRadius) {
      node.cornerRadius = node.cornerRadius.resolve();
    }
    
    // Break down individual corner radius variables
    if (node.topLeftRadius && typeof node.topLeftRadius === 'object' && 'resolve' in node.topLeftRadius) {
      node.topLeftRadius = node.topLeftRadius.resolve();
    }
    if (node.topRightRadius && typeof node.topRightRadius === 'object' && 'resolve' in node.topRightRadius) {
      node.topRightRadius = node.topRightRadius.resolve();
    }
    if (node.bottomLeftRadius && typeof node.bottomLeftRadius === 'object' && 'resolve' in node.bottomLeftRadius) {
      node.bottomLeftRadius = node.bottomLeftRadius.resolve();
    }
    if (node.bottomRightRadius && typeof node.bottomRightRadius === 'object' && 'resolve' in node.bottomRightRadius) {
      node.bottomRightRadius = node.bottomRightRadius.resolve();
    }
    
    // Break down padding variables (for auto-layout frames)
    if (node.paddingLeft && typeof node.paddingLeft === 'object' && 'resolve' in node.paddingLeft) {
      node.paddingLeft = node.paddingLeft.resolve();
    }
    if (node.paddingRight && typeof node.paddingRight === 'object' && 'resolve' in node.paddingRight) {
      node.paddingRight = node.paddingRight.resolve();
    }
    if (node.paddingTop && typeof node.paddingTop === 'object' && 'resolve' in node.paddingTop) {
      node.paddingTop = node.paddingTop.resolve();
    }
    if (node.paddingBottom && typeof node.paddingBottom === 'object' && 'resolve' in node.paddingBottom) {
      node.paddingBottom = node.paddingBottom.resolve();
    }
    
    // Break down gap variables (for auto-layout frames)
    if (node.itemSpacing && typeof node.itemSpacing === 'object' && 'resolve' in node.itemSpacing) {
      node.itemSpacing = node.itemSpacing.resolve();
    }
    
  } catch (error) {
    console.log('Warning: Could not break down some variables for node:', node.name || 'unnamed');
  }
}

// Validation function to ensure mutually exclusive options
function validateScalingOptions() {
  // Validate method
  if (method !== "scale" && method !== "resize") {
    throw new Error("method must be either 'scale' or 'resize'");
  }
  
  var hasUniformFactor = typeof scaledFactor !== 'undefined' && scaledFactor !== null;
  var hasFactorX = typeof scaledFactorX !== 'undefined' && scaledFactorX !== null;
  var hasFactorY = typeof scaledFactorY !== 'undefined' && scaledFactorY !== null;
  var hasWidth = typeof scaledWidth !== 'undefined' && scaledWidth !== null;
  var hasHeight = typeof scaledHeight !== 'undefined' && scaledHeight !== null;
  var hasAspectRatio = typeof aspectRatio !== 'undefined' && aspectRatio !== null && parseAspectRatio(aspectRatio) !== null;
  
  // Check for conflicting combinations
  if (hasUniformFactor && (hasFactorX || hasFactorY || hasWidth || hasHeight)) {
    throw new Error("scaledFactor cannot be used with scaledFactorX, scaledFactorY, scaledWidth, or scaledHeight");
  }
  
  if (hasWidth && hasHeight && (hasFactorX || hasFactorY)) {
    throw new Error("scaledWidth + scaledHeight cannot be used with scaledFactorX or scaledFactorY");
  }
  
  if (hasFactorX && hasFactorY && (hasWidth || hasHeight)) {
    throw new Error("scaledFactorX + scaledFactorY cannot be used with scaledWidth or scaledHeight");
  }
  
  // At least one scaling method must be specified
  if (!hasUniformFactor && !hasFactorX && !hasFactorY && !hasWidth && !hasHeight) {
    throw new Error("At least one scaling option must be specified");
  }
}

function calculateScaling(node) {
  var originalWidth = node.width;
  var originalHeight = node.height;
  var newWidth = originalWidth;
  var newHeight = originalHeight;
  
  // Resolve values (handles random ranges - each call gets a new random value)
  var resolvedScaledFactor = typeof scaledFactor !== 'undefined' ? resolveValue(scaledFactor) : null;
  var resolvedScaledFactorX = typeof scaledFactorX !== 'undefined' ? resolveValue(scaledFactorX) : null;
  var resolvedScaledFactorY = typeof scaledFactorY !== 'undefined' ? resolveValue(scaledFactorY) : null;
  var resolvedScaledWidth = typeof scaledWidth !== 'undefined' ? resolveValue(scaledWidth) : null;
  var resolvedScaledHeight = typeof scaledHeight !== 'undefined' ? resolveValue(scaledHeight) : null;
  
  // Parse aspect ratio if provided
  var targetAspectRatio = typeof aspectRatio !== 'undefined' ? parseAspectRatio(aspectRatio) : null;
  
  // Determine scaling method based on configuration
  if (resolvedScaledFactor !== null) {
    // Uniform scaling
    newWidth = originalWidth * resolvedScaledFactor;
    newHeight = originalHeight * resolvedScaledFactor;
    
    // Apply target aspect ratio if specified
    if (targetAspectRatio) {
      var currentAspectRatio = newWidth / newHeight;
      if (currentAspectRatio > targetAspectRatio.ratio) {
        // Too wide, adjust height
        newHeight = newWidth / targetAspectRatio.ratio;
      } else {
        // Too tall, adjust width
        newWidth = newHeight * targetAspectRatio.ratio;
      }
    }
  } else if (resolvedScaledWidth !== null && resolvedScaledHeight !== null) {
    // Both width and height specified
    newWidth = resolvedScaledWidth;
    newHeight = resolvedScaledHeight;
  } else if (resolvedScaledWidth !== null) {
    // Width specified
    newWidth = resolvedScaledWidth;
    if (targetAspectRatio) {
      // Scale to target aspect ratio
      newHeight = newWidth / targetAspectRatio.ratio;
    } else if (resolvedScaledFactorY !== null) {
      newHeight = originalHeight * resolvedScaledFactorY;
    } else {
      // Preserve current aspect ratio by default
      newHeight = originalHeight * (resolvedScaledWidth / originalWidth);
    }
  } else if (resolvedScaledHeight !== null) {
    // Height specified
    newHeight = resolvedScaledHeight;
    if (targetAspectRatio) {
      // Scale to target aspect ratio
      newWidth = newHeight * targetAspectRatio.ratio;
    } else if (resolvedScaledFactorX !== null) {
      newWidth = originalWidth * resolvedScaledFactorX;
    } else {
      // Preserve current aspect ratio by default
      newWidth = originalWidth * (resolvedScaledHeight / originalHeight);
    }
  } else if (resolvedScaledFactorX !== null && resolvedScaledFactorY !== null) {
    // Both X and Y factors specified
    newWidth = originalWidth * resolvedScaledFactorX;
    newHeight = originalHeight * resolvedScaledFactorY;
  } else if (resolvedScaledFactorX !== null) {
    // X factor only
    newWidth = originalWidth * resolvedScaledFactorX;
    if (targetAspectRatio) {
      // Scale to target aspect ratio
      newHeight = newWidth / targetAspectRatio.ratio;
    } else {
      // Preserve current aspect ratio by default
      newHeight = originalHeight * resolvedScaledFactorX;
    }
  } else if (resolvedScaledFactorY !== null) {
    // Y factor only
    newHeight = originalHeight * resolvedScaledFactorY;
    if (targetAspectRatio) {
      // Scale to target aspect ratio
      newWidth = newHeight * targetAspectRatio.ratio;
    } else {
      // Preserve current aspect ratio by default
      newWidth = originalWidth * resolvedScaledFactorY;
    }
  }
  
  return { newWidth, newHeight };
}

function scaleIndividually(node) {
  if ("children" in node) {
    node.children.forEach(function(child) {
      scaleIndividually(child);
    });
  }

  if ("resize" in node && "absoluteTransform" in node && node.type !== "GROUP") {
    var bbox = node.absoluteBoundingBox;
    if (!bbox) return;

    // Break down variables and styles before scaling
    breakDownVariablesAndStyles(node);

    var scaling = calculateScaling(node);
    var newWidth = scaling.newWidth;
    var newHeight = scaling.newHeight;

    // Calculate center offset to maintain position
    var dx = (newWidth - node.width) / 2;
    var dy = (newHeight - node.height) / 2;

    node.resize(newWidth, newHeight);
    node.x -= dx;
    node.y -= dy;
  }
}

function resizeIndividually(node) {
  if ("children" in node) {
    node.children.forEach(function(child) {
      resizeIndividually(child);
    });
  }

  if ("resize" in node && node.type !== "GROUP") {
    // Break down variables and styles before resizing
    breakDownVariablesAndStyles(node);

    var scaling = calculateScaling(node);
    var newWidth = scaling.newWidth;
    var newHeight = scaling.newHeight;

    // For resize, we don't adjust position - just change dimensions
    node.resize(newWidth, newHeight);
  }
}

// Validate configuration before proceeding
try {
  validateScalingOptions();
  
  // Choose the appropriate transformation method
  var transformFunction = method === "resize" ? resizeIndividually : scaleIndividually;

figma.currentPage.selection.forEach(function(node) {
    transformFunction(node);
  });
  
  // Generate appropriate notification message
  var targetAspectRatio = typeof aspectRatio !== 'undefined' ? parseAspectRatio(aspectRatio) : null;
  var action = method === "resize" ? "Resized" : "Scaled";
  var message = action + ' ' + figma.currentPage.selection.length + ' items';
  
  if (typeof scaledFactor !== 'undefined' && scaledFactor !== null) {
    message += ' by ' + scaledFactor + 'x';
    if (targetAspectRatio) {
      message += ' (aspect ratio ' + aspectRatio + ')';
    }
  } else if (typeof scaledWidth !== 'undefined' && scaledWidth !== null && typeof scaledHeight !== 'undefined' && scaledHeight !== null) {
    message += ' to ' + scaledWidth + 'x' + scaledHeight + 'px';
  } else if (typeof scaledWidth !== 'undefined' && scaledWidth !== null) {
    message += ' to width ' + scaledWidth + 'px';
    if (targetAspectRatio) {
      message += ' (aspect ratio ' + aspectRatio + ')';
    } else if (typeof scaledFactorY === 'undefined' || scaledFactorY === null) {
      message += ' (preserving aspect ratio)';
    }
  } else if (typeof scaledHeight !== 'undefined' && scaledHeight !== null) {
    message += ' to height ' + scaledHeight + 'px';
    if (targetAspectRatio) {
      message += ' (aspect ratio ' + aspectRatio + ')';
    } else if (typeof scaledFactorX === 'undefined' || scaledFactorX === null) {
      message += ' (preserving aspect ratio)';
    }
  } else if (typeof scaledFactorX !== 'undefined' && scaledFactorX !== null && typeof scaledFactorY !== 'undefined' && scaledFactorY !== null) {
    message += ' by ' + scaledFactorX + 'x' + scaledFactorY + 'x';
  } else if (typeof scaledFactorX !== 'undefined' && scaledFactorX !== null) {
    message += ' by ' + scaledFactorX + 'x (X-axis)';
    if (targetAspectRatio) {
      message += ' (aspect ratio ' + aspectRatio + ')';
    } else {
      message += ' (preserving aspect ratio)';
    }
  } else if (typeof scaledFactorY !== 'undefined' && scaledFactorY !== null) {
    message += ' by ' + scaledFactorY + 'x (Y-axis)';
    if (targetAspectRatio) {
      message += ' (aspect ratio ' + aspectRatio + ')';
    } else {
      message += ' (preserving aspect ratio)';
    }
  }
  
  message += ' (' + method + ' method)';
  figma.notify(message);
} catch (error) {
  figma.notify('Error: ' + error.message);
}
