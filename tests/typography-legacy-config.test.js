/**
 * Typography's older config shape still generates exactly what it generated.
 *
 * The panel gives each mode its own scale (`scaleType`, `base`, `step`/`ratio`), which is a different
 * model from the one this script has carried for years: per-mode `minFont`/`baseFont`/`maxFont` with a
 * single top-level curve and easing. Márton's instruction from plan 19b was that the old code paths
 * **stay** — they simply lose their controls — so someone whose config predates the panel keeps their
 * variables.
 *
 * Nothing pinned that. The frozen fixtures in `tests/fixtures/` cover the Spacing and Corner radius
 * collapse and say nothing about typography, so the refactor that taught `generateTypographyVariables`
 * a second shape could have moved every number in the old one and no test would have noticed.
 *
 * These values were generated from the shipped config **before** that refactor and are frozen here.
 * The legacy config travels with the test rather than being read from the script, because the shipped
 * block is exactly what the panel change rewrites — reading it would make this test agree with whatever
 * the file says today, which is the opposite of a pin.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { resolveImports } = require('../src/import-resolver.js');
const { findAllScripts } = require('../validate-scripts.js');

/** The shipped config as of commit 8931819 — sine easing, twoSegment, min/base/max per viewport. */
const LEGACY = {
  collectionName: 'Responsive System',
  group: 'Typography',
  fontFamily: 'Inter',
  fontWeights: { Regular: 400, Semibold: 600 },
  fontScale: [
    'Text-Tiny', 'Text-Small', 'Text-Regular', 'Text-Large',
    'Heading-6', 'Heading-5', 'Heading-4', 'Heading-3', 'Heading-2', 'Heading-1',
  ],
  fontScaling: {
    type: 'sine', rangeMode: 'twoSegment', ease: 'in',
    roundLowerValuesTo: 1, roundUpperValuesTo: 2,
  },
  figmaStyles: { createAndUpdateStyles: true, styleNaming: 'Typography/{$fontScale}/{$fontWeight}' },
  generateOverview: false,
  modes: [
    {
      name: 'desktop',
      minFont: { size: 8, lineHeight: 1.25, letterSpacing: 0 },
      baseFont: { level: 'Text-Regular', size: 18, lineHeight: 1.5, letterSpacing: -0.2 },
      maxFont: { size: 200, lineHeight: 1, letterSpacing: -3 },
    },
    {
      name: 'tablet',
      minFont: { size: 8, lineHeight: 1.25, letterSpacing: 0 },
      baseFont: { level: 'Text-Regular', size: 16, lineHeight: 1.5, letterSpacing: -0.2 },
      maxFont: { size: 160, lineHeight: 1, letterSpacing: -2.5 },
    },
    {
      name: 'mobile',
      minFont: { size: 8, lineHeight: 1.5, letterSpacing: 0 },
      baseFont: { level: 'Text-Regular', size: 16, lineHeight: 1.25, letterSpacing: -0.2 },
      maxFont: { size: 120, lineHeight: 1, letterSpacing: -2 },
    },
  ],
};

