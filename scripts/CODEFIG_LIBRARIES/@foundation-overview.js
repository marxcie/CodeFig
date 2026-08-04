// @Foundation overview
// @DOC_START
// # @Foundation overview
// Shared overview for **Design System Foundations** when `generateOverview` is true.
//
// **Layout:** One page-level frame **`Design System Foundations`** (vertical auto layout) contains up to four sections (same order as the reference sheet):
// 1. **`Render styles — overview`** — local **text styles** (two columns: Regular vs Semibold-style names), not variables.
// 2. **`Grid — overview`** — viewport preview frames with grid style applied.
// 3. **`Spacing — overview`** — variable-backed width bars per **mode** (columns per breakpoint).
// 4. **`Corner radius — overview`** — variable-backed corner swatches per **mode**.
//
// Variable-driven sections use **explicit variable modes** on preview nodes. Text styles are modeless; grouping is by style name / font style, not collection modes.
//
// **Imports:** `foundationCreateCornerRadiusOverview`, `foundationCreateSpacingOverview`, `foundationCreateTypographyTextStylesOverview`, `foundationCreateGridOverview`, and the one-step `foundationGenerateCornerRadiusOverview` / `foundationGenerateSpacingOverview` helpers.
//
// Legacy standalone frames (`Corner radius - overview`, …) are removed when a section is updated.
// @DOC_END

@import { getVariable, getOrCreateCollection } from "@Variables"

/** Layout tokens (Figma ref. node 10:1364). Exposed as a function so @import extraction includes values. */
function foundationOverviewLayout() {
  return {
    wrapperName: "Design System Foundations",
    sectionOrder: [
      "Render styles — overview",
      "Grid — overview",
      "Spacing — overview",
      "Corner radius — overview"
    ],
    sections: {
      renderStyles: "Render styles — overview",
      grid: "Grid — overview",
      spacing: "Spacing — overview",
      corner: "Corner radius — overview"
    },
    padOuter: 80,
    gapWrapper: 100,
    sectionPad: 80,
    gapTitleBody: 80,
    gapColumns: 80,
    gapModeCol: 12,
    gapTextCols: 80,
    gapTextRows: 40,
    tileGapInner: 6,
    gridViewportGap: 40,
    gridLabelToFrame: 24,
    swatchSize: 120,
    spacingRowH: 40,
    colors: {
      sectionBg: { r: 250 / 255, g: 251 / 255, b: 252 / 255 },
      titleLarge: { r: 20 / 255, g: 23 / 255, b: 31 / 255 },
      mutedHeader: { r: 89 / 255, g: 92 / 255, b: 102 / 255 },
      tokenText: { r: 51 / 255, g: 54 / 255, b: 61 / 255 },
      captionStyle: { r: 115 / 255, g: 117 / 255, b: 128 / 255 },
      swatch: { r: 115 / 255, g: 140 / 255, b: 242 / 255 },
      cardStroke: { r: 217 / 255, g: 217 / 255, b: 224 / 255 }
    }
  };
}

async function foundationLoadUiFonts() {
  if (foundationLoadUiFonts._loaded) return;
  var reg = { family: "Inter", style: "Regular" };
  var bold = { family: "Inter", style: "Bold" };
  var candidates = [
    { family: "Inter", style: "Regular" },
    { family: "Roboto", style: "Regular" },
    { family: "Helvetica", style: "Regular" }
  ];
  var i;
  for (i = 0; i < candidates.length; i++) {
    try {
      await figma.loadFontAsync(candidates[i]);
      reg = candidates[i];
      break;
    } catch (e) {}
  }
  var bolds = [
    { family: "Inter", style: "Bold" },
    { family: "Roboto", style: "Bold" },
    { family: "Helvetica", style: "Bold" }
  ];
  for (var b = 0; b < bolds.length; b++) {
    try {
      await figma.loadFontAsync(bolds[b]);
      bold = bolds[b];
      break;
    } catch (e2) {}
  }
  foundationLoadUiFonts._reg = reg;
  foundationLoadUiFonts._bold = bold;
  foundationLoadUiFonts._loaded = true;
}

function foundationUiReg() {
  return foundationLoadUiFonts._reg || { family: "Inter", style: "Regular" };
}

