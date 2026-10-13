#!/usr/bin/env node
/**
 * Writes `artifacts/ui-static.html` — the whole plugin window, as static HTML, filled with dummy data.
 *
 *   npm run build:ui-static
 *
 * **Nothing here is drawn by hand.** The page is assembled in headless Chrome from the plugin's own parts:
 *
 *   - the shell markup is cut out of `src/ui.html`, and styled by `src/ui.css`
 *   - every form is built by the real `parser.js` + `renderer.js` from the script's real panel recipe
 *   - every Preview is the script's own `@PREVIEW:` function, with its imports resolved by the real
 *     `import-resolver.js` and its `@STYLE_START` sheets scoped by the real `style-scoper.js`
 *   - Documentation goes through `marked`, Source code through CodeMirror, both as the plugin loads them
 *   - the Variable inspector hits come from that script's own `createVariableResult`
 *
 * Chrome then dumps the finished DOM and this script strips the `<script>` tags, so the file is plain
 * markup plus the stylesheet. That is what makes it importable into Figma and readable without a plugin.
 * Only the **values** are invented (collection names, token lists, hits); every control, class, size and
 * string around them is the plugin's.
 *
 * Not part of any build. Needs Google Chrome (set CHROME to use another binary).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { findAllScripts } = require('./validate-scripts.js');
const { BEZIER_UI_EXPORTS } = require('./build-bezier.js');

const ROOT = __dirname;
const OUT = process.env.UI_STATIC_OUT || path.join(ROOT, 'artifacts', 'ui-static.html');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const lib = (rel) => read(rel).replace(/<\/script/gi, '<\\/script');


/**
 * The plugin follows the system appearance with `@media (prefers-color-scheme: dark)`. One page cannot show
 * both, so each dark block is rewritten to hang off `.mk-dark` instead: `:root` becomes the frame itself and
 * every other selector is prefixed. Light frames then stay light whatever the system is set to.
 */
function darkToClass(css) {
  var marker = '@media (prefers-color-scheme: dark)';
  var out = '', at = 0, i;
  while ((i = css.indexOf(marker, at)) !== -1) {
    out += css.slice(at, i);
    var open = css.indexOf('{', i), depth = 1, j = open + 1;
    while (j < css.length && depth > 0) { var ch = css[j]; if (ch === '{') depth++; else if (ch === '}') depth--; j++; }
    var inner = css.slice(open + 1, j - 1);
    var re = /([^{}]+)\{([^{}]*)\}/g, m, rules = '';
    while ((m = re.exec(inner)) !== null) {
      var sels = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(function (sel) {
        sel = sel.trim();
        if (sel === ':root') return '.mk-dark';
        return '.mk-dark ' + sel;
      }).join(', ');
      rules += sels + ' {' + m[2] + '}\n';
    }
    out += rules;
    at = j;
  }
  return out + css.slice(at);
}

// --- inputs ------------------------------------------------------------------------------------------

const scripts = findAllScripts(path.join(ROOT, 'scripts')).map((s) => ({
  name: s.name,
  folder: s.folder,
  code: s.code,
  packageId: s.packageId || null,
}));

/** The plugin window's markup, exactly as `src/ui.html` has it, minus the modal and the script tag. */
function shellMarkup() {
  const html = read('src/ui.html');
  const start = html.indexOf('<div class="resizable-container">');
  const end = html.indexOf('<!-- CodeFig settings modal -->');
  if (start === -1 || end === -1) throw new Error('src/ui.html: the shell markers moved');
  let shell = html.slice(start, end) + '</div>';
  const bmc = read('src/bmc-button.svg').trim()
    .replace(/<svg(\s)/, '<svg class="bmc-btn__svg" focusable="false" aria-hidden="true"$1')
    .replace(/\s*width="[^"]*"/, '').replace(/\s*height="[^"]*"/, '');
  shell = shell.replace('<!-- INLINE_BMC_SVG -->', bmc);
  // Ids would repeat once per screen.
  return shell.replace(/\s+id="[^"]*"/g, '');
}

function bezierGlobal() {
  const source = read('scripts/CODEFIG_LIBRARIES/@bezier.js').replace(/^@import .*$/gm, '');
  return source + '\nwindow.CodeFigBezier = { ' + BEZIER_UI_EXPORTS.map((n) => n + ': ' + n).join(', ') + ' };';
}

// --- the dummy data ----------------------------------------------------------------------------------

const MODES3 = ['Desktop', 'Tablet', 'Mobile'];

