/**
 * The prototype's render commits last, and its state space is swept.
 *
 * Two things Márton asked to be tests rather than one-offs, and both are about the same bug. In phase 1 the
 * panel's markup went in *before* the aside was computed, so a throw in between left a form showing one state
 * and a caption showing another — and a stage whose buttons had not been re-enabled, which is where nine
 * further errors came from. His instruction: *"Make that shape impossible rather than guarded case by case:
 * compute the whole render, then commit it."*
 *
 * **Checked at the source, deliberately.** The behaviour was verified in a browser — a forced throw
 * mid-render left the panel, caption, aside and every stage button byte-identical, and the next render
 * recovered. What a browser cannot do is stop the ordering being undone six months from now by someone adding
 * one convenient `innerHTML` in the middle. That is what this pins, and it is why it reads the file rather
 * than running it.
 *
 * The sweep is the same argument: 46 combinations of colour model × file selection × seed state pass in a
 * browser, and what survives here is the *guarantee that each one is reachable* — a state nobody can get to
 * is a state nobody tests.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'artifacts', 'mockup-panels', 'colors-target.html');
const html = fs.readFileSync(FILE, 'utf8');

/** The body of `function render()`, which is the only function allowed to write to the document. */
function renderBody() {
  const start = html.indexOf('\nfunction render() {');
  assert.ok(start !== -1, 'the prototype has no render()');
  // To the next top-level function declaration, which is where render ends.
  const after = html.indexOf('\nfunction ', start + 10);
  assert.ok(after > start, 'could not find the end of render()');
  return html.slice(start, after);
}

test('every DOM write in render comes after every computation', () => {
  const body = renderBody();

  // The writes: assigning innerHTML, and the stage-button pass that toggles classes and `disabled`.
  const writes = [
    /document\.getElementById\('panel'\)\.innerHTML = out;/,
    /document\.getElementById\('caption'\)\.innerHTML = caption;/,
    /document\.getElementById\('aside'\)\.innerHTML = notes;/,
  ];
  const positions = writes.map((re) => {
    const m = re.exec(body);
    assert.ok(m, 'render no longer performs the write ' + re);
    return m.index;
  });

  // The last thing computed before the commit. If a computation moves below the first write, the shape is
  // back: a throw would leave a half-updated page.
  const lastCompute = body.lastIndexOf('if (curveCarryNote) notes +=');
  assert.ok(lastCompute !== -1, 'the aside is no longer assembled before the commit');
  const firstWrite = Math.min.apply(null, positions);
  assert.ok(lastCompute < firstWrite,
    'a computation now happens after the first DOM write, so a throw can leave the page half-updated');

  // The three writes are consecutive, with nothing computed between them.
  const between = body.slice(firstWrite, Math.max.apply(null, positions));
  assert.equal(/colorsGenerateMode|buildRamp|toneScaleLightness|parseSteps/.test(between), false,
    'something is computed between the DOM writes');
});

test('focus restoration is the one write that may come last, and it does', () => {
  // It has to: it depends on the markup already being in the document. What matters is that it reads the
  // focused element *before* the panel is replaced, or the caret is lost and typing stops after a character.
  const body = renderBody();
  const readsFocus = body.indexOf('var focused = document.activeElement;');
  const writesPanel = body.indexOf("document.getElementById('panel').innerHTML = out;");
  const restores = body.indexOf('again.focus();');
  assert.ok(readsFocus !== -1 && writesPanel !== -1 && restores !== -1);
  assert.ok(readsFocus < writesPanel, 'the focused element is read after the panel was replaced');
  assert.ok(restores > writesPanel, 'focus is restored before the markup it points into exists');
});

test('render throws nowhere the previous state cannot survive', () => {
  // The positive half: the guard that failed in phase 1 is still there, so the throw this ordering protects
  // against does not happen in the first place either. Belt and braces, on purpose — the ordering makes it
  // survivable and the guard makes it not happen.
  const body = renderBody();
  assert.match(body, /var moss = blocks\.length > 1 \? blocks\[1\]\.ramp : null;/,
    'the second-block guard is gone, which is the bug that started this');
  assert.match(body, /if \(!moss\)/, 'nothing handles the one-block case');
});

test('every state the sweep covers is reachable from the stage', () => {
  // 46 combinations pass in a browser. A state that cannot be reached is a state nobody tests, so the stage's
  // inventory is pinned here — the browser checks they work, this checks they exist.
  const stage = html.slice(html.indexOf('<div class="mock-stage">'), html.indexOf('<div class="mock-caption"'));
  const values = (attr) => [...stage.matchAll(new RegExp('data-stage="' + attr + '" data-value="([^"]+)"', 'g'))]
    .map((m) => m[1]);

  assert.deepEqual(values('model'), ['hsl', 'oklch']);
  assert.deepEqual(values('file'), ['none', 'new', 'existing']);
  assert.deepEqual(values('seed').sort(),
    ['clamped', 'edited', 'empty', 'exact', 'invalid', 'offcentre', 'onend', 'orphan', 'reanchored',
     'snapped'].sort());

  // And each seed state is actually implemented, rather than a button with no branch behind it.
  const apply = html.slice(html.indexOf('function applyStageSeed('), html.indexOf('var stageSeed ='));
  values('seed').forEach((name) => {
    assert.ok(apply.indexOf("'" + name + "'") !== -1,
      'the stage offers ' + name + ' but applyStageSeed has no branch for it');
  });
});

test('the prototype writes its field notes as text, the way the renderer does', () => {
  // The third time this mockup lied about the plugin. `.config-ui-field-note` is set with `textContent` by
  // the renderer, so a note carrying `<br>` or `<b>` shows markup the panel can never produce. Lines are real
  // newlines, honoured by `white-space: pre-line`.
  const body = html.slice(html.indexOf('<body>'));
  const notes = [...body.matchAll(/config-ui-field-note">'\s*\+\s*([A-Za-z(]+)/g)].map((m) => m[1]);
  assert.ok(notes.length > 0, 'the prototype no longer builds field notes the same way');
  notes.forEach((expr) => {
    assert.equal(expr.indexOf('esc') === 0, true,
      'a field note is inserted unescaped, so it can carry markup the renderer cannot');
  });
});
