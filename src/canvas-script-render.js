/**
 * Paint "Render on canvas" script cards.
 * Runs in the Figma plugin main (uses global `figma`). Loaded via __codefigMainRequire.
 *
 * Layout: fixed-width root (1728) → horizontal three columns that FILL equally
 * (Configuration UI | Documentation | Source). Inner text wrap width is derived from
 * that root; layers also FILL so they track column width.
 *
 * Text wrapping: pin wrap width with resize + textAutoResize HEIGHT after append —
 * FILL alone on Text produced width:0 / one-glyph-per-line stacks.
 */

var ROOT_WIDTH = 1728;
var COL_GAP = 40;
var ROOT_PAD = 40;

function contentInnerWidth() {
  return ROOT_WIDTH - ROOT_PAD * 2;
}

/** Equal share for one of three columns (gaps between them). */
function columnWrapWidth() {
  return Math.floor((contentInnerWidth() - COL_GAP * 2) / 3);
}

var COL_WIDTH = columnWrapWidth();
var PANEL_INNER = COL_WIDTH - 28;

var RGB = {
  ink: { r: 0.12, g: 0.12, b: 0.12 },
  secondary: { r: 0.2, g: 0.2, b: 0.2 },
  muted: { r: 0.4, g: 0.4, b: 0.4 },
  link: { r: 0.04, g: 0.41, b: 0.85 },
  codeBg: { r: 0.965, g: 0.973, b: 0.98 },
  codeText: { r: 0.14, g: 0.16, b: 0.18 },
  border: { r: 0.816, g: 0.843, b: 0.871 },
  borderLight: { r: 0.898, g: 0.906, b: 0.922 },
  tableHeader: { r: 0.965, g: 0.973, b: 0.98 },
  tableAlt: { r: 0.976, g: 0.98, b: 0.984 },
  white: { r: 1, g: 1, b: 1 },
  panelBg: { r: 0.97, g: 0.97, b: 0.97 },
  controlBg: { r: 1, g: 1, b: 1 },
  pillBg: { r: 0.93, g: 0.93, b: 0.94 },
  pillOn: { r: 0.88, g: 0.93, b: 1 },
  quoteBar: { r: 0.82, g: 0.84, b: 0.87 },
  rule: { r: 0.88, g: 0.88, b: 0.88 }
};

var HEADING_SIZES = { 1: 24, 2: 18, 3: 15, 4: 14, 5: 13, 6: 12 };

function createFrame(name) {
  var f = figma.createFrame();
  f.name = name || 'Frame';
  f.fills = [];
  f.strokes = [];
  f.clipsContent = false;
  return f;
}

function autoVertical(name, spacing, pad) {
  var f = createFrame(name);
  f.layoutMode = 'VERTICAL';
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'FIXED';
  f.itemSpacing = spacing == null ? 8 : spacing;
  var p = pad == null ? 0 : pad;
  f.paddingTop = p;
  f.paddingBottom = p;
  f.paddingLeft = p;
  f.paddingRight = p;
  return f;
}

function autoHorizontal(name, spacing) {
  var f = createFrame(name);
  f.layoutMode = 'HORIZONTAL';
  f.primaryAxisSizingMode = 'FIXED';
  f.counterAxisSizingMode = 'AUTO';
  f.itemSpacing = spacing == null ? 6 : spacing;
  f.counterAxisAlignItems = 'MIN';
  return f;
}

function hugHeight(node) {
  try {
    node.layoutSizingVertical = 'HUG';
  } catch (e) {
    /* ignore */
  }
}

function fillWidth(node) {
  try {
    node.layoutSizingHorizontal = 'FILL';
  } catch (e) {
    try {
      node.layoutAlign = 'STRETCH';
      node.layoutGrow = 1;
    } catch (e2) {
      /* ignore */
    }
  }
}

function fillHeight(node) {
  try {
    node.layoutSizingVertical = 'FILL';
  } catch (e) {
    try {
      node.layoutAlign = 'STRETCH';
    } catch (e2) {
      /* ignore */
    }
  }
}

