/**
 * Four tabs, two of which are views of one config.
 *
 * Plan 18 slice 1, and the paste-target gate's option B. The expensive part of B was always
 * "write a form's values back into a nested, commented object literal without wrecking it", and
 * that landed as `fillConfigBlock`. What is left is the rule about which side is authoritative.
 *
 * **The config block text is canonical; the form is a projection of it.** Editing the form writes
 * back through the serializer; showing the form re-reads the text. So there is never a divergence
 * to resolve and "last edit wins" falls out rather than being implemented — nothing has to decide
 * which side is fresher, because one side is derived.
 *
 * Source-level assertions, because the alternative is standing up CodeMirror to observe a class
 * toggle. The behaviour is verified through the bridge (`figma:ui -- readTabs`).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');

/** The tab buttons the markup declares, in order. */
function declaredTabs() {
  return (UI.match(/data-tab="([A-Za-z]+)"/g) || [])
    .map((m) => m.match(/"([A-Za-z]+)"/)[1])
    .filter((name, i, all) => all.indexOf(name) === i);
}

test('there are four tabs, in the designed order', () => {
  assert.deepEqual(declaredTabs(), ['configUI', 'configCode', 'docs', 'source']);
});

test('every tab button has a pane, and every pane a button', () => {
  // A tab that toggles nothing looks like a dead click, and a pane nothing reaches is dead weight.
  const panes = { configUI: 'tabConfigUI', configCode: 'tabConfigCode', docs: 'tabDocs', source: 'tabSource' };
  for (const tab of declaredTabs()) {
    assert.ok(panes[tab], 'no pane mapped for tab ' + tab);
    assert.match(UI, new RegExp('id="' + panes[tab] + '"'), 'missing pane ' + panes[tab]);
  }
});

test('the old tab names are gone, so nothing can switch to one', () => {
  // `switchTab('config')` would silently activate nothing: every pane toggle compares against a
  // name, and a stale literal fails no assertion at run time.
  assert.equal(/switchTab\('config'\)/.test(UI), false);
  assert.equal(/switchTab\('script'\)/.test(UI), false);
  assert.equal(/currentTab === 'config'/.test(UI), false);
  assert.equal(/currentTab === 'script'/.test(UI), false);
});

