/**
 * **User-reported curve flows**, driven end-to-end in Node — drag, zoom, add middle — without
 * Figma or manual reload-and-screenshot. Run alone with `npm run test:curve`.
 *
 * The live plugin can be exercised the same way through the dev bridge:
 *   npm run figma:ui -- dragControl name=c part=0:handle-0 dy=-40
 * (field names differ on the real Colors panel). These tests are the fast gate; bridge drags are
 * for confirming against real collection data when a scenario needs the file.
 */
const test = require('node:test');
const assert = require('node:assert');
const h = require('./curve-harness.js');

const ctx = h.boot();

test('Saturation 100…100: zoom in works before any curve edit and stays near the pin', () => {
  const form = h.mountCurve(ctx, { bright: 100, dark: 100, range: [0, 100] });
  assert.equal(form.view(), '0,100', 'opens on the full channel');
  h.clickZoom(form, 'in');
  const view = form.view();
  assert.ok(view, 'zoom in must latch a window');
  const parts = view.split(',').map(parseFloat);
  assert.ok(parts[1] >= 99, 'pin at 100 must stay in view, got ' + view);
  assert.ok(parts[1] - parts[0] < 100, 'window must narrow, got ' + view);
});

test('Saturation 100…100: dragging an end does not reset the latched zoom window', () => {
  const form = h.mountCurve(ctx, { bright: 100, dark: 100, range: [0, 100] });
  form.wrap.setAttribute('data-curve-view', '0,100');
  h.dragEnd(form, 'to', 10, 30);
  assert.equal(form.view(), '0,100');
});

test('Colors channels label the axis with whole numbers only', () => {
  const form = h.mountCurve(ctx, { bright: 98, dark: 9.6, range: [0, 100] });
  h.tickLabels(form).forEach(function (label) {
    assert.equal(String(parseFloat(label, 10)), label, 'tick must be whole: ' + label);
  });
});

test('Hue 100°…99.2°: shape handles stay visible on the flat Linear preset', () => {
  const form = h.mountCurve(ctx, { bright: 100, dark: 99.2, range: [0, 360] });
  assert.ok(h.handleCount(form) >= 2, 'two-point overshoot must stay draggable');
});

test('Hue equal ends: bending a handle breaks flat display and updates the derived middle readout', () => {
  const form = h.mountCurve(ctx, {
    bright: 100, dark: 100, mid: 0, range: [0, 360],
    curve: [0, 0, 0.333, 0.333, 0.667, 0.667, 1, 1],
  });
  assert.ok(h.pathSpread(form) < 2, 'starts flat');
  h.dragHandle(form, 0, 50, -5);
  form.refresh();
  assert.ok(h.pathSpread(form) > 5, 'bent handle must move the plotted path');
  const mid = form.field('middle');
  assert.equal(mid.value, '', 'no anchor — value field stays empty');
  const est = parseFloat(h.derivedMiddlePlaceholder(form), 10);
  assert.ok(est > 40 && est < 200,
    'derived middle must track the arch, not a stale typed value: ' + mid.placeholder);
  assert.ok(Math.abs(form.points()[3]) > 0.5, 'handle Y must leave the linear preset');
});

test('Hue two-point: dragging a handle must not write cubic-bezier hundreds into storage', () => {
  const form = h.mountCurve(ctx, { bright: 100, dark: 99.2, range: [0, 360] });
  h.dragHandle(form, 1, 50, 0);
  const pts = form.points();
  assert.ok(Math.abs(pts[1]) < 20 && Math.abs(pts[3]) < 20,
    'stored handle Y must stay in a sane overshoot band: ' + JSON.stringify(pts));
});

test('Add middle point splits without moving the visible curve and fills the middle field', () => {
  const form = h.mountCurve(ctx, { bright: 100, dark: 99.2, mid: 0, range: [0, 360] });
  const before = h.pathYs(form).join(',');
  h.clickToggle(form);
  assert.equal(form.points().length, 10);
  const after = h.pathYs(form).join(',');
  assert.equal(before, after, 'split must not jump the drawn path');
  const mid = form.field('middle');
  assert.ok(mid && !mid.disabled, 'middle field must enable');
  assert.ok(String(mid.value).trim() !== '', 'middle field must be filled from the split');
});

test('Zoom cap tightens when a token ramp is present (≈ two step spacings)', () => {
  const form = h.mountCurve(ctx, {
    bright: 100, dark: 83, range: [0, 100],
    ramps: { key: 'c', hexes: h.limeSatRamp() },
  });
  h.clickZoom(form, 'in');
  let view = form.view();
  let span = parseFloat(view.split(',')[1], 10) - parseFloat(view.split(',')[0], 10);
  while (!h.zoomInDisabled(form)) {
    h.clickZoom(form, 'in');
    view = form.view();
    span = parseFloat(view.split(',')[1], 10) - parseFloat(view.split(',')[0], 10);
  }
  assert.ok(span <= 20, 'fully zoomed in should show roughly two step spacings, span=' + span);
  h.tickLabels(form).forEach(function (label) {
    assert.equal(String(parseFloat(label, 10)), label);
  });
});

