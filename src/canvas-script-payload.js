/**
 * Pure helpers: turn marked lexer tokens + config-ui schema rows into the
 * JSON the sandbox paints for "Render on canvas". No Figma, no DOM.
 *
 * Caps keep huge Help docs / DSF panels from stalling the plugin.
 */

var MAX_DOC_BLOCKS = 80;
var MAX_DOC_CHARS = 12000;
var MAX_PANEL_ROWS = 50;

/**
 * Flatten marked inline tokens into { text, bold?, italic?, code?, link?, strike? }.
 */
function inlineSegmentsFromTokens(tokens, flags) {
  var out = [];
  var list = Array.isArray(tokens) ? tokens : [];
  var base = flags || {};
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    if (!t || !t.type) continue;
    if (t.type === 'text') {
      if (t.tokens && t.tokens.length) {
        out = out.concat(inlineSegmentsFromTokens(t.tokens, base));
      } else if (t.text) {
        out.push({
          text: String(t.text),
          bold: !!base.bold,
          italic: !!base.italic,
          code: !!base.code,
          link: base.link || undefined,
          strike: !!base.strike
        });
      }
      continue;
    }
    if (t.type === 'strong') {
      out = out.concat(
        inlineSegmentsFromTokens(t.tokens || [{ type: 'text', text: t.text || '' }], {
          bold: true,
          italic: !!base.italic,
          code: !!base.code,
          link: base.link,
          strike: !!base.strike
        })
      );
      continue;
    }
    if (t.type === 'em') {
      out = out.concat(
        inlineSegmentsFromTokens(t.tokens || [{ type: 'text', text: t.text || '' }], {
          bold: !!base.bold,
          italic: true,
          code: !!base.code,
          link: base.link,
          strike: !!base.strike
        })
      );
      continue;
    }
    if (t.type === 'codespan') {
      out.push({
        text: String(t.text || ''),
        bold: !!base.bold,
        italic: !!base.italic,
        code: true,
        link: base.link,
        strike: !!base.strike
      });
      continue;
    }
    if (t.type === 'del') {
      out = out.concat(
        inlineSegmentsFromTokens(t.tokens || [{ type: 'text', text: t.text || '' }], {
          bold: !!base.bold,
          italic: !!base.italic,
          code: !!base.code,
          link: base.link,
          strike: true
        })
      );
      continue;
    }
    if (t.type === 'link') {
      out = out.concat(
        inlineSegmentsFromTokens(t.tokens || [{ type: 'text', text: t.text || t.href || '' }], {
          bold: !!base.bold,
          italic: !!base.italic,
          code: !!base.code,
          link: t.href ? String(t.href) : true,
          strike: !!base.strike
        })
      );
      continue;
    }
    if (t.type === 'br') {
      out.push({ text: '\n', bold: !!base.bold, italic: !!base.italic });
      continue;
    }
    if (t.text) {
      out.push({
        text: String(t.text),
        bold: !!base.bold,
        italic: !!base.italic,
        code: !!base.code,
        link: base.link,
        strike: !!base.strike
      });
    }
  }
  return out;
}

function segmentsFromToken(token) {
  if (!token) return [{ text: '' }];
  if (token.tokens && token.tokens.length) {
    var segs = inlineSegmentsFromTokens(token.tokens, {});
    return segs.length ? segs : [{ text: String(token.text || '') }];
  }
  return [{ text: String(token.text || '') }];
}

/**
 * Table cells from marked are objects with `tokens` (inline). Prefer those so
 * `**bold**` becomes a bold segment rather than literal asterisks in `.text`.
 */
function cellSegments(cell) {
  if (cell == null) return [{ text: '' }];
  if (typeof cell === 'string') return [{ text: cell }];
  if (Array.isArray(cell)) {
    return cell.length ? cell : [{ text: '' }];
  }
  if (cell.tokens && cell.tokens.length) {
    var segs = inlineSegmentsFromTokens(cell.tokens, {});
    return segs.length ? segs : [{ text: String(cell.text || '') }];
  }
  if (cell.text != null) return [{ text: String(cell.text) }];
  return [{ text: '' }];
}

