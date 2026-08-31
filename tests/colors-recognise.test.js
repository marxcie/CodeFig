/**
 * The COLOR read path, against the values a real file actually holds.
 *
 * **Real data, simulated API.** Every hex below was read out of `codefig-test` through the dev bridge, so the
 * shapes are the file's rather than invented — three modes on one collection, sixteen steps with the midpoint
 * at 300, and `colors / other`'s alpha ramps. What is stubbed is only `figma.variables`, because the rest of
 * this repo's `@foundation.js` coverage stops at the API boundary for the same reason: a test that needs
 * Figma open is a test nobody runs.
 *
 * It is not a substitute for running in the plugin, and the plugin run is still pending a reload. What it
 * does buy is every branch exercised — alias, alpha, decline, duplicate, unparseable, too-few-steps — which
 * the real collection cannot do, because it is clean: no aliases, nothing non-opaque, no duplicates.
 *
 * The alias branch is the one to be honest about. There are **zero** aliases in 194 COLOR variables in that
 * file, so what is checked here is that the code does what the brief says, not that the brief was right about
 * a real file. Márton's call: keep the rule, do not plant a fixture in Figma to justify it.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const resolver = require('../src/import-resolver.js');
const LIBS = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');

/** Read out of `color - neutral (formerly Ash)` on 2026-08-13. Sixteen steps, three modes. */
const NEUTRAL = {
  steps: ['25', '50', '75', '100', '150', '200', '250', '300', '350', '400',
          '500', '600', '700', '800', '900', '950'],
  modes: {
    Ash: ['#FAFAFA', '#F7F8F7', '#F2F3F2', '#E9ECEB', '#DFE2E1', '#D4D9D7', '#C9CFCD', '#B5BAB9',
          '#A0A6A4', '#7C8381', '#5B6262', '#3B4344', '#293033', '#202528', '#151719', '#111517'],
    Granite: ['#FAFAFA', '#F7F7F7', '#F2F2F2', '#EAEBEA', '#E0E1E0', '#D8D9D8', '#CECFCE', '#B7B8B7',
              '#A2A4A2', '#818381', '#606260', '#3F403F', '#2D2E2D', '#232423', '#171717', '#141514'],
    Bark: ['#FAF9F9', '#F8F7F6', '#F3F2F1', '#ECEBE7', '#E2E1DD', '#D8D8D3', '#CDCDC9', '#B9B9B5',
           '#A4A4A0', '#81817D', '#60605D', '#40413F', '#2E2F2D', '#242422', '#181614', '#151412'],
  },
};

function rgbOf(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255,
           a: alpha === undefined ? 1 : alpha };
}

/**
 * The smallest `figma.variables` these functions touch: collections by name, variables by id, and a value
 * per mode. Built from a plain description so a test can say "this variable is an alias to that one" without
 * a paragraph of setup.
 */
function stubFigma(spec) {
  const variables = {};
  const collections = spec.map((c, ci) => {
    const modes = (c.modes || ['default']).map((name, mi) => ({ modeId: 'm' + ci + '-' + mi, name }));
    const ids = [];
    (c.variables || []).forEach((v, vi) => {
      const id = 'v' + ci + '-' + vi;
      ids.push(id);
      const valuesByMode = {};
      modes.forEach((mode) => {
        const held = v.values[mode.name];
        if (held === undefined) return;
        valuesByMode[mode.modeId] = held;
      });
      variables[id] = {
        id, name: v.name, resolvedType: v.type || 'COLOR',
        variableCollectionId: 'c' + ci, valuesByMode,
        scopes: ['ALL_SCOPES'], hiddenFromPublishing: false, remote: false,
      };
    });
    return { id: 'c' + ci, name: c.name, modes, defaultModeId: modes[0].modeId, variableIds: ids,
             remote: false };
  });
  return {
    variables: {
      getLocalVariableCollectionsAsync: async () => collections,
      getVariableByIdAsync: async (id) => variables[id] || null,
      // Untyped, matching plan 28's `foundationColorsAutoImport`: it must not filter to COLOR, because
      // the same index also feeds `foundationCollectionModes`, which counts every variable's mode
      // differences regardless of type.
      getLocalVariablesAsync: async (type) =>
        Object.values(variables).filter((v) => !type || v.resolvedType === type),
    },
  };
}

