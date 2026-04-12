// Spacing
// @DOC_START
// # Spacing
// Responsive spacing scale with range-first scaling (min → base → max per viewport).
//
// ## Overview
// Creates FLOAT variables only (no preview frames). **Range layout:** **`scaling.rangeMode`** selects (1) **`full`** (default when omitted) — one ramp from each mode’s **`min` → `max`** across all tokens (`t = index / (lastIndex)`), with **`scaling.type`** / **`scaling.ease`** reshaping progress along that ramp — or (2) **`twoSegment`** — **`min` → `base` → `max`** in two segments (typography-style), with easing applied **within each** segment. Use **`twoSegment`** when you anchor a middle token; otherwise omit for a single eased ramp over the full range. One **`roundTo`** grid applies to every step. Variables use **`WIDTH_HEIGHT`** and **`GAP`**.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | collectionName | Figma variable collection (e.g. `Responsive System`). |
// | group | Variable name prefix folder (e.g. `Spacing` → `Spacing/md`). |
// | spacings | **Either** an ordered array of token names (smallest → largest), e.g. `["px","xs","sm",…]` — `base.level` must match one entry — **or** a **string template** used with **`steps`** to generate names, e.g. `"spacings-{$step}"` → `spacings-1` … `spacings-N`. Placeholders: `{$index}` (0-based), `{$index1}` / `{$step}` (1-based), `{$steps}` (total count). |
// | steps | Required with the **string** form of **`spacings`**: positive integer = number of tokens. If **`spacings`** is omitted, `[]`, or only whitespace, **`steps`** alone fills names using the default pattern `space-{$index}`. Ignored when **`spacings`** is a non-empty **array**. |
// | modes | `{ name, min, max }` per viewport; optional `base: { level, size }` — if omitted, defaults to `md` and a size derived from min/max. |
// | scaling.type | Range curve: linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio. **Piecewise:** `piecewise`, `piecewise2`, `piecewise4` — snapped Carbon-like ramp (see [Carbon spacing](https://carbondesignsystem.com/elements/spacing/overview/)); single segment `min`→`max` over all tokens. |
// | scaling.rangeMode | `full` — single ramp `min`→`max` over all tokens. `twoSegment` — `min`→`base`→`max` (typography-style). **Omitted (auto):** `full` (all curve types). Set `twoSegment` explicitly for the split ramp. |
// | scaling.ease | Applied to the curve (`getEasedFactor`). **Note:** in `@Math Helpers`, **`ease` is ignored when `type === 'linear'`** (output equals `t`); use a non-linear `type` if you want easing. **Piecewise:** use `ease: "none"`; easing does not reshape the piecewise ladder (tabular generator). |
// | fontScaling | Optional alias; merged into `scaling` when set. |
// | scaling.roundTo | Snap all spacing values to multiples of this number (e.g. `2` → 2, 4, 6, …). Omit or `0` for no snapping. Legacy: `roundUpperValuesTo` is accepted as an alias for `roundTo`. |
// | (output) | Variables use `scopes: ['WIDTH_HEIGHT', 'GAP']`. |
// | generateOverview | Optional boolean (default `false`). When `true`, builds a **Spacing — overview** frame (token rows × mode columns, variable-bound width bars). Uses `@Foundation overview`. |
// @DOC_END

@import { getOrCreateCollection, setupModes, extractModes, processVariables, getVariable } from "@Variables"
@import { foundationCreateSpacingOverview } from "@Foundation overview"
@import { applyEase, applyEaseWithExponents, lerp, generatePiecewiseSnappedScale, isPiecewiseScaleType } from "@Math Helpers"

// ========================================
// CONFIG HELPERS
// ========================================

function spacingModesToSpacingSizes(modes, spacings, defaultBaseLevel) {
  var out = {};
  if (!Array.isArray(modes)) return out;
  var baseLevel = typeof defaultBaseLevel === 'string' && defaultBaseLevel
    ? defaultBaseLevel
    : (Array.isArray(spacings) && spacings.length ? spacings[Math.floor(spacings.length / 2)] : 'md');

  function defaultBaseSize(min, max) {
    var lo = typeof min === 'number' ? min : 0;
    var hi = typeof max === 'number' ? max : lo;
    if (hi <= lo) return lo;
    return Math.max(lo, Math.min(hi, Math.round(Math.sqrt(lo * hi))));
  }

  for (var i = 0; i < modes.length; i++) {
    var m = modes[i];
    if (!m || typeof m !== 'object' || typeof m.name !== 'string' || !m.name) continue;
    var min = typeof m.min === 'number' ? m.min : 0;
    var max = typeof m.max === 'number' ? m.max : min;
    var base = m.base && typeof m.base === 'object' ? m.base : {};
    var level = typeof base.level === 'string' && base.level ? base.level : baseLevel;
    var size = typeof base.size === 'number' ? base.size : defaultBaseSize(min, max);
    out[m.name] = {
      min: min,
      max: max,
      base: { level: level, size: size }
    };
  }
  return out;
}

