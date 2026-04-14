// Scale or resize elements
// @DOC_START
// # Scale or resize elements
// **Scale** uses `rescale` (like the Scale tool). **Resize** uses constraint-aware `resize` (like dragging frame handles).
//
// ## Overview
// - **Scale:** Factor (uniform scale), or target width, or target height (other axis follows current aspect ratio).
// - **Resize:** Pixels (absolute width/height) or Factor (multipliers). Optional aspect ratio: `16:9`, `16/9`, `16, 9`, `16 9`. When aspect ratio is set with both width and height, landscape ratios keep width and recompute height; portrait ratios keep height and recompute width. Only **top-level selected** layers are transformed.
// @DOC_END

// @UI_CONFIG_START
// # Scale or resize
var scaleOrResize = "scale"; // @options: scale|resize @radio
// ## Scale @showWhen: scaleOrResize=scale
var scaleMethod = "factor"; // @options: factor|width|height @radio @showWhen: scaleOrResize=scale
var scaleFactor = 0.8; // @showWhen: scaleOrResize=scale @showWhen: scaleMethod=factor
var scaleWidthTo = ""; // @showWhen: scaleOrResize=scale @showWhen: scaleMethod=width
var scaleHeightTo = ""; // @showWhen: scaleOrResize=scale @showWhen: scaleMethod=height
// ## Resize @showWhen: scaleOrResize=resize
var resizeUnitMode = "pixels"; // @options: factor|pixels @radio @showWhen: scaleOrResize=resize
var widthTo = ""; // @showWhen: scaleOrResize=resize
var heightTo = ""; // @showWhen: scaleOrResize=resize
var aspectRatio = ""; // @showWhen: scaleOrResize=resize
// @UI_CONFIG_END

// Random range helper function
function random(min, max) {
  return Math.random() * (max - min) + min;
}

// Resolve value (handles numbers and random ranges for factor scale)
function resolveValue(value) {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && "min" in value && "max" in value) {
    return random(value.min, value.max);
  }
  return value;
}

/** Empty string or invalid → null; otherwise a finite number. */
function parseOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (isNaN(value)) return null;
    return value;
  }
  var t = String(value).trim();
  if (t === "") return null;
  var n = parseFloat(t);
  return isNaN(n) ? null : n;
}

/**
 * Accepts "16:9", "16/9", "16, 9", "16 9", etc.
 */
function parseAspectRatioFlexible(input) {
  if (input === null || input === undefined) return null;
  var s = String(input).trim();
  if (!s) return null;
  var w;
  var h;

  var m = s.match(/^([\d.]+)\s*[:/]\s*([\d.]+)$/);
  if (m) {
    w = parseFloat(m[1]);
    h = parseFloat(m[2]);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return { width: w, height: h, ratio: w / h };
    }
    return null;
  }

  m = s.match(/^([\d.]+)\s*[,]\s*([\d.]+)$/);
  if (m) {
    w = parseFloat(m[1]);
    h = parseFloat(m[2]);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return { width: w, height: h, ratio: w / h };
    }
    return null;
  }

  var parts = s.split(/\s+/).filter(function (p) {
    return p.length > 0;
  });
  if (parts.length >= 2) {
    w = parseFloat(parts[0]);
    h = parseFloat(parts[1]);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return { width: w, height: h, ratio: w / h };
    }
  }

  return null;
}

// Break down variables and styles to numeric values
function breakDownVariablesAndStyles(node) {
  try {
    if (node.width && typeof node.width === "object" && "resolve" in node.width) {
      node.width = node.width.resolve();
    }
    if (node.height && typeof node.height === "object" && "resolve" in node.height) {
      node.height = node.height.resolve();
    }

    if (node.x && typeof node.x === "object" && "resolve" in node.x) {
      node.x = node.x.resolve();
    }
    if (node.y && typeof node.y === "object" && "resolve" in node.y) {
      node.y = node.y.resolve();
    }

    if (node.cornerRadius && typeof node.cornerRadius === "object" && "resolve" in node.cornerRadius) {
      node.cornerRadius = node.cornerRadius.resolve();
    }

    if (node.topLeftRadius && typeof node.topLeftRadius === "object" && "resolve" in node.topLeftRadius) {
      node.topLeftRadius = node.topLeftRadius.resolve();
    }
    if (node.topRightRadius && typeof node.topRightRadius === "object" && "resolve" in node.topRightRadius) {
      node.topRightRadius = node.topRightRadius.resolve();
    }
    if (node.bottomLeftRadius && typeof node.bottomLeftRadius === "object" && "resolve" in node.bottomLeftRadius) {
      node.bottomLeftRadius = node.bottomLeftRadius.resolve();
    }
    if (node.bottomRightRadius && typeof node.bottomRightRadius === "object" && "resolve" in node.bottomRightRadius) {
      node.bottomRightRadius = node.bottomRightRadius.resolve();
    }

    if (node.paddingLeft && typeof node.paddingLeft === "object" && "resolve" in node.paddingLeft) {
      node.paddingLeft = node.paddingLeft.resolve();
    }
    if (node.paddingRight && typeof node.paddingRight === "object" && "resolve" in node.paddingRight) {
      node.paddingRight = node.paddingRight.resolve();
    }
    if (node.paddingTop && typeof node.paddingTop === "object" && "resolve" in node.paddingTop) {
      node.paddingTop = node.paddingTop.resolve();
    }
    if (node.paddingBottom && typeof node.paddingBottom === "object" && "resolve" in node.paddingBottom) {
      node.paddingBottom = node.paddingBottom.resolve();
    }

    if (node.itemSpacing && typeof node.itemSpacing === "object" && "resolve" in node.itemSpacing) {
      node.itemSpacing = node.itemSpacing.resolve();
    }
  } catch (error) {
    console.log("Warning: Could not break down some variables for node:", node.name || "unnamed");
  }
}