/**
 * Pin the wrap width for a TextNode already in an auto-layout parent, then FILL
 * so it tracks the column if the root is resized later.
 */
function pinTextWrapWidth(textNode, width) {
  var w = Math.max(8, Math.floor(width));
  try {
    textNode.textAutoResize = 'NONE';
    textNode.resize(w, Math.max(textNode.height, 8));
    textNode.textAutoResize = 'HEIGHT';
  } catch (e) {
    try {
      textNode.textAutoResize = 'HEIGHT';
    } catch (e2) {
      /* ignore */
    }
  }
  fillWidth(textNode);
  hugHeight(textNode);
}

function createTextNode(chars, font, size, color) {
  var t = figma.createText();
  t.fontName = font;
  t.fontSize = size;
  t.characters = chars == null || chars === '' ? ' ' : String(chars);
  t.fills = [{ type: 'SOLID', color: color || RGB.ink }];
  t.textAutoResize = 'HEIGHT';
  return t;
}

function segmentsPlainText(segments) {
  if (!segments || !segments.length) return '';
  var s = '';
  for (var i = 0; i < segments.length; i++) s += String(segments[i].text || '');
  return s;
}

function truncateName(prefix, text) {
  var body = String(text || '').replace(/\s+/g, ' ').trim();
  if (body.length > 48) body = body.slice(0, 45) + '…';
  return prefix + (body ? ': ' + body : '');
}

function applyInlineSegments(textNode, segments, fonts, baseColor) {
  var list = Array.isArray(segments) ? segments : [{ text: String(segments || '') }];
  var full = '';
  for (var i = 0; i < list.length; i++) full += String(list[i].text || '');
  textNode.characters = full || ' ';
  textNode.fills = [{ type: 'SOLID', color: baseColor || RGB.secondary }];
  var cursor = 0;
  for (var j = 0; j < list.length; j++) {
    var seg = list[j];
    var len = String(seg.text || '').length;
    if (len <= 0) continue;
    var start = cursor;
    var end = cursor + len;
    cursor = end;
    var font = fonts.regular;
    if (seg.bold && seg.italic && fonts.boldItalic) font = fonts.boldItalic;
    else if (seg.bold && fonts.bold) font = fonts.bold;
    else if (seg.italic && fonts.italic) font = fonts.italic;
    else if (seg.code && fonts.mono) font = fonts.mono;
    try {
      textNode.setRangeFontName(start, end, font);
    } catch (e) {
      /* ignore */
    }
    var color = baseColor || RGB.secondary;
    if (seg.link) color = RGB.link;
    else if (seg.code) color = RGB.codeText;
    else if (seg.bold) color = RGB.ink;
    try {
      textNode.setRangeFills(start, end, [{ type: 'SOLID', color: color }]);
    } catch (e2) {
      /* ignore */
    }
    if (seg.strike) {
      try {
        textNode.setRangeTextDecoration(start, end, 'STRIKETHROUGH');
      } catch (e3) {
        /* ignore */
      }
    }
  }
}

function appendWrappedText(parent, chars, font, size, color, name, width) {
  var t = createTextNode(chars, font, size, color);
  t.name = name || 'P';
  parent.appendChild(t);
  pinTextWrapWidth(t, width);
  return t;
}

function appendSegmentText(parent, segments, fonts, size, color, name, width) {
  var t = createTextNode(' ', fonts.regular, size, color);
  t.name = name || 'P';
  applyInlineSegments(t, segments, fonts, color);
  parent.appendChild(t);
  pinTextWrapWidth(t, width);
  return t;
}

function appendRule(parent, width) {
  var hr = createFrame('Rectangle 1');
  hr.resize(Math.max(8, width), 1);
  hr.fills = [{ type: 'SOLID', color: RGB.rule }];
  parent.appendChild(hr);
  fillWidth(hr);
  hugHeight(hr);
  return hr;
}

