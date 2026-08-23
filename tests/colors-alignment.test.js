/**
 * "OKLCH scale not applied" is a **question asked again**, not a flag.
 *
 * Márton's spec, and every consequence in it is a test below: nothing to reset, the HSL round trip works, aligning
 * by hand clears the banner, and a locked-seed mode the panel produced shows nothing.
 *
 * The comparison is against **the config's own output**, not against the shared ladder. Those are different
 * questions and only the first is the right one: Lock seed re-anchors a mode deliberately, so a locked mode is
 * permanently off the shared ladder and a ladder comparison would show a banner that could never clear.
 *
 * One computation feeds the banner and the strips, because they are the same fact at two grains and computing it
 * twice is how they come to disagree.
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

const STEPS = '25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 950';
/** `color - neutral`'s Ash mode, read from the real file. A hand-made ramp that sits on no curve. */
const ASH = ['#FAFAFA', '#F7F8F7', '#F2F3F2', '#E9ECEB', '#DFE2E1', '#D4D9D7', '#C9CFCD', '#B5BAB9',
             '#A0A6A4', '#7C8381', '#5B6262', '#3B4344', '#293033', '#202528', '#151719', '#111517'];

function configFor(existing, extra) {
  const read = ASH.map((hex) => E.oklchFromHex(hex));
  const mid = 7, last = 15;
  return Object.assign({
    colorModel: 'oklch',
    steps: STEPS,
    // OKLCH's curve is the collection's now, one pair of segments in the shared block rather than a single id.
    lower: { family: 'sine', easing: 'inout', amount: 100 },
    upper: { family: 'sine', easing: 'inout', amount: 100 },
    lightness: {
      bright: Math.round(read[0].L * 1000) / 10,
      middle: Math.round(read[mid].L * 1000) / 10,
      dark: Math.round(read[last].L * 1000) / 10,
    },
    modes: [{
      name: 'Ash',
      seed: { hex: '', placement: '', lock: false },
      bright: { hue: Math.round(read[0].H * 10) / 10, chroma: Math.round(read[0].C * 10000) / 10000 },
      middle: { hue: Math.round(read[mid].H * 10) / 10, chroma: Math.round(read[mid].C * 10000) / 10000 },
      dark: { hue: Math.round(read[last].H * 10) / 10, chroma: Math.round(read[last].C * 10000) / 10000 },
    }],
    existing: existing ? { Ash: existing } : undefined,
  }, extra || {});
}

test('the tolerance sits between one 8-bit step and anything visible', () => {
  // 0.005, the number used everywhere else. One byte measures 0.0013–0.0020 in OKLab distance, so this is two
  // to four bytes: above anything rounding produces, far below anything anyone can see.
  assert.equal(E.colorsTolerance(), 0.005);
  const oneByte = [['#FAFAFA', '#F9FAFA'], ['#808080', '#818080'], ['#101010', '#111010']];
  oneByte.forEach(([a, b]) => {
    const d = E.oklchDistance(a, b);
    assert.ok(d > 0.001 && d < 0.0025, a + ' → ' + b + ' measured ' + d.toFixed(5));
    assert.ok(d < E.colorsTolerance(), 'one byte must not trip the tolerance');
  });
  // A hex that cannot be read is never a match.
  assert.equal(E.oklchDistance('#FAFAFA', 'nonsense'), Infinity);
});

test('float noise at the anchors does not raise a banner', () => {
  // `applyEase` overshoots an anchor by 6e-17, so an exact comparison would show a permanent banner on a
  // perfectly applied collection. This is that case: the values are exactly what the config produces.
  const made = E.colorsAlignment(configFor(null));
  const generated = made.modes[0].made.rows.map((r) => r.hex);

  const aligned = E.colorsAlignment(configFor(generated));
  assert.deepEqual(aligned.unapplied, [], 'a collection holding its own output must show no banner');
  assert.deepEqual(aligned.modes[0].changed, []);
  assert.equal(aligned.modes[0].differs, false);
});

test('a hand-made ramp that sits on no curve shows the banner, and names the mode', () => {
  const a = E.colorsAlignment(configFor(ASH));
  assert.deepEqual(a.unapplied, ['Ash']);
  assert.ok(a.modes[0].changed.length > 10,
    'most of a ramp that sits on no curve should differ, got ' + a.modes[0].changed.length);
  // The anchor steps match, because the anchors were read from them — so it is not simply "everything differs".
  const changedSteps = a.modes[0].changed.map((c) => c.step);
  ['25', '300', '950'].forEach((step) => {
    assert.equal(changedSteps.includes(step), false, 'anchor step ' + step + ' should already match');
  });
});

