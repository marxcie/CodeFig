// @Color Ramp
// @DOC_START
// A colour ramp, generated: the arithmetic that turns a config into swatches, and the two strips that draw
// them. No Figma API, so the preview can run in the UI and a test can run it in Node.
//
// The split from **`@OKLCH`** is the one that matters. That library is colour space and nothing else —
// matrices, gamut fitting, ladders. This one knows what a *config* looks like: which key holds the steps,
// that lightness is 0–100 in the UI and 0–1 in the maths, that a mode has three anchors, and what a seed
// does to them. Colour maths has no opinion about any of that, and a panel should not have to hold both.
//
// Two consumers by design, the way `@Linear Ramp` has two: **Colors** generates with it, and the eventual
// cross-collection alignment report measures existing sets against a ladder with the same functions. Two
// implementations of one ramp drift the way spacing and radius did.
//
// | Area | Functions |
// |---|---|
// | Config reading | `colorsParseSteps`, `colorsLightnessAnchors`, `colorsNumber`, `colorsMidIndex`, `colorsChannel` |
// | Generation | `colorsGenerateMode` |
// | Preview | `colorsPreviewHtml`, `colorsAnchorStrip`, `colorsCard`, `colorsExistingStrip` |
//
// `colorsGenerateMode` is the load-bearing one: the panel and the run both go through it, so they cannot
// disagree about where a seed landed or what the gamut refused.
// @DOC_END

@import { bezierAt, bezierNormalise, bezierFromEase } from "@Bezier"
@import { oklchFromHex, oklchHslFromHex, oklchClamp01, oklchLadder, oklchNearestStep, oklchReanchor, oklchRamp, oklchCompare } from "@OKLCH"

// ========================================
// GENERATION — pure, and shared by the preview and (later) the run
// ========================================

/**
 * What the Steps field suggests when it is empty, and what the preview draws from until it is filled.
 *
 * A function rather than a constant because `@import` extracts function declarations and nothing else — a
 * top-level array here would be unimportable, and the failure is a `ReferenceError` swallowed by a caller.
 */
function colorsPlaceholderSteps() {
  return ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
}

/** The step names, parsed from the one field that holds them. Blanks and repeats are dropped and counted. */
function colorsParseSteps(text) {
  var raw = String(text == null ? '' : text).split(',');
  var steps = [], dropped = 0, seen = {};
  for (var i = 0; i < raw.length; i++) {
    var name = raw[i].trim();
    if (!name || seen[name]) { dropped++; continue; }
    seen[name] = true;
    steps.push(name);
  }
  return { steps: steps, dropped: dropped };
}

/** 0..100 in the config, 0..1 in the maths. Converted at this boundary and nowhere else. */
function colorsLightnessAnchors(config) {
  var l = config.lightness || {};
  return {
    bright: oklchClamp01(colorsNumber(l.bright, 98.5) / 100),
    middle: oklchClamp01(colorsNumber(l.middle, 62) / 100),
    dark: oklchClamp01(colorsNumber(l.dark, 18) / 100)
  };
}

function colorsNumber(value, fallback) {
  var n = typeof value === 'number' ? value : parseFloat(value);
  return (typeof n === 'number' && isFinite(n)) ? n : fallback;
}

/**
 * One mode, generated. Everything the panel and the run both need to agree about lives here, so they cannot
 * disagree: the ladder, the rows, where the seed landed, what it cost, and what the gamut refused.
 *
 * → { rows, ladder, base, placementIndex, placementAuto, recoveredFrom, seed, invalidHex,
 *     reanchored, collapsed, drift, clamped, seedState, anchors }
 */
