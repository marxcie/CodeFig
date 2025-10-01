// Custom typography configuration
// Override the DS Foundation Typography default configuration

// This will override the default typographyConfigData in DS Foundation
var typographyConfigData = {
  fontFamily: "Roboto",
  fontWeights: {
    light: 300,
    regular: 400,
    medium: 500,
    bold: 700
  },
  structure: {
    variableCollection: "My Design System",
    variableGroup: "Typography"
  },
  fontScale: ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"],
  fontSizes: {
    desktop: {
      baseFont: {
        level: "base",
        size: 18,
        lineHeight: 1.6,
        letterSpacing: -0.1
      },
      minFont: {
        size: 12,
        lineHeight: 1.3,
        letterSpacing: 0,
        force: 0
      },
      maxFont: {
        size: 120,
        lineHeight: 1.1,
        letterSpacing: -2,
        force: -0.8
      }
    },
    mobile: {
      baseFont: {
        level: "base",
        size: 16,
        lineHeight: 1.5,
        letterSpacing: 0
      },
      minFont: {
        size: 10,
        lineHeight: 1.2,
        letterSpacing: 0.2,
        force: 0.1
      },
      maxFont: {
        size: 80,
        lineHeight: 1.2,
        letterSpacing: -1.5,
        force: -0.6
      }
    }
  },
  styles: {
    createAndUpdateStyles: true,
    styleNaming: "Custom/{$fontScale}/{$fontWeight}"
  },
  scalingMethod: "additive" // Options: "additive" (current) or "multiplicative"
};

// Create the typographyConfig that DS Foundation expects
var typographyConfig = {
  config: typographyConfigData
};

// Import the specific functions we need from DS Foundation
@import { generateTypographyVariables, createOrUpdateCollection, calculateFluidFontSize, calculateFluidLineHeight, calculateFluidLetterSpacing, calculateMultiplicativeSize, applyForceCurve, createOrUpdateTextStyles } from "DS Foundation: Typography"

// Import core functions from @Core Library
@import { getOrCreateCollection, extractModes, setupModes, processVariables, createOrUpdateVariable } from "@Core Library"

// Generate and create typography system
try {
  typographyConfig.variables = generateTypographyVariables(typographyConfigData);
  var result = createOrUpdateCollection(typographyConfig);
  
  var summary = '✅ Typography: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' vars updated';
  summary += ', ' + result.styleStats.created + ' styles created, ' + result.styleStats.updated + ' styles updated';
  figma.notify(summary);
} catch (error) {
  var errorMessage = error && error.message ? error.message : 'Unknown error';
  figma.notify('❌ Typography error: ' + errorMessage);
}
