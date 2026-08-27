/**
 * **Drive the curve editor in Node** — pointer gestures against the real `renderer.js` through
 * `dom-shim.js`, the same path `tests/config-ui-curve.test.js` uses. No Figma, no browser, no
 * person clicking. For the live plugin iframe, `npm run figma:ui -- dragControl` exists too; these
 * helpers are the fast loop that should run on every change.
 */
const { loadBezierGlobal } = require('../build-bezier.js');

const PLOT = 100;

/** One-time shim + globals. Returns `{ B, renderer, parser }`. */
function boot() {
  const shim = require('./dom-shim.js');
  const B = loadBezierGlobal();
  shim.install({ CodeFigBezier: B });
  return {
    B,
    renderer: require('../src/config-ui/renderer.js'),
    parser: require('../src/config-ui/parser.js'),
  };
}

/**
 * Mount a bounded `@ends` curve with `@overshoot` — the Colors Hue/Sat/L/C shape.
 *
 * `opts`: `{ bright, dark, mid?, range:[lo,hi], curve?, ramps?: { key, hexes } }`
 */
function mountCurve(ctx, opts) {
  const { renderer, parser } = ctx;
  const hasMid = opts.mid !== undefined;
  const endsSpec = hasMid ? 'a.bright..a.middle..a.dark' : 'a.bright..a.dark';
  const groupFields = hasMid
    ? 'bright:number=B|middle:number=M|dark:number=D'
    : 'bright:number=B|dark:number=D';
  const varsObj = hasMid
    ? `{ bright: ${opts.bright}, middle: ${opts.mid}, dark: ${opts.dark} }`
    : `{ bright: ${opts.bright}, dark: ${opts.dark} }`;
  const source = [
    '// @UI_CONFIG_START',
    `var a = ${varsObj}; // @group: ${groupFields} @label: Ends`,
    'var c = ' + JSON.stringify(opts.curve != null ? opts.curve : [0.37, 0, 0.63, 1]) +
      `; // @curve @ends: ${endsSpec} @range: ${opts.range[0]}..${opts.range[1]} @overshoot @label: C`,
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  var curveField = null;
  for (var ri = 0; ri < schema.rows.length; ri++) {
    if (schema.rows[ri].type === 'field' && schema.rows[ri].inputType === 'curve') {
      curveField = schema.rows[ri];
      break;
    }
  }
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {}, undefined, undefined, undefined,
    function fillMiddleAnchor(scope, wrapEl, detail) {
      if (!curveField || !curveField.ends || !curveField.ends.mid) return;
      var middleInput = scope.querySelector('[data-row-field="' + curveField.ends.mid + '"]');
      if (!middleInput) return;
      var replace = !!(detail && detail.replace);
      if (!replace && String(middleInput.value || '').trim() !== '') return;
      var value = detail && typeof detail.value === 'number' && isFinite(detail.value)
        ? detail.value : null;
      if (value === null) return;
      var rounded = Math.round(value * 10) / 10;
      middleInput.value = String(rounded);
      middleInput.dispatchEvent(new Event('input', { bubbles: true }));
      middleInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
  if (opts.ramps) renderer.setCurveRamps({ [opts.ramps.key]: { hexes: opts.ramps.hexes, seed: -1 } });
  const wrap = container.querySelector('.config-ui-curve');
  const svg = container.querySelector('.config-ui-curve__canvas');
  setPlotBox(svg);
  return {
    container,
    wrap,
    svg,
    points: () => JSON.parse(wrap.getAttribute('data-curve-value')),
    view: () => wrap.getAttribute('data-curve-view'),
    refresh: () => wrap.dispatchEvent(new Event('config-ui-curve-refresh')),
    field: (which) => container.querySelector('[data-row-field="a.' + which + '"]'),
  };
}

function setPlotBox(svg, size) {
  if (!svg) return;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: size || PLOT, height: size || PLOT });
}