function colorsGenerateMode(config, mode, steps, sharedLadder) {
  var oklch = (config.colorModel || 'oklch') !== 'hsl';

  // **A segment on Original takes the file's colours for its own steps.**
  //
  // A collection read out of a file was made by a person, not by a curve: measured on a real neutral set the
  // closest curve on offer is 10.4% out at its worst step where the tolerance is 0.5%. So the honest value
  // for a freshly read segment is *no curve* — these are the colours, and choosing a curve replaces them.
  //
  // It is answered after generation rather than before, by substituting the file's own steps for every step
  // the curve would otherwise have covered.
  //
  // **HSL only.** OKLCH's ladder is shared by every mode, so *Original* there is a property of the
  // collection and lives in the shared block — `colorsCurve` reads the curve from `config` in OKLCH and
  // from the mode in HSL, which is the whole of that distinction.
  var held = (config.existing && config.existing[mode.name]) ? config.existing[mode.name] : null;
  var last = steps.length - 1;
  var read = oklch ? oklchFromHex : oklchHslFromHex;
  var seedHex = (mode.seed && mode.seed.hex) ? String(mode.seed.hex).trim() : '';
  var seed = seedHex ? read(seedHex) : null;
  var invalidHex = !!(seedHex && !seed);

  var anchors = colorsLightnessAnchors(config);
  // HSL has no shared ladder: a mode's own lightness anchors are its ladder. There is nowhere else for them
  // to live, so the mode carries them under the same three keys the OKLCH anchors use.
  if (!oklch) {
    anchors = {
      bright: oklchClamp01(colorsNumber(mode.bright && mode.bright.lightness, 98) / 100),
      middle: oklchClamp01(colorsNumber(mode.middle && mode.middle.lightness, 46) / 100),
      dark: oklchClamp01(colorsNumber(mode.dark && mode.dark.lightness, 4) / 100)
    };
  }
  // **After the anchors, because a legacy pair is joined at the middle they describe.** The curve is the
  // ladder's whole shape now, so it cannot be resolved before the lightness it spans — or the step it bends
  // at — is known. A named placement is readable without a ladder; only a seed's *nearest* step needs one,
  // and a seed re-anchors the curve anyway, which moves that anchor for a second time.
  var wanted = (mode.seed && mode.seed.placement != null) ? String(mode.seed.placement).trim() : '';
  var namedIndex = wanted ? steps.indexOf(wanted) : -1;
  var segments = colorsCurve(config, mode, oklch, steps, anchors,
    namedIndex >= 0 ? namedIndex : colorsMidIndex(steps));
  var curveId = segments.curve;
  var base = (oklch && sharedLadder) ? sharedLadder : oklchLadder(anchors, curveId, steps);

  // Placement is where Middle lands. Auto is nearest-by-lightness; a named step no longer in the list is
  // recovered to the nearest rather than silently reassigned, and the stored value is left alone so it comes
  // back if the step does.
  var placementIndex, placementAuto = true, recoveredFrom = null;
  if (wanted) {
    var named = namedIndex;
    if (named >= 0) { placementIndex = named; placementAuto = false; }
    else { placementIndex = seed ? oklchNearestStep(base, seed.L) : colorsMidIndex(steps); recoveredFrom = wanted; }
  } else {
    placementIndex = seed ? oklchNearestStep(base, seed.L) : colorsMidIndex(steps);
  }

  var lock = !!(mode.seed && mode.seed.lock);
  var reanchored = !!(seed && lock);
  var reanchor = reanchored ? oklchReanchor(anchors, seed.L, curveId, steps, placementIndex) : null;
  var ladder = reanchor ? reanchor.ladder : base;
  // Re-anchoring moves the curve, so the ramp eases its hue and chroma on the moved one. Handing it the
  // curve the ladder no longer follows is how the colour and the lightness came to turn at different steps.
  var walked = reanchor ? reanchor.curve : curveId;

  var rows = oklchRamp({
    steps: steps, ladder: ladder, curve: walked, middleIndex: placementIndex,
    model: oklch ? 'oklch' : 'hsl',
    hue: colorsChannel(mode, 'hue', oklch),
    chroma: colorsChannel(mode, 'chroma', oklch)
  });

  // Original is not a curve, so it cannot be eased into place — the steps it covers are simply the file's.
  if (held && segments.original) {
    for (var oi = 0; oi < rows.length; oi++) {
      var wasHex = held[oi];
      if (!wasHex) continue;
      var seenIt = read(wasHex);
      if (!seenIt) continue;
      rows[oi] = { step: rows[oi].step, hex: oklchNormaliseHex(wasHex), L: seenIt.L, C: seenIt.C,
        H: seenIt.H, chroma: seenIt.C, clamped: false };
    }
  }

  var seedRow = rows[placementIndex];
  var seedState = 'none';
  if (invalidHex) seedState = 'invalid';
  else if (seed) {
    if (Math.abs(seed.L - base[placementIndex].L) <= colorsTolerance()) seedState = 'exact';
    else if (lock) seedState = 'reanchored';
    else seedState = 'snapped';
  }

  var clamped = [];
  rows.forEach(function (row) {
    if (row.clamped) clamped.push({ step: row.step, chroma: row.chroma });
  });

  return {
    rows: rows, ladder: ladder, base: base,
    placementIndex: placementIndex, placementAuto: placementAuto, recoveredFrom: recoveredFrom,
    seed: seed, seedHex: seedHex, invalidHex: invalidHex, seedRow: seedRow, seedState: seedState,
    reanchored: reanchored, collapsed: !!(reanchor && reanchor.collapsed),
    drift: reanchor ? reanchor.drift : null, clamped: clamped, anchors: anchors, curve: walked,
    original: segments.original
  };
}