test('both config tabs are treated as config, through one predicate', () => {
  // Two literals compared in five places is how one of them gets missed. `isConfigTab` is the
  // single question, so a third config view would be one edit.
  assert.match(UI, /function isConfigTab\(name\) \{[\s\S]*?return name === 'configUI' \|\| name === 'configCode';/);
  const uses = UI.match(/isConfigTab\(/g) || [];
  assert.ok(uses.length >= 4, 'expected the predicate to be used, found ' + uses.length);
});

test('leaving a config tab folds the edit back into the canonical text first', () => {
  // The whole conflict rule rests on this: the other view must read current content, not what was
  // there before the last keystroke.
  assert.match(
    UI,
    /if \(isConfigTab\(previous\) && !isConfigTab\(tabName\) && scriptHasConfig\) mergeConfigIntoMain\(\);/
  );
});

test('showing the form re-projects it from the text', () => {
  assert.match(UI, /if \(tabName === 'configUI' && scriptHasConfig\) \{\s*\n\s*projectConfigIntoForm\(\);/);
  assert.match(UI, /function projectConfigIntoForm\(\)/);
});

test('a config block that does not parse makes the form read-only', () => {
  // Writing through a form projected from the last version that parsed would overwrite the broken
  // text with stale values — losing the edit someone was halfway through.
  const fn = UI.match(/function projectConfigIntoForm\(\)[\s\S]*?\n      \}/);
  assert.ok(fn, 'projectConfigIntoForm not found');
  assert.match(fn[0], /if \(!schema\) \{[\s\S]*?configFormReadOnly = true;/);
  assert.match(fn[0].replace(/\s+/g, ' '), /showing the last ' \+\s*'version it could read/);
});

test('whether a form exists is decided by the block, not by which marker it uses', () => {
  // **Changed in slice 2.** The parser reads property lists now, so a `@CONFIG_START` block builds a
  // form as readily as a `var`-row one — which is the point of the whole restructure: the block stays
  // the thing you paste and is also a form. `scriptHasUIConfig` still says which *marker* is in use,
  // because `extractConfigSection` needs that; it stopped meaning "has a form".
  const fn = UI.match(/function projectConfigIntoForm\(\)[\s\S]*?\n      \}/)[0];
  assert.match(fn, /formFields\.length === 0/, 'the test is whether the block yields fields');
  assert.equal(/if \(!scriptHasUIConfig\) \{/.test(fn), false,
    'the marker must not decide whether a form is shown');
  assert.match(fn, /no settings a form can show/, 'and the empty case still says so');
});

test('Configuration UI is the default for any script with a config', () => {
  assert.match(UI, /const initialTab = scriptHasConfig \? 'configUI' : 'source';/);
});

test('a script with a config always offers both views', () => {
  // Not one tab or the other depending on which markers the script uses: the structure is the same
  // for every script, and the form tab explains itself when there is no form.
  assert.match(UI, /if \(parsedSections\.hasConfig\) \{ tabs\.push\('configUI'\); tabs\.push\('configCode'\); \}/);
});

test('the preview follows the active config tab, and there is one of it', () => {
  // Plan 21 put the preview beside the controls. With two config views it belongs beside whichever
  // one you are editing — moved rather than duplicated, because two nodes would share an id.
  assert.equal((UI.match(/id="configPreview"/g) || []).length, 1);
  assert.match(UI, /host && preview\.parentNode !== host\) host\.appendChild\(preview\)/);
});

test('readTabs reports what a verifier needs to see', () => {
  const fn = UI.match(/case 'readTabs': \{[\s\S]*?\n          \}/);
  assert.ok(fn, 'readTabs case not found');
  for (const key of ['current', 'shown', 'hasUiConfig', 'formReadOnly', 'staleNote', 'noFormNote']) {
    assert.match(fn[0], new RegExp(key + ':'), 'readTabs does not report ' + key);
  }
});

test('a config with nothing showable leaves no other script’s controls behind', () => {
  // Found by `readForm` on its first real use: the no-form path hid the container without emptying
  // it, so the previous script's controls were still in the DOM and reported as this script's.
  // Nothing reads them today — a no-form script merges from the code editor — but a stale form is a
  // loaded gun: the next thing to collect values from that container collects someone else's.
  const fn = UI.match(/function projectConfigIntoForm\(\)[\s\S]*?\n      \}/)[0];
  const branch = fn.slice(fn.indexOf('if (parsedForForm && formFields.length === 0)'));
  assert.match(branch, /configUIContainer\.innerHTML = ''/, 'the container is emptied, not just hidden');
  assert.match(branch, /configUIInstance = null/, 'and the instance is dropped with it');
});

test('switchTab refuses a tab this script does not offer', () => {
  // Silently doing nothing would report success and leave a verifier reading the wrong pane —
  // which is worse than an error, because it looks like the assertion passed.
  const fn = UI.match(/case 'switchTab': \{[\s\S]*?\n          \}/);
  assert.ok(fn, 'switchTab case not found');
  assert.match(fn[0], /throw new Error\('No tab "'/);
  assert.match(fn[0], /switchTab\(wanted\)/, 'and it calls the same function the button calls');
});

test('which view the merge reads is decided by which view you are in', () => {
  // The defect slice 1 shipped with: the merge preferred the form whenever one had been rendered,
  // so typing into Configuration code on a form script did nothing — the form's values were
  // serialised over the text on the next merge. That is the canonical-text rule backwards. Found by
  // `writeConfig` reporting the old block after writing a new one.
  const fn = UI.match(/function mergeConfigIntoMain\(\)[\s\S]*?\n        const before =/);
  assert.ok(fn, 'mergeConfigIntoMain not found');
  assert.match(fn[0], /const fromForm = currentTab === 'configUI' &&/,
    'the form is only authoritative while the form is the view you are in');
  assert.match(fn[0], /configContent = configEditor \? configEditor\.getValue\(\) : ''/,
    'and Configuration code is authoritative otherwise');
});

test('a helper line belongs to its field, and renders under the control', () => {
  // The frames put helper text under the input. A comment line above the field is a paragraph row
  // instead — it sits at the label's left edge and reads as prose about the section rather than as an
  // explanation of that input. `@helper:` attaches it to the field; the renderer puts it in the grid's
  // second column, which is what lands it under the control.
  const P = require('../src/config-ui/parser.js');
  const line = 'extensionColumns: 0, // @label: Extra columns @helper: Just numeric variables';
  const f = P.parse(line).rows.filter((r) => r.type === 'field')[0];
  assert.equal(f.helper, 'Just numeric variables');
  assert.equal(f.label, 'Extra columns', 'and it does not swallow the label');
  assert.equal(P.serialize(P.parse(line), {}), line, 'and survives untouched');

  const renderer = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );
  assert.match(renderer, /if \(field\.helper\) \{[\s\S]{0,200}row\.appendChild\(helper\)/,
    'the note goes in the field row, not after it');
  const css = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'ui.css'), 'utf8'
  );
  assert.match(css, /\.config-ui-field-note \{[\s\S]{0,160}grid-column: 2/);

  // And no row gap: the helper is a second grid row, so a row gap would put 12px between a control
  // and the text explaining it. The note's own 4px margin is that spacing.
  const fieldRow = css.match(/\.config-ui-field__row \{[^}]*\}/);
  assert.ok(fieldRow, 'the field row rule is missing');
  assert.match(fieldRow[0], /row-gap: 0;/);
  assert.equal(/^\s*gap:/m.test(fieldRow[0]), false,
    'a shorthand gap is back, which applies to rows as well as columns');
});

test('the space around a section divider is symmetric', () => {
  // It was 12 above and 28 below — the previous row's margin plus the heading's own 16 — which read as
  // the rule belonging to the section above it rather than separating two.
  const css = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'ui.css'), 'utf8'
  );
  assert.match(css, /\.config-ui-row--divider \+ \.config-ui-row--heading h2 \{\s*\n\s*margin-top: 0;/);
});
