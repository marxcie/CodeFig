// Edit variable scopes
// @DOC_START
// # Adds or removes scopes and toggles Hide from publishing on many variables at once, filtered by collection, group and name
//
// ## Overview
//
// Pick which variables to change, then say what happens to their scopes and to **Hide from publishing**.
// Nothing is created, renamed or moved. Each run writes straight away, so undo (Cmd/Ctrl+Z) reverts it.
//
// **Collection**, **Group** and **Name** narrow the variables. All three are optional, and an empty
// one matches everything. Set **Type** when the scopes only make sense for one kind of variable.
//
// ### Scopes
//
// The checkbox list shows the scopes that fit the chosen **Type**, or every scope when Type is Any.
// Each matching variable ends up with exactly the ticked scopes. With nothing ticked and both
// rows above the list off, scopes are not touched.
//
// | Row | Effect |
// | --- | --- |
// | Show in all supported properties | Every matching variable gets all the scopes its type has. |
// | Disable all supported properties | Every matching variable loses all its scopes. |
//
// The two rows override the list. If both are on, Disable wins.
//
// A scope a variable's type cannot hold is skipped. With Type set to Any, ticking Gap leaves Color
// variables as they were, because none of the ticked scopes fit them. Boolean variables have no scopes
// to edit.
//
// Figma shows **All fills** as a group with Frame fill, Shape fill and Text fill beneath it.
// Ticking all three is the same as ticking All fills. A variable left with every scope shows as
// **All scopes**.
//
// ### Hide from publishing
//
// Off leaves each variable's current state alone. On hides every matching variable from publishing.
// Hidden variables stay in this file, and a published library leaves them out of the next publish.
//
// ### Name matching
//
// | Input | Meaning |
// | --- | --- |
// | `padding` | Names containing that text (case-insensitive), so `padding-x` and `padding-y` match. |
// | `padding*` | `*` matches any characters. |
// | `@media` | **Group**: that group and every group nested under it. |
// | `@media/*/grid` | **Group** with a wildcard: any group between. |
// | `(\\w+)-(x\|y)` | A regular expression, only when **Use regular expression** is on. |
//
// **Name** is checked against the variable's own name, the last part of its path. A **Name** that
// contains a `/` is checked against the whole path, group included.
//
// ## Configuration options
//
// Controls match the Configuration UI. The code key is shown under each label for Source edits.
//
// | Control | Description |
// | --- | --- |
// | **Collection**<br>`collectionName` | Local collection to edit. Empty = every local collection. |
// | **Group**<br>`group` | Group to edit, with the groups nested under it. Empty = no group filter. |
// | **Name**<br>`searchFor` | Text or pattern in the variable's name. Empty = no name filter. |
// | **Type**<br>`variableType` | Only Color, Number, String or Boolean variables. Any = all of them. |
// | **Use regular expression**<br>`useRegex` | Read Group and Name as regular expressions rather than plain text with `*` wildcards. |
// | **Show in all supported properties**<br>`enableAllScopes` | Gives every matching variable all the scopes its type has. |
// | **Disable all supported properties**<br>`disableAllScopes` | Clears every scope on every matching variable. Wins over the row above. |
// | **Scopes**<br>`scopesAny`, `scopesColor`, `scopesNumber`, `scopesString` | The scopes each matching variable ends up with. The list follows Type. |
// | **Hide from publishing**<br>`hideFromPublishing` | Hides every matching variable from publishing. Off leaves them as they are. |
// @DOC_END

@import { getAllCollections, getCollectionVariables } from "@Variables"
@import { nameMatches, patternModeNote } from "@Pattern Matching"
@import { displayResults } from "@InfoPanel"

// ============================================================================
// CONFIGURATION
// ============================================================================

// @UI_CONFIG_START
var collectionName = "";
var group = "";
var searchFor = "";
var variableType = "any";
var useRegex = false;
var enableAllScopes = false;
var disableAllScopes = false;
var scopesAny = [];
var scopesColor = [];
var scopesNumber = [];
var scopesString = [];
var hideFromPublishing = false;
// @UI_CONFIG_END