function segmentsCharCount(segments) {
  var n = 0;
  var list = Array.isArray(segments) ? segments : [];
  for (var i = 0; i < list.length; i++) n += String(list[i].text || '').length;
  return n;
}

/**
 * @param {Array} tokens - marked.lexer output
 * @returns {Array} canvas doc blocks
 */
function docsTokensToBlocks(tokens) {
  var out = [];
  var chars = 0;
  var list = Array.isArray(tokens) ? tokens : [];

  function push(block) {
    if (out.length >= MAX_DOC_BLOCKS || chars >= MAX_DOC_CHARS) return false;
    var estimate = 0;
    if (block.segments) {
      for (var s = 0; s < block.segments.length; s++) {
        estimate += String(block.segments[s].text || '').length;
      }
    }
    if (block.text) estimate += String(block.text).length;
    if (block.items) {
      for (var i = 0; i < block.items.length; i++) {
        var it = block.items[i];
        if (it.segments) {
          for (var j = 0; j < it.segments.length; j++) {
            estimate += String(it.segments[j].text || '').length;
          }
        } else if (it.text) estimate += String(it.text).length;
      }
    }
    if (block.header) {
      for (var h = 0; h < block.header.length; h++) {
        var hc = block.header[h];
        estimate += Array.isArray(hc) ? segmentsCharCount(hc) : String(hc || '').length;
      }
    }
    if (block.rows) {
      for (var r = 0; r < block.rows.length; r++) {
        var row = block.rows[r] || [];
        for (var c = 0; c < row.length; c++) {
          var cell = row[c];
          estimate += Array.isArray(cell) ? segmentsCharCount(cell) : String(cell || '').length;
        }
      }
    }
    if (chars + estimate > MAX_DOC_CHARS && out.length > 0) return false;
    chars += estimate;
    out.push(block);
    return out.length < MAX_DOC_BLOCKS && chars < MAX_DOC_CHARS;
  }

  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    if (!t || !t.type || t.type === 'space') continue;
    if (t.type === 'heading') {
      if (!push({ type: 'heading', depth: t.depth || 1, segments: segmentsFromToken(t) })) break;
      continue;
    }
    if (t.type === 'paragraph') {
      if (!push({ type: 'paragraph', segments: segmentsFromToken(t) })) break;
      continue;
    }
    if (t.type === 'blockquote') {
      var bqSegs = t.tokens && t.tokens.length
        ? (function () {
            var segs = [];
            for (var bi = 0; bi < t.tokens.length; bi++) {
              if (t.tokens[bi].type === 'paragraph' || t.tokens[bi].type === 'text') {
                segs = segs.concat(segmentsFromToken(t.tokens[bi]));
              } else if (t.tokens[bi].text) {
                segs.push({ text: String(t.tokens[bi].text) });
              }
            }
            return segs.length ? segs : [{ text: String(t.text || '') }];
          })()
        : [{ text: String(t.text || '') }];
      if (!push({ type: 'blockquote', segments: bqSegs })) break;
      continue;
    }
    if (t.type === 'code') {
      if (!push({ type: 'code', text: String(t.text || ''), lang: t.lang ? String(t.lang) : '' })) break;
      continue;
    }
    if (t.type === 'hr') {
      if (!push({ type: 'hr' })) break;
      continue;
    }
    if (t.type === 'list') {
      var items = [];
      var rawItems = Array.isArray(t.items) ? t.items : [];
      for (var li = 0; li < rawItems.length; li++) {
        var item = rawItems[li];
        var itemSegs = [];
        if (item && item.tokens) {
          for (var ti = 0; ti < item.tokens.length; ti++) {
            itemSegs = itemSegs.concat(segmentsFromToken(item.tokens[ti]));
          }
        }
        if (!itemSegs.length) itemSegs = [{ text: String((item && item.text) || '') }];
        items.push({
          segments: itemSegs,
          task: !!(item && item.task),
          checked: !!(item && item.checked)
        });
      }
      if (
        !push({
          type: 'list',
          ordered: !!t.ordered,
          start: typeof t.start === 'number' ? t.start : 1,
          items: items
        })
      ) {
        break;
      }
      continue;
    }
    if (t.type === 'table') {
      var header = (t.header || []).map(cellSegments);
      var rows = (t.rows || []).map(function (row) {
        return (row || []).map(cellSegments);
      });
      if (!push({ type: 'table', header: header, rows: rows })) break;
      continue;
    }
  }
  return out;
}

function stringifyPanelValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map(function (v) {
        if (v == null) return '';
        if (typeof v === 'object' && v.name != null) return String(v.name);
        return String(v);
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return '';
    }
  }
  return String(value);
}

/**
 * @param {Array} rows - CodeFigConfigUI.parse(...).rows
 * @returns {Array} slim panel mock rows
 */
function schemaRowsToPanelRows(rows) {
  var out = [];
  var list = Array.isArray(rows) ? rows : [];
  for (var i = 0; i < list.length && out.length < MAX_PANEL_ROWS; i++) {
    var row = list[i];
    if (!row || !row.type) continue;
    if (row.type === 'section') {
      var nested = schemaRowsToPanelRows(row.blocks || []);
      for (var n = 0; n < nested.length && out.length < MAX_PANEL_ROWS; n++) out.push(nested[n]);
      continue;
    }
    if (row.type === 'spacer') continue;
    if (row.type === 'heading') {
      out.push({ type: 'heading', level: row.level || 1, text: String(row.text || '') });
      continue;
    }
    if (row.type === 'paragraph') {
      out.push({ type: 'paragraph', text: String(row.text || '') });
      continue;
    }
    if (row.type === 'divider') {
      out.push({ type: 'divider', section: !!row.section });
      continue;
    }
    if (row.type === 'chips') {
      out.push({
        type: 'chips',
        label: String(row.label || 'Modes'),
        chips: stringifyPanelValue(row.value)
          .split(/,\s*/)
          .filter(Boolean)
          .slice(0, 12)
      });
      continue;
    }
    if (row.type === 'field') {
      var inputType = String(row.inputType || row.type || 'text');
      if (inputType === 'curve') {
        out.push({ type: 'placeholder', label: String(row.label || row.name || 'Curve'), hint: 'Curve editor' });
        continue;
      }
      if (inputType === 'colorChart' || inputType === 'chart' || inputType === 'colors') {
        out.push({
          type: 'placeholder',
          label: String(row.label || row.name || 'Colors'),
          hint: 'Color chart'
        });
        continue;
      }
      if (inputType === 'rows') {
        out.push({
          type: 'placeholder',
          label: String(row.label || row.name || 'Table'),
          hint: 'Rows table'
        });
        continue;
      }
      if (inputType === 'group' || inputType === 'anchors') {
        out.push({
          type: 'placeholder',
          label: String(row.label || row.name || inputType),
          hint: inputType === 'anchors' ? 'Anchors' : 'Group'
        });
        continue;
      }
      var options = [];
      if (Array.isArray(row.options)) {
        options = row.options
          .map(function (o) {
            if (o == null) return '';
            if (typeof o === 'object') return String(o.label != null ? o.label : o.value != null ? o.value : o);
            return String(o);
          })
          .filter(Boolean)
          .slice(0, 8);
      }
      out.push({
        type: 'field',
        label: String(row.label || row.name || ''),
        inputType: inputType,
        value: stringifyPanelValue(row.value).slice(0, 120),
        options: options,
        multi: inputType === 'multi' || !!row.multi,
        radio: inputType === 'radio' || !!row.radio
      });
      // Treat `@options:` selects like radio for the canvas mock pills.
      if (options.length && inputType !== 'multi' && !row.multi) {
        out[out.length - 1].radio = true;
      }
      continue;
    }
  }
  return out;
}

