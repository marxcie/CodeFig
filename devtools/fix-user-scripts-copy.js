#!/usr/bin/env node
/**
 * Rewrite DOC + align first-line / panel headings for Variables-stored user scripts
 * in artifacts/user-scripts-migrated/. Follows .claude/skills/ux-copy/SKILL.md.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var DIR = path.join(__dirname, '..', 'artifacts', 'user-scripts-migrated');

function toDocLines(md) {
  return md
    .trim()
    .split('\n')
    .map(function (line) {
      return '// ' + line;
    })
    .join('\n');
}

function replaceDoc(source, markdown) {
  var block = '// @DOC_START\n' + toDocLines(markdown) + '\n// @DOC_END';
  if (/\/\/ @DOC_START[\s\S]*?\/\/ @DOC_END/.test(source)) {
    return source.replace(/\/\/ @DOC_START[\s\S]*?\/\/ @DOC_END/, block);
  }
  // Insert after first comment line(s) / before first @import or @UI_CONFIG
  var m = source.match(/^((?:\/\/[^\n]*\n)+)/);
  if (m) {
    return m[1] + block + '\n\n' + source.slice(m[1].length);
  }
  return block + '\n\n' + source;
}

function setFirstComment(source, line) {
  if (/^\/\//.test(source)) {
    return source.replace(/^\/\/[^\n]*/, '// ' + line);
  }
  return '// ' + line + '\n' + source;
}

function replaceBetween(source, startRe, endRe, replacement) {
  var start = source.search(startRe);
  if (start < 0) return source;
  var afterStart = source.slice(start);
  var endRel = afterStart.search(endRe);
  if (endRel < 0) return source;
  var endAbs = start + endRel + afterStart.match(endRe)[0].length;
  return source.slice(0, start) + replacement + source.slice(endAbs);
}