function foundationUiBold() {
  return foundationLoadUiFonts._bold || foundationUiReg();
}

function foundationRemoveStandaloneLegacyOverviews() {
  var legacy = [
    "Corner radius - overview",
    "Spacing - overview",
    "Typography - overview",
    "Grid System Preview"
  ];
  var ch = figma.currentPage.children;
  var i;
  for (i = ch.length - 1; i >= 0; i--) {
    var n = ch[i].name;
    var li;
    for (li = 0; li < legacy.length; li++) {
      if (n === legacy[li] && ch[i].type === "FRAME") {
        ch[i].remove();
      }
    }
  }
}

function foundationGetOrCreateOverviewWrapper() {
  var L = foundationOverviewLayout();
  var ch = figma.currentPage.children;
  var keep = null;
  var i;
  for (i = 0; i < ch.length; i++) {
    if (ch[i].name === L.wrapperName && ch[i].type === "FRAME") {
      if (!keep) {
        keep = ch[i];
      }
    }
  }
  if (keep) {
    for (i = ch.length - 1; i >= 0; i--) {
      var node = ch[i];
      if (node.name === L.wrapperName && node.type === "FRAME" && node !== keep) {
        node.remove();
      }
    }
    return keep;
  }
  var w = figma.createFrame();
  w.name = L.wrapperName;
  w.layoutMode = "VERTICAL";
  w.primaryAxisSizingMode = "AUTO";
  w.counterAxisSizingMode = "AUTO";
  w.itemSpacing = L.gapWrapper;
  w.paddingLeft = L.padOuter;
  w.paddingRight = L.padOuter;
  w.paddingTop = L.padOuter;
  w.paddingBottom = L.padOuter;
  w.fills = [];
  figma.currentPage.appendChild(w);
  return w;
}

function foundationApplySectionShell(frame) {
  var L = foundationOverviewLayout();
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = L.gapTitleBody;
  frame.paddingLeft = L.sectionPad;
  frame.paddingRight = L.sectionPad;
  frame.paddingTop = L.sectionPad;
  frame.paddingBottom = L.sectionPad;
  frame.fills = [{ type: "SOLID", color: L.colors.sectionBg }];
  frame.clipsContent = true;
}

function foundationAcquireSectionFrame(wrapper, sectionName) {
  var found = null;
  var i;
  var n = wrapper.children.length;
  for (i = 0; i < n; i++) {
    if (wrapper.children[i].name === sectionName) {
      found = wrapper.children[i];
      break;
    }
  }
  for (i = wrapper.children.length - 1; i >= 0; i--) {
    var dup = wrapper.children[i];
    if (dup.name === sectionName && dup !== found) {
      dup.remove();
    }
  }
  if (!found) {
    found = figma.createFrame();
    found.name = sectionName;
    wrapper.appendChild(found);
  }
  foundationApplySectionShell(found);
  while (found.children.length) {
    found.children[0].remove();
  }
  return found;
}

function foundationReorderSectionChildren(wrapper) {
  var L = foundationOverviewLayout();
  var ORDER = L.sectionOrder;
  var pool = [];
  var i;
  for (i = 0; i < wrapper.children.length; i++) {
    pool.push(wrapper.children[i]);
  }
  var ordered = [];
  var oi;
  for (oi = 0; oi < ORDER.length; oi++) {
    var want = ORDER[oi];
    var pi;
    for (pi = 0; pi < pool.length; pi++) {
      if (pool[pi].name === want) {
        ordered.push(pool[pi]);
        pool.splice(pi, 1);
        break;
      }
    }
  }
  for (pi = 0; pi < pool.length; pi++) {
    ordered.push(pool[pi]);
  }
  for (oi = 0; oi < ordered.length; oi++) {
    wrapper.appendChild(ordered[oi]);
  }
}

function foundationAppendTitleLarge(section, text) {
  var L = foundationOverviewLayout();
  var title = figma.createText();
  title.fontName = foundationUiBold();
  title.fontSize = 40;
  title.fills = [{ type: "SOLID", color: L.colors.titleLarge }];
  title.characters = text;
  section.appendChild(title);
  return title;
}

function foundationFinalizeOverview(wrapper) {
  foundationReorderSectionChildren(wrapper);
}