function renderHr(parent, width) {
  var hr = createFrame('HR');
  hr.resize(Math.max(8, width), 1);
  hr.fills = [{ type: 'SOLID', color: RGB.border }];
  parent.appendChild(hr);
  fillWidth(hr);
  hugHeight(hr);
}

function renderCodeBlock(parent, block, fonts, width) {
  var wrap = autoVertical(truncateName('PRE', block.lang || 'code'), 4, 12);
  wrap.resize(width, 40);
  wrap.fills = [{ type: 'SOLID', color: RGB.codeBg }];
  wrap.strokes = [{ type: 'SOLID', color: RGB.borderLight }];
  wrap.strokeWeight = 1;
  wrap.cornerRadius = 6;
  var font = fonts.mono || fonts.regular;
  appendWrappedText(wrap, String(block.text || ''), font, 12, RGB.codeText, 'CODE', width - 24);
  parent.appendChild(wrap);
  fillWidth(wrap);
  hugHeight(wrap);
}

function cellAsSegments(cell, forceBold) {
  var segs;
  if (Array.isArray(cell)) segs = cell.length ? cell.slice() : [{ text: '' }];
  else if (cell == null) segs = [{ text: '' }];
  else segs = [{ text: String(cell) }];
  if (!forceBold) return segs;
  var out = [];
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i] || {};
    out.push({
      text: s.text || '',
      bold: true,
      italic: !!s.italic,
      code: !!s.code,
      link: s.link,
      strike: !!s.strike
    });
  }
  return out;
}

function tableTitle(header) {
  var cells = header || [];
  var parts = [];
  for (var i = 0; i < cells.length; i++) {
    parts.push(segmentsPlainText(cellAsSegments(cells[i], false)));
  }
  return parts.join(' | ');
}

function renderTable(parent, block, fonts, width) {
  var table = autoVertical(truncateName('TABLE', tableTitle(block.header)), 0, 0);
  table.resize(width, 40);
  table.strokes = [{ type: 'SOLID', color: RGB.border }];
  table.strokeWeight = 1;
  table.cornerRadius = 4;
  table.clipsContent = true;

  function addRow(cells, header, alt) {
    var row = autoHorizontal(header ? 'TR-H' : 'TR', 0);
    row.resize(width, 28);
    row.primaryAxisSizingMode = 'FIXED';
    row.fills = [
      {
        type: 'SOLID',
        color: header ? RGB.tableHeader : alt ? RGB.tableAlt : RGB.white
      }
    ];
    var cols = cells && cells.length ? cells : [[{ text: '' }]];
    var colW = Math.max(40, Math.floor(width / cols.length));
    var cellFonts = header
      ? {
          regular: fonts.bold || fonts.regular,
          bold: fonts.bold,
          italic: fonts.italic,
          boldItalic: fonts.boldItalic,
          mono: fonts.mono
        }
      : fonts;
    for (var i = 0; i < cols.length; i++) {
      var cell = autoVertical('TD', 0, 0);
      cell.paddingTop = 6;
      cell.paddingBottom = 6;
      cell.paddingLeft = 8;
      cell.paddingRight = 8;
      cell.resize(colW, 20);
      appendSegmentText(
        cell,
        cellAsSegments(cols[i], !!header),
        cellFonts,
        12,
        header ? RGB.ink : RGB.secondary,
        'CELL',
        colW - 16
      );
      row.appendChild(cell);
      fillWidth(cell);
      hugHeight(cell);
    }
    table.appendChild(row);
    fillWidth(row);
    hugHeight(row);
  }

  addRow(block.header || [], true, false);
  var rows = block.rows || [];
  for (var r = 0; r < rows.length; r++) addRow(rows[r], false, r % 2 === 1);
  parent.appendChild(table);
  fillWidth(table);
  hugHeight(table);
}