var PATCHES = {
  'Color_proportion_chart.js': function (src) {
    src = setFirstComment(src, 'Render styles overview');
    src = replaceDoc(
      src,
      [
        '# Renders local text, paint, and effect styles as a structured overview of auto-layout frames',
        '',
        '## Overview',
        '',
        'Builds a style guide from **local** text, paint, and effect styles. All auto-layout frames hug contents.',
        '',
        'Path logic:',
        '',
        '- **One or two** name segments (`Style` or `Group / Name`) → a **vertical** stack, one tile per row.',
        '- **Three or more** segments → the **last** segment becomes the **column** (for example Normal | Bold). Matching endings stack vertically; one horizontal frame holds those columns side by side.',
        '',
        'Tile contents:',
        '',
        '- **Text styles:** **Preview text** (or a built-in sample if empty) plus the full style name as a caption. Enter in the field becomes a soft line break in Figma.',
        '- **Paint styles:** swatch plus full style name.',
        '- **Effect styles:** sample shape with the effect plus full style name.',
        '',
        'Use it as a style guide, or to surface styles so Replace styles can resolve targets (paste the overview frame into another file if needed).',
        '',
        '## Configuration options',
        '',
        '| Control | Description |',
        '| --- | --- |',
        '| **Style group**<br>`styleGroup` | Substring on the full style name (case-insensitive). Empty = all styles (capped). |',
        '| **Preview text**<br>`previewText` | Multiline sample shown in each text style tile. Enter becomes a soft line break. Leave empty for the built-in sample. |'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @UI_CONFIG_START[\s\S]*?\/\/ @UI_CONFIG_END/,
      [
        '// @UI_CONFIG_START',
        'var styleGroup = "";',
        'var previewText = "Sphinx of black quartz,\\njudge my vow.";',
        '// @UI_CONFIG_END'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/,
      [
        '// @PANEL_START',
        'var __codefigPanel = {',
        '  blocks: [',
        '    { key: "styleGroup", type: "string", label: "Style group", placeholder: "Text styles" },',
        '    {',
        '      key: "previewText",',
        '      type: "textarea",',
        '      label: "Preview text",',
        '      placeholder: "Preview for text styles. Enter = soft line break"',
        '    }',
        '  ]',
        '};',
        '// @PANEL_END'
      ].join('\n')
    );
    return src;
  },

  'Distribute_spacing.js': function (src) {
    src = setFirstComment(src, 'Distribute spacing');
    src = replaceDoc(
      src,
      [
        '# Redistributes gaps between selected siblings along X and/or Y while keeping the overall span fixed',
        '',
        '## Overview',
        '',
        'Select two or more siblings that share a parent. The script keeps the first leading edge and last trailing edge fixed, then redistributes the gaps between them.',
        '',
        'Enter a percentage of the current total gap (for example `160%` or `160`). Use `0` to leave that axis alone. Negative gaps mean overlap.',
        '',
        '## Configuration options',
        '',
        '| Control | Description |',
        '| --- | --- |',
        '| **Horizontal distribution**<br>`horizontalDistribution` | Gap scale on X. `0` skips horizontal. Accepts a number or a percent string. |',
        '| **Vertical distribution**<br>`verticalDistribution` | Gap scale on Y. `0` skips vertical. |'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @UI_CONFIG_START[\s\S]*?\/\/ @UI_CONFIG_END/,
      [
        '// @UI_CONFIG_START',
        'var horizontalDistribution = "160%";',
        'var verticalDistribution = 0;',
        '// @UI_CONFIG_END'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/,
      [
        '// @PANEL_START',
        'var __codefigPanel = {',
        '  blocks: [',
        '    { key: "horizontalDistribution", type: "string", label: "Horizontal distribution", placeholder: "160%" },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "Percent of the current horizontal gap total. 0 leaves X alone." },',
        '    { key: "verticalDistribution", type: "number", label: "Vertical distribution" },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "Percent of the current vertical gap total. 0 leaves Y alone." }',
        '  ]',
        '};',
        '// @PANEL_END'
      ].join('\n')
    );
    return src;
  },

  'Match_and_replace_colors_to_variables.js': function (src) {
    src = setFirstComment(src, 'Match and replace colors to variables');
    src = replaceDoc(
      src,
      [
        '# Binds raw colors on the selection to COLOR variables from one collection that match by resolved value',
        '',
        '## Overview',
        '',
        'Walks the selection (fills, strokes, effects, gradient stops, and mixed text fills) and binds each raw color to a COLOR variable in the chosen collection whose resolved value matches.',
        '',
        'Mixed text fills keep per-span colors. Pick one collection; this is not an all-collections scan.',
        '',
        '## Configuration options',
        '',
        '| Control | Description |',
        '| --- | --- |',
        '| **Collection**<br>`collection` | Variable collection that holds the COLOR tokens to match against. |'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @UI_CONFIG_START[\s\S]*?\/\/ @UI_CONFIG_END/,
      ['// @UI_CONFIG_START', 'var collection = "";', '// @UI_CONFIG_END'].join('\n')
    );
    src = src.replace(
      /\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/,
      [
        '// @PANEL_START',
        'var __codefigPanel = {',
        '  blocks: [',
        '    { key: "collection", type: "select", label: "Collection", options: "variableCollections" },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "Pick the collection with your COLOR tokens. Leave empty only if the script allows it; usually you need one collection." }',
        '  ]',
        '};',
        '// @PANEL_END'
      ].join('\n')
    );
    return src;
  },

  'Merge_vectors_in_selected_groups.js': function (src) {
    src = setFirstComment(src, 'Merge vectors in selected groups');
    src = replaceDoc(
      src,
      [
        '# Flattens each selected group or frame into one vector and renames it',
        '',
        '## Overview',
        '',
        'For each selected group, frame, component, or instance, merges its direct children into a single vector. The container stays; only the contents merge.',
        '',
        'If the group already has one vector child, the script only renames it.',
        '',
        '## Configuration options',
        '',
        '| Control | Description |',
        '| --- | --- |',
        '| **Merged name**<br>`mergedName` | Name given to the resulting vector. Default `Vector`. |'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/,
      [
        '// @PANEL_START',
        'var __codefigPanel = {',
        '  blocks: [',
        '    { key: "mergedName", type: "string", label: "Merged name", placeholder: "Vector" }',
        '  ]',
        '};',
        '// @PANEL_END'
      ].join('\n')
    );
    return src;
  },

  'Perspective_duplicate.js': function (src) {
    src = setFirstComment(src, 'Perspective duplicate');
    src = replaceDoc(
      src,
      [
        '# Duplicates the selection into a shrinking trail for a simple depth or perspective look',
        '',
        '## Overview',
        '',
        'Creates copies of each selected layer, scaled toward a chosen edge. Each step multiplies size by **Scale** and steps outward by **Distance** times the previous size.',
        '',
        '## Configuration options',
        '',
        '| Control | Description |',
        '| --- | --- |',
        '| **Duplicates**<br>`duplicates` | How many copies to add behind the original. |',
        '| **Direction**<br>`direction` | Edge the trail grows toward: top, bottom, left, or right. |',
        '| **Scale**<br>`scale` | Size multiplier per step (for example `0.7`). |',
        '| **Distance**<br>`distance` | How far each step moves, as a fraction of the previous width or height. |'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @UI_CONFIG_START[\s\S]*?\/\/ @UI_CONFIG_END/,
      [
        '// @UI_CONFIG_START',
        'var duplicates = 2;',
        'var direction = "top";',
        'var scale = 0.7;',
        'var distance = 0.4;',
        '// @UI_CONFIG_END'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/,
      [
        '// @PANEL_START',
        'var __codefigPanel = {',
        '  blocks: [',
        '    { key: "duplicates", type: "number", label: "Duplicates" },',
        '    { key: "direction", type: "select", label: "Direction", options: ["top", "bottom", "left", "right"] },',
        '    { key: "scale", type: "number", label: "Scale" },',
        '    { type: "paragraph", attachTo: "previous", text: "Size multiplier per copy (for example 0.7)." },',
        '    { key: "distance", type: "number", label: "Distance" },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "Step length as a fraction of the previous size." }',
        '  ]',
        '};',
        '// @PANEL_END'
      ].join('\n')
    );
    return src;
  },

  'Remap_local_styles_by_name.js': function (src) {
    src = setFirstComment(src, 'Remap local styles by name');
    src = replaceDoc(
      src,
      [
        '# Rebinds layers to one local style per name when several local definitions share that name',
        '',
        '## Overview',
        '',
        'After paste between files, layers can stay bound to different local style ids that share the same name. This script groups local text, paint, and effect styles by name, picks a canonical style (highest usage in the chosen scope), and rebinds layers that still point at another id for that name.',
        '',
        'When **Relink remote to local** is on, library bindings with a same-named local style are rebound to that local style.',
        '',
        '## Configuration options',
        '',
        '| Control | Description |',
        '| --- | --- |',
        '| **Remap scope**<br>`remapScope` | **selection** limits to the current selection. **currentPage** walks the whole page. |',
        '| **Usage count scope**<br>`usageCountScope` | Where to count usages when choosing the winner among duplicate local definitions: **currentPage** or **allPages**. |',
        '| **Relink remote to local**<br>`relinkRemoteToLocal` | When true, rebind library bindings to same-named local styles. When false, leave remote bindings alone. |'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @UI_CONFIG_START[\s\S]*?\/\/ @UI_CONFIG_END/,
      [
        '// @UI_CONFIG_START',
        'var remapScope = "selection";',
        'var usageCountScope = "currentPage";',
        'var relinkRemoteToLocal = "true";',
        '// @UI_CONFIG_END'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/,
      [
        '// @PANEL_START',
        'var __codefigPanel = {',
        '  blocks: [',
        '    { key: "remapScope", type: "radio", label: "Remap scope", options: ["selection", "currentPage"] },',
        '    { key: "usageCountScope", type: "radio", label: "Usage count scope", options: ["currentPage", "allPages"] },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "Where to count style usage when several local definitions share a name." },',
        '    { key: "relinkRemoteToLocal", type: "radio", label: "Relink remote to local", options: ["true", "false"] },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "Rebind library bindings to same-named local styles after paste." }',
        '  ]',
        '};',
        '// @PANEL_END'
      ].join('\n')
    );
    return src;
  },

  'Render_CSS_variable_color_tokens.js': function (src) {
    src = setFirstComment(src, 'Render CSS variable color tokens');
    src = replaceDoc(
      src,
      [
        '# Builds color swatches on the canvas from pasted CSS custom property color declarations',
        '',
        '## Overview',
        '',
        'Paste CSS variable lines into **Colors**. Supported value forms include space-separated RGB channels, `rgb()` / `rgba()`, and hex (with optional alpha).',
        '',
        'Example lines:',
        '',
        '```',
        '--white: 255 255 255;',
        '--overlay: rgba(0,0,0,0.5);',
        '--brand: #AA33FF;',
        '```',
        '',
        '## Configuration options',
        '',
        '| Control | Description |',
        '| --- | --- |',
        '| **Colors**<br>`colors` | One or more CSS custom property color lines to render as swatches. |'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @UI_CONFIG_START[\s\S]*?\/\/ @UI_CONFIG_END/,
      ['// @UI_CONFIG_START', 'var colors = "";', '// @UI_CONFIG_END'].join('\n')
    );
    src = src.replace(
      /\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/,
      [
        '// @PANEL_START',
        'var __codefigPanel = {',
        '  blocks: [',
        '    {',
        '      key: "colors",',
        '      type: "textarea",',
        '      label: "Colors",',
        '      placeholder: "--white: 255 255 255;\\n--overlay: rgba(0,0,0,0.5);\\n--brand: #AA33FF;"',
        '    },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "Paste CSS custom property color lines. Supports channel RGB, rgb()/rgba(), and hex." }',
        '  ]',
        '};',
        '// @PANEL_END'
      ].join('\n')
    );
    return src;
  },

  'Replace_variables_updated.js': function (src) {
    src = setFirstComment(src, 'Replace variables updated');
    src = replaceDoc(
      src,
      [
        '# Rebinds layer variable bindings by collection and path find/replace without renaming variable definitions',
        '',
        '## Overview',
        '',
        'Updates **native** variable bindings on layers. Bindings that come only from an applied text, fill, stroke, or effect style are left alone.',
        '',
        '**Source collection** limits which bindings to consider (empty = all). **Target collection** is where the replacement variable is looked up (empty = same as source, then any).',
        '',
        '**Search for** / **Replace with** run on the variable path (groups plus name). **Batch replacement** overrides those two fields with one pair per line (`search, replace` or `search to replace`).',
        '',
        'When both collections are set and search/replace are empty, the source collection name substring in the path is swapped for the target name. When only the target is set and search fields are empty, bindings remap by matching variable name in the target collection.',
        '',
        '## Configuration options',
        '',
        '| Control | Description |',
        '| --- | --- |',
        '| **Source collection**<br>`sourceCollection` | Limit bindings to this collection. Empty = all collections. |',
        '| **Target collection**<br>`targetCollection` | Look up the replacement variable here. Empty = same as source, then any. |',
        '| **Search for**<br>`searchFor` | Substring to find in the variable path. |',
        '| **Replace with**<br>`replaceWith` | Replacement for that substring. |',
        '| **Batch replacement**<br>`batchReplacement` | One search/replace pair per line. Overrides Search for / Replace with when set. |'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @UI_CONFIG_START[\s\S]*?\/\/ @UI_CONFIG_END/,
      [
        '// @UI_CONFIG_START',
        'var sourceCollection = "";',
        'var targetCollection = "";',
        'var searchFor = "bento-cards";',
        'var replaceWith = "cards";',
        'var batchReplacement = "";',
        '// @UI_CONFIG_END'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/,
      [
        '// @PANEL_START',
        'var __codefigPanel = {',
        '  blocks: [',
        '    { key: "sourceCollection", type: "select", label: "Source collection", options: "variableCollections" },',
        '    { key: "targetCollection", type: "select", label: "Target collection", options: "variableCollections" },',
        '    { key: "searchFor", type: "string", label: "Search for", placeholder: "color 2" },',
        '    { key: "replaceWith", type: "string", label: "Replace with", placeholder: "color 1" },',
        '    { type: "divider" },',
        '    { key: "batchReplacement", type: "textarea", label: "Batch replacement" },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "One pair per line: search, replace or search to replace. Overrides Search for / Replace with." }',
        '  ]',
        '};',
        '// @PANEL_END'
      ].join('\n')
    );
    return src;
  },

  'Scale_to_print.js': function (src) {
    src = setFirstComment(src, 'Scale to print');
    src = replaceDoc(
      src,
      [
        '# Scales the selection so its width matches a physical print size in mm or cm',
        '',
        '## Overview',
        '',
        'Sets each selected layer width to the given print size using a fixed pixel mapping: **200 cm = 23622 px** (same ratio for mm). Height scales with width.',
        '',
        'Detaches width/height variable and style bindings on the layer before resizing so the size can change.',
        '',
        '## Configuration options',
        '',
        '| Control | Description |',
        '| --- | --- |',
        '| **Print unit**<br>`printUnit` | Physical unit for **Print width**: mm or cm. |',
        '| **Print width**<br>`printWidth` | Target width in the chosen unit. |'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @UI_CONFIG_START[\s\S]*?\/\/ @UI_CONFIG_END/,
      [
        '// @UI_CONFIG_START',
        'var printUnit = "mm";',
        'var printWidth = "89";',
        '// @UI_CONFIG_END'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/,
      [
        '// @PANEL_START',
        'var __codefigPanel = {',
        '  blocks: [',
        '    { key: "printUnit", type: "radio", label: "Print unit", options: ["mm", "cm"] },',
        '    { key: "printWidth", type: "string", label: "Print width", placeholder: "89" },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "Target width in the unit above. Uses 200 cm = 23622 px." }',
        '  ]',
        '};',
        '// @PANEL_END'
      ].join('\n')
    );
    return src;
  },

  'Select_only.js': function (src) {
    return [
      '// Select only',
      '// @DOC_START',
      '// # Stub: body was overwritten during a storage verify and needs restoring from Figma history',
      '//',
      '// ## Overview',
      '//',
      '// This script currently has no runnable body. The previous implementation was lost during a',
      '// SCRIPT_STORAGE_VARIABLES verify on 2026-08-29. Prefer Figma file history / undo on the',
      '// **CodeFig Scripts** collection if you still need the old version, then paste it back here.',
      '// @DOC_END',
      '',
      'figma.notify("Select only: script body is missing. Restore from file history if you have it.");',
      'if (typeof window !== "undefined" && typeof window.codefigRunComplete === "function") {',
      '  window.codefigRunComplete();',
      '}',
      ''
    ].join('\n');
  },

  'Select_overlapping_duplicates.js': function (src) {
    src = setFirstComment(src, 'Select overlapping duplicates');
    src = replaceDoc(
      src,
      [
        '# Selects sibling frames that share identical bounds, keeping every duplicate except the topmost',
        '',
        '## Overview',
        '',
        'Select one or more frames. For each, the script finds siblings with the same x, y, width, and height, then selects all matches except the topmost in the layer stack.',
        '',
        'No configuration. Use this to clean stacked duplicate frames before deleting or merging.',
        '',
        '## Configuration options',
        '',
        'None. Run on a frame selection.'
      ].join('\n')
    );
    return src;
  },

  'Stack_or_flatten_color_scale.js': function (src) {
    src = setFirstComment(src, 'Stack or flatten color scale');
    src = replaceDoc(
      src,
      [
        '# Converts a horizontal color ramp into a nested top-left stack, or the reverse',
        '',
        '## Overview',
        '',
        'Select a row of swatches or a nested stack.',
        '',
        '- **Horizontal scale** on: nested top-left stack → flat left-to-right row (brightest to darkest), every swatch set to **Starting size**.',
        '- **Horizontal scale** off: horizontal row → nested stack sized from the darkest upward (**Starting size** plus **Increment** per step).',
        '',
        'Wrappers and auto-layout are removed before layout; the result is grouped.',
        '',
        '## Configuration options',
        '',
        '| Control | Description |',
        '| --- | --- |',
        '| **Starting size**<br>`startingSize` | Base swatch size in pixels. |',
        '| **Horizontal scale**<br>`horizontalScale` | On = flatten to a row. Off = build a nested vertical stack. |',
        '| **Increment**<br>`increment` | Extra pixels added per step when stacking (ignored when flattening). |'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @UI_CONFIG_START[\s\S]*?\/\/ @UI_CONFIG_END/,
      [
        '// @UI_CONFIG_START',
        'var startingSize = 250;',
        'var horizontalScale = true;',
        'var increment = 50;',
        '// @UI_CONFIG_END'
      ].join('\n')
    );
    src = src.replace(
      /\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/,
      [
        '// @PANEL_START',
        'var __codefigPanel = {',
        '  blocks: [',
        '    { key: "startingSize", type: "number", label: "Starting size" },',
        '    { key: "horizontalScale", type: "boolean", label: "Horizontal scale" },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "On flattens a stack into a row. Off stacks a horizontal ramp." },',
        '    { key: "increment", type: "number", label: "Increment" },',
        '    { type: "paragraph", attachTo: "previous",',
        '      text: "Extra size per step when stacking. Unused when flattening." }',
        '  ]',
        '};',
        '// @PANEL_END'
      ].join('\n')
    );
    return src;
  }
};

var report = [];
Object.keys(PATCHES).forEach(function (file) {
  var full = path.join(DIR, file);
  if (!fs.existsSync(full)) {
    report.push({ file: file, status: 'missing' });
    return;
  }
  var before = fs.readFileSync(full, 'utf8');
  var after = PATCHES[file](before);
  if (after.indexOf('@UI_CONFIG_END') !== -1 && /text:[\s\S]*@UI_CONFIG_END/.test(after)) {
    throw new Error('Leaked @UI_CONFIG_END into panel text in ' + file);
  }
  if (after.indexOf('\u2014') !== -1) {
    // Allow em dash only outside panel blocks if any remain from code comments —
    // strip from panel/DOC helpers: check PANEL block
    var panel = after.match(/\/\/ @PANEL_START[\s\S]*?\/\/ @PANEL_END/);
    if (panel && panel[0].indexOf('\u2014') !== -1) {
      throw new Error('Em dash in panel copy: ' + file);
    }
  }
  fs.writeFileSync(full, after);
  report.push({
    file: file,
    status: 'ok',
    len: after.length,
    hasDoc: /@DOC_START/.test(after),
    hasPanel: /__codefigPanel/.test(after)
  });
});

fs.writeFileSync(path.join(DIR, '_copy-fix-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
