/**
 * The suggestion search: which margin/gap pairs divide cleanly, and in what order.
 *
 * Ranking is where this goes wrong quietly. Every candidate is a real, correct answer — they all
 * divide cleanly — so a mis-ordered list looks exactly like a well-ordered one until you notice the
 * obvious combination is missing from it. That already happened once: plan 18 recorded that the
 * current pair needs no special case because it "moves zero pixels and lands first", and it does not,
 * because rule (a) outranks (b). On grid.js's own defaults, standing in Tablet, the current pair
 * vanished from a six-card list.
 *
 * `gridSuggestions` needs `calculateColumnWidth` from `@Core Library` — libraries resolve their calls
 * in the consumer's context — so it is loaded the way a script loads it.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function loadFoundation() {
  const root = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');
  const core = fs.readFileSync(path.join(root, '@core-library.js'), 'utf8');
  const columnWidth = /function calculateColumnWidth[\s\S]*?\n}/.exec(core)[0];
  const foundation = fs.readFileSync(path.join(root, '@foundation.js'), 'utf8');
  return new Function('figma', 'console', 'window',
    columnWidth + '\n' + foundation +
    '; return { gridSuggestions: gridSuggestions, gridSuggestionsHtml: gridSuggestionsHtml,' +
    ' gridDivisionIsClean: gridDivisionIsClean, gridRoundness: gridRoundness };'
  )({}, console, {});
}

const F = loadFoundation();

/** grid.js's own shipped defaults — the fixture that found the ranking bug. */
const MODES = [
  { name: 'desktop', containerWidth: 1920, columns: 12, gap: 40, padding: 80 },
  { name: 'tablet', containerWidth: 768, columns: 8, gap: 24, padding: 40 },
  { name: 'mobile', containerWidth: 375, columns: 4, gap: 16, padding: 20 },
];

test('clean means the column width is whole, and nothing about spans', () => {
  // 1920 - 160 = 1760 content; (1760 - 11·40)/12 = 110. Whole.
  assert.equal(F.gridDivisionIsClean(MODES[0], 80, 40), true);
  // One pixel of gap either way and it is not.
  assert.equal(F.gridDivisionIsClean(MODES[0], 80, 41), false);
  // A margin that leaves no content is not a grid, whatever it divides into.
  assert.equal(F.gridDivisionIsClean(MODES[2], 200, 0), false);
});

test('the current pair is first when it is clean, even when others are cleaner for more modes', () => {
  // The correction. `margin 40 · gap 24` is clean for Tablet only; `margin 36 · gap 24` is clean for
  // Desktop *and* Tablet, so rule (a) sorts it above — and the pair actually in the fields disappeared
  // from the list. A panel whose suggestions omit the configuration you are looking at is saying it is
  // not an option.
  const answer = F.gridSuggestions(MODES, 'tablet', 6);
  assert.equal(answer.current.clean, true);
  assert.equal(answer.shown[0].margin, 40);
  assert.equal(answer.shown[0].gap, 24);
  assert.equal(answer.shown[0].selected, true);
  assert.equal(answer.shown[0].moved, 0);
  // And it really is outranked on (a) — otherwise this test would pass for the wrong reason.
  assert.ok(answer.shown[1].cleanModes.length > answer.shown[0].cleanModes.length,
    'the second card is clean for more modes, which is what used to bury the first');
});

test('nothing is selected when the current pair does not divide', () => {
  // A real and useful state: the fields hold something that does not divide, and the list is what
  // would. Mobile ships 375/4/16/20 — 335 content, (335 - 48)/4 = 71.75.
  const answer = F.gridSuggestions(MODES, 'mobile', 6);
  assert.equal(answer.current.clean, false);
  assert.equal(answer.shown.some((hit) => hit.selected), false);
  assert.ok(answer.shown.length > 0, 'and it still offers what would divide');
});

test('ranked by modes clean for, then by how little it moves, then by roundness', () => {
  const answer = F.gridSuggestions(MODES, 'desktop', 6);
  const cards = answer.shown.filter((hit) => !hit.selected);
  for (let i = 1; i < cards.length; i++) {
    const before = cards[i - 1];
    const here = cards[i];
    if (before.cleanModes.length !== here.cleanModes.length) {
      assert.ok(before.cleanModes.length > here.cleanModes.length, 'rule (a) is descending');
      continue;
    }
    if (before.moved !== here.moved) {
      assert.ok(before.moved < here.moved, 'rule (b) is ascending');
      continue;
    }
    assert.ok(before.roundness >= here.roundness, 'rule (c) breaks the tie towards round numbers');
  }
});

test('roundness prefers 8, then 4, then 2, and allows anything', () => {
  // Márton's call: free numbers are allowed and simply rank last among equals. `margin 79 · gap 26` is
  // arithmetically as clean as `margin 80 · gap 24`, and nobody wants a 79px margin.
  assert.equal(F.gridRoundness(80), 3);
  assert.equal(F.gridRoundness(12), 2);
  assert.equal(F.gridRoundness(6), 1);
  assert.equal(F.gridRoundness(79), 0);
});

