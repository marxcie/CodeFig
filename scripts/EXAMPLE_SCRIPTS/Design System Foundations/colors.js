// Colors
// @DOC_START
// Generates a colour ramp per mode from three anchors and a curve, in OKLCH or HSL.
//
// ## The shape of it
// A **lightness ladder** is three anchors — bright, middle, dark — with a curve between them, and it is
// **shared by every mode in the script**. Each mode then supplies only its own hue and chroma. That is what
// makes two modes read as the same tone under a greyscale filter: they match on **lightness, not colour**,
// and `Moss 200` and `Granite 200` sit at the same L with different hue and chroma.
//
// In **HSL** there is no shared ladder — a mode's own three anchors are its ladder, and the curve is per
// mode, because an HSL curve is legitimately per hue. The *Color model* radio switches between the two.
//
// ## Seed color
// A hex you already have. It fills the **Middle** anchor's hue and chroma once, when you enter it, and then
// gets out of the way — the workflow is *place a colour, generate a scale from it, then adjust the scale*.
// **Token placement** decides which step it occupies, and that step becomes the middle anchor, so the two
// segments need not be the same length.
//
// **Lock seed** re-anchors rather than offsets. With it on, the middle anchor becomes the seed's own
// lightness and the ladder is recomputed through it; bright and dark are untouched, so the endpoints still
// match the shared ladder exactly. The cost is that interior steps drift, and the largest deviation is
// reported beside the field, because that number is the whole decision. With the seed *on* the first or last
// step there is no endpoint left to keep, and the panel says so.
//
// ## Two things about colour that are not obvious
// - **Chroma is reduced per step to stay inside sRGB, and L and hue never move.** That is the only fit that
//   keeps a step on its ladder, so there is no setting for it. Every reduction is reported — `C→` under the
//   swatch, and a line in the run log.
// - Very saturated colours read slightly brighter than their lightness suggests (Helmholtz–Kohlrausch).
//   Not a concern for the near-neutral ramps this is for, and worth knowing before you chase it.
// - Stored RGB values are treated as **sRGB**.
//
// ## Reading a collection you already have
// Point *Collection* and *Group* at an existing set and the panel fills itself from it: the steps from the
// variable names, and hue, chroma and the lightness anchors from the real first, middle and last values.
//
// **It does not guess a curve.** An existing ramp is a list of colours with no record of how it was made,
// and a hand-made one may sit on no curve at all — so the curve stays on *Original* and the panel draws what
// is in the file *underneath* what it would generate, with the lightness gap per step. That comparison is the
// honest version of a fit, and it is the only place you can see whether a collection you already have sits on
// the ladder.
//
// ## The curve
// Two anchors and two handles, dragged, arrow-keyed, chosen from a preset list, or pasted as
// `cubic-bezier(…)`. **Add middle point** makes it three anchors and two segments, so the half above the
// middle can bend differently from the half below — which is what a measured neutral ramp actually does. The
// coordinates are the whole of it: there is no family name stored beside them, so the preview cannot show
// one curve while the run generates another.
//
// What it will not touch:
// - **An aliased variable is read through to its value and never written.** An alias is a deliberate
//   indirection and replacing it with a raw value breaks a link silently.
// - **A non-opaque variable is reported and skipped**, never composited over an assumed background to get a
//   lightness, and never overwritten with an opaque value.
// - A **group where more than half the variables are non-opaque** is an alpha ramp, not a lightness ramp.
//   The panel declines it in one line rather than itemising every skip.
// @DOC_END

// The Configuration tab redraws this as you type. Pure: it generates in memory and draws the same strips a
// run would, so it cannot write anything.
// @PREVIEW: colorsPreviewHtml

// `@Color Ramp` and `@OKLCH` both, and `@Math Helpers` under them: **imports do not bring cross-script
// dependencies.** `colorsGenerateMode` arrives here as text and its calls resolve in *this* context, so
// everything it reaches for has to be named here too. `npm run validate` makes that a build error rather
// than a ReferenceError swallowed by a caller's try/catch.
@import { displayResults, createResult, createHtmlResult } from "@InfoPanel"
@import { bezierAt, bezierNormalise, bezierFromEase, bezierWithMiddle, bezierWithoutMiddle, bezierParse, bezierFormat, bezierEaseName, bezierJoin, bezierSplit, bezierThrough, bezierFitRamp } from "@Bezier"
@import { oklchFromHex, oklchHslFromHex, oklchNormaliseHex, oklchClamp01, oklchLadder, oklchNearestStep, oklchReanchor, oklchRamp, oklchCompare, oklchDistance } from "@OKLCH"
@import { colorsPlaceholderSteps, colorsParseSteps, colorsLightnessAnchors, colorsNumber, colorsMidIndex, colorsChannel, colorsCurve, colorsFitCurve, colorsFitChromaCurve, colorsFitHueCurve, colorsBestAnchor, colorsAnchorFits, colorsSharedLadder, colorsLightnessOf, colorsGenerateMode, colorsPreviewHtml, colorsAnchorStrip, colorsCard, colorsChangeCaption, colorsStrip, colorsAlignment, colorsBannerHtml, colorsTolerance, colorsEscapeHtml, colorsPct } from "@Color Ramp"

