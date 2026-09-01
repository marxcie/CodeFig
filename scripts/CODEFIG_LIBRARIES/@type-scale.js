// @Type Scale
// @DOC_START
// # Builds typography size, line-height, and tracking ladders per mode for preview and Overview
//
// ## Overview
//
// The typography ramp as the panel writes it: one scale per mode, plus line height and tracking that travel with font size. Also the Overview table and the specimen the Typography panel draws.
//
// ### What a mode holds
//
// | Key | Meaning |
// |-----|---------|
// | `scaleType` | `bezier`, `metric`, or `fibonacci` (same three as Spacing). `modular` is still accepted. |
// | `ratio` | Modular / bezier growth ratio |
// | `step`, `mod` | Metric and fibonacci: increment, and how often it grows |
// | `base` | Size of the **first** token (smallest → largest names) |
// | `lineHeight` | Line height in **px at the base step** |
// | `lineHeightAtTop` | Optional px at the largest step; intermediates interpolate. Omitted → hold the base *ratio* |
// | `letterSpacing` | Tracking in px at the base step |
// | `letterSpacingAtTop` | Optional tracking at the largest step. Omitted → tracking stays constant |
// | `roundTo` | Rounding grid for size and line height (tracking stays fractional) |
//
// Optional top values let line height rise in absolute terms while its **ratio** falls, and let tracking tighten as size grows — leave them empty for constant-ratio / constant-tracking behaviour.
//
// ## Exported functions
//
// | Category | Functions |
// |----------|-----------|
// | Config | typeScaleModes, typeScaleModeNamed, typeScaleTokens, typeScaleModeIsScaled |
// | Ladders | typeScaleSizes, typeScaleLineHeights, typeScaleTrackings |
// | Tables / preview | typeScaleTable, typographyOverviewHtml, typographyPreviewHtml |
// @DOC_END
// Shared component styles for markup this library emits (tier 2: library @STYLE_START).
// Opening a script that @imports this library injects these with the script sheet.
// @STYLE_START
// /* ============================================================
//    TYPOGRAPHY OVERVIEW AND SPECIMEN  (plan 20)
//
//    The table is the only place a run's variable *names* appear, which is what earns it a section
//    of its own beside a preview that shows their effect.
//    ============================================================ */
// .type-overview {
//   width: 100%;
//   border-collapse: collapse;
//   font-size: var(--font-size-body);
// }
//
// .type-overview th {
//   text-align: left;
//   font-weight: var(--font-weight-normal);
//   color: var(--text-secondary);
//   font-size: var(--font-size-small);
//   padding: 0 var(--space-md) 6px 0;
// }
//
// .type-overview td {
//   padding: 6px var(--space-md) 6px 0;
//   border-top: 1px solid var(--border-light);
//   font-variant-numeric: tabular-nums;
// }
//
// .type-overview td:last-child {
//   font-size: var(--font-size-small);
//   opacity: 0.7;
//   font-variant-numeric: normal;
// }
//
// .type-specimen {
//   width: 100%;
//   /* **Cut off, not wrapped and not scrolled.** A heading ramp's top step is wider than the panel
//      by design, and the frame shows it running off the right edge mid-word. Wrapping would make a
//      two-line sample four lines and destroy the comparison the specimen exists for; scrolling
//      would hide the overflow behind a gesture. Clipping says "this is bigger than the panel",
//      which is true and is part of what you are judging. */
//   overflow: hidden;
// }
//
// .type-specimen-family {
//   font-size: var(--font-size-subheadline);
//   font-weight: var(--font-weight-semibold);
// }
//
// .type-specimen-note {
//   font-size: var(--font-size-small);
//   opacity: 0.6;
//   margin-bottom: var(--space-lg);
// }
//
// /* Same proportions again: the metadata sits in the label column and the sample starts where a
//    control would. A type specimen is the one place a reader compares sizes down a page, and a
//    ragged left edge on the samples defeats it. */
// .type-specimen-step {
//   display: grid;
//   grid-template-columns: 3fr 7fr;
//   column-gap: var(--space-md);
//   align-items: start;
//   margin-bottom: var(--space-xl);
// }
//
// .type-specimen-meta {
//   font-size: var(--font-size-small);
//   line-height: 1.6;
//   opacity: 0.6;
// }
//
// .type-specimen-sample {
//   white-space: nowrap;
//   /* **The clip belongs here, on the box that overflows.** A grid item's `min-width` is `auto`,
//      which means it refuses to shrink below its content — so a `nowrap` sample at 78px widened
//      its own `7fr` column, squeezed the `3fr` beside it, and ran past the panel. Each step is its
//      own grid, so every row resolved a different split and the samples' left edges stopped
//      lining up, which is the one thing this layout exists to guarantee.
//      `overflow: hidden` on `.type-specimen` could not fix that: by then the grid had already been
//      laid out wide, and clipping the outer box does not put the columns back. */
//   min-width: 0;
//   /* **Clipped sideways only.** `overflow: hidden` clips both axes, and a line height below the font
//      size — tight display type — puts the glyphs outside their own line box, so the top and bottom of
//      every large step were cut off. `clip` is the one that does not force the other axis to `auto`,
//      so the sample can be as tall as it needs while the long line still stops at the panel edge.
//      The height it needs is reserved by a `min-height` the generator computes, since only it knows
//      the size, the leading and the line count. */
//   overflow-x: clip;
//   overflow-y: visible;
// }
// @STYLE_END


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
    // A bezier scale is a base, a growth ratio and a curve distributing the growth — the top comes out of
    // the ratio rather than being declared, so a scale keeps going when a token is added instead of being
    // squeezed to fit. `max` is still read for configs written while that was the spelling.
    //
    // Leaving these off did not fail: `scaleSequence` reported the missing one into a warnings array
    // nothing was reading, and every size in the panel came out 0.
    ratio: mode.ratio,
    curve: mode.curve,
    max: mode.max,
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
/**
 * The share of the font size a companion takes at the base and at the top.
 *
 * **The shape of the value is the spelling.** An object — `{ base: 150, max: 110 }` — is the panel's, and
 * the numbers are **percentages of the font size**: that is Figma's own unit for both line height and
 * letter spacing, and a percentage still means what it meant when the scale grows, which a pixel value
 * does not. A bare number is the older spelling, an absolute value *at* the base or the top, and it is
 * converted by dividing by the size it was measured against.
 *
 * Told apart by `typeof`, not by range. Both fields are genuinely ambiguous by value — `-1.2` is equally
 * plausible as −1.2px or −1.2%, and `110` as 110px or 110% — so a heuristic could only ever guess. The
 * nesting arrived for the panel's sake, and it doubles as the thing that says which era a config is from.
 *
 * → `{ base, top }` as fractions, so 150% comes back as 1.5.
 */