/**
 * The middle **index** of a step list.
 *
 * Not the middle *number* and not the step called 500. `color - neutral` in the test file runs 25, 50, 75,
 * 100, 150, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 950 — sixteen steps, denser at the light end,
 * so index 7 is step **300**. Checked against that collection's real values: a ladder anchored at 300 fits
 * it better than one anchored at 500 (worst deviation 8.2 against 13.0), so the index is the right answer
 * and the surprising-looking one.
 */
function colorsMidIndex(steps) {
  return Math.floor((steps.length - 1) / 2);
}

/** A mode's three anchors for one channel. `chroma` in OKLCH, saturation 0..1 in HSL. */
function colorsChannel(mode, channel, oklch) {
  function at(anchor, fallback) {
    var held = mode[anchor] || {};
    // **Each model reads its own keys.** A hue is not one quantity across models — OKLCH's is a perceptual
    // angle and HSL's is where the maximum channel sits, and on these very ramps they disagree by more than
    // 30° — so one `hue` key holding both made the switch lossy in whichever direction was written last.
    // Chroma and Saturation were already separate for the same reason; Hue was the one left sharing.
    if (channel === 'hue') {
      return oklch ? colorsNumber(held.hue, fallback) : colorsNumber(held.hslHue, fallback);
    }
    var raw = channel === 'chroma' && !oklch
      ? colorsNumber(held.saturation, fallback * 100) / 100
      : colorsNumber(held[channel], fallback);
    return raw;
  }
  if (channel === 'hue') {
    return { bright: at('bright', 0), middle: at('middle', 0), dark: at('dark', 0) };
  }
  return { bright: at('bright', 0.002), middle: at('middle', 0.012), dark: at('dark', 0.006) };
}

// ========================================
// PREVIEW
// ========================================

function colorsEscapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colorsPct(value) {
  return (value * 100).toFixed(1);
}

/**
 * **The curve a collection was already drawn with**, read back out of its own colours.
 *
 * A ramp in a file is a list of colours with no record of how it was made, so this was declared
 * unrecoverable and a read landed on *Original* — the file's values, no curve, an editor with nothing in
 * it to adjust. That was true of *naming* a curve: no preset comes close enough to claim. It is not true of
 * *fitting* one. Measured against published sets, a three-anchor fit lands within **0.5 to 0.9** lightness
 * points at its worst step:
 *
 * ```
 * Tailwind zinc  0.86      Tailwind blue  0.52
 * Tailwind slate 0.64      Radix gray     0.94
 * ```
 *
 * against 4.0 to 6.8 for the closest named preset. So the honest answer changed: not *"these are the
 * colours and no curve describes them"* but *"this curve is within a point of them everywhere"* — which is
 * a shape you can take hold of and bend, and the comparison strip prints the remaining difference step by
 * step rather than hiding it.
 *
 * `[]` when there is nothing to fit: fewer than three steps, an unreadable hex, or a flat run.
 */
