// Render styles overview
// @DOC_START
// # Render styles overview
// Renders **local** text, paint, and effect styles as a structured overview. **All auto-layout frames hug contents**. Path logic: **one or two** segments (`Style` or `Group / Name` such as `🚧 V6/3xs`) → **vertical** stack, one tile per row (no column strip). **Three or more** segments (`…/…/Weight`) → **last** segment is the **column** (e.g. **Normal** | **Bold**): matching endings stack **vertically**; **one horizontal** `… · columns` frame holds those columns **side by side** (weight order when names match a known list, else file order). Optional `renderStylesOverviewMinColumnWidth` sets a minimum width on each column frame. **Fills** on style cards + **root** only; **corner radius** only on filled layers. Inner group frames use **no padding**. Typography preview: **previewText** (Config textarea), or **`RENDER_TEXT_PREVIEW_SAMPLE`** if empty; line breaks from the field become **`\u2028`** (soft) in Figma.
//
// - **Text styles:** **previewText** (or fallback) as multiline sample + **full style name** caption (applied text style). Left-aligned, hug.
// - **Paint styles:** swatch + **full style name** caption.
// - **Effect styles:** sample shape with effect + **full style name** caption.
//
// Use it as a **style guide** or to **surface styles in a file** so tools like **Replace styles** can resolve targets (paste the frame into another file if needed). **Design System Foundations** scripts can build smaller token overviews via **@Foundation overview** (corner radius, spacing variables; typography text tiles as a flat list).
//
// ## Config (UI)
// | Option | Description |
// |--------|-------------|
// | styleGroup | Substring on full style name (case-insensitive). Empty = all (capped). |
// | previewText | Multiline **textarea**: copy shown in each **text** style tile. **Enter** in the field becomes a **soft line break** (`\u2028`) in Figma. Leave empty to use `RENDER_TEXT_PREVIEW_SAMPLE`. |
//
// ## Script-only
// - `renderStylesIncludeText`, `renderStylesIncludePaint`, `renderStylesIncludeEffect`, `renderStylesIncludeGrid`
// - `renderStylesMaxStyles` — max styles total (default `600`)
// - `renderStylesOverviewMinColumnWidth` — optional min width (px) for column frames; `0` = pure hug contents (default `0`).
// - `renderStylesRadiusInner` / `renderStylesRadiusStep` — swatch/box radius and +step for the **filled** style card around them (defaults `8` / `4`).
// - `renderStylesRootCornerRadius` — root overview frame (has background); default `20`.
// - `previewText` — set via Config textarea; leave empty to use `RENDER_TEXT_PREVIEW_SAMPLE`.
// - `RENDER_TEXT_PREVIEW_SAMPLE` — fallback when `previewText` is blank; may use **`\u2028`** between lines.
// @DOC_END

@import { getAllStyles } from "@Core Library"

if (typeof getAllStyles !== "function") {
  var getAllStyles = function () {
    return Promise.all([
      figma.getLocalPaintStylesAsync(),
      figma.getLocalTextStylesAsync(),
      figma.getLocalEffectStylesAsync(),
      figma.getLocalGridStylesAsync(),
    ]).then(function (r) {
      return r[0].concat(r[1]).concat(r[2]).concat(r[3]);
    });
  };
}

// @UI_CONFIG_START
// # Render styles
var styleGroup = ""; // @placeholder="Text styles"
var previewText = "Sphinx of black quartz,\njudge my vow."; // @textarea @placeholder="Preview for text styles — Enter = soft line break"
// @UI_CONFIG_END

var renderStylesIncludeText = true;
var renderStylesIncludePaint = true;
var renderStylesIncludeEffect = true;
var renderStylesIncludeGrid = false;
var renderStylesMaxStyles = 600;
var renderStylesOverviewMinColumnWidth = 0;

/** Multiline preview for text styles (line-height testing). */
var RENDER_TEXT_PREVIEW_SAMPLE = "Sphinx of black quartz, \u2028judge my vow.";

/**
 * Radii for **filled** nodes only: swatch/box = `renderStylesRadiusInner`; style card = inner + `renderStylesRadiusStep`; root = `renderStylesRootCornerRadius`.
 */
var renderStylesRadiusInner = 8;
var renderStylesRadiusStep = 4;
/** Corner radius for the top-level overview frame (filled). */
var renderStylesRootCornerRadius = 20;