// @PANEL_START
var __codefigPanel = {
  blocks: [
    { type: "heading", text: "Variables" },
    { key: "collectionName", type: "select", label: "Collection", options: "variableCollections" },
    { type: "paragraph", attachTo: "previous",
      text: "Leave it empty to edit every collection in this file." },
    { key: "group", type: "string", label: "Group", placeholder: "@media/" },
    { type: "paragraph", attachTo: "previous",
      text: "Edits this group and the groups inside it. `*` matches any characters. Leave it empty to ignore groups." },
    { key: "searchFor", type: "string", label: "Name", placeholder: "padding" },
    { type: "paragraph", attachTo: "previous",
      text: "Matches any name containing this text, so `padding` finds `padding-x` and `padding-y`. `*` matches any characters." },
    { key: "variableType", type: "select", label: "Type",
      options: [{ any: "Any" }, { COLOR: "Color" }, { FLOAT: "Number" }, { STRING: "String" }, { BOOLEAN: "Boolean" }] },
    { type: "paragraph", attachTo: "previous",
      text: "Limits the edit to one kind of variable. Scopes that do not fit a variable's type are skipped anyway." },
    { key: "useRegex", type: "boolean", label: "Use regular expression" },
    { type: "paragraph", attachTo: "previous",
      text: "Reads Group and Name as regular expressions rather than plain text with `*` wildcards." },
    { type: "divider" },
    { type: "heading", text: "Scopes" },
    { key: "enableAllScopes", type: "boolean", label: "Show in all supported properties" },
    { key: "disableAllScopes", type: "boolean", label: "Disable all supported properties" },
    { type: "paragraph", attachTo: "previous",
      text: "These two override the list below. If both are on, Disable wins. With both off, each variable gets exactly the scopes you tick, and nothing ticked leaves scopes as they are." },
    { key: "scopesAny", type: "multiselect", label: "Scopes", showWhen: { variableType: "any" },
      options: ["All fills", "Frame fill", "Shape fill", "Text fill", "Stroke color", "Effect color", "Corner radius", "Width and height", "Gap", "Opacity", "Stroke width", "Effect values", "Font weight", "Font size", "Line height", "Letter spacing", "Paragraph spacing", "Paragraph indent", "Text content", "Font family", "Font style"] },
    { key: "scopesColor", type: "multiselect", label: "Scopes", showWhen: { variableType: "COLOR" },
      options: ["All fills", "Frame fill", "Shape fill", "Text fill", "Stroke color", "Effect color"] },
    { key: "scopesNumber", type: "multiselect", label: "Scopes", showWhen: { variableType: "FLOAT" },
      options: ["Corner radius", "Width and height", "Gap", "Opacity", "Stroke width", "Effect values", "Font weight", "Font size", "Line height", "Letter spacing", "Paragraph spacing", "Paragraph indent"] },
    { key: "scopesString", type: "multiselect", label: "Scopes", showWhen: { variableType: "STRING" },
      options: ["Text content", "Font family", "Font style"] },
    { type: "divider" },
    { type: "heading", text: "Publishing" },
    { key: "hideFromPublishing", type: "boolean", label: "Hide from publishing" },
    { type: "paragraph", attachTo: "previous",
      text: "Keeps every matching variable out of the library when you publish. Off leaves them as they are." }
  ]
};
// @PANEL_END

// ============================================================================
// SCOPE MODEL
// ============================================================================

// The scopes a variable of each type can hold, one entry per checkbox Figma shows. ALL_FILLS and
// ALL_SCOPES are not in the lists. They are the two shorthands for "all of these".
var SCOPE_LEAVES = {
  COLOR: ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'EFFECT_COLOR'],
  FLOAT: ['CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'OPACITY', 'STROKE_FLOAT', 'EFFECT_FLOAT',
    'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT'],
  STRING: ['TEXT_CONTENT', 'FONT_FAMILY', 'FONT_STYLE'],
  BOOLEAN: []
};

var FILL_LEAVES = ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL'];

var SCOPE_LABELS = {
  ALL_SCOPES: 'All scopes', ALL_FILLS: 'All fills', FRAME_FILL: 'Frame fill', SHAPE_FILL: 'Shape fill',
  TEXT_FILL: 'Text fill', STROKE_COLOR: 'Stroke color', EFFECT_COLOR: 'Effect color',
  CORNER_RADIUS: 'Corner radius', WIDTH_HEIGHT: 'Width and height', GAP: 'Gap', OPACITY: 'Opacity',
  STROKE_FLOAT: 'Stroke width', EFFECT_FLOAT: 'Effect values', FONT_WEIGHT: 'Font weight',
  FONT_SIZE: 'Font size', LINE_HEIGHT: 'Line height', LETTER_SPACING: 'Letter spacing',
  PARAGRAPH_SPACING: 'Paragraph spacing', PARAGRAPH_INDENT: 'Paragraph indent',
  TEXT_CONTENT: 'Text content', FONT_FAMILY: 'Font family', FONT_STYLE: 'Font style'
};

function leavesFor(type) {
  return (SCOPE_LEAVES[type] || []).slice();
}