function resolveSpacingSizes(config) {
  if (config.modes && Array.isArray(config.modes) && config.modes.length > 0) {
    return spacingModesToSpacingSizes(config.modes, config.spacings, config.defaultBaseLevel);
  }
  if (config.spacingSizes && typeof config.spacingSizes === 'object') {
    return config.spacingSizes;
  }
  return {};
}

function materializeSpacingSizes(config) {
  if (!config || typeof config !== 'object') return;
  config.spacingSizes = resolveSpacingSizes(config);
}

/**
 * Expands `spacings` from a string template + `steps`, or fills default names when only `steps` is set.
 * Non-empty `spacings` array is left unchanged.
 */
function applySpacingNameTemplate(template, index, totalSteps) {
  var s = String(template);
  var i0 = index;
  var i1 = index + 1;
  return s
    .replace(/\{\$steps\}/g, String(totalSteps))
    .replace(/\{\$index1\}/g, String(i1))
    .replace(/\{\$step\}/g, String(i1))
    .replace(/\{\$index\}/g, String(i0));
}

function materializeSpacingsFromSteps(config) {
  if (!config || typeof config !== 'object') return;
  var raw = config.spacings;
  if (Array.isArray(raw) && raw.length > 0) {
    return;
  }
  var n = typeof config.steps === 'number' ? config.steps : 0;
  if (typeof raw === 'string' && raw.trim()) {
    if (n < 1) {
      console.warn('Spacing: `steps` (positive integer) is required when `spacings` is a name template string.');
      config.spacings = [];
      return;
    }
    var tplStr = raw.trim();
    var outStr = [];
    var j;
    for (j = 0; j < n; j++) {
      outStr.push(applySpacingNameTemplate(tplStr, j, n));
    }
    config.spacings = outStr;
    return;
  }
  if (n < 1) {
    return;
  }
  var tplDefault = 'space-{$index}';
  var out = [];
  var i;
  for (i = 0; i < n; i++) {
    out.push(applySpacingNameTemplate(tplDefault, i, n));
  }
  config.spacings = out;
}

/** Single rounding step: `roundTo` on scaling, or top-level `roundTo`, or legacy `roundUpperValuesTo`. */
function resolveRoundTo(config) {
  if (!config || typeof config !== 'object') return 0;
  if (typeof config.roundTo === 'number' && config.roundTo > 0) return config.roundTo;
  var s = config.scaling || {};
  if (typeof s.roundTo === 'number' && s.roundTo > 0) return s.roundTo;
  if (typeof s.roundUpperValuesTo === 'number' && s.roundUpperValuesTo > 0) return s.roundUpperValuesTo;
  if (typeof config.roundUpperValuesTo === 'number' && config.roundUpperValuesTo > 0) return config.roundUpperValuesTo;
  return 0;
}

/** Merge `spacingScaling` or `fontScaling` → `scaling` + `roundTo`. `spacingScaling` wins if both are set. */
function ensureCompatSpacingConfig(config) {
  if (!config || typeof config !== 'object') return;
  var src = config.spacingScaling && typeof config.spacingScaling === 'object'
    ? config.spacingScaling
    : (config.fontScaling && typeof config.fontScaling === 'object' ? config.fontScaling : null);
  if (src) {
    config.scaling = {
      type: src.type,
      ease: src.ease,
      easeInExponent: src.easeInExponent,
      easeOutExponent: src.easeOutExponent
    };
    if (src.rangeMode !== undefined) config.scaling.rangeMode = src.rangeMode;
    if (src.roundTo !== undefined) {
      config.roundTo = src.roundTo;
    } else if (src.roundUpperValuesTo !== undefined) {
      config.roundTo = src.roundUpperValuesTo;
    }
  }
  if (config.scaling && typeof config.scaling === 'object') {
    var sc = config.scaling;
    if (sc.roundTo !== undefined && config.roundTo === undefined) config.roundTo = sc.roundTo;
    if (sc.roundUpperValuesTo !== undefined && config.roundTo === undefined) config.roundTo = sc.roundUpperValuesTo;
  }
  if (!config.scaling || typeof config.scaling !== 'object') {
    config.scaling = { type: 'linear', ease: 'none' };
  }
  var rt = resolveRoundTo(config);
  if (rt > 0) {
    config.roundTo = rt;
    if (config.scaling && typeof config.scaling === 'object' && config.scaling.roundTo === undefined) {
      config.scaling.roundTo = rt;
    }
  }
}

