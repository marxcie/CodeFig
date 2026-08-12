/**
 * The Grid preview's arithmetic.
 *
 * The one thing kept live through the layout pass, because a preview drawn from invented numbers is the
 * part of the panel nobody can judge. It uses `calculateColumnWidth` — the generator's own function — so
 * the preview and the run cannot disagree about a column width, which is the whole point of a preview.
 *
 * The frame is the fixture for the *shape*, not the numbers: at 1440/80/24/12 it draws 716 wide with
 * 40px margins, 12px gaps and 42px columns, which is 1440 at 49.7% — so the percentage the Total line
 * reports is the scale the diagram is drawn at.
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

test('the drawing is locked at half size, in real pixels', () => {
  // **Changed on Márton's report, and the old expectation was the bug.** The diagram was drawn in
  // percentages of whatever width the panel happened to have, while the percentage it *printed* came
  // from a hardcoded 716 — so the caption read 41% on his window, the drawing scaled when he dragged the
  // panel, and neither number was the truth. This test asserted that 716, which is how it survived.
  //
  // One fixed scale now: half, in pixels. A ruler on the screen agrees with the number beside the bar.
  const m = lib.gridPreviewModel(DESKTOP);
  assert.equal(m.ok, true);
  assert.equal(m.content, 1280);
  assert.equal(Math.round(m.colWidth * 100) / 100, 84.67);

  assert.equal(m.scale, 0.5, 'and it does not depend on how wide the panel is');
  assert.equal(m.margin * m.scale, 40, 'an 80 margin draws 40px');
  assert.equal(m.gap * m.scale, 12, 'a 24 gap draws 12px');
  assert.equal(Math.round(m.colWidth * m.scale * 100) / 100, 42.33);
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
    const m = lib.gridPreviewModel(mode, 716);
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
    assert.equal(lib.gridPreviewModel(bad, 716).ok, false, JSON.stringify(bad) + ' should not draw');
  }
});

test('the markup carries the proportions, and is grey until there is a collection', () => {
  const config = { collectionName: 'Responsive System', group: 'Grid', modes: [DESKTOP] };
  const html = lib.gridPreviewHtml(config, 'grid', 'desktop');

  assert.match(html, /Total: <b>1440<\/b> \(50%\)/);
  assert.match(html, /col-12: <b>1280<\/b>/);
  // Pixels, at half. An 80 margin is 40px wide whatever the panel is doing.
  assert.match(html, /class="grid-preview-margin" style="width:40px"/);
  assert.match(html, /class="grid-preview-col" style="width:42\.33px"/);
  assert.match(html, /class="grid-preview-bar" style="margin-left:40px;width:640px"/,
    'and a col-6 span of 1280/2 sits inside the margin');
  assert.equal(html.indexOf('%"'), -1, 'nothing in the drawing is relative any more');
  assert.equal((html.match(/grid-preview-col/g) || []).length, 12);
  assert.equal((html.match(/grid-preview-gap/g) || []).length, 11);
  assert.equal((html.match(/grid-preview-bar/g) || []).length, 12);
  assert.equal(html.indexOf('is-unset'), -1, 'a chosen collection is not the unset state');

  // Grey when there is nowhere to write, even though the modes are set — which is what the Start and
  // New frames show.
  const unset = lib.gridPreviewHtml({ collectionName: '', modes: [DESKTOP] }, 'grid', 'desktop');
  assert.match(unset, /class="grid-preview is-unset"/);
});

test('the preview follows the mode it is asked for', () => {
  const config = {
    collectionName: 'RS',
    modes: [DESKTOP, { name: 'mobile', containerWidth: 375, columns: 4, gap: 16, padding: 20 }]
  };
  assert.match(lib.gridPreviewHtml(config, 'grid', 'mobile'), /Total: <b>375<\/b>/);
  assert.equal((lib.gridPreviewHtml(config, 'grid', 'mobile').match(/grid-preview-col/g) || []).length, 4);
  // No mode named: the first, so the panel draws something rather than nothing.
  assert.match(lib.gridPreviewHtml(config, 'grid', null), /Total: <b>1440<\/b>/);
});

test('a label cannot close a tag', () => {
  assert.equal(lib.foundationEscapeHtml('<img src=x>'), '&lt;img src=x&gt;');
});