test('the banner names only the modes that differ', () => {
  const config = configFor(ASH);
  const generated = E.colorsAlignment(configFor(null)).modes[0].made.rows.map((r) => r.hex);
  // Two modes, same anchors: one holding the config's output, one holding the file's hand-made values.
  config.modes.push(Object.assign(JSON.parse(JSON.stringify(config.modes[0])), { name: 'Bark' }));
  config.existing = { Ash: generated, Bark: ASH };

  const a = E.colorsAlignment(config);
  assert.deepEqual(a.unapplied, ['Bark'], 'only the mode that differs should be named');

  const html = E.colorsBannerHtml(a, config);
  assert.match(html, /OKLCH scale not applied to Bark\./);
  assert.equal(/Ash/.test(html), false, 'a matching mode must not be named');
  assert.match(html, /Apply OKLCH scale/);
});

test('a locked seed that the panel produced shows no banner', () => {
  // The case that rules out comparing against the shared ladder. Lock seed re-anchors a mode on purpose, so it
  // sits off the shared ladder permanently — and a ladder comparison would show a banner that never clears.
  const locked = configFor(null);
  locked.modes[0].seed = { hex: '#8A918F', placement: '400', lock: true };
  const produced = E.colorsAlignment(locked).modes[0];
  assert.equal(produced.made.reanchored, true, 'the fixture is not actually re-anchored');

  const withValues = configFor(produced.made.rows.map((r) => r.hex));
  withValues.modes[0].seed = { hex: '#8A918F', placement: '400', lock: true };
  const a = E.colorsAlignment(withValues);
  assert.deepEqual(a.unapplied, [], 'a deliberately re-anchored mode is not unapplied');
});

test('there is no stored flag anywhere, and HSL round-trips', () => {
  // Nothing to reset: the same config with different `existing` gives a different answer, every time.
  const generated = E.colorsAlignment(configFor(null)).modes[0].made.rows.map((r) => r.hex);
  assert.deepEqual(E.colorsAlignment(configFor(generated)).unapplied, []);
  assert.deepEqual(E.colorsAlignment(configFor(ASH)).unapplied, ['Ash']);
  assert.deepEqual(E.colorsAlignment(configFor(generated)).unapplied, [],
    'the answer must not stick from the previous call');

  // In HSL there is no banner at all — the shared ladder is not what that model does.
  const hsl = configFor(ASH, { colorModel: 'hsl' });
  assert.equal(E.colorsBannerHtml(E.colorsAlignment(hsl), hsl), '');

  // And a collection the panel has not read makes no claim either way.
  const unread = configFor(null);
  assert.equal(E.colorsBannerHtml(E.colorsAlignment(unread), unread), '');
});

