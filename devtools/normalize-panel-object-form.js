#!/usr/bin/env node
/**
 * Plan 37 exit #8: reprint `var __codefigPanel = {…}` in Help specimen style
 * (bare identifier keys, compact one-line field objects).
 *
 * Targets panels still carrying JSON-quoted keys (`"blocks":`) from the
 * mechanical comment→object migration. Idempotent for already-bare panels.
 *
 * Run: node devtools/normalize-panel-object-form.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('../src/config-ui/parser.js');

const ROOT = path.join(__dirname, '..', 'scripts');
const PANEL_RE = /\/\/ @PANEL_START\n([\s\S]*?)\n\/\/ @PANEL_END/;

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    if (ent.name.startsWith('_') || ent.name.startsWith('.')) return;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.js')) out.push(p);
  });
}

function parsePanelObject(inner) {
  const normalized = parser.normalizePanelSpecText(inner);
  // Object literal with bare or quoted keys — not JSON.
  return Function('"use strict"; return (' + normalized + ')')();
}

function printKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(key))
    ? String(key)
    : JSON.stringify(String(key));
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Options / showWhen / small maps — stay inline. */
function isSmallMap(obj) {
  const keys = Object.keys(obj);
  if (keys.length === 0) return true;
  return keys.every((k) => {
    const v = obj[k];
    return v === null || typeof v !== 'object';
  });
}

function printPrimitive(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  throw new Error('not a primitive: ' + typeof v);
}

function printArray(arr, indent) {
  if (arr.length === 0) return '[]';
  const allPrimitive = arr.every((item) => item === null || typeof item !== 'object');
  if (allPrimitive) {
    return '[' + arr.map(printPrimitive).join(', ') + ']';
  }
  // Array of small option maps: [{"a":"A"},{"b":"B"}]
  const allSmallMaps = arr.every((item) => isPlainObject(item) && isSmallMap(item));
  if (allSmallMaps) {
    const inline = '[' + arr.map((item) => printObjectInline(item)).join(', ') + ']';
    if (inline.length <= 100) return inline;
  }
  // Array of field-like objects (columns / fields / blocks / names)
  const pad = indent;
  const inner = indent + '  ';
  return (
    '[\n' +
    arr
      .map((item) => {
        if (isPlainObject(item)) {
          return inner + printObjectHelp(item, inner);
        }
        if (Array.isArray(item)) {
          return inner + printArray(item, inner);
        }
        return inner + printPrimitive(item);
      })
      .join(',\n') +
    '\n' +
    pad +
    ']'
  );
}

function printObjectInline(obj) {
  const keys = Object.keys(obj);
  return (
    '{ ' +
    keys
      .map((k) => {
        const v = obj[k];
        let printed;
        if (Array.isArray(v)) printed = printArray(v, '');
        else if (isPlainObject(v)) printed = printObjectInline(v);
        else printed = printPrimitive(v);
        return printKey(k) + ': ' + printed;
      })
      .join(', ') +
    ' }'
  );
}

/**
 * Help-style object: one line when short and flat enough; otherwise key-per-line
 * with nested columns/fields indented like the Style & UI reference specimen.
 */
function printObjectHelp(obj, indent) {
  const keys = Object.keys(obj);
  const hasLongText =
    typeof obj.text === 'string' && obj.text.length > 72;
  const hasNestedList = keys.some((k) => {
    const v = obj[k];
    return (
      Array.isArray(v) &&
      v.some((item) => item !== null && typeof item === 'object')
    );
  });
  const hasNestedObject = keys.some((k) => {
    const v = obj[k];
    return isPlainObject(v) && !isSmallMap(v);
  });

  if (!hasLongText && !hasNestedList && !hasNestedObject) {
    const inline = printObjectInline(obj);
    if (inline.length <= 110) return inline;
  }

  // Expanded: prefer `text` on its own line after shorter props (Help paragraphs).
  const pad = indent;
  const inner = indent + '  ';
  const ordered = keys.slice();
  if (ordered.includes('text') && ordered[ordered.length - 1] !== 'text') {
    ordered.splice(ordered.indexOf('text'), 1);
    ordered.push('text');
  }

  const lines = ordered.map((k) => {
    const v = obj[k];
    let printed;
    if (Array.isArray(v)) printed = printArray(v, inner);
    else if (isPlainObject(v)) {
      printed = isSmallMap(v) ? printObjectInline(v) : printObjectHelp(v, inner);
    } else printed = printPrimitive(v);
    return inner + printKey(k) + ': ' + printed;
  });

  // Compact Help paragraph shape: `{ type, attachTo,\n  text: "…" }`
  if (
    keys.length <= 4 &&
    typeof obj.text === 'string' &&
    (obj.type === 'paragraph' || obj.type === 'heading')
  ) {
    const leadKeys = ordered.filter((k) => k !== 'text');
    if (leadKeys.length > 0 && leadKeys.every((k) => !isPlainObject(obj[k]) && !Array.isArray(obj[k]))) {
      const lead =
        '{ ' +
        leadKeys.map((k) => printKey(k) + ': ' + printPrimitive(obj[k])).join(', ') +
        ',';
      return lead + '\n' + inner + 'text: ' + printPrimitive(obj.text) + ' }';
    }
  }

  return '{\n' + lines.join(',\n') + '\n' + pad + '}';
}

