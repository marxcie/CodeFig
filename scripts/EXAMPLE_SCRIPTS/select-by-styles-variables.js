// Select by styles or variables
// @DOC_START
// # Select by styles or variables
//
// Selects elements that use styles or variables matching a search term. Handles partial matches (e.g. "Regular" matches Text/5xl/Regular, Text/6xl/Regular).
//
// ## Features
// - **Search For**: Partial style or variable name (case-insensitive), with `*` wildcards
// - **Select mixed**: When **off** (default), excludes elements with mixed style/variable usage (e.g. text lines mixing bold and regular)
// - **Selection only**: When on, searches within current selection; when off, searches the whole page
//
// ## Usage
// 1. Enter a partial style or variable name (e.g. "Regular", "Text/*/Bold", "Primary")
// 2. Toggle "Select mixed" if you want to include elements with mixed formatting
// 3. Click Run to select all matching elements
//
// ## Search patterns
// | Input | Meaning |
// |-------|---------|
// | text | Matches names **containing** that text (case-insensitive). |
// | V4/*/Primary | `*` matches any characters. A CodeFig extension — Figma has no wildcard. |
// | (\w+)-(\d+) | A regular expression — **only** when "Use regular expression" is ticked. |
// | (blank) | An empty filter matches everything; an empty find replaces the entire name. |
//
// Brackets and parens are literal text unless regex mode is on, so `Text [Legacy]` matches
// only names that really contain `Text [Legacy]`. Tick **Match case** for case-sensitive
// matching. Same rules in every CodeFig find/replace script.
//
// A name containing a literal `*` is now read as a wildcard; escape it as `\*` in regex mode
// to match the character itself.
// @DOC_END

// @UI_CONFIG_START
// # Select by styles or variables
var searchFor = ""; // @placeholder="Text/*/Regular"
// Partial style or variable name (e.g. "Regular", "Text/5xl", "Text/*/Bold")
//
var matchCase = false; // @label: Match case
var useRegex = false; // @label: Use regular expression
// Treat searchFor as a regular expression instead of literal text with `*` wildcards.
//
var selectMixed = false; // Include elements with mixed style/variable usage (e.g. text with bold + regular)
//
// ---
var selectionOnly = true; // Search within selection only; otherwise search whole page
// @UI_CONFIG_END

@import { traverseNodes } from "@Core Library"
@import { nameMatches, patternModeNote } from "@Pattern Matching"

// One matcher for every CodeFig find/replace script: see @Pattern Matching.
// A function rather than a top-level var, for the same reason the other five scripts use one:
// `@import` extracts function declarations only, so a var here would leave the predicates
// below unusable when a spec imports them on their own.
function getMatchOpts() {
  return {
    useRegex: typeof useRegex !== 'undefined' && useRegex === true,
    matchCase: typeof matchCase !== 'undefined' && matchCase === true
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
