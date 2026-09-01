/**
 * Configuration tabs: form is the live surface; Configuration code chrome is gone (Plan 37).
 *
 * Plan 18 slice 1, and the paste-target gate's option B. The expensive part of B was always
 * "write a form's values back into a nested, commented object literal without wrecking it", and
 * that landed as `fillConfigBlock`. What is left is the rule about which side is authoritative.
 *
 * **The config block text is canonical; the form is a projection of it.** Editing the form writes
 * back through the serializer; showing the form re-reads the text. So there is never a divergence
 * to resolve and "last edit wins" falls out rather than being implemented — nothing has to decide
 * which side is fresher, because one side is derived. Source holds `@CONFIG_*` / `@PANEL_*`.
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

test('there are three tab buttons in markup (configCode deleted)', () => {
  assert.deepEqual(declaredTabs(), ['configUI', 'docs', 'source']);
  assert.equal(/data-tab="configCode"/.test(UI), false);
  assert.equal(/id="tabConfigCode"/.test(UI), false);
  assert.equal(/id="codeConfig"/.test(UI), false);
  assert.equal(/id="configCodeContainer"/.test(UI), false);
  assert.equal(/id="codePanelSpec"/.test(UI), false);
  assert.equal(/CodeMirror\.fromTextArea\(codeConfig/.test(UI), false);
});

test('every tab button has a pane, and every pane a button', () => {
  const panes = { configUI: 'tabConfigUI', docs: 'tabDocs', source: 'tabSource' };
  for (const tab of declaredTabs()) {
    assert.ok(panes[tab], 'no pane mapped for tab ' + tab);
    assert.match(UI, new RegExp('id="' + panes[tab] + '"'), 'missing pane ' + panes[tab]);
  }
});

test('the old tab names are gone, so nothing can switch to one', () => {
  assert.equal(/switchTab\('config'\)/.test(UI), false);
  assert.equal(/switchTab\('script'\)/.test(UI), false);
  assert.equal(/switchTab\('configCode'\)/.test(UI), false);
  assert.equal(/currentTab === 'config'/.test(UI), false);
  assert.equal(/currentTab === 'script'/.test(UI), false);
});

test('configUI is treated as config, through one predicate', () => {
  assert.match(UI, /function isConfigTab\(name\) \{[\s\S]*?return name === 'configUI';/);
  const uses = UI.match(/isConfigTab\(/g) || [];
  assert.ok(uses.length >= 4, 'expected the predicate to be used, found ' + uses.length);
});

test('leaving a config tab folds the edit back into the canonical text first', () => {
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
  const fn = UI.match(/function projectConfigIntoForm\(\)[\s\S]*?\n      \}/);
  assert.ok(fn, 'projectConfigIntoForm not found');
  assert.match(fn[0], /if \(!schema\) \{[\s\S]*?configFormReadOnly = true;/);
  assert.match(fn[0].replace(/\s+/g, ' '), /showing the last ' \+\s*'version it could read/);
  assert.match(fn[0], /The config in Source has an error/);
});

test('a config block that yields no fields does not keep a dead-end note', () => {
  const fn = UI.match(/function projectConfigIntoForm\(\)[\s\S]*?\n      \}/)[0];
  assert.match(fn, /formFields\.length === 0/, 'the test is whether the block yields fields');
  assert.equal(/if \(!scriptHasUIConfig\) \{/.test(fn), false,
    'the marker must not decide whether a form is shown');
  assert.equal(/no settings a form can show/.test(fn), false,
    'empty form must not leave a Configuration UI dead-end note');
});

test('unsupported fields point at Source, not Configuration code', () => {
  const fn = UI.match(/function projectConfigIntoForm\(\)[\s\S]*?\n      \}/)[0];
  assert.match(fn, /only editable in Source/);
  assert.equal(/only editable in Configuration code/.test(fn), false);
});

test('section markers must be alone on a // line', () => {
  assert.match(UI, /function sectionMarkerRe\(marker\)/);
  assert.match(UI, /function hasSection\(code, startMarker\) \{[\s\S]*?sectionMarkerRe\(startMarker\)\.test\(code\)/);
  assert.equal(/code\.indexOf\('\/\/ ' \+ startMarker\)/.test(UI), false,
    'prose mentions of // @CONFIG_START must not count as a section');
});

test('Configuration UI is offered only when the block yields form fields', () => {
  assert.match(UI, /function configOffersForm\(sections\)/);
  assert.match(UI, /scriptHasConfig = configOffersForm\(parsedSections\)/);
  assert.match(UI, /if \(scriptHasConfig\) tabs\.push\('configUI'\)/);
  assert.equal(/if \(parsedSections\.hasConfig\) tabs\.push\('configUI'\)/.test(UI), false);
});

test('Configuration UI is the default when a form exists', () => {
  assert.match(UI, /const initialTab = scriptHasConfig \? 'configUI' : 'source';/);
});

test('a script with a form offers Configuration UI only', () => {
  assert.match(UI, /if \(scriptHasConfig\) tabs\.push\('configUI'\)/);
  assert.equal(/configEditor/.test(UI), false, 'second config editor must be gone');
  assert.equal(/tabs\.push\('configCode'\)/.test(UI), false);
});

test('the preview follows Configuration UI, and there is one of it', () => {
  assert.equal((UI.match(/id="configPreview"/g) || []).length, 1);
  assert.match(UI, /tabName === 'configUI' && tabConfigUIEl/);
  assert.equal(/tabName === 'configCode'/.test(UI), false);
});

test('readTabs reports what a verifier needs to see', () => {
  const fn = UI.match(/case 'readTabs': \{[\s\S]*?\n          \}/);
  assert.ok(fn, 'readTabs case not found');
  for (const key of ['current', 'shown', 'hasUiConfig', 'formReadOnly', 'staleNote', 'noFormNote']) {
    assert.match(fn[0], new RegExp(key + ':'), 'readTabs does not report ' + key);
  }
});

test('a config with nothing showable leaves no other script’s controls behind', () => {
  const fn = UI.match(/function projectConfigIntoForm\(\)[\s\S]*?\n      \}/)[0];
  const branch = fn.slice(fn.indexOf('if (parsedForForm && formFields.length === 0)'));
  assert.match(branch, /configUIContainer\.innerHTML = ''/, 'the container is emptied, not just hidden');
  assert.match(branch, /configUIInstance = null/, 'and the instance is dropped with it');
});

test('switchTab refuses a tab this script does not offer', () => {
  const fn = UI.match(/case 'switchTab': \{[\s\S]*?\n          \}/);
  assert.ok(fn, 'switchTab case not found');
  assert.match(fn[0], /throw new Error\('No tab "'/);
  assert.match(fn[0], /switchTab\(wanted\)/, 'and it calls the same function the button calls');
});

test('merge reads the form only; writeConfig splices Source', () => {
  const merge = UI.match(/function mergeConfigIntoMain\(\)[\s\S]*?\n        const before =/);
  assert.ok(merge, 'mergeConfigIntoMain not found');
  assert.match(merge[0], /const fromForm = currentTab === 'configUI' &&/,
    'the form is only authoritative while Configuration UI is showing');
  assert.match(merge[0], /if \(!fromForm\) return/,
    'without a form view, merge does not invent config text');
  assert.equal(/configEditor/.test(merge[0]), false);

  const write = UI.match(/case 'writeConfig': \{[\s\S]*?\n          \}/);
  assert.ok(write, 'writeConfig case not found');
  assert.match(write[0], /writeConfigBlockText\(a\.text/);
  assert.equal(/configEditor/.test(write[0]), false);
  assert.equal(/configCode/.test(write[0]), false);
});

test('syncUIToCode always merges through the form path', () => {
  const fn = UI.match(/function syncUIToCode\(values\) \{[\s\S]*?\n      \}/);
  assert.ok(fn, 'syncUIToCode not found');
  assert.match(fn[0], /mergeConfigIntoMain\(\)/);
  assert.equal(/configEditor/.test(fn[0]), false);
});

test('a helper line belongs to its field, and shows behind its \u24d8', () => {
  const P = require('../src/config-ui/parser.js');
  const line = 'extensionColumns: 0, // @label: Extra columns @helper: Just numeric variables';
  const f = P.parse(line).rows.filter((r) => r.type === 'field')[0];
  assert.equal(f.helper, 'Just numeric variables');
  assert.equal(f.label, 'Extra columns', 'and it does not swallow the label');
  assert.equal(P.serialize(P.parse(line), {}), line, 'and survives untouched');

  const quoting = 'var x = ""; // @label: Nested @helper: an object with no @rows — the form says so';
  const q = P.parse(quoting).rows.filter((r) => r.type === 'field')[0];
  assert.equal(q.helper, 'an object with no @rows — the form says so');
  assert.equal(q.label, 'Nested');
  assert.equal(P.serialize(P.parse(quoting), {}), quoting, 'and round trips with the @ intact');

  const withPh = 'var y = ""; // @placeholder="Real one" @helper: @placeholder="Shown while empty"';
  const w = P.parse(withPh).rows.filter((r) => r.type === 'field')[0];
  assert.equal(w.placeholder, 'Real one', 'the field keeps its own placeholder');
  assert.equal(w.helper, '@placeholder="Shown while empty"', 'and the note keeps the one it quotes');

  const parserSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'config-ui', 'parser.js'), 'utf8'
  );
  const emit = parserSrc.slice(parserSrc.indexOf('var parts = [];'));
  const helperAt = emit.indexOf('parts.push("@helper: "');
  assert.ok(helperAt > 0, 'serialize no longer emits a helper');
  ['@label: ', '@showWhen: ', '@placeholder=', '@rows: ', '@options: '].forEach((other) => {
    assert.ok(emit.indexOf('parts.push("' + other) < helperAt,
      other + ' is emitted after @helper:, so a round trip would swallow it into the note');
  });

  const renderer = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );
  assert.match(renderer, /attachInfo\(lab, field, prose\)/,
    'the field label no longer carries the info affordance');
  assert.equal(/className = "config-ui-field-note";\n\s*helper\.textContent/.test(renderer), false,
    'the old note under the control is back');
  const css = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'ui.css'), 'utf8'
  );
  assert.match(css, /\.config-ui-info \{/, 'the info affordance has no styling');
  assert.match(css, /\.config-ui-tip \{[\s\S]{0,400}position: fixed/,
    'the bubble is not positioned against the panel');
  assert.match(css, /\.config-ui-field-note \{[\s\S]{0,160}grid-column: 2/);

  const fieldRow = css.match(/\.config-ui-field__row \{[^}]*\}/);
  assert.ok(fieldRow, 'the field row rule is missing');
  assert.match(fieldRow[0], /row-gap: 0;/);
  assert.equal(/^\s*gap:/m.test(fieldRow[0]), false,
    'a shorthand gap is back, which applies to rows as well as columns');
});

test('the space around a section divider is symmetric', () => {
  const css = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'ui.css'), 'utf8'
  );
  assert.match(css, /\.config-ui-row--divider \+ \.config-ui-row--heading h3 \{\s*\n\s*margin-top: 0;/);
});
