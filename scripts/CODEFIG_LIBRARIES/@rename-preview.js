// @Rename Preview
// @DOC_START
// # @Rename Preview
// Show what a find/replace **would** do before it does it, like Figma's Rename Layers.
//
// ## Overview
// Every defect this library exists to prevent was silent-wrong-behaviour, not a crash: a
// pattern that matched names nobody meant, or matched nothing at all. A preview does not
// depend on the matcher being right — it shows the answer and lets you judge it. Import
// alongside `displayResults` from `@InfoPanel`.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Plan | previewRow, flagPreviewCollisions, previewCounts |
// | Present | previewPayload, logPreviewPlan |
// | Preview → apply | previewSignature, savePreviewSignature, readPreviewSignature, previewDriftMessage |
//
// ## Usage
// ```js
// var rows = [];
// for (var i = 0; i < items.length; i++) {
//   rows.push(previewRow(items[i].name, renameByPattern(items[i].name, find, replace, i, items.length, opts)));
// }
// flagPreviewCollisions(rows, existingNames);
// if (previewOnly) {
//   logPreviewPlan(rows);
//   await savePreviewSignature('rename-styles', previewSignature(rows));
//   displayResults(previewPayload('Rename styles — preview', rows));
//   return;
// }
// ```
//
// ## Row flags
// | Flag | Meaning |
// |------|---------|
// | collision | The new name already belongs to something else. Applying would clash. |
// | duplicate | Two rows in this plan produce the same new name. |
// | unchanged | The name matched but the replacement did not change it — usually a pattern that does not mean what was intended. |
// | empty | The replacement would leave an empty name. Never applied. |
//
// ## The counter caveat
// `$n` / `$N` are positional, so they depend on the **set** of matches. Preview and apply are
// two separate runs, so if the file changes in between, the numbers move. `previewSignature`
// plus `previewDriftMessage` make that visible instead of silent: the preview records what it
// planned, and the apply run says so if the plan no longer matches.
// @DOC_END

// ============================================================================
// PLAN
// ============================================================================

/**
 * One planned change. `changed` is the question that matters: a row where the name matched
 * but came out identical is reported, not hidden, because that is what a misunderstood
 * pattern looks like.
 */
function previewRow(oldName, newName, context) {
  var from = oldName == null ? '' : String(oldName);
  var to = newName == null ? '' : String(newName);
  var flags = [];
  if (to === from) flags.push('unchanged');
  if (to.trim() === '') flags.push('empty');
  return {
    from: from,
    to: to,
    changed: to !== from && to.trim() !== '',
    flags: flags,
    context: context == null ? '' : String(context)
  };
}

/**
 * Flag rows whose new name already exists, or that collide with each other.
 * `existingNames` is every name in the target namespace *before* applying; a row renaming
 * something to its own current name is not a collision with itself.
 */
function flagPreviewCollisions(rows, existingNames) {
  var taken = {};
  var i;
  if (existingNames) {
    for (i = 0; i < existingNames.length; i++) {
      taken[String(existingNames[i])] = (taken[String(existingNames[i])] || 0) + 1;
    }
  }
  // Names this plan frees up: renaming a → b means a is no longer taken.
  for (i = 0; i < rows.length; i++) {
    if (rows[i].changed && taken[rows[i].from]) taken[rows[i].from] -= 1;
  }

  var planned = {};
  for (i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row.changed) continue;
    if (taken[row.to] > 0 && row.flags.indexOf('collision') === -1) {
      row.flags.push('collision');
    }
    if (planned[row.to] && row.flags.indexOf('duplicate') === -1) {
      row.flags.push('duplicate');
    }
    planned[row.to] = true;
  }
  return rows;
}

/** Tallies for a plan: what would change, and what needs looking at. */
function previewCounts(rows) {
  var counts = { total: rows.length, changed: 0, unchanged: 0, collision: 0, duplicate: 0, empty: 0, flagged: 0 };
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.changed) counts.changed++;
    if (row.flags.indexOf('unchanged') !== -1) counts.unchanged++;
    if (row.flags.indexOf('collision') !== -1) counts.collision++;
    if (row.flags.indexOf('duplicate') !== -1) counts.duplicate++;
    if (row.flags.indexOf('empty') !== -1) counts.empty++;
    if (row.flags.length > 0) counts.flagged++;
  }
  return counts;
}

// ============================================================================
// PRESENT
// ============================================================================

