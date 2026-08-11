/**
 * A new control's styling goes on new classes.
 *
 * `.config-ui-row` is the wrapper on **every** form row — headings, paragraphs, dividers, line
 * breaks and fields. The `@rows` control reused the name for one entry of a repeatable group and
 * appended a border, padding and radius to it, which boxed every config form in the plugin. The
 * symptom that should have been the tell: a follow-up rule unsetting the border again where it
 * looked wrong.
 *
 * No test could see it, because it is styling. This one can see the shape of the mistake: a rule
 * whose selector is *exactly* a shared wrapper class, setting box properties. That is narrow on
 * purpose — a guard that flagged every rule touching those classes would flag the legitimate
 * modifiers and be turned off within a week.
 *
 * Same spirit as `ui-dev-guard.test.js`: a source-level check that runs in milliseconds and pins a
 * rule a future edit would otherwise break silently.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.css'), 'utf8');

/**
 * Shared wrappers: classes applied to many different things, where a bare rule restyles all of
 * them. Not an exhaustive list of shared classes — an exhaustive list would need maintaining, and
 * this one is the set that has actually caused a regression.
 */
const SHARED_WRAPPERS = ['.config-ui-row', '.config-ui-field', '.tab-content'];

/** Box properties: the ones that change how everything above them looks. */
const BOX = /(^|[\s;{])(border|border-[a-z-]+|background|background-[a-z-]+|padding|padding-[a-z-]+)\s*:/;

/** Every rule in the file as { selectors: [...], body }. Comments stripped first. */
function rules() {
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(withoutComments)) !== null) {
    const selectors = m[1].split(',').map((sel) => sel.trim()).filter(Boolean);
    out.push({ selectors, body: m[2] });
  }
  return out;
}

test('no rule targets a shared wrapper class on its own and sets a box property', () => {
  const offenders = [];
  for (const rule of rules()) {
    for (const selector of rule.selectors) {
      if (SHARED_WRAPPERS.indexOf(selector) === -1) continue;
      if (!BOX.test(rule.body)) continue;
      offenders.push(selector + ' { ' + rule.body.trim().replace(/\s+/g, ' ') + ' }');
    }
  }
  assert.deepEqual(
    offenders, [],
    'These style a shared wrapper directly, which restyles every row above them.\n' +
      'Put the control\'s styling on its own class instead:\n  ' + offenders.join('\n  ')
  );
});

