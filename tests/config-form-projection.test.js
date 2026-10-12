const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');

function body(startRe, endRe) {
  const start = html.search(startRe);
  assert.ok(start !== -1, 'found ' + startRe);
  const rest = html.slice(start);
  const end = rest.search(endRe);
  assert.ok(end > 0, 'found end ' + endRe);
  return rest.slice(0, end);
}

test('a write that patches the form in place records that the form now matches the text', () => {
  const writer = body(/function writeConfigBlockText\(/, /scheduleConfigPreview\(\);\s*\}/);
  assert.ok(/skipFormProject\) \{[\s\S]*configProjectedFrom = /.test(writer),
    'skipFormProject branch assigns configProjectedFrom');
});

test('a refused merge rebuilds the form and says an edit was not applied', () => {
  const merge = body(/function mergeConfigIntoMain\(/, /const schema = window\.CodeFigConfigUI\.parse\(blockNow/);
  assert.ok(/merge:refused@/.test(merge));
  assert.ok(/projectConfigIntoForm\(\)/.test(merge), 'rebuilds from the block');
  assert.ok(/healingFormProjection/.test(merge), 'guards against re-entry');
  assert.ok(/was not applied/.test(merge), 'tells the user');
});