function colorsFitCurve(hexes, oklch) {
  if (!hexes || hexes.length < 3) return [];
  var read = oklch ? oklchFromHex : oklchHslFromHex;
  var ladder = [];
  for (var i = 0; i < hexes.length; i++) {
    var seen = read(hexes[i]);
    if (!seen) return [];
    ladder.push(seen.L);
  }
  var fit = bezierFitRamp(ladder);
  return fit ? fit.curve : [];
}

/**
 * **One curve**, as coordinates the ladder understands.
 *
 * A ladder used to be described by a *Lower* curve (bright→middle) and an *Upper* one (middle→dark), each
 * normalised into its own half. That was always one curve written down twice: a pair of halves joined at a
 * middle anchor **is** a single curve with three anchors, which `bezierJoin` reproduces to 8.7e-7 across the
 * 735 legacy combinations `tests/bezier.test.js` walks. So the pair is joined here, once, on the way in, and
 * nothing downstream has two of anything to keep in step.
 *
 * *Original* is not a curve: it comes back empty, so the ladder still has something to walk, and is reported
 * separately so the caller can substitute the file's own steps. **A curve is Original or it is not** — the
 * old model let one half be Original while the other was a curve, which one curve cannot express and which
 * `bezierJoin` therefore resolves by treating an Original half as linear.
 *
 * The curve comes from the shared block in OKLCH, where the ladder belongs to the collection, and from the
 * mode in HSL, where it belongs to the mode. That is the whole of the HSL-only rule, and it is why OKLCH
 * shows one curve for every mode while HSL shows one per mode.
 */
function colorsCurve(config, mode, oklch, steps, anchors, joinIndex) {
  var from = oklch ? config : mode;

  /**
   * **A curve is coordinates.** The panel writes an array — four numbers for one segment, ten for two,
   * and `[]` for *Original*, which is not a curve at all but the file's own steps.
   *
   * A config written before the editor carries `{ family, easing, amount }` instead, and is converted here
   * rather than kept on a path of its own. `bezierFromEase` is exact for `linear`, `quad` and `cubic`, and
   * within 0.01 of the rest — the numbers are in `bezierEaseTable`. Two evaluators would disagree exactly
   * where it matters least visibly: a file written by the old panel, opened in the new one.
   */
  function curveFrom(held) {
    if (Array.isArray(held)) {
      var points = bezierNormalise(held);
      return { curve: points, original: points.length === 0 };
    }
    var legacy = held || {};
    var family = legacy.family || 'original';
    if (family === 'original') return { curve: [], original: true };
    if (family === 'linear') return { curve: bezierFromEase('linear', 'none', 1), original: false };
    var ease = legacy.easing || 'inout';
    if (ease !== 'in' && ease !== 'out' && ease !== 'outin') ease = 'inout';
    // 0-100 in the panel, 0-1 in the maths. Absent means the whole curve, which is what every config written
    // before the control existed meant. `bezierFromEase` folds it into the handles, where it is exact.
    var amount = colorsNumber(legacy.amount, 100) / 100;
    return { curve: bezierFromEase(family, ease, oklchClamp01(amount)), original: false };
  }

  // The shape the panel writes now.
  if (from && from.curve !== undefined && from.curve !== null) return curveFrom(from.curve);

  // The shape it wrote before: two halves, joined at the middle the config described. Both Original stays
  // Original — there is no curve to join — and anything else becomes the three-anchor curve the pair was.
  var lower = curveFrom(from ? from.lower : null);
  var upper = curveFrom(from ? from.upper : null);
  if (lower.original && upper.original) return { curve: [], original: true };

  var last = steps && steps.length ? steps.length - 1 : 0;
  var straight = bezierFromEase('linear', 'none', 1);
  var span = anchors ? (anchors.dark - anchors.bright) : -1;
  var my = (anchors && Math.abs(span) > 1e-9) ? (anchors.middle - anchors.bright) / span : 0.5;
  // **Joined at the placed step, not at the automatic middle.** The pair described a ladder that bent where
  // the colour turned; joining at `floor(last/2)` when the placement says 700 puts the lightness corner at
  // 500 and the hue corner at 700 — one config, a ramp that goes pale in one place and grey in another.
  // That is the bug `tests/colors-alignment.test.js` was written for, and it comes straight back if the
  // join forgets where the middle was.
  var at = (typeof joinIndex === 'number' && joinIndex >= 0) ? joinIndex : colorsMidIndex(steps);
  var mx = last > 0 ? at / last : 0.5;
  return {
    curve: bezierJoin(lower.original ? straight : lower.curve,
                      upper.original ? straight : upper.curve, mx, my),
    original: false
  };
}

