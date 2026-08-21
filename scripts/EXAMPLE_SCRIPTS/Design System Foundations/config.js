// SCRIPT_NAME: Foundation config
// @DOC_START
// Move a Design System Foundations config between files: copy it, park it on canvas, read it
// back. It never generates variables — it reads what a file already has and writes the viewport
// registry, nothing else.
//
// ## Modes
// | mode | What it does |
// |---|---|
// | `copy` | Read this file's viewports and generated sets, show the config with a **Copy to clipboard** button, and print the foundation state. |
// | `to-canvas` | Write the same JSON into a text layer on the current page, ready to read back. Updates the existing layer rather than adding a second one. |
// | `from-canvas` | Read the config off a selected text layer (or the page's config layer), report everything it translated, and write the **viewport registry**. |
// | `check` | Normalise the config in `pastedConfig` and report what it would mean. Writes nothing. |
// | `adopt` | Read the spacing or radius tokens a file already has, work out which model produced them, and record it. **Changes nothing you can see.** |
//
// ## What it will not do
// Applying a domain's settings — regenerating your spacing scale, your grid, your type ramp — is
// each generator's job. A config script that quietly rewrote your tokens would be the opposite of
// predictable, so `from-canvas` stops at the viewport list.
//
// ## The config shape
// One canonical v1 shape, whichever route it takes:
//
// ```jsonc
// {
//   "v": 1,
//   "kind": "codefig.foundation",
//   "collection": "Responsive System",
//   "group": "Spacing",
//   "viewports": [{ "key": "mobile", "label": "Mobile", "width": 375 }],
//   "domains": { "spacing": { "tokens": ["xs", "sm"], "perViewport": { "mobile": { "min": 1, "max": 80 } } } }
// }
// ```
//
// Older shapes still load — `structure.*`, `spacingScaling`, `fontScaling`, `figmaStyles`,
// `roundUpperValuesTo`, a script's `{collectionName, group, config, variables}` wrapper — and every
// translation is listed in the results, so a paste never silently means something else.
//
// **Pasting a config into a script's own config block still works exactly as it always has.**
// This script is another route, not a replacement for that one.
// @DOC_END

@import { readFoundation, toPortableConfig, toDomainConfig, formatConfigBlock, foundationDomainScriptName, serialisePortableConfig, parsePortableConfig, normaliseConfig, describeConfigTranslations, describeFoundation, writeConfigToTextLayer, readConfigFromTextLayer, writeRegistry, writeManifest, foundationModeIds, stampToken, namePrefix, viewportKeyFromLabel } from "@Foundation"
@import { spacingRampSpec, radiusRampSpec, adoptRamp } from "@Linear Ramp"
@import { scaleSequence, recogniseScale, resolveModularRatio } from "@Scale Models"
@import { bezierAt } from "@Bezier"
@import { generateScale, isPiecewiseScaleType, snapScaleGrid } from "@Math Helpers"
@import { displayResults, createResult, createCopyResult, requestClipboardCopy } from "@InfoPanel"

var foundationConfigOptions = typeof foundationConfigOptions !== 'undefined' ? foundationConfigOptions : {
  // @CONFIG_START
  // copy | to-canvas | from-canvas | check
  mode: "copy",

  // Only for `check`: the config to normalise and report on. Paste one in as a string.
  pastedConfig: "",

  // Only for `copy` and `to-canvas`: limit to these collections. Empty = every local collection.
  collections: [],

  // Only for `adopt`: which group in which collection, and which kind of scale it holds.
  adopt: {
    collection: "Responsive System",
    group: "Spacing",
    domain: "spacing", // spacing | radius

    // Recording writes plugin data, which counts as a change to a published collection — so a
    // published one is reported and left alone until you set this.
    confirmPublished: false
  }
  // @CONFIG_END
};

// ========================================
// HELPERS
// ========================================

function configModeOf(options) {
  var mode = options && typeof options.mode === 'string' ? options.mode.trim().toLowerCase() : '';
  return mode || 'copy';
}