const CONFIGS = {
  Colors: {
    collectionName: 'Brand colors',
    group: 'Indigo',
    steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'],
    opacityVariations: '',
    colorModel: 'oklch',
    curve: [0.37, 0, 0.63, 1],
    lightness: { bright: 98, dark: 15 },
    generateOverview: true,
    modes: [
      {
        name: 'Light',
        curve: [0.37, 0, 0.63, 1],
        chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],
        seed: { hex: '#4F46E5', placement: '600', lock: true },
        bright: { hue: 277, hslHue: 243, chroma: 0.012, saturation: 90, lightness: 98 },
        middle: { hue: 277, hslHue: 243, chroma: 0.21, saturation: 78 },
        dark: { hue: 270, hslHue: 244, chroma: 0.07, saturation: 55, lightness: 15 },
      },
      {
        name: 'Dark',
        curve: [0.37, 0, 0.63, 1],
        chromaCurve: [], saturationCurve: [], hueCurve: [], hslHueCurve: [],
        seed: { hex: '#818CF8', placement: '400', lock: true },
        bright: { hue: 277, hslHue: 243, chroma: 0.014, saturation: 90, lightness: 98 },
        middle: { hue: 277, hslHue: 243, chroma: 0.16, saturation: 72 },
        dark: { hue: 270, hslHue: 244, chroma: 0.05, saturation: 50, lightness: 15 },
      },
    ],
  },
  Typography: {
    collectionName: 'Responsive Variables',
    group: 'Typography',
    fontScale: ['Text-Tiny', 'Text-Small', 'Text-Regular', 'Text-Large', 'Heading-4', 'Heading-3', 'Heading-2', 'Heading-1'],
    fontFamily: 'Inter',
    fontWeights: [400, 600],
    createStyles: true,
    styleNaming: 'Typography/{$fontScale}/{$fontWeight}',
    textWrapStyle: 'AUTO',
    generateOverview: true,
    overviewPreviewText: 'Sphinx of black quartz,\njudge my vow.',
    modes: [
      { name: 'Desktop', scaleType: 'bezier', base: 16, ratio: 1.25, curve: [], letterSpacing: { base: 0, max: -2 }, lineHeight: { base: 150, max: 110 }, roundTo: 1 },
      { name: 'Tablet', scaleType: 'bezier', base: 15, ratio: 1.2, curve: [], letterSpacing: { base: 0, max: -1.5 }, lineHeight: { base: 150, max: 112 }, roundTo: 1 },
      { name: 'Mobile', scaleType: 'bezier', base: 14, ratio: 1.15, curve: [], letterSpacing: { base: 0, max: -1 }, lineHeight: { base: 150, max: 115 }, roundTo: 1 },
    ],
  },
  Spacing: {
    collectionName: 'Responsive Variables',
    group: 'Spacing',
    spacings: ['none', 'px', '3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'],
    generateOverview: true,
    modes: [
      { name: 'Desktop', scaleType: 'bezier', base: 4, ratio: 1.5, curve: [], step: 4, mod: 3, roundTo: 2, extras: [1] },
      { name: 'Tablet', scaleType: 'bezier', base: 4, ratio: 1.45, curve: [], step: 4, mod: 3, roundTo: 2, extras: [1] },
      { name: 'Mobile', scaleType: 'bezier', base: 3, ratio: 1.4, curve: [], step: 4, mod: 3, roundTo: 1, extras: [1] },
    ],
  },
  'Corner radius': {
    collectionName: 'Responsive Variables',
    group: 'Corner radius',
    radii: ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'full'],
    generateOverview: false,
    modes: [
      { name: 'Desktop', scaleType: 'bezier', base: 4, ratio: 1.6, curve: [], step: 4, mod: 3, roundTo: 2, extras: [0] },
      { name: 'Tablet', scaleType: 'bezier', base: 4, ratio: 1.5, curve: [], step: 4, mod: 3, roundTo: 2, extras: [0] },
      { name: 'Mobile', scaleType: 'bezier', base: 3, ratio: 1.5, curve: [], step: 4, mod: 3, roundTo: 1, extras: [0] },
    ],
  },
  Grid: {
    collectionName: 'Responsive Variables',
    group: 'Grid',
    extensionColumns: 0,
    extraValues: [],
    generateOverview: false,
    modes: [
      { name: 'Desktop', containerWidth: 1440, columns: 12, gap: 24, padding: 80 },
      { name: 'Tablet', containerWidth: 834, columns: 8, gap: 20, padding: 40 },
      { name: 'Mobile', containerWidth: 390, columns: 4, gap: 16, padding: 20 },
    ],
  },
};

const REPLACE_VARIABLES = {
  rebindScope: 'both',
  sourceCollection: 'Colors v1',
  sourceGroup: 'brand',
  sourceVariables: 'primary',
  targetCollection: 'Brand colors',
  targetGroup: 'indigo',
  targetVariables: '',
  useRegex: false,
  batchReplacement: 'brand/primary -> indigo/600\nbrand/primary-hover -> indigo/700\nbrand/surface -> indigo/50',
};

const COLLECTIONS = ['Responsive Variables', 'Brand colors', 'Colors v1', 'Primitives', 'Semantic'];

