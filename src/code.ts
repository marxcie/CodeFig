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
        filename: script.filename || script.filePath?.split('/').pop() || 'unknown'
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
    // Get saved scripts and last opened script from client storage
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

    if (msg.type === 'SAVE') {
      // Save a script
      debugLog('Backend: Received SAVE request for:', msg.name);
      debugLog('Backend: SAVE request data:', {
        name: msg.name,
        codeLength: msg.code ? msg.code.length : 'undefined',
        codePreview: msg.code ? msg.code.substring(0, 50) + '...' : 'undefined',
        type: msg.type
      });
      
      figma.clientStorage.getAsync('userScripts').then((scripts) => {
        const userScripts = scripts || [];
        
        // If oldName is provided, look for the script by oldName (for renames)
        // Otherwise, look for the script by current name
        const searchName = msg.oldName || msg.name;
        const existingIndex = userScripts.findIndex((s: any) => s.name === searchName);
        
        const scriptData = {
          name: msg.name,
          code: msg.code,
          type: (msg.name && String(msg.name).startsWith('@')) ? 'library' : 'user'
        };

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

