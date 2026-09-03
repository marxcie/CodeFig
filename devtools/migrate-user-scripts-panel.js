#!/usr/bin/env node
/**
 * Migrate annotation-style @UI_CONFIG user scripts → values-only UI_CONFIG +
 * var __codefigPanel = { blocks: […] } (Plan 37).
 *
 * Reads artifacts/user-scripts-raw/*.js (dumped from CodeFig Scripts vars).
 * Writes artifacts/user-scripts-migrated/*.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('../src/config-ui/parser.js');
const { formatPanel } = require('./normalize-panel-object-form.js');

const ROOT = path.join(__dirname, '..');
const IN = path.join(ROOT, 'artifacts/user-scripts-raw');
const OUT = path.join(ROOT, 'artifacts/user-scripts-migrated');

function printKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(key))
    ? String(key)
    : JSON.stringify(String(key));
}

function fmtValue(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(fmtValue).join(', ') + ']';
  return JSON.stringify(v);
}

function mapFieldType(inputType) {
  if (!inputType || inputType === 'text') return 'string';
  return inputType;
}

function rowToBlock(row) {
  if (row.type === 'heading') {
    const b = { type: 'heading', text: row.text || '' };
    if (row.level && row.level !== 1) b.level = row.level;
    return b;
  }
  if (row.type === 'divider') {
    return row.section ? { type: 'divider', section: true } : { type: 'divider' };
  }
  if (row.type === 'paragraph') {
    const text = String(row.text || '').trim();
    if (!text || text === '@UI_CONFIG_START' || text === '@UI_CONFIG_END') return null;
    return { type: 'paragraph', attachTo: 'previous', text: text };
  }
  if (row.type !== 'field') return null;

  const block = {
    key: row.name,
    type: mapFieldType(row.inputType),
  };
  if (row.label) block.label = row.label;
  if (row.placeholder) block.placeholder = row.placeholder;
  if (row.helper) block.helper = row.helper;
  else if (row.tooltip) block.helper = row.tooltip;

  if (row.optionSource) block.options = row.optionSource;
  else if (Array.isArray(row.options) && row.options.length) block.options = row.options;

  if (row.collectionField != null) block.collection = row.collectionField;
  if (row.showWhen) block.showWhen = row.showWhen;

  return block;
}

function cleanUiConfigValues(uiBlock, schema) {
  const fields = (schema.rows || []).filter((r) => r.type === 'field');
  const lines = ['// @UI_CONFIG_START'];
  // Keep a single section heading if the first non-blank content was a heading
  const firstHeading = (schema.rows || []).find((r) => r.type === 'heading');
  if (firstHeading && firstHeading.text) {
    lines.push('// # ' + firstHeading.text);
  }
  fields.forEach((f) => {
    lines.push('var ' + f.name + ' = ' + fmtValue(f.value) + ';');
  });
  lines.push('// @UI_CONFIG_END');
  return lines.join('\n');
}

function migrate(code) {
  if (code.indexOf('@PANEL_START') !== -1) {
    return { code, status: 'already-panel' };
  }
  if (code.indexOf('@UI_CONFIG_START') === -1) {
    return { code, status: 'no-config' };
  }

  const re = /\/\/ @UI_CONFIG_START\n([\s\S]*?)\/\/ @UI_CONFIG_END/;
  const m = re.exec(code);
  if (!m) return { code, status: 'no-config' };

  const uiRegion = m[0];
  // Collapse blank spam before parse so we don't drown in blank rows
  const compacted = uiRegion.replace(/\n{3,}/g, '\n\n');
  const schema = parser.parse(compacted);
  if (schema.error) throw new Error(schema.error);

  const blocks = [];
  (schema.rows || []).forEach((row) => {
    if (row.type === 'blank') return;
    const b = rowToBlock(row);
    if (b) blocks.push(b);
  });

  // Annotation comment lines before a field describe that field — PANEL uses attachTo: "next".
  for (var i = 0; i < blocks.length - 1; i++) {
    if (blocks[i].type === 'paragraph' && blocks[i + 1].key) {
      blocks[i].attachTo = 'next';
    }
  }

  // Drop leading paragraphs that only echoed the heading
  while (
    blocks.length &&
    blocks[0].type === 'paragraph' &&
    blocks[1] &&
    blocks[1].type === 'heading'
  ) {
    blocks.shift();
  }

  if (blocks.length === 0) return { code, status: 'empty-panel' };

  const valuesBlock = cleanUiConfigValues(compacted, schema);
  const panelBlock = formatPanel({ blocks: blocks });

  const replacement = valuesBlock + '\n\n' + panelBlock;
  const next = code.slice(0, m.index) + replacement + code.slice(m.index + m[0].length);
  // Tidy accidental blank runs elsewhere near the splice
  const tidied = next.replace(/\n{4,}/g, '\n\n\n');
  return { code: tidied, status: 'migrated', fields: blocks.filter((b) => b.key).length };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(IN).filter((f) => f.endsWith('.js'));
  const report = [];
  files.forEach((file) => {
    const prev = fs.readFileSync(path.join(IN, file), 'utf8');
    try {
      const { code, status, fields } = migrate(prev);
      fs.writeFileSync(path.join(OUT, file), code);
      report.push({ file, status, fields: fields || 0, len: code.length });
      console.log(status + '\t' + (fields || 0) + '\t' + file);
    } catch (e) {
      console.error('FAIL\t' + file + ': ' + e.message);
      process.exitCode = 1;
    }
  });
  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(report, null, 2));
}

if (require.main === module) main();
module.exports = { migrate, rowToBlock };
