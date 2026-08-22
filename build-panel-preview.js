/**
 * **A script's Configuration UI, in a browser, running the real renderer.** Dev only.
 *
 *     npm run preview:panel                            the Colors panel
 *     npm run preview:panel -- "Spacing"               any bundled script, by display name
 *     npm run preview:panel -- Colors collectionName="color - lime" steps="25, 50, 950"
 *
 * **The overrides are usually the point.** A panel that hides itself until a collection is chosen — which
 * Colors does, deliberately — renders as an empty *General* section from its shipped defaults, and that is
 * the one state nobody needs to look at. Each `key="value"` replaces that key's value in the config block
 * before it is parsed, so the page shows the panel as somebody using it would see it. Top-level string
 * keys only: this is a viewer, not a second config editor.
 *
 * Writes `artifacts/panel-preview.html` and prints the path. Nothing imports it, nothing ships it, and it
 * is regenerated rather than committed — it is a place to *look*, not a fixture.
 *
 * **Why this is not the style reference.** `artifacts/style-reference.html` is a specimen shelf: it renders
 * one control of each kind from `help-documentation.js` and exists so a font size can be *measured*. This
 * renders a real panel from a real script with a real config, which is the only way to answer "does this
 * look like the design" — a question about how controls sit next to each other, which a shelf of one of
 * each cannot answer. The chart came out 268px wide inside a 944px block for a week, and neither the
 * specimen shelf nor any test could see it, because both were looking at one control at a time.
 *
 * **And why it runs the renderer in the browser rather than serialising from the shim.** The shim reports
 * no element sizes, so a chart never measures itself and every handle draws as an ellipse — an artefact of
 * the harness, and indistinguishable from a bug. Loading `parser.js` and `renderer.js` as plain scripts is
 * also exactly how `dist/ui.html` loads them, so the page cannot drift from the plugin's own wiring.
 */
const fs = require('fs');
const path = require('path');

// From the validator, not from `build-scripts.js`: requiring that one *runs a build*, so a preview would
// rewrite `dist/` as a side effect of being asked to draw a page.
const { findAllScripts } = require('./validate-scripts.js');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'artifacts', 'panel-preview.html');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The `@CONFIG_START` or `@UI_CONFIG_START` block of a script, whichever it has. */
function configBlockOf(source, name) {
  const match = /@(?:UI_)?CONFIG_START\n([\s\S]*?)\/\/ @(?:UI_)?CONFIG_END/.exec(source);
  if (!match) throw new Error(name + ' has no config block to render');
  return match[1];
}

/**
 * Replace `key: "…"` with the value asked for, leaving the line's comment — and therefore its whole
 * annotation — untouched. The annotation is what the renderer reads; rewriting the value has to not
 * disturb it, which is why this is a surgical replace rather than a parse and reprint.
 */
function applyOverrides(block, overrides) {
  let out = block;
  const missed = [];
  Object.keys(overrides).forEach((key) => {
    const re = new RegExp('(^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*)"[^"]*"', 'm');
    if (!re.test(out)) { missed.push(key); return; }
    out = out.replace(re, (all, head) => head + JSON.stringify(overrides[key]));
  });
  if (missed.length) {
    throw new Error('no string key named ' + missed.join(', ') + ' in this config block');
  }
  return out;
}

/**
 * The `@import` list the sandbox would resolve, as a `window.CodeFigBezier` — the curve editor draws
 * nothing without it, which is what an empty plot in this page used to mean.
 */
function bezierGlobal() {
  const { BEZIER_UI_EXPORTS } = require('./build-bezier.js');
  const source = read('scripts/CODEFIG_LIBRARIES/@bezier.js').replace(/^@import .*$/gm, '');
  return source + '\nwindow.CodeFigBezier = { ' +
    BEZIER_UI_EXPORTS.map((n) => n + ': ' + n).join(', ') + ' };';
}

function build(wanted, overrides) {
  const scripts = findAllScripts(path.join(ROOT, 'scripts'));
  const want = String(wanted).toLowerCase();
  const script = scripts.find((s) => String(s.name || '').toLowerCase() === want) ||
    scripts.find((s) => String(s.filename || '').replace(/\.[^.]+$/, '').toLowerCase() === want) ||
    scripts.find((s) => String(s.name || '').toLowerCase().indexOf(want) !== -1);
  if (!script) {
    throw new Error('no script matches "' + wanted + '". Try one of:\n  ' +
      scripts.map((s) => s.name).join('\n  '));
  }

  const block = applyOverrides(configBlockOf(script.code, script.name), overrides || {});
  const page = [
    '<!doctype html><meta charset="utf-8">',
    '<title>' + script.name + ' — panel preview</title>',
    '<style>',
    '  body { margin: 0; background: #fff; font-family: Inter, system-ui, sans-serif; }',
    // The plugin's panel is a fixed width; this is the widest it gets, which is where a layout that
    // depends on its container shows its seams.
    '  .frame { width: 1040px; margin: 0 auto; padding: 24px; }',
    '  .note { max-width: 1040px; margin: 0 auto; padding: 16px 24px 0; color: #6b6b73; font-size: 13px; }',
    '</style>',
    '<style>' + read('src/ui.css') + '</style>',
    '<p class="note"><b>' + script.name + '</b> — the real renderer, the real stylesheet, the config the ' +
      'script ships with. Regenerate with <code>npm run preview:panel</code>.</p>',
    '<div class="frame"><div id="panel"></div></div>',
    '<script>' + bezierGlobal() + '<\/script>',
    // No `module`, so the UMD wrappers take their browser branch — the same way `dist/ui.html` loads them.
    '<script>' + read('src/config-ui/parser.js') + '<\/script>',
    '<script>' + read('src/config-ui/renderer.js') + '<\/script>',
    '<script>',
    // Kept on `window` so a rebuild can be driven from the console — which is how the panel behaves on a
    // committed edit, and the only way to see a bug that only appears after one.
    '  window.__block = ' + JSON.stringify(block) + ';',
    '  window.__rebuild = function () {',
    '    var again = ConfigUIParser.parse(window.__block);',
    '    var host = document.getElementById("panel");',
    '    host.innerHTML = "";',
    '    ConfigUIRenderer.buildForm(again, host);',
    '    ConfigUIRenderer.attachListeners(host, again, function () {});',
    '  };',
    '  var schema = ConfigUIParser.parse(window.__block);',
    '  var host = document.getElementById("panel");',
    '  ConfigUIRenderer.buildForm(schema, host);',
    '  ConfigUIRenderer.attachListeners(host, schema, function () {});',
    '<\/script>',
  ].join('\n');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, page);
  return { name: script.name, out: OUT };
}

if (require.main === module) {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const overrides = {};
  const words = [];
  args.forEach((arg) => {
    const pair = /^([A-Za-z0-9_$]+)=([\s\S]*)$/.exec(arg);
    if (pair) overrides[pair[1]] = pair[2]; else words.push(arg);
  });
  const wanted = words.join(' ') || 'Colors';
  try {
    const made = build(wanted, overrides);
    console.log('✅ ' + made.name + ' → ' + path.relative(ROOT, made.out));
  } catch (err) {
    console.error('❌ ' + err.message);
    process.exit(1);
  }
}

module.exports = { build };