function rsRadiusInner() {
  return typeof renderStylesRadiusInner === "number" ? renderStylesRadiusInner : 8;
}

function rsRadiusStep() {
  return typeof renderStylesRadiusStep === "number" ? renderStylesRadiusStep : 4;
}

/** Filled style card: one step above inner swatch/box. */
function rsRadiusStyleCard() {
  return rsRadiusInner() + rsRadiusStep();
}

/**
 * Text shown in typography preview tiles. Uses **previewText** from UI; if blank, **RENDER_TEXT_PREVIEW_SAMPLE**.
 * Converts `\r\n`, `\r`, and `\n` from the textarea to **U+2028** (line separator) so Figma uses soft breaks, not paragraph breaks.
 */
function rsPreviewSampleString() {
  var raw = typeof previewText === "string" ? previewText : "";
  if (!String(raw).trim()) {
    raw = typeof RENDER_TEXT_PREVIEW_SAMPLE === "string" ? RENDER_TEXT_PREVIEW_SAMPLE : "Ag";
  }
  return String(raw)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\u2028");
}

function typeAllowed(styleType) {
  var t = styleType || "TEXT";
  if (t === "TEXT") return renderStylesIncludeText;
  if (t === "PAINT") return renderStylesIncludePaint;
  if (t === "EFFECT") return renderStylesIncludeEffect;
  if (t === "GRID") return renderStylesIncludeGrid;
  return false;
}

/** Same as style folders in Figma: split on `/` with flexible spaces. */
function stylePathSegments(name) {
  return String(name || "")
    .split(/\s*\/\s*/)
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s.length > 0;
    });
}

function renderStylesLayerName(s, maxLen) {
  var str = String(s || "");
  var m = typeof maxLen === "number" && maxLen > 4 ? maxLen : 72;
  if (str.length <= m) return str;
  return str.slice(0, m - 1) + "…";
}

function rsNormalizeWeightKey(lastSeg) {
  return String(lastSeg || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\-_]/g, "");
}

/**
 * Column order (left → right) for **last path segment** when it matches a common weight name.
 * Normal before Bold; unknown names sort after (900+) and then by first appearance.
 */
function rsLastSegmentColumnRank(lastSeg) {
  var order = [
    "thin",
    "ultralight",
    "extralight",
    "light",
    "regular",
    "normal",
    "book",
    "medium",
    "semibold",
    "demibold",
    "bold",
    "extrabold",
    "ultrabold",
    "black",
    "heavy"
  ];
  var n = rsNormalizeWeightKey(lastSeg);
  for (var oi = 0; oi < order.length; oi++) {
    if (n === order[oi]) return oi;
  }
  return 900;
}

/**
 * **1–2 segments:** `flatEntries` — vertical list (one row per style). Figma often uses **two** segments for a “single level” (`Library / 3xs`) without a weight column.
 * **3+ segments:** `colStacks[colKey]` — column = **last** segment; one horizontal row of vertical stacks. `colOrder` sorted by weight then first seen.
 */
function groupStylesColumnStacks(styles, figmaType) {
  var flatEntries = [];
  var colStacks = {};
  var colOrder = [];
  var colFirstIdx = {};
  var scanOrd = 0;

  for (var i = 0; i < styles.length; i++) {
    var st = styles[i];
    if (!st || st.type !== figmaType) continue;
    var segs = stylePathSegments(st.name);
    if (segs.length === 0) continue;
    if (segs.length <= 2) {
      flatEntries.push({ style: st });
      continue;
    }
    var colKey = segs[segs.length - 1];
    if (!colStacks[colKey]) {
      colStacks[colKey] = [];
      colOrder.push(colKey);
      colFirstIdx[colKey] = scanOrd;
    }
    colStacks[colKey].push({ style: st, _i: scanOrd });
    scanOrd += 1;
  }

  colOrder.sort(function (a, b) {
    var ra = rsLastSegmentColumnRank(a);
    var rb = rsLastSegmentColumnRank(b);
    if (ra !== rb) return ra - rb;
    return colFirstIdx[a] - colFirstIdx[b];
  });

  for (var ci = 0; ci < colOrder.length; ci++) {
    var ck = colOrder[ci];
    colStacks[ck].sort(function (x, y) {
      return x._i - y._i;
    });
  }

  return { flatEntries: flatEntries, colStacks: colStacks, colOrder: colOrder };
}