/** A stored scopes array as a plain list of checkboxes. */
function scopesToLeaves(scopes, type) {
  var all = leavesFor(type);
  var out = [];
  var list = scopes || [];
  if (list.indexOf('ALL_SCOPES') !== -1) return all;
  for (var i = 0; i < all.length; i++) {
    var leaf = all[i];
    var viaFills = list.indexOf('ALL_FILLS') !== -1 && FILL_LEAVES.indexOf(leaf) !== -1;
    if (viaFills || list.indexOf(leaf) !== -1) out.push(leaf);
  }
  return out;
}

/** A list of checkboxes as the array Figma stores: shorthands wherever every box under one is ticked. */
function leavesToScopes(leaves, type) {
  var all = leavesFor(type);
  var ticked = all.filter(function (leaf) { return leaves.indexOf(leaf) !== -1; });
  if (ticked.length === all.length && all.length > 0) return ['ALL_SCOPES'];

  var hasAllFills = FILL_LEAVES.every(function (leaf) { return ticked.indexOf(leaf) !== -1; });
  var out = [];
  var addedFills = false;
  for (var i = 0; i < ticked.length; i++) {
    if (hasAllFills && FILL_LEAVES.indexOf(ticked[i]) !== -1) {
      if (!addedFills) out.push('ALL_FILLS');
      addedFills = true;
      continue;
    }
    out.push(ticked[i]);
  }
  return out;
}

/** The checkboxes one step touches, or null when this type has no such scope. */
function leavesForStep(scope, type) {
  var all = leavesFor(type);
  if (all.length === 0) return null;
  if (scope === 'ALL_SCOPES') return all;
  if (scope === 'ALL_FILLS') {
    return all.indexOf('FRAME_FILL') === -1 ? null : FILL_LEAVES.slice();
  }
  return all.indexOf(scope) === -1 ? null : [scope];
}

/**
 * What a variable's scopes become. `mode` is enable, disable or replace, and `ticked` holds the scope
 * keys that replace uses. Replace leaves a variable alone when none of the ticked scopes fit its type.
 */
function applyScopeAction(variable, ticked, mode) {
  var type = variable.resolvedType;
  var current = scopesToLeaves(variable.scopes, type);
  var before = leavesToScopes(current, type);
  var leaves = current.slice();
  var skipped = 0;

  if (mode === 'enable') {
    leaves = leavesFor(type);
  } else if (mode === 'disable') {
    leaves = [];
  } else {
    var picked = [];
    for (var i = 0; i < ticked.length; i++) {
      var touched = leavesForStep(ticked[i], type);
      if (!touched) {
        skipped++;
        continue;
      }
      for (var j = 0; j < touched.length; j++) {
        if (picked.indexOf(touched[j]) === -1) picked.push(touched[j]);
      }
    }
    if (picked.length > 0) leaves = picked;
  }

  var after = leavesToScopes(leaves, type);
  var same = before.length === after.length && before.every(function (sc) { return after.indexOf(sc) !== -1; });
  return { before: before, after: after, changed: !same && leavesFor(type).length > 0, skipped: skipped };
}

function scopeListText(scopes) {
  if (!scopes || scopes.length === 0) return 'none';
  return scopes.map(function (s) { return SCOPE_LABELS[s] || s; }).join(', ');
}

// ============================================================================
// FILTERS
// ============================================================================

function getMatchOpts() {
  return { useRegex: useRegex === true, matchCase: false };
}

/** The ticked labels as scope keys. */
function tickedScopeKeys(raw) {
  var out = [];
  var list = Array.isArray(raw) ? raw : [];
  for (var key in SCOPE_LABELS) {
    if (list.indexOf(SCOPE_LABELS[key]) !== -1) out.push(key);
  }
  return out;
}

/** The checkbox list that is on screen for the chosen Type. */
function visibleScopeList() {
  if (variableType === 'COLOR') return scopesColor;
  if (variableType === 'FLOAT') return scopesNumber;
  if (variableType === 'STRING') return scopesString;
  if (variableType === 'BOOLEAN') return [];
  return scopesAny;
}

/** "@media/" and "@media" are the same group. */
function trimGroup(g) {
  return String(g == null ? '' : g).trim().replace(/\s*\/\s*/g, '/').replace(/^\/+|\/+$/g, '');
}

function groupOf(variableName) {
  var at = variableName.lastIndexOf('/');
  return at === -1 ? '' : variableName.slice(0, at);
}

function leafOf(variableName) {
  return variableName.slice(variableName.lastIndexOf('/') + 1);
}