/**
 * `@foundation.js` and `@OKLCH` in one context, the way the sandbox splices them.
 *
 * `@color-ramp.js` is in here because recognition fits a curve to the ramp it reads, and `colorsFitCurve`
 * lives there — a library's calls resolve in its *consumer's* context, and this test is a consumer.
 */
function load(figma) {
  const ctx = {
    figma, console: { log() {}, warn() {}, error() {} },
    Math, String, Number, Array, Object, JSON, isNaN, isFinite, parseInt, parseFloat, RegExp, Boolean,
    Promise, Set, Date,
  };
  vm.createContext(ctx);
  for (const file of ['@math-helpers.js', '@bezier.js', '@oklch.js', '@color-ramp.js', '@foundation.js']) {
    const source = fs.readFileSync(path.join(LIBS, file), 'utf8');
    for (const [, code] of resolver.extractFunctionMap(source)) {
      try { vm.runInContext(code, ctx); } catch (e) { /* a function this test does not reach */ }
    }
  }
  return ctx;
}

/** The real collection, one entry per mode, all opaque and all raw — which is what it is. */
function neutralSpec(overrides) {
  const variables = NEUTRAL.steps.map((step, i) => {
    const values = {};
    Object.keys(NEUTRAL.modes).forEach((mode) => { values[mode] = rgbOf(NEUTRAL.modes[mode][i]); });
    return { name: 'neutral/' + step, values };
  });
  return [{ name: 'color - neutral (formerly Ash)', modes: Object.keys(NEUTRAL.modes),
            variables: variables.concat((overrides && overrides.extra) || []) }];
}

test('the real collection is recognised, one mode at a time', async () => {
  const ctx = load(stubFigma(neutralSpec()));
  for (const mode of ['Ash', 'Granite', 'Bark']) {
    const seen = await ctx.colorsRecognise('color - neutral (formerly Ash)', 'neutral', mode);
    assert.equal(seen.found, true, mode + ' was not recognised');
    assert.equal(seen.modeName, mode, 'the wrong mode was read');
    assert.equal(seen.steps.length, 16);
    assert.deepEqual(seen.steps, NEUTRAL.steps, 'the steps are not the variable names in order');
    assert.deepEqual(seen.existing, NEUTRAL.modes[mode], mode + ': the hexes read back changed');
    // Every report-and-continue tally is zero, because the collection is clean.
    assert.deepEqual(seen.skipped, []);
    assert.deepEqual(seen.aliased, []);
    assert.deepEqual(seen.duplicates, []);
    assert.equal(seen.declined, null);
    // **Nothing is reported missing, because the curve is recovered rather than guessed.** A read used to
    // land on *Original* — the file's colours and no curve — on the grounds that a ramp carries no record
    // of how it was made. That is true of *naming* a preset and false of *fitting* one: against published
    // sets a three-anchor fit lands within a lightness point at its worst step, which is a shape you can
    // take hold of instead of an empty editor.
    assert.deepEqual(seen.missing, []);
  }
});