/** One TextNode per item (`• body`), not a MARK + LI-TEXT auto-layout row. */
function renderList(parent, block, fonts, width) {
  var list = autoVertical(block.ordered ? 'OL' : 'UL', 6, 0);
  list.resize(width, 20);
  var items = block.items || [];
  var start = typeof block.start === 'number' ? block.start : 1;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var marker = '• ';
    if (item.task) marker = item.checked ? '☑ ' : '☐ ';
    else if (block.ordered) marker = String(start + i) + '. ';
    var body = item.segments && item.segments.length
      ? item.segments
      : [{ text: item.text || '' }];
    var segs = [{ text: marker }].concat(body);
    appendSegmentText(list, segs, fonts, 13, RGB.secondary, 'LI', width);
  }
  parent.appendChild(list);
  fillWidth(list);
  hugHeight(list);
}

function renderBlockquote(parent, block, fonts, width) {
  var row = autoHorizontal(truncateName('BLOCKQUOTE', segmentsPlainText(block.segments)), 10);
  row.resize(width, 20);
  row.primaryAxisSizingMode = 'FIXED';
  row.fills = [{ type: 'SOLID', color: RGB.codeBg }];
  row.paddingTop = 8;
  row.paddingBottom = 8;
  row.paddingLeft = 0;
  row.paddingRight = 12;
  row.cornerRadius = 4;
  var bar = createFrame('BAR');
  bar.resize(3, 20);
  bar.fills = [{ type: 'SOLID', color: RGB.quoteBar }];
  row.appendChild(bar);
  try {
    bar.layoutSizingVertical = 'FILL';
  } catch (e) {
    /* ignore */
  }
  appendSegmentText(row, block.segments, fonts, 13, RGB.muted, 'QUOTE', width - 28);
  parent.appendChild(row);
  hugHeight(row);
}

function renderMarkdownInto(parent, blocks, fonts, width) {
  var w = width == null ? COL_WIDTH : width;
  var list = Array.isArray(blocks) ? blocks : [];
  if (!list.length) return;
  var stack = autoVertical('Documentation body', 16, 0);
  stack.resize(w, 40);
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    if (!b || !b.type) continue;
    if (b.type === 'heading') {
      var depth = Math.min(6, Math.max(1, b.depth || 1));
      var size = HEADING_SIZES[depth] || 14;
      var font = depth <= 2 ? fonts.bold : fonts.bold || fonts.regular;
      appendSegmentText(
        stack,
        b.segments || [{ text: b.text || '' }],
        {
          regular: font,
          bold: fonts.bold,
          italic: fonts.italic,
          boldItalic: fonts.boldItalic,
          mono: fonts.mono
        },
        size,
        RGB.ink,
        truncateName('H' + depth, segmentsPlainText(b.segments) || b.text),
        w
      );
      continue;
    }
    if (b.type === 'paragraph') {
      appendSegmentText(
        stack,
        b.segments || [{ text: b.text || '' }],
        fonts,
        13,
        RGB.secondary,
        truncateName('P', segmentsPlainText(b.segments) || b.text),
        w
      );
      continue;
    }
    if (b.type === 'hr') {
      renderHr(stack, w);
      continue;
    }
    if (b.type === 'code') {
      renderCodeBlock(stack, b, fonts, w);
      continue;
    }
    if (b.type === 'table') {
      renderTable(stack, b, fonts, w);
      continue;
    }
    if (b.type === 'list') {
      renderList(stack, b, fonts, w);
      continue;
    }
    if (b.type === 'blockquote') {
      renderBlockquote(stack, b, fonts, w);
      continue;
    }
  }
  parent.appendChild(stack);
  fillWidth(stack);
  hugHeight(stack);
}

function appendPill(parent, label, fonts, selected) {
  var pill = autoHorizontal('OPT', 0);
  pill.paddingTop = 5;
  pill.paddingBottom = 5;
  pill.paddingLeft = 10;
  pill.paddingRight = 10;
  pill.cornerRadius = 12;
  pill.fills = [{ type: 'SOLID', color: selected ? RGB.pillOn : RGB.pillBg }];
  pill.strokes = [{ type: 'SOLID', color: RGB.borderLight }];
  pill.strokeWeight = 1;
  var t = createTextNode(String(label), fonts.regular, 11, RGB.secondary);
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  pill.appendChild(t);
  parent.appendChild(pill);
  hugHeight(pill);
}

