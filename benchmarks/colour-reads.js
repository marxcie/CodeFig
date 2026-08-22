/**
 * **How closely does a read reproduce the file?** Every real colour scale, both models.
 *
 *     node benchmarks/colour-reads.js              measure and print
 *     node benchmarks/colour-reads.js --save NAME  store the run as a baseline
 *     node benchmarks/colour-reads.js --vs NAME    print the change against one
 *
 * Exits non-zero if any set is further from the file than `LIMIT`, so it can gate a change.
 *
 * **Why this exists, and why it is not a test.** Colour matching regressed three times in a row while the
 * unit suite stayed green, because the suite checks properties of the maths and this checks the *result* on
 * real ramps. Each regression was found only by measuring: a middle anchor read at one step and applied at
 * another, a curve fitted in one space and used in another, and an idea that measured well against a
 * baseline that was itself broken. It lives here rather than in `tests/` because it takes fifteen seconds —
 * too slow to run on every save, and far too valuable to skip when the colour maths changes.
 *
 * **It goes through `colorsAlignment`**, the same call the panel makes, rather than poking the engine
 * underneath. Measuring the maths instead of the pipeline is exactly how a mismatch shipped and was
 * reported as a five-fold improvement.
 *
 * The fixture is `colour-scales.json`: sixteen real sets read out of Márton's own file, chosen for range
 * rather than convenience — near-neutrals where hue is rounding, muted greens, a lime that rides the sRGB
 * boundary at almost every step, and a coral whose saturation is a flat line with a notch in it.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LIBS = path.join(ROOT, 'scripts', 'CODEFIG_LIBRARIES');

/** Worst single 8-bit channel a read may land from the file before this fails. */
const LIMIT = 14;

const ctx = {
  console, Math, String, Array, Object, JSON,
  isNaN, isFinite, parseInt, parseFloat, Number, RegExp, Infinity,
};
vm.createContext(ctx);
for (const file of ['@math-helpers.js', '@bezier.js', '@oklch.js', '@color-ramp.js']) {
  // `@import` is a marker the UI resolves, not JavaScript — the sandbox never sees one.
  vm.runInContext(fs.readFileSync(path.join(LIBS, file), 'utf8').replace(/^@import .*$/gm, ''), ctx);
}

const SCALES = JSON.parse(fs.readFileSync(path.join(__dirname, 'colour-scales.json'), 'utf8'));

const rgb = (hex) => ctx.oklchHexToRgb(hex).map((v) => v * 255);
function channelError(a, b) {
  const x = rgb(a), y = rgb(b);
  return Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2]));
}

/** Exactly what recognition writes into the block, for one set in one model. */
function configFor(steps, hexes, anchor, oklch) {
  const okl = hexes.map(ctx.oklchFromHex);
  const hsl = hexes.map(ctx.oklchHslFromHex);
  const last = hexes.length - 1;
  const anchorAt = (i) => ({
    hue: okl[i].H, chroma: okl[i].C,
    hslHue: hsl[i].H, saturation: hsl[i].C * 100, lightness: hsl[i].L * 100,
  });
  const held = { M: hexes };
  return {
    colorModel: oklch ? 'oklch' : 'hsl',
    steps: steps.join(', '),
    curve: ctx.colorsFitCurve(hexes, true),
    lightness: { bright: okl[0].L * 100, dark: okl[last].L * 100 },
    existing: held,
    modes: [{
      name: 'M',
      curve: ctx.colorsFitCurve(hexes, false),
      chromaCurve: ctx.colorsFitChromaCurve(hexes, true, anchor),
      saturationCurve: ctx.colorsFitChromaCurve(hexes, false, anchor),
      hueCurve: ctx.colorsFitHueCurve(hexes, true, anchor),
      hslHueCurve: ctx.colorsFitHueCurve(hexes, false, anchor),
      // Recognition records the anchor it found, so generation bends where the anchors were read.
      seed: { hex: '', placement: steps[anchor], lock: false },
      bright: anchorAt(0), middle: anchorAt(anchor), dark: anchorAt(last),
    }],
  };
}

