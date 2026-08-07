// @Linear Ramp
// @DOC_START
// # @Linear Ramp
// One generator behind **Spacing** and **Corner radius**, which were thirty near-identical
// functions apart. Both are now thin wrappers over this, differing only in a **ramp spec**.
//
// ## What a ramp is
// A list of tokens whose value ramps from a `min` to a `max` per viewport, along a curve. The
// curve, the piecewise handling, the monotonic guard and the rounding ladder are all shared; what
// a domain brings is its own tokens, name template, variable scopes and config spelling.
//
// ## The ramp spec
// | Field | Spacing | Corner radius |
// |---|---|---|
// | `domain` | `spacing` | `radius` |
// | `group` | `Spacing` | `Corner radius` |
// | `tokensKey` | `spacings` | `radii` |
// | `sizesKey` | `spacingSizes` | `radiusSizes` |
// | `nameTemplate` | `space-{$index}` | `radius-{$index}` |
// | `scopes` | `WIDTH_HEIGHT`, `GAP` | `CORNER_RADIUS` |
// | `scalingAliases` | `spacingScaling`, `fontScaling` | `cornerRadiusScaling`, `radiusScaling`, `fontScaling` |
//
// `scalingAliases` is in precedence order — the first one present wins, which is what each script
// did separately. The two had already drifted: radius accepts `cornerRadiusScaling` and spacing
// never has. Collapsing them must not quietly change that, so the list is per domain.
//
// ## Companion imports
// `@import` does not follow calls across scripts, so a wrapper must import everything this calls
// on its behalf:
//
// ```js
// @import { getOrCreateCollection, setupModes, extractModes, processVariables } from "@Variables"
// @import { viewportLabel, namePrefix, resolveCollectionName, resolveGroup, readFoundation, writeManifest, writeRegistry, normaliseConfig } from "@Foundation"
// @import { generateScale, isPiecewiseScaleType, snapScaleGrid } from "@Math Helpers"
// ```
//
// `npm run validate` fails the build when a runnable script misses one.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Specs | spacingRampSpec, radiusRampSpec |
// | Config | ensureCompatRampConfig, materialiseRampTokens, materialiseRampSizes, resolveRampRoundTo, validateRampScalingType |
// | Scale | buildRampScaleOpts, calculateRampValue, generateRampVariables |
// | Run | runLinearRamp, describeUndeclaredModes, describeRampModels |
// @DOC_END

// ============================================================================
// RAMP SPECS
//
// Zero-argument functions, not constants: `@import` extracts only top-level function
// declarations, so a `var SPECS = {…}` would reach no consumer.
// ============================================================================

function spacingRampSpec() {
  return {
    domain: 'spacing',
    group: 'Spacing',
    tokensKey: 'spacings',
    sizesKey: 'spacingSizes',
    nameTemplate: 'space-{$index}',
    scopes: ['WIDTH_HEIGHT', 'GAP'],
    scalingAliases: ['spacingScaling', 'fontScaling'],
    label: 'Spacing'
  };
}

function radiusRampSpec() {
  return {
    domain: 'radius',
    group: 'Corner radius',
    tokensKey: 'radii',
    sizesKey: 'radiusSizes',
    nameTemplate: 'radius-{$index}',
    scopes: ['CORNER_RADIUS'],
    scalingAliases: ['cornerRadiusScaling', 'radiusScaling', 'fontScaling'],
    label: 'Corner radius'
  };
}

/** Curve names `generateScale` understands. Piecewise names are checked separately. */
function knownRampScalingTypes() {
  return {
    linear: true,
    sine: true,
    quad: true,
    cubic: true,
    quart: true,
    quint: true,
    circ: true,
    exponential: true,
    goldenratio: true,
    expo: true
  };
}

// ============================================================================
// CONFIG
// ============================================================================

