#!/usr/bin/env node
/**
 * Writes `artifacts/style-reference.html` — the reference in a browser, where a size can be measured.
 *
 * Font sizes cannot be checked inside Figma, which is how a 20px heading passed for 15px twice. So
 * this page does two things a plugin panel cannot:
 *
 *   1. It loads the **real `src/ui.css`**, so nothing here is a second style source. Change the
 *      stylesheet, refresh the page.
 *   2. It **measures itself.** Every specimen prints its own computed font-size, weight and margins
 *      from `getComputedStyle`, so no number on the page can drift from the CSS that produced it.
 *      A hand-written "15px" in a doc is a claim; a computed one is a reading.
 *
 * The controls section is **rendered by `src/config-ui/renderer.js`**, from the same config block the
 * plugin renders — via `tests/dom-shim.js`. Hand-written markup would be a third copy of the form's
 * structure, and the first to rot. This is also the only thing in the repo that *executes* the
 * renderer, which is worth knowing when it fails: a crash here is a real bug, not a build problem.
 *
 * Regenerate with `npm run build:style-reference`. It is committed, because reviewing it is the point.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'artifacts', 'style-reference.html');
const HELP = path.join(ROOT, 'scripts', 'HELP', 'help-documentation.js');

// --- the specimen shelf, rendered by the real renderer ----------------------------------------

const shim = require('./tests/dom-shim.js');
// The curve editor draws through the real library, so the reference page shows real curves rather than
// nine empty boxes. Same object the plugin gets — `build-bezier.js` inlines it into `dist/ui.html`.
const { loadBezierGlobal } = require('./build-bezier.js');
const { document, serialize } = shim.install({ CodeFigBezier: loadBezierGlobal() });

/**
 * Just enough inline markdown for the specimens: bold, italic, code.
 *
 * The plugin uses `marked`, which is 40KB of vendor bundle and inlined at build time. What is being
 * judged here is what `<strong>` and `<code>` *look like*, so the reduced renderer is honest as long
 * as it produces the same elements — and the page says it is reduced.
 */
global.window.marked = {
  parse: function (md) {
    return String(md)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  },
};

const parser = require('./src/config-ui/parser.js');
const renderer = require('./src/config-ui/renderer.js');

function configBlock() {
  const src = fs.readFileSync(HELP, 'utf8');
  const m = /@UI_CONFIG_START\n([\s\S]*?)\/\/ @UI_CONFIG_END/.exec(src);
  if (!m) throw new Error('help-documentation.js has no @UI_CONFIG block to render');
  return m[1];
}

function renderControls() {
  const schema = parser.parse(configBlock());
  const container = document.createElement('div');
  renderer.buildForm(schema, container);

  // The collection picker is filled by a backend round trip in the plugin, so a static page would
  // show an empty select. Filling it with a plausible list is what makes it a specimen of the
  // control rather than of a loading state.
  const collection = container.querySelector('[data-collection-field]');
  if (collection) {
    renderer.populateCollectionControl(
      collection,
      ['Responsive System', 'Brand tokens', 'Primitives'],
      'Responsive System',
      true
    );
  }
  return container;
}

/**
 * What each ⓘ says, listed.
 *
 * The bubble is built on hover and this page has no pointer, so on the page the affordance is a
 * circle with nothing behind it — which is exactly the failure the ⓘ replaced, where leftover comment
 * prose set a `title` that nothing ever showed. The text is on the button as `data-info`, so the page
 * prints it beside the control it belongs to and the reference stays a thing you can read.
 */
function tips(container) {
  return container.querySelectorAll('.config-ui-info').map(function (btn) {
    var owner = btn.parentNode;
    // The label's own text, without the "i" the button contributes to it.
    var label = (owner ? owner.textContent : '').replace(/i$/, '').trim();
    return { label: label || '—', text: btn.getAttribute('data-info') || '' };
  });
}

