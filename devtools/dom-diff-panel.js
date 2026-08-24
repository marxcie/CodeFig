/**
 * A DOM-level regression gate for a `@PANEL_START` migration: render a panel through the old
 * parser and through its `@PANEL_START` fixture, both via the real `renderer.js`, and fail on any
 * difference that is not one of three named, accepted classes. This is the permanent form of the
 * check that found the `attachTo` gap — the schema-level differential test in
 * `tests/config-ui-panel-spec-colors.test.js` compares `.rows`, and structurally cannot see a
 * `foldProse` render-time attachment decision; this renders the actual DOM both ways and diffs it.
 *
 * Needs a local Chrome/Chromium (`puppeteer-core`, no bundled browser) — the same requirement
 * `devtools/assert-layout.js` already has, and the reason this lives here rather than in
 * `tests/**\/*.test.js`: that glob is `npm test`'s default run, which CI executes with no browser
 * installed. Dev only, its own script.
 *
 *     npm run devtools:dom-diff-panel
 *
 * **The three accepted classes, named rather than a fuzzy tolerance:**
 *
 * 1. `data-row-index` value-only differences. The old schema carries invisible placeholder rows
 *    (`directive`, `line-break`, and the parser's bare-`<div>` fallback for `blank`) that the JSON
 *    format has no reason to emit — "present in the block, absent from the panel" per
 *    `renderer.js`'s own comment on `directive`. Both trees are stripped of these before diffing
 *    (their node counts must then match exactly, or something *did* change), which shifts every
 *    later row's index by a constant the JSON side never has — a counting artefact, not a render
 *    difference.
 * 2. `data-info` values equal after whitespace-collapsing. A paragraph in a `.js` file's comments
 *    hard-wraps at whatever column the file is kept to; a JSON string has no such constraint. Both
 *    render through the same `marked.parse` in `fillTip` (`renderer.js`), whose own comment is
 *    "a newline in the source is a wrap, not a break" — so the two render identically once shown,
 *    and only the raw attribute (never itself displayed) differs.
 * 3. Nothing else, currently. Anything that fails neither 1 nor 2 is real and fails the run.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { build, buildFromPanelSpec } = require('../build-panel-preview.js');
const { COLORS_PANEL_SPEC, COLORS_VALUES_BLOCK, innerPanelSpec } = require('../tests/fixtures/colors-panel-spec.js');

function findChromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

// `directive`/`line-break` rows, and the bare-`<div>` fallback `buildRow` returns for anything
// else it does not recognise (in practice: `blank`) -- see the module comment, class 1.
const INVISIBLE_ROW_CLASSES = ['config-ui-row--directive', 'config-ui-row--line-break'];

async function serializePanel(page) {
  return page.evaluate((invisibleClasses) => {
    function isInvisibleRow(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      if (invisibleClasses.some((c) => node.classList.contains(c))) return true;
      if (node.tagName === 'DIV' && node.parentElement && node.parentElement.id === 'panel') {
        const attrNames = Array.from(node.attributes).map((a) => a.name);
        if (attrNames.length === 1 && attrNames[0] === 'data-row-index' && node.childNodes.length === 0) {
          return true;
        }
      }
      return false;
    }
    function serialize(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.trim();
        return t ? { type: 'text', text: t } : null;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      if (isInvisibleRow(node)) return null;
      const attrs = Array.from(node.attributes).map((a) => [a.name, a.value]);
      const children = Array.from(node.childNodes).map(serialize).filter(Boolean);
      return { type: 'el', tag: node.tagName.toLowerCase(), attrs, children };
    }
    return serialize(document.getElementById('panel'));
  }, INVISIBLE_ROW_CLASSES);
}

function pathStr(p) { return p.length ? p.join(' > ') : '#panel'; }

function whitespaceCollapsed(s) { return String(s).replace(/\s+/g, ' ').trim(); }

/** Class 1 or 2 from the module comment, or `null` if this is a real difference. */
function cosmeticClass(entry) {
  if (entry.attr === 'data-row-index') return 'row-index';
  if (entry.attr === 'data-info' && whitespaceCollapsed(entry.a) === whitespaceCollapsed(entry.b)) {
    return 'wrap-only data-info';
  }
  return null;
}

