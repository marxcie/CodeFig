/**
 * B3 of `.plans/34-devtools-harness.md`: which of a panel's preview-family CSS classes
 * (`color-preview`, `*-ramp-preview-*`, `grid-preview-*`, `radius-preview-*`, `spacing-preview-*`
 * in `src/ui.css`) are actually used, once the `@PREVIEW` slot is filled with what that script's
 * own generator function would really produce.
 *
 * **Why this exists rather than just reading `preview:panel`'s output.** `build-panel-preview.js`
 * never executes a script's `@PREVIEW` function — only `parser.js`/`renderer.js` run — so the
 * preview slot is always empty there. Checked class coverage against that directly and got 0 of 7
 * `radius-preview-*` classes used on the Corner Radius panel *itself*, which is not a real
 * dead-code finding, it's this gap. This script closes it: find the script's `@PREVIEW:` function,
 * load its real dependency closure, call it with the script's own shipped config, inject the real
 * result, then check coverage.
 *
 * **What this check cannot see**, so it is not counted as "dead": a selector that matches an
 * element but is then overridden by something more specific, and a selector that only applies on
 * `:hover`, `:focus`, `:disabled` or similar — this only asks "does at least one element carry
 * this class right now", which is a real question but not the only one.
 *
 * Usage: `npm run devtools:css-coverage -- "<Script>" [override=value ...]`
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');
const { findAllScripts } = require('../validate-scripts.js');
const { build } = require('../build-panel-preview.js');
const parser = require('../src/config-ui/parser.js');

const ROOT = path.join(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'scripts', 'CODEFIG_LIBRARIES');

const PREVIEW_CLASS_PREFIXES = ['color-preview', 'color-ramp-preview', 'grid-preview', 'radius-preview', 'spacing-preview'];

/** Every distinct class name under the five preview families, read straight out of src/ui.css. */
function previewClassesFromCss() {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'ui.css'), 'utf8');
  const found = new Set();
  const re = /\.([a-zA-Z0-9_-]+)/g;
  let m;
  while ((m = re.exec(css))) {
    const name = m[1];
    if (PREVIEW_CLASS_PREFIXES.some((p) => name === p || name.startsWith(p + '-') || name.startsWith(p + '--'))) {
      found.add(name);
    }
  }
  return Array.from(found).sort();
}

/** Loads every DSF-relevant library at once, @import lines stripped — see the plan's own note on
 *  why chasing missing functions one at a time is slower than just loading the whole set. */
function loadAllLibs() {
  const sandbox = {};
  vm.createContext(sandbox);
  const files = fs.readdirSync(LIB_DIR).filter((f) => f.endsWith('.js') && f !== '@test-harness.js');
  const source = files.map((f) => fs.readFileSync(path.join(LIB_DIR, f), 'utf8').replace(/^@import.*$/gm, '')).join('\n');
  vm.runInContext(source, sandbox, { filename: 'libs' });
  return sandbox;
}

function findChromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

async function main() {
  const args = process.argv.slice(2);
  const overrides = {};
  const words = [];
  args.forEach((arg) => {
    const pair = /^([A-Za-z0-9_$]+)=([\s\S]*)$/.exec(arg);
    if (pair) overrides[pair[1]] = pair[2]; else words.push(arg);
  });
  const wanted = words.join(' ') || 'Colors';

  const scripts = findAllScripts(path.join(ROOT, 'scripts'));
  const want = wanted.toLowerCase();
  const script = scripts.find((s) => String(s.name || '').toLowerCase() === want) ||
    scripts.find((s) => String(s.name || '').toLowerCase().indexOf(want) !== -1);
  if (!script) throw new Error('no script matches "' + wanted + '"');

  const previewMatch = /\/\/ @PREVIEW:\s*(\w+)/.exec(script.code);
  if (!previewMatch) {
    console.log(script.name + ' has no @PREVIEW function — nothing to fill, nothing to check.');
    return;
  }
  const fnName = previewMatch[1];
  const domainMatch = /@fromFile:\s*domains\.(\w+)/.exec(script.code);
  const domain = domainMatch ? domainMatch[1] : want.replace(/\s+/g, '');

  const configMatch = /@(?:UI_)?CONFIG_START\n([\s\S]*?)\/\/ @(?:UI_)?CONFIG_END/.exec(script.code);
  const config = parser.parseConfigBlockObject(configMatch[1]);
  Object.keys(overrides).forEach((k) => { if (k in config) config[k] = overrides[k]; });
  const modeName = config.modes && config.modes[0] ? config.modes[0].name : null;

  const sandbox = loadAllLibs();
  if (typeof sandbox[fnName] !== 'function') {
    throw new Error(fnName + ' (from @PREVIEW:) did not load — check the library list in loadAllLibs()');
  }
  const previewHtml = sandbox[fnName](config, domain, modeName);

  const made = build(wanted, overrides);

  const executablePath = findChromePath();
  if (!executablePath) throw new Error('No local Chrome/Chromium found. Install Chrome or set an executablePath.');
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + made.out);
    await page.evaluate((html) => {
      const slot = document.querySelector('[data-preview-slot]');
      if (slot) slot.innerHTML = html;
    }, previewHtml);

    const classes = previewClassesFromCss();
    const result = await page.evaluate((classes) => {
      const used = [], dead = [];
      classes.forEach((c) => { (document.getElementsByClassName(c).length > 0 ? used : dead).push(c); });
      return { used, dead };
    }, classes);

    console.log(script.name + ' — @PREVIEW: ' + fnName + '(domain=' + domain + ', mode=' + modeName + ')');
    console.log('Used (' + result.used.length + '):');
    result.used.forEach((c) => console.log('  ' + c));
    console.log('Dead (' + result.dead.length + '):');
    result.dead.forEach((c) => console.log('  ' + c));
    console.log('\nNote: "used" means at least one element currently carries the class. A rule that');
    console.log('is overridden after matching, or only applies on :hover/:focus/:disabled, is not');
    console.log('distinguished from a plainly-used one by this check.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error('❌ ' + err.message); process.exit(1); });