function tipRows(container) {
  const rows = tips(container);
  if (!rows.length) return '<p class="ref-note">No control on the shelf carries an explanation.</p>';
  return '<table class="ref-table">\n' + rows.map(function (t) {
    return '        <tr><td>' + esc(t.label) + '</td><td class="ref-tip">' + esc(t.text) + '</td></tr>';
  }).join('\n') + '\n      </table>';
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- tokens, read out of the stylesheet rather than restated -----------------------------------

function tokens() {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'ui.css'), 'utf8');
  const root = /:root \{([\s\S]*?)\n      \}/.exec(css);
  if (!root) throw new Error('ui.css: the :root block is not where this expects it');
  const out = { font: [], space: [], radius: [], colour: [] };
  const re = /(--[\w-]+):\s*([^;]+);/g;
  let m;
  while ((m = re.exec(root[1])) !== null) {
    const name = m[1];
    const value = m[2].trim();
    if (/^--font-size-/.test(name)) out.font.push({ name, value });
    else if (/^--space-|^--panel-padding-x$|^--section-gap$/.test(name)) out.space.push({ name, value });
    else if (/^--radius-/.test(name)) out.radius.push({ name, value });
    else if (/^#|^rgb/.test(value)) out.colour.push({ name, value });
  }
  return out;
}

const T = tokens();

const fontRows = T.font
  .slice()
  .sort((a, b) => parseInt(b.value, 10) - parseInt(a.value, 10))
  .map(
    (t) => `        <tr>
          <td><code>${t.name}</code></td>
          <td class="ref-sized" style="font-size: var(${t.name})" data-measure="font-size">The quick brown fox</td>
          <td class="ref-read"></td>
        </tr>`
  )
  .join('\n');

const spaceRows = T.space
  .map(
    (t) => `        <tr>
          <td><code>${t.name}</code></td>
          <td><span class="ref-bar" style="width: var(${t.name})" data-measure="width"></span></td>
          <td class="ref-read"></td>
        </tr>`
  )
  .join('\n');

const radiusRows = T.radius
  .map(
    (t) => `        <tr>
          <td><code>${t.name}</code></td>
          <td><span class="ref-radius" style="border-radius: var(${t.name})" data-measure="border-radius"></span></td>
          <td class="ref-read"></td>
        </tr>`
  )
  .join('\n');

const colourRows = T.colour
  .map(
    (t) => `        <tr>
          <td><code>${t.name}</code></td>
          <td><span class="ref-swatch" style="background: var(${t.name})" data-measure="background-color"></span></td>
          <td class="ref-read"></td>
        </tr>`
  )
  .join('\n');

// --- the page ----------------------------------------------------------------------------------

const controls = renderControls();

