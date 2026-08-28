/**
 * Pure write-map helpers for Colors — `colorsBuildVariableMap` / `colorsManifestSlice`.
 * No Figma: the Run path's stamp bracket is covered by `npm run test:figma -- foundation-colors-write`.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');
const LIBS = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');

function load() {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, String, Number, Array, Object, JSON, isNaN, isFinite, parseInt, parseFloat, RegExp, Boolean,
  };
  vm.createContext(ctx);
  for (const file of ['@math-helpers.js', '@bezier.js', '@oklch.js', '@color-ramp.js']) {
    const source = fs.readFileSync(path.join(LIBS, file), 'utf8');
    for (const [, code] of resolver.extractFunctionMap(source)) {
      try { vm.runInContext(code, ctx); } catch (e) { /* not reached by this test */ }
    }
  }
  return ctx;
}
const E = load();

function sampleConfig(overrides) {
  return Object.assign({
    collectionName: 'color - lime',
    group: 'lime',
    steps: '50, 500, 900',
    colorModel: 'hsl',
    previewOnly: true,
    existing: { shouldNot: ['#000000'] },
    curve: [0.37, 0, 0.63, 1],
    lightness: { bright: 98, dark: 8 },
    modes: [{
      name: 'Lime',
      curve: [0.37, 0, 0.63, 1],
      chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],
      seed: { hex: '', placement: '', lock: false },
      bright: { hue: 100, hslHue: 100, chroma: 0.12, saturation: 80, lightness: 97 },
      middle: { hue: 100, hslHue: 100, chroma: 0.14, saturation: 70 },
      dark: { hue: 99, hslHue: 99, chroma: 0.05, saturation: 40, lightness: 8 },
    }],
  }, overrides || {});
}

test('colorsBuildVariableMap emits COLOR hexes per step × mode', () => {
  const built = E.colorsBuildVariableMap(sampleConfig());
  assert.deepEqual(built.steps, ['50', '500', '900']);
  assert.deepEqual(built.modeNames, ['Lime']);
  assert.equal(built.names.length, 3);
  assert.ok(built.variables['lime/50']);
  assert.equal(built.variables['lime/50'].type, 'COLOR');
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(built.variables['lime/50'].values.Lime));
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(built.variables['lime/500'].values.Lime));
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(built.variables['lime/900'].values.Lime));
});

test('colorsBuildVariableMap agrees with colorsGenerateMode on every hex', () => {
  const config = sampleConfig();
  const built = E.colorsBuildVariableMap(config);
  const made = E.colorsGenerateMode(config, config.modes[0], built.steps, null);
  built.steps.forEach(function (step, i) {
    assert.equal(
      built.variables['lime/' + step].values.Lime,
      made.rows[i].hex,
      'step ' + step + ' must match the generator the panel uses'
    );
  });
});

test('colorsManifestSlice drops previewOnly and existing, keeps modes', () => {
  const slice = E.colorsManifestSlice(sampleConfig());
  assert.equal(slice.previewOnly, undefined);
  assert.equal(slice.existing, undefined);
  assert.equal(slice.colorModel, 'hsl');
  assert.equal(slice.steps, '50, 500, 900');
  assert.equal(slice.modes.length, 1);
  assert.equal(slice.modes[0].name, 'Lime');
});

test('colorsGroupPrefix matches foundation namePrefix', () => {
  assert.equal(E.colorsGroupPrefix('lime'), 'lime/');
  assert.equal(E.colorsGroupPrefix('Primitives/Neutrals'), 'Primitives/Neutrals/');
  assert.equal(E.colorsGroupPrefix(''), '');
  assert.equal(E.colorsGroupPrefix(null), '');
});