function validateTargetOptions() {
  if (scaleOrResize !== "scale" && scaleOrResize !== "resize") {
    throw new Error('scaleOrResize must be "scale" or "resize"');
  }

  if (scaleOrResize === "scale") {
    if (scaleMethod === "factor") {
      var f = resolveValue(scaleFactor);
      if (f == null || isNaN(f)) {
        throw new Error("Enter a valid scale factor");
      }
    } else if (scaleMethod === "width") {
      if (parseOptionalNumber(scaleWidthTo) == null) {
        throw new Error("Enter a target width for Scale");
      }
    } else if (scaleMethod === "height") {
      if (parseOptionalNumber(scaleHeightTo) == null) {
        throw new Error("Enter a target height for Scale");
      }
    }
    return;
  }

  var w = parseOptionalNumber(widthTo);
  var h = parseOptionalNumber(heightTo);
  var ar = parseAspectRatioFlexible(aspectRatio);
  if (w == null && h == null && ar == null) {
    throw new Error("Resize: set width, height, and/or aspect ratio");
  }
}

function computeScaleDimensions(ow, oh) {
  if (scaleMethod === "factor") {
    var f = resolveValue(scaleFactor);
    return { newWidth: ow * f, newHeight: oh * f };
  }
  if (scaleMethod === "width") {
    var nw = parseOptionalNumber(scaleWidthTo);
    if (nw == null) throw new Error("Enter a target width");
    return { newWidth: nw, newHeight: oh * (nw / ow) };
  }
  if (scaleMethod === "height") {
    var nh = parseOptionalNumber(scaleHeightTo);
    if (nh == null) throw new Error("Enter a target height");
    return { newWidth: ow * (nh / oh), newHeight: nh };
  }
  throw new Error("Invalid scale method");
}

function computeResizeDimensions(ow, oh) {
  var wRaw = parseOptionalNumber(widthTo);
  var hRaw = parseOptionalNumber(heightTo);
  var ar = parseAspectRatioFlexible(aspectRatio);
  // Legacy UI value "scale" → "factor"
  var unitMode = resizeUnitMode === "scale" ? "factor" : resizeUnitMode;
  var isPixels = unitMode === "pixels";

  function scaleUniform(f) {
    return { newWidth: ow * f, newHeight: oh * f };
  }

  // Multiplier mode: single value scales both axes uniformly (keeps aspect)
  if (!isPixels) {
    if (wRaw != null && hRaw == null) {
      return scaleUniform(wRaw);
    }
    if (hRaw != null && wRaw == null) {
      return scaleUniform(hRaw);
    }
  }

  var wPx = null;
  var hPx = null;

  if (isPixels) {
    wPx = wRaw;
    hPx = hRaw;
  } else {
    if (wRaw != null && hRaw != null) {
      wPx = ow * wRaw;
      hPx = oh * hRaw;
    }
  }

  // Only aspect ratio: effective scale 1, snap to target aspect (landscape: fix width; portrait: fix height)
  if (wPx == null && hPx == null && ar != null) {
    if (ar.ratio >= 1) {
      return { newWidth: ow, newHeight: ow / ar.ratio };
    }
    return { newWidth: oh * ar.ratio, newHeight: oh };
  }

  if (wPx == null && hPx == null) {
    throw new Error("Resize: set width, height, and/or aspect ratio");
  }

  // Both dimensions + aspect: landscape (ratio ≥ 1) keeps width; portrait keeps height
  if (wPx != null && hPx != null && ar != null) {
    if (ar.ratio >= 1) {
      return { newWidth: wPx, newHeight: wPx / ar.ratio };
    }
    return { newWidth: hPx * ar.ratio, newHeight: hPx };
  }

  if (wPx != null && ar != null && hPx == null) {
    return { newWidth: wPx, newHeight: wPx / ar.ratio };
  }
  if (hPx != null && ar != null && wPx == null) {
    return { newWidth: hPx * ar.ratio, newHeight: hPx };
  }

  if (wPx != null && hPx != null && ar == null) {
    return { newWidth: wPx, newHeight: hPx };
  }

  if (wPx != null && hPx == null && ar == null) {
    return { newWidth: wPx, newHeight: oh * (wPx / ow) };
  }
  if (wPx == null && hPx != null && ar == null) {
    return { newWidth: ow * (hPx / oh), newHeight: hPx };
  }

  throw new Error("Invalid resize parameter combination");
}