/** Dummy hits for the Variable inspector. Shaped as the script's own analysis builds them. */
const INSPECTOR = [
  {
    collection: 'Brand colors',
    variables: [
      { name: 'indigo/600', type: 'COLOR', status: 'healthy', score: 96, values: { Light: '#4F46E5', Dark: '#818CF8' },
        nodes: [['Button / Primary', 'INSTANCE'], ['Link', 'TEXT'], ['Badge / Info', 'INSTANCE'], ['Tab / Active', 'FRAME'], ['Focus ring', 'RECTANGLE'], ['Nav item', 'INSTANCE'], ['Toggle / On', 'INSTANCE']],
        styles: [['Fill/Brand', 'PAINT']], props: ['fills', 'strokes'] },
      { name: 'indigo/50', type: 'COLOR', status: 'healthy', score: 100, values: { Light: '#EEF2FF', Dark: '#1E1B4B' },
        nodes: [['Card / Highlight', 'FRAME'], ['Banner', 'FRAME']], styles: [], props: ['fills'] },
      { name: 'indigo/700', type: 'COLOR', status: 'warning', score: 72, issues: ['Dark mode value matches indigo/600'],
        values: { Light: '#4338CA', Dark: '#818CF8' }, nodes: [['Button / Primary (hover)', 'INSTANCE']], styles: [], props: ['fills'] },
    ],
  },
  {
    collection: 'Responsive Variables',
    variables: [
      { name: 'Spacing/md', type: 'FLOAT', status: 'healthy', score: 94, values: { Desktop: '24', Tablet: '20', Mobile: '16' },
        nodes: [['Card', 'FRAME'], ['Form / Field group', 'FRAME'], ['Modal', 'FRAME'], ['List item', 'INSTANCE']], styles: [], props: ['paddingLeft', 'paddingRight', 'itemSpacing'] },
      { name: 'Typography/Heading-2/font-size', type: 'FLOAT', status: 'healthy', score: 90, values: { Desktop: '31', Tablet: '27', Mobile: '23' },
        nodes: [['Section title', 'TEXT']], styles: [['Typography/Heading-2/600', 'TEXT']], props: ['fontSize'] },
      { name: 'Radius/lg', type: 'FLOAT', status: 'broken', score: 40, issues: ['Alias points to a deleted variable'],
        values: { Desktop: '12' }, nodes: [['Image / Hero', 'RECTANGLE'], ['Avatar', 'ELLIPSE']], styles: [], props: ['cornerRadius'] },
    ],
  },
  {
    collection: 'Design Library (remote)',
    variables: [
      { name: 'Surface/default', type: 'COLOR', status: 'remote', score: 100, values: { Light: '#FFFFFF', Dark: '#0B0B0F' },
        nodes: [['Page', 'FRAME']], styles: [], props: ['fills'] },
    ],
  },
];

const SCREENS = [
  { id: 'dsf-colors', title: 'Design System Foundations / Colors', script: 'Design System Foundations / Colors', tab: 'config', config: 'Colors', openFirstMode: true },
  { id: 'dsf-typography', title: 'Design System Foundations / Typography', script: 'Design System Foundations / Typography', tab: 'config', config: 'Typography' },
  { id: 'dsf-spacing', title: 'Design System Foundations / Spacing', script: 'Design System Foundations / Spacing', tab: 'config', config: 'Spacing' },
  { id: 'dsf-radius', title: 'Design System Foundations / Corner radius', script: 'Design System Foundations / Corner radius', tab: 'config', config: 'Corner radius' },
  { id: 'dsf-grid', title: 'Design System Foundations / Grid', script: 'Design System Foundations / Grid', tab: 'config', config: 'Grid' },
  { id: 'replace-variables', title: 'Replace variables — Configuration UI', script: 'Variables / Replace variables', tab: 'config', values: 'replaceVariables' },
  { id: 'duplicate-docs', title: 'Duplicate component — Documentation', script: 'Utility Scripts / Duplicate component', tab: 'docs' },
  { id: 'duplicate-source', title: 'Duplicate component — Source code', script: 'Utility Scripts / Duplicate component', tab: 'source' },
  { id: 'inspector-hits', title: 'Variable inspector — Results & Information with hits', script: 'Variables / Variable inspector (WIP)', tab: 'config', infoPanel: true },
];

const SHOWN = process.env.UI_STATIC_ONLY ? SCREENS.filter((s) => process.env.UI_STATIC_ONLY.split(',').indexOf(s.id) !== -1) : SCREENS;
const DATA = { scripts, screens: SHOWN, configs: CONFIGS, replaceVariables: REPLACE_VARIABLES, collections: COLLECTIONS, inspector: INSPECTOR };

// --- the page that Chrome runs -----------------------------------------------------------------------