// ========================================
// CONFIG
// ========================================

var colorsConfigData = typeof colorsConfigData !== 'undefined' ? colorsConfigData : {
  // @CONFIG_START
  // @fromFile: domains.colors

  // # General
  collectionName: "", // @collection @label: Collection
  //
  // The collection's own modes. The chips are the mode list — a read fills them, and there is one mode block
  // below per chip, in chip order. Removing and renaming happen here, which is why a block carries neither.
  // @collectionModes: Collection modes @showWhen: collectionName=* @showWhen: steps=*
  group: "", // @label: Group within collection @placeholder="eg.: Primitives/Neutrals"
  steps: "", // @label: Color tokens @placeholder="Eg. 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950" @helper: Named lightest to darkest, and the only source for token placement below. The variables are <group>/<step>.
  colorModel: "hsl", // @options: hsl:HSL|oklch:OKLCH @radio @label: Color model @helper: HSL keeps a curve per mode. OKLCH shares one lightness ladder across every mode, which is what makes them match in greyscale.
  // Each anchor keeps a hue for both models: OKLCH's is a perceptual angle, HSL's is where the
  // maximum channel sits, and on a near-neutral ramp the two disagree by more than 30°. Both are
  // filled when the panel reads a collection, so switching model loses nothing.

  // --- @section

  // # OKLCH settings @showWhen: colorModel=oklch @showWhen: collectionName=* @showWhen: steps=*
  // The same curve editor a mode has, at collection scope: the ladder is shared, so the curve belongs to
  // the collection rather than to one of its modes — **one curve for every mode**, which is what makes the
  // modes match in greyscale.
  //
  // **Nothing below General until there are tokens.** Choosing a collection sets a read going — modes are
  // fetched, blocks are added, the block is rewritten — and every one of those rebuilds the form. With the
  // mode settings on screen that reads as flicker and a jumping layout, over a panel that cannot say
  // anything useful yet: a collection with no token list has no ramp to show. Naming the tokens is the
  // point at which there is something to draw, so it is the point at which the rest appears.
  //
  // **A new scale starts Linear, not Original.** *Original* means "the ramp already in the file", so on a
  // collection that has no ramp yet it names nothing — an empty editor and a preview with no line in it.
  // Linear is the honest starting point: an even ladder between the two ends, which is a thing you can see
  // and then bend. A read replaces it with the curve fitted to what the file actually holds.
  curve: [0.333333, 0.333333, 0.666667, 0.666667], // @curve @allowOriginal @ends: lightness.bright..lightness.dark @range: 0..100 @label: Curve @showWhen: colorModel=oklch @showWhen: collectionName=* @showWhen: steps=* @helper: One curve, bright to dark. Drag a handle, pick a preset, or paste coordinates. Add middle point bends the two halves differently — which is what a real neutral ramp does — and that anchor is the middle colour's lightness and its step.
  // @preview
  lightness: {}, // @group: bright:number=Bright|dark:number=Dark @label: Lightness @showWhen: colorModel=oklch @showWhen: collectionName=* @showWhen: steps=* @helper: 0 to 100. The two ends hold exactly; the curve fills everything between them.

  // # Mode settings @showWhen: collectionName=* @showWhen: steps=*
  modes: [
    {
      name: "",
      curve: [0.333333, 0.333333, 0.666667, 0.666667],
      chromaCurve: [],
      saturationCurve: [],
      hueCurve: [],
      hslHueCurve: [],
      seed: { hex: "", placement: "", lock: false },
      bright: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 98 },
      middle: { hue: 0, hslHue: 0, chroma: 0, saturation: 0 },
      dark: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 4 }
    }
  ], // @rows: name:text=Mode|seed:{hex:text@placeholder="eg. #71717A"=Hex|placement:text@placeholder="Auto"=Token|lock:checkbox=Lock seed color @helper: On. Seed keeps its value. The ladder re-anchors through it, endpoints unchanged.\nOff. Seed moves to the nearest step on the ladder.}=Seed color|#>Hue|hueCurve:curve(ends:bright.hue..middle.hue..dark.hue, range:0..360){colorModel=oklch}=Hue curve @helper: How the hue travels between the ends. Worth least on a cool palette and most on a warm one — amber crosses 49 degrees and needs its own timing. Empty on a near-grey, where a measured hue is rounding rather than a value.|hslHueCurve:curve(ends:bright.hslHue..middle.hslHue..dark.hslHue, range:0..360){colorModel=hsl}=Hue curve @helper: The same, for HSL — a different angle from OKLCH's, so a different curve.|bright:{hue:number{colorModel=oklch}@placeholder="eg. 264"=Hue start|hslHue:number{colorModel=hsl}@placeholder="eg. 264"=Hue start}[hueCurve=original]=Bright|middle:{hue:number{colorModel=oklch}@placeholder="eg. 264"=Hue middle|hslHue:number{colorModel=hsl}@placeholder="eg. 264"=Hue middle}[hueCurve=original]=Middle|dark:{hue:number{colorModel=oklch}@placeholder="eg. 264"=Hue end|hslHue:number{colorModel=hsl}@placeholder="eg. 264"=Hue end}[hueCurve=original]=Dark|#>Saturation|chromaCurve:curve(ends:bright.chroma..middle.chroma..dark.chroma, range:0..0.4){colorModel=oklch}=Chroma curve @helper: How fast the colour arrives, as opposed to the lightness. A designed palette usually rises to its most colourful step and falls, on its own timing.|saturationCurve:curve(ends:bright.saturation..middle.saturation..dark.saturation, range:0..100){colorModel=hsl}=Saturation curve @helper: The same, for HSL. Saturation and chroma are different quantities, so they carry different curves and a read fits both — switching model keeps whichever one it is switching to.|bright:{chroma:number{colorModel=oklch}@placeholder="eg. 0.012"=Chroma start|saturation:number{colorModel=hsl}@placeholder="eg. 12"=Saturation start}=Bright|middle:{chroma:number{colorModel=oklch}@placeholder="eg. 0.012"=Chroma middle|saturation:number{colorModel=hsl}@placeholder="eg. 12"=Saturation middle}=Middle|dark:{chroma:number{colorModel=oklch}@placeholder="eg. 0.012"=Chroma end|saturation:number{colorModel=hsl}@placeholder="eg. 12"=Saturation end}=Dark|#>Lightness|curve:curve(original, ends:bright.lightness..dark.lightness, range:0..100){colorModel=hsl}=Lightness curve @helper: One curve, bright to dark. Drag a handle, pick a preset, or paste coordinates. Add middle point bends the two halves differently — which is what a real neutral ramp does — and that anchor is the middle colour's lightness and its step.|bright:{lightness:number{colorModel=hsl}@placeholder="eg. 98"=Bright}=Bright|dark:{lightness:number{colorModel=hsl}@placeholder="eg. 4"=Dark}=Dark @disabledNote: Anchors take effect once you choose a curve.|@preview @blocks @label: Modes @showWhen: collectionName=* @showWhen: steps=*

  // @CONFIG_END
};

// ========================================
// EXECUTION
//
// **Nothing is written yet, on purpose.** The panel — config, recognition and both preview strips — is
// phase 3; the write path is phase 4 and is gated on a dry run being reviewed first. A Run that half-wrote a
// colour set would be worse than one that refuses, because the thing it would be half-writing is a
// collection other files subscribe to.
// ========================================

(function () {
  var parsed = colorsParseSteps(colorsConfigData.steps);
  var results = [createResult(
    'The generator is not built yet, so nothing was written.',
    'The panel, the preview and reading an existing collection all work. The write path lands after its ' +
    'dry run has been reviewed.',
    'info'
  )];
  results.push(createResult(
    parsed.steps.length + ' steps, ' + (colorsConfigData.modes || []).length + ' modes, model ' +
    (colorsConfigData.colorModel || 'oklch'),
    'Collection: ' + (colorsConfigData.collectionName || '—') +
    (colorsConfigData.group ? ' / ' + colorsConfigData.group : ''),
    'info'
  ));
  displayResults({ title: 'Colors', results: results, type: 'info', showFilters: false });
})();