/** `min`/`max`/`base` per viewport, out of the config's `modes[]`. */
function rampModesToSizes(modes, tokens, defaultBaseLevel) {
  var out = {};
  if (!Array.isArray(modes)) return out;
  var baseLevel = typeof defaultBaseLevel === 'string' && defaultBaseLevel
    ? defaultBaseLevel
    : (Array.isArray(tokens) && tokens.length ? tokens[Math.floor(tokens.length / 2)] : 'md');

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
    // A derived model has no ceiling of its own, and inventing one from `min` would clamp the
    // monotonic guard to the floor. Endpoints keeps its old fallback.
    var derived = typeof m.model === 'string' && m.model && m.model !== 'endpoints';
    var max = typeof m.max === 'number' ? m.max : (derived ? null : min);
    var base = m.base && typeof m.base === 'object' ? m.base : {};
    var level = typeof base.level === 'string' && base.level ? base.level : baseLevel;
    var size = typeof base.size === 'number' ? base.size : defaultBaseSize(min, max);
    var entry = { min: min, max: max, base: { level: level, size: size } };
    // The model and whatever it needs. Absent means endpoints, which is what every config
    // written before plan 19b is.
    var carried = ['model', 'ratio', 'step', 'mod', 'values', 'clamp'];
    for (var c = 0; c < carried.length; c++) {
      if (m[carried[c]] !== undefined) entry[carried[c]] = m[carried[c]];
    }
    out[m.name] = entry;
  }
  return out;
}

function resolveRampSizes(config, spec) {
  if (config.modes && Array.isArray(config.modes) && config.modes.length > 0) {
    return rampModesToSizes(config.modes, config[spec.tokensKey], config.defaultBaseLevel);
  }
  if (config[spec.sizesKey] && typeof config[spec.sizesKey] === 'object') {
    return config[spec.sizesKey];
  }
  return {};
}

function materialiseRampSizes(config, spec) {
  if (!config || typeof config !== 'object') return;
  config[spec.sizesKey] = resolveRampSizes(config, spec);
}

function applyRampNameTemplate(template, index, totalSteps) {
  var s = String(template);
  var i0 = index;
  var i1 = index + 1;
  return s
    .replace(/\{\$steps\}/g, String(totalSteps))
    .replace(/\{\$index1\}/g, String(i1))
    .replace(/\{\$step\}/g, String(i1))
    .replace(/\{\$index\}/g, String(i0));
}

/**
 * Expand the token list from a name template plus `steps`, or fill default names when only
 * `steps` is set. A non-empty array is left alone — a list always wins over a count.
 */
function materialiseRampTokens(config, spec) {
  if (!config || typeof config !== 'object') return;
  var raw = config[spec.tokensKey];
  if (Array.isArray(raw) && raw.length > 0) return;

  var n = typeof config.steps === 'number' ? config.steps : 0;
  var out = [];
  var i;

  if (typeof raw === 'string' && raw.trim()) {
    if (n < 1) {
      console.warn(spec.label + ': `steps` (positive integer) is required when `' + spec.tokensKey + '` is a name template string.');
      config[spec.tokensKey] = [];
      return;
    }
    var tpl = raw.trim();
    for (i = 0; i < n; i++) out.push(applyRampNameTemplate(tpl, i, n));
    config[spec.tokensKey] = out;
    return;
  }
  if (n < 1) return;
  for (i = 0; i < n; i++) out.push(applyRampNameTemplate(spec.nameTemplate, i, n));
  config[spec.tokensKey] = out;
}

/** One rounding step: `roundTo`, then `scaling.roundTo`, then either `roundUpperValuesTo`. */
function resolveRampRoundTo(config) {
  if (!config || typeof config !== 'object') return 0;
  if (typeof config.roundTo === 'number' && config.roundTo > 0) return config.roundTo;
  var s = config.scaling || {};
  if (typeof s.roundTo === 'number' && s.roundTo > 0) return s.roundTo;
  if (typeof s.roundUpperValuesTo === 'number' && s.roundUpperValuesTo > 0) return s.roundUpperValuesTo;
  if (typeof config.roundUpperValuesTo === 'number' && config.roundUpperValuesTo > 0) return config.roundUpperValuesTo;
  return 0;
}