test('the anchor step is found by measuring, and it beats the index midpoint', async () => {
  // **Where a ramp turns was guessed, and every guess was wrong on half the library.**
  //
  // The anchors are read at one step and the generated ramp bends at one step; those are the same fact, and
  // they were decided separately — recognition at `floor((n-1)/2)`, generation at its own midpoint or a
  // typed placement. On a sixteen-step list the index midpoint is 300, and eleven of this file's sixteen
  // sets actually turn at 400. Anchors read at one step and applied at another was the largest error left
  // in a read: worst channel across the library, 49 of 255 in HSL and 37 in OKLCH.
  //
  // Two properties of the colours were tried as a rule and both failed. The extremum of OKLCH chroma is
  // right for OKLCH and leaves HSL at 60; the extremum of HSL saturation is right for HSL and leaves OKLCH
  // at 67. So it is measured: generate at each candidate, keep the one closest to the file. Both models
  // came to 10.
  //
  // This pins the property rather than the step, because the step is a fact about a fixture and the
  // property is the reason the search exists.
  const ctx = load(stubFigma(neutralSpec()));
  const seen = await ctx.colorsRecognise('color - neutral (formerly Ash)', 'neutral', 'Ash');

  assert.ok(seen.found, 'the fixture was not recognised');
  const chosen = seen.steps.indexOf(seen.midStep);
  assert.ok(chosen > 0 && chosen < seen.steps.length - 1,
    'the anchor landed on an end, where there is nothing to bend');

  // Whatever step it chose, the three anchors come from *that* step — that is the agreement being pinned.
  const at = seen.existing[chosen];
  assert.equal(seen.anchors.middle, ctx.oklchFromHex(at).L, 'the middle anchor is not from the chosen step');
  assert.equal(seen.hue.middle, ctx.oklchFromHex(at).H);
  assert.equal(seen.chroma.middle, ctx.oklchFromHex(at).C);
  assert.equal(seen.anchors.bright, ctx.oklchFromHex('#FAFAFA').L);
  assert.equal(seen.anchors.dark, ctx.oklchFromHex('#111517').L);

  // And it is not worse than the rule it replaced. Measured the way the search measures: generate at each
  // and compare to the file.
  const okl = seen.existing.map((h) => ctx.oklchFromHex(h));
  const hsl = seen.existing.map((h) => ctx.oklchHslFromHex(h));
  const shared = {
    okl: okl, hsl: hsl,
    lightnessOklch: ctx.colorsFitCurve(seen.existing, true),
    lightnessHsl: ctx.colorsFitCurve(seen.existing, false),
  };
  const missAt = (i) => {
    const fits = {
      chromaCurve: ctx.colorsFitChromaCurve(seen.existing, true, i),
      saturationCurve: ctx.colorsFitChromaCurve(seen.existing, false, i),
      hueCurve: ctx.colorsFitHueCurve(seen.existing, true, i),
      hslHueCurve: ctx.colorsFitHueCurve(seen.existing, false, i),
    };
    return Math.max(ctx.colorsAnchorMiss(seen.existing, seen.steps, i, true, shared, fits),
                    ctx.colorsAnchorMiss(seen.existing, seen.steps, i, false, shared, fits));
  };
  const midpoint = ctx.colorsMidIndex(seen.steps);
  assert.ok(missAt(chosen) <= missAt(midpoint) + 1e-9,
    'the searched anchor (' + seen.midStep + ', ' + missAt(chosen).toFixed(1) + ' levels off) is worse ' +
    'than the index midpoint (' + seen.steps[midpoint] + ', ' + missAt(midpoint).toFixed(1) + ')');
});

test('the anchor it found is written down, so generation bends where the anchors were read', async () => {
  // Generation cannot run the search — it would be searching for the answer to the question it is
  // answering — so the read records it. Only `placement`: `fillConfigBlock` merges key by key, so a seed
  // hex or a lock the user typed survives, which they must because a file holds no record of either.
  const ctx = load(stubFigma(neutralSpec()));
  const found = await ctx.foundationColorsAutoImport(
    'color - neutral (formerly Ash)', 'neutral', ['Ash'], 'oklch');
  assert.equal(found.source, 'recognised');
  const mode = found.config.modes[0];
  assert.ok(mode.seed && mode.seed.placement, 'the read did not record where the ramp turns');
  assert.equal(mode.seed.hex, undefined, 'the read invented a seed colour the file does not hold');
  assert.equal(mode.seed.lock, undefined, 'the read overwrote the lock');
  assert.ok(found.tokens.indexOf(mode.seed.placement) !== -1,
    'the recorded placement is not one of the collection\'s own steps');
});