const PAGE_CSS = `
  html, body { height: auto; }
  body { display: block; margin: 0; background: #ececef; color: var(--text-primary);
         font-family: var(--font-family-base); }
  .mk-page { max-width: 1080px; margin: 0 auto; padding: 40px 40px 120px; }
  .mk-title { font-size: 28px; font-weight: 600; margin: 0 0 6px; }
  .mk-lede { margin: 0 0 18px; max-width: 76ch; line-height: 1.6; color: #5a5a63; font-size: 14px; }
  .mk-toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 40px; padding: 0; list-style: none; }
  .mk-toc a { display: block; padding: 5px 10px; border-radius: 6px; background: #fff; color: #333;
              font-size: 12px; text-decoration: none; border: 1px solid #d9d9df; }
  .mk-screen { margin: 0 0 56px; }
  .mk-screen-head { display: flex; align-items: baseline; gap: 12px; margin: 0 0 10px; }
  .mk-screen-no { font-size: 12px; font-weight: 600; color: #8a8a93; }
  .mk-screen-title { font-size: 15px; font-weight: 600; }
  .mk-variant { margin: 0 0 28px; }
  .mk-variant-tag { margin: 0 0 6px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #8a8a93; font-weight: 600; }
  .mk-frame { width: 1000px; background: var(--bg-primary); border-radius: 10px; overflow: hidden;
              box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 12px 36px rgba(0,0,0,.10); position: relative; }

  /* The plugin window is 1000 x 600 and scrolls. Here nothing scrolls, so every clipping container is opened. */
  .mk-frame .resizable-container { height: auto; min-height: 600px; overflow: visible; }
  .mk-frame .main-container { overflow: visible; align-items: stretch; }
  .mk-frame .sidebar, .mk-frame .script-list, .mk-frame .main-content { overflow: visible; height: auto; }
  .mk-frame .editor-container { overflow: visible; flex: 1 0 auto; height: auto; min-height: 480px; }
  .mk-frame .tab-content { height: auto; overflow: visible; }
  .mk-frame .config-ui-container { overflow: visible; display: flex !important; }
  .mk-frame .config-ui-form { height: auto; overflow: visible; flex: none; }
  .mk-frame .docs-rendered { overflow: visible; }
  .mk-frame .resize-handle { display: none; }
  .mk-frame .CodeMirror { height: auto; }
  .mk-frame .CodeMirror-scroll { overflow: visible !important; height: auto; }
  .mk-frame .info-panel { transition: none; }
  .mk-frame .info-panel-scroll { overflow: visible; }
`;