test('a card advertises the spans its own values produce', () => {
  // Not the current configuration's. The frame shows four cards repeating one set of spans, which
  // cannot be true of all four — that is the illustrative-numbers trap this guards.
  const answer = F.gridSuggestions(MODES, 'desktop', 6);
  answer.shown.forEach((hit) => {
    const content = 1920 - 2 * hit.margin;
    const colWidth = (content - 11 * hit.gap) / 12;
    assert.equal(hit.spans[0].span, colWidth, 'col-1 is the column width');
    assert.equal(hit.spans[hit.spans.length - 1].span, content,
      'and the full span is always the content width — the gaps cancel');
  });
  const spans = answer.shown.map((hit) => hit.spans.map((s) => s.span).join('/'));
  assert.equal(new Set(spans).size, spans.length, 'so no two cards can show the same spans');
});

test('the displayed spans come from the column count', () => {
  const twelve = F.gridSuggestions(MODES, 'desktop', 1).shown[0].spans.map((s) => s.n);
  const eight = F.gridSuggestions(MODES, 'tablet', 1).shown[0].spans.map((s) => s.n);
  const four = F.gridSuggestions(MODES, 'mobile', 1).shown[0].spans.map((s) => s.n);
  assert.deepEqual(twelve, [1, 6, 12]);
  assert.deepEqual(eight, [1, 4, 8]);
  assert.deepEqual(four, [1, 2, 4]);

  // Odd counts round up and deduplicate rather than repeating a column.
  const odd = F.gridSuggestions([{ name: 'odd', containerWidth: 1000, columns: 5, gap: 20, padding: 40 }], 'odd', 1);
  assert.deepEqual(odd.shown[0].spans.map((s) => s.n), [1, 3, 5]);
});

test('the search never emits a fractional gap, which is what keeps "clean" simple', () => {
  // Spans inherit from a whole colWidth *and a whole gap*. The search varies whole numbers only, so
  // the one case that could break the definition cannot be produced by it.
  const answer = F.gridSuggestions(MODES, 'desktop', 6);
  answer.shown.forEach((hit) => {
    assert.equal(hit.gap, Math.round(hit.gap));
    assert.equal(hit.margin, Math.round(hit.margin));
    hit.spans.forEach((span) => assert.equal(span.span, Math.round(span.span),
      'so every span is whole without being checked for it'));
  });
});

test('an empty result says what it searched', () => {
  // A section that renders nothing is indistinguishable from a section that failed. A half-pixel width
  // is the honest way to get here: the content is always x.5, so no whole pair can divide it.
  const impossible = [{ name: 'odd', containerWidth: 1000.5, columns: 12, gap: 16, padding: 20 }];
  const answer = F.gridSuggestions(impossible, 'odd', 6);
  assert.equal(answer.found, 0);
  assert.deepEqual(answer.range, { marginFrom: 0, marginTo: 44, gapFrom: 0, gapTo: 40 });

  const html = F.gridSuggestionsHtml({ modes: impossible }, 'grid', 'odd');
  assert.match(html, /No whole-number combination between margin 0–44 and gap 0–40/);
  assert.match(html, /change the column count/);
  assert.doesNotMatch(html, /grid-suggestion"/, 'and no cards');
});

test('a capped list says it was capped', () => {
  // The standing rule about silent truncation. Here the difference is 6 against 205.
  const answer = F.gridSuggestions(MODES, 'desktop', 6);
  assert.equal(answer.shown.length, 6);
  assert.ok(answer.found > 6);
  const html = F.gridSuggestionsHtml({ modes: MODES }, 'grid', 'desktop');
  assert.match(html, new RegExp('Showing 6 of ' + answer.found + ' whole-number combinations'));
});

test('every card carries what a click would apply, and only margin and gap', () => {
  // The badges are informational: a pair clean for three modes still writes one. Applying more than
  // the mode you are standing in is the kind of thing you only notice afterwards.
  const html = F.gridSuggestionsHtml({ modes: MODES }, 'grid', 'desktop');
  const cards = html.match(/<button class="grid-suggestion[^>]*>/g) || [];
  assert.ok(cards.length >= 2);
  cards.forEach((card) => {
    assert.match(card, /data-suggestion-margin="\d+"/);
    assert.match(card, /data-suggestion-gap="\d+"/);
    assert.doesNotMatch(card, /data-suggestion-columns|data-suggestion-width|data-suggestion-modes/,
      'a card must not carry anything a click could write to another mode');
  });

  const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.html'), 'utf8');
  assert.match(ui, /function applySuggestion\(card\)/);
  assert.match(ui, /api\.sameModeName\(entry && entry\.name, wanted\)/,
    'the target is the mode the tab is showing');
  assert.doesNotMatch(ui.slice(ui.indexOf('function applySuggestion'), ui.indexOf('function applySuggestion') + 2200),
    /post\('RUN'/, 'and applying is a config edit, never a run');
});

test('the section is no longer marked unwired', () => {
  // It was dimmed with a caption saying the search did not exist. It does now, and a caption that
  // outlives the thing it describes is worse than none.
  const renderer = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'config-ui', 'renderer.js'), 'utf8'
  );
  const slot = renderer.slice(renderer.indexOf('data-suggestions-slot'));
  assert.doesNotMatch(slot.slice(0, 400), /data-unwired/);
});