function fieldControlFrame(row, fonts, controlWidth) {
  var isChoice =
    (row.radio || row.inputType === 'radio' || row.inputType === 'multi' || row.multi) &&
    row.options &&
    row.options.length;
  if (isChoice) {
    var pills = autoHorizontal('OPTIONS', 6);
    try {
      pills.layoutWrap = 'WRAP';
    } catch (e) {
      /* ignore */
    }
    pills.primaryAxisSizingMode = 'FIXED';
    pills.counterAxisSizingMode = 'AUTO';
    pills.resize(controlWidth, 28);
    var opts = row.options.slice(0, 8);
    var current = String(row.value || '');
    for (var i = 0; i < opts.length; i++) {
      var opt = String(opts[i]);
      var selected = current === opt || current.split(/,\s*/).indexOf(opt) !== -1;
      appendPill(pills, opt, fonts, selected);
    }
    return pills;
  }
  var box = autoHorizontal('CONTROL', 0);
  box.resize(controlWidth, 28);
  box.primaryAxisSizingMode = 'FIXED';
  box.paddingTop = 6;
  box.paddingBottom = 6;
  box.paddingLeft = 10;
  box.paddingRight = 10;
  box.cornerRadius = 6;
  box.fills = [{ type: 'SOLID', color: RGB.controlBg }];
  box.strokes = [{ type: 'SOLID', color: RGB.border }];
  box.strokeWeight = 1;
  appendWrappedText(box, String(row.value || '') || '—', fonts.regular, 11, RGB.muted, 'VAL', controlWidth - 20);
  return box;
}

