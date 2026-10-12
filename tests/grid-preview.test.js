/**
 * The Grid preview's arithmetic.
 *
 * The one thing kept live through the layout pass, because a preview drawn from invented numbers is the
 * part of the panel nobody can judge. It uses `calculateColumnWidth` — the generator's own function — so
 * the preview and the run cannot disagree about a column width, which is the whole point of a preview.
 *
 * The drawing fits the preview column: the largest mode is 100% of that column, and every other mode is
 * `width / maxWidth` of it. A non-interactive ruler marks every mode by name + width above the
 * track; ticks show on the grey remainder and sit under the active grid. The Total/values column
 * keeps a fixed min width across modes so the bar does not reflow when switching tabs.
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
    Math, String, Array, Object, JSON, Date, isNaN, isFinite, parseInt, parseFloat, Number, RegExp
  };
  vm.createContext(ctx);
  for (const file of ['@core-library.js', '@foundation.js']) {
    const source = fs.readFileSync(path.join(LIBS, file), 'utf8');
    for (const [, code] of resolver.extractFunctionMap(source)) {
      try { vm.runInContext(code, ctx); } catch (e) { /* functions needing absent globals */ }
    }
  }
  return ctx;
}

const lib = load();
const DESKTOP = { name: 'desktop', containerWidth: 1440, columns: 12, gap: 24, padding: 80 };
const MOBILE = { name: 'mobile', containerWidth: 375, columns: 4, gap: 16, padding: 20 };

test('the drawing scales to the largest mode, not a fixed half', () => {
  // Largest alone fills the column (scale 1). An 80 margin is 80/1440 of the diagram — not 40px.
  const alone = lib.gridPreviewModel(DESKTOP);
  assert.equal(alone.ok, true);
  assert.equal(alone.content, 1280);
  assert.equal(Math.round(alone.colWidth * 100) / 100, 84.67);
  assert.equal(alone.scale, 1);
  assert.equal(alone.maxWidth, 1440);

  // Beside a wider sibling, the same mode is still full; the smaller one is a fraction.
  const desk = lib.gridPreviewModel(DESKTOP, 1440);
  const mob = lib.gridPreviewModel(MOBILE, 1440);
  assert.equal(desk.scale, 1);
  assert.equal(Math.round(mob.scale * 1000) / 1000, Math.round((375 / 1440) * 1000) / 1000);
  assert.equal(lib.gridPreviewMaxWidth([DESKTOP, MOBILE]), 1440);
});

test('the last span is the content width, for any input', () => {
  // The identity that makes the last number in the values column the one that cannot be wrong:
  // span(N) = N·colWidth + (N−1)·gap, and the gaps cancel.
  for (const mode of [
    DESKTOP,
    { containerWidth: 768, columns: 8, gap: 24, padding: 40 },
    { containerWidth: 375, columns: 4, gap: 16, padding: 20 },
    { containerWidth: 1000, columns: 7, gap: 13, padding: 31 }
  ]) {
    const m = lib.gridPreviewModel(mode);
    const last = m.spans[m.spans.length - 1].span;
    assert.equal(Math.round(last * 1000) / 1000, m.content,
      'span(N) must equal the content width for ' + JSON.stringify(mode));
  }
});

test('a config that cannot be drawn says so rather than drawing zeros', () => {
  for (const bad of [
    {},
    { containerWidth: 1440, columns: 0, gap: 24, padding: 80 },
    { containerWidth: 100, columns: 12, gap: 24, padding: 80 }
  ]) {
    assert.equal(lib.gridPreviewModel(bad).ok, false, JSON.stringify(bad) + ' should not draw');
  }
});

test('the markup carries the proportions, and is grey until there is a collection', () => {
  const config = { collectionName: 'Responsive System', group: 'Grid', modes: [DESKTOP] };
  const html = lib.gridPreviewHtml(config, 'grid', 'desktop');

  assert.match(html, /Total: <b>1440<\/b>/);
  assert.equal(html.indexOf('(100%)'), -1, 'no percentage beside Total');
  assert.equal(html.indexOf('Scaled down'), -1);
  assert.match(html, /col-12: <b>1280<\/b>/);
  // Largest (only) mode: active fill is 100% of the ruler; bands are % of the mode.
  assert.match(html, /class="grid-preview-ruler-active" style="width:100%"/);
  assert.match(html, /class="grid-preview-margin" style="width:5\.5556%"/);
  assert.match(html, /class="grid-preview-col" style="width:5\.8796%"/);
  // Full content (col-12) is 1280/1440 of the column, inset by the margin share.
  assert.match(html, /class="grid-preview-bar" style="margin-left:5\.5556%;width:88\.8889%"/);
  assert.equal(html.indexOf('px"'), -1, 'nothing in the drawing is absolute pixels');
  assert.equal((html.match(/grid-preview-col/g) || []).length, 12);
  assert.equal((html.match(/grid-preview-gap/g) || []).length, 11);
  assert.equal((html.match(/grid-preview-bar/g) || []).length, 12);
  assert.equal(html.indexOf('is-unset'), -1, 'a chosen collection is not the unset state');

  // Grey when there is nowhere to write — hide the block rather than drawing a placeholder diagram.
  const unset = lib.gridPreviewHtml({ collectionName: '', modes: [DESKTOP] }, 'grid', 'desktop');
  assert.equal(unset, '');
  const incomplete = lib.gridPreviewHtml({
    collectionName: 'RS',
    modes: [{ name: 'desktop', containerWidth: '', columns: '', gap: '', padding: '' }]
  }, 'grid', 'desktop');
  assert.equal(incomplete, '', 'width and columns are required before a preview appears');
});

