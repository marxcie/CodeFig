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

/** Strip a script's `// @STYLE_START` … `// @STYLE_END` block to plain CSS (same as the injector). */
function extractStyleBlock(code) {
  const start = code.indexOf('// @STYLE_START');
  const end = code.indexOf('// @STYLE_END');
  if (start < 0 || end < 0 || end <= start) return '';
  return code
    .slice(start + '// @STYLE_START'.length, end)
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*\/\/\s?(.*)$/);
      return m ? m[1] : line;
    })
    .join('\n')
    .trim();
}

const TYPE_SCALE_CSS = extractStyleBlock(
  fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES', '@type-scale.js'),
    'utf8'
  )
);

/**
 * `selector { body }` pairs, as a flat list.
 *
 * **Comments come out first.** This sheet documents its decisions in prose above the rule they
 * belong to, and a comment mentioning `h1` sits directly above a rule that sets a font size — so a
 * scan that keeps comments reads that prose as part of the next selector and matches on it.
 *
 * The pattern is deliberately linear. Spanning a multi-line selector list with a nested quantifier
 * backtracks exponentially over 3,000 lines, which presents as a hung suite rather than a failing
 * one. Nested at-rules are fine: a body cannot contain a brace, so an `@media` prelude never
 * becomes a selector.
 */
function cssRules() {
  const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    selector: sel.trim().replace(/\s+/g, ' '),
    body
  }));
}

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