/** Full pointer drag on `svg` (or pass `target` for pointerdown). */
function drag(svg, target, moves) {
  const down = moves[0];
  svg.dispatch('pointerdown', {
    target: target,
    clientX: down.x,
    clientY: down.y,
    pointerId: 1,
  });
  for (let i = 1; i < moves.length; i++) {
    svg.dispatch('pointermove', {
      clientX: moves[i].x,
      clientY: moves[i].y,
      pointerId: 1,
    });
  }
  const last = moves[moves.length - 1];
  svg.dispatch('pointerup', { clientX: last.x, clientY: last.y, pointerId: 1 });
}

function dragHandle(form, index, fromY, toY, x) {
  const handle = form.container.querySelector('[data-curve-index="' + index + '"]');
  drag(form.svg, handle, [
    { x: x != null ? x : 30, y: fromY },
    { x: x != null ? x : 30, y: toY },
  ]);
  return form.points();
}

function dragEnd(form, which, fromY, toY) {
  const end = form.container.querySelector('[data-curve-end="' + which + '"]');
  drag(form.svg, end, [
    { x: which === 'from' ? 0 : PLOT, y: fromY },
    { x: which === 'from' ? 0 : PLOT, y: toY },
  ]);
}

function clickZoom(form, dir) {
  const step = form.container.querySelector('[data-curve-zoom="' + dir + '"]');
  step.dispatchEvent(new Event('click', { bubbles: true }));
}

function clickToggle(form) {
  form.container.querySelector('.config-ui-curve__toggle').dispatch('click', { bubbles: true });
}

/** Y coordinates sampled from the rendered path (`d` attribute). */
function pathYs(form) {
  const path = form.container.querySelector('.config-ui-curve__path');
  const ys = [];
  (path && path.getAttribute('d') || '').replace(/[ML]\s*([\d.+-]+)\s+([\d.+-]+)/g, function (_, x, y) {
    ys.push(parseFloat(y, 10));
    return _;
  });
  return ys;
}

function pathSpread(form) {
  const ys = pathYs(form);
  if (!ys.length) return 0;
  return Math.max.apply(null, ys) - Math.min.apply(null, ys);
}

function tickLabels(form) {
  return Array.from(form.container.querySelectorAll('.config-ui-curve__tick')).map(function (el) {
    return el.textContent.trim();
  });
}

function zoomMarkTop(form) {
  const mark = form.container.querySelector('.config-ui-curve__zoom-mark');
  return mark ? parseFloat(mark.style.top, 10) : NaN;
}

function zoomInDisabled(form) {
  const btn = form.container.querySelector('[data-curve-zoom="in"]');
  return btn ? !!btn.disabled : false;
}

function derivedMiddlePlaceholder(form) {
  const mid = form.field('middle');
  return mid ? mid.placeholder : '';
}

function curveText(form) {
  const el = form.container.querySelector('.config-ui-curve__text');
  return el ? el.value : '';
}

/** Drag a handle through several small steps; returns stored points after each step. */
function dragHandleGradual(form, index, ys, x) {
  const handle = form.container.querySelector('[data-curve-index="' + index + '"]');
  const moves = ys.map(function (y, i) { return { x: x != null ? x : 30, y: y }; });
  form.svg.dispatch('pointerdown', {
    target: handle, clientX: moves[0].x, clientY: moves[0].y, pointerId: 1,
  });
  const trail = [form.points().slice()];
  for (let i = 1; i < moves.length; i++) {
    form.svg.dispatch('pointermove', {
      clientX: moves[i].x, clientY: moves[i].y, pointerId: 1,
    });
    trail.push(form.points().slice());
  }
  form.svg.dispatch('pointerup', {
    clientX: moves[moves.length - 1].x, clientY: moves[moves.length - 1].y, pointerId: 1,
  });
  trail.push(form.points().slice());
  return trail;
}

function handleCount(form) {
  return form.container.querySelectorAll('.config-ui-curve__handle').length;
}

function selectPreset(form, value) {
  const preset = form.container.querySelector('.config-ui-curve__preset');
  preset.value = value;
  preset.dispatchEvent(new Event('change', { bubbles: true }));
}

