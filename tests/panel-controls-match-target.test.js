/**
 * A panel's controls are the ones its target mockup draws.
 *
 * `mockup-panels.test.js` keeps the targets from rotting — every class they use is real. It says
 * nothing about **which control** a field is, and that is where the drift actually happened: Márton's
 * frames and `spacing-target.html` both show Scale type as radio buttons, the shipped block said
 * `(modular|metric|fibonacci)`, and it rendered as a dropdown for as long as it took him to look at it
 * and ask. Nothing failed. Every class was real.
 *
 * So this compares, per labelled cell of a mode tab, the type of control the target draws with the type
 * the shipped config block declares. Labels present in only one side are the sanctioned departures —
 * fields the frames do not show but a mode needs — and are reported by the assertions that do run,
 * rather than being failed here.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../src/config-ui/parser.js');

const root = path.join(__dirname, '..');
const DIR = path.join(root, 'artifacts', 'mockup-panels');
const SCRIPTS = path.join(root, 'scripts', 'EXAMPLE_SCRIPTS', 'Design System Foundations');

/** Panels whose config block has no mode table yet. Self-clearing: each entry is asserted to be true. */
const NOT_BUILT = {};

const FILES = {
  'grid-target.html': 'grid.js',
  'spacing-target.html': 'spacing.js',
  'typography-target.html': 'typography.js',
  'radius-target.html': 'corner-radius.js',
  'colors-target.html': 'colors.js',
};

/** `text` and `list` are the same control — one line of text — so they answer for each other. */
function normalise(type) {
  return type === 'list' ? 'text' : type;
}

/** The mode-tab cells a target draws: label → the kind of control beside it. */
function targetCells(html) {
  const out = {};
  // The delimiter has to end at the class boundary: `config-ui-rows-cell-label` starts with the same
  // characters, so splitting on the bare prefix cuts every cell in half and finds nothing to compare.
  const cells = html.split(/class="config-ui-rows-cell[ "]/).slice(1);
  cells.forEach((chunk) => {
    const label = /config-ui-rows-cell-label">([^<]+)</.exec(chunk);
    if (!label) return;
    const body = chunk.slice(0, chunk.indexOf('</label>') === -1 ? chunk.length : chunk.indexOf('</label>'));
    let type = null;
    // **Before the input branches.** A group *contains* inputs, so anything that looked for one first
    // reported the group as whatever its first part happens to be — which is how a pair of captioned
    // fields and a single number read as the same control.
    if (/config-ui-rows-group[ "]/.test(body)) type = 'group';
    else if (/config-ui-radio-group/.test(body)) type = 'radio';
    else if (/<select/.test(body)) type = 'select';
    else if (/config-ui-input--number/.test(body)) type = 'number';
    else if (/config-ui-textarea|<textarea/.test(body)) type = 'textarea';
    else if (/<input/.test(body)) type = 'text';
    if (type) out[label[1].trim()] = type;
  });
  return out;
}

/** The mode table a shipped block declares: label → column type. */
function panelColumns(source) {
  const block = /@CONFIG_START\n([\s\S]*?)\n\s*\/\/ @CONFIG_END/.exec(source);
  if (!block) return null;
  // A migrated script (`@PANEL_START`) keeps its mode table there instead of in an inline `@rows`
  // annotation — same second argument `src/ui.html` passes at run time, not a second reader.
  const panelMatch = /@PANEL_START\n([\s\S]*?)\/\/ @PANEL_END/.exec(source);
  const schema = P.parse(block[1], panelMatch ? panelMatch[1] : undefined);
  const rows = P.flattenPanelRows(schema.rows).filter((r) => r.type === 'field' && r.inputType === 'rows');
  if (!rows.length) return null;
  const out = {};
  (rows[0].columns || []).forEach((c) => { out[c.label] = c.type; });
  return out;
}

function panels() {
  return fs.readdirSync(DIR).filter((f) => f.endsWith('-target.html'));
}

test('a mode field is the control its target draws', () => {
  let compared = 0;
  panels().forEach((file) => {
    const source = path.join(SCRIPTS, FILES[file]);
    if (!fs.existsSync(source)) return;
    const columns = panelColumns(fs.readFileSync(source, 'utf8'));
    if (!columns) return;

    const drawn = targetCells(fs.readFileSync(path.join(DIR, file), 'utf8'));
    Object.keys(drawn).forEach((label) => {
      if (!(label in columns)) return; // the frames' field set is guidance, not an inventory
      compared++;
      assert.equal(normalise(columns[label]), normalise(drawn[label]),
        file + ': "' + label + '" is drawn as a ' + drawn[label] + ' and the panel declares a ' +
        columns[label] + ' — the design and the block disagree about the control, which is the ' +
        'difference nothing else here can see');
    });
  });
  assert.ok(compared >= 4, 'the comparison actually ran (' + compared + ' cells)');
});

test('a panel listed as not built yet really is not built yet', () => {
  // The exemption clears itself: build Typography's mode table and this fails until the entry goes.
  Object.keys(NOT_BUILT).forEach((file) => {
    const source = path.join(SCRIPTS, FILES[file]);
    assert.equal(panelColumns(fs.readFileSync(source, 'utf8')), null,
      file + ' has a mode table now — remove it from NOT_BUILT so its controls are checked (' +
      NOT_BUILT[file] + ')');
  });
});

test('every target is either compared or listed', () => {
  panels().forEach((file) => {
    if (NOT_BUILT[file]) return;
    const columns = panelColumns(fs.readFileSync(path.join(SCRIPTS, FILES[file]), 'utf8'));
    assert.ok(columns, file + ' has no mode table and is not listed as unbuilt — one of the two is wrong');
  });
});