var _renderUiFont = { family: "Inter", style: "Regular" };
var _renderUiFontBold = { family: "Inter", style: "Bold" };

async function loadRenderUiFonts() {
  var candidates = [
    { family: "Inter", style: "Regular" },
    { family: "Roboto", style: "Regular" },
    { family: "Helvetica", style: "Regular" },
  ];
  for (var i = 0; i < candidates.length; i++) {
    try {
      await figma.loadFontAsync(candidates[i]);
      _renderUiFont = candidates[i];
      break;
    } catch (e) {}
  }
  var bolds = [
    { family: "Inter", style: "Bold" },
    { family: "Roboto", style: "Bold" },
    { family: "Helvetica", style: "Bold" },
  ];
  for (var b = 0; b < bolds.length; b++) {
    try {
      await figma.loadFontAsync(bolds[b]);
      _renderUiFontBold = bolds[b];
      return;
    } catch (e2) {}
  }
  _renderUiFontBold = _renderUiFont;
}

async function createTextPreviewCell(entry) {
  var style = entry.style;
  await figma.loadFontAsync(style.fontName);
  await loadRenderUiFonts();
  var cell = figma.createFrame();
  cell.name = "TEXT · " + renderStylesLayerName(style.name);
  cell.layoutMode = "VERTICAL";
  cell.primaryAxisSizingMode = "AUTO";
  cell.counterAxisSizingMode = "AUTO";
  cell.primaryAxisAlignItems = "MIN";
  cell.counterAxisAlignItems = "MIN";
  cell.itemSpacing = 6;
  cell.paddingLeft = 8;
  cell.paddingRight = 8;
  cell.paddingTop = 8;
  cell.paddingBottom = 8;
  cell.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  cell.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.91, b: 0.93 } }];
  cell.strokeWeight = 1;
  cell.cornerRadius = rsRadiusStyleCard();

  var cap = figma.createText();
  cap.fontName = _renderUiFont;
  cap.fontSize = 9;
  cap.fills = [{ type: "SOLID", color: { r: 0.45, g: 0.46, b: 0.5 } }];
  cap.characters = style.name;
  cap.textAutoResize = "WIDTH_AND_HEIGHT";
  cell.appendChild(cap);

  var sample = figma.createText();
  sample.fontName = style.fontName;
  var previewStr = rsPreviewSampleString();
  sample.characters = previewStr;
  await sample.setTextStyleIdAsync(style.id);
  sample.characters = previewStr;
  sample.textAutoResize = "WIDTH_AND_HEIGHT";
  cell.appendChild(sample);
  return cell;
}

async function createPaintPreviewCell(entry) {
  await loadRenderUiFonts();
  var cell = figma.createFrame();
  cell.name = "PAINT · " + renderStylesLayerName(entry.style.name);
  cell.layoutMode = "VERTICAL";
  cell.primaryAxisSizingMode = "AUTO";
  cell.counterAxisSizingMode = "AUTO";
  cell.itemSpacing = 6;
  cell.paddingLeft = 8;
  cell.paddingRight = 8;
  cell.paddingTop = 8;
  cell.paddingBottom = 8;
  cell.primaryAxisAlignItems = "CENTER";
  cell.counterAxisAlignItems = "CENTER";
  cell.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  cell.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.91, b: 0.93 } }];
  cell.strokeWeight = 1;
  cell.cornerRadius = rsRadiusStyleCard();

  var swatch = figma.createRectangle();
  swatch.resize(44, 44);
  swatch.cornerRadius = rsRadiusInner();
  swatch.strokes = [{ type: "SOLID", color: { r: 0.82, g: 0.84, b: 0.88 } }];
  swatch.strokeWeight = 1;
  await swatch.setFillStyleIdAsync(entry.style.id);
  cell.appendChild(swatch);

  var cap = figma.createText();
  cap.fontName = _renderUiFont;
  cap.fontSize = 9;
  cap.textAlignHorizontal = "CENTER";
  cap.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.41, b: 0.45 } }];
  cap.characters = entry.style.name;
  cell.appendChild(cap);
  return cell;
}