function resolveCollectionName(config) {
  if (config.collectionName != null && config.collectionName !== '') {
    return config.collectionName;
  }
  var data = config.config || config;
  if (data.collectionName != null && data.collectionName !== '') {
    return data.collectionName;
  }
  if (data.structure && data.structure.variableCollection != null) {
    return data.structure.variableCollection;
  }
  return 'Responsive System';
}

function resolveGroup(config) {
  if (config.group !== undefined && config.group !== null) {
    return config.group;
  }
  var data = config.config || config;
  if (data.group !== undefined && data.group !== null) {
    return data.group;
  }
  if (data.structure && data.structure.variableGroup !== undefined) {
    return data.structure.variableGroup;
  }
  return '';
}

/** Known `scaling.type` values for spacing (case-insensitive, except piecewise names). */
var KNOWN_SPACING_SCALING_TYPES = {
  linear: true,
  sine: true,
  quad: true,
  cubic: true,
  quart: true,
  quint: true,
  circ: true,
  exponential: true,
  goldenratio: true,
  expo: true,
  piecewise: true,
  piecewise2: true,
  piecewise4: true
};

function notifyUnknownSpacingScalingType(rawType) {
  var label = typeof rawType === 'string' ? rawType : String(rawType);
  var msg = 'Spacing: scaling.type "' + label + '" is not a recognized curve. Use linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio (aliases: expo, goldenratio), or piecewise / piecewise2 / piecewise4.';
  console.warn(msg);
  try {
    if (typeof figma !== 'undefined' && figma.notify) {
      figma.notify(msg, { error: true, timeout: 10000 });
    }
  } catch (e) {}
}

function validateSpacingScalingTypeConfig(config) {
  if (!config || typeof config !== 'object') return;
  var scaling = config.scaling || {};
  var raw = scaling.type;
  if (raw === undefined || raw === null || raw === '') return;
  if (typeof raw !== 'string') {
    notifyUnknownSpacingScalingType(raw);
    return;
  }
  var t = raw.trim();
  if (!t) return;
  if (isPiecewiseScaleType(t)) return;
  var k = t.toLowerCase();
  if (KNOWN_SPACING_SCALING_TYPES[k]) return;
  notifyUnknownSpacingScalingType(raw);
}

// ========================================
// DEFAULT CONFIG
// ========================================

var spacingConfigData = typeof spacingConfigData !== 'undefined' ? spacingConfigData : {
  // @CONFIG_START
  collectionName: "Responsive System",
  group: "Spacing",

  // When true: after variables run, builds the **Spacing — overview** frame (see @Foundation overview)
  generateOverview: false,

  spacings: ["px", "xs", "sm", "md", "lg", "xl"],
  // Array ["s", "m", "l"] or string template "spacings-{$step}".
  // steps: 10, // If string template is selected, steps is required.

  scaling: {
    type: "sine", 
    // Range curve: linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio. 
    // Piecewise: `piecewise`, `piecewise2`, `piecewise4
    ease: "in", 
    // none, in, out, inout, outin. Only used for range curves. Ignored for piecewise types.
    roundTo: 2,
    // Snap all spacing values to multiples of this number (e.g. `2` → 2, 4, 6, …). Omit or `0` for no snapping.
  },

  modes: [
    {
      name: "desktop",
      min: 1,
      max: 200
    },
    {
      name: "tablet",
      min: 1,
      max: 120
    },
    {
      name: "mobile",
      min: 1,
      max: 80
    }
  ]
  // @CONFIG_END
};

ensureCompatSpacingConfig(spacingConfigData);
materializeSpacingsFromSteps(spacingConfigData);
materializeSpacingSizes(spacingConfigData);
validateSpacingScalingTypeConfig(spacingConfigData);

function mapTypeToLibrary(type) {
  if (!type) return "linear";
  if (type === "expo") return "exponential";
  if (type === "goldenratio") return "goldenRatio";
  return type;
}

