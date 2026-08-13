// @Type Scale
// @DOC_START
// # Type Scale
// The typography ramp as the panel writes it: one scale per mode, plus the line height and tracking
// that travel with a font size. Also the Overview table and the specimen the Typography panel draws.
//
// ## What a mode holds
// | Key | Meaning |
// |-----|---------|
// | `scaleType` | `modular`, `metric` or `fibonacci` — the same three the Spacing panel offers. |
// | `ratio` | Modular only: the step ratio (1.2, 1.25 …). |
// | `step`, `mod` | Metric and fibonacci: the increment, and how often it grows. |
// | `base` | The size of the **first** token. The scale grows from there, so tokens are named smallest to largest. |
// | `lineHeight` | Line height in **px at the base step**. |
// | `lineHeightAtTop` | Optional. Line height in px at the largest step; the steps between are interpolated. Left out, the base *ratio* is held instead, so line height grows with size. |
// | `letterSpacing` | Tracking in px at the base step. |
// | `letterSpacingAtTop` | Optional. Tracking at the largest step. Left out, tracking is constant. |
// | `roundTo` | Rounding grid for size and line height. Tracking is left fractional. |
//
// ## Why the optional pair exists
// Márton, on precise-type.com's charts: *"how font size increase, line height increase and letter
// spacing decrease interact… optical consistency and stability is what we aim for."* None of the six
// scale generators surveyed computes that — they take both as fixed numbers. Two numbers per property
// reproduce both curves: line height rises in absolute terms while its **ratio** falls, and tracking
// tightens as the size grows. Leave the second number empty and nothing changes from today's behaviour.
// @DOC_END

/** Does this mode use the panel's per-mode scale, rather than the older min/base/max shape? */
function typeScaleModeIsScaled(mode) {
  if (!mode || typeof mode !== 'object') return false;
  return typeof mode.scaleType === 'string' && mode.scaleType !== '';
}

/** The modes a config declares, in the config's own order. */
function typeScaleModes(config) {
  var data = (config && config.config) || config || {};
  return Array.isArray(data.modes) ? data.modes : [];
}

/** One mode by name, matched the way the panel matches a tab to a mode: case-insensitively. */
function typeScaleModeNamed(config, modeName) {
  var modes = typeScaleModes(config);
  var wanted = String(modeName == null ? '' : modeName).trim().toLowerCase();
  var i;
  if (wanted) {
    for (i = 0; i < modes.length; i++) {
      var name = modes[i] && modes[i].name;
      if (typeof name === 'string' && name.trim().toLowerCase() === wanted) return modes[i];
    }
  }
  return modes[0] || null;
}

/**
 * The token names, with any series expanded.
 *
 * `heading-{1,6}` is six tokens. `expandTokenList` lives in `@Foundation` and is imported by whoever
 * imports this — one implementation of the series form for every domain that has tokens.
 */
function typeScaleTokens(config) {
  var data = (config && config.config) || config || {};
  var raw = data.fontScale;
  var list = expandTokenList(raw);
  if (list.length > 0) return list;
  // A count with no names is still a scale, named the way the older template path names one.
  var steps = typeof data.steps === 'number' ? Math.floor(data.steps) : 0;
  var out = [];
  for (var i = 0; i < steps; i++) out.push('text-' + (i + 1));
  return out;
}

/**
 * The font sizes for one mode: what the model generates, and what it generates before rounding.
 *
 * The base is the **first** token, matching the Spacing panel: one number, and the scale grows from it.
 * Nothing here needs to say where the base sits, which is the field the frames do not have and the
 * question a `base.level` picker exists to answer.
 */
function typeScaleSizes(mode, steps) {
  if (!typeScaleModeIsScaled(mode) || steps < 1) return { values: [], raw: [], warnings: [] };
  var base = typeof mode.base === 'number' && isFinite(mode.base) ? mode.base : 16;
  var built = scaleSequence(mode.scaleType, {
    steps: steps,
    min: 1,
    baseIndex: 0,
    baseValue: base,
    ratio: mode.ratio,
    step: mode.step,
    mod: mode.mod
  });
  var raw = built.values.slice();
  var grid = typeof mode.roundTo === 'number' && mode.roundTo > 0 ? mode.roundTo : 0;
  var values = raw.map(function (v) {
    if (typeof v !== 'number' || !isFinite(v)) return v;
    return grid > 0 ? snapScaleGrid(v, grid) : Math.round(v * 100) / 100;
  });
  return { values: values, raw: raw, warnings: built.warnings || [] };
}

/** Where a step sits along the ramp: 0 at the base, 1 at the largest. */
function typeScaleProgress(index, steps) {
  return steps > 1 ? index / (steps - 1) : 0;
}

/** A number between two numbers. Local so this library carries its own arithmetic. */
function typeScaleBetween(from, to, t) {
  return from + (to - from) * t;
}

/** Is this an optional companion the author actually filled in? */
function typeScaleHasNumber(value) {
  return typeof value === 'number' && isFinite(value);
}

