/**
 * Example DSF configs used in tests that need populated values.
 *
 * Shipped `@CONFIG` blocks are intentionally empty until a collection is chosen;
 * arithmetic, round-trip, and panel tests state the modes and tokens they need here
 * rather than borrowing whatever the block holds today.
 */
module.exports = {
  spacing: {
    collectionName: '',
    group: 'Spacing',
    spacings: ['px', 'xs', 'sm', 'md', 'lg', 'xl'],
    generateOverview: false,
    modes: [{
      name: 'Value',
      scaleType: 'bezier',
      base: 4,
      ratio: 1.5,
      curve: [],
      step: 4,
      mod: 3,
      roundTo: 2,
      extras: [1],
    }],
  },
  radius: {
    collectionName: '',
    group: 'Corner radius',
    radii: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
    generateOverview: false,
    modes: [{
      name: 'Value',
      scaleType: 'bezier',
      base: 4,
      ratio: 1.5,
      curve: [],
      step: 4,
      mod: 3,
      roundTo: 2,
      extras: [0],
    }],
  },
  typography: {
    collectionName: '',
    group: 'Typography',
    fontScale: [
      'Text-Tiny', 'Text-Small', 'Text-Regular', 'Text-Large',
      'Heading-6', 'Heading-5', 'Heading-4', 'Heading-3', 'Heading-2', 'Heading-1',
    ],
    fontFamily: 'Inter',
    fontWeights: [400, 600],
    createStyles: true,
    styleNaming: 'Typography/{$fontScale}/{$fontWeight}',
    textWrapStyle: 'AUTO',
    generateOverview: false,
    modes: [{
      name: 'Value',
      scaleType: 'bezier',
      base: 8,
      ratio: 1.25,
      curve: [],
      letterSpacing: { base: 0, max: -2 },
      lineHeight: { base: 150, max: 110 },
      roundTo: 2,
    }],
    overviewPreviewText: 'Sphinx of black quartz,\njudge my vow.',
  },
  grid: {
    collectionName: '',
    group: 'Grid',
    extensionColumns: 0,
    extraValues: [],
    generateOverview: false,
    modes: [
      { name: 'Value', containerWidth: 1920, columns: 12, gap: 40, padding: 80 },
    ],
  },
};
