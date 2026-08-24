/**
 * B2 of `.plans/34-devtools-harness.md`: turns a layout claim about a rendered panel into a real
 * assertion instead of a look-and-judge. Renders a script via `build-panel-preview.js`, injects a
 * CSS rule, reads back real computed values for whatever it matches.
 *
 * This is a claim about layout and styling only — see the standing note in
 * `.plans/34-devtools-harness.md`: a number from this script is not a claim about the plugin's
 * live behaviour, because the page has no `controller.js`/`bridge.js` and no Figma backend.
 *
 * Usage:
 *   npm run devtools:assert-layout -- "<Script>" --selector "<css>" --css "<rule text>" [override=value ...]
 *
 * Example (plan 29's own done-when, which currently fails — see B2):
 *   npm run devtools:assert-layout -- "Colors" collectionName="color - lime" \
 *     --selector "[data-section=hue]" \
 *     --css "[data-section=\"hue\"]{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}"
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { build } = require('../build-panel-preview.js');

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
  let selector = null, cssRule = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--selector') { selector = args[++i]; continue; }
    if (args[i] === '--css') { cssRule = args[++i]; continue; }
    const pair = /^([A-Za-z0-9_$]+)=([\s\S]*)$/.exec(args[i]);
    if (pair) overrides[pair[1]] = pair[2]; else words.push(args[i]);
  }
  if (!selector || !cssRule) throw new Error('usage: --selector "<css>" --css "<rule text>" is required');
  const wanted = words.join(' ') || 'Colors';

  const made = build(wanted, overrides);

  const executablePath = findChromePath();
  if (!executablePath) throw new Error('No local Chrome/Chromium found. Install Chrome or set an executablePath.');
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + made.out);
    const result = await page.evaluate((selector, cssRule) => {
      const style = document.createElement('style');
      style.textContent = cssRule;
      document.head.appendChild(style);
      const matches = Array.from(document.querySelectorAll(selector));
      return {
        matchCount: matches.length,
        elements: matches.slice(0, 10).map((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            tag: el.tagName, cls: el.className.toString().slice(0, 60),
            box: { w: Math.round(r.width), h: Math.round(r.height) },
            display: cs.display, gridTemplateColumns: cs.gridTemplateColumns, gridColumn: cs.gridColumn,
          };
        }),
      };
    }, selector, cssRule);

    console.log(made.name + ' — asserting ' + selector);
    console.log('Rule injected: ' + cssRule);
    console.log('Matches: ' + result.matchCount);
    if (result.matchCount === 0) {
      console.log('FAIL — selector matches nothing. The assertion cannot pass; nothing to measure.');
    } else {
      result.elements.forEach((el, i) => {
        console.log('  [' + i + '] ' + el.tag + '.' + el.cls + ' box=' + el.box.w + 'x' + el.box.h +
          ' display=' + el.display + ' grid-template-columns=' + el.gridTemplateColumns +
          ' grid-column=' + el.gridColumn);
      });
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error('❌ ' + err.message); process.exit(1); });