/**
 * Fold whichever scaling alias this domain accepts into `scaling`, and settle the rounding.
 * `spec.scalingAliases` is in precedence order; the first one present wins.
 */
function ensureCompatRampConfig(config, spec) {
  if (!config || typeof config !== 'object') return;
  var aliases = (spec && spec.scalingAliases) || [];
  var src = null;
  for (var i = 0; i < aliases.length && !src; i++) {
    if (config[aliases[i]] && typeof config[aliases[i]] === 'object') src = config[aliases[i]];
  }

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
  var rt = resolveRampRoundTo(config);
  if (rt > 0) {
    config.roundTo = rt;
    if (config.scaling && typeof config.scaling === 'object' && config.scaling.roundTo === undefined) {
      config.scaling.roundTo = rt;
    }
  }

  // A ratio name in `scaling.type` produces a modular *curve between min and max* — which under
  // the model taxonomy is `endpoints`, not `modular`. Say so, so the two never mean one thing.
  var typeName = config.scaling && typeof config.scaling.type === 'string' ? config.scaling.type.trim() : '';
  if (typeName && resolveModularRatio(typeName) !== null) {
    console.log('scaling.type "' + typeName + '" → model: endpoints (a modular curve between min and max). ' +
      'For an unclamped modular scale whose top comes from the ratio, set model: "modular" on a viewport.');
  }
}

function notifyUnknownRampScalingType(rawType, spec) {
  var label = typeof rawType === 'string' ? rawType : String(rawType);
  var msg = spec.label + ': scaling.type "' + label + '" is not a recognized curve. Use linear, sine, quad, cubic, quart, quint, circ, exponential, goldenRatio (aliases: expo, goldenratio), or piecewise / piecewise2 / piecewise4.';
  console.warn(msg);
  try {
    if (typeof figma !== 'undefined' && figma.notify) {
      figma.notify(msg, { error: true, timeout: 10000 });
    }
  } catch (e) {}
}

function validateRampScalingType(config, spec) {
  if (!config || typeof config !== 'object') return;
  var raw = (config.scaling || {}).type;
  if (raw === undefined || raw === null || raw === '') return;
  if (typeof raw !== 'string') {
    notifyUnknownRampScalingType(raw, spec);
    return;
  }
  var t = raw.trim();
  if (!t) return;
  if (isPiecewiseScaleType(t)) return;
  if (knownRampScalingTypes()[t.toLowerCase()]) return;
  // Ratio names have always worked here — `generateScale` has handled them since it was written
  // — while this warned they were "not a recognized curve". They are an endpoints curve, not the
  // modular model; ensureCompatRampConfig says so.
  if (resolveModularRatio(t) !== null) return;
  notifyUnknownRampScalingType(raw, spec);
}

// ============================================================================
// SCALE
// ============================================================================

function getRampRoundGrid(config) {
  return resolveRampRoundTo(config);
}

/**
 * Single ramp min→max across all token indices, unless `rangeMode` asks for min→base→max.
 * An omitted `rangeMode` is the full ramp, for every curve type.
 */
function useFullRangeRamp(config) {
  var scaling = config.scaling || {};
  var rm = String(config.rangeMode || scaling.rangeMode || '').toLowerCase();
  if (rm === 'full') return true;
  if (rm === 'twosegment' || rm === 'two_segment' || rm === 'segment' || rm === 'anchor') return false;
  return true;
}