/** One grid for all spacing steps (see `roundTo` / `resolveRoundTo`). */
function getSpacingRoundGrid(config) {
  return resolveRoundTo(config);
}

function roundToGrid(value, gridSize) {
  if (!gridSize || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

function getEasedFactor(config, t) {
  var scaling = config.scaling || {};
  var easeName = scaling.ease || "none";
  var useExponents = typeof scaling.easeInExponent === 'number' && scaling.easeInExponent > 0;
  if (useExponents) {
    var outExp = (typeof scaling.easeOutExponent === 'number' && scaling.easeOutExponent > 0)
      ? scaling.easeOutExponent : scaling.easeInExponent;
    return applyEaseWithExponents(scaling.easeInExponent, outExp, easeName, t);
  }
  var curveType = mapTypeToLibrary(scaling.type || 'linear');
  return applyEase(curveType, easeName, t);
}

/**
 * Single ramp min→max across all token indices (even t in index space).
 * Omitted `rangeMode` defaults to full ramp for all curve types.
 * Set `scaling.rangeMode: 'twoSegment'` for min→base→max (easing per segment).
 */
function useFullRangeRamp(config) {
  var scaling = config.scaling || {};
  var rm = String(config.rangeMode || scaling.rangeMode || '').toLowerCase();
  if (rm === 'full') return true;
  if (rm === 'twosegment' || rm === 'two_segment' || rm === 'segment' || rm === 'anchor') return false;
  return true;
}

/** Range curve: either one segment min→max (linear default) or min→base→max; snap with `roundTo`. */
function calculateFluidSpacing(scaleIndex, totalSteps, viewport, config) {
  var sizes = config.spacingSizes[viewport];
  if (!sizes || !sizes.base) {
    return 0;
  }
  var minSize = sizes.min;
  var maxSize = sizes.max;
  var baseSize = sizes.base.size;
  var baseIndex = config.spacings.indexOf(sizes.base.level);
  if (baseIndex < 0) {
    console.warn('base.level not found in spacings, using middle step');
    baseIndex = Math.max(0, Math.floor((totalSteps - 1) / 2));
  }
  var gridSize = getSpacingRoundGrid(config);
  var scaling = config.scaling || {};

  if (isPiecewiseScaleType(scaling.type)) {
    var piecewiseVals = generatePiecewiseSnappedScale({
      steps: totalSteps,
      min: minSize,
      max: maxSize,
      roundTo: gridSize,
      type: scaling.type
    });
    var pv = piecewiseVals[scaleIndex];
    if (typeof pv !== 'number' || isNaN(pv)) return minSize;
    return Math.max(minSize, Math.min(maxSize, pv));
  }

  if (useFullRangeRamp(config)) {
    if (totalSteps <= 1) {
      var flat = roundToGrid(minSize, gridSize);
      return Math.max(minSize, Math.min(maxSize, flat));
    }
    var tFull = scaleIndex / (totalSteps - 1);
    var uFull = getEasedFactor(config, tFull);
    var rawFull = lerp(minSize, maxSize, uFull);
    rawFull = Math.max(minSize, Math.min(maxSize, rawFull));
    rawFull = Math.round(rawFull * 100) / 100;
    var snappedFull = roundToGrid(rawFull, gridSize);
    return Math.max(minSize, Math.min(maxSize, snappedFull));
  }

  if (scaleIndex === baseIndex) {
    var baseRounded = roundToGrid(baseSize, gridSize);
    return Math.max(minSize, Math.min(maxSize, baseRounded));
  }

  var t;
  var startVal;
  var endVal;

  if (scaleIndex < baseIndex) {
    t = baseIndex > 0 ? scaleIndex / baseIndex : 0;
    startVal = minSize;
    endVal = baseSize;
  } else {
    var stepsAboveBase = (totalSteps - 1) - baseIndex;
    t = stepsAboveBase > 0 ? (scaleIndex - baseIndex) / stepsAboveBase : 0;
    startVal = baseSize;
    endVal = maxSize;
  }

  var u = getEasedFactor(config, t);
  var rawSize = lerp(startVal, endVal, u);
  rawSize = Math.max(minSize, Math.min(maxSize, rawSize));
  rawSize = Math.round(rawSize * 100) / 100;
  var snapped = roundToGrid(rawSize, gridSize);
  return Math.max(minSize, Math.min(maxSize, snapped));
}

function variableNamePrefix(group) {
  if (!group || typeof group !== 'string') return '';
  var trimmed = group.replace(/^\//, '').replace(/\/$/, '');
  return trimmed ? trimmed + '/' : '';
}

function generateSpacingVariables(config) {
  var variables = {};
  var prefix = variableNamePrefix(resolveGroup({ config: config }));
  var viewportNames = Object.keys(config.spacingSizes || {});
  if (viewportNames.length === 0 || !Array.isArray(config.spacings) || config.spacings.length === 0) {
    return variables;
  }

  var lastSpacingPerViewport = {};
  viewportNames.forEach(function(viewport) {
    var viewportKey = viewport.charAt(0).toUpperCase() + viewport.slice(1);
    lastSpacingPerViewport[viewportKey] = -1;
  });

  var gridSize = getSpacingRoundGrid(config);

  config.spacings.forEach(function(scaleName, index) {
    var values = {};

    viewportNames.forEach(function(viewport) {
      var viewportKey = viewport.charAt(0).toUpperCase() + viewport.slice(1);
      var minSize = config.spacingSizes[viewport].min;
      var maxSize = config.spacingSizes[viewport].max;
      var spacingVal = calculateFluidSpacing(index, config.spacings.length, viewport, config);
      var previous = lastSpacingPerViewport[viewportKey];
      var step = gridSize > 0 ? gridSize : 1;
      var guard = 0;
      while (index > 0 && spacingVal <= previous && previous >= 0 && guard++ < 32) {
        var nextRaw = Math.min(maxSize, previous + step);
        if (nextRaw <= previous) {
          break;
        }
        spacingVal = nextRaw;
        if (gridSize > 0) {
          spacingVal = roundToGrid(spacingVal, gridSize);
        }
        spacingVal = Math.max(minSize, Math.min(maxSize, spacingVal));
      }
      lastSpacingPerViewport[viewportKey] = spacingVal;
      values[viewportKey] = spacingVal;
    });

    variables[prefix + scaleName] = {
      type: "FLOAT",
      scopes: ["WIDTH_HEIGHT", "GAP"],
      values: values
    };
  });

  return variables;
}

var spacingConfig = typeof spacingConfig !== 'undefined' ? spacingConfig : {
  collectionName: resolveCollectionName(spacingConfigData),
  group: resolveGroup(spacingConfigData),
  config: spacingConfigData,
  variables: generateSpacingVariables(spacingConfigData)
};

function resolveSpacingGenerateOverview(config) {
  if (!config || typeof config !== 'object') return false;
  if (config.generateOverview === true) return true;
  var inner = config.config;
  if (inner && typeof inner === 'object' && inner.generateOverview === true) return true;
  return false;
}

// ========================================
// CORE
// ========================================

async function createOrUpdateCollection(config) {
  var data = config.config || config;
  ensureCompatSpacingConfig(data);
  materializeSpacingsFromSteps(data);
  materializeSpacingSizes(data);
  validateSpacingScalingTypeConfig(data);

  console.log('=== SPACING SYSTEM MANAGER ===');
  var collectionName = resolveCollectionName(config);
  var groupName = resolveGroup(config);
  console.log('Processing collection: ' + collectionName + (groupName ? ' (group: ' + groupName + ')' : ' (no group)'));

  var collection = await getOrCreateCollection(collectionName);

  var modes = Object.keys(data.spacingSizes || {}).map(function(k) {
    return k.charAt(0).toUpperCase() + k.slice(1);
  });
  if (modes.length === 0) {
    modes = extractModes({ variables: config.variables });
  }
  console.log('Detected modes (config order): ' + modes.join(', '));

  setupModes(collection, modes);

  var variables = generateSpacingVariables(data);
  var stats = await processVariables(collection, variables, data, modes);

  console.log('=== SPACING SYSTEM SUMMARY ===');
  console.log('Collection: ' + collectionName);
  console.log('Variables created: ' + stats.created);
  console.log('Variables updated: ' + stats.updated);
  console.log('Variables skipped: ' + stats.skipped);

  return { collection: collection, stats: stats };
}

// ========================================
// EXECUTION
// ========================================

createOrUpdateCollection(spacingConfig)
  .then(async function (result) {
    var showOverview = resolveSpacingGenerateOverview(spacingConfig);
    if (showOverview) {
      await foundationCreateSpacingOverview(result.collection, spacingConfig.config || spacingConfigData);
    }
    var msg =
      '✅ Spacing: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' updated';
    if (showOverview) {
      msg += '; overview frame';
    }
    figma.notify(msg);
  })
  .catch(function (error) {
    console.error('Error:', error);
    figma.notify('❌ Error: ' + error.message);
  });
