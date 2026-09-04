// Corner radius
// @DOC_START
// # Creates a corner radius scale per Variable Mode with CORNER_RADIUS bindings and bezier, metric or fibonacci ladders
//
// ## Overview
//
// Corner radius variables are generated per mode with the **CORNER_RADIUS** scope, so bindings appear
// in corner fields rather than width or gap.
//
// Enable **Generate overview** to also create a reference frame on the Figma canvas.
//
// Each mode can use its own **Scale type**:
//
// - **Bezier scale** — follows a custom curve
// - **Metric scale** — increases by a fixed amount every N tokens
// - **Fibonacci** — each step is the sum of the previous two
//
// **Base unit** is the value of the first generated token. Each mode has its own **Round numbers to**
// grid, so a 4px desktop scale and a 2px mobile scale are a common setup.
//
// ### Bezier scaling
//
// A bezier scale progresses from **Base unit** along a curve in logarithmic space.
//
// A straight curve produces a consistent ratio between steps. Adjusting the curve lets you keep
// smaller radii closer together without flattening at the large end.
//
// You can:
//
// - drag the curve handles
// - choose a preset
// - paste a `cubic-bezier(...)` value
// - enable **Add middle point** to control each half of the curve independently
//
// ### Extra values
//
// **`none` is not a special case.** Put `0` in **Extra values** and it takes the smallest token name;
// the scale continues from **Base unit**. Extras merge into the pool by value. If you add an extra
// without adding a token name, the largest generated value drops off the list.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Collection**<br>`collectionName` | Name of the Figma variable collection, e.g. `Responsive System`. |
// | **Collection modes** | Chips for modes in the collection. Add, remove, or rename here. Each mode gets its own settings below. |
// | **Group within collection**<br>`group` | Prefix used to group variables, e.g. `Corner radius` produces names such as `Corner radius/md`. |
// | **Tokens**<br>`radii` | Token names from smallest to largest. A series works: `radius-{1,10}` expands to ten names and can mix with names you write, e.g. `none, xs, radius-{1,6}`. |
// | **Generate overview**<br>`generateOverview` | When on, creates a corner radius overview frame: one row per token, one column per mode, with swatches bound to the variables. Off by default. |
// | **Mode**<br>`modes[].name` | Name of this mode (viewport). |
// | **Copy these values to:** | On the open mode tab when there are two or more modes. Each other mode is a link; click one to copy this mode's scale settings onto it. Mode names stay. Asks before replacing settings that already differ. |
// | **Scale type**<br>`modes[].scaleType` | Bezier, Metric, or Fibonacci for this mode. |
// | **Scale**<br>`modes[].curve` | Bezier only. Curve that shapes the scale. |
// | **Step**<br>`modes[].step` | Metric: how much each step adds before growth starts. Fibonacci: the first increment. |
// | **Every N steps**<br>`modes[].mod` | Metric only. How often the step size grows. |
// | **Base unit**<br>`modes[].base` | Value of the first generated token. |
// | **Round numbers to**<br>`modes[].roundTo` | Snap generated values to multiples of this number. Use `0` for no snapping. |
// | **Extra values**<br>`modes[].extras` | Off-scale values merged by size into the token list. |
// @DOC_END

// The Configuration tab redraws this as you type. Pure: it generates in memory and draws
// the same table the run does, so it cannot write anything.
// @PREVIEW: radiusPreviewHtml

@import { getCollection, getOrCreateCollection, setupModes, extractModes, processVariables } from "@Variables"
@import { foundationCreateCornerRadiusOverview } from "@Foundation overview"
@import { resolveCollectionName, resolveGroup } from "@Foundation"
@import { displayResults, createResult } from "@InfoPanel"
@import { radiusRampSpec, radiusPreviewHtml, runLinearRamp } from "@Linear Ramp"

// ========================================
// CONFIG
//
// The generator lives in `@Linear Ramp`; this file is the config and the overview call. Paste a
// config into the block below exactly as before — it is still the only thing that decides what a
// run produces.
// ========================================

var cornerRadiusConfigData = typeof cornerRadiusConfigData !== 'undefined' ? cornerRadiusConfigData : {
  // @CONFIG_START
// @fromFile: domains.radius

  collectionName: "",
  group: "",
  radii: [],
  generateOverview: false,
  modes: []
// @CONFIG_END

};

