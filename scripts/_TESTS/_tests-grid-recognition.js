// Tests: grid recognition
// @DOC_START
// # Tests: grid recognition
// In-Figma spec for `gridRecognise` and auto-import's second answer. Not shipped (`_` prefix).
//
// **This can only be tested here.** Recognition reads real variables: their names, their
// `valuesByMode`, and the 32-bit floats Figma actually stores. A mock would hand back the numbers it
// was given, and the two things most likely to be wrong — whether the naming scheme is matched, and
// whether a value derived from the `col-N` series comes back as `1440` or `1439.9999694824219` — are
// exactly the things a mock cannot have an opinion about.
//
// What it covers: a set with **no manifest** (every grid made before CodeFig recorded them, and every
// grid made by hand to the same scheme), the same set missing `viewport-width`, the same missing
// `columns` as well, a set whose stored values do not match what the config would generate, and a
// collection that is not a grid at all.
//
// Run with `npm run test:figma -- grid-recognition`. Everything here writes, so it needs a file whose
// name contains `codefig-test`.
// @DOC_END

@import { testBegin, itInTestFile, expect, testFinish, testPrefix, cleanupTestArtifacts } from "@Test Harness"
@import { gridRecognise, foundationAutoImport } from "@Foundation"
@import { calculateColumnWidth } from "@Core Library"

function recognitionModes() {
  return [
    { name: 'Desktop', containerWidth: 1440, columns: 12, gap: 24, padding: 80 },
    { name: 'Mobile', containerWidth: 390, columns: 4, gap: 16, padding: 20 }
  ];
}

/**
 * A grid built the way the generator builds one, and **nothing in plugin data**.
 *
 * `opts.noWidth` / `opts.noColumns` leave a variable out, which is what an older set looks like.
 * `opts.breakCol` puts one value off by 7 in the first mode, which is what a hand-edited one looks
 * like.
 */
function buildGrid(suffix, opts) {
  var options = opts || {};
  var modes = recognitionModes();
  var collection = figma.variables.createVariableCollection(testPrefix() + '/recognise' + suffix);
  var ids = {};

  collection.renameMode(collection.modes[0].modeId, modes[0].name);
  ids[modes[0].name] = collection.modes[0].modeId;
  for (var i = 1; i < modes.length; i++) ids[modes[i].name] = collection.addMode(modes[i].name);

  function set(name, valueFor) {
    var variable = figma.variables.createVariable('Grid/' + name, collection, 'FLOAT');
    modes.forEach(function (mode) { variable.setValueForMode(ids[mode.name], valueFor(mode)); });
  }

  if (!options.noColumns) set('columns', function (m) { return m.columns; });
  set('gap', function (m) { return m.gap; });
  set('padding', function (m) { return m.padding; });
  if (!options.noWidth) set('viewport-width', function (m) { return m.containerWidth; });

  var maxColumns = 0;
  modes.forEach(function (m) { if (m.columns > maxColumns) maxColumns = m.columns; });
  for (var n = 1; n <= maxColumns; n++) {
    (function (col) {
      set('col-' + col, function (m) {
        if (col > m.columns) return m.containerWidth - m.padding * 2;
        var value = calculateColumnWidth(m) * col + m.gap * (col - 1);
        return (options.breakCol === col && m.name === modes[0].name) ? value + 7 : value;
      });
    })(n);
  }
  return collection;
}

testBegin('grid-recognition');

// One async wrapper, and every case awaited inside it. Without that, the cases all start at once and
// `testFinish()` reports 0 passed / 0 failed before any of them has finished — which is what this
// spec did on its first run, and it reads exactly like a spec whose cases were all skipped.
(async function () {
  await itInTestFile('reads a grid that has no manifest at all', function () {
    var collection = buildGrid('-plain', {});
    return foundationAutoImport(collection.name, 'Grid', 'grid').then(function (found) {
      // The whole point of recognition: nothing was recorded, and the answer still comes back.
      expect(found.source).toBe('recognised');
      expect(found.config.modes.length).toBe(2);
      expect(found.config.modes[0].containerWidth).toBe(1440);
      expect(found.config.modes[0].gap).toBe(24);
      expect(found.config.modes[1].columns).toBe(4);
      // And it agrees with itself: running would change none of the values it read.
      expect(found.recognition.mismatched.length).toBe(0);
      expect(found.recognition.checked > 0).toBe(true);
      // What cannot come back is named rather than left at a default that implies it was read.
      expect(found.recognition.missing.indexOf('generateOverview') !== -1).toBe(true);
      expect(found.recognition.extensionColumnsInferred).toBe(true);
    });
  });

  await itInTestFile('derives the width when there is no viewport-width variable', function () {
    var collection = buildGrid('-nowidth', { noWidth: true });
    return gridRecognise(collection.name, 'Grid').then(function (seen) {
      expect(seen.found).toBe(true);
      // Derived from the column series and the margin — and **tidied**, because Figma stores 32-bit
      // floats and the arithmetic hands back 1439.9999694824219 for a grid that was built on 1440.
      // A config block a person reads and pastes must not carry that.
      expect(seen.config.modes[0].containerWidth).toBe(1440);
      expect(seen.sources.Desktop.containerWidth).toBe('derived');
      expect(seen.sources.Desktop.gap).toBe('variable');
      expect(seen.mismatched.length).toBe(0);
    });
  });

  await itInTestFile('derives the column count when there is no columns variable either', function () {
    var collection = buildGrid('-bare', { noWidth: true, noColumns: true });
    return gridRecognise(collection.name, 'Grid').then(function (seen) {
      // `col-N` stops growing once N passes the column count, so the first repeat is the count.
      expect(seen.config.modes[0].columns).toBe(12);
      expect(seen.config.modes[1].columns).toBe(4);
      expect(seen.sources.Desktop.columns).toBe('derived');
      expect(seen.sources.Mobile.columns).toBe('derived');
    });
  });

  await itInTestFile('reports a stored value that does not fit rather than smoothing it over', function () {
    var collection = buildGrid('-off', { breakCol: 5 });
    return gridRecognise(collection.name, 'Grid').then(function (seen) {
      // The difference between "this is your grid" and "this is a grid that would overwrite yours".
      expect(seen.found).toBe(true);
      expect(seen.mismatched.length).toBe(1);
      expect(seen.mismatched[0].name).toBe('Grid/col-5');
      expect(seen.mismatched[0].mode).toBe('Desktop');
      expect(seen.mismatched[0].stored !== seen.mismatched[0].wouldBe).toBe(true);
    });
  });

  await itInTestFile('says so when a collection holds no grid', function () {
    var collection = figma.variables.createVariableCollection(testPrefix() + '/recognise-empty');
    return gridRecognise(collection.name, 'Grid').then(function (seen) {
      expect(seen.found).toBe(false);
      expect(seen.config).toBe(null);
      expect(seen.notes.length > 0).toBe(true);
    });
  });

  await itInTestFile('leaves nothing behind', function () {
    return cleanupTestArtifacts().then(function () {
      return figma.variables.getLocalVariableCollectionsAsync().then(function (collections) {
        var left = collections.filter(function (c) {
          return c.name.indexOf(testPrefix()) === 0;
        });
        expect(left.length).toBe(0);
      });
    });
  });

  testFinish();
})();