function buildRampScaleOpts(totalSteps, viewport, config, spec) {
  var sizes = config[spec.sizesKey][viewport];
  if (!sizes || !sizes.base) return null;

  var tokens = config[spec.tokensKey];
  var baseIndex = tokens.indexOf(sizes.base.level);
  if (baseIndex < 0) {
    console.warn('base.level not found in ' + spec.tokensKey + ', using middle step');
    baseIndex = Math.max(0, Math.floor((totalSteps - 1) / 2));
  }
  var scaling = config.scaling || {};
  return {
    model: typeof sizes.model === 'string' && sizes.model ? sizes.model : 'endpoints',
    steps: totalSteps,
    min: sizes.min,
    max: sizes.max,
    tokens: tokens,
    // endpoints
    type: scaling.type || 'linear',
    ease: scaling.ease,
    rangeMode: useFullRangeRamp(config) ? 'full' : 'twoSegment',
    baseIndex: baseIndex,
    baseValue: sizes.base.size,
    roundTo: getRampRoundGrid(config),
    easeInExponent: scaling.easeInExponent,
    easeOutExponent: scaling.easeOutExponent,
    defaultRangeMode: 'full',
    // modular, metric, explicit
    base: sizes.base.size,
    ratio: sizes.ratio,
    step: sizes.step,
    mod: sizes.mod,
    values: sizes.values,
    clamp: sizes.clamp
  };
}

/**
 * One viewport's whole sequence, computed once.
 *
 * The old code called `generateScale` per token per viewport and threw away every value but one —
 * harmless for a pure function, wasteful, and impossible for a model whose steps depend on each
 * other. Now the sequence is generated once and indexed into.
 */
function rampSequenceFor(viewport, config, spec) {
  var opts = buildRampScaleOpts((config[spec.tokensKey] || []).length, viewport, config, spec);
  if (!opts) return { opts: null, values: [], warnings: [] };
  var built = scaleSequence(opts.model, opts);
  return { opts: opts, values: built.values, warnings: built.warnings };
}

/**
 * One value out of a sequence, with the endpoints model's own bounds applied.
 *
 * Only endpoints clamps to `max`: in modular and metric the top comes out of the model, and
 * squashing it to a `max` would change the ratio or the step the user asked for.
 */
function rampValueAt(sequence, index, opts) {
  var v = sequence[index];
  if (typeof v !== 'number' || isNaN(v)) return opts.min;
  if (opts.model === 'endpoints') return Math.max(opts.min, Math.min(opts.max, v));
  return v;
}

/**
 * Why two steps landed on the same number. The guard bumps them apart — a scale that goes
 * backwards is worse — but it has done so silently since it was written, which hands you a step
 * you did not choose.
 */
function describeRampCollision(previousToken, token, value, opts, gridSize) {
  var cause;
  if (opts.model === 'modular') cause = 'ratio ' + opts.ratio;
  else if (opts.model === 'metric') cause = 'a step of ' + opts.step;
  else cause = 'this range';
  return previousToken + ' and ' + token + ' both round to ' + value + ' — ' + cause +
    ' with a grid of ' + gridSize + " can't separate them.";
}

/** Range curve or piecewise ramp, via the shared `generateScale`. */
function calculateRampValue(scaleIndex, totalSteps, viewport, config, spec) {
  var opts = buildRampScaleOpts(totalSteps, viewport, config, spec);
  if (!opts) return 0;
  var scale = generateScale(opts);
  var v = scale[scaleIndex];
  if (typeof v !== 'number' || isNaN(v)) return opts.min;
  return Math.max(opts.min, Math.min(opts.max, v));
}

/**
 * One FLOAT variable per token, one value per viewport.
 *
 * The `while` loop is the monotonic guard: a curve can produce a value at or below the previous
 * step once rounding has been applied, and a scale that goes backwards is worse than one that is
 * slightly off. It bumps by the grid until it moves, or until the max stops it.
 */
