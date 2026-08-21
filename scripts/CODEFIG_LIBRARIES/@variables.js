// @Variables
// @DOC_START
// Functions for Figma variables, collections, and modes.
//
// ## Overview
// Import to get/create collections, get/set variables by name or mode, list variables, and run batch operations (e.g. getOrCreateCollection, setupModes, createOrUpdateVariable, extractModes, processVariables). No configuration; use via @import.
//
// ## Exported functions
// | Category | Functions |
// |----------|-----------|
// | Collections | getAllCollections, getCollection, getOrCreateCollection |
// | Modes | planModes, setupModes, removeModes, modeOrderWarning |
// | Variables | getVariable, getCollectionVariables, getVariableValue, setVariableValue, createOrUpdateVariable |
// | Batch | extractModes, resolveModeValues, processVariables |
//
// ## Never delete a variable or a collection
// A variable's id and its published key are minted at creation. Delete and recreate, and every
// node bound to it loses its binding and every file subscribing to the published library gets a
// "missing variable" it cannot relink. **Rename is safe** — id and key survive it — so
// update-in-place is the only regeneration strategy that keeps a library alive. Nothing here
// removes a variable or a collection, and nothing added here should.
//
// ## Modes are only ever added
// `setupModes` adds what is missing and reports anything else the collection has. It never
// removes a mode, because several scripts share one collection and a mode you do not
// recognise is someone else's — along with every value stored in it. `removeModes` is the
// explicit path, for a caller that has shown the user what will go.
// @DOC_END

// ============================================================================
// CORE VARIABLE FUNCTIONS
// ============================================================================

/**
 * Normalize variable name for Figma API: no empty path segments (e.g. "//" or leading/trailing "/").
 * Figma throws "name cannot contain empty path" for names like "//3xs/font-size".
 */
function normalizeVariableName(name) {
  if (typeof name !== 'string') return name;
  var s = name;
  while (s.indexOf("//") !== -1) {
    s = s.split("//").join("/");
  }
  if (s.charAt(0) === "/") s = s.slice(1);
  if (s.length > 0 && s.charAt(s.length - 1) === "/") s = s.slice(0, -1);
  return s;
}

/**
 * Compare variable scope arrays (order-independent).
 */
function variableScopesMatch(currentScopes, desiredScopes) {
  if (!desiredScopes || desiredScopes.length === 0) return true;
  var current = currentScopes || [];
  if (current.length !== desiredScopes.length) return false;
  return desiredScopes.every(function(scope) {
    return current.indexOf(scope) !== -1;
  });
}

function variableValueEquals(existing, modeId, newValue) {
  if (!existing || !existing.valuesByMode) return false;
  var current = existing.valuesByMode[modeId];
  if (current === undefined) return false;
  if (typeof newValue === 'number' && typeof current === 'number') return current === newValue;
  if (typeof newValue === 'string' && typeof current === 'string') return current === newValue;
  if (typeof newValue === 'boolean' && typeof current === 'boolean') return current === newValue;
  return false;
}

/**
 * Get all variable collections (async for documentAccess: dynamic-page)
 */
async function getAllCollections() {
  return await figma.variables.getLocalVariableCollectionsAsync();
}

/**
 * Get collection by name
 */
async function getCollection(name) {
  var collections = await getAllCollections();
  return collections.find(function(c) { return c.name === name; });
}

/**
 * Get variable by name from a collection (async for getVariableByIdAsync)
 */
async function getVariable(collection, variableName) {
  if (!collection) return null;
  
  for (var i = 0; i < collection.variableIds.length; i++) {
    var variableId = collection.variableIds[i];
    var variable = await figma.variables.getVariableByIdAsync(variableId);
    if (variable && variable.name === variableName) {
      return variable;
    }
  }
  return null;
}

/**
 * Get variable value for a specific mode
 */
async function getVariableValue(collection, variableName, modeId) {
  var variable = await getVariable(collection, variableName);
  if (variable && variable.valuesByMode[modeId] !== undefined) {
    return variable.valuesByMode[modeId];
  }
  return null;
}

/**
 * Set variable value for a specific mode
 */
async function setVariableValue(collection, variableName, modeId, value) {
  var variable = await getVariable(collection, variableName);
  if (variable) {
    variable.setValueForMode(modeId, value);
    return true;
  }
  return false;
}

/**
 * Get all variables in a collection (async for getVariableByIdAsync)
 */
async function getCollectionVariables(collection) {
  if (!collection) return [];
  
  var variables = [];
  for (var i = 0; i < collection.variableIds.length; i++) {
    var variableId = collection.variableIds[i];
    var variable = await figma.variables.getVariableByIdAsync(variableId);
    if (variable) {
      variables.push(variable);
    }
  }
  return variables;
}

/**
 * Get all mode IDs from a collection
 */
function getCollectionModes(collection) {
  if (!collection) return [];
  return collection.modes.map(function(mode) { return mode.modeId; });
}

/**
 * Get mode by name
 */
function getModeByName(collection, modeName) {
  if (!collection) return null;
  return collection.modes.find(function(mode) { return mode.name === modeName; });
}

// ============================================================================
// VARIABLE SEARCH AND FILTERING
// ============================================================================