function foundationVariableNamePrefix(group) {
  if (!group || typeof group !== "string") return "";
  var trimmed = String(group);
  if (trimmed.charAt(0) === "/") trimmed = trimmed.slice(1);
  if (trimmed.charAt(trimmed.length - 1) === "/") trimmed = trimmed.slice(0, -1);
  return trimmed ? trimmed + "/" : "";
}

function foundationModeLabelFromKey(key) {
  if (!key || typeof key !== "string") return "Default";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function foundationResolveCollectionNameFromInnerData(data) {
  if (data && data.collectionName != null && data.collectionName !== "") {
    return data.collectionName;
  }
  return "Responsive System";
}

async function foundationGenerateCornerRadiusOverview(innerConfig) {
  if (!innerConfig || typeof innerConfig !== "object") {
    console.warn("foundationGenerateCornerRadiusOverview: invalid config");
    return { created: false };
  }
  var collection = await getOrCreateCollection(foundationResolveCollectionNameFromInnerData(innerConfig));
  return foundationCreateCornerRadiusOverview(collection, innerConfig);
}

async function foundationGenerateSpacingOverview(innerConfig) {
  if (!innerConfig || typeof innerConfig !== "object") {
    console.warn("foundationGenerateSpacingOverview: invalid config");
    return { created: false };
  }
  var collection = await getOrCreateCollection(foundationResolveCollectionNameFromInnerData(innerConfig));
  return foundationCreateSpacingOverview(collection, innerConfig);
}

function foundationFoRadiusStyleCard() {
  return 12;
}

function foundationPreviewTextToFigma(raw) {
  var s = typeof raw === "string" ? raw : "";
  if (!String(s).trim()) {
    s = "Sphinx of black quartz, \u2028judge my vow.";
  }
  s = String(s).split("\r\n").join("\n").split("\r").join("\n").split("\n").join("\u2028");
  return s;
}

async function foundationBindRectCorners(rect, variable) {
  if (!variable || typeof rect.setBoundVariable !== "function") return;
  try {
    rect.setBoundVariable("topLeftRadius", variable);
    rect.setBoundVariable("topRightRadius", variable);
    rect.setBoundVariable("bottomLeftRadius", variable);
    rect.setBoundVariable("bottomRightRadius", variable);
  } catch (e) {
    console.warn("Overview corner bind: " + (e && e.message));
  }
}

async function foundationBindWidth(node, variable) {
  if (!variable || typeof node.setBoundVariable !== "function") return;
  try {
    node.setBoundVariable("width", variable);
  } catch (e) {
    console.warn("Overview width bind: " + (e && e.message));
  }
}

function foundationStyleGoesRegularColumn(style) {
  var n = String(style.name || "").toLowerCase();
  if (n.indexOf("/regular") >= 0) return true;
  if (n.indexOf("/semibold") >= 0 || n.indexOf("/semi bold") >= 0) return false;
  var st = style.fontName && style.fontName.style ? String(style.fontName.style).toLowerCase() : "";
  if (st.indexOf("semi") >= 0) return false;
  return true;
}

async function foundationCreateCornerRadiusOverview(collection, data) {
  var group = data && data.group != null ? data.group : "";
  var prefix = foundationVariableNamePrefix(group);
  var radii = (data && data.radii) || [];
  var viewportKeys = Object.keys((data && data.radiusSizes) || {});
  if (radii.length === 0 || viewportKeys.length === 0) {
    console.warn("Corner radius overview: missing radii or modes");
    return { removed: 0, created: false };
  }

  foundationRemoveStandaloneLegacyOverviews();
  await foundationLoadUiFonts();
  var L = foundationOverviewLayout();

  var wrapper = foundationGetOrCreateOverviewWrapper();
  var section = foundationAcquireSectionFrame(wrapper, L.sections.corner);

  foundationAppendTitleLarge(section, "Corner radius");

  var body = figma.createFrame();
  body.name = "Corner radius";
  body.layoutMode = "HORIZONTAL";
  body.primaryAxisSizingMode = "AUTO";
  body.counterAxisSizingMode = "AUTO";
  body.itemSpacing = L.gapColumns;
  body.fills = [];

  var tokenCol = figma.createFrame();
  tokenCol.name = "Variables";
  tokenCol.layoutMode = "VERTICAL";
  tokenCol.primaryAxisSizingMode = "AUTO";
  tokenCol.counterAxisSizingMode = "AUTO";
  tokenCol.itemSpacing = L.gapModeCol;
  tokenCol.counterAxisAlignItems = "MIN";
  tokenCol.fills = [];

  var tokHead = figma.createText();
  tokHead.fontName = foundationUiBold();
  tokHead.fontSize = 10;
  tokHead.fills = [{ type: "SOLID", color: L.colors.mutedHeader }];
  tokHead.characters = "Token";
  tokHead.textAutoResize = "WIDTH_AND_HEIGHT";
  tokenCol.appendChild(tokHead);

  var ri;
  for (ri = 0; ri < radii.length; ri++) {
    var tokenName = radii[ri];
    var rowH = figma.createFrame();
    rowH.name = "Row label";
    rowH.layoutMode = "HORIZONTAL";
    rowH.primaryAxisSizingMode = "AUTO";
    rowH.counterAxisSizingMode = "FIXED";
    rowH.primaryAxisAlignItems = "MIN";
    rowH.counterAxisAlignItems = "CENTER";
    rowH.fills = [];
    var nameT = figma.createText();
    nameT.fontName = foundationUiReg();
    nameT.fontSize = 11;
    nameT.fills = [{ type: "SOLID", color: L.colors.tokenText }];
    nameT.characters = prefix ? prefix + tokenName : tokenName;
    nameT.textAutoResize = "WIDTH_AND_HEIGHT";
    rowH.appendChild(nameT);
    rowH.resize(nameT.width, L.swatchSize);
    tokenCol.appendChild(rowH);
  }
  body.appendChild(tokenCol);

  var vnameBase = prefix;
  var vi;
  for (vi = 0; vi < viewportKeys.length; vi++) {
    var vk = viewportKeys[vi];
    var modeLabel = foundationModeLabelFromKey(vk);
    var mode = collection.modes.find(function (m) {
      return m.name === modeLabel;
    });

    var modeCol = figma.createFrame();
    modeCol.name = modeLabel;
    modeCol.layoutMode = "VERTICAL";
    modeCol.primaryAxisSizingMode = "AUTO";
    modeCol.counterAxisSizingMode = "AUTO";
    modeCol.itemSpacing = L.gapModeCol;
    modeCol.fills = [];

    var mh = figma.createText();
    mh.fontName = foundationUiBold();
    mh.fontSize = 10;
    mh.fills = [{ type: "SOLID", color: L.colors.mutedHeader }];
    mh.characters = modeLabel;
    modeCol.appendChild(mh);

    var ri2;
    for (ri2 = 0; ri2 < radii.length; ri2++) {
      var tn = radii[ri2];
      var vname = vnameBase + tn;
      var cell = figma.createFrame();
      cell.name = tn;
      cell.layoutMode = "NONE";
      cell.resize(L.swatchSize, L.swatchSize);
      cell.fills = [{ type: "SOLID", color: L.colors.swatch }];
      if (mode && typeof cell.setExplicitVariableModeForCollection === "function") {
        try {
          cell.setExplicitVariableModeForCollection(collection, mode.modeId);
        } catch (eM) {}
      }
      var variable = await getVariable(collection, vname);
      await foundationBindRectCorners(cell, variable);
      modeCol.appendChild(cell);
    }
    body.appendChild(modeCol);
  }

  section.appendChild(body);
  foundationFinalizeOverview(wrapper);
  console.log("Corner radius overview: " + radii.length + " token(s)");
  return { removed: 1, created: true };
}

async function foundationCreateSpacingOverview(collection, data) {
  var group = data && data.group != null ? data.group : "";
  var prefix = foundationVariableNamePrefix(group);
  var spacings = (data && data.spacings) || [];
  var viewportKeys = Object.keys((data && data.spacingSizes) || {});
  if (spacings.length === 0 || viewportKeys.length === 0) {
    console.warn("Spacing overview: missing spacings or modes");
    return { removed: 0, created: false };
  }

  foundationRemoveStandaloneLegacyOverviews();
  await foundationLoadUiFonts();
  var L = foundationOverviewLayout();

  var wrapper = foundationGetOrCreateOverviewWrapper();
  var section = foundationAcquireSectionFrame(wrapper, L.sections.spacing);

  foundationAppendTitleLarge(section, "Spacing");

  var body = figma.createFrame();
  body.name = "Spacing";
  body.layoutMode = "HORIZONTAL";
  body.primaryAxisSizingMode = "AUTO";
  body.counterAxisSizingMode = "AUTO";
  body.itemSpacing = L.gapColumns;
  body.fills = [];

  var tokenCol = figma.createFrame();
  tokenCol.name = "Variables";
  tokenCol.layoutMode = "VERTICAL";
  tokenCol.primaryAxisSizingMode = "AUTO";
  tokenCol.counterAxisSizingMode = "AUTO";
  tokenCol.itemSpacing = 0;
  tokenCol.fills = [];

  var th = figma.createText();
  th.fontName = foundationUiBold();
  th.fontSize = 10;
  th.fills = [{ type: "SOLID", color: L.colors.mutedHeader }];
  th.characters = "Token";
  th.textAutoResize = "WIDTH_AND_HEIGHT";
  tokenCol.appendChild(th);

  var si;
  for (si = 0; si < spacings.length; si++) {
    var tokenNameSp = spacings[si];
    var row = figma.createFrame();
    row.name = tokenNameSp;
    row.layoutMode = "HORIZONTAL";
    row.primaryAxisSizingMode = "AUTO";
    row.counterAxisSizingMode = "FIXED";
    row.primaryAxisAlignItems = "MIN";
    row.counterAxisAlignItems = "CENTER";
    row.fills = [];
    var nameT = figma.createText();
    nameT.fontName = foundationUiReg();
    nameT.fontSize = 11;
    nameT.fills = [{ type: "SOLID", color: L.colors.tokenText }];
    nameT.characters = prefix ? prefix + tokenNameSp : tokenNameSp;
    nameT.textAutoResize = "WIDTH_AND_HEIGHT";
    row.appendChild(nameT);
    row.resize(nameT.width, L.spacingRowH);
    tokenCol.appendChild(row);
  }
  body.appendChild(tokenCol);

  var vnameSpBase = prefix;
  var vj;
  for (vj = 0; vj < viewportKeys.length; vj++) {
    var vkSp = viewportKeys[vj];
    var modeLabelSp = foundationModeLabelFromKey(vkSp);
    var modeSp = collection.modes.find(function (m) {
      return m.name === modeLabelSp;
    });

    var modeCol = figma.createFrame();
    modeCol.name = modeLabelSp;
    modeCol.layoutMode = "VERTICAL";
    modeCol.primaryAxisSizingMode = "AUTO";
    modeCol.counterAxisSizingMode = "AUTO";
    modeCol.itemSpacing = 0;
    modeCol.fills = [];

    var mh = figma.createText();
    mh.fontName = foundationUiBold();
    mh.fontSize = 10;
    mh.fills = [{ type: "SOLID", color: L.colors.mutedHeader }];
    mh.characters = modeLabelSp;
    modeCol.appendChild(mh);

    var sj;
    for (sj = 0; sj < spacings.length; sj++) {
      var tkn = spacings[sj];
      var vnameSp = vnameSpBase + tkn;

      var cell = figma.createFrame();
      cell.name = tkn;
      cell.layoutMode = "HORIZONTAL";
      cell.primaryAxisAlignItems = "MIN";
      cell.counterAxisAlignItems = "CENTER";
      cell.itemSpacing = 0;
      cell.fills = [];
      cell.clipsContent = false;

      if (modeSp && typeof cell.setExplicitVariableModeForCollection === "function") {
        try {
          cell.setExplicitVariableModeForCollection(collection, modeSp.modeId);
        } catch (eM2) {}
      }

      var bar = figma.createRectangle();
      bar.resize(8, 20);
      bar.cornerRadius = 0;
      bar.fills = [{ type: "SOLID", color: L.colors.swatch }];

      var variableSp = await getVariable(collection, vnameSp);
      await foundationBindWidth(bar, variableSp);

      cell.appendChild(bar);
      cell.primaryAxisSizingMode = "FIXED";
      cell.counterAxisSizingMode = "FIXED";
      cell.resize(bar.width, L.spacingRowH);
      modeCol.appendChild(cell);
    }
    body.appendChild(modeCol);
  }

  section.appendChild(body);
  foundationFinalizeOverview(wrapper);
  console.log("Spacing overview: " + spacings.length + " row(s)");
  return { removed: 1, created: true };
}

async function foundationCreateTypographyTextStylesOverview(options) {
  var opt = options || {};
  var groupPrefix = typeof opt.groupPrefix === "string" ? opt.groupPrefix : "";
  var needle = typeof opt.styleNameNeedle === "string" ? opt.styleNameNeedle : "";
  if (!needle.trim() && groupPrefix) {
    needle = groupPrefix + "/";
  }
  var needleLo = needle.trim().toLowerCase();

  foundationRemoveStandaloneLegacyOverviews();
  await foundationLoadUiFonts();
  var all = await figma.getLocalTextStylesAsync();
  var filtered = all.filter(function (s) {
    if (!s || !s.name) return false;
    if (!needleLo) return true;
    return String(s.name).toLowerCase().indexOf(needleLo) !== -1;
  });

  if (filtered.length === 0) {
    console.warn("Typography overview: no local text styles match the filter");
    return { created: false, count: 0 };
  }

  var regular = filtered.filter(foundationStyleGoesRegularColumn);
  var semi = filtered.filter(function (s) {
    return !foundationStyleGoesRegularColumn(s);
  });
  regular.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name));
  });
  semi.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name));
  });

  var L = foundationOverviewLayout();
  var wrapper = foundationGetOrCreateOverviewWrapper();
  var section = foundationAcquireSectionFrame(wrapper, L.sections.renderStyles);

  foundationAppendTitleLarge(section, "Text styles");

  var previewStr = foundationPreviewTextToFigma(opt.previewText);

  var body = figma.createFrame();
  body.name = "Text styles";
  body.layoutMode = "HORIZONTAL";
  body.primaryAxisSizingMode = "AUTO";
  body.counterAxisSizingMode = "AUTO";
  body.itemSpacing = L.gapTextCols;
  body.fills = [];

  async function appendStyleColumn(target, styles) {
    var col = figma.createFrame();
    col.layoutMode = "VERTICAL";
    col.primaryAxisSizingMode = "AUTO";
    col.counterAxisSizingMode = "AUTO";
    col.itemSpacing = L.gapTextRows;
    col.fills = [];
    var fi;
    for (fi = 0; fi < styles.length; fi++) {
      var style = styles[fi];
      var cell = figma.createFrame();
      cell.name = "TEXT · " + String(style.name).slice(0, 80);
      cell.layoutMode = "VERTICAL";
      cell.primaryAxisSizingMode = "AUTO";
      cell.counterAxisSizingMode = "AUTO";
      cell.itemSpacing = L.tileGapInner;
      cell.fills = [];

      var cap = figma.createText();
      cap.fontName = foundationUiReg();
      cap.fontSize = 9;
      cap.fills = [{ type: "SOLID", color: L.colors.captionStyle }];
      cap.characters = style.name;
      cap.textAutoResize = "WIDTH_AND_HEIGHT";
      cell.appendChild(cap);

      await figma.loadFontAsync(style.fontName);
      var sample = figma.createText();
      sample.fontName = style.fontName;
      sample.characters = previewStr;
      await sample.setTextStyleIdAsync(style.id);
      sample.characters = previewStr;
      sample.textAutoResize = "WIDTH_AND_HEIGHT";
      cell.appendChild(sample);

      col.appendChild(cell);
    }
    target.appendChild(col);
  }

  await appendStyleColumn(body, regular);
  await appendStyleColumn(body, semi);
  section.appendChild(body);

  foundationFinalizeOverview(wrapper);
  console.log("Typography overview: " + filtered.length + " text style(s)");
  return { created: true, count: filtered.length };
}