test('Middle field clears when the anchor is removed', () => {
  const form = h.mountCurve(ctx, {
    bright: 100, dark: 99.2, mid: 200, range: [0, 360],
    curve: ctx.B.bezierWithMiddle([0.37, 0, 0.63, 1], 0.5),
  });
  assert.equal(form.points().length, 10);
  h.clickToggle(form);
  assert.equal(form.points().length, 4);
  const mid = form.field('middle');
  assert.equal(mid.value, '');
  assert.ok(parseFloat(mid.placeholder, 10) > 0);
});

test('Hue: leftover 292° clears from the middle field when there is no anchor', () => {
  const form = h.mountCurve(ctx, {
    bright: 100, dark: 99.2, mid: 292, range: [0, 360],
    curve: [0.37, 0, 0.63, 1],
  });
  const mid = form.field('middle');
  assert.equal(mid.value, '', 'stale 292 must not stay in .value without an anchor');
  const est = parseFloat(mid.placeholder, 10);
  assert.ok(est > 99 && est < 101,
    'placeholder must track the flat curve near 100°, not 292: ' + mid.placeholder);
});

test('Add middle after exploring 292° overwrites the leftover with the split value', () => {
  const form = h.mountCurve(ctx, {
    bright: 100, dark: 99.2, mid: 292, range: [0, 360],
    curve: [0.37, 0, 0.63, 1],
  });
  h.clickToggle(form);
  const mid = form.field('middle');
  const filled = parseFloat(mid.value, 10);
  assert.ok(filled > 99 && filled < 101,
    'split must land near the curve midpoint, not keep 292: ' + mid.value);
  assert.notEqual(filled, 292);
});

test('Lime saturation 100…83…100: the middle dip is visible on the chart', () => {
  const form = h.mountCurve(ctx, {
    bright: 100, dark: 100, mid: 83.2, range: [0, 100],
    curve: ctx.B.bezierWithMiddle([0.4, 0.3, 0.6, 0.7], 0.5),
  });
  assert.ok(h.pathSpread(form) > 10,
    '83% dip must be visible between 100% ends, spread=' + h.pathSpread(form));
  const ys = h.pathYs(form);
  assert.ok(Math.min.apply(null, ys) < 15,
    '100% ends sit near the top of the plot (small y)');
  assert.ok(Math.max.apply(null, ys) > 50,
    '83% dip must pull the path down from the pin');
});

test('Lime saturation: zoom in keeps the 83% dip in view and survives redraw', () => {
  const form = h.mountCurve(ctx, {
    bright: 100, dark: 100, mid: 83.2, range: [0, 100],
    curve: ctx.B.bezierWithMiddle([0.4, 0.3, 0.6, 0.7], 0.5),
  });
  h.clickZoom(form, 'in');
  h.clickZoom(form, 'in');
  const view = form.view();
  const parts = view.split(',').map(parseFloat);
  assert.ok(parts[0] <= 85 && parts[1] >= 80,
    'zoom must frame the ~83% dip, got ' + view);
  form.wrap.setAttribute('data-curve-view', '78,90');
  form.refresh();
  assert.equal(form.view(), '78,90', 'narrow zoom must not reopen wide on redraw');
});

test('Saturation 100…100: two-point overshoot arch works without Add middle', () => {
  const form = h.mountCurve(ctx, { bright: 100, dark: 100, mid: 0, range: [0, 100] });
  assert.ok(h.pathSpread(form) < 2, 'starts flat at the pin');
  h.dragHandle(form, 0, 50, 85);
  form.refresh();
  assert.ok(h.pathSpread(form) > 5,
    'dragging a handle must bend the path below the pin without Add middle');
  assert.equal(form.points().length, 4, 'must stay a two-point curve');
  const pts = form.points();
  assert.ok(Math.abs(pts[1]) < 1 && Math.abs(pts[3]) <= 1,
    'stored handle Y must stay in overshoot band, not channel hundreds: ' + JSON.stringify(pts));
});