/**
 * Find variables by pattern in name
 */
async function findVariablesByPattern(collection, pattern) {
  var variables = await getCollectionVariables(collection);
  var regex = new RegExp(pattern, 'i');
  return variables.filter(function(v) { return regex.test(v.name); });
}

/**
 * Find variables with function calls in description
 */
async function findSmartVariables(collection) {
  var variables = await getCollectionVariables(collection);
  return variables.filter(function(v) {
    return v.description && /(\w+)\s*\([^)]*\)/.test(v.description);
  });
}

/**
 * Extract function call from variable description
 */
function extractFunctionFromDescription(description) {
  if (!description) return null;
  
  var patterns = [
    /(\w+)\s*\([^)]*\)/,  // functionName()
    /(\w+)\s*\([^)]*\)\s*;/,  // functionName();
    /(\w+)\s*\([^)]*\)\s*$/,  // functionName() at end of line
  ];
  
  for (var i = 0; i < patterns.length; i++) {
    var match = description.match(patterns[i]);
    if (match) {
      return match[0].replace(/;+$/, ''); // Remove trailing semicolons
    }
  }
  
  return null;
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Update multiple variables in a collection
 */
async function updateMultipleVariables(collection, updates) {
  var results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (var i = 0; i < updates.length; i++) {
    var update = updates[i];
    try {
      var success = await setVariableValue(collection, update.variableName, update.modeId, update.value);
      if (success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push('Variable not found: ' + update.variableName);
      }
    } catch (error) {
      results.failed++;
      results.errors.push('Error updating ' + update.variableName + ': ' + error.message);
    }
  }
  
  return results;
}

/**
 * Get all variable values for a specific mode
 */
async function getModeValues(collection, modeId) {
  var variables = await getCollectionVariables(collection);
  var values = {};
  
  for (var i = 0; i < variables.length; i++) {
    var variable = variables[i];
    if (variable.valuesByMode[modeId] !== undefined) {
      values[variable.name] = variable.valuesByMode[modeId];
    }
  }
  
  return values;
}

/**
 * Set all variable values for a specific mode
 */
async function setModeValues(collection, modeId, values) {
  var results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (var variableName in values) {
    try {
      var success = await setVariableValue(collection, variableName, modeId, values[variableName]);
      if (success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push('Variable not found: ' + variableName);
      }
    } catch (error) {
      results.failed++;
      results.errors.push('Error updating ' + variableName + ': ' + error.message);
    }
  }
  
  return results;
}

// ============================================================================
// VARIABLE CREATION AND MANAGEMENT
// ============================================================================

/**
 * Create a new variable in a collection
 */
function createVariable(collection, name, type, description) {
  if (!collection) {
    throw new Error('Collection not found');
  }
  name = normalizeVariableName(name);
  var variable = figma.variables.createVariable(name, collection, type);
  if (description) {
    variable.description = description;
  }
  
  return variable;
}

/**
 * Create multiple variables from a configuration
 */