/** Frozen output: every size, line height and letter spacing the config above produced. */
const EXPECTED = {
  'Typography/Text-Tiny/font-size': { Desktop: 8, Tablet: 8, Mobile: 8 },
  'Typography/Text-Tiny/line-height': { Desktop: 10, Tablet: 10, Mobile: 12 },
  'Typography/Text-Tiny/letter-spacing': { Desktop: 0, Tablet: 0, Mobile: 0 },
  'Typography/Text-Small/font-size': { Desktop: 10, Tablet: 10, Mobile: 10 },
  'Typography/Text-Small/line-height': { Desktop: 13, Tablet: 13, Mobile: 14 },
  'Typography/Text-Small/letter-spacing': { Desktop: -0.06, Tablet: -0.06, Mobile: -0.06 },
  'Typography/Text-Regular/font-size': { Desktop: 18, Tablet: 16, Mobile: 16 },
  'Typography/Text-Regular/line-height': { Desktop: 27, Tablet: 24, Mobile: 20 },
  'Typography/Text-Regular/letter-spacing': { Desktop: -0.2, Tablet: -0.2, Mobile: -0.2 },
  'Typography/Text-Large/font-size': { Desktop: 22, Tablet: 20, Mobile: 18 },
  'Typography/Text-Large/line-height': { Desktop: 32, Tablet: 30, Mobile: 22 },
  'Typography/Text-Large/letter-spacing': { Desktop: -0.27, Tablet: -0.26, Mobile: -0.25 },
  'Typography/Heading-6/font-size': { Desktop: 36, Tablet: 30, Mobile: 26 },
  'Typography/Heading-6/line-height': { Desktop: 52, Tablet: 44, Mobile: 32 },
  'Typography/Heading-6/letter-spacing': { Desktop: -0.48, Tablet: -0.43, Mobile: -0.38 },
  'Typography/Heading-5/font-size': { Desktop: 58, Tablet: 48, Mobile: 38 },
  'Typography/Heading-5/line-height': { Desktop: 80, Tablet: 66, Mobile: 46 },
  'Typography/Heading-5/letter-spacing': { Desktop: -0.81, Tablet: -0.7, Mobile: -0.59 },
  'Typography/Heading-4/font-size': { Desktop: 86, Tablet: 70, Mobile: 56 },
  'Typography/Heading-4/line-height': { Desktop: 112, Tablet: 92, Mobile: 64 },
  'Typography/Heading-4/letter-spacing': { Desktop: -1.25, Tablet: -1.07, Mobile: -0.88 },
  'Typography/Heading-3/font-size': { Desktop: 122, Tablet: 98, Mobile: 74 },
  'Typography/Heading-3/line-height': { Desktop: 148, Tablet: 120, Mobile: 82 },
  'Typography/Heading-3/letter-spacing': { Desktop: -1.79, Tablet: -1.5, Mobile: -1.22 },
  'Typography/Heading-2/font-size': { Desktop: 160, Tablet: 128, Mobile: 96 },
  'Typography/Heading-2/line-height': { Desktop: 178, Tablet: 142, Mobile: 102 },
  'Typography/Heading-2/letter-spacing': { Desktop: -2.38, Tablet: -1.99, Mobile: -1.6 },
  'Typography/Heading-1/font-size': { Desktop: 200, Tablet: 160, Mobile: 120 },
  'Typography/Heading-1/line-height': { Desktop: 200, Tablet: 160, Mobile: 120 },
  'Typography/Heading-1/letter-spacing': { Desktop: -3, Tablet: -2.5, Mobile: -2 },};

/** Load typography.js the way the sandbox does, minus the execution tail. */
function loadTypography() {
  const scripts = findAllScripts(path.join(__dirname, '..', 'scripts'), { includeStaging: true });
  const script = scripts.filter((s) => /typography\.js$/.test(s.path))[0];
  let code = resolveImports(script.code, scripts, {});
  code = code.slice(0, code.indexOf('createOrUpdateCollection(typographyConfig)'));
  return new Function('figma', 'console', 'window',
    code +
    '; return { generateTypographyVariables: generateTypographyVariables,' +
    ' ensureCompatTypographyConfig: ensureCompatTypographyConfig,' +
    ' materializeFontSizes: materializeFontSizes };'
  )({ notify() {} }, { log() {}, warn() {}, error() {} }, {});
}

test('the old config shape generates exactly what it always did', () => {
  const T = loadTypography();
  const config = JSON.parse(JSON.stringify(LEGACY));
  T.ensureCompatTypographyConfig(config);
  T.materializeFontSizes(config);
  const variables = T.generateTypographyVariables(config);

  Object.keys(EXPECTED).forEach((name) => {
    assert.ok(variables[name], name + ' is missing — the legacy path stopped generating it');
    assert.deepEqual(variables[name].values, EXPECTED[name], name);
  });
  // And nothing extra: a legacy config must not gain variables from the new model either.
  const scaleVars = Object.keys(variables).filter((n) => /font-size|line-height|letter-spacing/.test(n));
  assert.equal(scaleVars.length, Object.keys(EXPECTED).length);
});
