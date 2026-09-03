#!/usr/bin/env node
/**
 * Write fixed user-script bodies from artifacts/user-scripts-migrated/
 * into the CodeFig Scripts collection via figma:run (--allow-stale OK).
 *
 * Color proportion chart → rename variable to Render styles overview.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var { spawnSync } = require('child_process');

var ROOT = path.join(__dirname, '..');
var DIR = path.join(ROOT, 'artifacts', 'user-scripts-migrated');

var JOBS = [
  { file: 'Color_proportion_chart.js', target: 'Color proportion chart', renameTo: 'Render styles overview' },
  { file: 'Distribute_spacing.js', target: 'Distribute spacing' },
  { file: 'Match_and_replace_colors_to_variables.js', target: 'Match and replace colors to variables' },
  { file: 'Merge_vectors_in_selected_groups.js', target: 'Merge vectors in selected groups' },
  { file: 'Perspective_duplicate.js', target: 'Perspective duplicate' },
  { file: 'Remap_local_styles_by_name.js', target: 'Remap local styles by name' },
  { file: 'Render_CSS_variable_color_tokens.js', target: 'Render CSS variable color tokens' },
  { file: 'Replace_variables_updated.js', target: 'Replace variables updated' },
  { file: 'Scale_to_print.js', target: 'Scale to print' },
  { file: 'Select_only.js', target: 'Select only' },
  { file: 'Select_overlapping_duplicates.js', target: 'Select overlapping duplicates' },
  { file: 'Stack_or_flatten_color_scale.js', target: 'Stack or flatten color scale' }
];

function buildRunner(job, body) {
  var b64 = Buffer.from(body, 'utf8').toString('base64');
  var rename = job.renameTo
    ? 'found.name = ' + JSON.stringify(job.renameTo) + ';\n    console.log("RENAME_OK " + ' + JSON.stringify(job.renameTo) + ');'
    : '';
  return [
    'var TARGET = ' + JSON.stringify(job.target) + ';',
    'var BODY_B64 = ' + JSON.stringify(b64) + ';',
    '(async function () {',
    '  try {',
    '    function b64ToUtf8(b64) {',
    '      var bin = atob(b64);',
    '      var bytes = new Uint8Array(bin.length);',
    '      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);',
    "      if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);",
    "      var s = '';",
    '      for (var j = 0; j < bytes.length; j++) s += String.fromCharCode(bytes[j]);',
    '      return decodeURIComponent(escape(s));',
    '    }',
    '    var code = b64ToUtf8(BODY_B64);',
    '    var cols = await figma.variables.getLocalVariableCollectionsAsync();',
    '    var col = null;',
    '    for (var i = 0; i < cols.length; i++) {',
    "      if (cols[i].name === 'CodeFig Scripts') { col = cols[i]; break; }",
    '    }',
    "    if (!col) { console.log('WRITE_ERR no collection'); window.codefigRunComplete(); return; }",
    '    var modeId = col.modes[0].modeId;',
    '    var found = null;',
    '    for (var j = 0; j < col.variableIds.length; j++) {',
    '      var v = await figma.variables.getVariableByIdAsync(col.variableIds[j]);',
    '      if (v && v.name === TARGET) { found = v; break; }',
    '    }',
    '    if (!found) {',
    "      console.log('WRITE_ERR missing ' + TARGET);",
    '      window.codefigRunComplete();',
    '      return;',
    '    }',
    '    found.setValueForMode(modeId, code);',
    rename,
    "    console.log('WRITE_OK ' + JSON.stringify({ name: found.name, len: code.length, hasDoc: code.indexOf('@DOC_START') !== -1, hasPanel: code.indexOf('__codefigPanel') !== -1 }));",
    '  } catch (e) {',
    "    console.log('WRITE_ERR ' + (e && e.message ? e.message : String(e)));",
    '  }',
    '  window.codefigRunComplete();',
    '})();'
  ].join('\n');
}

var results = [];
for (var i = 0; i < JOBS.length; i++) {
  var job = JOBS[i];
  var body = fs.readFileSync(path.join(DIR, job.file), 'utf8');
  var runner = buildRunner(job, body);
  var tmp = path.join(DIR, '_write-tmp.js');
  fs.writeFileSync(tmp, runner);
  console.log('→ Writing ' + job.target + (job.renameTo ? ' → ' + job.renameTo : ''));
  var r = spawnSync(
    'npm',
    ['run', 'figma:run', '--', '--file', tmp, '--allow-stale'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000 }
  );
  var out = (r.stdout || '') + (r.stderr || '');
  var ok = /WRITE_OK/.test(out);
  var err = (out.match(/WRITE_ERR[^\n]*/) || [])[0];
  results.push({ target: job.target, renameTo: job.renameTo || null, ok: ok, err: err || null });
  if (!ok) {
    console.log(out.slice(-800));
  } else {
    var line = (out.match(/WRITE_OK[^\n]*/) || [''])[0];
    console.log('  ' + line);
  }
}

try {
  fs.unlinkSync(path.join(DIR, '_write-tmp.js'));
} catch (e) {}

fs.writeFileSync(path.join(DIR, '_write-back-report.json'), JSON.stringify(results, null, 2));
console.log('\nDone. ' + results.filter(function (x) { return x.ok; }).length + '/' + results.length + ' ok');