function formatPanel(spec) {
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.blocks)) {
    throw new Error('panel root must be { blocks: […] }');
  }
  // Preserve unknown top-level keys after blocks if any ever appear.
  const keys = Object.keys(spec);
  const parts = keys.map((k) => {
    const v = spec[k];
    if (k === 'blocks' && Array.isArray(v)) {
      // Brace column for each block object is 4 spaces (Help specimen).
      const bracePad = '    ';
      const items = v.map((block) => {
        if (!isPlainObject(block)) {
          throw new Error('block must be an object');
        }
        return bracePad + printObjectHelp(block, bracePad);
      });
      return '  blocks: [\n' + items.join(',\n') + '\n  ]';
    }
    if (Array.isArray(v)) return '  ' + printKey(k) + ': ' + printArray(v, '  ');
    if (isPlainObject(v)) return '  ' + printKey(k) + ': ' + printObjectHelp(v, '  ');
    return '  ' + printKey(k) + ': ' + printPrimitive(v);
  });
  return (
    '// @PANEL_START\n' +
    'var __codefigPanel = {\n' +
    parts.join(',\n') +
    '\n};\n' +
    '// @PANEL_END'
  );
}

function needsNormalize(inner) {
  // Mechanical migrator left JSON-quoted keys; bare Help style never quotes `blocks`.
  if (/"blocks"\s*:/.test(inner)) return true;
  // First normalize pass hung `text:` at 5 spaces; Help uses 6 under a 4-space brace.
  if (/^ {5}text:/m.test(inner)) return true;
  return false;
}

function normalizeFile(code) {
  const m = PANEL_RE.exec(code);
  if (!m) return { code, status: 'none' };
  if (!needsNormalize(m[1])) return { code, status: 'skip' };

  const spec = parsePanelObject(m[1]);
  // Round-trip IR check via the real reader.
  const before = parser.parsePanelSpec(m[1], {});
  if (before.error) throw new Error(before.error);
  const newBlock = formatPanel(spec);
  const afterInner = PANEL_RE.exec(newBlock)[1];
  const after = parser.parsePanelSpec(afterInner, {});
  if (after.error) throw new Error(after.error);
  if (before.rows.length !== after.rows.length) {
    throw new Error(
      'row count drifted: ' + before.rows.length + ' → ' + after.rows.length
    );
  }

  const next =
    code.slice(0, m.index) + newBlock + code.slice(m.index + m[0].length);
  return { code: next, status: next === code ? 'skip' : 'normalized' };
}

function main() {
  const files = [];
  walk(ROOT, files);
  let changed = 0;
  let skipped = 0;
  let none = 0;
  files.forEach((file) => {
    const prev = fs.readFileSync(file, 'utf8');
    if (!PANEL_RE.test(prev)) {
      none++;
      return;
    }
    try {
      const { code, status } = normalizeFile(prev);
      if (status === 'none') {
        none++;
        return;
      }
      if (status === 'skip') {
        skipped++;
        return;
      }
      fs.writeFileSync(file, code);
      changed++;
      console.log(status + '\t' + path.relative(path.join(ROOT, '..'), file));
    } catch (e) {
      console.error(
        'FAIL\t' + path.relative(path.join(ROOT, '..'), file) + ': ' + e.message
      );
      process.exitCode = 1;
    }
  });
  console.log('done: changed=' + changed + ' skipped=' + skipped + ' none=' + none);
}

if (require.main === module) main();

module.exports = {
  formatPanel,
  parsePanelObject,
  normalizeFile,
  needsNormalize,
  printObjectHelp,
};