/** The group matches when it, or any group above it, is the one asked for. */
function groupMatches(variableName, groupFilter, opts) {
  if (groupFilter === '') return true;
  var path = groupOf(variableName);
  if (path === '') return false;
  var parts = path.split('/');
  var wholeOpts = { useRegex: opts.useRegex, matchCase: opts.matchCase, wholeName: true };
  for (var i = 1; i <= parts.length; i++) {
    if (nameMatches(parts.slice(0, i).join('/'), groupFilter, wholeOpts)) return true;
  }
  return false;
}

function nameFilterMatches(variableName, nameFilter, opts) {
  var f = String(nameFilter == null ? '' : nameFilter).trim();
  if (f === '') return true;
  return nameMatches(f.indexOf('/') !== -1 ? variableName : leafOf(variableName), f, opts);
}

// ============================================================================
// MAIN
// ============================================================================

(async function () {
  try {
    var ticked = tickedScopeKeys(visibleScopeList());
    // Disable wins when both rows are on.
    var scopeMode = disableAllScopes === true ? 'disable' : enableAllScopes === true ? 'enable' : 'replace';
    var editScopes = scopeMode !== 'replace' || ticked.length > 0;
    var hideOn = hideFromPublishing === true;

    if (!editScopes && !hideOn) {
      figma.notify('Tick scopes, choose Show or Disable for all, or turn on Hide from publishing');
      return;
    }

    var opts = getMatchOpts();
    var groupFilter = trimGroup(group);
    var groupNote = patternModeNote(groupFilter, opts);
    if (groupNote) console.log('Group: ' + groupNote);
    var nameNote = patternModeNote(searchFor, opts);
    if (nameNote) console.log('Name: ' + nameNote);

    var collections = await getAllCollections();
    var wanted = String(collectionName == null ? '' : collectionName).trim();
    if (wanted !== '') {
      collections = collections.filter(function (c) { return c.name === wanted; });
      if (collections.length === 0) {
        figma.notify('Collection "' + wanted + '" not found');
        return;
      }
    }

    var matched = 0;
    var scopesChanged = 0;
    var hiddenChanged = 0;
    var unchanged = 0;
    var skippedSteps = 0;
    var problems = [];

    for (var c = 0; c < collections.length; c++) {
      var variables = await getCollectionVariables(collections[c]);
      for (var v = 0; v < variables.length; v++) {
        var variable = variables[v];
        if (variableType !== 'any' && variable.resolvedType !== variableType) continue;
        if (!groupMatches(variable.name, groupFilter, opts)) continue;
        if (!nameFilterMatches(variable.name, searchFor, opts)) continue;
        matched++;

        var path = collections[c].name + ' / ' + variable.name;
        var touched = false;

        if (editScopes) {
          var result = applyScopeAction(variable, ticked, scopeMode);
          skippedSteps += result.skipped;
          if (result.changed) {
            try {
              variable.scopes = result.after;
              scopesChanged++;
              touched = true;
              console.log(path + ': scopes ' + scopeListText(result.before) + ' → ' + scopeListText(result.after));
            } catch (e) {
              problems.push(path + ': ' + e.message);
            }
          }
        }

        if (hideOn && variable.hiddenFromPublishing !== true) {
          try {
            variable.hiddenFromPublishing = true;
            hiddenChanged++;
            touched = true;
            console.log(path + ': hidden from publishing');
          } catch (e) {
            problems.push(path + ': ' + e.message);
          }
        }

        if (!touched) unchanged++;
      }
    }

    console.log('Matched ' + matched + ' · scopes changed ' + scopesChanged +
      ' · publishing changed ' + hiddenChanged + ' · already as asked ' + unchanged);

    if (problems.length > 0) {
      displayResults({
        title: 'Edit variable scopes — ' + problems.length + ' could not be changed',
        results: problems.map(function (p) { return { message: p, severity: 'warning' }; }),
        type: 'warning',
        showFilters: false
      });
      figma.notify('Some variables could not be changed, see the Info panel.');
      return;
    }

    if (typeof window !== 'undefined' && typeof window.codefigRunComplete === 'function') window.codefigRunComplete();

    if (matched === 0) {
      figma.notify('No variables matched. Check Collection, Group and Name.');
      return;
    }

    var parts = [];
    if (editScopes) parts.push(scopesChanged + ' with new scopes');
    if (hideOn) parts.push(hiddenChanged + ' hidden');
    var message = 'Updated ' + (scopesChanged + hiddenChanged === 0 ? 'nothing' : parts.join(', ')) +
      ' (' + matched + ' matched)';
    if (skippedSteps > 0) message += '. Some scopes do not exist for some variable types and were skipped.';
    figma.notify(message);
  } catch (error) {
    console.log('Script error: ' + error.message);
    figma.notify('Script error: ' + error.message);
  }
})();