async function createEffectPreviewCell(entry) {
  await loadRenderUiFonts();
  var cell = figma.createFrame();
  cell.name = "EFFECT · " + renderStylesLayerName(entry.style.name);
  cell.layoutMode = "VERTICAL";
  cell.primaryAxisSizingMode = "AUTO";
  cell.counterAxisSizingMode = "AUTO";
  cell.itemSpacing = 6;
  cell.paddingLeft = 8;
  cell.paddingRight = 8;
  cell.paddingTop = 8;
  cell.paddingBottom = 8;
  cell.primaryAxisAlignItems = "CENTER";
  cell.counterAxisAlignItems = "CENTER";
  cell.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  cell.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.91, b: 0.93 } }];
  cell.strokeWeight = 1;
  cell.cornerRadius = rsRadiusStyleCard();

  var box = figma.createRectangle();
  box.resize(52, 52);
  box.cornerRadius = rsRadiusInner();
  box.fills = [{ type: "SOLID", color: { r: 0.93, g: 0.94, b: 0.96 } }];
  box.strokes = [{ type: "SOLID", color: { r: 0.78, g: 0.8, b: 0.85 } }];
  box.strokeWeight = 1;
  await box.setEffectStyleIdAsync(entry.style.id);
  cell.appendChild(box);

  var cap = figma.createText();
  cap.fontName = _renderUiFont;
  cap.fontSize = 9;
  cap.textAlignHorizontal = "CENTER";
  cap.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.41, b: 0.45 } }];
  cap.characters = entry.style.name;
  cell.appendChild(cap);
  return cell;
}

async function createGridPreviewCell(entry) {
  await loadRenderUiFonts();
  var cell = figma.createFrame();
  cell.name = "GRID · " + renderStylesLayerName(entry.style.name);
  cell.layoutMode = "VERTICAL";
  cell.primaryAxisSizingMode = "AUTO";
  cell.counterAxisSizingMode = "AUTO";
  cell.itemSpacing = 6;
  cell.primaryAxisAlignItems = "CENTER";
  cell.fills = [{ type: "SOLID", color: { r: 0.99, g: 0.99, b: 1 } }];
  cell.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.9, b: 0.94 } }];
  cell.strokeWeight = 1;
  cell.cornerRadius = rsRadiusStyleCard();
  cell.paddingLeft = 8;
  cell.paddingRight = 8;
  cell.paddingTop = 8;
  cell.paddingBottom = 8;

  var preview = figma.createFrame();
  preview.layoutMode = "NONE";
  preview.resize(72, 56);
  preview.cornerRadius = rsRadiusInner();
  preview.fills = [{ type: "SOLID", color: { r: 0.97, g: 0.97, b: 0.99 } }];
  preview.strokes = [{ type: "SOLID", color: { r: 0.85, g: 0.87, b: 0.91 } }];
  preview.strokeWeight = 1;
  if ("setGridStyleIdAsync" in preview) {
    await preview.setGridStyleIdAsync(entry.style.id);
  } else if (entry.style.layoutGrids && entry.style.layoutGrids.length) {
    try {
      preview.layoutGrids = JSON.parse(JSON.stringify(entry.style.layoutGrids));
    } catch (e) {}
  }
  cell.appendChild(preview);

  var cap = figma.createText();
  cap.fontName = _renderUiFont;
  cap.fontSize = 9;
  cap.textAlignHorizontal = "CENTER";
  cap.characters = entry.style.name;
  cell.appendChild(cap);
  return cell;
}

async function createCellForType(figmaType, entry) {
  if (figmaType === "TEXT") return createTextPreviewCell(entry);
  if (figmaType === "PAINT") return createPaintPreviewCell(entry);
  if (figmaType === "EFFECT") return createEffectPreviewCell(entry);
  if (figmaType === "GRID") return createGridPreviewCell(entry);
  return null;
}

/**
 * One section (Typography / Color / Effects).
 * **1–2 path segments:** vertical stack only. **3+ segments:** one **horizontal** `… · columns` frame; each child is a **vertical** column keyed by **last** segment (e.g. Normal, Bold).
 */