test('three modes off one collection need nothing the single-mode path did not', async () => {
  // The whole difference is *which* `modeId` is read. The membership test, the step parse, the anchors and the
  // tallies are per mode and independent, so the three answers differ only in their values.
  const ctx = load(stubFigma(neutralSpec()));
  const answers = {};
  for (const mode of ['Ash', 'Granite', 'Bark']) {
    answers[mode] = await ctx.colorsRecognise('color - neutral (formerly Ash)', 'neutral', mode);
  }
  assert.deepEqual(answers.Ash.steps, answers.Granite.steps);
  assert.deepEqual(answers.Ash.steps, answers.Bark.steps);
  assert.notDeepEqual(answers.Ash.existing, answers.Granite.existing, 'the modes read identically');
  // **A named mode the collection does not have reads nothing.** Not the default — that was the first
  // behaviour here and it was wrong in the way that matters: auto-import asks for the modes the panel's
  // *blocks* name, so against this collection a `Moss` block fell back to `Ash` and Ash's hue anchors were
  // filled into Moss's block with nothing saying so. Caught by driving the real panel, not by a test.
  const missing = await ctx.colorsRecognise('color - neutral (formerly Ash)', 'neutral', 'Nope');
  assert.equal(missing.found, false, 'an unknown mode must not resolve to another mode');
  assert.equal(missing.anchors, null);
  assert.deepEqual(missing.existing, []);
  assert.match(missing.notes[0], /no mode called Nope/);

  // Naming none is the one case that may fall back, because there is nothing to contradict.
  const unnamed = await ctx.colorsRecognise('color - neutral (formerly Ash)', 'neutral', null);
  assert.equal(unnamed.found, true);
  assert.equal(unnamed.modeName, 'Ash', 'with no mode named, the default is the right answer');
});

test('a block for a mode the file does not have is left alone, not filled and not removed', async () => {
  // Both directions of the same fault, and both were live in one session.
  //
  // Filling it with the default mode's values put **Ash's hue anchors into a Moss block** — a claim the file
  // never made. Leaving the mode out of the payload instead made `fillConfigBlock` *delete* the Moss block,
  // because it removes an entry the payload does not mention. Neither is the panel's call: a `Moss` block is
  // the user naming a mode they intend to create.
  //
  // So an unread mode comes back carrying only its name: present, so it survives the fill, and empty, so
  // nothing of it is overwritten.
  const ctx = load(stubFigma(neutralSpec()));
  const got = await ctx.foundationColorsAutoImport(
    'color - neutral (formerly Ash)', 'neutral', ['Granite', 'Moss']);

  assert.equal(got.source, 'recognised');
  assert.deepEqual(got.modes, ['Granite'], 'only the mode that exists was read');
  assert.deepEqual(Object.keys(got.existing), ['Granite'], 'a mode with no values must contribute none');

  const names = got.config.modes.map((m) => m.name);
  assert.deepEqual(names, ['Granite', 'Moss'], 'the unread mode must still be in the payload');

  const moss = got.config.modes[1];
  assert.deepEqual(Object.keys(moss), ['name'], 'the unread mode carries values it has no right to');

  // And the recognition record says why, rather than leaving it to be inferred from an absence.
  assert.equal(got.recognition.modes.Moss.found, false);
  assert.match(got.recognition.modes.Moss.notes[0], /no mode called Moss/);
  assert.deepEqual(got.recognition.lightnessFrom, ['Granite']);
});

test('the answer about the group comes before the answer about the mode', async () => {
  // `colors / other` has one mode, `default`, and the panel's blocks are named Granite and Moss. With the mode
  // check first, asking about `black` came back "the collection has no mode called Granite" — true, useless,
  // and it made the decline unreachable for any collection whose mode names differ from the panel's blocks,
  // which for a single-mode collection is almost always.
  //
  // A group being an alpha ramp is true of the *group*, whichever mode you ask about. So it is answered first,
  // tested against whichever mode there is to read.
  const steps = ['1', '5', '10', '50', '90', '100'];
  const variables = steps.map((step) => ({
    name: 'black/' + step,
    values: { default: rgbOf('#000000', step === '100' ? 1 : Number(step) / 100) },
  }));
  const ctx = load(stubFigma([{ name: 'colors / other', modes: ['default'], variables }]));

  const asked = await ctx.colorsRecognise('colors / other', 'black', 'Granite');
  assert.equal(asked.found, false);
  assert.match(asked.declined, /alpha ramp \(5 of 6 non-opaque\)/,
    'the alpha ramp went unreported because the mode name did not match');
  assert.deepEqual(asked.notes, [], 'a declined group should not also complain about the mode');

  // And a group that *is* a plausible ramp still reports the missing mode.
  const clean = load(stubFigma(neutralSpec()));
  const missingMode = await clean.colorsRecognise('color - neutral (formerly Ash)', 'neutral', 'Granite');
  assert.equal(missingMode.found, true, 'Granite exists here and must still read');
  const absent = await clean.colorsRecognise('color - neutral (formerly Ash)', 'neutral', 'Moss');
  assert.equal(absent.found, false);
  assert.equal(absent.declined, null);
  assert.match(absent.notes[0], /no mode called Moss/);
});

