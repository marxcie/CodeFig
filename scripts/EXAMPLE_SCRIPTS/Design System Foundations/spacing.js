// Spacing
// @DOC_START
// # Creates a spacing scale per Variable Mode with bezier, metric or fibonacci ladders and width and gap bindings
//
// ## Overview
//
// Spacing variables are generated per mode, including width and gap bindings.
//
// Enable **Generate overview** to also create a reference frame on the Figma canvas.
//
// Each mode can use its own **Scale type**:
//
// - **Bezier scale** — follows a custom curve
// - **Metric scale** — increases by a fixed amount every N tokens
// - **Fibonacci** — each step is the sum of the previous two
//
// ### Bezier scaling
//
// A bezier scale progresses from **Base unit** along a curve in logarithmic space. Drag the end
// handle to set how fast the scale grows.
//
// A straight curve produces a consistent ratio between steps. Adjusting the curve lets you keep
// smaller spacing values closer together while allowing larger values to spread out more.
//
// You can:
//
// - drag the curve handles
// - choose a preset
// - paste a `cubic-bezier(...)` value
// - enable **Add middle point** to control each half of the curve independently
//
// ### Extra spacings
//
// Off-scale values merge into the pool by size (for example a 1px hairline under a base of 4).
// They take the smallest token names; the scale continues above them. If you add a value without an
// extra token name, the largest generated value drops off the list.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Collection**<br>`collectionName` | Name of the Figma variable collection, e.g. `Responsive System`. |
// | **Collection modes** | Chips for modes in the collection. Add, remove, or rename here. Each mode gets its own settings below. |
// | **Group within collection**<br>`group` | Prefix used to group variables, e.g. `Spacing` produces names such as `Spacing/md`. |
// | **Tokens**<br>`spacings` | Token names from smallest to largest. A series works: `spacing-{1,10}` expands to ten names. |
// | **Generate overview**<br>`generateOverview` | When on, creates a spacing overview frame on the canvas: one row per token, one column per mode, with width bars bound to the variables. Off by default. |
// | **Mode**<br>`modes[].name` | Name of this mode (viewport). |
// | **Scale type**<br>`modes[].scaleType` | Bezier, Metric, or Fibonacci for this mode. |
// | **Scale**<br>`modes[].curve` | Bezier only. Curve that shapes the scale. Adding a token extends the range instead of squeezing it. |
// | **Step**<br>`modes[].step` | Metric: how much each step adds before growth starts. Fibonacci: the first increment. |
// | **Every N steps**<br>`modes[].mod` | Metric only. How often the step size grows. Step 4 and Every 3 gives 4, 4, 4, 8, 8, 8, 12. |
// | **Base unit**<br>`modes[].base` | Value of the first generated token. |
// | **Round numbers to**<br>`modes[].roundTo` | Snap generated values to multiples of this number. Use `0` for no snapping. |
// | **Extra spacings**<br>`modes[].extras` | Off-scale values merged by size into the token list. |
// @DOC_END

// The Configuration tab redraws this as you type. Pure: it generates in memory and draws
// the same table the run does, so it cannot write anything.
// @PREVIEW: spacingPreviewHtml

@import { getCollection, getOrCreateCollection, setupModes, extractModes, processVariables } from "@Variables"
@import { foundationCreateSpacingOverview } from "@Foundation overview"
@import { resolveCollectionName, resolveGroup } from "@Foundation"
@import { displayResults, createResult } from "@InfoPanel"
@import { spacingRampSpec, spacingPreviewHtml, runLinearRamp } from "@Linear Ramp"

// ========================================
// CONFIG
//
// The generator lives in `@Linear Ramp`; this file is the config and the overview call. Paste a
// config into the block below exactly as before — it is still the only thing that decides what a
// run produces.
// ========================================

