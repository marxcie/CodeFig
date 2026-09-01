/**
 * Build-time package definitions (plan `.plans/32-packages.md`).
 *
 * A package is a runtime manifest stamped onto member scripts during `build-scripts.js` /
 * `findAllScripts`. Membership is explicit: scripts live under one folder, shared libraries
 * live under `CODEFIG_LIBRARIES/`, so ownership cannot be inferred from a single directory.
 *
 * Step 6 (trimming DSF import blocks) is gated separately — this file only names members.
 */

/** Libraries owned by Design System Foundations — private to the package once wired. */
const DSF_PACKAGE_LIBRARIES = [
  '@Foundation',
  '@Linear Ramp',
  '@Color Ramp',
  '@OKLCH',
  '@Type Scale',
  '@Scale Models',
  '@Foundation overview',
  '@Bezier',
  '@Math Helpers',
];

/**
 * Packages to compile at build time.
 * `folder` is the path under `scripts/EXAMPLE_SCRIPTS/` (or another category) whose `.js`
 * files become public script members.
 */
const PACKAGES = [
  {
    id: 'design-system-foundations',
    name: 'Design System Foundations',
    /** Relative to `scripts/` — every `.js` here is a public script member. */
    scriptFolder: 'EXAMPLE_SCRIPTS/Design System Foundations',
    libraries: DSF_PACKAGE_LIBRARIES,
    /** Optional shared sheet; unused — DSF preview CSS is inline `@STYLE_START` (user-script parity). */
    styleSheet: null,
  },
];

module.exports = { PACKAGES, DSF_PACKAGE_LIBRARIES };
