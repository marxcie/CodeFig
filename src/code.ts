// Serialize args for the console bridge (file / Cursor)
function serializeForConsole(args: any[]): string {
  return args.map(arg => {
    if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
    if (typeof arg === 'object') try { return JSON.stringify(arg, null, 2); } catch (_) { return String(arg); }
    return String(arg);
  }).join(' ');
}

function forwardToConsoleBridge(level: 'log' | 'warn' | 'error', args: any[]) {
  try {
    figma.ui.postMessage({ type: 'CONSOLE_FORWARD', level, payload: serializeForConsole(args) });
  } catch (_) { /* UI may not be ready */ }
}

// Debug logging: set true for verbose backend logs; console bridge and script logs unchanged
const DEBUG_BACKEND = false;
function debugLog(message: string, ...args: any[]) {
  if (!DEBUG_BACKEND) return;
  const log = console.log.bind(console);
  setTimeout(() => log('%cCodeFig: ' + message, 'color: #0066cc; font-weight: bold;', ...args), 0);
  forwardToConsoleBridge('log', [message, ...args]);
}

function debugError(message: string, ...args: any[]) {
  const error = console.error.bind(console);
  setTimeout(() => error('%cCodeFig: ' + message, 'color: #cc0000; font-weight: bold;', ...args), 0);
  forwardToConsoleBridge('error', [message, ...args]);
}

/**
 * A script's own console output, mirrored to the plugin console only.
 *
 * The bridge forward is the caller's job, so it happens once, at the right level, and honours a
 * silent run. Routing a script's `console.warn` through `debugError` — which is what this
 * replaced — emitted it twice: once as `[WARN]` and once as `[ERROR]`, and the CLI's failure
 * detection keys on `[ERROR]`. Every run that warned about anything exited non-zero while having
 * done exactly what it was asked. A warning must never fail a run.
 */
function debugScriptWarn(message: string, ...args: any[]) {
  const warn = console.warn.bind(console);
  setTimeout(() => warn('%cCodeFig: ' + message, 'color: #b26a00; font-weight: bold;', ...args), 0);
}

function debugScriptError(message: string, ...args: any[]) {
  const error = console.error.bind(console);
  setTimeout(() => error('%cCodeFig: ' + message, 'color: #cc0000; font-weight: bold;', ...args), 0);
}

// Show the UI
figma.showUI(__html__, { 
  width: 1000, 
  height: 600,
  themeColors: true
  // Note: resizable is not in the official Figma API types but works in practice
} as any);

// Boot cleanup: clear-case foundation plugin-data hygiene (plan 39). Fire-and-forget so first
// paint is not blocked; logs only — no toast / InfoPanel. Sibling modules are inlined into
// dist/code.js by build-scripts.js as `__codefigMainRequire` — Figma's JSVM has no Node
// `require`, and assigning `var require = …` is unreliable there (and bare `tsc` wipes a
// prepended shim). Always load siblings through this name, never `require`.
declare function __codefigMainRequire(moduleId: string): any;
/**
 * Foundation maintain on open can race Figma's variable graph (stamps missing → empty plan).
 * Schedule again from LIST once the document answers; empty plans stay silent.
 */
function scheduleFoundationMaintain(reason: string): void {
  try {
    const foundationMaintain = __codefigMainRequire('./foundation-maintain') as {
      runFoundationMaintain: (
        figmaApi: PluginAPI,
        log?: (message: string) => void
      ) => Promise<unknown>;
    };
    void foundationMaintain
      .runFoundationMaintain(figma, (message: string) => {
        // Quiet housekeeping: plugin console + bridge (dev), never toast / InfoPanel.
        console.log(message);
        forwardToConsoleBridge('log', [message]);
      })
      .catch((err: unknown) => {
        const text =
          'foundationMaintain failed (' +
          reason +
          '): ' +
          (err instanceof Error ? err.message : String(err));
        console.log(text);
        forwardToConsoleBridge('log', [text]);
      });
  } catch (err) {
    const text =
      'foundationMaintain unavailable (' +
      reason +
      '): ' +
      (err instanceof Error ? err.message : String(err));
    console.log(text);
    forwardToConsoleBridge('log', [text]);
  }
}

scheduleFoundationMaintain('boot');

/**
 * Plan 38 — STRING-variable script storage (`.plans/38-script-storage-variables.md`).
 * Pure helpers live in `src/script-storage.js`.
 *
 * Parallel mode (flag true): Variables + clientStorage both hold bodies.
 *   - SAVE / DELETE / explicit Sync dual-write both
 *   - LIST dual-reads (local Variables preferred on name collision) + remote
 *     library stubs (name only until opened)
 *   - LIST does **not** auto-write clientStorage → local Variables (no silent
 *     local copies). Explicit Sync / SAVE create or update the local collection.
 * Flip false only to disable the Variables path entirely.
 */
const SCRIPT_STORAGE_VARIABLES: boolean = true;

const SCRIPT_STORAGE_SETTINGS_KEY = 'codefigScriptStorageSettings';

type ScriptStorageSettings = {
  useVariables: boolean;
  useLocalStorage: boolean;
  syncMode: 'dual-write' | 'variables-preferred' | 'localstorage-preferred';
};

function defaultScriptStorageSettings(): ScriptStorageSettings {
  return {
    useVariables: true,
    useLocalStorage: true,
    syncMode: 'dual-write'
  };
}

function normalizeScriptStorageSettings(raw: unknown): ScriptStorageSettings {
  const d = defaultScriptStorageSettings();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  let useVariables = o.useVariables !== false;
  let useLocalStorage = o.useLocalStorage !== false;
  if (!useVariables && !useLocalStorage) {
    useVariables = true;
    useLocalStorage = true;
  }
  const syncMode =
    o.syncMode === 'variables-preferred' || o.syncMode === 'localstorage-preferred'
      ? o.syncMode
      : 'dual-write';
  return { useVariables, useLocalStorage, syncMode };
}

async function loadScriptStorageSettings(): Promise<ScriptStorageSettings> {
  try {
    const raw = await figma.clientStorage.getAsync(SCRIPT_STORAGE_SETTINGS_KEY);
    return normalizeScriptStorageSettings(raw);
  } catch {
    return defaultScriptStorageSettings();
  }
}

/** Where SAVE / Sync should write, given user prefs. */
async function getScriptWriteTargets(isExplicitSync: boolean): Promise<{
  vars: boolean;
  client: boolean;
  settings: ScriptStorageSettings;
}> {
  const settings = await loadScriptStorageSettings();
  const flagOn = SCRIPT_STORAGE_VARIABLES;
  let vars = false;
  let client = false;
  if (isExplicitSync) {
    vars = flagOn && settings.useVariables;
    client = settings.useLocalStorage && settings.syncMode === 'dual-write';
  } else {
    vars =
      flagOn &&
      settings.useVariables &&
      settings.syncMode !== 'localstorage-preferred';
    client =
      settings.useLocalStorage && settings.syncMode !== 'variables-preferred';
  }
  if (!vars && !client) client = true;
  return { vars, client, settings };
}

type ScriptStorageModule = {
  COLLECTION_NAME: string;
  INDEX_VARIABLE: string;
  SCRIPT_VARIABLE_SCOPES: VariableScope[];
  parseIndex: (json: unknown) => { v: number; scripts: ScriptIndexEntry[] };
  listScriptsFromValues: (
    valueByKey: Record<string, string>,
    descriptionByKey?: Record<string, string>
  ) => { scripts: ScriptIndexEntry[]; listItems: ScriptListItem[] };
  planScriptWrite: (script: {
    id: string;
    name: string;
    type?: string;
    code: string;
    limit?: number;
  }) => {
    entry: ScriptIndexEntry;
    variables: Array<{ key: string; value: string; description?: string }>;
  };
  readScriptBody: (
    entry: ScriptIndexEntry,
    valueByKey: Record<string, string>
  ) => string;
  orphanedKeysFor: (
    previousChunkKeys: string[] | undefined,
    nextChunkKeys: string[] | undefined
  ) => string[];
  findEntryByName: (
    scripts: ScriptIndexEntry[],
    name: string
  ) => ScriptIndexEntry | null;
  findIndexEntryByName: (
    scripts: ScriptIndexEntry[],
    name: string
  ) => ScriptIndexEntry | null;
  mintScriptId: () => string;
  toListItem: (script: unknown) => ScriptListItem | null;
  shouldParallelSync: (
    variableScripts: unknown[],
    clientScripts: unknown[]
  ) => boolean;
  planParallelSync: (
    variableScripts: unknown[],
    clientScripts: unknown[],
    mintId?: () => string
  ) => {
    toVariables: ScriptListItem[];
    writes: Array<{
      entry: ScriptIndexEntry;
      variables: Array<{ key: string; value: string }>;
    }>;
    toClient: ScriptListItem[];
    toVariablesCount: number;
    toClientCount: number;
  };
  mergeScriptsByName: (
    preferred: unknown[],
    fallback: unknown[]
  ) => ScriptListItem[];
  listRemoteScriptStubs: (
    libraryVariables: Array<{ name: string; key: string; resolvedType: string }>,
    libraryName: string,
    collectionKey: string
  ) => ScriptListItem[];
  mergeScriptInventory: (
    localItems: unknown[],
    clientItems: unknown[],
    remoteItems: unknown[]
  ) => ScriptListItem[];
  planLegacyIndexToPathMigration: (
    indexScripts: ScriptIndexEntry[],
    valueByKey: Record<string, string>
  ) => {
    scripts: ScriptIndexEntry[];
    writes: Array<{
      entry: ScriptIndexEntry;
      variables: Array<{ key: string; value: string }>;
    }>;
    listItems: ScriptListItem[];
    orphanedKeys: string[];
    count: number;
  };
};