test('a panel that names no modes reads the collection’s own', async () => {
  // Bug 1, and a chicken-and-egg. "The modes come from the panel" is right about which modes get *written*;
  // as the only source for what to *read* it meant the shipped block — which opens with one unnamed mode —
  // asked about nothing, so nothing populated, so there was no way to name a mode. Selecting a collection
  // with three modes read none of them and said nothing.
  const ctx = load(stubFigma(neutralSpec()));

  const adopted = await ctx.foundationColorsAutoImport('color - neutral (formerly Ash)', 'neutral', []);
  assert.equal(adopted.source, 'recognised');
  assert.equal(adopted.modeSource, 'collection', 'it should say where the mode list came from');
  assert.deepEqual(adopted.modes, ['Ash', 'Granite', 'Bark'], 'all three modes should be read');
  assert.deepEqual(Object.keys(adopted.existing), ['Ash', 'Granite', 'Bark']);
  assert.equal(adopted.config.modes.length, 3);

  // A block whose name is blank still counts as naming nothing (the pre-Value starter).
  const blank = await ctx.foundationColorsAutoImport('color - neutral (formerly Ash)', 'neutral', ['', '  ']);
  assert.deepEqual(blank.modes, ['Ash', 'Granite', 'Bark']);
  assert.equal(blank.modeSource, 'collection');

  // And named blocks that exist in the collection still win, so a set-up panel is not overwritten.
  const named = await ctx.foundationColorsAutoImport(
    'color - neutral (formerly Ash)', 'neutral', ['Granite']);
  assert.equal(named.modeSource, 'panel');
  assert.deepEqual(named.modes, ['Granite']);
  assert.deepEqual(Object.keys(named.existing), ['Granite']);
});

test('a shipped Value starter still loads a Mode 1 collection', async () => {
  // The starter was renamed from "" to "Value" so a fresh collection can run (chips + Run both need a
  // real name). Figma's other default is still `Mode 1`. Asking for Value against that used to return
  // source:none and leave steps empty — the panel looked dead after Collection + Group.
  const ctx = load(stubFigma([{
    name: 'color - moss',
    modes: ['Mode 1'],
    variables: NEUTRAL.steps.map((step, i) => ({
      name: 'moss/' + step,
      values: { 'Mode 1': rgbOf(NEUTRAL.modes.Ash[i]) },
    })),
  }]));

  const found = await ctx.foundationColorsAutoImport('color - moss', 'moss', ['Value'], 'hsl');
  assert.equal(found.source, 'recognised');
  assert.equal(found.modeSource, 'collection');
  assert.deepEqual(found.modes, ['Mode 1']);
  assert.equal(found.config.steps, NEUTRAL.steps.join(', '));
  assert.deepEqual(Object.keys(found.existing), ['Mode 1']);
});