/**
 * A mode whose curve is *Original*: the file's own values, in the shape `colorsGenerateMode` answers in.
 *
 * Every field a strip reads has to be here, or the caller has to start asking which kind of answer it got —
 * which is the branch that goes stale. There is no seed, nothing was clamped and no ladder was walked, so
 * those come back empty rather than absent.
 */
function colorsOriginalMode(hexes, steps, oklch) {
  var read = oklch ? oklchFromHex : oklchHslFromHex;
  var rows = steps.map(function (step, i) {
    var hex = hexes[i] || '#000000';
    var seen = read(hex) || { L: 0, C: 0, H: 0 };
    return { step: step, hex: hex, L: seen.L, C: seen.C, H: seen.H, chroma: seen.C, clamped: false };
  });
  var last = rows.length - 1;
  var middle = colorsMidIndex(steps);
  return {
    rows: rows, ladder: rows, base: rows,
    placementIndex: middle, placementAuto: true, recoveredFrom: null,
    seed: null, seedHex: '', invalidHex: false, seedRow: rows[middle] || null, seedState: 'none',
    reanchored: false, collapsed: false, drift: null, clamped: [],
    anchors: {
      bright: rows[0] ? rows[0].L : 0,
      middle: rows[middle] ? rows[middle].L : 0,
      dark: rows[last] ? rows[last].L : 0
    },
    curve: 'original', original: true
  };
}

/**
 * Both strips, per mode: what a run would write, and — when the panel has read a set out of the file —
 * what is there now, with the lightness gap per step.
 *
 * Pure. The file's values arrive as `config.existing` because only the sandbox can read variables and this
 * runs in the UI; auto-import puts them there.
 */
function colorsPreviewHtml(config, domain, modeName) {
  // **An empty Steps field previews the placeholder list.** Frame 2065:4154 draws a full ramp with every
  // field on a placeholder, which is the honest thing: the panel is showing what it would do, and it can do
  // that before being told the step names.
  // **Nothing until there is something real to draw.**
  //
  // Colors used to draw a full ramp over `colorsPlaceholderSteps()` — a picture of a collection nobody had
  // chosen, in colours from the block's defaults. It reads as a result rather than as an invitation, and
  // the first thing anyone did was try to work out which collection it was showing.
  //
  // **Both halves of the address, not just the collection.** Gating on the collection alone left the same
  // invented ramp on screen the moment one was picked, because the placeholder steps filled in for the
  // empty field. The tokens are what the ramp *is*; without them there is nothing to preview, and typing
  // them is what brings the scale into being.
  if (!config.collectionName) return '';
  if (!colorsParseSteps(config.steps).steps.length) return '';

  var alignment = colorsAlignment(config);
  var out = [];

  // The banner goes in the section-level slot, which carries no row name.
  out.push('<div data-preview-for="__panel__">' + colorsBannerHtml(alignment, config) + '</div>');

  // **One strip per mode, marked with the mode it belongs to.** Every frame draws the strip inside its own
  // mode block and none has a Preview section, so there is a slot per block rather than one at the bottom —
  // and one silent run has to fill all of them. The panel distributes these by `data-preview-for`.
  // Keyed by **index**, which both sides agree on however the mode is named — a name is empty on a fresh
  // block and `rowLabel` calls that "Row 1", so a name-keyed match dropped every strip.
  alignment.modes.forEach(function (entry, index) {
    if (modeName && entry.name !== modeName) return;
    out.push('<div data-preview-for="' + index + '">');
    out.push(colorsStrip(entry, alignment.steps));
    out.push('</div>');
  });

  return out.join('');
}