test('a smaller mode draws as a fraction of the largest, with named ruler marks', () => {
  const config = {
    collectionName: 'RS',
    modes: [DESKTOP, MOBILE]
  };
  const mobile = lib.gridPreviewHtml(config, 'grid', 'mobile');
  // 375/1440 ≈ 26.0417% of the column — always fits, and smaller than desktop beside it.
  assert.match(mobile, /Total: <b>375<\/b>/);
  assert.equal(mobile.indexOf('Scaled down'), -1);
  assert.match(mobile, /class="grid-preview-ruler-active" style="width:26\.0417%"/);
  assert.match(mobile, /grid-preview-ruler-tick is-active" style="left:26\.0417%"/);
  assert.match(mobile, /grid-preview-ruler-tick" style="left:100%"/);
  assert.match(mobile, /grid-preview-ruler-mark is-active" style="left:26\.0417%"/);
  assert.match(mobile, /class="grid-preview-ruler-name">mobile</);
  assert.match(mobile, /class="grid-preview-ruler-name">desktop</);
  assert.match(mobile, /class="grid-preview-ruler-size">375</);
  assert.match(mobile, /class="grid-preview-ruler-size">1440</);
  // Meta column locked to the longest Total/col-N line across modes so the bar does not reflow.
  assert.match(mobile, /--grid-preview-meta-ch:\d+/);
  const mobileCh = Number(/--grid-preview-meta-ch:(\d+)/.exec(mobile)[1]);
  const desktop = lib.gridPreviewHtml(config, 'grid', 'desktop');
  const desktopCh = Number(/--grid-preview-meta-ch:(\d+)/.exec(desktop)[1]);
  assert.equal(mobileCh, desktopCh, 'meta column width is stable across modes');
  assert.equal((mobile.match(/grid-preview-col/g) || []).length, 4);

  assert.match(desktop, /Total: <b>1440<\/b>/);
  assert.match(desktop, /class="grid-preview-ruler-active" style="width:100%"/);
  // Marker positions are the same percentages whether mobile or desktop is open.
  assert.match(desktop, /style="left:26\.0417%"/);
  assert.match(desktop, /style="left:100%"/);
});

test('the preview follows the mode it is asked for', () => {
  const config = {
    collectionName: 'RS',
    modes: [DESKTOP, MOBILE]
  };
  assert.match(lib.gridPreviewHtml(config, 'grid', 'mobile'), /Total: <b>375<\/b>/);
  assert.equal((lib.gridPreviewHtml(config, 'grid', 'mobile').match(/grid-preview-col/g) || []).length, 4);
  // No mode named: the first, so the panel draws something rather than nothing.
  assert.match(lib.gridPreviewHtml(config, 'grid', null), /Total: <b>1440<\/b>/);
});

test('a label cannot close a tag', () => {
  assert.equal(lib.foundationEscapeHtml('<img src=x>'), '&lt;img src=x&gt;');
});

test('columns that do not fit say so instead of drawing negative widths', () => {
  const html = lib.gridPreviewHtml(
    { collectionName: 'C', modes: [{ name: 'mobile', containerWidth: 375, columns: 16, gap: 40, padding: 24 }] },
    'grid', 'mobile'
  );
  assert.ok(html.indexOf('grid-preview-note') !== -1, 'a note, not a diagram');
  assert.ok(html.indexOf('grid-preview-col') === -1, 'no columns drawn');
  assert.ok(/16 columns/.test(html) && /375/.test(html));
});

test('columns that fit still draw', () => {
  const html = lib.gridPreviewHtml(
    { collectionName: 'C', modes: [{ name: 'mobile', containerWidth: 375, columns: 16, gap: 15, padding: 15 }] },
    'grid', 'mobile'
  );
  assert.ok(html.indexOf('grid-preview-col') !== -1);
  assert.ok(html.indexOf('grid-preview-note') === -1);
});
