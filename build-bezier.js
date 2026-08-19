const fs = require('fs');
const path = require('path');
const { escapeScriptContent } = require('./build-utils.js');

const BLOCK_RE = /<script id="bezier-js">[\s\S]*?<\/script>/;

// The functions the config-ui renderer reaches for. Named rather than swept up automatically so that
// deleting one from the library is a build failure here, instead of a curve editor that renders and
// silently stops matching presets.
const EXPORTS = [
  'bezierAt',
  'bezierNormalise',
  'bezierIsEmpty',
  'bezierAnchorCount',
  'bezierSegments',
  'bezierWithMiddle',
  'bezierWithoutMiddle',
  'bezierJoin',
  'bezierSplit',
  'bezierFromEase',
  'bezierEaseName',
  'bezierEaseNames',
  'bezierEaseTable',
  'bezierParse',
  'bezierFormat'
];

/**
 * Inline scripts/CODEFIG_LIBRARIES/@bezier.js into HTML content (string).
 *
 * **The library is the single implementation**, exactly as `src/import-resolver.js` is. A user script
 * `@import`s it and the sandbox runs that text; the config UI needs the same maths to *draw* the curve,
 * and a second copy in `src/config-ui/` would be two answers to "where does this handle sit" — which is
 * the one question the editor exists to answer.
 *
 * `bezierEaseError` is deliberately **not** exported: it measures a preset against `applyEase`, which lives
 * in `@Math Helpers` and is not inlined here. It is a migration-reporting function that runs inside Figma,
 * where the import brings its own dependency.
 *
 * Does NOT write to src — used by build to produce dist/ui.html only.
 * @param {string} htmlContent - Full HTML from src/ui.html
 * @returns {string} HTML with the bezier library inlined
 */
function inlineBezier(htmlContent) {
  const source = fs
    .readFileSync(path.join(__dirname, 'scripts', 'CODEFIG_LIBRARIES', '@bezier.js'), 'utf8')
    .trim();

  if (!BLOCK_RE.test(htmlContent)) {
    throw new Error('bezier-js block not found in src/ui.html');
  }

  const missing = EXPORTS.filter((name) => !new RegExp('function\\s+' + name + '\\s*\\(').test(source));
  if (missing.length) {
    throw new Error('@bezier.js no longer defines: ' + missing.join(', '));
  }

  const wrapped =
    '(function () {\n' +
    source +
    '\n  window.CodeFigBezier = {\n' +
    EXPORTS.map((name) => '    ' + name + ': ' + name).join(',\n') +
    '\n  };\n})();';

  return htmlContent.replace(
    BLOCK_RE,
    () => '<script id="bezier-js">\n' + escapeScriptContent(wrapped) + '\n</script>'
  );
}

/**
 * The same library, loaded as an object — for anything that needs to *run* the maths outside a browser.
 *
 * `build-style-reference.js` renders the real renderer through the DOM shim, and the curve editor draws
 * nothing without this: it degrades to an empty canvas, which is exactly what the reference page showed
 * before this existed. `tests/config-ui-curve.test.js` wants the same object for the same reason.
 *
 * Shares `EXPORTS` with `inlineBezier` on purpose. Three copies of "which functions does the UI need" is
 * three things to forget when one is renamed.
 */
function loadBezierGlobal() {
  const source = fs.readFileSync(
    path.join(__dirname, 'scripts', 'CODEFIG_LIBRARIES', '@bezier.js'),
    'utf8'
  );
  const box = {};
  new Function(
    source + '\nthis.B = { ' + EXPORTS.map((n) => n + ': ' + n).join(', ') + ' };'
  ).call(box);
  return box.B;
}

module.exports = { inlineBezier, loadBezierGlobal, BEZIER_UI_EXPORTS: EXPORTS };