/** Bright at the first step, Dark at the last, Middle over the step the seed landed on. */
function colorsAnchorStrip(made, steps) {
  var last = steps.length - 1;
  var out = ['<div class="color-ramp-preview-anchors">'];
  for (var i = 0; i < steps.length; i++) {
    if (i === 0) {
      out.push('<span class="color-ramp-preview-anchor color-ramp-preview-anchor--start">Bright' +
        '<span class="color-ramp-preview-anchor-mark"></span></span>');
    } else if (i === last) {
      out.push('<span class="color-ramp-preview-anchor color-ramp-preview-anchor--end">Dark' +
        '<span class="color-ramp-preview-anchor-mark"></span></span>');
    } else if (i === made.placementIndex) {
      out.push('<span class="color-ramp-preview-anchor color-ramp-preview-anchor--middle">Middle' +
        '<span class="color-ramp-preview-anchor-mark"></span></span>');
    } else {
      out.push('<span></span>');
    }
  }
  out.push('</div>');
  return out.join('');
}

/**
 * One swatch and its labels. `was` is the hex the file holds when this step would change — struck through
 * above the new one, which is how the frame draws it: the old value is what you are being asked to give up.
 */
/**
 * One step's swatch, for the continuous bar.
 *
 * **No border and no radius of its own.** The ramp is judged by the joins between neighbours, and a
 * hairline between every pair is a hairline between every pair of colours you are trying to compare. The
 * frame around the whole bar carries the edge instead, which is how a palette is drawn everywhere else.
 */
function colorsSwatch(hex, was) {
  // Split when the step would change: the file's colour on top, the run's below, so the pair is
  // legible before reading either hex.
  if (was) {
    return '<span class="color-ramp-preview-swatch color-ramp-preview-swatch--split" style="background:' +
      'linear-gradient(to bottom,' + colorsEscapeHtml(was) + ' 0 50%,' + colorsEscapeHtml(hex) + ' 50% 100%)' +
      '"></span>';
  }
  return '<span class="color-ramp-preview-swatch" style="background:' + colorsEscapeHtml(hex) + '"></span>';
}

/** One step's labels, in the row under the bar: the token, its hex, and anything worth saying about it. */
function colorsCard(step, hex, seedLabel, pin, was, delta) {
  var out = ['<span class="color-ramp-preview-card">'];
  out.push('<span class="color-ramp-preview-token">' + colorsEscapeHtml(step) + '</span>');
  if (was) {
    out.push('<span class="color-ramp-preview-hex color-ramp-preview-hex--was">' +
      colorsEscapeHtml(was) + '</span>');
    out.push('<span class="color-ramp-preview-hex color-ramp-preview-hex--now">' +
      colorsEscapeHtml(hex) + '</span>');
  } else {
    out.push('<span class="color-ramp-preview-hex">' + colorsEscapeHtml(hex) + '</span>');
  }
  if (seedLabel) out.push('<span class="color-ramp-preview-seed">' + colorsEscapeHtml(seedLabel) + '</span>');
  if (pin) out.push('<span class="color-ramp-preview-pin">' + colorsEscapeHtml(pin) + '</span>');
  if (delta) out.push('<span class="color-ramp-preview-delta">' + colorsEscapeHtml(delta) + '</span>');
  out.push('</span>');
  return out.join('');
}

