/**
 * Seed → full scale + N-step naming (tints.dev-shaped apply; CodeFig maths).
 *
 * Entering a seed hex must rewrite bright/middle/dark H+C(+L) and Linear curves, not only middle.
 * Lock pins the exact seed hex at the placement step. Step names on the 50…950 rail are labels only.
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

const STEPS_11 = E.colorsPlaceholderSteps();

function blankMode(name) {
  return {
    name: name || 'Blue',
    curve: [],
    chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],
    seed: { hex: '', placement: '', lock: false },
    bright: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 98 },
    middle: { hue: 0, hslHue: 0, chroma: 0, saturation: 0 },
    dark: { hue: 0, hslHue: 0, chroma: 0, saturation: 0, lightness: 4 }
  };
}

function baseConfig(extra) {
  return Object.assign({
    colorModel: 'oklch',
    steps: STEPS_11.join(', '),
    curve: [],
    lightness: { bright: 98.5, dark: 15 },
    modes: [blankMode('Blue'), blankMode('Green')],
  }, extra || {});
}

test('colorsMaterialiseStepNames: N=11 is the exact Tailwind list', () => {
  assert.deepEqual(E.colorsMaterialiseStepNames(11), STEPS_11);
  assert.deepEqual(E.colorsMaterialiseStepNames(11), E.colorsPlaceholderSteps());
});

test('colorsMaterialiseStepNames: half-weighted rail for other N', () => {
  assert.deepEqual(E.colorsMaterialiseStepNames(3), ['50', '500', '950']);
  assert.deepEqual(E.colorsMaterialiseStepNames(5), ['50', '200', '500', '800', '950']);
  assert.equal(E.colorsMaterialiseStepNames(2).length, 0);
  assert.equal(E.colorsMaterialiseStepNames('nope').length, 0);
});

test('colorsSeedPlacementIndex: named, else 500, else mid', () => {
  assert.equal(E.colorsSeedPlacementIndex(STEPS_11, '700'), STEPS_11.indexOf('700'));
  assert.equal(E.colorsSeedPlacementIndex(STEPS_11, ''), STEPS_11.indexOf('500'));
  assert.equal(E.colorsSeedPlacementIndex(STEPS_11, 'auto'), STEPS_11.indexOf('500'));
  assert.equal(E.colorsSeedPlacementIndex(['100', '200', '300'], ''), 1);
});

test('colorsApplySeedScale rewrites the whole mode family from one hex', () => {
  const config = baseConfig();
  const mode = config.modes[0];
  mode.seed.hex = '#3B82F6';
  const r = E.colorsApplySeedScale(config, mode, STEPS_11);
  assert.equal(r.ok, true);
  assert.equal(mode.seed.lock, true);
  assert.equal(mode.seed.placement, '500');

  const seed = E.colorsReadHex('#3B82F6', true);
  assert.ok(Math.abs(mode.middle.hue - seed.H) < 0.2);
  assert.ok(Math.abs(mode.bright.hue - seed.H) < 0.2);
  assert.ok(Math.abs(mode.dark.hue - seed.H) < 0.2);
  assert.ok(mode.middle.chroma > 0.05);
  assert.ok(mode.bright.chroma < mode.middle.chroma);
  assert.ok(mode.dark.chroma < mode.middle.chroma);
  assert.ok(config.lightness.bright > 90);
  assert.ok(config.lightness.dark < 25);

  // Second mode's H/C untouched; shared L ends did update (OKLCH ladder design).
  assert.equal(config.modes[1].middle.chroma, 0);
  assert.equal(config.modes[1].middle.hue, 0);
  assert.equal(config.modes[1].bright.hue, 0);
  assert.equal(config.modes[1].dark.hue, 0);
});

test('seed apply then generate: locked step matches the seed hex exactly', () => {
  const config = baseConfig();
  const mode = config.modes[0];
  mode.seed.hex = '#3B82F6';
  E.colorsApplySeedScale(config, mode, STEPS_11);

  const made = E.colorsGenerateMode(config, mode, STEPS_11, null);
  const idx = made.placementIndex;
  assert.equal(made.seedState, 'locked');
  assert.equal(made.rows[idx].hex.toLowerCase(), E.oklchNormaliseHex('#3B82F6').toLowerCase());

  // Whole strip is coloured — not greyscale zeros from unset middle anchors.
  assert.ok(made.rows.filter((row) => row.C > 0.01).length >= 8);
  const seedH = made.rows[idx].H;
  made.rows.forEach((row) => {
    const short = Math.min((row.H - seedH + 360) % 360, (seedH - row.H + 360) % 360);
    assert.ok(short < 25, 'step ' + row.step + ' hue ' + row.H + ' vs seed ' + seedH);
  });
});

test('lock off: seed step is not force-pinned to the typed hex', () => {
  const config = baseConfig();
  const mode = config.modes[0];
  mode.seed.hex = '#3B82F6';
  E.colorsApplySeedScale(config, mode, STEPS_11);
  mode.seed.lock = false;
  // Bend middle chroma so the authored ladder at 500 differs from the seed.
  mode.middle.chroma = 0.02;

  const made = E.colorsGenerateMode(config, mode, STEPS_11, null);
  assert.notEqual(made.seedState, 'locked');
  assert.notEqual(
    made.rows[made.placementIndex].hex.toLowerCase(),
    E.oklchNormaliseHex('#3B82F6').toLowerCase()
  );
});

test('changing seed hex re-applies a different family', () => {
  const config = baseConfig();
  const mode = config.modes[0];
  mode.seed.hex = '#3B82F6';
  E.colorsApplySeedScale(config, mode, STEPS_11);
  const blueH = mode.middle.hue;

  mode.seed.hex = '#22C55E';
  E.colorsApplySeedScale(config, mode, STEPS_11);
  assert.ok(Math.abs(mode.middle.hue - blueH) > 40);

  const made = E.colorsGenerateMode(config, mode, STEPS_11, null);
  assert.equal(made.rows[made.placementIndex].hex.toLowerCase(),
    E.oklchNormaliseHex('#22C55E').toLowerCase());
});

test('seed apply puts middle sat/chroma on a 10-point curve so the strip peaks at the seed', () => {
  const config = baseConfig({ colorModel: 'hsl' });
  const mode = config.modes[0];
  mode.seed.hex = '#738CF2';
  E.colorsApplySeedScale(config, mode, STEPS_11);

  assert.equal(mode.saturationCurve.length, 10);
  assert.equal(mode.hslHueCurve.length, 10);
  assert.ok(mode.middle.saturation > 40, 'middle sat should be the seed, not cleared');
  assert.ok(mode.middle.hslHue > 0);

  // Without lock, neighbours still follow the tapered middle — not a mute ends-only line.
  mode.seed.lock = false;
  const made = E.colorsGenerateMode(config, mode, STEPS_11, null);
  const mid = made.placementIndex;
  assert.ok(made.rows[mid].C > made.rows[0].C);
  assert.ok(made.rows[mid].C > made.rows[made.rows.length - 1].C);
  // Seed step sat is near the authored middle, not the bright/dark taper alone.
  assert.ok(Math.abs(made.rows[mid].C * 100 - mode.middle.saturation) < 8);
});

test('locked seed sync restores middle anchors and a middle point on four-number curves', () => {
  const config = baseConfig({ colorModel: 'hsl' });
  const mode = config.modes[0];
  mode.seed.hex = '#0B84FF';
  mode.seed.lock = true;
  mode.seed.placement = '500';
  mode.saturationCurve = E.bezierFromEase('sine', 'inout', 1);
  assert.equal(mode.saturationCurve.length, 4, 'easeInOut is one cubic');
  mode.middle.saturation = 10;
  mode.middle.hslHue = 1;

  assert.equal(E.colorsSyncLockedSeedMiddles(config, mode, STEPS_11), true);
  assert.equal(mode.saturationCurve.length, 10, 'lock re-adds a middle point');
  assert.ok(mode.middle.saturation > 40, 'middle sat matches the seed');
  assert.ok(Math.abs(mode.middle.hslHue - 210) < 20, 'middle hue near seed');
});

test('HSL seed apply writes absolute middle.lightness and a 10-point lightness curve', () => {
  const config = baseConfig({ colorModel: 'hsl' });
  const mode = config.modes[0];
  mode.seed.hex = '#0B84FF';
  E.colorsApplySeedScale(config, mode, STEPS_11);
  assert.equal(mode.curve.length, 10, 'lightness chart needs a real middle like Hue/Sat');
  assert.ok(mode.middle.lightness > 40 && mode.middle.lightness < 70,
    'middle L is the seed, not a unit-space remap of the ends');
  const seedL = mode.middle.lightness;
  mode.bright.lightness = 48.4;
  mode.dark.lightness = 15;
  // Sync keeps middle on the seed when lock is on — ends may move freely.
  assert.equal(E.colorsSyncLockedSeedMiddles(config, mode, STEPS_11), false);
  assert.equal(mode.middle.lightness, seedL);
});

test('seed hex without # (and 3-digit) applies the full scale', () => {
  const config = baseConfig({ colorModel: 'hsl' });
  const mode = config.modes[0];
  mode.seed.hex = '738cf2';
  const r = E.colorsApplySeedScale(config, mode, STEPS_11);
  assert.equal(r.ok, true);
  assert.equal(mode.seed.hex.toUpperCase(), '#738CF2');
  assert.ok(mode.middle.saturation > 20);
  assert.ok(mode.middle.hslHue > 0);

  mode.seed.hex = '48f';
  assert.equal(E.colorsApplySeedScale(config, mode, STEPS_11).ok, true);
  assert.match(mode.seed.hex, /^#[0-9A-F]{6}$/i);
});

test('HSL apply writes per-mode lightness and flat hslHue', () => {
  const config = baseConfig({ colorModel: 'hsl' });
  const mode = config.modes[0];
  mode.seed.hex = '#3B82F6';
  const r = E.colorsApplySeedScale(config, mode, STEPS_11);
  assert.equal(r.ok, true);
  assert.ok(mode.middle.saturation > 20);
  assert.ok(mode.bright.lightness > 90);
  assert.ok(mode.dark.lightness < 25);
  assert.equal(mode.bright.hslHue, mode.middle.hslHue);
  assert.equal(mode.dark.hslHue, mode.middle.hslHue);
});