/**
 * Leading `//` / `/*` comments before the first real code / config marker —
 * used as canvas docs when there is no `@DOC_START` block.
 */
function extractLeadingCommentDocs(code) {
  var lines = String(code || '').split('\n');
  var out = [];
  var i = 0;
  // Skip shebang / empty
  while (i < lines.length && String(lines[i]).trim() === '') i++;
  while (i < lines.length) {
    var line = lines[i];
    var trimmed = String(line).trim();
    if (trimmed === '') {
      // blank line inside a leading comment run — keep as paragraph break
      if (out.length) out.push('');
      i++;
      continue;
    }
    if (/^\/\/\s*@(DOC_|UI_CONFIG_|CONFIG_|PANEL_|STYLE_)/.test(trimmed)) break;
    if (/^\/\/\s*SCRIPT_NAME\s*:/.test(trimmed)) {
      i++;
      continue;
    }
    var lineComment = trimmed.match(/^\/\/\s?(.*)$/);
    if (lineComment) {
      out.push(lineComment[1]);
      i++;
      continue;
    }
    if (trimmed.indexOf('/*') === 0) {
      var buf = trimmed.slice(2);
      if (buf.indexOf('*/') !== -1) {
        out.push(buf.replace(/\*\/\s*$/, '').replace(/^\*/, '').trim());
        i++;
        continue;
      }
      // multi-line block comment
      var chunk = buf;
      i++;
      while (i < lines.length) {
        var L = lines[i];
        var endAt = L.indexOf('*/');
        if (endAt !== -1) {
          chunk += '\n' + L.slice(0, endAt);
          i++;
          break;
        }
        chunk += '\n' + L;
        i++;
      }
      chunk.split('\n').forEach(function (cl) {
        out.push(String(cl).replace(/^\s*\*/, '').trim());
      });
      continue;
    }
    // First non-comment code line
    break;
  }
  // Trim trailing blanks
  while (out.length && out[out.length - 1] === '') out.pop();
  while (out.length && out[0] === '') out.shift();
  return out.join('\n').trim();
}

/**
 * Build docsBlocks from markdown source when `marked.lexer` is available.
 */
function markdownToDocsBlocks(markdown, markedApi) {
  var text = String(markdown || '').trim();
  if (!text) return [];
  var lexer = markedApi && typeof markedApi.lexer === 'function' ? markedApi.lexer : null;
  if (!lexer && typeof marked !== 'undefined' && marked && typeof marked.lexer === 'function') {
    lexer = marked.lexer.bind(marked);
  }
  if (!lexer) {
    // No marked — still emit a single paragraph so canvas is not empty.
    return [{ type: 'paragraph', segments: [{ text: text }] }];
  }
  try {
    var blocks = docsTokensToBlocks(lexer(text));
    if (blocks.length) return blocks;
    return [{ type: 'paragraph', segments: [{ text: text }] }];
  } catch (e) {
    return [{ type: 'paragraph', segments: [{ text: text }] }];
  }
}

module.exports = {
  MAX_DOC_BLOCKS: MAX_DOC_BLOCKS,
  MAX_DOC_CHARS: MAX_DOC_CHARS,
  MAX_PANEL_ROWS: MAX_PANEL_ROWS,
  inlineSegmentsFromTokens: inlineSegmentsFromTokens,
  cellSegments: cellSegments,
  docsTokensToBlocks: docsTokensToBlocks,
  schemaRowsToPanelRows: schemaRowsToPanelRows,
  stringifyPanelValue: stringifyPanelValue,
  extractLeadingCommentDocs: extractLeadingCommentDocs,
  markdownToDocsBlocks: markdownToDocsBlocks
};