// @PANEL_START
var __codefigPanel = {
  blocks: [
    { type: "heading", text: "General" },
    { key: "collectionName", type: "collection", label: "Collection" },
    { type: "chips", label: "Collection modes", from: "modes" },
    { key: "group", type: "string", label: "Group within collection",
      placeholder: "eg.: Corner radius" },
    { key: "radii", type: "list", label: "Tokens",
      placeholder: "none, xs, sm, md, lg, xl",
      helper: "Names from smallest to largest. radius-{1,10} expands to ten names." },
    { type: "divider", section: true },
    { type: "heading", text: "Mode settings",
      showWhen: { collectionName: "*", radii: "*" } },
    { key: "generateOverview", type: "boolean", label: "Generate overview",
      showWhen: { collectionName: "*", radii: "*" },
      helper: "Builds a Corner radius overview on the canvas: one row per token, one column per mode, with variable-bound swatches." },
    { key: "modes", type: "rows", label: "Modes", layout: "tabs",
      copyToOthers: true,
      showWhen: { collectionName: "*", radii: "*" },
      columns: [
        { key: "name", type: "text", label: "Mode" },
        { key: "scaleType", type: "radio", label: "Scale type",
          options: [{ bezier: "Bezier scale" }, { metric: "Metric scale" }, { fibonacci: "Fibonacci" }] },
        { key: "curve", type: "curve", label: "Scale", growth: "ratio",
          showWhen: { scaleType: "bezier" },
          helper: "Drag the end handle to set how fast the scale grows. Adding a token extends the range instead of squeezing it. Add shape for tighter small steps and looser large ones." },
        { key: "step", type: "number", label: "Step",
          showWhen: { scaleType: ["metric", "fibonacci"] },
          helper: "Metric: how much each step adds before growth starts.\\nFibonacci: the first increment. Each later step is the sum of the two before it." },
        { key: "mod", type: "number", label: "Every N steps",
          showWhen: { scaleType: "metric" },
          helper: "How often the step size grows. Step 4 and Every 3 gives 4, 4, 4, 8, 8, 8, 12." },
        { key: "base", type: "number", label: "Base unit" },
        { key: "roundTo", type: "number", label: "Round numbers to" },
        { key: "extras", type: "list", label: "Extra values",
          helper: "Off-scale values, merged by size. Put 0 here for a none token: it takes the smallest name and the scale continues above it." }
      ] },
    { type: "heading", text: "Preview" },
    { type: "preview" }
  ]
};
// @PANEL_END

var cornerRadiusConfig = typeof cornerRadiusConfig !== 'undefined' ? cornerRadiusConfig : {
  collectionName: resolveCollectionName(cornerRadiusConfigData),
  group: resolveGroup(cornerRadiusConfigData),
  config: cornerRadiusConfigData
};

function resolveRadiusGenerateOverview(config) {
  if (!config || typeof config !== 'object') return false;
  if (config.generateOverview === true) return true;
  var inner = config.config;
  if (inner && typeof inner === 'object' && inner.generateOverview === true) return true;
  return false;
}

// ========================================
// EXECUTION
// ========================================

runLinearRamp(cornerRadiusConfig, radiusRampSpec())
  .then(async function (result) {
    var showOverview = resolveRadiusGenerateOverview(cornerRadiusConfig);
    if (showOverview) {
      await foundationCreateCornerRadiusOverview(result.collection, cornerRadiusConfig.config || cornerRadiusConfigData);
    }
    var msg = '✅ Corner radius: ' + result.stats.created + ' vars created, ' + result.stats.updated + ' updated';
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
    if (result.skippedModes && result.skippedModes.length) {
      results.push(createResult(
        result.skippedModes.length + ' mode' + (result.skippedModes.length === 1 ? '' : 's') + ' skipped',
        result.skippedModes.map(function (s) { return s.viewport; }).join(', ') +
          ' — set a base above zero (or Extra values) before they can generate',
        'warning'
      ));
    }
    results.push(createResult(
      result.stats.created + ' created, ' + result.stats.updated + ' updated, ' + result.stats.skipped + ' skipped',
      'Collection: ' + (result.collection ? result.collection.name : '—'),
      'success'
    ));
    displayResults({ title: 'Corner radius', results: results, type: 'success', showFilters: false });
  })
  .catch(function (error) {
    console.error('Error:', error);
    figma.notify('❌ Error: ' + error.message);
  });