test('switching to OKLCH keeps HSL colour when chroma was never filled', () => {
  // Shipped defaults leave chroma/hue at 0; HSL saturation/hslHue hold the real colour. Generation
  // used to paint a greyscale ladder the moment the model radio flipped — only lightness should move.
  const mode = {
    name: 'Lime',
    bright: { hue: 0, hslHue: 120, chroma: 0, saturation: 80, lightness: 97 },
    middle: { hue: 0, hslHue: 120, chroma: 0, saturation: 70 },
    dark: { hue: 0, hslHue: 120, chroma: 0, saturation: 40, lightness: 8 },
    chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],
    curve: [],
  };
  const steps = ['50', '500', '900'];
  const shared = {
    colorModel: 'oklch',
    steps: steps.join(', '),
    curve: [0.333, 0.333, 0.667, 0.667],
    lightness: { bright: 98, dark: 4 },
  };
  const grey = E.colorsGenerateMode(
    Object.assign({}, shared, {
      // Force the pre-fix path: resolve disabled by giving no sat and no hexes — not under test.
    }),
    {
      name: 'Grey',
      bright: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 97 },
      middle: { hue: 0, hslHue: 0, chroma: 0, saturation: 0 },
      dark: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 8 },
      chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [], curve: [],
    },
    steps,
    null
  );
  assert.ok(grey.rows[1].C < 0.001, 'a true zero-sat mode stays grey');

  const okl = E.colorsGenerateMode(shared, mode, steps, null);
  assert.ok(okl.rows.some(function (r) { return r.C > 0.05; }),
    'borrowed HSL saturation must produce real OKLCH chroma somewhere on the ramp: ' +
    okl.rows.map(function (r) { return r.C; }).join(', '));
  // Roughly green — not the greyscale #727272 the zero-chroma path produced.
  const mid = okl.rows[1].hex.toUpperCase();
  assert.ok(mid[1] !== mid[3] || mid[3] !== mid[5],
    'channels must differ on a green ramp, got ' + mid);
});

test('OKLCH colour falls back to file hexes when both models are empty', () => {
  const mode = {
    name: 'Lime',
    bright: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 97 },
    dark: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 8 },
    chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [], curve: [],
  };
  const steps = ['50', '500', '900'];
  const held = ['#E5FFEC', '#4ADE80', '#001A06'];
  const okl = E.colorsGenerateMode({
    colorModel: 'oklch',
    steps: steps.join(', '),
    curve: [0.333, 0.333, 0.667, 0.667],
    lightness: { bright: 98, dark: 4 },
    existing: { Lime: held },
  }, mode, steps, null);
  assert.ok(okl.rows.some(function (r) { return r.C > 0.05; }),
    'file hexes must supply chroma when anchors are empty: ' +
    okl.rows.map(function (r) { return r.C; }).join(', '));
});

test('a lightness curve keeps the file\'s hue and chroma per step — only L moves', () => {
  /**
   * The model-switch bug: OKLCH shared Linear (not Original) used to re-interpolate colour from
   * three anchors, so Lime-3 went blue and neighbours desaturated while the file was still green.
   * Wrong OKLCH hue anchors must not win when the colour curves are still empty.
   */
  const steps = ['50', '500', '900'];
  const held = ['#E5FFEC', '#4ADE80', '#001A06'];
  const fileMid = E.oklchFromHex(held[1]);
  const mode = {
    name: 'Lime',
    // Deliberately wrong OKLCH colour (blue) — what a cross-model leftover looks like.
    bright: { hue: 250, hslHue: 120, chroma: 0.1, saturation: 80, lightness: 97 },
    middle: { hue: 250, hslHue: 120, chroma: 0.12, saturation: 70 },
    dark: { hue: 250, hslHue: 120, chroma: 0.05, saturation: 40, lightness: 8 },
    chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],
    curve: [],
  };
  const okl = E.colorsGenerateMode({
    colorModel: 'oklch',
    steps: steps.join(', '),
    curve: [0.333, 0.333, 0.667, 0.667],
    lightness: { bright: 98, dark: 4 },
    existing: { Lime: held },
  }, mode, steps, null);

  const mid = okl.rows[1];
  assert.ok(Math.abs(mid.H - fileMid.H) < 1,
    'mid hue must stay the file\'s, got ' + mid.H + ' want ~' + fileMid.H);
  assert.ok(Math.abs(mid.C - fileMid.C) < 0.01,
    'mid chroma must stay the file\'s, got ' + mid.C + ' want ~' + fileMid.C);
  // Lightness came from the ladder, not the file's mid L.
  assert.ok(Math.abs(mid.L - fileMid.L) > 0.02,
    'lightness must have moved off the file onto the shared ladder');
});

