// DS Foundation: Colors
// @DOC_START
// # DS Foundation: Colors
// Create and update color system variables programmatically.
//
// ## Overview
// Defines a color variable collection with light/dark (or other) modes. Config holds hex values per mode; the script creates variables (e.g. primary/50, primary/500, secondary, accent) from that config.
//
// ## Config options
// - **collectionName** / **structure.variableCollection** – Collection name.
// - **structure.variableGroup** – Optional group path.
// - **config** – Per-mode (e.g. light, dark) color values: primary, primaryLight, primaryDark, secondary, accent, background, surface, text, textMuted.
// - **variables** – Map of variable names to { type: "COLOR", values: { modeName: function(config) => hex } }.
// @DOC_END

// Import functions from libraries
@import { getOrCreateCollection, setupModes, createOrUpdateVariable, extractModes, processVariables } from "@Variables"
@import { hexToRgb, rgbToHex } from "@Core Library"

// ========================================
// COLOR SYSTEM CONFIGURATION
// ========================================

// Helper: variable name prefix (no leading slash when group is empty — Figma rejects names like "/primary/50")
function variableNamePrefix(group) {
  return group ? group + '/' : '';
}

// Use existing config if already defined, otherwise use default
var colorConfig = typeof colorConfig !== 'undefined' ? colorConfig : {
  // @CONFIG_START
  collectionName: "Colors",
  structure: {
    variableCollection: "Colors",
    variableGroup: ""
  },
  
  // Configuration values (NOT added as variables)
  config: {
    light: {
      primary: "#3b82f6",
      primaryLight: "#eff6ff", 
      primaryDark: "#1e3a8a",
      secondary: "#10b981",
      secondaryLight: "#ecfdf5",
      secondaryDark: "#047857",
      accent: "#f59e0b",
      accentLight: "#fffbeb",
      accentDark: "#92400e",
      background: "#ffffff",
      surface: "#f8fafc",
      text: "#1f2937",
      textMuted: "#6b7280"
    },
    dark: {
      primary: "#60a5fa",
      primaryLight: "#eff6ff",
      primaryDark: "#1e3a8a", 
      secondary: "#34d399",
      secondaryLight: "#ecfdf5",
      secondaryDark: "#047857",
      accent: "#fbbf24",
      accentLight: "#fffbeb",
      accentDark: "#92400e",
      background: "#0f172a",
      surface: "#1e293b",
      text: "#f9fafb",
      textMuted: "#9ca3af"
    }
  },
  
  // @CONFIG_END
  
  // Variables to be created in Figma
  variables: {
    // Primary colors
    "primary/50": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.primaryLight; },
        "Dark": function(config) { return config.dark.primaryLight; }
      }
    },
    "primary/500": {
      type: "COLOR", 
      values: {
        "Light": function(config) { return config.light.primary; },
        "Dark": function(config) { return config.dark.primary; }
      }
    },
    "primary/900": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.primaryDark; },
        "Dark": function(config) { return config.dark.primaryDark; }
      }
    },
    
    // Secondary colors
    "secondary/50": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.secondaryLight; },
        "Dark": function(config) { return config.dark.secondaryLight; }
      }
    },
    "secondary/500": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.secondary; },
        "Dark": function(config) { return config.dark.secondary; }
      }
    },
    "secondary/900": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.secondaryDark; },
        "Dark": function(config) { return config.dark.secondaryDark; }
      }
    },
    
    // Accent colors
    "accent/50": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.accentLight; },
        "Dark": function(config) { return config.dark.accentLight; }
      }
    },
    "accent/500": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.accent; },
        "Dark": function(config) { return config.dark.accent; }
      }
    },
    "accent/900": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.accentDark; },
        "Dark": function(config) { return config.dark.accentDark; }
      }
    },
    
    // Surface colors
    "surface/background": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.background; },
        "Dark": function(config) { return config.dark.background; }
      }
    },
    "surface/card": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.surface; },
        "Dark": function(config) { return config.dark.surface; }
      }
    },
    
    // Text colors
    "text/primary": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.text; },
        "Dark": function(config) { return config.dark.text; }
      }
    },
    "text/secondary": {
      type: "COLOR",
      values: {
        "Light": function(config) { return config.light.textMuted; },
        "Dark": function(config) { return config.dark.textMuted; }
      }
    }
  }
};

// ========================================
// CORE FUNCTIONS
// ========================================

function createOrUpdateCollection(config) {
  var collectionName = (config.structure && config.structure.variableCollection != null) ? config.structure.variableCollection : config.collectionName;
  var group = (config.structure && config.structure.variableGroup !== undefined) ? config.structure.variableGroup : '';
  var prefix = variableNamePrefix(group);
  
  console.log('=== COLOR SYSTEM MANAGER ===');
  console.log('Processing collection: ' + collectionName + (group ? ' (group: ' + group + ')' : ' (no group)'));
  
  // Get or create collection using imported function
  var collection = getOrCreateCollection(collectionName);
  
  // Extract modes from variable values or use default (imported function)
  var modes = extractModes(config);
  console.log('Detected modes: ' + modes.join(', '));
  
  // Setup modes (imported function)
  setupModes(collection, modes);
  
  // Prefix variable names with group when set (no leading slash when group empty)
  var variablesWithPrefix = {};
  for (var key in config.variables) {
    variablesWithPrefix[prefix + key] = config.variables[key];
  }
  
  // Process variables (imported function)
  var stats = processVariables(collection, variablesWithPrefix, config.config, modes);
  
  console.log('=== COLOR SYSTEM SUMMARY ===');
  console.log('Collection: ' + collectionName);
  console.log('Variables created: ' + stats.created);
  console.log('Variables updated: ' + stats.updated);
  console.log('Variables skipped: ' + stats.skipped);
  
  return {
    collection: collection,
    stats: stats
  };
}

// ========================================
// EXECUTION
// ========================================

try {
  var result = createOrUpdateCollection(colorConfig);
  figma.notify('✅ Color System: ' + result.stats.created + ' created, ' + result.stats.updated + ' updated');
} catch (error) {
  console.error('Error:', error);
  figma.notify('❌ Error: ' + error.message);
}
