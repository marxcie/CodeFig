/**
 * CodeFig script storage — pure serialize / path / envelope helpers.
 *
 * Plan: `.plans/38-script-storage-variables.md`
 *
 * Collection: "CodeFig Scripts"
 *
 * Variable names mirror the CodeFig sidebar (group + name), using `/` the same
 * way Figma groups variables:
 *   "Scale to print"                         → ungrouped
 *   "Custom scripts/Scale to print"          ← CodeFig "Custom scripts / Scale to print"
 *
 * Value is the **raw script source** (real newlines) so canvas SRC can bind and
 * stay readable. Id / type / chunk meta live on the variable **description**:
 *   codefig-id:s-…;type:user;parts:1;i:0
 * Oversized bodies split across `Name/~1`, `Name/~2`, … (continuation chunks).
 *
 * Legacy: JSON envelope still readable in the value (`{ "v": 2, "id", "code" }`).
 * Export JSON uses the same envelope shape (+ `name`) for Sync/backup identity.
 *
 * Legacy v1 (`@index` + `@script/{id}/{n}`) is still readable for one-shot
 * migrate-to-path. New writes never create it.
 *
 * Scopes = TEXT_CONTENT so SRC can bind; not offered for fills/gaps/etc.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CodeFigScriptStorage = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Local / published collection that holds script STRING variables. */
  var COLLECTION_NAME = 'CodeFig Scripts';

  /** Legacy v1 manifest variable — read for migrate, never written by new saves. */
  var INDEX_VARIABLE = '@index';

  /**
   * Split a body when a chunk would exceed this many characters.
   * Well under typical STRING-variable pressure; not a measured Figma hard cap.
   */
  var CHUNK_CHAR_LIMIT = 90000;

  /** Envelope / index schema version. New writes use ENVELOPE_VERSION. */
  var INDEX_VERSION = 1;
  var ENVELOPE_VERSION = 2;

  /** Text content only — canvas SRC binding; hide from layout/fill pickers. */
  var SCRIPT_VARIABLE_SCOPES = ['TEXT_CONTENT'];

  /** Prefix for id stashed on Variable.description (not a second mode). */
  var DESCRIPTION_ID_KEY = 'codefig-id';

  // ---------------------------------------------------------------------------
  // Path / name (CodeFig display ↔ Figma variable path)
  // ---------------------------------------------------------------------------

  /**
   * One path segment for a Figma variable name.
   * Keeps spaces and case (matches the sidebar). Strips `.` `{}` `/` which Figma
   * rejects or which would create extra groups.
   */
  function sanitizePathSegment(raw) {
    var s = String(raw == null ? '' : raw)
      .replace(/[.{}\/]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^-+|-+$/g, '')
      .trim();
    return s || 'x';
  }

  /**
   * CodeFig display name → Figma variable path.
   * "Custom scripts / Scale to print" → "Custom scripts/Scale to print"
   * "Scale to print" → "Scale to print"
   */
  function displayNameToVariablePath(name) {
    var n = String(name == null ? '' : name).trim();
    if (!n) return 'x';
    var parts = n.split(/\s*\/\s*/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var seg = sanitizePathSegment(parts[i]);
      if (seg) out.push(seg);
    }
    return out.length ? out.join('/') : 'x';
  }

  /**
   * Figma variable path → CodeFig display name.
   * "Custom scripts/Scale to print" → "Custom scripts / Scale to print"
   * Strips a trailing `/~N` continuation suffix before converting.
   */
  function variablePathToDisplayName(path) {
    var p = primaryVariablePath(path);
    if (!p) return '';
    return p.split('/').join(' / ');
  }

  /** True when `path` is a continuation chunk (`…/~1`, `…/~2`, …). */
  function isContinuationPath(path) {
    return /\/~\d+$/.test(String(path == null ? '' : path));
  }

  /** Strip `/~N` continuation suffix; identity for primary paths. */
  function primaryVariablePath(path) {
    var p = String(path == null ? '' : path);
    return p.replace(/\/~\d+$/, '');
  }

  /** Continuation key for primary path and 1-based chunk index. */
  function continuationPath(primaryPath, i) {
    var n = Math.floor(Number(i));
    if (!(n >= 1)) throw new Error('continuationPath: i must be >= 1');
    return primaryVariablePath(primaryPath) + '/~' + n;
  }

  /**
   * Legacy id-based chunk key (v1). Kept for migrate-from-@index only.
   * New writes use displayNameToVariablePath.
   */
  function scriptChunkKey(id, n) {
    var i = Math.floor(Number(n));
    if (!(i >= 0) || i !== Number(n)) {
      throw new Error('scriptChunkKey: n must be a non-negative integer');
    }
    return '@script/' + sanitizePathSegmentLegacyId(id) + '/' + i;
  }

  /** Legacy library prefix (reserved; unused by path writes). */
  function libraryChunkPrefix(libraryName) {
    var name = String(libraryName == null ? '' : libraryName).trim();
    if (name.charAt(0) === '@') name = name.slice(1);
    return '@lib/' + sanitizePathSegmentLegacyId(name);
  }

  function libraryChunkKey(libraryName, n) {
    var i = Math.floor(Number(n));
    if (!(i >= 0) || i !== Number(n)) {
      throw new Error('libraryChunkKey: n must be a non-negative integer');
    }
    return libraryChunkPrefix(libraryName) + '/' + i;
  }

  /** Old id sanitizer: lowercase kebab (v1 ids / @lib paths). */
  function sanitizePathSegmentLegacyId(raw) {
    var s = String(raw == null ? '' : raw)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return s || 'x';
  }

  // ---------------------------------------------------------------------------
  // Chunk / join
  // ---------------------------------------------------------------------------

  function chunkBody(body, limit) {
    var text = body == null ? '' : String(body);
    var max = limit == null ? CHUNK_CHAR_LIMIT : Math.floor(Number(limit));
    if (!(max > 0)) {
      throw new Error('chunkBody: limit must be a positive integer');
    }
    if (text.length === 0) return [''];
    if (text.length <= max) return [text];
    var out = [];
    for (var i = 0; i < text.length; i += max) {
      out.push(text.slice(i, i + max));
    }
    return out;
  }

  function joinChunks(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return '';
    var parts = [];
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      parts.push(c == null ? '' : String(c));
    }
    return parts.join('');
  }

  // ---------------------------------------------------------------------------
  // Envelope (v2) — id + code in the STRING value
  // ---------------------------------------------------------------------------

  function inferType(name, type) {
    var n = String(name == null ? '' : name);
    if (n.charAt(0) === '@') return 'library';
    if (type === 'library' || type === 'user') return type;
    return 'user';
  }

  /**
   * Parse one variable's STRING value. Returns null if empty / not an envelope.
   * Accepts raw JS (no envelope) as `{ v:0, id:null, code: raw }` for recovery.
   */
  function parseEnvelope(raw) {
    if (raw == null) return null;
    var text = String(raw);
    if (text === '') return null;
    try {
      var data = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      if (data.v !== ENVELOPE_VERSION && data.v !== 2) {
        // Unknown envelope — ignore rather than treat as source.
        if (data.v != null) return null;
      }
      var code = data.code == null ? '' : String(data.code);
      var id = data.id != null && String(data.id).trim() !== ''
        ? String(data.id).trim()
        : null;
      var i = data.i != null ? Math.floor(Number(data.i)) : 0;
      var parts = data.parts != null ? Math.floor(Number(data.parts)) : 1;
      if (!(parts >= 1)) parts = 1;
      if (!(i >= 0)) i = 0;
      return {
        v: ENVELOPE_VERSION,
        id: id,
        code: code,
        i: i,
        parts: parts,
        type: data.type === 'library' || data.type === 'user' ? data.type : null
      };
    } catch (e) {
      // Not JSON — treat as a raw script body (pre-envelope accident / hand edit).
      return { v: 0, id: null, code: text, i: 0, parts: 1, type: null };
    }
  }

  function serializeEnvelope(parts) {
    var body = {
      v: ENVELOPE_VERSION,
      id: parts.id,
      code: parts.code == null ? '' : String(parts.code)
    };
    if (parts.type === 'library' || parts.type === 'user') body.type = parts.type;
    if (parts.name != null && String(parts.name).trim() !== '') {
      body.name = String(parts.name).trim();
    }
    var i = parts.i != null ? Math.floor(Number(parts.i)) : 0;
    var n = parts.parts != null ? Math.floor(Number(parts.parts)) : 1;
    if (n > 1) {
      body.parts = n;
      body.i = i;
    }
    return JSON.stringify(body);
  }

  /**
   * Variable.description carrier for id (and chunk meta). Value stays raw source.
   * Example: "codefig-id:s-abc;type:user;parts:2;i:0"
   */
  function serializeScriptDescription(meta) {
    if (!meta || typeof meta !== 'object') return '';
    var id = meta.id != null ? String(meta.id).trim() : '';
    if (!id) return '';
    var parts = ['codefig-id:' + id];
    if (meta.type === 'library' || meta.type === 'user') {
      parts.push('type:' + meta.type);
    }
    var n = meta.parts != null ? Math.floor(Number(meta.parts)) : 1;
    var i = meta.i != null ? Math.floor(Number(meta.i)) : 0;
    if (n > 1) {
      parts.push('parts:' + n);
      parts.push('i:' + i);
    }
    return parts.join(';');
  }

  function parseScriptDescription(raw) {
    var text = String(raw == null ? '' : raw).trim();
    var out = { id: null, type: null, parts: 1, i: 0 };
    if (!text) return out;
    var chunks = text.split(';');
    for (var c = 0; c < chunks.length; c++) {
      var piece = String(chunks[c] || '').trim();
      if (!piece) continue;
      var colon = piece.indexOf(':');
      if (colon <= 0) continue;
      var key = piece.slice(0, colon).trim();
      var val = piece.slice(colon + 1).trim();
      if (key === 'codefig-id' || key === DESCRIPTION_ID_KEY) {
        out.id = val || null;
      } else if (key === 'type' && (val === 'library' || val === 'user')) {
        out.type = val;
      } else if (key === 'parts') {
        var n = Math.floor(Number(val));
        if (n >= 1) out.parts = n;
      } else if (key === 'i') {
        var idx = Math.floor(Number(val));
        if (idx >= 0) out.i = idx;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Plan write / read (path-based)
  // ---------------------------------------------------------------------------

  /**
   * Plan a write: Figma variable path(s) + raw source values + description meta.
   * `entry` carries display name, id, type, and chunkKeys (variable paths).
   */
  function planScriptWrite(script) {
    if (!script || typeof script !== 'object') {
      throw new Error('planScriptWrite: script object required');
    }
    var id = script.id != null ? String(script.id).trim() : '';
    var name = script.name != null ? String(script.name).trim() : '';
    if (!id) throw new Error('planScriptWrite: id required');
    if (!name) throw new Error('planScriptWrite: name required');
    var code = script.code == null ? '' : String(script.code);
    var type = inferType(name, script.type);
    var primary = displayNameToVariablePath(name);
    var limit = script.limit != null
      ? Math.floor(Number(script.limit))
      : CHUNK_CHAR_LIMIT;
    if (!(limit > 0)) limit = CHUNK_CHAR_LIMIT;
    var chunks = chunkBody(code, limit);
    var chunkKeys = [primary];
    for (var c = 1; c < chunks.length; c++) {
      chunkKeys.push(continuationPath(primary, c));
    }
    var variables = [];
    for (var i = 0; i < chunks.length; i++) {
      variables.push({
        key: chunkKeys[i],
        value: chunks[i],
        description: serializeScriptDescription({
          id: id,
          type: type,
          i: i,
          parts: chunks.length
        })
      });
    }
    return {
      entry: {
        id: id,
        name: name,
        type: type,
        path: primary,
        chunkKeys: chunkKeys
      },
      variables: variables
    };
  }

  /**
   * Reassemble code for one primary path from a name→value map.
   * Optional descriptionByKey supplies parts count when values are raw.
   */
  function readScriptBodyFromPath(primaryPath, valueByKey, descriptionByKey) {
    var map = valueByKey && typeof valueByKey === 'object' ? valueByKey : {};
    var descMap =
      descriptionByKey && typeof descriptionByKey === 'object' ? descriptionByKey : {};
    var primary = primaryVariablePath(primaryPath);
    var first = parseEnvelope(map[primary]);
    if (!first) return '';
    var parts;
    if (first.v === ENVELOPE_VERSION) {
      parts = first.parts >= 1 ? first.parts : 1;
    } else {
      var meta = parseScriptDescription(descMap[primary]);
      parts = meta.parts >= 1 ? meta.parts : 1;
    }
    var chunks = [first.code];
    for (var i = 1; i < parts; i++) {
      var env = parseEnvelope(map[continuationPath(primary, i)]);
      chunks.push(env ? env.code : '');
    }
    return joinChunks(chunks);
  }

  /**
   * Legacy: reassemble from an index entry's chunkKeys (v1 @script/… keys).
   */
  function readScriptBody(entry, valueByKey) {
    if (entry && entry.path) {
      return readScriptBodyFromPath(entry.path, valueByKey);
    }
    var e = normalizeIndexEntry(entry);
    if (!e) return '';
    var map = valueByKey && typeof valueByKey === 'object' ? valueByKey : {};
    var chunks = [];
    for (var i = 0; i < e.chunkKeys.length; i++) {
      var key = e.chunkKeys[i];
      var raw = map[key];
      // v1 stored raw code; v2 stores envelopes — accept both.
      var env = parseEnvelope(raw);
      if (env && env.v === ENVELOPE_VERSION) chunks.push(env.code);
      else chunks.push(raw == null ? '' : String(raw));
    }
    return joinChunks(chunks);
  }

  /**
   * Scan a collection's name→value map into LIST items + entries.
   * Optional descriptionByKey supplies id when values are raw source.
   * Skips legacy `@index` / `@script/…` / `@lib/…` and continuation `/~N` keys
   * (continuations are folded into their primary).
   */
  function listScriptsFromValues(valueByKey, descriptionByKey) {
    var map = valueByKey && typeof valueByKey === 'object' ? valueByKey : {};
    var descMap =
      descriptionByKey && typeof descriptionByKey === 'object' ? descriptionByKey : {};
    var scripts = [];
    var listItems = [];
    var keys = Object.keys(map);
    keys.sort();
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === INDEX_VARIABLE) continue;
      if (key.indexOf('@script/') === 0 || key.indexOf('@lib/') === 0) continue;
      if (isContinuationPath(key)) continue;
      var raw = map[key];
      if (raw == null || String(raw) === '') continue;
      var env = parseEnvelope(raw);
      if (!env) continue;
      var desc = parseScriptDescription(descMap[key]);
      // Continuations mis-filed as primaries (i > 0) — skip.
      if (env.v === ENVELOPE_VERSION && env.i > 0) continue;
      if (env.v !== ENVELOPE_VERSION && desc.i > 0) continue;
      var name = variablePathToDisplayName(key);
      var type = inferType(name, (env.v === ENVELOPE_VERSION && env.type) || desc.type);
      var code = readScriptBodyFromPath(key, map, descMap);
      var id =
        (env.v === ENVELOPE_VERSION && env.id) || desc.id || null;
      var parts =
        env.v === ENVELOPE_VERSION
          ? env.parts >= 1
            ? env.parts
            : 1
          : desc.parts >= 1
            ? desc.parts
            : 1;
      var chunkKeys = [key];
      for (var c = 1; c < parts; c++) chunkKeys.push(continuationPath(key, c));
      scripts.push({
        id: id,
        name: name,
        type: type,
        path: key,
        chunkKeys: chunkKeys
      });
      listItems.push({ name: name, code: code, type: type, id: id });
    }
    return { scripts: scripts, listItems: listItems };
  }

  /**
   * Keys to clear when replacing/removing a script (previous paths no longer used).
   */
  function orphanedKeysFor(previousChunkKeys, nextChunkKeys) {
    var orphanedKeys = [];
    var keep = Object.create(null);
    var next = Array.isArray(nextChunkKeys) ? nextChunkKeys : [];
    for (var k = 0; k < next.length; k++) keep[next[k]] = true;
    var prev = Array.isArray(previousChunkKeys) ? previousChunkKeys : [];
    for (var p = 0; p < prev.length; p++) {
      if (prev[p] && !keep[prev[p]]) orphanedKeys.push(prev[p]);
    }
    return orphanedKeys;
  }

  function findEntryByName(scripts, name) {
    var want = String(name == null ? '' : name);
    var list = Array.isArray(scripts) ? scripts : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].name === want) return list[i];
    }
    return null;
  }

  function findEntryByPath(scripts, path) {
    var want = primaryVariablePath(path);
    var list = Array.isArray(scripts) ? scripts : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && primaryVariablePath(list[i].path || '') === want) return list[i];
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Legacy v1 index (migrate only)
  // ---------------------------------------------------------------------------

  function chunkKeysFor(id, chunkCount) {
    var count = Math.floor(Number(chunkCount));
    if (!(count >= 1)) count = 1;
    var keys = [];
    for (var i = 0; i < count; i++) keys.push(scriptChunkKey(id, i));
    return keys;
  }

  function normalizeIndexEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = raw.id != null ? String(raw.id).trim() : '';
    var name = raw.name != null ? String(raw.name).trim() : '';
    if (!id || !name) return null;
    var type = inferType(name, raw.type);
    var chunkKeys;
    if (Array.isArray(raw.chunkKeys) && raw.chunkKeys.length > 0) {
      chunkKeys = [];
      for (var i = 0; i < raw.chunkKeys.length; i++) {
        var k = raw.chunkKeys[i];
        if (k == null || String(k).trim() === '') return null;
        chunkKeys.push(String(k));
      }
    } else if (raw.path) {
      chunkKeys = [String(raw.path)];
    } else {
      chunkKeys = chunkKeysFor(id, 1);
    }
    var entry = { id: id, name: name, type: type, chunkKeys: chunkKeys };
    if (raw.path) entry.path = String(raw.path);
    return entry;
  }

  function parseIndex(json) {
    if (json == null || json === '') {
      return { v: INDEX_VERSION, scripts: [] };
    }
    var data;
    try {
      data = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
      return { v: INDEX_VERSION, scripts: [] };
    }
    var list;
    if (Array.isArray(data)) {
      list = data;
    } else if (data && typeof data === 'object' && Array.isArray(data.scripts)) {
      list = data.scripts;
    } else {
      return { v: INDEX_VERSION, scripts: [] };
    }
    var scripts = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var entry = normalizeIndexEntry(list[i]);
      if (!entry) continue;
      if (seen[entry.id]) continue;
      seen[entry.id] = true;
      scripts.push(entry);
    }
    var v =
      data && typeof data === 'object' && !Array.isArray(data) && data.v != null
        ? Number(data.v) || INDEX_VERSION
        : INDEX_VERSION;
    return { v: v, scripts: scripts };
  }

  function serializeIndex(indexOrScripts) {
    var parsed = parseIndex(
      Array.isArray(indexOrScripts)
        ? { v: INDEX_VERSION, scripts: indexOrScripts }
        : indexOrScripts
    );
    return JSON.stringify({ v: INDEX_VERSION, scripts: parsed.scripts });
  }

  function upsertIndexEntry(scripts, entry, previousChunkKeys) {
    var next = normalizeIndexEntry(entry);
    if (!next) throw new Error('upsertIndexEntry: invalid entry');
    var list = Array.isArray(scripts) ? scripts.slice() : [];
    var found = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === next.id) {
        found = i;
        break;
      }
    }
    var prevKeys =
      previousChunkKeys != null
        ? previousChunkKeys
        : found >= 0
          ? list[found].chunkKeys
          : [];
    var orphanedKeys = orphanedKeysFor(prevKeys, next.chunkKeys);
    if (found >= 0) list[found] = next;
    else list.push(next);
    return { scripts: list, orphanedKeys: orphanedKeys };
  }

  function removeIndexEntry(scripts, id) {
    var want = String(id == null ? '' : id);
    var list = Array.isArray(scripts) ? scripts : [];
    var orphanedKeys = [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === want) {
        var keys = list[i].chunkKeys || [];
        for (var j = 0; j < keys.length; j++) {
          if (keys[j]) orphanedKeys.push(keys[j]);
        }
      } else {
        out.push(list[i]);
      }
    }
    return { scripts: out, orphanedKeys: orphanedKeys };
  }

  /**
   * Plan rewriting legacy @index/@script entries into path-named envelopes.
   * Caller writes `variables`, clears `orphanedKeys` (old @script + @index).
   */
  function planLegacyIndexToPathMigration(indexScripts, valueByKey) {
    var list = Array.isArray(indexScripts) ? indexScripts : [];
    var writes = [];
    var listItems = [];
    var scripts = [];
    var orphanedKeys = [];
    var seenPath = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var entry = normalizeIndexEntry(list[i]);
      if (!entry) continue;
      var code = readScriptBody(entry, valueByKey);
      var planned = planScriptWrite({
        id: entry.id,
        name: entry.name,
        code: code,
        type: entry.type
      });
      if (seenPath[planned.entry.path]) continue;
      seenPath[planned.entry.path] = true;
      writes.push(planned);
      scripts.push(planned.entry);
      listItems.push({
        name: planned.entry.name,
        code: code,
        type: planned.entry.type
      });
      for (var k = 0; k < entry.chunkKeys.length; k++) {
        orphanedKeys.push(entry.chunkKeys[k]);
      }
    }
    orphanedKeys.push(INDEX_VARIABLE);
    return {
      scripts: scripts,
      writes: writes,
      listItems: listItems,
      orphanedKeys: orphanedKeys,
      count: listItems.length
    };
  }

  // ---------------------------------------------------------------------------
  // Export / import blob
  // ---------------------------------------------------------------------------

  function normalizeExportEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = raw.name != null ? String(raw.name).trim() : '';
    if (!name || raw.code === undefined || raw.code === null) return null;
    var code = typeof raw.code === 'string' ? raw.code : String(raw.code);
    var isAtLib = name.charAt(0) === '@';
    var type = isAtLib ? 'library' : 'user';
    if (raw.type === 'library' || raw.type === 'user') {
      type = isAtLib ? 'library' : raw.type;
    }
    var out = {
      v: ENVELOPE_VERSION,
      name: name,
      code: code,
      type: type
    };
    if (raw.id != null && String(raw.id).trim() !== '') {
      out.id = String(raw.id).trim();
    }
    return out;
  }

  function parseExportBlob(json) {
    var data;
    try {
      data = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
      return { scripts: [] };
    }
    var list;
    if (Array.isArray(data)) list = data;
    else if (data && typeof data === 'object' && Array.isArray(data.scripts)) {
      list = data.scripts;
    } else if (data && typeof data === 'object' && data.name && data.code !== undefined) {
      list = [data];
    } else {
      return { scripts: [] };
    }
    var scripts = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var n = normalizeExportEntry(list[i]);
      if (!n) continue;
      if (seen[n.name]) continue;
      seen[n.name] = true;
      scripts.push(n);
    }
    return { scripts: scripts };
  }

  function serializeExportBlob(scripts) {
    var parsed = parseExportBlob(
      Array.isArray(scripts) ? scripts : { scripts: scripts }
    );
    return JSON.stringify(parsed.scripts, null, 2);
  }

  function mintScriptId() {
    var t = Date.now().toString(36);
    var r = Math.floor(Math.random() * 1e9).toString(36);
    return sanitizePathSegmentLegacyId('s-' + t + '-' + r);
  }

  function toListItem(script) {
    var n = normalizeExportEntry(script);
    if (!n) return null;
    return { name: n.name, code: n.code, type: n.type };
  }

  function findIndexEntryByName(scripts, name) {
    return findEntryByName(scripts, name);
  }

  /**
   * Names present in `have` (list items or index entries).
   */
  function nameSet(list) {
    var seen = Object.create(null);
    var arr = Array.isArray(list) ? list : [];
    for (var i = 0; i < arr.length; i++) {
      var item = toListItem(arr[i]);
      if (item) seen[item.name] = true;
    }
    return seen;
  }

  /**
   * Parallel sync plan — additive only (missing names), never overwrites a body
   * that already exists on the other side. Content stays aligned via SAVE dual-write.
   *
   *   toVariables  ← clientStorage scripts whose names are not in the variable store
   *   toClient     ← variable-store scripts whose names are not in clientStorage
   */
  function planParallelSync(variableScripts, clientScripts, mintId) {
    var mint = typeof mintId === 'function' ? mintId : mintScriptId;
    var varItems = [];
    var varList = Array.isArray(variableScripts) ? variableScripts : [];
    for (var v = 0; v < varList.length; v++) {
      var vi = toListItem(varList[v]);
      if (vi) varItems.push(vi);
    }
    var clientItems = [];
    var clientList = Array.isArray(clientScripts) ? clientScripts : [];
    var clientByName = Object.create(null);
    for (var c = 0; c < clientList.length; c++) {
      var ci = toListItem(clientList[c]);
      if (!ci || clientByName[ci.name]) continue;
      clientByName[ci.name] = clientList[c];
      clientItems.push(ci);
    }

    var haveVar = nameSet(varItems);
    var haveClient = nameSet(clientItems);

    var toVariables = [];
    var writes = [];
    for (var i = 0; i < clientItems.length; i++) {
      var item = clientItems[i];
      if (haveVar[item.name]) continue;
      var raw = clientByName[item.name];
      var id =
        raw && raw.id != null && String(raw.id).trim() !== ''
          ? sanitizePathSegmentLegacyId(String(raw.id).trim())
          : mint();
      var planned = planScriptWrite({
        id: id,
        name: item.name,
        code: item.code,
        type: item.type
      });
      toVariables.push(item);
      writes.push(planned);
    }

    var toClient = [];
    for (var j = 0; j < varItems.length; j++) {
      if (haveClient[varItems[j].name]) continue;
      toClient.push(varItems[j]);
    }

    return {
      toVariables: toVariables,
      writes: writes,
      toClient: toClient,
      toVariablesCount: toVariables.length,
      toClientCount: toClient.length
    };
  }

  /**
   * True when either side has a name the other lacks — trigger for parallel sync.
   */
  function shouldParallelSync(variableScripts, clientScripts) {
    var planned = planParallelSync(variableScripts, clientScripts, function () {
      return 'x';
    });
    return planned.toVariablesCount > 0 || planned.toClientCount > 0;
  }

  /**
   * @deprecated use shouldParallelSync — kept as empty-store check for older call sites.
   */
  function shouldMigrateFromClient(existingScripts, clientScripts) {
    var indexed = Array.isArray(existingScripts) ? existingScripts : [];
    if (indexed.length > 0) return false;
    if (!Array.isArray(clientScripts) || clientScripts.length === 0) return false;
    for (var i = 0; i < clientScripts.length; i++) {
      if (toListItem(clientScripts[i])) return true;
    }
    return false;
  }

  function mergeScriptsByName(preferred, fallback) {
    var out = [];
    var seen = Object.create(null);
    var listA = Array.isArray(preferred) ? preferred : [];
    var listB = Array.isArray(fallback) ? fallback : [];
    for (var i = 0; i < listA.length; i++) {
      var a = toListItem(listA[i]);
      if (!a || seen[a.name]) continue;
      seen[a.name] = true;
      out.push(a);
    }
    for (var j = 0; j < listB.length; j++) {
      var b = toListItem(listB[j]);
      if (!b || seen[b.name]) continue;
      seen[b.name] = true;
      out.push(b);
    }
    return out;
  }

  /**
   * Annotate a list item with storage origin metadata for the sidebar.
   * `origin`: 'local' | 'client' | 'remote'
   */
  function withStorageMeta(item, origin, libraryName) {
    var base = toListItem(item);
    if (!base) return null;
    var lib = libraryName == null ? '' : String(libraryName).trim();
    var org = origin === 'remote' || origin === 'client' || origin === 'local' ? origin : 'local';
    var storageId =
      org === 'remote' ? 'remote:' + lib + ':' + base.name : org + ':' + base.name;
    return {
      name: base.name,
      code: base.code,
      type: base.type,
      origin: org,
      libraryName: org === 'remote' ? lib : '',
      storageId: storageId
    };
  }

  /**
   * Build remote list stubs from team-library variable descriptors (name/key/type)
   * without reading values — no import, no local write. Continuations group under
   * the primary path; body loads later via LOAD_REMOTE_SCRIPT.
   */
  function listRemoteScriptStubs(libraryVariables, libraryName, collectionKey) {
    var byPath = Object.create(null);
    var list = Array.isArray(libraryVariables) ? libraryVariables : [];
    for (var i = 0; i < list.length; i++) {
      var lv = list[i];
      if (!lv || lv.resolvedType !== 'STRING') continue;
      var rawName = String(lv.name == null ? '' : lv.name);
      if (!rawName || rawName === INDEX_VARIABLE) continue;
      // Skip legacy v1 chunk keys (@script/…); path model only for remote list.
      if (rawName.charAt(0) === '@') continue;
      var path = primaryVariablePath(rawName);
      if (!byPath[path]) byPath[path] = [];
      byPath[path].push({
        name: rawName,
        key: String(lv.key == null ? '' : lv.key)
      });
    }
    var lib = String(libraryName == null ? '' : libraryName).trim();
    var colKey = String(collectionKey == null ? '' : collectionKey);
    var items = [];
    for (var pathKey in byPath) {
      if (!Object.prototype.hasOwnProperty.call(byPath, pathKey)) continue;
      var chunks = byPath[pathKey];
      var hasKey = false;
      for (var c = 0; c < chunks.length; c++) {
        if (chunks[c].key) {
          hasKey = true;
          break;
        }
      }
      if (!hasKey) continue;
      var displayName = variablePathToDisplayName(pathKey);
      var typed = inferType(displayName, 'user');
      items.push({
        name: displayName,
        code: '',
        type: typed,
        origin: 'remote',
        libraryName: lib,
        storageId: 'remote:' + lib + ':' + displayName,
        remote: {
          collectionKey: colKey,
          libraryName: lib,
          variables: chunks
        }
      });
    }
    return items;
  }

  /**
   * Display inventory: local Variables preferred over clientStorage for the same
   * name; remote library scripts are included only when that name is not already
   * local/client (avoids duplicate sidebar rows after an explicit Sync).
   * Never plans writes — callers must not gap-fill from this merge.
   */
  function mergeScriptInventory(localItems, clientItems, remoteItems) {
    var out = [];
    var seen = Object.create(null);
    var locals = Array.isArray(localItems) ? localItems : [];
    for (var i = 0; i < locals.length; i++) {
      var loc = withStorageMeta(locals[i], 'local', '');
      if (!loc || seen[loc.name]) continue;
      seen[loc.name] = true;
      out.push(loc);
    }
    var clients = Array.isArray(clientItems) ? clientItems : [];
    for (var j = 0; j < clients.length; j++) {
      var cli = withStorageMeta(clients[j], 'client', '');
      if (!cli || seen[cli.name]) continue;
      seen[cli.name] = true;
      out.push(cli);
    }
    var remotes = Array.isArray(remoteItems) ? remoteItems : [];
    for (var k = 0; k < remotes.length; k++) {
      var rem = remotes[k];
      if (!rem || typeof rem.name !== 'string') continue;
      if (seen[rem.name]) continue;
      seen[rem.name] = true;
      if (rem.origin === 'remote' && rem.storageId) {
        out.push(rem);
      } else {
        var tagged = withStorageMeta(rem, 'remote', rem.libraryName || '');
        if (tagged) {
          if (rem.remote) tagged.remote = rem.remote;
          out.push(tagged);
        }
      }
    }
    return out;
  }

  /** Full client → variables write plan (empty store). Prefer planParallelSync. */
  function planClientStorageMigration(clientScripts, mintId) {
    var sync = planParallelSync([], clientScripts, mintId);
    var scripts = [];
    for (var i = 0; i < sync.writes.length; i++) {
      scripts.push(sync.writes[i].entry);
    }
    return {
      scripts: scripts,
      writes: sync.writes,
      listItems: sync.toVariables,
      count: sync.toVariablesCount
    };
  }

  return {
    COLLECTION_NAME: COLLECTION_NAME,
    INDEX_VARIABLE: INDEX_VARIABLE,
    CHUNK_CHAR_LIMIT: CHUNK_CHAR_LIMIT,
    INDEX_VERSION: INDEX_VERSION,
    ENVELOPE_VERSION: ENVELOPE_VERSION,
    SCRIPT_VARIABLE_SCOPES: SCRIPT_VARIABLE_SCOPES,
    DESCRIPTION_ID_KEY: DESCRIPTION_ID_KEY,
    sanitizePathSegment: sanitizePathSegment,
    sanitizePathSegmentLegacyId: sanitizePathSegmentLegacyId,
    displayNameToVariablePath: displayNameToVariablePath,
    variablePathToDisplayName: variablePathToDisplayName,
    isContinuationPath: isContinuationPath,
    primaryVariablePath: primaryVariablePath,
    continuationPath: continuationPath,
    libraryChunkPrefix: libraryChunkPrefix,
    scriptChunkKey: scriptChunkKey,
    libraryChunkKey: libraryChunkKey,
    chunkBody: chunkBody,
    joinChunks: joinChunks,
    chunkKeysFor: chunkKeysFor,
    parseEnvelope: parseEnvelope,
    serializeEnvelope: serializeEnvelope,
    serializeScriptDescription: serializeScriptDescription,
    parseScriptDescription: parseScriptDescription,
    normalizeIndexEntry: normalizeIndexEntry,
    parseIndex: parseIndex,
    serializeIndex: serializeIndex,
    planScriptWrite: planScriptWrite,
    readScriptBody: readScriptBody,
    readScriptBodyFromPath: readScriptBodyFromPath,
    listScriptsFromValues: listScriptsFromValues,
    orphanedKeysFor: orphanedKeysFor,
    findEntryByName: findEntryByName,
    findEntryByPath: findEntryByPath,
    upsertIndexEntry: upsertIndexEntry,
    removeIndexEntry: removeIndexEntry,
    planLegacyIndexToPathMigration: planLegacyIndexToPathMigration,
    normalizeExportEntry: normalizeExportEntry,
    parseExportBlob: parseExportBlob,
    serializeExportBlob: serializeExportBlob,
    mintScriptId: mintScriptId,
    inferType: inferType,
    toListItem: toListItem,
    findIndexEntryByName: findIndexEntryByName,
    shouldMigrateFromClient: shouldMigrateFromClient,
    shouldParallelSync: shouldParallelSync,
    planParallelSync: planParallelSync,
    mergeScriptsByName: mergeScriptsByName,
    withStorageMeta: withStorageMeta,
    listRemoteScriptStubs: listRemoteScriptStubs,
    mergeScriptInventory: mergeScriptInventory,
    planClientStorageMigration: planClientStorageMigration
  };
});