/**
 * The one tolerance, in OKLab distance.
 *
 * **0.005**, the number used everywhere else in this panel. Measured: one 8-bit step is 0.0013–0.0020, so this
 * is between two and four bytes — above anything rounding can produce and far below anything visible. Both
 * ends of that matter:
 *
 * - `applyEase` overshoots an anchor by 6e-17, so an exact comparison would show a permanent banner on a
 *   perfectly applied collection.
 * - The anchors a read set produces are rounded for display (hue to 0.1°, chroma to 0.0001, lightness to
 *   0.1%), so regenerating from them does not reproduce the file's floats exactly. Measured on
 *   `color - neutral`, that rounding moves the anchor steps by 0.00000 and nothing anywhere near a byte.
 *
 * A real difference on a ramp that does not sit on its curve measures about 0.1 — fifty times this.
 */
function colorsTolerance() {
  return 0.005;
}

/**
 * **Is each mode's current colour what this config would produce?**
 *
 * → `{ steps, shared, modes: [{ name, made, existing, changed, differs }], unapplied, hasExisting }`
 *
 * Derived, never stored. There is no "applied" flag anywhere, and that is the point:
 *
 * - A fresh auto-import brings new values, this re-runs, and the banner reappears if they no longer match.
 * - Switch to HSL, edit, switch back, and the values stop matching what OKLCH would produce, so it returns.
 * - Align a collection by hand and it clears itself. Apply is a convenience, not a state transition.
 *
 * **The comparison is against the config's own output, not against the shared ladder.** Those are different
 * questions and only the first is the right one: Lock seed re-anchors a mode deliberately, so a locked mode is
 * permanently off the shared ladder and a ladder comparison would show a banner that could never clear. A
 * locked mode whose values the panel produced has nothing to apply.
 *
 * **One computation for the banner and the strips.** They are the same fact at two grains — summary and
 * detail — so computing alignment twice is how they come to disagree.
 */
function colorsAlignment(config) {
  var parsed = colorsParseSteps(config.steps);
  var steps = parsed.steps.length ? parsed.steps : colorsPlaceholderSteps();
  var oklch = (config.colorModel || 'hsl') !== 'hsl';
  // The shared ladder is built with the shared curve, or the two would disagree about the collection's.
  var sharedAnchors = colorsLightnessAnchors(config);
  var shared = oklch
    ? oklchLadder(sharedAnchors, colorsCurve(config, {}, true, steps, sharedAnchors).curve, steps)
    : null;

  var tolerance = colorsTolerance();
  var out = { steps: steps, shared: shared, modes: [], unapplied: [], hasExisting: false };
  var modes = Array.isArray(config.modes) ? config.modes : [];

  modes.forEach(function (mode) {
    var made = colorsGenerateMode(config, mode, steps, shared);
    var existing = (config.existing && config.existing[mode.name]) ? config.existing[mode.name] : null;
    if (existing) out.hasExisting = true;

    var changed = [];
    if (existing) {
      // **The lightness gap is measured here, in the model the ramp is in.** `colorsStrip` used to work it
      // out itself with `oklchFromHex`, while `row.L` is whichever lightness the mode's model produced — so
      // in HSL it subtracted an HSL lightness from a perceptual OKLCH one. On a mid green those differ by
      // 7-12 points *by unit alone*, which was the whole of the number: the column read -14 where the true
      // gap was -4, and the unit offset is always positive, so every step reported as darker even where the
      // run would have lightened it.
      //
      // Computed with the comparison rather than beside it, for the reason the banner and the strip already
      // share one: two places working out the same fact is how they come to disagree about it.
      var readL = oklch ? oklchFromHex : oklchHslFromHex;
      made.rows.forEach(function (row, i) {
        var was = existing[i];
        if (!was) return;
        var distance = oklchDistance(was, row.hex);
        if (distance > tolerance) {
          var before = readL(was);
          changed.push({
            index: i, step: row.step, was: was, now: row.hex, distance: distance,
            // Positive means the file is lighter than what a run would write, which the strip prints as a
            // step that would get darker.
            dL: before ? before.L - row.L : null
          });
        }
      });
    }

    var entry = { name: mode.name || '', made: made, existing: existing,
                  changed: changed, differs: changed.length > 0 };
    out.modes.push(entry);
    if (entry.differs) out.unapplied.push(entry.name || 'an unnamed mode');
  });

  return out;
}