function middleCy(form) {
  const handle = form.container.querySelector('[data-curve-index="4"]');
  return handle ? parseFloat(handle.getAttribute('cy'), 10) : NaN;
}

/** Mount a Colors-like `@rows` Hue row — same cell names as the live panel. */
function mountColorsHueRow(ctx, opts) {
  const { renderer, parser } = ctx;
  const curve = opts.curve != null ? opts.curve : [];
  const source = [
    '// @UI_CONFIG_START',
    'var modes = [{ name: "G", hueCurve: ' + JSON.stringify(curve) + ', ' +
      'bright: { hue: ' + opts.bright + ' }, middle: { hue: ' + (opts.mid != null ? opts.mid : 0) +
      ' }, dark: { hue: ' + opts.dark + ' } }]; // @rows: name:text=Mode|' +
      'hueCurve:curve(ends:bright.hue..middle.hue..dark.hue, range:0..360, overshoot:true)=Hue curve|' +
      'bright:{hue:number=Start}=B|middle:{hue:number=Middle}=M|dark:{hue:number=End}=D @blocks',
    '// @UI_CONFIG_END',
  ].join('\n');
  const schema = parser.parse(source);
  const container = document.createElement('div');
  var curveField = null;
  for (var ri = 0; ri < schema.rows.length; ri++) {
    if (schema.rows[ri].type === 'field' && schema.rows[ri].inputType === 'curve') {
      curveField = schema.rows[ri];
      break;
    }
  }
  renderer.buildForm(schema, container);
  renderer.attachListeners(container, schema, function () {}, undefined, undefined, undefined,
    function fillMiddleAnchor(scope, wrapEl, detail) {
      var curveKey = wrapEl && wrapEl.getAttribute('data-row-field');
      if (!curveKey) return;
      var channel = curveKey.replace(/Curve$/, '');
      if (!channel || channel === curveKey) return;
      var middleInput = scope.querySelector('[data-row-field="middle.' + channel + '"]');
      if (!middleInput) return;
      var replace = !!(detail && detail.replace);
      if (!replace && String(middleInput.value || '').trim() !== '') return;
      var value = detail && typeof detail.value === 'number' && isFinite(detail.value)
        ? detail.value : null;
      if (value === null) return;
      middleInput.value = String(Math.round(value * 10) / 10);
      middleInput.dispatchEvent(new Event('input', { bubbles: true }));
      middleInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
  const wrap = container.querySelector('[data-row-field="hueCurve"]');
  const svg = wrap.querySelector('.config-ui-curve__canvas');
  setPlotBox(svg);
  return {
    container,
    wrap,
    svg,
    points: () => JSON.parse(wrap.getAttribute('data-curve-value')),
    view: () => wrap.getAttribute('data-curve-view'),
    refresh: () => wrap.dispatchEvent(new Event('config-ui-curve-refresh')),
    field: (which) => container.querySelector('[data-row-field="' + which + '.hue"]'),
  };
}

/** Sixteen-step ramp standing in for a loaded collection — drives `zoomCap`. */
function limeSatRamp() {
  const hexes = [
    '#F5FFF0', '#E5FFE5', '#C8FFB8', '#A8FF8A', '#7FFF5C', '#52FF3D', '#2FE824', '#1AD01A',
    '#0FB812', '#0A9610', '#077A0D', '#05620A', '#034D08', '#023806', '#012604', '#001A03',
  ];
  return hexes;
}

module.exports = {
  PLOT,
  boot,
  mountCurve,
  setPlotBox,
  drag,
  dragHandle,
  dragEnd,
  clickZoom,
  clickToggle,
  pathYs,
  pathSpread,
  tickLabels,
  zoomMarkTop,
  zoomInDisabled,
  derivedMiddlePlaceholder,
  curveText,
  dragHandleGradual,
  handleCount,
  selectPreset,
  middleCy,
  mountColorsHueRow,
  limeSatRamp,
};