test('Hue 100…100: two-point overshoot updates the derived middle, not a stale typed value', () => {
  const form = h.mountCurve(ctx, {
    bright: 100, dark: 100, mid: 292, range: [0, 360],
    curve: [0.37, 0, 0.63, 1],
  });
  h.dragHandle(form, 0, 50, 85);
  form.refresh();
  const mid = form.field('middle');
  assert.equal(mid.value, '', 'no anchor — value stays empty even if 292 was typed before');
  const est = parseFloat(h.derivedMiddlePlaceholder(form), 10);
  assert.ok(est > 105 && est < 200,
    'derived middle must track the bent arch, not 292: ' + mid.placeholder);
});

test('Hue with anchor: typing 293.5° moves the handle to the top of the chart', () => {
  const form = h.mountCurve(ctx, {
    bright: 100, dark: 99.2, mid: 100, range: [0, 360],
    curve: ctx.B.bezierWithMiddle([0.37, 0, 0.63, 1], 0.5),
  });
  const mid = form.field('middle');
  mid.value = '293.5';
  mid.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(mid.value, '293.5', 'typed middle must stick');
  assert.ok(h.middleCy(form) < 30,
    '293.5° must sit near the top of the chart, cy=' + h.middleCy(form));
});

test('Colors @rows Hue: Add middle fills middle.hue through the host callback', () => {
  const form = h.mountColorsHueRow(ctx, {
    bright: 100, dark: 99.2, mid: 0, curve: [0.37, 0, 0.63, 1],
  });
  h.selectPreset(form, 'custom');
  h.clickToggle(form);
  const mid = form.field('middle');
  assert.ok(mid && !mid.disabled);
  const filled = parseFloat(mid.value, 10);
  assert.ok(filled > 99 && filled < 101, 'middle.hue must fill from split: ' + mid.value);
});

test('Hue handle drag: small moves do not jump stored Y into channel hundreds', () => {
  const form = h.mountCurve(ctx, { bright: 100, dark: 99.2, range: [0, 360] });
  const trail = h.dragHandleGradual(form, 0, [50, 45, 40, 35, 30], 30);
  trail.forEach(function (pts, i) {
    assert.ok(Math.abs(pts[1]) < 5 && Math.abs(pts[3]) < 5,
      'step ' + i + ' leaked channel degrees into storage: ' + JSON.stringify(pts));
  });
  assert.ok(!/,\s*1[0-9]{2}[,\s]/.test(h.curveText(form)),
    'text field must not show cubic-bezier hundreds: ' + h.curveText(form));
});

test('Hue handle drag: path moves smoothly without a vertical discontinuity', () => {
  const form = h.mountCurve(ctx, { bright: 100, dark: 100, mid: 0, range: [0, 360] });
  const before = h.pathYs(form).join(',');
  h.dragHandle(form, 0, 50, 40);
  const mid = h.pathYs(form).join(',');
  h.dragHandle(form, 0, 40, 30);
  const after = h.pathYs(form).join(',');
  assert.notEqual(before, mid, 'first nudge must move the path');
  assert.notEqual(mid, after, 'second nudge must move the path again');
  const spread = h.pathSpread(form);
  assert.ok(spread > 2 && spread < 80, 'bend should be visible but not a full-axis spike: ' + spread);
});

test('Linear saturation (`[]`) does not grey out the placement step when middle field is 0', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const resolver = require('../src/import-resolver.js');
  const LIBS = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');
  const vctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, String, Number, Array, Object, JSON, isNaN, isFinite, parseInt, parseFloat, RegExp, Boolean,
  };
  vm.createContext(vctx);
  for (const file of ['@math-helpers.js', '@bezier.js', '@oklch.js', '@color-ramp.js']) {
    const source = fs.readFileSync(path.join(LIBS, file), 'utf8');
    for (const [, code] of resolver.extractFunctionMap(source)) {
      try { vm.runInContext(code, vctx); } catch (e) { /* not reached */ }
    }
  }
  const steps = '25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 950'
    .split(',').map(function (s) { return s.trim(); });
  const mode = {
    name: 'Lime',
    seed: { hex: '', placement: '', lock: false },
    bright: { hslHue: 100, saturation: 100, lightness: 98 },
    middle: { hslHue: 0, saturation: 0, lightness: 50 },
    dark: { hslHue: 99.2, saturation: 98.4, lightness: 5 },
    saturationCurve: [],
    hslHueCurve: [],
  };
  const config = {
    colorModel: 'hsl', steps: steps.join(', '), curve: [],
    lightness: { bright: 98, dark: 5, middle: 50 }, modes: [mode],
  };
  const made = vctx.colorsGenerateMode(config, mode, steps, null);
  const mid = 7;
  assert.ok(made.rows[mid].C > 0.9,
    'placement step must not drop to leftover middle saturation 0: ' + made.rows[mid].C);
  assert.notEqual(made.rows[mid].hex.toLowerCase(), '#999999',
    'must not grey out at the middle marker');
});