type ScriptIndexEntry = {
  id: string;
  name: string;
  type: string;
  chunkKeys: string[];
  path?: string;
};

type ScriptListItem = {
  name: string;
  code: string;
  type: string;
  id?: string | null;
  origin?: string;
  libraryName?: string;
  storageId?: string;
  remote?: {
    collectionKey: string;
    libraryName: string;
    variables: Array<{ name: string; key: string }>;
  };
};

// Required only when the flag is on — keeps the false path free of a load-time dependency.
const scriptStorage: ScriptStorageModule | null = SCRIPT_STORAGE_VARIABLES
  ? (__codefigMainRequire('./script-storage') as ScriptStorageModule)
  : null;

function scriptStorageLog(message: string) {
  console.log(message);
  forwardToConsoleBridge('log', [message]);
}

/** Find or create the local "CodeFig Scripts" collection (STRING vars). */
async function ensureScriptsCollection(
  storage: ScriptStorageModule
): Promise<VariableCollection> {
  const existing = await findLocalScriptsCollection(storage);
  if (existing) return existing;
  return figma.variables.createVariableCollection(storage.COLLECTION_NAME);
}

/** Local collection only — never creates. LIST uses this so open is read-only. */
async function findLocalScriptsCollection(
  storage: ScriptStorageModule
): Promise<VariableCollection | null> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const want = storage.COLLECTION_NAME;
  for (const c of collections || []) {
    if (c && c.name === want) return c;
  }
  return null;
}

async function loadCollectionVariablesByName(
  collection: VariableCollection
): Promise<Map<string, Variable>> {
  const byName = new Map<string, Variable>();
  const ids = collection.variableIds || [];
  for (const id of ids) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) byName.set(v.name, v);
  }
  return byName;
}

function collectionModeId(collection: VariableCollection): string {
  return collection.modes[0].modeId;
}

function readStringModeValue(variable: Variable, modeId: string): string {
  const raw = variable.valuesByMode[modeId];
  return typeof raw === 'string' ? raw : '';
}

function descriptionMapFromCollection(
  byName: Map<string, Variable>
): Record<string, string> {
  const descriptionByKey: Record<string, string> = Object.create(null);
  byName.forEach((variable, name) => {
    descriptionByKey[name] = variable.description != null ? String(variable.description) : '';
  });
  return descriptionByKey;
}

async function setStringVariableValue(
  collection: VariableCollection,
  byName: Map<string, Variable>,
  modeId: string,
  key: string,
  value: string,
  scopes?: VariableScope[],
  description?: string
): Promise<void> {
  let variable = byName.get(key);
  if (!variable) {
    variable = figma.variables.createVariable(key, collection, 'STRING');
    byName.set(key, variable);
  }
  // TEXT_CONTENT so canvas SRC can bind; not fills/gaps.
  if (scopes) variable.scopes = scopes;
  if (description != null) variable.description = String(description);
  variable.setValueForMode(modeId, value == null ? '' : String(value));
}

/** Clear orphaned chunk values in place — never delete variables (project invariant). */
async function clearOrphanedChunkValues(
  byName: Map<string, Variable>,
  modeId: string,
  orphanedKeys: string[]
): Promise<void> {
  for (const key of orphanedKeys || []) {
    const variable = byName.get(key);
    if (variable) variable.setValueForMode(modeId, '');
  }
}

function valueMapFromCollection(
  byName: Map<string, Variable>,
  modeId: string
): Record<string, string> {
  const valueByKey: Record<string, string> = Object.create(null);
  byName.forEach((variable, name) => {
    valueByKey[name] = readStringModeValue(variable, modeId);
  });
  return valueByKey;
}

async function writeScriptVariables(
  storage: ScriptStorageModule,
  collection: VariableCollection,
  byName: Map<string, Variable>,
  modeId: string,
  variables: Array<{ key: string; value: string; description?: string }>,
  orphanedKeys: string[]
): Promise<void> {
  const scopes = storage.SCRIPT_VARIABLE_SCOPES || [];
  for (const pair of variables) {
    await setStringVariableValue(
      collection,
      byName,
      modeId,
      pair.key,
      pair.value,
      scopes,
      pair.description
    );
  }
  await clearOrphanedChunkValues(byName, modeId, orphanedKeys);
}

/**
 * Read path-named script variables. If a legacy `@index` is still present and
 * there are no path scripts yet, rewrite into path envelopes and clear the old
 * keys (values only — variables are never deleted).
 */
async function readScriptsFromCollection(
  storage: ScriptStorageModule,
  collection: VariableCollection
): Promise<{ indexScripts: ScriptIndexEntry[]; listItems: ScriptListItem[] }> {
  let byName = await loadCollectionVariablesByName(collection);
  const modeId = collectionModeId(collection);
  let valueByKey = valueMapFromCollection(byName, modeId);
  let descriptionByKey = descriptionMapFromCollection(byName);
  let listed = storage.listScriptsFromValues(valueByKey, descriptionByKey);

  const indexVar = byName.get(storage.INDEX_VARIABLE);
  const indexJson = indexVar ? readStringModeValue(indexVar, modeId) : '';
  const legacy = storage.parseIndex(indexJson);

  if (listed.scripts.length === 0 && legacy.scripts.length > 0) {
    const planned = storage.planLegacyIndexToPathMigration(
      legacy.scripts,
      valueByKey
    );
    if (planned.count > 0) {
      await writeScriptVariables(
        storage,
        collection,
        byName,
        modeId,
        planned.writes.reduce(
          (acc: Array<{ key: string; value: string; description?: string }>, w) => {
            for (const pair of w.variables) acc.push(pair);
            return acc;
          },
          []
        ),
        planned.orphanedKeys
      );
      scriptStorageLog(
        'CodeFig: rewrote ' +
          planned.count +
          ' script(s) from @index into path-named variables'
      );
      byName = await loadCollectionVariablesByName(collection);
      valueByKey = valueMapFromCollection(byName, modeId);
      descriptionByKey = descriptionMapFromCollection(byName);
      listed = storage.listScriptsFromValues(valueByKey, descriptionByKey);
    }
  }

  // TEXT_CONTENT scopes so SRC can bind (including vars created before this policy).
  const scopes = storage.SCRIPT_VARIABLE_SCOPES || [];
  for (const entry of listed.scripts) {
    for (const key of entry.chunkKeys || []) {
      const variable = byName.get(key);
      if (variable) variable.scopes = scopes;
    }
  }

  return { indexScripts: listed.scripts, listItems: listed.listItems };
}

/**
 * Keep Variables and clientStorage in parallel: write any name that exists on
 * only one side. Never overwrites an existing body (SAVE dual-write owns content).
 * Used only by explicit Sync — LIST must not call this (no silent local copies).
 */
async function syncParallelScriptStores(
  storage: ScriptStorageModule,
  collection: VariableCollection,
  variableListItems: ScriptListItem[],
  clientScripts: unknown[]
): Promise<{
  listItems: ScriptListItem[];
  clientScripts: unknown[];
  toVariables: number;
  toClient: number;
}> {
  const planned = storage.planParallelSync(variableListItems, clientScripts);
  let nextClient = (clientScripts || []).slice() as any[];
  let nextVariableItems = variableListItems.slice();

  if (planned.toVariablesCount > 0) {
    const byName = await loadCollectionVariablesByName(collection);
    const modeId = collectionModeId(collection);
    const variables: Array<{ key: string; value: string }> = [];
    for (const write of planned.writes) {
      for (const pair of write.variables) variables.push(pair);
    }
    await writeScriptVariables(storage, collection, byName, modeId, variables, []);
    nextVariableItems = storage.mergeScriptsByName(
      nextVariableItems,
      planned.toVariables
    );
  }

  if (planned.toClientCount > 0) {
    for (const item of planned.toClient) {
      nextClient = upsertClientStorageScripts(nextClient, item);
    }
    await figma.clientStorage.setAsync('userScripts', nextClient);
  }

  if (planned.toVariablesCount > 0 || planned.toClientCount > 0) {
    scriptStorageLog(
      'CodeFig: synced scripts — ' +
        planned.toVariablesCount +
        ' → "' +
        storage.COLLECTION_NAME +
        '", ' +
        planned.toClientCount +
        ' → clientStorage'
    );
  }

  return {
    listItems: nextVariableItems,
    clientScripts: nextClient,
    toVariables: planned.toVariablesCount,
    toClient: planned.toClientCount
  };
}

/**
 * Name stubs for published "CodeFig Scripts" collections from enabled libraries.
 * Does not import variables (no local subscription write on LIST).
 */
