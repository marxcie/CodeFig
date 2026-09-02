#!/usr/bin/env node
/**
 * Plan 37 / 2.0: migrate `// @PANEL_START` comment-JSON to
 * `var __codefigPanel = { … };` at top level (outside any config object).
 *
 * Run: node devtools/migrate-panel-object-form.js
 * Not shipped (`_` prefix). Safe to re-run — skips files already migrated.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, "..", "scripts");
const PANEL_RE = /\/\/ @PANEL_START\n([\s\S]*?)\n\/\/ @PANEL_END/;

function stripLinePrefixes(text) {
  return String(text || '').split(/\r?\n/).map(function (line) {
    return line.replace(/^\s*\/\/ ?/, '');
  }).join('\n');
}

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    if (ent.name.startsWith('_') || ent.name.startsWith('.')) return;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.js')) out.push(p);
  });
}

/**
 * Index of the `};` that closes the object opened at `openBraceIdx` (the `{` of
 * `= {` for a config object). Skips strings and comments.
 */
function matchingObjectClose(code, openBraceIdx) {
  let depth = 0;
  let i = openBraceIdx;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < code.length && code[i] !== q) {
        if (code[i] === '\\') i += 2;
        else i++;
      }
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        // Prefer `};` when present
        if (code[i + 1] === ';') return i + 2;
        return i + 1;
      }
    }
    i++;
  }
  return -1;
}

function findConfigObjectOpen(code) {
  const configAt = code.indexOf('// @CONFIG_START');
  if (configAt === -1) return -1;
  const before = code.slice(0, configAt);
  let idx = before.lastIndexOf('{');
  while (idx >= 0) {
    let j = idx - 1;
    while (j >= 0 && /\s/.test(before[j])) j--;
    // `= {` or ternary `: {` (DSF `typeof x !== 'undefined' ? x : {`)
    if (j >= 0 && (before[j] === '=' || before[j] === ':')) return idx;
    idx = before.lastIndexOf('{', idx - 1);
  }
  return -1;
}

function toObjectBlock(inner) {
  const body = stripLinePrefixes(inner).replace(/^\s+/, '').replace(/\s+$/, '').replace(/;\s*$/, '');
  if (!body.startsWith('{')) {
    throw new Error('panel body does not start with {');
  }
  return '// @PANEL_START\nvar __codefigPanel = ' + body + ';\n// @PANEL_END';
}

function migrate(code) {
  const m = PANEL_RE.exec(code);
  if (!m) return { code, status: 'none' };
  if (/__codefigPanel\s*=/.test(m[1])) return { code, status: 'skip' };

  const newBlock = toObjectBlock(m[1]);
  const panelStart = m.index;
  const panelEnd = m.index + m[0].length;

  // Peek at what follows the panel — `,` or `};` means it sits inside an object.
  const after = code.slice(panelEnd);
  const afterTrim = after.replace(/^\s+/, '');
  const insideObject = afterTrim.startsWith(',') || afterTrim.startsWith('};') || afterTrim.startsWith('}');

  if (!insideObject) {
    return { code: code.slice(0, panelStart) + newBlock + code.slice(panelEnd), status: 'inplace' };
  }

  // Remove panel from inside the object.
  let without = code.slice(0, panelStart) + code.slice(panelEnd);
  // Collapse accidental triple newlines at the hole
  without = without.replace(/\n{3,}/g, '\n\n');

  // Re-find where to insert: after the config object's closing `};`
  const openIdx = findConfigObjectOpen(without);
  if (openIdx === -1) {
    // Fallback: insert where the panel was (may be wrong for grid — throw)
    throw new Error('could not find config object open brace to relocate panel');
  }
  const closeEnd = matchingObjectClose(without, openIdx);
  if (closeEnd === -1) {
    throw new Error('could not find config object close');
  }

  const inserted =
    without.slice(0, closeEnd) +
    '\n\n' + newBlock +
    without.slice(closeEnd);
  return { code: inserted, status: 'relocated' };
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
      const { code, status } = migrate(prev);
      if (status === 'skip') {
        skipped++;
        return;
      }
      if (code === prev) {
        skipped++;
        return;
      }
      fs.writeFileSync(file, code);
      changed++;
      console.log(status + '\t' + path.relative(path.join(ROOT, '..'), file));
    } catch (e) {
      console.error('FAIL\t' + path.relative(path.join(ROOT, '..'), file) + ': ' + e.message);
      process.exitCode = 1;
    }
  });
  console.log('done: changed=' + changed + ' skipped=' + skipped);
}

main();