/** Human-readable summary of a row's flags, or ''. */
function previewFlagLabel(row) {
  if (!row.flags || row.flags.length === 0) return '';
  var labels = [];
  for (var i = 0; i < row.flags.length; i++) {
    var flag = row.flags[i];
    if (flag === 'collision') labels.push('⚠️ name already exists');
    else if (flag === 'duplicate') labels.push('⚠️ two rows produce this name');
    else if (flag === 'unchanged') labels.push('⚠️ matched but unchanged');
    else if (flag === 'empty') labels.push('⚠️ would be empty — skipped');
    else labels.push(flag);
  }
  return labels.join(' · ');
}

/**
 * Build the object for displayResults(). A pure function on purpose: the payload is the part
 * worth testing, and it can be asserted in Node without a plugin.
 */
function previewPayload(title, rows, options) {
  var opts = options || {};
  var counts = previewCounts(rows);
  var results = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var label = previewFlagLabel(row);
    var message = row.changed ? row.from + '  →  ' + row.to : row.from + '  (no change)';
    var details = [];
    if (row.context) details.push(row.context);
    if (label) details.push(label);
    results.push({
      message: message,
      details: details.join(' · '),
      severity: row.flags.length > 0 ? 'warning' : 'info'
    });
  }

  if (rows.length === 0) {
    results.push({
      message: 'Nothing matched.',
      details:
        'Check the search pattern. Brackets and parens are literal unless "Use regular ' +
        'expression" is ticked, and matching is case-insensitive unless "Match case" is.',
      severity: 'warning'
    });
  }

  return {
    title: title + ' — ' + counts.changed + ' of ' + counts.total + ' would change' +
      (counts.flagged ? ', ' + counts.flagged + ' to check' : ''),
    results: results,
    type: counts.flagged > 0 ? 'warning' : 'info',
    showFilters: opts.showFilters === true
  };
}

/** The same plan in the console, so figma-console.log and `figma:run` show it too. */
function logPreviewPlan(rows, options) {
  var opts = options || {};
  var counts = previewCounts(rows);
  console.log('=== PREVIEW — nothing has been changed ===');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var label = previewFlagLabel(row);
    if (row.changed) {
      console.log('  "' + row.from + '" → "' + row.to + '"' + (label ? '   ' + label : ''));
    } else {
      console.log('  "' + row.from + '" (no change)' + (label ? '   ' + label : ''));
    }
  }
  console.log(
    'Would change ' + counts.changed + ' of ' + counts.total +
      (counts.flagged ? ' · ' + counts.flagged + ' row(s) to check' : '')
  );
  console.log(
    'To apply: untick "Preview only"' + (opts.field ? ' (' + opts.field + ')' : '') + ' and run again.'
  );
  return counts;
}

// ============================================================================
// PREVIEW → APPLY
// ============================================================================

/**
 * A stable fingerprint of a plan. Cheap 32-bit rolling hash — this guards against drift,
 * not tampering, so a short digest is enough.
 */
function previewSignature(rows) {
  var text = '';
  for (var i = 0; i < rows.length; i++) {
    text += rows[i].from + '\t' + rows[i].to + '\n';
  }
  var hash = 5381;
  for (var c = 0; c < text.length; c++) {
    hash = ((hash * 33) ^ text.charCodeAt(c)) >>> 0;
  }
  return rows.length + ':' + hash.toString(36);
}

function previewStorageKey(scriptKey) {
  return 'codefigPreviewPlan:' + String(scriptKey || 'unknown');
}

/** Record what the preview planned, so the apply run can tell whether it still holds. */
async function savePreviewSignature(scriptKey, signature) {
  try {
    await figma.clientStorage.setAsync(previewStorageKey(scriptKey), {
      signature: signature,
      fileName: figma.root ? figma.root.name : ''
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function readPreviewSignature(scriptKey) {
  try {
    var stored = await figma.clientStorage.getAsync(previewStorageKey(scriptKey));
    return stored && stored.signature ? stored : null;
  } catch (e) {
    return null;
  }
}

/**
 * What to tell the user when an apply run's plan differs from the previewed one, or ''.
 *
 * This is the honest answer to the counter problem: `$n` is positional, so a changed match
 * set silently renumbers everything. Rather than pretend two runs can be atomic, say when
 * they have diverged.
 */
function previewDriftMessage(stored, currentSignature) {
  if (!stored) {
    return 'No preview on record for this script. Applying without previewing first — ' +
      'tick "Preview only" and run once if you want to see the plan.';
  }
  if (stored.signature === currentSignature) return '';
  return 'The plan changed since the preview (previewed ' + stored.signature + ', now ' +
    currentSignature + '). Something in the file moved, so $n / $N numbering and the affected ' +
    'set may differ from what you saw. Preview again before relying on it.';
}