/**
 * Line height in px for every step.
 *
 * **The two ends are typed in px and the curve runs in ratio space.** That distinction is the whole
 * value of the pair, and getting it wrong is visible: interpolating the *absolute* px from 12 to 66
 * against a geometric size ramp made the ratio **rise** to 2.0 in the middle — a 12px step with 24px of
 * line height — before falling to 1.1 at the top. Loose in the body copy and tight in the headings, which
 * is the opposite of the interaction this reproduces. Interpolating the ratio instead (1.5 → 1.1) gives
 * absolute line height that rises with size and a ratio that falls the whole way down, which is what
 * precise-type's charts show.
 *
 * With no `lineHeightAtTop` the base ratio is held — line height grows with the size, which is what this
 * script has always done, and the plain reading of filling in one number.
 */
function typeScaleLineHeights(mode, sizes) {
  var base = sizes.length > 0 && typeScaleHasNumber(sizes[0]) ? sizes[0] : 16;
  var top = sizes.length > 0 && typeScaleHasNumber(sizes[sizes.length - 1]) ? sizes[sizes.length - 1] : base;
  var atBase = typeScaleHasNumber(mode.lineHeight) ? mode.lineHeight : base * 1.5;
  var ratioBase = base > 0 ? atBase / base : 1.5;
  var ratioTop = typeScaleHasNumber(mode.lineHeightAtTop) && top > 0
    ? mode.lineHeightAtTop / top
    : ratioBase;
  var grid = typeScaleHasNumber(mode.roundTo) && mode.roundTo > 0 ? mode.roundTo : 0;

  return sizes.map(function (size, i) {
    var ratio = typeScaleBetween(ratioBase, ratioTop, typeScaleProgress(i, sizes.length));
    var value = (typeScaleHasNumber(size) ? size : 0) * ratio;
    return grid > 0 ? snapScaleGrid(value, grid) : Math.round(value * 100) / 100;
  });
}

/**
 * Tracking in px for every step.
 *
 * The same rule one property along: the ends are px, and with both filled in the curve runs as a **share
 * of the size** — 0% at the base to −2% at the top — because that is the quantity "tracking tightens as
 * type grows" is about, and it is the column the frame's Overview shows.
 *
 * With no `letterSpacingAtTop` the px value is held flat rather than the percentage. One number typed
 * once means "this tracking, everywhere", which is what it has always meant; reading it as a percentage
 * would turn `-0.2` at an 8px base into `-1.5px` at the top of a heading ramp, for a config that filled
 * in one field.
 */
function typeScaleTrackings(mode, sizes) {
  var atBase = typeScaleHasNumber(mode.letterSpacing) ? mode.letterSpacing : 0;
  if (!typeScaleHasNumber(mode.letterSpacingAtTop)) {
    return sizes.map(function () { return Math.round(atBase * 100) / 100; });
  }
  var base = sizes.length > 0 && typeScaleHasNumber(sizes[0]) ? sizes[0] : 16;
  var top = sizes.length > 0 && typeScaleHasNumber(sizes[sizes.length - 1]) ? sizes[sizes.length - 1] : base;
  var shareBase = base > 0 ? atBase / base : 0;
  var shareTop = top > 0 ? mode.letterSpacingAtTop / top : shareBase;
  return sizes.map(function (size, i) {
    var share = typeScaleBetween(shareBase, shareTop, typeScaleProgress(i, sizes.length));
    return Math.round((typeScaleHasNumber(size) ? size : 0) * share * 100) / 100;
  });
}

/**
 * Everything one mode generates, per token: the row the Overview shows and the variables a run writes.
 *
 * One function for both, so the table cannot show numbers a run would not produce — the trap every
 * preview in this project is written to avoid.
 */
function typeScaleTable(config, modeName) {
  var data = (config && config.config) || config || {};
  var mode = typeScaleModeNamed(config, modeName);
  var tokens = typeScaleTokens(config);
  if (!mode || !typeScaleModeIsScaled(mode) || tokens.length === 0) {
    return { mode: mode, tokens: tokens, rows: [], warnings: [] };
  }

  var sizes = typeScaleSizes(mode, tokens.length);
  var lineHeights = typeScaleLineHeights(mode, sizes.values);
  var trackings = typeScaleTrackings(mode, sizes.values);
  var prefix = namePrefix(resolveGroup({ config: data }));
  var rows = tokens.map(function (token, i) {
    var size = sizes.values[i];
    var lineHeight = lineHeights[i];
    var tracking = trackings[i];
    var rawSize = sizes.raw[i];
    return {
      token: token,
      size: size,
      raw: rawSize,
      rounded: typeof rawSize === 'number' && Math.abs(rawSize - size) > 0.005,
      lineHeight: lineHeight,
      // The ratio is derived, never typed. It is the number that tells you whether the ramp is doing
      // what you meant, and the frame's Overview has a column for it.
      ratio: size > 0 ? Math.round((lineHeight / size) * 100) / 100 : 0,
      tracking: tracking,
      trackingPercent: size > 0 ? Math.round((tracking / size) * 1000) / 10 : 0,
      // **The folder, with its slash, because a step is three variables and not one.** A run writes
      // `<token>/font-size`, `/line-height` and `/letter-spacing`; naming `Typography/Text-Tiny` in a
      // column headed *Variable* named something that does not exist in the file — the illustrative-value
      // trap, arriving in the one section whose whole job is to say what will be written.
      variable: prefix + token + '/'
    };
  });
  return { mode: mode, tokens: tokens, rows: rows, warnings: sizes.warnings };
}