async function buildGroupedSection(sectionTitle, figmaType, styles, minColW) {
  var grouped = groupStylesColumnStacks(styles, figmaType);
  var flatEntries = grouped.flatEntries;
  var colStacks = grouped.colStacks;
  var colOrder = grouped.colOrder;

  if (flatEntries.length === 0 && colOrder.length === 0) return null;

  await loadRenderUiFonts();

  var section = figma.createFrame();
  section.name = sectionTitle;
  section.layoutMode = "VERTICAL";
  section.primaryAxisSizingMode = "AUTO";
  section.counterAxisSizingMode = "AUTO";
  section.itemSpacing = 16;
  section.paddingBottom = 8;
  section.fills = [];
  section.strokes = [];
  section.cornerRadius = 0;

  var title = figma.createText();
  title.fontName = _renderUiFontBold;
  title.fontSize = 13;
  title.fills = [{ type: "SOLID", color: { r: 0.12, g: 0.13, b: 0.16 } }];
  title.characters = sectionTitle;
  section.appendChild(title);

  if (flatEntries.length > 0) {
    var flatStack = figma.createFrame();
    flatStack.name = sectionTitle + " · flat (1–2 segments)";
    flatStack.layoutMode = "VERTICAL";
    flatStack.primaryAxisSizingMode = "AUTO";
    flatStack.counterAxisSizingMode = "AUTO";
    flatStack.itemSpacing = 8;
    flatStack.primaryAxisAlignItems = "MIN";
    flatStack.counterAxisAlignItems = "MIN";
    flatStack.fills = [];
    flatStack.strokes = [];
    flatStack.cornerRadius = 0;
    flatStack.paddingLeft = 0;
    flatStack.paddingRight = 0;
    flatStack.paddingTop = 0;
    flatStack.paddingBottom = 0;

    for (var fi = 0; fi < flatEntries.length; fi++) {
      try {
        var flatCell = await createCellForType(figmaType, flatEntries[fi]);
        if (flatCell) flatStack.appendChild(flatCell);
      } catch (e1) {
        var fn = flatEntries[fi] && flatEntries[fi].style && flatEntries[fi].style.name;
        console.log('⚠️ Skip cell "' + fn + '": ' + (e1 && e1.message));
      }
    }
    if (flatStack.children.length > 0) section.appendChild(flatStack);
  }

  if (colOrder.length > 0) {
    var columnsStrip = figma.createFrame();
    columnsStrip.name = sectionTitle + " · columns";
    columnsStrip.layoutMode = "HORIZONTAL";
    columnsStrip.primaryAxisSizingMode = "AUTO";
    columnsStrip.counterAxisSizingMode = "AUTO";
    columnsStrip.itemSpacing = 20;
    columnsStrip.primaryAxisAlignItems = "MIN";
    columnsStrip.counterAxisAlignItems = "MIN";
    columnsStrip.fills = [];
    columnsStrip.strokes = [];
    columnsStrip.cornerRadius = 0;
    columnsStrip.paddingLeft = 0;
    columnsStrip.paddingRight = 0;
    columnsStrip.paddingTop = 0;
    columnsStrip.paddingBottom = 0;

    for (var ci = 0; ci < colOrder.length; ci++) {
      var weightKey = colOrder[ci];
      var stack = colStacks[weightKey] || [];

      var colFrame = figma.createFrame();
      colFrame.name = renderStylesLayerName(weightKey, 96);
      colFrame.layoutMode = "VERTICAL";
      colFrame.primaryAxisSizingMode = "AUTO";
      colFrame.counterAxisSizingMode = "AUTO";
      colFrame.itemSpacing = 8;
      colFrame.primaryAxisAlignItems = "MIN";
      colFrame.counterAxisAlignItems = "MIN";
      colFrame.fills = [];
      colFrame.strokes = [];
      colFrame.cornerRadius = 0;
      colFrame.paddingLeft = 0;
      colFrame.paddingRight = 0;
      colFrame.paddingTop = 0;
      colFrame.paddingBottom = 0;
      if (minColW > 0 && "minWidth" in colFrame) {
        colFrame.minWidth = minColW;
      }

      for (var si = 0; si < stack.length; si++) {
        try {
          var stackCell = await createCellForType(figmaType, { style: stack[si].style });
          if (stackCell) colFrame.appendChild(stackCell);
        } catch (e2) {
          var sn = stack[si] && stack[si].style && stack[si].style.name;
          console.log('⚠️ Skip cell "' + sn + '": ' + (e2 && e2.message));
        }
      }

      if (colFrame.children.length > 0) columnsStrip.appendChild(colFrame);
    }

    if (columnsStrip.children.length > 0) section.appendChild(columnsStrip);
  }

  return section;
}