/**
 * **One strip, and two hexes on the steps that would change.**
 *
 * The current-versus-updated display and the existing-versus-generated comparison were two components in the
 * plan and are one thing in the design: frame 2091:6810 draws the changed steps with a second hex line under
 * the first, in a highlight colour, and only the changed steps have it. So there is no second strip below —
 * the difference lives in the strip.
 *
 * A collection not yet on the ladder has every step differ and the whole strip goes double, which is correct
 * and unreadable without a count, so the summary line says how many.
 */
function colorsStrip(entry, steps) {
  var made = entry.made;

  // **The same `changed` list the banner counts.** Recomputing "does this step differ" here is how the summary
  // and the detail come to disagree, so the comparison happens once in `colorsAlignment` and both read it.
  var changedAt = {};
  entry.changed.forEach(function (c) { changedAt[c.index] = c; });

  var swatches = made.rows.map(function (row, i) {
    var change = changedAt[i];
    return colorsSwatch(row.hex, change ? change.was : null);
  });
  var cards = made.rows.map(function (row, i) {
    var change = changedAt[i];
    var delta = null;
    // Printed, not computed: `colorsAlignment` measured it in the ramp's own model.
    if (change && typeof change.dL === 'number' && Math.abs(change.dL) >= 0.0005) {
      delta = 'ΔL ' + (change.dL > 0 ? '−' : '+') + colorsPct(Math.abs(change.dL));
    }
    return colorsCard(row.step, row.hex,
      i === made.placementIndex && made.seed ? 'Seed color' : null,
      row.clamped ? 'C→' + row.chroma.toFixed(3) : null,
      change ? change.was : null, delta);
  });

  // **Nothing to say when nothing differs.** A freshly read mode is on the Original curve, so what this
  // config produces *is* what the file holds and the whole strip is a picture of the collection. The count
  // is the derived form of the old "has this been touched" flag: no difference, no caption, nothing stored.
  var out = ['<div class="color-ramp-preview">'];
  if (entry.existing && entry.changed.length) {
    out.push('<div class="color-ramp-preview-caption">' +
      colorsEscapeHtml(entry.changed.length + ' of ' + made.rows.length + ' steps would change') +
      '</div>');
  }
  out.push(colorsAnchorStrip(made, steps));
  // **The bar and its labels are two grids, not one.** A swatch has to touch its neighbours — a ramp is
  // read by the joins between them — so the swatches sit in a clipped, framed row of their own and the
  // labels in a matching one beneath. Sharing a grid would put the gap between the labels inside the bar.
  out.push('<div class="color-ramp-preview-bar">' + swatches.join('') + '</div>');
  out.push('<div class="color-ramp-preview-strip">' + cards.join('') + '</div>');
  out.push('</div>');
  return out.join('');
}

/**
 * The banner, and the one action beside it.
 *
 * Names the modes rather than implying the whole collection, because with several modes some may match and some
 * may not. Apply still acts on the whole collection — the scale is a property of the collection, which is why
 * the OKLCH block sits above the modes in the first place — so only the wording is per mode.
 *
 * Empty in HSL, and empty when nothing has been read: there is no claim to make about a collection the panel
 * has not seen.
 */
function colorsBannerHtml(alignment, config) {
  if ((config.colorModel || 'hsl') === 'hsl') return '';
  if (!alignment.hasExisting) return '';
  if (!alignment.unapplied.length) return '';
  return '<div class="color-apply-banner">' +
    '<span class="color-apply-banner-text">OKLCH scale not applied to ' +
      colorsEscapeHtml(alignment.unapplied.join(', ')) +
      '. Apply it to the colors to achieve uniform lightness tones across the modes.</span>' +
    '<button class="color-apply-banner-action" type="button" data-colors-apply="true">' +
      'Apply OKLCH scale</button>' +
  '</div>';
}