test('the repeatable-row styling lives on its own class', () => {
  // The positive half: the box `@rows` genuinely wants still exists, just not on a shared name.
  assert.match(CSS, /\.config-ui-rows-item \{/);
  assert.equal(/\.config-ui-rows--tabs \.config-ui-row(\s|\{)/.test(CSS), false,
    'the unset patch is gone — it was the symptom, not the fix');
});

test('the @rows control keeps its styling under one namespace', () => {
  // `.config-ui-row-cell` and `.config-ui-row--divider` differ by one hyphen. Keeping the control's
  // parts under `.config-ui-rows-` means the next person cannot collide with a modifier by accident.
  // `(?!-)` skips the `--modifier` forms, which are the legitimate shared-row variants.
  const strays = (CSS.match(/\.config-ui-row-(?!-)[a-z-]+/g) || [])
    .filter((cls) => cls.indexOf('.config-ui-rows-') !== 0);
  assert.deepEqual(strays, [], 'these sit one hyphen away from a shared modifier: ' + strays.join(', '));
});

test('the classes the renderer writes are the classes the stylesheet defines', () => {
  // The other direction, and the cheapest check that a rename was complete: a class the renderer
  // emits with no rule anywhere is either dead styling or a rename half-applied.
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8');
  const emitted = new Set();
  for (const m of renderer.matchAll(/className = "([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls.indexOf('config-ui-rows') === 0) emitted.add('.' + cls);
  }
  const missing = [...emitted].filter((cls) => CSS.indexOf(cls) === -1);
  assert.deepEqual(missing, [], 'the renderer emits these and the stylesheet never mentions them: ' +
    missing.join(', '));
});

test('a rows cell sizes its own control, rather than inheriting the flat layout’s 70%', () => {
  // `.config-ui-input--text` is `width: 70%`, which is correct for the flat label/control layout and
  // wrong inside a row: it left 30% of every cell empty, so a gap the CSS declared as 8px measured
  // 37px. Pinned because the scoped override looks redundant to anyone who has not measured it.
  assert.match(CSS, /\.config-ui-rows-cell \.config-ui-input,[\s\S]{0,80}width: 100%/);
  assert.match(CSS, /\.config-ui-input--text,[\s\S]{0,120}width: 70%/,
    'the shared rule is still there — the fix is scoped, not a change to it');
});

test('a rows control is a section: no label, full width', () => {
  // **Supersedes the centred-label exception.** Plan 17 recorded that the `@rows` label should centre
  // against the whole control; Márton's later call is that it should not be visible at all and the
  // section should fill the width, because the heading above it already names it and the tab strip was
  // squeezed into the 7fr control column. There is no label left to centre — a deliberate replacement,
  // not a regression.
  assert.match(CSS, /\.config-ui-row--fullwidth \.config-ui-field__row \{\s*\n\s*display: block;/);
  assert.match(CSS, /\.config-ui-row--fullwidth \.config-ui-field__control \{[\s\S]{0,80}display: block;/);
  assert.equal(/\.config-ui-field--rows \.config-ui-field__label/.test(CSS), false,
    'the old label rule is back, so something is styling a label that should not exist');

  const renderer = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );
  assert.match(renderer, /if \(t !== "rows"\) \{[\s\S]{0,400}row\.appendChild\(lab\);/,
    'the label is not built for a rows field');
});

test('a tabbed rows control has no add or remove', () => {
  // Modes are managed by the chips above. Two places to add a mode is one too many.
  const renderer = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );
  assert.match(renderer, /if \(field\.tabs\) \{[\s\S]{0,140}return;/,
    'the add button is not built under tabs');
  assert.match(renderer, /var remove = field\.tabs \? null :/, 'nor a remove button per row');
});

test('the row buttons take their height from the same values the inputs do', () => {
  // "Make them line up" is a claim about height. Nudging padding until it looks close breaks on the
  // next font-size change, so the buttons use the input's font-size, padding and border.
  const buttons = CSS.match(/\.config-ui-rows-remove,\s*\n\s*\.config-ui-rows-add \{[^}]*\}/);
  assert.ok(buttons, 'the row button rule is missing');
  assert.match(buttons[0], /font-size: var\(--font-size-body\)/, 'same font-size as an input');
  assert.match(buttons[0], /padding: 8px 10px/, 'same padding as an input');

  const input = CSS.match(/\.config-ui-input \{[^}]*\}/)[0];
  assert.match(input, /padding: 8px 10px/, 'if the input padding changes, the buttons must follow');
  assert.match(input, /font-size: var\(--font-size-body\)/);
});

test('the section heading rule names the tag the renderer actually emits', () => {
  // The rule that sets 15px and the 48px section gap shipped **twice** without changing anything on
  // screen, because it named `h2` and every config block writes its section titles as `// # Title`,
  // which is level 1 and renders as `h1`. Two places had to agree about a tag name and did not.
  //
  // So this test derives the tag rather than asserting one: it asks the parser what level `// # X` is
  // and the renderer what tag that level becomes, then requires the CSS rule to name that tag. If the
  // mapping is ever changed in the renderer, this fails instead of the panel quietly going back to
  // 20px headings with no gap.
  const parser = require('../src/config-ui/parser.js');
  const level = parser.parse('// # Mode settings').rows[0].level;

  const renderer = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );
  const map = renderer.match(/var tag = r\.level >= 3 \? "(\w+)" : r\.level === 2 \? "(\w+)" : "(\w+)"/);
  assert.ok(map, 'the heading tag mapping is not where this test can read it');
  const tag = level >= 3 ? map[1] : level === 2 ? map[2] : map[3];

  const rule = CSS.match(/\.config-ui-form--rows \.config-ui-row--heading (h\d)(,\s*\n\s*\.config-ui-form--rows \.config-ui-row--heading (h\d))? \{([^}]*)\}/);
  assert.ok(rule, 'the section heading rule is missing');
  const tags = [rule[1], rule[3]].filter(Boolean);
  assert.ok(tags.includes(tag),
    'a section heading renders as <' + tag + '>, but the rule styles ' + tags.join(' and '));
  // Not the display size, which is the Documentation tab's `h1` and was what the form was wearing for
  // as long as the rule named the wrong tag. Which token it *is* belongs to the reference's ladder
  // table, checked against this same CSS in tests/style-reference.test.js — one place, not two.
  assert.doesNotMatch(rule[4], /font-size: var\(--font-size-display\)/,
    'a form section heading is wearing the Documentation tab size');
  assert.match(rule[4], /font-size: var\(--font-size-[a-z]+\)/, 'and takes its size from a token');
  assert.match(rule[4], /margin: calc\(var\(--section-gap\)/, 'and carries the section gap itself');
});

test('a section gap arrives with or without a divider', () => {
  // Preview and Suggestions have no rule above them, so a gap carried only by `.config-ui-row--divider`
  // left them at the old 28px — which is what Márton kept seeing after the measurement was "applied".
  assert.match(CSS, /--section-gap: 48px/);
  const divider = CSS.match(/\.config-ui-row--divider \{[^}]*\}/)[0];
  assert.match(divider, /var\(--section-gap\)/, 'a divider spends the gap');
  // And where both a divider and a heading follow each other, only one of them pays.
  assert.match(CSS,
    /\.config-ui-row--divider \+ \.config-ui-row--heading h1,\s*\n\s*\.config-ui-row--divider \+ \.config-ui-row--heading h2 \{\s*\n\s*margin-top: 0;/,
    'a heading after a divider must drop its own top margin, h1 included');
});
