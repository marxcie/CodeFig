// Select by styles or variables
// @DOC_START
// # Selects layers that use styles or variables matching a search pattern
//
// ## Overview
//
// Finds elements whose applied styles or variables match **Search for**. Partial matches work
// (for example `Regular` matches `Text/5xl/Regular`). `*` wildcards are allowed unless
// **Use regular expression** is on. Matching is case-sensitive.
//
// **Include mixed layers** is off by default, so layers with mixed style or variable usage (for
// example text that is partly bold and partly regular) are skipped. Turn it on to include them.
//
// **Selection only** limits the search to the current selection. Off searches the whole page.
//
// ### Search patterns
//
// | Input | Meaning |
// | --- | --- |
// | text | Matches names containing that text (case-sensitive). |
// | `V4/*/Primary` | `*` matches any characters. |
// | `(\\w+)-(\\d+)` | A regular expression, only when **Use regular expression** is on. |
// | (blank) | Matches everything. |
//
// Brackets and parens are literal text unless regex mode is on. A literal `*` in a name needs
// regex mode and `\\*`.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Search for**<br>`searchFor` | Part of a style or variable name (for example `Regular`, `Text/*/Bold`). |
// | **Use regular expression**<br>`useRegex` | Treat Search for as a regular expression rather than plain text with `*` wildcards. |
// | **Include mixed layers**<br>`selectMixed` | When on, include layers that use more than one style or variable at once. |
// | **Selection only**<br>`selectionOnly` | When on, search within the current selection. Off searches the whole page. |
// @DOC_END

// @UI_CONFIG_START
var searchFor = "";
var useRegex = false;
var selectMixed = false;
var selectionOnly = true;
// @UI_CONFIG_END

// @PANEL_START
var __codefigPanel = {
  blocks: [
    { key: "searchFor", type: "string", placeholder: "Text/*/Regular" },
    { type: "paragraph", attachTo: "previous", text: "Part of a style or variable name — `Regular`, `Text/5xl`, `Text/*/Bold`." },
    { key: "useRegex", type: "boolean", label: "Use regular expression" },
    { type: "paragraph", attachTo: "previous",
      text: "Reads **Search for** as a regular expression rather than plain text with `*` wildcards." },
    { key: "selectMixed", type: "boolean", label: "Include mixed layers" },
    { type: "paragraph", attachTo: "previous",
      text: "Layers using more than one style or variable at once — a text layer that is part bold, part regular." },
    { type: "divider" },
    { key: "selectionOnly", type: "boolean", label: "Selection only" },
    { type: "paragraph", attachTo: "previous", text: "Off searches the whole page." }
  ]
};
// @PANEL_END

@import { traverseNodes } from "@Core Library"
@import { nameMatches, patternModeNote } from "@Pattern Matching"

// One matcher for every CodeFig find/replace script: see @Pattern Matching.
// A function rather than a top-level var, for the same reason the other five scripts use one:
// `@import` extracts function declarations only, so a var here would leave the predicates
// below unusable when a spec imports them on their own.
function getMatchOpts() {
  return {
    useRegex: typeof useRegex !== 'undefined' && useRegex === true,
    matchCase: true
  };
}

// Collect all nodes from root(s)
function collectAllNodes(roots) {
  var allNodes = [];
  traverseNodes(roots, function(node) {
    allNodes.push(node);
    return 0;
  });
  return allNodes;
}