function generateRampVariables(config, spec) {
  var variables = {};
  var prefix = namePrefix(resolveGroup({ config: config }));
  var sizes = config[spec.sizesKey] || {};
  var tokens = config[spec.tokensKey];
  var viewportNames = Object.keys(sizes);

  if (viewportNames.length === 0 || !Array.isArray(tokens) || tokens.length === 0) {
    return variables;
  }

  var lastPerViewport = {};
  var sequences = {};
  var collisions = [];
  viewportNames.forEach(function(viewport) {
    lastPerViewport[viewportLabel(viewport)] = -1;
    // Once per viewport, not once per token.
    sequences[viewport] = rampSequenceFor(viewport, config, spec);
    sequences[viewport].warnings.forEach(function(w) {
      // A value doing what the config declares is not a surprise: it belongs in the summary,
      // beside the model that produced it.
      if (w.code === 'scale-floor-held') return;
      console.warn(spec.label + ' · ' + viewportLabel(viewport) + ': ' + w.message);
    });
  });

  var gridSize = getRampRoundGrid(config);

  tokens.forEach(function(tokenName, index) {
    var values = {};

    viewportNames.forEach(function(viewport) {
      var viewportKey = viewportLabel(viewport);
      var minSize = sizes[viewport].min;
      var maxSize = typeof sizes[viewport].max === 'number' ? sizes[viewport].max : Infinity;
      var sequence = sequences[viewport];
      if (!sequence.opts) return;
      var value = rampValueAt(sequence.values, index, sequence.opts);
      var previous = lastPerViewport[viewportKey];
      var step = gridSize > 0 ? gridSize : 1;
      var guard = 0;
      var collided = index > 0 && value <= previous && previous >= 0;

      while (index > 0 && value <= previous && previous >= 0 && guard++ < 32) {
        var nextRaw = Math.min(maxSize, previous + step);
        if (nextRaw <= previous) break;
        value = nextRaw;
        if (gridSize > 0) value = snapScaleGrid(value, gridSize);
        value = Math.max(minSize, Math.min(maxSize, value));
      }

      if (collided && value !== previous) {
        collisions.push(describeRampCollision(tokens[index - 1], tokenName, previous, sequence.opts, gridSize));
      }

      lastPerViewport[viewportKey] = value;
      values[viewportKey] = value;
    });

    variables[prefix + tokenName] = {
      type: 'FLOAT',
      scopes: spec.scopes.slice(),
      values: values
    };
  });

  // Reported once per distinct collision: the same cause across three viewports is one problem.
  var said = {};
  collisions.forEach(function(line) {
    if (said[line]) return;
    said[line] = true;
    console.warn(line);
  });

  return variables;
}

// ============================================================================
// RUN
// ============================================================================

/**
 * The model and its parameters, per viewport, for the run summary.
 *
 * In the summary block rather than a debug line, and deliberately: the shipped defaults changed
 * to metric in plan 19b, and prebuilt scripts reload from the embedded source — so someone who
 * has been pressing Run on the shipped block gets different numbers after an upgrade. If the
 * numbers move, the reason belongs in the output that reports the move.
 */
function describeRampModels(config, spec) {
  var sizes = config[spec.sizesKey] || {};
  var lines = [];
  for (var viewport in sizes) {
    if (!Object.prototype.hasOwnProperty.call(sizes, viewport)) continue;
    var v = sizes[viewport];
    var model = typeof v.model === 'string' && v.model ? v.model : 'endpoints';
    var parts = [model];
    if (model === 'metric') {
      parts.push('base ' + v.base.size, 'step ' + v.step, 'mod ' + (v.mod === undefined ? 1 : v.mod));
    } else if (model === 'modular') {
      parts.push('base ' + v.base.size, 'ratio ' + v.ratio);
    } else if (model === 'explicit') {
      parts.push((v.values || []).length + ' values');
    } else {
      parts.push('min ' + v.min, 'max ' + v.max, (config.scaling || {}).type || 'linear');
    }
    lines.push('  ' + viewportLabel(viewport) + ': ' + parts.join(', '));

    // Anything the model reported that is expected rather than wrong reads here, in context.
    var built = rampSequenceFor(viewport, config, spec);
    built.warnings.forEach(function(w) {
      if (w.code === 'scale-floor-held') lines.push('    ' + w.message);
    });
  }
  return lines;
}

/**
 * What this run left alone, said out loud.
 *
 * A config that names fewer viewports than its collection has modes is legitimate — modes are
 * only ever added (plan 15), and radius may well not care about a breakpoint spacing does. But
 * Figma copies the first mode's values into every mode it creates, so the undeclared ones end up
 * holding numbers this run never chose. Silence there reads as a bug to whoever finds it later.
 */
