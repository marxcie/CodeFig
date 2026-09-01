/**
 * The target mockups, kept honest.
 *
 * `artifacts/mockup-panels/*-target.html` are the fixed goal for each panel: hand-written to Márton's
 * frames, using the plugin's own class names and linking `src/ui.css` rather than carrying styling.
 * That makes them useful and it makes them rot — a class the renderer stopped emitting, or a section
 * the design dropped, leaves a mockup quietly showing something the plugin will never produce.
 *
 * It already happened: after the suggestion cards lost their per-viewport badges, `grid-target.html`
 * kept showing them. A stale target is worse than none, because the next layout argument is settled
 * against it.
 *
 * So: every class a mockup uses must be **either** styled in `src/ui.css` **or** emitted by the code
 * that builds that markup. Nothing here checks appearance — that is what a browser is for.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DIR = path.join(root, 'artifacts', 'mockup-panels');

const CSS = fs.readFileSync(path.join(root, 'src', 'ui.css'), 'utf8');
const DSF_DIR = path.join(root, 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');
const LIB_DIR = path.join(root, 'scripts', 'CODEFIG_LIBRARIES');
/** Preview CSS: script and/or library `@STYLE_START` (not `package.css` / not only `ui.css`). */
function styleRegionsFrom(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .map((src) => {
      const start = src.indexOf('// @STYLE_START');
      const end = src.indexOf('// @STYLE_END');
      if (start < 0 || end < 0 || end <= start) return '';
      return src.slice(start, end);
    })
    .join('\n');
}
const DSF_STYLE = styleRegionsFrom(DSF_DIR) + '\n' + styleRegionsFrom(LIB_DIR);
const SOURCES = [
  fs.readFileSync(path.join(root, 'src', 'config-ui', 'renderer.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'src', 'ui.html'), 'utf8'),
].join('\n');

const styled = new Set(
  [...(CSS + '\n' + DSF_STYLE).matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])
);

/** A class counts as emitted if the source mentions it — including built by concatenation. */
function isEmitted(name) {
  if (SOURCES.indexOf('"' + name + '"') !== -1) return true;
  if (SOURCES.indexOf(name) !== -1) return true;
  // `config-ui-field--boolean` and friends are built by concatenation:
  // `"config-ui-field config-ui-field--" + t`. Matching the prefix inside a string literal is the
  // honest test — the suffix is a value, not a name anyone wrote down.
  const dynamic = /^(config-ui-field--|config-ui-input--)/.exec(name);
  return !!dynamic && new RegExp(dynamic[1].replace(/-/g, '\\-') + '" \\+').test(SOURCES);
}

function mockups() {
  return fs.readdirSync(DIR).filter((f) => f.endsWith('-target.html'));
}

test('there is a target mockup for each panel that has one designed', () => {
  const files = mockups();
  ['grid-target.html', 'spacing-target.html', 'typography-target.html', 'radius-target.html',
    'colors-target.html'].forEach((name) => {
    assert.ok(files.includes(name), name + ' is missing');
  });
});

test('every class a mockup uses is real: styled here, or emitted by the code', () => {
  mockups().forEach((file) => {
    const html = fs.readFileSync(path.join(DIR, file), 'utf8');
    const body = html.slice(html.indexOf('<body>'));
    const used = new Set();
    [...body.matchAll(/class="([^"]+)"/g)].forEach((m) => {
      m[1].split(/\s+/).filter(Boolean).forEach((c) => used.add(c));
    });

    const unknown = [...used]
      // `mock-*` is the page furniture each file declares for itself, and says so.
      .filter((c) => !c.startsWith('mock-'))
      .filter((c) => !styled.has(c) && !isEmitted(c));

    assert.deepEqual(unknown, [],
      file + ' uses classes that are neither styled nor emitted: ' + unknown.join(', ') +
      ' — either the mockup is stale or the class was renamed');
  });
});

test('a mockup links the real stylesheet and carries no styling of its own', () => {
  // The difference between these files and `ui-mockup.html`, which became a competing style source and
  // is where the boxing regression came from.
  mockups().forEach((file) => {
    const html = fs.readFileSync(path.join(DIR, file), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="\.\.\/\.\.\/src\/ui\.css">/, file);

    const styleBlock = /<style>([\s\S]*?)<\/style>/.exec(html);
    assert.ok(styleBlock, file + ' has no page-furniture block');
    const selectors = [...styleBlock[1].matchAll(/^\s*\.?([\w-]+)[^{]*\{/gm)].map((m) => m[1]);
    const leaked = selectors.filter((s) => s.startsWith('config-ui') || s.startsWith('grid-') ||
      s.startsWith('spacing-') || s.startsWith('type-'));
    assert.deepEqual(leaked, [],
      file + ' styles plugin classes locally: ' + leaked.join(', ') + ' — that belongs in src/ui.css');
  });
});

test('a section heading in a mockup is an h2, the way the plugin renders one', () => {
  // Configuration UI never emits h1: `// # Title` is level 1 and renders as `h2`. Docs keep h1.
  // A heading inside a `@blocks` row is `h3` (`#Seed` among columns is nested one level below the
  // section). A heading in a `config-ui-row--heading` wrapper is a section and must be `h2`.
  mockups().forEach((file) => {
    const html = fs.readFileSync(path.join(DIR, file), 'utf8');
    const levels = new Set([...html.matchAll(/<(h\d) class="config-ui-heading"/g)].map((m) => m[1]));
    assert.ok(levels.size > 0, file + ' has no headings at all, which cannot be right');

    const stray = [...levels].filter((tag) => tag !== 'h2' && tag !== 'h3');
    assert.deepEqual(stray, [], file + ' uses heading levels the plugin does not emit: ' + stray.join(', '));

    // Nested h3 only earns its place in a panel that has blocks to nest it in.
    if (levels.has('h3')) {
      assert.match(html, /config-ui-rows--blocks/,
        file + ' uses an h3 with no @blocks row to nest it in');
    }
  });
});