async function foundationCreateGridOverview(collection, config, gridStyle) {
  var stats = { created: 0, removed: 0 };
  if (!gridStyle) {
    console.warn("Grid overview: skipped (no grid style)");
    return stats;
  }

  var group = config && typeof config.group === "string" ? config.group : "";
  var prefix = group ? group + "/" : "";
  var innerConfig = {};
  if (config && config.modes && Array.isArray(config.modes) && config.modes.length > 0) {
    var gridModesToInnerConfig = function (modes) {
      var out = {};
      if (!Array.isArray(modes)) return out;
      var i;
      for (i = 0; i < modes.length; i++) {
        var m = modes[i];
        if (!m || typeof m !== "object") continue;
        if (typeof m.name !== "string" || !m.name) continue;
        if (typeof m.containerWidth !== "number" || typeof m.columns !== "number") continue;
        out[m.name] = {
          containerWidth: m.containerWidth,
          columns: m.columns,
          gap: typeof m.gap === "number" ? m.gap : 0,
          padding: typeof m.padding === "number" ? m.padding : 0
        };
      }
      return out;
    };
    innerConfig = gridModesToInnerConfig(config.modes);
  } else if (config && config.config && typeof config.config === "object") {
    innerConfig = config.config;
  }

  var viewportKeys = Object.keys(innerConfig).filter(function (k) {
    var vc = innerConfig[k];
    return !!(vc && typeof vc === "object" && typeof vc.containerWidth === "number" && typeof vc.columns === "number");
  });
  if (viewportKeys.length === 0) {
    console.warn("Grid overview: no viewports");
    return stats;
  }

  foundationRemoveStandaloneLegacyOverviews();
  await foundationLoadUiFonts();
  var L = foundationOverviewLayout();

  var viewportWidthVar = await getVariable(collection, prefix + "viewport-width");
  var previewHeight = 480;

  var wrapper = foundationGetOrCreateOverviewWrapper();
  var section = foundationAcquireSectionFrame(wrapper, L.sections.grid);

  foundationAppendTitleLarge(section, "Grid overview");

  var stack = figma.createFrame();
  stack.name = "Grid overview";
  stack.layoutMode = "VERTICAL";
  stack.primaryAxisSizingMode = "AUTO";
  stack.counterAxisSizingMode = "AUTO";
  stack.itemSpacing = L.gridViewportGap;
  stack.fills = [];

  var i;
  for (i = 0; i < viewportKeys.length; i++) {
    var vk = viewportKeys[i];
    var modeLabel =
      vk && typeof vk === "string" && vk.length
        ? vk.charAt(0).toUpperCase() + vk.slice(1)
        : "Default";
    var vc = innerConfig[vk];

    var block = figma.createFrame();
    block.name = modeLabel;
    block.layoutMode = "VERTICAL";
    block.primaryAxisSizingMode = "AUTO";
    block.counterAxisSizingMode = "AUTO";
    block.itemSpacing = L.gridLabelToFrame;
    block.fills = [];

    var lab = figma.createText();
    lab.fontName = foundationUiBold();
    lab.fontSize = 10;
    lab.fills = [{ type: "SOLID", color: L.colors.mutedHeader }];
    lab.characters = modeLabel;
    block.appendChild(lab);

    var viewportFrame = figma.createFrame();
    viewportFrame.name = modeLabel;
    viewportFrame.layoutMode = "NONE";
    viewportFrame.resize(vc.containerWidth, previewHeight);
    viewportFrame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    viewportFrame.strokes = [{ type: "SOLID", color: L.colors.cardStroke }];
    viewportFrame.strokeWeight = 1;

    var mode = collection.modes.find(function (m) {
      return m.name === modeLabel;
    });
    if (mode && typeof viewportFrame.setExplicitVariableModeForCollection === "function") {
      try {
        viewportFrame.setExplicitVariableModeForCollection(collection, mode.modeId);
      } catch (e) {}
    }

    if (viewportWidthVar && typeof viewportFrame.setBoundVariable === "function") {
      try {
        viewportFrame.setBoundVariable("width", viewportWidthVar);
      } catch (e2) {
        console.warn("Grid overview " + modeLabel + ": width bind failed: " + (e2 && e2.message));
      }
    }

    if ("setGridStyleIdAsync" in viewportFrame && typeof viewportFrame.setGridStyleIdAsync === "function") {
      await viewportFrame.setGridStyleIdAsync(gridStyle.id);
    } else {
      viewportFrame.gridStyleId = gridStyle.id;
    }

    block.appendChild(viewportFrame);
    stack.appendChild(block);
    stats.created++;
  }

  section.appendChild(stack);
  foundationFinalizeOverview(wrapper);
  console.log("Grid overview: " + stats.created + " viewport(s)");
  return stats;
}