function describeUndeclaredModes(spec, declaredLabels, collectionModeNames) {
  var declared = declaredLabels || [];
  var all = collectionModeNames || [];
  var undeclared = [];
  for (var i = 0; i < all.length; i++) {
    if (declared.indexOf(all[i]) === -1) undeclared.push(all[i]);
  }
  if (undeclared.length === 0) return null;
  return spec.label + ' defines ' + declared.length + " of this collection's " + all.length +
    ' modes; ' + undeclared.join(', ') + (undeclared.length === 1 ? ' keeps' : ' keep') +
    ' copied values.';
}

/**
 * The v1 slice to record for this run — the **whole** slice, never hand-picked fields.
 *
 * A partial manifest round-trips faithfully as a partial config, so a field left out here is a
 * field that vanishes from a user's editor on import. `normaliseConfig` already drops the derived
 * maps a run wrote onto the config, so what is recorded is the declared input, resolved.
 */
function rampManifestSlice(resolvedConfig, spec) {
  var normalised = normaliseConfig(resolvedConfig);
  var slice = normalised.config.domains[spec.domain];
  return slice || normalised.config.domains.unknown || null;
}

/**
 * Generate a ramp into its collection, then record what was generated.
 *
 * The manifest is written last and cannot fail the run: the tokens are real whether or not the
 * record of them is, and saying otherwise would be a lie about what is in the file.
 */
async function runLinearRamp(config, spec) {
  var data = config.config || config;
  ensureCompatRampConfig(data, spec);
  materialiseRampTokens(data, spec);
  materialiseRampSizes(data, spec);
  validateRampScalingType(data, spec);

  var collectionName = resolveCollectionName(config);
  var groupName = resolveGroup(config);
  console.log('=== ' + spec.label.toUpperCase() + ' ===');
  console.log('Processing collection: ' + collectionName + (groupName ? ' (group: ' + groupName + ')' : ' (no group)'));

  var collection = await getOrCreateCollection(collectionName);

  var viewportKeys = Object.keys(data[spec.sizesKey] || {});
  var modes = viewportKeys.map(function(k) { return viewportLabel(k); });
  if (modes.length === 0) {
    modes = extractModes({ variables: config.variables });
  }
  console.log('Detected modes (config order): ' + modes.join(', '));

  setupModes(collection, modes);

  var variables = generateRampVariables(data, spec);
  var stats = await processVariables(collection, variables, data, modes);

  // Record the set. This is what makes the import button and `figma:run --from-file` work.
  var manifest = null;
  try {
    manifest = writeManifest(collection, {
      domain: spec.domain,
      group: groupName,
      modes: viewportKeys,
      tokens: (data[spec.tokensKey] || []).slice(),
      config: rampManifestSlice(data, spec)
    });
    if (manifest.ok) {
      console.log('Recorded this set: ' + manifest.key + ' (' + manifest.bytes + ' characters)');
    } else {
      console.warn('Variables were written. The set could not be recorded: ' + (manifest.warnings[0] || {}).message);
    }
  } catch (e) {
    console.warn('Variables were written. The set could not be recorded: ' + (e && e.message ? e.message : e));
  }

  var undeclared = describeUndeclaredModes(
    spec,
    modes,
    collection.modes.map(function(m) { return m.name; })
  );
  if (undeclared) console.log(undeclared);

  console.log('=== ' + spec.label.toUpperCase() + ' SUMMARY ===');
  console.log('Collection: ' + collectionName);
  console.log('Scale:');
  describeRampModels(data, spec).forEach(function(line) { console.log(line); });
  console.log('Variables created: ' + stats.created);
  console.log('Variables updated: ' + stats.updated);
  console.log('Variables skipped: ' + stats.skipped);

  return { collection: collection, stats: stats, manifest: manifest, undeclaredModes: undeclared };
}