function typeScaleEscape(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A number for reading: no trailing `.00`, and two decimals when it needs them. */
function typeScaleNumber(value) {
  if (typeof value !== 'number' || !isFinite(value)) return '—';
  return String(Math.round(value * 100) / 100);
}

/**
 * The Overview: one row per token, with the variable path.
 *
 * The only place the *names* of the variables appear, which is what makes it worth having beside a
 * preview that shows their effect.
 */
function typographyOverviewHtml(config, domain, modeName) {
  var table = typeScaleTable(config, modeName);
  if (table.rows.length === 0) {
    return '<div class="config-ui-empty">Pick a scale type and a base unit, and the steps appear here.</div>';
  }

  var head = '<thead><tr><th>Step</th><th>Size</th><th>Line height</th><th>Ratio</th>' +
    '<th>Tracking</th><th>Variables</th></tr></thead>';
  var body = table.rows.map(function (row) {
    return '<tr>' +
      '<td>' + typeScaleEscape(row.token) + '</td>' +
      '<td>' + typeScaleNumber(row.size) + '</td>' +
      '<td>' + typeScaleNumber(row.lineHeight) + '</td>' +
      '<td>' + typeScaleNumber(row.ratio) + '</td>' +
      '<td>' + typeScaleNumber(row.trackingPercent) + '%</td>' +
      '<td>' + typeScaleEscape(row.variable) + '</td>' +
      '</tr>';
  }).join('');
  return '<table class="type-overview">' + head + '<tbody>' + body + '</tbody></table>';
}

/** The preview copy, and the two-line default the frame shows. */
function typeScalePreviewText(config) {
  var data = (config && config.config) || config || {};
  var text = typeof data.overviewPreviewText === 'string' ? data.overviewPreviewText.trim() : '';
  return text || 'Sphinx of black quartz,\njudge my vow.';
}

/** The weight a specimen sets its samples in: the heaviest the config declares, or 400. */
function typeScaleSpecimenWeight(config) {
  var data = (config && config.config) || config || {};
  var weights = data.fontWeights;
  var numbers = [];
  if (Array.isArray(weights)) {
    weights.forEach(function (w) { if (typeScaleHasNumber(Number(w))) numbers.push(Number(w)); });
  } else if (weights && typeof weights === 'object') {
    Object.keys(weights).forEach(function (name) {
      if (typeScaleHasNumber(weights[name])) numbers.push(weights[name]);
    });
  }
  if (numbers.length === 0) return 400;
  return numbers.sort(function (a, b) { return b - a; })[0];
}

/**
 * The specimen: the sample set at its real size, largest last, so the section reads as a scale.
 *
 * Sizes are in px and not scaled down — the point of a type specimen is that 78px looks like 78px, and
 * the frame shows the top step running off the right edge mid-word. `.type-specimen-sample` clips it.
 */
function typographyPreviewHtml(config, domain, modeName) {
  var data = (config && config.config) || config || {};
  var table = typeScaleTable(config, modeName);
  if (table.rows.length === 0) {
    return '<div class="config-ui-empty">Name some tokens and pick a scale, and the type appears here.</div>';
  }

  var family = typeof data.fontFamily === 'string' && data.fontFamily ? data.fontFamily : 'Inter';
  var weight = typeScaleSpecimenWeight(config);
  var lines = typeScalePreviewText(config).split('\n').map(typeScaleEscape).join('<br>');

  var steps = table.rows.map(function (row) {
    var meta = [
      typeScaleEscape(row.token),
      'Font weight: ' + weight,
      'Font size: ' + typeScaleNumber(row.size),
      'Line height: ' + typeScaleNumber(row.lineHeight),
      'Letter spacing: ' + typeScaleNumber(row.tracking)
    ];
    if (row.rounded) meta.push('Rounded from ' + typeScaleNumber(row.raw));
    var style = 'font-size:' + row.size + 'px;line-height:' + (row.size > 0 ? row.lineHeight / row.size : 1) +
      ';letter-spacing:' + row.tracking + 'px;font-weight:' + weight;
    return '<div class="type-specimen-step">' +
      '<div class="type-specimen-meta">' + meta.join('<br>') + '</div>' +
      '<div class="type-specimen-sample" style="' + style + '">' + lines + '</div>' +
      '</div>';
  }).join('');

  var mode = table.mode && table.mode.name ? table.mode.name : '';
  return '<div class="type-specimen">' +
    '<div class="type-specimen-family">' + typeScaleEscape(family) + '</div>' +
    '<div class="type-specimen-note">' +
      typeScaleEscape(mode ? mode + ' · font weight ' + weight : 'Font weight ' + weight) +
    '</div>' + steps + '</div>';
}
