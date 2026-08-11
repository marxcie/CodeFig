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

test('a script with no form says so rather than showing an empty tab', () => {
  const fn = UI.match(/function projectConfigIntoForm\(\)[\s\S]*?\n      \}/)[0];
  assert.match(fn, /has no form yet/);
  assert.match(fn, /they are the same config/, 'and that both tabs edit one thing');
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

test('a script with no form leaves no other script’s controls behind', () => {
  // Found by `readForm` on its first real use: the no-form path hid the container without emptying
  // it, so the previous script's controls were still in the DOM and reported as this script's.
  // Nothing reads them today — a no-form script merges from the code editor — but a stale form is a
  // loaded gun: the next thing to collect values from that container collects someone else's.
  const fn = UI.match(/function projectConfigIntoForm\(\)[\s\S]*?\n      \}/)[0];
  const branch = fn.slice(fn.indexOf('if (!scriptHasUIConfig)'));
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