function renderPanelMockInto(parent, panelRows, fonts, width) {
  var w = width == null ? COL_WIDTH : width;
  var rows = Array.isArray(panelRows) ? panelRows : [];
  var panel = autoVertical('Configuration UI mock', 12, 14);
  panel.resize(w, 80);
  panel.fills = [{ type: 'SOLID', color: RGB.panelBg }];
  panel.strokes = [{ type: 'SOLID', color: RGB.borderLight }];
  panel.strokeWeight = 1;
  panel.cornerRadius = 8;
  var inner = w - 28;
  var labelW = 140;
  var controlW = Math.max(80, inner - labelW - 12);

  if (!rows.length) {
    appendWrappedText(panel, 'No form fields to preview.', fonts.regular, 12, RGB.muted, 'EMPTY', inner);
    parent.appendChild(panel);
    fillWidth(panel);
    hugHeight(panel);
    return;
  }

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || !row.type) continue;
    if (row.type === 'heading') {
      var hs = row.level <= 1 ? 15 : 13;
      appendWrappedText(panel, String(row.text || ''), fonts.bold, hs, RGB.ink, truncateName('H', row.text), inner);
      continue;
    }
    if (row.type === 'paragraph') {
      appendWrappedText(panel, String(row.text || ''), fonts.regular, 11, RGB.muted, truncateName('P', row.text), inner);
      continue;
    }
    if (row.type === 'divider') {
      var div = createFrame('HR');
      div.resize(inner, row.section ? 2 : 1);
      div.fills = [{ type: 'SOLID', color: row.section ? RGB.border : RGB.borderLight }];
      panel.appendChild(div);
      hugHeight(div);
      continue;
    }
    if (row.type === 'chips') {
      var chipBlock = autoVertical(truncateName('CHIPS', row.label), 6, 0);
      chipBlock.resize(inner, 20);
      appendWrappedText(chipBlock, String(row.label || 'Modes'), fonts.regular, 11, RGB.muted, 'LABEL', inner);
      var chipWrap = autoHorizontal('CHIPS-ROW', 6);
      try {
        chipWrap.layoutWrap = 'WRAP';
      } catch (e) {
        /* ignore */
      }
      chipWrap.primaryAxisSizingMode = 'FIXED';
      chipWrap.resize(inner, 28);
      var chips = row.chips && row.chips.length ? row.chips : ['(none)'];
      for (var c = 0; c < Math.min(chips.length, 8); c++) {
        appendPill(chipWrap, chips[c], fonts, false);
      }
      chipBlock.appendChild(chipWrap);
      hugHeight(chipWrap);
      panel.appendChild(chipBlock);
      hugHeight(chipBlock);
      continue;
    }
    if (row.type === 'placeholder') {
      var ph = autoHorizontal(truncateName('PLACEHOLDER', row.label), 8);
      ph.paddingTop = 10;
      ph.paddingBottom = 10;
      ph.paddingLeft = 12;
      ph.paddingRight = 12;
      ph.cornerRadius = 6;
      ph.fills = [{ type: 'SOLID', color: RGB.white }];
      ph.strokes = [{ type: 'SOLID', color: RGB.borderLight }];
      ph.strokeWeight = 1;
      var phL = createTextNode(String(row.label || ''), fonts.regular, 11, RGB.muted);
      phL.textAutoResize = 'WIDTH_AND_HEIGHT';
      ph.appendChild(phL);
      var phH = createTextNode(String(row.hint || ''), fonts.bold, 11, RGB.secondary);
      phH.textAutoResize = 'WIDTH_AND_HEIGHT';
      ph.appendChild(phH);
      panel.appendChild(ph);
      hugHeight(ph);
      continue;
    }
    if (row.type === 'field') {
      var field = autoHorizontal(truncateName('FIELD', row.label), 12);
      field.resize(inner, 28);
      field.primaryAxisSizingMode = 'FIXED';
      field.counterAxisAlignItems = 'CENTER';
      var lab = createTextNode(String(row.label || ''), fonts.regular, 12, RGB.secondary);
      lab.textAutoResize = 'NONE';
      lab.resize(labelW, 16);
      lab.textAutoResize = 'HEIGHT';
      field.appendChild(lab);
      hugHeight(lab);
      var control = fieldControlFrame(row, fonts, controlW);
      field.appendChild(control);
      fillWidth(control);
      hugHeight(control);
      panel.appendChild(field);
      fillWidth(field);
      hugHeight(field);
      continue;
    }
  }
  parent.appendChild(panel);
  fillWidth(panel);
  hugHeight(panel);
}

function sectionColumn(title, fonts, wrapW) {
  var w = wrapW == null ? columnWrapWidth() : wrapW;
  var col = autoVertical(title + ' column', 16, 0);
  col.resize(Math.max(40, w), 40);
  appendWrappedText(col, title, fonts.bold, 14, RGB.ink, title, w);
  appendRule(col, w);
  return col;
}

var SCRIPT_CARD_MAIN_NAME = '{Script name}';
var SCRIPT_CARD_PLUGIN_KEY = 'scriptCardMain';

function findScriptCardMain() {
  try {
    var nodes = figma.root.findAllWithCriteria
      ? figma.root.findAllWithCriteria({ types: ['COMPONENT'] })
      : [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n) continue;
      try {
        if (n.getPluginData && n.getPluginData(SCRIPT_CARD_PLUGIN_KEY) === '1') return n;
      } catch (e) {
        /* ignore */
      }
      if (n.name === SCRIPT_CARD_MAIN_NAME) return n;
    }
  } catch (e2) {
    /* ignore */
  }
  return null;
}

function makeSlot(component, name) {
  var slot = null;
  try {
    if (component && typeof component.createSlot === 'function') {
      slot = component.createSlot();
    }
  } catch (e) {
    slot = null;
  }
  if (!slot) {
    slot = createFrame(name);
    slot.layoutMode = 'VERTICAL';
    slot.itemSpacing = 8;
  }
  slot.name = name;
  try {
    slot.layoutMode = 'VERTICAL';
    slot.primaryAxisSizingMode = 'AUTO';
    slot.counterAxisSizingMode = 'FIXED';
  } catch (e2) {
    /* ignore */
  }
  return slot;
}

