/**
 * B4 of `.plans/34-devtools-harness.md`: how much DOM churn one render or one interaction causes.
 *
 * Two different measurements, because they answer two different questions:
 *   - **Full rebuild** (always measured): calls `window.__rebuild()`, which
 *     `build-panel-preview.js` exposes as exactly what happens on a committed config edit —
 *     `parser.parse` + `renderer.buildForm` + `attachListeners` again, from scratch.
 *   - **One interaction** (with `--click`): clicks a single element and counts what changes.
 *
 * **What this cannot answer**: "how many times does a real collection selection rebuild the
 * form" — that needs `requestAutoImport`, which does not exist in this static preview at all. Use
 * the real bridge's `readAutoImport` `seq` counter for that question instead (already used and
 * confirmed working — see `.plans/28-read-path-performance.md`).
 *
 * Usage:
 *   npm run devtools:rebuild-count -- "<Script>" [--click "<css selector>"] [override=value ...]
 */
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { build } = require('../build-panel-preview.js');

function findChromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

async function countMutations(page, action) {
  await page.evaluate(() => {
    window.__records = [];
    const form = document.querySelector('.frame');
    window.__observer = new MutationObserver((records) => {
      records.forEach((r) => window.__records.push({
        type: r.type, added: r.addedNodes.length, removed: r.removedNodes.length, attr: r.attributeName,
      }));
    });
    window.__observer.observe(form, { childList: true, subtree: true, attributes: true });
  });
  await action();
  // Let queued mutation records flush before reading them back.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  return page.evaluate(() => {
    window.__observer.disconnect();
    const recs = window.__records || [];
    const byType = {};
    recs.forEach((r) => { const k = r.type + (r.attr ? ':' + r.attr : ''); byType[k] = (byType[k] || 0) + 1; });
    return { total: recs.length, byType, childListAdds: recs.filter((r) => r.type === 'childList' && r.added > 0).length };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const overrides = {};
  const words = [];
  let clickSelector = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--click') { clickSelector = args[++i]; continue; }
    const pair = /^([A-Za-z0-9_$]+)=([\s\S]*)$/.exec(args[i]);
    if (pair) overrides[pair[1]] = pair[2]; else words.push(args[i]);
  }
  const wanted = words.join(' ') || 'Colors';

  const made = build(wanted, overrides);

  const executablePath = findChromePath();
  if (!executablePath) throw new Error('No local Chrome/Chromium found. Install Chrome or set an executablePath.');
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + made.out);

    const rebuild = await countMutations(page, () => page.evaluate(() => window.__rebuild()));
    console.log(made.name + ' — full rebuild (window.__rebuild()):');
    console.log('  total mutations: ' + rebuild.total + ', childList adds: ' + rebuild.childListAdds);
    console.log('  by type: ' + JSON.stringify(rebuild.byType));

    if (clickSelector) {
      const clickResult = await countMutations(page, async () => {
        const el = await page.$(clickSelector);
        if (!el) throw new Error('no element matches --click selector: ' + clickSelector);
        await el.click();
      });
      console.log('\n' + made.name + ' — one click on ' + clickSelector + ':');
      console.log('  total mutations: ' + clickResult.total + ', childList adds: ' + clickResult.childListAdds);
      console.log('  by type: ' + JSON.stringify(clickResult.byType));
    } else {
      console.log('\n(pass --click "<selector>" to also measure one interaction, e.g. a radio click)');
    }

    console.log('\nNote: this measures DOM churn in the static preview only. "Rebuilds per real');
    console.log('collection selection" needs requestAutoImport, which this page does not have —');
    console.log('use readAutoImport\'s seq counter via the real bridge for that question.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error('❌ ' + err.message); process.exit(1); });
