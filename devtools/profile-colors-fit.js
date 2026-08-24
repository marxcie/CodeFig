/**
 * B1 of `.plans/34-devtools-harness.md`: profiles `colorsAnchorFits`/`colorsFitCurve` in plain
 * Node, no Figma, no browser. This is the cheapest possible answer to "where does the
 * multi-second Colors read time actually go" — the function has no `figma` calls at all, so it
 * runs identically here as it does spliced into a real script.
 *
 * Dependency-free on purpose: `vm` and `fs` are Node core. Do not add a bundler or a test
 * framework here — this is a profiling probe, not a suite.
 *
 * Usage: `npm run devtools:profile-colors-fit`
 *   --cpu-prof     also writes a .cpuprofile file (load it in chrome://inspect or DevTools'
 *                  Performance panel to see the flame graph interactively)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LIB_DIR = path.join(__dirname, '..', 'scripts', 'CODEFIG_LIBRARIES');

/** Real Ash-mode values read from `color - neutral (formerly Ash)` via the dev bridge, 2026-08-24. */
const ASH_RGB = [
  [0.98, 0.98, 0.98], [0.97, 0.97, 0.97], [0.95, 0.95, 0.95], [0.92, 0.92, 0.92],
  [0.87, 0.89, 0.88], [0.83, 0.85, 0.84], [0.79, 0.81, 0.80], [0.71, 0.73, 0.72],
  [0.63, 0.65, 0.64], [0.48, 0.52, 0.51], [0.36, 0.38, 0.38], [0.23, 0.26, 0.27],
  [0.16, 0.19, 0.20], [0.12, 0.15, 0.16], [0.08, 0.09, 0.10], [0.07, 0.08, 0.09],
];
const STEPS = ['25', '50', '75', '100', '150', '200', '250', '300', '350', '400',
  '500', '600', '700', '800', '900', '950'];

function rgbToHex(r, g, b) {
  const c = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** Loads the pure-computation half of @Color Ramp's dependency chain into one vm context. */
function loadLibs() {
  const sandbox = {};
  vm.createContext(sandbox);
  const source = ['@bezier.js', '@oklch.js', '@color-ramp.js']
    .map((f) => fs.readFileSync(path.join(LIB_DIR, f), 'utf8').replace(/^@import.*$/gm, ''))
    .join('\n');
  vm.runInContext(source, sandbox, { filename: 'colors-fit-libs' });
  return sandbox;
}

function main() {
  const sandbox = loadLibs();
  const hexes = ASH_RGB.map(([r, g, b]) => rgbToHex(r, g, b));

  const N = 20;
  const perCallMs = [];
  for (let i = 0; i < N; i++) {
    const t0 = process.hrtime.bigint();
    sandbox.colorsAnchorFits(hexes, STEPS);
    const t1 = process.hrtime.bigint();
    perCallMs.push(Number(t1 - t0) / 1e6);
  }
  const mean = perCallMs.reduce((a, b) => a + b, 0) / N;
  const min = Math.min(...perCallMs);
  const max = Math.max(...perCallMs);

  console.log(`colorsAnchorFits(16 real points): mean ${mean.toFixed(1)}ms, min ${min.toFixed(1)}ms, max ${max.toFixed(1)}ms, over ${N} calls`);
  console.log('Baseline (2026-08-24, this machine, warm and cold both land here): ~440ms/call.');
  console.log('This is pure computation — no figma.*, no IPC, no postMessage. If this number');
  console.log('moves, something about the fitting algorithm changed. If Figma\'s measured');
  console.log('per-mode cost (~1.5-1.8s) moves without this number moving, the gap between them');
  console.log('is elsewhere — see .plans/34-devtools-harness.md, B1, for what is and is not');
  console.log('explained by this profile.');

  if (process.argv.includes('--cpu-prof')) {
    console.log('\nFor a flame graph: run this file directly with --cpu-prof, e.g.');
    console.log('  node --cpu-prof --cpu-prof-dir=devtools --cpu-prof-name=colors-fit.cpuprofile devtools/profile-colors-fit.js');
    console.log('then load devtools/colors-fit.cpuprofile in Chrome DevTools\' Performance panel.');
  }
}

main();