test('a group that is mostly non-opaque is declined in one line', async () => {
  // `colors / other` in the real file: `black/1 … black/100`, 13 of 14 non-opaque, deliberately, because they
  // are alpha ramps over a fixed hue. Itemising every skip is correct and useless.
  const steps = ['1', '2', '5', '10', '20', '30', '40', '50', '60', '70', '80', '90', '95', '100'];
  const variables = steps.map((step) => ({
    name: 'black/' + step,
    values: { default: rgbOf('#000000', step === '100' ? 1 : Number(step) / 100) },
  }));
  const ctx = load(stubFigma([{ name: 'colors / other', modes: ['default'], variables }]));
  const seen = await ctx.colorsRecognise('colors / other', 'black', null);
  assert.equal(seen.found, false);
  assert.match(seen.declined, /^black is an alpha ramp \(13 of 14 non-opaque\)\./);
  assert.match(seen.declined, /can't work on it\.$/);
  // Declined *before* anything is derived: no anchors, no itemised skips.
  assert.equal(seen.anchors, null);
  assert.deepEqual(seen.skipped, []);
});

test('below half, a non-opaque variable is reported and skipped one by one', async () => {
  const ctx = load(stubFigma(neutralSpec({
    extra: [{ name: 'neutral/ghost', values: { Ash: rgbOf('#FFFFFF', 0.8), Granite: rgbOf('#FFFFFF', 0.8),
                                               Bark: rgbOf('#FFFFFF', 0.8) } }],
  })));
  const seen = await ctx.colorsRecognise('color - neutral (formerly Ash)', 'neutral', 'Ash');
  assert.equal(seen.found, true, 'one translucent variable should not decline a 17-strong group');
  assert.equal(seen.declined, null);
  assert.deepEqual(seen.skipped, [{ name: 'neutral/ghost', why: 'not opaque (alpha 0.8)' }]);
  // And it is out of the anchors: 16 usable steps, not 17.
  assert.equal(seen.steps.length, 16);
  assert.equal(seen.steps.indexOf('ghost'), -1);
});

test('an alias is read through to its value and named, never treated as a raw colour', async () => {
  // Unverified against a real file: there are zero aliases in 194 COLOR variables in `codefig-test`. This
  // checks the code does what the brief says, not that the brief was right about a real file.
  const spec = neutralSpec();
  spec.push({
    name: 'Primitives', modes: ['default'],
    variables: [{ name: 'grey/mid', values: { default: rgbOf('#808080') } }],
  });
  // Same-collection alias: neutral/300 points at neutral/25. Cross-collection: neutral/350 → Primitives.
  spec[0].variables[7].values.Ash = { type: 'VARIABLE_ALIAS', id: 'v0-0' };
  spec[0].variables[8].values.Ash = { type: 'VARIABLE_ALIAS', id: 'v1-0' };

  const ctx = load(stubFigma(spec));
  const seen = await ctx.colorsRecognise('color - neutral (formerly Ash)', 'neutral', 'Ash');
  assert.equal(seen.found, true);
  assert.deepEqual(seen.aliased, ['neutral/300', 'neutral/350'],
    'both aliases should be named, whichever collection they point into');
  // Read *through*: the strip shows the real colour, so 300 reads as 25's value and 350 as the primitive's.
  assert.equal(seen.existing[7], '#FAFAFA', 'the same-collection alias was not resolved');
  assert.equal(seen.existing[8], '#808080', 'the cross-collection alias was not resolved');
  // Still steps, still counted, still anchored from — reading is not excluding.
  assert.equal(seen.steps.length, 16);
  assert.deepEqual(seen.skipped, []);
});

test('an alias into a library, or a chain that never lands, is skipped rather than guessed', async () => {
  const spec = neutralSpec();
  // An id that resolves to nothing at all — a library variable this document cannot reach.
  spec[0].variables[7].values.Ash = { type: 'VARIABLE_ALIAS', id: 'not-a-real-id' };
  const ctx = load(stubFigma(spec));
  const seen = await ctx.colorsRecognise('color - neutral (formerly Ash)', 'neutral', 'Ash');
  assert.deepEqual(seen.aliased, ['neutral/300']);
  assert.deepEqual(seen.skipped, [{ name: 'neutral/300', why: 'alias did not resolve' }]);
  assert.equal(seen.steps.length, 15, 'the unresolved step should be out of the ramp');
});

test('a name that is not a step is ignored silently, and a duplicate is reported', async () => {
  const ctx = load(stubFigma(neutralSpec({
    extra: [
      // Not ours: a group may hold anything, and reporting it would make the panel look like it found a fault.
      { name: 'neutral/on-surface/raised', values: { Ash: rgbOf('#123456') } },
      { name: 'neutral/@@@', values: { Ash: rgbOf('#123456') } },
      { name: 'neutral/300', values: { Ash: rgbOf('#00FF00') } },
    ],
  })));
  const seen = await ctx.colorsRecognise('color - neutral (formerly Ash)', 'neutral', 'Ash');
  assert.equal(seen.found, true);
  // The nested name and the unparseable one are not mentioned anywhere.
  const mentioned = JSON.stringify([seen.skipped, seen.duplicates, seen.notes]);
  assert.equal(/raised|@@@/.test(mentioned), false, 'a name that is not ours was reported');
  // The duplicate is reported and the first is kept.
  assert.deepEqual(seen.duplicates, ['neutral/300']);
  assert.equal(seen.existing[7], '#B5BAB9', 'the duplicate won instead of the first');
});

test('fewer than three steps is the nothing-selected answer, not a special case', async () => {
  // The path that crashed in phase 1. Same answer as an unknown collection: `found: false`, no anchors, and
  // a caller draws the generated strip alone.
  const ctx = load(stubFigma([{
    name: 'Thin', modes: ['default'],
    variables: [{ name: 'x/50', values: { default: rgbOf('#FFFFFF') } },
                { name: 'x/950', values: { default: rgbOf('#000000') } }],
  }]));
  const thin = await ctx.colorsRecognise('Thin', 'x', null);
  const absent = await ctx.colorsRecognise('No Such Collection', 'x', null);
  const emptyGroup = await ctx.colorsRecognise('Thin', 'nope', null);

  for (const [label, seen] of [['two steps', thin], ['no collection', absent], ['empty group', emptyGroup]]) {
    assert.equal(seen.found, false, label + ' claimed to have found a ramp');
    assert.equal(seen.anchors, null, label + ' derived anchors from nothing');
    assert.deepEqual(seen.existing, [], label + ' returned values');
  }
  assert.match(thin.notes[0], /Fewer than three usable steps/);
  assert.deepEqual(absent.notes, [], 'an absent collection needs no note; there is nothing to say');
});

test('nothing in the read path writes', () => {
  // Read-only is what lets this run on every edit to Collection or Group. Checked at the source, because a
  // write would not fail a test — it would change a file.
  const source = fs.readFileSync(path.join(LIBS, '@foundation.js'), 'utf8');
  const start = source.indexOf('async function colorsRecognise');
  const end = source.indexOf('function colorsTrim');
  assert.ok(start !== -1 && end > start, 'the read path moved');
  const body = source.slice(start, end);
  for (const forbidden of ['setValueForMode', 'createVariable', '.remove()', 'setSharedPluginData',
                           'renameMode', 'addMode']) {
    assert.equal(body.indexOf(forbidden), -1, 'the read path calls ' + forbidden);
  }
});

test('recognition answers in both models, and the fill picks by the panel', () => {
  // A hue is not one quantity across models. `#F0F1F0` reads as OKLCH hue 155.5 and HSL hue 120 — both
  // correct, neither interchangeable. Before the HSL fields existed nothing showed the difference, because
  // there was no HSL field to fill wrongly; adding them made "fill hue" ambiguous, so recognition reads the
  // file once and answers in both, and the choice moves to the fill where the panel's setting is known.
  const ctx = load();
  const hexes = ['#FAFAFA', '#B5BAB8', '#111517'];
  const okl = hexes.map((h) => ctx.oklchFromHex(h));
  const hsl = hexes.map((h) => ctx.oklchHslFromHex(h));

  assert.ok(Math.abs(okl[1].H - hsl[1].H) > 5,
    'the two models agree on hue for this colour, so the fixture cannot show the bug');

  // Saturation and lightness are 0–1 from the reader and 0–100 in the panel, which is the conversion the
  // fill does. Getting it the wrong way round is a ramp that generates black.
  hsl.forEach((reading) => {
    assert.ok(reading.L >= 0 && reading.L <= 1, 'HSL lightness left 0–1');
    assert.ok(reading.C >= 0 && reading.C <= 1, 'HSL saturation left 0–1');
  });
  assert.equal(Math.round(hsl[0].L * 100), 98);
});

test('a read fills both models, so switching between them is lossless', async () => {
  // **The rule the anchors already followed and the curves did not.** A read fits the shape of the ramp; the
  // only thing model-specific about it is which numbers get looked at. Filling just the selected model made
  // the switch lossy in a way nothing on screen announced — measured across this file's sixteen sets,
  // reading in HSL and switching to OKLCH landed a mean of 59 8-bit levels from the file against 10 for a
  // native OKLCH read, because the collection's ladder was still the block's shipped Linear default.
  //
  // Chroma and saturation get *separate* curves rather than one refitted on switch: they are different
  // quantities — one absolute, one already a fraction of what the lightness holds — so a curve fitted to
  // one describes nothing about the other.
  for (const model of ['hsl', 'oklch']) {
    const ctx = load(stubFigma(neutralSpec()));
    const found = await ctx.foundationColorsAutoImport(
      'color - neutral (formerly Ash)', 'neutral', ['Ash'], model);

    assert.equal(found.source, 'recognised', model + ': nothing was read');
    const mode = found.config.modes[0];

    assert.ok(Array.isArray(found.config.curve) && found.config.curve.length,
      model + ": the collection's OKLCH ladder was left at the block default");
    assert.ok(Array.isArray(mode.curve) && mode.curve.length,
      model + ": the mode's HSL ladder was not filled");
    assert.ok(Array.isArray(mode.chromaCurve), model + ': no OKLCH chroma curve');
    assert.ok(Array.isArray(mode.saturationCurve), model + ': no HSL saturation curve');
  }

  // And the two reads agree: what a read produces cannot depend on which model happened to be selected.
  const a = await load(stubFigma(neutralSpec()))
    .foundationColorsAutoImport('color - neutral (formerly Ash)', 'neutral', ['Ash'], 'hsl');
  const b = await load(stubFigma(neutralSpec()))
    .foundationColorsAutoImport('color - neutral (formerly Ash)', 'neutral', ['Ash'], 'oklch');
  assert.deepEqual(a.config.curve, b.config.curve, 'the shared ladder differs by selected model');
  assert.deepEqual(a.config.modes[0].curve, b.config.modes[0].curve,
    "the mode's ladder differs by selected model");
  assert.deepEqual(a.config.modes[0].chromaCurve, b.config.modes[0].chromaCurve,
    'the chroma curve differs by selected model');
  assert.deepEqual(a.config.modes[0].saturationCurve, b.config.modes[0].saturationCurve,
    'the saturation curve differs by selected model');
});

test('the OKLCH ladder is averaged across the modes, not taken from the first', async () => {
  // **The ladder is the collection's, so no one mode may set it.** Reading `neutral` first-mode-wins
  // gave whichever mode came back first a ladder fitted to itself and the other two a ladder fitted to
  // someone else. On `lime` that was worth thirteen 8-bit levels: 11 for the mode that supplied it and
  // **21** for the one that did not, purely by order.
  const lib = await load(stubFigma(neutralSpec()));
  const all = ['Ash', 'Granite', 'Bark'];

  const together = await lib.foundationColorsAutoImport(
    'color - neutral (formerly Ash)', 'neutral', all, 'oklch');
  assert.deepEqual(together.recognition.lightnessFrom, all,
    'the ladder does not name every mode it came from');

  // Not any one mode's own fit — that is the shape of the bug, and the modes are close enough here that
  // only an exact comparison can see the difference.
  for (const name of all) {
    const alone = await load(stubFigma(neutralSpec()))
      .foundationColorsAutoImport('color - neutral (formerly Ash)', 'neutral', [name], 'oklch');
    assert.notDeepEqual(together.config.curve, alone.config.curve,
      'the shared ladder is ' + name + "'s own, so it was not averaged");
  }

  // And the average sits between the modes it was taken from, at both ends.
  const ends = await Promise.all(all.map(function (name) {
    return load(stubFigma(neutralSpec()))
      .foundationColorsAutoImport('color - neutral (formerly Ash)', 'neutral', [name], 'oklch');
  }));
  for (const end of ['bright', 'dark']) {
    const own = ends.map(function (r) { return r.config.lightness[end]; });
    const shared = together.config.lightness[end];
    assert.ok(shared >= Math.min.apply(null, own) && shared <= Math.max.apply(null, own),
      end + ' ' + shared + ' is outside the modes it averages (' + own.join(', ') + ')');
  }
});