function configCollectionsOf(options) {
  var list = options && Array.isArray(options.collections) ? options.collections : [];
  return list.filter(function (name) { return typeof name === 'string' && name.trim() !== ''; });
}

/** One result per warning, so nothing is only in the console. */
function configWarningResults(warnings) {
  return (warnings || []).map(function (w) {
    var severity = (w.code === 'config-unparseable' || w.code === 'config-not-an-object') ? 'error' : 'warning';
    return createResult(w.message, w.code, severity);
  });
}

function configTranslationResults(translations) {
  if (!translations || translations.length === 0) return [];
  return [createResult(
    'Translated ' + translations.length + ' older setting' + (translations.length === 1 ? '' : 's'),
    describeConfigTranslations(translations),
    'info'
  )];
}

function configSummaryOf(config) {
  var viewports = (config.viewports || []).length;
  var domains = Object.keys(config.domains || {});
  return viewports + ' viewport' + (viewports === 1 ? '' : 's') +
    (domains.length ? ', ' + domains.join(' + ') : ', no generated sets recorded');
}

// ========================================
// MODES
// ========================================

/**
 * One copy button per domain, carrying the block you paste into that script — not JSON.
 * The JSON shape is for the manifest, the canvas layer and the CLI; asking you to translate
 * between two formats by hand is the problem this is supposed to remove.
 */
/** Where a domain's config came from: the collection and group whose set recorded it. */
function configSourceOf(config, domain) {
  var sets = (config && config.sets) || [];
  for (var i = 0; i < sets.length; i++) {
    if (sets[i].domain !== domain) continue;
    return sets[i].collection + (sets[i].group ? ' \u00b7 ' + sets[i].group : '');
  }
  return null;
}

function foundationConfigBlockResults(config) {
  var domains = Object.keys(config.domains || {});
  var results = [];
  for (var i = 0; i < domains.length; i++) {
    var domain = domains[i];
    var block = formatConfigBlock(toDomainConfig(config, domain));
    if (!block) continue;
    // Which collection this came from, said out loud. Copy scans every collection in the file,
    // so a config can arrive from somewhere other than the one named in the settings above —
    // technically correct and genuinely confusing until the source is on the result.
    var source = configSourceOf(config, domain);
    results.push(createCopyResult(
      foundationDomainScriptName(domain) + ' config' + (source ? ' \u2014 from ' + source : ''),
      block,
      'Paste between // @CONFIG_START and // @CONFIG_END in ' + foundationDomainScriptName(domain) + '.'
    ));
  }
  return results;
}

/**
 * The settings this mode did not read.
 *
 * The block is a code editor, so there is nothing to hide — a setting cannot be conditionally
 * shown the way a form field can. Saying which ones were ignored is the honest substitute: the
 * `adopt` block naming a collection while `copy` scanned every collection in the file is
 * technically correct and reads like a contradiction.
 */
function configIgnoredSettings(options, mode) {
  var byMode = {
    'copy': ['pastedConfig', 'adopt'],
    'to-canvas': ['pastedConfig', 'adopt'],
    'from-canvas': ['pastedConfig', 'collections', 'adopt'],
    'check': ['collections', 'adopt'],
    'adopt': ['pastedConfig', 'collections']
  };
  var candidates = byMode[mode] || [];
  var ignored = [];
  for (var i = 0; i < candidates.length; i++) {
    var value = options ? options[candidates[i]] : undefined;
    var isEmpty = value === undefined || value === null || value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (!isEmpty) ignored.push(candidates[i]);
  }
  if (ignored.length === 0) return null;
  return createResult(
    'Settings this mode did not read: ' + ignored.join(', '),
    'Mode is "' + mode + '". Those settings belong to the other modes and had no effect on this run.',
    'info'
  );
}