function createVariablesFromConfig(collection, config) {
  var results = {
    created: [],
    errors: []
  };
  
  for (var i = 0; i < config.length; i++) {
    var varConfig = config[i];
    try {
      var variable = createVariable(collection, varConfig.name, varConfig.type, varConfig.description);
      
      // Set initial values if provided
      if (varConfig.values) {
        for (var modeId in varConfig.values) {
          variable.setValueForMode(modeId, varConfig.values[modeId]);
        }
      }
      
      results.created.push(variable);
    } catch (error) {
      results.errors.push('Error creating ' + varConfig.name + ': ' + error.message);
    }
  }
  
  return results;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get collection summary
 */
async function getCollectionSummary(collection) {
  if (!collection) return null;
  
  var variables = await getCollectionVariables(collection);
  var modes = getCollectionModes(collection);
  
  return {
    name: collection.name,
    variableCount: variables.length,
    modeCount: modes.length,
    variables: variables.map(function(v) { return v.name; }),
    modes: modes
  };
}

/**
 * Validate collection configuration
 */
async function validateCollection(collection, requiredVariables, requiredModes) {
  var errors = [];
  
  if (!collection) {
    errors.push('Collection not found');
    return { valid: false, errors: errors };
  }
  
  var variables = await getCollectionVariables(collection);
  var variableNames = variables.map(function(v) { return v.name; });
  
  // Check required variables
  for (var i = 0; i < requiredVariables.length; i++) {
    if (!variableNames.includes(requiredVariables[i])) {
      errors.push('Missing required variable: ' + requiredVariables[i]);
    }
  }
  
  // Check required modes
  var modeNames = collection.modes.map(function(m) { return m.name; });
  for (var j = 0; j < requiredModes.length; j++) {
    if (!modeNames.includes(requiredModes[j])) {
      errors.push('Missing required mode: ' + requiredModes[j]);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Export collection data
 */
async function exportCollectionData(collection) {
  if (!collection) return null;
  
  var variables = await getCollectionVariables(collection);
  var data = {
    name: collection.name,
    modes: collection.modes,
    variables: {}
  };
  
  for (var i = 0; i < variables.length; i++) {
    var variable = variables[i];
    data.variables[variable.name] = {
      id: variable.id,
      type: variable.variableCollectionId,
      description: variable.description,
      values: variable.valuesByMode
    };
  }
  
  return data;
}

// ============================================================================
// DEBUGGING AND LOGGING
// ============================================================================

/**
 * Log collection information
 */
async function logCollectionInfo(collection) {
  if (!collection) {
    console.log('❌ Collection not found');
    return;
  }
  
  var summary = await getCollectionSummary(collection);
  console.log('📚 Collection: "' + summary.name + '"');
  console.log('   Variables: ' + summary.variableCount);
  console.log('   Modes: ' + summary.modeCount);
  console.log('   Variables: [' + summary.variables.join(', ') + ']');
}

/**
 * Log variable values for all modes
 */
async function logVariableValues(collection, variableName) {
  var variable = await getVariable(collection, variableName);
  if (!variable) {
    console.log('❌ Variable not found: ' + variableName);
    return;
  }
  
  console.log('📊 Variable: "' + variableName + '"');
  for (var modeId in variable.valuesByMode) {
    var mode = collection.modes.find(function(m) { return m.modeId === modeId; });
    var modeName = mode ? mode.name : modeId;
    console.log('   ' + modeName + ': ' + variable.valuesByMode[modeId]);
  }
}

// ============================================================================
// ADVANCED VARIABLE OPERATIONS
// ============================================================================

/**
 * Get or create a variable collection (async for documentAccess: dynamic-page)
 */
async function getOrCreateCollection(name) {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var existing = collections.find(function(c) { return c.name === name; });
  
  if (existing) {
    return existing;
  }
  
  var collection = figma.variables.createVariableCollection(name);
  console.log('Created collection: ' + name);
  return collection;
}

/**
 * The collection's default mode — where a value goes when nobody said which mode.
 *
 * Figma marks one mode as default; a collection always has at least one, so this only returns null
 * for a missing collection.
 */
function getDefaultMode(collection) {
  if (!collection || !collection.modes || !collection.modes.length) return null;
  if (collection.defaultModeId) {
    var marked = collection.modes.find(function(m) { return m.modeId === collection.defaultModeId; });
    if (marked) return marked;
  }
  return collection.modes[0];
}

/**
 * Get or create a mode by name — `getOrCreateCollection` one level down, and the script-side half of
 * the `@mode` picker.
 *
 * Returns the mode (`{ modeId, name }`), so a caller can write values without a second lookup.
 *
 * Three things worth knowing before calling it:
 * - **An empty name is not a mode called "".** It means "wherever this collection puts values by
 *   default", which is what the picker sends when a single-mode collection made the question moot.
 * - **Names are matched the way Figma compares them** — trimmed and case-insensitively — because
 *   Figma refuses two modes differing only in case, so treating "Light" and "light" as different
 *   here would ask for a mode it will not create.
 * - **It creates, and creating can fail.** `addMode` throws when the file's per-collection mode
 *   budget is spent, and the number depends on the plan. That is re-thrown with the collection and
 *   the count, because "modes are limited" without either is a message you cannot act on.
 * - **A placeholder mode is adopted; a mode with values in it never is.** See below.
 */
function getOrCreateMode(collection, modeName) {
  if (!collection) return null;
  var wanted = modeName != null ? String(modeName).trim() : '';
  if (!wanted) return getDefaultMode(collection);

  var existing = collection.modes.find(function(mode) {
    return String(mode.name).trim().toLowerCase() === wanted.toLowerCase();
  });
  if (existing) return existing;

  // A collection Figma has just created carries one mode called "Mode 1" that nobody asked for.
  // Naming the first mode is a rename of that one, not a second mode beside it — otherwise choosing
  // "New mode" on a new collection leaves every collection with a stray empty column.
  //
  // **"Mode 1" is not enough to make it a placeholder.** A collection that has been in the file for
  // months, filled with variables, whose one mode nobody ever bothered to rename is still called
  // "Mode 1" — and renaming *that* is not a mode being added, it is the user's only mode being taken
  // over and written through. `color - lime` had sixteen variables in a mode called "Mode 1";
  // choosing **New mode / Lime-2** renamed it and overwrote every value, which is the opposite of
  // what "new" says. So the question asked is the one that actually decides whether the rename is
  // safe: **is there anything in here to disturb?** An empty collection cannot lose a value to a
  // rename, whoever created it and whenever. A collection with variables gets a real second mode.
  var placeholderMode =
    collection.modes.length === 1 &&
    collection.modes[0].name === 'Mode 1' &&
    (collection.variableIds || []).length === 0 &&
    typeof collection.renameMode === 'function';
  if (placeholderMode) {
    collection.renameMode(collection.modes[0].modeId, wanted);
    console.log('Renamed the placeholder mode to: ' + wanted);
    return collection.modes[0];
  }

  var newId = null;
  try {
    newId = collection.addMode(wanted);
  } catch (e) {
    throw new Error(
      'Mode limit reached for collection "' + collection.name + '": Figma allowed ' +
      collection.modes.length + ' mode(s), and "' + wanted + '" would be one more. ' +
      'The limit depends on your Figma plan.'
    );
  }
  console.log('Created mode: ' + wanted + ' in ' + collection.name);
  // By the id `addMode` hands back where there is one. Figma appends a suffix when a name collides,
  // so the mode that now exists is not always called what was asked for, and looking it up by name
  // would come back empty on exactly the file where that happened.
  var created = newId
    ? collection.modes.find(function(mode) { return mode.modeId === newId; })
    : null;
  return created || collection.modes.find(function(mode) {
    return String(mode.name).trim().toLowerCase() === wanted.toLowerCase();
  });
}

/**
 * What to say when a collection's modes are right but their order is not.
 *
 * The old wording told you to delete the collection and re-run. That trades **every binding in
 * every file** for cosmetic column order: a variable's id and its published key are minted at
 * creation, so deleting and recreating gives you new ones. Every node bound to the old variable
 * loses its binding, and any file subscribing to this as a library gets a "missing variable" it
 * cannot relink. Renaming is safe — id and key survive a rename — and update-in-place is the only
 * regeneration strategy that keeps a library alive.
 *
 * Pure, so the advice itself is testable.
 */
function modeOrderWarning(collectionName) {
  return 'Variable collection "' + collectionName + '": modes match your config but their order ' +
    'differs. Figma cannot reorder modes once a collection has variables.\n' +
    '  Recommended: live with the order. It is the column order in the Variables panel and ' +
    'nothing else — no value, binding or name depends on it.\n' +
    '  Do NOT delete and recreate the collection to fix it. Variable ids and published keys are ' +
    'minted at creation, so recreating breaks every binding in this file and leaves any file ' +
    'subscribing to this library with missing variables it cannot relink. Renaming is safe; ' +
    'deleting is not.';
}

/** Says so when the cost above would land in other files too. Fire and forget: advice, not flow. */
function reportPublishedCost(collection) {
  try {
    if (!collection || typeof collection.getPublishStatusAsync !== 'function') return;
    collection.getPublishStatusAsync().then(function(status) {
      if (status && status !== 'UNPUBLISHED') {
        console.warn('  "' + collection.name + '" is published (' + status + '), so deleting it ' +
          'would break subscribing files, not just this one.');
      }
    }).catch(function() {});
  } catch (e) {}
}

/**
 * Plan the mode changes for a collection, without making any.
 *
 * Pure — no Figma calls — so the rules are testable in Node (tests/foundation-modes.test.js).
 *
 * **Nothing is ever removed.** A mode this script does not recognise belongs to another
 * script or to the user: the Design System Foundations scripts share one collection and each
 * carries its own list of viewports, so "not in my list" never meant "safe to delete".
 * Figma gives no way to tell whether a mode holds anything either — adding a mode copies the
 * first mode's values, so every variable has an entry for every mode. Removal is therefore
 * not made smart, it is made explicit: see removeModes.
 *
 * state:  { name, modes: [{ modeId, name }], hasVariables }
 * returns { rename: { modeId, from, to } | null,
 *           add:    [names],   // not present, wanted
 *           keep:   [names],   // present and wanted
 *           extra:  [names],   // present, not wanted — left alone
 *           reorder: bool }
 */
function planModes(state, modeNames) {
  var wanted = modeNames || [];
  var modes = (state && state.modes) || [];
  var hasVariables = !!(state && state.hasVariables);
  var current = modes.map(function(m) { return m.name; });

  // Figma creates a collection with one default mode ("Mode 1"). Renaming it costs one mode
  // from the file's budget instead of two, keeps it as the default mode, and cannot delete
  // anything. Only while the collection is empty — renaming a populated mode would silently
  // relabel whatever is already stored in it.
  var rename = null;
  if (modes.length === 1 && !hasVariables && wanted.length > 0 && wanted.indexOf(current[0]) === -1) {
    rename = { modeId: modes[0].modeId, from: current[0], to: wanted[0] };
    current = [wanted[0]];
  }

  var keep = [];
  var add = [];
  wanted.forEach(function(name) {
    if (current.indexOf(name) !== -1) keep.push(name);
    else add.push(name);
  });

  var extra = current.filter(function(name) { return wanted.indexOf(name) === -1; });

  // Order can only be corrected by rebuilding the modes, which is safe only while the
  // collection holds no variables — there are no values yet to lose.
  var sameSet = add.length === 0 && extra.length === 0 && current.length === wanted.length;
  var orderOk = sameSet && wanted.every(function(n, idx) { return current[idx] === n; });

  return {
    rename: rename,
    add: add,
    keep: keep,
    extra: extra,
    reorder: sameSet && !orderOk && !hasVariables
  };
}

/**
 * Setup modes for a collection: apply the plan from planModes, and nothing else.
 *
 * Adds what is missing, renames Figma's default mode on a fresh collection, and reports
 * anything else the collection has rather than removing it. Returns the plan plus what was
 * actually applied — callers ignore it today, but a preview will not.
 */
function setupModes(collection, modeNames) {
  var wanted = modeNames || [];
  var state = {
    name: collection.name,
    modes: collection.modes.map(function(m) { return { modeId: m.modeId, name: m.name }; }),
    hasVariables: !!(collection.variableIds && collection.variableIds.length > 0)
  };
  var plan = planModes(state, wanted);
  var canRename = typeof collection.renameMode === 'function';
  var applied = { renamed: false, added: [], reordered: false };
  var blocked = [];
  var modeLimit = null;

  console.log('Setting up modes: ' + wanted.join(', '));

  var toAdd = plan.add.slice();
  if (plan.rename && canRename) {
    collection.renameMode(plan.rename.modeId, plan.rename.to);
    applied.renamed = true;
    console.log('Renamed default mode "' + plan.rename.from + '" to "' + plan.rename.to + '"');
  } else if (plan.rename) {
    // No renameMode on this API surface: add the mode instead and leave the default as extra.
    toAdd.unshift(plan.rename.to);
    plan.extra = plan.extra.concat([plan.rename.from]);
    plan.rename = null;
  }

  for (var i = 0; i < toAdd.length; i++) {
    try {
      collection.addMode(toAdd[i]);
      applied.added.push(toAdd[i]);
    } catch (e) {
      // addMode throws when the file's per-collection mode budget is spent, and the number
      // is not discoverable up front — so report the count at the point of failure rather
      // than a hardcoded table, and stop instead of crashing the run.
      modeLimit = collection.modes.length;
      blocked = toAdd.slice(i);
      console.error(
        'Mode limit reached for collection "' + collection.name + '": Figma allowed ' +
        modeLimit + ' modes on this plan. Modes not created: ' + blocked.join(', ')
      );
      break;
    }
  }

  if (plan.reorder && blocked.length === 0 && canRename) {
    // Safe only because the plan requires the same set of modes and no variables: the values
    // this rebuild would drop do not exist yet.
    while (collection.modes.length > 1) {
      collection.removeMode(collection.modes[collection.modes.length - 1].modeId);
    }
    collection.renameMode(collection.modes[0].modeId, wanted[0]);
    for (var r = 1; r < wanted.length; r++) {
      collection.addMode(wanted[r]);
    }
    applied.reordered = true;
    console.log('Modes reordered to match requested order (collection had no variables yet).');
  } else if (!plan.reorder && !plan.rename && plan.add.length === 0 && plan.extra.length === 0 &&
             wanted.length === state.modes.length &&
             !wanted.every(function(n, idx) { return state.modes[idx].name === n; })) {
    console.warn(modeOrderWarning(collection.name));
    reportPublishedCost(collection);
  }

  if (plan.extra.length > 0) {
    console.log(
      'Collection "' + collection.name + '" also has modes: ' + plan.extra.join(', ') +
      '. Left untouched — this script did not create them.'
    );
  }

  console.log('Modes setup complete: ' + collection.modes.map(function(m) {
    return m.name;
  }).join(', '));

  return {
    rename: plan.rename,
    add: plan.add,
    keep: plan.keep,
    extra: plan.extra,
    reorder: plan.reorder,
    applied: applied,
    blocked: blocked,
    modeLimit: modeLimit
  };
}

/**
 * Remove modes from a collection, deliberately.
 *
 * The explicit counterpart to setupModes, which never removes anything. Reached through
 * `applyModeIntents` below, from a panel where the removal was previewed with its consequence.
 * A mode's values go with it, and any binding to it is lost.
 *
 * Returns { removed: [names], skipped: [{ name, reason }] }.
 */
function removeModes(collection, modeNames) {
  var result = { removed: [], skipped: [] };
  var wanted = modeNames || [];

  for (var i = 0; i < wanted.length; i++) {
    var name = wanted[i];
    var mode = collection.modes.find(function(m) { return m.name === name; });

    if (!mode) {
      result.skipped.push({ name: name, reason: 'not found in collection "' + collection.name + '"' });
      continue;
    }
    if (collection.modes.length <= 1) {
      result.skipped.push({ name: name, reason: 'the last mode in a collection cannot be removed' });
      continue;
    }
    try {
      collection.removeMode(mode.modeId);
      result.removed.push(name);
      console.log('Removed mode "' + name + '" from collection "' + collection.name + '"');
    } catch (e) {
      result.skipped.push({ name: name, reason: (e && e.message) || String(e) });
    }
  }

  return result;
}


/**
 * Apply what the panel's mode chips said, before the rest of a run touches the collection.
 *
 * A chip is a **1:1 view of a Figma mode**, and the panel is the only place that knows which chip
 * came from which mode. The config block carries names only — deliberately, because a `modeId` is
 * file-specific and a pasted config must not carry one — so the intent travels out of band, from
 * the iframe through `window.codefigModeIntents`. What arrives:
 *
 *     { collection, renames: [{ modeId, from, to }], removals: [{ modeId, name }], additions: [names] }
 *
 * Three rules, and the second is the one that matters:
 *
 * 1. **A rename is a rename**, by `modeId`. `setupModes` matches on names, so without this a
 *    renamed chip reads as "a mode I have never seen" plus "a mode nobody asked about" — an add
 *    and an orphan, with every value and binding left behind on the orphan. This is the gap plan
 *    16a left open.
 * 2. **A removal happens only when it was asked for**, by `modeId`. A name the collection has and
 *    the config does not is *not* evidence: that is exactly what a pasted config from another file
 *    looks like, and deleting there would lose values nobody offered up. `setupModes` still never
 *    removes anything.
 * 3. **Additions need nothing here** — `setupModes` creates a mode it cannot find by name, which is
 *    what a chip with no `modeId` is.
 *
 * **Order: renames, then removals, then everything else.** Both happen before `setupModes` and before
 * a single value is written, and the reason is the gesture Márton named for replacing a mode: remove
 * it, then add one with the same name. With removals last that produced a *deletion* — `setupModes`
 * found the name still there and did nothing, then the removal took it away. Removing first means the
 * add creates a fresh mode, which is what was asked for, and the write pass then sees the final set of
 * modes rather than one that is about to change.
 *
 * The collection name is checked rather than trusted: a panel whose Collection field changed after a
 * chip was removed must not apply that removal to whatever is there now.
 */
function applyModeIntents(collection, intents) {
  var report = { renamed: [], removed: [], skipped: [], applied: false };
  if (!collection || !intents) return report;

  if (intents.collection && intents.collection !== collection.name) {
    report.skipped.push({
      name: intents.collection,
      reason: 'the intents were recorded for collection "' + intents.collection +
        '", and this run writes to "' + collection.name + '"'
    });
    return report;
  }
  report.applied = true;

  var renames = intents.renames || [];
  if (renames.length) {
    for (var i = 0; i < renames.length; i++) {
      var r = renames[i];
      var mode = collection.modes.filter(function (m) { return m.modeId === r.modeId; })[0];
      if (!mode) {
        // The mode is gone from the file since the panel read it. Not an error and not a reason to
        // create anything: `setupModes` will add the new name, which is the same outcome a fresh
        // chip would have had.
        report.skipped.push({ name: r.to, reason: 'no mode with that id is in the collection any more' });
        continue;
      }
      if (mode.name === r.to) continue;
      if (typeof collection.renameMode !== 'function') {
        report.skipped.push({ name: r.to, reason: 'this Figma version has no renameMode' });
        continue;
      }
      try {
        collection.renameMode(r.modeId, r.to);
        report.renamed.push({ from: mode.name, to: r.to });
        console.log('Renamed mode "' + mode.name + '" to "' + r.to + '" — values and bindings kept');
      } catch (e) {
        report.skipped.push({ name: r.to, reason: (e && e.message) || String(e) });
      }
    }
  }

  var removals = intents.removals || [];
  if (removals.length) {
    var names = [];
    for (var k = 0; k < removals.length; k++) {
      // By id, resolved to the name the collection holds *now* — a mode renamed since the panel read
      // it is still the same mode, and `removeModes` matches on name.
      var doomed = collection.modes.filter(function (m) { return m.modeId === removals[k].modeId; })[0];
      if (!doomed) {
        report.skipped.push({ name: removals[k].name, reason: 'already gone from the collection' });
        continue;
      }
      names.push(doomed.name);
    }
    if (names.length) {
      var out = removeModes(collection, names);
      report.removed = out.removed;
      report.skipped = report.skipped.concat(out.skipped);
    }
  }

  return report;
}

/**
 * Create or update a variable in a collection
 */
async function createOrUpdateVariable(collection, name, config, modes) {
  // Handle both old signature (type, values) and new signature (config, modes)
  var actualConfig, actualModes;
  
  if (typeof config === 'string') {
    // Old signature: createOrUpdateVariable(collection, name, type, values)
    actualConfig = { type: config, values: modes };
    actualModes = Object.keys(modes);
  } else {
    // New signature: createOrUpdateVariable(collection, name, config, modes)
    actualConfig = config;
    actualModes = modes;
  }
  
  name = normalizeVariableName(name);
  var existing = await getVariable(collection, name);

  if (existing && existing.remote) {
    console.warn('Skipping remote/library variable (cannot update locally): ' + name);
    return 'skipped';
  }

  if (existing && existing.resolvedType !== actualConfig.type) {
    console.warn(
      'Type mismatch for ' + name + ': existing ' + existing.resolvedType +
      ' vs expected ' + actualConfig.type + '. Skipping (delete the variable manually in Figma to recreate).'
    );
    return 'skipped';
  }

  var desiredScopes = (actualConfig.scopes && Array.isArray(actualConfig.scopes)) ? actualConfig.scopes : [];

  // Never remove or re-assign scopes on existing variables — both can trigger Figma's
  // editScope path and Aborted()-crash WASM when the variable is bound.
  if (existing && desiredScopes.length > 0 && !variableScopesMatch(existing.scopes, desiredScopes)) {
    console.warn(
      'Scope mismatch for ' + name + ': existing [' + (existing.scopes || []).join(', ') +
      '] vs expected [' + desiredScopes.join(', ') + ']. Updating values only.'
    );
  }

  var action = existing ? 'updated' : 'created';
  var isNew = !existing;

  if (!existing) {
    existing = figma.variables.createVariable(name, collection, actualConfig.type);
  }

  // Scopes must be set before values on new typography variables (FONT_WEIGHT etc.)
  if (isNew && desiredScopes.length > 0) {
    existing.scopes = desiredScopes;
  }

  // Set values for each mode
  actualModes.forEach(function(modeName) {
    try {
      var mode = collection.modes.find(function(m) { return m.name === modeName; });
      if (!mode) {
        console.error('Mode not found: ' + modeName);
        return;
      }
      
      if (actualConfig.values && actualConfig.values[modeName] !== undefined) {
        var value = actualConfig.values[modeName];
        
        // Validate value
        if (value === null || value === undefined) {
          console.error('Invalid value for mode ' + modeName + ': ' + value);
          return;
        }
        
        // Convert color strings to RGB objects
        if (actualConfig.type === 'COLOR' && typeof value === 'string') {
          value = hexToRgb(value);
          if (!value) {
            console.error('Invalid color value for mode ' + modeName + ': ' + actualConfig.values[modeName]);
            return;
          }
        }
        
        // Validate number values
        if (actualConfig.type === 'FLOAT' && (typeof value !== 'number' || isNaN(value))) {
          console.error('Invalid FLOAT value for mode ' + modeName + ': ' + value + ' (type: ' + typeof value + ')');
          return;
        }

        if (!isNew && variableValueEquals(existing, mode.modeId, value)) {
          return;
        }
        
        existing.setValueForMode(mode.modeId, value);
        console.log('  ' + modeName + ': ' + (actualConfig.type === 'COLOR' ? rgbToHex(value.r, value.g, value.b) : value));
      }
    } catch (e) {
      console.error('Error setting value for mode ' + modeName + ':', e);
      console.error('Error details:', {
        message: e.message,
        stack: e.stack,
        name: e.name,
        error: e,
        value: actualConfig.values ? actualConfig.values[modeName] : 'undefined',
        type: actualConfig.type
      });
    }
  });
  
  return action;
}

/**
 * Extract modes from a configuration
 */
function extractModes(config) {
  // Get modes from the first variable's values
  var firstVariable = Object.keys(config.variables)[0];
  if (firstVariable && config.variables[firstVariable].values) {
    return Object.keys(config.variables[firstVariable].values);
  }
  return ["Default"];
}

/**
 * The values a variable should carry, one entry per requested mode.
 *
 * `values[mode]` may be a literal or a `function(configValues)`; a function that throws is
 * rethrown so processVariables can count the variable as skipped.
 *
 * Presence is tested with hasOwnProperty, not truthiness: `0`, `""` and `false` are values.
 * Dropping them here meant "set this token to zero" silently did nothing — createOrUpdateVariable
 * guards on `!== undefined`, so a value that never arrives is a value that is never written.
 */
function resolveModeValues(varConfig, modes, configValues) {
  var values = {};
  if (!varConfig || !varConfig.values) return values;

  (modes || []).forEach(function(mode) {
    if (!Object.prototype.hasOwnProperty.call(varConfig.values, mode)) return;
    var value = varConfig.values[mode];
    try {
      values[mode] = (typeof value === 'function') ? value(configValues) : value;
    } catch (e) {
      console.error('Error calculating value for mode ' + mode + ':', e);
      throw e;
    }
  });

  return values;
}

/**
 * Process multiple variables
 */
async function processVariables(collection, variables, configValues, modes) {
  var stats = { created: 0, updated: 0, skipped: 0 };
  
  console.log('Processing ' + Object.keys(variables).length + ' variables...');
  
  var varNames = Object.keys(variables);
  for (var idx = 0; idx < varNames.length; idx++) {
    var varName = varNames[idx];
    try {
      var varConfig = variables[varName];
      console.log('Processing variable: ' + varName);
      
      var calculatedConfig = {
        type: varConfig.type,
        values: resolveModeValues(varConfig, modes, configValues)
      };
      if (varConfig.scopes && Array.isArray(varConfig.scopes)) {
        calculatedConfig.scopes = varConfig.scopes;
      }


      var result = await createOrUpdateVariable(collection, varName, calculatedConfig, modes);
      if (result === 'skipped') {
        stats.skipped++;
      } else {
        stats[result]++;
      }
    } catch (e) {
      console.error('Error processing variable ' + varName + ':', e);
      console.error('Error details:', {
        message: e.message,
        stack: e.stack,
        name: e.name,
        error: e
      });
      stats.skipped++;
    }
  }
  
  return stats;
}

// Helper functions for color conversion (needed by createOrUpdateVariable)
function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : null;
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (Math.round(r * 255) << 16) + (Math.round(g * 255) << 8) + Math.round(b * 255)).toString(16).slice(1);
}

// ============================================================================
// VARIABLE ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Collect variables from a node and add to the usedVariables Map (async for getVariableByIdAsync)
 */
async function collectNodeVariables(node, usedVariables) {
  try {
    if (!node || !node.boundVariables || typeof node.boundVariables !== 'object') return;
    
    for (var property in node.boundVariables) {
      try {
        var binding = node.boundVariables[property];
        if (!binding) continue;
        
        var variableId = binding.id || (binding[0] && binding[0].id);
        if (!variableId) continue;
        
        var variable = await figma.variables.getVariableByIdAsync(variableId);
        if (!variable || !variable.name) continue;
        
        var key = variable.name + '::' + property;
        if (!usedVariables.has(key)) {
          usedVariables.set(key, {
            variable: variable,
            property: property,
            nodes: [],
            nodeIds: []
          });
        }
        
        var varData = usedVariables.get(key);
        if (varData && Array.isArray(varData.nodes) && Array.isArray(varData.nodeIds)) {
          varData.nodes.push(node.name || 'Unnamed');
          varData.nodeIds.push(node.id);
        }
      } catch (e) {
        console.warn('Error processing variable binding for property ' + property + ' on node ' + node.id + ':', e.message);
      }
    }
  } catch (e) {
    console.warn('Error collecting variables from node ' + (node ? node.id : 'unknown') + ':', e.message);
  }
}

/**
 * Categorize a variable by its name and property
 */
function categorizeVariable(variableName, property) {
  var name = variableName.toLowerCase();
  var prop = property.toLowerCase();
  
  // Typography
  if (prop.includes('font') || prop.includes('text') || name.includes('typography') || name.includes('font')) {
    return 'typography';
  }
  
  // Color
  if (prop.includes('color') || prop.includes('fill') || prop.includes('stroke') || name.includes('color')) {
    return 'color';
  }
  
  // Dimensions
  if (prop.includes('width') || prop.includes('height') || prop.includes('padding') || prop.includes('margin') || 
      prop.includes('radius') || prop.includes('gap') || prop.includes('spacing') || name.includes('spacing') || 
      name.includes('padding') || name.includes('margin') || name.includes('radius')) {
    return 'dimensions';
  }
  
  // Grid
  if (name.includes('grid') || name.includes('column') || name.includes('row')) {
    return 'grid';
  }
  
  // Effects
  if (prop.includes('effect') || prop.includes('shadow') || prop.includes('blur') || name.includes('effect') || 
      name.includes('shadow') || name.includes('blur')) {
    return 'effects';
  }
  
  // Default to dimensions for unknown
  return 'dimensions';
}

/**
 * Create a variable result for display
 */
function createVariableResult(varData) {
  try {
    if (!varData || !varData.variable || !varData.property) {
      return createHtmlResult('<div class="error-text">❌ Invalid variable data</div>');
    }
    
    var variable = varData.variable;
    var property = varData.property;
    var nodes = varData.nodes || [];
    var nodeIds = varData.nodeIds || [];
    
    var html = [];
    html.push('<div class="info-entry" onclick="selectNodes([\'' + nodeIds.join('\',\'') + '\'])">');
    html.push('  <div class="info-entry-icon">📊</div>');
    html.push('  <div class="info-entry-content">');
    html.push('    <div class="info-entry-title">' + (variable.name || 'Unknown Variable') + '</div>');
    html.push('    <div class="info-entry-subtitle">' + (property || 'Unknown Property') + '</div>');
    
    // Add visual preview for variables
    try {
      var preview = createVariablePreview(variable, property);
      if (preview) {
        html.push('    <div class="variable-preview">' + preview + '</div>');
      }
    } catch (e) {
      console.warn('Error creating variable preview:', e.message);
    }
    
    if (nodes.length > 0) {
      html.push('    <div class="info-entry-badge">' + nodes.length + ' node' + (nodes.length !== 1 ? 's' : '') + '</div>');
    }
    
    html.push('  </div>');
    html.push('</div>');
    
    return createHtmlResult(html.join(''));
  } catch (e) {
    console.warn('Error creating variable result:', e.message);
    return createHtmlResult('<div class="error-text">❌ Error displaying variable</div>');
  }
}

/**
 * Create a visual preview for a variable
 */
function createVariablePreview(variable, property) {
  try {
    if (!variable || !property) return null;
    
    // Get the first mode value for preview
    var modeIds = Object.keys(variable.valuesByMode);
    if (modeIds.length === 0) return null;
    
    var value = variable.valuesByMode[modeIds[0]];
    if (!value) return null;
    
    var preview = '';
    
    // Color variables
    if (property.includes('fill') || property.includes('stroke') || property.includes('color')) {
      if (value.type === 'VARIABLE_ALIAS') {
        preview = '<div class="color-preview" style="background-color: var(--' + value.id + '); width: 20px; height: 20px; border-radius: 3px; display: inline-block; margin-right: 8px;"></div>';
      } else if (value.type === 'VARIABLE_ALIAS') {
        preview = '<div class="color-preview" style="background-color: var(--' + value.id + '); width: 20px; height: 20px; border-radius: 3px; display: inline-block; margin-right: 8px;"></div>';
      }
    }
    
    // Typography variables
    if (property.includes('font') || property.includes('text')) {
      if (value.type === 'VARIABLE_ALIAS') {
        preview = '<span class="typography-preview" style="font-family: var(--' + value.id + '); font-size: 12px;">Aa</span>';
      }
    }
    
    return preview;
  } catch (e) {
    console.warn('Error creating variable preview:', e.message);
    return null;
  }
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAllCollections,
    getCollection,
    getVariable,
    getVariableValue,
    setVariableValue,
    getCollectionVariables,
    getCollectionModes,
    getModeByName,
    findVariablesByPattern,
    findSmartVariables,
    extractFunctionFromDescription,
    updateMultipleVariables,
    getModeValues,
    setModeValues,
    createVariable,
    createVariablesFromConfig,
    getCollectionSummary,
    validateCollection,
    exportCollectionData,
    logCollectionInfo,
    logVariableValues,
    getOrCreateCollection,
    setupModes,
    createOrUpdateVariable,
    extractModes,
    processVariables,
    
    // Variable Analysis Functions
    collectNodeVariables,
    categorizeVariable,
    createVariableResult,
    createVariablePreview
  };
}
