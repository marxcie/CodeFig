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

// Debug logging functions to remove source references
function debugLog(message: string, ...args: any[]) {
  const log = console.log.bind(console);
  setTimeout(() => log('%cCodeFig: ' + message, 'color: #0066cc; font-weight: bold;', ...args), 0);
  forwardToConsoleBridge('log', [message, ...args]);
}

function debugError(message: string, ...args: any[]) {
  const error = console.error.bind(console);
  setTimeout(() => error('%cCodeFig: ' + message, 'color: #cc0000; font-weight: bold;', ...args), 0);
  forwardToConsoleBridge('error', [message, ...args]);
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
  const filenameWithoutExt = filename.replace(/\.ts$/, '');
  
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
    folderPrefix = 'Example Scripts';
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
      // Skip section headers and common patterns
      if (!commentContent.includes('===') && 
          !commentContent.includes('==') &&
          !commentContent.toLowerCase().includes('execute') && 
          !commentContent.toLowerCase().includes('import') && 
          !commentContent.toLowerCase().includes('function') &&
          !commentContent.toLowerCase().includes('collection of') &&
          commentContent.length > 0) {
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
  if (filename.match(/\.(bak\d*|backup|old|tmp)\.ts$/i)) {
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
        // Match scripts/**/*.ts pattern
        if (filePath.match(/^scripts\/.*\.ts$/)) {
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
    
    debugLog(`Loaded ${processedScripts.length} example scripts`);
    return processedScripts;
  } catch (error) {
    debugError('Failed to load example scripts:', error);
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
      figma.ui.postMessage({
        type: 'LIST',
        items: scripts || [],
        lastOpenedScript: lastOpenedScript || null
      });
    });
    return;
  }

  if (msg.type === 'GET_OPTIONS') {
    const optionSource = msg.optionSource;
    let options: string[] = [];
    if (optionSource === 'variableCollections') {
      const collections = figma.variables.getLocalVariableCollections();
      options = collections.map((c) => c.name);
    }
    figma.ui.postMessage({
      type: 'OPTIONS',
      optionSource: optionSource || '',
      options
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
          type: 'user'
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
    
    try {
      // Pure JavaScript execution - no TypeScript conversion
      
      // Create a custom console object that uses our debugLog function and forwards to Cursor bridge
      const scriptConsole = {
        log: (...args: any[]) => {
          const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(' ');
          debugLog('Script:', message);
          forwardToConsoleBridge('log', ['[Script]', ...args]);
        },
        error: (...args: any[]) => {
          const message = args.map(arg => {
            if (arg instanceof Error) {
              return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
            }
            return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
          }).join(' ');
          debugError('Script:', message);
          forwardToConsoleBridge('error', ['[Script]', ...args]);
        },
        warn: (...args: any[]) => {
          const message = args.map(arg => {
            if (arg instanceof Error) {
              return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
            }
            return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
          }).join(' ');
          debugError('Script Warning:', message);
          forwardToConsoleBridge('warn', ['[Script]', ...args]);
        }
      };

      // Create a function that has access to Figma API
      // Add common Figma API shortcuts for convenience
      const scriptFunction = new Function(
        'figma',
        'console',
        'window',
        `
        // Convenience shortcuts - make selection and currentPage available
        const selection = figma.currentPage.selection;
        const currentPage = figma.currentPage;
        
        // User code
        ${jsCode}
        `
      );
      
      
      // Store messages to forward after script execution (in backend scope)
      const pendingMessages: any[] = [];
      
      // Create a mock window object for the script context
      const mockWindow = {
        _infoPanelHandler: (message: any) => {
          debugLog('Backend: Script sent InfoPanel message:', message);
          // Directly forward the message to the UI from backend context
          figma.ui.postMessage(message);
        }
      };
      
      // Pass the real figma object, custom console, and mock window
      scriptFunction(figma, scriptConsole, mockWindow);
      
      // figma.notify('Done! 😁');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      figma.notify(`Script error: ${errorMessage} 😳`, { error: true });
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
    // Select a node by ID
    try {
      const node = figma.getNodeById(msg.nodeId);
      if (node) {
        figma.currentPage.selection = [node as SceneNode];
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        debugLog('Backend: Selected node:', node.name);
      } else {
        debugLog('Backend: Node not found:', msg.nodeId);
      }
    } catch (error) {
      debugError('Backend: Failed to select node:', error);
    }
  }
  
  if (msg.type === 'SELECT_NODES') {
    // Select multiple nodes by IDs (bulk selection)
    try {
      const nodes = msg.nodeIds
        .map((id: string) => figma.getNodeById(id))
        .filter((node: any) => node !== null) as SceneNode[];
      
      if (nodes.length > 0) {
        figma.currentPage.selection = nodes;
        figma.viewport.scrollAndZoomIntoView(nodes);
        figma.notify(`Selected ${nodes.length} nodes with similar issues`);
        debugLog('Backend: Selected nodes:', nodes.map(n => n.name));
      } else {
        debugLog('Backend: No valid nodes found for bulk selection');
      }
    } catch (error) {
      debugError('Backend: Failed to select nodes:', error);
    }
  }
};

