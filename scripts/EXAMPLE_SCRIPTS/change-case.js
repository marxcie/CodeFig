// Change case
// SCRIPT_NAME: Change case
// @DOC_START
// # Change case
// Recursively renames layers and component variant properties in the selection.
//
// ## Overview
// Walks the selection and its descendants. Choose a case style, then tick which kinds of names to
// update: frame names, group names, variant property labels, variant option values, and optionally
// instance layer names.
//
// ## Case styles
// | Style | Example (`icons/arrow right`) |
// |-------|-------------------------------|
// | lower case | `icons/arrow right` |
// | Capital case | `Icons/Arrow Right` (title case per `/` segment) |
// | camel Case | `icons/arrowRight` |
//
// Path segments separated by `/` are transformed independently. Within a segment, words split on
// spaces, hyphens, and underscores.
//
// ## Config options
// | Option | Description |
// |--------|-------------|
// | caseStyle | lower case, Capital case, or camel Case. |
// | frames | Rename `FRAME` layers. |
// | groups | Rename `GROUP` layers. |
// | variantLabels | Rename variant property names on component sets (`Size` → `size`). |
// | variantValues | Rename variant option values on component sets (`Small` → `small`). |
// | renameInstances | Rename `INSTANCE` layer names (off by default). |
// @DOC_END

@import { collectNodesAsync } from "@Core Library"

// @UI_CONFIG_START
// # Change case
var caseStyle = "lower case"; // @options: lower case|Capital case|camel Case @label: Case style
var frames = true; // @label: Frames
var groups = true; // @label: Groups
var variantLabels = true; // @label: Variant labels
var variantValues = true; // @label: Variant values
var renameInstances = false; // @label: Rename instances
// @UI_CONFIG_END

function splitWords(text) {
  return String(text || "").split(/[\s\-_]+/).filter(function (part) {
    return part.length > 0;
  });
}

function transformSegment(segment, style) {
  var words = splitWords(segment);
  if (!words.length) return segment;

  if (style === "lower case") {
    return segment.toLowerCase();
  }

  if (style === "Capital case") {
    return words
      .map(function (word) {
        var lower = word.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(" ");
  }

  // camel Case
  return words
    .map(function (word, index) {
      var lower = word.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function applyCase(name, style) {
  var value = String(name == null ? "" : name);
  if (!value) return value;
  var resolvedStyle =
    style === "Capital case" || style === "camel Case" ? style : "lower case";
  return value
    .split("/")
    .map(function (segment) {
      return transformSegment(segment, resolvedStyle);
    })
    .join("/");
}

function renameIfChanged(node, nextName) {
  if (!nextName || nextName === node.name) return false;
  node.name = nextName;
  return true;
}

function parseVariantPairs(name) {
  var pairs = [];
  var parts = String(name || "").split(", ");
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf("=");
    if (eq === -1) continue;
    pairs.push({
      key: parts[i].slice(0, eq),
      value: parts[i].slice(eq + 1),
    });
  }
  return pairs;
}

function buildVariantName(pairs) {
  return pairs
    .map(function (pair) {
      return pair.key + "=" + pair.value;
    })
    .join(", ");
}

function isVariantComponent(node) {
  return (
    node.type === "COMPONENT" &&
    node.parent &&
    node.parent.type === "COMPONENT_SET"
  );
}

function variantPropertyLabel(propertyKey) {
  var hash = propertyKey.indexOf("#");
  return hash === -1 ? propertyKey : propertyKey.slice(0, hash);
}

function processComponentSetVariants(set, style, stats) {
  if (variantLabels && typeof set.editComponentProperty === "function") {
    var defs = set.componentPropertyDefinitions || {};
    for (var propertyKey in defs) {
      if (!Object.prototype.hasOwnProperty.call(defs, propertyKey)) continue;
      if (defs[propertyKey].type !== "VARIANT") continue;

      var currentLabel = variantPropertyLabel(propertyKey);
      var nextLabel = applyCase(currentLabel, style);
      if (nextLabel === currentLabel) continue;

      try {
        set.editComponentProperty(propertyKey, { name: nextLabel });
        stats.variantLabels++;
      } catch (error) {
        stats.errors++;
        console.warn(
          "[Change case] Variant label " +
            set.name +
            " / " +
            currentLabel +
            ": " +
            (error && error.message ? error.message : error)
        );
      }
    }
  }

  if (!variantValues) return;

  var children = set.children;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.type !== "COMPONENT") continue;

    var pairs = parseVariantPairs(child.name);
    if (!pairs.length) continue;

    var changed = false;
    for (var j = 0; j < pairs.length; j++) {
      var nextValue = applyCase(pairs[j].value, style);
      if (nextValue !== pairs[j].value) {
        pairs[j].value = nextValue;
        changed = true;
      }
    }
    if (!changed) continue;

    try {
      child.name = buildVariantName(pairs);
      stats.variantValues++;
    } catch (error) {
      stats.errors++;
      console.warn(
        "[Change case] Variant value " +
          child.name +
          ": " +
          (error && error.message ? error.message : error)
      );
    }
  }
}

function anyTargetEnabled() {
  return !!(
    frames ||
    groups ||
    variantLabels ||
    variantValues ||
    renameInstances
  );
}

function buildSummary(stats) {
  var parts = [];
  if (stats.frames) parts.push(stats.frames + " frame" + (stats.frames === 1 ? "" : "s"));
  if (stats.groups) parts.push(stats.groups + " group" + (stats.groups === 1 ? "" : "s"));
  if (stats.instances) {
    parts.push(stats.instances + " instance" + (stats.instances === 1 ? "" : "s"));
  }
  if (stats.variantLabels) {
    parts.push(
      stats.variantLabels +
        " variant label" +
        (stats.variantLabels === 1 ? "" : "s")
    );
  }
  if (stats.variantValues) {
    parts.push(
      stats.variantValues +
        " variant value" +
        (stats.variantValues === 1 ? "" : "s")
    );
  }
  if (!parts.length) return "Nothing to rename";
  var message = "Renamed " + parts.join(", ");
  if (stats.errors) {
    message +=
      " (" + stats.errors + " error" + (stats.errors === 1 ? "" : "s") + ")";
  }
  return message;
}

(async function () {
  var selection = figma.currentPage.selection.slice();
  if (!selection.length) {
    figma.notify("Select layers first");
    return;
  }

  if (!anyTargetEnabled()) {
    figma.notify("Enable at least one rename target");
    return;
  }

  var style =
    caseStyle === "Capital case" || caseStyle === "camel Case"
      ? caseStyle
      : "lower case";

  var nodes = await collectNodesAsync(selection, {
    operation: "Scanning selection",
    maxDepth: 50,
  });

  var stats = {
    frames: 0,
    groups: 0,
    instances: 0,
    variantLabels: 0,
    variantValues: 0,
    errors: 0,
  };
  var processedSets = {};

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];

    if (node.type === "COMPONENT_SET") {
      if (!processedSets[node.id]) {
        processedSets[node.id] = true;
        processComponentSetVariants(node, style, stats);
      }
      continue;
    }

    if (isVariantComponent(node)) continue;

    if (frames && node.type === "FRAME") {
      if (renameIfChanged(node, applyCase(node.name, style))) stats.frames++;
    } else if (groups && node.type === "GROUP") {
      if (renameIfChanged(node, applyCase(node.name, style))) stats.groups++;
    } else if (renameInstances && node.type === "INSTANCE") {
      if (renameIfChanged(node, applyCase(node.name, style))) stats.instances++;
    }
  }

  figma.notify(buildSummary(stats));
})();