async function foundationConfigCopy(options) {
  var foundation = await readFoundation({ collections: configCollectionsOf(options) });
  var config = toPortableConfig(foundation);
  var json = serialisePortableConfig(config);
  var blocks = foundationConfigBlockResults(config);

  if (blocks.length > 0) {
    requestClipboardCopy(blocks[0].copyText, blocks[0].message + ' copied to clipboard');
  } else {
    requestClipboardCopy(json, 'Foundation config copied to clipboard');
  }

  var sources = [];
  for (var b = 0; b < blocks.length; b++) {
    var name = blocks[b].message || '';
    var at = name.indexOf('\u2014 from ');
    if (at !== -1) sources.push(name.slice(at + 8));
  }
  var results = [createResult(
    'Read ' + configSummaryOf(config),
    'Scanned ' + (foundation.collections || []).length + ' collection(s) in this file' +
      (sources.length > 0 ? '. Copied from ' + sources.join(', ') : '') + '.',
    'success'
  )];
  var ignoredCopy = configIgnoredSettings(options, 'copy');
  if (ignoredCopy) results.push(ignoredCopy);

  if (blocks.length === 0) {
    results.push(createResult(
      'No generated sets recorded in this file yet',
      'The viewports below came from the collection modes and the viewport-width variable. Spacing, Grid, Corner radius and Typography start recording what they generate as each is rewritten, and this script will hand you their config blocks once they do.',
      'warning'
    ));
  }

  results = results
    .concat(blocks)
    .concat([
      createCopyResult('Foundation JSON (v1)', json, 'The machine-readable shape: what a text layer holds and what the manifests record. Configs paste as blocks, above.'),
      createResult('Foundation state', describeFoundation(foundation), 'info')
    ])
    .concat(configWarningResults(foundation.warnings));

  displayResults({
    title: 'Foundation config',
    results: results,
    type: 'success',
    showFilters: false
  });
}

async function foundationConfigToCanvas(options) {
  var foundation = await readFoundation({ collections: configCollectionsOf(options) });
  var config = toPortableConfig(foundation);
  var written = await writeConfigToTextLayer(config);

  if (!written.ok) {
    displayResults({
      title: 'Foundation config',
      results: configWarningResults(written.warnings),
      type: 'error',
      showFilters: false
    });
    return;
  }

  figma.currentPage.selection = [written.node];
  displayResults({
    title: 'Foundation config',
    results: [
      createResult('Wrote ' + configSummaryOf(config) + ' to canvas', 'Layer: ' + written.node.name + '. Read it back with `from-canvas`.', 'success'),
      { message: 'Config layer', details: written.node.name, severity: 'info', nodeId: written.node.id }
    ].concat(configWarningResults(foundation.warnings)),
    type: 'success',
    showFilters: false
  });
}

async function foundationConfigFromCanvas() {
  var read = await readConfigFromTextLayer();

  if (!read.config) {
    displayResults({
      title: 'Foundation config',
      results: configWarningResults(read.warnings),
      type: 'error',
      showFilters: false
    });
    return;
  }

  var viewports = read.config.viewports || [];
  var results = [createResult('Read ' + configSummaryOf(read.config), 'From layer: ' + read.node.name, 'success')]
    .concat(configTranslationResults(read.translations))
    .concat(configWarningResults(read.warnings));

  if (viewports.length > 0) {
    var written = writeRegistry(viewports);
    if (written.ok) {
      results.push(createResult(
        'Registry updated: ' + viewports.map(function (v) { return v.label; }).join(', '),
        'Viewports only. Spacing, Grid, Corner radius and Typography still generate from their own config — this script does not run them.',
        'success'
      ));
    } else {
      results = results.concat(configWarningResults(written.warnings));
    }
  } else {
    results.push(createResult('No viewports in this config', 'Nothing was written.', 'warning'));
  }

  displayResults({
    title: 'Foundation config',
    results: results,
    type: 'success',
    showFilters: false
  });
}

/**
 * Adopt: understand a file, then record what was understood.
 *
 * The reading half is always free. The writing half is a manifest and a stamp per token — plugin
 * data, so no value, name or binding moves — and on a published collection it waits for
 * `confirmPublished`, because plugin data counts as a change subscribers will be offered.
 */