var spacingConfigData = typeof spacingConfigData !== 'undefined' ? spacingConfigData : {
  // @CONFIG_START
// @fromFile: domains.spacing

  collectionName: "",
  group: "Spacing",
  spacings: ["px", "xs", "sm", "md", "lg", "xl"],
  generateOverview: false,
  modes: [
    {
      name: "Value",
      scaleType: "bezier",
      base: 4,
      ratio: 1.5,
      curve: [],
      step: 4,
      mod: 3,
      roundTo: 2,
      extras: [1]
    }
  ]
// @CONFIG_END

// @PANEL_START
// {
//   blocks: [
//     { type: "heading", text: "General" },
//     { key: "collectionName", type: "collection", label: "Collection" },
//     { type: "chips", label: "Collection modes", from: "modes" },
//     { key: "group", type: "string", label: "Group within collection",
//       placeholder: "eg.: Spacing" },
//     { key: "spacings", type: "list", label: "Tokens",
//       helper: "Names from smallest to largest. spacing-{1,10} expands to ten names." },
//     { type: "divider", section: true },
//     { type: "heading", text: "Mode settings" },
//     { key: "generateOverview", type: "boolean", label: "Generate overview",
//       helper: "Builds a Spacing overview on the canvas: one row per token, one column per mode, with variable-bound width bars." },
//     { key: "modes", type: "rows", label: "Modes", layout: "tabs",
//       columns: [
//         { key: "name", type: "text", label: "Mode" },
//         { key: "scaleType", type: "radio", label: "Scale type",
//           options: [{ bezier: "Bezier scale" }, { metric: "Metric scale" }, { fibonacci: "Fibonacci" }] },
//         { key: "curve", type: "curve", label: "Scale", growth: "ratio",
//           showWhen: { scaleType: "bezier" },
//           helper: "Drag the end handle to set how fast the scale grows. Adding a token extends the range instead of squeezing it. Add shape for tighter small steps and looser large ones." },
//         { key: "step", type: "number", label: "Step",
//           showWhen: { scaleType: ["metric", "fibonacci"] },
//           helper: "Metric: how much each step adds before growth starts.\\nFibonacci: the first increment. Each later step is the sum of the two before it." },
//         { key: "mod", type: "number", label: "Every N steps",
//           showWhen: { scaleType: "metric" },
//           helper: "How often the step size grows. Step 4 and Every 3 gives 4, 4, 4, 8, 8, 8, 12." },
//         { key: "base", type: "number", label: "Base unit" },
//         { key: "roundTo", type: "number", label: "Round numbers to" },
//         { key: "extras", type: "list", label: "Extra spacings",
//           helper: "Off-scale values, merged by size (e.g. a 1px hairline under a base of 4). They take the smallest names; the scale continues above them. If you add a value without an extra token name, the largest generated value drops off the list." }
//       ] },
//     { type: "heading", text: "Preview" },
//     { type: "preview" }
//   ]
// }
// @PANEL_END
};

var spacingConfig = typeof spacingConfig !== 'undefined' ? spacingConfig : {
  collectionName: resolveCollectionName(spacingConfigData),
  group: resolveGroup(spacingConfigData),
  config: spacingConfigData
};

function resolveSpacingGenerateOverview(config) {
  if (!config || typeof config !== 'object') return false;
  if (config.generateOverview === true) return true;
  var inner = config.config;
  if (inner && typeof inner === 'object' && inner.generateOverview === true) return true;
  return false;
}

// ========================================
// EXECUTION
// ========================================

runLinearRamp(spacingConfig, spacingRampSpec())
  .then(async function (result) {
    var showOverview = resolveSpacingGenerateOverview(spacingConfig);
    if (showOverview) {
      await foundationCreateSpacingOverview(result.collection, spacingConfig.config || spacingConfigData);
    }
    var msg = '✅ Spacing: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' updated';
    if (showOverview) msg += '; overview frame';
    if (result.manifest && result.manifest.ok) msg += '; set recorded';
    figma.notify(msg);

    // After the overview, so `displayResults` — which is what reports the run complete — is not
    // called while there is still a frame being drawn.
    // **No scale table here.** The Configuration tab already draws it, live, from the same generator — so
    // repeating it in the results was the same numbers twice, and the second copy went stale the moment
    // anything was edited. What is left is what a run has to say that the panel cannot: what it wrote.
    var results = [];
    if (result.undeclaredModes) results.push(createResult('Modes this run did not write', result.undeclaredModes, 'info'));
    results.push(createResult(
      result.stats.created + ' created, ' + result.stats.updated + ' updated, ' + result.stats.skipped + ' skipped',
      'Collection: ' + (result.collection ? result.collection.name : '—'),
      'success'
    ));
    displayResults({ title: 'Spacing', results: results, type: 'success', showFilters: false });
  })
  .catch(function (error) {
    console.error('Error:', error);
    figma.notify('❌ Error: ' + error.message);
  });