/** Slots must HUG content height (not FIXED / FILL). */
function hugSlot(slot) {
  if (!slot) return;
  try {
    slot.primaryAxisSizingMode = 'AUTO';
  } catch (e) {
    /* ignore */
  }
  hugHeight(slot);
  try {
    slot.layoutSizingVertical = 'HUG';
  } catch (e2) {
    /* ignore */
  }
}

function fixScriptCardMainSlots(main) {
  if (!main) return;
  var names = ['Configuration UI Slot', 'Documentation slot'];
  for (var i = 0; i < names.length; i++) {
    hugSlot(findNamed(main, names[i]));
  }
}

/**
 * Shared card chrome: title + 3 columns (Config slot | Docs slot | SRC).
 * Created once per file; instances carry per-script content + SRC binding.
 */
function ensureScriptCardMain(fonts) {
  var existing = findScriptCardMain();
  if (existing) {
    fixScriptCardMainSlots(existing);
    return existing;
  }

  var wrapW = columnWrapWidth();
  var ink = RGB.ink;
  var mono = fonts.mono || fonts.regular;

  var comp = figma.createComponent();
  comp.name = SCRIPT_CARD_MAIN_NAME;
  try {
    comp.setPluginData(SCRIPT_CARD_PLUGIN_KEY, '1');
  } catch (e) {
    /* ignore */
  }
  comp.layoutMode = 'VERTICAL';
  comp.primaryAxisSizingMode = 'AUTO';
  comp.counterAxisSizingMode = 'FIXED';
  comp.itemSpacing = 40;
  comp.paddingTop = ROOT_PAD;
  comp.paddingBottom = ROOT_PAD;
  comp.paddingLeft = ROOT_PAD;
  comp.paddingRight = ROOT_PAD;
  comp.resize(ROOT_WIDTH, 100);
  comp.fills = [{ type: 'SOLID', color: RGB.white }];
  comp.strokes = [{ type: 'SOLID', color: RGB.borderLight }];
  comp.strokeWeight = 1;
  comp.cornerRadius = 8;

  var title = createTextNode('Script name', fonts.bold, 28, ink);
  title.name = 'Title';
  comp.appendChild(title);
  pinTextWrapWidth(title, contentInnerWidth());

  var columns = autoHorizontal('Columns', COL_GAP);
  columns.resize(contentInnerWidth(), 40);
  columns.counterAxisAlignItems = 'MIN';

  var configCol = sectionColumn('Configuration UI', fonts, wrapW);
  var configSlot = makeSlot(comp, 'Configuration UI Slot');
  configSlot.resize(wrapW, 40);
  configCol.appendChild(configSlot);
  fillWidth(configSlot);
  hugSlot(configSlot);
  columns.appendChild(configCol);
  fillWidth(configCol);
  hugHeight(configCol);

  var docsCol = sectionColumn('Documentation', fonts, wrapW);
  var docsSlot = makeSlot(comp, 'Documentation slot');
  docsSlot.resize(wrapW, 40);
  docsCol.appendChild(docsSlot);
  fillWidth(docsSlot);
  hugSlot(docsSlot);
  columns.appendChild(docsCol);
  fillWidth(docsCol);
  hugHeight(docsCol);

  var sourceCol = sectionColumn('Source code', fonts, wrapW);
  var src = createTextNode(' ', mono, 11, ink);
  src.name = 'SRC';
  sourceCol.appendChild(src);
  pinTextWrapWidth(src, wrapW);
  fillHeight(src);
  try {
    src.textTruncation = 'ENDING';
  } catch (e3) {
    /* ignore */
  }
  columns.appendChild(sourceCol);
  fillWidth(sourceCol);
  fillHeight(sourceCol);

  comp.appendChild(columns);
  fillWidth(columns);
  hugHeight(columns);
  hugHeight(comp);
  // Park the main off the content grid; instances are what users copy.
  try {
    comp.x = -ROOT_WIDTH - 200;
    comp.y = 0;
  } catch (e4) {
    /* ignore */
  }
  return comp;
}