function measure(steps, hexes, anchor, oklch) {
  const made = ctx.colorsAlignment(configFor(steps, hexes, anchor, oklch)).modes[0].made;
  const errors = made.rows.map((row, i) => channelError(row.hex, hexes[i]));
  return {
    worst: Math.round(Math.max.apply(null, errors)),
    mean: Math.round(errors.reduce((a, b) => a + b, 0) / errors.length),
    clipped: made.clamped.length,
  };
}

// ---- run ----
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const saveAs = flag('--save');
const compareTo = flag('--vs');

const results = {};
const labels = Object.keys(SCALES);
for (const label of labels) {
  const { steps, hexes } = SCALES[label];
  const anchor = ctx.colorsBestAnchor(hexes, steps);
  results[label] = {
    anchor: steps[anchor],
    hsl: measure(steps, hexes, anchor, false),
    oklch: measure(steps, hexes, anchor, true),
  };
}

const baselinePath = (name) => path.join(__dirname, 'baseline-' + name + '.json');
let baseline = null;
if (compareTo && fs.existsSync(baselinePath(compareTo))) {
  baseline = JSON.parse(fs.readFileSync(baselinePath(compareTo), 'utf8'));
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);
const delta = (now, was) => {
  // `null` when there is no baseline, `undefined` when the baseline predates this set. Both mean nothing
  // to compare against — and `now - null` is `now`, which prints every row as a regression.
  if (was === undefined || was === null) return '';
  const d = now - was;
  return d === 0 ? '   ·' : (d < 0 ? '  ' + d : '  +' + d);
};

console.log('\nworst / mean 8-bit channel from the file  ·  lower is better  ·  limit ' + LIMIT + '\n');
console.log(pad('set', 20), num('anchor', 7), num('HSL', 6), num('mean', 6), num('clip', 5),
  num('OKLCH', 8), num('mean', 6), num('clip', 5));
console.log('-'.repeat(76));

let over = [];
let worstHsl = 0, worstOklch = 0, sumHsl = 0, sumOklch = 0;
for (const label of labels) {
  const r = results[label];
  const was = baseline && baseline[label];
  worstHsl = Math.max(worstHsl, r.hsl.worst);
  worstOklch = Math.max(worstOklch, r.oklch.worst);
  sumHsl += r.hsl.worst; sumOklch += r.oklch.worst;
  if (r.hsl.worst > LIMIT || r.oklch.worst > LIMIT) over.push(label);
  console.log(pad(label, 20), num(r.anchor, 7),
    num(r.hsl.worst, 6) + delta(r.hsl.worst, was && was.hsl.worst),
    num(r.hsl.mean, 6), num(r.hsl.clipped || '', 5),
    num(r.oklch.worst, 8) + delta(r.oklch.worst, was && was.oklch.worst),
    num(r.oklch.mean, 6), num(r.oklch.clipped || '', 5));
}
console.log('-'.repeat(76));
console.log(pad('worst of all', 20), num('', 7), num(worstHsl, 6), num('', 6), num('', 5), num(worstOklch, 8));
console.log(pad('mean of worsts', 20), num('', 7), num(Math.round(sumHsl / labels.length), 6),
  num('', 6), num('', 5), num(Math.round(sumOklch / labels.length), 8));

if (saveAs) {
  fs.writeFileSync(baselinePath(saveAs), JSON.stringify(results, null, 1));
  console.log('\nsaved baseline: ' + path.basename(baselinePath(saveAs)));
}

if (over.length) {
  console.log('\n❌ over the ' + LIMIT + '-level limit: ' + over.join(', '));
  process.exit(1);
}
console.log('\n✅ every set within ' + LIMIT + ' of 255, in both models.');