async function listRemoteScriptStubsFromLibraries(
  storage: ScriptStorageModule
): Promise<ScriptListItem[]> {
  if (
    !figma.teamLibrary ||
    typeof figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync !==
      'function'
  ) {
    return [];
  }
  let collections: LibraryVariableCollection[] = [];
  try {
    collections =
      await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  } catch (err) {
    scriptStorageLog(
      'CodeFig: team library collections unavailable: ' +
        (err instanceof Error ? err.message : String(err))
    );
    return [];
  }
  const want = storage.COLLECTION_NAME;
  const matches = (collections || []).filter((c) => c && c.name === want);
  const remoteItems: ScriptListItem[] = [];
  for (const col of matches) {
    try {
      const libVars =
        await figma.teamLibrary.getVariablesInLibraryCollectionAsync(col.key);
      const stubs = storage.listRemoteScriptStubs(
        libVars || [],
        col.libraryName || '',
        col.key
      );
      for (const stub of stubs) remoteItems.push(stub);
    } catch (err) {
      scriptStorageLog(
        'CodeFig: could not list scripts from library "' +
          (col.libraryName || col.name) +
          '": ' +
          (err instanceof Error ? err.message : String(err))
      );
    }
  }
  return remoteItems;
}

/**
 * Import remote script chunk variables and reassemble the body.
 * Import is the only way to read library STRING values; it subscribes those
 * variables in this file but does not create a local "CodeFig Scripts" collection.
 */
async function loadRemoteScriptBody(
  storage: ScriptStorageModule,
  remote: NonNullable<ScriptListItem['remote']>
): Promise<string> {
  const valueByKey: Record<string, string> = Object.create(null);
  for (const chunk of remote.variables || []) {
    if (!chunk || !chunk.key) continue;
    const imported = await figma.variables.importVariableByKeyAsync(chunk.key);
    if (!imported) continue;
    const coll = await figma.variables.getVariableCollectionByIdAsync(
      imported.variableCollectionId
    );
    if (!coll) continue;
    const modeId = collectionModeId(coll);
    valueByKey[imported.name] = readStringModeValue(imported, modeId);
  }
  const listed = storage.listScriptsFromValues(valueByKey);
  if (listed.listItems.length === 1) return listed.listItems[0].code || '';
  // Prefer entry whose display name matches any chunk's primary path.
  if (listed.listItems.length > 0) {
    return listed.listItems[0].code || '';
  }
  return '';
}

/** Dual-write mirror: keep clientStorage in sync while the flag is on. */
function upsertClientStorageScripts(
  existing: any[],
  scriptData: ScriptListItem,
  searchName?: string
): any[] {
  const userScripts = (existing || []).slice();
  const lookFor = searchName != null ? searchName : scriptData.name;
  const existingIndex = userScripts.findIndex((s: any) => s.name === lookFor);
  if (existingIndex >= 0) {
    userScripts[existingIndex] = {
      name: scriptData.name,
      code: scriptData.code,
      type: scriptData.type
    };
  } else {
    userScripts.push({
      name: scriptData.name,
      code: scriptData.code,
      type: scriptData.type
    });
  }
  return userScripts;
}

async function saveScriptToVariableStore(
  storage: ScriptStorageModule,
  scriptData: ScriptListItem,
  oldName?: string
): Promise<ScriptListItem> {
  const collection = await ensureScriptsCollection(storage);
  const byName = await loadCollectionVariablesByName(collection);
  const modeId = collectionModeId(collection);
  const valueByKey = valueMapFromCollection(byName, modeId);
  const descriptionByKey = descriptionMapFromCollection(byName);
  const listed = storage.listScriptsFromValues(valueByKey, descriptionByKey);
  const searchName = oldName || scriptData.name;
  const existing = storage.findEntryByName(listed.scripts, searchName);
  const id =
    existing && existing.id
      ? existing.id
      : scriptData.id
        ? String(scriptData.id)
        : storage.mintScriptId();
  const planned = storage.planScriptWrite({
    id,
    name: scriptData.name,
    code: scriptData.code,
    type: scriptData.type
  });
  const orphanedKeys = storage.orphanedKeysFor(
    existing ? existing.chunkKeys : undefined,
    planned.entry.chunkKeys
  );
  // Renaming to a new path: also clear the old path if findEntryByName used oldName.
  if (oldName && oldName !== scriptData.name) {
    const oldEntry = storage.findEntryByName(listed.scripts, oldName);
    if (oldEntry) {
      for (const key of storage.orphanedKeysFor(oldEntry.chunkKeys, planned.entry.chunkKeys)) {
        if (orphanedKeys.indexOf(key) === -1) orphanedKeys.push(key);
      }
    }
  }
  await writeScriptVariables(
    storage,
    collection,
    byName,
    modeId,
    planned.variables,
    orphanedKeys
  );
  return scriptData;
}

async function saveBatchToVariableStore(
  storage: ScriptStorageModule,
  scripts: ScriptListItem[]
): Promise<ScriptListItem[]> {
  const collection = await ensureScriptsCollection(storage);
  let byName = await loadCollectionVariablesByName(collection);
  const modeId = collectionModeId(collection);
  let valueByKey = valueMapFromCollection(byName, modeId);
  let descriptionByKey = descriptionMapFromCollection(byName);
  let listed = storage.listScriptsFromValues(valueByKey, descriptionByKey);
  const allOrphans: string[] = [];
  const allVariables: Array<{ key: string; value: string; description?: string }> = [];
  for (const scriptData of scripts) {
    const existing = storage.findEntryByName(listed.scripts, scriptData.name);
    const id =
      existing && existing.id
        ? existing.id
        : scriptData.id
          ? String(scriptData.id)
          : storage.mintScriptId();
    const planned = storage.planScriptWrite({
      id,
      name: scriptData.name,
      code: scriptData.code,
      type: scriptData.type
    });
    for (const key of storage.orphanedKeysFor(
      existing ? existing.chunkKeys : undefined,
      planned.entry.chunkKeys
    )) {
      allOrphans.push(key);
    }
    for (const pair of planned.variables) allVariables.push(pair);
    // Keep subsequent lookups in this batch aware of paths we just planned.
    const without = listed.scripts.filter((s) => s.name !== scriptData.name);
    without.push(planned.entry);
    listed = { scripts: without, listItems: listed.listItems };
  }
  await writeScriptVariables(
    storage,
    collection,
    byName,
    modeId,
    allVariables,
    allOrphans
  );
  return scripts;
}

async function deleteScriptFromVariableStore(
  storage: ScriptStorageModule,
  name: string
): Promise<void> {
  const collection = await ensureScriptsCollection(storage);
  const byName = await loadCollectionVariablesByName(collection);
  const modeId = collectionModeId(collection);
  const valueByKey = valueMapFromCollection(byName, modeId);
  const descriptionByKey = descriptionMapFromCollection(byName);
  const listed = storage.listScriptsFromValues(valueByKey, descriptionByKey);
  const existing = storage.findEntryByName(listed.scripts, name);
  if (!existing) return;
  await writeScriptVariables(
    storage,
    collection,
    byName,
    modeId,
    [],
    existing.chunkKeys || []
  );
}

async function listScriptsWithVariableStore(
  storage: ScriptStorageModule
): Promise<{ items: ScriptListItem[]; lastOpenedScript: unknown }> {
  const settings = await loadScriptStorageSettings();
  const [clientScriptsRaw, lastOpenedScript] = await Promise.all([
    settings.useLocalStorage
      ? figma.clientStorage.getAsync('userScripts')
      : Promise.resolve([]),
    figma.clientStorage.getAsync('lastOpenedScript')
  ]);
  const clientList = settings.useLocalStorage
    ? ((clientScriptsRaw || []) as unknown[])
    : [];

  let localItems: ScriptListItem[] = [];
  if (settings.useVariables) {
    try {
      const collection = await findLocalScriptsCollection(storage);
      if (collection) {
        const { listItems } = await readScriptsFromCollection(storage, collection);
        localItems = listItems;
      }
    } catch (err) {
      scriptStorageLog(
        'CodeFig: local script variables unavailable: ' +
          (err instanceof Error ? err.message : String(err))
      );
    }
  }

  let remoteItems: ScriptListItem[] = [];
  if (settings.useVariables) {
    try {
      remoteItems = await listRemoteScriptStubsFromLibraries(storage);
    } catch (err) {
      scriptStorageLog(
        'CodeFig: remote script list failed: ' +
          (err instanceof Error ? err.message : String(err))
      );
    }
  }

  // Read-only merge — no gap-fill writes on LIST.
  const items = storage.mergeScriptInventory(localItems, clientList, remoteItems);
  scriptStorageLog(
    'CodeFig: scripts LIST — localVars=' +
      localItems.length +
      ' clientStorage=' +
      (Array.isArray(clientList) ? clientList.length : 0) +
      ' remote=' +
      remoteItems.length +
      (remoteItems.length
        ? ' [' +
          remoteItems
            .map(function (r) {
              return (r.libraryName || '?') + ':' + r.name;
            })
            .join(', ') +
          ']'
        : '')
  );
  return { items, lastOpenedScript: lastOpenedScript || null };
}

const CODEFIG_SCRIPTS_PAGE = 'CodeFig Scripts';
const CANVAS_TEXT_CHUNK = 900;

type CanvasFonts = {
  regular: FontName;
  bold: FontName;
  italic?: FontName;
  boldItalic?: FontName;
  mono?: FontName;
};