function findNamed(node, name) {
  if (!node || typeof node.findOne !== 'function') return null;
  return node.findOne(function (n) {
    return n && n.name === name;
  });
}

function clearSlotChildren(slot) {
  if (!slot || !slot.children) return;
  var kids = slot.children.slice();
  for (var i = 0; i < kids.length; i++) {
    try {
      kids[i].remove();
    } catch (e) {
      /* ignore */
    }
  }
}

/**
 * Instance of the shared card; paints Config/Docs into slots; returns
 * { instance, srcNode } so the caller can bind SRC to the script STRING var.
 */
function renderScriptCard(script, fonts, x, y) {
  var muted = RGB.muted;
  var wrapW = columnWrapWidth();
  var main = ensureScriptCardMain(fonts);
  var instance = main.createInstance();
  instance.name = script.name || 'Script';
  instance.x = x;
  instance.y = y;

  var title = findNamed(instance, 'Title');
  if (title && title.type === 'TEXT') {
    try {
      title.characters = String(script.name || 'Untitled');
      pinTextWrapWidth(title, contentInnerWidth());
    } catch (e) {
      /* ignore */
    }
  }

  var configSlot = findNamed(instance, 'Configuration UI Slot');
  if (configSlot) {
    clearSlotChildren(configSlot);
    var panelRows = Array.isArray(script.panelRows) ? script.panelRows : [];
    if (panelRows.length) {
      renderPanelMockInto(configSlot, panelRows, fonts, wrapW);
    } else {
      appendWrappedText(
        configSlot,
        String(script.uiSummary || '').trim() ||
          'Open this script in CodeFig to use its Configuration UI.',
        fonts.regular,
        12,
        muted,
        'UI note',
        wrapW
      );
    }
    fillWidth(configSlot);
    hugSlot(configSlot);
  }

  var docsSlot = findNamed(instance, 'Documentation slot');
  if (docsSlot) {
    clearSlotChildren(docsSlot);
    var docsBlocks = Array.isArray(script.docsBlocks) ? script.docsBlocks : [];
    if (docsBlocks.length) {
      renderMarkdownInto(docsSlot, docsBlocks, fonts, wrapW);
    } else {
      var docs =
        String(script.docs || '').trim() || '(No documentation block in this script.)';
      appendWrappedText(docsSlot, docs, fonts.regular, 12, muted, 'Docs', wrapW);
    }
    fillWidth(docsSlot);
    hugSlot(docsSlot);
  }

  var src = findNamed(instance, 'SRC');
  if (src && src.type === 'TEXT') {
    try {
      // Bound value wins after setBoundVariable; set characters as fallback / before bind.
      src.characters = String(script.code || '') || ' ';
      pinTextWrapWidth(src, wrapW);
      fillHeight(src);
      try {
        src.textTruncation = 'ENDING';
      } catch (e2) {
        /* ignore */
      }
    } catch (e3) {
      /* ignore */
    }
  }

  hugHeight(instance);
  // Stash for the sandbox binder (code.ts).
  instance.setPluginData('codefigSrcReady', src ? '1' : '0');
  return instance;
}

function findSrcNode(card) {
  return findNamed(card, 'SRC');
}

module.exports = {
  COL_WIDTH: columnWrapWidth(),
  ROOT_WIDTH: ROOT_WIDTH,
  CONTENT_WIDTH: columnWrapWidth(),
  PANEL_WIDTH: columnWrapWidth(),
  SCRIPT_CARD_MAIN_NAME: SCRIPT_CARD_MAIN_NAME,
  renderMarkdownInto: renderMarkdownInto,
  renderPanelMockInto: renderPanelMockInto,
  renderScriptCard: renderScriptCard,
  ensureScriptCardMain: ensureScriptCardMain,
  findSrcNode: findSrcNode,
  segmentsPlainText: segmentsPlainText,
  pinTextWrapWidth: pinTextWrapWidth
};