test('Original + held keeps file hexes even when end anchors disagree by quantization noise', () => {
  /**
   * Live Lime (H95): recognition wrote hue 131.9 / chroma 0.0221 from float RGB; held `#F6FFF0`
   * reads back 132.5° / 0.0218. The old 0.05° / 0.0005 epsilons marked both channels touched and
   * replaced every mid with the end-chroma ramp (`#D1DFC6`). Empty colour curves + held → file.
   */
  const steps = ['50', '500', '900'];
  const held = ['#F6FFF0', '#57B017', '#0B1A00'];
  const mode = {
    name: 'Lime (H95)',
    bright: { hue: 131.9, chroma: 0.0221, hslHue: 96, saturation: 100, lightness: 97.1 },
    dark: { hue: 132.5, chroma: 0.0544, hslHue: 94.6, saturation: 100, lightness: 5.1 },
    chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],
    curve: [],
  };
  const okl = E.colorsGenerateMode({
    colorModel: 'oklch',
    steps: steps.join(', '),
    curve: [],
    lightness: { bright: 98, dark: 4 },
    existing: { 'Lime (H95)': held },
  }, mode, steps, null);
  assert.equal(okl.rows[1].hex.toUpperCase(), held[1]);
  assert.ok(okl.rows[1].C > 0.1, 'mid must keep the file\'s chroma, got ' + okl.rows[1].C);
});

test('colorsCard labels both halves of a split swatch', () => {
  const html = E.colorsCard('500', '#AABBCC', null, '#112233');
  assert.match(html, /color-ramp-preview-hex--was[^>]*>#112233/);
  assert.match(html, /color-ramp-preview-hex--now[^>]*>#AABBCC/);
  assert.ok(!/color-ramp-preview-pin/.test(html), 'no chroma clamp note under the hex');
  const plain = E.colorsCard('500', '#AABBCC', null, null);
  assert.ok(!/hex--was/.test(plain));
  assert.match(plain, /color-ramp-preview-hex[^>]*>#AABBCC/);
});

test('colorsAnchorStrip places Middle on the curve bend, not a fixed centre', () => {
  const steps = ['50', '100', '200', '300', '400', '500', '600', '700', '800'];
  const made = {
    placementIndex: 4, // list midpoint → 300 — the old fixed spot
    curve: [0.2, 0.2, 0.3, 0.3, 0.75, 0.4, 0.8, 0.8, 0.9, 0.9],
    seed: null,
  };
  const html = E.colorsAnchorStrip(made, steps);
  const kinds = [];
  const re = /color-ramp-preview-anchor--(start|middle|end)|<span><\/span>/g;
  let m;
  while ((m = re.exec(html))) kinds.push(m[1] || 'empty');
  // last=8, round(0.75*8)=6 → column 700, not placementIndex 4 (300)
  assert.equal(kinds.indexOf('middle'), 6, 'got ' + kinds.join(','));
  assert.notEqual(kinds.indexOf('middle'), made.placementIndex);
});

test('OKLCH strips show file/run comparison like HSL when steps differ', () => {
  const steps = ['50', '500', '900'];
  const held = ['#E5FFEC', '#4ADE80', '#001A06'];
  const mode = {
    name: 'Lime',
    // Wrong OKLCH anchors so the run disagrees with the file on the middle step.
    bright: { hue: 250, chroma: 0.1, hslHue: 120, saturation: 80, lightness: 97 },
    middle: { hue: 250, chroma: 0.12, hslHue: 120, saturation: 70 },
    dark: { hue: 250, chroma: 0.05, hslHue: 120, saturation: 40, lightness: 8 },
    chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],
    curve: [],
  };
  const config = {
    collectionName: 'c',
    colorModel: 'oklch',
    steps: steps.join(', '),
    curve: [0.333, 0.333, 0.667, 0.667],
    lightness: { bright: 98, dark: 4 },
    modes: [mode],
    existing: { Lime: held },
  };
  const html = E.colorsPreviewHtml(config, 'color');
  assert.ok(/hex--was/.test(html), 'OKLCH must show the file hex when a step would change');
  assert.ok(/hex--now/.test(html), 'OKLCH must show the new hex under the file hex');
  assert.ok(/linear-gradient/.test(html), 'OKLCH must split the swatch when a step would change');
  assert.ok(!/color-ramp-preview-pin/.test(html), 'no chroma clamp note under each swatch');
});