function typeScaleShares(atBase, atTop, base, top, fallback) {
  if (atBase && typeof atBase === 'object') {
    var pctBase = typeScaleHasNumber(atBase.base) ? atBase.base / 100 : fallback;
    var pctTop = typeScaleHasNumber(atBase.max) ? atBase.max / 100 : pctBase;
    return { base: pctBase, top: pctTop };
  }
  var absBase = typeScaleHasNumber(atBase) ? atBase : (base > 0 ? base * fallback : 0);
  var shareBase = base > 0 ? absBase / base : fallback;
  var shareTop = typeScaleHasNumber(atTop) && top > 0 ? atTop / top : shareBase;
  return { base: shareBase, top: shareTop };
}

function typeScaleLineHeights(mode, sizes) {
  var base = sizes.length > 0 && typeScaleHasNumber(sizes[0]) ? sizes[0] : 16;
  var top = sizes.length > 0 && typeScaleHasNumber(sizes[sizes.length - 1]) ? sizes[sizes.length - 1] : base;
  var share = typeScaleShares(mode.lineHeight, mode.lineHeightAtTop, base, top, 1.5);
  var grid = typeScaleHasNumber(mode.roundTo) && mode.roundTo > 0 ? mode.roundTo : 0;

  return sizes.map(function (size, i) {
    var ratio = typeScaleBetween(share.base, share.top, typeScaleProgress(i, sizes.length));
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
  var base = sizes.length > 0 && typeScaleHasNumber(sizes[0]) ? sizes[0] : 16;
  var top = sizes.length > 0 && typeScaleHasNumber(sizes[sizes.length - 1]) ? sizes[sizes.length - 1] : base;

  // The old spelling with no `AtTop` is a flat absolute value at every size, not a share — keeping that
  // exactly is what stops a config written before the panel from moving.
  if (!(mode.letterSpacing && typeof mode.letterSpacing === 'object') &&
      !typeScaleHasNumber(mode.letterSpacingAtTop)) {
    var flat = typeScaleHasNumber(mode.letterSpacing) ? mode.letterSpacing : 0;
    return sizes.map(function () { return Math.round(flat * 100) / 100; });
  }

  var share = typeScaleShares(mode.letterSpacing, mode.letterSpacingAtTop, base, top, 0);
  return sizes.map(function (size, i) {
    var at = typeScaleBetween(share.base, share.top, typeScaleProgress(i, sizes.length));
    return Math.round((typeScaleHasNumber(size) ? size : 0) * at * 100) / 100;
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
  var previewLines = typeScalePreviewText(config).split('\n');
  var lineCount = Math.max(1, previewLines.length);
  var lines = previewLines.map(typeScaleEscape).join('<br>');

  var steps = table.rows.map(function (row) {
    // **The rounding sits beside the number it moved**, not on a line of its own at the bottom. A separate
    // *Rounded from 218.37* left you matching it back to whichever value it belonged to — and there is only
    // ever one candidate, so the line was carrying no information its position could not.
    var meta = [
      typeScaleEscape(row.token),
      'Font weight: ' + weight,
      'Font size: ' + typeScaleNumber(row.size) +
        (row.rounded ? ' (' + typeScaleNumber(row.raw) + ')' : ''),
      'Line height: ' + typeScaleNumber(row.lineHeight),
      'Letter spacing: ' + typeScaleNumber(row.tracking)
    ];
    // **The row reserves the taller of the line box and the glyphs.**
    //
    // A line height below the font size is a real choice — tight display type does exactly that — but the
    // line *box* is then shorter than the letters, so they spill out of it and the horizontal clip cuts
    // them off top and bottom. At 218px with a 66px line height there was more glyph outside the box than
    // in it. `min-height` gives the box the room without touching the line height, so the specimen still
    // shows the leading it is describing.
    var lineBox = row.size > 0 ? row.lineHeight / row.size : 1;
    var reserved = Math.max(row.lineHeight, row.size * 1.25) * lineCount;
    var style = 'font-size:' + row.size + 'px;line-height:' + lineBox +
      ';letter-spacing:' + row.tracking + 'px;font-weight:' + weight +
      ';min-height:' + (Math.round(reserved * 100) / 100) + 'px';
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