test('the banner and the strip are driven by one comparison', () => {
  // They are the same fact at two grains. The strip is handed the alignment entry rather than recomputing
  // "does this step differ", which is how a summary and a detail come to disagree.
  const a = E.colorsAlignment(configFor(ASH));
  const entry = a.modes[0];
  const html = E.colorsStrip(entry, a.steps);

  // The summary line counts exactly the changed list.
  assert.match(html, new RegExp(entry.changed.length + ' of ' + entry.made.rows.length + ' steps would change'));
  // **The per-step evidence used to be a struck-through old hex, and it is gone** — Márton asked for the
  // caption to be the token and the colour it will be, nothing else. The banner is the surviving observable
  // and the structural assertions below are what actually pin the claim: one comparison, in one place,
  // handed to the strip. Counting struck hexes only ever proved the strip *rendered* the entry it was
  // given, which the summary line proves too.
  assert.equal(html.match(/color-ramp-preview-hex--was/g), null,
    'the old value is back in the caption; the banner already says how much changes');
  assert.equal((html.match(/color-ramp-preview-delta/g) || []).length, 0,
    'the per-step delta is back in the caption');

  const source = fs.readFileSync(path.join(LIBS, '@color-ramp.js'), 'utf8');
  assert.match(source, /function colorsStrip\(entry, steps\)/,
    'the strip takes the alignment entry, not raw values it would have to compare itself');
  assert.equal((source.match(/oklchDistance\(/g) || []).length, 1,
    'the comparison happens in more than one place, so the banner and the strip can disagree');
});

test('a preview slot and its strip agree on a key that survives an unnamed mode', () => {
  // The regression that made the whole colour scale vanish. The slot was keyed by `rowLabel`, which falls back
  // to "Row 1" for an entry with no name, while the preview knew that mode as `""` — so nothing matched and
  // every strip rendered empty. It only worked while the shipped default happened to name its modes, and broke
  // the moment the default became an empty block.
  //
  // An index is the same on both sides whatever the entry is called, so that is the key. Checked at the source
  // on both halves, because the two are in different files and a rename in one is exactly how they drifted.
  const renderer = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');
  const ramp = fs.readFileSync(path.join(LIBS, '@color-ramp.js'), 'utf8');

  assert.match(renderer, /slot\.setAttribute\("data-preview-row", String\(index\)\)/,
    'the slot is no longer keyed by index');
  assert.match(ramp, /data-preview-for="' \+ index \+ '"/,
    'the preview is no longer keyed by index');
  assert.equal(/data-preview-for="' \+ colorsEscapeHtml\(entry\.name\)/.test(ramp), false,
    'the preview is keyed by name again, which fails for an unnamed mode');

  // And the panel-wide part has a key an unnamed mode cannot collide with.
  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  assert.match(ui, /'__panel__'/, 'the section-level slot has no reserved key');
  assert.match(ramp, /data-preview-for="__panel__"/);
});

test('two HSL modes with different lightness generate different ramps', () => {
  // The bug the Lightness and Saturation columns were missing for. HSL has no shared ladder, so
  // `colorsGenerateMode` reads each mode's own `bright/middle/dark.lightness` — fields the config block did
  // not have. Every mode therefore fell through to the same 98/46/4 fallback and produced an identical ramp
  // whatever was typed, which is exactly what the panel showed against the real file: three neutral modes,
  // three identical previews.
  const ctx = load();
  const steps = ['50', '500', '950'];
  const config = { colorModel: 'hsl' };
  const pale = {
    bright: { hue: 200, saturation: 10, lightness: 98 },
    middle: { hue: 200, saturation: 10, lightness: 70 },
    dark: { hue: 200, saturation: 10, lightness: 40 }
  };
  const deep = {
    bright: { hue: 200, saturation: 10, lightness: 60 },
    middle: { hue: 200, saturation: 10, lightness: 30 },
    dark: { hue: 200, saturation: 10, lightness: 4 }
  };

  const a = ctx.colorsGenerateMode(config, pale, steps, null);
  const b = ctx.colorsGenerateMode(config, deep, steps, null);
  const hexes = (made) => made.rows.map((r) => r.hex);
  assert.notDeepEqual(hexes(a), hexes(b),
    'two HSL modes with different lightness still generate the same ramp — the per-mode ladder is not ' +
    'reaching the generator');

  // And the ends are what was asked for, rather than a fallback that happens to differ.
  assert.equal(Math.round(a.ladder[0].L * 100), 98);
  assert.equal(Math.round(b.ladder[0].L * 100), 60);
  assert.equal(Math.round(b.ladder[2].L * 100), 4);

  // Saturation is the HSL spelling of the chroma channel, and 0–100 rather than 0–1.
  const grey = ctx.colorsGenerateMode(config,
    { bright: { hue: 200, saturation: 0, lightness: 98 }, middle: { hue: 200, saturation: 0, lightness: 70 },
      dark: { hue: 200, saturation: 0, lightness: 40 } }, steps, null);
  grey.rows.forEach(function (row) {
    assert.equal(row.hex.slice(1, 3), row.hex.slice(3, 5),
      'saturation 0 did not come out neutral, so the 0–100 conversion is wrong: ' + row.hex);
  });
});

test('Original reproduces a real collection exactly, which is what keeps a load quiet', () => {
  // **Load-bearing, so asserted directly.** The strip is silent on a fresh load only because a mode read out
  // of a file arrives on Original and Original generates exactly what the file holds. That began as a
  // nicety; deleting the `untouched` flag made it the mechanism. So this checks the hexes against a real
  // collection rather than inferring it from an empty strip — an empty strip has several causes and only
  // one of them is this.
  //
  // The values are `color - neutral`'s Ash mode, read out of the file: sixteen steps, hand-made, sitting on
  // no curve this panel offers (the closest is 10.4% out at the worst step, against a 0.5% tolerance).
  const ctx = load();
  const steps = ['25', '50', '75', '100', '150', '200', '250', '300',
    '350', '400', '500', '600', '700', '800', '900', '950'];
  const ash = ['#FAFAFA', '#F7F8F7', '#F2F3F2', '#E9ECEB', '#DFE2E1', '#D4D9D7', '#C9CFCD', '#B5BAB9',
    '#A0A6A4', '#7C8381', '#5B6262', '#3B4344', '#293033', '#202528', '#151719', '#111517'];

  const config = {
    colorModel: 'hsl',
    steps: steps.join(', '),
    existing: { Ash: ash },
    modes: [{
      name: 'Ash', lower: { family: 'original' }, upper: { family: 'original' },
      bright: { hslHue: 0, saturation: 0, lightness: 98 },
      middle: { hslHue: 168, saturation: 3.5, lightness: 72 },
      dark: { hslHue: 200, saturation: 15, lightness: 7.8 }
    }]
  };

  const made = ctx.colorsAlignment(config);
  assert.deepEqual(made.modes[0].made.rows.map((r) => r.hex), ash,
    'Original no longer reproduces the file, so a fresh load will open by proposing changes');
  assert.deepEqual(made.modes[0].changed, []);

  // Derived, not stored: the quiet strip is a consequence of nothing differing, and it says nothing.
  const strip = ctx.colorsStrip(made.modes[0], made.steps);
  assert.equal(/steps would change/.test(strip), false);
  assert.equal(/color-ramp-preview-hex--was/.test(strip), false);
  assert.equal(/color-ramp-preview-caption/.test(strip), false, 'a caption appeared with nothing to report');

  // And the same anchors on a real curve do differ — proof the fixture is not quiet by accident.
  const linear = ctx.colorsAlignment(Object.assign({}, config, {
    modes: [Object.assign({}, config.modes[0], { lower: { family: 'linear' }, upper: { family: 'linear' } })]
  }));
  assert.ok(linear.modes[0].changed.length > 10,
    'this ramp sits on a curve after all — the fixture no longer demonstrates anything');
});

test('Original is the file\'s ramp, and picking a curve replaces it', () => {
  // HSL keeps a curve per mode, and a collection read out of a file was made by a person rather than by a
  // curve: measured against `color - neutral`, the closest curve on offer is 8–10% out at the worst step
  // where the tolerance is 0.5%. So the honest value for a freshly read mode is not the nearest curve, it is
  // *no curve* — otherwise loading opens by proposing to rewrite every interior step.
  const ctx = load();
  const steps = ['50', '300', '950'];
  const hexes = ['#FAFAFA', '#7C8381', '#111517'];
  const existing = { Ash: hexes };
  const anchors = {
    bright: { hue: 168, saturation: 3, lightness: 98 },
    middle: { hue: 168, saturation: 3, lightness: 45 },
    dark: { hue: 200, saturation: 15, lightness: 7 }
  };

  const original = ctx.colorsAlignment({
    colorModel: 'hsl', steps: steps.join(', '), existing,
    modes: [Object.assign({ name: 'Ash', lower: { family: 'original' }, upper: { family: 'original' } }, anchors)]
  });
  assert.deepEqual(original.modes[0].made.rows.map((r) => r.hex), hexes,
    'Original did not reproduce the file');
  assert.deepEqual(original.modes[0].changed, [], 'Original still reports steps as changing');
  assert.equal(original.unapplied.length, 0, 'and the banner would still name this mode');

  // A real curve regenerates, and now it differs — which is the point of choosing one.
  const linear = ctx.colorsAlignment({
    colorModel: 'hsl', steps: steps.join(', '), existing,
    modes: [Object.assign({ name: 'Ash', lower: { family: 'linear' }, upper: { family: 'linear' } }, anchors)]
  });
  assert.ok(linear.modes[0].changed.length > 0, 'picking a curve changed nothing');

  // Original with nothing read is meaningless, so it falls through to generating rather than drawing blanks.
  const nothing = ctx.colorsAlignment({
    colorModel: 'hsl', steps: steps.join(', '),
    modes: [Object.assign({ name: 'Ash', lower: { family: 'original' }, upper: { family: 'original' } }, anchors)]
  });
  assert.equal(nothing.modes[0].made.rows.length, steps.length);
  assert.ok(nothing.modes[0].made.rows.every((r) => /^#[0-9A-F]{6}$/.test(r.hex)),
    'Original with no file values produced something that is not a colour');
});

test('a mode on Original keeps the file, and any curve at all replaces it', () => {
  // The two halves are set separately, so one may be what the file holds while the other is generated. That
  // is a state the design allows — the pair defaults to the same value and behaves as one control until
  // deliberately split — and the strip has to draw it honestly rather than picking one of the two.
  const ctx = load();
  const steps = ['25', '50', '75', '100', '150', '200', '250', '300',
    '350', '400', '500', '600', '700', '800', '900', '950'];
  const ash = ['#FAFAFA', '#F7F8F7', '#F2F3F2', '#E9ECEB', '#DFE2E1', '#D4D9D7', '#C9CFCD', '#B5BAB9',
    '#A0A6A4', '#7C8381', '#5B6262', '#3B4344', '#293033', '#202528', '#151719', '#111517'];
  const anchors = {
    bright: { hslHue: 0, saturation: 0, lightness: 98 },
    middle: { hslHue: 168, saturation: 3.5, lightness: 72 },
    dark: { hslHue: 200, saturation: 15, lightness: 7.8 }
  };
  const base = { colorModel: 'hsl', steps: steps.join(', '), existing: { Ash: ash } };
  const modeWith = (lower, upper) => [Object.assign({
    name: 'Ash', lower: { family: lower, easing: 'inout' }, upper: { family: upper, easing: 'inout' }
  }, anchors)];

  // Both Original — the file, exactly, which is what keeps a fresh load quiet.
  const both = ctx.colorsAlignment(Object.assign({}, base, { modes: modeWith('original', 'original') }));
  assert.deepEqual(both.modes[0].made.rows.map((r) => r.hex), ash);
  assert.deepEqual(both.modes[0].changed, []);

  // **Half-Original is gone, deliberately.** The old model let *lower* be a curve while *upper* was still
  // the file's own steps, which one curve cannot express: a curve is Original — no coordinates at all — or
  // it is a shape that spans every step. So a legacy config with one half on a curve generates the whole
  // ramp, treating the Original half as linear, rather than leaving part of the file behind.
  const split = ctx.colorsAlignment(Object.assign({}, base, { modes: modeWith('sine', 'original') }));
  const rows = split.modes[0].made.rows;
  assert.equal(split.modes[0].made.original, false, 'one half on a curve still counted as Original');
  const untouched = rows.filter((r, i) => r.hex === ash[i]).length;
  assert.ok(untouched < rows.length, 'a curve on one half changed nothing at all');
  assert.ok(split.modes[0].changed.length > 0, 'the ramp was not regenerated by its curve');

  // Easing still reaches the ladder — the join carries it, so the pair's shape is not flattened on the way in.
  const easeIn = ctx.colorsAlignment(Object.assign({}, base, {
    modes: [Object.assign({ name: 'Ash', lower: { family: 'sine', easing: 'in' },
      upper: { family: 'sine', easing: 'in' } }, anchors)]
  }));
  assert.notDeepEqual(easeIn.modes[0].made.rows.map((r) => r.hex), rows.map((r) => r.hex),
    'easeIn and easeInOut produced the same ramp — the easing is not reaching the ladder');
});

test('the ladder and the ramp kink at the same step when placement moves the middle', () => {
  // `base` was built before the placement was known, so it used `oklchLadder`'s own default middle —
  // `floor(last/2)` — while `oklchRamp` interpolates hue and chroma around `placementIndex`. Set *Token
  // placement* to anything but the auto middle and the lightness turned its corner at one step while the
  // colour turned it at another: one config, a ramp that goes pale in one place and grey in another.
  const ctx = load();
  const steps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  const mode = {
    name: 'M', seed: { hex: '', placement: '700', lock: false },
    lower: { family: 'sine', easing: 'in' }, upper: { family: 'sine', easing: 'out' },
    bright: { hslHue: 100, saturation: 60, lightness: 98 },
    middle: { hslHue: 110, saturation: 20, lightness: 50 },
    dark: { hslHue: 140, saturation: 35, lightness: 5 }
  };
  const made = ctx.colorsGenerateMode({ colorModel: 'hsl' }, mode, steps, null);

  assert.equal(made.placementIndex, 7, 'the placement did not land on step 700');
  assert.notEqual(made.placementIndex, Math.floor((steps.length - 1) / 2),
    'the fixture placement equals the auto middle, so it cannot show the bug');

  // The Middle anchor is *at* the placed step, exactly — that is what makes it an anchor.
  assert.equal(Math.round(made.rows[7].L * 1000) / 10, 50.0);

  // And the colour turns its corner at the same step: saturation falls to the middle anchor and rises after.
  const sat = made.rows.map((r) => r.C);
  for (let i = 1; i <= 7; i++) {
    assert.ok(sat[i] <= sat[i - 1] + 1e-9, 'saturation rose before the middle, at step ' + steps[i]);
  }
  for (let i = 8; i < sat.length; i++) {
    assert.ok(sat[i] >= sat[i - 1] - 1e-9, 'saturation fell after the middle, at step ' + steps[i]);
  }
  assert.equal(Math.round(sat[7] * 1000) / 10, 20.0, 'the middle step is not the middle saturation anchor');
});

test('the lightness gap is measured in the ramp\'s own model', () => {
  // `colorsStrip` worked the gap out itself with `oklchFromHex`, while `row.L` is whichever lightness the
  // mode's model produced. In HSL that subtracted an HSL lightness from a perceptual OKLCH one, and on a mid
  // green those differ by 7–12 points *by unit alone* — the column read −14 where the true gap was −4. The
  // unit offset is always positive, so every step reported as getting darker even where a run would have
  // lightened it. Márton: "I have been rejecting curves on a bad number."
  const ctx = load();
  const steps = ['50', '300', '950'];
  const file = ['#F8FDF5', '#ADC3A6', '#0B1710'];
  const mode = {
    name: 'M', lower: { family: 'sine', easing: 'in' }, upper: { family: 'sine', easing: 'out' },
    bright: { hslHue: 97.5, saturation: 66.7, lightness: 97.6 },
    middle: { hslHue: 105.5, saturation: 19.5, lightness: 70.8 },
    dark: { hslHue: 145, saturation: 35.3, lightness: 6.7 },
    hue: { bright: 97.5, middle: 105.5, dark: 145 },
    chroma: { bright: 0.01, middle: 0.03, dark: 0.02 }
  };

  ['hsl', 'oklch'].forEach((model) => {
    const out = ctx.colorsAlignment({
      colorModel: model, steps: steps.join(', '), existing: { M: file }, modes: [mode]
    });
    const readL = model === 'hsl' ? ctx.oklchHslFromHex : ctx.oklchFromHex;
    out.modes[0].changed.forEach((c) => {
      assert.equal(typeof c.dL, 'number', model + ': the gap is not measured with the comparison');
      // Against the *hex*, so this carries 8-bit rounding — the code measures from the ladder's float. A
      // point of slack absorbs that and still catches a unit mismatch, which was 7 to 12 points.
      const expected = readL(c.was).L - readL(c.now).L;
      assert.ok(Math.abs(c.dL - expected) < 0.01,
        model + ' step ' + c.step + ': gap is ' + (c.dL * 100).toFixed(1) +
        ' but this model says ' + (expected * 100).toFixed(1) + ' — two lightness scales are being mixed');
      // And it is not the cross-model figure, which is what shipped.
      const crossed = ctx.oklchFromHex(c.was).L - readL(c.now).L;
      if (model === 'hsl' && Math.abs(crossed - expected) > 0.01) {
        assert.ok(Math.abs(c.dL - crossed) > 0.005, 'the cross-model subtraction is back');
      }
    });
  });

  // The strip prints what the comparison measured rather than working it out again.
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@color-ramp.js'), 'utf8');
  const strip = src.slice(src.indexOf('function colorsStrip('), src.indexOf('function colorsBannerHtml('));
  assert.equal(/oklchFromHex\(change\.was\)/.test(strip), false,
    'colorsStrip reads the file value itself again — that is where the mixed units came from');
  assert.match(strip, /change\.dL/);
});

test('the curve is the collection\'s in OKLCH and the mode\'s in HSL', () => {
  // Márton: switching to OKLCH "keeps the individual curves, but they do nothing". It was worse than useless —
  // the per-mode rows still rendered while the generator read a separate shared field, so the panel showed
  // controls that drove nothing. OKLCH shares one ladder across every mode, so its curve belongs to the
  // collection — **one curve for every mode** — while HSL keeps one per mode. Same control, same maths,
  // a different owner.
  const ctx = load();
  const steps = ['50', '300', '950'];
  const anchors = {
    bright: { hue: 100, chroma: 0.01, hslHue: 100, saturation: 20, lightness: 98 },
    middle: { hue: 110, chroma: 0.05, hslHue: 110, saturation: 30, lightness: 50 },
    dark: { hue: 140, chroma: 0.02, hslHue: 140, saturation: 40, lightness: 5 }
  };
  // **Written in the old `{ family, easing, amount }` shape on purpose.** The panel stores coordinates now,
  // but a config saved before the curve editor still has to generate what it always generated — and this is
  // the only test that exercises the conversion inside a real read. The coordinate form is checked below.
  const straight = { family: 'linear', easing: 'inout', amount: 100 };
  const curved = { family: 'circ', easing: 'in', amount: 100 };
  const straightPoints = ctx.bezierFromEase('linear', 'none', 1);
  const curvedPoints = ctx.bezierFromEase('circ', 'in', 1);

  const L = { bright: 0.98, middle: 0.5, dark: 0.05 };
  const joinAt = (c) => ctx.bezierJoin(c, c, ctx.colorsMidIndex(steps) / (steps.length - 1),
    (L.middle - L.bright) / (L.dark - L.bright));

  // OKLCH reads the curve from the config and ignores whatever a mode carries.
  const shared = ctx.colorsCurve(
    { lower: curved, upper: curved }, Object.assign({ lower: straight, upper: straight }, anchors),
    true, steps, L);
  assert.deepEqual(shared.curve, joinAt(curvedPoints), 'OKLCH is not reading the shared block');

  // HSL reads the mode and ignores the shared block.
  const own = ctx.colorsCurve(
    { lower: curved, upper: curved }, Object.assign({ lower: straight, upper: straight }, anchors),
    false, steps, L);
  assert.deepEqual(own.curve, joinAt(straightPoints), 'HSL is not reading the mode');

  // **The shape the panel writes today: one `curve`, used exactly as given.** A single key, so there is no
  // pair to join and nothing to decide — `[]` is *Original*, anything else is the curve.
  const dragged = [0.9, 0.05, 0.1, 0.95];
  const direct = ctx.colorsCurve({ curve: dragged }, { curve: [] }, true, steps, L);
  assert.deepEqual(direct.curve, dragged, 'a dragged curve was not used as written');
  assert.equal(direct.original, false);
  const blank = ctx.colorsCurve({ curve: [] }, { curve: dragged }, true, steps, L);
  assert.deepEqual(blank.curve, [], 'an empty curve is not Original');
  assert.equal(blank.original, true);

  // A legacy pair joins into the curve it always described, rather than being read as two.
  const joined = ctx.colorsCurve({ lower: curved, upper: straight }, {}, true, steps, L);
  assert.equal(joined.curve.length, 10, 'a joined pair is one curve with a middle anchor');
  assert.equal(joined.original, false);

  // A shared Original puts every mode on the file's own steps at once — which is what makes an OKLCH load
  // as quiet as an HSL one.
  const file = { A: ['#FAFAFA', '#7C8381', '#111517'], B: ['#F8FDF5', '#ADC3A6', '#0B1710'] };
  const quiet = ctx.colorsAlignment({
    colorModel: 'oklch', steps: steps.join(', '), existing: file,
    lightness: { bright: 98, middle: 50, dark: 5 },
    lower: { family: 'original', easing: 'inout', amount: 100 },
    upper: { family: 'original', easing: 'inout', amount: 100 },
    modes: [Object.assign({ name: 'A' }, anchors), Object.assign({ name: 'B' }, anchors)]
  });
  assert.deepEqual(quiet.modes.map((m) => m.changed.length), [0, 0],
    'a shared Original still reports changes');
  assert.deepEqual(quiet.modes[0].made.rows.map((r) => r.hex), file.A);
  assert.deepEqual(quiet.modes[1].made.rows.map((r) => r.hex), file.B,
    'the second mode did not get its own file values from a collection-scope Original');
  assert.deepEqual(quiet.unapplied, [], 'the banner fires on a collection that matches its file');

  // And choosing a real curve on the collection moves every mode off it.
  const applied = ctx.colorsAlignment({
    colorModel: 'oklch', steps: steps.join(', '), existing: file,
    lightness: { bright: 98, middle: 50, dark: 5 },
    lower: curved, upper: curved,
    modes: [Object.assign({ name: 'A' }, anchors), Object.assign({ name: 'B' }, anchors)]
  });
  assert.ok(applied.modes[0].changed.length > 0 && applied.modes[1].changed.length > 0,
    'the shared curve reached neither mode');
});

// ============================================================
// Chroma runs on a schedule of its own
// ============================================================

test('a fitted chroma curve brings the colour back as close as the lightness', () => {
  // **The asymmetry this closes.** Lightness was fitted to every step and came back within a point, while
  // chroma was rebuilt by interpolating three anchors on the *lightness* curve's schedule — so the colour
  // was paced by the ladder rather than by itself. Measured on Tailwind blue that was 0.068 out at the most
  // saturated step: a third less colourful than the file, and the largest single error in a read.
  //
  // These are the numbers the recogniser is trusted on. Chroma is not monotone, so it cannot be one curve
  // across the range — but each *half* is, and two half-fits joined at the peak is exactly the three-anchor
  // curve the lightness editor already draws.
  const ctx = load();
  const steps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  const SETS = {
    blue: ['#EFF6FF', '#DBEAFE', '#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6',
           '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A', '#172554'],
    teal: ['#F0FDFA', '#CCFBF1', '#99F6E4', '#5EEAD4', '#2DD4BF', '#14B8A6',
           '#0D9488', '#0F766E', '#115E59', '#134E4A', '#042F2E'],
    amber: ['#FFFBEB', '#FEF3C7', '#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B',
            '#D97706', '#B45309', '#92400E', '#78350F', '#451A03'],
  };

  for (const [name, hexes] of Object.entries(SETS)) {
    const file = hexes.map((h) => ctx.oklchFromHex(h));
    const last = file.length - 1;
    let peak = 1;
    for (let i = 2; i < last; i++) if (file[i].C > file[peak].C) peak = i;

    const lightness = ctx.colorsFitCurve(hexes, true);
    const chroma = ctx.colorsFitChromaCurve(hexes, true, peak);
    assert.equal(chroma.length, 10, name + ': the chroma fit is two halves joined at the peak');

    const ladder = ctx.oklchLadder(
      { bright: file[0].L, middle: file[peak].L, dark: file[last].L }, lightness, steps);
    const spec = {
      steps: steps, ladder: ladder, curve: lightness, middleIndex: peak, model: 'oklch',
      hue: { bright: file[0].H, middle: file[peak].H, dark: file[last].H },
      chroma: { bright: file[0].C, middle: file[peak].C, dark: file[last].C },
    };
    const without = ctx.oklchRamp(spec);
    const withIt = ctx.oklchRamp(Object.assign({}, spec, { chromaCurve: chroma }));
    const worst = (rows) => Math.max.apply(null, rows.map((r, i) => Math.abs(r.C - file[i].C)));

    assert.ok(worst(withIt) < 0.01,
      name + ': chroma is ' + worst(withIt).toFixed(3) + ' out, over the 0.01 the recogniser claims');
    assert.ok(worst(withIt) < worst(without) / 3,
      name + ': the curve barely improved on no curve (' + worst(without).toFixed(3) +
      ' → ' + worst(withIt).toFixed(3) + ')');
  }
});

test('a neutral gets no chroma curve, because it has no chroma to shape', () => {
  // Dividing a half's span out of a ramp that barely moves turns rounding into a curve. The same threshold
  // the hue reader uses: below it, one 8-bit step moves the value by more than the steps differ.
  const ctx = load();
  const zinc = ['#FAFAFA', '#F4F4F5', '#E4E4E7', '#D4D4D8', '#A1A1AA', '#71717A',
                '#52525B', '#3F3F46', '#27272A', '#18181B', '#09090B'];
  assert.deepEqual(ctx.colorsFitChromaCurve(zinc, true, 5), [],
    'a near-grey was given a chroma curve fitted to rounding');
  assert.deepEqual(ctx.colorsFitChromaCurve(['#000', '#888', '#fff'], true, 1), [],
    'three steps is not enough to fit two halves');
});

test('no chroma curve leaves the ramp exactly as it was', () => {
  // The whole feature has to be inert when absent, or every ramp made before it shifts underneath.
  const ctx = load();
  const steps = ['50', '300', '500', '700', '950'];
  const ladder = ctx.oklchLadder({ bright: 0.97, middle: 0.6, dark: 0.2 },
    ctx.bezierFromEase('sine', 'inout', 1), steps);
  const spec = {
    steps: steps, ladder: ladder, curve: ctx.bezierFromEase('sine', 'inout', 1),
    middleIndex: 2, model: 'oklch',
    hue: { bright: 250, middle: 255, dark: 260 },
    chroma: { bright: 0.02, middle: 0.18, dark: 0.09 },
  };
  const bare = ctx.oklchRamp(spec).map((r) => r.hex);
  for (const absent of [undefined, null, []]) {
    assert.deepEqual(ctx.oklchRamp(Object.assign({}, spec, { chromaCurve: absent })).map((r) => r.hex),
      bare, 'an absent chroma curve changed the ramp');
  }
});

// ============================================================
// The anchor search, on input that is not a well-made ramp
// ============================================================

test('the anchor search survives degenerate input and always answers with a usable index', () => {
  // It runs on whatever a collection happens to contain, which is not always sixteen well-spaced colours:
  // a two-token set, a group of identical greys, a variable that failed to read. Every one of these
  // returned an index that something later uses to subscript an array, so "does not throw" is not enough —
  // it has to be in range.
  const ctx = load();
  const cases = [
    ['nothing', [], []],
    ['one step', ['500'], ['#888888']],
    ['two steps', ['50', '950'], ['#FFFFFF', '#000000']],
    ['three steps', ['50', '500', '950'], ['#FFFFFF', '#888888', '#000000']],
    ['all identical', ['a', 'b', 'c', 'd', 'e', 'f'], new Array(6).fill('#7F7F7F')],
    ['an unreadable hex', ['1', '2', '3', '4', '5', '6'],
      ['#FFFFFF', 'not-a-colour', '#888888', '#666666', '#333333', '#000000']],
    ['more hexes than steps', ['1', '2', '3'], ['#FFF', '#888', '#000', '#111']],
  ];
  for (const [name, steps, hexes] of cases) {
    const at = ctx.colorsBestAnchor(hexes, steps);
    assert.equal(typeof at, 'number', name + ': the anchor is not a number');
    assert.ok(isFinite(at), name + ': the anchor is not finite');
    assert.ok(at >= 0, name + ': the anchor is negative — ' + at);
    if (steps.length) assert.ok(at < steps.length, name + ': the anchor is past the end — ' + at);
  }

  // An empty list has no middle, and -1 is not an index anything can use.
  assert.equal(ctx.colorsMidIndex([]), 0);
  assert.equal(ctx.colorsMidIndex(['only']), 0);
});

test('the search stays bounded on a long ramp', () => {
  // Every candidate generates the whole ramp twice and every fit measures error across it, so trying each
  // step is quadratic: a 64-step scale is not absurd and was taking seconds. The candidate list is sampled
  // and then refined around the winner, which finds the same step on anything smooth.
  const ctx = load();
  const n = 64;
  const steps = [], hexes = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    steps.push(String(i));
    hexes.push(ctx.oklchToHex(0.97 - 0.9 * Math.pow(t, 1.4), 0.02 + 0.18 * Math.sin(Math.PI * t),
      250 + 20 * t).hex);
  }
  const started = Date.now();
  const at = ctx.colorsBestAnchor(hexes, steps);
  const took = Date.now() - started;

  assert.ok(at > 0 && at < n - 1, 'the anchor landed on an end of a 64-step ramp');
  // Generous, because this is a floor against the quadratic version rather than a performance target:
  // unbounded it was over 5 seconds here, bounded it is well under one.
  assert.ok(took < 4000, 'the search took ' + took + 'ms on 64 steps — the candidate list is unbounded again');
});

test('the strip says how far a change is, not only how many steps it touches', () => {
  // **A count on its own reads as an alarm.** Since a read started reproducing the file closely, an
  // untouched collection reports ten of sixteen steps "changed" — every one of them by a handful of levels
  // out of 255. That number sent us hunting for a generator bug more than once. The distance is what
  // decides whether to care.
  const ctx = load();
  const rows = [{ step: '50', hex: '#FAFAFA' }, { step: '500', hex: '#71717A' }, { step: '950', hex: '#09090B' }];

  // A rounding-sized difference is named as one rather than dressed up as a change.
  const tiny = ctx.colorsChangeCaption(
    { changed: [{ index: 1, was: '#71717B' }] }, { rows: rows });
  assert.match(tiny, /less than one visible step/, 'a one-level difference is reported as a change');
  assert.match(tiny, /1 of 3 steps/, 'the count went missing');

  // A real one leads with how far.
  const real = ctx.colorsChangeCaption(
    { changed: [{ index: 1, was: '#71717A' }, { index: 2, was: '#2A2A2E' }] }, { rows: rows });
  assert.match(real, /2 of 3 steps would change/);
  assert.match(real, /by up to \d+ of 255/, 'the distance is missing — the count alone is the old bug');

  // The number is the worst channel across every changed step, not the first or the average.
  const worst = parseInt(/by up to (\d+) of 255/.exec(real)[1], 10);
  const dist = (a, b) => {
    const x = ctx.oklchHexToRgb(a), y = ctx.oklchHexToRgb(b);
    return Math.round(255 * Math.max(Math.abs(x[0]-y[0]), Math.abs(x[1]-y[1]), Math.abs(x[2]-y[2])));
  };
  assert.equal(worst, Math.max(dist('#71717A', '#71717A'), dist('#09090B', '#2A2A2E')));
});