async function renderStylesMain() {
  var needle = String(styleGroup || "").trim().toLowerCase();
  var all = await getAllStyles();
  var filtered = all.filter(function (s) {
    if (!s || !s.name) return false;
    if (!typeAllowed(s.type)) return false;
    if (!needle) return true;
    return String(s.name).toLowerCase().indexOf(needle) !== -1;
  });

  if (filtered.length === 0) {
    figma.notify("No matching local styles — check filter or library source file");
    return;
  }

  var capped = false;
  if (filtered.length > renderStylesMaxStyles) {
    filtered = filtered.slice(0, renderStylesMaxStyles);
    capped = true;
  }

  var minW =
    typeof renderStylesOverviewMinColumnWidth === "number" && renderStylesOverviewMinColumnWidth > 0
      ? renderStylesOverviewMinColumnWidth
      : 0;

  await loadRenderUiFonts();

  // Replace existing top-level overview on re-run (avoid duplicates). Nested frames inside
  // **Design System Foundations** are not direct page children, so they are untouched.
  var pi;
  var pageKids = figma.currentPage.children;
  for (pi = pageKids.length - 1; pi >= 0; pi--) {
    var existing = pageKids[pi];
    if (existing.type === "FRAME" && existing.name === "Render styles — overview") {
      existing.remove();
    }
  }

  // Name must include "Render styles" so Replace styles priority-scans this subtree.
  var root = figma.createFrame();
  root.name = "Render styles — overview";
  root.layoutMode = "VERTICAL";
  root.primaryAxisSizingMode = "AUTO";
  root.counterAxisSizingMode = "AUTO";
  root.primaryAxisAlignItems = "MIN";
  root.counterAxisAlignItems = "MIN";
  root.paddingLeft = 28;
  root.paddingRight = 28;
  root.paddingTop = 28;
  root.paddingBottom = 28;
  root.itemSpacing = 28;
  root.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.985, b: 0.99 } }];
  root.strokes = [];
  root.cornerRadius =
    typeof renderStylesRootCornerRadius === "number" ? renderStylesRootCornerRadius : 20;

  var docTitle = figma.createText();
  docTitle.fontName = _renderUiFontBold;
  docTitle.fontSize = 18;
  docTitle.fills = [{ type: "SOLID", color: { r: 0.08, g: 0.09, b: 0.12 } }];
  docTitle.characters = "Styles overview";
  root.appendChild(docTitle);

  var docSub = figma.createText();
  docSub.fontName = _renderUiFont;
  docSub.fontSize = 11;
  docSub.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.44, b: 0.5 } }];
  docSub.characters =
    filtered.length +
    " local style(s)" +
    (needle ? ' matching "' + String(styleGroup).trim() + '"' : "") +
    (capped ? " — capped at " + renderStylesMaxStyles : "") +
    ". 1–2 path segments: vertical rows only. 3+ segments: horizontal “columns” frame; column = last segment (e.g. Normal | Bold). Hug. Full name in each tile.";
  root.appendChild(docSub);

  var secText = await buildGroupedSection("Typography — text styles", "TEXT", filtered, minW);
  if (secText) root.appendChild(secText);

  var secPaint = await buildGroupedSection("Color — paint styles", "PAINT", filtered, minW);
  if (secPaint) root.appendChild(secPaint);

  var secFx = await buildGroupedSection("Effects — effect styles", "EFFECT", filtered, minW);
  if (secFx) root.appendChild(secFx);

  var secGrid = await buildGroupedSection("Layout grids — grid styles", "GRID", filtered, minW);
  if (secGrid) root.appendChild(secGrid);

  figma.currentPage.appendChild(root);
  figma.currentPage.selection = [root];

  var nText = filtered.filter(function (s) { return s.type === "TEXT"; }).length;
  var nPaint = filtered.filter(function (s) { return s.type === "PAINT"; }).length;
  var nFx = filtered.filter(function (s) { return s.type === "EFFECT"; }).length;
  var nGrid = filtered.filter(function (s) { return s.type === "GRID"; }).length;

  figma.notify(
    "Rendered overview — Text " + nText + ", Paint " + nPaint + ", Effect " + nFx + (nGrid ? ", Grid " + nGrid : "")
  );
  console.log("✅ Render styles overview: " + filtered.length + " style(s)");
}

renderStylesMain().catch(function (err) {
  console.log("❌ " + (err && err.message));
  figma.notify("Render styles error — see console");
});