function calculateScaling(node) {
  var ow = node.width;
  var oh = node.height;

  if (scaleOrResize === "scale") {
    return computeScaleDimensions(ow, oh);
  }
  return computeResizeDimensions(ow, oh);
}

var UNIFORM_SCALE_EPS = 1e-5;

/**
 * Resize like Figma's handle drag: `resize(w,h)` applies child constraints.
 */
function applyResizeToRoot(node) {
  if (!("resize" in node)) return;

  breakDownVariablesAndStyles(node);

  var scaling = calculateScaling(node);
  var newW = scaling.newWidth;
  var newH = scaling.newHeight;
  if (node.type === "LINE") {
    newH = 0;
  }

  node.resize(newW, newH);
}

/**
 * Proportional scale like the Scale tool (`rescale`). Uniform factors use `rescale`;
 * non-uniform targets fall back to `resize` (API has no anisotropic rescale).
 */
function applyScaleToRoot(node) {
  if (!("resize" in node)) return { nonUniform: false, skipped: true };

  breakDownVariablesAndStyles(node);

  var ow = node.width;
  var oh = node.height;
  var scaling = calculateScaling(node);
  var newW = scaling.newWidth;
  var newH = scaling.newHeight;
  if (node.type === "LINE") {
    newH = 0;
  }

  var sx = ow > 0 ? newW / ow : 1;
  var sy = oh > 0 ? newH / oh : 1;
  if (oh <= 0 && node.type !== "LINE") {
    sy = sx;
  }
  if (ow <= 0 && node.type !== "LINE") {
    sx = sy;
  }

  if (node.type === "LINE") {
    if (typeof node["rescale"] === "function") {
      node["rescale"](sx);
      node.x -= ow * (sx - 1) / 2;
      node.y -= oh * (sx - 1) / 2;
    } else {
      node.resize(newW, 0);
      node.x -= (newW - ow) / 2;
      node.y -= (newH - oh) / 2;
    }
    return { nonUniform: false, skipped: false };
  }

  var uniform = Math.abs(sx - sy) < UNIFORM_SCALE_EPS;

  if (uniform && typeof node["rescale"] === "function") {
    var s = (sx + sy) / 2;
    node["rescale"](s);
    node.x -= ow * (s - 1) / 2;
    node.y -= oh * (s - 1) / 2;
    return { nonUniform: false, skipped: false };
  }

  if (uniform) {
    node.resize(newW, newH);
    node.x -= (newW - ow) / 2;
    node.y -= (newH - oh) / 2;
    return { nonUniform: false, skipped: false };
  }

  node.resize(newW, newH);
  node.x -= (newW - ow) / 2;
  node.y -= (newH - oh) / 2;
  return { nonUniform: true, skipped: false };
}

function buildNotifyMessage() {
  var action = scaleOrResize === "resize" ? "Resized" : "Scaled";
  var message = action + " " + figma.currentPage.selection.length + " items";

  if (scaleOrResize === "scale") {
    if (scaleMethod === "factor") {
      message += " factor " + resolveValue(scaleFactor) + "×";
    } else if (scaleMethod === "width") {
      message += " to width " + parseOptionalNumber(scaleWidthTo) + "px";
    } else {
      message += " to height " + parseOptionalNumber(scaleHeightTo) + "px";
    }
    message += " (scale)";
    return message;
  }

  var resizeUnitLabel = resizeUnitMode === "scale" ? "factor" : resizeUnitMode;
  message += " [" + resizeUnitLabel + "]";
  var w = parseOptionalNumber(widthTo);
  var h = parseOptionalNumber(heightTo);
  var ar = parseAspectRatioFlexible(aspectRatio);
  var parts = [];
  if (w != null) parts.push("w=" + w + (resizeUnitLabel === "pixels" ? "px" : "×"));
  if (h != null) parts.push("h=" + h + (resizeUnitLabel === "pixels" ? "px" : "×"));
  if (ar != null) parts.push("aspect " + aspectRatio.trim());
  if (parts.length) message += " " + parts.join(", ");
  message += " (resize)";
  return message;
}

// Validate configuration before proceeding
try {
  validateTargetOptions();

  var hadNonUniformScaleFallback = false;

  figma.currentPage.selection.forEach(function (node) {
    if (scaleOrResize === "resize") {
      applyResizeToRoot(node);
    } else {
      var r = applyScaleToRoot(node);
      if (r && r.nonUniform) {
        hadNonUniformScaleFallback = true;
      }
    }
  });

  var message = buildNotifyMessage();
  if (scaleOrResize === "scale" && hadNonUniformScaleFallback) {
    message += ". Non-uniform target used resize (Plugin API has no anisotropic rescale).";
  }
  figma.notify(message);
} catch (error) {
  figma.notify("Error: " + error.message);
}