function diffNodes(a, b, p, out) {
  if (!a && !b) return;
  if (!a || !b) { out.push({ path: pathStr(p), detail: `one side missing (a=${a ? a.type : 'null'}, b=${b ? b.type : 'null'})` }); return; }
  if (a.type !== b.type) { out.push({ path: pathStr(p), detail: `node type differs (a=${a.type}, b=${b.type})` }); return; }
  if (a.type === 'text') {
    if (a.text !== b.text) out.push({ path: pathStr(p), detail: `text differs (a="${a.text}", b="${b.text}")` });
    return;
  }
  if (a.tag !== b.tag) { out.push({ path: pathStr(p), detail: `tag differs (a=<${a.tag}>, b=<${b.tag}>)` }); return; }
  const aKeys = a.attrs.map((x) => x[0]).join(',');
  const bKeys = b.attrs.map((x) => x[0]).join(',');
  if (aKeys !== bKeys) {
    out.push({ path: pathStr(p), tag: a.tag, detail: `attribute order/set differs (a=[${aKeys}], b=[${bKeys}])` });
  }
  const aMap = Object.fromEntries(a.attrs);
  const bMap = Object.fromEntries(b.attrs);
  new Set([...Object.keys(aMap), ...Object.keys(bMap)]).forEach((name) => {
    if (aMap[name] !== bMap[name]) {
      out.push({ path: pathStr(p), tag: a.tag, attr: name, a: aMap[name], b: bMap[name],
        detail: `<${a.tag}> attr "${name}" differs (a="${aMap[name]}", b="${bMap[name]}")` });
    }
  });
  const max = Math.max(a.children.length, b.children.length);
  for (let i = 0; i < max; i++) {
    const ac = a.children[i], bc = b.children[i];
    const label = ac ? (ac.type === 'el' ? ac.tag : 'text') : (bc ? (bc.type === 'el' ? bc.tag : 'text') : '?');
    diffNodes(ac, bc, [...p, `${label}[${i}]`], out);
  }
}

function countNodes(n) {
  if (!n) return 0;
  if (n.type === 'text') return 1;
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}

/**
 * One comparison: an old-parser page (`build()`, a shipped script) against a `@PANEL_START` page
 * (`buildFromPanelSpec()`, a fixture — or, once a script has actually migrated, that script's own
 * `@PANEL_START` region). Returns `{ real, cosmetic, oldCount, newCount }`; `real.length === 0` is
 * the pass condition.
 */
async function diffCase(name, oldMade, newMade) {
  const executablePath = findChromePath();
  if (!executablePath) throw new Error('No local Chrome/Chromium found — see findChromePath().');
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const pageOld = await browser.newPage();
    await pageOld.goto('file://' + oldMade.out);
    const oldTree = await serializePanel(pageOld);

    const pageNew = await browser.newPage();
    await pageNew.goto('file://' + newMade.out);
    const newTree = await serializePanel(pageNew);

    const diffs = [];
    diffNodes(oldTree, newTree, [], diffs);

    const real = [];
    const cosmetic = [];
    diffs.forEach((d) => {
      const cls = cosmeticClass(d);
      if (cls) cosmetic.push(Object.assign({ class: cls }, d));
      else real.push(d);
    });

    return { name, real, cosmetic, oldCount: countNodes(oldTree), newCount: countNodes(newTree) };
  } finally {
    await browser.close();
  }
}

/** The one case that exists today: Colors, old script vs. its hand-authored `@PANEL_START` fixture.
 *  Add a case here per script as its own fixture lands (Spacing, Typography, …) — the comparison
 *  itself is generic; only the two `build*()` calls are per-script. */
async function runCases() {
  const oldMade = build('Colors', { collectionName: 'color - lime', steps: '25, 50, 950' });
  const newMade = buildFromPanelSpec(
    'Colors (@PANEL_START fixture)',
    COLORS_VALUES_BLOCK, innerPanelSpec(COLORS_PANEL_SPEC),
    { collectionName: 'color - lime', steps: '25, 50, 950' }
  );
  return [await diffCase('Colors', oldMade, newMade)];
}

async function main() {
  const results = await runCases();
  let anyReal = false;
  results.forEach((r) => {
    console.log(`\n${r.name}: ${r.oldCount} vs ${r.newCount} nodes, ` +
      `${r.cosmetic.length} cosmetic difference(s), ${r.real.length} real difference(s)`);
    if (r.cosmetic.length) {
      console.log('  cosmetic (accepted):');
      r.cosmetic.forEach((d, i) => console.log(`    ${i + 1}. [${d.class}] ${d.path}: ${d.detail}`));
    }
    if (r.real.length) {
      anyReal = true;
      console.log('  REAL (failing):');
      r.real.forEach((d, i) => console.log(`    ${i + 1}. ${d.path}: ${d.detail}`));
    }
  });
  if (anyReal) {
    console.error('\n❌ real DOM differences found — see above.');
    process.exit(1);
  }
  console.log('\n✅ zero real differences.');
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { diffCase, runCases, cosmeticClass, INVISIBLE_ROW_CLASSES };