const page = `<!doctype html>
<!--
  GENERATED by build-style-reference.js — do not edit by hand.

  The controls section is rendered by src/config-ui/renderer.js from the @UI_CONFIG block in
  scripts/HELP/help-documentation.js, so it is the same markup the plugin builds. Regenerate with
  npm run build:style-reference.
-->
<html lang="en">
<head>
<meta charset="utf-8">
<title>CodeFig — Style &amp; UI reference</title>
<link rel="stylesheet" href="../src/ui.css">
<style>
  /* Page harness only. Nothing here may restyle a specimen: it lays the page out and labels it.
     The one exception is documented where it happens. */
  body { margin: 0; font: var(--font-size-body) var(--font-family-base); color: var(--text-primary);
         background: var(--bg-secondary); }
  .ref-page { max-width: 1180px; margin: 0 auto; padding: 32px 24px 96px; }
  .ref-title { font-size: 28px; font-weight: 600; margin: 0 0 4px; }
  .ref-lede { color: var(--text-muted); margin: 0 0 32px; max-width: 70ch; line-height: 1.6; }
  .ref-lede code { background: var(--code-bg); padding: 1px 4px; border-radius: 3px; }
  .ref-section { background: var(--bg-primary); border: 1px solid var(--border-light);
                 border-radius: 8px; margin-bottom: 24px; }
  .ref-section > h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;
                      color: var(--text-muted); font-weight: 600; margin: 0;
                      padding: 14px 20px; border-bottom: 1px solid var(--border-light); }
  .ref-body { padding: 20px; }
  .ref-note { color: var(--text-muted); line-height: 1.6; margin: 0 0 16px; max-width: 78ch; }
  table.ref-table { border-collapse: collapse; width: 100%; }
  table.ref-table td { border-bottom: 1px solid var(--border-light); padding: 10px 12px;
                       vertical-align: middle; }
  table.ref-table tr:last-child td { border-bottom: 0; }
  table.ref-table td:first-child { width: 210px; white-space: nowrap; }
  table.ref-table code { background: var(--code-bg); padding: 2px 5px; border-radius: 3px;
                         font: 11px var(--font-family-mono); }
  .ref-tip { color: var(--text-muted); line-height: 1.5; white-space: pre-line; }
  .ref-read { width: 260px; color: var(--text-muted); font: 11px var(--font-family-mono);
              white-space: nowrap; }
  .ref-bar { display: inline-block; height: 14px; background: var(--text-link); border-radius: 2px; }
  .ref-radius { display: inline-block; width: 44px; height: 26px; background: var(--bg-tertiary);
                border: 1px solid var(--border-color); }
  .ref-swatch { display: inline-block; width: 64px; height: 20px;
                border: 1px solid rgba(0,0,0,0.15); border-radius: 3px; }
  .ref-ladders { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .ref-ladder h3 { font-size: 12px; font-weight: 600; margin: 0 0 4px; }
  .ref-ladder > p { color: var(--text-muted); margin: 0 0 12px; font: 11px var(--font-family-mono); }
  .ref-ladder-body { border: 1px dashed var(--border-color); border-radius: 6px; padding: 16px; }
  .ref-measure-badge { display: inline-block; margin-left: 10px; padding: 1px 6px; border-radius: 3px;
                       background: var(--code-bg); color: var(--text-muted); vertical-align: middle;
                       font: 10px var(--font-family-mono); font-weight: 400; letter-spacing: 0; }

  /* The panel simulation. \`.config-ui-form\` is a flex child with its own scroll container in the
     plugin; on a plain page that collapses to nothing, so height and overflow are overridden — and
     **only** those two, because everything else about it is what is being judged. */
  .ref-panel { width: 760px; max-width: 100%; border: 1px solid var(--border-color);
               border-radius: 8px; overflow: hidden; }
  .ref-panel .config-ui-form { height: auto; overflow-y: visible; flex: none; }
</style>
</head>
<body>
<div class="ref-page">

  <h1 class="ref-title">Style &amp; UI reference</h1>
  <p class="ref-lede">
    The plugin's own <code>src/ui.css</code>, in a browser, where a size can be measured instead of
    guessed. Every specimen prints its <strong>computed</strong> font-size, weight and box values, so
    nothing on this page can disagree with the stylesheet that produced it.
    The controls below are rendered by <code>src/config-ui/renderer.js</code> from the config block in
    <code>scripts/HELP/help-documentation.js</code> — the same markup the plugin builds, not a copy of
    it. Paragraph markdown uses a reduced renderer here (bold, italic, code); the plugin uses
    <code>marked</code>.
  </p>

  <section class="ref-section">
    <h2>Two heading ladders</h2>
    <div class="ref-body">
      <p class="ref-note">
        The Documentation tab and a settings form style headings with <strong>separate rules</strong>.
        Same markdown, different sizes — this is the pair to compare, and the reason a heading fix can
        land on the wrong one and change nothing.
      </p>
      <div class="ref-ladders">
        <div class="ref-ladder">
          <h3>Documentation tab</h3>
          <p>.docs-rendered h1 | h2 | h3</p>
          <div class="ref-ladder-body docs-rendered">
            <h1 data-measure="font-size,font-weight,margin">Heading level 1</h1>
            <h2 data-measure="font-size,font-weight,margin">Heading level 2</h2>
            <h3 data-measure="font-size,font-weight,margin">Heading level 3</h3>
            <p data-measure="font-size,font-weight">Body copy, for the step down to it.</p>
          </div>
        </div>
        <div class="ref-ladder">
          <h3>Configuration UI form</h3>
          <p>.config-ui-form--rows .config-ui-row--heading h1 | h2 | h3</p>
          <div class="ref-ladder-body config-ui-form config-ui-form--rows" style="padding: 16px 0">
            <div class="config-ui-row config-ui-row--heading">
              <h1 class="config-ui-heading" data-measure="font-size,font-weight,margin">Heading level 1</h1>
            </div>
            <div class="config-ui-row config-ui-row--heading">
              <h2 class="config-ui-heading" data-measure="font-size,font-weight,margin">Heading level 2</h2>
            </div>
            <div class="config-ui-row config-ui-row--heading">
              <h3 class="config-ui-heading" data-measure="font-size,font-weight,margin">Heading level 3</h3>
            </div>
            <div class="config-ui-row config-ui-row--paragraph">
              <div class="docs-rendered" data-measure="font-size,font-weight">Body copy, for the step down to it.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="ref-section">
    <h2>Type scale</h2>
    <div class="ref-body">
      <table class="ref-table">
${fontRows}
      </table>
    </div>
  </section>

  <section class="ref-section">
    <h2>Spacing</h2>
    <div class="ref-body">
      <table class="ref-table">
${spaceRows}
      </table>
    </div>
  </section>

  <section class="ref-section">
    <h2>Radii</h2>
    <div class="ref-body">
      <table class="ref-table">
${radiusRows}
      </table>
    </div>
  </section>

  <section class="ref-section">
    <h2>Colours</h2>
    <div class="ref-body">
      <p class="ref-note">
        Light values. Each has a dark-scheme counterpart — switch your system appearance and refresh to
        read the other set, since the page reports what is computed rather than what is written.
      </p>
      <table class="ref-table">
${colourRows}
      </table>
    </div>
  </section>

  <section class="ref-section">
    <h2>Buttons</h2>
    <div class="ref-body">
      <div style="display: inline-flex; gap: 8px; align-items: center">
        <button class="btn primary" data-measure="font-size,height">Run</button>
        <button class="btn secondary" data-measure="height">Import</button>
        <button class="btn danger">Delete</button>
        <button class="btn secondary" disabled>Disabled</button>
      </div>
    </div>
  </section>

  <section class="ref-section">
    <h2>Controls</h2>
    <div class="ref-body">
      <p class="ref-note">
        Rendered by the real renderer, from the real config block. Each control names the line that
        produced it. Nothing here is wired: there is no plugin behind the page, so a dropdown opens and
        a chip does not rename.
      </p>
      <div class="ref-panel">
${serialize(controls, 3)}
      </div>
    </div>
  </section>

  <section class="ref-section">
    <h2>What the ⓘ says</h2>
    <div class="ref-body">
      <p class="ref-note">
        One channel for a control's explanation: its <code>@helper:</code>, its leftover comment prose,
        and any paragraph written against it, all behind the ⓘ beside its label. The bubble appears on
        hover or on focus, which a static page cannot do — so the text is listed here.
      </p>
      ${tipRows(controls)}
    </div>
  </section>

</div>

<script>
  /* Measure, do not restate. Each \`data-measure\` names the properties to read; the badge shows what
     the browser computed, which is the only number on this page that cannot be wrong. */
  document.querySelectorAll('[data-measure]').forEach(function (el) {
    var props = el.getAttribute('data-measure').split(',');
    var cs = getComputedStyle(el);
    var parts = props.map(function (p) {
      p = p.trim();
      if (p === 'margin') {
        return 'margin ' + [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft]
          .map(function (v) { return parseFloat(v) + ''; }).join('/');
      }
      if (p === 'height') return 'height ' + Math.round(el.getBoundingClientRect().height) + 'px';
      if (p === 'width') return Math.round(el.getBoundingClientRect().width) + 'px';
      if (p === 'font-weight') return cs.fontWeight;
      return cs[p.replace(/-(\\w)/g, function (m, c) { return c.toUpperCase(); })];
    });
    var text = parts.join(' · ');

    /* A table row prints into its own cell; anything else gets a badge appended, which is why the
       badge is inline and weight-reset — it must not read as part of the specimen. */
    var cell = el.closest('tr') && el.closest('tr').querySelector('.ref-read');
    if (cell) { cell.textContent = text; return; }
    var badge = document.createElement('span');
    badge.className = 'ref-measure-badge';
    badge.textContent = text;
    el.appendChild(badge);
  });
</script>
</body>
</html>
`;

// Exported so a test can build the page and compare it to the committed one — the page is generated,
// so the only way it goes wrong is by being **stale**, and that is a comparison rather than an
// assertion about its contents.
module.exports = { buildPage: () => page, OUT };

if (require.main === module) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, page);
  console.log('✅ ' + path.relative(ROOT, OUT) + ' (' + page.split('\n').length + ' lines)');
}