// Check if node uses matching style (async)
async function nodeUsesMatchingStyle(node, searchTerm, selectMixedVal) {
  if (!searchTerm || String(searchTerm).trim() === '') return false;

  // Text nodes: handle mixed formatting via getStyledTextSegments
  if (node.type === 'TEXT' && typeof node.getStyledTextSegments === 'function') {
    try {
      var segments = node.getStyledTextSegments(['textStyleId']);
      var hasMatchingSegment = false;
      var hasNonMatchingSegment = false;

      for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        if (seg.textStyleId && seg.textStyleId !== figma.mixed) {
          try {
            var style = await figma.getStyleByIdAsync(seg.textStyleId);
            if (style) {
              if (nameMatches(style.name, searchTerm, getMatchOpts())) {
                hasMatchingSegment = true;
              } else {
                hasNonMatchingSegment = true;
              }
            }
          } catch (e) {}
        }
      }

      if (!hasMatchingSegment) return false;
      // When selectMixed is false, exclude nodes that mix our style with another (e.g. bold + regular)
      if (!selectMixedVal && hasNonMatchingSegment) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  // Other style properties: textStyleId, fillStyleId, strokeStyleId, effectStyleId
  var styleProps = [
    { prop: 'textStyleId' },
    { prop: 'fillStyleId' },
    { prop: 'strokeStyleId' },
    { prop: 'effectStyleId' }
  ];

  for (var i = 0; i < styleProps.length; i++) {
    var p = styleProps[i].prop;
    if (!(p in node) || !node[p]) continue;
    if (node[p] === figma.mixed) {
      if (!selectMixedVal) continue; // Skip mixed when selectMixed is false
      // When selectMixed is true, we'd need to check segments - for non-text, mixed is rare
      continue;
    }
    try {
      var style = await figma.getStyleByIdAsync(node[p]);
      if (style && nameMatches(style.name, searchTerm, getMatchOpts())) return true;
    } catch (e) {}
  }

  return false;
}

// Check if node uses matching variable (async)
async function nodeUsesMatchingVariable(node, searchTerm) {
  if (!searchTerm || String(searchTerm).trim() === '') return false;
  if (!node.boundVariables || typeof node.boundVariables !== 'object') return false;

  var properties = Object.keys(node.boundVariables);
  for (var i = 0; i < properties.length; i++) {
    var prop = properties[i];
    var binding = node.boundVariables[prop];
    if (!binding) continue;

    var variableId = binding.id || (Array.isArray(binding) && binding[0] ? binding[0].id : null);
    if (!variableId) continue;

    try {
      var variable = await figma.variables.getVariableByIdAsync(variableId);
      if (variable && nameMatches(variable.name, searchTerm, getMatchOpts())) return true;
    } catch (e) {}
  }

  return false;
}

// Variables don't have figma.mixed for individual bindings in the same way.
// For variables, "mixed" could mean: node uses our variable in one prop and a different one in another.
// We treat variable checks as non-mixed for simplicity (per-node binding is typically uniform).
async function nodeMatches(node, searchTerm, selectMixedVal) {
  var styleMatch = await nodeUsesMatchingStyle(node, searchTerm, selectMixedVal);
  if (styleMatch) return true;

  var variableMatch = await nodeUsesMatchingVariable(node, searchTerm);
  if (variableMatch) return true;

  return false;
}

// Main
(function() {
  var searchTerm = typeof searchFor !== 'undefined' ? searchFor : '';
  var selectMixedVal = typeof selectMixed !== 'undefined' ? selectMixed : false;
  var selectionOnlyVal = typeof selectionOnly !== 'undefined' ? selectionOnly : false;

  if (!searchTerm || String(searchTerm).trim() === '') {
    figma.notify('Enter a style or variable name to search for');
    return;
  }

  var modeNote = patternModeNote(searchTerm, getMatchOpts());
  if (modeNote) console.log(modeNote);

  var roots = selectionOnlyVal ? figma.currentPage.selection : [figma.currentPage];
  if (selectionOnlyVal && (!roots || roots.length === 0)) {
    figma.notify('Select at least one element, or turn off "Selection only"');
    return;
  }

  var allNodes = collectAllNodes(roots);
  var matching = [];

  (async function() {
    for (var i = 0; i < allNodes.length; i++) {
      var node = allNodes[i];
      try {
        if (await nodeMatches(node, searchTerm, selectMixedVal)) {
          matching.push(node);
        }
      } catch (e) {
        console.warn('Error checking node:', node.name, e.message);
      }
    }

    if (matching.length > 0) {
      figma.currentPage.selection = matching;
      figma.viewport.scrollAndZoomIntoView(matching);
      figma.notify('Selected ' + matching.length + ' element' + (matching.length === 1 ? '' : 's'));
    } else {
      figma.notify('No elements found matching "' + searchTerm + '"');
    }
  })();
})();