function pageScript() {
  return `
(function () {
  var darkToClass = ${darkToClass.toString()};
  var D = window.__DATA;
  var SHELL = window.__SHELL;
  var P = window.ConfigUIParser, R = window.ConfigUIRenderer, I = window.CodeFigImports, S = window.CodeFigStyleScoper;
  var scripts = D.scripts;
  function find(name) { return scripts.filter(function (s) { return s.name === name; })[0]; }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ---- source regions, line-anchored like the plugin's own extractSection ----
  function section(code, start, end) {
    var a = new RegExp('^[ \\\\t]*//[ \\\\t]*' + start + '[ \\\\t]*$', 'm').exec(code);
    var b = new RegExp('^[ \\\\t]*//[ \\\\t]*' + end + '[ \\\\t]*$', 'm').exec(code);
    if (!a || !b || b.index <= a.index) return null;
    return code.slice(a.index + a[0].length, b.index).replace(/^\\n/, '');
  }
  function stripComment(text) {
    return text.split('\\n').map(function (l) { var m = l.match(/^\\s*\\/\\/\\s?(.*)$/); return m ? m[1] : l; }).join('\\n').trim();
  }

  // ---- values into a block, leaving every comment where it is ----
  function setVarValues(block, values) {
    Object.keys(values).forEach(function (key) {
      var re = new RegExp('^(\\\\s*var\\\\s+' + key + '\\\\s*=\\\\s*)(.*?)(;.*)$', 'm');
      block = block.replace(re, function (all, head, old, tail) { return head + JSON.stringify(values[key]) + tail; });
    });
    return block;
  }

  // ---- sidebar, as the plugin's own list builder writes it ----
  var CHEV_OPEN = '<svg class="chevron-expanded" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9 7.5L6 4.5L3 7.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></svg>';
  var CHEV_SHUT = '<svg class="chevron-collapsed" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></svg>';
  function splitName(n) { var m = n.match(/^(.+?)\\s*\\/\\s*(.+)$/); return m ? { group: m[1].trim(), item: m[2].trim() } : { group: null, item: n }; }

  function listHtml(activeName) {
    var active = splitName(activeName).group;
    var help = scripts.filter(function (s) { return /^@Help/.test(s.name); });
    var prebuilt = scripts.filter(function (s) { return !/^@Help/.test(s.name); }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var groups = {}, order = [];
    prebuilt.forEach(function (s) {
      var sp = splitName(s.name);
      if (!groups[sp.group]) { groups[sp.group] = []; order.push(sp.group); }
      groups[sp.group].push({ item: sp.item, name: s.name });
    });
    order.sort(function (a, b) { return a.localeCompare(b); });
    function item(label, cls, isActive) { return '<div class="script-item ' + cls + ' ' + (isActive ? 'active' : '') + '"><div class="name">' + esc(label) + '</div></div>'; }
    function group(title, kids, open, selected, itemCls) {
      return '<div class="script-group ' + (selected ? 'selected' : '') + '"><div class="group-header ' + (selected ? 'selected' : '') + '">' +
        '<div class="section-toggle ' + (open ? '' : 'collapsed') + '">' + CHEV_OPEN + CHEV_SHUT + '</div><span>' + esc(title) + '</span></div>' +
        '<div class="group-content ' + (open ? '' : 'collapsed') + '">' + kids + '</div></div>';
    }
    var h = '<div class="system-scripts">';
    help.forEach(function (s) { h += item(s.name, '', false); });
    order.forEach(function (g) {
      var open = g === active;
      var kids = groups[g].map(function (k) { return item(k.item, 'system-script', k.name === activeName); }).join('');
      h += group(g, kids, open, open);
    });
    h += '</div><div class="divider"></div><div class="user-scripts local-scripts">';
    h += group('Local scripts', item('Brand tokens sync', 'user-script tree-depth-1', false) + item('Rename frames by layout', 'user-script tree-depth-1', false), true, false);
    return h + '</div>';
  }

  // ---- previews: the script's own @PREVIEW function ----
  var figmaStub = new Proxy(function () {}, { get: function () { return figmaStub; }, apply: function () { return figmaStub; } });
  function previewFor(script, cfg, modeName, tag) {
    var m = new RegExp('^[^\\\\S\\\\n]*\\\\/\\\\/[^\\\\S\\\\n]*@' + (tag || 'PREVIEW') + ':[^\\\\S\\\\n]*([A-Za-z_$][\\\\w$]*)', 'm').exec(script.code);
    if (!m) return '';
    var dom = /@fromFile:\\s*domains\\.(\\w+)/.exec(script.code);
    var imports = I.findImports(script.code).map(function (i) { return i.statement; }).join('\\n');
    var resolved = I.resolveImports(imports, scripts, { packageId: script.packageId });
    var body = resolved + '\\nreturn ' + m[1] + '(' + JSON.stringify(cfg) + ',' + JSON.stringify(dom ? dom[1] : '') + ',' + JSON.stringify(modeName) + ');';
    return new Function('figma', 'console', 'window', body)(figmaStub, console, window);
  }

  // Run a library expression with the script's own imports resolved, as the preview snippet does.
  function withImports(script, expr) {
    var imports = I.findImports(script.code).map(function (i) { return i.statement; }).join('\\n');
    var resolved = I.resolveImports(imports, scripts, { packageId: script.packageId });
    return new Function('figma', 'console', 'window', resolved + '\\nreturn ' + expr + ';')(figmaStub, console, window);
  }

  // The plugin gives every locked seed a middle point on each channel curve before it draws the strip
  // (colorsSyncLockedSeedMiddles) and writes the result back to the form. Without it a locked seed is pinned
  // onto a ramp that ignores it, and the seed stands out.
  function seeded(script, cfg) {
    return withImports(script,
      '(function (c) { var steps = colorsParseSteps(c.steps).steps; ' +
      'c.modes.forEach(function (m) { colorsSyncLockedSeedMiddles(c, m, steps); }); return c; })(' + JSON.stringify(cfg) + ')');
  }

  function fillSlot(slot, html) { R.fillContentReveal(slot, html || ''); }
  function placePreview(host, html) {
    var slots = [].slice.call(host.querySelectorAll('[data-preview-slot]'));
    if (slots.length > 1) {
      var parsed = document.createElement('div');
      parsed.innerHTML = html || '';
      var byName = {};
      [].forEach.call(parsed.querySelectorAll('[data-preview-for]'), function (p) { byName[p.getAttribute('data-preview-for')] = p.innerHTML; });
      slots.forEach(function (slot) {
        var name = slot.hasAttribute('data-preview-row') ? (slot.getAttribute('data-preview-row') || '') : '__panel__';
        fillSlot(slot, Object.prototype.hasOwnProperty.call(byName, name) ? byName[name] : '');
      });
    } else if (slots[0]) {
      fillSlot(slots[0], html);
    }
  }

  // ---- scoped sheets: library @STYLE blocks + the script's own, as the plugin injects them ----
  function injectStyles(script, roots, key) {
    var parts = I.collectStyleSheets(script.code, scripts, script.packageId, function (c) { var s = section(c, '@STYLE_START', '@STYLE_END'); return s ? stripComment(s) : ''; });
    var css = parts.join('\\n\\n').trim();
    if (!css) return;
    var owner = ((script.packageId || script.name) + '-' + key).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    roots.forEach(function (r) { r.setAttribute('data-style-owner', owner); });
    if (document.querySelector('style[data-style-owner="' + owner + '"]')) return;
    var res = S.scopeStylesheet(css, owner);
    if (!res.ok) throw new Error('stylesheet rejected: ' + res.errors.join('; '));
    var el = document.createElement('style');
    el.setAttribute('data-style-owner', owner);
    el.textContent = darkToClass(res.css);
    document.head.appendChild(el);
  }

  // ---- the Configuration UI form ----
  function buildForm(script, spec, host) {
    var isCode = !!section(script.code, '@CONFIG_START', '@CONFIG_END');
    var block = isCode ? section(script.code, '@CONFIG_START', '@CONFIG_END') : section(script.code, '@UI_CONFIG_START', '@UI_CONFIG_END');
    var cfg = null;
    if (spec.config) { cfg = D.configs[spec.config]; if (spec.config === 'Colors') cfg = seeded(script, cfg); block = P.fillConfigBlock(block, cfg).text; }
    if (spec.values) block = setVarValues(block, D[spec.values]);
    var panel = section(script.code, '@PANEL_START', '@PANEL_END');
    var schema = P.parse(block, panel || undefined);
    if (schema.error) throw new Error(script.name + ': ' + schema.error);
    R.buildForm(schema, host);
    var inst = R.attachListeners(host, schema, function () {});
    var coll = host.querySelector('[data-collection-field]');
    if (coll) R.populateCollectionControl(coll, D.collections, cfg ? cfg.collectionName : D.replaceVariables.sourceCollection, true);
    // Selects whose options the plugin fetches from the open file.
    [].forEach.call(host.querySelectorAll('select[data-option-source]'), function (sel) {
      var cur = sel.value || (sel.options[0] && sel.options[0].value);
      var src = sel.getAttribute('data-option-source');
      if (!/ollection/.test(src)) return;
      var list = src.indexOf('Target') !== -1 ? ['Create new collection…'].concat(D.collections) : ['(all collections)'].concat(D.collections);
      sel.innerHTML = list.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('');
      sel.value = cur && list.indexOf(cur) !== -1 ? cur : list[1];
    });
    if (cfg && script.code.indexOf('@PREVIEW:') !== -1) {
      var live = P.parseConfigBlockObject ? P.parseConfigBlockObject(block) : cfg;
      var firstMode = (live.modes && live.modes[0] && live.modes[0].name) || null;
      placePreview(host, previewFor(script, live, firstMode));
      // The Suggested section is a second slot, filled from the script's @SUGGESTIONS function.
      [].forEach.call(host.querySelectorAll('[data-suggestions-slot]'), function (slot) {
        R.fillContentReveal(slot, previewFor(script, live, firstMode, 'SUGGESTIONS') || '');
      });
      if (inst && inst.applyVisibility) inst.applyVisibility();
    }
    return schema;
  }

  // ---- Variable inspector hits: the script's own createVariableResult ----
  function inspectorResults(script) {
    var code = script.code;
    var from = code.indexOf('var createVariableResult');
    var to = code.indexOf('// ===== MAIN EXECUTION');
    var fn = code.slice(from, to);
    var cfgBlock = section(code, '@UI_CONFIG_START', '@UI_CONFIG_END');
    var info = find('CodeFig Libraries / @InfoPanel');
    var make = new Function('figma', 'console', 'window',
      cfgBlock + '\\n' +
      'function createHtmlResult(html, nodeIds, severity) { var r = { html: html, severity: severity || "error" }; if (Array.isArray(nodeIds)) r.nodeIds = nodeIds; else if (nodeIds) r.nodeId = nodeIds; return r; }\\n' +
      fn + '\\nreturn createVariableResult;');
    var createVariableResult = make(figmaStub, console, window);
    var results = [], n = 0, used = 0;
    D.inspector.forEach(function (g) {
      results.push({ html: '<div class="info-category-header"><div class="info-category-title">📁 ' + esc(g.collection) + ' (' + g.variables.length + ' variables)</div></div>', severity: 'info' });
      g.variables.forEach(function (v) {
        n++; used++;
        var vals = {}; Object.keys(v.values).forEach(function (m) { vals[m] = { formatted: v.values[m] }; });
        results.push(createVariableResult({
          variable: { name: v.name, resolvedType: v.type },
          collection: { name: g.collection },
          health: { status: v.status, score: v.score, issues: v.issues || [] },
          values: vals,
          usage: {
            nodes: v.nodes.map(function (x, i) { return { nodeId: n + ':' + i, nodeName: x[0], nodeType: x[1] }; }),
            styles: v.styles.map(function (x) { return { styleName: x[0], styleType: x[1] }; }),
            properties: new Set(v.props)
          }
        }));
      });
    });
    return { results: results, used: used };
  }

  function renderInfoPanel(frame, script) {
    var panel = frame.querySelector('.info-panel');
    var out = inspectorResults(script);
    panel.querySelector('.info-title').textContent = 'Variable Inspector: ' + out.used + ' used variables';
    var list = panel.querySelector('.info-list');
    list.innerHTML = '';
    out.results.forEach(function (r) {
      var item = document.createElement('div');
      item.className = 'info-result-item ' + (r.severity || 'info');
      item.innerHTML = r.html;
      if (r.nodeIds) item.style.cursor = 'pointer';
      list.appendChild(item);
    });
    panel.classList.add('open');
  }

  // ---- one screen ----
  function makeScreen(spec, index) {
    var script = find(spec.script);
    if (!script) throw new Error('no script named ' + spec.script);
    var wrap = document.createElement('section');
    wrap.className = 'mk-screen';
    wrap.id = spec.id;
    wrap.innerHTML = '<div class="mk-screen-head"><span class="mk-screen-no">' + (index + 1) + '</span><span class="mk-screen-title">' + esc(spec.title) + '</span></div>';
    document.querySelector('.mk-page').appendChild(wrap);
    ['light', 'dark'].forEach(function (theme) { makeFrame(wrap, spec, script, theme); });
    return wrap;
  }

  function makeFrame(wrap, spec, script, theme) {
    var dark = theme === 'dark';
    var holder = document.createElement('div');
    holder.className = 'mk-variant';
    holder.id = spec.id + (dark ? '-dark' : '-light');
    holder.innerHTML = '<div class="mk-variant-tag">' + (dark ? 'Dark' : 'Light') + '</div><div class="mk-frame' + (dark ? ' mk-dark' : '') + '">' + SHELL + '</div>';
    wrap.appendChild(holder);
    var frame = holder.querySelector('.mk-frame');

    frame.querySelector('.script-list').innerHTML = listHtml(script.name);
    frame.querySelector('.script-title').textContent = splitName(script.name).item;
    frame.querySelector('.script-status').textContent = 'Ready';

    var hasDocs = script.code.indexOf('@DOC_START') !== -1;
    var hasConfig = /@(UI_)?CONFIG_START/.test(script.code);
    var tabs = frame.querySelector('.editor-tabs');
    var tabKey = { config: 'configUI', docs: 'docs', source: 'source' }[spec.tab];
    [].forEach.call(tabs.querySelectorAll('.editor-tab'), function (t) {
      var k = t.getAttribute('data-tab');
      if ((k === 'configUI' && !hasConfig) || (k === 'docs' && !hasDocs)) { t.remove(); return; }
      t.classList.toggle('active', k === tabKey);
    });
    var panes = frame.querySelectorAll('.tab-content');
    var paneDocs = panes[0], paneConfig = panes[1], paneSource = panes[2];
    [paneDocs, paneConfig, paneSource].forEach(function (p) { p.classList.remove('active'); });

    var stale = frame.querySelector('.config-stale-note'); if (stale) stale.style.display = 'none';
    var noForm = frame.querySelector('.config-no-form'); if (noForm) noForm.style.display = 'none';
    var preview = frame.querySelector('.config-preview'); if (preview) preview.style.display = 'none';

    // Documentation
    if (hasDocs) {
      var md = stripComment(section(script.code, '@DOC_START', '@DOC_END'));
      paneDocs.querySelector('.docs-rendered').innerHTML = window.marked.parse(md, { gfm: true });
    }

    // Configuration UI
    var host = frame.querySelector('.config-ui-container');
    if (hasConfig) {
      host.style.display = '';
      host.innerHTML = '';
      buildForm(script, spec, host);
      // Radio names repeat across screens (modes-0-scaleType), and a name is one group per document, so the
      // last screen would uncheck every earlier one. Scoping the name to the screen keeps each choice.
      [].forEach.call(host.querySelectorAll('input[type=radio]'), function (r) {
        var on = r.checked;
        r.name = r.name + '--' + spec.id + '-' + theme;
        r.checked = on;
      });
      // Named modes start collapsed in the plugin; open the first the way a click would.
      if (spec.openFirstMode) { var chev = host.querySelector('[data-rows-collapse="0"]'); if (chev) chev.click(); }
      injectStyles(script, [host], spec.id);
    }

    // Source code
    var cm = null;
    if (spec.tab === 'source') {
    var ta = paneSource.querySelector('textarea');
    var cmHost = document.createElement('div');
    ta.parentNode.replaceChild(cmHost, ta);
    cm = CodeMirror(cmHost, {
      value: script.code, mode: 'javascript', theme: dark ? 'midnight' : 'default', lineNumbers: true, indentUnit: 2, tabSize: 2,
      lineWrapping: true, gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'], readOnly: true,
      viewportMargin: Infinity
    });
    cmHost.firstChild.classList.add('CodeMirror');
    cmHost.style.display = 'contents';
    }

    (spec.tab === 'docs' ? paneDocs : spec.tab === 'source' ? paneSource : paneConfig).classList.add('active');
    if (spec.tab !== 'source') paneSource.classList.remove('active');

    if (spec.infoPanel) {
      renderInfoPanel(frame, script);
      var ec = frame.querySelector('.editor-container');
      ec.style.minHeight = Math.max(480, frame.querySelector('.info-panel .info-header').offsetHeight + frame.querySelector('.info-list').scrollHeight + 40) + 'px';
    }
    if (cm) cm.refresh();
    return wrap;
  }

  // ---- page ----
  var page = document.querySelector('.mk-page');
  var toc = document.createElement('ul'); toc.className = 'mk-toc';
  D.screens.forEach(function (s, i) { toc.insertAdjacentHTML('beforeend', '<li><a href="#' + s.id + '">' + (i + 1) + ' · ' + esc(s.title) + '</a></li>'); });
  page.appendChild(toc);
  D.screens.forEach(function (s, i) { makeScreen(s, i); });

  // Form state lives in DOM properties, which a serialised page drops. Copy it into attributes.
  [].forEach.call(document.querySelectorAll('.mk-frame input'), function (i) {
    if (i.type === 'checkbox' || i.type === 'radio') { if (i.checked) i.setAttribute('checked', ''); else i.removeAttribute('checked'); }
    else i.setAttribute('value', i.value);
  });
  [].forEach.call(document.querySelectorAll('.mk-frame select'), function (sel) {
    [].forEach.call(sel.options, function (o) { if (o.selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
  });
  [].forEach.call(document.querySelectorAll('.CodeMirror textarea'), function (t) { var w = t.parentNode; if (w && w.parentNode) w.parentNode.removeChild(w); });
  [].forEach.call(document.querySelectorAll('.mk-frame textarea'), function (t) { t.textContent = t.value; });

  // A static file keeps no behaviour: drop CodeMirror's hidden input and every script.
  [].forEach.call(document.querySelectorAll('.CodeMirror textarea'), function (t) { var w = t.parentNode; if (w && w.parentNode) w.parentNode.removeChild(w); });
  document.documentElement.setAttribute('data-built', 'ok');
})();
`;
}

