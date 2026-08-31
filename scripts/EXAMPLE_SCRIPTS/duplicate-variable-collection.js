// Duplicate variable collection
// @DOC_START
// Clones a local variable collection (modes, variables, values, descriptions, scopes, and any DSF
// set the source collection carries).
//
// ## Overview
// Finds a collection by name, creates a new collection with the given new name, copies all modes and variables with their values and metadata. No recursive option; run once per copy.
//
// Figma has no native way to duplicate a collection, which is why this script exists. Because of
// that, it is also the only place a DSF set's record can be carried across the copy — nothing else
// runs when a collection is duplicated. A source with no DSF set copies exactly as before; there
// is nothing extra to carry.
//
// **Copies the intent, not the identity.** Every set the source collection has a manifest for
// (Colors, Grid, Spacing, Radius, Typography — whichever are present) is copied to the duplicate
// with its config, tokens and modes intact, but under a **new, freshly minted set id** — carrying
// the source's id over would file one set under two collections, which `readFoundation` counts as
// two sets rather than one copied. The duplicate's variables are re-stamped to match, so the new
// set's identity is consistent with itself from the moment it exists.
//
// ## Config options
// | Option | Description |
// |--------|--------------|
// | sourceCollectionName | Exact name of the collection to duplicate. |
// | newCollectionName | Name for the new collection. |
//
// **Not a search pattern.** `sourceCollectionName` is a collection picker — compared with `===`, not with the
// `*` / regex matching used by the CodeFig find/replace scripts. Deliberate: this is an
// identifier, not a search.
// @DOC_END

// @UI_CONFIG_START
var sourceCollectionName = 'website V3';
var newCollectionName = '';
// @UI_CONFIG_END

// @PANEL_START
// {
//   blocks: [
//     { type: "paragraph", attachTo: "next", text: "Source collection (choose from existing). New name for the copy." },
//     { key: "sourceCollectionName", type: "select", options: "localVariableCollections" },
//     { key: "newCollectionName", type: "string", placeholder: "website V4" }
//   ]
// }
// @PANEL_END

@import { foundationNamespace, parseManifest, writeManifest, foundationMintSetId, foundationSetIdFromKey, foundationModeIds, stampToken, readStamp } from "@Foundation"

async function duplicateVariableCollection(collection, newName) {
  var newCollection = figma.variables.createVariableCollection(newName || collection.name + ' Copy');

  if (collection.modes[0]) {
    newCollection.renameMode(newCollection.modes[0].modeId, collection.modes[0].name);
  }
  var modesToCopy = collection.modes.slice(1);
  modesToCopy.forEach(function(mode) {
    newCollection.addMode(mode.name);
  });

  // Kept alongside the copy loop rather than looked up again after: `readStamp` reads the
  // *source* variable, and there is no other record connecting a new variable back to the one it
  // was copied from once the loop ends.
  var newVarByOriginalId = {};
  var stampByOriginalId = {};

  for (var i = 0; i < collection.variableIds.length; i++) {
    var variableId = collection.variableIds[i];
    var originalVar = await figma.variables.getVariableByIdAsync(variableId);
    if (originalVar) {
      var newVar = figma.variables.createVariable(originalVar.name, newCollection, originalVar.resolvedType);

      if (originalVar.description) {
        newVar.description = originalVar.description;
      }

      if (originalVar.scopes && originalVar.scopes.length > 0) {
        newVar.scopes = originalVar.scopes.slice();
      }

      collection.modes.forEach(function(originalMode, modeIndex) {
        var value = originalVar.valuesByMode[originalMode.modeId];
        if (value !== undefined) {
          var targetMode = modeIndex === 0 ? newCollection.modes[0] : newCollection.modes[modeIndex];
          if (targetMode) {
            newVar.setValueForMode(targetMode.modeId, value);
          }
        }
      });

      newVarByOriginalId[originalVar.id] = newVar;
      stampByOriginalId[originalVar.id] = readStamp(originalVar);
    }
  }

  // Every DSF set the source collection has a manifest for, not just one domain — a collection can
  // carry Colors and Spacing and Radius at once, and a copy that only noticed the first would leave
  // the others exactly as unfindable as no fix at all.
  var ns = foundationNamespace();
  var sourceKeys = collection.getSharedPluginDataKeys(ns) || [];
  var mintedIdByOldId = {};
  for (var k = 0; k < sourceKeys.length; k++) {
    if (sourceKeys[k].indexOf('set:') !== 0) continue;
    var read = parseManifest(collection.getSharedPluginData(ns, sourceKeys[k]));
    if (!read.manifest) continue;
    var oldId = read.manifest.id || foundationSetIdFromKey(sourceKeys[k]);
    var newId = foundationMintSetId();
    mintedIdByOldId[oldId] = newId;
    writeManifest(newCollection, {
      id: newId,
      domain: read.manifest.domain,
      group: read.manifest.group,
      modes: read.manifest.modes,
      // Re-derived on the new collection by mode name, not copied: Figma mints its own mode ids for
      // every mode here, even the ones sharing a name with the source's.
      modeIds: foundationModeIds(newCollection, Object.keys(read.manifest.modeIds || {})),
      tokens: read.manifest.tokens,
      config: read.manifest.config
    });
  }

  // Re-stamp: same token identity as the source variable carried, filed under the new set id so a
  // read of the duplicate resolves to the set that was just written above, not to the source's.
  // A stamp whose set id has no matching manifest above (stamped by an older run than the one on
  // record, or the source predates manifests) is left as it was rather than guessed at.
  for (var originalId in stampByOriginalId) {
    var stamp = stampByOriginalId[originalId];
    if (!stamp) continue;
    var mappedSetId = mintedIdByOldId[stamp.set];
    if (!mappedSetId) continue;
    stampToken(newVarByOriginalId[originalId], stamp.domain, stamp.token, stamp.rev, mappedSetId);
  }

  return newCollection;
}

// Execute
(async function() {
  var localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  var collection = localCollections.find(function(c) {
    return c.name === sourceCollectionName;
  });
  if (collection) {
    await duplicateVariableCollection(collection, newCollectionName);
    figma.notify('Collection duplicated with all properties!');
  } else {
    figma.notify('Collection not found');
  }
})();