test('a rows cell sizes its control by which of the two layouts it is in', () => {
  // `.config-ui-input--text` is `width: 70%`, correct for the flat label/control layout and wrong
  // inside a **table** row: it left 30% of every cell empty, so a gap the CSS declared as 8px measured
  // 37px. That is why the 100% override exists.
  //
  // It then applied to the **tabbed** layout too, where a cell is an ordinary field on its own line —
  // so a Scaling method dropdown and an Extra spacings input ran the full width of the control column
  // while the identical controls in General sat at 70%. Two layouts, one rule, and the wrong one won.
  // Both halves are pinned here because each looks redundant to anyone who has not seen the other.
  assert.match(CSS, /\.config-ui-rows-cell:not\(\.config-ui-rows-cell--stacked\) \.config-ui-input,[\s\S]{0,140}width: 100%/,
    'the table form fills its cell');
  assert.doesNotMatch(CSS, /\n\s*\.config-ui-rows-cell \.config-ui-input,/,
    'and the unscoped rule is gone, or the tabbed form inherits it again');
  assert.match(CSS, /\.config-ui-input--text,[\s\S]{0,120}width: 70%/,
    'the shared rule is still there — the fix is scoped, not a change to it');
  // A number is 96px in either layout: it is a number, and its width says so. A text input in a
  // **tab** is one of these too — every other control there is a number, a select or a radio, and the
  // one text field holds a short list (`0, 1, 2`), which at 70% read as a different kind of thing.
  // Asserted as one rule rather than two, because that is the point: the widths cannot drift apart.
  const narrow = CSS.match(
    /\.config-ui-rows-cell \.config-ui-input--number,\s*\n\s*\.config-ui-rows-cell--stacked \.config-ui-input--text \{\s*\n\s*width: 96px/
  );
  assert.ok(narrow, 'the number and the tabbed text input no longer share one width declaration');
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

test('a rows control with chips above it has no add', () => {
  // Modes are managed by the chips. Two places to add a mode is one too many — and the test is the *chips*,
  // not the display: `field.tabs` was only ever a proxy for "there are chips above", and `@blocks` has them
  // now too, which is what made the Colors panel carry both a chips input and an Add button.
  const renderer = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );
  assert.match(renderer, /if \(field\.tabs \|\| field\.membershipFromChips\) return;/,
    'the add button is built even where chips own the mode list');
  assert.match(renderer, /r\.membershipFromChips = true;/,
    'nothing marks a rows field as having its membership owned by chips');
  assert.match(renderer, /var remove = \(field\.tabs \|\| field\.membershipFromChips\) \? null :/,
    'nor a remove button per row — removal lives on the chip');
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
  const map = renderer.match(
    /function configHeadingTag\(level\) \{\s*var n = typeof level === "number" \? level : 1;\s*return n <= 1 \? "(\w+)" : "(\w+)";/
  );
  assert.ok(map, 'the heading tag mapping is not where this test can read it');
  const tag = level <= 1 ? map[1] : map[2];

  // Matched on the **whole** selector, not a substring of one: the shared rule's selector list ends
  // with the form's selector, so a substring match finds the wrong rule and reports the wrong thing.
  const rules = cssRules();
  const formSelector = '.config-ui-form--rows .config-ui-row--heading ' + tag;

  // The **shared** ladder rule: one declaration of the size, naming both surfaces. The size used to
  // live on a form-only rule and again on a docs-only rule, which is the drift this asserts away.
  // Keyed on `.config-ui-heading` — the class the renderer puts on every heading it builds — rather
  // than on the row wrapper, which a heading nested in an `@rows` block does not have.
  const shared = rules.find(
    (r) => r.selector === '.docs-rendered ' + tag + ', ' + tag + '.config-ui-heading'
  );
  assert.ok(shared,
    'a section heading renders as <' + tag + '>, and one rule must set its size for both the ' +
    'Documentation tab and a config form — no rule has that selector list');
  // Not the display size: that is the document title in the editor header, the only text above 16px,
  // and it is what the form was wearing for as long as the rule named the wrong tag.
  assert.doesNotMatch(shared.body, /font-size: var\(--font-size-display\)/,
    'a section heading is wearing the document-title size');
  assert.match(shared.body, /font-size: var\(--font-size-[a-z]+\)/, 'and takes its size from a token');

  // The gap stays the form's own, because a flex column does not collapse margins — see the rule's
  // comment. Only the arithmetic is surface-specific; the size above is not.
  const gap = rules.find((r) => r.selector === formSelector);
  assert.ok(gap, 'the form has no spacing rule for its section heading');
  assert.match(gap.body, /margin-top: var\(--space-sm\)/, 'and carries the section gap itself');
  assert.doesNotMatch(gap.body, /font-size/,
    'the form is setting a heading size again — that belongs to the shared ladder rule');
});

test('one heading ladder: neither surface sets a heading size on its own', () => {
  // The bug this whole section exists for. The Documentation tab and a config form render the same
  // markdown through the same parser, so `// ## Overview` must be one size. It was two for months —
  // 20/15/14 against 16/14/12 — which meant every heading question had to be asked twice and a rule
  // written for the wrong surface changed nothing on screen.
  //
  // A size on a single-surface selector is how that comes back, so that is what this forbids. Spacing
  // is exempt: block flow collapses adjacent margins and a flex column does not, so the two surfaces
  // reach the same gap by different arithmetic.
  const offenders = [];
  for (const { selector, body } of cssRules()) {
    if (!/font-size/.test(body)) continue;
    const docs = /\.docs-rendered h[123]\b/.test(selector);
    const form = /\.config-ui-heading|\.config-ui-row--heading h[123]\b/.test(selector);
    if (docs === form) continue;   // both surfaces (the shared rule), or neither (not a heading rule)
    offenders.push(selector + ' sets ' + /font-size:[^;]*/.exec(body)[0]);
  }
  assert.deepEqual(offenders, [],
    'a heading size is set for one surface only:\n  ' + offenders.join('\n  '));
});

test('a section gap arrives with or without a divider', () => {
  // Preview and Suggestions have no rule above them, so a gap carried only by `.config-ui-row--divider`
  // left them at the old 28px — which is what Márton kept seeing after the measurement was "applied".
  assert.match(CSS, /--section-gap: 48px/);
  const divider = CSS.match(/\.config-ui-row--divider \{[^}]*\}/)[0];
  assert.match(divider, /var\(--section-gap\)/, 'a divider spends the gap');
  // And where both a divider and a heading follow each other, only one of them pays.
  assert.match(CSS,
    /\.config-ui-row--divider \+ \.config-ui-row--heading h2,\s*\n\s*\.config-ui-row--divider \+ \.config-ui-row--heading h3 \{\s*\n\s*margin-top: 0;/,
    'a heading after a divider must drop its own top margin, section h2 included');
});

test('an oversized type sample is clipped by its own cell, not by the specimen around it', () => {
  // **Where the clip lives decides whether it works.** A grid item's `min-width` is `auto`, so a
  // `nowrap` sample refuses to shrink below its text: at 78px it widened its own `7fr` column and
  // squeezed the `3fr` metadata column beside it. Each step is its own grid, so every row resolved a
  // different split — measured in a browser, the 78px sample's left edge sat at 744 while every other
  // sample started at 854, which is the "it pushes itself to the right" that kept coming back.
  //
  // `overflow: hidden` on `.type-specimen` could not fix it. By the time that box clips, the grid
  // inside it has already been laid out wide; clipping the outer edge does not put the columns back.
  const sample = TYPE_SCALE_CSS.match(/\.type-specimen-sample \{([^}]*)\}/);
  assert.ok(sample, 'the sample rule lives on @Type Scale @STYLE_START, not ui.css');
  assert.match(sample[1], /min-width: 0/,
    'without this the sample widens its own column and the ramp stops lining up');
  assert.match(sample[1], /overflow-x: clip/, 'clip belongs on the box that overflows sideways');
  assert.match(sample[1], /white-space: nowrap/,
    'still one sample per line — wrapping would turn two lines into four and destroy the comparison');
});
