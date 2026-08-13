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
const SOURCES = [
  fs.readFileSync(path.join(root, 'src', 'config-ui', 'renderer.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'scripts', 'CODEFIG_LIBRARIES', '@foundation.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'src', 'ui.html'), 'utf8'),
].join('\n');

const styled = new Set([...CSS.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

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
  ['grid-target.html', 'spacing-target.html', 'typography-target.html', 'radius-target.html'].forEach((name) => {
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

test('a section heading in a mockup is an h1, the way the plugin renders one', () => {
  // `// # Title` parses as level 1, so the plugin emits `h1`. A mockup using `h2` is styled as a
  // *within-section* title and reads a size too small — the same mismatch that made a heading fix
  // land on a rule that never fired.
  mockups().forEach((file) => {
    const html = fs.readFileSync(path.join(DIR, file), 'utf8');
    const headings = [...html.matchAll(/<(h\d) class="config-ui-heading"/g)].map((m) => m[1]);
    const wrong = headings.filter((tag) => tag !== 'h1');
    assert.deepEqual(wrong, [], file + ' has section headings that are not h1: ' + wrong.join(', '));
  });
});