function harness() {
  const cm = path.join(ROOT, 'node_modules', 'codemirror');
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<title>CodeFig — UI, static</title>',
    '<meta name="viewport" content="width=1120">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">',
    '<style>/* CodeMirror */\n' + fs.readFileSync(path.join(cm, 'lib', 'codemirror.css'), 'utf8') + '</style>',
    '<style>/* CodeMirror midnight (the dark editor theme the plugin switches to) */\n' + fs.readFileSync(path.join(cm, 'theme', 'midnight.css'), 'utf8') + '</style>',
    '<style>/* src/ui.css, dark blocks rewritten to .mk-dark */\n' + darkToClass(read('src/ui.css')) + '</style>',
    '<style>/* page */\n' + PAGE_CSS + '</style>',
    '</head><body>',
    '<div class="mk-page">',
    '<h1 class="mk-title">CodeFig — the UI, static</h1>',
    '<p class="mk-lede">The plugin window as it ships, with invented values. Built from the real shell markup, stylesheet, renderer, preview functions, Markdown and editor, so every control, class and string is the plugin\'s own. Regenerate with <code>npm run build:ui-static</code>. The plugin window is 1000 &times; 600 and scrolls; here nothing scrolls, so each screen runs to its full height.</p>',
    '</div>',
    '<script>window.__DATA = ' + JSON.stringify(DATA).replace(/<\//g, '<\\/') + ';<\/script>',
    '<script>window.__SHELL = ' + JSON.stringify(shellMarkup()).replace(/<\//g, '<\\/') + ';<\/script>',
    '<script>' + lib('node_modules/marked/lib/marked.umd.js') + '<\/script>',
    '<script>' + lib('node_modules/codemirror/lib/codemirror.js') + '<\/script>',
    '<script>' + lib('node_modules/codemirror/mode/javascript/javascript.js') + '<\/script>',
    '<script>' + bezierGlobal().replace(/<\/script/gi, '<\\/script') + '<\/script>',
    '<script>' + lib('src/config-ui/parser.js') + '<\/script>',
    '<script>' + lib('src/config-ui/renderer.js') + '<\/script>',
    '<script>' + lib('src/import-resolver.js') + '<\/script>',
    '<script>' + lib('src/style-scoper.js') + '<\/script>',
    '<script>' + pageScript().replace(/<\/script/gi, '<\\/script') + '<\/script>',
    '</body></html>',
  ].join('\n');
}

// --- run Chrome, keep the DOM -------------------------------------------------------------------------

function chromeBinary() {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(mac)) return mac;
  throw new Error('Chrome not found. Set CHROME=/path/to/chrome.');
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codefig-ui-static-'));
  const src = path.join(tmp, 'harness.html');
  fs.writeFileSync(src, harness());

  const run = spawnSync(chromeBinary(), [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1120,2000',
    '--virtual-time-budget=8000', '--dump-dom', 'file://' + src,
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

  const dom = run.stdout || '';
  if (!/data-built="ok"/.test(dom)) {
    console.error(run.stderr.split('\n').filter((l) => !/task_policy_set|ERROR:/.test(l)).slice(0, 20).join('\n'));
    fs.writeFileSync(path.join(tmp, 'dump.html'), dom);
    throw new Error('the page did not finish building — inspect ' + path.join(tmp, 'dump.html'));
  }

  const staticDom = dom.replace(/<script[\s\S]*?<\/script>/g, '').replace(/\sdata-built="ok"/, '');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, '<!doctype html>\n<!-- GENERATED by build-ui-static.js - do not edit. -->\n' + staticDom);
  console.log('✅ ' + path.relative(ROOT, OUT) + ' (' + Math.round(staticDom.length / 1024) + ' kB, ' + SCREENS.length + ' screens)');
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('❌ ' + e.message); process.exit(1); }
}

module.exports = { DATA, SCREENS };