type CanvasDocBlock = {
  type: string;
  depth?: number;
  text?: string;
  lang?: string;
  ordered?: boolean;
  start?: number;
  segments?: Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: string | boolean; strike?: boolean }>;
  items?: Array<{ text?: string; segments?: CanvasDocBlock['segments']; task?: boolean; checked?: boolean }>;
  header?: string[];
  rows?: string[][];
};

type CanvasPanelRow = {
  type: string;
  level?: number;
  text?: string;
  section?: boolean;
  label?: string;
  hint?: string;
  inputType?: string;
  value?: string;
  options?: string[];
  chips?: string[];
  multi?: boolean;
  radio?: boolean;
};

type CanvasScriptPayload = {
  name: string;
  code: string;
  id?: string | null;
  docs?: string;
  docsBlocks?: CanvasDocBlock[];
  panelRows?: CanvasPanelRow[];
  uiSummary?: string;
};

type CanvasScriptRenderModule = {
  ROOT_WIDTH?: number;
  renderMarkdownInto: (parent: FrameNode, blocks: CanvasDocBlock[], fonts: CanvasFonts) => void;
  renderPanelMockInto: (parent: FrameNode, panelRows: CanvasPanelRow[], fonts: CanvasFonts) => void;
  renderScriptCard?: (
    script: CanvasScriptPayload,
    fonts: CanvasFonts,
    x: number,
    y: number
  ) => SceneNode;
  findSrcNode?: (card: SceneNode) => TextNode | null;
};

let canvasScriptRender: CanvasScriptRenderModule | null = null;
try {
  canvasScriptRender = __codefigMainRequire('./canvas-script-render') as CanvasScriptRenderModule;
} catch (err) {
  console.warn(
    'CodeFig: canvas-script-render unavailable:',
    err instanceof Error ? err.message : String(err)
  );
}

async function tryLoadFont(family: string, style: string): Promise<FontName | null> {
  const font: FontName = { family, style };
  try {
    await figma.loadFontAsync(font);
    return font;
  } catch {
    return null;
  }
}

async function loadCanvasFonts(): Promise<CanvasFonts> {
  const regular =
    (await tryLoadFont('Inter', 'Regular')) ||
    (await tryLoadFont('Roboto', 'Regular')) ||
    ({ family: 'Inter', style: 'Regular' } as FontName);
  try {
    await figma.loadFontAsync(regular);
  } catch {
    /* already tried */
  }
  const bold =
    (await tryLoadFont(regular.family, 'Bold')) ||
    (await tryLoadFont('Inter', 'Bold')) ||
    (await tryLoadFont('Roboto', 'Bold')) ||
    regular;
  const italic = (await tryLoadFont(regular.family, 'Italic')) || undefined;
  const boldItalic =
    (await tryLoadFont(regular.family, 'Bold Italic')) ||
    (await tryLoadFont(regular.family, 'BoldItalic')) ||
    undefined;
  const mono =
    (await tryLoadFont('Roboto Mono', 'Regular')) ||
    (await tryLoadFont('Source Code Pro', 'Regular')) ||
    undefined;
  return { regular, bold, italic, boldItalic, mono };
}

async function ensureCodeFigScriptsPage(): Promise<PageNode> {
  for (const page of figma.root.children) {
    if (page.type === 'PAGE' && page.name === CODEFIG_SCRIPTS_PAGE) {
      await page.loadAsync();
      return page;
    }
  }
  const page = figma.createPage();
  page.name = CODEFIG_SCRIPTS_PAGE;
  return page;
}

function createCanvasText(
  chars: string,
  font: FontName,
  size: number,
  color: RGB
): TextNode {
  const t = figma.createText();
  t.fontName = font;
  t.fontSize = size;
  t.characters = chars == null ? '' : String(chars);
  t.fills = [{ type: 'SOLID', color }];
  t.layoutAlign = 'STRETCH';
  t.textAutoResize = 'HEIGHT';
  return t;
}

function chunkTextForCanvas(text: string, limit: number): string[] {
  const s = String(text || '');
  if (!s) return [''];
  if (s.length <= limit) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += limit) {
    out.push(s.slice(i, i + limit));
  }
  return out;
}

/**
 * Ensure a local STRING var holds raw source + id in description (for SRC bind / paste-share).
 */
async function ensureScriptVariableForCanvas(
  storage: ScriptStorageModule,
  script: CanvasScriptPayload
): Promise<Variable | null> {
  if (!script || !String(script.code || '').trim()) return null;
  const collection = await ensureScriptsCollection(storage);
  const byName = await loadCollectionVariablesByName(collection);
  const modeId = collectionModeId(collection);
  const valueByKey = valueMapFromCollection(byName, modeId);
  const descriptionByKey = descriptionMapFromCollection(byName);
  const listed = storage.listScriptsFromValues(valueByKey, descriptionByKey);
  const existing = storage.findEntryByName(listed.scripts, script.name);
  const id =
    (existing && existing.id) ||
    (script.id != null && String(script.id).trim() !== ''
      ? String(script.id).trim()
      : storage.mintScriptId());
  const planned = storage.planScriptWrite({
    id,
    name: script.name,
    code: script.code,
    type: 'user'
  });
  const orphanedKeys = storage.orphanedKeysFor(
    existing ? existing.chunkKeys : undefined,
    planned.entry.chunkKeys
  );
  await writeScriptVariables(
    storage,
    collection,
    byName,
    modeId,
    planned.variables,
    orphanedKeys
  );
  const primary = planned.entry.path || planned.entry.chunkKeys[0];
  const refreshed = await loadCollectionVariablesByName(collection);
  return refreshed.get(primary) || null;
}