async function foundationConfigAdopt(options) {
  var settings = (options && options.adopt) || {};
  var spec = settings.domain === 'radius' ? radiusRampSpec() : spacingRampSpec();
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = collections.find(function (c) { return c.name === settings.collection; });

  if (!collection) {
    displayResults({
      title: 'Foundation config',
      results: [createResult('No collection called "' + settings.collection + '"', 'Set adopt.collection to one of: ' + collections.map(function (c) { return c.name; }).join(', '), 'error')],
      type: 'error',
      showFilters: false
    });
    return;
  }

  var group = settings.group != null ? settings.group : spec.group;
  var adopted = await adoptRamp(collection, group, spec, { confirmPublished: !!settings.confirmPublished });

  var results = [];
  if (adopted.tokens.length === 0) {
    results.push(createResult('Nothing to adopt', adopted.warnings.join(' '), 'warning'));
  } else {
    results.push(createResult(
      (adopted.written ? 'Adopted ' : 'Read ') + adopted.tokens.length + ' token(s) across ' + collection.modes.length + ' mode(s)',
      adopted.lines.join('\n'),
      adopted.written ? 'success' : 'info'
    ));
  }

  if (adopted.skipped.length > 0) {
    results.push(createResult(
      'Skipped ' + adopted.skipped.length + ' variable(s)',
      adopted.skipped.map(function (sk) { return sk.name + ' — ' + sk.why; }).join('\n'),
      'info'
    ));
  }

  adopted.warnings.forEach(function (w) {
    results.push(createResult(w, '', adopted.written ? 'warning' : 'info'));
  });

  if (adopted.written) {
    results.push(createResult(
      'Recorded ' + adopted.manifest.key + ', stamped ' + adopted.stamped + ' token(s)',
      'No value, name or binding changed. The import button and `figma:run --from-file` can now offer this config back.',
      'success'
    ));
  }

  displayResults({
    title: 'Foundation config',
    results: results,
    type: adopted.written ? 'success' : 'info',
    showFilters: false
  });
}

function foundationConfigCheck(options) {
  var pasted = options && typeof options.pastedConfig === 'string' ? options.pastedConfig : '';
  var read = parsePortableConfig(pasted);

  if (!read.config) {
    displayResults({
      title: 'Foundation config',
      results: [createResult('Nothing to check', 'Paste a config into `pastedConfig` and run again.', 'info')]
        .concat(configWarningResults(read.warnings)),
      type: 'error',
      showFilters: false
    });
    return;
  }

  displayResults({
    title: 'Foundation config',
    results: [
      createResult('This config means: ' + configSummaryOf(read.config), 'Collection: ' + read.config.collection + (read.config.group ? ' · group: ' + read.config.group : '') + '. Nothing was written.', 'success')
    ]
      .concat(foundationConfigBlockResults(read.config))
      .concat(configTranslationResults(read.translations))
      .concat(configWarningResults(read.warnings)),
    type: 'success',
    showFilters: false
  });
}

// ========================================
// RUN
// ========================================

(async function () {
  var options = foundationConfigOptions;
  var mode = configModeOf(options);

  try {
    if (mode === 'copy') {
      await foundationConfigCopy(options);
    } else if (mode === 'to-canvas') {
      await foundationConfigToCanvas(options);
    } else if (mode === 'from-canvas') {
      await foundationConfigFromCanvas();
    } else if (mode === 'check') {
      foundationConfigCheck(options);
    } else if (mode === 'adopt') {
      await foundationConfigAdopt(options);
    } else {
      displayResults({
        title: 'Foundation config',
        results: [createResult('Unknown mode "' + mode + '"', 'Use copy, to-canvas, from-canvas, check or adopt.', 'error')],
        type: 'error',
        showFilters: false
      });
    }
  } catch (e) {
    console.error('Foundation config failed:', e);
    displayResults({
      title: 'Foundation config',
      results: [createResult('Failed', e && e.message ? e.message : String(e), 'error')],
      type: 'error',
      showFilters: false
    });
  }
})();
