const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@variables.js'),
  'utf8'
);

function loadHelper(figma) {
  const start = source.indexOf('async function setVariableValueLoadingFonts');
  const end = source.indexOf('async function createOrUpdateVariable');
  assert.ok(start !== -1 && end > start, 'helper is in @variables.js');
  return new Function('figma', source.slice(start, end) + '\nreturn setVariableValueLoadingFonts;')(figma);
}

function unloaded(family, style) {
  return 'in setValueForMode: unloaded font "' + family + ' ' + style + '". Please call figma.loadFontAsync({ family: "' +
    family + '", style: "' + style + '" }) and await the returned promise first.';
}

test('a write that names unloaded fonts loads them and then succeeds', async () => {
  const loaded = [];
  const figma = { loadFontAsync: async (f) => { loaded.push(f.family + '/' + f.style); } };
  const set = loadHelper(figma);
  const need = ['Condensed', 'Medium'];
  const written = [];
  const variable = {
    setValueForMode(modeId, value) {
      const missing = need.filter((s) => loaded.indexOf('Univers Next Pro/' + s) === -1);
      if (missing.length) throw new Error(missing.map((s) => unloaded('Univers Next Pro', s)).join(' '));
      written.push([modeId, value]);
    }
  };
  await set(variable, 'm1', 450);
  assert.deepStrictEqual(written, [['m1', 450]]);
  assert.deepStrictEqual(loaded.sort(), ['Univers Next Pro/Condensed', 'Univers Next Pro/Medium']);
});

test('fonts revealed one error at a time are all loaded', async () => {
  const loaded = [];
  const figma = { loadFontAsync: async (f) => { loaded.push(f.style); } };
  const set = loadHelper(figma);
  const order = ['Condensed', 'Medium', 'Bold'];
  let ok = false;
  const variable = {
    setValueForMode() {
      const next = order.find((s) => loaded.indexOf(s) === -1);
      if (next) throw new Error(unloaded('F', next));
      ok = true;
    }
  };
  await set(variable, 'm', 1);
  assert.ok(ok);
  assert.deepStrictEqual(loaded, order);
});

test('an error that is not about fonts is rethrown untouched', async () => {
  const figma = { loadFontAsync: async () => { throw new Error('should not load'); } };
  const set = loadHelper(figma);
  const variable = { setValueForMode() { throw new Error('Invalid value'); } };
  await assert.rejects(() => set(variable, 'm', 1), /Invalid value/);
});

test('a font that cannot be loaded surfaces its own error rather than looping', async () => {
  const figma = { loadFontAsync: async () => { throw new Error('The font "F Medium" could not be loaded'); } };
  const set = loadHelper(figma);
  const variable = { setValueForMode() { throw new Error(unloaded('F', 'Medium')); } };
  await assert.rejects(() => set(variable, 'm', 1), /could not be loaded/);
});

test('the mode loop writes through the helper and reports a failed mode as skipped', () => {
  assert.ok(/await setVariableValueLoadingFonts\(existing, mode\.modeId, value\)/.test(source));
  assert.ok(/failedModes\.length > 0[\s\S]{0,200}return 'skipped'/.test(source));
});