function bindSrcToVariable(src: TextNode | null, variable: Variable | null): void {
  if (!src || !variable) return;
  try {
    const scopes = scriptStorage ? scriptStorage.SCRIPT_VARIABLE_SCOPES : ['TEXT_CONTENT'];
    variable.scopes = scopes as VariableScope[];
    src.setBoundVariable('characters', variable);
  } catch (err) {
    console.warn(
      'CodeFig: could not bind SRC to script variable:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function renderOneScriptFrame(
  script: CanvasScriptPayload,
  fonts: CanvasFonts,
  x: number,
  y: number
): Promise<SceneNode> {
  let variable: Variable | null = null;
  if (scriptStorage) {
    try {
      variable = await ensureScriptVariableForCanvas(scriptStorage, script);
    } catch (err) {
      console.warn(
        'CodeFig: canvas variable ensure failed:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  if (canvasScriptRender && typeof canvasScriptRender.renderScriptCard === 'function') {
    const card = canvasScriptRender.renderScriptCard(script, fonts, x, y);
    const src =
      typeof canvasScriptRender.findSrcNode === 'function'
        ? canvasScriptRender.findSrcNode(card)
        : ((card as any).findOne &&
            (card as any).findOne((n: BaseNode) => n && n.name === 'SRC')) ||
          null;
    bindSrcToVariable(src && src.type === 'TEXT' ? src : null, variable);
    return card;
  }
  // Fallback if shim module is old — vertical stack (legacy).
  const ink: RGB = { r: 0.12, g: 0.12, b: 0.12 };
  const muted: RGB = { r: 0.4, g: 0.4, b: 0.4 };
  const frame = figma.createFrame();
  frame.name = script.name || 'Script';
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'FIXED';
  frame.resize(720, 100);
  frame.itemSpacing = 12;
  frame.paddingTop = 24;
  frame.paddingBottom = 24;
  frame.paddingLeft = 24;
  frame.paddingRight = 24;
  frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  frame.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
  frame.strokeWeight = 1;
  frame.cornerRadius = 8;
  frame.x = x;
  frame.y = y;
  frame.appendChild(createCanvasText(script.name || 'Untitled', fonts.bold, 20, ink));
  frame.appendChild(createCanvasText('Documentation', fonts.bold, 14, ink));
  const docs = String(script.docs || '').trim() || '(No documentation block in this script.)';
  for (const chunk of chunkTextForCanvas(docs, CANVAS_TEXT_CHUNK)) {
    frame.appendChild(createCanvasText(chunk, fonts.regular, 12, muted));
  }
  frame.appendChild(createCanvasText('Configuration UI', fonts.bold, 14, ink));
  frame.appendChild(
    createCanvasText(
      String(script.uiSummary || '').trim() || 'Open this script in CodeFig to use its Configuration UI.',
      fonts.regular,
      12,
      muted
    )
  );
  frame.appendChild(createCanvasText('Source code', fonts.bold, 14, ink));
  const mono = fonts.mono || fonts.regular;
  const src = createCanvasText(
    String(script.code || '').slice(0, CANVAS_TEXT_CHUNK) || ' ',
    mono,
    11,
    ink
  );
  src.name = 'SRC';
  frame.appendChild(src);
  bindSrcToVariable(src, variable);
  return frame;
}

async function renderScriptsOnCanvasPage(scripts: CanvasScriptPayload[]): Promise<number> {
  const page = await ensureCodeFigScriptsPage();
  await figma.setCurrentPageAsync(page);
  const fonts = await loadCanvasFonts();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const gap = 80;
  const colWidth =
    canvasScriptRender && canvasScriptRender.ROOT_WIDTH
      ? Number(canvasScriptRender.ROOT_WIDTH) + gap
      : 1880;
  let count = 0;
  const created: SceneNode[] = [];
  for (const script of scripts) {
    if (!script || !String(script.code || '').trim()) continue;
    const frame = await renderOneScriptFrame(script, fonts, x, y);
    page.appendChild(frame);
    created.push(frame);
    rowHeight = Math.max(rowHeight, (frame as LayoutMixin).height || 0);
    x += colWidth;
    if (x > colWidth * 1.5) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    count++;
  }
  if (created.length > 0) {
    figma.viewport.scrollAndZoomIntoView(created.slice(0, Math.min(3, created.length)));
  }
  return count;
}

// Extract script metadata from code (name, type)
function extractScriptMetadata(code: string, filePath: string): { name: string; type: string } {
  const filename = filePath.split('/').pop() || '';
  const filenameWithoutExt = filename.replace(/\.js$/, '');
  
  // Default name from filename
  let name = filenameWithoutExt.replace(/[-_]/g, ' ');
  name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  
  // Determine type from folder path
  let type = 'prebuilt';
  let folderPrefix = '';
  if (filePath.includes('/HELP/')) {
    type = 'help';
  } else if (filePath.includes('/CODEFIG_LIBRARIES/')) {
    type = 'prebuilt';
    folderPrefix = 'CodeFig Libraries';
  } else if (filePath.includes('/EXAMPLE_SCRIPTS/')) {
    type = 'prebuilt';
    const marker = '/EXAMPLE_SCRIPTS/';
    const idx = filePath.indexOf(marker);
    const after = idx !== -1 ? filePath.slice(idx + marker.length) : '';
    const segments = after.split('/').filter(Boolean);
    segments.pop();
    if (segments.length === 0) {
      folderPrefix = 'Utility Scripts';
    } else {
      folderPrefix = segments.join(' · ');
    }
  }
  
  // Extract name from code comments
  const lines = code.split('\n').slice(0, 20);
  for (const line of lines) {
    // Look for SCRIPT_NAME comment
    const nameMatch = line.match(/\/\/\s*SCRIPT_NAME:\s*(.+)/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
      continue;
    }
    
    // Look for title comment as first non-empty line
    const trimmed = line.trim();
    if (trimmed && trimmed.startsWith('//')) {
      const commentContent = trimmed.replace(/^\/\/\s*/, '').trim();
      const isDocOrConfigMarker =
        commentContent.startsWith('@DOC_') || commentContent.startsWith('@UI_CONFIG');
      // Skip doc/config markers and other non-title comments (@Variables / @Core Library titles are OK)
      if (commentContent.length > 0 &&
          !isDocOrConfigMarker &&
          !commentContent.startsWith('#') &&
          !commentContent.includes('===') &&
          !commentContent.includes('==') &&
          !commentContent.toLowerCase().includes('execute') &&
          !commentContent.toLowerCase().includes('function') &&
          !commentContent.toLowerCase().includes('collection of')) {
        name = commentContent;
        break;
      }
    }
  }
  
  // Add folder prefix for prebuilt scripts
  if (type === 'prebuilt' && folderPrefix) {
    name = `${folderPrefix} / ${name}`;
  }
  
  return { name, type };
}

// Check if a filename should be excluded
function shouldExcludeScript(filename: string): boolean {
  // Exclude files starting with _ or .
  if (filename.startsWith('_') || filename.startsWith('.')) {
    return true;
  }
  // Exclude backup files
  if (filename.match(/\.(bak\d*|backup|old|tmp)\.js$/i)) {
    return true;
  }
  return false;
}

// Store scripts received from UI
let cachedScripts: any[] | null = null;

// Auto-discover and load scripts
async function loadExampleScripts() {
  try {
    let scripts: any[] = [];
    
    // First, try to use cached scripts from UI
    if (cachedScripts && cachedScripts.length > 0) {
      scripts = cachedScripts;
      debugLog('Loaded scripts from cache (received from UI)');
    } else {
      // Fallback: try to discover from __uiFiles__ (for backwards compatibility)
      for (const filePath in __uiFiles__) {
        // Match scripts/**/*.js pattern
        if (filePath.match(/^scripts\/.*\.js$/)) {
          // Get filename to check exclusion
          const filename = filePath.split('/').pop() || '';
          
          // Exclude files starting with _ or . and backup files
          if (shouldExcludeScript(filename)) {
            continue;
          }
          
          const code = __uiFiles__[filePath];
          if (code) {
            // Extract metadata from code
            const metadata = extractScriptMetadata(code, filePath);
            
            scripts.push({
              name: metadata.name,
              code: code,
              type: metadata.type,
              filename: filename
            });
          }
        }
      }
      debugLog(`Auto-discovered ${scripts.length} scripts from __uiFiles__`);
    }
    
    // Process scripts: extract metadata and format
    const processedScripts = scripts.map(script => {
      // Always extract metadata from code to ensure we have proper names
      const metadata = extractScriptMetadata(script.code, script.filePath || '');
      
      return {
        name: metadata.name, // Use extracted name (from comments or filename)
        code: script.code,
        type: script.type || metadata.type, // Use provided type or extracted type
        filename: script.filename || script.filePath?.split('/').pop() || 'unknown',
        // Plan 32: stamped at build time onto the embed; must survive this remap or packages
        // stay inert at run time.
        packageId: script.packageId || undefined,
        packageVisibility: script.packageVisibility || undefined
      };
    });
    
    debugLog(`Loaded ${processedScripts.length} utility scripts`);
    return processedScripts;
  } catch (error) {
    debugError('Failed to load utility scripts:', error);
    return [];
  }
}

// Handle messages from the UI
figma.ui.onmessage = (msg) => {
  debugLog('Backend: Received message type:', msg.type);
  
  if (msg.type === 'UI_DEBUG') {
    debugLog('[UI]', msg.message || msg.payload || '');
    return;
  }

  if (msg.type === 'OPEN_EXTERNAL') {
    const url = typeof (msg as { url?: string }).url === 'string' ? (msg as { url: string }).url : '';
    if (/^https:\/\/buymeacoffee\.com\//i.test(url)) {
      figma.openExternal(url);
    }
    return;
  }
  
  if (msg.type === 'SET_SCRIPTS') {
    // Cache scripts received from UI
    if (msg.scripts && Array.isArray(msg.scripts)) {
      cachedScripts = msg.scripts;
      debugLog('Scripts cached from UI:', cachedScripts ? cachedScripts.length : 0, 'scripts');
    }
    return;
  }
  
  if (msg.type === 'LOAD_EXAMPLE_SCRIPTS') {
    loadExampleScripts().then(scripts => {
      figma.ui.postMessage({
        type: 'EXAMPLE_SCRIPTS',
        items: scripts
      });
    });
    return;
  }
  
  if (msg.type === 'LIST') {
    scheduleFoundationMaintain('list');
    // clientStorage remains canonical while SCRIPT_STORAGE_VARIABLES is false (plan 38).
    if (SCRIPT_STORAGE_VARIABLES && scriptStorage) {
      listScriptsWithVariableStore(scriptStorage)
        .then(({ items, lastOpenedScript }) => {
          figma.ui.postMessage({
            type: 'LIST',
            items,
            lastOpenedScript: lastOpenedScript || null
          });
        })
        .catch((err) => {
          debugError('LIST (variable store) failed:', err);
          figma.clientStorage.getAsync('userScripts').then((scripts) => {
            figma.clientStorage.getAsync('lastOpenedScript').then((lastOpenedScript) => {
              const items = (scripts || []).map((s: any) => ({
                name: s.name,
                code: s.code,
                type: (s.name && String(s.name).startsWith('@')) ? 'library' : 'user'
              }));
              figma.ui.postMessage({
                type: 'LIST',
                items,
                lastOpenedScript: lastOpenedScript || null
              });
            });
          });
        });
      return;
    }
    Promise.all([
      figma.clientStorage.getAsync('userScripts'),
      figma.clientStorage.getAsync('lastOpenedScript')
    ]).then(([scripts, lastOpenedScript]) => {
      const items = (scripts || []).map((s: any) => ({
        name: s.name,
        code: s.code,
        type: (s.name && String(s.name).startsWith('@')) ? 'library' : 'user'
      }));
      figma.ui.postMessage({
        type: 'LIST',
        items,
        lastOpenedScript: lastOpenedScript || null
      });
    });
    return;
  }

  if (msg.type === 'LOAD_REMOTE_SCRIPT') {
    if (!SCRIPT_STORAGE_VARIABLES || !scriptStorage) {
      figma.ui.postMessage({
        type: 'REMOTE_SCRIPT_FAILED',
        storageId: msg.storageId || '',
        error: 'Variable script storage is off'
      });
      return;
    }
    const storage = scriptStorage;
    const remote = msg.remote as ScriptListItem['remote'];
    const storageId = String(msg.storageId || '');
    const name = String(msg.name || '');
    if (!remote || !Array.isArray(remote.variables) || remote.variables.length === 0) {
      figma.ui.postMessage({
        type: 'REMOTE_SCRIPT_FAILED',
        storageId,
        name,
        error: 'Missing remote variable keys'
      });
      return;
    }
    loadRemoteScriptBody(storage, remote)
      .then((code) => {
        figma.ui.postMessage({
          type: 'REMOTE_SCRIPT_LOADED',
          storageId,
          name,
          code,
          libraryName: remote.libraryName || '',
          scriptType: name.charAt(0) === '@' ? 'library' : 'user'
        });
      })
      .catch((error) => {
        figma.ui.postMessage({
          type: 'REMOTE_SCRIPT_FAILED',
          storageId,
          name,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    return;
  }

  if (msg.type === 'LOAD_SCRIPT_STORAGE_SETTINGS') {
    loadScriptStorageSettings().then((settings) => {
      figma.ui.postMessage({ type: 'SCRIPT_STORAGE_SETTINGS', settings });
    });
    return;
  }

  if (msg.type === 'SAVE_SCRIPT_STORAGE_SETTINGS') {
    const settings = normalizeScriptStorageSettings(
      (msg as { settings?: unknown }).settings != null
        ? (msg as { settings: unknown }).settings
        : msg
    );
    figma.clientStorage
      .setAsync(SCRIPT_STORAGE_SETTINGS_KEY, settings)
      .then(() => {
        figma.ui.postMessage({
          type: 'SCRIPT_STORAGE_SETTINGS_SAVED',
          settings
        });
      })
      .catch((error) => {
        figma.ui.postMessage({
          type: 'NOTIFY',
          message:
            'Could not save settings: ' +
            (error instanceof Error ? error.message : String(error))
        });
      });
    return;
  }

  if (msg.type === 'RENDER_SCRIPTS_ON_CANVAS') {
    const raw = Array.isArray((msg as { scripts?: unknown }).scripts)
      ? (msg as { scripts: any[] }).scripts
      : [];
    const scripts: CanvasScriptPayload[] = raw
      .filter((s) => s && typeof s.name === 'string' && s.code != null)
      .map((s) => ({
        name: String(s.name),
        code: typeof s.code === 'string' ? s.code : String(s.code),
        id: s.id != null && String(s.id).trim() !== '' ? String(s.id).trim() : null,
        docs: s.docs != null ? String(s.docs) : '',
        docsBlocks: Array.isArray(s.docsBlocks) ? s.docsBlocks : [],
        panelRows: Array.isArray(s.panelRows) ? s.panelRows : [],
        uiSummary: s.uiSummary != null ? String(s.uiSummary) : ''
      }));
    renderScriptsOnCanvasPage(scripts)
      .then((count) => {
        figma.ui.postMessage({ type: 'CANVAS_RENDER_DONE', count });
      })
      .catch((error) => {
        figma.ui.postMessage({
          type: 'CANVAS_RENDER_FAILED',
          error: error instanceof Error ? error.message : String(error)
        });
      });
    return;
  }

  if (msg.type === 'GET_OPTIONS') {
    const optionSource = msg.optionSource;
    // Where a set should be *written*: this file's collections only, and no empty entry.
    // `variableCollections` answers a different question — which collections to *read* — so it
    // includes libraries and an "(all collections)" option, neither of which is a valid target.
    if (optionSource === 'localCollections') {
      figma.variables.getLocalVariableCollectionsAsync().then((collections) => {
        const names = (collections || [])
          .map((c) => c && c.name)
          .filter((n) => n != null && String(n).trim() !== '');
        figma.ui.postMessage({
          type: 'OPTIONS',
          optionSource: optionSource,
          options: [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b)))
        });
      }).catch((err) => {
        console.error('Backend: localCollections fetch failed', err);
        figma.ui.postMessage({ type: 'OPTIONS', optionSource: optionSource, options: [] });
      });
      return;
    }
    // The modes of one named collection, for the mode picker. Unlike every other option source this
    // one takes an argument, so the answer carries the collection back: two pickers pointed at
    // different collections receive both replies, and each has to be able to tell which is its own.
    // `exists` is the difference between "no modes" and "no collection", which is the whole of what
    // the control says when a new collection is about to be created.
    if (optionSource === 'collectionModes') {
      const wanted = msg.collection == null ? '' : String(msg.collection).trim();
      figma.variables.getLocalVariableCollectionsAsync().then((collections) => {
        const match = (collections || []).filter(
          (c) => c && String(c.name).trim().toLowerCase() === wanted.toLowerCase()
        )[0];
        const modes = match && match.modes ? match.modes : [];
        figma.ui.postMessage({
          type: 'OPTIONS',
          optionSource: optionSource,
          collection: wanted,
          exists: !!match,
          options: modes.map((m) => m && m.name).filter((n) => n != null && String(n).trim() !== '')
        });
      }).catch((err) => {
        console.error('Backend: collectionModes fetch failed', err);
        figma.ui.postMessage({
          type: 'OPTIONS',
          optionSource: optionSource,
          collection: wanted,
          exists: false,
          options: []
        });
      });
      return;
    }
    if (optionSource === 'variableCollections') {
      Promise.all([
        figma.variables.getLocalVariableCollectionsAsync(),
        figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync().catch(() => [])
      ]).then(([localCollections, libraryCollections]) => {
        const localNames = (localCollections || []).map((c) => c && c.name).filter((n) => n != null && String(n).trim() !== '');
        const libraryNames = (libraryCollections || []).map((c) => c && c.name).filter((n) => n != null && String(n).trim() !== '');
        const localSorted = [...new Set(localNames)].sort((a, b) => String(a).localeCompare(String(b)));
        const librarySorted = [...new Set(libraryNames)].sort((a, b) => String(a).localeCompare(String(b)));
        const names = [...new Set([...localSorted, ...librarySorted])];
        const options = [''].concat(names);
        const optionGroups: { label: string; values: string[] }[] = [];
        if (localSorted.length) optionGroups.push({ label: 'This file', values: localSorted });
        if (librarySorted.length) optionGroups.push({ label: 'Libraries', values: librarySorted });
        figma.ui.postMessage({
          type: 'OPTIONS',
          optionSource: optionSource || '',
          options,
          ...(optionGroups.length ? { optionGroups } : {})
        });
      }).catch((err) => {
        console.error('Backend: variableCollections fetch failed', err);
        figma.ui.postMessage({
          type: 'OPTIONS',
          optionSource: optionSource || '',
          options: []
        });
      });
      return;
    }
    if (optionSource === 'localVariableCollections') {
      figma.variables.getLocalVariableCollectionsAsync().then((localCollections) => {
        const names = (localCollections || []).map((c) => c && c.name).filter((n) => n != null && String(n).trim() !== '');
        const sorted = [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b)));
        const optionGroups = sorted.length ? [{ label: 'This file', values: sorted }] : undefined;
        figma.ui.postMessage({
          type: 'OPTIONS',
          optionSource: optionSource || '',
          options: sorted,
          ...(optionGroups ? { optionGroups } : {})
        });
      }).catch((err) => {
        console.error('Backend: localVariableCollections fetch failed', err);
        figma.ui.postMessage({
          type: 'OPTIONS',
          optionSource: optionSource || '',
          options: []
        });
      });
      return;
    }
    figma.ui.postMessage({
      type: 'OPTIONS',
      optionSource: optionSource || '',
      options: []
    });
    return;
  }

    if (msg.type === 'SYNC_SCRIPT_TO_VARIABLES') {
      if (!SCRIPT_STORAGE_VARIABLES || !scriptStorage) {
        figma.ui.postMessage({ type: 'SYNC_TO_VARIABLES_UNAVAILABLE' });
        return;
      }
      const scriptData = {
        name: String(msg.name || '').trim(),
        code: msg.code == null ? '' : String(msg.code),
        type: (msg.name && String(msg.name).startsWith('@')) ? 'library' : 'user'
      };
      if (!scriptData.name) {
        figma.ui.postMessage({
          type: 'SAVE_FAILED',
          error: 'No script name',
          scriptName: ''
        });
        return;
      }
      const storage = scriptStorage;
      getScriptWriteTargets(true)
        .then(async (targets) => {
          if (!targets.vars) {
            figma.ui.postMessage({ type: 'SYNC_TO_VARIABLES_UNAVAILABLE' });
            return;
          }
          await saveScriptToVariableStore(storage, scriptData);
          if (targets.client) {
            const scripts = await figma.clientStorage.getAsync('userScripts');
            const userScripts = upsertClientStorageScripts(scripts || [], scriptData);
            await figma.clientStorage.setAsync('userScripts', userScripts);
          }
          figma.ui.postMessage({ type: 'SAVE_CONFIRMED', scriptData: scriptData });
        })
        .catch((error) => {
          figma.ui.postMessage({
            type: 'SAVE_FAILED',
            error: error instanceof Error ? error.message : String(error),
            scriptName: scriptData.name
          });
        });
      return;
    }

    if (msg.type === 'SYNC_ALL_TO_VARIABLES') {
      if (!SCRIPT_STORAGE_VARIABLES || !scriptStorage) {
        figma.ui.postMessage({ type: 'SYNC_TO_VARIABLES_UNAVAILABLE' });
        return;
      }
      const rawItems = Array.isArray((msg as { scripts?: unknown }).scripts)
        ? (msg as { scripts: any[] }).scripts
        : [];
      const normalized: { name: string; code: string; type: string }[] = [];
      for (const item of rawItems) {
        if (!item || typeof item.name !== 'string' || item.code === undefined || item.code === null) {
          continue;
        }
        const name = String(item.name).trim();
        if (!name) continue;
        const code = typeof item.code === 'string' ? item.code : String(item.code);
        if (!code.trim()) continue;
        const isAtLib = name.startsWith('@');
        const type =
          isAtLib ? 'library' : item.type === 'library' ? 'library' : 'user';
        normalized.push({ name, code, type });
      }
      if (normalized.length === 0) {
        figma.ui.postMessage({
          type: 'BATCH_SAVE_FAILED',
          error: 'No scripts to sync'
        });
        return;
      }
      const storage = scriptStorage;
      getScriptWriteTargets(true)
        .then(async (targets) => {
          if (!targets.vars) {
            figma.ui.postMessage({ type: 'SYNC_TO_VARIABLES_UNAVAILABLE' });
            return;
          }
          await saveBatchToVariableStore(storage, normalized);
          if (targets.client) {
            const scripts = await figma.clientStorage.getAsync('userScripts');
            let userScripts = (scripts || []).slice();
            for (const scriptData of normalized) {
              userScripts = upsertClientStorageScripts(userScripts, scriptData);
            }
            await figma.clientStorage.setAsync('userScripts', userScripts);
          }
          figma.ui.postMessage({
            type: 'BATCH_SAVE_CONFIRMED',
            scripts: normalized
          });
        })
        .catch((error) => {
          figma.ui.postMessage({
            type: 'BATCH_SAVE_FAILED',
            error: error instanceof Error ? error.message : String(error)
          });
        });
      return;
    }

    if (msg.type === 'SAVE') {
      // Save a script
      debugLog('Backend: Received SAVE request for:', msg.name);
      debugLog('Backend: SAVE request data:', {
        name: msg.name,
        codeLength: msg.code ? msg.code.length : 'undefined',
        codePreview: msg.code ? msg.code.substring(0, 50) + '...' : 'undefined',
        type: msg.type
      });

      const scriptData = {
        name: msg.name,
        code: msg.code,
        type: (msg.name && String(msg.name).startsWith('@')) ? 'library' : 'user'
      };

      if (SCRIPT_STORAGE_VARIABLES && scriptStorage) {
        const storage = scriptStorage;
        const searchName = msg.oldName || msg.name;
        getScriptWriteTargets(false)
          .then((targets) => {
            const chain = targets.vars
              ? saveScriptToVariableStore(storage, scriptData, msg.oldName)
              : Promise.resolve(scriptData);
            return chain.then(() => {
              if (!targets.client) return;
              return figma.clientStorage.getAsync('userScripts').then((scripts) => {
                const userScripts = upsertClientStorageScripts(
                  scripts || [],
                  scriptData,
                  searchName
                );
                return figma.clientStorage.setAsync('userScripts', userScripts);
              });
            });
          })
          .then(() => {
            debugLog('Backend: Save successful, sending confirmation');
            figma.ui.postMessage({
              type: 'SAVE_CONFIRMED',
              scriptData: scriptData
            });
          })
          .catch((error) => {
            debugError('Backend: Save failed:', error);
            figma.ui.postMessage({
              type: 'SAVE_FAILED',
              error: error instanceof Error ? error.message : String(error),
              scriptName: msg.name
            });
          });
        return;
      }
      
      figma.clientStorage.getAsync('userScripts').then((scripts) => {
        const userScripts = scripts || [];
        
        // If oldName is provided, look for the script by oldName (for renames)
        // Otherwise, look for the script by current name
        const searchName = msg.oldName || msg.name;
        const existingIndex = userScripts.findIndex((s: any) => s.name === searchName);

        if (existingIndex >= 0) {
          userScripts[existingIndex] = scriptData;
          debugLog('Backend: Updated existing script' + (msg.oldName ? ` (renamed from ${msg.oldName} to ${msg.name})` : ''));
        } else {
          userScripts.push(scriptData);
          debugLog('Backend: Added new script');
        }

        debugLog('Backend: Saving to storage...');
        
        figma.clientStorage.setAsync('userScripts', userScripts).then(() => {
          debugLog('Backend: Save successful, sending confirmation');
          // Confirm save completed
          figma.ui.postMessage({
            type: 'SAVE_CONFIRMED',
            scriptData: scriptData
          });
        }).catch((error) => {
          debugError('Backend: Save failed:', error);
          figma.ui.postMessage({
            type: 'SAVE_FAILED',
            error: error.message,
            scriptName: msg.name
          });
        });
      }).catch((error) => {
        debugError('Backend: Failed to load user scripts:', error);
        figma.ui.postMessage({
          type: 'SAVE_FAILED',
          error: error.message,
          scriptName: msg.name
        });
      });
    }

    if (msg.type === 'SAVE_BATCH') {
      const rawItems = Array.isArray((msg as { scripts?: unknown }).scripts)
        ? (msg as { scripts: any[] }).scripts
        : [];
      const normalized: { name: string; code: string; type: string }[] = [];
      for (const item of rawItems) {
        if (!item || typeof item.name !== 'string' || item.code === undefined || item.code === null) {
          continue;
        }
        const name = String(item.name).trim();
        if (!name) continue;
        const code = typeof item.code === 'string' ? item.code : String(item.code);
        const isAtLib = name.startsWith('@');
        const type =
          isAtLib ? 'library' : item.type === 'library' ? 'library' : 'user';
        normalized.push({ name, code, type });
      }
      if (normalized.length === 0) {
        figma.ui.postMessage({
          type: 'BATCH_SAVE_FAILED',
          error: 'No valid scripts'
        });
        return;
      }

      if (SCRIPT_STORAGE_VARIABLES && scriptStorage) {
        const storage = scriptStorage;
        getScriptWriteTargets(false)
          .then((targets) => {
            const chain = targets.vars
              ? saveBatchToVariableStore(storage, normalized)
              : Promise.resolve(normalized);
            return chain.then(() => {
              if (!targets.client) return;
              return figma.clientStorage.getAsync('userScripts').then((scripts) => {
                let userScripts = (scripts || []).slice();
                for (const scriptData of normalized) {
                  userScripts = upsertClientStorageScripts(userScripts, scriptData);
                }
                return figma.clientStorage.setAsync('userScripts', userScripts);
              });
            });
          })
          .then(() => {
            figma.ui.postMessage({
              type: 'BATCH_SAVE_CONFIRMED',
              scripts: normalized
            });
          })
          .catch((error) => {
            debugError('BATCH_SAVE failed:', error);
            figma.ui.postMessage({
              type: 'BATCH_SAVE_FAILED',
              error: error instanceof Error ? error.message : String(error)
            });
          });
        return;
      }

      figma.clientStorage
        .getAsync('userScripts')
        .then((scripts) => {
          const userScripts = (scripts || []).slice();
          for (const scriptData of normalized) {
            const existingIndex = userScripts.findIndex((s: any) => s.name === scriptData.name);
            if (existingIndex >= 0) {
              userScripts[existingIndex] = scriptData;
            } else {
              userScripts.push(scriptData);
            }
          }
          return figma.clientStorage.setAsync('userScripts', userScripts).then(() => {
            figma.ui.postMessage({
              type: 'BATCH_SAVE_CONFIRMED',
              scripts: normalized
            });
          });
        })
        .catch((error) => {
          debugError('BATCH_SAVE failed:', error);
          figma.ui.postMessage({
            type: 'BATCH_SAVE_FAILED',
            error: error instanceof Error ? error.message : String(error)
          });
        });
      return;
    }

  if (msg.type === 'DELETE') {
    // Delete a script
    if (SCRIPT_STORAGE_VARIABLES && scriptStorage) {
      const storage = scriptStorage;
      const name = msg.name;
      deleteScriptFromVariableStore(storage, name)
        .then(() => figma.clientStorage.getAsync('userScripts'))
        .then((scripts) => {
          const userScripts = scripts || [];
          const filteredScripts = userScripts.filter((s: any) => s.name !== name);
          return figma.clientStorage.setAsync('userScripts', filteredScripts);
        })
        .catch((error) => {
          debugError('DELETE (variable store) failed:', error);
        });
      return;
    }
    figma.clientStorage.getAsync('userScripts').then((scripts) => {
      const userScripts = scripts || [];
      const filteredScripts = userScripts.filter((s: any) => s.name !== msg.name);
      figma.clientStorage.setAsync('userScripts', filteredScripts);
    });
  }

  if (msg.type === 'RUN') {
    // Execute the script code with memory management
    const codeToExecute = msg.code;
    let jsCode: string = codeToExecute;
    // A silent run is one the user did not start: the sync button reading this file's config.
    // It must leave no trace — nothing in figma-console.log, no toast — or opening a script
    // would narrate itself.
    const silentRun = msg.silent === true;
    
    try {
      // Pure JavaScript execution - no TypeScript conversion
      
      // Create a custom console object that uses our debugLog function and forwards to Cursor bridge
      const scriptConsole = {
        log: (...args: any[]) => {
          const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(' ');
          debugLog('Script:', message);
          if (!silentRun) forwardToConsoleBridge('log', ['[Script]', ...args]);
        },
        error: (...args: any[]) => {
          const message = args.map(arg => {
            if (arg instanceof Error) {
              return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
            }
            return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
          }).join(' ');
          debugScriptError('Script:', message);
          if (!silentRun) forwardToConsoleBridge('error', ['[Script]', ...args]);
        },
        warn: (...args: any[]) => {
          const message = args.map(arg => {
            if (arg instanceof Error) {
              return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
            }
            return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
          }).join(' ');
          debugScriptWarn('Script Warning:', message);
          if (!silentRun) forwardToConsoleBridge('warn', ['[Script]', ...args]);
        }
      };

      // Create a function that has access to Figma API
      // Add common Figma API shortcuts for convenience
      // Use string concatenation (not a template literal around jsCode): user scripts may contain
      // backticks in comments or code; embedding with ${jsCode} inside `...` breaks parsing.
      const scriptFunction = new Function(
        'figma',
        'console',
        'window',
        [
          '// Convenience shortcuts - make selection and currentPage available',
          'const selection = figma.currentPage.selection;',
          'const currentPage = figma.currentPage;',
          '',
          '// User code',
          jsCode,
        ].join('\n')
      );
      
      
      // Store messages to forward after script execution (in backend scope)
      const pendingMessages: any[] = [];
      
      // Create a mock window object for the script context
      const mockWindow: {
        _infoPanelHandler: (message: any) => void;
        _codefigDeterminateProgress: boolean;
        _codefigPendingOps: number;
        _codefigRunCompleteSent: boolean;
        _codefigLastProgressAt: number;
        codefigRunComplete: (opts?: { message?: string }) => void;
        codefigConfigLoadResult: (result: any) => void;
        _codefigRunOpEnd: () => void;
        // What the panel's mode chips said, when a panel started this run. A `modeId` is
        // file-specific and must never travel in a config, so the intent comes with the run instead
        // of in the text. Null for a CLI run, a queued job, or any script with no chips — and every
        // consumer treats null as "match on names and remove nothing", which is the standing
        // invariant a pasted config relies on.
        codefigModeIntents: any;
      } = {
        codefigModeIntents: msg.modeIntents || null,
        _codefigDeterminateProgress: false,
        _codefigPendingOps: 0,
        _codefigRunCompleteSent: false,
        _codefigLastProgressAt: 0,
        _infoPanelHandler: (message: any) => {
          if (message && message.type === 'PROGRESS_UPDATE') {
            mockWindow._codefigDeterminateProgress = true;
            mockWindow._codefigLastProgressAt = Date.now();
          }
          if (message && message.type === 'CODEFIG_RUN_OP_BEGIN') {
            mockWindow._codefigPendingOps += 1;
          }
          if (message && message.type === 'CODEFIG_RUN_OP_END') {
            mockWindow._codefigPendingOps = Math.max(0, mockWindow._codefigPendingOps - 1);
          }
          if (message && message.type === 'PROGRESS_COMPLETE' || message?.type === 'CODEFIG_RUN_COMPLETE') {
            mockWindow._codefigRunCompleteSent = true;
          }
          debugLog('Backend: Script sent message:', message?.type);
          figma.ui.postMessage(message);
        },
        codefigRunComplete: (opts?: { message?: string }) => {
          if (mockWindow._codefigRunCompleteSent) return;
          mockWindow._codefigRunCompleteSent = true;
          figma.ui.postMessage({
            type: 'CODEFIG_RUN_COMPLETE',
            message: opts && opts.message ? opts.message : undefined
          });
        },
        // How a silent run hands its answer back: straight to the UI, never through the console.
        codefigConfigLoadResult: (result: any) => {
          figma.ui.postMessage({ type: 'CONFIG_LOAD_RESULT', result: result });
          mockWindow.codefigRunComplete();
        },
        _codefigRunOpEnd: () => {
          mockWindow._codefigPendingOps = Math.max(0, mockWindow._codefigPendingOps - 1);
        }
      };

      const RUN_IDLE_MS = 800;
      const RUN_POLL_MS = 250;
      let runPollTimer: ReturnType<typeof setTimeout> | null = null;

      const tryFinishRunWhenIdle = () => {
        if (mockWindow._codefigRunCompleteSent) {
          if (runPollTimer) clearTimeout(runPollTimer);
          runPollTimer = null;
          return;
        }
        if (mockWindow._codefigPendingOps > 0) {
          runPollTimer = setTimeout(tryFinishRunWhenIdle, RUN_POLL_MS);
          return;
        }
        const idleFor = Date.now() - mockWindow._codefigLastProgressAt;
        if (mockWindow._codefigLastProgressAt > 0 && idleFor < RUN_IDLE_MS) {
          runPollTimer = setTimeout(tryFinishRunWhenIdle, RUN_POLL_MS);
          return;
        }
        mockWindow.codefigRunComplete();
      };

      const startRunIdlePolling = () => {
        if (runPollTimer) clearTimeout(runPollTimer);
        runPollTimer = setTimeout(tryFinishRunWhenIdle, RUN_POLL_MS);
      };
      
      // Pass the real figma object, custom console, and mock window
      scriptFunction(figma, scriptConsole, mockWindow);
      startRunIdlePolling();
      
      // figma.notify('Done! 😁');
    } catch (error) {
      figma.ui.postMessage({ type: 'CODEFIG_RUN_COMPLETE' });
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (silentRun) {
        figma.ui.postMessage({ type: 'CONFIG_LOAD_RESULT', result: { error: errorMessage } });
      } else {
        figma.notify(`Script error: ${errorMessage} 😳`, { error: true });
      }
      debugError('Backend: Script execution error:', error);
      debugError('Backend: Error message:', errorMessage);
      if (error instanceof Error && error.stack) {
        debugError('Backend: Error stack:', error.stack);
      }
      debugError('Backend: Code length:', msg.code.length);
      debugError('Backend: First 500 chars of code:', jsCode.substring(0, 500));
    }
  }

  if (msg.type === 'NOTIFY') {
    // Show notification
    figma.notify(msg.message);
  }

  if (msg.type === 'SET_LAST_OPENED') {
    // Store the last opened script
    figma.clientStorage.setAsync('lastOpenedScript', {
      name: msg.name,
      type: msg.scriptType
    });
  }
  
  if (msg.type === 'SAVE_COLLAPSED_SECTIONS') {
    // Save collapsed sections to client storage
    figma.clientStorage.setAsync('collapsedSections', msg.collapsedSections);
  }
  
  if (msg.type === 'LOAD_COLLAPSED_SECTIONS') {
    // Load collapsed sections from client storage
    figma.clientStorage.getAsync('collapsedSections').then((collapsedSections) => {
      figma.ui.postMessage({
        type: 'COLLAPSED_SECTIONS',
        collapsedSections: collapsedSections || []
      });
    });
  }
  
  if (msg.type === 'RESIZE_WINDOW') {
    // Resize the plugin window (without repositioning to avoid jumping)
    try {
      figma.ui.resize(msg.width, msg.height);
      debugLog('Backend: Resized window to:', msg.width, 'x', msg.height);
    } catch (error) {
      debugError('Backend: Failed to resize window:', error);
    }
  }
  
  if (msg.type === 'RESTORE_WINDOW') {
    // Restore window size and position
    try {
      figma.ui.resize(msg.width, msg.height);
      // Note: Figma doesn't support setting window position directly
      // The position will be handled by the browser/OS
      debugLog('Backend: Restored window to:', msg.width, 'x', msg.height);
    } catch (error) {
      debugError('Backend: Failed to restore window:', error);
    }
  }
  
  if (msg.type === 'SAVE_WINDOW_MEMORY') {
    // Save window memory to plugin storage
    try {
      figma.clientStorage.setAsync('window_memory', msg.memory);
      debugLog('💾 Backend: Saved window memory:', msg.memory);
    } catch (error) {
      debugError('Backend: Failed to save window memory:', error);
    }
  }
  
  if (msg.type === 'LOAD_WINDOW_MEMORY') {
    // Load window memory from plugin storage
    try {
      debugLog('📂 Backend: Loading window memory...');
      figma.clientStorage.getAsync('window_memory').then((memory) => {
        if (memory) {
          figma.ui.postMessage({
            type: 'WINDOW_MEMORY_LOADED',
            memory: memory
          });
          debugLog('📥 Backend: Loaded window memory:', memory);
        } else {
          debugLog('❌ Backend: No window memory found in storage');
        }
      });
    } catch (error) {
      debugError('Backend: Failed to load window memory:', error);
    }
  }
  
  if (msg.type === 'SELECT_NODE') {
    (async () => {
      try {
        const node = await figma.getNodeByIdAsync(msg.nodeId);
        if (node && 'type' in node) {
          figma.currentPage.selection = [node as SceneNode];
          figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
          debugLog('Backend: Selected node:', node.name);
        } else {
          debugLog('Backend: Node not found:', msg.nodeId);
        }
      } catch (error) {
        debugError('Backend: Failed to select node:', error);
      }
    })();
  }

  if (msg.type === 'SELECT_NODES') {
    (async () => {
      try {
        const ids = Array.isArray(msg.nodeIds) ? msg.nodeIds : [];
        const resolved = await Promise.all(
          ids.map((id: string) => figma.getNodeByIdAsync(id))
        );
        const nodes = resolved.filter(
          (node): node is SceneNode => node !== null && 'type' in node
        );

        if (nodes.length > 0) {
          figma.currentPage.selection = nodes;
          figma.viewport.scrollAndZoomIntoView(nodes);
          figma.notify(`Selected ${nodes.length} node${nodes.length === 1 ? '' : 's'}`);
          debugLog('Backend: Selected nodes:', nodes.map((n) => n.name));
        } else {
          debugLog('Backend: No valid nodes found for bulk selection');
        }
      } catch (error) {
        debugError('Backend: Failed to select nodes:', error);
      }
    })();
  }
};

